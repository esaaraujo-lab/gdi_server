package com.meggy.app.ui.mylist

import android.content.Intent
import android.graphics.Rect
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.meggy.app.R
import com.meggy.app.MeggyApp
import com.meggy.app.databinding.ActivityMylistBinding
import com.meggy.app.ui.browse.BrowseActivity
import com.meggy.app.ui.home.HomeActivity
import com.meggy.app.ui.player.PlayerActivity
import com.meggy.app.ui.search.SearchActivity
import com.meggy.app.ui.settings.SettingsActivity
import com.meggy.app.util.SessionManager

/**
 * v2.0.0 — Minha lista (favoritos).
 *
 * v2.0.2: BottomNav no longer calls finish() on tab switch — the target
 * activity is declared with launchMode="singleTask" in the manifest, so
 * startActivity() brings the existing instance to front and clears
 * activities above it.
 */
class MyListActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMylistBinding
    private lateinit var adapter: MyListAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMylistBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.toolbar.setNavigationOnClickListener { finish() }
        binding.bottomNav.selectedItemId = R.id.nav_mylist
        binding.bottomNav.setOnItemSelectedListener { item ->
            when (item.itemId) {
                R.id.nav_mylist -> true
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

        adapter = MyListAdapter { file -> openFile(file) }
        binding.recycler.adapter = adapter

        loadFavorites()
    }

    // v2.0.2: Restore the correct nav highlight when brought back to front.
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        binding.bottomNav.selectedItemId = R.id.nav_mylist
    }

    override fun onResume() {
        super.onResume()
        loadFavorites()
    }

    private fun loadFavorites() {
        val favs = SessionManager.get(this).getFavorites()
        if (favs.isEmpty()) {
            binding.emptyState.visibility = View.VISIBLE
            binding.recycler.visibility = View.GONE
            binding.labelCount.text = ""
        } else {
            binding.emptyState.visibility = View.GONE
            binding.recycler.visibility = View.VISIBLE
            binding.labelCount.text = "${favs.size} item(ns) salvos"
            adapter.submit(favs)
        }
    }

    private fun openFile(file: com.meggy.app.data.FileItem) {
        val link = file.link
        if (link.isNullOrEmpty()) {
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
