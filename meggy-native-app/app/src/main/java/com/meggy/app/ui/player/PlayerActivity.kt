package com.meggy.app.ui.player

import android.app.PictureInPictureParams
import android.os.Build
import android.os.Bundle
import android.util.Rational
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
import com.google.android.material.snackbar.Snackbar
import com.meggy.app.databinding.ActivityPlayerBinding
import com.meggy.app.util.SessionManager
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class PlayerActivity : AppCompatActivity() {

    private lateinit var binding: ActivityPlayerBinding
    private var player: ExoPlayer? = null
    private var playbackUrl: String? = null
    private var title: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.systemBars())

        binding = ActivityPlayerBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // ★ v1.0.9 FIX: ler com as chaves corretas (EXTRA_URL, EXTRA_TITLE)
        playbackUrl = intent.getStringExtra(EXTRA_URL)
        title = intent.getStringExtra(EXTRA_TITLE)

        binding.titleLabel.text = title ?: "Reproduzindo"
        binding.speedButton.setOnClickListener { cycleSpeed() }
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
        val url = playbackUrl
        if (url.isNullOrBlank()) {
            Snackbar.make(binding.root, "URL de playback ausente.", Snackbar.LENGTH_LONG).show()
            finish()
            return
        }

        // ★ v1.0.9: Pegar cookie do SessionManager
        val cookie = SessionManager.get(this).sessionCookie

        // ★ v1.0.9: HttpDataSource com cookie + cross-protocol redirects
        // O /download.aspx faz redirect para googleusercontent.com
        val httpFactory = DefaultHttpDataSource.Factory()
            .setUserAgent("MeggyNative/1.0 (Android)")
            .setAllowCrossProtocolRedirects(true)
            .setDefaultRequestProperties(
                if (!cookie.isNullOrBlank()) mapOf("Cookie" to "session=$cookie") else emptyMap()
            )

        val exo = ExoPlayer.Builder(this)
            .setMediaSourceFactory(DefaultMediaSourceFactory(httpFactory))
            .build()

        // ★ v1.0.9: Usar MediaItem com URI direto (sem clipConfiguration)
        val mediaItem = MediaItem.fromUri(url)
        exo.setMediaItem(mediaItem)
        exo.prepare()

        // Restaurar posição
        val saved = SessionManager.get(this).getResumePosition(url)
        if (saved > 0L) {
            exo.seekTo(saved)
        }

        exo.playWhenReady = true
        player = exo
        binding.playerView.player = exo

        // Salvar posição a cada 2s
        lifecycleScope.launch {
            while (true) {
                delay(2_000)
                val p = player ?: break
                if (p.playbackState == Player.STATE_READY && p.isPlaying) {
                    SessionManager.get(this@PlayerActivity)
                        .saveResumePosition(url, p.currentPosition)
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
        Snackbar.make(binding.root, "Velocidade: ${next}x", Snackbar.LENGTH_SHORT).show()
    }

    companion object {
        const val EXTRA_URL = "playback_url"
        const val EXTRA_TITLE = "playback_title"
    }
}
