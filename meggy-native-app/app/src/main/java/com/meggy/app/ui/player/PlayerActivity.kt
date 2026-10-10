package com.meggy.app.ui.player

import android.os.Bundle
import android.view.View
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
import com.meggy.app.databinding.ActivityPlayerBinding
import com.meggy.app.util.PlaylistManager
import com.meggy.app.util.SessionManager
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * PlayerActivity — v1.1.0
 *
 * Changes since v1.0.9:
 *  • Auto-plays the next video in the folder when the current one ends
 *    (see [PlaylistManager]).
 *  • Lateral playlist sidebar (toggle with the ☰ button) — mirrors the web
 *    platform UX. Tapping an entry jumps to it.
 *  • Clears the resume position when a video finishes naturally so re-opening
 *    it doesn't immediately skip to the next.
 */
class PlayerActivity : AppCompatActivity() {

    private lateinit var binding: ActivityPlayerBinding
    private var player: ExoPlayer? = null
    private var currentUrl: String? = null
    private var currentTitle: String? = null

    private var playlistAdapter: PlaylistAdapter? = null
    private var playlistVisible = false
    private var saveJob: Job? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.systemBars())

        binding = ActivityPlayerBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Reload the persisted playlist (set by BrowseActivity before launch).
        PlaylistManager.loadPlaylist(this)

        currentUrl = intent.getStringExtra(EXTRA_URL)
        currentTitle = intent.getStringExtra(EXTRA_TITLE)

        // If launched without an explicit URL (e.g. recreated), fall back to the
        // playlist's current entry.
        if (currentUrl.isNullOrBlank()) {
            val item = PlaylistManager.getCurrent()
            if (item != null && !item.link.isNullOrEmpty()) {
                currentUrl = MeggyApp.BASE_URL + item.link
                currentTitle = item.name
            }
        }

        binding.titleLabel.text = currentTitle ?: "Reproduzindo"
        binding.speedButton.setOnClickListener { cycleSpeed() }
        binding.playlistButton.setOnClickListener { togglePlaylist() }

        setupPlaylistSidebar()
    }

    // ──────────── playlist sidebar ────────────

    private fun setupPlaylistSidebar() {
        val items = PlaylistManager.all()
        if (items.isEmpty()) {
            binding.playlistButton.visibility = View.GONE
            return
        }
        playlistAdapter = PlaylistAdapter(items, PlaylistManager.index()) { position ->
            val item = items.getOrNull(position) ?: return@PlaylistAdapter
            PlaylistManager.setIndex(position)
            if (!item.link.isNullOrEmpty()) {
                playVideo(MeggyApp.BASE_URL + item.link, item.name)
            }
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
        val url = currentUrl
        if (url.isNullOrBlank()) {
            Snackbar.make(binding.root, "URL de playback ausente.", Snackbar.LENGTH_LONG).show()
            finish()
            return
        }

        val cookie = SessionManager.get(this).sessionCookie
        val httpFactory = DefaultHttpDataSource.Factory()
            .setUserAgent("MeggyNative/1.1 (Android)")
            .setAllowCrossProtocolRedirects(true)
            .setDefaultRequestProperties(
                if (!cookie.isNullOrBlank()) mapOf("Cookie" to "session=$cookie") else emptyMap()
            )

        val exo = ExoPlayer.Builder(this)
            .setMediaSourceFactory(DefaultMediaSourceFactory(httpFactory))
            .build()

        exo.setMediaItem(MediaItem.fromUri(url))
        exo.prepare()

        val saved = SessionManager.get(this).getResumePosition(url)
        if (saved > 0L) exo.seekTo(saved)

        exo.playWhenReady = true

        // v1.1.0: auto-play next when the current video ends.
        exo.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED) {
                    // Clear the resume position so re-opening this file doesn't
                    // immediately skip to the next one.
                    currentUrl?.let { SessionManager.get(this@PlayerActivity).clearResumePosition(it) }
                    // Post to avoid releasing the player from inside its own callback.
                    binding.root.post { playNext() }
                }
            }
        })

        player = exo
        binding.playerView.player = exo

        // Persist the playback position every 2s while playing.
        saveJob?.cancel()
        saveJob = lifecycleScope.launch {
            while (true) {
                delay(2_000)
                val p = player ?: break
                val u = currentUrl ?: break
                if (p.playbackState == Player.STATE_READY && p.isPlaying) {
                    SessionManager.get(this@PlayerActivity).saveResumePosition(u, p.currentPosition)
                }
            }
        }
    }

    /** Swap the current video for a new one (used by next / prev / sidebar tap). */
    private fun playVideo(url: String, title: String) {
        releasePlayer()
        currentUrl = url
        currentTitle = title
        binding.titleLabel.text = title
        initialisePlayer()
        playlistAdapter?.updateCurrent(PlaylistManager.index())
    }

    private fun playNext() {
        val next = PlaylistManager.getNext()
        if (next == null || next.link.isNullOrEmpty()) {
            Snackbar.make(binding.root, "Fim da playlist", Snackbar.LENGTH_LONG).show()
            return
        }
        playVideo(MeggyApp.BASE_URL + next.link, next.name)
    }

    @Suppress("unused") // reserved for a future prev-button; sidebar covers navigation today
    private fun playPrev() {
        val prev = PlaylistManager.getPrev() ?: return
        if (prev.link.isNullOrEmpty()) return
        playVideo(MeggyApp.BASE_URL + prev.link, prev.name)
    }

    private fun releasePlayer() {
        saveJob?.cancel()
        saveJob = null
        val p = player ?: return
        try {
            currentUrl?.let { url ->
                SessionManager.get(this).saveResumePosition(url, p.currentPosition)
            }
        } catch (_: Exception) {}
        p.release()
        player = null
    }

    private fun cycleSpeed() {
        val p = player ?: return
        val speeds = floatArrayOf(0.5f, 0.75f, 1.0f, 1.25f, 1.5f, 1.75f, 2.0f)
        val current = p.playbackParameters.speed
        val idx = speeds.indexOfFirst { kotlin.math.abs(it - current) < 0.01f }
        val next = speeds[(idx + 1).coerceAtMost(speeds.lastIndex)]
        p.playbackParameters = PlaybackParameters(next)
        binding.speedButton.text = "${next}x"
    }

    companion object {
        const val EXTRA_URL = "playback_url"
        const val EXTRA_TITLE = "playback_title"
    }
}
