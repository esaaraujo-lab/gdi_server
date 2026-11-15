package com.bibigyn.app.ui.home

import android.content.Intent
import android.graphics.Rect
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.MotionEvent
import android.view.View
import android.view.animation.AlphaAnimation
import android.view.animation.AnimationSet
import android.view.animation.DecelerateInterpolator
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.LifecycleCoroutineScope
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.bibigyn.app.BuildConfig
import com.bibigyn.app.BiBiGynApp
import com.bibigyn.app.R
import com.bibigyn.app.data.ApiService
import com.bibigyn.app.data.DriveItem
import com.bibigyn.app.data.HeroItem
import com.bibigyn.app.databinding.ActivityHomeBinding
import com.bibigyn.app.ui.browse.BrowseActivity
import com.bibigyn.app.ui.detail.DetailActivity
import com.bibigyn.app.ui.login.LoginActivity
import com.bibigyn.app.ui.mylist.MyListActivity
import com.bibigyn.app.ui.player.PlayerActivity
import com.bibigyn.app.ui.search.SearchActivity
import com.bibigyn.app.ui.settings.SettingsActivity
import com.bibigyn.app.util.AuthHelper
import com.bibigyn.app.util.CrossFolderPlaylist
import com.bibigyn.app.util.CoverLibrary
import com.bibigyn.app.util.PlaylistManager
import com.bibigyn.app.util.SessionManager
import com.bibigyn.app.util.Format
import com.bibigyn.app.util.TvUtils
import com.bibigyn.app.util.FocusAnimator
import com.bibigyn.app.util.setWordEllipsized
import com.bibigyn.app.util.UpdateChecker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class HomeActivity : AppCompatActivity() {

    private lateinit var binding: ActivityHomeBinding
    private lateinit var api: ApiService
    private var heroRotator: HeroRotator? = null
    // v2.1.9: arte do hero por drivePath (primeiro vídeo do drive) —
    // 1 busca por drive, depois cache em memória até o app fechar.
    private val heroThumbCache = mutableMapOf<String, String?>()
    // Onda 2 (a) — capa do admin por coursePath (GET
    // /api/featured-courses → cover_url), carregada em 2º plano.
    private var featuredCoverByPath: Map<String, String> = emptyMap()
    private var drivesAdapter: DriveRailAdapter? = null
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
        // v2.1.5: checagem com throttle (máx. 1×/24h) + resume de APK
        // pendente — ver UpdateChecker.checkForUpdateThrottled.
        UpdateChecker.checkForUpdateThrottled(this, BuildConfig.VERSION_NAME)

        // ★ v1.8.0: dynamic version footer (sem emoji, v2.1.5)
        binding.footerVersion.text = "BiBi Fit · v${BuildConfig.VERSION_NAME}"

        // v2.1.5: TV não tem bottom nav.
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
        setupTvFocusChains()
        fetchFeaturedCovers()
        // Camada 3 — biblioteca de capas por tipo (Elton 2026-11-14
        // 19:50): busca o manifesto em 2º plano; quando chega,
        // re-aplica a arte do hero e redesenha os rails (os cards
        // passam a resolver a imagem da biblioteca). Sem URL / sem
        // rede / sem match, nada muda — e nunca há toast de erro.
        CoverLibrary.warmUp(this) {
            if (isFinishing || isDestroyed) return@warmUp
            heroRotator?.refreshArt()
            drivesAdapter?.notifyDataSetChanged()
            binding.railContinue.adapter?.notifyDataSetChanged()
            setupFeaturedContinue(SessionManager.get(this).getRecents())
        }
    }

    /**
     * Onda 2 (a) — busca as capas do admin (best-effort, silenciosa:
     * sem a rota/campo, o mapa fica vazio e a UI usa (b)/(c)). Quando
     * chega capa, atualiza os cards de drive e re-aplica a capa do
     * hero atual por cima da thumb/capa gerada que já está na tela.
     */
    private fun fetchFeaturedCovers() {
        lifecycleScope.launch {
            val courses = withContext(Dispatchers.IO) { api.getFeaturedCourses() }
                ?: return@launch
            val map = courses.mapNotNull { c ->
                val url = c.coverUrl?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
                c.coursePath to url
            }.toMap()
            if (map.isEmpty()) return@launch
            featuredCoverByPath = map
            drivesAdapter?.setFeaturedCovers(map)
            val current = heroRotator?.currentItem() ?: return@launch
            val cover = current.coverUrl?.takeIf { it.isNotBlank() }
                ?: map[current.drivePath] ?: return@launch
            binding.heroThumb.visibility = View.VISIBLE
            binding.heroThumb.load(cover) {
                error(R.drawable.card_gradient_pink)
            }
        }
    }

    /**
     * Onda 2 (c) — capa gerada do drive no hero (quando não há (a)
     * capa do admin nem (b) thumb do Drive). Só aplica se o hero
     * ainda for o atual.
     */
    private fun applyGeneratedHeroCover(hero: HeroItem) {
        // Camada 3 ESTRITA — biblioteca por tipo (título → drive → caminho):
        // sem ela, (4) capa gerada do drive (nunca o livro 'geral' — 2.1.11).
        val libraryUrl = CoverLibrary.resolveStrict(
            this, hero.title, hero.driveName, hero.drivePath
        )
        if (!libraryUrl.isNullOrBlank()) {
            if (heroRotator?.currentItem() != hero) return
            binding.heroThumb.visibility = View.VISIBLE
            binding.heroThumb.load(libraryUrl) {
                error(R.drawable.card_gradient_pink)
                listener(onError = { _, _ -> applyGeneratedDriveCover(hero) })
            }
            return
        }
        applyGeneratedDriveCover(hero)
    }

    private fun applyGeneratedDriveCover(hero: HeroItem) {
        val coverRes = DriveItem.coverResForPath(hero.drivePath) ?: return
        if (heroRotator?.currentItem() != hero) return
        binding.heroThumb.visibility = View.VISIBLE
        binding.heroThumb.load(coverRes)
    }

    override fun onResume() {
        super.onResume()
        // v2.1.9 (d) — CAUSA DA NAV DESENCONTRADA: voltar de Ajustes/
        // Minha lista com Back só resumia a Home (onResume), sem passar
        // pelo onNewIntent — e o selectedItemId ficava na aba anterior
        // (o toque nela já tinha movido a seleção antes de abrir a tela).
        // Por isso a home mostrava "Ajustes" destacado. Resetar aqui
        // garante "Início" selecionado sempre que a home está na frente.
        binding.bottomNav.selectedItemId = R.id.nav_home
        // v2.1.5: re-checa atualização ao voltar (throttle 1×/24h) e
        // restaura o foco nos rails (TV).
        UpdateChecker.checkForUpdateThrottled(this, BuildConfig.VERSION_NAME)
        if (TvUtils.isTv(this)) {
            binding.railContinue.post {
                binding.railContinue.findViewHolderForAdapterPosition(lastFocusContinue)
                    ?.itemView?.requestFocus()
            }
            // v2.1.6: mesmo para o rail de drives — sem isso, voltar de um
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
        heroRotator = HeroRotator(
            binding, HeroItem.ALL, api, lifecycleScope,
            onClick = { hero ->
                val intent = Intent(this, BrowseActivity::class.java)
                intent.putExtra("drivePath", hero.drivePath)
                intent.putExtra("folderName", hero.driveName)
                startActivity(intent)
            },
            onRenderArt = { hero ->
                // Onda 2 — hierarquia da capa do hero: (a) capa do
                // admin (HeroItem.coverUrl ou featuredCoverByPath),
                // (b) thumb do Drive (1º vídeo da pasta, onda 1),
                // (c) capa gerada do drive. Nunca monograma nem
                // gradiente liso como capa.
                val adminCover = hero.coverUrl?.takeIf { it.isNotBlank() }
                    ?: featuredCoverByPath[hero.drivePath]
                if (!adminCover.isNullOrBlank()) {
                    if (heroRotator?.currentItem() == hero) {
                        binding.heroThumb.visibility = View.VISIBLE
                        binding.heroThumb.load(adminCover) {
                            error(R.drawable.card_gradient_pink)
                        }
                    }
                } else {
                    lifecycleScope.launch {
                        val thumb = if (heroThumbCache.containsKey(hero.drivePath)) {
                            heroThumbCache[hero.drivePath]
                        } else {
                            fetchHeroThumb(hero.drivePath)
                                .also { heroThumbCache[hero.drivePath] = it }
                        }
                        // O usuário pode ter avançado o carrossel
                        // durante a busca — só aplica se o hero for
                        // o atual.
                        if (heroRotator?.currentItem() != hero) return@launch
                        if (thumb.isNullOrBlank()) {
                            applyGeneratedHeroCover(hero)
                            return@launch
                        }
                        binding.heroThumb.visibility = View.VISIBLE
                        binding.heroThumb.load(thumb) {
                            error(R.drawable.card_gradient_pink)
                            listener(onError = { _, _ ->
                                applyGeneratedHeroCover(hero)
                            })
                        }
                    }
                }
            }
        )
        heroRotator?.start()
    }

    /**
     * v2.1.9 (a) — thumb do primeiro vídeo do drive, para a arte do
     * hero. A raiz do drive em geral só tem pastas (cursos): nesse
     * caso desce UM nível, na primeira pasta. Máx. 2 listagens por
     * drive (1ª página, 100 itens), com cache em [heroThumbCache].
     * Null = sem vídeo com thumb no drive → gradiente escuro limpo.
     */
    private suspend fun fetchHeroThumb(drivePath: String): String? {
        val root = withContext(Dispatchers.IO) { api.listFolder(drivePath, maxPages = 1) }
            ?: return null
        root.firstOrNull { (it.isVideo || it.isAudio) && !it.thumbnailLink.isNullOrBlank() }
            ?.thumbnailLink?.let { return it }
        val firstFolder = root.firstOrNull { it.isFolder } ?: return null
        val sub = withContext(Dispatchers.IO) {
            api.listFolder("$drivePath${firstFolder.name}/", maxPages = 1)
        } ?: return null
        return sub.firstOrNull { (it.isVideo || it.isAudio) && !it.thumbnailLink.isNullOrBlank() }
            ?.thumbnailLink
    }

    /**
     * v2.1.9 — Hero no padrão do conceito: foto real (thumb do primeiro
     * vídeo do drive, via [onRenderArt]) + scrim escuro, chip de
     * destaque, título grande, pill "Explorar →". SEM monograma, SEM
     * setas rosas, SEM dots (fiel ao conceito). Troca por swipe
     * horizontal no card + avanço automático a cada 8s (mantido).
     * Sem arte no dado, o hero fica no gradiente escuro limpo.
     */
    private class HeroRotator(
        private val binding: ActivityHomeBinding,
        private val items: List<HeroItem>,
        private val api: ApiService,
        private val scope: LifecycleCoroutineScope,
        private val onClick: (HeroItem) -> Unit,
        private val onRenderArt: (HeroItem) -> Unit
    ) {
        private val handler = Handler(Looper.getMainLooper())
        private var index = 0
        private val rotateRunnable = Runnable { next() }
        private var downX = 0f
        private var downY = 0f

        init {
            binding.heroPlay.setOnClickListener { onClick(items[index]) }
            // Swipe horizontal no card troca o destaque (retorna false
            // para o clique no pill "Explorar →" continuar funcionando).
            binding.heroCard.setOnTouchListener { _, ev ->
                when (ev.action) {
                    MotionEvent.ACTION_DOWN -> { downX = ev.x; downY = ev.y }
                    MotionEvent.ACTION_UP -> {
                        val dx = ev.x - downX
                        val dy = ev.y - downY
                        if (kotlin.math.abs(dx) > 100f &&
                            kotlin.math.abs(dx) > kotlin.math.abs(dy)
                        ) {
                            if (dx < 0) next() else prev()
                        }
                    }
                }
                false
            }
            render(animate = false)
        }

        fun start() { handler.postDelayed(rotateRunnable, 8000L) }
        fun stop() { handler.removeCallbacks(rotateRunnable) }
        fun currentItem(): HeroItem = items[index]

        /** Re-aplica a arte do destaque atual (ex.: o manifesto da
         *  camada 3 acabou de chegar e um card pode trocar a capa
         *  gerada pela imagem da biblioteca). */
        fun refreshArt() { onRenderArt(items[index]) }

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
            // Arte: esconde a anterior e pede a do destaque atual
            // (o callback ignora o resultado se o índice mudou).
            binding.heroThumb.visibility = View.GONE
            onRenderArt(item)
            if (animate) {
                val inn = AlphaAnimation(0f, 1f).apply { duration = 300 }
                val set = AnimationSet(true).apply {
                    interpolator = DecelerateInterpolator()
                    addAnimation(inn)
                }
                binding.heroBadge.startAnimation(inn)
                binding.heroTitle.startAnimation(inn)
                binding.heroSubtitle.startAnimation(inn)
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
        // O rail é reconstruído pelo backfill de thumbs — sem a guarda,
        // a decoração de gutter duplicaria a cada reconstrução.
        if (binding.railContinue.itemDecorationCount == 0) {
            binding.railContinue.addItemDecoration(RailGutterDecoration(8))
        }

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
                // v2.1.5: thumb fotográfica do recent (salva pelo player).
                thumbnailUrl = r.thumbnailLink,
                // ★ v2.7.4: FileItem para a ⭐ da Minha lista.
                file = com.bibigyn.app.data.FileItem(
                    name = r.videoName, mimeType = "video/mp4", id = "",
                    driveId = null, link = null, size = 0L, modifiedTime = null,
                    folderPath = r.folderPath
                ),
                // v2.1.9 (b): ícone do drive p/ a arte de fallback
                // (sem thumb no Drive → arte do drive, nunca monograma).
                driveIcon = DriveItem.iconForPath(r.folderPath)
            )
        }
        // Frente A (TV) — o destaque ("Continuar de onde parou") só
        // existe quando há resume: calcula-se ANTES do adapter,
        // porque o nextFocusUp dos cards depende dele (o
        // setupFeaturedContinue corre depois e já não o corrige).
        val hasFeatured = TvUtils.isTv(this) &&
            recents.any { sm.hasResume(it.folderPath, it.videoName) }
        binding.railContinue.adapter = RailAdapter(
            railItems,
            nextFocusUpId = if (hasFeatured) R.id.featured_card else R.id.heroPlay,
            nextFocusDownId = R.id.railDrives
        ) { item ->
            lastFocusContinue = railItems.indexOf(item)
            val match = recents.find { it.videoName == item.title } ?: return@RailAdapter
            continueWatching(match.folderPath, match.videoName, item.subtitle)
        }
        setupFeaturedContinue(recents)
        // v2.1.9 (b) — BACKFILL: recents gravados antes da 2.1.9 (ou por
        // um caminho sem thumb) não têm thumbnailLink. Busca o thumb do
        // arquivo no Drive (1ª página da pasta) e o persiste via
        // addRecent — na próxima abertura o card já mostra a foto.
        // Só roda quando há recent sem thumb; ao preencher ao menos um,
        // reconstrói o rail 1x (os recents já têm thumb, sem loop).
        if (recents.any { it.thumbnailLink.isNullOrBlank() }) {
            lifecycleScope.launch { backfillRecentThumbs(recents) }
        }
    }

    private suspend fun backfillRecentThumbs(recents: List<SessionManager.RecentItem>) {
        val sm = SessionManager.get(this)
        var updated = false
        for (r in recents) {
            if (!r.thumbnailLink.isNullOrBlank()) continue
            val files = withContext(Dispatchers.IO) {
                api.listFolder(r.folderPath, maxPages = 1)
            } ?: continue
            val match = files.firstOrNull {
                it.name == r.videoName && !it.thumbnailLink.isNullOrBlank()
            } ?: continue
            sm.addRecent(r.folderPath, r.videoName, match.thumbnailLink)
            updated = true
        }
        if (updated) setupContinueRail()
    }

    /**
     * v2.1.5 — "Continuar de onde parou" em destaque (conceito TV
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
        // v2.1.9 (c): título limpo ("001 - aula.mp4" → tema/"Aula NN").
        binding.featuredTitle.setWordEllipsized(
            Format.lessonTitle(best.videoName, extractCourseName(best.folderPath))
        )
        binding.featuredSubtitle.setWordEllipsized(extractCourseName(best.folderPath))
        binding.featuredProgress.progress = progress
        binding.featuredProgressText.text = "$progress% concluído"
        binding.featuredTimeText.text = Format.positionText(pos, dur)
        // Onda 2 + camada 3 — "Continuar de onde parou": (b) thumb
        // do Drive; sem ela (ou se ela falhar), (3) biblioteca por
        // tipo, depois (4) capa gerada do drive; a arte do drive
        // (ícone) só aparece quando não há capa gerada para o drive.
        val featuredCoverRes = DriveItem.coverResForPath(best.folderPath)
        binding.featuredDriveArt.text = DriveItem.iconForPath(best.folderPath)
        if (!best.thumbnailLink.isNullOrBlank()) {
            binding.featuredThumb.visibility = View.VISIBLE
            binding.featuredDriveArt.visibility = View.GONE
            binding.featuredThumb.load(best.thumbnailLink) {
                error(featuredCoverRes
                    ?: com.bibigyn.app.R.drawable.card_gradient_pink)
                listener(onError = { _, _ ->
                    showFeaturedFallback(best, featuredCoverRes)
                })
            }
        } else {
            showFeaturedFallback(best, featuredCoverRes)
        }
        binding.featuredContinue.setOnClickListener {
            continueWatching(best.folderPath, best.videoName, extractCourseName(best.folderPath))
        }
        // v2.1.8 — o CARD GRANDE e o alvo do foco na TV: clicavel e
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
     * Camada 3 → 4 no "Continuar de onde parou": (3) imagem da
     * biblioteca por tipo (nome da aula → curso → caminho), depois
     * (4) capa gerada do drive. (3) estrita — sem 'geral' (2.1.11).
     */
    private fun showFeaturedFallback(
        best: SessionManager.RecentItem,
        featuredCoverRes: Int?
    ) {
        val libraryUrl = CoverLibrary.resolveStrict(
            this, best.videoName,
            extractCourseName(best.folderPath), best.folderPath
        )
        if (!libraryUrl.isNullOrBlank()) {
            binding.featuredThumb.visibility = View.VISIBLE
            binding.featuredDriveArt.visibility = View.GONE
            binding.featuredThumb.load(libraryUrl) {
                error(featuredCoverRes
                    ?: com.bibigyn.app.R.drawable.card_gradient_pink)
                listener(onError = { _, _ ->
                    showFeaturedGenerated(featuredCoverRes)
                })
            }
            return
        }
        showFeaturedGenerated(featuredCoverRes)
    }

    private fun showFeaturedGenerated(featuredCoverRes: Int?) {
        if (featuredCoverRes != null) {
            binding.featuredThumb.visibility = View.VISIBLE
            binding.featuredDriveArt.visibility = View.GONE
            binding.featuredThumb.load(featuredCoverRes)
        } else {
            binding.featuredThumb.visibility = View.GONE
            binding.featuredDriveArt.visibility = View.VISIBLE
        }
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
        if (segments.isEmpty()) return "/" to "BiBi Fit"
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
                        launchPlayer(BiBiGynApp.BASE_URL + clickedVideo.link, videoName, folderPath, clickedVideo.thumbnailLink)
                        return@launch
                    } else {
                        val result = withContext(Dispatchers.IO) {
                            CrossFolderPlaylist.build(folderPath, clickedVideo, api)
                        }
                        if (result.items.isNotEmpty()) {
                            PlaylistManager.setPlaylist(result.items, result.startIndex, this@HomeActivity)
                        }
                        launchPlayer(BiBiGynApp.BASE_URL + clickedVideo.link, videoName, folderPath, clickedVideo.thumbnailLink)
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

    /**
     * Frente A (TV) — cadeias D-pad explícitas da home (só TV).
     * Do hero: DOWN vai ao destaque quando existe, senão ao rail
     * visível de cima; do destaque: UP volta ao hero, DOWN vai ao
     * rail visível de cima. Sem isto, o FocusFinder decide sozinho
     * entre secções que estão fora do viewport do ScrollView.
     */
    private fun setupTvFocusChains() {
        if (!TvUtils.isTv(this)) return
        val featuredVisible = binding.featuredSection.visibility == View.VISIBLE
        val continueVisible = binding.railContinue.visibility == View.VISIBLE
        binding.heroPlay.nextFocusDownId =
            if (featuredVisible) R.id.featured_card
            else if (continueVisible) R.id.railContinue
            else R.id.railDrives
        binding.featuredCard.nextFocusUpId = R.id.heroPlay
        binding.featuredCard.nextFocusDownId =
            if (continueVisible) R.id.railContinue else R.id.railDrives
    }

    private fun setupDrivesRail() {
        binding.railDrives.layoutManager =
            LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false)
        binding.railDrives.addItemDecoration(RailGutterDecoration(8))
        // Frente A (TV) — UP do tile de drive volta ao rail de cima
        // ("Continue assistindo", destaque ou hero — o que existir).
        val drivesUpId = when {
            binding.railContinue.visibility == View.VISIBLE -> R.id.railContinue
            binding.featuredSection.visibility == View.VISIBLE -> R.id.featured_card
            else -> R.id.heroPlay
        }
        drivesAdapter = DriveRailAdapter(
            DriveItem.ALL, featuredCoverByPath,
            nextFocusUpId = drivesUpId
        ) { drive ->
            lastFocusDrives = DriveItem.ALL.indexOf(drive)
            openDrive(drive)
        }
        binding.railDrives.adapter = drivesAdapter
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
