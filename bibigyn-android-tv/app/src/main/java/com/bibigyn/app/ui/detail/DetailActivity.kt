package com.bibigyn.app.ui.detail

import android.content.Intent
import android.graphics.Color
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.google.android.material.snackbar.Snackbar
import com.bibigyn.app.BiBiGynApp
import com.bibigyn.app.R
import com.bibigyn.app.data.AiService
import com.bibigyn.app.data.ApiService
import com.bibigyn.app.data.FileItem
import com.bibigyn.app.data.colorFromString
import com.bibigyn.app.data.monogramFor
import com.bibigyn.app.databinding.ActivityDetailBinding
import com.bibigyn.app.ui.home.HomeActivity
import com.bibigyn.app.ui.home.RailAdapter
import com.bibigyn.app.ui.home.RailItem
import com.bibigyn.app.ui.mylist.MyListActivity
import com.bibigyn.app.ui.player.PlayerActivity
import com.bibigyn.app.ui.reader.MdReaderActivity
import com.bibigyn.app.ui.reader.PdfReaderActivity
import com.bibigyn.app.ui.search.SearchActivity
import com.bibigyn.app.ui.settings.SettingsActivity
import com.bibigyn.app.util.AuthHelper
import com.bibigyn.app.util.CrossFolderPlaylist
import com.bibigyn.app.util.Format
import com.bibigyn.app.util.LessonDescription
import com.bibigyn.app.util.PlaylistManager
import com.bibigyn.app.util.SessionManager
import com.bibigyn.app.util.TvUtils
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * v2.1.5 — Detalhe da aula (conceito detalhe, escolhido pelo Elton 23:41).
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
    private var fileAdapter: com.bibigyn.app.ui.browse.FileAdapter? = null
    private var lessonListAdapter: LessonListAdapter? = null
    private var lessonGridAdapter: LessonGridAdapter? = null
    private var flatAdapter: FlatLessonAdapter? = null
    private var isFlatMode: Boolean = false
    private var lessonGroups: List<LessonGroup> = emptyList()
    private var allFiles: List<FileItem> = emptyList()
    private var currentTab: Tab = Tab.LESSONS
    private var lastFocusedContinuePos = 0

    private enum class Tab { SUMMARY, LESSONS, QUESTIONS, FLASHCARDS }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityDetailBinding.inflate(layoutInflater)
        setContentView(binding.root)

        api = ApiService(this)
        currentPath = intent.getStringExtra("drivePath") ?: "/"
        folderName = intent.getStringExtra("folderName") ?: "Detalhe"

        // Hero
        binding.heroTitle.text = folderName
        binding.toolbar.title = folderName
        binding.toolbar.setNavigationOnClickListener { finish() }
        val baseColor = colorFromString(folderName)
        binding.heroBg.background = heroGradient(baseColor)
        binding.heroMonogram.text = monogramFor(folderName)

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

        // Busca dentro da aba Aulas (filtra as aulas pelo nome, local).
        binding.lessonSearch.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) = filterLessons(s?.toString().orEmpty())
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        })

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
        // Restaura o foco no rail "Continuar de onde parou" (TV).
        if (TvUtils.isTv(this) && binding.railContinue.visibility == View.VISIBLE) {
            binding.railContinue.post {
                binding.railContinue.findViewHolderForAdapterPosition(lastFocusedContinuePos)
                    ?.itemView?.requestFocus()
            }
        }
    }

    override fun onDestroy() {
        descriptionJob?.cancel()
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
        binding.railContinue.adapter = RailAdapter(railItems) { item ->
            lastFocusedContinuePos = railItems.indexOf(item)
            val match = driveRecents.find { it.videoName == item.title } ?: return@RailAdapter
            continueWatching(match.folderPath, match.videoName, item.subtitle)
        }
    }

    private fun continueWatching(folderPath: String, videoName: String, shortFolder: String) {
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
                        PlaylistManager.setPlaylist(playable, if (idx >= 0) idx else 0, this@DetailActivity)
                        launchPlayer(BiBiGynApp.BASE_URL + clickedVideo.link, videoName, folderPath, clickedVideo.thumbnailLink)
                        return@launch
                    } else {
                        val result = withContext(Dispatchers.IO) {
                            CrossFolderPlaylist.build(folderPath, clickedVideo, api)
                        }
                        if (result.items.isNotEmpty()) {
                            PlaylistManager.setPlaylist(result.items, result.startIndex, this@DetailActivity)
                        }
                        launchPlayer(BiBiGynApp.BASE_URL + clickedVideo.link, videoName, folderPath, clickedVideo.thumbnailLink)
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

            // Hero: foto do 1º vídeo (thumb real) ou monograma.
            val firstThumb = files.firstOrNull { (it.isVideo || it.isAudio) && !it.thumbnailLink.isNullOrBlank() }
                ?.thumbnailLink
            if (!firstThumb.isNullOrBlank()) {
                binding.heroImage.visibility = View.VISIBLE
                binding.heroMonogram.visibility = View.GONE
                binding.heroImage.load(firstThumb) { error(R.drawable.card_gradient_pink) }
            } else {
                binding.heroImage.visibility = View.GONE
                binding.heroMonogram.visibility = View.VISIBLE
            }

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
            val watchedCount = files.count { (it.isVideo || it.isAudio) && sm.isWatched(currentPath, it.name) }
            val total = videoCount
            val pct = if (total > 0) watchedCount * 100 / total else 0
            binding.chipProgress.text = "$pct% concluído"
            binding.chipFolders.text = "$folderCount pastas"

            // Resumo: descrição gerada / provisória / branco (00:21).
            loadLessonDescription(files)

            // Hero: progresso da aula mais recente em andamento.
            updateHeroProgress()

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
                binding.sectionLabel.text = if (videoCount > 0) {
                    "$videoCount vídeos em uma só pasta · $watchedCount concluídos"
                } else {
                    "Arquivos"
                }
                if (isWide()) {
                    val adapter = com.bibigyn.app.ui.browse.FileAdapter(
                        onFolder = { file -> openFolder(file) },
                        onFile = { file -> openFile(file) }
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
                        onOpenPdf = { file -> openPdf(file, currentPath) },
                        onOpenMd = { file -> openMd(file, currentPath) },
                        onOpenOther = { file -> openFile(file) }
                    )
                    flatAdapter = adapter
                    binding.recycler.layoutManager = LinearLayoutManager(this@DetailActivity)
                    binding.recycler.adapter = adapter
                    adapter.submitList(files)
                }
            }
        }
    }

    /**
     * v2.1.5 — Descrição da aula (aba Resumo, Elton 00:21).
     *
     * Cadeia de fallback (ordem exata):
     *   (a) descrição gerada guardada (cache local → servidor) → mostra ela;
     *   (b) senão, nome real de aula (nome da pasta) → provisória até a
     *       Meggy gerar a de verdade;
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
            showDescription(cached, getString(R.string.summary_state_generated))
            return
        }
        // (b)/(c) provisória imediata (ou branco) enquanto resolve.
        val firstVideo = files.firstOrNull { it.isVideo || it.isAudio }?.name
        val provisional = LessonDescription.provisionalDescription(folderName, firstVideo)
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
                    // Grava na pasta de materiais (best-effort).
                    val filePath = LessonDescription.lessonFilePath(currentPath, files)
                    if (filePath != null) {
                        val fileName = LessonDescription.folderFileName(
                            this@DetailActivity, folderName
                        )
                        AiService.saveToFolder(this@DetailActivity, filePath, fileName, outcome.text)
                    }
                    showDescription(outcome.text, getString(R.string.summary_state_generated))
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

    private fun showDescription(text: String, state: String) {
        binding.resumoText.text = text
        showDescriptionState(state)
    }

    private fun showDescriptionState(state: String) {
        binding.resumoState.text = state
        binding.resumoState.visibility = if (state.isBlank()) View.GONE else View.VISIBLE
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

    /** Monta os grupos de aulas (subpastas) + "Arquivos avulsos". */
    private fun buildLessonGroups(files: List<FileItem>) {
        val folders = files.filter { it.isFolder }
        val loose = files.filter { !it.isFolder }
        val groups = folders.map { folder ->
            val path = if (currentPath.endsWith("/")) "$currentPath${folder.name}/" else "$currentPath/${folder.name}/"
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
    }

    private fun filterLessons(query: String) {
        if (isFlatMode) {
            val filtered = if (query.isBlank()) allFiles
                else allFiles.filter { it.name.contains(query, ignoreCase = true) }
            flatAdapter?.submitList(filtered)
            fileAdapter?.submitList(filtered)
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
            openFolderInLesson(group.folder, group.folderPath)
        }
    }

    private fun openLessonGroup(group: LessonGroup) {
        openFolderInLesson(group.folder, group.folderPath)
    }

    private fun openFolderInLesson(file: FileItem, folderPath: String) {
        val newPath = if (folderPath.endsWith("/")) "$folderPath${file.name}/" else "$folderPath/${file.name}/"
        val intent = Intent(this, DetailActivity::class.java)
        intent.putExtra("drivePath", newPath)
        intent.putExtra("folderName", file.name)
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
        val newPath = if (currentPath.endsWith("/")) {
            "$currentPath${file.name}/"
        } else {
            "$currentPath/${file.name}/"
        }
        val intent = Intent(this, DetailActivity::class.java)
        intent.putExtra("drivePath", newPath)
        intent.putExtra("folderName", file.name)
        startActivity(intent)
    }

    /** Abre um arquivo sabendo a pasta dele (usado pela aba Aulas). */
    private fun openFileInFolder(file: FileItem, folderPath: String) {
        val link = file.link
        if (link.isNullOrEmpty()) return
        val fullUrl = BiBiGynApp.BASE_URL + link
        when {
            file.isVideo || file.isAudio -> {
                // Playlist: mesma pasta primeiro; se só 1 item, a
                // montagem interfolder existente (CrossFolderPlaylist).
                val group = lessonGroups.find { it.folderPath == folderPath }
                val siblings = group?.children
                    ?.filter { (it.isVideo || it.isAudio) && !it.link.isNullOrEmpty() }
                    ?: emptyList()
                val idx = siblings.indexOfFirst { it.id == file.id }
                if (siblings.size > 1 && idx >= 0) {
                    PlaylistManager.setPlaylist(siblings, idx, this)
                    launchPlayer(fullUrl, file.name, folderPath, file.thumbnailLink)
                } else {
                    lifecycleScope.launch {
                        val result = withContext(Dispatchers.IO) {
                            CrossFolderPlaylist.build(folderPath, file, api)
                        }
                        if (result.items.size > 1) {
                            PlaylistManager.setPlaylist(result.items, result.startIndex, this@DetailActivity)
                        } else if (siblings.isNotEmpty() && idx >= 0) {
                            PlaylistManager.setPlaylist(siblings, idx, this@DetailActivity)
                        }
                        launchPlayer(fullUrl, file.name, folderPath, file.thumbnailLink)
                    }
                }
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
        val fullUrl = BiBiGynApp.BASE_URL + link
        if (file.isVideo || file.isAudio) {
            val playableItems = allFiles.filter { (it.isVideo || it.isAudio) && !it.link.isNullOrEmpty() }
            val playIndex = playableItems.indexOfFirst { it.id == file.id }
            if (playableItems.size > 1 && playIndex >= 0) {
                PlaylistManager.setPlaylist(playableItems, playIndex, this)
                launchPlayer(fullUrl, file.name, currentPath, file.thumbnailLink)
            } else {
                lifecycleScope.launch {
                    binding.loadingView.visibility = View.VISIBLE
                    val result = withContext(Dispatchers.IO) {
                        CrossFolderPlaylist.build(currentPath, file, api)
                    }
                    binding.loadingView.visibility = View.GONE
                    if (result.items.size > 1) {
                        PlaylistManager.setPlaylist(result.items, result.startIndex, this@DetailActivity)
                    } else if (playableItems.isNotEmpty() && playIndex >= 0) {
                        PlaylistManager.setPlaylist(playableItems, playIndex, this@DetailActivity)
                    }
                    launchPlayer(fullUrl, file.name, currentPath, file.thumbnailLink)
                }
            }
        } else if (file.isPdf) {
            openPdf(file, currentPath)
        } else if (file.isMarkdown) {
            openMd(file, currentPath)
        } else {
            val intent = Intent(Intent.ACTION_VIEW, android.net.Uri.parse(fullUrl))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try { startActivity(intent) } catch (_: Exception) {}
        }
    }

    /** v2.1.5: PDF abre no leitor embutido (não mais app externo). */
    private fun openPdf(file: FileItem, folderPath: String) {
        val intent = Intent(this, PdfReaderActivity::class.java)
        intent.putExtra(PdfReaderActivity.EXTRA_URL, BiBiGynApp.BASE_URL + (file.link ?: ""))
        intent.putExtra(PdfReaderActivity.EXTRA_NAME, file.name)
        intent.putExtra(PdfReaderActivity.EXTRA_PATH, "$folderPath${file.name}")
        startActivity(intent)
    }

    /** v2.1.5: .md/transcrição abre no leitor de MD embutido. */
    private fun openMd(file: FileItem, folderPath: String) {
        val intent = Intent(this, MdReaderActivity::class.java)
        intent.putExtra(MdReaderActivity.EXTRA_URL, BiBiGynApp.BASE_URL + (file.link ?: ""))
        intent.putExtra(MdReaderActivity.EXTRA_NAME, file.name)
        intent.putExtra(MdReaderActivity.EXTRA_PATH, "$folderPath${file.name}")
        startActivity(intent)
    }

    private fun launchPlayer(url: String, title: String, folderPath: String, thumbnailLink: String? = null) {
        val sm = SessionManager.get(this)
        sm.saveLastWatched(folderPath, title)
        sm.addRecent(folderPath, title, thumbnailLink)
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
