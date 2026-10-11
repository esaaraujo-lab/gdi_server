package com.meggy.app.ui.detail

import android.content.Intent
import android.graphics.Color
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.meggy.app.MeggyApp
import com.meggy.app.data.ApiService
import com.meggy.app.data.FileItem
import com.meggy.app.data.colorFromString
import com.meggy.app.databinding.ActivityDetailBinding
import com.meggy.app.ui.browse.BrowseActivity
import com.meggy.app.ui.player.PlayerActivity
import com.meggy.app.util.AuthHelper
import com.meggy.app.util.CrossFolderPlaylist
import com.meggy.app.util.PlaylistManager
import com.meggy.app.util.SessionManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * v2.1.0 — Detail screen (Netflix-style).
 *
 * Shows a hero banner at the top with the folder name + "▶ Assistir"
 * button (which plays the first video found) + "Explorar" button (which
 * scrolls to the grid). Below the hero: a grid of tiles (same as
 * BrowseActivity).
 *
 * When the user taps a folder tile, opens another DetailActivity for
 * that subfolder. When they tap a video, opens PlayerActivity with a
 * same-folder playlist.
 *
 * If the API returns null (expired session), calls AuthHelper.bounceToLogin().
 */
class DetailActivity : AppCompatActivity() {

    private lateinit var binding: ActivityDetailBinding
    private lateinit var api: ApiService
    private var currentPath: String = "/"
    private var folderName: String = "Detalhe"
    private var fileAdapter: com.meggy.app.ui.browse.FileAdapter? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityDetailBinding.inflate(layoutInflater)
        setContentView(binding.root)

        api = ApiService(this)
        currentPath = intent.getStringExtra("drivePath") ?: "/"
        folderName = intent.getStringExtra("folderName") ?: "Detalhe"

        // Hero setup
        binding.heroTitle.text = folderName
        binding.toolbar.title = folderName
        binding.toolbar.setNavigationOnClickListener { finish() }

        // Per-drive gradient on hero
        val baseColor = colorFromString(folderName)
        binding.heroBg.background = heroGradient(baseColor)

        // Grid setup
        val spanCount = calculateSpanCount()
        binding.recycler.layoutManager = GridLayoutManager(this, spanCount)
        binding.recycler.addItemDecoration(GridGutterDecoration(10))

        // ▶ Assistir → find first video and play
        binding.heroPlay.setOnClickListener { playFirstVideo() }
        // Explorar → scroll to grid
        binding.heroBrowse.setOnClickListener {
            binding.sectionLabel.requestFocus()
            binding.recycler.scrollToPosition(0)
        }

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

            // ★ v2.1.0: Detect expired session via AuthHelper
            if (AuthHelper.isSessionExpired(files)) {
                AuthHelper.bounceToLogin(this@DetailActivity)
                return@launch
            }

            val adapter = com.meggy.app.ui.browse.FileAdapter(
                onFolder = { file -> openFolder(file) },
                onFile = { file -> openFile(file) }
            )
            fileAdapter = adapter
            adapter.setFolderPath(currentPath)
            binding.recycler.adapter = adapter

            if (files.isEmpty()) {
                binding.emptyState.visibility = View.VISIBLE
                adapter.submitList(emptyList())
            } else {
                adapter.submitList(files)
                val sm = SessionManager.get(this@DetailActivity)
                val resumed = files.filter { it.isVideo && sm.hasResume(currentPath, it.name) }
                    .map { it.name }.toSet()
                val watched = files.filter { it.isVideo && sm.isWatched(currentPath, it.name) }
                    .map { it.name }.toSet()
                adapter.setResumeAndWatched(resumed, watched)

                // Update hero subtitle with file count
                val videoCount = files.count { it.isVideo || it.isAudio }
                val folderCount = files.count { it.isFolder }
                binding.heroSubtitle.text = when {
                    videoCount > 0 && folderCount > 0 -> "$videoCount vídeos · $folderCount pastas"
                    videoCount > 0 -> "$videoCount vídeos"
                    folderCount > 0 -> "$folderCount pastas"
                    else -> "${files.size} arquivos"
                }
            }
        }
    }

    /**
     * v2.1.0 — "▶ Assistir" button: finds the first video/audio file in
     * the current folder and opens the player with a same-folder playlist.
     * If no direct videos exist, opens the first subfolder (DetailActivity).
     */
    private fun playFirstVideo() {
        val files = fileAdapter?.currentList ?: return
        val firstVideo = files.find { (it.isVideo || it.isAudio) && !it.link.isNullOrEmpty() }
        if (firstVideo != null) {
            openFile(firstVideo)
        } else {
            // No videos at root → open first folder
            val firstFolder = files.find { it.isFolder }
            if (firstFolder != null) openFolder(firstFolder)
        }
    }

    private fun openFolder(file: FileItem) {
        val newPath = if (currentPath.endsWith("/")) {
            "$currentPath${file.name}/"
        } else {
            "$currentPath/${file.name}/"
        }
        val intent = Intent(this, DetailActivity::class.java)
        intent.putExtra("drivePath", newPath)
        intent.putExtra("folderName", file.name)
        startActivity(intent)
    }

    private fun openFile(file: FileItem) {
        val link = file.link
        if (link.isNullOrEmpty()) return

        val fullUrl = MeggyApp.BASE_URL + link

        if (file.isVideo || file.isAudio) {
            val allFiles = fileAdapter?.currentList ?: emptyList()
            val playableItems = allFiles.filter { (it.isVideo || it.isAudio) && !it.link.isNullOrEmpty() }
            val playIndex = playableItems.indexOfFirst { it.id == file.id }

            if (playableItems.size > 1 && playIndex >= 0) {
                PlaylistManager.setPlaylist(playableItems, playIndex, this)
                launchPlayer(fullUrl, file.name, currentPath)
            } else {
                lifecycleScope.launch {
                    binding.loadingView.visibility = View.VISIBLE
                    val result = withContext(Dispatchers.IO) {
                        CrossFolderPlaylist.build(currentPath, file, api)
                    }
                    binding.loadingView.visibility = View.GONE

                    if (result.items.size > 1) {
                        PlaylistManager.setPlaylist(result.items, result.startIndex, this@DetailActivity)
                    } else if (playableItems.isNotEmpty() && playIndex >= 0) {
                        PlaylistManager.setPlaylist(playableItems, playIndex, this@DetailActivity)
                    }

                    launchPlayer(fullUrl, file.name, currentPath)
                }
            }
        } else if (file.isPdf) {
            val intent = Intent(Intent.ACTION_VIEW, android.net.Uri.parse(fullUrl))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try { startActivity(intent) } catch (e: Exception) {
                startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(fullUrl)))
            }
        }
    }

    private fun launchPlayer(url: String, title: String, folderPath: String) {
        SessionManager.get(this).saveLastWatched(folderPath, title)
        SessionManager.get(this).addRecent(folderPath, title)
        val intent = Intent(this, PlayerActivity::class.java)
        intent.putExtra(PlayerActivity.EXTRA_URL, url)
        intent.putExtra(PlayerActivity.EXTRA_TITLE, title)
        intent.putExtra(PlayerActivity.EXTRA_FOLDER_PATH, folderPath)
        startActivity(intent)
    }

    private fun heroGradient(baseColor: Int): GradientDrawable {
        val r = Color.red(baseColor)
        val g = Color.green(baseColor)
        val b = Color.blue(baseColor)
        val start = Color.argb(0x80, r, g, b)
        val end = Color.parseColor("#FF0D0E12")
        return GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            intArrayOf(start, end)
        )
    }

    private class GridGutterDecoration(private val gutterDp: Int) : RecyclerView.ItemDecoration() {
        override fun getItemOffsets(
            outRect: Rect, view: View, parent: RecyclerView, state: RecyclerView.State
        ) {
            val density = view.resources.displayMetrics.density
            val px = (gutterDp * density).toInt()
            outRect.set(px / 2, px / 2, px / 2, px / 2)
        }
    }
}
