package com.vovofit.app.ui.mylist

import android.content.Intent
import android.graphics.Rect
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.vovofit.app.R
import com.vovofit.app.VovoFitApp
import com.vovofit.app.databinding.ActivityMylistBinding
import com.vovofit.app.ui.browse.BrowseActivity
import com.vovofit.app.ui.detail.DetailActivity
import com.vovofit.app.ui.home.HomeActivity
import com.vovofit.app.ui.player.PlayerActivity
import com.vovofit.app.ui.search.SearchActivity
import com.vovofit.app.ui.settings.SettingsActivity
import com.vovofit.app.util.SessionManager

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
    private lateinit var courseAdapter: MyListCourseAdapter

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

        adapter = MyListAdapter(
            onClick = { file -> openFile(file) },
            onFavoriteToggle = { file ->
                // ★ v1.0.2: ⭐ remove o item e recarrega a lista.
                SessionManager.get(this).toggleFavorite(file)
                android.widget.Toast.makeText(this, "Removido da Minha lista", android.widget.Toast.LENGTH_SHORT).show()
                loadFavorites()
            }
        )
        binding.recycler.adapter = adapter

        courseAdapter = MyListCourseAdapter(
            onClick = { course -> openCourse(course) },
            onFavoriteToggle = { course ->
                SessionManager.get(this).toggleFavoriteCourse(course.drivePath, course.name)
                android.widget.Toast.makeText(this, "Curso removido da Minha lista", android.widget.Toast.LENGTH_SHORT).show()
                loadFavorites()
            }
        )
        binding.recyclerCourses.adapter = courseAdapter

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
        // ★ v1.0.2: duas seções — Cursos (pastas) + Vídeos/arquivos.
        val sm = SessionManager.get(this)
        val courses = sm.getFavoriteCourses()
        val favs = sm.getFavorites()
        val total = courses.size + favs.size

        if (total == 0) {
            binding.emptyState.visibility = View.VISIBLE
            binding.scrollContent.visibility = View.GONE
            binding.labelCount.text = ""
            return
        }
        binding.emptyState.visibility = View.GONE
        binding.scrollContent.visibility = View.VISIBLE
        binding.labelCount.text = "$total item(ns) salvos"

        if (courses.isEmpty()) {
            binding.labelCourses.visibility = View.GONE
            binding.recyclerCourses.visibility = View.GONE
        } else {
            binding.labelCourses.visibility = View.VISIBLE
            binding.recyclerCourses.visibility = View.VISIBLE
            courseAdapter.submit(courses)
        }

        if (favs.isEmpty()) {
            binding.labelFiles.visibility = View.GONE
            binding.recycler.visibility = View.GONE
        } else {
            binding.labelFiles.visibility = View.VISIBLE
            binding.recycler.visibility = View.VISIBLE
            adapter.submit(favs)
        }
    }

    /** ★ v1.0.2: abre um curso favorito (detalhe do curso/pasta). */
    private fun openCourse(course: SessionManager.FavCourse) {
        val intent = Intent(this, DetailActivity::class.java)
        intent.putExtra("drivePath", course.drivePath)
        intent.putExtra("folderName", course.name)
        startActivity(intent)
    }

    private fun openFile(file: com.vovofit.app.data.FileItem) {
        val link = file.link
        if (link.isNullOrEmpty()) {
            val intent = Intent(this, BrowseActivity::class.java)
            intent.putExtra("drivePath", file.folderPath ?: "/")
            intent.putExtra("folderName", file.folderLabel ?: file.folderPath ?: "Browse")
            startActivity(intent)
            return
        }
        val fullUrl = VovoFitApp.BASE_URL + link
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
