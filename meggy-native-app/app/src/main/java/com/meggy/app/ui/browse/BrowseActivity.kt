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
import com.meggy.app.util.CrossFolderPlaylist
import com.meggy.app.util.PlaylistManager
import com.meggy.app.util.SessionManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * BrowseActivity — v1.2.0
 *
 * Folder navigation. When the user opens a video:
 *  • If the folder contains ≥2 videos → same-folder playlist (fast path, same
 *    as v1.1.0). Every entry is tagged with `folderPath = currentPath`.
 *  • If the folder contains <2 videos → cross-folder scan
 *    ([CrossFolderPlaylist.build]) which lists the parent folder's sibling
 *    subfolders 6 at a time and assembles a playlist spanning the whole
 *    subject. Each entry is tagged with `folderLabel` (subfolder name) +
 *    `folderPath` (full path).
 *  • Records the video as the folder's "last watched" (v1.1.0 behaviour).
 *
 * After [loadFolder], the adapter is fed two sets so cards can show:
 *  • a "▶ continuar" badge on videos with a non-zero resume position, and
 *  • a "✓" checkmark on videos previously watched to the end.
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

                val sm = SessionManager.get(this@BrowseActivity)
                // v1.2.0: badge every video in this folder that has a resume
                // position ("continuar") or was watched to the end ("✓").
                val resumed = files
                    .filter { it.isVideo && sm.hasResume(currentPath, it.name) }
                    .map { it.name }
                    .toSet()
                val watched = files
                    .filter { it.isVideo && sm.isWatched(currentPath, it.name) }
                    .map { it.name }
                    .toSet()
                adapter.setResumeAndWatched(resumed, watched)
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
        if (link.isNullOrEmpty()) return

        if (!file.isVideo) {
            // Non-video (e.g. PDF) — just hand the URL to the player.
            launchPlayer(MeggyApp.BASE_URL + link, file.name, currentPath)
            return
        }

        // Show a brief loading indicator while the playlist is assembled.
        binding.loadingView.visibility = View.VISIBLE
        lifecycleScope.launch {
            val playlist = withContext(Dispatchers.IO) { buildPlaylistFor(file) }
            binding.loadingView.visibility = View.GONE

            val (videos, index) = playlist
            if (videos.isNotEmpty() && index >= 0) {
                PlaylistManager.setPlaylist(videos, index, this@BrowseActivity)
            }
            // Remember which video was last opened from this folder.
            SessionManager.get(this@BrowseActivity).saveLastWatched(currentPath, file.name)

            launchPlayer(MeggyApp.BASE_URL + link, file.name, currentPath)
        }
    }

    /**
     * Same-folder fast path when the folder has ≥2 videos; otherwise falls back
     * to a cross-folder scan. Every returned entry is tagged with `folderPath`
     * so PlayerActivity can key resume positions per (folder, video).
     */
    private suspend fun buildPlaylistFor(clicked: FileItem): Pair<List<FileItem>, Int> {
        val allFiles = (binding.recycler.adapter as? FileAdapter)?.currentList ?: emptyList()
        val sameFolder = allFiles
            .filter { it.isVideo && !it.link.isNullOrEmpty() }
            .map { it.copy(folderPath = currentPath) }

        if (sameFolder.size >= 2) {
            val idx = sameFolder.indexOfFirst { it.id == clicked.id }
            return sameFolder to (if (idx < 0) 0 else idx)
        }

        // Single-video (or empty) folder → cross-folder scan.
        val result = CrossFolderPlaylist.build(currentPath, clicked, api)
        return result.items to result.startIndex
    }

    private fun launchPlayer(url: String, title: String, folderPath: String) {
        val intent = Intent(this, PlayerActivity::class.java)
        intent.putExtra(PlayerActivity.EXTRA_URL, url)
        intent.putExtra(PlayerActivity.EXTRA_TITLE, title)
        intent.putExtra(PlayerActivity.EXTRA_FOLDER_PATH, folderPath)
        startActivity(intent)
    }
}
