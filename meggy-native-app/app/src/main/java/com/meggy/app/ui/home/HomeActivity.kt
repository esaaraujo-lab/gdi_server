package com.meggy.app.ui.home

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import com.meggy.app.BuildConfig
import com.meggy.app.data.DriveItem
import com.meggy.app.databinding.ActivityHomeBinding
import com.meggy.app.ui.browse.BrowseActivity
import com.meggy.app.ui.login.LoginActivity
import com.meggy.app.util.PlaylistManager
import com.meggy.app.util.SessionManager
import com.meggy.app.util.UpdateChecker

/**
 * Netflix-style home screen (v1.5.0).
 *
 * Layout: NestedScrollView with a 280dp hero banner, then two horizontal rails:
 *  - "Continue assistindo" — populated from SessionManager's last-watched entry.
 *  - "Explorar drives"     — the 12 root drives as horizontal cards.
 *
 * The hero's "▶ Assistir" button opens the first drive.
 */
class HomeActivity : AppCompatActivity() {

    private lateinit var binding: ActivityHomeBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityHomeBinding.inflate(layoutInflater)
        setContentView(binding.root)

        if (!SessionManager.get(this).isLoggedIn) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }

        // ★ v1.4.0: Verificar atualizações
        UpdateChecker.checkForUpdate(this, BuildConfig.VERSION_NAME)

        // Top nav: logout
        binding.topSair.setOnClickListener { logout() }

        // Hero: open first drive
        binding.heroPlay.setOnClickListener {
            val first = DriveItem.ALL.first()
            openDrive(first)
        }

        setupContinueRail()
        setupDrivesRail()
    }

    /** "Continue assistindo" rail — built from SessionManager's last-watched entry. */
    private fun setupContinueRail() {
        val sm = SessionManager.get(this)
        val lastFolder = sm.getLastWatchedFolder()
        val lastVideo = sm.getLastWatchedVideoName()

        if (lastFolder.isNullOrBlank() || lastVideo.isNullOrBlank()) {
            // No history yet — hide the rail and its label.
            binding.labelContinue.visibility = View.GONE
            binding.railContinue.visibility = View.GONE
            return
        }

        binding.labelContinue.visibility = View.VISIBLE
        binding.railContinue.visibility = View.VISIBLE
        binding.railContinue.layoutManager =
            LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false)

        val shortFolder = lastFolder.substringAfterLast("/").ifBlank { lastFolder }
        val item = RailItem(
            title = lastVideo,
            subtitle = shortFolder,
            icon = "\uD83C\uDFA5", // 🎥
            hasProgress = true,
            progress = 35,
            isWatched = false,
            hasResume = true
        )
        binding.railContinue.adapter = RailAdapter(listOf(item)) {
            // Reopen the last-watched folder so the user lands on the playlist.
            val intent = Intent(this, BrowseActivity::class.java)
            intent.putExtra("drivePath", lastFolder)
            intent.putExtra("folderName", shortFolder)
            startActivity(intent)
        }
    }

    /** "Explorar drives" rail — 12 drives as horizontal cards. */
    private fun setupDrivesRail() {
        binding.railDrives.layoutManager =
            LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false)
        binding.railDrives.adapter = DriveRailAdapter(DriveItem.ALL) { drive ->
            openDrive(drive)
        }
    }

    private fun openDrive(drive: DriveItem) {
        val intent = Intent(this, BrowseActivity::class.java)
        intent.putExtra("drivePath", "/${drive.index}:/")
        intent.putExtra("folderName", drive.name)
        startActivity(intent)
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
