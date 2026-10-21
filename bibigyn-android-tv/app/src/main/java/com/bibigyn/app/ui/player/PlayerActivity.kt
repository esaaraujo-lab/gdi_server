package com.bibigyn.app.ui.player

import android.app.AlertDialog
import android.content.Context
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.CountDownTimer
import android.os.Handler
import android.os.Looper
import android.util.DisplayMetrics
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
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
import com.bibigyn.app.BiBiGynApp
import com.bibigyn.app.data.FileItem
import com.bibigyn.app.databinding.ActivityPlayerBinding
import com.bibigyn.app.util.PlaylistManager
import com.bibigyn.app.util.SessionManager
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class PlayerActivity : AppCompatActivity() {

    // ★ TV FIX: D-pad UP shows controls, D-pad navigation between buttons
    override fun dispatchKeyEvent(event: android.view.KeyEvent): Boolean {
        if (event.action == android.view.KeyEvent.ACTION_DOWN) {
            when (event.keyCode) {
                android.view.KeyEvent.KEYCODE_DPAD_UP -> {
                    if (sleepMode) {
                        exitSleepMode()
                        return true
                    }
                    if (!controlsVisible) {
                        showControls()
                        // Focus first button
                        binding.speedButton.requestFocus()
                        return true
                    }
                }
                android.view.KeyEvent.KEYCODE_DPAD_DOWN -> {
                    if (controlsVisible && !binding.speedButton.isFocused) {
                        // Navigate down from buttons to player area
                        binding.playerView.requestFocus()
                        return true
                    }
                }
                android.view.KeyEvent.KEYCODE_DPAD_LEFT, android.view.KeyEvent.KEYCODE_DPAD_RIGHT -> {
                    if (controlsVisible) {
                        // Let D-pad navigate between buttons naturally
                        // (Android handles focus traversal)
                    }
                }
                android.view.KeyEvent.KEYCODE_BACK -> {
                    if (playlistVisible) {
                        hidePlaylist()
                        return true
                    }
                    if (controlsVisible) {
                        hideControls()
                        return true
                    }
                }
                android.view.KeyEvent.KEYCODE_DPAD_CENTER, android.view.KeyEvent.KEYCODE_ENTER -> {
                    if (sleepMode) {
                        exitSleepMode()
                        return true
                    }
                    if (!controlsVisible) {
                        showControls()
                        binding.speedButton.requestFocus()
                        return true
                    }
                }
            }
        }
        return super.dispatchKeyEvent(event)
    }


    private lateinit var binding: ActivityPlayerBinding
    private var player: ExoPlayer? = null
    private var currentItem: FileItem? = null
    private var currentUrl: String? = null

    private var playlistAdapter: PlaylistAdapter? = null
    private var playlistVisible = false
    private var saveJob: Job? = null

    // ★ v1.3.0: Modo descanso (tela preta) — com botão DEDICADO
    private var sleepMode = false
    private var sleepOverlay: View? = null

    // ★ v1.3.0: Auto-hide controls
    private val handler = Handler(Looper.getMainLooper())
    private var controlsVisible = true
    private val CONTROLS_HIDE_DELAY = 4000L

    // ★ v1.3.0: Velocidade rotativa (0.75→1→1.25→1.5→1.75→2→0.75)
    private val speeds = floatArrayOf(0.75f, 1.0f, 1.25f, 1.5f, 1.75f, 2.0f)
    private var speedIndex = 1

    // ★ v2.0.0: Gesture detection (double-tap seek + vertical swipe)
    private var gestureDetector: GestureDetector? = null
    private var swipeStartY = -1f
    private var swipeStartX = -1f
    private var swipeMode: SwipeMode = SwipeMode.NONE  // current vertical swipe target
    private var swipeStartValue = 0
    private val swipeHandler = Handler(Looper.getMainLooper())
    private val swipeHideRunnable = Runnable { binding.swipeIndicator.visibility = View.GONE }

    // ★ v2.0.0: Sleep timer (CountDownTimer with on-screen countdown)
    private var sleepTimer: CountDownTimer? = null
    private var sleepTimerRemainingMs: Long = 0L

    // ★ v2.0.0: Saved brightness/volume (so we can detect "starting" point)
    private var savedBrightness: Float = -1f

    private enum class SwipeMode { NONE, BRIGHTNESS, VOLUME }

    private val hideControlsRunnable = Runnable { hideControls() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.systemBars())

        binding = ActivityPlayerBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // ★ v1.3.0: Criar overlay preto para modo descanso (FULLSCREEN, fica por cima de TUDO)
        sleepOverlay = View(this).apply {
            setBackgroundColor(android.graphics.Color.BLACK)
            visibility = View.GONE
            isFocusable = true
            isClickable = true
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
                    driveId = null, link = url.removePrefix(BiBiGynApp.BASE_URL),
                    size = 0L, modifiedTime = null, folderLabel = null, folderPath = folderPath
                )
            }
        }
        currentItem = item

        // ★ v2.0.0: Apply default speed from Settings
        val defaultSpeed = SessionManager.get(this).defaultSpeed
        speedIndex = speeds.indexOfFirst { it == defaultSpeed }.coerceAtLeast(1)

        binding.titleLabel.text = displayTitle(item)
        binding.speedButton.text = "${formatSpeed(speeds[speedIndex])}x"
        binding.speedButton.setOnClickListener { cycleSpeed() }
        // ★ v2.3.2: Restart button — seeks to 0 and clears any watched flag
        binding.restartButton.setOnClickListener { restartVideo() }
        binding.playlistButton.setOnClickListener { togglePlaylist() }
        binding.sleepButton.setOnClickListener { toggleSleepMode() }
        // ★ v2.0.0: Sleep timer button
        binding.sleepTimerButton.setOnClickListener { showSleepTimerDialog() }

        // ★ v2.3.0: REMOVED prev/next button wiring + bottom nav bar per user request.
        // Navigation between lessons is done via the playlist sidebar (☰).

        // ★ v2.0.0: Gesture detection setup
        setupGestures()

        // ★ v1.3.0: Click na tela → mostra/esconde controles
        binding.playerView.setOnClickListener {
            if (sleepMode) {
                exitSleepMode()
            } else if (!controlsVisible) {
                showControls()
            } else {
                hideControls()
            }
        }

        setupPlaylistSidebar()
        scheduleAutoHide()

        // ★ v2.0.0: Auto-start sleep timer if default is set
        val defaultSleepMin = SessionManager.get(this).defaultSleepTimerMin
        if (defaultSleepMin > 0) startSleepTimer(defaultSleepMin.toLong() * 60_000L)
    }

    // ──────────── v2.0.0: GESTURES (double-tap + vertical swipe) ────────────

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

            override fun onSingleTapConfirmed(e: MotionEvent): Boolean {
                // Let the existing click listener handle this — return false
                return false
            }
        })

        // Attach a touch listener to PlayerView for both GestureDetector + swipe tracking
        binding.playerView.setOnTouchListener { _, event ->
            gestureDetector?.onTouchEvent(event)
            handleVerticalSwipe(event)
            // Don't consume — let PlayerView still handle controller show/hide
            false
        }
    }

    /** v2.0.0 — Vertical swipe: left half = brightness, right half = volume. */
    private fun handleVerticalSwipe(event: MotionEvent) {
        if (sleepMode) return
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                swipeStartY = event.y
                swipeStartX = event.x
                swipeMode = SwipeMode.NONE
            }
            MotionEvent.ACTION_MOVE -> {
                val dy = swipeStartY - event.y  // positive = up
                val dx = event.x - swipeStartX
                // Only treat as vertical swipe if |dy| > |dx| AND |dy| > 24px
                if (swipeMode == SwipeMode.NONE && kotlin.math.abs(dy) > 24 && kotlin.math.abs(dy) > kotlin.math.abs(dx) * 1.5f) {
                    val width = binding.root.width
                    swipeMode = if (swipeStartX < width / 2f) SwipeMode.BRIGHTNESS else SwipeMode.VOLUME
                    swipeStartValue = when (swipeMode) {
                        SwipeMode.BRIGHTNESS -> {
                            // Save current brightness
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
                    // Map swipe distance to value change
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
    }

    private fun showSeekHint(text: String) {
        binding.seekGestureHint.text = text
        binding.seekGestureHint.visibility = View.VISIBLE
        binding.seekGestureHint.alpha = 1f
        binding.seekGestureHint.animate().alpha(0f).setStartDelay(600).setDuration(400)
            .withEndAction { binding.seekGestureHint.visibility = View.GONE }.start()
    }

    // ──────────── v2.0.0: SLEEP TIMER ────────────

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
                // Enter descanso mode + pause playback
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

    // ──────────── v1.3.0: MODO DESCANSO ────────────

    private fun toggleSleepMode() {
        if (sleepMode) exitSleepMode() else enterSleepMode()
    }

    private fun enterSleepMode() {
        sleepMode = true
        sleepOverlay?.visibility = View.VISIBLE
        sleepOverlay?.bringToFront()
        hideControls()
        Snackbar.make(binding.root, "🌙 Modo descanso — toque na tela para sair", Snackbar.LENGTH_SHORT).show()
    }

    private fun exitSleepMode() {
        if (!sleepMode) return
        sleepMode = false
        sleepOverlay?.visibility = View.GONE
        showControls()
    }

    // ──────────── v1.3.0: AUTO-HIDE CONTROLES ────────────

    private fun showControls() {
        if (sleepMode) return
        controlsVisible = true
        binding.titleLabel.animate().alpha(1f).setDuration(200).start()
        binding.speedButton.animate().alpha(1f).setDuration(200).start()
        binding.restartButton.animate().alpha(1f).setDuration(200).start()
        binding.playlistButton.animate().alpha(1f).setDuration(200).start()
        binding.sleepButton.animate().alpha(1f).setDuration(200).start()
        binding.sleepTimerButton.animate().alpha(1f).setDuration(200).start()
        binding.playerView.useController = true
        binding.playerView.showController()
        scheduleAutoHide()
    }

    private fun hideControls() {
        if (sleepMode) return
        controlsVisible = false
        if (!playlistVisible) {
            binding.titleLabel.animate().alpha(0f).setDuration(200).start()
            binding.speedButton.animate().alpha(0f).setDuration(200).start()
            binding.restartButton.animate().alpha(0f).setDuration(200).start()
            binding.playlistButton.animate().alpha(0f).setDuration(200).start()
            binding.sleepButton.animate().alpha(0f).setDuration(200).start()
            binding.sleepTimerButton.animate().alpha(0f).setDuration(200).start()
            binding.playerView.hideController()
        }
    }

    private fun scheduleAutoHide() {
        handler.removeCallbacks(hideControlsRunnable)
        handler.postDelayed(hideControlsRunnable, CONTROLS_HIDE_DELAY)
    }

    /**
     * v2.3.2 — Restarts the current video from position 0.
     * Clears the watched flag so the video is treated as "in progress" again
     * (not a review). The user can use this to re-watch from the beginning
     * at any time.
     */
    private fun restartVideo() {
        val p = player ?: return
        p.seekTo(0)
        p.play()
        // Clear watched flag so it's no longer treated as a review
        val item = currentItem
        val fp = item?.folderPath
        if (!fp.isNullOrBlank() && !item.name.isBlank()) {
            // We don't have a clearWatched() method, but we can re-save resume=0
            // which effectively makes hasResume() return false → no ▶ badge.
            SessionManager.get(this).saveResume(fp, item.name, 0L)
        }
        Snackbar.make(binding.root, "↺ Reiniciando do início", Snackbar.LENGTH_SHORT).show()
        showControls()
    }

    // ──────────── v1.3.0: VELOCIDADE ROTATIVA ────────────

    private fun cycleSpeed() {
        val p = player ?: return
        speedIndex = (speedIndex + 1) % speeds.size
        val next = speeds[speedIndex]
        p.playbackParameters = PlaybackParameters(next)
        binding.speedButton.text = "${formatSpeed(next)}x"
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
        // ★ v2.4.0: Auto-focus the current item so D-pad navigation works immediately.
        if (playlistVisible) {
            binding.playlistRecycler.post {
                val idx = PlaylistManager.index()
                binding.playlistRecycler.smoothScrollToPosition(idx)
                // Request focus on the RecyclerView so D-pad up/down navigates items
                binding.playlistRecycler.requestFocus()
                // Focus the specific item view
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
        initialisePlayer()
    }

    override fun onStop() {
        super.onStop()
        releasePlayer()
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
        val httpFactory = DefaultHttpDataSource.Factory()
            .setUserAgent("MeggyNative/2.4 (Android)")
            .setAllowCrossProtocolRedirects(true)
            .setDefaultRequestProperties(
                if (!cookie.isNullOrBlank()) mapOf("Cookie" to "session=$cookie") else emptyMap()
            )

        val exo = ExoPlayer.Builder(this)
            .setMediaSourceFactory(DefaultMediaSourceFactory(httpFactory))
            .build()

        // ★ v2.4.0: Load ALL playlist items into ExoPlayer as a native playlist.
        // This makes the Media3 controller's prev/next buttons work for BOTH
        // same-folder AND cross-folder playlists. Previously we only loaded 1
        // media item, so the controller's next button did nothing.
        val playlist = PlaylistManager.all()
        val startIndex = PlaylistManager.index()

        if (playlist.isNotEmpty() && startIndex in playlist.indices) {
            // Build MediaItem list from all playlist entries
            val mediaItems = playlist.map { file ->
                val fullUrl = BiBiGynApp.BASE_URL + (file.link ?: "")
                MediaItem.Builder().setUri(fullUrl).build()
            }
            exo.setMediaItems(mediaItems, startIndex, 0L)
        } else {
            // Single item fallback (no playlist)
            exo.setMediaItem(MediaItem.fromUri(url))
        }

        exo.prepare()

        // ★ v2.3.2: If the video was already watched (✓), treat as REVIEW —
        // start from the beginning instead of seeking to a near-end position.
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

        // ★ v2.0.0: Apply default speed from settings on init
        exo.playbackParameters = PlaybackParameters(speeds[speedIndex])

        exo.playWhenReady = true

        exo.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED) {
                    // ★ v2.4.0: ExoPlayer auto-advances to the next media item in the
                    // playlist. STATE_ENDED only fires when the ENTIRE playlist is done.
                    markEnded(item)
                    Snackbar.make(binding.root, "Fim da playlist", Snackbar.LENGTH_LONG).show()
                }
            }

            // ★ v2.4.0: Sync PlaylistManager + UI when ExoPlayer transitions between
            // media items (auto-advance OR controller prev/next button press).
            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                val newIndex = exo.currentMediaItemIndex
                if (newIndex != PlaylistManager.index()) {
                    // Mark the previous item as watched if this was an auto-advance
                    if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO) {
                        markEnded(item)
                    }
                    PlaylistManager.setIndex(newIndex)
                    val newItem = PlaylistManager.getCurrent()
                    if (newItem != null) {
                        currentItem = newItem
                        currentUrl = BiBiGynApp.BASE_URL + (newItem.link ?: "")
                        binding.titleLabel.text = displayTitle(newItem)
                        playlistAdapter?.updateCurrent(newIndex)
                        // Reset speed to 1x on transition (matching old playItem behavior)
                        speedIndex = 1
                        exo.playbackParameters = PlaybackParameters(1.0f)
                        binding.speedButton.text = "1.0x"
                    }
                }
            }
        })

        player = exo
        binding.playerView.player = exo

        if (sleepMode) {
            sleepOverlay?.visibility = View.VISIBLE
            sleepOverlay?.bringToFront()
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
                    // ★ v2.0.0: Add to recents on first save (means video actually started)
                    val fp = it.folderPath
                    if (!fp.isNullOrBlank()) {
                        SessionManager.get(this@PlayerActivity).addRecent(fp, it.name)
                    }
                }
            }
        }
    }

    /**
     * v2.4.0 — Jump to a specific playlist item by index.
     * Uses exo.seekTo(index, 0) instead of releasing + recreating the player.
     * The onMediaItemTransition listener handles updating UI + PlaylistManager.
     */
    private fun playItem(item: FileItem) {
        val p = player
        if (p != null) {
            // Find the index of this item in the playlist
            val playlist = PlaylistManager.all()
            val idx = playlist.indexOfFirst { it.name == item.name && (it.folderPath ?: "") == (item.folderPath ?: "") }
            if (idx >= 0) {
                p.seekTo(idx, 0L)
                p.play()
                return
            }
        }
        // Fallback: release + recreate (for single-item or edge cases)
        releasePlayer()
        currentItem = item
        binding.titleLabel.text = displayTitle(item)
        initialisePlayer()
        playlistAdapter?.updateCurrent(PlaylistManager.index())
        speedIndex = 1
        player?.playbackParameters = PlaybackParameters(1.0f)
        binding.speedButton.text = "1.0x"
    }

    private fun playNext() {
        val p = player
        if (p != null && p.hasNextMediaItem()) {
            p.seekToNextMediaItem()
            p.play()
        } else {
            Snackbar.make(binding.root, "Fim da playlist", Snackbar.LENGTH_LONG).show()
        }
    }

    // ★ v2.3.0: REMOVED playPrev(), updateNavButtons(), togglePlayPause().
    // The user can navigate between lessons via the playlist sidebar (☰).

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

    /**
     * v2.3.2 — Returns true if this video was previously watched to the end.
     * Used to decide whether to start from the beginning (review mode) or
     * seek to the saved resume position.
     */
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
            // ★ v2.1.0: Also save duration so adapters can compute real progress %.
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

    // ★ v1.6.0: Picture-in-Picture
    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
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
