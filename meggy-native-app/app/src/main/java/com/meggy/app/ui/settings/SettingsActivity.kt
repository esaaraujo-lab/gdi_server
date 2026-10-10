package com.meggy.app.ui.settings

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.meggy.app.BuildConfig
import com.meggy.app.R
import com.meggy.app.databinding.ActivitySettingsBinding
import com.meggy.app.ui.home.HomeActivity
import com.meggy.app.ui.login.LoginActivity
import com.meggy.app.ui.mylist.MyListActivity
import com.meggy.app.ui.player.PlayerActivity
import com.meggy.app.ui.search.SearchActivity
import com.meggy.app.util.PlaylistManager
import com.meggy.app.util.SessionManager

/**
 * v2.0.0 — Settings screen.
 *
 * Lets the user configure:
 *  • Default playback speed (0.75 / 1.0 / 1.25 / 1.5 / 1.75 / 2.0)
 *  • Auto-play next video toggle
 *  • Default sleep timer (0 / 15 / 30 / 45 / 60 min)
 *
 * Plus account actions (logout) and about info (version + acknowledgements).
 */
class SettingsActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySettingsBinding
    private val speeds = floatArrayOf(0.75f, 1.0f, 1.25f, 1.5f, 1.75f, 2.0f)
    private val sleepOptions = intArrayOf(0, 15, 30, 45, 60)
    private var speedIdx = 1
    private var sleepIdx = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySettingsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.toolbar.setNavigationOnClickListener { finish() }
        binding.bottomNav.selectedItemId = R.id.nav_settings
        binding.bottomNav.setOnItemSelectedListener { item ->
            when (item.itemId) {
                R.id.nav_settings -> true
                R.id.nav_home -> {
                    startActivity(Intent(this, HomeActivity::class.java))
                    overridePendingTransition(0, 0); finish(); true
                }
                R.id.nav_search -> {
                    startActivity(Intent(this, SearchActivity::class.java))
                    overridePendingTransition(0, 0); finish(); true
                }
                R.id.nav_mylist -> {
                    startActivity(Intent(this, MyListActivity::class.java))
                    overridePendingTransition(0, 0); finish(); true
                }
                else -> false
            }
        }

        // Load current settings
        val sm = SessionManager.get(this)
        val currentSpeed = sm.defaultSpeed
        speedIdx = speeds.indexOfFirst { it == currentSpeed }.coerceAtLeast(0)
        val currentSleep = sm.defaultSleepTimerMin
        sleepIdx = sleepOptions.indexOfFirst { it == currentSleep }.coerceAtLeast(0)
        updateSpeedLabel()
        updateSleepLabel()
        binding.switchAutoplay.isChecked = sm.autoplayNext

        // Speed buttons
        binding.btnSpeedDown.setOnClickListener {
            speedIdx = (speedIdx - 1 + speeds.size) % speeds.size
            sm.defaultSpeed = speeds[speedIdx]
            updateSpeedLabel()
        }
        binding.btnSpeedUp.setOnClickListener {
            speedIdx = (speedIdx + 1) % speeds.size
            sm.defaultSpeed = speeds[speedIdx]
            updateSpeedLabel()
        }

        // Sleep buttons
        binding.btnSleepDown.setOnClickListener {
            sleepIdx = (sleepIdx - 1 + sleepOptions.size) % sleepOptions.size
            sm.defaultSleepTimerMin = sleepOptions[sleepIdx]
            updateSleepLabel()
        }
        binding.btnSleepUp.setOnClickListener {
            sleepIdx = (sleepIdx + 1) % sleepOptions.size
            sm.defaultSleepTimerMin = sleepOptions[sleepIdx]
            updateSleepLabel()
        }

        // Autoplay toggle
        binding.switchAutoplay.setOnCheckedChangeListener { _, isChecked ->
            sm.autoplayNext = isChecked
        }

        // Logout
        binding.btnLogout.setOnClickListener { logout() }

        // About
        binding.aboutText.text = buildString {
            append("🐩 Meggy · v${BuildConfig.VERSION_NAME}\n")
            append("Build ${BuildConfig.VERSION_CODE}\n\n")
            append("Plataforma de estudos integrada.\n")
            append("Atualizações automáticas via GitHub.\n\n")
            append("Tecnologias: Kotlin, Media3, Material 3.\n")
            append("© 2026 Meggy · educa.eu.org")
        }
    }

    private fun updateSpeedLabel() {
        binding.speedValue.text = "${speeds[speedIdx]}x"
    }

    private fun updateSleepLabel() {
        val min = sleepOptions[sleepIdx]
        binding.sleepValue.text = if (min == 0) "Off" else "${min}min"
    }

    private fun logout() {
        SessionManager.get(this).clearSession()
        PlaylistManager.clear()
        val intent = Intent(this, LoginActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        finish()
    }
}
