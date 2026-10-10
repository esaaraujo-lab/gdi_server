package com.meggy.app.ui.home

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.GridLayoutManager
import com.meggy.app.R
import com.meggy.app.data.DriveItem
import com.meggy.app.databinding.ActivityHomeBinding
import com.meggy.app.ui.browse.BrowseActivity
import com.meggy.app.ui.login.LoginActivity
import com.meggy.app.util.PlaylistManager
import com.meggy.app.util.SessionManager

/**
 * HomeActivity — v1.1.0
 *
 * Clean professional launcher: just the 12-drive grid + a logout overflow action.
 * No "Área do Aluno" section — the app is a pure browser + player.
 */
class HomeActivity : AppCompatActivity() {

    private lateinit var binding: ActivityHomeBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityHomeBinding.inflate(layoutInflater)
        setContentView(binding.root)

        if (!SessionManager.get(this).isLoggedIn) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }

        binding.toolbar.title = getString(R.string.home_title)
        binding.toolbar.inflateMenu(R.menu.home)
        binding.toolbar.setOnMenuItemClickListener { item ->
            if (item.itemId == R.id.action_logout) {
                SessionManager.get(this).clearSession()
                PlaylistManager.clear()
                val intent = Intent(this, LoginActivity::class.java)
                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                startActivity(intent)
                finish()
                true
            } else {
                false
            }
        }

        val spanCount = calculateSpanCount()
        binding.recycler.layoutManager = GridLayoutManager(this, spanCount)

        val adapter = DriveAdapter { drive ->
            val intent = Intent(this, BrowseActivity::class.java)
            // ★ v1.0.7 FIX: passar o PATH do drive (ex: /0:/) em vez de folderId
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
