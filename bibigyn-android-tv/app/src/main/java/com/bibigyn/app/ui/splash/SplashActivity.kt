package com.bibigyn.app.ui.splash

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.datasource.RawResourceDataSource
import androidx.media3.exoplayer.ExoPlayer
import com.bibigyn.app.BuildConfig
import com.bibigyn.app.R
import com.bibigyn.app.data.ApiService
import com.bibigyn.app.databinding.ActivitySplashBinding
import com.bibigyn.app.ui.home.HomeActivity
import com.bibigyn.app.ui.login.LoginActivity
import com.bibigyn.app.util.SessionManager
import com.bibigyn.app.util.TvUtils
import com.bibigyn.app.util.UpdateChecker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * SplashActivity — tela de abertura animado (2.1.40).
 *
 * O vídeo do avatar da BiBi Fit toca em tela inteiro, sem som:
 *   • TV → R.raw.splash_tv (letra a letra, 4 s)
 *   • celular → R.raw.splash_mobile (profundidade, 5 s)
 * A escolha é por TvUtils.isTv() (UiModeManager) — o mesmo sinal que
 * escolhe os layouts `layout-television/`.
 *
 * Routing (inalterado desde a v2.1.2): a sessão é validada no servidor
 * (ApiService.validateOrReLogin(), com re-login silencioso se a senha
 * estiver guardada) e o destino é Home (sessão válida) ou Login. O
 * vídeo e a validação correm EM PARALELO — o routing só acontece
 * quando os dois acabam.
 *
 * O app NUNCA fica preso no splash:
 *   • o vídeo acabar (STATE_ENDED) libera o routing;
 *   • erro do player ou recurso em falta libera o routing (fail-open);
 *   • um teto de 10 s libera o routing mesmo que o vídeo ou a rede
 *     fiquem pendurados (o resultado da validação que houver vale).
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
 * Sem dependências novas: o ExoPlayer (media3) já é dependência do app
 * e já é usado no PlayerActivity.
 */
class SplashActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySplashBinding
    private var player: ExoPlayer? = null

    // 2.1.40 — as duas condições do routing + o teto de segurança.
    // `volatile` porque o listener do player e as coroutines tocam nelas.
    @Volatile private var videoDone = false
    @Volatile private var probeDone = false
    @Volatile private var probeValid = false
    @Volatile private var routed = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySplashBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // v2.1.9 — AUTO-UPDATE na abertura do app: checagem com
        // throttle (1x/24h) contra a API de releases do GitHub, em
        // 2º plano e silenciosa (sem diálogo; o download e o
        // instalador seguem as regras do UpdateChecker, inclusive o
        // adiamento se o player estiver em primeiro plano). Usa o
        // applicationContext porque a Splash some em 1,5 s — o
        // instalador precisa de NEW_TASK, não da Activity. A Home
        // re-checa no onCreate/onResume (o throttle evita duplicar).
        UpdateChecker.checkForUpdateThrottled(applicationContext, BuildConfig.VERSION_NAME)

        // Hide system bars for a clean splash.
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        )

        // 2.1.40 — arranca o vídeo e a validação da sessão em paralelo.
        startSplashVideo()
        startSessionProbe()

        // 2.1.40 — teto de segurança: aos 10 s, libera o routing com o
        // resultado que houver (vídeo 5 s no máximo + margem p/ a rede).
        lifecycleScope.launch {
            delay(10_000)
            videoDone = true
            probeDone = true
            maybeRoute()
        }
    }

    /**
     * 2.1.40 — toca o vídeo do splash, sem som. Qualquer falha na
     * criação/preparação do player libera o routing (fail-open) em
     * vez de prender a abertura.
     */
    private fun startSplashVideo() {
        val videoRes = if (TvUtils.isTv(this)) R.raw.splash_tv else R.raw.splash_mobile
        try {
            val exo = ExoPlayer.Builder(this).build()
            player = exo
            binding.splashPlayer.player = exo
            exo.addListener(object : Player.Listener {
                override fun onPlaybackStateChanged(playbackState: Int) {
                    if (playbackState == Player.STATE_ENDED) {
                        videoDone = true
                        maybeRoute()
                    }
                }

                override fun onPlayerError(error: PlaybackException) {
                    // Vídeo que não toca não pode prender a abertura.
                    videoDone = true
                    maybeRoute()
                }
            })
            exo.setMediaItem(MediaItem.fromUri(RawResourceDataSource.buildRawResourceUri(videoRes)))
            exo.volume = 0f
            exo.prepare()
            exo.playWhenReady = true
        } catch (_: Exception) {
            // Recurso em falta, codec indisponível, etc. — segue sem vídeo.
            videoDone = true
            maybeRoute()
        }
    }

    /**
     * 2.1.40 — validação da sessão (a mesma da v2.1.2, só arranca mais
     * cedo: em paralelo com o vídeo, em vez de depois de 1,5 s).
     * Se a sessão for válida → Home; senão, re-login silencioso se
     * houver senha guardada; senão → Login.
     */
    private fun startSessionProbe() {
        lifecycleScope.launch {
            val session = SessionManager.get(this@SplashActivity)
            val api = ApiService(this@SplashActivity)
            probeValid = if (session.isLoggedIn) {
                withContext(Dispatchers.IO) { api.validateOrReLogin() }
            } else {
                false
            }
            probeDone = true
            maybeRoute()
        }
    }

    /**
     * 2.1.40 — routing único: só corre uma vez, só quando o vídeo E a
     * validação acabaram (ou o teto de 10 s disparou). O destino é o
     * mesmo de sempre: Home se a sessão for válida, Login se não for.
     */
    private fun maybeRoute() {
        if (routed || !videoDone || !probeDone) return
        routed = true
        releasePlayer()

        val target = if (probeValid) {
            Intent(this@SplashActivity, HomeActivity::class.java)
        } else {
            Intent(this@SplashActivity, LoginActivity::class.java)
        }

        // ★ v2.0.2: Clear the entire back stack so the user can never
        // navigate back to Splash (or any stale activity from a previous
        // launch) after routing.
        target.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(target)
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
        finish()
    }

    private fun releasePlayer() {
        player?.let {
            binding.splashPlayer.player = null
            it.release()
        }
        player = null
    }

    override fun onDestroy() {
        releasePlayer()
        super.onDestroy()
    }
}
