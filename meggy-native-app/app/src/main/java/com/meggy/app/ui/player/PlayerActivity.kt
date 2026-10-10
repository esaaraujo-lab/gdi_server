package com.meggy.app.ui.player

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.animation.AlphaAnimation
import android.view.animation.Animation
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.android.material.snackbar.Snackbar
import com.meggy.app.MeggyApp
import com.meggy.app.data.FileItem
import com.meggy.app.databinding.ActivityPlayerBinding
import com.meggy.app.util.PlaylistManager
import com.meggy.app.util.SessionManager
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class PlayerActivity : AppCompatActivity() {

    private lateinit var binding: ActivityPlayerBinding
    private var player: ExoPlayer? = null
    private var currentItem: FileItem? = null
    private var currentUrl: String? = null

    private var playlistAdapter: PlaylistAdapter? = null
    private var playlistVisible = false
    private var saveJob: Job? = null

    // ★ v1.2.1: Modo descanso (tela preta)
    private var sleepMode = false
    private var sleepOverlay: View? = null

    // ★ v1.2.1: Auto-hide controls
    private val handler = Handler(Looper.getMainLooper())
    private var controlsVisible = true
    private val CONTROLS_HIDE_DELAY = 4000L // 4 segundos

    // ★ v1.2.1: Velocidade rotativa (0.75→1→1.25→1.5→1.75→2→0.75)
    private val speeds = floatArrayOf(0.75f, 1.0f, 1.25f, 1.5f, 1.75f, 2.0f)
    private var speedIndex = 1 // começa em 1.0x

    private val hideControlsRunnable = Runnable { hideControls() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.systemBars())

        binding = ActivityPlayerBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // ★ v1.2.1: Criar overlay preto para modo descanso
        sleepOverlay = View(this).apply {
            setBackgroundColor(android.graphics.Color.BLACK)
            visibility = View.GONE
            setOnClickListener { exitSleepMode() }
            layoutParams = android.widget.FrameLayout.LayoutParams(
                android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
                android.widget.FrameLayout.LayoutParams.MATCH_PARENT
            )
        }
        (binding.root as android.widget.FrameLayout).addView(sleepOverlay)

        PlaylistManager.loadPlaylist(this)

        var item = PlaylistManager.getCurrent()
        if (item == null || item.link.isNullOrEmpty()) {
            val url = intent.getStringExtra(EXTRA_URL)
            val title = intent.getStringExtra(EXTRA_TITLE) ?: "Reproduzindo"
            val folderPath = intent.getStringExtra(EXTRA_FOLDER_PATH)
            if (!url.isNullOrBlank()) {
                item = FileItem(
                    name = title, mimeType = "video/mp4", id = "",
                    driveId = null, link = url.removePrefix(MeggyApp.BASE_URL),
                    size = 0L, modifiedTime = null, folderLabel = null, folderPath = folderPath
                )
            }
        }
        currentItem = item

        binding.titleLabel.text = displayTitle(item)
        binding.speedButton.setOnClickListener { cycleSpeed() }
        binding.playlistButton.setOnClickListener { togglePlaylist() }
        binding.prevButton.setOnClickListener { playPrev() }
        binding.nextButton.setOnClickListener { playNext() }

        // ★ v1.2.1: Toggle modo descanso ao clicar na tela (long click)
        binding.playerView.setOnLongClickListener {
            toggleSleepMode()
            true
        }

        // ★ v1.2.1: Click simples na tela → mostra/oculta controles
        binding.playerView.setOnClickListener {
            if (!controlsVisible) {
                showControls()
            } else {
                hideControls()
            }
        }

        setupPlaylistSidebar()
        updateNavButtons()

        // ★ v1.2.1: Auto-hide controles após 4s
        scheduleAutoHide()
    }

    // ──────────── v1.2.1: MODO DESCANSO ────────────

    private fun toggleSleepMode() {
        if (sleepMode) exitSleepMode() else enterSleepMode()
    }

    private fun enterSleepMode() {
        sleepMode = true
        sleepOverlay?.visibility = View.VISIBLE
        hideControls()
        Snackbar.make(binding.root, "🌙 Modo descanso ativo — toque para sair", Snackbar.LENGTH_SHORT).show()
    }

    private fun exitSleepMode() {
        if (!sleepMode) return
        sleepMode = false
        sleepOverlay?.visibility = View.GONE
        showControls()
    }

    // ★ v1.2.1: Modo descanso persiste entre vídeos (não resetar ao trocar)
    // sleepMode não é resetado em playItem() — permanece true se ativado

    // ──────────── v1.2.1: AUTO-HIDE CONTROLES ────────────

    private fun showControls() {
        controlsVisible = true
        binding.titleLabel.animate().alpha(1f).setDuration(200).start()
        binding.speedButton.animate().alpha(1f).setDuration(200).start()
        binding.prevButton.animate().alpha(if (PlaylistManager.hasPrev()) 1f else 0.35f).setDuration(200).start()
        binding.nextButton.animate().alpha(if (PlaylistManager.hasNext()) 1f else 0.35f).setDuration(200).start()
        binding.playlistButton.animate().alpha(1f).setDuration(200).start()
        // Mostrar controles do ExoPlayer
        binding.playerView.useController = true
        binding.playerView.showController()
        scheduleAutoHide()
    }

    private fun hideControls() {
        if (sleepMode) return // no modo descanso, controles ficam escondidos
        controlsVisible = false
        if (!playlistVisible) { // não esconder se playlist aberta
            binding.titleLabel.animate().alpha(0f).setDuration(200).start()
            binding.speedButton.animate().alpha(0f).setDuration(200).start()
            binding.prevButton.animate().alpha(0f).setDuration(200).start()
            binding.nextButton.animate().alpha(0f).setDuration(200).start()
            binding.playlistButton.animate().alpha(0f).setDuration(200).start()
            binding.playerView.hideController()
        }
    }

    private fun scheduleAutoHide() {
        handler.removeCallbacks(hideControlsRunnable)
        handler.postDelayed(hideControlsRunnable, CONTROLS_HIDE_DELAY)
    }

    // ──────────── v1.2.1: VELOCIDADE ROTATIVA ────────────

    private fun cycleSpeed() {
        val p = player ?: return
        // Avançar para próxima velocidade (rotativo: 2x → volta para 0.75x)
        speedIndex = (speedIndex + 1) % speeds.size
        val next = speeds[speedIndex]
        p.playbackParameters = PlaybackParameters(next)
        binding.speedButton.text = "${formatSpeed(next)}x"
        // Mostrar controles ao mudar velocidade
        showControls()
    }

    private fun formatSpeed(s: Float): String {
        return if (s == 1.0f || s == 2.0f) "${s.toInt()}.0"
        else if (s == 1.25f || s == 1.75f) "${s}"
        else "${s}"
    }

    // ──────────── playlist sidebar ────────────

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

    private fun togglePlaylist() {
        playlistVisible = !playlistVisible
        binding.playlistContainer.visibility = if (playlistVisible) View.VISIBLE else View.GONE
        binding.playlistButton.text = if (playlistVisible) "\u2715" else "\u2630"
    }

    private fun hidePlaylist() {
        playlistVisible = false
        binding.playlistContainer.visibility = View.GONE
        binding.playlistButton.text = "\u2630"
    }

    // ──────────── player lifecycle ────────────

    override fun onStart() {
        super.onStart()
        initialisePlayer()
    }

    override fun onStop() {
        super.onStop()
        releasePlayer()
    }

    private fun initialisePlayer() {
        val item = currentItem
        val link = item?.link
        val url = if (!link.isNullOrEmpty()) MeggyApp.BASE_URL + link else intent.getStringExtra(EXTRA_URL)
        if (url.isNullOrBlank()) {
            Snackbar.make(binding.root, "URL de playback ausente.", Snackbar.LENGTH_LONG).show()
            finish()
            return
        }
        currentUrl = url

        val cookie = SessionManager.get(this).sessionCookie
        val httpFactory = DefaultHttpDataSource.Factory()
            .setUserAgent("MeggyNative/1.2.1 (Android)")
            .setAllowCrossProtocolRedirects(true)
            .setDefaultRequestProperties(
                if (!cookie.isNullOrBlank()) mapOf("Cookie" to "session=$cookie") else emptyMap()
            )

        val exo = ExoPlayer.Builder(this)
            .setMediaSourceFactory(DefaultMediaSourceFactory(httpFactory))
            .build()

        exo.setMediaItem(MediaItem.fromUri(url))
        exo.prepare()

        val saved = resumeFor(item, url)
        if (saved > 0L) exo.seekTo(saved)

        exo.playWhenReady = true

        exo.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED) {
                    markEnded(item)
                    binding.root.post { playNext() }
                }
            }
        })

        player = exo
        binding.playerView.player = exo

        // ★ v1.2.1: Se modo descanso estava ativo, manter tela preta
        if (sleepMode) {
            sleepOverlay?.visibility = View.VISIBLE
            hideControls()
        }

        saveJob?.cancel()
        saveJob = lifecycleScope.launch {
            while (true) {
                delay(2_000)
                val p = player ?: break
                val it = currentItem ?: break
                if (p.playbackState == Player.STATE_READY && p.isPlaying) {
                    saveResumeFor(it, currentUrl, p.currentPosition)
                }
            }
        }
    }

    private fun playItem(item: FileItem) {
        releasePlayer()
        currentItem = item
        binding.titleLabel.text = displayTitle(item)
        initialisePlayer()
        playlistAdapter?.updateCurrent(PlaylistManager.index())
        updateNavButtons()
        // ★ v1.2.1: Reset velocidade para 1x ao trocar de vídeo
        speedIndex = 1
        player?.playbackParameters = PlaybackParameters(1.0f)
        binding.speedButton.text = "1.0x"
    }

    private fun playNext() {
        val next = PlaylistManager.getNext()
        if (next == null || next.link.isNullOrEmpty()) {
            Snackbar.make(binding.root, "Fim da playlist", Snackbar.LENGTH_LONG).show()
            updateNavButtons()
            return
        }
        playItem(next)
    }

    private fun playPrev() {
        val prev = PlaylistManager.getPrev()
        if (prev == null || prev.link.isNullOrEmpty()) {
            updateNavButtons()
            return
        }
        playItem(prev)
    }

    private fun updateNavButtons() {
        binding.prevButton.isEnabled = PlaylistManager.hasPrev()
        binding.prevButton.alpha = if (PlaylistManager.hasPrev()) 1f else 0.35f
        binding.nextButton.isEnabled = PlaylistManager.hasNext()
        binding.nextButton.alpha = if (PlaylistManager.hasNext()) 1f else 0.35f
    }

    private fun releasePlayer() {
        saveJob?.cancel()
        saveJob = null
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
    }

    // ──────────── resume helpers ────────────

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

    companion object {
        const val EXTRA_URL = "playback_url"
        const val EXTRA_TITLE = "playback_title"
        const val EXTRA_FOLDER_PATH = "playback_folder_path"
    }
}
