package com.meggy.app.ui.home

import android.content.Intent
import android.graphics.Rect
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.animation.AlphaAnimation
import android.view.animation.Animation
import android.view.animation.AnimationSet
import android.view.animation.DecelerateInterpolator
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.meggy.app.BuildConfig
import com.meggy.app.MeggyApp
import com.meggy.app.R
import com.meggy.app.data.ApiService
import com.meggy.app.data.DriveItem
import com.meggy.app.data.HeroItem
import com.meggy.app.databinding.ActivityHomeBinding
import com.meggy.app.ui.browse.BrowseActivity
import com.meggy.app.ui.login.LoginActivity
import com.meggy.app.ui.mylist.MyListActivity
import com.meggy.app.ui.player.PlayerActivity
import com.meggy.app.ui.search.SearchActivity
import com.meggy.app.ui.settings.SettingsActivity
import com.meggy.app.util.CrossFolderPlaylist
import com.meggy.app.util.PlaylistManager
import com.meggy.app.util.SessionManager
import com.meggy.app.util.UpdateChecker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class HomeActivity : AppCompatActivity() {

    private lateinit var binding: ActivityHomeBinding
    private lateinit var api: ApiService
    private var heroRotator: HeroRotator? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityHomeBinding.inflate(layoutInflater)
        setContentView(binding.root)

        if (!SessionManager.get(this).isLoggedIn) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }

        api = ApiService(this)
        UpdateChecker.checkForUpdate(this, BuildConfig.VERSION_NAME)

        // ★ v1.8.0: dynamic version footer
        binding.footerVersion.text = "🐩 Meggy · v${BuildConfig.VERSION_NAME}"

        binding.topSair.setOnClickListener { logout() }

        // Bottom navigation
        binding.bottomNav.selectedItemId = R.id.nav_home
        binding.bottomNav.setOnItemSelectedListener { item ->
            when (item.itemId) {
                R.id.nav_home -> true
                R.id.nav_search -> {
                    startActivity(Intent(this, SearchActivity::class.java))
                    overridePendingTransition(0, 0)
                    finish()
                    true
                }
                R.id.nav_mylist -> {
                    startActivity(Intent(this, MyListActivity::class.java))
                    overridePendingTransition(0, 0)
                    finish()
                    true
                }
                R.id.nav_settings -> {
                    startActivity(Intent(this, SettingsActivity::class.java))
                    overridePendingTransition(0, 0)
                    finish()
                    true
                }
                else -> false
            }
        }

        setupHero()
        setupContinueRail()
        setupDrivesRail()
    }

    // ──────────── v2.0.0: Hero rotativo ────────────

    private fun setupHero() {
        heroRotator = HeroRotator(binding, HeroItem.ALL) { hero ->
            // ▶ Explorar → abre o drive em destaque no Browse
            val intent = Intent(this, BrowseActivity::class.java)
            intent.putExtra("drivePath", hero.drivePath)
            intent.putExtra("folderName", hero.driveName)
            startActivity(intent)
        }
        heroRotator?.start()
    }

    /**
     * v2.0.0 — HeroRotator crossfades between [HeroItem]s every 8 seconds.
     * Manual ‹ › arrows let the user navigate. Dots indicator at bottom-right
     * shows the current slide.
     */
    private class HeroRotator(
        private val binding: ActivityHomeBinding,
        private val items: List<HeroItem>,
        private val onClick: (HeroItem) -> Unit
    ) {
        private val handler = Handler(Looper.getMainLooper())
        private var index = 0
        private val rotateRunnable = Runnable { next() }

        init {
            binding.heroPlay.setOnClickListener { onClick(items[index]) }
            binding.heroPrev.setOnClickListener { prev() }
            binding.heroNext.setOnClickListener { next() }
            buildDots()
            render(animate = false)
        }

        fun start() {
            handler.postDelayed(rotateRunnable, 8000L)
        }

        fun stop() {
            handler.removeCallbacks(rotateRunnable)
        }

        private fun next() {
            index = (index + 1) % items.size
            render(animate = true)
            handler.removeCallbacks(rotateRunnable)
            handler.postDelayed(rotateRunnable, 8000L)
        }

        private fun prev() {
            index = (index - 1 + items.size) % items.size
            render(animate = true)
            handler.removeCallbacks(rotateRunnable)
            handler.postDelayed(rotateRunnable, 8000L)
        }

        private fun render(animate: Boolean) {
            val item = items[index]
            binding.heroBadge.text = item.badge
            binding.heroTitle.text = item.title
            binding.heroSubtitle.text = item.subtitle
            binding.heroIcon.text = item.icon
            updateDots()
            if (animate) {
                // Crossfade the text layer
                val out = AlphaAnimation(1f, 0f).apply { duration = 300 }
                val inn = AlphaAnimation(0f, 1f).apply { duration = 300 }
                val set = AnimationSet(true).apply {
                    interpolator = DecelerateInterpolator()
                    addAnimation(out)
                    addAnimation(inn)
                }
                binding.heroBadge.startAnimation(inn)
                binding.heroTitle.startAnimation(inn)
                binding.heroSubtitle.startAnimation(inn)
                binding.heroIcon.startAnimation(inn)
            }
        }

        private fun buildDots() {
            binding.heroDots.removeAllViews()
            for (i in items.indices) {
                val dot = TextView(binding.root.context).apply {
                    text = "•"
                    textSize = 18f
                    setTextColor(0x66FFFFFF)
                    setPadding(6, 0, 6, 0)
                }
                binding.heroDots.addView(dot)
            }
        }

        private fun updateDots() {
            for (i in 0 until binding.heroDots.childCount) {
                val dot = binding.heroDots.getChildAt(i) as? TextView ?: continue
                dot.setTextColor(if (i == index) 0xFFFF8B9F.toInt() else 0x66FFFFFF)
                dot.textSize = if (i == index) 22f else 18f
            }
        }
    }

    // ──────────── v2.0.0: Continue rail multi-item ────────────

    private fun setupContinueRail() {
        val sm = SessionManager.get(this)
        val recents = sm.getRecents()

        if (recents.isEmpty()) {
            binding.labelContinue.visibility = View.GONE
            binding.railContinue.visibility = View.GONE
            return
        }

        binding.labelContinue.visibility = View.VISIBLE
        binding.railContinue.visibility = View.VISIBLE
        binding.railContinue.layoutManager =
            LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false)
        binding.railContinue.addItemDecoration(RailGutterDecoration(8))

        // Build RailItems from recents
        val railItems = recents.map { r ->
            val shortFolder = r.folderPath.substringAfterLast("/").ifBlank { r.folderPath }
            RailItem(
                title = r.videoName,
                subtitle = shortFolder,
                icon = "🎥",
                hasProgress = sm.hasResume(r.folderPath, r.videoName),
                progress = 35,
                isWatched = sm.isWatched(r.folderPath, r.videoName),
                hasResume = sm.hasResume(r.folderPath, r.videoName)
            )
        }
        binding.railContinue.adapter = RailAdapter(railItems) { item ->
            // Find matching recent + open player
            val match = recents.find { it.videoName == item.title } ?: return@RailAdapter
            continueWatching(match.folderPath, match.videoName, item.subtitle)
        }
    }

    // ★ v1.5.1: Builds cross-folder playlist and opens PlayerActivity directly
    private fun continueWatching(folderPath: String, videoName: String, shortFolder: String) {
        lifecycleScope.launch {
            val files = withContext(Dispatchers.IO) { api.listFolder(folderPath) }

            if (!files.isNullOrEmpty()) {
                val clickedVideo = files.find { it.name == videoName && (it.isVideo || it.isAudio) }

                if (clickedVideo != null && !clickedVideo.link.isNullOrEmpty()) {
                    val playable = files.filter { (it.isVideo || it.isAudio) && !it.link.isNullOrEmpty() }

                    if (playable.size > 1) {
                        val idx = playable.indexOfFirst { it.name == videoName }
                        PlaylistManager.setPlaylist(playable, if (idx >= 0) idx else 0, this@HomeActivity)
                        launchPlayer(MeggyApp.BASE_URL + clickedVideo.link, videoName, folderPath)
                        return@launch
                    } else {
                        val result = withContext(Dispatchers.IO) {
                            CrossFolderPlaylist.build(folderPath, clickedVideo, api)
                        }
                        if (result.items.isNotEmpty()) {
                            PlaylistManager.setPlaylist(result.items, result.startIndex, this@HomeActivity)
                        }
                        launchPlayer(MeggyApp.BASE_URL + clickedVideo.link, videoName, folderPath)
                        return@launch
                    }
                }
            }

            val intent = Intent(this@HomeActivity, BrowseActivity::class.java)
            intent.putExtra("drivePath", folderPath)
            intent.putExtra("folderName", shortFolder)
            startActivity(intent)
        }
    }

    private fun launchPlayer(url: String, title: String, folderPath: String) {
        SessionManager.get(this).saveLastWatched(folderPath, title)
        SessionManager.get(this).addRecent(folderPath, title)
        val intent = Intent(this, PlayerActivity::class.java)
        intent.putExtra(PlayerActivity.EXTRA_URL, url)
        intent.putExtra(PlayerActivity.EXTRA_TITLE, title)
        intent.putExtra(PlayerActivity.EXTRA_FOLDER_PATH, folderPath)
        startActivity(intent)
    }

    private fun setupDrivesRail() {
        binding.railDrives.layoutManager =
            LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false)
        binding.railDrives.addItemDecoration(RailGutterDecoration(8))
        binding.railDrives.adapter = DriveRailAdapter(DriveItem.ALL) { drive -> openDrive(drive) }
    }

    private fun openDrive(drive: DriveItem) {
        val intent = Intent(this, BrowseActivity::class.java)
        intent.putExtra("drivePath", "/${drive.index}:/")
        intent.putExtra("folderName", drive.name)
        startActivity(intent)
    }

    private fun logout() {
        SessionManager.get(this).clearSession()
        PlaylistManager.clear()
        val intent = Intent(this, LoginActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        finish()
    }

    override fun onDestroy() {
        super.onDestroy()
        heroRotator?.stop()
    }

    /**
     * v1.8.0 — Horizontal gutter between rail items so the pink focus
     * halo isn't clipped by the next card.
     */
    private class RailGutterDecoration(private val gutterDp: Int) : RecyclerView.ItemDecoration() {
        override fun getItemOffsets(
            outRect: Rect, view: View, parent: RecyclerView, state: RecyclerView.State
        ) {
            val density = view.resources.displayMetrics.density
            val px = (gutterDp * density).toInt()
            outRect.right = px
            if (parent.getChildAdapterPosition(view) == 0) outRect.left = 0
        }
    }
}
