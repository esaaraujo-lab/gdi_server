package com.meggy.app.ui.home

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import com.meggy.app.data.ApiService
import com.meggy.app.data.DriveItem
import com.meggy.app.databinding.ActivityHomeBinding
import com.meggy.app.ui.browse.BrowseActivity
import com.meggy.app.util.SessionManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class HomeActivity : AppCompatActivity() {

    private lateinit var binding: ActivityHomeBinding
    private lateinit var api: ApiService

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityHomeBinding.inflate(layoutInflater)
        setContentView(binding.root)

        api = ApiService(this)

        // Check login
        if (!SessionManager.get(this).isLoggedIn) {
            startActivity(Intent(this, com.meggy.app.ui.login.LoginActivity::class.java))
            finish()
            return
        }

        val spanCount = calculateSpanCount()
        binding.recyclerView.layoutManager = GridLayoutManager(this, spanCount)
        binding.recyclerView.adapter = DriveAdapter(DriveItem.DEFAULT_DRIVES) { drive ->
            val intent = Intent(this, BrowseActivity::class.java)
            intent.putExtra("driveIdx", drive.index)
            intent.putExtra("folderId", drive.rootFolderId ?: "")
            intent.putExtra("folderName", drive.name)
            startActivity(intent)
        }
    }

    private fun calculateSpanCount(): Int {
        val displayMetrics = resources.displayMetrics
        val screenWidthDp = displayMetrics.widthPixels / displayMetrics.density
        return if (screenWidthDp >= 900) 6 else if (screenWidthDp >= 600) 4 else 2
    }
}
