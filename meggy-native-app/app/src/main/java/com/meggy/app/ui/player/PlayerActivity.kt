package com.meggy.app.ui.player

import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.CountDownTimer
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.view.GestureDetector
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.TextView
import android.widget.ImageView
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
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
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import coil.load
import com.google.android.material.snackbar.Snackbar
import com.meggy.app.MeggyApp
import com.meggy.app.R
import com.meggy.app.data.AiService
import com.meggy.app.data.ApiService
import com.meggy.app.data.FileItem
import com.meggy.app.databinding.ActivityPlayerBinding
import com.meggy.app.ui.detail.DetailActivity
import com.meggy.app.ui.home.HomeActivity
import com.meggy.app.ui.reader.MdReaderActivity
import com.meggy.app.ui.reader.PdfReaderActivity
import com.meggy.app.ui.search.SearchActivity
import com.meggy.app.ui.settings.SettingsActivity
import com.meggy.app.util.Format
import com.meggy.app.util.PlaylistManager
import com.meggy.app.util.DescriptionPregenerator
import com.meggy.app.util.FocusAnimator
import com.meggy.app.util.SessionManager
import com.meggy.app.util.LessonDescription
import com.meggy.app.util.MaterialDiscovery
import com.meggy.app.util.MarkdownRenderer
import com.meggy.app.util.MaterialSaver
import com.meggy.app.util.ProgressSync
import com.meggy.app.util.LibraryCovers
import com.meggy.app.util.SubtitleFetcher
import com.meggy.app.util.ThumbArt
import com.meggy.app.util.TvUtils
import com.meggy.app.util.VideoCache
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray

/**
 * v2.7.10 — Player (conceitos player celular + TV player v2, Elton 23:50)
 * v2.7.10 — barra cinematografica (Elton 11:48): disco escuro modesto,
 * state layer nos chips, scrim 72% na base, emoji ⏸ -> ❚❚ (texto branco).
 * + simplificação do player (Elton 10:31, patch 2.7.7).
 * v2.7.9 — controles da barra: feedback visual (seletores +
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
 * FULLSCREEN NO CELULAR (v2.7.7 — o que faltava): o botão ⛶ existia
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
 * PLAYLIST EMBUTIDA REMOVIDA (v2.7.7): a gaveta lateral (☰) e a seção
 * "A seguir" saíram do player — a playlist vive na PÁGINA
 * (DetailActivity, que monta a playlist via PlaylistManager). O que
 * CONTINUA: o avanço de aula (Anterior/Próxima + autoplay no fim +
 * onMediaItemTransition com resume/velocidade) e o PlaylistManager.
 * PlaylistAdapter.kt + item_playlist.xml foram apagados (só o player
 * os usava).
 *
 * VELOCIDADE (v2.7.7): NÃO existe velocidade no topo do vídeo (só
 * voltar/título lá). A velocidade vive SÓ nas barras de controles
 * (pill pequena 1.0× na barra fullscreen/TV e na linha do retrato),
 * e a "Velocidade padrão" dos Ajustes (sm.defaultSpeed) continua
 * valendo na abertura e ao avançar de aula.
 *
 * ±10s (v2.7.7): botões REMOVIDOS do rodapé (barra fullscreen/TV e
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
 * LEGENDA: sem botão CC na barra (removido v2.7.9, Elton 11:16)
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
                    // v2.7.9 — DOWN do vídeo ENTRA na barra (antes pedia
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
                    //
                    // R21 — EXCEPÇÃO: com o foco num CONTROLO da barra
                    // (chip/botão que não a SeekBar, nem o vídeo, nem o
                    // disco central), ◀ ▶ NAVEGAM entre controlos (a
                    // tecla cai no super, como o ENTER já fazia nesse
                    // caso). A interceção total prendia o usuário
                    // ao único chip focado: da barra não havia
                    // navegação horizontal (Descanso → Velocidade →
                    // Sair inalcançável). O scrub continua a ganhar
                    // com o foco no vídeo, na SeekBar, no disco ou em
                    // lado nenhum — o gesto principal da Frente B fica.
                    if (isFullscreen) {
                        val f = currentFocus
                        val focusOnBarControl = controlsVisible && f != null &&
                            f != binding.playerView && f != binding.barSeekBar &&
                            f != binding.centerPlayPause
                        if (!focusOnBarControl) {
                            val back = event.keyCode == KeyEvent.KEYCODE_DPAD_LEFT
                            // Repetições do sistema (repeatCount > 0): o
                            // timer do scrub é quem manda — ignoram-se para
                            // não haver dois seeks por tick.
                            if (event.repeatCount == 0) {
                                startRemoteScrub(if (back) -1 else 1)
                            }
                            return true
                        }
                        // Foco num controlo da barra: cai no super
                        // (navegação horizontal entre controlos).
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

    /**
     * Ronda 13 Frente C — base de playback: ver DetailActivity.
     * fileBaseUrl — os links sao cunhados pelo worker que listou a
     * pasta. A pasta e por ID ("by-id:<id>") quando o video veio de
     * um drive do admin; nos drives fixos, "/N:/...".
     */
    private fun linkBaseUrl(): String {
        val folder = currentItem?.folderPath
            ?: intent.getStringExtra(EXTRA_FOLDER_PATH) ?: ""
        return if (ApiService.isByIdPath(folder)) ApiService.SANDBOX_BASE_URL
        else MeggyApp.BASE_URL
    }
    // v2.7.11 camada (3) — quando o manifesto chega, re-aplica a
    // capa de áudio do item atual (sem toast, sem travar).
    private val libraryReadyListener: () -> Unit = {
        if (!isFinishing && !isDestroyed) updateAudioCover(currentItem)
    }
    private var currentUrl: String? = null

    private var saveJob: Job? = null
    private var timeJob: Job? = null

    // 2.7.48 — sessão de reprodução p/ o evento de histórico do
    // servidor (POST /userstate/save): os minutos REAIS assistidos
    // alimentam as horas da semana e a sequência do painel de
    // progresso (e as estatísticas do site). O saveJob acumula os
    // segundos a tocar; o evento vai UMA vez por sessão, no fim
    // (releasePlayer/markEnded/troca de aula) — ver flushSessionHistory.
    private var sessionFolder: String? = null
    private var sessionVideo: String? = null
    private var sessionStartMs: Long = 0L
    private var sessionPlayedSeconds: Long = 0L
    private var sessionHistorySent: Boolean = false

    private var sleepMode = false
    private val handler = Handler(Looper.getMainLooper())
    private var controlsVisible = true
    private val CONTROLS_HIDE_DELAY = 4000L
    private val hideControlsRunnable = Runnable { hideControls() }
    // R21: retry da legenda como Runnable NOMEADO (antes era um lambda
    // anónimo postDelayed — não removível, retinha a Activity 30 s e
    // podia disparar ensureSubtitles() depois do release/destroy).
    private val subtitleRetryRunnable = Runnable {
        subtitleState = SubtitleState.UNKNOWN
        ensureSubtitles()
    }

    // 2.7.58 — 0.5× entra na escala (desenho do player §4.4): os
    // índices resolvem-se POR VALOR em todo o lado
    // (speeds.indexOfFirst { it == defaultSpeed }), por isso
    // acrescentar no início não desloca nenhuma preferência.
    private val speeds = floatArrayOf(0.5f, 0.75f, 1.0f, 1.25f, 1.5f, 1.75f, 2.0f)
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
    // a correr e o onStart precisa religar a superfície em vez de
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
        // R19B (P4): extras do vídeo corrente para o intent da
        // notificação de áudio (ver BackgroundAudioService).
        override fun currentPlaybackUrl(): String? = currentUrl
        override fun currentPlaybackFolderPath(): String? =
            currentItem?.folderPath ?: intent.getStringExtra(EXTRA_FOLDER_PATH)
    }
    // Frente H — o enriquecimento da playlist (1× por sessão).
    private var playlistEnriched = false

    // Frente R4 — Materiais da aula no retrato (ver bloco no fim da classe).
    private var materialsJob: Job? = null

    // R22 — UMA re-verificação diferida dos materiais por aula
    // (chave = folderPath já tentado): cobre a geração que termina
    // com a tela aberta (o load inicial leu um pacote parcial).
    private var materialsRetryJob: Job? = null
    private var materialsRetriedFor: String? = null
    private var materialsSummary: String? = null

    // R22 — arquivos da pasta da aula atual (para o botão "Gerar"
    // reutilizar o fluxo de geração sem relistar a pasta) + estado
    // da geração manual (botão "Gerar" das abas vazias) e a pasta
    // para a qual foi disparada (mudar de aula cancela-a).
    private var materialsFiles: List<FileItem> = emptyList()
    private var generateMaterialsJob: Job? = null
    private var materialsGenerating = false
    private var materialsGeneratingFor: String? = null

    // Frente R14B — geração ao PLAY, 1x por aula por sessão: chaves
    // (videoPath) já enfileiradas. Em memória, nunca persistido.
    private val generationEnqueuedForSession = mutableSetOf<String>()

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
        // Frente H — o overlay "Carregando" já nasce visível no XML;
        // esconde-se no 1º STATE_READY (ver o listener em
        // initialisePlayer) — o aluno vê o player carregando em vez
        // de uma tela preta sem feedback.
        binding.playerLoading.visibility = View.VISIBLE

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
                    driveId = null, link = ApiService.linkFromPlaybackUrl(url) ?: "",
                    size = 0L, modifiedTime = null, folderLabel = null, folderPath = folderPath
                )
            }
        }
        currentItem = item
        isAudio = item?.isAudio == true
        // R21: folderPath capturado em val local (o !! dependia do
        // guarda isNullOrBlank na mesma expressão — frágil a refactors).
        val itemFolderPath = item?.folderPath
        openedResumeMs = if (item != null && !itemFolderPath.isNullOrBlank()) {
            SessionManager.get(this).getResume(itemFolderPath, item.name)
        } else 0L

        val defaultSpeed = SessionManager.get(this).defaultSpeed
        speedIndex = speeds.indexOfFirst { it == defaultSpeed }.coerceAtLeast(1)

        setTitles(item)
        updateSpeedLabels()
        updateAudioCover(item)
        LibraryCovers.addOnReadyListener(libraryReadyListener)
        updatePrevNextButtons()

        // Controles da barra (fullscreen/TV) e da linha de info (retrato).
        // v2.7.7: sem botões −10s/+10s (o pulo continua por double-tap e
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

        // 2.7.58 — linha de acções da info (desenho do player §4.4
        // + destinos §10.2.3 + adenda 19:34): Baixar (o MESMO
        // botão/escritor dos Downloads), Assistido, Meggy com a
        // aula, cartão de erro e "A seguir". As vistas vivem na
        // info_scroll (gone em fullscreen/TV) e lêem-se por mat<> —
        // sem tocar no motor.
        mat<TextView>(R.id.btn_download_info)?.setOnClickListener {
            exitRestIfActive(); onDownloadClicked()
        }
        mat<TextView>(R.id.btn_watched_info)?.setOnClickListener {
            exitRestIfActive(); onWatchedClicked()
        }
        mat<TextView>(R.id.btn_meggy_info)?.setOnClickListener {
            exitRestIfActive()
            HomeActivity.openMeggyChat(
                this,
                lessonPath = currentItem?.folderPath
                    ?: intent.getStringExtra(EXTRA_FOLDER_PATH),
                lessonName = currentItem?.let { displayTitle(it) },
                videoName = currentItem?.name
            )
        }
        mat<TextView>(R.id.upnext_header)?.setOnClickListener {
            val list = mat<RecyclerView>(R.id.upnext_list) ?: return@setOnClickListener
            list.visibility = if (list.visibility == View.VISIBLE) View.GONE else View.VISIBLE
        }
        mat<View>(R.id.btn_error_retry)?.setOnClickListener {
            mat<View>(R.id.player_error_card)?.visibility = View.GONE
            val exo = player ?: return@setOnClickListener
            val it2 = currentItem
            val resume = if (it2 != null) resumeFor(it2, currentUrl ?: "") else 0L
            if (resume > 0L) exo.seekTo(resume)
            exo.prepare()
            exo.play()
        }
        mat<View>(R.id.btn_error_open)?.let { openBtn ->
            // "Abrir o vídeo" só no celular (na TV o erro tem só
            // Tentar de novo — desenho §6).
            if (isTv) openBtn.visibility = View.GONE
            openBtn.setOnClickListener {
                val u = currentUrl ?: return@setOnClickListener
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(u)))
                } catch (_: Exception) {
                }
            }
        }
        mat<View>(R.id.btn_upnext_play)?.setOnClickListener {
            hideUpNextCard()
            playNext()
        }
        mat<View>(R.id.btn_upnext_close)?.setOnClickListener {
            upNextDismissedKey = currentItemKey()
            hideUpNextCard()
        }
        mat<RecyclerView>(R.id.upnext_list)?.let { rv ->
            rv.layoutManager = LinearLayoutManager(this)
            rv.adapter = UpNextAdapter { item -> playItem(item) }
        }

        // v2.7.9 — feedback visual dos botões da barra (foco D-pad na TV
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

        // v2.7.7 — botão ⛶ do controller NATIVO do ExoPlayer (retrato):
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
                R.id.nav_drives -> { val i = Intent(this, HomeActivity::class.java); i.putExtra(HomeActivity.EXTRA_SCROLL_TO_DRIVES, true); startActivity(i); true }
                R.id.nav_simulados -> { HomeActivity.openSimulados(this); true }
                R.id.nav_meggy -> {
                    // 2.7.58 — destino real: o chat da Meggy com a
                    // aula actual como contexto (extras de aula).
                    HomeActivity.openMeggyChat(
                        this,
                        lessonPath = currentItem?.folderPath
                            ?: intent.getStringExtra(EXTRA_FOLDER_PATH),
                        lessonName = currentItem?.let { displayTitle(it) },
                        videoName = currentItem?.name
                    )
                    true
                }
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
     * v2.7.7 — fullscreen no celular ao GIRAR o aparelho (como no
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
        // 2.7.58 — contentor arredondado em retrato (desenho §4.1:
        // raio 16dp + sombra suave). Risco registado no desenho: o
        // SurfaceView pode não recortar em todos os aparelhos —
        // sem recorte, o vídeo fica como hoje (sem regressão).
        binding.playerContainer.background =
            androidx.core.content.ContextCompat.getDrawable(
                this, R.drawable.player_container_rounded
            )
        binding.playerContainer.clipToOutline = true
        binding.playerView.useController = true
        binding.customBar.visibility = View.GONE
        // v2.7.9 — restaura a barra superior (o hide do fullscreen pode
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
     * v2.7.7 — em fullscreen o container do vídeo preenche a tela.
     * Com o ratio 16:9 fixo no XML, num celular em paisagem (tela mais
     * larga que 16:9 — ex.: 915×412dp) o container ficava com 515dp de
     * altura numa tela de 412dp, e a barra de controles (no rodapé do
     * container) caía para FORA da área visível. Em fullscreen a altura
     * é MATCH_PARENT (o vídeo usa fit e faz letterbox se preciso); em
     * retrato volta o 16:9. Na TV (16:9 exato) dá no mesmo.
     */
    private fun setPlayerContainerFullscreen(fullscreen: Boolean) {
        // 2.7.58 — em fullscreen o contentor perde o arredondado
        // do retrato (fundo limpo, sem recorte).
        if (fullscreen) {
            binding.playerContainer.background = null
            binding.playerContainer.clipToOutline = false
        }
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
        // R22 — regra do site p/ o nome da aula: nome de arquivo
        // genérico ("video.mp4", "001 - aula.mp4") NÃO é o nome da
        // aula — mostra-se o nome da pasta (folderLabel ou o último
        // segmento do folderPath). Nome real: exatamente como
        // estava (nome · pasta).
        val folder = item.folderLabel?.takeIf { it.isNotBlank() }
            ?: LessonDescription.folderNameFromPath(item.folderPath)
        val shown = LessonDescription.displayNameForLesson(item.name, folder) ?: item.name
        if (shown != item.name) return shown
        val label = item.folderLabel
        return if (!label.isNullOrBlank()) "${item.name}  ·  $label" else item.name
    }

    private fun setTitles(item: FileItem?) {
        val title = displayTitle(item)
        binding.titleLabel.text = title
        // R22 — a linha de info também não mostra o nome genérico.
        binding.titleInfo.text = item?.let {
            if (LessonDescription.isGenericLessonFileName(it.name)) title else it.name
        } ?: title
        binding.courseInfo.text = item?.folderLabel ?: ""
        updateCourseProgressLine()
        // 2.7.58 — camada visual do player: breadcrumb, descrição
        // e o estado das acções novas acompanham a aula actual
        // (setTitles é chamado na abertura e em cada transição).
        updateBreadcrumb(item)
        updateDescriptionLine(item)
        refreshDownloadChip()
        refreshWatchedChip()
        refreshUpNextList()
    }

    /**
     * R22 UI (conceito "aula celular") — linha "Aula X de Y · Z% do
     * curso" + barra fina por baixo do vídeo. Dados REAIS: X/Y da
     * playlist atual (PlaylistManager) e Z = % de itens da playlist
     * já marcados assistidos (estado local, o mesmo isWatched do
     * resto da app). Os ids só existem no layout de celular — na TV
     * o mat() retorna null e a função não faz nada.
     */
    private fun updateCourseProgressLine() {
        if (isTv) return
        val text = mat<TextView>(R.id.lesson_progress_text) ?: return
        val bar = mat<ProgressBar>(R.id.lesson_progress_bar)
        val all = PlaylistManager.all()
        if (all.isEmpty()) {
            text.text = ""
            bar?.progress = 0
            return
        }
        val idx = PlaylistManager.index().coerceIn(0, all.size - 1)
        val watched = all.count { isWatched(it) }
        val pct = watched * 100 / all.size
        text.text = getString(R.string.lesson_progress_line, idx + 1, all.size, pct)
        bar?.progress = pct
    }

    private fun updateAudioCover(item: FileItem?) {
        if (item == null) return
        binding.audioCoverTitle.text = displayTitle(item)
        binding.audioCoverSub.text = if ((item.folderLabel ?: "").contains("podcast", true) ||
            item.name.contains("podcast", true) || item.name.contains("cast", true)) "🎙 Podcast" else "Áudio"
        // v2.7.11 onda 2 + camada (3) ESTRITA (2.7.13, sem 'geral') —
        // capa de áudio: thumb do Drive, senão a imagem da biblioteca
        // pelo nome do áudio/aula, senão a capa gerada do drive
        // (nunca monograma).
        val coverRes = ThumbArt.coverResForPath(item.folderPath ?: "")
        val thumb = LibraryCovers.remoteCoverStrict(
            item.thumbnailLink, item.name, item.folderLabel, item.folderPath
        )
        if (!thumb.isNullOrBlank()) {
            binding.audioCoverImage.visibility = View.VISIBLE
            binding.audioCoverMonogram.visibility = View.GONE
            binding.audioCoverImage.load(thumb) {
                error(coverRes)
                listener(onError = { _, _ ->
                    binding.audioCoverImage.setImageResource(coverRes)
                })
            }
        } else {
            binding.audioCoverImage.visibility = View.VISIBLE
            binding.audioCoverMonogram.visibility = View.GONE
            binding.audioCoverImage.setImageResource(coverRes)
        }
        // Card "Continuar de onde parou — Parado em 12:34".
        if (isAudio && openedResumeMs > 0) {
            binding.audioResumeCard.visibility = View.VISIBLE
            binding.audioResumeText.text = "Continuar de onde parou — Parado em ${Format.mmss(openedResumeMs)}"
        } else {
            binding.audioResumeCard.visibility = View.GONE
        }
    }

    private fun updatePrevNextButtons() {
        binding.btnPrev.visibility = if (PlaylistManager.hasPrev()) View.VISIBLE else View.GONE
        binding.btnNext.visibility = if (PlaylistManager.hasNext()) View.VISIBLE else View.GONE
        // R22 UI — a playlist pode ter sido enriquecida em 2º plano:
        // a linha "Aula X de Y · Z%" acompanha o tamanho real.
        updateCourseProgressLine()
    }

    private fun updateSpeedLabels() {
        val label = "${formatSpeed(speeds[speedIndex])}x"
        binding.btnSpeedBar.text = label
        binding.btnSpeedInfo.text = label
    }

    // ──────────── 2.7.58 — camada visual do player ────────────
    // Restyle (desenho MEGGY_PLAYER_UI_DESIGN §4/§6) + destinos
    // (Baixar) + adenda 19:34 (Up Next). NADA aqui muda o motor:
    // ExoPlayer, fontes de dados, gravação de progresso/resume,
    // cache e a lógica da playlist ficam como estavam — são só
    // vistas e as acções novas sobre os caminhos actuais.

    /** Chave (pasta+vídeo) p/ o cartão Up Next fechado não voltar
     *  na mesma aula. */
    private var upNextDismissedKey: String? = null

    private fun currentItemKey(): String? {
        val item = currentItem ?: return null
        return (item.folderPath ?: "") + "|" + item.name
    }

    /** Breadcrumb da aula (retrato; a vista vive na info_scroll,
     *  gone em fullscreen/TV): "Início › … › pasta", cada segmento
     *  abre o DetailActivity nesse caminho. */
    private fun updateBreadcrumb(item: FileItem?) {
        val view = mat<TextView>(R.id.player_breadcrumb) ?: return
        val path = item?.folderPath ?: intent.getStringExtra(EXTRA_FOLDER_PATH) ?: ""
        val parts = path.trim('/').split('/').filter { it.isNotBlank() }
        val drive = parts.firstOrNull { it.matches(Regex("\\d+:")) }
        val segments = parts.filter { it != drive }
        if (segments.isEmpty()) {
            view.visibility = View.GONE
            return
        }
        val sb = android.text.SpannableStringBuilder()
        sb.append(getString(R.string.breadcrumb_home))
        var acc = if (drive != null) "/$drive/" else "/"
        for (seg in segments) {
            acc = if (acc.endsWith("/")) "$acc$seg/" else "$acc/$seg/"
            val target = acc
            sb.append("  ›  ")
            val start = sb.length
            sb.append(seg.take(24))
            sb.setSpan(
                object : android.text.style.ClickableSpan() {
                    override fun onClick(widget: View) {
                        val i = Intent(this@PlayerActivity,
                            com.meggy.app.ui.detail.DetailActivity::class.java)
                        i.putExtra("drivePath", target)
                        i.putExtra("folderName", seg)
                        com.meggy.app.util.AdminDriveUi.forwardAdminDrive(intent, i)
                        startActivity(i)
                    }

                    override fun updateDrawState(ds: android.text.TextPaint) {
                        ds.color = android.graphics.Color.parseColor("#FF8B9F")
                        ds.isUnderlineText = false
                    }
                },
                start, sb.length, android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
            )
        }
        view.text = sb
        view.movementMethod = android.text.method.LinkMovementMethod.getInstance()
        view.visibility = View.VISIBLE
    }

    /** Linha de descrição sob o título: a descrição guardada da
     *  aula (cache; nunca texto inventado) + o tamanho do
     *  ficheiro quando existe. Sem descrição, a linha some. */
    private fun updateDescriptionLine(item: FileItem?) {
        val view = mat<TextView>(R.id.lesson_desc_info) ?: return
        val fp = item?.folderPath ?: intent.getStringExtra(EXTRA_FOLDER_PATH) ?: ""
        val desc = SessionManager.get(this).getLessonDescription(fp)
            ?.trim()?.take(200).orEmpty()
        if (desc.isEmpty()) {
            view.visibility = View.GONE
            return
        }
        val size = item?.takeIf { it.size > 0 }?.humanSize
        view.text = if (!size.isNullOrBlank()) "$desc · $size" else desc
        view.visibility = View.VISIBLE
    }

    /** Estado do chip Baixar: "Baixar" ou "Baixado ✓" (registo
     *  dos Downloads + ficheiro presente). */
    private fun refreshDownloadChip() {
        val chip = mat<TextView>(R.id.btn_download_info) ?: return
        val item = currentItem ?: return
        val fp = item.folderPath ?: intent.getStringExtra(EXTRA_FOLDER_PATH) ?: ""
        val entry = com.meggy.app.util.DownloadRegistry.find(this, fp, item.name)
        val done = entry != null && java.io.File(entry.filePath()).exists()
        chip.text = getString(
            if (done) R.string.download_done else R.string.player_download
        )
    }

    /** Baixar a aula actual: DownloadManager p/ Download/Meggy/
     *  (o MESMO escritor da tela Downloads), com a porta Wi-Fi. */
    private fun onDownloadClicked() {
        val item = currentItem ?: return
        val fp = item.folderPath ?: intent.getStringExtra(EXTRA_FOLDER_PATH) ?: return
        val url = currentUrl ?: return
        if (SessionManager.get(this).wifiOnlyDownloads && !VideoCache.isWifi(this)) {
            Snackbar.make(binding.root, R.string.download_wifi_only, Snackbar.LENGTH_LONG).show()
            return
        }
        when (com.meggy.app.util.VideoDownloader.enqueue(
            this, url, fp, item.name, displayTitle(item)
        )) {
            is com.meggy.app.util.VideoDownloader.Outcome.Started ->
                Snackbar.make(binding.root, R.string.download_started, Snackbar.LENGTH_SHORT).show()
            is com.meggy.app.util.VideoDownloader.Outcome.AlreadyDownloaded ->
                Snackbar.make(binding.root, R.string.download_done, Snackbar.LENGTH_SHORT).show()
            is com.meggy.app.util.VideoDownloader.Outcome.Failed ->
                Snackbar.make(binding.root, R.string.download_failed, Snackbar.LENGTH_LONG).show()
        }
        refreshDownloadChip()
    }

    private fun refreshWatchedChip() {
        val chip = mat<TextView>(R.id.btn_watched_info) ?: return
        val watched = currentItem?.let { isWatched(it) } ?: false
        chip.text = getString(
            if (watched) R.string.player_watched else R.string.player_mark_watched
        )
    }

    /** Assistido: marca pelo caminho actual (SessionManager +
     *  servidor via ProgressSync). Desmarcar NÃO existe no motor
     *  (o servidor funde "assistido" por união) — tocar outra vez
     *  só informa; ver a tabela de divergências da 2.7.58. */
    private fun onWatchedClicked() {
        val item = currentItem ?: return
        if (isWatched(item)) {
            Snackbar.make(binding.root, R.string.player_already_watched, Snackbar.LENGTH_SHORT).show()
            return
        }
        val fp = item.folderPath ?: intent.getStringExtra(EXTRA_FOLDER_PATH) ?: ""
        SessionManager.get(this).markWatched(fp, item.name)
        Snackbar.make(binding.root, R.string.player_marked_watched, Snackbar.LENGTH_SHORT).show()
        refreshWatchedChip()
        updateCourseProgressLine()
    }

    /** "A seguir" (retrato): cabeçalho com a contagem + lista
     *  recolhível da playlist ACTUAL; o toque salta pelo playItem
     *  de sempre. */
    private fun refreshUpNextList() {
        val header = mat<TextView>(R.id.upnext_header) ?: return
        val all = PlaylistManager.all()
        val idx = PlaylistManager.index()
        if (all.size <= 1 || idx !in all.indices) {
            header.visibility = View.GONE
            mat<RecyclerView>(R.id.upnext_list)?.visibility = View.GONE
            return
        }
        header.visibility = View.VISIBLE
        header.text = getString(R.string.player_up_next_header, idx + 1, all.size)
        val adapter = mat<RecyclerView>(R.id.upnext_list)?.adapter as? UpNextAdapter
        adapter?.submit(all, idx)
    }

    /** Cartão UP NEXT (adenda 19:34): aparece nos últimos 20 s
     *  quando há próxima aula na playlist; é informativo — com
     *  autoplay o ExoPlayer avança sozinho; o toque salta já pelo
     *  playNext actual. Chamado do ciclo de tempo existente. */
    private fun maybeShowUpNextCard(pos: Long, dur: Long) {
        if (dur <= 0 || pos < dur - 20_000) return
        if (upNextDismissedKey == currentItemKey()) return
        if (!PlaylistManager.hasNext()) return
        showUpNextCard()
    }

    private fun showUpNextCard() {
        val card = mat<View>(R.id.upnext_card) ?: return
        if (card.visibility == View.VISIBLE) return
        // A próxima aula vem da playlist actual (all()/index() —
        // o PlaylistManager não muda nesta ronda).
        val all = PlaylistManager.all()
        val next = all.getOrNull(PlaylistManager.index() + 1) ?: return
        mat<TextView>(R.id.upnext_card_title)?.text = displayTitle(next)
        mat<ImageView>(R.id.upnext_card_thumb)?.let { img ->
            val remote = LibraryCovers.remoteCoverStrict(
                next.thumbnailLink, next.name, next.folderLabel, next.folderPath
            )
            if (!remote.isNullOrBlank()) {
                img.load(remote) {
                    error(ThumbArt.coverResForPath(next.folderPath ?: ""))
                }
            } else {
                img.setImageResource(ThumbArt.coverResForPath(next.folderPath ?: ""))
            }
        }
        card.visibility = View.VISIBLE
    }

    private fun hideUpNextCard() {
        mat<View>(R.id.upnext_card)?.visibility = View.GONE
    }

    /** Cartão de erro (desenho §4.7): substitui o Snackbar antigo
     *  do onPlayerError — mesma acção de retry, agora em botão. */
    private fun showPlayerErrorCard() {
        mat<View>(R.id.player_error_card)?.visibility = View.VISIBLE
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
        // focado; ao esconder (a reproduzir) retorna o foco ao
        // video, para o D-pad nao ficar sem foco (o OK no video
        // pausa/reproduz, ver dispatchKeyEvent).
        if (paused && controlsVisible) {
            binding.centerPlayPause.visibility = View.VISIBLE
        } else {
            if (binding.centerPlayPause.hasFocus()) binding.playerView.requestFocus()
            binding.centerPlayPause.visibility = View.GONE
        }
        // v2.7.10 — "❚❚" e glifo de TEXTO (branco, sobre o disco escuro);
        // o emoji "⏸" renderizava como quadrado LARANJA na TV (foto 11:48).
        // Ronda 8 Frente B: o botao da barra so existe no layout
        // do celular (nullable no binding na TV) — o glifo dele
        // continua a atualizar-se la; na TV nao ha botao nenhum
        // para atualizar.
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
            // v2.7.9 — cancela o GONE pendente do hide: a barra não pode
            // sumir depois de mostrada de novo.
            handler.removeCallbacks(hideBarRunnable)
            binding.customBar.visibility = View.VISIBLE
            binding.topBar.visibility = View.VISIBLE
            binding.customBar.animate().alpha(1f).setDuration(200).start()
            binding.topBar.animate().alpha(1f).setDuration(200).start()
            // v2.7.9 — TV: o foco tem que entrar na barra (antes nenhum
            // botão recebia foco e o D-pad não alcançava os controles).
            // Ronda 8 Frente B: sem botao play/pausa na barra da
            // TV, o foco entra no disco central quando esta
            // visivel (pausado) — o OK nele pausa/reproduz; a
            // reproduzir o foco fica no video (o OK ai tambem
            // pausa/reproduz, ver dispatchKeyEvent). O
            // updateCenterPlayPause() no fim desta funcao
            // atualiza a visibilidade do disco; chama-se ja
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
            // v2.7.9 — a barra invisível (alpha 0) continuava interceptando
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

    // v2.7.9 — esconde a barra do fullscreen depois do fade-out, só se
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

    // ──────────── legenda (sem botão CC desde v2.7.9) ────────────

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
            val files = withContext(kotlinx.coroutines.Dispatchers.IO) { api.listFolder(folderPath).filesOrNull }
            val base = item.name.substringBeforeLast(".")
            val sidecar = files?.firstOrNull { f ->
                f.isSubtitle && f.name.startsWith(base, ignoreCase = true)
            }
            val result = SubtitleFetcher.fetch(
                this@PlayerActivity, folderPath, item.name,
                sidecar?.link?.let { linkBaseUrl() + it }, sidecar?.name
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
                        handler.removeCallbacks(subtitleRetryRunnable)
                        handler.postDelayed(subtitleRetryRunnable, 30_000L)
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

    // ──────────── playlist — v2.7.7: a UI embutida (gaveta + "A seguir")
    // foi REMOVIDA do player. A playlist vive na PÁGINA
    // (DetailActivity, via PlaylistManager.setPlaylist); o avanço de
    // aula (Anterior/Próxima, autoplay, onMediaItemTransition) continua
    // igual. Não há mais setup de RecyclerView aqui — PlaylistAdapter
    // e item_playlist.xml foram apagados.

    // ──────────── player lifecycle ────────────

    override fun onStart() {
        super.onStart()
        playerInForeground = true
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
        // não carrega (a seção não existe no layout-television).
        loadMaterials()
    }

    override fun onStop() {
        super.onStop()
        playerInForeground = false
        // Frente B (Ronda 3) — o timer do scrub não sobrevive à saída.
        cancelRemoteScrub()
        descriptionPregenerator?.stop()
        // Frente R4C — a tela apagou com a aula A TOCAR: NÃO libertar
        // o player (o releasePlayer() é o que matava o áudio). O
        // serviço já corre desde o início da reprodução (ver
        // initialisePlayer) e mantém o processo em 1º plano; o wake
        // lock de áudio do ExoPlayer (WAKE_MODE_LOCAL) mantém o CPU
        // acordado. Se a aula estava pausada, ou se o usuário
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
        // v2.7.11 onda 2 — disparo automático da aula ATUAL ao abrir
        // o player (o pregenerator só cobre as PRÓXIMAS 3; o detalhe
        // só dispara quando a aula é aberta por lá). Quem chega aqui
        // sem passar pelo detalhe (ex. "Continuar assistindo" na
        // home) também gera o resumo da aula que está tocando.
        // Fire-and-forget, sem poll e sem UI: triggerOnly dispara o
        // batalhão e a aba Resumo lê do cache na próxima abertura.
        // Falha silenciosa (sem toast, sem travar o player); backend
        // sem IA nem tenta (AiService.backendUnavailable). As guardas
        // do batalhão (job concluído/rodando) evitam POST duplo com
        // o disparo do DetailActivity.
        val currentFolder = currentItem?.folderPath
            ?: intent.getStringExtra(EXTRA_FOLDER_PATH)
        if (!currentFolder.isNullOrBlank()) {
            lifecycleScope.launch {
                try {
                    val sm = SessionManager.get(this@PlayerActivity)
                    if (sm.getLessonDescription(currentFolder) != null) return@launch
                    if (AiService.backendUnavailable) return@launch
                    val api = ApiService(this@PlayerActivity)
                    val files = withContext(kotlinx.coroutines.Dispatchers.IO) {
                        api.listFolder(currentFolder).filesOrNull
                    } ?: return@launch
                    if (!LessonDescription.isLessonFolder(files)) return@launch
                    val folderName = currentFolder.trimEnd('/').substringAfterLast('/')
                    when (val outcome = LessonDescription.triggerOnly(
                        this@PlayerActivity, currentFolder, folderName, files
                    )) {
                        is LessonDescription.Outcome.Ready -> {
                            // Frente K — o gerado ja existia: garante
                            // resumo + pilulas + questoes na pasta de
                            // materiais (o mesmo caminho do detalhe).
                            val lessonFile = LessonDescription.lessonFilePath(currentFolder, files)
                            if (lessonFile != null) {
                                runCatching {
                                    MaterialSaver.saveGenerated(
                                        this@PlayerActivity, lessonFile, folderName,
                                        outcome.bundle.summary, outcome.bundle.mindmap,
                                        outcome.bundle.questionsJson
                                    )
                                }
                            }
                            // R22 — o pacote chegou com a tela aberta:
                            // refresca a seção de materiais (antes só
                            // actualizava ao reabrir a aula). Na TV é
                            // no-op (loadMaterials retorna logo).
                            loadMaterials()
                        }
                        else -> Unit
                    }
                } catch (_: Exception) {
                    // Silencioso por desenho (ver comentário acima).
                }
            }
        }
    }

    /**
     * Frente R14B — geração automática ao PLAY (Elton 2026-11-15
     * 21:48): dispara 1x por aula por sessão, em 2º plano, sem
     * bloquear o vídeo e sem nenhuma UI em caso de falha. O POST
     * vai para AiService.enqueueGeneration (a rota é da Frente
     * R14C — sem ela, falha silenciosa). O gatilho é o
     * onIsPlayingChanged(true): a reprodução arrancou de fato
     * (não o "okay" nem a abertura da aula). O avanço automático
     * para a aula seguinte também passa por aqui: o Media3 volta
     * a disparar onIsPlayingChanged(true) quando a aula seguinte
     * fica pronta. A guarda por sessão (videoPath) impede o
     * re-disparo ao pausar e retomar; a idempotência final é do
     * servidor. NÃO substitui o triggerOnly do batalhão em
     * startPregenerator — os dois coexistem até a R14C ligar a
     * fila nova.
     */
    private fun maybeEnqueueGenerationOnPlay() {
        val item = currentItem ?: return
        if (item.name.isBlank()) return
        val lessonPath = (item.folderPath
            ?: intent.getStringExtra(EXTRA_FOLDER_PATH))
            ?.takeIf { it.isNotBlank() } ?: return
        val videoPath = LessonDescription.lessonFilePath(lessonPath, listOf(item)) ?: return
        if (!generationEnqueuedForSession.add(videoPath)) return
        lifecycleScope.launch {
            try {
                AiService.enqueueGeneration(
                    this@PlayerActivity,
                    lessonPath,
                    videoPath,
                    LessonDescription.parentPath(lessonPath)
                )
            } catch (_: Exception) {
                // Silencioso por desenho (ver KDoc acima).
            }
        }
    }

    /**
     * Frente H — enriquecimento da playlist EM 2º PLANO, depois da
     * navegação. Quando o vídeo tocado era o único da pasta, o
     * Detail/Browse/Home já navegou com uma playlist de 1 item; a
     * montagem interfolder (CrossFolderPlaylist: 1 listFolder ao pai +
     * 1 por cada pasta-irmã, em lotes de 6) corria ANTES da navegação
     * e deixava o toque sem resposta durante segundos. Agora corre
     * aqui, com o player já visível a mostrar "Carregando", e os
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
                runCatching { com.meggy.app.util.CrossFolderPlaylist.build(folder, item, api) }.getOrNull()
            } ?: return@launch
            if (result.items.size <= 1) return@launch
            val p = player ?: return@launch
            if (p.mediaItemCount != 1 || isFinishing || isDestroyed) return@launch
            val current = PlaylistManager.getCurrent()
            val target = result.items[result.startIndex]
            if (current?.name != target.name) return@launch
            if ((current.folderPath ?: "") != (target.folderPath ?: "")) return@launch
            fun toMedia(f: FileItem) =
                MediaItem.Builder().setUri(linkBaseUrl() + (f.link ?: "")).build()
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
        // 2.7.58 — ficheiro local (Downloads): o extra manda e a
        // fonte de dados é a de ficheiros (por esquema), nunca o
        // upstream HTTP/cache de rede.
        val localFile = intent.getStringExtra(EXTRA_LOCAL_FILE)
        val url = if (!localFile.isNullOrBlank()) localFile
            else if (!link.isNullOrEmpty()) linkBaseUrl() + link
            else intent.getStringExtra(EXTRA_URL)
        if (url.isNullOrBlank()) {
            // R19B (P4): URL em branco NÃO fecha o Player em
            // silêncio — o finish() aqui devolvia o usuário à
            // Home sem explicar nada (o mesmo sintoma do bounce).
            // Mostra o erro e fica no Player; sair é pelo BACK.
            binding.playerLoading.visibility = View.GONE
            Snackbar.make(binding.root, "Não foi possível abrir este vídeo (URL em falta). Volte e tente de novo.", Snackbar.LENGTH_LONG).show()
            return
        }
        currentUrl = url

        val cookie = SessionManager.get(this).sessionCookie
        val requestProperties = if (!cookie.isNullOrBlank()) mapOf("Cookie" to "session=$cookie") else emptyMap()
        val sm = SessionManager.get(this)
        val writeToCache = !sm.wifiOnlyDownloads || VideoCache.isWifi(this)
        val dataSourceFactory = if (!localFile.isNullOrBlank()) {
            // Ficheiro local: DefaultDataSource (file:// → ficheiro).
            DefaultDataSource.Factory(this)
        } else {
            VideoCache.dataSourceFactory(
                this, MeggyApp.okHttpClient, writeToCache, requestProperties
            )
        }

        // R21: selector em val local (o !! logo após a atribuição ao
        // campo era seguro mas frágil; o Builder recebe o val).
        val selector = DefaultTrackSelector(this)
        trackSelector = selector
        val exo = ExoPlayer.Builder(this)
            .setTrackSelector(selector)
            .setMediaSourceFactory(DefaultMediaSourceFactory(dataSourceFactory))
            .build()

        val playlist = PlaylistManager.all()
        val startIndex = PlaylistManager.index()
        if (localFile.isNullOrBlank() && playlist.isNotEmpty() && startIndex in playlist.indices) {
            val mediaItems = playlist.map { file ->
                val fullUrl = linkBaseUrl() + (file.link ?: "")
                MediaItem.Builder().setUri(fullUrl).build()
            }
            exo.setMediaItems(mediaItems, startIndex, 0L)
        } else {
            exo.setMediaItem(MediaItem.fromUri(url))
        }
        exo.prepare()

        val isReview = isWatched(item)
        // 2.7.58 — "Assistir do Início" verdadeiro: o extra força
        // a posição 0 (o resume guardado não é apagado — só não é
        // aplicado neste lançamento).
        val fromStart = intent.getBooleanExtra(EXTRA_FROM_START, false)
        val saved = if (isReview || fromStart) 0L else resumeFor(item, url)
        if (saved > 0L && !isReview) {
            // Ficheiro local = item único (índice 0); na playlist
            // remota o índice é o da playlist, como sempre.
            val seekIndex = if (localFile.isNullOrBlank()) startIndex else 0
            exo.seekTo(seekIndex, saved)
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
                    // R21: marcar o item ATUAL (currentItem) — o `item`
                    // capturado na abertura era sempre a 1ª aula da
                    // playlist; ver a nota na transição AUTO abaixo.
                    markEnded(currentItem)
                    if (!exo.hasNextMediaItem()) {
                        Snackbar.make(binding.root, "Fim da playlist", Snackbar.LENGTH_LONG).show()
                    } else {
                        // 2.7.58 — cartão Up Next no fim do vídeo
                        // (há próxima aula: o cartão anuncia-a).
                        showUpNextCard()
                    }
                }
                if (state == Player.STATE_READY) {
                    // Frente H — 1º frame pronto: esconde o "Carregando".
                    binding.playerLoading.visibility = View.GONE
                    // 2.7.58 — recuperou: o cartão de erro sai.
                    mat<View>(R.id.player_error_card)?.visibility = View.GONE
                    applyVideoQuality()
                    applySubtitlesEnabled()
                }
            }

            override fun onPlayerError(error: PlaybackException) {
                // Frente H — erro de playback: não deixar o "Carregando" preso.
                binding.playerLoading.visibility = View.GONE
                // 2.7.58 — cartão de erro (desenho §4.7) em vez do
                // Snackbar: título + "Tentar de novo" (a mesma
                // lógica de retry de antes, ligada no onCreate) +
                // "Abrir o vídeo" no celular.
                showPlayerErrorCard()
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                updateCenterPlayPause()
                // Frente R4C — play/pausa (da UI ou da notificação):
                // a notificação passa a mostrar o estado certo.
                BackgroundAudioService.refresh(this@PlayerActivity)
                // Frente R14B — geração automática ao PLAY (Elton
                // 2026-11-15 21:48): o primeiro play da sessão para
                // esta aula enfileira a geração em 2º plano.
                if (isPlaying) maybeEnqueueGenerationOnPlay()
            }

            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                val newIndex = exo.currentMediaItemIndex
                if (newIndex != PlaylistManager.index()) {
                    if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO) {
                        // R21: quem TERMINOU é o item que o
                        // PlaylistManager ainda tem como atual (o
                        // currentItem da activity também só muda
                        // abaixo). O código antigo marcava o `item`
                        // capturado em initialisePlayer() — para sempre
                        // a 1ª aula: a partir da 2ª aula da playlist,
                        // a primeira era marcada vezes sem conta e as
                        // seguintes NUNCA ficavam "assistidas".
                        markEnded(PlaylistManager.getCurrent())
                    }
                    PlaylistManager.setIndex(newIndex)
                    val newItem = PlaylistManager.getCurrent()
                    if (newItem != null) {
                        currentItem = newItem
                        // 2.7.58 — a aula mudou: o cartão Up Next e
                        // o "fechado" da aula anterior saem.
                        hideUpNextCard()
                        upNextDismissedKey = null
                        currentUrl = linkBaseUrl() + (newItem.link ?: "")
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
                    // 2.7.48 — acumula os segundos reais a tocar p/ o
                    // evento de histórico do servidor (minutos da sessão).
                    trackSessionPlaying(it)
                    val fp = it.folderPath
                    if (!fp.isNullOrBlank()) {
                        // v2.7.6: salva a thumb junto — alimenta os cards
                        // "Continue assistindo" com foto real.
                        SessionManager.get(this@PlayerActivity).addRecent(fp, it.name, it.thumbnailLink)
                        // 2.7.53 — assistido aos >50% (paridade com o
                        // desktop, que marca aos >50% ou no fim): ao
                        // cruzar metade da duração A TOCAR, marca a
                        // aula como assistida — local + servidor, pelo
                        // caminho de hoje (SessionManager.markWatched
                        // -> ProgressSync.noteWatched -> POST
                        // /userstate/save {watched:{path:true}}).
                        // Uma vez por aula: o isWatched é a guarda —
                        // depois de marcado, nem os ticks seguintes nem
                        // sessões futuras repetem este POST (a marca
                        // do fim, no markEnded, mantém-se como hoje).
                        // Sem duração conhecida (dur <= 0) não há
                        // metade — fica só a marca do fim.
                        val dur = p.duration
                        if (dur > 0L && p.currentPosition * 2L >= dur &&
                            !SessionManager.get(this@PlayerActivity).isWatched(fp, it.name)
                        ) {
                            SessionManager.get(this@PlayerActivity).markWatched(fp, it.name)
                        }
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
                // 2.7.58 — cartão Up Next nos últimos 20 s (só UI;
                // o ciclo de tempo é o existente).
                maybeShowUpNextCard(pos, dur)
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
                val resume = if (watched) 0L else resumeFor(item, linkBaseUrl() + (item.link ?: ""))
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
        handler.removeCallbacks(subtitleRetryRunnable)
        val p = player ?: return
        try {
            val it = currentItem
            val url = currentUrl
            if (it != null && url != null) {
                saveResumeFor(it, url, p.currentPosition)
                // 2.7.48 — posição final p/ o servidor (ignora o
                // throttle de 10 s) + evento de histórico da sessão.
                val fp = it.folderPath?.takeIf { s -> s.isNotBlank() }
                    ?: intent.getStringExtra(EXTRA_FOLDER_PATH)?.takeIf { s -> s.isNotBlank() }
                if (!fp.isNullOrBlank() && it.name.isNotBlank()) {
                    ProgressSync.flushResume(this, fp, it.name, p.currentPosition)
                }
            }
            flushSessionHistory()
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
     * tem (o ciclo de salvar a posição continuou a correr com a
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
        // isso não se reinicia: o ciclo de 2s continuou a salvar a
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
     * Frente R4C — ação ⏹ da notificação: pausa, salva a posição
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
        // Ronda 15 Frente B (B1, defesa): se o item da playlist não
        // trouxer folderPath (caminho antigo ou futuro), o intent do
        // player traz sempre EXTRA_FOLDER_PATH (launchPlayer) — usá-lo
        // antes de cair na loja legada por URL. Não substitui o carimbo
        // na montagem da playlist: markEnded/isWatched usam
        // item.folderPath directamente.
        val fp = item.folderPath?.takeIf { it.isNotBlank() }
            ?: intent.getStringExtra(EXTRA_FOLDER_PATH)?.takeIf { it.isNotBlank() }
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
        // 2.7.48 — a aula acabou: os minutos da sessão são finais e
        // o evento de histórico vai já (o releasePlayer que vier a
        // seguir já não o reenvia — ver sessionHistorySent).
        flushSessionHistory()
    }

    /**
     * 2.7.48 — acumula 2 s de reprodução real p/ a sessão actual.
     * A sessão é (pasta, vídeo): ao trocar de aula (avanço automático
     * da playlist), a sessão anterior fecha primeiro (o evento vai
     * com os minutos dela) e começa uma nova. Só conta a tocar
     * (STATE_READY + isPlaying) — pausa/buffer não contam.
     */
    private fun trackSessionPlaying(item: FileItem) {
        val fp = item.folderPath?.takeIf { it.isNotBlank() }
            ?: intent.getStringExtra(EXTRA_FOLDER_PATH)?.takeIf { it.isNotBlank() }
        if (fp.isNullOrBlank() || item.name.isBlank()) return
        if (sessionFolder != fp || sessionVideo != item.name) {
            flushSessionHistory()
            sessionFolder = fp
            sessionVideo = item.name
            sessionStartMs = System.currentTimeMillis()
            sessionPlayedSeconds = 0L
            sessionHistorySent = false
        }
        sessionPlayedSeconds += 2L
    }

    /**
     * 2.7.48 — envia o evento de histórico da sessão actual (UMA vez):
     * {path, name, at=início da sessão, minutes=minutos assistidos}.
     * Depois de enviado, a sessão limpa-se — reabrir a mesma aula
     * começa uma sessão nova. Sem sessão (ou já enviada), não faz nada.
     * Best-effort (ProgressSync): falhou, fica só local.
     */
    private fun flushSessionHistory() {
        val fp = sessionFolder
        val video = sessionVideo
        if (sessionHistorySent || sessionStartMs <= 0L || fp.isNullOrBlank() || video.isNullOrBlank()) {
            sessionFolder = null
            sessionVideo = null
            sessionStartMs = 0L
            sessionPlayedSeconds = 0L
            sessionHistorySent = false
            return
        }
        sessionHistorySent = true
        val minutes = (sessionPlayedSeconds / 60L).toInt()
        val startMs = sessionStartMs
        sessionFolder = null
        sessionVideo = null
        sessionStartMs = 0L
        sessionPlayedSeconds = 0L
        ProgressSync.noteHistorySession(this, fp, video, startMs, minutes)
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
        LibraryCovers.removeOnReadyListener(libraryReadyListener)
        // Frente B (Ronda 3) — sem callbacks pendentes no handler.
        cancelRemoteScrub()
        // Frente R4 — cancela o carregamento dos materiais.
        materialsJob?.cancel()
        // R21 (irmão da ronda 20, no player): o onDestroy NUNCA libertava
        // o player. No caminho de áudio em 2º plano o onStop regressa
        // cedo SEM libertar (por desenho); se a Activity for destruída
        // a seguir, o ExoPlayer, o wake-lock e os jobs ficavam vivos
        // até a morte do processo. releasePlayer() é idempotente
        // (player == null → sai) e também pára o serviço de fundo.
        handler.removeCallbacksAndMessages(null)
        swipeHandler.removeCallbacksAndMessages(null)
        releasePlayer()
        super.onDestroy()
        stopSleepTimer()
        // Frente R4C — retira os controlos e garante que o serviço
        // não fica órfão (a Activity é a dona do player).
        BackgroundAudioService.registerControls(null)
        BackgroundAudioService.stop(this)
    }

    // ──────────── Frente R4 — Materiais da aula (retrato) ────────────
    //
    // Seção "📚 Materiais" por baixo do botão "Próxima aula" (só no
    // layout de retrato — res/layout/activity_player.xml; a TV NÃO tem
    // a seção e NÃO carrega nada: loadMaterials() retorna logo se
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
    //   arquivos da pasta — ApiService.listFolder(folderPath) (a MESMA
    //     chamada que ensureSubtitles() já faz aqui); PDF → leitor da
    //     ronda 2 (PdfReaderActivity), .md → MdReaderActivity, outros →
    //     app externa (o mesmo comportamento do openFile do detalhe).
    // A seção só existe no layout do celular: os ids são lidos por
    // findViewById (nullable) e NUNCA pelo binding — o binding gerado
    // exige os ids em TODAS as variantes do layout e a TV não os tem
    // (crash no inflate da TV); com findViewById a TV simplesmente
    // não os encontra e nada acontece.
    //
    // Estados: carregando (spinner + texto, sem bloquear o vídeo);
    // vazio (uma linha discreta, sem espaço gigante); erro (texto
    // curto + "Tentar de novo" — sem crash, sem bounce para o login:
    // o vídeo está tocando e um bounce matava a reprodução).
    // Recarrega a cada troca de aula (Anterior/Próxima/autoplay).
    // Frente R14A — os materiais podem estar na mesma pasta do vídeo
    // OU numa pasta ao lado (ver MaterialDiscovery): quando a pasta
    // da aula não tem materiais, procuram-se as subpastas, a pasta
    // pai e as pastas-irmãs; na TV nada muda (a seção nem existe).

    /** Uma questão do pacote gerado (formato do batalhão, worker.js:7760).
     * R22 UI: correctIndex/explanation vêm do mesmo JSON (os campos que
     * o DetailActivity já lê) — alimentam o cartão interactivo da aba
     * Questões (responder → certa verde / errada vermelha + explicação). */
    private data class MaterialsQuestion(
        val statement: String,
        val options: List<String>,
        val answer: String?,
        val correctIndex: Int = -1,
        val explanation: String? = null
    )

    private data class MaterialsData(
        val summary: String?,
        val pills: List<String>,
        val questions: List<MaterialsQuestion>,
        // R23 — o servidor marcou o pacote como desatualizado: as
        // questões em falta têm motivo real (lei revogada), a
        // mostrar no vazio da aba em vez do texto genérico.
        val questionsOutdated: Boolean = false,
        val files: List<FileItem>
    )

    /** Atalho findViewById nullable (ver nota no topo da seção). */
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
        // R22 — a aula mudou com uma geração manual em curso: cancela
        // (o resultado pertencia à aula anterior) e repõe os botões.
        materialsFiles = emptyList()
        if (materialsGeneratingFor != null && materialsGeneratingFor != folderPath) {
            generateMaterialsJob?.cancel()
            generateMaterialsJob = null
            materialsGeneratingFor = null
            setMaterialsGenerating(false)
        }
        if (folderPath.isNullOrBlank()) {
            showMaterialsEmpty()
            return
        }
        section.visibility = View.VISIBLE
        mat<View>(R.id.materials_loading)?.visibility = View.VISIBLE
        mat<View>(R.id.materials_empty)?.visibility = View.GONE
        mat<View>(R.id.materials_error)?.visibility = View.GONE
        mat<View>(R.id.materials_content)?.visibility = View.GONE
        // 2.7.41 (P1-2) — o botão da seção vazia é irmão do conteúdo
        // (não está dentro dele): esconde-se aqui e no erro.
        mat<View>(R.id.materials_empty_generate)?.visibility = View.GONE
        materialsJob = lifecycleScope.launch {
            val data = try {
                val api = ApiService(this@PlayerActivity)
                val files = withContext(kotlinx.coroutines.Dispatchers.IO) {
                    api.listFolder(folderPath).filesOrNull
                }
                if (files == null) {
                    showMaterialsError()
                    return@launch
                }
                // Frente R14A — materiais da pasta ao lado (ver
                // MaterialDiscovery): só se procura fora quando a
                // pasta da aula não tem materiais próprios; corre
                // em 2º plano e nunca atrasa o vídeo.
                val extraMaterials = withContext(kotlinx.coroutines.Dispatchers.IO) {
                    runCatching {
                        MaterialDiscovery.discoverExtraMaterials(api, folderPath, files)
                    }.getOrDefault(emptyList())
                }
                val allFiles = (files + extraMaterials)
                    .distinctBy { it.name.lowercase() }
                // R22 — salva os arquivos para o botão "Gerar"
                // (generateMaterials) não ter de relistar a pasta.
                materialsFiles = allFiles
                val materialNames = allFiles.filter { it.isPdf || it.isMarkdown }.map { it.name }
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
                    // R23 — 4.ª fonte, DEPOIS das actuais: o banco
                    // unificado por aula (as questões que só existem
                    // no banco nunca eram lidas). Só questões.
                    ?: LessonDescription.fetchBankQuestions(
                        this@PlayerActivity, folderPath,
                        folderPath.trimEnd('/').substringAfterLast('/'), materialNames,
                        lessonFile?.substringAfterLast('/')
                    )
                MaterialsData(
                    summary = summary?.takeIf { it.isNotBlank() },
                    pills = parseMaterialsPills(pillsText),
                    questions = parseMaterialsQuestions(questionsText),
                    questionsOutdated = bundle?.outdated == true,
                    files = materialsLessonFiles(allFiles)
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
        // 2.7.41 (P1-2) — a seção vazia ganha ação quando a pasta tem
        // arquivos legíveis (PDF/MD); sem eles, fica só o texto.
        mat<View>(R.id.materials_empty_generate)?.visibility =
            if (materialsFiles.any { it.isPdf || it.isMarkdown }) View.VISIBLE else View.GONE
    }

    /** Estado de erro: texto curto + "Tentar de novo" (sem crash). */
    private fun showMaterialsError() {
        mat<View>(R.id.materials_section)?.visibility = View.VISIBLE
        mat<View>(R.id.materials_loading)?.visibility = View.GONE
        mat<View>(R.id.materials_empty)?.visibility = View.GONE
        mat<View>(R.id.materials_error)?.visibility = View.VISIBLE
        mat<View>(R.id.materials_content)?.visibility = View.GONE
        mat<View>(R.id.materials_empty_generate)?.visibility = View.GONE
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
            mat<View>(R.id.materials_summary_empty)?.visibility = View.GONE
            // Ronda 9 Frente A — a prévia também é Markdown: renderiza
            // formatado (o cartão continua com maxLines=4 no layout).
            mat<TextView>(R.id.materials_summary_text)?.let {
                MarkdownRenderer.renderMarkdown(it, data.summary)
            }
            summaryCard?.setOnClickListener { showFullSummary() }
        } else {
            summaryCard?.visibility = View.GONE
            mat<View>(R.id.materials_summary_empty)?.visibility = View.VISIBLE
        }
        // 2.7.41 (P1-1) — o botão "Gerar resumo" só aparece sem resumo:
        // com conteúdo, um toque acidental relançava até 3 min de IA.
        mat<View>(R.id.materials_summary_generate)?.visibility =
            if (data.summary != null) View.GONE else View.VISIBLE
        renderMaterialsPills(data.pills)
        renderMaterialsQuestions(data.questions, data.questionsOutdated)
        val flashcards = deriveMaterialsFlashcards(data)
        renderMaterialsFlashcards(flashcards)
        renderMaterialsFiles(data.files)
        // R22 UI — abas segmentadas (conceito): a aba inicial é a
        // primeira com conteúdo real (Resumo → Pílulas → Questões →
        // Flashcards); os painéis sem conteúdo mostram a linha de
        // vazio honesto dentro da própria aba.
        wireMaterialsTabs()
        // R22 — estados vazios com ação (Elton 2026-11-23 19:54):
        // cada aba vazia ganha o seu botão "Gerar …".
        wireMaterialsGenerateButtons()
        selectMaterialsTab(
            when {
                data.summary != null -> MAT_TAB_RESUMO
                data.pills.isNotEmpty() -> MAT_TAB_PILULAS
                data.questions.isNotEmpty() -> MAT_TAB_QUESTOES
                flashcards.isNotEmpty() -> MAT_TAB_FLASHCARDS
                else -> MAT_TAB_RESUMO
            }
        )
        // R22 — pacote PARCIAL (resumo existe, pílulas/questões
        // ainda não): a geração pode estar a produzir o resto com
        // a tela aberta. UMA re-verificação 45 s depois, por aula,
        // sem loop — o site faz o mesmo com poll limitado na
        // descrição da aula (v2.15.26-B). Se continuar parcial,
        // fica como está até a próxima abertura (onStart recarrega).
        if (data.summary != null && data.pills.isEmpty() && data.questions.isEmpty()) {
            val folder = materialsFolderPath()
            if (folder != null && materialsRetriedFor != folder) {
                materialsRetriedFor = folder
                materialsRetryJob?.cancel()
                materialsRetryJob = lifecycleScope.launch {
                    delay(45_000L)
                    if (isFinishing || isDestroyed) return@launch
                    if (materialsFolderPath() != folder) return@launch
                    loadMaterials()
                }
            }
        }
    }

    /** Pílulas: o mindmap é Markdown em bullets ("- ..."). */
    private fun parseMaterialsPills(text: String?): List<String> {
        if (text.isNullOrBlank()) return emptyList()
        return text.lines()
            .map { it.trim() }
            .filter { it.isNotEmpty() && !it.startsWith("#") }
            .map { it.removePrefix("- ").removePrefix("* ").removePrefix("• ").trim() }
            // R22 — nunca renderizar o literal "null": arquivos
            // .gdi-flashcards gravados por versões antigas podem
            // conter exatamente isso (o mindmap nulo serializado);
            // item "null" é ausência, não é uma pílula.
            .filter { it.isNotEmpty() && !it.equals("null", ignoreCase = true) }
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
                // R22 — optString no Android retorna a string "null"
                // p/ campos com null JSON: um enunciado "null" não é
                // uma questão (ver AiService.optText).
                val statement = o.optString("statement").takeIf { it.isNotBlank() && !it.equals("null", true) }
                    ?: o.optString("question").takeIf { it.isNotBlank() && !it.equals("null", true) }
                    ?: o.optString("q").takeIf { it.isNotBlank() && !it.equals("null", true) }
                    ?: continue
                val options = ArrayList<String>()
                val opts = o.optJSONArray("options")
                if (opts != null) {
                    for (j in 0 until opts.length()) {
                        opts.optString(j).takeIf { it.isNotBlank() && !it.equals("null", true) }?.let { options.add(it) }
                    }
                }
                // R22 UI — índice da certa + explicação (os mesmos
                // campos que o parseDetailQuestions lê no detalhe):
                // sem eles o cartão não consegue avaliar a resposta.
                val correctIndex = o.optInt("correct", -1)
                    .let { if (it in options.indices) it else -1 }
                val answer = o.optString("correctText").takeIf { it.isNotBlank() && !it.equals("null", true) }
                    ?: o.optString("answer").takeIf { it.isNotBlank() && !it.equals("null", true) }
                    ?: if (correctIndex >= 0) options[correctIndex] else null
                val explanation = o.optString("explanation").takeIf { it.isNotBlank() && !it.equals("null", true) }
                    ?: o.optString("fundamentacao").takeIf { it.isNotBlank() && !it.equals("null", true) }
                out.add(MaterialsQuestion(statement, options, answer, correctIndex, explanation))
            }
            out
        } catch (_: Exception) {
            listOf(MaterialsQuestion(text.trim(), emptyList(), null))
        }
    }

    /** Arquivos a mostrar: PDFs, MDs e outros — sem vídeos/áudios
     * (são aulas), sem pastas e sem legendas .vtt/.srt. */
    private fun materialsLessonFiles(files: List<FileItem>): List<FileItem> =
        files.filter { f -> !f.isFolder && !f.isVideo && !f.isAudio && !f.isSubtitle }

    // ──────────── R22 UI — abas dos materiais (conceito) ────────────

    private var materialsTab = MAT_TAB_RESUMO

    /** Liga os cliques das 4 abas (idempotente — chamado a cada render). */
    private fun wireMaterialsTabs() {
        val tabs = listOf(
            R.id.tab_mat_resumo to MAT_TAB_RESUMO,
            R.id.tab_mat_pilulas to MAT_TAB_PILULAS,
            R.id.tab_mat_questoes to MAT_TAB_QUESTOES,
            R.id.tab_mat_flashcards to MAT_TAB_FLASHCARDS
        )
        for ((id, tab) in tabs) {
            mat<TextView>(id)?.setOnClickListener { selectMaterialsTab(tab) }
        }
    }

    /**
     * R22 — estados vazios com ação (Elton 2026-11-23 19:54): cada
     * aba vazia ganha um botão "Gerar …" que liga ao fluxo de
     * geração que JÁ EXISTE — LessonDescription.ensureDescription
     * (o mesmo que o detalhe dispara ao abrir a pasta da aula:
     * batalhão + poll até 3 min) — sem fluxo novo nem duplicação.
     * Flashcards: o botão gera o pacote (resumo + pílulas +
     * questões), porque os flashcards DERIVAM dele (ver
     * deriveMaterialsFlashcards) — não há geração só de flashcards.
     * Idempotente (setOnClickListener substitui), como as abas.
     */
    private fun wireMaterialsGenerateButtons() {
        mat<View>(R.id.materials_summary_generate)?.setOnClickListener { generateMaterials() }
        mat<View>(R.id.materials_pills_generate)?.setOnClickListener { generateMaterials() }
        mat<View>(R.id.materials_questions_generate)?.setOnClickListener { generateMaterials() }
        mat<View>(R.id.materials_flashcards_generate)?.setOnClickListener { generateMaterials() }
        // 2.7.41 (P1-2) — o botão da seção vazia (fora das abas).
        mat<View>(R.id.materials_empty_generate)?.setOnClickListener { generateMaterials() }
    }

    /** Liga/desliga os botões "Gerar" + texto "Gerando…" em curso. */
    private fun setMaterialsGenerating(generating: Boolean) {
        materialsGenerating = generating
        val labels = listOf(
            R.id.materials_summary_generate to R.string.materials_generate_summary,
            R.id.materials_pills_generate to R.string.materials_generate_pills,
            R.id.materials_questions_generate to R.string.materials_generate_questions,
            R.id.materials_flashcards_generate to R.string.materials_generate_flashcards,
            R.id.materials_empty_generate to R.string.materials_generate_summary
        )
        for ((id, label) in labels) {
            mat<TextView>(id)?.let {
                it.isEnabled = !generating
                it.text = getString(if (generating) R.string.materials_generating else label)
            }
        }
    }

    /**
     * Geração manual a partir de uma aba vazia: reutiliza
     * LessonDescription.ensureDescription (mesmo fluxo do detalhe).
     * Ready → grava o pacote na pasta de materiais (Frente K, o
     * mesmo caminho do detalhe) + cache local do resumo e refresca
     * as abas; Generating → uma re-verificação 60 s depois (o
     * batalhão continua no servidor); NoMaterial/Unavailable/
     * Failed → motivo honesto em Snackbar, sem crash e sem loop.
     * A geração demora até 3 min (poll do ensureDescription); o
     * botão fica "Gerando…" e os 4 botões desativados entretanto.
     */
    private fun generateMaterials() {
        if (materialsGenerating) return
        val folderPath = materialsFolderPath() ?: return
        val files = materialsFiles
        if (files.isEmpty()) {
            Snackbar.make(binding.root, R.string.materials_generate_no_material, Snackbar.LENGTH_LONG).show()
            return
        }
        if (!LessonDescription.isLessonFolder(files)) {
            Snackbar.make(binding.root, R.string.materials_generate_not_lesson, Snackbar.LENGTH_LONG).show()
            return
        }
        val folderName = folderPath.trimEnd('/').substringAfterLast('/')
        materialsGeneratingFor = folderPath
        setMaterialsGenerating(true)
        generateMaterialsJob?.cancel()
        generateMaterialsJob = lifecycleScope.launch {
            val outcome = LessonDescription.ensureDescription(
                this@PlayerActivity, folderPath, folderName, files
            )
            if (isFinishing || isDestroyed) return@launch
            when (outcome) {
                is LessonDescription.Outcome.Ready -> {
                    saveGeneratedMaterials(folderPath, files, folderName, outcome.bundle)
                    Snackbar.make(binding.root, R.string.materials_generate_done, Snackbar.LENGTH_SHORT).show()
                    if (materialsFolderPath() == folderPath) loadMaterials()
                }
                is LessonDescription.Outcome.Partial -> {
                    saveGeneratedMaterials(folderPath, files, folderName, outcome.bundle)
                    // R23 — Partial: o resumo chegou mas faltam partes
                    // (o job terminou) — o Snackbar diz o motivo real
                    // em vez de "gerado ✓"; as abas vazias mantêm o
                    // botão Gerar (o refresh abaixo repõe o estado).
                    val msg = when {
                        outcome.jobError != null -> outcome.jobError
                        outcome.questionsOutdated -> getString(R.string.qf_questions_outdated)
                        else -> getString(R.string.materials_generate_partial)
                    }
                    Snackbar.make(binding.root, msg, Snackbar.LENGTH_LONG).show()
                    if (materialsFolderPath() == folderPath) loadMaterials()
                }
                is LessonDescription.Outcome.Generating -> {
                    Snackbar.make(binding.root, R.string.materials_generate_running, Snackbar.LENGTH_LONG).show()
                    materialsRetryJob?.cancel()
                    materialsRetryJob = lifecycleScope.launch {
                        delay(60_000L)
                        if (isFinishing || isDestroyed) return@launch
                        if (materialsFolderPath() != folderPath) return@launch
                        loadMaterials()
                    }
                }
                is LessonDescription.Outcome.NoMaterial -> {
                    val reason = when (outcome.reason) {
                        LessonDescription.NoMaterialReason.SCANNED_PDF -> R.string.summary_state_scanned
                        LessonDescription.NoMaterialReason.NO_FILES -> R.string.summary_state_no_files
                        LessonDescription.NoMaterialReason.NO_TEXT -> R.string.summary_state_no_text
                    }
                    Snackbar.make(binding.root, reason, Snackbar.LENGTH_LONG).show()
                }
                is LessonDescription.Outcome.Unavailable -> {
                    Snackbar.make(binding.root, R.string.materials_generate_unavailable, Snackbar.LENGTH_LONG).show()
                }
                is LessonDescription.Outcome.Failed -> {
                    Snackbar.make(binding.root, R.string.materials_generate_failed, Snackbar.LENGTH_LONG).show()
                }
            }
            setMaterialsGenerating(false)
            materialsGeneratingFor = null
        }
    }

    /**
     * R23 — gravação comum do pacote gerado (resumo + pílulas +
     * questões) na pasta de materiais + cache local do resumo.
     * As branches Ready/Partial são separadas de propósito: numa
     * branch `is Ready, is Partial` junta, o smart-cast vai p/ o
     * supertipo comum (Outcome) e `bundle`/`text` deixam de
     * resolver (ver DetailActivity.applyGeneratedOutcome).
     */
    private suspend fun saveGeneratedMaterials(
        folderPath: String,
        files: List<FileItem>,
        folderName: String,
        bundle: AiService.GeneratedBundle
    ) {
        val lessonFile = LessonDescription.lessonFilePath(folderPath, files)
        if (lessonFile != null) {
            runCatching {
                MaterialSaver.saveGenerated(
                    this@PlayerActivity, lessonFile, folderName,
                    bundle.summary, bundle.mindmap, bundle.questionsJson
                )
            }
        }
        SessionManager.get(this@PlayerActivity)
            .saveLessonDescription(folderPath, bundle.summary.orEmpty())
    }

    /**
     * Mostra um painel e esconde os outros; a aba activa ganha o
     * gradiente da marca (como no conceito), as restantes ficam
     * transparentes sobre o contentor.
     */
    private fun selectMaterialsTab(tab: Int) {
        materialsTab = tab
        val panels = listOf(
            MAT_TAB_RESUMO to R.id.panel_mat_resumo,
            MAT_TAB_PILULAS to R.id.panel_mat_pilulas,
            MAT_TAB_QUESTOES to R.id.panel_mat_questoes,
            MAT_TAB_FLASHCARDS to R.id.panel_mat_flashcards
        )
        for ((t, id) in panels) {
            mat<View>(id)?.visibility = if (t == tab) View.VISIBLE else View.GONE
        }
        val tabIds = listOf(
            MAT_TAB_RESUMO to R.id.tab_mat_resumo,
            MAT_TAB_PILULAS to R.id.tab_mat_pilulas,
            MAT_TAB_QUESTOES to R.id.tab_mat_questoes,
            MAT_TAB_FLASHCARDS to R.id.tab_mat_flashcards
        )
        for ((t, id) in tabIds) {
            val tv = mat<TextView>(id) ?: continue
            if (t == tab) {
                tv.background = ContextCompat.getDrawable(this, R.drawable.gradient_cta_pill)
                tv.setTextColor(ContextCompat.getColor(this, R.color.md_on_primary))
            } else {
                tv.background = null
                tv.setTextColor(ContextCompat.getColor(this, R.color.md_on_surface_variant))
            }
        }
    }

    /** Fundo de cartão dos materiais (superfície do tema, cantos 16dp). */
    private fun materialsCardBackground(): GradientDrawable = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = 16f * resources.displayMetrics.density
        setColor(ContextCompat.getColor(this@PlayerActivity, R.color.md_surface_container))
    }

    /** Pílulas: um mini-cartão por pílula (a aba Pílulas do conceito). */
    private fun renderMaterialsPills(pills: List<String>) {
        val list = mat<LinearLayout>(R.id.materials_pills_list)
        mat<View>(R.id.materials_pills_empty)?.visibility =
            if (pills.isEmpty()) View.VISIBLE else View.GONE
        // 2.7.41 (P1-1) — "Gerar pílulas" só com a lista vazia.
        mat<View>(R.id.materials_pills_generate)?.visibility =
            if (pills.isEmpty()) View.VISIBLE else View.GONE
        list?.removeAllViews()
        if (pills.isEmpty()) return
        val density = resources.displayMetrics.density
        val pad = (14 * density).toInt()
        val gap = (10 * density).toInt()
        for (pill in pills) {
            list?.addView(TextView(this).apply {
                text = "💡  $pill"
                textSize = 14f
                setLineSpacing(0f, 1.35f)
                setTextColor(ContextCompat.getColor(this@PlayerActivity, R.color.md_on_surface))
                setPadding(pad, pad, pad, pad)
                background = GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE
                    cornerRadius = 12f * density
                    setColor(ContextCompat.getColor(this@PlayerActivity, R.color.md_surface_container))
                }
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { topMargin = gap }
            })
        }
    }

    private fun renderMaterialsQuestions(questions: List<MaterialsQuestion>, questionsOutdated: Boolean = false) {
        val list = mat<LinearLayout>(R.id.materials_questions_list)
        mat<View>(R.id.materials_questions_empty)?.visibility =
            if (questions.isEmpty()) View.VISIBLE else View.GONE
        // R23 — vazio com motivo real quando o servidor marcou o
        // pacote como desatualizado (skip de questões por lei
        // revogada, agora VISÍVEL); sem motivo, o texto genérico
        // do layout. O botão "Gerar questões" mantém-se (ver abaixo).
        if (questions.isEmpty()) {
            mat<TextView>(R.id.materials_questions_empty)?.text = getString(
                if (questionsOutdated) R.string.qf_questions_outdated else R.string.no_questions
            )
        }
        // 2.7.41 (P1-1) — "Gerar questões" só com a lista vazia.
        mat<View>(R.id.materials_questions_generate)?.visibility =
            if (questions.isEmpty()) View.VISIBLE else View.GONE
        list?.removeAllViews()
        if (questions.isEmpty()) return
        for ((idx, q) in questions.withIndex()) {
            list?.addView(buildMaterialsQuestionCard(q, idx, questions.size))
        }
    }

    /**
     * R22 UI — cartão de questão interactiva da aba Questões
     * (conceito): chip contador "Questão X de Y", enunciado,
     * alternativas em pílulas empilhadas; tocar avalia — a certa
     * fica verde, a escolha errada vermelha — e a explicação/resposta
     * aparece por baixo. A interactividade é a mesma do detalhe
     * (ronda 9): sem índice correcto no pacote (pacotes antigos), o
     * cartão mostra a resposta direta, como antes das abas.
     */
    private fun buildMaterialsQuestionCard(
        q: MaterialsQuestion, index: Int, total: Int
    ): LinearLayout {
        val density = resources.displayMetrics.density
        val pad = (16 * density).toInt()
        val gap = (10 * density).toInt()
        val onSurface = ContextCompat.getColor(this, R.color.md_on_surface)
        val pink = ContextCompat.getColor(this, R.color.md_primary)
        val greenBg = ContextCompat.getColor(this, R.color.md_success_container)
        val redBg = ContextCompat.getColor(this, R.color.md_error_container)

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
            background = materialsCardBackground()
        }
        card.layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = gap; bottomMargin = gap }

        // Chip contador centrado (conceito).
        val counter = TextView(this).apply {
            text = "❓ " + getString(R.string.question_counter, index + 1, total)
            textSize = 12f
            setTypeface(null, android.graphics.Typeface.BOLD)
            setTextColor(pink)
            background = ContextCompat.getDrawable(this@PlayerActivity, R.drawable.counter_chip)
            val h = (12 * density).toInt()
            val v = (5 * density).toInt()
            setPadding(h, v, h, v)
        }
        card.addView(LinearLayout(this).apply {
            gravity = Gravity.CENTER
            addView(counter)
        })

        card.addView(TextView(this).apply {
            text = q.statement
            textSize = 15f
            setTypeface(null, android.graphics.Typeface.BOLD)
            setTextColor(onSurface)
            setLineSpacing(0f, 1.3f)
            setPadding(0, (12 * density).toInt(), 0, (4 * density).toInt())
        })

        val feedback = TextView(this).apply {
            textSize = 14f
            setTextColor(pink)
            setLineSpacing(0f, 1.35f)
            setPadding(0, (10 * density).toInt(), 0, 0)
            visibility = View.GONE
        }

        val optionViews = ArrayList<TextView>()
        var answered = false
        val letters = listOf("A", "B", "C", "D", "E", "F")
        for ((oi, opt) in q.options.withIndex()) {
            val optView = TextView(this).apply {
                text = "${letters.getOrElse(oi) { "•" }}) $opt"
                textSize = 14f
                setTextColor(onSurface)
                setPadding(pad, (12 * density).toInt(), pad, (12 * density).toInt())
                background = GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE
                    cornerRadius = 20f * density
                    setColor(ContextCompat.getColor(this@PlayerActivity, R.color.md_surface_variant))
                }
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { topMargin = gap }
            }
            if (q.correctIndex >= 0) {
                optView.isClickable = true
                optView.isFocusable = true
                optView.setOnClickListener {
                    if (answered) return@setOnClickListener
                    answered = true
                    for ((oj, ov) in optionViews.withIndex()) {
                        val bg = ov.background as? GradientDrawable ?: continue
                        when {
                            oj == q.correctIndex -> {
                                bg.setColor(greenBg)
                                ov.setTextColor(Color.WHITE)
                            }
                            oj == oi -> {
                                bg.setColor(redBg)
                                ov.setTextColor(Color.WHITE)
                            }
                        }
                    }
                    feedback.text = buildString {
                        if (oi == q.correctIndex) append(getString(R.string.question_correct))
                        if (!q.answer.isNullOrBlank()) {
                            if (isNotEmpty()) append("\n")
                            append(getString(R.string.materials_answer, q.answer))
                        }
                        if (!q.explanation.isNullOrBlank()) {
                            if (isNotEmpty()) append("\n\n💡 ")
                            append(q.explanation)
                        }
                    }
                    if (feedback.text.isNotBlank()) feedback.visibility = View.VISIBLE
                }
            }
            optionViews.add(optView)
            card.addView(optView)
        }
        card.addView(feedback)
        // Sem índice correcto (pacote antigo/texto corrido): a
        // resposta aparece direta em rosa — o comportamento que
        // existia antes das abas, sem interacção inventada.
        if (q.correctIndex < 0 && !q.answer.isNullOrBlank()) {
            feedback.text = getString(R.string.materials_answer, q.answer)
            feedback.visibility = View.VISIBLE
        }
        return card
    }

    /**
     * Flashcards DESTA aula, das mesmas fontes do detalhe (ronda 9):
     * havendo pílulas, cada pílula é um cartão (frente "💡 Pílula N",
     * verso = o fato); sem pílulas, derivam-se das questões (frente
     * = enunciado, verso = resposta + explicação). Nada de outra aula.
     */
    private fun deriveMaterialsFlashcards(data: MaterialsData): List<Pair<String, String>> =
        when {
            data.pills.isNotEmpty() ->
                data.pills.mapIndexed { i, p -> "💡 Pílula ${i + 1}" to p }
            else -> data.questions.mapNotNull { q ->
                val back = buildString {
                    if (!q.answer.isNullOrBlank()) append(q.answer)
                    if (!q.explanation.isNullOrBlank()) {
                        if (isNotEmpty()) append("\n\n💡 ")
                        append(q.explanation)
                    }
                }.takeIf { it.isNotBlank() } ?: return@mapNotNull null
                q.statement to back
            }
        }

    /** Flashcards: tocar vira o cartão (frente ↔ verso), como no detalhe. */
    private fun renderMaterialsFlashcards(cards: List<Pair<String, String>>) {
        val list = mat<LinearLayout>(R.id.materials_flashcards_list)
        mat<View>(R.id.materials_flashcards_empty)?.visibility =
            if (cards.isEmpty()) View.VISIBLE else View.GONE
        // 2.7.41 (P1-1) — "Gerar flashcards" só com a lista vazia.
        mat<View>(R.id.materials_flashcards_generate)?.visibility =
            if (cards.isEmpty()) View.VISIBLE else View.GONE
        list?.removeAllViews()
        if (cards.isEmpty()) return
        val density = resources.displayMetrics.density
        val pad = (16 * density).toInt()
        val gap = (10 * density).toInt()
        val onSurface = ContextCompat.getColor(this, R.color.md_on_surface)
        val muted = ContextCompat.getColor(this, R.color.md_on_surface_variant)
        for ((front, back) in cards) {
            var showingBack = false
            val body = TextView(this).apply {
                text = front
                textSize = 16f
                setTypeface(null, android.graphics.Typeface.BOLD)
                setTextColor(onSurface)
                setLineSpacing(0f, 1.3f)
            }
            val hint = TextView(this).apply {
                text = getString(R.string.qf_card_reveal)
                textSize = 13f
                setTextColor(muted)
                setPadding(0, (8 * density).toInt(), 0, 0)
            }
            val card = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(pad, pad, pad, pad)
                background = materialsCardBackground()
                isClickable = true
                isFocusable = true
                minimumHeight = (120 * density).toInt()
            }
            card.layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = gap; bottomMargin = gap }
            card.setOnClickListener {
                showingBack = !showingBack
                body.text = if (showingBack) back else front
                body.setTypeface(
                    null,
                    if (showingBack) android.graphics.Typeface.NORMAL
                    else android.graphics.Typeface.BOLD
                )
                hint.text = getString(
                    if (showingBack) R.string.qf_card_back else R.string.qf_card_reveal
                )
            }
            card.addView(body)
            card.addView(hint)
            list?.addView(card)
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
                // Frente R14A — o material da pasta ao lado abre pela
                // pasta DELE (carimbada na descoberta); os da pasta da
                // aula continuam pela pasta da aula, como antes.
                setOnClickListener { openMaterialFile(file, file.folderPath ?: folderPath) }
            })
        }
    }

    /** Ronda 9 Frente A — resumo completo num diálogo, Markdown formatado (como na aba Resumo). */
    private fun showFullSummary() {
        val summary = materialsSummary ?: return
        val text = TextView(this).apply {
            textSize = 15f
            setTextIsSelectable(true)
            setTextColor(ContextCompat.getColor(this@PlayerActivity, R.color.md_on_surface))
            setPadding(8, 8, 8, 8)
        }
        // Ronda 9 Frente A — o resumo é Markdown: renderiza formatado
        // (Markwon, mesma config do MdReaderActivity), nunca texto cru.
        MarkdownRenderer.renderMarkdown(text, summary)
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

    /** Abre um arquivo da pasta: PDF → leitor (ronda 2), .md → leitor
     * de MD, outros → app externa (igual ao openFile do detalhe). */
    private fun openMaterialFile(file: FileItem, folderPath: String) {
        when {
            file.isPdf -> openPdf(file, folderPath)
            file.isMarkdown -> openMd(file, folderPath)
            else -> {
                val url = linkBaseUrl() + (file.link ?: "")
                val intent = Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url))
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                try { startActivity(intent) } catch (_: Exception) {}
            }
        }
    }

    /** v2.7.6: PDF abre no leitor embutido (igual ao detalhe). */
    private fun openPdf(file: FileItem, folderPath: String) {
        val intent = Intent(this, PdfReaderActivity::class.java)
        intent.putExtra(PdfReaderActivity.EXTRA_URL, linkBaseUrl() + (file.link ?: ""))
        intent.putExtra(PdfReaderActivity.EXTRA_NAME, file.name)
        intent.putExtra(PdfReaderActivity.EXTRA_PATH, materialFilePath(folderPath, file.name))
        startActivity(intent)
    }

    /** .md/transcrição abre no leitor de MD embutido (igual ao detalhe). */
    private fun openMd(file: FileItem, folderPath: String) {
        val intent = Intent(this, MdReaderActivity::class.java)
        intent.putExtra(MdReaderActivity.EXTRA_URL, linkBaseUrl() + (file.link ?: ""))
        intent.putExtra(MdReaderActivity.EXTRA_NAME, file.name)
        intent.putExtra(MdReaderActivity.EXTRA_PATH, materialFilePath(folderPath, file.name))
        startActivity(intent)
    }

    /** Path completo ".../Aula/arquivo" (a pasta pode vir sem "/"). */
    private fun materialFilePath(folderPath: String, fileName: String): String {
        val base = if (folderPath.endsWith("/")) folderPath else "$folderPath/"
        return "$base$fileName"
    }

    companion object {
        const val EXTRA_URL = "playback_url"
        const val EXTRA_TITLE = "playback_title"
        const val EXTRA_FOLDER_PATH = "playback_folder_path"
        // 2.7.58 — ficheiro local dos Downloads (file://): a fonte
        // de dados escolhe-se pelo esquema (nunca o upstream HTTP).
        const val EXTRA_LOCAL_FILE = "playback_local_file"
        // 2.7.58 — "Assistir do Início" verdadeiro: ignora o resume
        // guardado e começa na posição 0.
        const val EXTRA_FROM_START = "playback_from_start"

        // R22 UI — abas dos materiais (conceito "aula celular").
        const val MAT_TAB_RESUMO = 0
        const val MAT_TAB_PILULAS = 1
        const val MAT_TAB_QUESTOES = 2
        const val MAT_TAB_FLASHCARDS = 3
    }
}
