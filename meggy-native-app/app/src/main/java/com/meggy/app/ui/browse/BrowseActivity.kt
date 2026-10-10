package com.meggy.app.ui.browse

import android.content.Intent
import android.net.Uri
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
import com.meggy.app.util.PlaylistManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

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
            // ★ v1.4.0: Vídeos e áudios abrem no PlayerActivity (ExoPlayer toca ambos)
            // Build playlist from same folder (videos + audios)
            val allFiles = (binding.recycler.adapter as? FileAdapter)?.currentList ?: emptyList()
            val playableItems = allFiles.filter { (it.isVideo || it.isAudio) && !it.link.isNullOrEmpty() }
            val playIndex = playableItems.indexOfFirst { it.id == file.id }
            
            if (playableItems.isNotEmpty() && playIndex >= 0) {
                PlaylistManager.setPlaylist(playableItems, playIndex, this)
            }
            
            val intent = Intent(this, PlayerActivity::class.java)
            intent.putExtra(PlayerActivity.EXTRA_URL, fullUrl)
            intent.putExtra(PlayerActivity.EXTRA_TITLE, file.name)
            intent.putExtra(PlayerActivity.EXTRA_FOLDER_PATH, currentPath)
            // ★ v1.4.0: Salvar último assistido para "Continuar" na home
            com.meggy.app.util.SessionManager.get(this).saveLastWatched(currentPath, file.name)
            startActivity(intent)
        } else if (file.isPdf) {
            // ★ v1.4.0: PDFs abrem no navegador (Android tem leitor de PDF nativo via intent)
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(fullUrl))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try {
                startActivity(intent)
            } catch (e: Exception) {
                // Se não tem app de PDF, abrir no navegador
                val browserIntent = Intent(Intent.ACTION_VIEW, Uri.parse(fullUrl))
                startActivity(browserIntent)
            }
        } else {
            // Outros arquivos: tentar abrir via intent
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(fullUrl))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try {
                startActivity(intent)
            } catch (e: Exception) {
                // Ignorar se não consegue abrir
            }
        }
    }
}
