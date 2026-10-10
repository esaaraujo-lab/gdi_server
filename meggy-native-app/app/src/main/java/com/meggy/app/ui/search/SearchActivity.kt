package com.meggy.app.ui.search

import android.content.Intent
import android.graphics.Rect
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.meggy.app.R
import com.meggy.app.data.DriveItem
import com.meggy.app.data.FileItem
import com.meggy.app.databinding.ActivitySearchBinding
import com.meggy.app.ui.browse.BrowseActivity
import com.meggy.app.ui.home.HomeActivity
import com.meggy.app.ui.mylist.MyListActivity
import com.meggy.app.ui.player.PlayerActivity
import com.meggy.app.ui.settings.SettingsActivity
import com.meggy.app.util.SessionManager
import com.meggy.app.MeggyApp

/**
 * v2.0.0 — Search screen.
 *
 * Searches across three sources simultaneously:
 *  • The 12 hardcoded drives (by name).
 *  • The user's favorites (FileItem list from SessionManager).
 *  • The user's recents (folder/video pairs from SessionManager).
 *
 * Results are displayed as Netflix-style tiles using FileAdapter.
 * Tapping a drive opens BrowseActivity; tapping a file opens PlayerActivity.
 */
class SearchActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySearchBinding
    private lateinit var adapter: SearchResultAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySearchBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.toolbar.setNavigationOnClickListener { finish() }
        binding.bottomNav.selectedItemId = R.id.nav_search
        binding.bottomNav.setOnItemSelectedListener { item ->
            when (item.itemId) {
                R.id.nav_search -> true
                R.id.nav_home -> {
                    startActivity(Intent(this, HomeActivity::class.java))
                    overridePendingTransition(0, 0); finish(); true
                }
                R.id.nav_mylist -> {
                    startActivity(Intent(this, MyListActivity::class.java))
                    overridePendingTransition(0, 0); finish(); true
                }
                R.id.nav_settings -> {
                    startActivity(Intent(this, SettingsActivity::class.java))
                    overridePendingTransition(0, 0); finish(); true
                }
                else -> false
            }
        }

        val spanCount = if (resources.displayMetrics.widthPixels / resources.displayMetrics.density >= 900) 5
            else if (resources.displayMetrics.widthPixels / resources.displayMetrics.density >= 600) 4 else 2
        binding.recycler.layoutManager = GridLayoutManager(this, spanCount)
        binding.recycler.addItemDecoration(GridGutterDecoration(10))

        adapter = SearchResultAdapter(
            onDrive = { drive -> openDrive(drive) },
            onFile = { file -> openFile(file) }
        )
        binding.recycler.adapter = adapter

        binding.searchInput.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) { search(s?.toString().orEmpty()) }
        })

        // Initial state: show all drives as default results
        search("")
    }

    private fun search(query: String) {
        val q = query.trim()
        val sm = SessionManager.get(this)
        val results = mutableListOf<SearchResult>()

        // 1. Drives matching the query
        val drives = if (q.isBlank()) DriveItem.ALL
            else DriveItem.ALL.filter { it.name.contains(q, ignoreCase = true) }
        drives.forEach { results.add(SearchResult.Drive(it)) }

        // 2. Favorites matching the query
        val favorites = sm.getFavorites()
        val favFilter = if (q.isBlank()) favorites
            else favorites.filter { it.name.contains(q, ignoreCase = true) }
        favFilter.forEach { results.add(SearchResult.File(it)) }

        // 3. Recents matching the query
        val recents = sm.getRecents()
        val recFilter = if (q.isBlank()) recents
            else recents.filter { it.videoName.contains(q, ignoreCase = true) }
        recFilter.forEach { r ->
            // Synthesize a FileItem so the adapter can render it
            val fake = FileItem(
                name = r.videoName,
                mimeType = "video/mp4",
                id = "recent_${r.folderPath}_${r.videoName}",
                driveId = null,
                link = null,
                size = 0L,
                modifiedTime = null,
                folderLabel = r.folderPath.substringAfterLast("/"),
                folderPath = r.folderPath
            )
            results.add(SearchResult.File(fake))
        }

        if (results.isEmpty()) {
            binding.emptyState.visibility = View.VISIBLE
            binding.recycler.visibility = View.GONE
            binding.resultsLabel.text = if (q.isBlank()) "Sugestões" else "Nenhum resultado"
        } else {
            binding.emptyState.visibility = View.GONE
            binding.recycler.visibility = View.VISIBLE
            binding.resultsLabel.text = if (q.isBlank()) "Sugestões (${results.size})" else "Resultados (${results.size})"
        }
        adapter.submit(results)
    }

    private fun openDrive(drive: DriveItem) {
        val intent = Intent(this, BrowseActivity::class.java)
        intent.putExtra("drivePath", "/${drive.index}:/")
        intent.putExtra("folderName", drive.name)
        startActivity(intent)
    }

    private fun openFile(file: FileItem) {
        val link = file.link
        if (link.isNullOrEmpty()) {
            // Recent without link → open BrowseActivity in the folder
            val intent = Intent(this, BrowseActivity::class.java)
            intent.putExtra("drivePath", file.folderPath ?: "/")
            intent.putExtra("folderName", file.folderLabel ?: file.folderPath ?: "Browse")
            startActivity(intent)
            return
        }
        val fullUrl = MeggyApp.BASE_URL + link
        SessionManager.get(this).saveLastWatched(file.folderPath ?: "/", file.name)
        val intent = Intent(this, PlayerActivity::class.java)
        intent.putExtra(PlayerActivity.EXTRA_URL, fullUrl)
        intent.putExtra(PlayerActivity.EXTRA_TITLE, file.name)
        intent.putExtra(PlayerActivity.EXTRA_FOLDER_PATH, file.folderPath ?: "")
        startActivity(intent)
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
