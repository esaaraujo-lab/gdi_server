package com.meggy.app.ui.browse

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import com.meggy.app.MeggyApp
import com.meggy.app.data.ApiService
import com.meggy.app.data.FileItem
import com.meggy.app.databinding.ActivityBrowseBinding
import com.meggy.app.ui.player.PlayerActivity
import com.meggy.app.util.PlaylistManager
import com.meggy.app.util.SessionManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * BrowseActivity — v1.1.0
 *
 * Folder navigation. When the user opens a video:
 *  • builds a playlist from every video in the current folder (in display order)
 *  • stores it in [PlaylistManager] so PlayerActivity can auto-play the next one
 *  • records the video as the folder's "last watched" so the next visit shows a
 *    "▶ continuar" badge on its card.
 */
class BrowseActivity : AppCompatActivity() {

    private lateinit var binding: ActivityBrowseBinding
    private lateinit var api: ApiService
    private var currentPath: String = "/"
    private var folderName: String = "Browse"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityBrowseBinding.inflate(layoutInflater)
        setContentView(binding.root)

        api = ApiService(this)
        currentPath = intent.getStringExtra("drivePath") ?: "/"
        folderName = intent.getStringExtra("folderName") ?: "Browse"

        binding.breadcrumb.text = folderName
        binding.toolbar.setNavigationOnClickListener { finish() }

        val spanCount = calculateSpanCount()
        binding.recycler.layoutManager = GridLayoutManager(this, spanCount)

        loadFolder()
    }

    private fun calculateSpanCount(): Int {
        val displayMetrics = resources.displayMetrics
        val screenWidthDp = displayMetrics.widthPixels / displayMetrics.density
        return if (screenWidthDp >= 900) 5 else if (screenWidthDp >= 600) 4 else 2
    }

    private fun loadFolder() {
        binding.loadingView.visibility = View.VISIBLE
        binding.emptyState.visibility = View.GONE

        lifecycleScope.launch {
            val files = withContext(Dispatchers.IO) { api.listFolder(currentPath) }
            binding.loadingView.visibility = View.GONE

            val adapter = FileAdapter(
                onFolder = { file -> openFolder(file) },
                onFile = { file -> openFile(file) }
            )
            binding.recycler.adapter = adapter

            if (files.isNullOrEmpty()) {
                binding.emptyState.visibility = View.VISIBLE
                adapter.submitList(emptyList())
            } else {
                adapter.submitList(files)
                // v1.1.0: badge the video the user last watched in this folder.
                SessionManager.get(this@BrowseActivity)
                    .getLastWatched(currentPath)
                    ?.let { adapter.setLastWatched(it) }
            }
        }
    }

    private fun openFolder(file: FileItem) {
        val newPath = if (currentPath.endsWith("/")) {
            "$currentPath${file.name}/"
        } else {
            "$currentPath/${file.name}/"
        }

        val intent = Intent(this, BrowseActivity::class.java)
        intent.putExtra("drivePath", newPath)
        intent.putExtra("folderName", file.name)
        startActivity(intent)
    }

    private fun openFile(file: FileItem) {
        val link = file.link
        if (!link.isNullOrEmpty()) {
            // v1.1.0: build a playlist from every video in this folder so
            // PlayerActivity can auto-play the next one and show the sidebar.
            if (file.isVideo) {
                val allFiles = (binding.recycler.adapter as? FileAdapter)?.currentList ?: emptyList()
                val videos = allFiles.filter { it.isVideo && !it.link.isNullOrEmpty() }
                val videoIndex = videos.indexOfFirst { it.id == file.id }
                if (videos.isNotEmpty() && videoIndex >= 0) {
                    PlaylistManager.setPlaylist(videos, videoIndex, this)
                }
                // Remember which video was last opened from this folder.
                SessionManager.get(this).saveLastWatched(currentPath, file.name)
            }

            val intent = Intent(this, PlayerActivity::class.java)
            intent.putExtra(PlayerActivity.EXTRA_URL, MeggyApp.BASE_URL + link)
            intent.putExtra(PlayerActivity.EXTRA_TITLE, file.name)
            startActivity(intent)
        }
    }
}
