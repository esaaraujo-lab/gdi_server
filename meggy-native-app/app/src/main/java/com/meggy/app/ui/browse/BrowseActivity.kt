package com.meggy.app.ui.browse

import android.content.Intent
import android.graphics.Rect
import android.net.Uri
import android.os.Bundle
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
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

class BrowseActivity : AppCompatActivity() {

    private lateinit var binding: ActivityBrowseBinding
    private lateinit var api: ApiService
    private var currentPath: String = "/"
    private var folderName: String = "Browse"
    private var fileAdapter: FileAdapter? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityBrowseBinding.inflate(layoutInflater)
        setContentView(binding.root)

        api = ApiService(this)
        currentPath = intent.getStringExtra("drivePath") ?: "/"
        folderName = intent.getStringExtra("folderName") ?: "Browse"

        // ★ v1.8.0: toolbar title + pink chevron breadcrumb.
        binding.toolbar.title = folderName
        binding.toolbar.setNavigationOnClickListener { finish() }
        binding.breadcrumb.text = buildBreadcrumb(currentPath, folderName)

        val spanCount = calculateSpanCount()
        val layoutManager = GridLayoutManager(this, spanCount)
        binding.recycler.layoutManager = layoutManager
        // v1.8.0: gutter so focused-scaled tiles don't clip against neighbours.
        binding.recycler.addItemDecoration(GridGutterDecoration(10))

        // ★ v1.6.0: Wire retry button
        binding.retryButton?.setOnClickListener { loadFolder() }

        loadFolder()
    }

    /**
     * v1.8.0 — Builds a "Meggy › drive › folder › subfolder" breadcrumb
     * with pink chevrons between segments. The full path is split on
     * '/' and the drive index segment (e.g. "0:") is replaced with the
     * drive name for readability.
     */
    private fun buildBreadcrumb(path: String, displayName: String): CharSequence {
        val pinkColor = ForegroundColorSpan(0xFFFF8B9F.toInt())
        val grayColor = ForegroundColorSpan(0xFF8B949E.toInt())
        val sb = SpannableStringBuilder()
        sb.append("Meggy", grayColor, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        // Split the path and rebuild readable segments
        val segments = path.trim('/').split('/').filter { it.isNotBlank() }
        for (seg in segments) {
            sb.append("  ›  ", pinkColor, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            // For drive index segment "N:" → show drive name instead
            val label = if (seg.matches(Regex("^\\d+:$"))) displayName else seg
            sb.append(label, grayColor, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
        return sb
    }

    private fun calculateSpanCount(): Int {
        val displayMetrics = resources.displayMetrics
        val screenWidthDp = displayMetrics.widthPixels / displayMetrics.density
        return if (screenWidthDp >= 900) 5 else if (screenWidthDp >= 600) 4 else 2
    }

    private fun loadFolder() {
        binding.loadingView.visibility = View.VISIBLE
        binding.errorState?.visibility = View.GONE
        binding.emptyState.visibility = View.GONE

        lifecycleScope.launch {
            val files = withContext(Dispatchers.IO) { api.listFolder(currentPath) }
            binding.loadingView.visibility = View.GONE

            val adapter = FileAdapter(
                onFolder = { file -> openFolder(file) },
                onFile = { file -> openFile(file) }
            )
            fileAdapter = adapter
            binding.recycler.adapter = adapter

            if (files.isNullOrEmpty()) {
                binding.errorState?.visibility = View.VISIBLE
                binding.emptyState.visibility = View.VISIBLE
                adapter.submitList(emptyList())
            } else {
                adapter.submitList(files)
                val sm = SessionManager.get(this@BrowseActivity)
                val resumed = files.filter { it.isVideo && sm.hasResume(currentPath, it.name) }
                    .map { it.name }.toSet()
                val watched = files.filter { it.isVideo && sm.isWatched(currentPath, it.name) }
                    .map { it.name }.toSet()
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

        val fullUrl = MeggyApp.BASE_URL + link

        if (file.isVideo || file.isAudio) {
            // ★ v1.5.1: Same-folder playlist first
            val allFiles = fileAdapter?.currentList ?: emptyList()
            val playableItems = allFiles.filter { (it.isVideo || it.isAudio) && !it.link.isNullOrEmpty() }
            val playIndex = playableItems.indexOfFirst { it.id == file.id }

            if (playableItems.size > 1 && playIndex >= 0) {
                // Multiple videos in same folder → use as playlist
                PlaylistManager.setPlaylist(playableItems, playIndex, this)
                launchPlayer(fullUrl, file.name, currentPath)
            } else {
                // ★ v1.5.1: Single video → try cross-folder playlist
                lifecycleScope.launch {
                    binding.loadingView.visibility = View.VISIBLE
                    val result = withContext(Dispatchers.IO) {
                        CrossFolderPlaylist.build(currentPath, file, api)
                    }
                    binding.loadingView.visibility = View.GONE

                    if (result.items.size > 1) {
                        // Cross-folder playlist found
                        PlaylistManager.setPlaylist(result.items, result.startIndex, this@BrowseActivity)
                    } else if (playableItems.isNotEmpty() && playIndex >= 0) {
                        // Fallback: single-item playlist
                        PlaylistManager.setPlaylist(playableItems, playIndex, this@BrowseActivity)
                    }

                    launchPlayer(fullUrl, file.name, currentPath)
                }
            }
        } else if (file.isPdf) {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(fullUrl))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try { startActivity(intent) } catch (e: Exception) {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(fullUrl)))
            }
        } else {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(fullUrl))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try { startActivity(intent) } catch (_: Exception) {}
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

    /**
     * v1.8.0 — Grid gutter decoration: 10dp gap between tiles + 6dp top
     * padding so the first row doesn't touch the breadcrumb. Keeps the
     * grid airy and gives the focus halo room to breathe.
     */
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
