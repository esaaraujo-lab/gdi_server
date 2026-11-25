package com.meggy.app.ui.splash

import android.content.Intent
import android.os.Bundle
import android.os.SystemClock
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.datasource.RawResourceDataSource
import androidx.media3.exoplayer.ExoPlayer
import com.meggy.app.R
import com.meggy.app.data.ApiService
import com.meggy.app.data.SessionCheck
import com.meggy.app.databinding.ActivitySplashBinding
import com.meggy.app.ui.home.HomeActivity
import com.meggy.app.ui.login.LoginActivity
import com.meggy.app.util.SessionManager
import com.meggy.app.util.TvUtils
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/**
 * SplashActivity — Meggy-branded launch screen.
 *
 * v2.0.2: Uses FLAG_ACTIVITY_NEW_TASK | FLAG_ACTIVITY_CLEAR_TASK when routing
 * to Home or Login. This clears the entire back stack so that:
 *   • After login, the user can NEVER press back to return to Login/Splash.
 *   • After re-opening the app, old activities from a previous session are
 *     cleared and the routing decision is made fresh.
 *
 * The activity itself is also declared with android:noHistory="true" in the
 * manifest as a belt-and-suspenders guarantee.
 *
 * v2.7.3 LOGIN PERSISTENCE FIX: instead of trusting `isLoggedIn` (which only
 * checks the local cookie existence), we now do a server-side probe via
 * ApiService.validateOrReLogin(). If the cookie has expired BUT we have a
 * saved (username, password), we auto re-login silently and route to Home.
 * Only when no credentials are saved (or re-login fails) do we route to
 * LoginActivity so the user can re-enter them manually.
 *
 * 2.7.50 SPLASH ANIMADO: o splash passa a ser um vídeo (VideoView do
 * sistema, sem dependência nova — os vídeos estão em res/raw):
 *   • TV → R.raw.splash_tv (modelo 05, letra a letra, 4 s, 1280×720)
 *   • celular → R.raw.splash_mobile (modelo 07, profundidade com a foto
 *     do 05, 5 s, 720×1280)
 * A escolha é por TvUtils.isTv() — o mesmo sinal dos layouts
 * `layout-television/` (nunca por tamanho de tela).
 * A validação da sessão (v2.7.3/R21) corre EM PARALELO com o vídeo: o
 * routing acontece quando o vídeo acaba E a validação já respondeu. O
 * splash tem TECTO TOTAL de 10 s desde o arranque — se a rede estiver
 * lenta, o routing usa UNKNOWN (entra na Home se houver sessão local,
 * como na R21) em vez de deixar o usuário preso no splash.
 * Se o vídeo falhar (decoder, ficheiro), o VideoView esconde-se e volta
 * o splash estático de antes com o atraso de 1500 ms — o app NUNCA fica
 * preso no splash. O vídeo é SEM SOM: os mp4 têm faixa AAC e o volume é
 * posto a 0 no onPrepared.
 *
 * 2.7.51 CORRECÇÃO DO SPLASH PRETO (print do Elton 2026-11-25 00:27):
 * na 2.7.50 o vídeo NÃO TOCOU no celular dele — tela preta + faixa rosa
 * em baixo, animação nenhuma. Os vídeos estão bons (H.264 High L3.1,
 * yuv420p, 24 fps, AAC-LC, frames conferidos); a falha foi do player:
 * o VideoView do sistema nunca rendeu um frame (preso no prepare, sem
 * watchdog) e, como o vídeo é 9:16 e a tela é mais alta, o VideoView
 * mediu-se pelo aspecto do vídeo e ficou mais curto que a tela — o
 * gradiente rosa do estático por trás vazou em baixo. Esta versão:
 *   • ExoPlayer (media3 1.2.1) em vez de VideoView — o MESMO player do
 *     PlayerActivity e da BiBi 2.1.40 (já dependência do app, mesma
 *     versão); PlayerView match_parent sobre raiz preta, resize_mode
 *     fit — as barras são pretas e invisíveis, o gradiente nunca vaza.
 *   • O splash estático arranca GONE e só aparece se o vídeo falhar —
 *     nunca por trás do vídeo.
 *   • Watchdog de pronto: se o player não chegar a STATE_READY em 2 s,
 *     trata-se como falha → estático + routing (fail-open). O app NUNCA
 *     fica preso no splash.
 * Os mp4s são OS MESMOS da 2.7.50 (nada re-encodado). Routing, validação
 * da sessão e teto de 10 s: iguais à 2.7.50.
 */
class SplashActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySplashBinding
    private var player: ExoPlayer? = null

    // 2.7.51: sinalizado pelo listener do ExoPlayer (STATE_ENDED /
    // onPlayerError) ou pelo watchdog de pronto.
    private val videoDone = CompletableDeferred<Unit>()
    private var videoFailed = false
    @Volatile private var playerReady = false
    private var routed = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySplashBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Hide system bars for a clean splash.
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        )

        val isTv = TvUtils.isTv(this)
        val videoRes = if (isTv) R.raw.splash_tv else R.raw.splash_mobile
        val videoMs = if (isTv) VIDEO_MS_TV else VIDEO_MS_MOBILE
        val startedAt = SystemClock.uptimeMillis()

        setupVideo(videoRes)

        lifecycleScope.launch {
            // ★ v2.7.3/R21: validação em paralelo com o vídeo (antes era
            // depois do delay de 1500 ms — o vídeo já é o tempo mínimo).
            val session = SessionManager.get(this@SplashActivity)
            val api = ApiService(this@SplashActivity)
            val checkDeferred = async(Dispatchers.IO) {
                if (session.isLoggedIn) api.validateSession() else SessionCheck.INVALID
            }

            // Espera o vídeo acabar (duração + margem) — nunca mais que isso.
            withTimeoutOrNull(videoMs + VIDEO_MARGIN_MS) { videoDone.await() }

            if (videoFailed) {
                // Fallback estático: esconde o player, mostra o splash de
                // antes e espera o tempo mínimo antigo antes de rotear.
                binding.splashPlayer.visibility = View.GONE
                binding.splashStatic.visibility = View.VISIBLE
                delay(1500)
            }

            // ★ Tecto total do splash (10 s desde o arranque): se a
            // validação ainda não respondeu, usa UNKNOWN — entra na Home
            // se houver sessão local (R21), nunca fica preso aqui.
            val elapsed = SystemClock.uptimeMillis() - startedAt
            val remaining = (SPLASH_MAX_MS - elapsed).coerceAtLeast(0L)
            val check = withTimeoutOrNull(remaining) { checkDeferred.await() }
                ?: SessionCheck.UNKNOWN
            checkDeferred.cancel()

            route(check)
        }
    }

    override fun onDestroy() {
        releasePlayer()
        super.onDestroy()
    }

    /**
     * 2.7.51: toca o vídeo do splash com o ExoPlayer (media3 1.2.1 — o
     * mesmo do PlayerActivity e da BiBi 2.1.40), sem som (os vídeos têm
     * faixa AAC, volume a 0). Qualquer falha na criação/preparação do
     * player liberta o routing (fail-open) em vez de prender a abertura.
     * O watchdog de pronto cobre o modo de falha da 2.7.50 (player preso
     * no prepare sem renderizar um frame): sem STATE_READY em 2 s, o
     * vídeo é dado como falhado e entra o estático.
     */
    private fun setupVideo(videoRes: Int) {
        try {
            val exo = ExoPlayer.Builder(this).build()
            player = exo
            binding.splashPlayer.player = exo
            exo.addListener(object : Player.Listener {
                override fun onPlaybackStateChanged(playbackState: Int) {
                    when (playbackState) {
                        Player.STATE_READY -> playerReady = true
                        Player.STATE_ENDED -> videoDone.complete(Unit)
                    }
                }

                override fun onPlayerError(error: PlaybackException) {
                    // Vídeo que não toca não pode prender a abertura.
                    videoFailed = true
                    videoDone.complete(Unit)
                }
            })
            exo.setMediaItem(MediaItem.fromUri(RawResourceDataSource.buildRawResourceUri(videoRes)))
            exo.volume = 0f
            exo.prepare()
            exo.playWhenReady = true
        } catch (_: Exception) {
            // Recurso em falta, codec indisponível, etc. — segue sem vídeo.
            videoFailed = true
            videoDone.complete(Unit)
        }

        // 2.7.51 — watchdog de pronto (ver KDoc): o VideoView da 2.7.50
        // ficava preso no prepare sem nunca renderizar (tela preta no
        // celular do Elton). Sem STATE_READY em 2 s → falha, estático.
        lifecycleScope.launch {
            delay(READY_WATCHDOG_MS)
            if (!playerReady && !videoDone.isCompleted) {
                videoFailed = true
                videoDone.complete(Unit)
            }
        }
    }

    private fun releasePlayer() {
        player?.let {
            binding.splashPlayer.player = null
            it.release()
        }
        player = null
    }

    /**
     * Routing de sempre (v2.0.2/v2.7.3): Home salvo check != INVALID
     * (UNKNOWN entra na Home — R21), Login só com INVALID. Guardado
     * contra routing duplo e contra routing depois de finish().
     */
    private fun route(check: SessionCheck) {
        if (routed || isFinishing || isDestroyed) return
        routed = true
        releasePlayer()

        // ★ v2.7.3: validate session server-side; auto re-login if expired
        // AND password is saved. Falls back to LoginActivity only when
        // re-login fails or there are no saved credentials.
        // R21: validação TIPADA — uma falha transitória (sem rede,
        // 5xx, quota D1 esgotada) retorna UNKNOWN e entra na Home na
        // mesma: a sessão pode estar válida e as listagens mostram
        // erro + retry (e fazem bounce depois, se for mesmo expiração).
        // Antes, UNKNOWN era tratado como sessão inválida e o arranque
        // sem rede/quota mandava o usuário para o login à toa.
        val target = if (check != SessionCheck.INVALID) {
            Intent(this, HomeActivity::class.java)
        } else {
            Intent(this, LoginActivity::class.java)
        }

        // ★ v2.0.2: Clear the entire back stack so the user can never
        // navigate back to Splash (or any stale activity from a previous
        // launch) after routing.
        target.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(target)
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
        finish()
    }

    companion object {
        // Durações reais dos vídeos (ffprobe): TV 4,0 s; celular 5,0 s.
        private const val VIDEO_MS_TV = 4000L
        private const val VIDEO_MS_MOBILE = 5000L
        // Margem para o fim do vídeo chegar depois do fim do vídeo.
        private const val VIDEO_MARGIN_MS = 500L
        // 2.7.51 — watchdog de pronto: sem STATE_READY neste tempo, o
        // vídeo é dado como falhado (fail-open para o estático).
        private const val READY_WATCHDOG_MS = 2000L
        // Tecto total do splash desde o arranque — nunca ficar preso aqui.
        private const val SPLASH_MAX_MS = 10_000L
    }
}
