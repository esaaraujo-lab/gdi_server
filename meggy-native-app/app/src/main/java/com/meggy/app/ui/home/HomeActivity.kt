package com.meggy.app.ui.home

import android.content.Intent
import android.graphics.Rect
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.animation.AlphaAnimation
import android.view.animation.AnimationSet
import android.view.animation.DecelerateInterpolator
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.meggy.app.BuildConfig
import com.meggy.app.MeggyApp
import com.meggy.app.R
import com.meggy.app.data.ApiService
import com.meggy.app.data.DriveItem
import com.meggy.app.data.HeroItem
import com.meggy.app.databinding.ActivityHomeBinding
import com.meggy.app.ui.browse.BrowseActivity
import com.meggy.app.ui.detail.DetailActivity
import com.meggy.app.ui.login.LoginActivity
import com.meggy.app.ui.mylist.MyListActivity
import com.meggy.app.ui.player.PlayerActivity
import com.meggy.app.ui.search.SearchActivity
import com.meggy.app.ui.settings.SettingsActivity
import com.meggy.app.data.monogramFor
import com.meggy.app.util.AuthHelper
import com.meggy.app.util.CrossFolderPlaylist
import com.meggy.app.util.PlaylistManager
import com.meggy.app.util.SessionManager
import com.meggy.app.util.Format
import com.meggy.app.util.TvUtils
import com.meggy.app.util.FocusAnimator
import com.meggy.app.util.setWordEllipsized
import com.meggy.app.util.UpdateChecker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class HomeActivity : AppCompatActivity() {

    private lateinit var binding: ActivityHomeBinding
    private lateinit var api: ApiService
    private var heroRotator: HeroRotator? = null
    private var lastFocusContinue = 0
    private var lastFocusDrives = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityHomeBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // ★ v2.0.2: If the session was cleared (e.g. by Settings → Sair or by
        // BrowseActivity detecting an expired cookie), finish() immediately.
        // The launch flow will re-route through SplashActivity → LoginActivity.
        // We do NOT startActivity(Login) here because that would re-introduce
        // the back-stack bug where Login could be reached by pressing back.
        if (!SessionManager.get(this).isLoggedIn) {
            finish()
            return
        }

        api = ApiService(this)
        // v2.7.6: checagem com throttle (máx. 1×/24h) + resume de APK
        // pendente — ver UpdateChecker.checkForUpdateThrottled.
        UpdateChecker.checkForUpdateThrottled(this, BuildConfig.VERSION_NAME)

        // ★ v1.8.0: dynamic version footer (sem emoji, v2.7.6)
        binding.footerVersion.text = "Meggy · v${BuildConfig.VERSION_NAME}"

        // v2.7.6: TV não tem bottom nav.
        if (TvUtils.isTv(this)) binding.bottomNav.visibility = View.GONE

        binding.topSair.setOnClickListener { logout() }

        // ★ v2.0.2: Bottom navigation — NO finish() on tab switch.
        // Each nav activity is declared with launchMode="singleTask" in the
        // manifest, so startActivity() brings the existing instance to front
        // (or creates a new one) AND clears activities above it. This keeps
        // the back stack clean: back from any tab always returns to Home,
        // and back from Home exits the app (never returns to Login).
        binding.bottomNav.selectedItemId = R.id.nav_home
        binding.bottomNav.setOnItemSelectedListener { item ->
            when (item.itemId) {
                R.id.nav_home -> true
                R.id.nav_search -> {
                    startActivity(Intent(this, SearchActivity::class.java))
                    overridePendingTransition(0, 0)
                    // Do NOT finish() — singleTask on SearchActivity handles
                    // back-stack cleanup automatically.
                    true
                }
                R.id.nav_mylist -> {
                    startActivity(Intent(this, MyListActivity::class.java))
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

        setupHero()
        setupContinueRail()
        setupDrivesRail()
    }

    override fun onResume() {
        super.onResume()
        // v2.7.6: re-checa atualização ao voltar (throttle 1×/24h) e
        // restaura o foco nos rails (TV).
        UpdateChecker.checkForUpdateThrottled(this, BuildConfig.VERSION_NAME)
        if (TvUtils.isTv(this)) {
            binding.railContinue.post {
                binding.railContinue.findViewHolderForAdapterPosition(lastFocusContinue)
                    ?.itemView?.requestFocus()
            }
            // v2.7.7: mesmo para o rail de drives — sem isso, voltar de um
            // detalhe de drive perdia o foco do tile do drive na TV.
            binding.railDrives.post {
                binding.railDrives.findViewHolderForAdapterPosition(lastFocusDrives)
                    ?.itemView?.requestFocus()
            }
        }
    }

    // ★ v2.0.2: If HomeActivity is brought back to front (singleTask), ensure
    // the bottom nav highlights the Home tab. This handles the case where the
    // user navigated Home → Search → back → Home.
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        binding.bottomNav.selectedItemId = R.id.nav_home
    }

    // ──────────── v2.0.0: Hero rotativo ────────────

    private fun setupHero() {
        heroRotator = HeroRotator(binding, HeroItem.ALL) { hero ->
            val intent = Intent(this, BrowseActivity::class.java)
            intent.putExtra("drivePath", hero.drivePath)
            intent.putExtra("folderName", hero.driveName)
            startActivity(intent)
        }
        heroRotator?.start()
    }

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

        fun start() { handler.postDelayed(rotateRunnable, 8000L) }
        fun stop() { handler.removeCallbacks(rotateRunnable) }

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
            binding.heroTitle.setWordEllipsized(item.title)
            binding.heroSubtitle.setWordEllipsized(item.subtitle)
            // v2.7.6: monograma (sem emoji) — não há foto de hero nos dados.
            binding.heroIcon.text = monogramFor(item.title)
            updateDots()
            if (animate) {
                val inn = AlphaAnimation(0f, 1f).apply { duration = 300 }
                val set = AnimationSet(true).apply {
                    interpolator = DecelerateInterpolator()
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
                // ★ v2.7.4: bolinha clicável — salta para o slide.
                val dot = TextView(binding.root.context).apply {
                    text = "•"
                    textSize = 18f
                    setTextColor(0x66FFFFFF)
                    setPadding(6, 0, 6, 0)
                    isClickable = true
                    isFocusable = true
                    setOnClickListener {
                        index = i
                        render(animate = true)
                        handler.removeCallbacks(rotateRunnable)
                        handler.postDelayed(rotateRunnable, 8000L)
                    }
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

        // ★ v2.5.0: Show the COURSE NAME (not the folder path) as subtitle.
        // extractCourseName() returns a human-friendly label like
        // "PF - Agente" or "DirAdmin" depending on the path depth.
        val railItems = recents.map { r ->
            val courseName = extractCourseName(r.folderPath)
            RailItem(
                title = r.videoName,
                subtitle = courseName,
                icon = "🎥",
                hasProgress = sm.hasResume(r.folderPath, r.videoName),
                progress = sm.getResumeProgress(r.folderPath, r.videoName),
                isWatched = sm.isWatched(r.folderPath, r.videoName),
                hasResume = sm.hasResume(r.folderPath, r.videoName),
                // v2.7.6: thumb fotográfica do recent (salva pelo player).
                thumbnailUrl = r.thumbnailLink,
                // ★ v2.7.4: FileItem para a ⭐ da Minha lista.
                file = com.meggy.app.data.FileItem(
                    name = r.videoName, mimeType = "video/mp4", id = "",
                    driveId = null, link = null, size = 0L, modifiedTime = null,
                    folderPath = r.folderPath
                )
            )
        }
        binding.railContinue.adapter = RailAdapter(railItems) { item ->
            lastFocusContinue = railItems.indexOf(item)
            val match = recents.find { it.videoName == item.title } ?: return@RailAdapter
            continueWatching(match.folderPath, match.videoName, item.subtitle)
        }
        setupFeaturedContinue(recents)
    }

    /**
     * v2.7.6 — "Continuar de onde parou" em destaque (conceito TV
     * continuar): o item em andamento mais recente, com thumb,
     * progresso e "12:34 de 48:20 · 12 min restantes". Só na TV
     * (no celular o rail "Continue assistindo" já cumpre o papel).
     */
    private fun setupFeaturedContinue(recents: List<SessionManager.RecentItem>) {
        val sm = SessionManager.get(this)
        if (!TvUtils.isTv(this)) {
            binding.featuredSection.visibility = View.GONE
            return
        }
        val best = recents
            .filter { sm.hasResume(it.folderPath, it.videoName) }
            .maxByOrNull { sm.getResumeProgress(it.folderPath, it.videoName) }
        if (best == null) {
            binding.featuredSection.visibility = View.GONE
            return
        }
        val progress = sm.getResumeProgress(best.folderPath, best.videoName)
        val pos = sm.getResume(best.folderPath, best.videoName)
        val dur = sm.getResumeDuration(best.folderPath, best.videoName)
        binding.featuredSection.visibility = View.VISIBLE
        binding.featuredTitle.setWordEllipsized(best.videoName)
        binding.featuredSubtitle.setWordEllipsized(extractCourseName(best.folderPath))
        binding.featuredProgress.progress = progress
        binding.featuredProgressText.text = "$progress% concluído"
        binding.featuredTimeText.text = Format.positionText(pos, dur)
        binding.featuredMonogram.text = monogramFor(best.videoName)
        if (!best.thumbnailLink.isNullOrBlank()) {
            binding.featuredThumb.visibility = View.VISIBLE
            binding.featuredMonogram.visibility = View.GONE
            binding.featuredThumb.load(best.thumbnailLink) {
                error(com.meggy.app.R.drawable.card_gradient_pink)
            }
        } else {
            binding.featuredThumb.visibility = View.GONE
            binding.featuredMonogram.visibility = View.VISIBLE
        }
        binding.featuredContinue.setOnClickListener {
            continueWatching(best.folderPath, best.videoName, extractCourseName(best.folderPath))
        }
        // v2.7.10 — o CARD GRANDE e o alvo do foco na TV: clicavel e
        // focavel, com FocusAnimator.attachCard (anel 3dp da marca +
        // escala 1.10x + elevacao). Antes so o botao interno era
        // focavel e o fundo dele (btn_primary_pill, shape estatico)
        // nao tinha estado de foco — por isso o Elton nao via
        // feedback nenhum no card de "Continuar de onde parou".
        // O botao continua clicavel por toque; o foco D-pad vai para
        // o card (o layout TV usa descendantFocusability=
        // blocksDescendants). O card nao e reciclado (view fixa da
        // Home), entao o attach nao depende de rebind.
        binding.featuredCard.setOnClickListener {
            continueWatching(best.folderPath, best.videoName, extractCourseName(best.folderPath))
        }
        FocusAnimator.attachCard(binding.featuredCard, true)
    }

    /**
     * v2.5.1 — Extracts the REAL course name from a folder path.
     *
     * PROBLEM: Paths often have generic intermediate buckets like:
     *   "/0:/0 DIVERSOS/Cursos e Cursinhos Completo/Leilão Vendas e Cripto/Mercado Livre/Módulo 01/Aula 01.mp4"
     *
     * The COURSE is "Mercado Livre" — it's the last REAL segment BEFORE
     * module/lesson patterns start.
     *
     * HEURISTIC:
     *   1. Split path, skip drive index ("0:", "9:", etc.)
     *   2. Walk segments from DEEPEST to SHALLOWEST.
     *   3. Skip segments that are modules/lessons (MÓDULO 1, AULA 01, 001 - X).
     *   4. Skip segments that are too short (< 3 chars: "I", "A", "Sub").
     *   5. The FIRST non-skipped segment (deepest) is the COURSE name.
     *   6. If all are skipped, return the deepest segment (fallback).
     *
     * Examples:
     *   "/0:/0 DIVERSOS/Leilão/Mercado Livre/Módulo 1/Sub/Aula.mp4" → "Mercado Livre"
     *   "/0:/PF - Agente/Curso X/Bloco I/DirAdmin/001 - PODERES/" → "DirAdmin"
     *   "/9:/Tribunal Regional/TRT 3ª Região/Aulas/" → "TRT 3ª Região"
     */
    private fun extractCourseName(folderPath: String): String {
        val segments = folderPath.trim('/').split('/').filter { it.isNotBlank() }
        if (segments.isEmpty()) return folderPath

        // Skip drive index ("0:", "9:", etc.)
        val startIdx = if (segments[0].matches(Regex("^\\d+:$"))) 1 else 0
        val pathSegments = segments.drop(startIdx)
        if (pathSegments.isEmpty()) return segments.last()

        /**
         * Returns true if a segment is a MODULE or LESSON or GENERIC bucket
         * (not a course name). These are skipped when searching for the course.
         */
        fun isModuleOrLesson(seg: String): Boolean {
            val lower = seg.trim().lowercase()
            // Module/lesson patterns: "MÓDULO 1", "AULA 01", "BLOCO I", "PARTE 1"
            if (lower.matches(Regex("^(módulo|modulo|aula|bloco|parte|capítulo|capitulo|unidade|topico|tópico)\\s*\\d+.*"))) return true
            // Numbered prefix: "001 - PODERES", "01 - INTRODUÇÃO" (lesson names)
            if (seg.matches(Regex("^\\d{2,}\\s*[-–].*"))) return true
            // Pure number: "001", "2026", "1"
            if (seg.matches(Regex("^\\d+$"))) return true
            // Too short to be a course name (less than 3 chars): "I", "A", "1A", "Sub"
            if (seg.trim().length < 3) return true
            // GENERIC bucket names — organizational folders, NOT courses
            val GENERIC = setOf(
                "diversos", "vídeos", "videos", "aulas", "aulão", "aulao",
                "curso", "cursos", "cursinho", "cursinhos", "completo", "completos",
                "módulos", "modulos", "modulo", "módulo", "bloco", "blocos",
                "material", "materiais", "apostila", "apostilas", "pdf", "pdfs",
                "plataforma", "plataformas", "novidades", "atualizado", "atualizados",
                "sub", "subs", "subpasta", "subpastas", "geral", "extra", "extras",
                "provas", "exercícios", "exercicios", "questões", "questoes",
                "leilão vendas e cripto", "leilao vendas e cripto",
                "cursos e cursinhos completo", "cursos e cursinhos",
                "retas final", "reta final", "retafinal",
                "2024", "2025", "2026", "2027"
            )
            if (lower in GENERIC) return true
            // "0 DIVERSOS", "1 VÍDEOS", "2 AULAS" — starts with number + space
            if (seg.matches(Regex("^\\d+\\s+.*"))) return true
            // Ends with file extension (it's a file, not a folder): .mp4, .mp3, .pdf
            if (lower.matches(Regex("^.*\\.(mp4|mkv|webm|mov|avi|mp3|m4a|aac|ogg|wav|flac|pdf)$"))) return true
            return false
        }

        // Walk from DEEPEST to SHALLOWEST, skip modules/lessons, return first real segment.
        // This finds the course name = the deepest folder that isn't a module/lesson bucket.
        for (seg in pathSegments.reversed()) {
            if (!isModuleOrLesson(seg)) {
                return seg
            }
        }

        // Fallback: all segments were modules/lessons → return the deepest one
        return pathSegments.last()
    }

    /**
     * v2.5.0 — Returns the IMMEDIATE PARENT folder path of a video.
     *
     * For cross-folder playlists, the video lives in a subfolder like:
     *   "/0:/PF - Agente/Curso/Bloco I/DirAdmin/001 - PODERES/"
     *
     * When the user clicks "Continue", we want to open the DetailActivity
     * for the IMMEDIATE PARENT folder (e.g. "001 - PODERES") so they land
     * in the right place — not the course root or a random subfolder.
     *
     * If the parent folder contains many videos, we still open it — the
     * DetailActivity's grid will show them and the user can scroll to the
     * one they were watching.
     */
    private fun immediateParentPath(folderPath: String): Pair<String, String> {
        val segments = folderPath.trim('/').split('/').filter { it.isNotBlank() }
        if (segments.isEmpty()) return "/" to "Meggy"
        // Rebuild the path with trailing slash
        val path = "/" + segments.joinToString("/") + "/"
        val name = segments.last()
        return path to name
    }

    private fun continueWatching(folderPath: String, videoName: String, shortFolder: String) {
        // ★ v2.3.1: Show visual feedback immediately so the user knows the tap registered.
        com.google.android.material.snackbar.Snackbar.make(
            binding.root, "Carregando \"$videoName\"...", com.google.android.material.snackbar.Snackbar.LENGTH_SHORT
        ).show()

        lifecycleScope.launch {
            val files = withContext(Dispatchers.IO) { api.listFolder(folderPath) }

            // ★ v2.1.0: Use AuthHelper for consistent expired-session handling.
            if (files == null) {
                AuthHelper.bounceToLogin(this@HomeActivity)
                return@launch
            }

            if (files.isNotEmpty()) {
                val clickedVideo = files.find { it.name == videoName && (it.isVideo || it.isAudio) }

                if (clickedVideo != null && !clickedVideo.link.isNullOrEmpty()) {
                    val playable = files.filter { (it.isVideo || it.isAudio) && !it.link.isNullOrEmpty() }

                    if (playable.size > 1) {
                        val idx = playable.indexOfFirst { it.name == videoName }
                        PlaylistManager.setPlaylist(playable, if (idx >= 0) idx else 0, this@HomeActivity)
                        launchPlayer(MeggyApp.BASE_URL + clickedVideo.link, videoName, folderPath, clickedVideo.thumbnailLink)
                        return@launch
                    } else {
                        val result = withContext(Dispatchers.IO) {
                            CrossFolderPlaylist.build(folderPath, clickedVideo, api)
                        }
                        if (result.items.isNotEmpty()) {
                            PlaylistManager.setPlaylist(result.items, result.startIndex, this@HomeActivity)
                        }
                        launchPlayer(MeggyApp.BASE_URL + clickedVideo.link, videoName, folderPath, clickedVideo.thumbnailLink)
                        return@launch
                    }
                }
            }

            // ★ v2.5.0: If the video isn't in the folder (e.g. cross-folder where
            // the video name is "video.mp4" in a different subfolder), open the
            // IMMEDIATE PARENT folder in DetailActivity — that's where the user
            // was watching. The DetailActivity's "Continue de onde parou" rail
            // will show the video at the top.
            val (parentPath, parentName) = immediateParentPath(folderPath)
            val intent = Intent(this@HomeActivity, DetailActivity::class.java)
            intent.putExtra("drivePath", parentPath)
            intent.putExtra("folderName", parentName)
            startActivity(intent)
        }
    }

    private fun launchPlayer(url: String, title: String, folderPath: String, thumbnailLink: String? = null) {
        SessionManager.get(this).saveLastWatched(folderPath, title)
        // Patch: passa a thumb do vídeo (quando conhecida) para o recent,
        // para o card "Continue assistindo" mostrar a foto em vez do monograma.
        SessionManager.get(this).addRecent(folderPath, title, thumbnailLink)
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
        binding.railDrives.adapter = DriveRailAdapter(DriveItem.ALL) { drive ->
            lastFocusDrives = DriveItem.ALL.indexOf(drive)
            openDrive(drive)
        }
    }

    private fun openDrive(drive: DriveItem) {
        // ★ v2.1.0: Open DetailActivity (Netflix-style hero) instead of BrowseActivity.
        val intent = Intent(this, DetailActivity::class.java)
        intent.putExtra("drivePath", "/${drive.index}:/")
        intent.putExtra("folderName", drive.name)
        startActivity(intent)
    }

    /**
     * v2.0.2 — Clears the session and routes to LoginActivity with CLEAR_TASK
     * so the entire back stack is wiped. Used ONLY by the "Sair" button
     * (logout()), so it is a FULL logout (wipes username + password).
     * Session expiry uses AuthHelper.bounceToLogin() instead, which keeps
     * the saved password so the user does not have to retype it.
     */
    private fun bounceToLogin() {
        // ★ v2.7.5: logout completo — ver SettingsActivity.logout().
        SessionManager.get(this).fullLogout()
        PlaylistManager.clear()
        val intent = Intent(this, LoginActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        finish()
    }

    private fun logout() {
        bounceToLogin()
    }

    override fun onDestroy() {
        super.onDestroy()
        heroRotator?.stop()
    }

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
