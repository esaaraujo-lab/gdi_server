package com.bibigyn.app.ui.search

import android.content.Intent
import android.graphics.Rect
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.bibigyn.app.R
import com.bibigyn.app.data.DriveItem
import com.bibigyn.app.data.FileItem
import com.bibigyn.app.databinding.ActivitySearchBinding
import com.bibigyn.app.ui.browse.BrowseActivity
import com.bibigyn.app.ui.home.HomeActivity
import com.bibigyn.app.ui.mylist.MyListActivity
import com.bibigyn.app.ui.player.PlayerActivity
import com.bibigyn.app.ui.settings.SettingsActivity
import com.bibigyn.app.util.SessionManager
import com.bibigyn.app.BiBiGynApp

/**
 * v2.0.0 — Search screen.
 *
 * v2.0.2: BottomNav no longer calls finish() on tab switch — the target
 * activity is declared with launchMode="singleTask" in the manifest, so
 * startActivity() brings the existing instance to front and clears
 * activities above it. This keeps the back stack clean.
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
                    overridePendingTransition(0, 0)
                    // v2.0.2: NO finish() — singleTask handles back-stack cleanup.
                    true
                }
                R.id.nav_mylist -> {
                    startActivity(Intent(this, MyListActivity::class.java))
                    overridePendingTransition(0, 0)
                    true
                }
                R.id.nav_settings -> {
                    startActivity(Intent(this, SettingsActivity::class.java))
                    overridePendingTransition(0, 0)
                    true
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

        search("")
    }

    // v2.0.2: Restore the correct nav highlight when brought back to front.
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        binding.bottomNav.selectedItemId = R.id.nav_search
    }

    private fun search(query: String) {
        val q = query.trim()
        val sm = SessionManager.get(this)
        val results = mutableListOf<SearchResult>()

        val drives = if (q.isBlank()) DriveItem.ALL
            else DriveItem.ALL.filter { it.name.contains(q, ignoreCase = true) }
        drives.forEach { results.add(SearchResult.Drive(it)) }

        val favorites = sm.getFavorites()
        val favFilter = if (q.isBlank()) favorites
            else favorites.filter { it.name.contains(q, ignoreCase = true) }
        favFilter.forEach { results.add(SearchResult.File(it)) }

        val recents = sm.getRecents()
        val recFilter = if (q.isBlank()) recents
            else recents.filter { it.videoName.contains(q, ignoreCase = true) }
        recFilter.forEach { r ->
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
            val intent = Intent(this, BrowseActivity::class.java)
            intent.putExtra("drivePath", file.folderPath ?: "/")
            intent.putExtra("folderName", file.folderLabel ?: file.folderPath ?: "Browse")
            startActivity(intent)
            return
        }
        val fullUrl = BiBiGynApp.BASE_URL + link
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
