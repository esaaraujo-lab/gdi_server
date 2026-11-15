package com.bibigyn.app.ui.player

import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.res.Configuration
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.CountDownTimer
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.view.GestureDetector
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.constraintlayout.widget.ConstraintLayout
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.PlaybackException
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import coil.load
import com.google.android.material.snackbar.Snackbar
import com.bibigyn.app.BiBiGynApp
import com.bibigyn.app.R
import com.bibigyn.app.data.AiService
import com.bibigyn.app.data.ApiService
import com.bibigyn.app.data.FileItem
import com.bibigyn.app.data.DriveItem
import com.bibigyn.app.data.colorFromString
import com.bibigyn.app.data.monogramFor
import com.bibigyn.app.databinding.ActivityPlayerBinding
import com.bibigyn.app.ui.home.HomeActivity
import com.bibigyn.app.ui.mylist.MyListActivity
import com.bibigyn.app.ui.reader.MdReaderActivity
import com.bibigyn.app.ui.reader.PdfReaderActivity
import com.bibigyn.app.ui.search.SearchActivity
import com.bibigyn.app.ui.settings.SettingsActivity
import com.bibigyn.app.util.CardGradient
import com.bibigyn.app.util.CoverLibrary
import com.bibigyn.app.util.Format
import com.bibigyn.app.util.LessonDescription
import com.bibigyn.app.util.PlaylistManager
import com.bibigyn.app.util.DescriptionPregenerator
import com.bibigyn.app.util.FocusAnimator
import com.bibigyn.app.util.SessionManager
import com.bibigyn.app.util.SubtitleFetcher
import com.bibigyn.app.util.TvUtils
import com.bibigyn.app.util.UpdateChecker
import com.bibigyn.app.util.VideoCache
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray

/**
 * v2.1.8 — Player (conceitos player celular + TV player v2, Elton 23:50)
 * v2.1.8 — barra cinematografica (Elton 11:48): disco escuro modesto,
 * state layer nos chips, scrim 72% na base, emoji ⏸ -> ❚❚ (texto branco).
 * + simplificação do player (Elton 10:31, patch 2.1.6).
 * v2.1.7 — controles da barra: feedback visual (seletores +
 * FocusAnimator), foco D-pad entra na barra, barra invisível
 * some com GONE (não intercepta mais toques).
 * Frente R3A (Plyr, SO visual): botao play/pausa da barra SO-ICONE
 * (sem disco; player_bar_btn_bg — foco com anel da marca + FocusAnimator),
 * disco central 44dp/56dp, progresso 5dp / thumb 13dp / trilho branco 25%,
 * scrim da base 75% (gradiente Plyr). NADA de comportamento muda:
 * auto-hide 4s, descanso (Frente D) e seek (Frente B) intactos.
 *
 * DOIS MODOS (mesma Activity, mesmos componentes):
 *  - Retrato (celular): vídeo 16:9 + controles do ExoPlayer + linha de
 *    info (tempo, velocidade, CC, Descanso, tela cheia) + título +
 *    curso em rosa + Anterior/Próxima (só quando há anterior/próxima
 *    real na playlist) + bottom nav. O controller nativo do ExoPlayer
 *    tem botão de tela cheia (setFullscreenButtonClickListener).
 *  - Fullscreen / TV: vídeo em TELA CHEIA imediata na TV (item 6);
 *    no CELULAR entra pelo botão ⛶ (na linha de controles e no
 *    controller nativo) ou GIRANDO o aparelho — e sai com Voltar ou
 *    girando de volta para retrato. Barra de controles grande (pause
 *    rosa, tempo, barra com bolinha, Descanso, CC, velocidade, sair
 *    da tela cheia). Voltar sai do fullscreen e volta à navegação.
 *    Sem PiP na TV.
 *
 * FULLSCREEN NO CELULAR (v2.1.6 — o que faltava): o botão ⛶ existia
 * no XML, mas a linha de retrato tinha −10s/+10s + 4 pills + tempo
 * (~426dp em 328dp úteis num celular de 360dp) — o ⛶ caía para fora
 * da tela e o tempo era esmagado para 0dp. Por isso o Elton não via
 * tela cheia no celular. Agora a linha tem duas linhas (tempo em cima,
 * pills embaixo) e o controller nativo também mostra o ⛶. A Activity
 * NÃO é recriada ao girar (configChanges no manifest + onConfigura-
 * tionChanged): o ExoPlayer segue do ponto exato, sem reiniciar.
 * Em fullscreen o container do vídeo preenche a tela (sem o ratio
 * 16:9, que em paisagem de celular deixava a barra fora da tela).
 *
 * SEM LOGO no vídeo (verificado: o player nunca desenhou logo; v2 do
 * conceito remove o círculo do poodle — nada a remover, nada a pôr).
 *
 * PLAYLIST EMBUTIDA REMOVIDA (v2.1.6): a gaveta lateral (☰) e a seção
 * "A seguir" saíram do player — a playlist vive na PÁGINA
 * (DetailActivity, que monta a playlist via PlaylistManager). O que
 * CONTINUA: o avanço de aula (Anterior/Próxima + autoplay no fim +
 * onMediaItemTransition com resume/velocidade) e o PlaylistManager.
 * PlaylistAdapter.kt + item_playlist.xml foram apagados (só o player
 * os usava).
 *
 * VELOCIDADE (v2.1.6): NÃO existe velocidade no topo do vídeo (só
 * voltar/título lá). A velocidade vive SÓ nas barras de controles
 * (pill pequena 1.0× na barra fullscreen/TV e na linha do retrato),
 * e a "Velocidade padrão" dos Ajustes (sm.defaultSpeed) continua
 * valendo na abertura e ao avançar de aula.
 *
 * ±10s (v2.1.6): botões REMOVIDOS do rodapé (barra fullscreen/TV e
 * linha do retrato). O pulo CONTINUA: double-tap nas laterais do
 * vídeo (celular) e setas ◀ ▶ do D-pad (TV, com os controles
 * escondidos ou com o foco no vídeo; com os controles visíveis e o
 * foco num botão, as setas movem o foco — navegação padrão).
 *
 * Frente E — controlos discretos (so visual, sem mexer em
 * comportamento): disco de play/pausa 48dp/72dp (era 64dp/96dp), barra
 * de progresso fina de 4dp e mais transparente, scrim 72% -> 60%
 * (base) / 80% -> 60% (topo). O auto-hide (4s, fade 200ms) e o disco
 * central so com controlos visiveis ja existiam (v2.7.9) e ficam.
 * DESCANSO (🌙, v1.3.0 + pill 23:50; Frente D: TELA CHEIA + persiste
 * na troca de aula): overlay preto sobre a TELA TODA (último filho da
 * raiz, acima das barras, da info e da bottom nav); o áudio e o
 * progresso CONTINUAM, o player NÃO pausa, e o modo SOBREVIVE à troca
 * de aula (auto-advance no fim do vídeo e botões Anterior/Próxima não
 * saem do descanso). Saídas: toque no overlay, BACK, D-pad ou qualquer
 * botão de controle (play/pausa, velocidade, reiniciar, favorito).
 * Na TV o foco vai para o overlay ao entrar no descanso.
 *
 * LEGENDA: sem botão CC na barra (removido v2.1.7, Elton 11:16)
 * — as legendas valem SÓ pelo toggle Legendas dos Ajustes.
 * Fontes: sidecar .vtt/.srt na pasta da aula, ou o endpoint do
 * worker GET /api/ai/subtitles (200 VTT / 202 gerando / 404 sem
 * legenda — ver SubtitleFetcher; o endpoint AINDA NÃO existe, o app
 * degrada para "sem legendas"). Com o toggle ligado e havendo
 * legenda, ela aparece sozinha; desligado, nenhuma legenda. Sem
 * legenda no áudio (não há faixa de vídeo).
 *
 * ÁUDIO (mp3/podcast): MESMO player — a área de vídeo vira a capa do
 * episódio (thumb/monograma + título + sub); mesmos controles
 * (play/pause, velocidade, progresso, continuar de onde parou,
 * Descanso); sem CC. Card "Continuar de onde parou — Parado em 12:34"
 * quando havia posição salva ao abrir.
 *
 * CORREÇÕES v2.7.6 (bugs verificados no main):
 *  - onMediaItemTransition/playItem buscavam (idx, 0) — agora retomam
 *    a posição salva (exceto vídeo assistido = revisão, do início).
 *  - onMediaItemTransition/playItem zeravam a velocidade — agora
 *    aplicam a velocidade padrão dos Ajustes.
 *  - Qualidade (DefaultTrackSelector) só restringe quando há >1
 *    trilha de vídeo (as aulas são MP4 progressivo de uma só versão).
 *  - Cache de vídeo (VideoCache, 500 MB LRU) com escrita gateada
 *    pelo Wi-Fi quando "Baixar só no Wi-Fi" está ligado.
 *
 * Frente R4C — ÁUDIO EM 2º PLANO (tela apagada/bloqueada): o áudio
 * da aula CONTINUA (o vídeo deixa de renderizar, o que é esperado).
 * Como: (1) o ExoPlayer segura um PARTIAL_WAKE_LOCK enquanto toca
 * (setWakeMode(C.WAKE_MODE_LOCAL) em initialisePlayer); (2) o
 * BackgroundAudioService corre em 1º plano (mediaPlayback) durante
 * toda a reprodução, com a notificação de media (play/pausa,
 * ±10s, parar); (3) o onStop NÃO liberta o player quando a tela
 * apagou com a aula a tocar — só volta a ligá-lo em onStart.
 * O serviço arranca em initialisePlayer (activity em 1º plano)
 * porque no Android 12+ um startForegroundService() no onStop
 * lança ForegroundServiceStartNotAllowedException. Respeita o
 * Descanso (nada aqui sai dele) e a pausa prévia (pausado =
 * liberta como antes; nada retoma sozinho). Fim da aula intacto.
 */
class PlayerActivity : AppCompatActivity() {

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        // Frente B (Ronda 3) — largar a tecla termina o scrub
        // (hold-to-scrub). So consome o UP quando ha um scrub ativo;
        // sem scrub, o UP cai no super como antes.
        if (event.action == KeyEvent.ACTION_UP && remoteScrubbing &&
            (event.keyCode == KeyEvent.KEYCODE_DPAD_LEFT ||
                event.keyCode == KeyEvent.KEYCODE_DPAD_RIGHT)
        ) {
            stopRemoteScrub()
            return true
        }
        if (event.action == KeyEvent.ACTION_DOWN) {
            when (event.keyCode) {
                KeyEvent.KEYCODE_DPAD_UP -> {
                    if (sleepMode) {
                        exitSleepMode()
                        return true
                    }
                    if (isFullscreen && !controlsVisible) {
                        showControls()
                        // Ronda 8 Frente B: na TV o botao play/pausa
                        // da barra nao existe — UP entra na barra
                        // pelo 1o chip restante (Descanso). No
                        // celular continua o botao da barra
                        // (nullable no binding: ?.).
                        if (isTv) binding.btnRestBar.requestFocus()
                        else binding.btnPlayPauseBar?.requestFocus()
                        return true
                    }
                }
                KeyEvent.KEYCODE_DPAD_DOWN -> {
                    // v2.1.7 — DOWN do vídeo ENTRA na barra (antes pedia
                    // foco no próprio playerView e prendia o foco lá: os
                    // botões da barra ficavam inalcançáveis pelo D-pad).
                    // Com o foco já na barra, deixa o sistema navegar
                    // (pills -> SeekBar) — não consome a tecla.
                    if (isFullscreen && controlsVisible && binding.playerView.hasFocus()) {
                        // Ronda 8 Frente B: ver UP — na TV entra
                        // pelo Descanso; no celular pelo botao
                        // da barra (nullable no binding: ?.).
                        if (isTv) binding.btnRestBar.requestFocus()
                        else binding.btnPlayPauseBar?.requestFocus()
                        return true
                    }
                }
                KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                    if (sleepMode) {
                        exitSleepMode()
                        return true
                    }
                    // Ronda 8 Frente B (Elton 2026-11-15 19:24):
                    // na TV o OK do controlo E play/pause — o
                    // disco central e o unico botao. Com os
                    // controlos escondidos, OK pausa ou reproduz
                    // logo (togglePlayPause mostra os controlos);
                    // com os controlos visiveis, OK pausa ou
                    // reproduz quando o foco esta no video, no
                    // disco ou em lado nenhum; com o foco num
                    // controlo da barra (Descanso, velocidade,
                    // SeekBar, botoes do topo) a tecla cai no
                    // super e activa esse controlo.
                    if (isTv) {
                        if (!controlsVisible) {
                            togglePlayPause()
                            return true
                        }
                        val f = currentFocus
                        if (f == null || f == binding.playerView ||
                            f == binding.centerPlayPause
                        ) {
                            togglePlayPause()
                            return true
                        }
                        // Foco num controlo: cai no super (click dele).
                    } else if (isFullscreen && !controlsVisible) {
                        showControls()
                        binding.btnPlayPauseBar?.requestFocus()
                        return true
                    }
                }
                KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT -> {
                    if (sleepMode) {
                        exitSleepMode()
                        return true
                    }
                    // Frente B (Ronda 3) — setas do D-pad: seek SEMPRE
                    // em fullscreen/TV, mesmo com os controlos visíveis
                    // e o foco num botão da barra — ou NA SeekBar. A
                    // interceção é ao nível do dispatchKeyEvent, antes
                    // da distribuição do foco: a tecla nunca chega à
                    // navegação de foco nem ao onKeyDown da SeekBar (que
                    // a consumiria para mexer no progresso). O foco fica
                    // onde estava; o vídeo não pausa. Em retrato o
                    // controller nativo trata as teclas (isFullscreen =
                    // false → cai no super.dispatchKeyEvent).
                    if (isFullscreen) {
                        val back = event.keyCode == KeyEvent.KEYCODE_DPAD_LEFT
                        // Repetições do sistema (repeatCount > 0): o
                        // timer do scrub é quem manda — ignoram-se para
                        // não haver dois seeks por tick.
                        if (event.repeatCount == 0) {
                            startRemoteScrub(if (back) -1 else 1)
                        }
                        return true
                    }
                }
                KeyEvent.KEYCODE_BACK -> {
                    if (sleepMode) {
                        exitSleepMode()
                        return true
                    }
                    if (isFullscreen) {
                        exitFullscreen()
                        return true
                    }
                    if (controlsVisible && isFullscreen) {
                        hideControls()
                        return true
                    }
                }
            }
        }
        return super.dispatchKeyEvent(event)
    }

    private lateinit var binding: ActivityPlayerBinding
    private var player: ExoPlayer? = null
    private var trackSelector: DefaultTrackSelector? = null
    private var currentItem: FileItem? = null
    private var currentUrl: String? = null

    private var saveJob: Job? = null
    private var timeJob: Job? = null

    private var sleepMode = false
    private val handler = Handler(Looper.getMainLooper())
    private var controlsVisible = true
    private val CONTROLS_HIDE_DELAY = 4000L
    private val hideControlsRunnable = Runnable { hideControls() }

    private val speeds = floatArrayOf(0.75f, 1.0f, 1.25f, 1.5f, 1.75f, 2.0f)
    private var speedIndex = 1

    private var gestureDetector: GestureDetector? = null
    private var swipeStartY = -1f
    private var swipeStartX = -1f
    private var swipeMode: SwipeMode = SwipeMode.NONE
    private var swipeStartValue = 0
    private val swipeHandler = Handler(Looper.getMainLooper())
    private val swipeHideRunnable = Runnable { binding.swipeIndicator.visibility = View.GONE }

    private var sleepTimer: CountDownTimer? = null
    private var sleepTimerRemainingMs: Long = 0L
    private var savedBrightness: Float = -1f

    private enum class SwipeMode { NONE, BRIGHTNESS, VOLUME }

    // v2.7.6 — modos e legenda
    private var isFullscreen = false
    private var isTv = false
    private var isAudio = false
    private var seekBarDragging = false
    // Frente B (Ronda 3) — seek com o controlo remoto na TV
    // (hold-to-scrub). Ver dispatchKeyEvent, startRemoteScrub e
    // remoteScrubTick. Sem imports novos: usa o handler que ja
    // existe e Format.mmss (ja importado).
    private var remoteScrubbing = false
    private var remoteScrubDirection = 1 // +1 frente, -1 tras
    private var remoteScrubTargetMs = 0L
    private var remoteScrubTicks = 0
    private var remoteScrubItem: FileItem? = null
    private val remoteScrubRunnable = Runnable { remoteScrubTick() }
    private val hideSeekHintRunnable = Runnable {
        binding.seekGestureHint.animate().alpha(0f).setDuration(300)
            .withEndAction { binding.seekGestureHint.visibility = View.GONE }.start()
    }
    // Progressao do scrub (passo por tick do timer):
    //   <1s premido: 10s/tick - <3s: 30s/tick - depois: 60s/tick.
    // 1o tick 400ms apos o DOWN (atraso tipico do repeat do Android);
    // ticks seguintes a cada 150ms. Guarda: 60s de hold no maximo.
    private val REMOTE_SCRUB_FIRST_DELAY_MS = 400L
    private val REMOTE_SCRUB_INTERVAL_MS = 150L
    private val REMOTE_SCRUB_FAST_AFTER_MS = 1_000L
    private val REMOTE_SCRUB_FASTEST_AFTER_MS = 3_000L
    private val REMOTE_SCRUB_MAX_HOLD_MS = 60_000L
    private val REMOTE_SCRUB_HINT_HIDE_DELAY_MS = 900L
    private var subtitleState: SubtitleState = SubtitleState.UNKNOWN
    private var subtitleFetchJob: Job? = null
    private var subtitleRetryCount = 0
    private var subtitleVttFile: java.io.File? = null
    private var subtitleLanguage: String = "pt-BR"
    private var openedResumeMs: Long = 0L

    // v2.7.6 — pré-geração das descrições das próximas aulas (Elton 00:21).
    private var descriptionPregenerator: DescriptionPregenerator? = null
    private var playerInForeground = false
    // Frente R4C — áudio em 2º plano (tela apagada): true enquanto o
    // player sobreviveu ao onStop com a tela apagada (o serviço está
    // a correr e o onStart tem de religar a superfície em vez de
    // recriar o player). false = comportamento antigo (libertar).
    private var backgroundAudioActive = false
    // Frente R4C — controlos do player para o serviço de áudio (o
    // serviço NUNCA guarda o ExoPlayer; o player continua a pertencer
    // a esta Activity). Registado em onCreate, retirado em onDestroy.
    private val backgroundAudioControls = object : BackgroundAudioService.PlaybackControls {
        override fun isPlaying(): Boolean = player?.isPlaying == true
        override fun togglePlayPause() = this@PlayerActivity.togglePlayPause()
        override fun seekByMs(deltaMs: Long) = seekBy(deltaMs)
        override fun stopPlaybackFromNotification() = this@PlayerActivity.stopPlaybackFromNotification()
        override fun currentTitle(): String = displayTitle(currentItem)
    }
    // Frente H — o enriquecimento da playlist (1× por sessão).
    private var playlistEnriched = false

    // Frente R4 — Materiais da aula no retrato (ver bloco no fim da classe).
    private var materialsJob: Job? = null
    private var materialsSummary: String? = null

    private enum class SubtitleState { UNKNOWN, READY, GENERATING, NONE }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.systemBars())

        isTv = TvUtils.isTv(this)
        binding = ActivityPlayerBinding.inflate(layoutInflater)
        setContentView(binding.root)
        // Frente H — o overlay "A carregar" já nasce visível no XML;
        // esconde-se no 1º STATE_READY (ver o listener em
        // initialisePlayer) — o aluno vê o player a carregar em vez
        // de um ecrã preto sem feedback.
        binding.playerLoading.visibility = View.VISIBLE

        // Camada 3 — biblioteca de capas por tipo (a capa de
        // áudio resolve a imagem quando o manifesto já chegou).
        CoverLibrary.warmUp(this)
        PlaylistManager.loadPlaylist(this)
        // Frente R4C — o serviço de áudio em 2º plano controla o
        // player por esta interface (retirada em onDestroy).
        BackgroundAudioService.registerControls(backgroundAudioControls)

        var item = PlaylistManager.getCurrent()
        if (item == null || item.link.isNullOrEmpty()) {
            val url = intent.getStringExtra(EXTRA_URL)
            val title = intent.getStringExtra(EXTRA_TITLE) ?: "Reproduzindo"
            val folderPath = intent.getStringExtra(EXTRA_FOLDER_PATH)
            if (!url.isNullOrBlank()) {
                item = FileItem(
                    name = title, mimeType = "video/mp4", id = "",
                    driveId = null, link = url.removePrefix(BiBiGynApp.BASE_URL),
                    size = 0L, modifiedTime = null, folderLabel = null, folderPath = folderPath
                )
            }
        }
        currentItem = item
        isAudio = item?.isAudio == true
        openedResumeMs = if (item != null && !item.folderPath.isNullOrBlank()) {
            SessionManager.get(this).getResume(item.folderPath!!, item.name)
        } else 0L

        val defaultSpeed = SessionManager.get(this).defaultSpeed
        speedIndex = speeds.indexOfFirst { it == defaultSpeed }.coerceAtLeast(1)

        setTitles(item)
        updateSpeedLabels()
        updateAudioCover(item)
        updatePrevNextButtons()

        // Controles da barra (fullscreen/TV) e da linha de info (retrato).
        // v2.1.6: sem botões −10s/+10s (o pulo continua por double-tap e
        // D-pad) e SEM playlist embutida (a playlist vive na página).
        // Ronda 8 Frente B: o botao da barra so existe no layout
        // do celular — na TV o binding e nullable (?.) e o
        // listener nao e ligado; o disco central (abaixo) e o
        // unico play/pause da TV.
        binding.btnPlayPauseBar?.setOnClickListener { exitRestIfActive(); togglePlayPause() }
        binding.btnSpeedBar.setOnClickListener { exitRestIfActive(); cycleSpeed() }
        binding.btnSpeedInfo.setOnClickListener { exitRestIfActive(); cycleSpeed() }
        binding.btnRestBar.setOnClickListener { toggleSleepMode() }
        binding.btnRestInfo.setOnClickListener { toggleSleepMode() }
        binding.btnFullscreen.setOnClickListener { enterFullscreen() }
        binding.btnExitFullscreen.setOnClickListener { exitFullscreen() }
        // Frente D — Anterior/Próxima NÃO saem do descanso: a troca de
        // aula mantém o overlay de tela cheia (o áudio continua e a
        // próxima aula começa escura). Os outros botões continuam a
        // sair do descanso primeiro (exitRestIfActive).
        binding.btnPrev.setOnClickListener { playPrev() }
        binding.btnNext.setOnClickListener { playNext() }
        binding.centerPlayPause.setOnClickListener { exitRestIfActive(); togglePlayPause() }
        binding.restartButton.setOnClickListener { exitRestIfActive(); restartVideo() }
        binding.sleepTimerButton.setOnClickListener { showSleepTimerDialog() }
        binding.favButton.setOnClickListener { exitRestIfActive(); toggleFavoriteCurrent() }

        // v2.1.7 — feedback visual dos botões da barra (foco D-pad na TV
        // + escala + anel do seletor): sem isso o botão focado/pressionado
        // era indistinguível (chip_outline/btn_play_circle são estáticos).
        // Barra pós-remoção do CC (Elton 11:16): Descanso,
        // velocidade, sair da tela cheia (+ pills do retrato).
        // Ronda 8 Frente B: o play/pausa da barra saiu (so o
        // disco central na TV; no celular o botao continua) e o
        // binding passou a nullable — listOfNotNull.
        listOfNotNull(
            binding.btnPlayPauseBar, binding.btnRestBar,
            binding.btnSpeedBar, binding.btnExitFullscreen, binding.btnSpeedInfo,
            binding.btnRestInfo, binding.btnFullscreen,
            binding.centerPlayPause
        ).forEach { FocusAnimator.attach(it, isTv) }
        updateFavButton()

        // v2.1.6 — botão ⛶ do controller NATIVO do ExoPlayer (retrato):
        // o Media3 só mostra o botão de tela cheia do controller quando
        // há um listener. É o segundo acesso ao fullscreen no celular
        // (o primeiro é o ⛶ da linha de controles). O parâmetro do
        // callback é ignorado de propósito: o estado vem da nossa flag
        // isFullscreen (não da polaridade que o Media3 passa).
        binding.playerView.setFullscreenButtonClickListener { _ ->
            if (this.isFullscreen) exitFullscreen() else enterFullscreen()
        }

        binding.sleepOverlay.setOnClickListener { exitSleepMode() }

        // SeekBar da barra (fullscreen/TV)
        binding.barSeekBar.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
                if (fromUser) {
                    val p = player ?: return
                    val dur = p.duration.coerceAtLeast(0)
                    if (dur > 0) p.seekTo(progress * dur / 1000)
                }
            }
            override fun onStartTrackingTouch(seekBar: SeekBar?) { seekBarDragging = true }
            override fun onStopTrackingTouch(seekBar: SeekBar?) { seekBarDragging = false }
        })

        // Bottom nav (retrato, celular)
        binding.bottomNav.setOnItemSelectedListener { menuItem ->
            when (menuItem.itemId) {
                R.id.nav_home -> { startActivity(Intent(this, HomeActivity::class.java)); true }
                R.id.nav_search -> { startActivity(Intent(this, SearchActivity::class.java)); true }
                R.id.nav_mylist -> { startActivity(Intent(this, MyListActivity::class.java)); true }
                R.id.nav_settings -> { startActivity(Intent(this, SettingsActivity::class.java)); true }
                else -> false
            }
        }

        setupGestures()
        binding.playerView.setOnClickListener {
            if (sleepMode) {
                exitSleepMode()
            } else if (!controlsVisible) {
                showControls()
            } else if (isFullscreen) {
                hideControls()
            }
        }

        scheduleAutoHide()

        val defaultSleepMin = SessionManager.get(this).defaultSleepTimerMin
        if (defaultSleepMin > 0) startSleepTimer(defaultSleepMin.toLong() * 60_000L)

        // TV: fullscreen imediato (item 6). Celular: retrato com info.
        if (isTv) enterFullscreen() else applyPortraitMode()
    }

    override fun onResume() {
        super.onResume()
        // Reaplica o immersive (o sistema pode ter restaurado as barras).
        if (isFullscreen || isTv) {
            WindowInsetsControllerCompat(window, window.decorView)
                .hide(WindowInsetsCompat.Type.systemBars())
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus && (isFullscreen || isTv)) {
            WindowInsetsControllerCompat(window, window.decorView)
                .hide(WindowInsetsCompat.Type.systemBars())
        }
    }

    /**
     * v2.1.6 — fullscreen no celular ao GIRAR o aparelho (como no
     * YouTube). A Activity NÃO é recriada ao girar (configChanges no
     * manifest já declarava orientation|screenSize|...), então o
     * ExoPlayer segue tocando do ponto exato — nada reinicia, nenhum
     * seek, nenhum reload. Girar para paisagem entra em fullscreen;
     * voltar para retrato sai. Na TV não há rotação — retorno imediato.
     * Idempotente: enterFullscreen/applyPortraitMode já ajustam o
     * requestedOrientation, e a mudança de configuração que eles
     * disparam reentra aqui sem efeito (a flag já está certa).
     */
    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        if (isTv) return
        if (newConfig.orientation == Configuration.ORIENTATION_LANDSCAPE) {
            if (!isFullscreen) enterFullscreen()
        } else if (newConfig.orientation == Configuration.ORIENTATION_PORTRAIT) {
            if (isFullscreen) applyPortraitMode()
        }
    }

    // ──────────── modos ────────────

    private fun applyPortraitMode() {
        isFullscreen = false
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        setPlayerContainerFullscreen(false)
        binding.playerView.useController = true
        binding.customBar.visibility = View.GONE
        // v2.1.7 — restaura a barra superior (o hide do fullscreen pode
        // tê-la deixado GONE + alpha 0; em retrato ela fica visível).
        handler.removeCallbacks(hideBarRunnable)
        binding.topBar.visibility = View.VISIBLE
        binding.topBar.alpha = 1f
        binding.customBar.alpha = 1f
        binding.infoScroll.visibility = View.VISIBLE
        binding.bottomNav.visibility = if (isTv) View.GONE else View.VISIBLE
        binding.audioCover.visibility = if (isAudio) View.VISIBLE else View.GONE
        controlsVisible = true
    }

    private fun enterFullscreen() {
        isFullscreen = true
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        setPlayerContainerFullscreen(true)
        binding.playerView.useController = false
        binding.customBar.visibility = View.VISIBLE
        binding.infoScroll.visibility = View.GONE
        binding.bottomNav.visibility = View.GONE
        binding.audioCover.visibility = if (isAudio) View.VISIBLE else View.GONE
        WindowInsetsControllerCompat(window, window.decorView)
            .hide(WindowInsetsCompat.Type.systemBars())
        showControls()
    }

    /**
     * v2.1.6 — em fullscreen o container do vídeo preenche a tela.
     * Com o ratio 16:9 fixo no XML, num celular em paisagem (tela mais
     * larga que 16:9 — ex.: 915×412dp) o container ficava com 515dp de
     * altura numa tela de 412dp, e a barra de controles (no rodapé do
     * container) caía para FORA da área visível. Em fullscreen a altura
     * é MATCH_PARENT (o vídeo usa fit e faz letterbox se preciso); em
     * retrato volta o 16:9. Na TV (16:9 exato) dá no mesmo.
     */
    private fun setPlayerContainerFullscreen(fullscreen: Boolean) {
        val lp = binding.playerContainer.layoutParams as ConstraintLayout.LayoutParams
        if (fullscreen) {
            lp.height = ViewGroup.LayoutParams.MATCH_PARENT
            lp.dimensionRatio = null
        } else {
            lp.height = 0
            lp.dimensionRatio = "16:9"
        }
        binding.playerContainer.layoutParams = lp
    }

    private fun exitFullscreen() {
        if (isTv) {
            // Na TV o player É fullscreen — Voltar sai do player.
            finish()
            return
        }
        applyPortraitMode()
    }

    // ──────────── títulos / capa de áudio / botões ────────────

    private fun displayTitle(item: FileItem?): String {
        if (item == null) return "Reproduzindo"
        val label = item.folderLabel
        return if (!label.isNullOrBlank()) "${item.name}  ·  $label" else item.name
    }

    private fun setTitles(item: FileItem?) {
        val title = displayTitle(item)
        binding.titleLabel.text = title
        binding.titleInfo.text = item?.name ?: title
        binding.courseInfo.text = item?.folderLabel ?: ""
    }

    private fun updateAudioCover(item: FileItem?) {
        if (item == null) return
        binding.audioCoverTitle.text = item.name
        binding.audioCoverSub.text = if ((item.folderLabel ?: "").contains("podcast", true) ||
            item.name.contains("podcast", true) || item.name.contains("cast", true)) "🎙 Podcast" else "Áudio"
        val thumb = item.thumbnailLink
        if (!thumb.isNullOrBlank()) {
            binding.audioCoverImage.visibility = View.VISIBLE
            binding.audioCoverMonogram.visibility = View.GONE
            binding.audioCoverImage.load(thumb) {
                error(R.drawable.card_gradient_pink)
                listener(onError = { _, _ -> showLibraryOrGeneratedAudioCover(item) })
            }
        } else {
            showLibraryOrGeneratedAudioCover(item)
        }
        // Card "Continuar de onde parou — Parado em 12:34".
        if (isAudio && openedResumeMs > 0) {
            binding.audioResumeCard.visibility = View.VISIBLE
            binding.audioResumeText.text = "Continuar de onde parou — Parado em ${Format.mmss(openedResumeMs)}"
        } else {
            binding.audioResumeCard.visibility = View.GONE
        }
    }

    /**
     * Camada 3 → 4 na capa de áudio: (3) imagem da biblioteca ESTRITA
     * por tipo (2.1.12, sem 'geral'; nome do áudio → rótulo da pasta →
     * caminho), depois (4) capa gerada do drive (monograma só quando o
     * drive não tem capa gerada — os drives 6/7 sempre têm).
     */
    private fun showLibraryOrGeneratedAudioCover(item: FileItem) {
        val libraryUrl = CoverLibrary.resolveStrict(
            this, item.name, item.folderLabel, item.folderPath
        )
        if (!libraryUrl.isNullOrBlank()) {
            binding.audioCoverImage.visibility = View.VISIBLE
            binding.audioCoverMonogram.visibility = View.GONE
            binding.audioCoverImage.load(libraryUrl) {
                error(R.drawable.card_gradient_pink)
                listener(onError = { _, _ -> showGeneratedAudioCover(item) })
            }
            return
        }
        showGeneratedAudioCover(item)
    }

    private fun showGeneratedAudioCover(item: FileItem) {
        // Onda 2 (c): sem thumb, a capa gerada do drive no lugar
        // do monograma; o monograma só quando não há capa gerada.
        val coverRes = item.folderPath?.let { DriveItem.coverResForPath(it) }
        if (coverRes != null) {
            binding.audioCoverImage.visibility = View.VISIBLE
            binding.audioCoverMonogram.visibility = View.GONE
            binding.audioCoverImage.load(coverRes)
        } else {
            binding.audioCoverImage.visibility = View.GONE
            binding.audioCoverMonogram.visibility = View.VISIBLE
            binding.audioCoverMonogram.text = monogramFor(item.name)
            binding.audioCoverBg.background = CardGradient.drawable(resources, colorFromString(item.name))
        }
    }

    private fun updatePrevNextButtons() {
        binding.btnPrev.visibility = if (PlaylistManager.hasPrev()) View.VISIBLE else View.GONE
        binding.btnNext.visibility = if (PlaylistManager.hasNext()) View.VISIBLE else View.GONE
    }

    private fun updateSpeedLabels() {
        val label = "${formatSpeed(speeds[speedIndex])}x"
        binding.btnSpeedBar.text = label
        binding.btnSpeedInfo.text = label
    }

    private fun togglePlayPause() {
        val p = player ?: return
        if (p.isPlaying) p.pause() else p.play()
        updateCenterPlayPause()
        showControls()
    }

    private fun updateCenterPlayPause() {
        val p = player
        // Frente D: com o descanso ativo o botão central fica escondido
        // (está por baixo do overlay de tela cheia; sem isto ele
        // aparecia sobre o preto quando o player pausava — ex.: fim do
        // timer de sono ou fim da playlist com autoplay desligado).
        val paused = p != null && !p.isPlaying && !sleepMode
        // Ronda 8 Frente B: o disco central e o UNICO play/pause
        // da TV — quando esta visivel (pausado) e o elemento
        // focado; ao esconder (a reproduzir) devolve o foco ao
        // video, para o D-pad nao ficar sem foco (o OK no video
        // pausa/reproduz, ver dispatchKeyEvent).
        if (paused && controlsVisible) {
            binding.centerPlayPause.visibility = View.VISIBLE
        } else {
            if (binding.centerPlayPause.hasFocus()) binding.playerView.requestFocus()
            binding.centerPlayPause.visibility = View.GONE
        }
        // v2.1.8 — "❚❚" e glifo de TEXTO (branco, sobre o disco escuro);
        // o emoji "⏸" renderizava como quadrado LARANJA na TV (foto 11:48).
        // Ronda 8 Frente B: o botao da barra so existe no layout
        // do celular (nullable no binding na TV) — o glifo dele
        // continua a actualizar-se la; na TV nao ha botao nenhum
        // para actualizar.
        binding.btnPlayPauseBar?.text = if (p?.isPlaying == true) "❚❚" else "▶"
    }

    private fun playPrev() {
        val prev = PlaylistManager.getPrev() ?: return
        playItem(prev)
    }

    private fun playNext() {
        val next = PlaylistManager.getNext() ?: return
        playItem(next)
    }

    // ──────────── gestos / timer de sono ────────────

    private fun setupGestures() {
        gestureDetector = GestureDetector(this, object : GestureDetector.SimpleOnGestureListener() {
            override fun onDoubleTap(e: MotionEvent): Boolean {
                if (sleepMode) return false
                val width = binding.root.width
                val isLeftHalf = e.x < width / 2f
                seekBy(if (isLeftHalf) -10_000L else 10_000L)
                showSeekHint(if (isLeftHalf) "⏪ -10s" else "⏩ +10s")
                return true
            }
            override fun onSingleTapConfirmed(e: MotionEvent): Boolean = false
        })
        binding.playerView.setOnTouchListener { _, event ->
            gestureDetector?.onTouchEvent(event)
            handleVerticalSwipe(event)
            false
        }
    }

    private fun handleVerticalSwipe(event: MotionEvent) {
        if (sleepMode) return
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                swipeStartY = event.y
                swipeStartX = event.x
                swipeMode = SwipeMode.NONE
            }
            MotionEvent.ACTION_MOVE -> {
                val dy = swipeStartY - event.y
                val dx = event.x - swipeStartX
                if (swipeMode == SwipeMode.NONE && kotlin.math.abs(dy) > 24 && kotlin.math.abs(dy) > kotlin.math.abs(dx) * 1.5f) {
                    val width = binding.root.width
                    swipeMode = if (swipeStartX < width / 2f) SwipeMode.BRIGHTNESS else SwipeMode.VOLUME
                    swipeStartValue = when (swipeMode) {
                        SwipeMode.BRIGHTNESS -> {
                            val lp = window.attributes
                            savedBrightness = if (lp.screenBrightness >= 0) lp.screenBrightness else 0.5f
                            (savedBrightness * 100).toInt()
                        }
                        SwipeMode.VOLUME -> {
                            val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
                            am.getStreamVolume(AudioManager.STREAM_MUSIC)
                        }
                        SwipeMode.NONE -> 0
                    }
                }
                if (swipeMode != SwipeMode.NONE) {
                    val height = binding.root.height
                    val deltaPct = (dy / height.toFloat() * 100f).toInt()
                    when (swipeMode) {
                        SwipeMode.BRIGHTNESS -> {
                            val newPct = (swipeStartValue + deltaPct).coerceIn(0, 100)
                            applyBrightness(newPct)
                            showSwipeIndicator("🔆 $newPct%")
                        }
                        SwipeMode.VOLUME -> {
                            val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
                            val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
                            val newVol = (swipeStartValue + deltaPct * max / 100).coerceIn(0, max)
                            am.setStreamVolume(AudioManager.STREAM_MUSIC, newVol, 0)
                            val pct = if (max > 0) newVol * 100 / max else 0
                            showSwipeIndicator("🔊 $pct%")
                        }
                        SwipeMode.NONE -> {}
                    }
                }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                swipeMode = SwipeMode.NONE
                swipeHandler.removeCallbacks(swipeHideRunnable)
                swipeHandler.postDelayed(swipeHideRunnable, 800)
            }
        }
    }

    private fun applyBrightness(pct: Int) {
        val lp = window.attributes
        lp.screenBrightness = (pct / 100f).coerceIn(0f, 1f)
        window.attributes = lp
    }

    private fun showSwipeIndicator(text: String) {
        binding.swipeIndicator.text = text
        binding.swipeIndicator.visibility = View.VISIBLE
        swipeHandler.removeCallbacks(swipeHideRunnable)
    }

    private fun seekBy(deltaMs: Long) {
        val p = player ?: return
        val target = (p.currentPosition + deltaMs).coerceAtLeast(0).coerceAtMost(p.duration.coerceAtLeast(0))
        p.seekTo(target)
        showControls()
    }

    private fun showSeekHint(text: String) {
        binding.seekGestureHint.text = text
        binding.seekGestureHint.visibility = View.VISIBLE
        binding.seekGestureHint.alpha = 1f
        binding.seekGestureHint.animate().alpha(0f).setStartDelay(600).setDuration(400)
            .withEndAction { binding.seekGestureHint.visibility = View.GONE }.start()
    }
    // ──────────── Frente B (Ronda 3) — hold-to-scrub (TV) ────────────

    /**
     * Começa o scrub remoto numa direção. 1o passo imediato (±10s);
     * o timer repete o passo enquanto a tecla estiver premida
     * (ver remoteScrubTick). Robustez: o timer — e NAO as repetições
     * do sistema (getRepeatCount) — é quem repete o seek, por isso
     * funciona tanto com comandos que enviam DOWN repetidos como com
     * comandos Bluetooth que só enviam um DOWN + um UP; as repetições
     * do sistema são ignoradas no dispatchKeyEvent para não haver
     * dois seeks por tick. Trocar de direção a meio do hold reinicia
     * o scrub na nova direção.
     */
    private fun startRemoteScrub(direction: Int) {
        val p = player ?: return
        if (remoteScrubbing) {
            if (direction == remoteScrubDirection) return
            stopRemoteScrub()
        }
        remoteScrubDirection = direction
        remoteScrubTargetMs = p.currentPosition.coerceAtLeast(0)
        remoteScrubTicks = 0
        remoteScrubItem = currentItem
        remoteScrubbing = true
        remoteScrubStep()
        handler.removeCallbacks(remoteScrubRunnable)
        handler.postDelayed(remoteScrubRunnable, REMOTE_SCRUB_FIRST_DELAY_MS)
    }

    /** Passo do scrub por tempo premido (ver constantes acima). */
    private fun remoteScrubStepMs(): Long = when {
        remoteScrubTicks * REMOTE_SCRUB_INTERVAL_MS < REMOTE_SCRUB_FAST_AFTER_MS -> 10_000L
        remoteScrubTicks * REMOTE_SCRUB_INTERVAL_MS < REMOTE_SCRUB_FASTEST_AFTER_MS -> 30_000L
        else -> 60_000L
    }

    /** Um tick do timer: avança um passo e reagenda-se. */
    private fun remoteScrubTick() {
        if (!remoteScrubbing) return
        remoteScrubTicks++
        if (remoteScrubTicks * REMOTE_SCRUB_INTERVAL_MS > REMOTE_SCRUB_MAX_HOLD_MS) {
            stopRemoteScrub()
            return
        }
        remoteScrubStep()
        if (remoteScrubbing) {
            handler.postDelayed(remoteScrubRunnable, REMOTE_SCRUB_INTERVAL_MS)
        }
    }

    /**
     * Um passo do scrub: soma o passo ao destino acumulado (não à
     * posição ao vivo — o seekTo é assíncrono e a posição lida
     * atrasar-se-ia, acumulando erro), limita a [0, duração], faz o
     * seek, e atualiza AO VIVO a barra, os rótulos e a bolha do tempo
     * destino. O atualizador periódico está suspenso durante o scrub
     * (ver startTimeUpdater) para não lutar com estes valores.
     * Para no fim do item ou se a aula mudar (o player pode avançar
     * sozinho para a próxima aula ao chegar ao fim).
     */
    private fun remoteScrubStep() {
        val p = player ?: run { stopRemoteScrub(); return }
        if (currentItem != remoteScrubItem || p.playbackState == Player.STATE_ENDED) {
            stopRemoteScrub()
            return
        }
        val dur = p.duration.coerceAtLeast(0)
        remoteScrubTargetMs = (remoteScrubTargetMs + remoteScrubDirection * remoteScrubStepMs())
            .coerceIn(0L, dur)
        p.seekTo(remoteScrubTargetMs)
        if (dur > 0) {
            binding.barSeekBar.progress = (remoteScrubTargetMs * 1000 / dur).toInt()
            val label = "${Format.mmss(remoteScrubTargetMs)} / ${Format.mmss(dur)}"
            binding.barTimeLabel.text = label
            binding.infoTimeLabel.text = label
        }
        showScrubHint(remoteScrubTargetMs, dur)
        showControls()
    }

    /**
     * Bolha do tempo destino durante o scrub ("⏪ 12:34 / 48:20").
     * Reutiliza o seekGestureHint (o mesmo do double-tap) mas sem o
     * fade automático do showSeekHint: cancela qualquer animação em
     * curso e fica visível até stopRemoteScrub agendar o fade.
     */
    private fun showScrubHint(targetMs: Long, durMs: Long) {
        val arrow = if (remoteScrubDirection < 0) "⏪" else "⏩"
        binding.seekGestureHint.text = "$arrow ${Format.mmss(targetMs)} / ${Format.mmss(durMs)}"
        binding.seekGestureHint.visibility = View.VISIBLE
        binding.seekGestureHint.alpha = 1f
        binding.seekGestureHint.animate().cancel()
        handler.removeCallbacks(hideSeekHintRunnable)
    }

    /** Fim do scrub ao largar a tecla: a bolha some 900ms depois. */
    private fun stopRemoteScrub() {
        if (!remoteScrubbing) return
        cancelRemoteScrub()
        handler.postDelayed(hideSeekHintRunnable, REMOTE_SCRUB_HINT_HIDE_DELAY_MS)
    }

    /** Cancela o scrub sem agendar nada (onStop/onDestroy/releasePlayer). */
    private fun cancelRemoteScrub() {
        remoteScrubbing = false
        handler.removeCallbacks(remoteScrubRunnable)
        handler.removeCallbacks(hideSeekHintRunnable)
    }

    private fun showSleepTimerDialog() {
        val options = arrayOf("Off", "15 min", "30 min", "45 min", "60 min")
        val minutes = intArrayOf(0, 15, 30, 45, 60)
        AlertDialog.Builder(this)
            .setTitle("⏰ Timer de sono")
            .setItems(options) { _, which ->
                val ms = minutes[which].toLong() * 60_000L
                if (ms > 0) startSleepTimer(ms) else stopSleepTimer()
            }
            .show()
    }

    private fun startSleepTimer(durationMs: Long) {
        stopSleepTimer()
        sleepTimerRemainingMs = durationMs
        sleepTimer = object : CountDownTimer(durationMs, 1000L) {
            override fun onTick(msUntilFinish: Long) {
                sleepTimerRemainingMs = msUntilFinish
                updateSleepTimerLabel()
            }
            override fun onFinish() {
                sleepTimerRemainingMs = 0
                updateSleepTimerLabel()
                enterSleepMode()
                player?.pause()
                Snackbar.make(binding.root, "⏰ Timer de sono acabou — pausado", Snackbar.LENGTH_LONG).show()
            }
        }.start()
        updateSleepTimerLabel()
        Snackbar.make(binding.root, "⏰ Timer: ${durationMs / 60_000} min", Snackbar.LENGTH_SHORT).show()
    }

    private fun stopSleepTimer() {
        sleepTimer?.cancel()
        sleepTimer = null
        sleepTimerRemainingMs = 0
        updateSleepTimerLabel()
    }

    private fun updateSleepTimerLabel() {
        if (sleepTimerRemainingMs > 0) {
            val min = sleepTimerRemainingMs / 60_000
            val sec = (sleepTimerRemainingMs % 60_000) / 1000
            binding.sleepTimerLabel.text = "⏰ %02d:%02d".format(min, sec)
            binding.sleepTimerLabel.visibility = View.VISIBLE
        } else {
            binding.sleepTimerLabel.visibility = View.GONE
        }
    }

    // ──────────── MODO DESCANSO ────────────

    private fun toggleSleepMode() {
        if (sleepMode) exitSleepMode() else enterSleepMode()
    }

    private fun enterSleepMode() {
        sleepMode = true
        // Frente D: o overlay é o ÚLTIMO filho da raiz (tela cheia,
        // elevation 16dp) — cobre vídeo, barras, info e bottom nav.
        // A pill fica por baixo dele (não é mais saída); a saída por
        // toque é o próprio overlay. Na TV o foco vai para o overlay.
        binding.sleepOverlay.visibility = View.VISIBLE
        binding.sleepOverlay.requestFocus()
        binding.btnRestBar.text = "🌙 Descanso ●"
        binding.btnRestInfo.text = "🌙 Descanso ●"
        Snackbar.make(binding.root, "🌙 Modo descanso — o áudio continua; toque na tela para sair", Snackbar.LENGTH_SHORT).show()
    }

    private fun exitSleepMode() {
        if (!sleepMode) return
        sleepMode = false
        binding.sleepOverlay.visibility = View.GONE
        binding.btnRestBar.text = "🌙 Descanso"
        binding.btnRestInfo.text = "🌙 Descanso"
        showControls()
    }

    /** Qualquer interação com os controles sai do descanso primeiro. */
    private fun exitRestIfActive() {
        if (sleepMode) exitSleepMode()
    }

    // ──────────── controles (auto-hide) ────────────

    private fun showControls() {
        if (sleepMode) return
        controlsVisible = true
        if (isFullscreen) {
            // v2.1.7 — cancela o GONE pendente do hide: a barra não pode
            // sumir depois de mostrada de novo.
            handler.removeCallbacks(hideBarRunnable)
            binding.customBar.visibility = View.VISIBLE
            binding.topBar.visibility = View.VISIBLE
            binding.customBar.animate().alpha(1f).setDuration(200).start()
            binding.topBar.animate().alpha(1f).setDuration(200).start()
            // v2.1.7 — TV: o foco tem que entrar na barra (antes nenhum
            // botão recebia foco e o D-pad não alcançava os controles).
            // Ronda 8 Frente B: sem botao play/pausa na barra da
            // TV, o foco entra no disco central quando esta
            // visivel (pausado) — o OK nele pausa/reproduz; a
            // reproduzir o foco fica no video (o OK ai tambem
            // pausa/reproduz, ver dispatchKeyEvent). O
            // updateCenterPlayPause() no fim desta funcao
            // actualiza a visibilidade do disco; chama-se ja
            // aqui para o foco o encontrar visivel quando pausado.
            if (isTv) {
                val f = currentFocus
                if (f == null || f == binding.playerView) {
                    updateCenterPlayPause()
                    if (player?.isPlaying == false) {
                        binding.centerPlayPause.requestFocus()
                    }
                }
            }
        } else {
            binding.playerView.showController()
        }
        updateCenterPlayPause()
        scheduleAutoHide()
    }

    private fun hideControls() {
        if (sleepMode) return
        controlsVisible = false
        if (isFullscreen) {
            // v2.1.7 — a barra invisível (alpha 0) continuava interceptando
            // toques na região dela; some com GONE 250ms depois do fade.
            binding.customBar.animate().alpha(0f).setDuration(200).start()
            binding.topBar.animate().alpha(0f).setDuration(200).start()
            handler.removeCallbacks(hideBarRunnable)
            handler.postDelayed(hideBarRunnable, 250)
        } else {
            binding.playerView.hideController()
        }
        updateCenterPlayPause()
    }

    // v2.1.7 — esconde a barra do fullscreen depois do fade-out, só se
    // os controles continuarem escondidos (showControls cancela).
    private val hideBarRunnable = Runnable {
        if (!controlsVisible) {
            binding.customBar.visibility = View.GONE
            binding.topBar.visibility = View.GONE
        }
    }

    private fun scheduleAutoHide() {
        handler.removeCallbacks(hideControlsRunnable)
        handler.postDelayed(hideControlsRunnable, CONTROLS_HIDE_DELAY)
    }

    private fun restartVideo() {
        val p = player ?: return
        p.seekTo(0)
        p.play()
        val item = currentItem
        val fp = item?.folderPath
        if (!fp.isNullOrBlank() && !item.name.isBlank()) {
            SessionManager.get(this).saveResume(fp, item.name, 0L)
        }
        Snackbar.make(binding.root, "↺ Reiniciando do início", Snackbar.LENGTH_SHORT).show()
        showControls()
    }

    private fun cycleSpeed() {
        val p = player ?: return
        speedIndex = (speedIndex + 1) % speeds.size
        val next = speeds[speedIndex]
        p.playbackParameters = PlaybackParameters(next)
        updateSpeedLabels()
        showControls()
    }

    private fun formatSpeed(s: Float): String {
        return when (s) {
            1.0f -> "1.0"
            2.0f -> "2.0"
            0.75f -> "0.75"
            1.25f -> "1.25"
            1.5f -> "1.5"
            1.75f -> "1.75"
            else -> "$s"
        }
    }

    // ──────────── legenda (sem botão CC desde v2.1.7) ────────────

    /**
     * Busca a legenda da aula atual (sidecar na pasta, senão o endpoint
     * do worker). Chamado em 2º plano após o player iniciar — a
     * legenda já está pronta quando o vídeo começa. Sem legenda,
     * nada é exibido (nunca menu vazio/falso).
     */
    private fun ensureSubtitles() {
        if (isAudio || subtitleState == SubtitleState.READY) return
        val item = currentItem ?: return
        val folderPath = item.folderPath ?: return
        subtitleFetchJob?.cancel()
        subtitleFetchJob = lifecycleScope.launch {
            val api = ApiService(this@PlayerActivity)
            val files = withContext(kotlinx.coroutines.Dispatchers.IO) { api.listFolder(folderPath) }
            val base = item.name.substringBeforeLast(".")
            val sidecar = files?.firstOrNull { f ->
                f.isSubtitle && f.name.startsWith(base, ignoreCase = true)
            }
            val result = SubtitleFetcher.fetch(
                this@PlayerActivity, folderPath, item.name,
                sidecar?.link?.let { BiBiGynApp.BASE_URL + it }, sidecar?.name
            )
            when (result) {
                is SubtitleFetcher.Result.Ready -> {
                    subtitleState = SubtitleState.READY
                    subtitleVttFile = result.vttFile
                    subtitleLanguage = result.language
                    attachSubtitleTrack()
                }
                is SubtitleFetcher.Result.Generating -> {
                    subtitleState = SubtitleState.GENERATING
                    if (subtitleRetryCount < 3) {
                        subtitleRetryCount++
                        Snackbar.make(binding.root, "Gerando legenda… tentando de novo em 30s", Snackbar.LENGTH_LONG).show()
                        handler.postDelayed({ subtitleState = SubtitleState.UNKNOWN; ensureSubtitles() }, 30_000L)
                    }
                }
                is SubtitleFetcher.Result.None -> {
                    subtitleState = SubtitleState.NONE
                }
            }
        }
    }

    /** Anexa o VTT baixado como trilha de legenda do item atual. */
    private fun attachSubtitleTrack() {
        val exo = player ?: return
        val vtt = subtitleVttFile ?: return
        try {
            val index = exo.currentMediaItemIndex
            val current = exo.getMediaItemAt(index)
            val sub = MediaItem.SubtitleConfiguration.Builder(Uri.fromFile(vtt))
                .setMimeType(MimeTypes.TEXT_VTT)
                .setLanguage(subtitleLanguage)
                .setSelectionFlags(C.SELECTION_FLAG_DEFAULT)
                .build()
            val position = exo.currentPosition
            val wasPlaying = exo.isPlaying
            exo.replaceMediaItem(index, current.buildUpon().setSubtitleConfigurations(listOf(sub)).build())
            exo.seekTo(position)
            exo.playWhenReady = wasPlaying
            applySubtitlesEnabled()
        } catch (_: Exception) {
            subtitleState = SubtitleState.NONE
        }
    }

    /** Diálogo estilo YouTube: idiomas disponíveis + "Desativado". */
    /** Aplica o toggle Legendas dos Ajustes (padrão da sessão). */
    private fun applySubtitlesEnabled() {
        val ts = trackSelector ?: return
        val enabled = SessionManager.get(this).subtitlesEnabled
        ts.setParameters(ts.buildUponParameters().setRendererDisabled(C.TRACK_TYPE_TEXT, !enabled))
    }

    /**
     * Aplica a qualidade dos Ajustes (Auto/HD/SD). SÓ restringe quando
     * há >1 trilha de vídeo — as aulas hoje são MP4 progressivo de uma
     * só versão; restringir a única trilha apagaria o vídeo.
     */
    private fun applyVideoQuality() {
        val ts = trackSelector ?: return
        val info = ts.currentMappedTrackInfo ?: return
        var videoTracks = 0
        for (r in 0 until info.rendererCount) {
            if (info.getRendererType(r) != C.TRACK_TYPE_VIDEO) continue
            val groups = info.getTrackGroups(r)
            for (g in 0 until groups.length) videoTracks += groups[g].length
        }
        if (videoTracks <= 1) return
        val quality = SessionManager.get(this).videoQuality
        val params = ts.buildUponParameters()
        when (quality) {
            "hd" -> params.setMaxVideoSize(1280, 720)
            "sd" -> params.setMaxVideoSize(854, 480)
            else -> params.clearVideoSizeConstraints()
        }
        ts.setParameters(params)
    }

    // ──────────── playlist — v2.1.6: a UI embutida (gaveta + "A seguir")
    // foi REMOVIDA do player. A playlist vive na PÁGINA
    // (DetailActivity, via PlaylistManager.setPlaylist); o avanço de
    // aula (Anterior/Próxima, autoplay, onMediaItemTransition) continua
    // igual. Não há mais setup de RecyclerView aqui — PlaylistAdapter
    // e item_playlist.xml foram apagados.

    // ──────────── player lifecycle ────────────

    override fun onStart() {
        super.onStart()
        playerInForeground = true
        // v2.1.9: o auto-update NUNCA lança o instalador por cima da
        // reprodução — o download que terminar agora fica adiado e
        // lança quando o player fechar (ver UpdateChecker).
        UpdateChecker.setPlayerForeground(true)
        // Frente R4C — regresso com a tela apagada: o player NÃO foi
        // libertado (ver onStop) — só volta a ligar a superfície e os
        // atualizadores; NÃO recria a aula nem perde a posição.
        if (player != null && backgroundAudioActive) reattachPlayerAfterBackground() else initialisePlayer()
        startPregenerator()
        // Frente H — a playlist interfolder é montada aqui, em 2º plano,
        // depois de o player já estar visível (ver a função).
        enrichPlaylistInBackground()
        // Frente R4 — materiais da aula em baixo (retrato, celular):
        // carrega em 2º plano ao abrir; nunca atrasa o vídeo. Na TV
        // não carrega (a secção não existe no layout-television).
        loadMaterials()
    }

    override fun onStop() {
        super.onStop()
        playerInForeground = false
        // Frente B (Ronda 3) — o timer do scrub não sobrevive à saída.
        cancelRemoteScrub()
        UpdateChecker.setPlayerForeground(false)
        descriptionPregenerator?.stop()
        // Frente R4C — a tela apagou com a aula A TOCAR: NÃO libertar
        // o player (o releasePlayer() é o que matava o áudio). O
        // serviço já corre desde o início da reprodução (ver
        // initialisePlayer) e mantém o processo em 1º plano; o wake
        // lock de áudio do ExoPlayer (WAKE_MODE_LOCAL) mantém o CPU
        // acordado. Se a aula estava pausada, ou se o utilizador
        // saiu (tela acesa / Voltar), o comportamento antigo
        // mantém-se: libertar (ver o releasePlayer() abaixo).
        if (!isFinishing && isScreenOff() && isPlaybackActive()) {
            backgroundAudioActive = true
            playlistEnriched = false
            return
        }
        releasePlayer()
        playlistEnriched = false
    }

    /**
     * v2.7.6 — (Re)inicia a pré-geração das descrições das próximas
     * 3 aulas da playlist (Elton 00:21): dispara o batalhão para elas
     * enquanto este vídeo toca, para a próxima aula já abrir com a
     * descrição pronta. A fila só anda com o vídeo tocando e para
     * quando o player sai de primeiro plano ([playerInForeground]).
     * Reiniciada a cada troca de aula (a "próxima" muda junto).
     */
    private fun startPregenerator() {
        if (descriptionPregenerator == null) {
            descriptionPregenerator = DescriptionPregenerator(this)
        }
        // Índice atual: o do ExoPlayer (já reflete o seekTo) ou o do
        // PlaylistManager quando o player ainda não existe.
        val currentIdx = player?.currentMediaItemIndex?.takeIf { it >= 0 }
            ?: PlaylistManager.index()
        descriptionPregenerator?.start(
            lifecycleScope,
            PlaylistManager.all(),
            currentIdx,
            isPlaying = { player?.isPlaying == true },
            isActive = { playerInForeground && !isFinishing && !isDestroyed }
        )
    }

    /**
     * Frente H — enriquecimento da playlist EM 2º PLANO, depois da
     * navegação. Quando o vídeo tocado era o único da pasta, o
     * Detail/Browse/Home já navegou com uma playlist de 1 item; a
     * montagem interfolder (CrossFolderPlaylist: 1 listFolder ao pai +
     * 1 por cada pasta-irmã, em lotes de 6) corria ANTES da navegação
     * e deixava o toque sem resposta durante segundos. Agora corre
     * aqui, com o player já visível a mostrar "A carregar", e os
     * itens novos entram na fila do ExoPlayer sem interromper a
     * reprodução (addMediaItems): os anteriores ao vídeo atual vão
     * para o início (o atual passa ao índice startIndex) e os
     * seguintes para logo a seguir a ele; o PlaylistManager é
     * substituído pela lista completa no mesmo índice, por isso
     * Anterior/Próxima e o autoplay continuam alinhados com o
     * ExoPlayer. Corre no máximo 1× por sessão do player; falha de
     * rede = ignora (a fila de 1 item continua válida).
     */
    private fun enrichPlaylistInBackground() {
        if (playlistEnriched) return
        val exo = player ?: return
        if (PlaylistManager.size() > 1) {
            playlistEnriched = true
            return
        }
        val item = currentItem ?: return
        val folder = item.folderPath
            ?: intent.getStringExtra(EXTRA_FOLDER_PATH)
            ?: return
        if (item.link.isNullOrBlank()) return
        playlistEnriched = true
        lifecycleScope.launch {
            val api = ApiService(this@PlayerActivity)
            val result = withContext(kotlinx.coroutines.Dispatchers.IO) {
                runCatching { com.bibigyn.app.util.CrossFolderPlaylist.build(folder, item, api) }.getOrNull()
            } ?: return@launch
            if (result.items.size <= 1) return@launch
            val p = player ?: return@launch
            if (p.mediaItemCount != 1 || isFinishing || isDestroyed) return@launch
            val current = PlaylistManager.getCurrent()
            val target = result.items[result.startIndex]
            if (current?.name != target.name) return@launch
            if ((current.folderPath ?: "") != (target.folderPath ?: "")) return@launch
            fun toMedia(f: FileItem) =
                MediaItem.Builder().setUri(BiBiGynApp.BASE_URL + (f.link ?: "")).build()
            val before = result.items.subList(0, result.startIndex)
            val after = result.items.subList(result.startIndex + 1, result.items.size)
            if (before.isNotEmpty()) p.addMediaItems(0, before.map(::toMedia))
            if (after.isNotEmpty()) p.addMediaItems(result.startIndex + 1, after.map(::toMedia))
            PlaylistManager.setPlaylist(result.items, result.startIndex, this@PlayerActivity)
            updatePrevNextButtons()
        }
    }

    private fun initialisePlayer() {
        val item = currentItem
        val link = item?.link
        val url = if (!link.isNullOrEmpty()) BiBiGynApp.BASE_URL + link else intent.getStringExtra(EXTRA_URL)
        if (url.isNullOrBlank()) {
            Snackbar.make(binding.root, "URL de playback ausente.", Snackbar.LENGTH_LONG).show()
            finish()
            return
        }
        currentUrl = url

        val cookie = SessionManager.get(this).sessionCookie
        val requestProperties = if (!cookie.isNullOrBlank()) mapOf("Cookie" to "session=$cookie") else emptyMap()
        val sm = SessionManager.get(this)
        val writeToCache = !sm.wifiOnlyDownloads || VideoCache.isWifi(this)
        val dataSourceFactory = VideoCache.dataSourceFactory(
            this, BiBiGynApp.okHttpClient, writeToCache, requestProperties
        )

        trackSelector = DefaultTrackSelector(this)
        val exo = ExoPlayer.Builder(this)
            .setTrackSelector(trackSelector!!)
            .setMediaSourceFactory(DefaultMediaSourceFactory(dataSourceFactory))
            .build()

        val playlist = PlaylistManager.all()
        val startIndex = PlaylistManager.index()
        if (playlist.isNotEmpty() && startIndex in playlist.indices) {
            val mediaItems = playlist.map { file ->
                val fullUrl = BiBiGynApp.BASE_URL + (file.link ?: "")
                MediaItem.Builder().setUri(fullUrl).build()
            }
            exo.setMediaItems(mediaItems, startIndex, 0L)
        } else {
            exo.setMediaItem(MediaItem.fromUri(url))
        }
        exo.prepare()

        val isReview = isWatched(item)
        val saved = if (isReview) 0L else resumeFor(item, url)
        if (saved > 0L && !isReview) {
            exo.seekTo(startIndex, saved)
        }
        if (isReview) {
            binding.root.post {
                Snackbar.make(binding.root, "📖 Revisão — começando do início", Snackbar.LENGTH_SHORT).show()
            }
        }

        exo.playbackParameters = PlaybackParameters(speeds[speedIndex])
        exo.pauseAtEndOfMediaItems = !SessionManager.get(this).autoplayNext
        exo.playWhenReady = true

        // Frente R4C — wake lock SÓ de áudio (PARTIAL_WAKE_LOCK): o
        // ExoPlayer segura-o enquanto toca e liberta-o ao pausar; a
        // tela continua apagada (nada de SCREEN_DIM/BRIGHT). Sem isto
        // o CPU dormia e o áudio morria com a tela, mesmo com o
        // serviço em 1º plano.
        exo.setWakeMode(C.WAKE_MODE_LOCAL)
        // Frente R4C — o serviço de áudio arranca AQUI, com a
        // activity em 1º plano: no Android 12+ um
        // startForegroundService() a partir do onStop (app em 2º
        // plano) lança ForegroundServiceStartNotAllowedException —
        // por isso o serviço corre durante toda a reprodução e NÃO
        // só quando a tela apaga (a notificação de media fica visível
        // enquanto a aula toca, como nas apps de música/podcast).
        // Para em releasePlayer()/onDestroy().
        BackgroundAudioService.start(this)

        exo.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED) {
                    markEnded(item)
                    if (!exo.hasNextMediaItem()) {
                        Snackbar.make(binding.root, "Fim da playlist", Snackbar.LENGTH_LONG).show()
                    }
                }
                if (state == Player.STATE_READY) {
                    // Frente H — 1º frame pronto: esconde o "A carregar".
                    binding.playerLoading.visibility = View.GONE
                    applyVideoQuality()
                    applySubtitlesEnabled()
                }
            }

            override fun onPlayerError(error: PlaybackException) {
                // Frente H — erro de playback: não deixar o "A carregar" preso.
                binding.playerLoading.visibility = View.GONE
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                updateCenterPlayPause()
                // Frente R4C — play/pausa (da UI ou da notificação):
                // a notificação passa a mostrar o estado certo.
                BackgroundAudioService.refresh(this@PlayerActivity)
            }

            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                val newIndex = exo.currentMediaItemIndex
                if (newIndex != PlaylistManager.index()) {
                    if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO) {
                        markEnded(item)
                    }
                    PlaylistManager.setIndex(newIndex)
                    val newItem = PlaylistManager.getCurrent()
                    if (newItem != null) {
                        currentItem = newItem
                        currentUrl = BiBiGynApp.BASE_URL + (newItem.link ?: "")
                        isAudio = newItem.isAudio
                        openedResumeMs = 0L
                        subtitleState = SubtitleState.UNKNOWN
                        subtitleVttFile = null
                        subtitleRetryCount = 0
                        setTitles(newItem)
                        updateAudioCover(newItem)
                        updatePrevNextButtons()
                        // Frente R4C — a aula mudou: a notificação
                        // passa a mostrar o título novo.
                        BackgroundAudioService.refresh(this@PlayerActivity)
                                        updateFavButton()
                        // v2.7.6 (fix): retomar a posição salva + aplicar a
                        // velocidade padrão — antes zerava os dois.
                        val watched = isWatched(newItem)
                        val resume = if (watched) 0L else resumeFor(newItem, currentUrl ?: "")
                        if (resume > 0L) exo.seekTo(newIndex, resume)
                        val defSpeed = SessionManager.get(this@PlayerActivity).defaultSpeed
                        speedIndex = speeds.indexOfFirst { it == defSpeed }.coerceAtLeast(1)
                        exo.playbackParameters = PlaybackParameters(speeds[speedIndex])
                        updateSpeedLabels()
                        // Frente D — persistência do descanso na troca de
                        // aula: o overlay (filho da raiz) sobrevive à
                        // transição por si só; reafirma-se aqui para o
                        // invariante ficar explícito (o auto-advance e o
                        // playNext/playPrev NÃO chamam exitSleepMode).
                        if (sleepMode) binding.sleepOverlay.visibility = View.VISIBLE
                        ensureSubtitles()
                        // Frente R4 — a aula mudou: recarrega os materiais.
                        loadMaterials()
                    }
                }
            }
        })

        player = exo
        binding.playerView.player = exo
        binding.playerView.useController = !isFullscreen

        if (sleepMode) {
            binding.sleepOverlay.visibility = View.VISIBLE
            hideControls()
        }

        startTimeUpdater()
        ensureSubtitles()

        saveJob?.cancel()
        saveJob = lifecycleScope.launch {
            while (true) {
                delay(2_000)
                val p = player ?: break
                val it = currentItem ?: break
                if (p.playbackState == Player.STATE_READY && p.isPlaying) {
                    saveResumeFor(it, currentUrl, p.currentPosition)
                    val fp = it.folderPath
                    if (!fp.isNullOrBlank()) {
                        // v2.7.6: salva a thumb junto — alimenta os cards
                        // "Continue assistindo" com foto real.
                        SessionManager.get(this@PlayerActivity).addRecent(fp, it.name, it.thumbnailLink)
                    }
                }
            }
        }
    }

    /** Atualiza os tempos (12:34 / 48:20) e a barra a cada 500ms. */
    private fun startTimeUpdater() {
        timeJob?.cancel()
        timeJob = lifecycleScope.launch {
            while (true) {
                delay(500)
                val p = player ?: break
                val dur = p.duration.coerceAtLeast(0)
                val pos = p.currentPosition.coerceAtLeast(0)
                val label = "${Format.mmss(pos)} / ${Format.mmss(dur)}"
                binding.barTimeLabel.text = label
                binding.infoTimeLabel.text = label
                // Frente B (Ronda 3) — durante o scrub remoto a barra
                // e os rótulos são atualizados pelo remoteScrubStep
                // (a partir do destino); o atualizador não os toca.
                if (!seekBarDragging && !remoteScrubbing && dur > 0) {
                    binding.barSeekBar.progress = (pos * 1000 / dur).toInt()
                }
            }
        }
    }

    /**
     * v2.4.0 — Jump to a specific playlist item by index.
     * v2.7.6 (fix): retoma a posição salva (exceto revisão) e aplica a
     * velocidade padrão — antes buscava (idx, 0) e zerava a velocidade.
     */
    private fun playItem(item: FileItem) {
        val p = player
        if (p != null) {
            val playlist = PlaylistManager.all()
            val idx = playlist.indexOfFirst { it.name == item.name && (it.folderPath ?: "") == (item.folderPath ?: "") }
            if (idx >= 0) {
                val watched = isWatched(item)
                val resume = if (watched) 0L else resumeFor(item, BiBiGynApp.BASE_URL + (item.link ?: ""))
                p.seekTo(idx, resume)
                val defSpeed = SessionManager.get(this).defaultSpeed
                speedIndex = speeds.indexOfFirst { it == defSpeed }.coerceAtLeast(1)
                p.playbackParameters = PlaybackParameters(speeds[speedIndex])
                updateSpeedLabels()
                p.play()
                startPregenerator()
                // Frente R4 — a aula mudou: recarrega os materiais.
                loadMaterials()
                return
            }
        }
        releasePlayer()
        currentItem = item
        setTitles(item)
        initialisePlayer()
        startPregenerator()
        // Frente H — a playlist interfolder é montada aqui, em 2º plano,
        // depois de o player já estar visível (ver a função).
        enrichPlaylistInBackground()
        // Frente R4 — a aula mudou: recarrega os materiais.
        loadMaterials()
    }

    private fun toggleFavoriteCurrent() {
        val item = currentItem ?: return
        val sm = SessionManager.get(this)
        val favItem = item.copy(folderPath = item.folderPath ?: intent.getStringExtra(EXTRA_FOLDER_PATH))
        val nowFav = sm.toggleFavorite(favItem)
        updateFavButton()
        Snackbar.make(binding.root,
            if (nowFav) "⭐ Adicionado à Minha lista" else "Removido da Minha lista",
            Snackbar.LENGTH_SHORT).show()
    }

    private fun updateFavButton() {
        val item = currentItem ?: run { binding.favButton.text = "☆"; return }
        val sm = SessionManager.get(this)
        val fp = item.folderPath ?: intent.getStringExtra(EXTRA_FOLDER_PATH) ?: ""
        binding.favButton.text = if (sm.isFavorite(fp, item.name)) "⭐" else "☆"
    }

    private fun releasePlayer() {
        // Frente R4C — sem player não há áudio em 2º plano: a
        // notificação some e o serviço para (não fica órfão).
        BackgroundAudioService.stop(this)
        backgroundAudioActive = false
        // Frente B (Ronda 3) — o player some, o scrub some com ele.
        cancelRemoteScrub()
        saveJob?.cancel()
        saveJob = null
        timeJob?.cancel()
        timeJob = null
        subtitleFetchJob?.cancel()
        handler.removeCallbacks(hideControlsRunnable)
        val p = player ?: return
        try {
            val it = currentItem
            val url = currentUrl
            if (it != null && url != null) {
                saveResumeFor(it, url, p.currentPosition)
            }
        } catch (_: Exception) {}
        p.release()
        player = null
        trackSelector = null
    }

    // ──────────── Frente R4C — áudio em 2º plano (tela apagada) ────────────

    /** Frente R4C — true quando a tela está apagada/bloqueada. */
    private fun isScreenOff(): Boolean {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        return !pm.isInteractive
    }

    /** Frente R4C — a tocar ou em buffer com playWhenReady (não fim/pausa). */
    private fun isPlaybackActive(): Boolean {
        val p = player ?: return false
        if (!p.playWhenReady) return false
        return p.playbackState == Player.STATE_READY || p.playbackState == Player.STATE_BUFFERING
    }

    /**
     * Frente R4C — regresso ao player depois da tela apagada: o
     * ExoPlayer NUNCA foi libertado — só volta a ligar a superfície
     * (o PlayerView recria-a sozinho ao voltar; a re-atribuição
     * garante-o), repõe os atualizadores e desliga o serviço (a
     * notificação some porque a Activity voltou a estar visível).
     * NÃO recria a aula nem faz seek: a posição é a que o player
     * tem (o ciclo de guardar a posição continuou a correr com a
     * tela apagada). O modo Descanso sobrevive (o overlay volta a
     * ficar visível; nada aqui chama exitSleepMode).
     */
    private fun reattachPlayerAfterBackground() {
        val exo = player ?: return
        backgroundAudioActive = false
        binding.playerView.player = exo
        binding.playerView.useController = !isFullscreen
        updateCenterPlayPause()
        updatePrevNextButtons()
        startTimeUpdater()
        // O saveJob NÃO foi cancelado (não houve releasePlayer), por
        // isso não se reinicia: o ciclo de 2s continuou a guardar a
        // posição com a tela apagada.
        BackgroundAudioService.stop(this)
        if (sleepMode) {
            binding.sleepOverlay.visibility = View.VISIBLE
            hideControls()
        } else {
            showControls()
        }
    }

    /**
     * Frente R4C — ação ⏹ da notificação: pausa, guarda a posição
     * (releasePlayer), para o serviço e fecha o player. Não retoma
     * sozinha: se a aula estava pausada antes de a tela apagar, o
     * serviço nem sequer fica com a notificação em pausa — o player
     * já tinha sido libertado no onStop.
     */
    private fun stopPlaybackFromNotification() {
        player?.pause()
        releasePlayer()
        finish()
    }

    private fun isWatched(item: FileItem?): Boolean {
        val fp = item?.folderPath
        if (fp.isNullOrBlank() || item.name.isBlank()) return false
        return SessionManager.get(this).isWatched(fp, item.name)
    }

    private fun resumeFor(item: FileItem?, url: String): Long {
        val fp = item?.folderPath
        if (!fp.isNullOrBlank() && !item.name.isBlank()) {
            return SessionManager.get(this).getResume(fp, item.name)
        }
        return SessionManager.get(this).getResumePosition(url)
    }

    private fun saveResumeFor(item: FileItem, url: String?, positionMs: Long) {
        val fp = item.folderPath
        if (!fp.isNullOrBlank() && !item.name.isBlank()) {
            SessionManager.get(this).saveResume(fp, item.name, positionMs)
            val p = player
            if (p != null && p.duration > 0) {
                SessionManager.get(this).saveResumeDuration(fp, item.name, p.duration)
            }
        } else if (url != null) {
            SessionManager.get(this).saveResumePosition(url, positionMs)
        }
    }

    private fun markEnded(item: FileItem?) {
        val fp = item?.folderPath
        if (!fp.isNullOrBlank() && !item.name.isBlank()) {
            SessionManager.get(this).clearResume(fp, item.name)
            SessionManager.get(this).markWatched(fp, item.name)
        } else {
            val url = currentUrl
            if (url != null) {
                SessionManager.get(this).clearResumePosition(url)
            }
        }
    }

    // ★ v1.6.0: Picture-in-Picture — NUNCA na TV (v2.7.6).
    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (isTv) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                val p = player
                if (p != null && p.isPlaying) {
                    val ratio = if (p.videoSize.width > 0 && p.videoSize.height > 0)
                        android.util.Rational(p.videoSize.width, p.videoSize.height)
                    else android.util.Rational(16, 9)
                    val params = android.app.PictureInPictureParams.Builder()
                        .setAspectRatio(ratio)
                        .build()
                    enterPictureInPictureMode(params)
                }
            } catch (_: Exception) {}
        }
    }

    override fun onDestroy() {
        // Frente B (Ronda 3) — sem callbacks pendentes no handler.
        cancelRemoteScrub()
        // Frente R4 — cancela o carregamento dos materiais.
        materialsJob?.cancel()
        super.onDestroy()
        stopSleepTimer()
        // Frente R4C — retira os controlos e garante que o serviço
        // não fica órfão (a Activity é a dona do player).
        BackgroundAudioService.registerControls(null)
        BackgroundAudioService.stop(this)
    }

    // ──────────── Frente R4 — Materiais da aula (retrato) ────────────
    //
    // Secção "📚 Materiais" por baixo do botão "Próxima aula" (só no
    // layout de retrato — res/layout/activity_player.xml; a TV NÃO tem
    // a secção e NÃO carrega nada: loadMaterials() retorna logo se
    // isTv). Carrega AUTOMATICAMENTE ao abrir a aula, em 2º plano:
    // o vídeo arranca em onStart/initialisePlayer sem esperar por isto.
    //
    // Fontes (tudo o que já existe — NENHUM endpoint inventado):
    //   resumo + pílulas + questões — LessonDescription.fetchGenerated()
    //     (cache ISA: GET /api/ai/summaries?key=, 2 courseKeys × nomes
    //     dos PDFs/MDs; fallback: GET /api/materials/load-from-folder,
    //     materialType=resumo);
    //   pílulas/questões em falta — AiService.loadFromFolder(..., "flashcard")
    //     e (..., "questoes") (pastas .gdi-flashcards/ e .gdi-questoess/);
    //   resumo em falta — cache local (SessionManager.getLessonDescription,
    //     o mesmo que a aba Resumo do detalhe mostra);
    //   ficheiros da pasta — ApiService.listFolder(folderPath) (a MESMA
    //     chamada que ensureSubtitles() já faz aqui); PDF → leitor da
    //     ronda 2 (PdfReaderActivity), .md → MdReaderActivity, outros →
    //     app externa (o mesmo comportamento do openFile do detalhe).
    // A secção só existe no layout do telemóvel: os ids são lidos por
    // findViewById (nullable) e NUNCA pelo binding — o binding gerado
    // exige os ids em TODAS as variantes do layout e a TV não os tem
    // (crash no inflate da TV); com findViewById a TV simplesmente
    // não os encontra e nada acontece.
    //
    // Estados: a carregar (spinner + texto, sem bloquear o vídeo);
    // vazio (uma linha discreta, sem espaço gigante); erro (texto
    // curto + "Tentar de novo" — sem crash, sem bounce para o login:
    // o vídeo está a tocar e um bounce matava a reprodução).
    // Recarrega a cada troca de aula (Anterior/Próxima/autoplay).

    /** Uma questão do pacote gerado (formato do batalhão, worker.js:7760). */
    private data class MaterialsQuestion(
        val statement: String,
        val options: List<String>,
        val answer: String?
    )

    private data class MaterialsData(
        val summary: String?,
        val pills: List<String>,
        val questions: List<MaterialsQuestion>,
        val files: List<FileItem>
    )

    /** Atalho findViewById nullable (ver nota no topo da secção). */
    private fun <T : View> mat(id: Int): T? = findViewById(id)

    private fun materialsFolderPath(): String? =
        currentItem?.folderPath?.takeIf { it.isNotBlank() }
            ?: intent.getStringExtra(EXTRA_FOLDER_PATH)?.takeIf { it.isNotBlank() }

    /**
     * Carrega os materiais da aula atual em 2º plano (lifecycleScope).
     * Nunca atrasa o vídeo: o player arranca em onStart, independente
     * disto. Best-effort: falha de rede vira estado de erro com retry.
     */
    private fun loadMaterials() {
        if (isTv) return
        materialsJob?.cancel()
        val section = mat<View>(R.id.materials_section) ?: return
        val folderPath = materialsFolderPath()
        if (folderPath.isNullOrBlank()) {
            showMaterialsEmpty()
            return
        }
        section.visibility = View.VISIBLE
        mat<View>(R.id.materials_loading)?.visibility = View.VISIBLE
        mat<View>(R.id.materials_empty)?.visibility = View.GONE
        mat<View>(R.id.materials_error)?.visibility = View.GONE
        mat<View>(R.id.materials_content)?.visibility = View.GONE
        materialsJob = lifecycleScope.launch {
            val data = try {
                val api = ApiService(this@PlayerActivity)
                val files = withContext(kotlinx.coroutines.Dispatchers.IO) {
                    runCatching { api.listFolder(folderPath) }.getOrNull()
                }
                if (files == null) {
                    showMaterialsError()
                    return@launch
                }
                val materialNames = files.filter { it.isPdf || it.isMarkdown }.map { it.name }
                val lessonFile = LessonDescription.lessonFilePath(folderPath, files)
                val bundle = LessonDescription.fetchGenerated(
                    this@PlayerActivity, folderPath, materialNames, lessonFile
                )
                val summary = bundle?.summary
                    ?: SessionManager.get(this@PlayerActivity).getLessonDescription(folderPath)
                val pillsText = bundle?.mindmap
                    ?: lessonFile?.let { AiService.loadFromFolder(this@PlayerActivity, it, "flashcard") }
                val questionsText = bundle?.questionsJson
                    ?: lessonFile?.let { AiService.loadFromFolder(this@PlayerActivity, it, "questoes") }
                MaterialsData(
                    summary = summary?.takeIf { it.isNotBlank() },
                    pills = parseMaterialsPills(pillsText),
                    questions = parseMaterialsQuestions(questionsText),
                    files = materialsLessonFiles(files)
                )
            } catch (_: Exception) {
                showMaterialsError()
                return@launch
            }
            if (isFinishing || isDestroyed) return@launch
            renderMaterials(data)
        }
    }

    /** Estado vazio: uma linha discreta (nunca um espaço gigante). */
    private fun showMaterialsEmpty() {
        mat<View>(R.id.materials_section)?.visibility = View.VISIBLE
        mat<View>(R.id.materials_loading)?.visibility = View.GONE
        mat<View>(R.id.materials_empty)?.visibility = View.VISIBLE
        mat<View>(R.id.materials_error)?.visibility = View.GONE
        mat<View>(R.id.materials_content)?.visibility = View.GONE
    }

    /** Estado de erro: texto curto + "Tentar de novo" (sem crash). */
    private fun showMaterialsError() {
        mat<View>(R.id.materials_section)?.visibility = View.VISIBLE
        mat<View>(R.id.materials_loading)?.visibility = View.GONE
        mat<View>(R.id.materials_empty)?.visibility = View.GONE
        mat<View>(R.id.materials_error)?.visibility = View.VISIBLE
        mat<View>(R.id.materials_content)?.visibility = View.GONE
        mat<View>(R.id.materials_retry)?.setOnClickListener { loadMaterials() }
    }

    private fun renderMaterials(data: MaterialsData) {
        if (data.summary == null && data.pills.isEmpty() &&
            data.questions.isEmpty() && data.files.isEmpty()
        ) {
            showMaterialsEmpty()
            return
        }
        mat<View>(R.id.materials_section)?.visibility = View.VISIBLE
        mat<View>(R.id.materials_loading)?.visibility = View.GONE
        mat<View>(R.id.materials_empty)?.visibility = View.GONE
        mat<View>(R.id.materials_error)?.visibility = View.GONE
        mat<View>(R.id.materials_content)?.visibility = View.VISIBLE
        // Resumo (prévia + tocar para abrir completo).
        materialsSummary = data.summary
        val summaryCard = mat<LinearLayout>(R.id.materials_summary_card)
        if (data.summary != null) {
            summaryCard?.visibility = View.VISIBLE
            mat<TextView>(R.id.materials_summary_text)?.text = data.summary
            summaryCard?.setOnClickListener { showFullSummary() }
        } else {
            summaryCard?.visibility = View.GONE
        }
        renderMaterialsPills(data.pills)
        renderMaterialsQuestions(data.questions)
        renderMaterialsFiles(data.files)
    }

    /** Pílulas: o mindmap é Markdown em bullets ("- ..."). */
    private fun parseMaterialsPills(text: String?): List<String> {
        if (text.isNullOrBlank()) return emptyList()
        return text.lines()
            .map { it.trim() }
            .filter { it.isNotEmpty() && !it.startsWith("#") }
            .map { it.removePrefix("- ").removePrefix("* ").removePrefix("• ").trim() }
            .filter { it.isNotEmpty() }
            .take(20)
    }

    /**
     * Questões: JSON array do batalhão ({type, statement, options[],
     * correct, correctText, ...} — worker.js:7760). Se vier texto
     * corrido (pasta de materiais antiga), mostra-o como uma só
     * questão de texto — nunca deita fora conteúdo.
     */
    private fun parseMaterialsQuestions(text: String?): List<MaterialsQuestion> {
        if (text.isNullOrBlank()) return emptyList()
        return try {
            val arr = JSONArray(text)
            val out = ArrayList<MaterialsQuestion>()
            for (i in 0 until minOf(arr.length(), 10)) {
                val o = arr.optJSONObject(i) ?: continue
                val statement = o.optString("statement").takeIf { it.isNotBlank() }
                    ?: o.optString("question").takeIf { it.isNotBlank() }
                    ?: o.optString("q").takeIf { it.isNotBlank() }
                    ?: continue
                val options = ArrayList<String>()
                val opts = o.optJSONArray("options")
                if (opts != null) {
                    for (j in 0 until opts.length()) {
                        opts.optString(j).takeIf { it.isNotBlank() }?.let { options.add(it) }
                    }
                }
                val answer = o.optString("correctText").takeIf { it.isNotBlank() }
                    ?: o.optString("answer").takeIf { it.isNotBlank() }
                out.add(MaterialsQuestion(statement, options, answer))
            }
            out
        } catch (_: Exception) {
            listOf(MaterialsQuestion(text.trim(), emptyList(), null))
        }
    }

    /** Ficheiros a mostrar: PDFs, MDs e outros — sem vídeos/áudios
     * (são aulas), sem pastas e sem legendas .vtt/.srt. */
    private fun materialsLessonFiles(files: List<FileItem>): List<FileItem> =
        files.filter { f -> !f.isFolder && !f.isVideo && !f.isAudio && !f.isSubtitle }

    private fun renderMaterialsPills(pills: List<String>) {
        val title = mat<TextView>(R.id.materials_pills_title)
        val list = mat<LinearLayout>(R.id.materials_pills_list)
        if (pills.isEmpty()) {
            title?.visibility = View.GONE
            list?.visibility = View.GONE
            return
        }
        title?.visibility = View.VISIBLE
        list?.visibility = View.VISIBLE
        list?.removeAllViews()
        val pad = (12 * resources.displayMetrics.density).toInt()
        for (pill in pills) {
            list?.addView(TextView(this).apply {
                text = "•  $pill"
                textSize = 14f
                setTextColor(ContextCompat.getColor(this@PlayerActivity, R.color.md_on_surface))
                setPadding(0, pad / 2, 0, pad / 2)
            })
        }
    }

    private fun renderMaterialsQuestions(questions: List<MaterialsQuestion>) {
        val title = mat<TextView>(R.id.materials_questions_title)
        val list = mat<LinearLayout>(R.id.materials_questions_list)
        if (questions.isEmpty()) {
            title?.visibility = View.GONE
            list?.visibility = View.GONE
            return
        }
        title?.visibility = View.VISIBLE
        list?.visibility = View.VISIBLE
        list?.removeAllViews()
        val pad = (12 * resources.displayMetrics.density).toInt()
        val letters = listOf("A", "B", "C", "D", "E", "F")
        for ((idx, q) in questions.withIndex()) {
            list?.addView(TextView(this).apply {
                text = "${idx + 1}. ${q.statement}"
                textSize = 14f
                setTypeface(null, android.graphics.Typeface.BOLD)
                setTextColor(ContextCompat.getColor(this@PlayerActivity, R.color.md_on_surface))
                setPadding(0, pad, 0, pad / 2)
            })
            for ((oi, opt) in q.options.withIndex()) {
                list?.addView(TextView(this).apply {
                    text = "   ${letters.getOrElse(oi) { "•" }}) $opt"
                    textSize = 14f
                    setTextColor(ContextCompat.getColor(this@PlayerActivity, R.color.md_on_surface))
                    setPadding(0, pad / 4, 0, pad / 4)
                })
            }
            if (!q.answer.isNullOrBlank()) {
                list?.addView(TextView(this).apply {
                    text = getString(R.string.materials_answer, q.answer)
                    textSize = 14f
                    setTextColor(ContextCompat.getColor(this@PlayerActivity, R.color.md_primary))
                    setPadding(0, pad / 2, 0, pad / 2)
                })
            }
        }
    }

    private fun renderMaterialsFiles(files: List<FileItem>) {
        val title = mat<TextView>(R.id.materials_files_title)
        val list = mat<LinearLayout>(R.id.materials_files_list)
        if (files.isEmpty()) {
            title?.visibility = View.GONE
            list?.visibility = View.GONE
            return
        }
        title?.visibility = View.VISIBLE
        list?.visibility = View.VISIBLE
        list?.removeAllViews()
        val folderPath = materialsFolderPath() ?: return
        val pad = (12 * resources.displayMetrics.density).toInt()
        for (file in files) {
            val icon = when {
                file.isPdf -> "📄"
                file.isMarkdown -> "📝"
                else -> "📎"
            }
            list?.addView(TextView(this).apply {
                text = "$icon  ${file.name}"
                textSize = 14f
                maxLines = 1
                ellipsize = android.text.TextUtils.TruncateAt.END
                setTextColor(ContextCompat.getColor(this@PlayerActivity, R.color.md_on_surface))
                setPadding(0, pad / 2, 0, pad / 2)
                isClickable = true
                isFocusable = true
                setOnClickListener { openMaterialFile(file, folderPath) }
            })
        }
    }

    /** Resumo completo num diálogo (texto corrido, como na aba Resumo). */
    private fun showFullSummary() {
        val summary = materialsSummary ?: return
        val text = TextView(this).apply {
            text = summary
            textSize = 15f
            setTextIsSelectable(true)
            setTextColor(ContextCompat.getColor(this@PlayerActivity, R.color.md_on_surface))
            setPadding(8, 8, 8, 8)
        }
        val scroll = ScrollView(this).apply { addView(text) }
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 16, 48, 16)
            addView(scroll)
        }
        AlertDialog.Builder(this)
            .setTitle(getString(R.string.materials_summary_full_title))
            .setView(layout)
            .setPositiveButton(R.string.materials_close, null)
            .show()
    }

    /** Abre um ficheiro da pasta: PDF → leitor (ronda 2), .md → leitor
     * de MD, outros → app externa (igual ao openFile do detalhe). */
    private fun openMaterialFile(file: FileItem, folderPath: String) {
        when {
            file.isPdf -> openPdf(file, folderPath)
            file.isMarkdown -> openMd(file, folderPath)
            else -> {
                val url = BiBiGynApp.BASE_URL + (file.link ?: "")
                val intent = Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url))
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                try { startActivity(intent) } catch (_: Exception) {}
            }
        }
    }

    /** v2.7.6: PDF abre no leitor embutido (igual ao detalhe). */
    private fun openPdf(file: FileItem, folderPath: String) {
        val intent = Intent(this, PdfReaderActivity::class.java)
        intent.putExtra(PdfReaderActivity.EXTRA_URL, BiBiGynApp.BASE_URL + (file.link ?: ""))
        intent.putExtra(PdfReaderActivity.EXTRA_NAME, file.name)
        intent.putExtra(PdfReaderActivity.EXTRA_PATH, materialFilePath(folderPath, file.name))
        startActivity(intent)
    }

    /** .md/transcrição abre no leitor de MD embutido (igual ao detalhe). */
    private fun openMd(file: FileItem, folderPath: String) {
        val intent = Intent(this, MdReaderActivity::class.java)
        intent.putExtra(MdReaderActivity.EXTRA_URL, BiBiGynApp.BASE_URL + (file.link ?: ""))
        intent.putExtra(MdReaderActivity.EXTRA_NAME, file.name)
        intent.putExtra(MdReaderActivity.EXTRA_PATH, materialFilePath(folderPath, file.name))
        startActivity(intent)
    }

    /** Path completo ".../Aula/ficheiro" (a pasta pode vir sem "/"). */
    private fun materialFilePath(folderPath: String, fileName: String): String {
        val base = if (folderPath.endsWith("/")) folderPath else "$folderPath/"
        return "$base$fileName"
    }

    companion object {
        const val EXTRA_URL = "playback_url"
        const val EXTRA_TITLE = "playback_title"
        const val EXTRA_FOLDER_PATH = "playback_folder_path"
    }
}
