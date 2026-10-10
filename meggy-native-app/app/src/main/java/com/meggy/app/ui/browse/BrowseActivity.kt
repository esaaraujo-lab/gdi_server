package com.meggy.app.ui.browse

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import com.google.android.material.snackbar.Snackbar
import com.meggy.app.MeggyApp
import com.meggy.app.data.ApiService
import com.meggy.app.data.FileItem
import com.meggy.app.databinding.ActivityBrowseBinding
import com.meggy.app.ui.home.HomeActivity
import com.meggy.app.ui.login.LoginActivity
import com.meggy.app.ui.player.PlayerActivity
import com.meggy.app.util.SessionManager
import kotlinx.coroutines.launch

/**
 * BrowseActivity — folder browser.
 *
 * Maintains a simple navigation stack of (folderId, folderName) pairs so the
 * hardware Back button / D-pad Back traverses up the folder hierarchy before
 * leaving the activity.
 *
 * Click folder  → push new (id, name) and reload
 * Click video   → launch PlayerActivity with the full download URL
 * Click PDF     → (placeholder) Snackbar for now — a PDF viewer activity can be
 *                 added later without changing this call site.
 */
class BrowseActivity : AppCompatActivity() {

    private data class Crumb(val folderId: String?, val name: String)

    private lateinit var binding: ActivityBrowseBinding
    private lateinit var api: ApiService
    private lateinit var adapter: FileAdapter

    private val stack = ArrayDeque<Crumb>()
    private var driveIndex: Int = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityBrowseBinding.inflate(layoutInflater)
        setContentView(binding.root)

        api = ApiService(application as MeggyApp)

        if (!SessionManager.get(this).isLoggedIn) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }

        driveIndex = intent.getIntExtra(EXTRA_DRIVE_INDEX, 0)
        val driveName = intent.getStringExtra(EXTRA_DRIVE_NAME) ?: "Drive"
        val rootFolderId = intent.getStringExtra(EXTRA_FOLDER_ID)
        val rootFolderName = intent.getStringExtra(EXTRA_FOLDER_NAME) ?: driveName

        // Seed the navigation stack with the drive root.
        stack.addLast(Crumb(rootFolderId, rootFolderName))

        binding.toolbar.title = driveName
        binding.toolbar.setNavigationIcon(android.R.drawable.ic_media_previous)
        binding.toolbar.setNavigationOnClickListener { onBackPressedDispatcher.onBackPressed() }
        binding.toolbar.setOnClickListener { onBackPressedDispatcher.onBackPressed() }

        adapter = FileAdapter(
            onFolder = { f -> pushFolder(f.id, f.name) },
            onFile = { f -> openFile(f) }
        )

        val span = computeSpan()
        binding.recycler.layoutManager = GridLayoutManager(this, span)
        binding.recycler.adapter = adapter
        binding.recycler.setItemViewCacheSize(20)

        updateBreadcrumb()
        loadCurrent()

        binding.retryButton.setOnClickListener { loadCurrent() }
    }

    private fun pushFolder(folderId: String?, name: String) {
        stack.addLast(Crumb(folderId, name))
        updateBreadcrumb()
        loadCurrent()
    }

    private fun popFolder(): Boolean {
        if (stack.size <= 1) return false
        stack.removeLast()
        updateBreadcrumb()
        loadCurrent()
        return true
    }

    private fun updateBreadcrumb() {
        binding.breadcrumb.text = stack.joinToString("  ›  ") { it.name }
    }

    private fun loadCurrent() {
        val current = stack.lastOrNull() ?: return
        showLoading(true)
        lifecycleScope.launch {
            try {
                val listing = api.listFolder(driveIndex, current.folderId, null)
                val sorted = listing.files.sortedWith(
                    compareByDescending<FileItem> { it.isFolder }
                        .thenBy { it.name.lowercase() }
                )
                adapter.submitList(sorted) {
                    showLoading(false)
                    if (sorted.isEmpty()) {
                        binding.emptyState.visibility = View.VISIBLE
                    } else {
                        binding.emptyState.visibility = View.GONE
                    }
                }
            } catch (e: Exception) {
                showLoading(false)
                binding.errorState.visibility = View.VISIBLE
                binding.errorText.text = e.message ?: "Erro desconhecido"
                Snackbar.make(binding.root, e.message ?: "Erro", Snackbar.LENGTH_LONG).show()
            }
        }
    }

    private fun openFile(f: FileItem) {
        val link = f.link
        if (link.isNullOrBlank()) {
            Snackbar.make(binding.root, "Arquivo sem link de download.", Snackbar.LENGTH_LONG).show()
            return
        }
        val fullUrl = if (link.startsWith("http")) link else "${com.meggy.app.MeggyApp.BASE_URL}$link"

        if (f.isVideo) {
            val intent = Intent(this, PlayerActivity::class.java).apply {
                putExtra(PlayerActivity.EXTRA_URL, fullUrl)
                putExtra(PlayerActivity.EXTRA_TITLE, f.name)
                putExtra(PlayerActivity.EXTRA_COOKIE, SessionManager.get(this@BrowseActivity).sessionCookie)
            }
            startActivity(intent)
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
        } else {
            // Non-video files (PDFs etc.) — placeholder for a future viewer.
            Snackbar.make(binding.root, "Visualização de ${f.mimeType} em breve.", Snackbar.LENGTH_LONG).show()
        }
    }

    private fun showLoading(loading: Boolean) {
        binding.loadingView.visibility = if (loading) View.VISIBLE else View.GONE
        binding.errorState.visibility = View.GONE
        if (loading) binding.emptyState.visibility = View.GONE
    }

    private fun computeSpan(): Int {
        val dm = resources.displayMetrics
        val widthDp = dm.widthPixels / dm.density
        return when {
            widthDp >= 960 -> 6
            widthDp >= 720 -> 5
            widthDp >= 540 -> 4
            widthDp >= 360 -> 3
            else -> 2
        }
    }

    @Deprecated("Use onBackPressedDispatcher instead.")
    override fun onBackPressed() {
        if (!popFolder()) super.onBackPressed()
    }

    companion object {
        const val EXTRA_DRIVE_INDEX = "drive_index"
        const val EXTRA_DRIVE_NAME   = "drive_name"
        const val EXTRA_FOLDER_ID    = "folder_id"
        const val EXTRA_FOLDER_NAME  = "folder_name"
    }
}
