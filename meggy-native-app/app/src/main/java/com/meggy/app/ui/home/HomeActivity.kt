package com.meggy.app.ui.home

import android.content.Context
import android.content.Intent
import android.text.format.DateUtils
import android.graphics.Rect
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.TypedValue
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.widget.TextView
import android.view.animation.AlphaAnimation
import android.view.animation.AnimationSet
import android.view.animation.DecelerateInterpolator
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.meggy.app.BuildConfig
import com.meggy.app.MeggyApp
import com.meggy.app.R
import com.meggy.app.data.AdminDrive
import com.meggy.app.data.ApiService
import com.meggy.app.data.FolderResult
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
import com.meggy.app.util.StaleRecentResolver
import com.meggy.app.util.AdminDriveUi
import com.meggy.app.util.DriveRailItem
import com.meggy.app.util.PlaylistManager
import com.meggy.app.util.SessionManager
import com.meggy.app.util.TapFeedback
import com.meggy.app.util.Format
import com.meggy.app.util.LessonDescription
import com.meggy.app.util.ThumbArt
import com.meggy.app.util.LibraryCovers
import com.meggy.app.util.TvUtils
import com.meggy.app.util.TvAutoFit
import com.meggy.app.util.UserStateSync
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
    // actuam se ainda for a atual. O foco (D-pad) ou um toque depois
    // do snapshot invalida o restauro pendente — o usuário já
    // navegou, não se repõe nada por cima dele.
    private var focusRestoreGeneration = 0
    private var pendingFocusRestore: HomeFocusSnapshot? = null
    // Ronda 17 Frente B — rail "Continue assistindo" criado UMA só
    // vez (o onResume só atualiza os dados); último rail focado
    // (0 = nenhum, 1 = Continue, 2 = Drives) + scrollY salvo
    // para restauro após morte do processo (onSaveInstanceState).
    // Ver o observador global de foco (globalFocusListener).
    private var continueAdapter: RailAdapter? = null
    // 2.7.58 — chave do conteúdo actual do hero ambiente da TV
    // (evita recarregar a mesma arte a cada mudança de foco).
    private var ambientKey: String? = null
    private var lastFocusedRail = 0
    private var savedScrollY = 0
    private var isFirstResume = true
    // 2.7.41 (P1-13) — o fetch de destaques falhou (ver
    // fetchFeaturedCovers): alimenta o estado de erro da home.
    private var featuredLoadFailed: Boolean = false
    private var focusObserver: ViewTreeObserver? = null
    private var focusListenerRegistered = false
    private val globalFocusListener = ViewTreeObserver.OnGlobalFocusChangeListener { _, newFocus ->
        val view = newFocus ?: return@OnGlobalFocusChangeListener
        val continuePos = adapterPositionIn(binding.railContinue, view)
        if (continuePos != null) {
            lastFocusContinue = continuePos
            lastFocusedRail = 1
            invalidateStaleFocusRestore(1, continuePos)
            // 2.7.58 — hero ambiente segue o foco (TV).
            continueAdapter?.itemAt(continuePos)?.let { ambientFromContinueItem(it) }
            return@OnGlobalFocusChangeListener
        }
        // 2.7.58 — hero ambiente: Destaques, Pastas recentes e
        // Drives também alimentam o topo na TV.
        if (TvUtils.isTv(this)) {
            findViewById<RecyclerView>(R.id.listDestaques)?.let { rv ->
                val pos = adapterPositionIn(rv, view)
                if (pos != null) {
                    destaquesAdapter?.let { ad ->
                        if (pos < ad.currentList.size) {
                            val item = ad.currentList[pos]
                            updateAmbientHero(
                                item.title, item.subtitle, null,
                                item.coverUrl, item.path
                            )
                        }
                    }
                    return@OnGlobalFocusChangeListener
                }
            }
            findViewById<RecyclerView>(R.id.railRecentFolders)?.let { rv ->
                val pos = adapterPositionIn(rv, view)
                if (pos != null) {
                    recentFoldersAdapter?.itemAt(pos)?.let { item ->
                        updateAmbientHero(
                            item.displayTitle ?: item.title,
                            item.subtitle, null,
                            item.thumbnailUrl, item.file?.folderPath
                        )
                    }
                    return@OnGlobalFocusChangeListener
                }
            }
        }
        val drivesPos = adapterPositionIn(binding.railDrives, view)
        if (drivesPos != null) {
            lastFocusDrives = drivesPos
            lastFocusedRail = 2
            invalidateStaleFocusRestore(2, drivesPos)
            // 2.7.58 — hero ambiente segue o foco (TV).
            drivesAdapter?.itemAt(drivesPos)?.let { item ->
                updateAmbientHero(
                    item.title, item.subtitle, null,
                    item.coverUrl ?: item.featuredCoverUrl, item.drivePath
                )
            }
            return@OnGlobalFocusChangeListener
        }
        lastFocusedRail = 0
        invalidateStaleFocusRestore(0, -1)
    }

    /**
     * Ronda 18 Frente C (F3) — um restauro de foco/rolagem pendente só
     * vale enquanto o foco não saiu do lugar para onde ele ia repor:
     * se o usuário já navegou para outro alvo, o restauro é
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
        // Ronda 17 Frente B — repõe o foco/rolagem salvos se a
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
        // 2.7.48 — barra de busca no topo (conceito 1; só existe no
        // layout do celular) — abre a busca existente. O ícone antigo
        // (homeSearchBtn) saiu do layout.
        // 2.7.58 — a barra de busca do topo saiu do layout do
        // celular (SPEC §3.1: fica o ícone homeSearchIcon, ligado
        // logo abaixo). O id homeSearchBar já não existe.
        // 2.7.58 — ícone de busca do topo mobile (SPEC §3.1): o
        // mesmo destino da barra; só existe no layout do celular.
        findViewById<View>(R.id.homeSearchIcon)?.setOnClickListener {
            startActivity(Intent(this, SearchActivity::class.java))
        }
        // 2.7.41 (P0-2/P0-3) — atalhos de navegação no cabeçalho da home
        // TV (só existem no layout-television; no celular o
        // findViewById retorna null e nada acontece).
        findViewById<View>(R.id.tvNavSearch)?.setOnClickListener {
            startActivity(Intent(this, SearchActivity::class.java))
        }
        findViewById<View>(R.id.tvNavMylist)?.setOnClickListener {
            startActivity(Intent(this, MyListActivity::class.java))
        }
        findViewById<View>(R.id.tvNavSettings)?.setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }
        if (TvUtils.isTv(this)) {
            listOf(R.id.tvNavSearch, R.id.tvNavMylist, R.id.tvNavSettings).forEach { id ->
                findViewById<View>(id)?.let { FocusAnimator.attach(it, true) }
            }
        }
        // 2.7.41 (P1-13) — "Tentar novamente" do estado de erro da home.
        binding.homeRetry.setOnClickListener { reloadHomeContent() }

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
                R.id.nav_drives -> {
                    // Já estamos na Home: rola até "Explorar drives".
                    scrollToDrives()
                    true
                }
                R.id.nav_simulados -> {
                    openSimulados(this)
                    overridePendingTransition(0, 0)
                    true
                }
                R.id.nav_meggy -> {
                    // 2.7.58 — destino real: o chat da Meggy NA
                    // NUVEM (MeggyChatActivity; antes, provisório
                    // 2.7.48, abria a busca).
                    openMeggyChat(this)
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
        // 2.7.48 — desconta a largura do menu lateral (0 sem menu).
        if (TvUtils.isTv(this)) tvAutoFit = TvAutoFit.forContext(this, SideMenuView.currentWidthDp(this))
        // 2.7.48 — menu lateral da TV (no-op no celular: sem a vista).
        setupSideMenu()
        setupHero()
        setupContinueRail()
        setupDrivesRail()
        // R22 UI: grelha "Meus cursos" do celular (no-op na TV).
        setupMyCourses()
        // 2.7.48 — pastas recentes + painel de progresso.
        setupRecentFolders()
        setupProgressPanel()
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
        // 2.7.41 (P1-13) — fim da montagem inicial: esconde o
        // carregamento (o fetch de destaques, assíncrono, re-avalia o
        // erro quando terminar — ver fetchFeaturedCovers).
        updateHomeStateViews()
        // 2.7.48 — import do progresso do servidor (GET /userstate);
        // 2.7.53: o mesmo import também corre ao voltar à Home
        // (ver launchUserStateImport).
        launchUserStateImport()
        // Item Drives vindo de outra aba: rolar até os drives.
        if (intent.getBooleanExtra(EXTRA_SCROLL_TO_DRIVES, false)) scrollToDrives()
    }

    /**
     * 2.7.48 — import do progresso do servidor (GET /userstate):
     * alimenta recents/resume/assistido locais + cache do painel.
     * Best-effort, em 2º plano; ao terminar, refrescam-se as seções
     * que leem esses dados. Sem rede/D1, fica tudo como estava e o
     * próximo arranque tenta outra vez.
     * 2.7.53 — corre no onCreate E ao voltar à Home (onResume): o
     * progresso feito noutro aparelho enquanto a app estava aberta
     * passa a aparecer sem reiniciar. Sem duplicar imports em
     * curso: a guarda do UserStateSync salta o GET se um import já
     * estiver a correr (nesse caso, é o refresh desse import que
     * actualiza as seções quando ele termina).
     */
    private fun launchUserStateImport() {
        lifecycleScope.launch(Dispatchers.IO) {
            UserStateSync.importOnStartup(this@HomeActivity)
            withContext(Dispatchers.Main) {
                if (isFinishing || isDestroyed) return@withContext
                setupContinueRail()
                setupRecentFolders()
                setupProgressPanel()
                setupTvFocusChains()
            }
        }
    }

    /**
     * 2.7.41 (P1-13) — estados da home. O conteúdo é local e monta
     * depressa, por isso o carregamento só cobre o 1.º desenho; o erro
     * só aparece quando não há nada local (sem recentes nem favoritos)
     * E os destaques falharam. A lógica de esconder seções vazias com
     * dados não muda.
     */
    private fun updateHomeStateViews() {
        binding.homeLoading.visibility = View.GONE
        val hasLocal = SessionManager.get(this).getRecents().isNotEmpty() ||
            SessionManager.get(this).getFavoriteCourses().isNotEmpty()
        binding.homeError.visibility =
            if (!hasLocal && featuredLoadFailed) View.VISIBLE else View.GONE
    }

    /**
     * 2.7.41 (P1-13) — "Tentar novamente" do estado de erro: repõe a
     * montagem inicial (rails locais + destaques + drives do admin).
     */
    private fun reloadHomeContent() {
        featuredLoadFailed = false
        binding.homeError.visibility = View.GONE
        binding.homeLoading.visibility = View.VISIBLE
        // Sem setupHero(): na TV ele criaria um SEGUNDO HeroRotator e o
        // antigo continuaria a rodar por cima; o hero já corre e o
        // retry só precisa das seções.
        setupDestaques()
        setupContinueRail()
        setupDrivesRail()
        setupMyCourses()
        setupRecentFolders()
        setupProgressPanel()
        setupTvFocusChains()
        fetchFeaturedCovers()
        fetchAdminDrives()
        updateHomeStateViews()
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
                ?: run {
                    // 2.7.41 (P1-13) — null = falha (rede/auth/sem rota):
                    // regista-se para o estado de erro da home.
                    featuredLoadFailed = true
                    updateHomeStateViews()
                    return@launch
                }
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
    // O foco REAL (D-pad) salva-se com um observador GLOBAL de foco
    // (OnGlobalFocusChangeListener), não com setOnFocusChangeListener
    // na vista: o FocusAnimator é dono desse listener em cada card
    // (attach/attachCard) e sobrepô-lo matava o anel/escala de foco.
    // O observador regista-se no onResume — no onCreate a vista ainda
    // não está ligada à janela e o ViewTreeObserver seria o flutuante.
    // [lastFocusedRail]: 0 = nenhum, 1 = rail Continue, 2 = rail Drives.

    /** Foto instantânea do foco/rolagem actuais (antes de um re-bind). */
    private data class HomeFocusSnapshot(val target: Int, val pos: Int, val scrollY: Int)

    /** Posição do adapter do item que contém a vista focada (o foco
     *  pode estar num filho do card): sobe-se até o filho direto
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

    /** Repõe foco + rolagem salvos (depois do re-bind, no próximo layout). */
    private fun restoreHomeFocus(snap: HomeFocusSnapshot) {
        if (snap.target == 0 && snap.scrollY <= 0) return
        // Ronda 18 Frente C (F3) — carimba a geração do restauro: os
        // post{} abaixo só actuam se a geração ainda for a atual. Um
        // foco ou toque posterior invalida o restauro pendente (ver
        // invalidateStaleFocusRestore / dispatchTouchEvent) — o
        // usuário já navegou, não se repõe nada por cima dele.
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

    /** Restauro do onResume: usa o último rail focado + a posição salva. */
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
     * do manifesto de capas). Os itens fora da tela resolvem a capa
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
    // pendente cancela-o: o usuário tomou conta da página e o
    // post{} já não deve puxar o foco/rolagem para o snapshot velho.
    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        if (ev.action == MotionEvent.ACTION_DOWN) invalidatePendingFocusRestore()
        return super.dispatchTouchEvent(ev)
    }

    // R21 — o HeroRotator só era parado no onDestroy: com a Home em
    // onStop (ex.: player por cima) continuava a renderizar o hero e
    // a disparar loads Coil invisíveis a cada 8 s. Pára no onStop e
    // retoma no onStart (o start() é idempotente).
    override fun onStart() {
        super.onStart()
        heroRotator?.start()
    }

    override fun onStop() {
        heroRotator?.stop()
        super.onStop()
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
        // Local, sem rede (só o backfill de thumbs, já salvo).
        // As cadeias de foco da TV são refeitas porque a seção
        // em destaque pode ter aparecido entretanto.
        setupContinueRail()
        setupTvFocusChains()
        // R21: o nextFocusUp dos tiles de drive era calculado só no
        // onCreate (setupDrivesRail) — se o rail Continue aparece/
        // desaparece entre visitas, o Cima dos drives apontava para
        // o alvo antigo. A função já é segura de re-chamar (só
        // atualiza o id quando o adapter existe).
        setupDrivesRail()
        // R22 UI: a grelha "Meus cursos" do celular refresca ao
        // voltar (favoritos e progresso podem ter mudado no player).
        setupMyCourses()
        // 2.7.48 — pastas recentes + painel de progresso refrescam ao
        // voltar (dados locais).
        setupRecentFolders()
        setupProgressPanel()
        // 2.7.53 — o import do servidor também corre ao voltar: o
        // progresso gravado noutro aparelho (site/desktop/TV)
        // enquanto a app estava aberta entra sem reiniciar. Sem
        // duplicar um import em curso (guarda no UserStateSync).
        launchUserStateImport()
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
        // hoje); regresso: foco + scrollY salvos.
        if (TvUtils.isTv(this)) {
            if (isFirstResume) {
                // R21: UM só pedido de foco — antes havia dois posts
                // (Continue e Drives) e o segundo ganhava sempre: o
                // foco inicial caía em "Explorar drives" mesmo com
                // "Continue assistindo" presente. Continue se tiver
                // itens; senão, Drives.
                val focusTarget =
                    if ((continueAdapter?.itemCount ?: 0) > 0) binding.railContinue
                    else binding.railDrives
                focusTarget.post {
                    focusTarget.findViewHolderForAdapterPosition(0)
                        ?.itemView?.requestFocus()
                }
            } else {
                restoreHomeFocusOnResume()
            }
        } else if (!isFirstResume && savedScrollY > 0) {
            // Ronda 18 Frente C (F4) — no celular o onResume nunca
            // repunha o scrollY salvo (só a TV o fazia): depois de
            // a activity ser recriada (morte do processo) a página
            // voltava ao topo. Repõe-se uma só vez (o valor é
            // consumido) e só quando houve recriação — num regresso
            // normal o ScrollView já salvou a posição sozinho.
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
        if (intent.getBooleanExtra(EXTRA_SCROLL_TO_DRIVES, false)) scrollToDrives()
    }

    // ──────────── v2.0.0: Hero rotativo ────────────

    private fun setupHero() {
        if (!TvUtils.isTv(this)) {
            // R22 UI (conceito "início celular"): no celular não há
            // hero rotativo — os destaques são a lista "Destaques"
            // por baixo dos cursos. O hero e o rotador ficam só na
            // TV; heroRotator fica null e todos os usos existentes
            // são null-safe (start/stop/refresh/currentItem).
            binding.heroCard.visibility = View.GONE
            setupDestaques()
            return
        }
        // 2.7.56 — TV SEM HERO (B2 da proposta Plex): a home é uma
        // estrutura por fileiras a partir do topo (Continuar
        // primeiro, com o item em curso como cartão largo da
        // fileira); o hero rotativo — que rodava por swipe, gesto
        // que não existe na TV, e a cada 8s sob o foco — sai. O
        // heroCard está gone no layout-television e o rotador nunca
        // se cria (heroRotator fica null; os usos são null-safe).
        // Os Destaques montam-se como no celular.
        setupDestaques()
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

        // R21: removeCallbacks antes do post — start() chamado duas
        // vezes (setupHero + onStart) não duplica a cadeia de rotação.
        fun start() {
            handler.removeCallbacks(rotateRunnable)
            handler.postDelayed(rotateRunnable, 8000L)
        }

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
                    api.listFolder(item.drivePath, 1).filesOrNull
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

    // ──────────── 2.7.58: Hero ambiente da Home TV ────────────

    /**
     * HERO AMBIENTE (decisão do Elton 19:24, correcção do teste da
     * 2.7.57): o topo da Home TV mostra a arte do item FOCADO em
     * grande — miniatura da aula ou capa — com título, meta,
     * progresso e a acção Continuar (só visual: o OK faz-se no
     * cartão focado, pelo caminho de sempre). Muda com o foco
     * (globalFocusListener). Sem item/sem arte: bloco ESCONDIDO —
     * fundo escuro limpo, nunca um bloco vazio gigante.
     */
    private fun updateAmbientHero(
        title: String,
        meta: String,
        progress: Int?,
        thumbUrl: String?,
        coverPath: String?
    ) {
        if (!TvUtils.isTv(this)) return
        val block = findViewById<View>(R.id.ambientHero) ?: return
        val img = findViewById<android.widget.ImageView>(R.id.ambientImage) ?: return
        findViewById<TextView>(R.id.ambientTitle)?.text = title
        findViewById<TextView>(R.id.ambientMeta)?.text = meta
        val bar = findViewById<android.widget.ProgressBar>(R.id.ambientProgress)
        if (progress != null) {
            bar?.visibility = View.VISIBLE
            bar?.progress = progress
        } else {
            bar?.visibility = View.GONE
        }
        block.visibility = View.VISIBLE
        val key = title + "|" + (thumbUrl ?: coverPath ?: "")
        if (key == ambientKey) return
        ambientKey = key
        val remote = LibraryCovers.remoteCoverStrict(
            thumbUrl, title, meta, coverPath ?: ""
        )
        if (remote != null) {
            img.visibility = View.VISIBLE
            img.load(remote) {
                error(ThumbArt.coverResForPath(coverPath ?: ""))
            }
        } else if (!coverPath.isNullOrBlank()) {
            img.visibility = View.VISIBLE
            img.setImageResource(ThumbArt.coverResForPath(coverPath))
        } else {
            img.visibility = View.GONE
        }
    }

    private fun ambientFromContinueItem(item: RailItem) {
        val folderPath = item.file?.folderPath ?: ""
        val courseName = Format.extractCourseName(folderPath)
        updateAmbientHero(
            title = item.displayTitle ?: item.title,
            meta = if (courseName.isNotBlank() &&
                !courseName.equals(item.displayTitle, ignoreCase = true)
            ) "$courseName · ${item.displayTitle ?: item.title}" else courseName,
            progress = if (item.hasProgress) item.progress else null,
            thumbUrl = item.thumbnailUrl,
            coverPath = folderPath
        )
    }

    /** Conteúdo por defeito do hero ambiente (antes de qualquer
     *  foco): a aula em curso de maior progresso; sem nenhuma, o
     *  1.º destaque; sem nada, o bloco fica escondido. Não
     *  sobrepõe um hero já conduzido pelo foco. */
    private fun showAmbientDefault() {
        if (!TvUtils.isTv(this)) return
        if (ambientKey != null) return
        val sm = SessionManager.get(this)
        val best = sm.getRecents()
            .filter { sm.hasResume(it.folderPath, it.videoName) }
            .maxByOrNull { sm.getResumeProgress(it.folderPath, it.videoName) }
        if (best != null) {
            val courseName = Format.extractCourseName(best.folderPath)
            updateAmbientHero(
                title = LessonDescription.folderNameFromPath(best.folderPath)
                    ?: Format.lessonDisplayTitle(best.videoName, courseName),
                meta = courseName,
                progress = sm.getResumeProgress(best.folderPath, best.videoName),
                thumbUrl = best.thumbnailLink,
                coverPath = best.folderPath
            )
            return
        }
        val first = destaquesAdapter?.currentList?.firstOrNull()
        if (first != null) {
            updateAmbientHero(first.title, first.subtitle, null, first.coverUrl, first.path)
        }
    }

    // ──────────── v2.0.0: Continue rail multi-item ────────────

    private fun setupContinueRail() {
        val sm = SessionManager.get(this)
        val recents = sm.getRecents()
        homeRecents = recents

        // 2.7.52 — SEM DUPLICAÇÃO (queixa do Elton nas fotos da TV:
        // a aula do hero aparecia outra vez como 1.º cartão da
        // fileira). Na TV, o item do hero — o MESMO cálculo do
        // setupFeaturedContinue (recent com resume de maior
        // progresso) — saía da fileira. No celular nada muda (o
        // cartão largo e o rail já coexistiam assim).
        // 2.7.56 — SEM HERO na TV (B2 da proposta Plex): o item em
        // curso já não sai da fileira — passa a ser o CARTÃO LARGO
        // (320dp) da posição 0 dela (ver RailAdapter.firstCardWideDp).
        // A não-duplicação mantém-se: o item aparece UMA vez, como
        // 1.º cartão do Continuar. A ordem dos restantes não muda.
        val isTvHere = TvUtils.isTv(this)
        val heroItem = if (isTvHere) {
            recents.filter { sm.hasResume(it.folderPath, it.videoName) }
                .maxByOrNull { sm.getResumeProgress(it.folderPath, it.videoName) }
        } else {
            null
        }
        val railRecents = when {
            heroItem == null -> recents
            isTvHere -> listOf(heroItem) + recents.filterNot {
                it.folderPath == heroItem.folderPath && it.videoName == heroItem.videoName
            }
            else -> recents.filterNot {
                it.folderPath == heroItem.folderPath && it.videoName == heroItem.videoName
            }
        }

        if (railRecents.isEmpty()) {
            binding.labelContinue.visibility = View.GONE
            binding.railContinue.visibility = View.GONE
            findViewById<View>(R.id.continueHeader)?.visibility = View.GONE
            findViewById<View>(R.id.continueSeeAll)?.visibility = View.GONE
            // 2.7.52 — fileira vazia na TV pode significar "só há o
            // item do hero": o destaque monta-se na mesma (no
            // celular este ramo é o recents.isEmpty() de sempre e o
            // setupFeaturedContinue esconde a seção, como antes).
            setupFeaturedContinue(recents)
            // 2.7.58 — hero ambiente por defeito (TV).
            showAmbientDefault()
            return
        }

        binding.labelContinue.visibility = View.VISIBLE
        binding.railContinue.visibility = View.VISIBLE
        findViewById<View>(R.id.continueHeader)?.visibility = View.VISIBLE
        // 2.7.48 (Q4 provisório) — "Ver tudo ›" do Continue abre a
        // busca (as aulas em andamento). Só no celular (a TV não tem
        // o link — o findViewById devolve null e nada acontece).
        findViewById<View>(R.id.continueSeeAll)?.apply {
            visibility = View.VISIBLE
            setOnClickListener {
                startActivity(Intent(this@HomeActivity, SearchActivity::class.java))
            }
        }
        // Ronda 17 Frente B (gatilho A) — LayoutManager, decoração e
        // adapter criados UMA só vez: recriá-los no onResume apagava
        // a rolagem do rail e repunha a posição em 0 (e as decorações
        // acumulavam-se a cada onResume). Depois da 1.ª vez, só os
        // DADOS são atualizados (updateItems, abaixo).
        val firstBuild = continueAdapter == null
        if (binding.railContinue.layoutManager == null) {
            binding.railContinue.layoutManager =
                LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false)
            // 2.7.52 — na TV os cartões são grandes: o gutter
            // acompanha a base. No celular tvAutoFit é null e
            // fica o 8 de sempre.
            // 2.7.56 — base da fileira na TV: 240dp (proposta Plex).
            binding.railContinue.addItemDecoration(RailGutterDecoration(tvAutoFit?.gutterDp(240f) ?: 8))
        }

        // ★ v2.5.0: Show the COURSE NAME (not the folder path) as subtitle.
        // Format.extractCourseName() returns a human-friendly label like
        // "PF - Agente" or "DirAdmin" depending on the path depth.
        // R28 — o título do card é o NOME DO TEMA DA AULA = o nome da
        // pasta da aula (último segmento do folderPath, mesma fonte do
        // título da tela Detalhe e do player p/ arquivo genérico):
        // o nome cru do arquivo ("Videoaula") some do título. Sem
        // segmento na pasta, cai no título antigo (lessonDisplayTitle).
        val railItems = railRecents.map { r ->
            val courseName = Format.extractCourseName(r.folderPath)
            val displayTitle = LessonDescription.folderNameFromPath(r.folderPath)
                ?: Format.lessonDisplayTitle(r.videoName, courseName)
            // 2.7.58 — na TV a meta do cartão Continuar é
            // "matéria · assunto" (decisão 19:24): matéria = nome
            // do curso, assunto = tema da aula (o título). No
            // celular fica o subtítulo de sempre.
            val subtitle = if (isTvHere) {
                if (courseName.isNotBlank() &&
                    !courseName.equals(displayTitle, ignoreCase = true)
                ) "$courseName · $displayTitle" else displayTitle
            } else {
                Format.continueSubtitle(displayTitle, r.videoName, courseName, TvUtils.isTv(this))
            }
            RailItem(
                title = r.videoName,
                displayTitle = displayTitle,
                // O título já traz o curso ("Curso — Aula 01") → o
                // subtítulo some (o adapter esconde subtítulo vazio).
                subtitle = subtitle,
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
        // 2.7.56 — cadeias da fileira na TV (sem hero nem destaque):
        // UP — com o menu ligado não há nada acima (é a 1.ª fileira);
        // sem menu, o 1.º atalho do cabeçalho. DOWN — a próxima
        // fileira visível (Destaques → Pastas recentes → Drives).
        // LEFT — a linha seleccionada do menu (tvMenuLeftTargetId).
        // No celular ficam os ids de sempre.
        val continueUpId = when {
            !isTvHere -> if (hasFeatured) R.id.featured_card else R.id.heroPlay
            sm.tvSideMenuEnabled -> View.NO_ID
            else -> R.id.tvNavSearch
        }
        val continueDownId = when {
            !isTvHere -> R.id.railDrives
            findViewById<View>(R.id.listDestaques)?.visibility == View.VISIBLE -> R.id.listDestaques
            findViewById<View>(R.id.railRecentFolders)?.visibility == View.VISIBLE -> R.id.railRecentFolders
            else -> R.id.railDrives
        }
        if (firstBuild) {
            continueAdapter = RailAdapter(
                railItems,
                nextFocusUpId = continueUpId,
                nextFocusDownId = continueDownId,
                nextFocusLeftId = tvMenuLeftTargetId(),
                // 2.7.48 — anel de foco branco 4dp na TV (conceito 3).
                whiteFocusRing = true,
                // 2.7.52 — cartões grandes na TV (conceito
                // tv-home-nova); no celular a base fica a de sempre.
                // 2.7.56 — base da proposta Plex: 240dp.
                // 2.7.58 — cartões do Continuar UNIFORMES na TV
                // (decisão 19:24): a posição 0 deixa de ser larga
                // (firstCardWideDp = 0) e o corpo colorido sai
                // (plainTvBody) — só imagem + progresso na aresta +
                // título por baixo, como no Plex.
                tvCardBaseDp = if (isTvHere) 240f else 200f,
                firstCardWideDp = 0f,
                plainTvBody = isTvHere
            ) { item ->
                // Ronda 18 Frente C (F1) — a lambda nasce UMA só vez
                // (firstBuild) mas os recents mudam a cada vídeo visto:
                // fechar sobre os `recents` da 1.ª construção deixava
                // o tile morto (find -> null -> return) e podia casar o
                // vídeo errado (mesmo nome em outra pasta). Leem-se os
                // recents ACTUAIS no momento do toque; o casamento é
                // por (pasta, vídeo) — o nome só é o fallback. A
                // posição do foco lê-se do adapter atual (não da
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
            continueAdapter?.updateFocusIds(continueUpId, continueDownId)
            continueAdapter?.updateFocusLeftId(tvMenuLeftTargetId())
            if (changed) restoreHomeFocus(snap)
        }
        continueAdapter?.let { backfillRecentThumbs(recents, railItems, it) }
        setupFeaturedContinue(recents)
        // 2.7.58 — hero ambiente por defeito (TV).
        showAmbientDefault()
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
                    api.listFolder(r.folderPath).filesOrNull
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
    // R22 UI (conceito "início celular") — adapters das seções novas
    // da home do celular. Null na TV (as vistas não existem lá).
    private var homeCoursesAdapter: HomeCourseGridAdapter? = null

    /** 2.7.48 — totais unificados em cache (setupMyCourses) p/ o "N aulas" das pastas recentes. */
    private var courseTotalsCache: Map<String, Int> = emptyMap()
    private var recentFoldersAdapter: RailAdapter? = null
    private var destaquesAdapter: HomeFeaturedAdapter? = null

    /**
     * R22 UI — seção "Meus cursos" (grelha de 2 colunas): os cursos
     * favoritos do aluno, a mesma fonte da Minha Lista, com o total
     * real do unified e o progresso local. Sem favoritos, a seção
     * fica escondida. Só no celular.
     */
    private fun setupMyCourses() {
        if (TvUtils.isTv(this)) return
        val label = findViewById<TextView>(R.id.labelMyCourses) ?: return
        val grid = findViewById<RecyclerView>(R.id.gridMyCourses) ?: return
        val courses = SessionManager.get(this).getFavoriteCourses()
        if (courses.isEmpty()) {
            label.visibility = View.GONE
            grid.visibility = View.GONE
            findViewById<View>(R.id.myCoursesHeader)?.visibility = View.GONE
            return
        }
        label.visibility = View.VISIBLE
        grid.visibility = View.VISIBLE
        findViewById<View>(R.id.myCoursesHeader)?.visibility = View.VISIBLE
        if (grid.layoutManager == null) {
            // 2.7.48 — grelha densa de 3 colunas (conceito 1).
            grid.layoutManager = GridLayoutManager(this, 3)
        }
        if (homeCoursesAdapter == null) {
            homeCoursesAdapter = HomeCourseGridAdapter { course ->
                val intent = Intent(this, DetailActivity::class.java)
                intent.putExtra("drivePath", course.drivePath)
                intent.putExtra("folderName", course.name)
                startActivity(intent)
            }
            grid.adapter = homeCoursesAdapter
        }
        homeCoursesAdapter?.submitList(courses)
        // 2.7.48 (Q4 provisório) — "Ver tudo ›" abre a Minha lista
        // (a aba Cursos é a predefinida — é o destino "Cursos para
        // você" do conceito). Só no celular.
        findViewById<View>(R.id.myCoursesSeeAll)?.apply {
            visibility = View.VISIBLE
            setOnClickListener {
                startActivity(Intent(this@HomeActivity, MyListActivity::class.java))
            }
        }
        // Totais reais (cache de 5 min no ApiService) — best-effort:
        // sem resposta, os cartões ficam sem a linha de progresso.
        lifecycleScope.launch {
            val totals = ApiService(this@HomeActivity).getUnifiedCourseTotals()
            val adapter = homeCoursesAdapter ?: return@launch
            if (totals != null && totals != adapter.courseTotals) {
                adapter.courseTotals = totals
                // 2.7.48 — os mesmos totais servem o "N aulas" das
                // pastas recentes (setupRecentFolders).
                courseTotalsCache = totals
                adapter.notifyDataSetChanged()
                setupRecentFolders()
            }
        }
    }

    /**
     * 2.7.48 — "Pastas recentes" (conceito 1): as pastas dos recents
     * (locais + import do servidor — a fonte é o /userstate, nunca
     * só o aparelho), agrupadas por pasta, ordenadas pela aula mais
     * recente, até 6. O cartão mostra "N aulas" SÓ quando há total
     * real unificado p/ o curso (nunca o nº de aulas vistas); sem
     * total, o cartão fica sem o número. "Atualizado …" é o ts do
     * recent mais recente da pasta. O toque abre o detalhe da pasta
     * (o fluxo drive → pastas não muda).
     */
    private fun setupRecentFolders() {
        val label = findViewById<TextView>(R.id.labelRecentFolders) ?: return
        val rail = findViewById<RecyclerView>(R.id.railRecentFolders) ?: return
        val recents = SessionManager.get(this).getRecents()
        // 2.7.54 — regra do Elton (2026-11-25 17:55): esta área mostra
        // a pasta da DISCIPLINA, não a pasta da aula. Quando a pasta
        // do recent é pasta-de-aula ("Aula 18 - Parte 01…"), o cartão
        // sobe para a pasta-mãe — agrupamento, título, total e toque
        // (abre o detalhe da pasta-mãe) usam a pasta da disciplina.
        val groups = recents.groupBy { disciplineFolderOf(it.folderPath) }
            .map { (folder, items) -> Triple(folder, items.maxOf { it.timestamp }, items) }
            .sortedByDescending { it.second }
            .take(6)
        if (groups.isEmpty()) {
            label.visibility = View.GONE
            rail.visibility = View.GONE
            findViewById<View>(R.id.recentFoldersHeader)?.visibility = View.GONE
            findViewById<View>(R.id.recentFoldersSeeAll)?.visibility = View.GONE
            return
        }
        label.visibility = View.VISIBLE
        rail.visibility = View.VISIBLE
        findViewById<View>(R.id.recentFoldersHeader)?.visibility = View.VISIBLE
        // 2.7.48 (Q4 provisório) — "Ver tudo ›" rola até os drives.
        // Só no celular (a TV não tem o link).
        findViewById<View>(R.id.recentFoldersSeeAll)?.apply {
            visibility = View.VISIBLE
            setOnClickListener { scrollToDrives() }
        }
        val now = System.currentTimeMillis()
        val items = groups.map { (folder, latestTs, _) ->
            val total = ApiService.unifiedTotalFor(courseTotalsCache, folder)
            val folderName = LessonDescription.folderNameFromPath(folder)
                ?: Format.extractCourseName(folder)
            val updated = DateUtils.getRelativeTimeSpanString(
                latestTs, now, DateUtils.MINUTE_IN_MILLIS
            ).toString()
            val subtitle = if (total != null && total > 0) {
                getString(R.string.recent_folders_lessons, total) + " • " + updated
            } else {
                updated
            }
            RailItem(
                title = folderName,
                displayTitle = folderName,
                subtitle = subtitle,
                icon = "📁",
                hasProgress = false,
                progress = 0,
                isWatched = false,
                hasResume = false,
                thumbnailUrl = null,
                file = com.meggy.app.data.FileItem(
                    name = folderName, mimeType = "folder", id = "",
                    driveId = null, link = null, size = 0L, modifiedTime = null,
                    folderPath = folder
                )
            )
        }
        if (rail.layoutManager == null) {
            rail.layoutManager =
                LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false)
            rail.addItemDecoration(RailGutterDecoration(tvAutoFit?.gutterDp(200f) ?: 8))
        }
        if (recentFoldersAdapter == null) {
            recentFoldersAdapter = RailAdapter(
                items,
                // 2.7.56 — cadeia vertical das fileiras na TV (UP =
                // fileira visível de cima; DOWN = Drives; LEFT =
                // menu). No celular, sem ids (como sempre foi).
                nextFocusUpId = if (TvUtils.isTv(this)) {
                    when {
                        findViewById<View>(R.id.listDestaques)?.visibility == View.VISIBLE ->
                            R.id.listDestaques
                        binding.railContinue.visibility == View.VISIBLE -> R.id.railContinue
                        else -> View.NO_ID
                    }
                } else View.NO_ID,
                nextFocusDownId = if (TvUtils.isTv(this)) R.id.railDrives else View.NO_ID,
                nextFocusLeftId = tvMenuLeftTargetId()
            ) { item ->
                val folder = item.file?.folderPath ?: return@RailAdapter
                val intent = Intent(this, DetailActivity::class.java)
                intent.putExtra("drivePath", folder)
                intent.putExtra("folderName", item.title)
                startActivity(intent)
            }
            rail.adapter = recentFoldersAdapter
        } else {
            recentFoldersAdapter?.updateItems(items)
        }
    }

    /**
     * 2.7.54 — pasta da disciplina de um recent: se a pasta do vídeo
     * é pasta-de-aula (o nome começa por "aula", contém " - parte "
     * ou é "NNN - aula"), devolve a pasta-mãe (a que agrupa as aulas
     * da disciplina); senão devolve a própria — pastas de tópico com
     * vídeos directos (ex.: "1_Brasil_Colonia") ficam como estão.
     * Nunca sobe além do 1.º nível dentro do drive ("/N:/<raiz>").
     */
    private fun disciplineFolderOf(folderPath: String): String {
        val clean = folderPath.trimEnd('/')
        val name = clean.substringAfterLast('/').lowercase()
        val isLessonFolder = name.startsWith("aula") ||
            name.contains(" - parte ") ||
            Regex("^\\d+\\s*[-–.]\\s*aula\\b").containsMatchIn(name)
        if (!isLessonFolder) return folderPath
        val parent = clean.substringBeforeLast('/', "")
        return if (parent.count { it == '/' } >= 2) parent else folderPath
    }

    /**
     * 2.7.48 — painel "Seu Progresso" (conceito 1/3): horas da semana
     * + sequência de dias, LIDOS DO SERVIDOR (regra 22:41). A fonte é
     * o cache de SessionManager, escrito SÓ pelo import do /userstate
     * (UserStateSync.derivePanelAggregates — a mesma fórmula do
     * /api/analytics/summary do site: semana = minutos dos eventos
     * dos últimos 7 dias; sequência = dias seguidos desde HOJE com
     * minutos > 0). Sem cache (ainda sem import), a seção some —
     * nunca um número inventado localmente. Zeros do servidor
     * mostram-se como zeros: as sessões do desktop contribuem 0
     * minutos (o desktop ainda não os envia — fora deste âmbito).
     */
    private fun setupProgressPanel() {
        val panel = findViewById<View>(R.id.progressPanel) ?: return
        val week = findViewById<TextView>(R.id.progressWeekHours) ?: return
        val streak = findViewById<TextView>(R.id.progressStreak) ?: return
        val agg = SessionManager.get(this).getCachedPanelAggregates()
        if (agg == null) {
            panel.visibility = View.GONE
            return
        }
        panel.visibility = View.VISIBLE
        week.text = UserStateSync.formatWeekHours(agg.weekMinutes)
        streak.text = if (agg.streak == 1) "1 dia" else "${agg.streak} dias"
    }

    /**
     * 2.7.48 — menu lateral da TV (conceito 3/4; decisão 21:37: só
     * na TV). Sem a vista (celular) é no-op. Com o menu ligado, o
     * cabeçalho antigo (ícones Buscar/Minha lista/Ajustes + Sair)
     * esconde-se — o menu cobre tudo (o Sair fica no fim do menu);
     * desligado, volta o cabeçalho de antes.
     */
    private fun setupSideMenu() {
        val menu = findViewById<SideMenuView>(R.id.tvSideMenu) ?: return
        val sm = SessionManager.get(this)
        val topBar = findViewById<View>(R.id.homeTopBar)
        topBar?.visibility = if (sm.tvSideMenuEnabled) View.GONE else View.VISIBLE
        menu.visibility = if (sm.tvSideMenuEnabled) View.VISIBLE else View.GONE
        // 2.7.56 — o conteúdo reserva os 56dp da barra em repouso
        // (layout_marginStart do layout-television); sem menu, a
        // margem sai e o conteúdo ocupa a largura toda. A largura
        // do conteúdo NUNCA muda com a expansão (desliza, não refluí).
        findViewById<View>(R.id.homeContent)?.let { content ->
            val lp = content.layoutParams as? ViewGroup.MarginLayoutParams
            if (lp != null) {
                val target = if (sm.tvSideMenuEnabled) {
                    (SideMenuView.WIDTH_COLLAPSED_DP * resources.displayMetrics.density).toInt()
                } else 0
                if (lp.marginStart != target) {
                    lp.marginStart = target
                    content.layoutParams = lp
                }
            }
        }
        if (!sm.tvSideMenuEnabled) return
        menu.setSelected(SideMenuView.MenuItem.HOME)
        menu.onMenuItemSelected = { item ->
            when (item) {
                SideMenuView.MenuItem.HOME -> binding.homeScroll.smoothScrollTo(0, 0)
                SideMenuView.MenuItem.DRIVES -> scrollToDrives()
                // 2.7.58 — menu TV novo (decisões 19:19–19:25): sem
                // Meggy nem Simulados na TV. MEUS CURSOS abre os
                // cursos do aluno; CONTINUAR abre o detalhe do curso
                // em curso (caminho normal — NUNCA o player directo);
                // DOWNLOADS é a lista real de baixados.
                SideMenuView.MenuItem.MY_COURSES ->
                    startActivity(Intent(this, MyCoursesActivity::class.java))
                SideMenuView.MenuItem.CONTINUE ->
                    TvRailHost.openContinueCourse(this)
                SideMenuView.MenuItem.DOWNLOADS ->
                    startActivity(
                        Intent(this, com.meggy.app.ui.downloads.DownloadsActivity::class.java)
                    )
                SideMenuView.MenuItem.SETTINGS ->
                    startActivity(Intent(this, SettingsActivity::class.java))
            }
        }
        menu.onLogoutSelected = { logout() }
        // 2.7.56 — a expansão é AO FOCO (dentro do SideMenuView; o
        // interruptor persistido e a linha de recolher saíram). Aqui
        // só se liga o DESLIZE do conteúdo: translationX = 184dp ×
        // fracção, sincronizado com a animação da barra pelo mesmo
        // ValueAnimator — sem re-medir nada, sem TvAutoFit novo,
        // sem cadeias refeitas.
        val content = findViewById<View>(R.id.homeContent)
        val slidePx = (SideMenuView.WIDTH_EXPANDED_DP - SideMenuView.WIDTH_COLLAPSED_DP) *
            resources.displayMetrics.density
        menu.onExpandFractionChanged = { f -> content?.translationX = slidePx * f }
    }

    /**
     * R22 UI — seção "Destaques" (cartões horizontais): primeiro os
     * itens curados do hero (dados reais da app, abrem o drive como o
     * hero sempre fez); quando a API de cursos em destaque responde,
     * a lista passa a ser esses cursos (abrem o curso).
     * 2.7.48 — a seção passa a existir também na TV (conceito 3):
     * o `return` da TV saiu; o layout-television ganhou os ids
     * labelDestaques/listDestaques. Mesma rota, mesmo adapter.
     */
    private fun setupDestaques() {
        val label = findViewById<TextView>(R.id.labelDestaques) ?: return
        val list = findViewById<RecyclerView>(R.id.listDestaques) ?: return
        if (list.layoutManager == null) {
            // R26 — rail HORIZONTAL como os outros rails da home
            // (railContinue, railDrives): o RecyclerView VERTICAL com
            // wrap_content + nestedScrollingEnabled=false dentro do
            // ScrollView media altura para um só item (6 submetidos,
            // 1 visível, sem acesso aos outros). Na horizontal a
            // altura vem do cartão (fixa) e todos os cartões ficam
            // alcançáveis por rolagem; o próximo cartão espreita
            // pela largura fixa do item (@dimen/featured_card_width).
            // Sem SnapHelper e sem dots: os outros rails também não
            // têm (rolagem livre) — consistência da página.
            list.layoutManager = LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false)
            // 2.7.56 — gutter acompanha a largura da fileira (240dp).
            list.addItemDecoration(RailGutterDecoration(tvAutoFit?.gutterDp(240f) ?: 8))
        }
        if (destaquesAdapter == null) {
            destaquesAdapter = HomeFeaturedAdapter(
                nextFocusLeftId = tvMenuLeftTargetId(),
                // 2.7.56 — UP: a fileira Continuar; DOWN: corrigido
                // nas cadeias (depende das Pastas recentes). No
                // celular, sem ids (roteamento de sempre).
                nextFocusUpId = if (TvUtils.isTv(this) &&
                    binding.railContinue.visibility == View.VISIBLE
                ) R.id.railContinue else View.NO_ID,
                nextFocusDownId = if (TvUtils.isTv(this)) R.id.railDrives else View.NO_ID
            ) { item ->
                if (item.openAsCourse) {
                    val intent = Intent(this, DetailActivity::class.java)
                    intent.putExtra("drivePath", item.path)
                    intent.putExtra("folderName", item.folderName)
                    startActivity(intent)
                } else {
                    val intent = Intent(this, BrowseActivity::class.java)
                    intent.putExtra("drivePath", item.path)
                    intent.putExtra("folderName", item.folderName)
                    startActivity(intent)
                }
            }
            list.adapter = destaquesAdapter
        }
        label.visibility = View.VISIBLE
        list.visibility = View.VISIBLE
        val fallback = HeroItem.ALL.map { hero ->
            HomeFeaturedItem(
                title = hero.title,
                subtitle = hero.subtitle,
                badge = hero.badge,
                coverUrl = hero.coverUrl ?: featuredCoverByPath[hero.drivePath],
                path = hero.drivePath,
                folderName = hero.driveName,
                openAsCourse = false
            )
        }
        destaquesAdapter?.submitList(fallback)
        // 2.7.58 — hero ambiente por defeito (TV): sem aula em
        // curso, o 1.º destaque alimenta o topo.
        showAmbientDefault()
        lifecycleScope.launch {
            val courses = api.getFeaturedCourses()
            if (!courses.isNullOrEmpty()) {
                // 2.7.58 — subtítulo "N aulas" (SPEC §3.1.2): o
                // total REAL vem do mapa de totais unificado que a
                // Home já busca (getUnifiedCourseTotals via
                // ApiService.unifiedTotalFor); sem total conhecido
                // fica "" (nunca um número inventado).
                val totals = withContext(Dispatchers.IO) {
                    try {
                        api.getUnifiedCourseTotals()
                    } catch (e: Exception) {
                        null
                    }
                }
                val items = courses.map { course ->
                    val total = totals?.let {
                        ApiService.unifiedTotalFor(it, course.coursePath)
                    } ?: 0
                    HomeFeaturedItem(
                        title = course.courseName,
                        subtitle = if (total > 0) {
                            if (total == 1) "1 aula" else "$total aulas"
                        } else "",
                        badge = null,
                        coverUrl = course.coverUrl,
                        path = course.coursePath,
                        folderName = course.courseName,
                        openAsCourse = true
                    )
                }
                destaquesAdapter?.submitList(items)
                showAmbientDefault()
            }
        }
    }

    private fun setupFeaturedContinue(recents: List<SessionManager.RecentItem>) {
        val sm = SessionManager.get(this)
        // R22 UI: o cartão largo "Continuar assistindo" passa a
        // existir também no celular (conceito aprovado); na TV o
        // comportamento é exatamente o anterior. As diferenças de
        // apresentação ficam salvas por isTvHere.
        val isTvHere = TvUtils.isTv(this)
        // 2.7.56 — na TV a seção de destaque NÃO existe (B2: o item
        // em curso é o cartão largo da fileira Continuar — ver
        // setupContinueRail). A vista está gone no layout e nenhum
        // caminho a volta a mostrar aqui. No celular, o cartão
        // largo continua a ser montado como sempre.
        if (isTvHere) {
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
        // 2.7.48 — hero compacto (conceitos 1/3): o TÍTULO passa a ser
        // a saudação ("Olá, <nome>! 👋 Você tem N aulas em andamento.",
        // N = recents com resume guardado); o TEMA da aula fica no
        // SUBTÍTULO — a regra 14:51 mantém-se (o nome que se vê é o
        // tema da aula, nunca o nome do ficheiro).
        // 2.7.52 — na TV o destaque é o HERO IMERSIVO (conceito
        // tv-home-nova): título = TEMA da aula (regra R28), subtítulo
        // = curso, progresso "% • Xmin restantes" (minutos só com
        // duração conhecida) e o texto de posição some. O ramo do
        // celular fica byte a byte o de sempre.
        val inProgress = recents.count { sm.hasResume(it.folderPath, it.videoName) }
        val username = sm.username ?: "Aluno"
        if (isTvHere) {
            val courseName = Format.extractCourseName(best.folderPath)
            binding.featuredTitle.setWordEllipsized(
                LessonDescription.folderNameFromPath(best.folderPath)
                    ?: Format.lessonDisplayTitle(best.videoName, courseName)
            )
            binding.featuredSubtitle.setWordEllipsized(courseName)
            binding.featuredProgressText.text =
                if (dur > 0) Format.progressText(progress, dur, pos)
                else "$progress% concluído"
            binding.featuredTimeText.visibility = View.GONE
        } else {
            binding.featuredTitle.setWordEllipsized(
                if (inProgress == 1) getString(R.string.home_greeting_singular, username)
                else getString(R.string.home_greeting_plural, username, inProgress)
            )
            binding.featuredSubtitle.setWordEllipsized(
                Format.lessonDisplayTitle(best.videoName, Format.extractCourseName(best.folderPath))
            )
            binding.featuredProgressText.text = "$progress% concluído"
            // R22 UI: no celular o cartão mostra o que FALTA ("Faltam
            // MM:SS", como no conceito); na TV mantém-se o texto completo
            // de posição. Sem duração conhecida, cai no texto de posição.
            binding.featuredTimeText.text =
                if (dur > pos && pos > 0) {
                    getString(R.string.home_remaining, Format.mmss(dur - pos))
                } else {
                    Format.positionText(pos, dur)
                }
        }
        binding.featuredProgress.progress = progress
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
            Format.extractCourseName(best.folderPath), best.folderPath
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
            continueWatching(best.folderPath, best.videoName, Format.extractCourseName(best.folderPath))
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
            continueWatching(best.folderPath, best.videoName, Format.extractCourseName(best.folderPath))
        }
        // R18B (Bug 1 #1): 1.00x na TV — o cartão tem 848dp
        // (largura total); qualquer escala é cortada nas laterais
        // e invade o overscan. Ficam anel 3dp + elevação 16dp.
        // R22 UI: no celular não há anel de foco D-pad — o attach é
        // só da TV (o clique do cartão já ficou ligado acima).
        if (isTvHere) {
            FocusAnimator.attachCard(binding.featuredCard, true, scaleTv = FocusAnimator.SCALE_TV_NONE)
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
        // Frente H — caminho rápido: o recent já salva o link de
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
            // R19B (P1+P2): o listFolder agora distingue sessão
            // expirada de falha transitória. Transitória mostra erro
            // e NUNCA faz bounce; expirada tenta o re-login
            // silencioso uma vez e só faz bounce se ele falhar.
            val result = withContext(Dispatchers.IO) {
                AuthHelper.listFolderWithRelogin(api, folderPath)
            }
            if (result is FolderResult.SessionExpired) {
                AuthHelper.bounceToLogin(this@HomeActivity)
                return@launch
            }
            if (result is FolderResult.Transient) {
                com.google.android.material.snackbar.Snackbar.make(
                    binding.root, "Não foi possível carregar o vídeo. Verifique a conexão e tente de novo.",
                    com.google.android.material.snackbar.Snackbar.LENGTH_LONG
                ).show()
                return@launch
            }
            val files = (result as FolderResult.Ok).files

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

            // R29 — a pasta guardada já não existe (listagem vazia):
            // tenta resolver o vídeo no caminho atual (busca no D1 +
            // passeio no Drive) em vez de abrir a pasta-mãe. Sem
            // resultado, cai no comportamento atual logo abaixo.
            if (files.isEmpty()) {
                val resolved = withContext(Dispatchers.IO) {
                    StaleRecentResolver.resolve(api, this@HomeActivity, folderPath, videoName)
                }
                if (resolved != null) {
                    val playable = resolved.playable.map { it.copy(folderPath = resolved.folderPath) }
                    val idx = playable.indexOfFirst { it.name == resolved.video.name }
                    PlaylistManager.setPlaylist(playable, if (idx >= 0) idx else 0, this@HomeActivity)
                    launchPlayer(MeggyApp.BASE_URL + (resolved.video.link ?: ""), resolved.video.name, resolved.folderPath, resolved.video.thumbnailLink)
                    return@launch
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
        // Frente H — salva o link de playback no recent (além da thumb):
        // o "Continuar assistindo" passa a navegar sem listFolder prévio.
        sm.addRecent(folderPath, title, thumbnailLink, url.removePrefix(MeggyApp.BASE_URL).takeIf { it != url })
        val intent = Intent(this, PlayerActivity::class.java)
        intent.putExtra(PlayerActivity.EXTRA_URL, url)
        intent.putExtra(PlayerActivity.EXTRA_TITLE, title)
        intent.putExtra(PlayerActivity.EXTRA_FOLDER_PATH, folderPath)
        startActivity(intent)
    }


    /**
     * 2.7.56 — alvo do LEFT dos cartões da home TV: a linha
     * seleccionada do menu lateral (o padrão que o heroPlay já
     * usava). NO_ID sem TV ou com o menu desligado — aí o
     * roteamento é o padrão.
     */
    private fun tvMenuLeftTargetId(): Int {
        if (!TvUtils.isTv(this)) return View.NO_ID
        if (!SessionManager.get(this).tvSideMenuEnabled) return View.NO_ID
        return findViewById<SideMenuView>(R.id.tvSideMenu)?.selectedRowId() ?: View.NO_ID
    }

    /** 2.7.56 — id da 1.ª fileira de conteúdo visível da home TV. */
    private fun tvFirstContentId(): Int = when {
        binding.railContinue.visibility == View.VISIBLE -> R.id.railContinue
        findViewById<View>(R.id.listDestaques)?.visibility == View.VISIBLE -> R.id.listDestaques
        findViewById<View>(R.id.railRecentFolders)?.visibility == View.VISIBLE ->
            R.id.railRecentFolders
        else -> R.id.railDrives
    }

    /**
     * Frente A (TV) — cadeias D-pad explícitas da home (só TV).
     * 2.7.56 — sem hero nem destaque: com o menu ligado, o RIGHT das
     * linhas do menu entra no conteúdo pela 1.ª fileira visível (e o
     * LEFT dos cartões volta à linha seleccionada, via adapters);
     * sem menu, os atalhos do cabeçalho descem para essa fileira.
     * As cadeias verticais entre fileiras vivem nos adapters (UP/
     * DOWN por fileira, na ordem da página); aqui só se corrige o
     * DOWN dos Destaques, que depende das Pastas recentes (montadas
     * depois dos Destaques).
     */
    private fun setupTvFocusChains() {
        if (!TvUtils.isTv(this)) return
        val menu = findViewById<SideMenuView>(R.id.tvSideMenu)
        val menuOn = menu != null && SessionManager.get(this).tvSideMenuEnabled
        val firstContent = tvFirstContentId()
        if (menuOn) {
            menu!!.rows().forEach { row ->
                row.nextFocusRightId = firstContent
            }
        } else {
            findViewById<View>(R.id.tvNavSearch)?.nextFocusDownId = firstContent
            findViewById<View>(R.id.tvNavMylist)?.nextFocusDownId = firstContent
            findViewById<View>(R.id.tvNavSettings)?.nextFocusDownId = firstContent
        }
        destaquesAdapter?.updateFocusDownId(
            if (findViewById<View>(R.id.railRecentFolders)?.visibility == View.VISIBLE) {
                R.id.railRecentFolders
            } else {
                R.id.railDrives
            }
        )
    }

    /**
     * Ronda 7 Frente B — auto-ajuste da home da TV (TvAutoFit).
     *
     * Tudo o que aqui se toca e GEOMETRIA DA HOME NA TV: margens de overscan
     * (laterais 56dp, topo/fundo >=48dp), altura do hero, textos do hero /
     * destaque / secoes e thumb do destaque (16:9). O XML continua a ser a
     * baseline da 32" (escala 1.0): a escala 1.0 retorna exatamente os
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
        // 2.7.56 — o padding vai para o CONTEÚDO (homeContent): a
        // raiz é agora o FrameLayout que também segura a barra
        // lateral sobreposta, e a barra não leva margem de overscan.
        findViewById<View>(R.id.homeContent)?.setPadding(
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
        // 2.7.56 — os blocos do hero e do destaque SAÍRAM (B2: as
        // duas vistas estão gone na TV e nada as dimensiona).
        // Secoes + rodape. 2.7.56 — rótulos de seção a 28sp (conceitos aprovados)
        // (30 detalhe / 28 secção pelos conceitos / 15 cartão / 13 meta).
        binding.labelContinue.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(28f))
        binding.labelDrives.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(28f))
        // 2.7.48 — novas seções da TV, nos mesmos tamanhos.
        findViewById<TextView>(R.id.labelRecentFolders)?.setTextSize(
            TypedValue.COMPLEX_UNIT_SP, fit.textSp(28f))
        findViewById<TextView>(R.id.labelDestaques)?.setTextSize(
            TypedValue.COMPLEX_UNIT_SP, fit.textSp(28f))
        findViewById<TextView>(R.id.progressTitle)?.setTextSize(
            TypedValue.COMPLEX_UNIT_SP, fit.textSp(28f))
        findViewById<TextView>(R.id.progressWeekHours)?.setTextSize(
            TypedValue.COMPLEX_UNIT_SP, fit.textSp(22f))
        findViewById<TextView>(R.id.progressStreak)?.setTextSize(
            TypedValue.COMPLEX_UNIT_SP, fit.textSp(22f))
        findViewById<TextView>(R.id.progressWeekLabel)?.setTextSize(
            TypedValue.COMPLEX_UNIT_SP, fit.textSp(13f))
        findViewById<TextView>(R.id.progressStreakLabel)?.setTextSize(
            TypedValue.COMPLEX_UNIT_SP, fit.textSp(13f))
        binding.footerVersion.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(13f))
        // Espacamentos verticais com marginScale.
        fit.applyTopMargin(binding.labelContinue, fit.marginPx(26f))
        fit.applyTopMargin(binding.labelDrives, fit.marginPx(26f))
        fit.applyTopMargin(binding.footerVersion, fit.marginPx(26f))
        fit.applyTopMargin(binding.railContinue, fit.marginPx(12f))
        fit.applyTopMargin(binding.railDrives, fit.marginPx(12f))
        // 2.7.48 — as novas seções entram no mesmo ritmo.
        findViewById<View>(R.id.labelRecentFolders)?.let {
            fit.applyTopMargin(it, fit.marginPx(26f))
        }
        findViewById<View>(R.id.railRecentFolders)?.let {
            fit.applyTopMargin(it, fit.marginPx(12f))
        }
        findViewById<View>(R.id.labelDestaques)?.let {
            fit.applyTopMargin(it, fit.marginPx(26f))
        }
        findViewById<View>(R.id.listDestaques)?.let {
            fit.applyTopMargin(it, fit.marginPx(12f))
        }
        findViewById<View>(R.id.progressPanel)?.let {
            fit.applyTopMargin(it, fit.marginPx(26f))
        }
    }

    private fun setupDrivesRail() {
        // Frente A (TV) — UP do tile de drive volta à fileira de
        // cima (a visível mais próxima). 2.7.56: na TV a cadeia
        // segue a ordem das fileiras (Pastas recentes → Destaques →
        // Continuar); no celular ficam os alvos de sempre.
        val drivesUpId = if (TvUtils.isTv(this)) {
            when {
                findViewById<View>(R.id.railRecentFolders)?.visibility == View.VISIBLE ->
                    R.id.railRecentFolders
                findViewById<View>(R.id.listDestaques)?.visibility == View.VISIBLE ->
                    R.id.listDestaques
                binding.railContinue.visibility == View.VISIBLE -> R.id.railContinue
                else -> View.NO_ID
            }
        } else {
            when {
                binding.railContinue.visibility == View.VISIBLE -> R.id.railContinue
                binding.featuredSection.visibility == View.VISIBLE -> R.id.featured_card
                else -> R.id.heroPlay
            }
        }
        // Ronda 17 Frente B — LayoutManager, decoração e adapter
        // criados UMA só vez (como o rail Continue): hoje corriam em
        // cada chamada e as decorações acumulavam-se. Depois da 1.ª
        // vez, só o id de foco UP é atualizado (o conteúdo vem por
        // updateItems, no fetchAdminDrives).
        if (drivesAdapter == null) {
            binding.railDrives.layoutManager =
                LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false)
            binding.railDrives.addItemDecoration(RailGutterDecoration(tvAutoFit?.gutterDp(150f) ?: 8))
            drivesAdapter = DriveRailAdapter(
                buildDriveRailItems(), featuredCoverByPath,
                nextFocusUpId = drivesUpId,
                nextFocusLeftId = tvMenuLeftTargetId()
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
     * do servidor como registros gerenciados (source='hardcoded',
     * rootIndex) e os do admin a seguir — sem duplicados (dedupe por
     * driveId e por rootIndex). Um fixo REMOVIDO no admin nao volta a
     * aparecer: o seed do servidor so corre com a tabela vazia, e o
     * app nao o repoe a partir de DriveItem.ALL quando o servidor
     * respondeu. Offline/falha (serverDrives == null) -> fallback
     * DriveItem.ALL + admin (comportamento da Ronda 10).
     * Um registro gerenciado casa com o DriveItem fixo do mesmo rootIndex
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
     * p/ o APK atual (o admin vê TODOS na tela "Gerenciar drives"; na
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
            // mudou de fato (o updateItems já nem redesenha sem
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
        // Ronda 20 — nunca remover com o observer salvo: quando a vista já
        // foi desligada da janela, o observer salvo está morto e o remove
        // lança IllegalStateException ("This ViewTreeObserver is not alive").
        // Um observer fresco obtido aqui é sempre seguro: vista ligada → o
        // observer vivo da janela (o remove funciona); vista desligada → o
        // observer flutuante (o remove é um no-op) — e a guarda isAlive cobre
        // o resto.
        val observer = binding.root.viewTreeObserver
        if (observer.isAlive) {
            observer.removeOnGlobalFocusChangeListener(globalFocusListener)
        }
        focusObserver = null
        focusListenerRegistered = false
        super.onDestroy()
        heroRotator?.stop()
    }

    companion object {
        /**
         * Extra: ao abrir a Home, rolar até "Explorar drives" (item
         * Drives da barra inferior nas outras abas).
         */
        const val EXTRA_SCROLL_TO_DRIVES = "scroll_to_drives"

        /**
         * 2.7.58 — destino REAL: a página de Simulados do app
         * (SimuladoActivity: matéria/assunto/quantidade/tempo,
         * banco de questões do servidor). Substitui o provisório
         * 2.7.48 (drive RETA FINAL TRTs). Ponto centralizado usado
         * pela barra inferior de todas as abas.
         */
        fun openSimulados(context: Context) {
            context.startActivity(
                Intent(context, com.meggy.app.ui.simulado.SimuladoActivity::class.java)
            )
        }

        /**
         * 2.7.58 — destino REAL: o chat da Meggy NA NUVEM
         * (MeggyChatActivity). Ponto centralizado usado pela barra
         * inferior de todas as abas e pelo player (com a aula em
         * foco como extras).
         */
        fun openMeggyChat(
            context: Context,
            lessonPath: String? = null,
            lessonName: String? = null,
            videoName: String? = null
        ) {
            context.startActivity(
                com.meggy.app.ui.meggy.MeggyChatActivity.intent(
                    context, lessonPath, lessonName, videoName
                )
            )
        }
    }

    /** Rola até a seção "Explorar drives" (item Drives da barra). */
    private fun scrollToDrives() {
        binding.homeScroll.post {
            binding.homeScroll.smoothScrollTo(0, binding.labelDrives.top)
        }
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
