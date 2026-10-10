package com.meggy.app.ui.home

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.meggy.app.BuildConfig
import com.meggy.app.MeggyApp
import com.meggy.app.data.ApiService
import com.meggy.app.data.DriveItem
import com.meggy.app.data.FileItem
import com.meggy.app.databinding.ActivityHomeBinding
import com.meggy.app.ui.browse.BrowseActivity
import com.meggy.app.ui.login.LoginActivity
import com.meggy.app.ui.player.PlayerActivity
import com.meggy.app.util.CrossFolderPlaylist
import com.meggy.app.util.PlaylistManager
import com.meggy.app.util.SessionManager
import com.meggy.app.util.UpdateChecker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class HomeActivity : AppCompatActivity() {

    private lateinit var binding: ActivityHomeBinding
    private lateinit var api: ApiService

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityHomeBinding.inflate(layoutInflater)
        setContentView(binding.root)

        if (!SessionManager.get(this).isLoggedIn) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }

        api = ApiService(this)
        UpdateChecker.checkForUpdate(this, BuildConfig.VERSION_NAME)
        binding.topSair.setOnClickListener { logout() }
        binding.heroPlay.setOnClickListener { openDrive(DriveItem.ALL.first()) }

        setupContinueRail()
        setupDrivesRail()
    }

    private fun setupContinueRail() {
        val sm = SessionManager.get(this)
        val lastFolder = sm.getLastWatchedFolder()
        val lastVideo = sm.getLastWatchedVideoName()

        if (lastFolder.isNullOrBlank() || lastVideo.isNullOrBlank()) {
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
            title = lastVideo, subtitle = shortFolder, icon = "🎥",
            hasProgress = true, progress = 35, isWatched = false, hasResume = true
        )
        binding.railContinue.adapter = RailAdapter(listOf(item)) {
            // ★ v1.5.1: "Continuar" → abrir PlayerActivity com cross-folder playlist
            continueWatching(lastFolder, lastVideo, shortFolder)
        }
    }

    // ★ v1.5.1: Builds cross-folder playlist and opens PlayerActivity directly
    private fun continueWatching(folderPath: String, videoName: String, shortFolder: String) {
        lifecycleScope.launch {
            // 1. Listar arquivos da pasta do último vídeo
            val files = withContext(Dispatchers.IO) { api.listFolder(folderPath) }
            
            if (!files.isNullOrEmpty()) {
                // Encontrar o vídeo clicado
                val clickedVideo = files.find { it.name == videoName && (it.isVideo || it.isAudio) }
                
                if (clickedVideo != null && !clickedVideo.link.isNullOrEmpty()) {
                    val playable = files.filter { (it.isVideo || it.isAudio) && !it.link.isNullOrEmpty() }
                    
                    if (playable.size > 1) {
                        // Múltiplos vídeos na mesma pasta
                        val idx = playable.indexOfFirst { it.name == videoName }
                        PlaylistManager.setPlaylist(playable, if (idx >= 0) idx else 0, this@HomeActivity)
                        launchPlayer(MeggyApp.BASE_URL + clickedVideo.link, videoName, folderPath)
                        return@launch
                    } else if (clickedVideo != null) {
                        // Só 1 vídeo → cross-folder playlist
                        val result = withContext(Dispatchers.IO) {
                            CrossFolderPlaylist.build(folderPath, clickedVideo, api)
                        }
                        if (result.items.isNotEmpty()) {
                            PlaylistManager.setPlaylist(result.items, result.startIndex, this@HomeActivity)
                        }
                        launchPlayer(MeggyApp.BASE_URL + clickedVideo.link, videoName, folderPath)
                        return@launch
                    }
                }
            }
            
            // Fallback: abrir BrowseActivity na pasta
            val intent = Intent(this@HomeActivity, BrowseActivity::class.java)
            intent.putExtra("drivePath", folderPath)
            intent.putExtra("folderName", shortFolder)
            startActivity(intent)
        }
    }

    private fun launchPlayer(url: String, title: String, folderPath: String) {
        SessionManager.get(this).saveLastWatched(folderPath, title)
        val intent = Intent(this, PlayerActivity::class.java)
        intent.putExtra(PlayerActivity.EXTRA_URL, url)
        intent.putExtra(PlayerActivity.EXTRA_TITLE, title)
        intent.putExtra(PlayerActivity.EXTRA_FOLDER_PATH, folderPath)
        startActivity(intent)
    }

    private fun setupDrivesRail() {
        binding.railDrives.layoutManager =
            LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false)
        binding.railDrives.adapter = DriveRailAdapter(DriveItem.ALL) { drive -> openDrive(drive) }
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
