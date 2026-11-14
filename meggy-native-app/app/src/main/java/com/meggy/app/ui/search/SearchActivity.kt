package com.meggy.app.ui.search

import android.content.Intent
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.LinearLayoutManager
import com.meggy.app.MeggyApp
import com.meggy.app.R
import com.meggy.app.data.DriveItem
import com.meggy.app.data.FileItem
import com.meggy.app.databinding.ActivitySearchBinding
import com.meggy.app.ui.browse.BrowseActivity
import com.meggy.app.ui.home.HomeActivity
import com.meggy.app.ui.mylist.MyListActivity
import com.meggy.app.ui.player.PlayerActivity
import com.meggy.app.ui.settings.SettingsActivity
import com.meggy.app.util.SessionManager
import com.meggy.app.util.TvUtils

/**
 * v2.7.6 — Buscar (conceito Buscar).
 *
 * Barra de busca arredondada + chips Todos/Concursos/Cursos/Aulas/
 * Resumos + "Buscas recentes" (chips com relógio, máx. 5, persistidas
 * no SessionManager). Resultados como cards horizontais (thumb/
 * monograma, título, metadados, progresso + % e pill "Em andamento").
 *
 * Filtros (dados reais, sem inventar):
 *  - Concursos: drives com `DriveItem.isConcurso` (Meggy: 0, 9, 10, 11)
 *    + favoritos/recentes dentro desses drives.
 *  - Cursos: os demais drives + favoritos/recentes fora dos concursos.
 *  - Aulas: só arquivos (favoritos + recentes, vídeo/áudio).
 *  - Resumos: estado vazio desenhado — o app não tem fonte de dados
 *    de resumos (o resumo do batalhão vive no worker, materials_meta).
 * A busca é interfolder (drives + favoritos + recentes), como antes.
 * TV: sem bottom nav; lista vertical (D-pad navega linha a linha).
 */
class SearchActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySearchBinding
    private lateinit var adapter: SearchResultAdapter

    private enum class Filter { ALL, CONCURSOS, CURSOS, AULAS, RESUMOS }
    private var currentFilter: Filter = Filter.ALL

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySearchBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.toolbar.setNavigationOnClickListener { finish() }
        if (TvUtils.isTv(this)) {
            binding.bottomNav.visibility = View.GONE
        } else {
            binding.bottomNav.selectedItemId = R.id.nav_search
            binding.bottomNav.setOnItemSelectedListener { item ->
                when (item.itemId) {
                    R.id.nav_search -> true
                    R.id.nav_home -> { startActivity(Intent(this, HomeActivity::class.java)); overridePendingTransition(0, 0); true }
                    R.id.nav_mylist -> { startActivity(Intent(this, MyListActivity::class.java)); overridePendingTransition(0, 0); true }
                    R.id.nav_settings -> { startActivity(Intent(this, SettingsActivity::class.java)); overridePendingTransition(0, 0); true }
                    else -> false
                }
            }
        }

        binding.recycler.layoutManager = LinearLayoutManager(this)
        adapter = SearchResultAdapter(
            onDrive = { drive -> openDrive(drive) },
            onFile = { file -> openFile(file) }
        )
        binding.recycler.adapter = adapter

        binding.searchInput.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) { search(s?.toString().orEmpty()) }
        })
        binding.searchInput.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_SEARCH) {
                val q = binding.searchInput.text?.toString().orEmpty().trim()
                if (q.length >= 2) SessionManager.get(this).addRecentSearch(q)
                renderRecentSearches()
                true
            } else false
        }

        binding.chipAll.setOnClickListener { setFilter(Filter.ALL) }
        binding.chipConcursos.setOnClickListener { setFilter(Filter.CONCURSOS) }
        binding.chipCursos.setOnClickListener { setFilter(Filter.CURSOS) }
        binding.chipAulas.setOnClickListener { setFilter(Filter.AULAS) }
        binding.chipResumos.setOnClickListener { setFilter(Filter.RESUMOS) }

        renderRecentSearches()
        setFilter(Filter.ALL)
        search("")
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        binding.bottomNav.selectedItemId = R.id.nav_search
    }

    private fun setFilter(filter: Filter) {
        currentFilter = filter
        val pink = ContextCompat.getColor(this, R.color.md_primary)
        val muted = ContextCompat.getColor(this, R.color.md_on_surface_variant)
        val chips = mapOf(
            Filter.ALL to binding.chipAll,
            Filter.CONCURSOS to binding.chipConcursos,
            Filter.CURSOS to binding.chipCursos,
            Filter.AULAS to binding.chipAulas,
            Filter.RESUMOS to binding.chipResumos
        )
        chips.forEach { (f, chip) ->
            val active = f == filter
            chip.setTextColor(if (active) pink else muted)
            chip.background = ContextCompat.getDrawable(
                this, if (active) R.drawable.chip_badge else R.drawable.chip_outline
            )
        }
        search(binding.searchInput.text?.toString().orEmpty())
    }

    private fun renderRecentSearches() {
        val recents = SessionManager.get(this).getRecentSearches()
        binding.recentSection.visibility = if (recents.isEmpty()) View.GONE else View.VISIBLE
        binding.recentChips.removeAllViews()
        recents.forEach { q ->
            val chip = TextView(this).apply {
                text = "🕐 $q"
                setTextColor(ContextCompat.getColor(this@SearchActivity, R.color.md_on_surface_variant))
                background = ContextCompat.getDrawable(this@SearchActivity, R.drawable.chip_outline)
                setPadding(32, 16, 32, 16)
                isClickable = true
                isFocusable = true
                setOnClickListener {
                    binding.searchInput.setText(q)
                    binding.searchInput.setSelection(q.length)
                }
            }
            binding.recentChips.addView(chip)
        }
    }

    private fun search(query: String) {
        val q = query.trim()
        val sm = SessionManager.get(this)
        val results = mutableListOf<SearchResult>()

        if (currentFilter == Filter.RESUMOS) {
            // Sem fonte de dados de resumos no app — estado vazio.
            binding.emptyState.visibility = View.VISIBLE
            binding.recycler.visibility = View.GONE
            binding.resultsLabel.text = "Resumos"
            adapter.submit(emptyList())
            return
        }

        val isConcursoPath = { path: String ->
            DriveItem.ALL.filter { it.isConcurso }.any { path.startsWith("/${it.index}:/") }
        }

        val drives = if (q.isBlank()) DriveItem.ALL
            else DriveItem.ALL.filter { it.name.contains(q, ignoreCase = true) }
        val drivesFiltered = when (currentFilter) {
            Filter.CONCURSOS -> drives.filter { it.isConcurso }
            Filter.CURSOS -> drives.filter { !it.isConcurso }
            Filter.AULAS -> emptyList()
            else -> drives
        }
        drivesFiltered.forEach { results.add(SearchResult.Drive(it)) }

        val favorites = sm.getFavorites()
        val favFilter = if (q.isBlank()) favorites
            else favorites.filter { it.name.contains(q, ignoreCase = true) }
        val favsFiltered = when (currentFilter) {
            Filter.CONCURSOS -> favFilter.filter { isConcursoPath(it.folderPath ?: "") }
            Filter.CURSOS -> favFilter.filter { !isConcursoPath(it.folderPath ?: "") }
            Filter.AULAS -> favFilter.filter { it.isVideo || it.isAudio }
            else -> favFilter
        }
        favsFiltered.forEach { results.add(SearchResult.File(it)) }

        val recents = sm.getRecents()
        val recFilter = if (q.isBlank()) recents
            else recents.filter { it.videoName.contains(q, ignoreCase = true) }
        val recsFiltered = when (currentFilter) {
            Filter.CONCURSOS -> recFilter.filter { isConcursoPath(it.folderPath) }
            Filter.CURSOS -> recFilter.filter { !isConcursoPath(it.folderPath) }
            Filter.AULAS -> recFilter
            else -> recFilter
        }
        recsFiltered.forEach { r ->
            val fake = FileItem(
                name = r.videoName,
                mimeType = "video/mp4",
                id = "recent_${r.folderPath}_${r.videoName}",
                driveId = null,
                link = null,
                size = 0L,
                modifiedTime = null,
                folderLabel = r.folderPath.substringAfterLast("/"),
                folderPath = r.folderPath,
                thumbnailLink = r.thumbnailLink
            )
            results.add(SearchResult.File(fake))
        }

        if (results.isEmpty()) {
            binding.emptyState.visibility = View.VISIBLE
            binding.recycler.visibility = View.GONE
            binding.resultsLabel.text = if (q.isBlank()) "Sugestões" else "Nenhum resultado"
        } else {
            binding.emptyState.visibility = View.GONE
            binding.recycler.visibility = View.VISIBLE
            binding.resultsLabel.text = if (q.isBlank()) "Sugestões (${results.size})" else "Resultados (${results.size})"
        }
        adapter.submit(results)
    }

    private fun openDrive(drive: DriveItem) {
        val intent = Intent(this, BrowseActivity::class.java)
        intent.putExtra("drivePath", "/${drive.index}:/")
        intent.putExtra("folderName", drive.name)
        startActivity(intent)
    }

    private fun openFile(file: FileItem) {
        val link = file.link
        if (link.isNullOrEmpty()) {
            val intent = Intent(this, BrowseActivity::class.java)
            intent.putExtra("drivePath", file.folderPath ?: "/")
            intent.putExtra("folderName", file.folderLabel ?: file.folderPath ?: "Browse")
            startActivity(intent)
            return
        }
        val fullUrl = MeggyApp.BASE_URL + link
        SessionManager.get(this).saveLastWatched(file.folderPath ?: "/", file.name)
        SessionManager.get(this).addRecent(file.folderPath ?: "/", file.name, file.thumbnailLink)
        val intent = Intent(this, PlayerActivity::class.java)
        intent.putExtra(PlayerActivity.EXTRA_URL, fullUrl)
        intent.putExtra(PlayerActivity.EXTRA_TITLE, file.name)
        intent.putExtra(PlayerActivity.EXTRA_FOLDER_PATH, file.folderPath ?: "")
        startActivity(intent)
    }
}
