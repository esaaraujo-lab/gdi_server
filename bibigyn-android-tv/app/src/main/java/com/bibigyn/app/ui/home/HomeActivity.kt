package com.bibigyn.app.ui.home

import android.content.Intent
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
import androidx.lifecycle.LifecycleCoroutineScope
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.bibigyn.app.BuildConfig
import com.bibigyn.app.BiBiGynApp
import com.bibigyn.app.R
import com.bibigyn.app.data.AdminDrive
import com.bibigyn.app.data.ApiService
import com.bibigyn.app.data.FolderResult
import com.bibigyn.app.data.DriveItem
import com.bibigyn.app.data.FileItem
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
import com.bibigyn.app.util.AdminDriveUi
import com.bibigyn.app.util.DriveRailItem
import com.bibigyn.app.util.CoverLibrary
import com.bibigyn.app.util.PlaylistManager
import com.bibigyn.app.util.SessionManager
import com.bibigyn.app.util.UserStateSync
import com.bibigyn.app.util.TapFeedback
import com.bibigyn.app.util.Format
import com.bibigyn.app.util.LessonDescription
import com.bibigyn.app.util.StaleRecentResolver
import com.bibigyn.app.util.TvUtils
import com.bibigyn.app.util.TvAutoFit
import com.bibigyn.app.util.FocusAnimator
import com.bibigyn.app.util.setWordEllipsized
import com.bibigyn.app.util.UpdateChecker
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
    // v2.1.9: arte do hero por drivePath (primeiro vídeo do drive) —
    // 1 busca por drive, depois cache em memória até o app fechar.
    private val heroThumbCache = mutableMapOf<String, String?>()
    // Onda 2 (a) — capa do admin por coursePath (GET
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

    companion object {
        /** v2.1.44 — pedido de rolagem p/ a fileira de drives (menu
         *  lateral da TV nas outras telas → TvRailHost). */
        const val EXTRA_SCROLL_TO_DRIVES = "bibi_scroll_to_drives"
    }
    private val globalFocusListener = ViewTreeObserver.OnGlobalFocusChangeListener { _, newFocus ->
        val view = newFocus ?: return@OnGlobalFocusChangeListener
        val continuePos = adapterPositionIn(binding.railContinue, view)
        if (continuePos != null) {
            lastFocusContinue = continuePos
            lastFocusedRail = 1
            // v2.1.44 — o hero ambiente segue o foco (TV).
            continueAdapter?.itemAt(continuePos)?.let { ambientFromContinueItem(it) }
            invalidateStaleFocusRestore(1, continuePos)
            return@OnGlobalFocusChangeListener
        }
        val drivesPos = adapterPositionIn(binding.railDrives, view)
        if (drivesPos != null) {
            lastFocusDrives = drivesPos
            lastFocusedRail = 2
            // v2.1.44 — idem p/ a fileira de drives.
            drivesAdapter?.itemAt(drivesPos)?.let { ambientFromDriveItem(it) }
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
        // v2.1.5: checagem com throttle (máx. 1×/24h) + resume de APK
        // pendente — ver UpdateChecker.checkForUpdateThrottled.
        UpdateChecker.checkForUpdateThrottled(this, BuildConfig.VERSION_NAME)

        // ★ v1.8.0: dynamic version footer (sem emoji, v2.1.5)
        binding.footerVersion.text = "BiBi Fit · v${BuildConfig.VERSION_NAME}"

        // v2.1.5: TV não tem bottom nav.
        if (TvUtils.isTv(this)) binding.bottomNav.visibility = View.GONE
        setupSideMenu()

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
                R.id.nav_fitness -> {
                    // v2.1.44 — assistente fitness (só celular).
                    startActivity(
                        Intent(this, com.bibigyn.app.ui.fitness.FitnessChatActivity::class.java)
                    )
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
        // v2.1.44 — chegada via menu da TV com pedido de rolagem.
        if (intent.getBooleanExtra(EXTRA_SCROLL_TO_DRIVES, false)) {
            scrollToDrives()
        }
        fetchFeaturedCovers()
        // Ronda 10 Frente C — drives do admin (best-effort;
        // sem rota, o rail mostra só os fixos). Re-fetch no
        // onResume.
        fetchAdminDrives()
        // Camada 3 — biblioteca de capas por tipo (Elton 2026-11-14
        // 19:50): busca o manifesto em 2º plano; quando chega,
        // re-aplica a arte do hero e redesenha os rails (os cards
        // passam a resolver a imagem da biblioteca). Sem URL / sem
        // rede / sem match, nada muda — e nunca há toast de erro.
        CoverLibrary.warmUp(this) {
            if (isFinishing || isDestroyed) return@warmUp
            heroRotator?.refreshArt()
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
            setupFeaturedContinue(SessionManager.get(this).getRecents())
        }
        // 2.1.43 — import do progresso do servidor (GET /userstate);
        // o mesmo import também corre ao voltar à Home
        // (ver launchUserStateImport).
        launchUserStateImport()
    }

    /**
     * 2.1.43 — import do progresso do servidor (GET /userstate):
     * alimenta recents/resume/assistido locais. Best-effort, em 2º
     * plano; ao terminar, refrescam-se as seções que leem esses
     * dados. Sem rede/D1, fica tudo como estava e o próximo
     * arranque tenta outra vez.
     * Corre no onCreate E ao voltar à Home (onResume): o progresso
     * feito noutro aparelho enquanto a app estava aberta passa a
     * aparecer sem reiniciar. Sem duplicar imports em curso: a
     * guarda do UserStateSync salta o GET se um import já estiver
     * a correr (nesse caso, é o refresh desse import que actualiza
     * as seções quando ele termina).
     */
    private fun launchUserStateImport() {
        lifecycleScope.launch(Dispatchers.IO) {
            UserStateSync.importOnStartup(this@HomeActivity)
            withContext(Dispatchers.Main) {
                if (isFinishing || isDestroyed) return@withContext
                setupContinueRail()
                setupTvFocusChains()
            }
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
            val snap = captureHomeFocus()
            // Ronda 18 Frente C (F3) — idem fetchAdminDrives: só se
            // repõe quando alguma capa mudou E o snapshot tem algo
            // a repor.
            val coversChanged = drivesAdapter?.setFeaturedCovers(map + serverCoverByPath) ?: false
            if (coversChanged && (snap.target != 0 || snap.scrollY > 0)) restoreHomeFocus(snap)
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
        // v2.1.9 (d) — CAUSA DA NAV DESENCONTRADA: voltar de Ajustes/
        // Minha lista com Back só resumia a Home (onResume), sem passar
        // pelo onNewIntent — e o selectedItemId ficava na aba anterior
        // (o toque nela já tinha movido a seleção antes de abrir a tela).
        // Por isso a home mostrava "Ajustes" destacado. Resetar aqui
        // garante "Início" selecionado sempre que a home está na frente.
        binding.bottomNav.selectedItemId = R.id.nav_home

        // Frente G: reconstruir o rail "Continue assistindo" ao
        // voltar (o player grava recents/resume; sem isto a home
        // só mostrava o vídeo visto depois de reiniciar o app).
        // Local, sem rede (só o backfill de thumbs, já guardado).
        // As cadeias de foco da TV são refeitas porque a secção
        // em destaque pode ter aparecido entretanto.
        setupContinueRail()
        setupTvFocusChains()
        // 2.1.43 — o import do servidor também corre ao voltar: o
        // progresso gravado noutro aparelho (site/desktop/TV)
        // enquanto a app estava aberta entra sem reiniciar. Sem
        // duplicar um import em curso (guarda no UserStateSync).
        launchUserStateImport()
        // Ronda 10 Frente C — re-busca os drives do admin ao
        // voltar: o remover da Frente B faz o tile sumir sem
        // reiniciar o app.
        fetchAdminDrives()
        // v2.1.5: re-checa atualização ao voltar (throttle 1×/24h) e
        // restaura o foco nos rails (TV).
        UpdateChecker.checkForUpdateThrottled(this, BuildConfig.VERSION_NAME)
        // Ronda 17 Frente B (gatilho A) — o restauro foca a posição
        // REAL (observador global de foco), não a posição 0: D-pad sem
        // clique já não perde o lugar. 1.ª abertura: posição 0 (como
        // hoje); regresso: foco + scrollY guardados.
        if (TvUtils.isTv(this)) {
            if (isFirstResume) {
                if (SessionManager.get(this).tvSideMenuEnabled) {
                    // v2.1.44 — foco inicial da home TV Plex: o 1.º
                    // cartão da fileira Continuar (o CTA da página);
                    // sem Continuar, o 1.º cartão de drives.
                    if (binding.railContinue.visibility == View.VISIBLE) {
                        binding.railContinue.post {
                            binding.railContinue.findViewHolderForAdapterPosition(0)
                                ?.itemView?.requestFocus()
                        }
                    } else {
                        binding.railDrives.post {
                            binding.railDrives.findViewHolderForAdapterPosition(0)
                                ?.itemView?.requestFocus()
                        }
                    }
                } else if (binding.featuredSection.visibility == View.VISIBLE) {
                    // Sem rail (Ajustes): o comportamento de antes —
                    // o herói (botão Continuar do destaque).
                    binding.featuredCard.post { binding.featuredCard.requestFocus() }
                } else {
                    binding.railContinue.post {
                        binding.railContinue.findViewHolderForAdapterPosition(0)
                            ?.itemView?.requestFocus()
                    }
                    binding.railDrives.post {
                        binding.railDrives.findViewHolderForAdapterPosition(0)
                            ?.itemView?.requestFocus()
                    }
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
        // v2.1.44 — menu da TV (outras telas): "Drives" traz a Home
        // já rolada p/ a fileira de drives.
        if (intent.getBooleanExtra(EXTRA_SCROLL_TO_DRIVES, false)) {
            scrollToDrives()
        }
    }

    /** v2.1.44 — rola até à fileira de drives e foca o 1.º cartão
     *  (o comportamento do antigo item "Drives" do menu fixo). */
    private fun scrollToDrives() {
        binding.homeScroll.post {
            val rail = binding.railDrives
            binding.homeScroll.smoothScrollTo(0, rail.top)
            rail.findViewHolderForAdapterPosition(0)?.itemView?.requestFocus()
        }
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
        val root = withContext(Dispatchers.IO) { api.listFolder(drivePath, maxPages = 1).filesOrNull }
            ?: return null
        root.firstOrNull { (it.isVideo || it.isAudio) && !it.thumbnailLink.isNullOrBlank() }
            ?.thumbnailLink?.let { return it }
        val firstFolder = root.firstOrNull { it.isFolder } ?: return null
        val sub = withContext(Dispatchers.IO) {
            api.listFolder("$drivePath${firstFolder.name}/", maxPages = 1).filesOrNull
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

    // ──────────── v2.1.44: Hero ambiente da TV (segue o foco) ────────────
    //
    // Porte da Meggy 2.7.58 adaptado às cadeias da BiBi: o bloco
    // ambient* só existe no layout-television (findViewById null no
    // celular = no-op). O foco numa fileira alimenta o topo com o
    // item focado; sem foco ainda, showAmbientDefault mostra a aula
    // em curso. Dedup por chave (título|meta) p/ não recarregar a
    // imagem a cada micro-movimento de foco igual.

    private var ambientKey: String? = null

    private fun updateAmbientHero(
        title: String,
        meta: String,
        progress: Int?,
        thumbUrl: String?,
        coverPath: String?
    ) {
        if (!TvUtils.isTv(this)) return
        val block = findViewById<View>(R.id.ambientHero) ?: return
        val key = "$title|$meta"
        if (key == ambientKey && block.visibility == View.VISIBLE) return
        ambientKey = key
        block.visibility = View.VISIBLE
        findViewById<TextView>(R.id.ambientTitle)?.text = title
        findViewById<TextView>(R.id.ambientMeta)?.text = meta
        val bar = findViewById<android.widget.ProgressBar>(R.id.ambientProgress)
        if (progress != null) {
            bar?.visibility = View.VISIBLE
            bar?.progress = progress
        } else {
            bar?.visibility = View.GONE
        }
        val image = findViewById<android.widget.ImageView>(R.id.ambientImage) ?: return
        val coverRes = coverPath?.let { DriveItem.coverResForPath(it) }
        val showFallback = {
            val libraryUrl = CoverLibrary.resolveStrict(this, title, coverPath)
            if (!libraryUrl.isNullOrBlank()) {
                image.visibility = View.VISIBLE
                image.load(libraryUrl) {
                    if (coverRes != null) error(coverRes)
                    listener(onError = { _, _ ->
                        if (coverRes != null) image.setImageResource(coverRes)
                        else image.visibility = View.GONE
                    })
                }
            } else if (coverRes != null) {
                image.visibility = View.VISIBLE
                image.setImageResource(coverRes)
            } else {
                image.visibility = View.GONE
            }
        }
        if (!thumbUrl.isNullOrBlank()) {
            image.visibility = View.VISIBLE
            image.load(thumbUrl) {
                if (coverRes != null) error(coverRes)
                listener(onError = { _, _ -> showFallback() })
            }
        } else {
            showFallback()
        }
    }

    /** Hero ambiente a partir de um cartão do rail Continuar. */
    private fun ambientFromContinueItem(item: RailItem) {
        val courseName = item.file?.folderPath?.let { Format.extractCourseName(it) }
            ?: item.subtitle
        val title = item.displayTitle ?: Format.lessonTitle(item.title, courseName)
        // Meta do Continuar na TV: matéria · assunto (decisão 19:24).
        val meta = if (title.equals(courseName, ignoreCase = true)) courseName
            else "$courseName · $title"
        updateAmbientHero(
            title = title,
            meta = meta,
            progress = if (item.hasProgress) item.progress else null,
            thumbUrl = item.thumbnailUrl ?: item.file?.thumbnailLink,
            coverPath = item.file?.folderPath
        )
    }

    /** Hero ambiente a partir de um cartão do rail de drives. */
    private fun ambientFromDriveItem(item: DriveRailItem) {
        when (item) {
            is DriveRailItem.Fixed -> {
                val path = "/${item.drive.index}:/"
                updateAmbientHero(
                    title = item.drive.name,
                    meta = item.drive.tagline,
                    progress = null,
                    thumbUrl = featuredCoverByPath[path] ?: serverCoverByPath[path],
                    coverPath = path
                )
            }
            is DriveRailItem.Admin -> updateAmbientHero(
                title = item.drive.name,
                meta = "",
                progress = null,
                thumbUrl = item.drive.coverUrl,
                coverPath = null
            )
        }
    }

    /** Estado por omissão do hero ambiente: a aula em curso (o
     *  "best" do Continuar); sem nenhuma, o bloco fica escondido. */
    private fun showAmbientDefault() {
        if (!TvUtils.isTv(this)) return
        if (ambientKey != null) return
        val sm = SessionManager.get(this)
        val best = sm.getRecents()
            .filter { sm.hasResume(it.folderPath, it.videoName) }
            .maxByOrNull { sm.getResumeProgress(it.folderPath, it.videoName) }
            ?: return
        val courseName = Format.extractCourseName(best.folderPath)
        val title = LessonDescription.folderNameFromPath(best.folderPath)
            ?: Format.lessonTitle(best.videoName, courseName)
        val meta = if (title.equals(courseName, ignoreCase = true)) courseName
            else "$courseName · $title"
        updateAmbientHero(
            title = title,
            meta = meta,
            progress = sm.getResumeProgress(best.folderPath, best.videoName),
            thumbUrl = best.thumbnailLink,
            coverPath = best.folderPath
        )
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
        // Ronda 17 Frente B (gatilho A) — LayoutManager, decoração e
        // adapter criados UMA só vez: recriá-los no onResume apagava
        // a rolagem do rail e repunha a posição em 0. Depois da 1.ª
        // vez, só os DADOS são actualizados (updateItems, abaixo).
        // A guarda itemDecorationCount da 2.1.9 fica subsumida no
        // teste layoutManager == null (só corre na 1.ª construção).
        val firstBuild = continueAdapter == null
        if (binding.railContinue.layoutManager == null) {
            binding.railContinue.layoutManager =
                LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false)
            binding.railContinue.addItemDecoration(RailGutterDecoration(tvAutoFit?.gutterDp(200f) ?: 8))
        }

        // v2.1.44 — quem sai da fileira mudou (paridade Meggy 2.7.58):
        //  • TV COM rail Plex: NINGUÉM sai — o item em curso é o 1.º
        //    cartão da fileira e o topo é o hero ambiente.
        //  • TV SEM rail (Ajustes) e CELULAR: o "best" sai da fileira
        //    e vive no cartão de destaque (setupFeaturedContinue) —
        //    sem duplicação (a queixa do Elton na 2.1.41).
        val isTvHome = TvUtils.isTv(this)
        val railMode = isTvHome && sm.tvSideMenuEnabled
        val heroRecent = if (railMode) null else {
            recents.filter { sm.hasResume(it.folderPath, it.videoName) }
                .maxByOrNull { sm.getResumeProgress(it.folderPath, it.videoName) }
        }
        val railRecents = if (heroRecent != null) {
            recents.filterNot {
                it.folderPath == heroRecent.folderPath && it.videoName == heroRecent.videoName
            }
        } else recents
        if (railRecents.isEmpty()) {
            // Só existe o item do destaque: a fileira some, ele fica.
            binding.labelContinue.visibility = View.GONE
            binding.railContinue.visibility = View.GONE
            continueAdapter?.updateItems(emptyList())
            setupFeaturedContinue(recents)
            if (recents.any { it.thumbnailLink.isNullOrBlank() }) {
                lifecycleScope.launch { backfillRecentThumbs(recents) }
            }
            return
        }

        // ★ v2.5.0: Show the COURSE NAME (not the folder path) as subtitle.
        // Format.extractCourseName() returns a human-friendly label like
        // "PF - Agente" or "DirAdmin" depending on the path depth.
        val railItems = railRecents.map { r ->
            val courseName = Format.extractCourseName(r.folderPath)
            // Port R28 da Meggy — o título do card é o NOME DO TEMA DA
            // AULA = o nome da pasta da aula (último segmento do
            // folderPath, mesma fonte do título da tela Detalhe e do
            // player p/ arquivo genérico): o nome cru do arquivo
            // ("Videoaula") some do título. Sem segmento na pasta, cai
            // no título antigo. Subtítulo = nome do curso (regra R26,
            // partilhada c/ o Detalhe em Format.continueSubtitle).
            val displayTitle = LessonDescription.folderNameFromPath(r.folderPath)
                ?: Format.lessonTitle(r.videoName, courseName)
            val subtitle = Format.continueSubtitle(displayTitle, r.videoName, courseName, TvUtils.isTv(this))
            RailItem(
                title = r.videoName,
                displayTitle = displayTitle,
                subtitle = subtitle,
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
        // v2.1.44 — com o rail Plex a fileira é a de CIMA da página
        // (o topo é o hero ambiente, não focável): UP = NO_ID.
        val hasFeatured = !railMode && TvUtils.isTv(this) &&
            recents.any { sm.hasResume(it.folderPath, it.videoName) }
        val continueUpId = when {
            railMode -> View.NO_ID
            hasFeatured -> R.id.featured_card
            else -> R.id.heroPlay
        }
        if (firstBuild) {
            continueAdapter = RailAdapter(
                railItems,
                nextFocusUpId = continueUpId,
                nextFocusDownId = R.id.railDrives,
                // v2.1.41 — cartões grandes 16:9 na TV (conceito);
                // v2.1.44 — com o rail Plex, cartões UNIFORMES de
                // 240dp + corpo limpo (plainTvBody), paridade Meggy
                // 2.7.58; no celular o parâmetro nem é aplicado.
                tvCardWidthDp = if (railMode) 240f else if (isTvHome) 300f else 200f,
                plainTvBody = railMode
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
                continueUpId,
                R.id.railDrives
            )
            if (changed) restoreHomeFocus(snap)
        }
        setupFeaturedContinue(recents)
        // v2.1.44 — hero ambiente: estado por omissão (a aula em
        // curso) até o foco escolher outro item.
        showAmbientDefault()
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
                api.listFolder(r.folderPath, maxPages = 1).filesOrNull
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
     * v2.1.5 — "Continuar de onde parou" em destaque: o item em
     * andamento mais recente, com thumb, progresso e "12:34 de
     * 48:20 · 12 min restantes".
     *
     * v2.1.44 — papéis por aparelho (paridade Meggy 2.7.58):
     *  • TV COM rail Plex: a seção fica GONE e o hero de drives
     *    também — o topo é o hero ambiente e o item em curso é o
     *    1.º cartão da fileira Continuar.
     *  • TV SEM rail: o comportamento da 2.1.41 (destaque = herói).
     *  • CELULAR: a seção passa a ser o CARTÃO CONTINUAR da Home
     *    (o "best" sai da fileira — ver setupContinueRail); sem
     *    item em curso, some e o hero de drives fica.
     */
    private fun setupFeaturedContinue(recents: List<SessionManager.RecentItem>) {
        val sm = SessionManager.get(this)
        val isTv = TvUtils.isTv(this)
        if (isTv && sm.tvSideMenuEnabled) {
            binding.featuredSection.visibility = View.GONE
            binding.heroCard.visibility = View.GONE
            return
        }
        val best = recents
            .filter { sm.hasResume(it.folderPath, it.videoName) }
            .maxByOrNull { sm.getResumeProgress(it.folderPath, it.videoName) }
        if (best == null) {
            binding.featuredSection.visibility = View.GONE
            // v2.1.41 — sem destaque, o herói de drives volta (a home
            // nunca fica sem herói).
            binding.heroCard.visibility = View.VISIBLE
            return
        }
        // Com destaque, ELE é o herói/carta: o hero de drives some
        // para não duplicar conteúdo.
        binding.heroCard.visibility = View.GONE
        val progress = sm.getResumeProgress(best.folderPath, best.videoName)
        val pos = sm.getResume(best.folderPath, best.videoName)
        val dur = sm.getResumeDuration(best.folderPath, best.videoName)
        binding.featuredSection.visibility = View.VISIBLE
        // v2.1.9 (c): título limpo ("001 - aula.mp4" → tema/"Aula NN").
        // Port R28 — herói alinhado com o rail: o título é o NOME DO
        // TEMA DA AULA (nome da pasta); sem segmento, o título antigo.
        binding.featuredTitle.setWordEllipsized(
            LessonDescription.folderNameFromPath(best.folderPath)
                ?: Format.lessonTitle(best.videoName, Format.extractCourseName(best.folderPath))
        )
        binding.featuredSubtitle.setWordEllipsized(Format.extractCourseName(best.folderPath))
        binding.featuredProgress.progress = progress
        // v2.1.41 (conceito): "% concluído · X min restantes" — os
        // minutos restantes só aparecem com duração conhecida
        // (Format.progressText); sem duração, só o %.
        binding.featuredProgressText.text =
            if (dur > 0) Format.progressText(progress, dur, pos) else "$progress% concluído"
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
            continueWatching(best.folderPath, best.videoName, Format.extractCourseName(best.folderPath))
        }
        // v2.1.8 — o CARD GRANDE e o alvo do foco na TV: clicavel e
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
        // R18B (Bug 1 #1): 1.00x na TV — o cartão tem largura total;
        // qualquer escala é cortada nas laterais e invade o
        // overscan. v2.1.41: o anel passa a BRANCO 4dp (conceito +
        // padrão R27 das grades) — fica anel branco + elevação 16dp.
        // v2.1.44 — no celular a seção é o cartão Continuar: o
        // attach é o de toque (isTv=false), sem anel de TV.
        if (TvUtils.isTv(this)) {
            FocusAnimator.attachCard(
                binding.featuredCard, true,
                scaleTv = FocusAnimator.SCALE_TV_NONE,
                ringColorRes = R.color.tile_focus_ring_white,
                ringWidthDp = 4f
            )
        } else {
            FocusAnimator.attachCard(binding.featuredCard, false)
        }
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
            Format.extractCourseName(best.folderPath), best.folderPath
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
            launchPlayer(BiBiGynApp.BASE_URL + fastLink, videoName, folderPath, recent.thumbnailLink)
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
                        launchPlayer(BiBiGynApp.BASE_URL + clickedVideo.link, videoName, folderPath, clickedVideo.thumbnailLink)
                        return@launch
                    } else {
                        // Frente H — sem esperar pela montagem interfolder:
                        // navega já com só este vídeo; o player enriquece
                        // a fila em 2º plano (enrichPlaylistInBackground).
                        PlaylistManager.setPlaylist(
                            listOf(clickedVideo.copy(folderPath = folderPath)), 0, this@HomeActivity
                        )
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
            // Port R29 da Meggy — a pasta guardada já não existe
            // (listagem vazia): tenta resolver o vídeo no caminho atual
            // (busca no D1 + passeio no Drive) em vez de abrir a
            // pasta-mãe. Sem resultado, cai no comportamento atual
            // logo abaixo.
            if (files.isEmpty()) {
                val resolved = withContext(Dispatchers.IO) {
                    StaleRecentResolver.resolve(api, this@HomeActivity, folderPath, videoName)
                }
                if (resolved != null) {
                    val playable = resolved.playable.map { it.copy(folderPath = resolved.folderPath) }
                    val idx = playable.indexOfFirst { it.name == resolved.video.name }
                    PlaylistManager.setPlaylist(playable, if (idx >= 0) idx else 0, this@HomeActivity)
                    launchPlayer(BiBiGynApp.BASE_URL + (resolved.video.link ?: ""), resolved.video.name, resolved.folderPath, resolved.video.thumbnailLink)
                    return@launch
                }
            }

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
        sm.addRecent(folderPath, title, thumbnailLink, url.removePrefix(BiBiGynApp.BASE_URL).takeIf { it != url })
        val intent = Intent(this, PlayerActivity::class.java)
        intent.putExtra(PlayerActivity.EXTRA_URL, url)
        intent.putExtra(PlayerActivity.EXTRA_TITLE, title)
        intent.putExtra(PlayerActivity.EXTRA_FOLDER_PATH, folderPath)
        startActivity(intent)
    }


    /**
     * v2.1.44 — rail lateral estilo Plex da Home TV (porte da Meggy
     * 2.7.56/2.7.58; substitui o menu fixo de 264dp da 2.1.41). Sem a
     * vista (celular) é no-op. Com o rail ligado, a barra do topo
     * (nome + Sair) esconde-se — o rail cobre tudo (o Sair fica no
     * rodapé dele); desligado, volta o cabeçalho de antes e o
     * conteúdo perde a margem de 56dp. A largura do conteúdo NUNCA
     * muda com a expansão (desliza, não refluí).
     *
     * Menu da TV (decisões do Elton): Início, Drives, MEUS CURSOS,
     * CONTINUAR (abre o detalhe do curso em curso — caminho normal,
     * NUNCA o player directo), Downloads, Ajustes + Sair. Sem chat
     * nem simulados na TV.
     */
    private fun setupSideMenu() {
        val menu = findViewById<SideMenuView>(R.id.tvSideMenu) ?: return
        val sm = SessionManager.get(this)
        val topBar = findViewById<View>(R.id.homeTopBar)
        topBar?.visibility = if (sm.tvSideMenuEnabled) View.GONE else View.VISIBLE
        menu.visibility = if (sm.tvSideMenuEnabled) View.VISIBLE else View.GONE
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
                SideMenuView.MenuItem.MY_COURSES ->
                    startActivity(Intent(this, MyCoursesActivity::class.java))
                SideMenuView.MenuItem.CONTINUE ->
                    TvRailHost.openContinueCourse(this)
                SideMenuView.MenuItem.DOWNLOADS ->
                    startActivity(
                        Intent(this, com.bibigyn.app.ui.downloads.DownloadsActivity::class.java)
                    )
                SideMenuView.MenuItem.SETTINGS ->
                    startActivity(Intent(this, SettingsActivity::class.java))
            }
        }
        menu.onLogoutSelected = { logout() }
        // A expansão é AO FOCO (dentro do SideMenuView). Aqui só se
        // liga o DESLIZE do conteúdo: translationX = 184dp × fracção,
        // sincronizado com a animação da barra pelo mesmo
        // ValueAnimator — sem re-medir nada.
        val content = findViewById<View>(R.id.homeContent)
        val slidePx = (SideMenuView.WIDTH_EXPANDED_DP - SideMenuView.WIDTH_COLLAPSED_DP) *
            resources.displayMetrics.density
        menu.onExpandFractionChanged = { f -> content?.translationX = slidePx * f }
        // DIREITA das linhas do menu → o 1.º conteúdo focável (a
        // fileira Continuar; sem ela, a de drives).
        val firstContent = if (binding.railContinue.visibility == View.VISIBLE) {
            R.id.railContinue
        } else R.id.railDrives
        menu.rows().forEach { row -> row.nextFocusRightId = firstContent }
    }

    /**
     * Frente A (TV) — cadeias D-pad explícitas da home (só TV).
     * v2.1.44 — com o rail Plex ligado, o topo da página é a fileira
     * Continuar (o hero ambiente não é focável e o hero/destaque
     * estão GONE): as cadeias antigas do herói não se aplicam e o
     * UP/DOWN entre fileiras vive nos adapters (nextFocusUp/Down).
     * Com o rail DESLIGADO, mantêm-se as cadeias da 2.1.41 (herói →
     * destaque → fileiras), sem o menu fixo que já não existe.
     */
    private fun setupTvFocusChains() {
        if (!TvUtils.isTv(this)) return
        if (SessionManager.get(this).tvSideMenuEnabled) return
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
        // v2.1.44 — o padding vai para o CONTENTOR do conteúdo
        // (homeContent): a raiz agora é o FrameLayout que também
        // segura o rail — paddear a raiz deslocava o rail.
        findViewById<View>(R.id.homeContent)?.setPadding(
            fit.sideMarginPx(), fit.topMarginPx(),
            fit.sideMarginPx(), fit.bottomMarginPx()
        )
        // Topo: nome da app + "Sair" (+ logo, so na Meggy).
        binding.topTitle?.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(22f))
        binding.topSair?.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(13f))
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
        // Destaque (v2.1.41 — herói imersivo): cartão em largura
        // total, altura pela escala do hero (400dp de base); a thumb
        // é full-bleed (a caixa 320x180 da versão antiga saiu).
        binding.featuredCard.layoutParams =
            binding.featuredCard.layoutParams.apply { height = fit.heroPx(400f) }
        binding.featuredTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(36f))
        binding.featuredSubtitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(17f))
        binding.featuredProgressText.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(15f))
        binding.featuredTimeText.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(15f))
        binding.featuredContinue.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(17f))
        binding.featuredDriveArt.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(56f))
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
        // v2.1.44 — com o rail Plex, sem Continuar visível o UP não
        // tem alvo (o topo é o hero ambiente, não focável): NO_ID.
        val railMode = TvUtils.isTv(this) && SessionManager.get(this).tvSideMenuEnabled
        val drivesUpId = when {
            binding.railContinue.visibility == View.VISIBLE -> R.id.railContinue
            railMode -> View.NO_ID
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
        // Ronda 20 — nunca remover com o observer guardado: quando a vista já
        // foi desligada da janela, o observer guardado está morto e o remove
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
