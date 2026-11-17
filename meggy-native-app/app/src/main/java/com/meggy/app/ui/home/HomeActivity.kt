package com.meggy.app.ui.home

import android.content.Intent
import android.graphics.Rect
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.TypedValue
import android.view.MotionEvent
import android.view.View
import android.view.ViewTreeObserver
import android.widget.TextView
import android.view.animation.AlphaAnimation
import android.view.animation.AnimationSet
import android.view.animation.DecelerateInterpolator
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.meggy.app.BuildConfig
import com.meggy.app.MeggyApp
import com.meggy.app.R
import com.meggy.app.data.AdminDrive
import com.meggy.app.data.ApiService
import com.meggy.app.data.DriveItem
import com.meggy.app.data.FileItem
import com.meggy.app.data.HeroItem
import com.meggy.app.databinding.ActivityHomeBinding
import com.meggy.app.ui.browse.BrowseActivity
import com.meggy.app.ui.detail.DetailActivity
import com.meggy.app.ui.login.LoginActivity
import com.meggy.app.ui.mylist.MyListActivity
import com.meggy.app.ui.player.PlayerActivity
import com.meggy.app.ui.search.SearchActivity
import com.meggy.app.ui.settings.SettingsActivity
import com.meggy.app.util.AuthHelper
import com.meggy.app.util.AdminDriveUi
import com.meggy.app.util.DriveRailItem
import com.meggy.app.util.PlaylistManager
import com.meggy.app.util.SessionManager
import com.meggy.app.util.TapFeedback
import com.meggy.app.util.Format
import com.meggy.app.util.ThumbArt
import com.meggy.app.util.LibraryCovers
import com.meggy.app.util.TvUtils
import com.meggy.app.util.TvAutoFit
import com.meggy.app.util.FocusAnimator
import com.meggy.app.util.setWordEllipsized
import com.meggy.app.util.UpdateChecker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class HomeActivity : AppCompatActivity() {

    private lateinit var binding: ActivityHomeBinding
    // Ronda 7 Frente B — ajuste medido da home da TV (TvAutoFit).
    // Nulo no celular (a home do celular nao usa nada disto).
    private var tvAutoFit: TvAutoFit.Fit? = null
    private lateinit var api: ApiService
    private var heroRotator: HeroRotator? = null
    // Onda 2 (a) — capa do admin por drivePath (GET
    // /api/featured-courses → cover_url), carregada em 2º plano.
    private var featuredCoverByPath: Map<String, String> = emptyMap()
    // Ronda 10 Frente C — drives do admin p/ este APK (GET
    // /api/admin-drives, filtrados por targetApps) + itens do
    // rail (fixos + admin) na ordem em que aparecem na Home.
    private var adminDrives: List<AdminDrive> = emptyList()
    // Ronda 13 Frente C — fonte de verdade do servidor: null = o
    // GET /api/admin-drives ainda nao respondeu ou falhou (fallback
    // p/ DriveItem.ALL); nao-null = a lista do servidor SUBSTITUI
    // DriveItem.ALL (ja filtrada por targetApps p/ este APK).
    private var serverDrives: List<AdminDrive>? = null
    // Capas do servidor p/ os drives fixos ("/N:/" -> URL), p/ fundir
    // com as capas dos cursos em destaque (ver buildDriveRailItems).
    private var serverCoverByPath: Map<String, String> = emptyMap()
    private var driveRailItems: List<DriveRailItem> = emptyList()
    private var drivesAdapter: DriveRailAdapter? = null
    // v2.7.11 camada (3) — recents p/ re-aplicar o destaque da TV
    // quando o manifesto da biblioteca chega (onReady).
    private var homeRecents: List<SessionManager.RecentItem> = emptyList()
    private val libraryReadyListener: () -> Unit = {
        if (!isFinishing && !isDestroyed) {
            heroRotator?.refreshHeroArt()
            // Ronda 17 Frente B (gatilho C) — o manifesto redesenha só
            // os itens visíveis, com o foco/rolagem repostos: sem
            // re-bind total a meio da navegação.
            val snap = captureHomeFocus()
            refreshVisibleItems(binding.railContinue)
            refreshVisibleItems(binding.railDrives)
            // Ronda 18 Frente C (F3) — o manifesto só re-liga os
            // itens visíveis (sem desanexar holders); o restauro só
            // se agenda quando o snapshot tem mesmo algo a repor
            // (nada focado + scroll 0 = nada a fazer).
            if (snap.target != 0 || snap.scrollY > 0) restoreHomeFocus(snap)
            setupFeaturedContinue(homeRecents)
        }
    }
    private var lastFocusContinue = -1
    private var lastFocusDrives = -1
    // Ronda 18 Frente C (F3) — geração do restauro de foco/rolagem:
    // cada restoreHomeFocus() carimba a sua geração e os post{} só
    // actuam se ainda for a actual. O foco (D-pad) ou um toque depois
    // do snapshot invalida o restauro pendente — o utilizador já
    // navegou, não se repõe nada por cima dele.
    private var focusRestoreGeneration = 0
    private var pendingFocusRestore: HomeFocusSnapshot? = null
    // Ronda 17 Frente B — rail "Continue assistindo" criado UMA só
    // vez (o onResume só actualiza os dados); último rail focado
    // (0 = nenhum, 1 = Continue, 2 = Drives) + scrollY guardado
    // para restauro após morte do processo (onSaveInstanceState).
    // Ver o observador global de foco (globalFocusListener).
    private var continueAdapter: RailAdapter? = null
    private var lastFocusedRail = 0
    private var savedScrollY = 0
    private var isFirstResume = true
    private var focusObserver: ViewTreeObserver? = null
    private var focusListenerRegistered = false
    private val globalFocusListener = ViewTreeObserver.OnGlobalFocusChangeListener { _, newFocus ->
        val view = newFocus ?: return@OnGlobalFocusChangeListener
        val continuePos = adapterPositionIn(binding.railContinue, view)
        if (continuePos != null) {
            lastFocusContinue = continuePos
            lastFocusedRail = 1
            invalidateStaleFocusRestore(1, continuePos)
            return@OnGlobalFocusChangeListener
        }
        val drivesPos = adapterPositionIn(binding.railDrives, view)
        if (drivesPos != null) {
            lastFocusDrives = drivesPos
            lastFocusedRail = 2
            invalidateStaleFocusRestore(2, drivesPos)
            return@OnGlobalFocusChangeListener
        }
        lastFocusedRail = 0
        invalidateStaleFocusRestore(0, -1)
    }

    /**
     * Ronda 18 Frente C (F3) — um restauro de foco/rolagem pendente só
     * vale enquanto o foco não saiu do sítio para onde ele ia repor:
     * se o utilizador já navegou para outro alvo, o restauro é
     * cancelado (a geração avança e os post{} agendados ignoram-se
     * quando correm). O restauro que repõe o próprio alvo não se
     * cancela a si mesmo.
     */
    private fun invalidateStaleFocusRestore(target: Int, pos: Int) {
        val pending = pendingFocusRestore ?: return
        if (pending.target == target && pending.pos == pos) return
        pendingFocusRestore = null
        focusRestoreGeneration++
    }

    /** Ronda 18 Frente C (F3) — um toque também invalida o restauro pendente. */
    private fun invalidatePendingFocusRestore() {
        if (pendingFocusRestore == null) return
        pendingFocusRestore = null
        focusRestoreGeneration++
    }

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
        // Ronda 17 Frente B — repõe o foco/rolagem guardados se a
        // activity foi recriada (morte do processo): o 1.º onResume
        // toma o caminho de restauro, não o da 1.ª abertura.
        savedInstanceState?.let {
            lastFocusContinue = it.getInt("r17b_focus_continue", -1)
            lastFocusDrives = it.getInt("r17b_focus_drives", -1)
            savedScrollY = it.getInt("r17b_scroll_y", 0)
            isFirstResume = false
        }
        // v2.7.6: checagem com throttle (máx. 1×/24h) + resume de APK
        // pendente — ver UpdateChecker.checkForUpdateThrottled.
        UpdateChecker.checkForUpdateThrottled(this, BuildConfig.VERSION_NAME)

        // ★ v1.8.0: dynamic version footer (sem emoji, v2.7.6)
        binding.footerVersion.text = "Meggy · v${BuildConfig.VERSION_NAME}"

        // v2.7.6: TV não tem bottom nav.
        if (TvUtils.isTv(this)) binding.bottomNav.visibility = View.GONE

        binding.topSair?.setOnClickListener { logout() }

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

        // Ronda 7 Frente B — medir o viewport ANTES de montar os
        // rails (o gutter do rail depende da escala). So TV.
        if (TvUtils.isTv(this)) tvAutoFit = TvAutoFit.forContext(this)
        setupHero()
        setupContinueRail()
        setupDrivesRail()
        setupTvFocusChains()
        applyTvAutoFit()
        fetchFeaturedCovers()
        // Ronda 10 Frente C — drives do admin (best-effort;
        // sem rota, o rail mostra só os fixos). Re-fetch no
        // onResume.
        fetchAdminDrives()
        // v2.7.11 camada (3) — busca o manifesto da biblioteca em
        // 2º plano; quando chegar, o listener re-aplica as capas.
        LibraryCovers.warmUp(this)
        LibraryCovers.addOnReadyListener(libraryReadyListener)
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
            val snap = captureHomeFocus()
            // Ronda 18 Frente C (F3) — idem fetchAdminDrives: só se
            // repõe quando alguma capa mudou E o snapshot tem algo
            // a repor.
            val coversChanged = drivesAdapter?.setFeaturedCovers(map + serverCoverByPath) ?: false
            if (coversChanged && (snap.target != 0 || snap.scrollY > 0)) restoreHomeFocus(snap)
            val current = heroRotator?.currentItem() ?: return@launch
            if (current.coverUrl?.isNotBlank() == true) return@launch
            if (map[current.drivePath].isNullOrBlank()) return@launch
            heroRotator?.refreshHeroArt()
        }
    }


    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        // Ronda 17 Frente B — foco real + scrollY sobrevivem à morte
        // do processo (o onCreate repõe-nos e o 1.º onResume restaura).
        outState.putInt("r17b_scroll_y", binding.homeScroll.scrollY)
        outState.putInt("r17b_focus_continue", lastFocusContinue)
        outState.putInt("r17b_focus_drives", lastFocusDrives)
    }

    // ──────────── Ronda 17 Frente B — foco + rolagem ────────────
    //
    // O foco REAL (D-pad) guarda-se com um observador GLOBAL de foco
    // (OnGlobalFocusChangeListener), não com setOnFocusChangeListener
    // na vista: o FocusAnimator é dono desse listener em cada card
    // (attach/attachCard) e sobrepô-lo matava o anel/escala de foco.
    // O observador regista-se no onResume — no onCreate a vista ainda
    // não está ligada à janela e o ViewTreeObserver seria o flutuante.
    // [lastFocusedRail]: 0 = nenhum, 1 = rail Continue, 2 = rail Drives.

    /** Foto instantânea do foco/rolagem actuais (antes de um re-bind). */
    private data class HomeFocusSnapshot(val target: Int, val pos: Int, val scrollY: Int)

    /** Posição do adapter do item que contém a vista focada (o foco
     *  pode estar num filho do card): sobe-se até ao filho directo
     *  do RecyclerView. null = o foco não está neste RecyclerView. */
    private fun adapterPositionIn(recyclerView: RecyclerView, focused: View): Int? {
        var v: View? = focused
        while (v != null && v != recyclerView) {
            val parent = v.parent
            if (parent === recyclerView) {
                val pos = recyclerView.getChildAdapterPosition(v)
                return if (pos != RecyclerView.NO_POSITION) pos else null
            }
            v = parent as? View
        }
        return null
    }

    private fun captureHomeFocus(): HomeFocusSnapshot {
        val y = binding.homeScroll.scrollY
        return when {
            binding.railContinue.hasFocus() -> HomeFocusSnapshot(1, lastFocusContinue, y)
            binding.railDrives.hasFocus() -> HomeFocusSnapshot(2, lastFocusDrives, y)
            else -> HomeFocusSnapshot(0, -1, y)
        }
    }

    /** Repõe foco + rolagem guardados (depois do re-bind, no próximo layout). */
    private fun restoreHomeFocus(snap: HomeFocusSnapshot) {
        if (snap.target == 0 && snap.scrollY <= 0) return
        // Ronda 18 Frente C (F3) — carimba a geração do restauro: os
        // post{} abaixo só actuam se a geração ainda for a actual. Um
        // foco ou toque posterior invalida o restauro pendente (ver
        // invalidateStaleFocusRestore / dispatchTouchEvent) — o
        // utilizador já navegou, não se repõe nada por cima dele.
        focusRestoreGeneration++
        pendingFocusRestore = snap
        val gen = focusRestoreGeneration
        binding.homeScroll.post {
            if (gen != focusRestoreGeneration) return@post
            if (snap.scrollY > 0) binding.homeScroll.scrollTo(0, snap.scrollY)
            val rail = when (snap.target) {
                1 -> binding.railContinue
                2 -> binding.railDrives
                else -> null
            }
            if (rail == null) {
                pendingFocusRestore = null
                return@post
            }
            val count = rail.adapter?.itemCount ?: 0
            if (count <= 0 || snap.pos < 0) {
                pendingFocusRestore = null
                return@post
            }
            val pos = snap.pos.coerceAtMost(count - 1)
            (rail.layoutManager as? LinearLayoutManager)?.scrollToPosition(pos)
            rail.post {
                if (gen != focusRestoreGeneration) return@post
                rail.findViewHolderForAdapterPosition(pos)?.itemView?.requestFocus()
                pendingFocusRestore = null
            }
        }
    }

    /** Restauro do onResume: usa o último rail focado + a posição guardada. */
    private fun restoreHomeFocusOnResume() {
        val y = binding.homeScroll.scrollY.takeIf { it > 0 } ?: savedScrollY
        val snap = when (lastFocusedRail) {
            1 -> HomeFocusSnapshot(1, lastFocusContinue, y)
            2 -> HomeFocusSnapshot(2, lastFocusDrives, y)
            else -> HomeFocusSnapshot(0, -1, y)
        }
        restoreHomeFocus(snap)
    }

    /**
     * Redesenha só os itens visíveis do RecyclerView (ex.: chegada
     * do manifesto de capas). Os itens fora do ecrã resolvem a capa
     * no próximo bind — sem re-bind total, sem perda de foco.
     */
    private fun refreshVisibleItems(recyclerView: RecyclerView) {
        val lm = recyclerView.layoutManager as? LinearLayoutManager ?: return
        val first = lm.findFirstVisibleItemPosition()
        val last = lm.findLastVisibleItemPosition()
        if (first == RecyclerView.NO_POSITION || last == RecyclerView.NO_POSITION) return
        for (pos in first..last) recyclerView.adapter?.notifyItemChanged(pos)
    }

    // Ronda 18 Frente C (F3) — um toque a meio de um restauro
    // pendente cancela-o: o utilizador tomou conta da página e o
    // post{} já não deve puxar o foco/rolagem para o snapshot velho.
    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        if (ev.action == MotionEvent.ACTION_DOWN) invalidatePendingFocusRestore()
        return super.dispatchTouchEvent(ev)
    }

    override fun onResume() {
        super.onResume()
        // Ronda 17 Frente B — o observador regista-se aqui (e não no
        // onCreate): no onCreate a vista ainda não está ligada à
        // janela e o ViewTreeObserver seria o flutuante, que morre
        // ao ligar; no onResume a vista já está ligada.
        if (!focusListenerRegistered) {
            focusListenerRegistered = true
            focusObserver = binding.root.viewTreeObserver
            focusObserver?.addOnGlobalFocusChangeListener(globalFocusListener)
        }
        // v2.7.11 — a nav inferior SEMPRE mostra "Início" aqui: o
        // BottomNavigationView marcava o item tocado (ex. Ajustes) ao
        // abrir a outra aba, e voltar com Back não passava por onCreate
        // nem onNewIntent — por isso a home aparecia com "Ajustes"
        // destacado enquanto a tela era a home.
        binding.bottomNav.selectedItemId = R.id.nav_home

        // Frente G: reconstruir o rail "Continue assistindo" ao
        // voltar (o player grava recents/resume; sem isto a home
        // só mostrava o vídeo visto depois de reiniciar o app).
        // Local, sem rede (só o backfill de thumbs, já guardado).
        // As cadeias de foco da TV são refeitas porque a secção
        // em destaque pode ter aparecido entretanto.
        setupContinueRail()
        setupTvFocusChains()
        // Ronda 10 Frente C — re-busca os drives do admin ao
        // voltar: o remover da Frente B faz o tile sumir sem
        // reiniciar o app.
        fetchAdminDrives()
        // v2.7.6: re-checa atualização ao voltar (throttle 1×/24h) e
        // restaura o foco nos rails (TV).
        UpdateChecker.checkForUpdateThrottled(this, BuildConfig.VERSION_NAME)
        // Ronda 17 Frente B (gatilho A) — o restauro foca a posição
        // REAL (observador global de foco), não a posição 0: D-pad sem
        // clique já não perde o lugar. 1.ª abertura: posição 0 (como
        // hoje); regresso: foco + scrollY guardados.
        if (TvUtils.isTv(this)) {
            if (isFirstResume) {
                binding.railContinue.post {
                    binding.railContinue.findViewHolderForAdapterPosition(0)
                        ?.itemView?.requestFocus()
                }
                binding.railDrives.post {
                    binding.railDrives.findViewHolderForAdapterPosition(0)
                        ?.itemView?.requestFocus()
                }
            } else {
                restoreHomeFocusOnResume()
            }
        } else if (!isFirstResume && savedScrollY > 0) {
            // Ronda 18 Frente C (F4) — no telemóvel o onResume nunca
            // repunha o scrollY guardado (só a TV o fazia): depois de
            // a activity ser recriada (morte do processo) a página
            // voltava ao topo. Repõe-se uma só vez (o valor é
            // consumido) e só quando houve recriação — num regresso
            // normal o ScrollView já guardou a posição sozinho.
            val y = savedScrollY
            savedScrollY = 0
            binding.homeScroll.post { binding.homeScroll.scrollTo(0, y) }
        }
        isFirstResume = false
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

    private inner class HeroRotator(
        private val binding: ActivityHomeBinding,
        private val items: List<HeroItem>,
        private val onClick: (HeroItem) -> Unit
    ) {
        private val handler = Handler(Looper.getMainLooper())
        private var index = 0
        private val rotateRunnable = Runnable { next() }

        // v2.7.11 — sem setas e sem dots (conceito): navegação por
        // swipe no card + avanço automático a cada 8s.
        private var downX = 0f
        private val heroThumbCache = mutableMapOf<String, String?>()

        init {
            binding.heroPlay.setOnClickListener { onClick(items[index]) }
            binding.heroCard.setOnTouchListener { _, ev ->
                when (ev.action) {
                    MotionEvent.ACTION_DOWN -> { downX = ev.x; false }
                    MotionEvent.ACTION_UP -> {
                        val dx = ev.x - downX
                        if (dx > 120) prev() else if (dx < -120) next()
                        false
                    }
                    else -> false
                }
            }
            render(animate = false)
        }

        fun start() { handler.postDelayed(rotateRunnable, 8000L) }

        // Onda 2 (a) — destaque atual + re-render da arte quando as
        // capas do admin chegam (fetchFeaturedCovers).
        fun currentItem(): HeroItem = items[index]
        fun refreshHeroArt() { loadHeroArt(items[index]) }

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
            loadHeroArt(item)
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

        /**
         * v2.7.11 — arte do hero (conceito: foto real + scrim escuro).
         * Os HeroItems são curados e não trazem thumb: busca a thumb do
         * primeiro vídeo da pasta do drive (1 página, com cache por
         * drivePath). Sem thumb no Drive, fica o gradiente escuro limpo
         * — sem bola de monograma.
         */
        /**
         * v2.7.11 onda 2 — hierarquia da capa do hero:
         *   (a) cover_url do destaque (HeroItem.coverUrl, foto do admin);
         *   (b) thumb do Drive do 1º vídeo da pasta;
         *   (c) imagem da biblioteca por tipo de aula
         *       (LibraryCovers — nome do destaque/curso);
         *   (d) capa gerada do drive (ThumbArt.coverResForPath).
         * Nunca monograma nem gradiente liso como capa: sem (a) nem
         * (b), o hero mostra a capa gerada (antes: gradiente escuro).
         */
        private fun loadHeroArt(item: HeroItem) {
            val adminCover = item.coverUrl?.takeIf { it.isNotBlank() }
                ?: featuredCoverByPath[item.drivePath]?.takeIf { it.isNotBlank() }
            if (adminCover != null) { showHeroArtUrl(adminCover, item); return }
            val cached = heroThumbCache[item.drivePath]
            if (cached != null) { showHeroArtUrl(cached, item); return }
            if (heroThumbCache.containsKey(item.drivePath)) {
                // Thumb (2) conhecida como ausente → biblioteca (3)
                // ESTRITA por nome do destaque/curso (2.7.13, sem 'geral');
                // sem match, a capa gerada (4).
                val libraryUrl = LibraryCovers.resolveStrict(item.title, item.driveName, item.drivePath)
                if (libraryUrl != null) showHeroArtUrl(libraryUrl, item) else showHeroCover(item)
                return
            }
            showHeroCover(item)
            lifecycleScope.launch {
                val thumb = withContext(Dispatchers.IO) {
                    runCatching { api.listFolder(item.drivePath, 1) }.getOrNull()
                        ?.firstOrNull { (it.isVideo || it.isAudio) && !it.thumbnailLink.isNullOrBlank() }
                        ?.thumbnailLink
                }
                heroThumbCache[item.drivePath] = thumb
                // Re-avalia a hierarquia (a) > (b) > (c): a capa do
                // admin pode ter chegado depois que esta busca começou
                // — sem isso a thumb (b) sobrescreveria a capa (a).
                if (items[index] == item) loadHeroArt(item)
            }
        }

        private fun showHeroArtUrl(thumb: String, item: HeroItem) {
            val coverRes = ThumbArt.coverResForPath(item.drivePath)
            binding.heroImage.visibility = View.VISIBLE
            binding.heroScrim.visibility = View.VISIBLE
            binding.heroImage.load(thumb) {
                error(coverRes)
                listener(onError = { _, _ -> showHeroCover(item) })
            }
        }

        private fun showHeroCover(item: HeroItem) {
            binding.heroImage.visibility = View.VISIBLE
            binding.heroScrim.visibility = View.VISIBLE
            binding.heroImage.setImageResource(ThumbArt.coverResForPath(item.drivePath))
        }

    }

    // ──────────── v2.0.0: Continue rail multi-item ────────────

    private fun setupContinueRail() {
        val sm = SessionManager.get(this)
        val recents = sm.getRecents()
        homeRecents = recents

        if (recents.isEmpty()) {
            binding.labelContinue.visibility = View.GONE
            binding.railContinue.visibility = View.GONE
            return
        }

        binding.labelContinue.visibility = View.VISIBLE
        binding.railContinue.visibility = View.VISIBLE
        // Ronda 17 Frente B (gatilho A) — LayoutManager, decoração e
        // adapter criados UMA só vez: recriá-los no onResume apagava
        // a rolagem do rail e repunha a posição em 0 (e as decorações
        // acumulavam-se a cada onResume). Depois da 1.ª vez, só os
        // DADOS são actualizados (updateItems, abaixo).
        val firstBuild = continueAdapter == null
        if (binding.railContinue.layoutManager == null) {
            binding.railContinue.layoutManager =
                LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false)
            binding.railContinue.addItemDecoration(RailGutterDecoration(tvAutoFit?.gutterDp(200f) ?: 8))
        }

        // ★ v2.5.0: Show the COURSE NAME (not the folder path) as subtitle.
        // extractCourseName() returns a human-friendly label like
        // "PF - Agente" or "DirAdmin" depending on the path depth.
        val railItems = recents.map { r ->
            val courseName = extractCourseName(r.folderPath)
            val displayTitle = Format.lessonDisplayTitle(r.videoName, courseName)
            RailItem(
                title = r.videoName,
                displayTitle = displayTitle,
                // O título já traz o curso ("Curso — Aula 01") → o
                // subtítulo some (o adapter esconde subtítulo vazio).
                subtitle = if (displayTitle.startsWith(courseName)) "" else courseName,
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
        }.toMutableList()
        // Frente A (TV) — o destaque ("Continuar de onde parou") só
        // existe quando há resume: calcula-se ANTES do adapter,
        // porque o nextFocusUp dos cards depende dele (o
        // setupFeaturedContinue corre depois e já não o corrige).
        val hasFeatured = TvUtils.isTv(this) &&
            recents.any { sm.hasResume(it.folderPath, it.videoName) }
        if (firstBuild) {
            continueAdapter = RailAdapter(
                railItems,
                nextFocusUpId = if (hasFeatured) R.id.featured_card else R.id.heroPlay,
                nextFocusDownId = R.id.railDrives
            ) { item ->
                // Ronda 18 Frente C (F1) — a lambda nasce UMA só vez
                // (firstBuild) mas os recents mudam a cada vídeo visto:
                // fechar sobre os `recents` da 1.ª construção deixava
                // o tile morto (find -> null -> return) e podia casar o
                // vídeo errado (mesmo nome noutra pasta). Lêem-se os
                // recents ACTUAIS no momento do toque; o casamento é
                // por (pasta, vídeo) — o nome só é o fallback. A
                // posição do foco lê-se do adapter actual (não da
                // lista da 1.ª construção).
                val currentRecents = SessionManager.get(this).getRecents()
                val match = currentRecents.find {
                    it.folderPath == item.file?.folderPath && it.videoName == item.title
                } ?: currentRecents.find { it.videoName == item.title }
                    ?: return@RailAdapter
                lastFocusContinue = continueAdapter?.indexOf(item) ?: -1
                continueWatching(match.folderPath, match.videoName, item.subtitle)
            }
            binding.railContinue.adapter = continueAdapter
        } else {
            // Só os dados mudam (o foco/rolagem repõem-se se mudou algo).
            val snap = captureHomeFocus()
            val changed = continueAdapter?.updateItems(railItems) ?: false
            continueAdapter?.updateFocusIds(
                if (hasFeatured) R.id.featured_card else R.id.heroPlay,
                R.id.railDrives
            )
            if (changed) restoreHomeFocus(snap)
        }
        continueAdapter?.let { backfillRecentThumbs(recents, railItems, it) }
        setupFeaturedContinue(recents)
    }

    /**
     * v2.7.11 — Backfill das thumbs dos recents antigos.
     *
     * Causa raiz do monograma (verificada no código): ApiService.
     * listFolder() montava o FileItem à mão e DESCARTAVA o
     * thumbnailLink (o parser FileItem.fromJson tem o campo + o
     * fallback drive.google.com/thumbnail?id=, mas nunca era chamado
     * nesse caminho) — logo launchPlayer() sempre recebia thumb null
     * e addRecent() nunca gravava thumb nenhuma. Com o listFolder
     * corrigido, os vídeos abertos DEPOIS da 2.7.11 já salvam a thumb;
     * os recents de antes continuariam sem — por isso este backfill
     * lista a pasta de cada recent sem thumb, casa o vídeo pelo nome
     * e grava a thumb no lugar (sem reordenar). Se o Drive não tiver
     * thumb, o card mostra a arte-padrão do drive, nunca monograma.
     * Roda em 2º plano, sem travar a home; falha de rede = ignora.
     */
    private fun backfillRecentThumbs(
        recents: List<SessionManager.RecentItem>,
        railItems: MutableList<RailItem>,
        adapter: RailAdapter
    ) {
        val missing = recents.filter { it.thumbnailLink.isNullOrBlank() }
        if (missing.isEmpty()) return
        val sm = SessionManager.get(this)
        lifecycleScope.launch {
            for (r in missing) {
                val thumb = withContext(Dispatchers.IO) {
                    runCatching { api.listFolder(r.folderPath) }.getOrNull()
                        ?.firstOrNull { it.name == r.videoName }?.thumbnailLink
                }
                if (thumb.isNullOrBlank()) continue
                sm.updateRecentThumb(r.folderPath, r.videoName, thumb)
                val idx = railItems.indexOfFirst {
                    it.title == r.videoName && it.file?.folderPath == r.folderPath
                }
                if (idx >= 0) {
                    railItems[idx] = railItems[idx].copy(thumbnailUrl = thumb)
                    adapter.notifyItemChanged(idx)
                }
            }
        }
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
        binding.featuredTitle.setWordEllipsized(
            Format.lessonDisplayTitle(best.videoName, extractCourseName(best.folderPath)))
        binding.featuredSubtitle.setWordEllipsized(extractCourseName(best.folderPath))
        binding.featuredProgress.progress = progress
        binding.featuredProgressText.text = "$progress% concluído"
        binding.featuredTimeText.text = Format.positionText(pos, dur)
        // v2.7.11 — sem monograma: arte-padrão do drive quando não há
        // thumb (o ícone do drive vem do path da pasta do vídeo).
        // v2.7.11 onda 2 — sem thumb do Drive, o destaque da TV
        // mostra a capa gerada do drive (nunca o emoji do drive).
        fun showFeaturedFallback() {
            binding.featuredThumb.visibility = View.VISIBLE
            binding.featuredFallbackIcon.visibility = View.GONE
            binding.featuredThumb.setImageResource(ThumbArt.coverResForPath(best.folderPath))
        }
        // v2.7.11 camada (3) ESTRITA (2.7.13, sem 'geral'): sem thumb
        // do Drive, a imagem da biblioteca por tipo de aula; sem match,
        // a capa gerada (4).
        val featuredRemote = LibraryCovers.remoteCoverStrict(
            best.thumbnailLink, best.videoName,
            extractCourseName(best.folderPath), best.folderPath
        )
        if (featuredRemote != null) {
            binding.featuredThumb.visibility = View.VISIBLE
            binding.featuredFallbackIcon.visibility = View.GONE
            binding.featuredThumb.load(featuredRemote) {
                error(ThumbArt.coverResForPath(best.folderPath))
                listener(onError = { _, _ -> showFeaturedFallback() })
            }
        } else {
            showFeaturedFallback()
        }
        binding.featuredContinue.setOnClickListener {
            continueWatching(best.folderPath, best.videoName, extractCourseName(best.folderPath))
        }
        // v2.7.10 — o CARD GRANDE e o alvo do foco na TV: clicavel e
        // focavel, com FocusAnimator.attachCard (anel 3dp da marca +
        // escala 1.00x na TV (R18B) + elevacao). Antes so o botao interno era
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
        // R18B (Bug 1 #1): 1.00x na TV — o cartão tem 848dp
        // (largura total); qualquer escala é cortada nas laterais
        // e invade o overscan. Ficam anel 3dp + elevação 16dp.
        FocusAnimator.attachCard(binding.featuredCard, true, scaleTv = FocusAnimator.SCALE_TV_NONE)
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
        // Frente H — caminho rápido: o recent já guarda o link de
        // playback (SessionManager.addRecent, parâmetro link), por isso
        // o "Continuar assistindo" navega IMEDIATAMENTE para o player,
        // sem o listFolder prévio. A playlist interfolder é enriquecida
        // em 2º plano pelo PlayerActivity (enrichPlaylistInBackground).
        val sm = SessionManager.get(this)
        val recent = sm.getRecents().firstOrNull {
            it.folderPath == folderPath && it.videoName == videoName
        }
        val fastLink = recent?.link?.takeIf { it.isNotBlank() }
        if (fastLink != null) {
            val item = FileItem(
                name = videoName, mimeType = "video/mp4", id = "",
                driveId = null, link = fastLink, size = 0L, modifiedTime = null,
                folderPath = folderPath
            )
            PlaylistManager.setPlaylist(listOf(item), 0, this)
            launchPlayer(MeggyApp.BASE_URL + fastLink, videoName, folderPath, recent.thumbnailLink)
            return
        }
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
                        // Ronda 15 Frente B (B1): carimbar folderPath — sem isto o progresso cai na loja legada pos_<url>.
                        PlaylistManager.setPlaylist(playable.map { it.copy(folderPath = folderPath) }, if (idx >= 0) idx else 0, this@HomeActivity)
                        launchPlayer(MeggyApp.BASE_URL + clickedVideo.link, videoName, folderPath, clickedVideo.thumbnailLink)
                        return@launch
                    } else {
                        // Frente H — sem esperar pela montagem interfolder:
                        // navega já com só este vídeo; o player enriquece
                        // a fila em 2º plano (enrichPlaylistInBackground).
                        PlaylistManager.setPlaylist(
                            listOf(clickedVideo.copy(folderPath = folderPath)), 0, this@HomeActivity
                        )
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
        // Frente H — guarda contra duplo toque: um toque = uma navegação;
        // toques repetidos no mesmo vídeo dentro de 1,5 s são ignorados.
        if (!TapFeedback.tryNavigate(url)) return
        val sm = SessionManager.get(this)
        sm.saveLastWatched(folderPath, title)
        // Frente H — guarda o link de playback no recent (além da thumb):
        // o "Continuar assistindo" passa a navegar sem listFolder prévio.
        sm.addRecent(folderPath, title, thumbnailLink, url.removePrefix(MeggyApp.BASE_URL).takeIf { it != url })
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

    /**
     * Ronda 7 Frente B — auto-ajuste da home da TV (TvAutoFit).
     *
     * Tudo o que aqui se toca e GEOMETRIA DA HOME NA TV: margens de overscan
     * (laterais 56dp, topo/fundo >=48dp), altura do hero, textos do hero /
     * destaque / seccoes e thumb do destaque (16:9). O XML continua a ser a
     * baseline da 32" (escala 1.0): a escala 1.0 devolve exactamente os
     * valores do XML, por isso na 32" nada muda — excepto o topo/fundo, que
     * passam de 40dp para 48dp (piso da skill; ver TvAutoFit.topMarginPx).
     * O celular nao passa por aqui (tvAutoFit e nulo fora da TV).
     *
     * Passo 0 (Frente A): a medicao vai para o logcat (tag TvAutoFit) —
     * densityDpi/density/widthPixels/fontScale + fonte da escala. Sem ela
     * nao se sabe qual dos dois mecanismos actua nesta TV.
     */
    private fun applyTvAutoFit() {
        val fit = tvAutoFit ?: return
        Log.i(TvAutoFit.TAG, fit.describe())
        // Overscan: laterais 56dp (piso 48dp), topo/fundo >=48dp.
        binding.root.setPadding(
            fit.sideMarginPx(), fit.topMarginPx(),
            fit.sideMarginPx(), fit.bottomMarginPx()
        )
        // Topo: nome da app + "Sair" (+ logo, so na Meggy).
        binding.topTitle?.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(22f))
        binding.topSair?.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(13f))
        binding.topLogo?.layoutParams = binding.topLogo?.layoutParams?.apply {
            width = fit.layoutPx(56f)
            height = fit.layoutPx(56f)
        }
        // Hero: altura = fraccao da altura do viewport (heroScale);
        // texto com textScale; padding do bloco de texto com marginScale.
        binding.heroCard.layoutParams =
            binding.heroCard.layoutParams.apply { height = fit.heroPx(320f) }
        (binding.heroTitle.parent as View).setPadding(
            fit.marginPx(32f), fit.marginPx(26f),
            fit.marginPx(32f), fit.marginPx(26f)
        )
        binding.heroBadge.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(12f))
        binding.heroTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(30f))
        binding.heroSubtitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(14f))
        binding.heroPlay.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(15f))
        // Destaque: titulo da seccao (1o filho, sem id) + thumb 16:9.
        (binding.featuredSection.getChildAt(0) as? TextView)?.setTextSize(
            TypedValue.COMPLEX_UNIT_SP, fit.textSp(18f))
        val thumbWidthPx = fit.layoutPx(320f)
        val thumbBox = binding.featuredThumb.parent as View
        thumbBox.layoutParams = thumbBox.layoutParams.apply {
            width = thumbWidthPx
            height = thumbWidthPx * 9 / 16
        }
        binding.featuredTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(22f))
        binding.featuredSubtitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(13f))
        binding.featuredProgressText.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(13f))
        binding.featuredTimeText.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(13f))
        binding.featuredContinue.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(15f))
        binding.featuredFallbackIcon.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(56f))
        // Seccoes + rodape.
        binding.labelContinue.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(18f))
        binding.labelDrives.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(18f))
        binding.footerVersion.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(13f))
        // Espacamentos verticais com marginScale.
        fit.applyTopMargin(binding.heroCard, fit.marginPx(26f))
        fit.applyTopMargin(binding.featuredSection, fit.marginPx(26f))
        fit.applyTopMargin(binding.labelContinue, fit.marginPx(26f))
        fit.applyTopMargin(binding.labelDrives, fit.marginPx(26f))
        fit.applyTopMargin(binding.footerVersion, fit.marginPx(26f))
        fit.applyTopMargin(binding.railContinue, fit.marginPx(12f))
        fit.applyTopMargin(binding.railDrives, fit.marginPx(12f))
    }

    private fun setupDrivesRail() {
        // Frente A (TV) — UP do tile de drive volta ao rail de cima
        // ("Continue assistindo", destaque ou hero — o que existir).
        val drivesUpId = when {
            binding.railContinue.visibility == View.VISIBLE -> R.id.railContinue
            binding.featuredSection.visibility == View.VISIBLE -> R.id.featured_card
            else -> R.id.heroPlay
        }
        // Ronda 17 Frente B — LayoutManager, decoração e adapter
        // criados UMA só vez (como o rail Continue): hoje corriam em
        // cada chamada e as decorações acumulavam-se. Depois da 1.ª
        // vez, só o id de foco UP é actualizado (o conteúdo vem por
        // updateItems, no fetchAdminDrives).
        if (drivesAdapter == null) {
            binding.railDrives.layoutManager =
                LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false)
            binding.railDrives.addItemDecoration(RailGutterDecoration(tvAutoFit?.gutterDp(150f) ?: 8))
            drivesAdapter = DriveRailAdapter(
                buildDriveRailItems(), featuredCoverByPath,
                nextFocusUpId = drivesUpId
            ) { item ->
                lastFocusDrives = driveRailItems.indexOf(item)
                when (item) {
                    is DriveRailItem.Fixed -> openDrive(item.drive)
                    is DriveRailItem.Admin -> onAdminDriveClick(item.drive)
                }
            }
            binding.railDrives.adapter = drivesAdapter
        } else {
            drivesAdapter?.updateFocusIds(drivesUpId)
        }
    }

    /**
     * Ronda 13 Frente C — itens do rail de drives. FONTE DE VERDADE:
     * quando o servidor respondeu (serverDrives != null), a lista do
     * servidor SUBSTITUI DriveItem.ALL (nao funde): os 16 fixos vem
     * do servidor como registos geridos (source='hardcoded',
     * rootIndex) e os do admin a seguir — sem duplicados (dedupe por
     * driveId e por rootIndex). Um fixo REMOVIDO no admin nao volta a
     * aparecer: o seed do servidor so corre com a tabela vazia, e o
     * app nao o repoe a partir de DriveItem.ALL quando o servidor
     * respondeu. Offline/falha (serverDrives == null) -> fallback
     * DriveItem.ALL + admin (comportamento da Ronda 10).
     * Um registo gerido casa com o DriveItem fixo do mesmo rootIndex
     * (icone/tagline/capa gerada do codigo; nome e capa do servidor)
     * e abre pela producao ("/N:/"); sem casa, e um drive do admin
     * e abre por ID (POST /api/drive/by-id).
     */
    private fun buildDriveRailItems(): List<DriveRailItem> {
        val server = serverDrives
        if (server != null) {
            val items = ArrayList<DriveRailItem>(server.size)
            val seenIds = HashSet<String>()
            val seenRoots = HashSet<Int>()
            val covers = LinkedHashMap<String, String>()
            for (d in server) {
                if (!seenIds.add(d.driveId)) continue
                val idx = d.rootIndex
                val fixed = if (idx != null && seenRoots.add(idx)) {
                    DriveItem.ALL.firstOrNull { it.index == idx }
                        ?.takeIf { it.rootFolderId == null || it.rootFolderId == d.driveId }
                } else null
                if (d.coverUrl?.isNotBlank() == true && idx != null) {
                    covers["/$idx:/"] = d.coverUrl
                }
                if (fixed != null) items.add(DriveRailItem.Fixed(fixed.copy(name = d.name)))
                else items.add(DriveRailItem.Admin(d))
            }
            serverCoverByPath = covers
            drivesAdapter?.setFeaturedCovers(featuredCoverByPath + serverCoverByPath)
            driveRailItems = items
            return items
        }
        val items = ArrayList<DriveRailItem>(DriveItem.ALL.size + adminDrives.size)
        items.addAll(DriveItem.ALL.map { DriveRailItem.Fixed(it) })
        items.addAll(adminDrives.map { DriveRailItem.Admin(it) })
        driveRailItems = items
        return items
    }

    /**
     * Ronda 13 Frente C — busca os drives do servidor (GET
     * /api/admin-drives, SANDBOX). Best-effort e silencioso:
     * null/falha → serverDrives fica null e a Home usa o fallback
     * (DriveItem.ALL), sem crash, sem toast. Filtra por targetApps
     * p/ o APK actual (o admin vê TODOS no ecrã "Gerir drives"; na
     * Home cada APK só mostra os seus). Chamado no onCreate e no
     * onResume — o remover/editar da Frente B faz o tile sumir/mudar
     * sem reiniciar o app. Quando o servidor responde, a lista dele
     * SUBSTITUI DriveItem.ALL (ver buildDriveRailItems).
     */
    private fun fetchAdminDrives() {
        lifecycleScope.launch {
            val drives = withContext(Dispatchers.IO) {
                runCatching { api.getAdminDrives() }.getOrNull()
            }?.filter { it.targets(packageName) }
            serverDrives = drives
            adminDrives = drives ?: emptyList()
            // Ronda 17 Frente B (gatilho E) — a lista pode chegar a
            // meio da navegação: repõe-se o foco/rolagem. Sem
            // mudanças, o updateItems nem redesenha (early-return).
            val snap = captureHomeFocus()
            // Ronda 18 Frente C (F3) — a lista só se repõe quando
            // mudou de facto (o updateItems já nem redesenha sem
            // mudança) E o snapshot tem algo a repor: nada focado +
            // scroll 0 = nada a fazer, não se agenda post{} nenhum.
            val changed = drivesAdapter?.updateItems(buildDriveRailItems()) ?: false
            if (changed && (snap.target != 0 || snap.scrollY > 0)) restoreHomeFocus(snap)
        }
    }

    /**
     * Ronda 13 Frente C — toque num drive do admin: abre o
     * DetailActivity pelo ID (POST /api/drive/by-id; ver ApiService).
     * O drivePath é "by-id:<folderId>" — sem índice "/N:/" — e o
     * detalhe navega por folderId (sub-pastas por ID). Os extras do
     * admin (sub-capa + capas de sub-pasta) seguem no intent, como
     * nas navegacoes p/ sub-pastas dos drives fixos (ver
     * AdminDriveUi.putAdminDrive / forwardAdminDrive).
     */
    private fun onAdminDriveClick(drive: AdminDrive) {
        val byIdPath = ApiService.byIdPath(drive.driveId)
        val intent = Intent(this, DetailActivity::class.java)
        intent.putExtra("drivePath", byIdPath)
        intent.putExtra("folderName", drive.name)
        AdminDriveUi.putAdminDrive(intent, drive, byIdPath)
        startActivity(intent)
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
        LibraryCovers.removeOnReadyListener(libraryReadyListener)
        focusObserver?.removeOnGlobalFocusChangeListener(globalFocusListener)
        focusObserver = null
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
