package com.meggy.app.ui.player

import android.app.PictureInPictureParams
import android.os.Build
import android.os.Bundle
import android.util.Rational
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
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.ui.PlayerView
import com.google.android.material.snackbar.Snackbar
import com.meggy.app.MeggyApp
import com.meggy.app.databinding.ActivityPlayerBinding
import com.meggy.app.util.SessionManager
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * PlayerActivity — ExoPlayer-based fullscreen video player.
 *
 * Features:
 *   - Streams the file URL via OkHttp-style DefaultHttpDataSource, attaching the
 *     `session=<cookie>` header so authenticated worker.js download URLs work.
 *   - Resume position is stored in [SessionManager] (key = file URL) and restored
 *     on next open. Positions within the last 5 seconds of the file are cleared
 *     (treated as "finished").
 *   - Speed control: 0.5× .. 2.0× via the PlayerView's extra overlay button.
 *   - PiP mode: on Android 8+ the activity enters picture-in-picture when the
 *     user taps Home while playing.
 */
class PlayerActivity : AppCompatActivity() {

    private lateinit var binding: ActivityPlayerBinding
    private var player: ExoPlayer? = null
    private var playbackUrl: String? = null
    private var title: String? = null
    private var cookie: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Edge-to-edge fullscreen.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.systemBars())

        binding = ActivityPlayerBinding.inflate(layoutInflater)
        setContentView(binding.root)

        playbackUrl = intent.getStringExtra(EXTRA_URL)
        title = intent.getStringExtra(EXTRA_TITLE)
        cookie = intent.getStringExtra(EXTRA_COOKIE) ?: SessionManager.get(this).sessionCookie

        binding.titleLabel.text = title ?: "Reproduzindo"

        binding.speedButton.setOnClickListener { cycleSpeed() }
        binding.playerView.setFullscreenButtonClickListener { enterPipIfPossible() }
    }

    override fun onStart() {
        super.onStart()
        initialisePlayer()
    }

    override fun onStop() {
        super.onStop()
        releasePlayer()
    }

    private fun initialisePlayer() {
        val url = playbackUrl ?: run {
            Snackbar.make(binding.root, "URL de playback ausente.", Snackbar.LENGTH_LONG).show()
            finish()
            return
        }

        // Build a DefaultHttpDataSource.Factory that injects the session cookie.
        val httpFactory = DefaultHttpDataSource.Factory()
            .setUserAgent("MeggyNative/1.0 (Android)")
            .setAllowCrossProtocolRedirects(true)
            .setDefaultRequestProperties(
                if (!cookie.isNullOrBlank()) mapOf("Cookie" to "session=$cookie") else emptyMap()
            )

        val mediaItem = MediaItem.fromUri(url)
        val mediaSource: MediaSource = DefaultMediaSourceFactory(httpFactory)
            .createMediaSource(mediaItem)

        val exo = ExoPlayer.Builder(this)
            .setMediaSourceFactory(DefaultMediaSourceFactory(httpFactory))
            .build()
            .apply {
                setMediaSource(mediaSource)
                prepare()
                // Restore saved position (if any). We do this after prepare so that
                // a seek triggers the correct segment load.
                val saved = SessionManager.get(this@PlayerActivity).getResumePosition(url)
                if (saved > 0L) seekTo(saved)
                playWhenReady = true
                addListener(object : Player.Listener {
                    override fun onPlaybackStateChanged(state: Int) {
                        if (state == Player.STATE_READY) {
                            // Re-evaluate resume position now that we know the duration.
                            val dur = duration
                            if (dur > 0) {
                                val saved2 = SessionManager.get(this@PlayerActivity)
                                    .getResumePosition(url, dur)
                                if (saved2 > 0L && currentPosition < 1_000L) seekTo(saved2)
                            }
                        }
                    }
                })
            }

        player = exo
        binding.playerView.player = exo

        // Persist playback position every 2 seconds while playing.
        lifecycleScope.launch {
            while (true) {
                delay(2_000)
                val p = player ?: break
                if (p.playbackState == Player.STATE_READY && p.isPlaying) {
                    val url2 = playbackUrl ?: continue
                    SessionManager.get(this@PlayerActivity)
                        .saveResumePosition(url2, p.currentPosition)
                }
            }
        }
    }

    private fun releasePlayer() {
        val p = player ?: return
        try {
            playbackUrl?.let { url ->
                SessionManager.get(this).saveResumePosition(url, p.currentPosition)
            }
        } catch (_: Exception) { /* ignore */ }
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
        Snackbar.make(binding.root, "Velocidade: ${next}x", Snackbar.LENGTH_SHORT).show()
    }

    private fun enterPipIfPossible() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val p = player ?: return
            val ratio = if (p.videoSize.width > 0 && p.videoSize.height > 0)
                Rational(p.videoSize.width, p.videoSize.height)
            else Rational(16, 9)
            try {
                val params = PictureInPictureParams.Builder()
                    .setAspectRatio(ratio)
                    .build()
                enterPictureInPictureMode(params)
            } catch (_: Exception) {
                Snackbar.make(binding.root, "PiP indisponível neste dispositivo.", Snackbar.LENGTH_SHORT).show()
            }
        }
    }

    @Deprecated("Use onBackPressedDispatcher.")
    override fun onBackPressed() {
        // Move to background instead of destroying so PiP keeps the stream alive.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && player?.isPlaying == true) {
            enterPipIfPossible()
            return
        }
        super.onBackPressed()
    }

    companion object {
        const val EXTRA_URL    = "playback_url"
        const val EXTRA_TITLE  = "playback_title"
        const val EXTRA_COOKIE = "playback_cookie"
    }
}
