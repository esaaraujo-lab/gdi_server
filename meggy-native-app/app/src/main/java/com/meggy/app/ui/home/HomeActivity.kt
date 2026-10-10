package com.meggy.app.ui.home

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.GridLayoutManager
import com.meggy.app.BuildConfig
import com.meggy.app.data.DriveItem
import com.meggy.app.databinding.ActivityHomeBinding
import com.meggy.app.ui.browse.BrowseActivity
import com.meggy.app.util.SessionManager
import com.meggy.app.util.UpdateChecker

class HomeActivity : AppCompatActivity() {

    private lateinit var binding: ActivityHomeBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityHomeBinding.inflate(layoutInflater)
        setContentView(binding.root)

        if (!SessionManager.get(this).isLoggedIn) {
            startActivity(Intent(this, com.meggy.app.ui.login.LoginActivity::class.java))
            finish()
            return
        }

        // ★ v1.4.0: Verificar atualizações
        UpdateChecker.checkForUpdate(this, BuildConfig.VERSION_NAME)

        // ★ v1.4.0: Mostrar "Continuar de onde parou"
        val sm = SessionManager.get(this)
        val lastFolder = sm.getLastWatchedFolder()
        val lastVideo = sm.getLastWatchedVideoName()
        
        if (!lastFolder.isNullOrBlank() && !lastVideo.isNullOrBlank()) {
            binding.continueCard.visibility = View.VISIBLE
            binding.continueTitle.text = lastVideo
            binding.continueSubtitle.text = lastFolder
            binding.continueCard.setOnClickListener {
                // Navegar para a pasta do último vídeo
                val intent = Intent(this, BrowseActivity::class.java)
                intent.putExtra("drivePath", lastFolder)
                intent.putExtra("folderName", lastFolder.substringAfterLast("/").ifEmpty { "Continuar" })
                startActivity(intent)
            }
        } else {
            binding.continueCard.visibility = View.GONE
        }

        // Grid de drives
        val spanCount = calculateSpanCount()
        binding.recycler.layoutManager = GridLayoutManager(this, spanCount)

        val adapter = DriveAdapter { drive ->
            val intent = Intent(this, BrowseActivity::class.java)
            intent.putExtra("drivePath", "/${drive.index}:/")
            intent.putExtra("folderName", drive.name)
            startActivity(intent)
        }
        binding.recycler.adapter = adapter
        adapter.submitList(DriveItem.ALL)
    }

    private fun calculateSpanCount(): Int {
        val displayMetrics = resources.displayMetrics
        val screenWidthDp = displayMetrics.widthPixels / displayMetrics.density
        return if (screenWidthDp >= 900) 6 else if (screenWidthDp >= 600) 4 else 2
    }
}
