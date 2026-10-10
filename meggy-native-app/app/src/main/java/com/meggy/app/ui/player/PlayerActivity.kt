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
import com.meggy.app.data.FileItem
import com.meggy.app.databinding.ActivityPlayerBinding
import com.meggy.app.util.PlaylistManager
import com.meggy.app.util.SessionManager
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * PlayerActivity — v1.2.0
 *
 * Changes since v1.1.0:
 *  • Per-(folder, video) resume position via SessionManager.saveResume /
 *    getResume / clearResume — keyed `"resume_<folderPath>::<videoName>"` so
 *    the cross-folder playlist (where every file is named "video.mp4") keeps
 *    independent resume positions per lesson.
 *  • "Watched" flag set on natural end (STATE_ENDED) so BrowseActivity can show
 *    a ✓ checkmark on finished lessons.
 *  • Prev / next buttons in the top bar (in addition to the ☰ sidebar).
 *  • Tracks the currently-playing [FileItem] (with folderPath) so resume keys
 *    stay correct when auto-advancing across folders.
 *
 * Retained from v1.1.0: auto-play next on STATE_ENDED, lateral playlist
 * sidebar, 0.5×–2.0× speed cycle, immersive fullscreen, cookie-injected
 * DefaultHttpDataSource.
 */
class PlayerActivity : AppCompatActivity() {

    private lateinit var binding: ActivityPlayerBinding
    private var player: ExoPlayer? = null
    private var currentItem: FileItem? = null
    private var currentUrl: String? = null

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

        // Resolve the item to play: prefer the playlist's current entry, fall
        // back to the EXTRA_* ints passed by BrowseActivity.
        var item = PlaylistManager.getCurrent()
        if (item == null || item.link.isNullOrEmpty()) {
            val url = intent.getStringExtra(EXTRA_URL)
            val title = intent.getStringExtra(EXTRA_TITLE) ?: "Reproduzindo"
            val folderPath = intent.getStringExtra(EXTRA_FOLDER_PATH)
            if (!url.isNullOrBlank()) {
                item = FileItem(
                    name = title,
                    mimeType = "video/mp4",
                    id = "",
                    driveId = null,
                    link = url.removePrefix(MeggyApp.BASE_URL),
                    size = 0L,
                    modifiedTime = null,
                    folderLabel = null,
                    folderPath = folderPath
                )
            }
        }
        currentItem = item

        binding.titleLabel.text = displayTitle(item)
        binding.speedButton.setOnClickListener { cycleSpeed() }
        binding.playlistButton.setOnClickListener { togglePlaylist() }
        binding.prevButton.setOnClickListener { playPrev() }
        binding.nextButton.setOnClickListener { playNext() }

        setupPlaylistSidebar()
        updateNavButtons()
    }

    private fun displayTitle(item: FileItem?): String {
        if (item == null) return "Reproduzindo"
        val label = item.folderLabel
        return if (!label.isNullOrBlank()) "${item.name}  ·  $label" else item.name
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
            .setUserAgent("MeggyNative/1.2 (Android)")
            .setAllowCrossProtocolRedirects(true)
            .setDefaultRequestProperties(
                if (!cookie.isNullOrBlank()) mapOf("Cookie" to "session=$cookie") else emptyMap()
            )

        val exo = ExoPlayer.Builder(this)
            .setMediaSourceFactory(DefaultMediaSourceFactory(httpFactory))
            .build()

        exo.setMediaItem(MediaItem.fromUri(url))
        exo.prepare()

        // v1.2.0: seek to the per-(folder, video) resume position.
        val saved = resumeFor(item, url)
        if (saved > 0L) exo.seekTo(saved)

        exo.playWhenReady = true

        // v1.2.0: auto-play next + clear/mark watched on natural end.
        exo.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED) {
                    // Mark watched + clear resume so re-opening doesn't skip.
                    markEnded(item)
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
                val it = currentItem ?: break
                if (p.playbackState == Player.STATE_READY && p.isPlaying) {
                    saveResumeFor(it, currentUrl, p.currentPosition)
                }
            }
        }
    }

    /** Swap the current video for a new one (next / prev / sidebar tap). */
    private fun playItem(item: FileItem) {
        releasePlayer()
        currentItem = item
        binding.titleLabel.text = displayTitle(item)
        initialisePlayer()
        playlistAdapter?.updateCurrent(PlaylistManager.index())
        updateNavButtons()
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

    private fun cycleSpeed() {
        val p = player ?: return
        val speeds = floatArrayOf(0.5f, 0.75f, 1.0f, 1.25f, 1.5f, 1.75f, 2.0f)
        val current = p.playbackParameters.speed
        val idx = speeds.indexOfFirst { kotlin.math.abs(it - current) < 0.01f }
        val next = speeds[(idx + 1).coerceAtMost(speeds.lastIndex)]
        p.playbackParameters = PlaybackParameters(next)
        binding.speedButton.text = "${next}x"
    }

    // ──────────── resume helpers (per-(folder, video) with URL fallback) ────────────

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

    /** Called when the current item finishes naturally: mark watched + clear resume. */
    private fun markEnded(item: FileItem?) {
        val fp = item?.folderPath
        if (!fp.isNullOrBlank() && !item.name.isBlank()) {
            SessionManager.get(this).clearResume(fp, item.name)
            SessionManager.get(this).markWatched(fp, item.name)
        } else {
            // No folderPath → fall back to per-URL resume. Capture into a local
            // val so Kotlin can smart-cast the (mutable) currentUrl to non-null.
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
