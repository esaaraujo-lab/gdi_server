package com.meggy.app.ui.detail

import android.content.Intent
import android.graphics.Color
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.google.android.material.snackbar.Snackbar
import com.meggy.app.MeggyApp
import com.meggy.app.R
import com.meggy.app.data.AiService
import com.meggy.app.data.AdminDrive
import com.meggy.app.data.ApiService
import com.meggy.app.data.FileItem
import com.meggy.app.data.colorFromString
import com.meggy.app.databinding.ActivityDetailBinding
import com.meggy.app.ui.home.HomeActivity
import com.meggy.app.ui.home.RailAdapter
import com.meggy.app.ui.home.RailItem
import com.meggy.app.ui.mylist.MyListActivity
import com.meggy.app.ui.player.PlayerActivity
import com.meggy.app.ui.reader.MdReaderActivity
import com.meggy.app.ui.reader.PdfReaderActivity
import com.meggy.app.ui.search.SearchActivity
import com.meggy.app.ui.settings.SettingsActivity
import com.meggy.app.util.AdminDriveUi
import com.meggy.app.util.AuthHelper
import com.meggy.app.util.Format
import com.meggy.app.util.LessonDescription
import com.meggy.app.util.MarkdownRenderer
import com.meggy.app.util.MaterialSaver
import com.meggy.app.util.PlaylistManager
import com.meggy.app.util.SessionManager
import com.meggy.app.util.TapFeedback
import com.meggy.app.util.ThumbArt
import com.meggy.app.util.LibraryCovers
import com.meggy.app.util.TvUtils
import com.meggy.app.util.MaterialDiscovery
import com.meggy.app.util.FocusAnimator
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

/**
 * v2.7.6 — Detalhe da aula (conceito detalhe, escolhido pelo Elton 23:41).
 *
 * Hero 16:9 com foto da aula (thumb do primeiro vídeo via Coil; sem
 * thumb, gradiente + monograma — nunca placeholder cinza), play rosa
 * central, progresso + tempo "12:34 / 48:20". Título grande, curso em
 * rosa, chips com borda (N aulas · N pastas · X% concluído — sem chip
 * "HD" inventado: as aulas são MP4 progressivos de uma só versão).
 * Botão rosa "Continuar assistindo" (retoma o ponto exato; sem
 * resume, toca o primeiro vídeo). Abas Resumo | Aulas | Questões |
 * Flashcards — Aulas é a 4ª aba (preserva a grade de arquivos) e a
 * padrão; Resumo mostra o resumo real do curso quando existir (a
 * pasta "Transcrição"/"transcript" é a fonte); Questões/Flashcards
 * mostram estados vazios desenhados (o app não tem fonte de dados
 * para elas — nunca inventar perguntas). Bottom nav presente.
 *
 * "Escolher as aulas" (aba Aulas): estrutura interfolder — cada aula
 * é uma pasta; a lista expansível (celular) ou grade 2 colunas (TV/
 * tablet largo) mostra vídeo, PDF, pasta de PDFs e .md/transcrição.
 * Vídeo → player (playlist existente, intacta); PDF → leitor embutido;
 * .md → leitor de MD. Pasta sem subpastas: grade plana (FileAdapter),
 * como antes.
 *
 * TV: layout-television/activity_detail.xml — 2 colunas (hero à
 * esquerda, info à direita, grade de aulas em largura total abaixo),
 * header com logo + busca + avatar. Sem bottom nav na TV.
 *
 * DETECÇÃO DAS ESTRUTURAS (Elton 00:04 — preservar, não mudar):
 *   folderCount = files.count { it.isFolder }  (em loadFolder()).
 *   folderCount > 0 → INTERFOLDER: grupos = subpastas (uma por aula);
 *     arquivos soltos na raiz vão para o grupo "Arquivos avulsos"
 *     (filhos: vídeo→player, PDF→leitor, .md→leitor). CASO MISTO
 *     (vídeos + subpastas) cai aqui — os vídeos soltos NÃO somem.
 *   folderCount == 0 → PLANA: todos os vídeos numa só pasta; celular
 *     mostra a lista plana (FlatLessonAdapter), TV/largo a grade de
 *     cards (FileAdapter). A ordem é a da API, sem reordenar.
 *   A busca "Buscar aula…" filtra pelo nome nas DUAS estruturas.
 */
class DetailActivity : AppCompatActivity() {

    private lateinit var binding: ActivityDetailBinding
    private lateinit var api: ApiService
    private var currentPath: String = "/"
    private var folderName: String = "Detalhe"
    // Ronda 10 Frente C — drive do admin que abriu este detalhe
    // (null = drive fixo; ver AdminDriveUi). Enquanto não for
    // null, o hero usa a sub-capa e as pastas usam subfolderCovers.
    private var adminDrive: AdminDrive? = null

    /**
     * Ronda 13 Frente C — base de ficheiros deste detalhe: os links
     * (/download.aspx?...) sao cunhados com as chaves do worker que
     * listou a pasta — os do sandbox SO o sandbox os serve (a
     * producao nao os decifra). Em modo por ID (caminho
     * "by-id:<folderId>") a base e o sandbox; nos drives fixos, a
     * producao. [path] e o caminho da pasta do ficheiro (currentPath
     * ou o folderPath do grupo/pai).
     */
    private fun fileBaseUrl(path: String): String =
        if (ApiService.isByIdPath(path)) ApiService.SANDBOX_BASE_URL
        else MeggyApp.BASE_URL
    private var fileAdapter: com.meggy.app.ui.browse.FileAdapter? = null
    private var lessonListAdapter: LessonListAdapter? = null
    private var lessonGridAdapter: LessonGridAdapter? = null
    private var flatAdapter: FlatLessonAdapter? = null
    // Frente R4B — filtro da lista plana (Todos / Vídeos / Materiais).
    private var flatFilter: FlatFilter = FlatFilter.ALL
    private var isFlatMode: Boolean = false
    // Frente R14A — materiais vindos da pasta ao lado (ver
    // MaterialDiscovery): só entram na secção Materiais da lista
    // plana do telemóvel; nunca na contagem, no hero, na playlist
    // nem na grade da TV. Job cancelado ao recarregar/sair.
    private var extraMaterials: List<FileItem> = emptyList()
    private var extraMaterialsJob: Job? = null
    // Ronda 9 Frente B — questões/flashcards da aula (ver
    // loadQuestionsFlashcards): carregados UMA vez por abertura, a
    // partir do pacote ISA + da pasta de materiais (.gdi-questoess/
    // e .gdi-flashcards/); nunca inventados — sem itens, o estado
    // vazio honesto fica.
    private var qfJob: Job? = null
    private var qfLoaded: Boolean = false
    private var qfQuestions: List<DetailQuestion> = emptyList()
    private var qfFlashcards: List<DetailFlashcard> = emptyList()
    private var qfQuestionsList: LinearLayout? = null
    private var qfFlashcardsList: LinearLayout? = null
    private var lessonGroups: List<LessonGroup> = emptyList()
    private var allFiles: List<FileItem> = emptyList()
    private var currentTab: Tab = Tab.LESSONS
    private var lastFocusedContinuePos = 0
    // v2.7.11 camada (3) — quando o manifesto da biblioteca chega,
    // re-aplica o hero e as listas (o app já está com a capa gerada).
    private val libraryReadyListener: () -> Unit = {
        if (!isFinishing && !isDestroyed) {
            refreshHeroCover()
            binding.recycler.adapter?.notifyDataSetChanged()
            binding.railContinue.adapter?.notifyDataSetChanged()
        }
    }

    private enum class Tab { SUMMARY, LESSONS, QUESTIONS, FLASHCARDS }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityDetailBinding.inflate(layoutInflater)
        setContentView(binding.root)

        api = ApiService(this)
        // Ronda 12 — migração de caminhos guardados: um drivePath
        // guardado na organização antiga ("/11:/CURSOS 2026/…") já
        // não existe no drive 11; normalizar aqui cobre TODAS as
        // entradas (Minha Lista, favoritos, recents, bookmarks,
        // busca, fallback do "Continuar") sem reescrever o que
        // está guardado. Ver SessionManager.migrateLegacyCoursePath.
        currentPath = SessionManager.migrateLegacyCoursePath(
            intent.getStringExtra("drivePath") ?: "/"
        )
        folderName = intent.getStringExtra("folderName") ?: "Detalhe"
        // Ronda 10 Frente C — lê o drive do admin dos extras
        // (null nos drives fixos) e activa as capas de sub-pasta.
        adminDrive = AdminDriveUi.adminDriveFromIntent(intent)
        adminDrive?.let { drive ->
            val root = AdminDriveUi.adminDriveRootFromIntent(intent) ?: currentPath
            AdminDriveUi.setSubfolderCovers(root, drive.subfolderCovers)
        }
        // v2.7.11 camada (3) — manifesto em 2º plano (o warmUp é
        // guardado: se a home já buscou, não busca de novo).
        LibraryCovers.warmUp(this)
        LibraryCovers.addOnReadyListener(libraryReadyListener)

        // Hero
        binding.heroTitle.text = folderName
        binding.toolbar.title = folderName
        binding.toolbar.setNavigationOnClickListener { finish() }
        val baseColor = colorFromString(folderName)
        binding.heroBg.background = heroGradient(baseColor)
        // v2.7.11 onda 2 — hero sempre com capa: a gerada do drive
        // já no onCreate; loadFolder() troca pela thumb do Drive
        // (1º vídeo) quando houver. Nunca monograma.
        binding.heroImage.visibility = View.VISIBLE
        binding.heroMonogram.visibility = View.GONE
        binding.heroImage.setImageResource(ThumbArt.coverResForPath(currentPath))

        // TV: header com busca + avatar; sem bottom nav.
        val isTv = TvUtils.isTv(this)
        binding.bottomNav.visibility = if (isTv) View.GONE else View.VISIBLE
        binding.headerSearch.visibility = if (isTv) View.VISIBLE else View.GONE
        binding.headerAvatar.visibility = if (isTv) View.VISIBLE else View.GONE
        binding.headerSearch.setOnClickListener {
            startActivity(Intent(this, SearchActivity::class.java))
        }

        // ⭐ Salvar este curso
        updateHeroFav()
        binding.heroFav.setOnClickListener {
            val sm = SessionManager.get(this)
            val nowFav = sm.toggleFavoriteCourse(currentPath, folderName)
            updateHeroFav()
            Toast.makeText(this,
                if (nowFav) "⭐ Curso adicionado à Minha lista"
                else "Curso removido da Minha lista",
                Toast.LENGTH_SHORT).show()
        }

        // CTA + play do hero: retoma o ponto exato (ou 1º vídeo).
        binding.ctaContinue.setOnClickListener { playResumeOrFirst() }
        binding.heroPlayFab.setOnClickListener { playResumeOrFirst() }

        // Abas
        binding.tabResumo.setOnClickListener { selectTab(Tab.SUMMARY) }
        binding.tabAulas.setOnClickListener { selectTab(Tab.LESSONS) }
        binding.tabQuestoes.setOnClickListener { selectTab(Tab.QUESTIONS) }
        binding.tabFlashcards.setOnClickListener { selectTab(Tab.FLASHCARDS) }
        // Frente A (TV) — as abas, o play do hero, o "Salvar" e a
        // lupa não tinham NENHUM feedback de foco (fundos estáticos,
        // sem FocusAnimator): o D-pad chegava lá sem se ver onde
        // estava. Escala 1.10× + elevação (attach) e anel via
        // seletores com estado focado (abas e lupa:
        // focus_ring_transparent; play: btn_play_circle). Só TV.
        if (isTv) {
            FocusAnimator.attach(binding.tabResumo, true)
            FocusAnimator.attach(binding.tabAulas, true)
            FocusAnimator.attach(binding.tabQuestoes, true)
            FocusAnimator.attach(binding.tabFlashcards, true)
            FocusAnimator.attach(binding.heroPlayFab, true)
            FocusAnimator.attach(binding.heroFav, true)
            FocusAnimator.attach(binding.headerSearch, true)
        }

        // Busca dentro da aba Aulas (filtra as aulas pelo nome, local).
        binding.lessonSearch.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) = filterLessons(s?.toString().orEmpty())
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        })

        // Frente R4B — chips Todos / Vídeos / Materiais da lista plana
        // (só o layout do celular os tem; na TV o findViewById devolve
        // null e nada acontece — ver setupFlatFilterChips).
        setupFlatFilterChips()

        // Bottom nav (celular; TV não tem).
        binding.bottomNav.setOnItemSelectedListener { item ->
            when (item.itemId) {
                R.id.nav_home -> { startActivity(Intent(this, HomeActivity::class.java)); true }
                R.id.nav_search -> { startActivity(Intent(this, SearchActivity::class.java)); true }
                R.id.nav_mylist -> { startActivity(Intent(this, MyListActivity::class.java)); true }
                R.id.nav_settings -> { startActivity(Intent(this, SettingsActivity::class.java)); true }
                else -> false
            }
        }

        setupContinueRail()
        selectTab(Tab.LESSONS)
        loadFolder()
    }

    override fun onResume() {
        super.onResume()
        // Ronda 10 Frente C — re-activa as capas de sub-pasta
        // do drive do admin (um detalhe-filho destruído limpa
        // o registo ao sair; ao voltar, este detalhe volta a
        // valer).
        adminDrive?.let { drive ->
            val root = AdminDriveUi.adminDriveRootFromIntent(intent) ?: currentPath
            AdminDriveUi.setSubfolderCovers(root, drive.subfolderCovers)
        }
        // Restaura o foco no rail "Continuar de onde parou" (TV).
        if (TvUtils.isTv(this) && binding.railContinue.visibility == View.VISIBLE) {
            binding.railContinue.post {
                binding.railContinue.findViewHolderForAdapterPosition(lastFocusedContinuePos)
                    ?.itemView?.requestFocus()
            }
        } else if (TvUtils.isTv(this)) {
            // Frente A (TV) — sem recents não há rail: o foco inicial
            // é o CTA "Continuar assistindo" (o layout TV anuncia-o
            // como "EM FOCO"), em vez de a tela abrir sem foco nenhum
            // e o 1º D-pad cair na lupa sem anel visível.
            binding.ctaContinue.post { binding.ctaContinue.requestFocus() }
        }
    }

    override fun onDestroy() {
        // Ronda 10 Frente C — desactiva as capas de sub-pasta
        // do drive do admin.
        AdminDriveUi.clearSubfolderCovers()
        LibraryCovers.removeOnReadyListener(libraryReadyListener)
        descriptionJob?.cancel()
        qfJob?.cancel()
        super.onDestroy()
    }

    private fun updateHeroFav() {
        val fav = SessionManager.get(this).isFavoriteCourse(currentPath)
        binding.heroFav.text = if (fav) "⭐  Salvo" else "☆  Salvar"
    }

    private fun selectTab(tab: Tab) {
        currentTab = tab
        val pink = ContextCompat.getColor(this, R.color.md_primary)
        val muted = ContextCompat.getColor(this, R.color.md_on_surface_variant)
        val white = ContextCompat.getColor(this, R.color.md_on_surface)
        fun set(tabBtn: View, label: View, indicator: View, active: Boolean) {
            (label as android.widget.TextView).setTextColor(if (active) white else muted)
            indicator.setBackgroundColor(if (active) pink else android.graphics.Color.TRANSPARENT)
        }
        set(binding.tabResumo, binding.tabResumoLabel, binding.tabIndicatorResumo, tab == Tab.SUMMARY)
        set(binding.tabAulas, binding.tabAulasLabel, binding.tabIndicatorAulas, tab == Tab.LESSONS)
        set(binding.tabQuestoes, binding.tabQuestoesLabel, binding.tabIndicatorQuestoes, tab == Tab.QUESTIONS)
        set(binding.tabFlashcards, binding.tabFlashcardsLabel, binding.tabIndicatorFlashcards, tab == Tab.FLASHCARDS)
        binding.panelResumo.visibility = if (tab == Tab.SUMMARY) View.VISIBLE else View.GONE
        binding.panelAulas.visibility = if (tab == Tab.LESSONS) View.VISIBLE else View.GONE
        binding.panelQuestoes.visibility = if (tab == Tab.QUESTIONS) View.VISIBLE else View.GONE
        binding.panelFlashcards.visibility = if (tab == Tab.FLASHCARDS) View.VISIBLE else View.GONE
    }

    /** "Continue de onde parou" (per-drive recents) — igual ao v2.2.0. */
    private fun setupContinueRail() {
        val sm = SessionManager.get(this)
        val allRecents = sm.getRecents()
        val driveRecents = allRecents.filter { it.folderPath.startsWith(currentPath) }

        if (driveRecents.isEmpty()) {
            binding.labelContinue.visibility = View.GONE
            binding.railContinue.visibility = View.GONE
            return
        }
        binding.labelContinue.visibility = View.VISIBLE
        binding.railContinue.visibility = View.VISIBLE
        binding.railContinue.layoutManager =
            LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false)
        binding.railContinue.addItemDecoration(RailGutterDecoration(8))

        val railItems = driveRecents.map { r ->
            val shortFolder = r.folderPath.substringAfterLast("/").ifBlank { r.folderPath }
            val progress = sm.getResumeProgress(r.folderPath, r.videoName)
            RailItem(
                title = r.videoName,
                displayTitle = Format.lessonDisplayTitle(r.videoName, shortFolder),
                subtitle = shortFolder,
                icon = "🎥",
                hasProgress = progress > 0,
                progress = progress,
                isWatched = sm.isWatched(r.folderPath, r.videoName),
                hasResume = sm.hasResume(r.folderPath, r.videoName),
                thumbnailUrl = r.thumbnailLink,
                file = FileItem(
                    name = r.videoName, mimeType = "video/mp4", id = "",
                    driveId = null, link = null, size = 0L, modifiedTime = null,
                    folderPath = r.folderPath
                )
            )
        }
        binding.railContinue.adapter = RailAdapter(
            railItems,
            nextFocusUpId = R.id.tabAulas,
            nextFocusDownId = R.id.recycler
        ) { item ->
            lastFocusedContinuePos = railItems.indexOf(item)
            val match = driveRecents.find { it.videoName == item.title } ?: return@RailAdapter
            continueWatching(match.folderPath, match.videoName, item.subtitle)
        }
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
            launchPlayer(fileBaseUrl(folderPath) + fastLink, videoName, folderPath, recent.thumbnailLink)
            return
        }
        Snackbar.make(binding.root, "Carregando \"$videoName\"...", Snackbar.LENGTH_SHORT).show()
        lifecycleScope.launch {
            val files = withContext(Dispatchers.IO) { api.listFolder(folderPath) }
            if (files == null) {
                AuthHelper.bounceToLogin(this@DetailActivity)
                return@launch
            }
            if (files.isNotEmpty()) {
                val clickedVideo = files.find { it.name == videoName && (it.isVideo || it.isAudio) }
                if (clickedVideo != null && !clickedVideo.link.isNullOrEmpty()) {
                    val playable = files.filter { (it.isVideo || it.isAudio) && !it.link.isNullOrEmpty() }
                    if (playable.size > 1) {
                        val idx = playable.indexOfFirst { it.name == videoName }
                        // Ronda 15 Frente B (B1): carimbar folderPath — sem isto o progresso cai na loja legada pos_<url>.
                        PlaylistManager.setPlaylist(playable.map { it.copy(folderPath = folderPath) }, if (idx >= 0) idx else 0, this@DetailActivity)
                        launchPlayer(fileBaseUrl(folderPath) + clickedVideo.link, videoName, folderPath, clickedVideo.thumbnailLink)
                        return@launch
                    } else {
                        // Frente H — sem esperar pela montagem interfolder:
                        // navega já com só este vídeo; o player enriquece
                        // a fila em 2º plano (enrichPlaylistInBackground).
                        PlaylistManager.setPlaylist(
                            listOf(clickedVideo.copy(folderPath = folderPath)), 0, this@DetailActivity
                        )
                        launchPlayer(fileBaseUrl(folderPath) + clickedVideo.link, videoName, folderPath, clickedVideo.thumbnailLink)
                        return@launch
                    }
                }
            }
            val intent = Intent(this@DetailActivity, DetailActivity::class.java)
            intent.putExtra("drivePath", folderPath)
            intent.putExtra("folderName", shortFolder)
            startActivity(intent)
        }
    }


    private fun calculateSpanCount(): Int {
        val displayMetrics = resources.displayMetrics
        val screenWidthDp = displayMetrics.widthPixels / displayMetrics.density
        return if (screenWidthDp >= 900) 5 else if (screenWidthDp >= 600) 4 else 2
    }

    /** Largura ≥ 600dp (tablet/TV): grade 2 colunas de aulas. */
    private fun isWide(): Boolean {
        val dm = resources.displayMetrics
        return dm.widthPixels / dm.density >= 600
    }

    private fun loadFolder() {
        binding.loadingView.visibility = View.VISIBLE
        binding.emptyState.visibility = View.GONE

        lifecycleScope.launch {
            val files = withContext(Dispatchers.IO) { api.listFolder(currentPath) }
            binding.loadingView.visibility = View.GONE

            if (files == null) {
                AuthHelper.bounceToLogin(this@DetailActivity)
                return@launch
            }
            allFiles = files
            // Frente R14A — limpa os extras da pasta anterior (se a
            // tela recarregar, a descoberta corre de novo no ramo plano).
            extraMaterialsJob?.cancel()
            extraMaterials = emptyList()

            // Hero: (2) thumb do 1º vídeo, (3) imagem da biblioteca
            // por nome da pasta/curso, (4) capa gerada — nunca monograma.
            refreshHeroCover()

            // Chips reais: N aulas, N pastas, X% concluído. Sem "HD".
            val videoCount = files.count { it.isVideo || it.isAudio }
            val folderCount = files.count { it.isFolder }
            binding.chipCount.text = when {
                videoCount > 0 && folderCount > 0 -> "$videoCount aulas · $folderCount pastas"
                videoCount > 0 -> "$videoCount aulas"
                folderCount > 0 -> "$folderCount pastas"
                else -> "${files.size} arquivos"
            }
            val sm = SessionManager.get(this@DetailActivity)
            if (folderCount == 0) {
                updateProgressChip(files)
            } else {
                // Ronda 15 Frente B (B3): os grupos ainda não foram
                // reconstruídos para esta pasta — o % só é calculado
                // depois do buildLessonGroups + prefetch (refreshLessonList).
                binding.chipProgress.text = "a calcular…"
            }
            binding.chipFolders.text = "$folderCount pastas"

            // Resumo: descrição gerada / provisória / branco (00:21).
            loadLessonDescription(files)

            // Hero: progresso da aula mais recente em andamento.
            updateHeroProgress()

            // Ronda 9 Frente B — questões/flashcards DA AULA (não do
            // curso): mesmo âmbito do resumo; pasta de curso (só
            // subpastas) fica no estado vazio honesto.
            loadQuestionsFlashcards(files)

            if (files.isEmpty()) {
                binding.emptyState.visibility = View.VISIBLE
                binding.recycler.adapter = null
            } else if (folderCount > 0) {
                // Modo aulas (interfolder): grupos = subpastas.
                binding.sectionLabel.text = getString(R.string.tab_lessons)
                buildLessonGroups(files)
            } else {
                // ── ESTRUTURA PLANA (Elton 00:04): pasta SEM subpastas —
                // todos os vídeos numa só pasta. Detecção: folderCount == 0
                // (files.count { it.isFolder }). A listagem é a da API, na
                // ordem recebida (não reordenada). Celular: lista plana
                // (FlatLessonAdapter, conceito pasta-unica); TV/largo:
                // grade de cards (FileAdapter, mesmo padrão da grade de
                // escolher aulas). PDFs/MD da pasta abrem os leitores.
                isFlatMode = true
                // Frente R4B — a contagem "N vídeos" conta SÓ .mp4 (a
                // secção Vídeos); o resto fica em Materiais e as
                // legendas .srt/.vtt nem aparecem na lista.
                val mp4Count = files.count { it.name.endsWith(".mp4", true) }
                val watchedMp4Count = files.count {
                    it.name.endsWith(".mp4", true) && sm.isWatched(currentPath, it.name)
                }
                binding.sectionLabel.text = if (mp4Count > 0) {
                    "$mp4Count vídeos em uma só pasta · $watchedMp4Count concluídos"
                } else {
                    "Arquivos"
                }
                if (isWide()) {
                    val adapter = com.meggy.app.ui.browse.FileAdapter(
                        onFolder = { file -> openFolder(file) },
                        onFile = { file -> openFile(file) },
                        // Frente A (TV): UP da 1ª linha -> aba Aulas.
                        firstRowNextFocusUpId = R.id.tabAulas
                    )
                    fileAdapter = adapter
                    adapter.setFolderPath(currentPath)
                    binding.recycler.layoutManager = GridLayoutManager(this@DetailActivity, calculateSpanCount())
                    binding.recycler.addItemDecoration(GridGutterDecoration(10))
                    binding.recycler.adapter = adapter
                    adapter.submitList(files)
                    val resumed = files.filter { it.isVideo && sm.hasResume(currentPath, it.name) }
                        .map { it.name }.toSet()
                    val watched = files.filter { it.isVideo && sm.isWatched(currentPath, it.name) }
                        .map { it.name }.toSet()
                    adapter.setResumeAndWatched(resumed, watched)
                } else {
                    val adapter = FlatLessonAdapter(
                        folderPath = currentPath,
                        onPlay = { file -> openFile(file) },
                        onOpenPdf = { file -> openPdf(file, file.folderPath ?: currentPath) },
                        onOpenMd = { file -> openMd(file, file.folderPath ?: currentPath) },
                        onOpenOther = { file -> openFile(file) }
                    )
                    flatAdapter = adapter
                    binding.recycler.layoutManager = LinearLayoutManager(this@DetailActivity)
                    binding.recycler.adapter = adapter
                    // Frente R4B — a lista chega já partida em secções
                    // (Vídeos .mp4 / Materiais), sem as legendas.
                    refreshFlatList()
                    // Frente R14A — materiais da pasta ao lado: corre
                    // em 2º plano (nunca atrasa a tela); quando chega,
                    // só a secção Materiais ganha os ficheiros novos
                    // (a TV nem corre isto — está no ramo do telemóvel).
                    loadExtraMaterials(files)
                }
            }
        }
    }

    /**
     * v2.7.6 — Descrição da aula (aba Resumo, Elton 00:21).
     *
     * Cadeia de fallback (ordem exata):
     *   (a) descrição gerada guardada (cache local → servidor) → mostra ela;
     *   (b) senão, nome real de aula (NOME DO ARQUIVO do vídeo; sem
     *       ele, NOME DA PASTA quando a pasta tem só uma aula — R14B)
     *       → provisória até a Meggy gerar a de verdade;
     *   (c) senão, nome genérico (ex. "001 - aula.mp3", "Aula 01") → em
     *       branco até a Meggy processar os materiais.
     * Ao abrir uma PASTA DE AULA, o app dispara a geração
     * automaticamente (LessonDescription.ensureDescription) e espera
     * até 3 min (poll de 30 s) — a aba mostra o estado em resumoState.
     * Pasta de CURSO (só subpastas) NÃO dispara ao abrir: o batalhão
     * do curso inteiro é pesado demais para um open (a web dispara ao
     * ADICIONAR o curso); as aulas são geradas uma a uma (aqui + na
     * pré-geração do player). Sem material legível (PDF escaneado sem
     * texto e sem MD), a descrição fica EM BRANCO COM O MOTIVO — a
     * provisória só vale enquanto gerar ainda é possível.
     *
     * DEPENDÊNCIA: a geração/leitura no servidor exige as rotas de IA
     * (worker v2.15.4 — staging-c/meuc). A produção (BASE_URL) não as
     * tem: nesse caso o AiService marca backendUnavailable e a aba
     * fica no fallback (provisória/branco), sem loop de retentativas.
     * Ver REDESIGN_NOTES.md ("Descrição da aula").
     */
    private var descriptionJob: Job? = null

    private fun loadLessonDescription(files: List<FileItem>) {
        descriptionJob?.cancel()
        val sm = SessionManager.get(this)
        // (a) Cache local — instantâneo ("abre na hora da próxima vez").
        val cached = sm.getLessonDescription(currentPath)
        if (!cached.isNullOrBlank()) {
            showDescription(cached, getString(R.string.summary_state_generated), generated = true)
            // Frente K — o resumo ja estava no cache local, mas as
            // pilulas/questoes podem nunca ter ido para a pasta de
            // materiais (o cache local so guarda o resumo). Em 2o
            // plano, sem tocar na UI: le o pacote gerado no servidor
            // e grava o que faltar (best-effort, idempotente).
            lifecycleScope.launch {
                runCatching {
                    val materialNames = files.filter { it.isPdf || it.isMarkdown }.map { it.name }
                    val bundle = LessonDescription.fetchGenerated(
                        this@DetailActivity, currentPath, materialNames,
                        LessonDescription.lessonFilePath(currentPath, files)
                    )
                    val filePath = LessonDescription.lessonFilePath(currentPath, files)
                    if (bundle != null && filePath != null) {
                        MaterialSaver.saveGenerated(
                            this@DetailActivity, filePath, folderName,
                            bundle.summary, bundle.mindmap, bundle.questionsJson
                        )
                    }
                }
            }
            return
        }
        // (b)/(c) provisória imediata (ou branco) enquanto resolve.
        // R14B: o nome da pasta só vale quando a pasta tem uma só
        // aula (um vídeo/áudio na pasta); com várias aulas, o nome
        // da pasta é o do curso e não descreve nenhuma delas.
        val firstVideo = files.firstOrNull { it.isVideo || it.isAudio }?.name
        val singleLesson = files.count { it.isVideo || it.isAudio } == 1
        val provisional = LessonDescription.provisionalDescription(folderName, firstVideo, singleLesson)
        if (provisional != null) {
            showDescription(provisional, getString(R.string.summary_state_provisional))
        } else {
            showDescription(getString(R.string.no_summary), getString(R.string.summary_state_none))
        }
        // Pasta de curso não dispara geração ao abrir (ver doc acima).
        if (!LessonDescription.isLessonFolder(files)) return
        descriptionJob = lifecycleScope.launch {
            when (val outcome = LessonDescription.ensureDescription(
                this@DetailActivity, currentPath, folderName, files
            )) {
                is LessonDescription.Outcome.Ready -> {
                    sm.saveLessonDescription(currentPath, outcome.text)
                    // Frente K — grava resumo + pilulas + questoes na
                    // pasta de materiais (UM caminho: MaterialSaver).
                    val filePath = LessonDescription.lessonFilePath(currentPath, files)
                    if (filePath != null) {
                        MaterialSaver.saveGenerated(
                            this@DetailActivity, filePath, folderName,
                            outcome.bundle.summary, outcome.bundle.mindmap,
                            outcome.bundle.questionsJson
                        )
                    }
                    showDescription(outcome.text, getString(R.string.summary_state_generated), generated = true)
                }
                is LessonDescription.Outcome.Generating -> {
                    // Ainda gerando após 3 min: mantém o texto e avisa.
                    showDescriptionState(getString(R.string.summary_state_generating))
                }
                is LessonDescription.Outcome.NoMaterial -> {
                    // Sem material legível: branco COM o motivo (00:21 §4).
                    val reason = when (outcome.reason) {
                        LessonDescription.NoMaterialReason.SCANNED_PDF ->
                            getString(R.string.summary_state_scanned)
                        LessonDescription.NoMaterialReason.NO_FILES ->
                            getString(R.string.summary_state_no_files)
                        LessonDescription.NoMaterialReason.NO_TEXT ->
                            getString(R.string.summary_state_no_text)
                    }
                    showDescription("", reason)
                }
                is LessonDescription.Outcome.Unavailable -> {
                    // Backend sem IA: mantém a provisória (ou o branco).
                    showDescriptionState(getString(R.string.summary_state_none))
                }
                is LessonDescription.Outcome.Failed -> {
                    // Falha transitória: mantém o que estava; a próxima
                    // abertura tenta de novo. Nada a mudar.
                }
            }
        }
    }

    /**
     * Ronda 9 Frente A — o texto do resumo GERADO é Markdown e é
     * exibido FORMATADO (MarkdownRenderer, mesma config do
     * MdReaderActivity); o gancho sorteado (LessonDescription.
     * withHook) deixa de ser colado — o resumo guardado (cache
     * local / servidor) É o conteúdo. A provisória (nome da
     * aula) e os estados (gerando / sem material) continuam
     * texto simples.
     */
    private fun showDescription(text: String, state: String, generated: Boolean = false) {
        if (generated) MarkdownRenderer.renderMarkdown(binding.resumoText, text)
        else MarkdownRenderer.renderPlain(binding.resumoText, text)
        showDescriptionState(state)
    }

    private fun showDescriptionState(state: String) {
        binding.resumoState.text = state
        binding.resumoState.visibility = if (state.isBlank()) View.GONE else View.VISIBLE
    }

    /**
     * v2.7.11 camada (3) — hero do detalhe: (1) não há cover_url
     * aqui (o detalhe não recebe o destaque do admin); (2) thumb
     * do 1º vídeo; (3) imagem da biblioteca por nome da pasta/
     * curso; (4) capa gerada do drive. Nunca monograma. Lê
     * [allFiles] (já carregado por [loadFolder]) — por isso o
     * listener onReady pode chamá-lo de novo quando o manifesto
     * chega depois da tela pronta.
     */
    private fun refreshHeroCover() {
        val firstThumb = allFiles.firstOrNull { (it.isVideo || it.isAudio) && !it.thumbnailLink.isNullOrBlank() }
            ?.thumbnailLink
        val coverRes = ThumbArt.coverResForPath(currentPath)
        // Ronda 10 Frente C — drive do admin: (0) sub-capa do admin;
        // sem ela, a sub-capa GENÉRICA = imagem 'geral' do manifesto
        // (AdminDriveUi.generalCoverUrl — resolve NÃO-estrito sem
        // nomes; null sem manifesto). Sem sub-capa nem 'geral', cai
        // na hierarquia actual (thumb/biblioteca/gerada) — nunca fica
        // sem capa. O listener onReady volta a chamar isto quando o
        // manifesto chega.
        adminDrive?.let { admin ->
            val subCover = admin.subCoverUrl?.takeIf { it.isNotBlank() }
                ?: AdminDriveUi.generalCoverUrl(this)
            if (subCover != null) {
                binding.heroImage.visibility = View.VISIBLE
                binding.heroMonogram.visibility = View.GONE
                binding.heroImage.load(subCover) {
                    error(coverRes)
                    listener(onError = { _, _ ->
                        binding.heroImage.setImageResource(coverRes)
                    })
                }
                return
            }
        }
        val remote = LibraryCovers.remoteCoverStrict(firstThumb, folderName, currentPath)
        binding.heroImage.visibility = View.VISIBLE
        binding.heroMonogram.visibility = View.GONE
        if (remote != null) {
            binding.heroImage.load(remote) {
                error(coverRes)
                listener(onError = { _, _ ->
                    binding.heroImage.setImageResource(coverRes)
                })
            }
        } else {
            binding.heroImage.setImageResource(coverRes)
        }
    }

    private fun updateHeroProgress() {
        val sm = SessionManager.get(this)
        val recents = sm.getRecents().filter { it.folderPath.startsWith(currentPath) }
        val best = recents.maxByOrNull { sm.getResumeProgress(it.folderPath, it.videoName) }
        if (best != null) {
            val progress = sm.getResumeProgress(best.folderPath, best.videoName)
            val pos = sm.getResume(best.folderPath, best.videoName)
            val dur = sm.getResumeDuration(best.folderPath, best.videoName)
            if (progress > 0) {
                binding.heroProgress.visibility = View.VISIBLE
                binding.heroTime.visibility = View.VISIBLE
                binding.heroProgress.progress = progress
                binding.heroTime.text = "${Format.mmss(pos)} / ${Format.mmss(dur)}"
                binding.ctaContinue.text = getString(R.string.cta_continue)
                binding.detailFooter.text = Format.watchedFooter(progress, pos)
                return
            }
        }
        binding.heroProgress.visibility = View.GONE
        binding.heroTime.visibility = View.GONE
        binding.ctaContinue.text = getString(R.string.cta_watch)
        binding.detailFooter.text = ""
    }

    /**
     * Ronda 15 Frente B (B3) — chip "X% concluído" sobre os vídeos da
     * SUBÁRVORE, não sobre os filhos directos.
     *
     * Modo plano (pasta sem subpastas): os vídeos são os filhos
     * directos e o listFolder já os trouxe — dados completos, o %
     * calcula-se logo.
     *
     * Modo interfolder (pasta de curso): os filhos directos são
     * pastas; o % conta os vídeos dos grupos (filhos prefetched).
     * Enquanto houver um grupo sem filhos carregados, o denominador
     * está incompleto e o chip mostra "a calcular…" — NUNCA
     * "0% concluído" com dados incompletos. O refreshLessonList()
     * volta a chamar isto quando o prefetch (ou um expandir) entrega
     * filhos. Cursos com >20 grupos ficam em "a calcular…" (o
     * prefetch pára nos 20): os cartões mostram o progresso real na
     * mesma, via recents (B4).
     */
    private fun updateProgressChip(files: List<FileItem>) {
        val sm = SessionManager.get(this)
        if (files.none { it.isFolder }) {
            val videos = files.filter { it.isVideo || it.isAudio }
            val watched = videos.count { sm.isWatched(currentPath, it.name) }
            val pct = if (videos.isNotEmpty()) watched * 100 / videos.size else 0
            binding.chipProgress.text = "$pct% concluído"
            return
        }
        if (lessonGroups.isEmpty() || lessonGroups.any { it.children == null }) {
            binding.chipProgress.text = "a calcular…"
            return
        }
        var total = 0
        var watched = 0
        for (group in lessonGroups) {
            for (v in group.children.orEmpty()) {
                if (v.isVideo || v.isAudio) {
                    total++
                    if (sm.isWatched(group.folderPath, v.name)) watched++
                }
            }
        }
        val pct = if (total > 0) watched * 100 / total else 0
        binding.chipProgress.text = "$pct% concluído"
    }

    // ──────────── Ronda 9 Frente B — Questões/Flashcards da aula ────────────
    //
    // DIAGNÓSTICO (prints 2026-11-15 19:27, com.meggy.app): as abas
    // existiam mas eram MORTAS — os painéis só tinham o TextView
    // estático de vazio (no_questions/no_flashcards) e NENHUM código
    // as carregava: selectTab() só muda a visibilidade. O resumo da
    // MESMA aula aparece (gerado), por isso os itens existem no
    // servidor — o app é que nunca os lia aqui.
    //
    // FONTES (tudo o que já existe — NENHUM endpoint inventado):
    //   1. pacote ISA do batalhão — LessonDescription.fetchGenerated()
    //      (GET /api/ai/summaries?key=<courseKey>/<material>, as
    //      MESMAS chaves do resumo): questionsJson + mindmap viajam
    //      no MESMO bundle do resumo (o batalhão gera os 3 por PDF,
    //      na mesma run — worker: battalionGenSummary/Pills/Questions);
    //      fetchQuestionsBundle() lê o pacote DIRETO quando ele tem
    //      questões/pílulas mas NÃO tem resumo (o fetchGenerated só
    //      devolve pacotes COM resumo);
    //   2. pasta de materiais da aula — AiService.loadFromFolder(...,
    //      "questoes") e (..., "flashcard") (discovery: o ficheiro
    //      mais recente de .gdi-questoess/ e .gdi-flashcards/; o
    //      MaterialSaver grava-os com os mesmos tipos);
    //   3. flashcards sem ficheiro próprio: derivados DAS QUESTÕES
    //      desta aula (frente = enunciado, verso = resposta +
    //      explicação + base legal) — a MESMA transformação que o
    //      batalhão faz no servidor (worker: battalionGenQuestions
    //      grava os cards f/b); nunca de outra aula/curso.
    // ÂMBITO: a aula (currentPath) — os itens são gerados POR
    // MATERIAL (PDF/MD) da aula, nunca por curso; pasta de curso
    // (só subpastas) não carrega nada e fica no vazio honesto
    // ("para esta aula"). Sem itens no servidor → vazio honesto.
    // Formatos aceites (todos os que o servidor produz): array JSON
    // nu; objeto {questions:[...]} (banco da web por disciplina);
    // texto corrido (1 questão de texto); pílulas em Markdown
    // (bullets); cards {f,b}/{front,back}.
    //
    // RENDER: listas programáticas dentro dos painéis existentes
    // (precedente da frente R4 no player — sem XML novo, sem
    // RecyclerView novo: os adapters existentes são de FileItem/
    // aulas, não de perguntas). Questão: tocar revela a resposta;
    // tocar numa opção avalia-a (verde = certa, vermelho = errada)
    // e revela a resposta. Flashcard: tocar vira o card. Cards
    // focáveis (D-pad na TV) com anel rosa quando focados.

    /** Uma questão gerada (formato do batalhão, worker.js). */
    private data class DetailQuestion(
        val statement: String,
        val options: List<String>,
        val correctIndex: Int,
        val answer: String?,
        val explanation: String?,
        val legalText: String?
    )

    /** Um flashcard (frente/verso). */
    private data class DetailFlashcard(val front: String, val back: String)

    /**
     * Carrega as questões e os flashcards DA AULA, uma vez por
     * abertura, em 2º plano (nunca atrasa a tela). Ordem das fontes:
     * pacote ISA (mesmas chaves do resumo) → pacote ISA direto
     * (questões sem resumo) → pasta de materiais (discovery).
     * Best-effort: falha de rede vira vazio honesto — nunca crash,
     * nunca bounce para o login com a tela aberta.
     */
    private fun loadQuestionsFlashcards(files: List<FileItem>) {
        qfJob?.cancel()
        qfLoaded = false
        // Pasta de curso (só subpastas) não é uma aula: nada a
        // carregar — os textos de vazio (âmbito "esta aula") ficam.
        if (!LessonDescription.isLessonFolder(files)) return
        binding.questoesText.text = getString(R.string.qf_loading)
        binding.flashcardsText.text = getString(R.string.qf_loading)
        qfJob = lifecycleScope.launch {
            val questions: List<DetailQuestion>
            val flashcards: List<DetailFlashcard>
            try {
                val materialNames = files.filter { it.isPdf || it.isMarkdown }.map { it.name }
                val lessonFile = LessonDescription.lessonFilePath(currentPath, files)
                val bundle = LessonDescription.fetchGenerated(
                    this@DetailActivity, currentPath, materialNames, lessonFile
                )
                var questionsText = bundle?.questionsJson
                var pillsText = bundle?.mindmap
                if (questionsText.isNullOrBlank() && pillsText.isNullOrBlank()) {
                    val direct = fetchQuestionsBundle(materialNames)
                    if (direct != null) {
                        questionsText = direct.questionsJson
                        pillsText = direct.mindmap
                    }
                }
                if (questionsText.isNullOrBlank()) {
                    questionsText = lessonFile?.let {
                        AiService.loadFromFolder(this@DetailActivity, it, "questoes")
                    }
                }
                if (pillsText.isNullOrBlank()) {
                    pillsText = lessonFile?.let {
                        AiService.loadFromFolder(this@DetailActivity, it, "flashcard")
                    }
                }
                questions = parseDetailQuestions(questionsText)
                val cards = parseDetailFlashcards(pillsText)
                flashcards = if (cards.isNotEmpty()) cards
                    else deriveFlashcardsFromQuestions(questions)
            } catch (_: Exception) {
                if (!isFinishing && !isDestroyed) {
                    renderQuestionsFlashcards(emptyList(), emptyList())
                }
                return@launch
            }
            if (isFinishing || isDestroyed) return@launch
            renderQuestionsFlashcards(questions, flashcards)
        }
    }

    /**
     * Lê o pacote ISA aceitando-o quando tem questões OU pílulas,
     * mesmo sem resumo (o fetchGenerated só devolve pacotes COM
     * resumo — uma run em que só as questões saíram ficaria
     * invisível aqui). Mesmas chaves do fetchGenerated: pasta atual
     * e pasta pai × nomes dos PDFs/MDs da aula.
     */
    private suspend fun fetchQuestionsBundle(
        materialNames: List<String>
    ): AiService.GeneratedBundle? {
        val courseKeys = listOf(currentPath, LessonDescription.parentPath(currentPath)).distinct()
        for (courseKey in courseKeys) {
            for (name in materialNames) {
                val bundle = AiService.getGeneratedBundle(this, "$courseKey/$name")
                if (!bundle?.questionsJson.isNullOrBlank() ||
                    !bundle?.mindmap.isNullOrBlank()
                ) {
                    return bundle
                }
            }
        }
        return null
    }

    /**
     * Questões: array JSON do batalhão ({type, statement, options[],
     * correct, correctText, explanation, legalText, ...}); ou objeto
     * {questions:[...]} (banco da web); ou texto corrido (1 questão
     * de texto, sem resposta — nunca se deita fora conteúdo). Máx.
     * 10, como o player.
     */
    private fun parseDetailQuestions(text: String?): List<DetailQuestion> {
        if (text.isNullOrBlank()) return emptyList()
        val trimmed = text.trim()
        return try {
            val arr = when {
                trimmed.startsWith("[") -> JSONArray(trimmed)
                trimmed.startsWith("{") ->
                    JSONObject(trimmed).optJSONArray("questions") ?: return emptyList()
                else -> return listOf(
                    DetailQuestion(trimmed, emptyList(), -1, null, null, null)
                )
            }
            val out = ArrayList<DetailQuestion>()
            for (i in 0 until minOf(arr.length(), 10)) {
                val o = arr.optJSONObject(i) ?: continue
                val statement = o.optString("statement").takeIf { it.isNotBlank() }
                    ?: o.optString("question").takeIf { it.isNotBlank() }
                    ?: o.optString("q").takeIf { it.isNotBlank() }
                    ?: continue
                val options = ArrayList<String>()
                val opts = o.optJSONArray("options")
                if (opts != null) {
                    for (j in 0 until opts.length()) {
                        opts.optString(j).takeIf { it.isNotBlank() }?.let { options.add(it) }
                    }
                }
                val correctIndex = o.optInt("correct", -1)
                    .let { if (it in options.indices) it else -1 }
                val answer = o.optString("correctText").takeIf { it.isNotBlank() }
                    ?: o.optString("answer").takeIf { it.isNotBlank() }
                    ?: if (correctIndex >= 0) options[correctIndex] else null
                val explanation = o.optString("explanation").takeIf { it.isNotBlank() }
                    ?: o.optString("fundamentacao").takeIf { it.isNotBlank() }
                val legalText = o.optString("legalText").takeIf { it.isNotBlank() }
                    ?: o.optString("legal_text").takeIf { it.isNotBlank() }
                out.add(
                    DetailQuestion(statement, options, correctIndex, answer, explanation, legalText)
                )
            }
            out
        } catch (_: Exception) {
            listOf(DetailQuestion(trimmed, emptyList(), -1, null, null, null))
        }
    }

    /**
     * Flashcards: cards {f,b}/{front,back} (JSON, nu ou em objeto
     * {flashcards:[...]}/{cards:[...]}); ou pílulas em Markdown
     * (bullets — o formato que o MaterialSaver grava como
     * 'flashcard'): cada pílula vira um card (frente = "Pílula N",
     * verso = o facto). Máx. 20.
     */
    private fun parseDetailFlashcards(text: String?): List<DetailFlashcard> {
        if (text.isNullOrBlank()) return emptyList()
        val trimmed = text.trim()
        if (trimmed.startsWith("[")) {
            return try {
                parseDetailFlashcardArray(JSONArray(trimmed))
            } catch (_: Exception) {
                emptyList()
            }
        }
        if (trimmed.startsWith("{")) {
            return try {
                val obj = JSONObject(trimmed)
                val arr = obj.optJSONArray("flashcards")
                    ?: obj.optJSONArray("cards")
                    ?: return emptyList()
                parseDetailFlashcardArray(arr)
            } catch (_: Exception) {
                emptyList()
            }
        }
        return parseDetailPills(trimmed).mapIndexed { idx, pill ->
            DetailFlashcard("💡 Pílula ${idx + 1}", pill)
        }
    }

    /** Cards {f,b}/{front,back} de um array JSON (máx. 20). */
    private fun parseDetailFlashcardArray(arr: JSONArray): List<DetailFlashcard> {
        val out = ArrayList<DetailFlashcard>()
        for (i in 0 until minOf(arr.length(), 20)) {
            val o = arr.optJSONObject(i) ?: continue
            val front = o.optString("f").takeIf { it.isNotBlank() }
                ?: o.optString("front").takeIf { it.isNotBlank() } ?: continue
            val back = o.optString("b").takeIf { it.isNotBlank() }
                ?: o.optString("back").takeIf { it.isNotBlank() } ?: continue
            out.add(DetailFlashcard(front, back))
        }
        return out
    }

    /** Pílulas: o mindmap é Markdown em bullets ("- ...") — igual ao player. */
    private fun parseDetailPills(text: String?): List<String> {
        if (text.isNullOrBlank()) return emptyList()
        return text.lines()
            .map { it.trim() }
            .filter { it.isNotEmpty() && !it.startsWith("#") }
            .map { it.removePrefix("- ").removePrefix("* ").removePrefix("• ").trim() }
            .map { it.replace(Regex("^\\d+[.)]\\s+"), "").trim() }
            .filter { it.isNotEmpty() }
            .take(20)
    }

    /**
     * Flashcards derivados DAS QUESTÕES desta aula (só quando não há
     * ficheiro de flashcards nem pílulas): a mesma transformação que
     * o batalhão faz no servidor (frente = enunciado, verso =
     * resposta + explicação + base legal). Nada inventado: o verso
     * usa só campos da própria questão.
     */
    private fun deriveFlashcardsFromQuestions(
        questions: List<DetailQuestion>
    ): List<DetailFlashcard> {
        return questions.mapNotNull { q ->
            val back = buildString {
                if (!q.answer.isNullOrBlank()) append(q.answer)
                if (!q.explanation.isNullOrBlank()) {
                    if (isNotEmpty()) append("\n\n💡 ")
                    append(q.explanation)
                }
                if (!q.legalText.isNullOrBlank()) {
                    if (isNotEmpty()) append("\n\n⚖️ ")
                    append(q.legalText)
                }
            }.takeIf { it.isNotBlank() } ?: return@mapNotNull null
            DetailFlashcard(q.statement, back)
        }
    }

    private fun renderQuestionsFlashcards(
        questions: List<DetailQuestion>,
        flashcards: List<DetailFlashcard>
    ) {
        qfLoaded = true
        qfQuestions = questions
        qfFlashcards = flashcards
        renderQuestionsList()
        renderFlashcardsList()
    }

    private fun renderQuestionsList() {
        val list = qfQuestionsList ?: LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            binding.panelQuestoes.addView(this)
            qfQuestionsList = this
        }
        list.removeAllViews()
        if (!qfLoaded) return
        if (qfQuestions.isEmpty()) {
            binding.questoesText.text = getString(R.string.no_questions)
            return
        }
        binding.questoesText.text = getString(R.string.qf_questions_hint)
        for ((idx, q) in qfQuestions.withIndex()) {
            list.addView(buildQuestionCard(q, idx))
        }
    }

    private fun renderFlashcardsList() {
        val list = qfFlashcardsList ?: LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            binding.panelFlashcards.addView(this)
            qfFlashcardsList = this
        }
        list.removeAllViews()
        if (!qfLoaded) return
        if (qfFlashcards.isEmpty()) {
            binding.flashcardsText.text = getString(R.string.no_flashcards)
            return
        }
        binding.flashcardsText.text = getString(R.string.qf_flashcards_hint)
        for (c in qfFlashcards) {
            list.addView(buildFlashcardCard(c))
        }
    }

    /** Fundo do card: superfície do tema, cantos 16dp, anel rosa quando focado (D-pad). */
    private fun qfCardBackground(focused: Boolean): android.graphics.drawable.GradientDrawable {
        return android.graphics.drawable.GradientDrawable().apply {
            shape = android.graphics.drawable.GradientDrawable.RECTANGLE
            cornerRadius = 16f * resources.displayMetrics.density
            setColor(ContextCompat.getColor(this@DetailActivity, R.color.md_surface_container))
            if (focused) {
                setStroke(
                    (2 * resources.displayMetrics.density).toInt(),
                    ContextCompat.getColor(this@DetailActivity, R.color.md_primary)
                )
            }
        }
    }

    /** Um card de questão: enunciado + opções + resposta oculta (tocar revela). */
    private fun buildQuestionCard(q: DetailQuestion, index: Int): LinearLayout {
        val density = resources.displayMetrics.density
        val pad = (16 * density).toInt()
        val gap = (12 * density).toInt()
        val pink = ContextCompat.getColor(this, R.color.md_primary)
        val onSurface = ContextCompat.getColor(this, R.color.md_on_surface)
        val muted = ContextCompat.getColor(this, R.color.md_on_surface_variant)
        val green = android.graphics.Color.parseColor("#81C784")
        val red = android.graphics.Color.parseColor("#E57373")
        val hasAnswer = !q.answer.isNullOrBlank()
        var answerShown = false
        var picked = -1

        lateinit var answerView: TextView
        lateinit var toggleView: TextView

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
            background = qfCardBackground(false)
            isClickable = hasAnswer
            isFocusable = hasAnswer
            onFocusChangeListener = View.OnFocusChangeListener { v, hasFocus ->
                v.background = qfCardBackground(hasFocus)
            }
        }
        card.layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { bottomMargin = gap }

        val statementView = TextView(this).apply {
            text = "${index + 1}. ${q.statement}"
            textSize = 15f
            setTypeface(null, android.graphics.Typeface.BOLD)
            setTextColor(onSurface)
        }

        val optionViews = ArrayList<TextView>()
        val letters = listOf("A", "B", "C", "D", "E", "F")
        for ((oi, opt) in q.options.withIndex()) {
            val optView = TextView(this).apply {
                text = "${letters.getOrElse(oi) { "•" }}) $opt"
                textSize = 14f
                setTextColor(onSurface)
                setPadding(0, (6 * density).toInt(), 0, (6 * density).toInt())
            }
            if (q.correctIndex >= 0) {
                optView.isClickable = true
                optView.isFocusable = true
                optView.setOnClickListener {
                    picked = oi
                    for ((oj, ov) in optionViews.withIndex()) {
                        ov.setTextColor(
                            when {
                                oj == q.correctIndex -> green
                                oj == picked -> red
                                else -> onSurface
                            }
                        )
                    }
                    if (!answerShown) {
                        answerShown = true
                        answerView.visibility = View.VISIBLE
                        toggleView.text = getString(R.string.qf_hide_answer)
                    }
                }
            }
            optionViews.add(optView)
        }

        if (hasAnswer) {
            answerView = TextView(this).apply {
                text = buildString {
                    append(getString(R.string.materials_answer, q.answer!!))
                    if (!q.explanation.isNullOrBlank()) append("\n\n💡 ${q.explanation}")
                    if (!q.legalText.isNullOrBlank()) append("\n\n⚖️ ${q.legalText}")
                }
                textSize = 14f
                setTextColor(pink)
                setPadding(0, (8 * density).toInt(), 0, 0)
                visibility = View.GONE
            }
            toggleView = TextView(this).apply {
                text = getString(R.string.qf_show_answer)
                textSize = 13f
                setTextColor(muted)
                setPadding(0, (8 * density).toInt(), 0, 0)
            }
            card.setOnClickListener {
                answerShown = !answerShown
                answerView.visibility = if (answerShown) View.VISIBLE else View.GONE
                toggleView.text = getString(
                    if (answerShown) R.string.qf_hide_answer else R.string.qf_show_answer
                )
            }
        }

        card.addView(statementView)
        for (ov in optionViews) card.addView(ov)
        if (hasAnswer) {
            card.addView(answerView)
            card.addView(toggleView)
        }
        return card
    }

    /** Um flashcard: tocar vira o card (frente ↔ verso). */
    private fun buildFlashcardCard(c: DetailFlashcard): LinearLayout {
        val density = resources.displayMetrics.density
        val pad = (16 * density).toInt()
        val gap = (12 * density).toInt()
        val onSurface = ContextCompat.getColor(this, R.color.md_on_surface)
        val muted = ContextCompat.getColor(this, R.color.md_on_surface_variant)
        var showingBack = false

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
            background = qfCardBackground(false)
            isClickable = true
            isFocusable = true
            minimumHeight = (120 * density).toInt()
            onFocusChangeListener = View.OnFocusChangeListener { v, hasFocus ->
                v.background = qfCardBackground(hasFocus)
            }
        }
        card.layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { bottomMargin = gap }

        val bodyView = TextView(this).apply {
            text = c.front
            textSize = 16f
            setTypeface(null, android.graphics.Typeface.BOLD)
            setTextColor(onSurface)
        }
        val hintView = TextView(this).apply {
            text = getString(R.string.qf_card_reveal)
            textSize = 13f
            setTextColor(muted)
            setPadding(0, (8 * density).toInt(), 0, 0)
        }
        card.setOnClickListener {
            showingBack = !showingBack
            bodyView.text = if (showingBack) c.back else c.front
            bodyView.setTypeface(
                null,
                if (showingBack) android.graphics.Typeface.NORMAL
                else android.graphics.Typeface.BOLD
            )
            hintView.text = getString(
                if (showingBack) R.string.qf_card_back else R.string.qf_card_reveal
            )
        }
        card.addView(bodyView)
        card.addView(hintView)
        return card
    }

    /** Monta os grupos de aulas (subpastas) + "Arquivos avulsos". */
    private fun buildLessonGroups(files: List<FileItem>) {
        val folders = files.filter { it.isFolder }
        val loose = files.filter { !it.isFolder }
        val groups = folders.map { folder ->
            // Ronda 13 Frente C — modo por ID: o grupo navega pelo
            // ID da pasta (POST /api/drive/by-id), nao pelo nome
            // (nao ha caminho "/N:/..." p/ concatenar — ver Ronda 12:
            // concatenar o nome ao caminho do grupo duplicava-o).
            val path = if (ApiService.isByIdPath(currentPath)) ApiService.byIdPath(folder.id)
                else if (currentPath.endsWith("/")) "$currentPath${folder.name}/" else "$currentPath/${folder.name}/"
            LessonGroup(folder = folder, folderPath = path)
        }.toMutableList()
        if (loose.isNotEmpty()) {
            val looseFolder = FileItem(
                name = "Arquivos avulsos", mimeType = "application/vnd.google-apps.folder",
                id = "__loose__", driveId = null, link = null, size = 0L, modifiedTime = null
            )
            groups.add(LessonGroup(folder = looseFolder, folderPath = currentPath, children = loose, expanded = false))
        }
        lessonGroups = groups
        if (isWide()) {
            val adapter = LessonGridAdapter(
                onPlayLesson = { group -> playLessonGroup(group) },
                onOpenLesson = { group -> openLessonGroup(group) }
            )
            lessonGridAdapter = adapter
            binding.recycler.layoutManager = GridLayoutManager(this, 2)
            binding.recycler.addItemDecoration(GridGutterDecoration(12))
            binding.recycler.adapter = adapter
            adapter.submit(lessonGroups)
            prefetchLessonChildren()
        } else {
            val adapter = LessonListAdapter(
                onPlayVideo = { file, folderPath -> openFileInFolder(file, folderPath) },
                onOpenPdf = { file, folderPath -> openPdf(file, folderPath) },
                onOpenMd = { file, folderPath -> openMd(file, folderPath) },
                onOpenFolder = { file, folderPath -> openFolderInLesson(file, folderPath) },
                onToggleExpand = { group, _ -> toggleLessonGroup(group) }
            )
            lessonListAdapter = adapter
            binding.recycler.layoutManager = LinearLayoutManager(this)
            binding.recycler.adapter = adapter
            adapter.submit(lessonGroups)
            prefetchLessonChildren()
        }
    }

    /** Pré-carrega os filhos das aulas (máx. 20, em paralelo) para os
     *  selos/progresso — sem isso, cada aula mostraria "0/5" até abrir. */
    private fun prefetchLessonChildren() {
        lifecycleScope.launch {
            val toLoad = lessonGroups.filter { it.children == null }.take(20)
            val results = withContext(Dispatchers.IO) {
                toLoad.map { group ->
                    group to (api.listFolder(group.folderPath) ?: emptyList())
                }
            }
            var changed = false
            results.forEach { (group, children) ->
                group.children = children
                group.pdfFolderCount = children.count { it.isFolder }
                changed = true
            }
            if (changed) refreshLessonList()
        }
    }

    private fun refreshLessonList() {
        val query = binding.lessonSearch.text?.toString().orEmpty()
        val filtered = if (query.isBlank()) lessonGroups
            else lessonGroups.filter { it.folder.name.contains(query, ignoreCase = true) }
        lessonListAdapter?.submit(filtered)
        lessonGridAdapter?.submit(filtered)
        // Ronda 15 Frente B (B3): o prefetch (ou um expandir) entregou
        // filhos — o chip do hero pode sair de "a calcular…".
        updateProgressChip(allFiles)
    }

    // Frente R4B — chips Todos / Vídeos / Materiais (lista plana,
    // celular). Os ids só existem no layout do celular: na TV (e no
    // layout-television) o findViewById devolve null e a função sai
    // sem fazer nada. Os ids NUNCA são lidos pelo binding: o binding
    // gerado exige-os em todas as variantes do layout e a TV não os
    // tem (mesma decisão da frente R4, §4). O toque muda o filtro e
    // re-aplica a lista; sem filtro ativo, "Todos" é o padrão.
    private fun setupFlatFilterChips() {
        val all = findViewById<TextView>(R.id.chipFilterAll) ?: return
        val videos = findViewById<TextView>(R.id.chipFilterVideos) ?: return
        val materials = findViewById<TextView>(R.id.chipFilterMaterials) ?: return
        all.setOnClickListener { setFlatFilter(FlatFilter.ALL) }
        videos.setOnClickListener { setFlatFilter(FlatFilter.VIDEOS) }
        materials.setOnClickListener { setFlatFilter(FlatFilter.MATERIALS) }
        updateFlatChipStyles()
    }

    private fun setFlatFilter(filter: FlatFilter) {
        if (flatFilter == filter) return
        flatFilter = filter
        updateFlatChipStyles()
        refreshFlatList()
    }

    private fun updateFlatChipStyles() {
        val pink = ContextCompat.getColor(this, R.color.md_primary)
        val onPink = ContextCompat.getColor(this, R.color.md_on_primary)
        val muted = ContextCompat.getColor(this, R.color.md_on_surface_variant)
        fun paint(chipId: Int, active: Boolean) {
            val chip = findViewById<TextView>(chipId) ?: return
            chip.background = ContextCompat.getDrawable(
                this,
                if (active) R.drawable.chip_filter_selected else R.drawable.chip_outline
            )
            chip.setTextColor(if (active) onPink else muted)
        }
        paint(R.id.chipFilterAll, flatFilter == FlatFilter.ALL)
        paint(R.id.chipFilterVideos, flatFilter == FlatFilter.VIDEOS)
        paint(R.id.chipFilterMaterials, flatFilter == FlatFilter.MATERIALS)
    }

    // Frente R4B — (re)monta a lista plana em secções a partir de
    // [allFiles], com a busca e o filtro dos chips aplicados:
    //   Vídeos — só .mp4, por ordem, com progresso como hoje;
    //   Materiais — PDFs, .md, áudios e outros ficheiros da pasta.
    // Legendas .srt/.vtt (FileItem.isSubtitle) NUNCA entram na lista:
    // continuam a carregar no player — o SubtitleFetcher lê o
    // listFolder completo (PlayerActivity.ensureSubtitles), não a
    // lista do adapter. Pastas não existem aqui (modo plano =
    // folderCount == 0), mas são excluídas na mesma, por defesa.
    private fun refreshFlatList() {
        val adapter = flatAdapter ?: return
        val query = binding.lessonSearch.text?.toString().orEmpty()
        val base = if (query.isBlank()) allFiles
            else allFiles.filter { it.name.contains(query, ignoreCase = true) }
        val videos = base.filter { it.name.endsWith(".mp4", true) }
        // Frente R14A — aos materiais da pasta somam-se os da pasta
        // ao lado (extraMaterials); o vídeo nunca entra aqui e as
        // legendas continuam de fora. A pasta ganha ao nome repetido.
        val materials = (base.filter { f ->
            !f.isFolder && !f.isSubtitle && !f.name.endsWith(".mp4", true)
        } + extraMaterials.filter { f ->
            query.isBlank() || f.name.contains(query, ignoreCase = true)
        }).distinctBy { it.name.lowercase() }
        adapter.submitSections(videos, materials, flatFilter)
        findViewById<View>(R.id.filterChipsRow)?.visibility = View.VISIBLE
        updateFlatChipStyles()
        val visible = when (flatFilter) {
            FlatFilter.ALL -> videos.size + materials.size
            FlatFilter.VIDEOS -> videos.size
            FlatFilter.MATERIALS -> materials.size
        }
        if (visible == 0) {
            binding.emptyState.text = getString(R.string.flat_empty_filter)
            binding.emptyState.visibility = View.VISIBLE
        } else {
            binding.emptyState.text = getString(R.string.browse_empty)
            binding.emptyState.visibility = View.GONE
        }
    }

    // Frente R14A — busca os materiais da pasta ao lado (ver
    // MaterialDiscovery) e funde-os na secção Materiais da lista
    // plana. Só corre no telemóvel (o ramo plano do telemóvel é quem
    // chama); a TV usa a grade e nunca chama isto. Best-effort:
    // falha de rede deixa a lista como estava — nunca crash, nunca
    // bounce para o login com a tela aberta.
    private fun loadExtraMaterials(sameFolderFiles: List<FileItem>) {
        extraMaterialsJob?.cancel()
        extraMaterials = emptyList()
        extraMaterialsJob = lifecycleScope.launch {
            val extra = withContext(Dispatchers.IO) {
                runCatching {
                    MaterialDiscovery.discoverExtraMaterials(api, currentPath, sameFolderFiles)
                }.getOrDefault(emptyList())
            }
            if (extra.isEmpty() || isFinishing || isDestroyed) return@launch
            extraMaterials = extra
            refreshFlatList()
            // Os nomes dos materiais novos alimentam o resumo e as
            // questões (o fetchGenerated usa os nomes dos PDFs/MDs):
            // recarregam-se com a lista fundida, sem tocar no resto.
            val merged = (sameFolderFiles + extra).distinctBy { it.name.lowercase() }
            loadLessonDescription(merged)
            loadQuestionsFlashcards(merged)
        }
    }

    private fun filterLessons(query: String) {
        if (isFlatMode) {
            if (isWide()) {
                // TV/tablet largo: grade sem secções (comportamento atual).
                val filtered = if (query.isBlank()) allFiles
                    else allFiles.filter { it.name.contains(query, ignoreCase = true) }
                fileAdapter?.submitList(filtered)
            } else {
                // Celular: a busca re-aplica-se dentro das secções.
                refreshFlatList()
            }
        } else {
            refreshLessonList()
        }
    }

    private fun toggleLessonGroup(group: LessonGroup) {
        group.expanded = !group.expanded
        if (group.expanded && group.children == null) {
            lifecycleScope.launch {
                val children = withContext(Dispatchers.IO) { api.listFolder(group.folderPath) }
                group.children = children ?: emptyList()
                group.pdfFolderCount = group.children!!.count { it.isFolder }
                refreshLessonList()
            }
        } else {
            refreshLessonList()
        }
    }

    /** Reproduz o vídeo principal do grupo (grade TV/tablet). */
    private fun playLessonGroup(group: LessonGroup) {
        val video = group.children?.firstOrNull { (it.isVideo || it.isAudio) && !it.link.isNullOrEmpty() }
        if (video != null) {
            openFileInFolder(video, group.folderPath)
        } else {
            openLessonGroupDetail(group)
        }
    }

    private fun openLessonGroup(group: LessonGroup) {
        openLessonGroupDetail(group)
    }

    /**
     * Ronda 12 — abre o detalhe de um grupo de aulas pelo caminho
     * PRÓPRIO do grupo (group.folderPath). Antes, os dois call sites
     * acima passavam por openFolderInLesson(group.folder,
     * group.folderPath), que anexa group.folder.name ao caminho
     * recebido — e folderPath JÁ é o caminho completo do grupo
     * (buildLessonGroups) — por isso o nome era anexado duas vezes
     * ("/11:/jornada-mpu/jornada-mpu/") e a pasta vinha vazia.
     * openFolderInLesson continua a existir, intacta, para os filhos
     * reais (lista expansível e ramo isFolder de openFileInFolder),
     * onde o ficheiro é de facto um filho do caminho passado.
     * Grupo sintético "Arquivos avulsos" (id "__loose__"): não é
     * uma pasta real no Drive — folderPath é o currentPath da tela
     * e os filhos já estão pré-carregados; navegar daria
     * "<currentPath>Arquivos avulsos/", que não existe. Sem vídeo
     * direto, o toque não navega (na lista do celular este grupo
     * também nunca navega: o cabeçalho só expande/colapsa).
     */
    private fun openLessonGroupDetail(group: LessonGroup) {
        if (group.folder.id == "__loose__") return
        val intent = Intent(this, DetailActivity::class.java)
        intent.putExtra("drivePath", group.folderPath)
        intent.putExtra("folderName", group.folder.name)
        // Ronda 10 Frente C — o detalhe-filho herda o drive do
        // admin (sub-capa + capas de sub-pasta continuam a valer).
        AdminDriveUi.forwardAdminDrive(this.intent, intent)
        startActivity(intent)
    }

    private fun openFolderInLesson(file: FileItem, folderPath: String) {
        // Ronda 13 Frente C — modo por ID: a sub-pasta navega pelo
        // ID do ficheiro (o pai "by-id:<id>" nao tem nome p/ anexar).
        val newPath = if (ApiService.isByIdPath(folderPath)) ApiService.byIdPath(file.id)
            else if (folderPath.endsWith("/")) "$folderPath${file.name}/" else "$folderPath/${file.name}/"
        val intent = Intent(this, DetailActivity::class.java)
        intent.putExtra("drivePath", newPath)
        intent.putExtra("folderName", file.name)
        // Ronda 10 Frente C — o detalhe-filho herda o drive do
        // admin (sub-capa + capas de sub-pasta continuam a valer).
        AdminDriveUi.forwardAdminDrive(this.intent, intent)
        startActivity(intent)
    }

    /**
     * CTA "Continuar assistindo": retoma o vídeo com resume mais recente
     * (ponto exato); sem resume, toca o primeiro vídeo da pasta.
     */
    private fun playResumeOrFirst() {
        val sm = SessionManager.get(this)
        val recents = sm.getRecents().filter { it.folderPath.startsWith(currentPath) }
        val best = recents.maxByOrNull { sm.getResumeProgress(it.folderPath, it.videoName) }
        if (best != null && sm.hasResume(best.folderPath, best.videoName)) {
            continueWatching(best.folderPath, best.videoName, best.videoName)
            return
        }
        playFirstVideo()
    }

    private fun playFirstVideo() {
        val firstVideo = allFiles.find { (it.isVideo || it.isAudio) && !it.link.isNullOrEmpty() }
        if (firstVideo != null) {
            openFile(firstVideo)
        } else {
            val firstFolder = allFiles.find { it.isFolder }
            if (firstFolder != null) openFolder(firstFolder)
        }
    }

    private fun openFolder(file: FileItem) {
        // Ronda 13 Frente C — modo por ID: ver openFolderInLesson.
        val newPath = if (ApiService.isByIdPath(currentPath)) ApiService.byIdPath(file.id)
        else if (currentPath.endsWith("/")) {
            "$currentPath${file.name}/"
        } else {
            "$currentPath/${file.name}/"
        }
        val intent = Intent(this, DetailActivity::class.java)
        intent.putExtra("drivePath", newPath)
        intent.putExtra("folderName", file.name)
        // Ronda 10 Frente C — o detalhe-filho herda o drive do
        // admin (sub-capa + capas de sub-pasta continuam a valer).
        AdminDriveUi.forwardAdminDrive(this.intent, intent)
        startActivity(intent)
    }

    /** Abre um arquivo sabendo a pasta dele (usado pela aba Aulas). */
    private fun openFileInFolder(file: FileItem, folderPath: String) {
        val link = file.link
        if (link.isNullOrEmpty()) return
        val fullUrl = fileBaseUrl(folderPath) + link
        when {
            file.isVideo || file.isAudio -> {
                // Frente H — navegação IMEDIATA: a playlist da mesma
                // pasta (quando há >1 vídeo) ou só o vídeo tocado segue
                // já para o player. A montagem interfolder
                // (CrossFolderPlaylist: 1 listFolder ao pai + 1 por cada
                // pasta-irmã, em lotes de 6) corria ANTES da navegação e
                // deixava o toque sem resposta durante segundos; agora
                // corre em 2º plano dentro do PlayerActivity, depois de
                // o player já estar visível a mostrar "A carregar".
                val group = lessonGroups.find { it.folderPath == folderPath }
                val siblings = group?.children
                    ?.filter { (it.isVideo || it.isAudio) && !it.link.isNullOrEmpty() }
                    ?: emptyList()
                val idx = siblings.indexOfFirst { it.id == file.id }
                if (siblings.size > 1 && idx >= 0) {
                    // Ronda 15 Frente B (B1): carimbar folderPath — sem isto o progresso cai na loja legada pos_<url>.
                    PlaylistManager.setPlaylist(siblings.map { it.copy(folderPath = folderPath) }, idx, this)
                } else {
                    PlaylistManager.setPlaylist(
                        listOf(file.copy(folderPath = folderPath)), 0, this
                    )
                }
                launchPlayer(fullUrl, file.name, folderPath, file.thumbnailLink)
            }
            file.isPdf -> openPdf(file, folderPath)
            file.isMarkdown -> openMd(file, folderPath)
            file.isFolder -> openFolderInLesson(file, folderPath)
            else -> {
                // Outros arquivos: app externo (comportamento antigo).
                val intent = Intent(Intent.ACTION_VIEW, android.net.Uri.parse(fullUrl))
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                try { startActivity(intent) } catch (_: Exception) {}
            }
        }
    }


    private fun openFile(file: FileItem) {
        val link = file.link
        if (link.isNullOrEmpty()) return
        // Frente R14A — um material da pasta ao lado abre pela pasta
        // DELE (file.folderPath, carimbada na descoberta); os da
        // pasta da aula continuam por currentPath, como antes.
        val fileFolder = file.folderPath ?: currentPath
        val fullUrl = fileBaseUrl(fileFolder) + link
        if (file.isVideo || file.isAudio) {
            val playableItems = allFiles.filter { (it.isVideo || it.isAudio) && !it.link.isNullOrEmpty() }
            val playIndex = playableItems.indexOfFirst { it.id == file.id }
            if (playableItems.size > 1 && playIndex >= 0) {
                // Ronda 15 Frente B (B1): carimbar folderPath — sem isto o progresso cai na loja legada pos_<url>.
                PlaylistManager.setPlaylist(playableItems.map { it.copy(folderPath = currentPath) }, playIndex, this)
            } else {
                // Frente H — ver openFileInFolder: navega já com só este
                // vídeo; a playlist interfolder é enriquecida pelo player.
                PlaylistManager.setPlaylist(
                    listOf(file.copy(folderPath = currentPath)), 0, this
                )
            }
            launchPlayer(fullUrl, file.name, currentPath, file.thumbnailLink)
        } else if (file.isPdf) {
            openPdf(file, fileFolder)
        } else if (file.isMarkdown) {
            openMd(file, fileFolder)
        } else {
            val intent = Intent(Intent.ACTION_VIEW, android.net.Uri.parse(fullUrl))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try { startActivity(intent) } catch (_: Exception) {}
        }
    }


    /** v2.7.6: PDF abre no leitor embutido (não mais app externo). */
    private fun openPdf(file: FileItem, folderPath: String) {
        val intent = Intent(this, PdfReaderActivity::class.java)
        intent.putExtra(PdfReaderActivity.EXTRA_URL, fileBaseUrl(folderPath) + (file.link ?: ""))
        intent.putExtra(PdfReaderActivity.EXTRA_NAME, file.name)
        intent.putExtra(PdfReaderActivity.EXTRA_PATH, "$folderPath${file.name}")
        startActivity(intent)
    }

    /** v2.7.6: .md/transcrição abre no leitor de MD embutido. */
    private fun openMd(file: FileItem, folderPath: String) {
        val intent = Intent(this, MdReaderActivity::class.java)
        intent.putExtra(MdReaderActivity.EXTRA_URL, fileBaseUrl(folderPath) + (file.link ?: ""))
        intent.putExtra(MdReaderActivity.EXTRA_NAME, file.name)
        intent.putExtra(MdReaderActivity.EXTRA_PATH, "$folderPath${file.name}")
        startActivity(intent)
    }

    private fun launchPlayer(url: String, title: String, folderPath: String, thumbnailLink: String? = null) {
        // Frente H — guarda contra duplo toque: um toque = uma navegação;
        // toques repetidos no mesmo vídeo dentro de 1,5 s são ignorados.
        if (!TapFeedback.tryNavigate(url)) return
        val sm = SessionManager.get(this)
        sm.saveLastWatched(folderPath, title)
        // Frente H — guarda o link de playback no recent (além da thumb):
        // o "Continuar assistindo" passa a navegar sem listFolder prévio.
        sm.addRecent(folderPath, title, thumbnailLink, ApiService.linkFromPlaybackUrl(url))
        val intent = Intent(this, PlayerActivity::class.java)
        intent.putExtra(PlayerActivity.EXTRA_URL, url)
        intent.putExtra(PlayerActivity.EXTRA_TITLE, title)
        intent.putExtra(PlayerActivity.EXTRA_FOLDER_PATH, folderPath)
        startActivity(intent)
    }


    private fun heroGradient(baseColor: Int): GradientDrawable {
        val r = Color.red(baseColor)
        val g = Color.green(baseColor)
        val b = Color.blue(baseColor)
        val start = Color.argb(0x80, r, g, b)
        val end = Color.parseColor("#FF0D0E12")
        return GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            intArrayOf(start, end)
        )
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

    private class GridGutterDecoration(private val gutterDp: Int) : RecyclerView.ItemDecoration() {
        override fun getItemOffsets(
            outRect: Rect, view: View, parent: RecyclerView, state: RecyclerView.State
        ) {
            val density = view.resources.displayMetrics.density
            val px = (gutterDp * density).toInt()
            outRect.set(px / 2, px / 2, px / 2, px / 2)
        }
    }
}
