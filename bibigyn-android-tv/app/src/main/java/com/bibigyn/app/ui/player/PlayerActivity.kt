package com.bibigyn.app.ui.player

import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.pm.ActivityInfo
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.CountDownTimer
import android.os.Handler
import android.os.Looper
import android.view.GestureDetector
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.SeekBar
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.recyclerview.widget.LinearLayoutManager
import coil.load
import com.google.android.material.snackbar.Snackbar
import com.bibigyn.app.BiBiGynApp
import com.bibigyn.app.R
import com.bibigyn.app.data.ApiService
import com.bibigyn.app.data.FileItem
import com.bibigyn.app.data.colorFromString
import com.bibigyn.app.data.monogramFor
import com.bibigyn.app.databinding.ActivityPlayerBinding
import com.bibigyn.app.ui.home.HomeActivity
import com.bibigyn.app.ui.mylist.MyListActivity
import com.bibigyn.app.ui.search.SearchActivity
import com.bibigyn.app.ui.settings.SettingsActivity
import com.bibigyn.app.util.CardGradient
import com.bibigyn.app.util.Format
import com.bibigyn.app.util.PlaylistManager
import com.bibigyn.app.util.DescriptionPregenerator
import com.bibigyn.app.util.SessionManager
import com.bibigyn.app.util.SubtitleFetcher
import com.bibigyn.app.util.TvUtils
import com.bibigyn.app.util.VideoCache
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * v2.1.5 — Player (conceitos player celular + TV player v2, Elton 23:50).
 *
 * DOIS MODOS (mesma Activity, mesmos componentes):
 *  - Retrato (celular): vídeo 16:9 + controles do ExoPlayer + linha de
 *    info (título, curso em rosa, −10s/tempo/+10s/velocidade/CC) +
 *    Anterior/Próxima (só quando há anterior/próxima real na playlist)
 *    + "A seguir" (a playlist) + bottom nav.
 *  - Fullscreen / TV: vídeo em TELA CHEIA imediata na TV (item 6);
 *    barra de controles grande (pause rosa, −10s, +10s, tempo, barra
 *    com bolinha, velocidade, CC, Descanso, sair da tela cheia).
 *    Voltar sai do fullscreen e volta à navegação. Sem PiP na TV.
 *
 * SEM LOGO no vídeo (verificado: o player nunca desenhou logo; v2 do
 * conceito remove o círculo do poodle — nada a remover, nada a pôr).
 *
 * DESCANSO (🌙, v1.3.0 + pill 23:50): overlay preto SÓ sobre a
 * superfície de vídeo (a barra com a pill ativa continua visível e
 * alcançável); o áudio e o progresso CONTINUAM, o player NÃO pausa.
 * Tocar de novo, qualquer interação com os controles ou tocar no
 * overlay restaura o vídeo. Na TV a pill é focável pelo D-pad.
 *
 * LEGENDA (CC, estilo YouTube): botão CC na barra + escolha de idioma
 * quando há legenda. Fontes: sidecar .vtt/.srt na pasta da aula, ou o
 * endpoint do worker GET /api/ai/subtitles (200 VTT / 202 gerando /
 * 404 sem legenda — ver SubtitleFetcher; o endpoint AINDA NÃO existe,
 * o app degrada para "sem legendas"). O toggle Legendas dos Ajustes
 * é o padrão; o CC é o controle por sessão/aula. Sem legenda, o CC
 * mostra "sem legendas" — nunca menu vazio/falso. Sem CC no áudio.
 *
 * ÁUDIO (mp3/podcast): MESMO player — a área de vídeo vira a capa do
 * episódio (thumb/monograma + título + sub); mesmos controles
 * (play/pause, ±10s, velocidade, progresso, continuar de onde parou,
 * Descanso, playlist "A seguir"); sem CC. Card "Continuar de onde
 * parou — Parado em 12:34" quando havia posição salva ao abrir.
 *
 * CORREÇÕES v2.1.5 (bugs verificados no main):
 *  - onMediaItemTransition/playItem buscavam (idx, 0) — agora retomam
 *    a posição salva (exceto vídeo assistido = revisão, do início).
 *  - onMediaItemTransition/playItem zeravam a velocidade — agora
 *    aplicam a velocidade padrão dos Ajustes.
 *  - Qualidade (DefaultTrackSelector) só restringe quando há >1
 *    trilha de vídeo (as aulas são MP4 progressivo de uma só versão).
 *  - Cache de vídeo (VideoCache, 500 MB LRU) com escrita gateada
 *    pelo Wi-Fi quando "Baixar só no Wi-Fi" está ligado.
 */
class PlayerActivity : AppCompatActivity() {

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN) {
            when (event.keyCode) {
                KeyEvent.KEYCODE_DPAD_UP -> {
                    if (sleepMode) {
                        exitSleepMode()
                        return true
                    }
                    if (isFullscreen && !controlsVisible) {
                        showControls()
                        binding.btnPlayPauseBar.requestFocus()
                        return true
                    }
                }
                KeyEvent.KEYCODE_DPAD_DOWN -> {
                    if (isFullscreen && controlsVisible) {
                        binding.playerView.requestFocus()
                        return true
                    }
                }
                KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                    if (sleepMode) {
                        exitSleepMode()
                        return true
                    }
                    if (isFullscreen && !controlsVisible) {
                        showControls()
                        binding.btnPlayPauseBar.requestFocus()
                        return true
                    }
                }
                KeyEvent.KEYCODE_BACK -> {
                    if (playlistVisible) {
                        hidePlaylist()
                        return true
                    }
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

    private var playlistAdapter: PlaylistAdapter? = null
    private var upNextAdapter: PlaylistAdapter? = null
    private var playlistVisible = false
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

    // v2.1.5 — modos e legenda
    private var isFullscreen = false
    private var isTv = false
    private var isAudio = false
    private var seekBarDragging = false
    private var subtitleState: SubtitleState = SubtitleState.UNKNOWN
    private var subtitleFetchJob: Job? = null
    private var subtitleRetryCount = 0
    private var subtitleVttFile: java.io.File? = null
    private var subtitleLanguage: String = "pt-BR"
    private var openedResumeMs: Long = 0L

    // v2.1.5 — pré-geração das descrições das próximas aulas (Elton 00:21).
    private var descriptionPregenerator: DescriptionPregenerator? = null
    private var playerInForeground = false

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

        PlaylistManager.loadPlaylist(this)

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
        updateCcButtons()

        // Controles da barra (fullscreen/TV) e da linha de info (retrato)
        binding.btnPlayPauseBar.setOnClickListener { exitRestIfActive(); togglePlayPause() }
        binding.btnSeekBackBar.setOnClickListener { exitRestIfActive(); seekBy(-10_000L) }
        binding.btnSeekFwdBar.setOnClickListener { exitRestIfActive(); seekBy(10_000L) }
        binding.btnSeekBackInfo.setOnClickListener { exitRestIfActive(); seekBy(-10_000L) }
        binding.btnSeekFwdInfo.setOnClickListener { exitRestIfActive(); seekBy(10_000L) }
        binding.btnSpeedBar.setOnClickListener { exitRestIfActive(); cycleSpeed() }
        binding.btnSpeedInfo.setOnClickListener { exitRestIfActive(); cycleSpeed() }
        binding.btnCcBar.setOnClickListener { exitRestIfActive(); showCcDialog() }
        binding.btnCcInfo.setOnClickListener { exitRestIfActive(); showCcDialog() }
        binding.btnRestBar.setOnClickListener { toggleSleepMode() }
        binding.btnRestInfo.setOnClickListener { toggleSleepMode() }
        binding.btnFullscreen.setOnClickListener { enterFullscreen() }
        binding.btnExitFullscreen.setOnClickListener { exitFullscreen() }
        binding.btnPrev.setOnClickListener { exitRestIfActive(); playPrev() }
        binding.btnNext.setOnClickListener { exitRestIfActive(); playNext() }
        binding.centerPlayPause.setOnClickListener { exitRestIfActive(); togglePlayPause() }
        binding.restartButton.setOnClickListener { exitRestIfActive(); restartVideo() }
        binding.playlistButton.setOnClickListener { exitRestIfActive(); togglePlaylist() }
        binding.sleepTimerButton.setOnClickListener { showSleepTimerDialog() }
        binding.favButton.setOnClickListener { exitRestIfActive(); toggleFavoriteCurrent() }
        updateFavButton()

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

        setupPlaylistSidebar()
        setupUpNext()
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

    // ──────────── modos ────────────

    private fun applyPortraitMode() {
        isFullscreen = false
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        binding.playerView.useController = true
        binding.customBar.visibility = View.GONE
        binding.infoScroll.visibility = View.VISIBLE
        binding.bottomNav.visibility = if (isTv) View.GONE else View.VISIBLE
        binding.audioCover.visibility = if (isAudio) View.VISIBLE else View.GONE
        controlsVisible = true
    }

    private fun enterFullscreen() {
        isFullscreen = true
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        binding.playerView.useController = false
        binding.customBar.visibility = View.VISIBLE
        binding.infoScroll.visibility = View.GONE
        binding.bottomNav.visibility = View.GONE
        binding.audioCover.visibility = if (isAudio) View.VISIBLE else View.GONE
        WindowInsetsControllerCompat(window, window.decorView)
            .hide(WindowInsetsCompat.Type.systemBars())
        showControls()
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
            binding.audioCoverImage.load(thumb) { error(R.drawable.card_gradient_pink) }
        } else {
            binding.audioCoverImage.visibility = View.GONE
            binding.audioCoverMonogram.visibility = View.VISIBLE
            binding.audioCoverMonogram.text = monogramFor(item.name)
            binding.audioCoverBg.background = CardGradient.drawable(resources, colorFromString(item.name))
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
    }

    private fun updateCcButtons() {
        // Sem CC no áudio (não há faixa de vídeo/legenda).
        val visible = !isAudio
        binding.btnCcBar.visibility = if (visible) View.VISIBLE else View.GONE
        binding.btnCcInfo.visibility = if (visible) View.VISIBLE else View.GONE
        updateCcActiveState()
    }

    private fun updateCcActiveState() {
        val active = isSubtitleActive()
        val pink = getColor(R.color.md_primary)
        val muted = getColor(R.color.md_on_surface_variant)
        binding.btnCcBar.setTextColor(if (active) pink else muted)
        binding.btnCcInfo.setTextColor(if (active) pink else muted)
    }

    private fun isSubtitleActive(): Boolean {
        val p = player ?: return false
        return try {
            p.currentTracks.groups.any { group ->
                group.type == C.TRACK_TYPE_TEXT && group.isSelected
            }
        } catch (_: Exception) { false }
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
        val paused = p != null && !p.isPlaying
        binding.centerPlayPause.visibility = if (paused && controlsVisible) View.VISIBLE else View.GONE
        binding.btnPlayPauseBar.text = if (p?.isPlaying == true) "⏸" else "▶"
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
        // v2.1.5: o overlay cobre SÓ a superfície de vídeo (está dentro
        // de player_container, ABAIXO da barra na ordem z) — a barra com
        // a pill Descanso ativa continua visível e alcançável.
        binding.sleepOverlay.visibility = View.VISIBLE
        binding.btnRestBar.text = "🌙 Descanso ●"
        binding.btnRestInfo.text = "🌙 Descanso ●"
        Snackbar.make(binding.root, "🌙 Modo descanso — o áudio continua; toque na tela ou na pill para sair", Snackbar.LENGTH_SHORT).show()
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
            binding.customBar.animate().alpha(1f).setDuration(200).start()
            binding.titleLabel.animate().alpha(1f).setDuration(200).start()
            binding.customBar.visibility = View.VISIBLE
            binding.titleLabel.visibility = View.VISIBLE
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
            binding.customBar.animate().alpha(0f).setDuration(200).start()
            binding.titleLabel.animate().alpha(0f).setDuration(200).start()
        } else {
            binding.playerView.hideController()
        }
        updateCenterPlayPause()
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

    // ──────────── legenda (CC) ────────────

    /**
     * Busca a legenda da aula atual (sidecar na pasta, senão o endpoint
     * do worker). Chamado em 2º plano após o player iniciar — o CC já
     * está pronto quando o aluno toca nele. Sem legenda: CC mostra
     * "sem legendas" (nunca menu vazio).
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
            updateCcActiveState()
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
    private fun showCcDialog() {
        if (isAudio) return
        if (!SessionManager.get(this).subtitlesEnabled) {
            Snackbar.make(binding.root, "Legendas desligadas nos Ajustes", Snackbar.LENGTH_LONG).show()
            return
        }
        when (subtitleState) {
            SubtitleState.NONE -> {
                Snackbar.make(binding.root, "Sem legendas para esta aula", Snackbar.LENGTH_LONG).show()
                return
            }
            SubtitleState.GENERATING -> {
                Snackbar.make(binding.root, "Gerando legenda… tente de novo em instantes", Snackbar.LENGTH_LONG).show()
                return
            }
            SubtitleState.UNKNOWN -> {
                ensureSubtitles()
                Snackbar.make(binding.root, "Buscando legenda…", Snackbar.LENGTH_SHORT).show()
                return
            }
            else -> {}
        }
        val languages = availableSubtitleLanguages()
        val options = mutableListOf<String>()
        options.add("Desativado")
        options.addAll(languages)
        val current = currentSubtitleLanguage()
        AlertDialog.Builder(this)
            .setTitle("Legendas")
            .setSingleChoiceItems(options.toTypedArray(), if (current == null) 0 else options.indexOf(current)) { dialog, which ->
                dialog.dismiss()
                if (which == 0) {
                    disableSubtitlesForSession()
                } else {
                    selectSubtitleLanguage(options[which])
                }
            }
            .show()
    }

    private fun availableSubtitleLanguages(): List<String> {
        val langs = mutableListOf<String>()
        if (subtitleState == SubtitleState.READY) langs.add(subtitleLanguage)
        try {
            val info = trackSelector?.currentMappedTrackInfo ?: return langs
            for (r in 0 until info.rendererCount) {
                if (info.getRendererType(r) != C.TRACK_TYPE_TEXT) continue
                val groups = info.getTrackGroups(r)
                for (g in 0 until groups.length) {
                    val group = groups[g]
                    for (t in 0 until group.length) {
                        val lang = group.getFormat(t).language ?: continue
                        if (!langs.contains(lang)) langs.add(lang)
                    }
                }
            }
        } catch (_: Exception) {}
        return langs
    }

    private fun currentSubtitleLanguage(): String? {
        val p = player ?: return null
        return try {
            p.currentTracks.groups.firstOrNull { group ->
                group.type == C.TRACK_TYPE_TEXT && group.isSelected
            }?.let { group ->
                group.mediaTrackGroup.getFormat(0).language
            }
        } catch (_: Exception) { null }
    }

    private fun selectSubtitleLanguage(language: String) {
        val ts = trackSelector ?: return
        val info = ts.currentMappedTrackInfo ?: return
        for (r in 0 until info.rendererCount) {
            if (info.getRendererType(r) != C.TRACK_TYPE_TEXT) continue
            val groups = info.getTrackGroups(r)
            for (g in 0 until groups.length) {
                val group = groups[g]
                for (t in 0 until group.length) {
                    if (group.getFormat(t).language == language) {
                        ts.setParameters(
                            ts.buildUponParameters()
                                .setRendererDisabled(C.TRACK_TYPE_TEXT, false)
                                .setOverrideForType(TrackSelectionOverride(group, t))
                        )
                        updateCcActiveState()
                        return
                    }
                }
            }
        }
    }

    private fun disableSubtitlesForSession() {
        val ts = trackSelector ?: return
        ts.setParameters(ts.buildUponParameters().setRendererDisabled(C.TRACK_TYPE_TEXT, true))
        updateCcActiveState()
    }

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

    // ──────────── playlist sidebar + "A seguir" ────────────

    private fun displayTitle(item: FileItem?): String {
        if (item == null) return "Reproduzindo"
        val label = item.folderLabel
        return if (!label.isNullOrBlank()) "${item.name}  ·  $label" else item.name
    }

    private fun setupPlaylistSidebar() {
        val items = PlaylistManager.all()
        if (items.isEmpty()) {
            binding.playlistButton.visibility = View.GONE
            return
        }
        playlistAdapter = PlaylistAdapter(items, PlaylistManager.index()) { position ->
            val item = items.getOrNull(position) ?: return@PlaylistAdapter
            PlaylistManager.setIndex(position)
            playItem(item)
            hidePlaylist()
        }
        binding.playlistRecycler.layoutManager = LinearLayoutManager(this)
        binding.playlistRecycler.adapter = playlistAdapter
    }

    private fun setupUpNext() {
        val items = PlaylistManager.all()
        if (items.size <= 1) {
            binding.upNextLabel.visibility = View.GONE
            binding.upNextRecycler.visibility = View.GONE
            return
        }
        upNextAdapter = PlaylistAdapter(items, PlaylistManager.index()) { position ->
            val item = items.getOrNull(position) ?: return@PlaylistAdapter
            PlaylistManager.setIndex(position)
            playItem(item)
        }
        binding.upNextRecycler.layoutManager = LinearLayoutManager(this)
        binding.upNextRecycler.adapter = upNextAdapter
    }

    private fun togglePlaylist() {
        playlistVisible = !playlistVisible
        binding.playlistContainer.visibility = if (playlistVisible) View.VISIBLE else View.GONE
        binding.playlistButton.text = if (playlistVisible) "\u2715" else "\u2630"
        if (playlistVisible) {
            binding.playlistRecycler.post {
                val idx = PlaylistManager.index()
                binding.playlistRecycler.smoothScrollToPosition(idx)
                binding.playlistRecycler.requestFocus()
                val vh = binding.playlistRecycler.findViewHolderForAdapterPosition(idx)
                vh?.itemView?.requestFocus()
            }
        }
    }

    private fun hidePlaylist() {
        playlistVisible = false
        binding.playlistContainer.visibility = View.GONE
        binding.playlistButton.text = "\u2630"
    }

    // ──────────── player lifecycle ────────────

    override fun onStart() {
        super.onStart()
        playerInForeground = true
        initialisePlayer()
        startPregenerator()
    }

    override fun onStop() {
        super.onStop()
        playerInForeground = false
        descriptionPregenerator?.stop()
        releasePlayer()
    }

    /**
     * v2.1.5 — (Re)inicia a pré-geração das descrições das próximas
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

        exo.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED) {
                    markEnded(item)
                    if (!exo.hasNextMediaItem()) {
                        Snackbar.make(binding.root, "Fim da playlist", Snackbar.LENGTH_LONG).show()
                    }
                }
                if (state == Player.STATE_READY) {
                    applyVideoQuality()
                    applySubtitlesEnabled()
                }
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                updateCenterPlayPause()
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
                        updateCcButtons()
                        playlistAdapter?.updateCurrent(newIndex)
                        upNextAdapter?.updateCurrent(newIndex)
                        updateFavButton()
                        // v2.1.5 (fix): retomar a posição salva + aplicar a
                        // velocidade padrão — antes zerava os dois.
                        val watched = isWatched(newItem)
                        val resume = if (watched) 0L else resumeFor(newItem, currentUrl ?: "")
                        if (resume > 0L) exo.seekTo(newIndex, resume)
                        val defSpeed = SessionManager.get(this@PlayerActivity).defaultSpeed
                        speedIndex = speeds.indexOfFirst { it == defSpeed }.coerceAtLeast(1)
                        exo.playbackParameters = PlaybackParameters(speeds[speedIndex])
                        updateSpeedLabels()
                        ensureSubtitles()
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
                        // v2.1.5: salva a thumb junto — alimenta os cards
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
                if (!seekBarDragging && dur > 0) {
                    binding.barSeekBar.progress = (pos * 1000 / dur).toInt()
                }
            }
        }
    }

    /**
     * v2.4.0 — Jump to a specific playlist item by index.
     * v2.1.5 (fix): retoma a posição salva (exceto revisão) e aplica a
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
                return
            }
        }
        releasePlayer()
        currentItem = item
        setTitles(item)
        initialisePlayer()
        startPregenerator()
        playlistAdapter?.updateCurrent(PlaylistManager.index())
        upNextAdapter?.updateCurrent(PlaylistManager.index())
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

    // ★ v1.6.0: Picture-in-Picture — NUNCA na TV (v2.1.5).
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
        super.onDestroy()
        stopSleepTimer()
    }

    companion object {
        const val EXTRA_URL = "playback_url"
        const val EXTRA_TITLE = "playback_title"
        const val EXTRA_FOLDER_PATH = "playback_folder_path"
    }
}
