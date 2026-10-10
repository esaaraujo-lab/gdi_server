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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class BrowseActivity : AppCompatActivity() {

    private lateinit var binding: ActivityBrowseBinding
    private lateinit var api: ApiService
    private var driveIdx: Int = 0
    private var folderId: String = ""
    private var folderName: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityBrowseBinding.inflate(layoutInflater)
        setContentView(binding.root)

        api = ApiService(this)
        driveIdx = intent.getIntExtra("driveIdx", 0)
        folderId = intent.getStringExtra("folderId") ?: ""
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
            val files = withContext(Dispatchers.IO) { api.listFolder(driveIdx, folderId) }
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
            }
        }
    }

    private fun openFolder(file: FileItem) {
        val intent = Intent(this, BrowseActivity::class.java)
        intent.putExtra("driveIdx", driveIdx)
        intent.putExtra("folderId", file.id)
        intent.putExtra("folderName", file.name)
        startActivity(intent)
    }

    private fun openFile(file: FileItem) {
        if (file.link.isNotEmpty()) {
            val intent = Intent(this, PlayerActivity::class.java)
            intent.putExtra("url", MeggyApp.BASE_URL + file.link)
            intent.putExtra("title", file.name)
            startActivity(intent)
        }
    }
}
