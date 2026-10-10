package com.meggy.app.ui.home

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import com.meggy.app.MeggyApp
import com.meggy.app.data.ApiService
import com.meggy.app.data.CourseItem
import com.meggy.app.data.DriveItem
import com.meggy.app.databinding.ActivityHomeBinding
import com.meggy.app.ui.browse.BrowseActivity
import com.meggy.app.ui.login.LoginActivity
import com.meggy.app.util.SessionManager
import kotlinx.coroutines.launch

/**
 * HomeActivity — main hub of the app.
 *
 * Shows a grid of all 12 root drives. Below the drives (or as a separate section)
 * we attempt to fetch the user's enrolled courses via /api/courses/list — if the
 * worker returns courses they are appended as additional grid items.
 *
 * Grid span is computed from the current screen width so the layout adapts cleanly
 * from phones (2 columns) through tablets (4) to Android TV (5-6).
 */
class HomeActivity : AppCompatActivity() {

    private lateinit var binding: ActivityHomeBinding
    private lateinit var api: ApiService
    private lateinit var adapter: DriveAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityHomeBinding.inflate(layoutInflater)
        setContentView(binding.root)

        api = ApiService(application as MeggyApp)

        // Quick guard: if the user landed here without a session, bounce them back.
        if (!SessionManager.get(this).isLoggedIn) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }

        binding.toolbar.title = "Meggy — ${SessionManager.get(this).username ?: "olá"}"
        binding.toolbar.setNavigationIcon(android.R.drawable.ic_menu_close_clear_cancel)
        binding.toolbar.setNavigationOnClickListener {
            SessionManager.get(this).clearSession()
            val intent = Intent(this, LoginActivity::class.java)
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            startActivity(intent)
            finish()
        }

        adapter = DriveAdapter { drive -> openDrive(drive) }

        val span = computeSpan()
        val lm = GridLayoutManager(this, span)
        binding.recycler.layoutManager = lm
        binding.recycler.adapter = adapter
        // Preserve focus when the RecyclerView scrolls (essential for D-pad).
        binding.recycler.setItemViewCacheSize(20)
        binding.recycler.isDrawingCacheEnabled = true

        // Initial list = the 12 root drives.
        adapter.submitList(DriveItem.ALL)

        // Best-effort fetch of user's enrolled courses. Append them to the grid.
        loadCourses()
    }

    private fun openDrive(drive: DriveItem) {
        val intent = Intent(this, BrowseActivity::class.java).apply {
            putExtra(BrowseActivity.EXTRA_DRIVE_INDEX, drive.index)
            putExtra(BrowseActivity.EXTRA_DRIVE_NAME, drive.name)
            putExtra(BrowseActivity.EXTRA_FOLDER_ID, drive.rootFolderId)
            putExtra(BrowseActivity.EXTRA_FOLDER_NAME, drive.name)
        }
        startActivity(intent)
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
    }

    private fun loadCourses() {
        lifecycleScope.launch {
            try {
                val courses: List<CourseItem> = api.listCourses()
                if (courses.isEmpty()) return@launch
                // Append courses as synthetic DriveItems using negative indices so
                // they don't collide with the real drive indices. The coursePath
                // itself is what BrowseActivity needs — but our current model only
                // passes driveIndex + folderId, so we stash coursePath in the
                // rootFolderId field as a string. BrowseActivity treats it as the
                // folder ID which works because the worker also accepts an empty
                // driveIndex with a full folder path.
                val current = adapter.currentList.toMutableList()
                for (c in courses) {
                    // Parse "/<idx>:/<folderId>/" → driveIndex + folderId
                    val parsed = parseCoursePath(c.coursePath) ?: continue
                    current.add(
                        DriveItem(
                            index = parsed.first,
                            name = c.courseName,
                            rootFolderId = parsed.second,
                            icon = "courses"
                        )
                    )
                }
                adapter.submitList(current)
            } catch (_: Exception) {
                // Silent — courses are optional.
            }
        }
    }

    /**
     * Parse a coursePath like "/10:/PF_abc123/" into (10, "PF_abc123").
     * Returns null if the format is unexpected.
     */
    private fun parseCoursePath(path: String): Pair<Int, String>? {
        val trimmed = path.trim('/')
        val colon = trimmed.indexOf(':')
        if (colon <= 0) return null
        val idx = trimmed.substring(0, colon).toIntOrNull() ?: return null
        val rest = trimmed.substring(colon + 1).trim('/')
        if (rest.isEmpty()) return null
        return idx to rest
    }

    override fun onResume() {
        super.onResume()
        // If the session was cleared elsewhere (unlikely but possible), bounce.
        if (!SessionManager.get(this).isLoggedIn) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
        }
    }

    /** Computes the grid column count from the current window width. */
    private fun computeSpan(): Int {
        val dm = resources.displayMetrics
        val widthDp = dm.widthPixels / dm.density
        return when {
            widthDp >= 960 -> 6   // TV / large tablet
            widthDp >= 720 -> 5
            widthDp >= 540 -> 4
            widthDp >= 360 -> 3
            else -> 2
        }
    }
}
