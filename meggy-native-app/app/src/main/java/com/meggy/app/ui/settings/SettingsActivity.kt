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
import com.meggy.app.ui.search.SearchActivity
import com.meggy.app.util.PlaylistManager
import com.meggy.app.util.SessionManager

/**
 * v2.0.0 — Settings screen.
 *
 * v2.0.2: BottomNav no longer calls finish() on tab switch — the target
 * activity is declared with launchMode="singleTask" in the manifest, so
 * startActivity() brings the existing instance to front and clears
 * activities above it.
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
                    overridePendingTransition(0, 0)
                    // v2.0.2: NO finish() — singleTask handles back-stack cleanup.
                    true
                }
                R.id.nav_search -> {
                    startActivity(Intent(this, SearchActivity::class.java))
                    overridePendingTransition(0, 0)
                    true
                }
                R.id.nav_mylist -> {
                    startActivity(Intent(this, MyListActivity::class.java))
                    overridePendingTransition(0, 0)
                    true
                }
                else -> false
            }
        }

        val sm = SessionManager.get(this)
        val currentSpeed = sm.defaultSpeed
        speedIdx = speeds.indexOfFirst { it == currentSpeed }.coerceAtLeast(0)
        val currentSleep = sm.defaultSleepTimerMin
        sleepIdx = sleepOptions.indexOfFirst { it == currentSleep }.coerceAtLeast(0)
        updateSpeedLabel()
        updateSleepLabel()
        binding.switchAutoplay.isChecked = sm.autoplayNext

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

        binding.switchAutoplay.setOnCheckedChangeListener { _, isChecked ->
            sm.autoplayNext = isChecked
        }

        binding.btnLogout.setOnClickListener { logout() }

        binding.aboutText.text = buildString {
            append("🐩 Meggy · v${BuildConfig.VERSION_NAME}\n")
            append("Build ${BuildConfig.VERSION_CODE}\n\n")
            append("Plataforma de estudos integrada.\n")
            append("Atualizações automáticas via GitHub.\n\n")
            append("Tecnologias: Kotlin, Media3, Material 3.\n")
            append("© 2026 Meggy · educa.eu.org")
        }
    }

    // v2.0.2: Restore the correct nav highlight when brought back to front.
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        binding.bottomNav.selectedItemId = R.id.nav_settings
    }

    private fun updateSpeedLabel() {
        binding.speedValue.text = "${speeds[speedIdx]}x"
    }

    private fun updateSleepLabel() {
        val min = sleepOptions[sleepIdx]
        binding.sleepValue.text = if (min == 0) "Off" else "${min}min"
    }

    /**
     * v2.0.2 — Logout clears the session and routes to LoginActivity with
     * CLEAR_TASK so the entire back stack is wiped. The user can never
     * press back to return to Settings/Home after logging out.
     */
    private fun logout() {
        SessionManager.get(this).clearSession()
        PlaylistManager.clear()
        val intent = Intent(this, LoginActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        finish()
    }
}
