package com.bibigyn.app.ui.mylist

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.LinearLayoutManager
import com.bibigyn.app.BiBiGynApp
import com.bibigyn.app.R
import com.bibigyn.app.data.DriveItem
import com.bibigyn.app.data.FileItem
import com.bibigyn.app.databinding.ActivityMylistBinding
import com.bibigyn.app.ui.browse.BrowseActivity
import com.bibigyn.app.ui.detail.DetailActivity
import com.bibigyn.app.ui.home.HomeActivity
import com.bibigyn.app.ui.player.PlayerActivity
import com.bibigyn.app.ui.reader.MdReaderActivity
import com.bibigyn.app.ui.reader.PdfReaderActivity
import com.bibigyn.app.ui.search.SearchActivity
import com.bibigyn.app.ui.settings.SettingsActivity
import com.bibigyn.app.util.SessionManager
import com.bibigyn.app.util.TvUtils

/**
 * v2.1.5 — Minha lista (conceito Minha lista).
 *
 * Header com avatar + "Minha lista" + "N itens salvos" em rosa; abas
 * Cursos / Aulas / Concursos (Concursos = cursos favoritos cujo path
 * é um drive de concurso — BiBi Fit: nenhum drive é concurso). Cards com
 * chip de tipo, thumb/monograma, título, progresso real + % (aulas),
 * ⭐ rosa para remover e botão rosa "Continuar" (cursos).
 * "12 de 45 aulas" NÃO existe sem listar a pasta — omitido
 * (documentado nas REDESIGN_NOTES). Nova seção "Documentos marcados"
 * (bookmarks dos leitores PDF/MD) quando não vazia.
 * TV: sem bottom nav.
 */
class MyListActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMylistBinding
    private lateinit var adapter: MyListAdapter
    private lateinit var courseAdapter: MyListCourseAdapter
    private lateinit var bookmarkAdapter: BookmarkAdapter

    private enum class Tab { COURSES, FILES, CONCURSOS }
    private var currentTab: Tab = Tab.COURSES

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMylistBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.toolbar.setNavigationOnClickListener { finish() }
        if (TvUtils.isTv(this)) {
            binding.bottomNav.visibility = View.GONE
        } else {
            binding.bottomNav.selectedItemId = R.id.nav_mylist
            binding.bottomNav.setOnItemSelectedListener { item ->
                when (item.itemId) {
                    R.id.nav_mylist -> true
                    R.id.nav_home -> { startActivity(Intent(this, HomeActivity::class.java)); overridePendingTransition(0, 0); true }
                    R.id.nav_search -> { startActivity(Intent(this, SearchActivity::class.java)); overridePendingTransition(0, 0); true }
                    R.id.nav_settings -> { startActivity(Intent(this, SettingsActivity::class.java)); overridePendingTransition(0, 0); true }
                    else -> false
                }
            }
        }

        val username = SessionManager.get(this).username ?: "Aluno"
        binding.avatarMonogram.text = com.bibigyn.app.data.monogramFor(username)

        binding.recycler.layoutManager = LinearLayoutManager(this)
        binding.recyclerCourses.layoutManager = LinearLayoutManager(this)
        binding.recyclerBookmarks.layoutManager = LinearLayoutManager(this)

        adapter = MyListAdapter(onFile = { file -> openFile(file) })
        binding.recycler.adapter = adapter

        courseAdapter = MyListCourseAdapter(
            onCourse = { course -> openCourse(course) },
            onRemove = { loadFavorites() }
        )
        binding.recyclerCourses.adapter = courseAdapter

        bookmarkAdapter = BookmarkAdapter(onOpen = { b -> openBookmark(b) })
        binding.recyclerBookmarks.adapter = bookmarkAdapter

        binding.tabCourses.setOnClickListener { selectTab(Tab.COURSES) }
        binding.tabFiles.setOnClickListener { selectTab(Tab.FILES) }
        binding.tabConcursos.setOnClickListener { selectTab(Tab.CONCURSOS) }

        selectTab(Tab.COURSES)
        loadFavorites()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        binding.bottomNav.selectedItemId = R.id.nav_mylist
    }

    override fun onResume() {
        super.onResume()
        loadFavorites()
    }

    private fun selectTab(tab: Tab) {
        currentTab = tab
        val pink = ContextCompat.getColor(this, R.color.md_primary)
        val muted = ContextCompat.getColor(this, R.color.md_on_surface_variant)
        fun set(tabView: View, active: Boolean) {
            (tabView as android.widget.TextView).setTextColor(if (active) pink else muted)
            tabView.background = ContextCompat.getDrawable(
                this, if (active) R.drawable.chip_badge else R.drawable.chip_outline
            )
        }
        set(binding.tabCourses, tab == Tab.COURSES)
        set(binding.tabFiles, tab == Tab.FILES)
        set(binding.tabConcursos, tab == Tab.CONCURSOS)
        loadFavorites()
    }

    private fun loadFavorites() {
        val sm = SessionManager.get(this)
        val courses = sm.getFavoriteCourses()
        val favs = sm.getFavorites()
        val total = courses.size + favs.size

        binding.labelCount.text = if (total == 0) "Nenhum item salvo" else "$total itens salvos"

        val concursoPaths = DriveItem.ALL.filter { it.isConcurso }.map { "/${it.index}:/" }
        val concursoCourses = courses.filter { c -> concursoPaths.any { c.drivePath.startsWith(it) } }

        // Documentos marcados (leitores) — seção própria, sempre visível
        // quando não vazia, independente da aba.
        val bookmarks = sm.getBookmarks()
        if (bookmarks.isEmpty()) {
            binding.labelBookmarks.visibility = View.GONE
            binding.recyclerBookmarks.visibility = View.GONE
        } else {
            binding.labelBookmarks.visibility = View.VISIBLE
            binding.recyclerBookmarks.visibility = View.VISIBLE
            bookmarkAdapter.submitList(bookmarks)
        }

        when (currentTab) {
            Tab.COURSES -> {
                binding.labelCourses.visibility = if (courses.isEmpty()) View.GONE else View.VISIBLE
                binding.recyclerCourses.visibility = if (courses.isEmpty()) View.GONE else View.VISIBLE
                binding.labelFiles.visibility = View.GONE
                binding.recycler.visibility = View.GONE
                courseAdapter.submitList(courses)
            }
            Tab.FILES -> {
                binding.labelFiles.visibility = if (favs.isEmpty()) View.GONE else View.VISIBLE
                binding.recycler.visibility = if (favs.isEmpty()) View.GONE else View.VISIBLE
                binding.labelCourses.visibility = View.GONE
                binding.recyclerCourses.visibility = View.GONE
                adapter.submitList(favs)
            }
            Tab.CONCURSOS -> {
                binding.labelCourses.visibility = if (concursoCourses.isEmpty()) View.GONE else View.VISIBLE
                binding.recyclerCourses.visibility = if (concursoCourses.isEmpty()) View.GONE else View.VISIBLE
                binding.labelFiles.visibility = View.GONE
                binding.recycler.visibility = View.GONE
                courseAdapter.submitList(concursoCourses)
            }
        }
        binding.emptyState.visibility = if (total == 0) View.VISIBLE else View.GONE
    }

    private fun openCourse(course: SessionManager.FavCourse) {
        val intent = Intent(this, DetailActivity::class.java)
        intent.putExtra("drivePath", course.drivePath)
        intent.putExtra("folderName", course.name)
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
        val fullUrl = BiBiGynApp.BASE_URL + link
        when {
            file.isPdf -> {
                val intent = Intent(this, PdfReaderActivity::class.java)
                intent.putExtra(PdfReaderActivity.EXTRA_URL, fullUrl)
                intent.putExtra(PdfReaderActivity.EXTRA_NAME, file.name)
                intent.putExtra(PdfReaderActivity.EXTRA_PATH, "${file.folderPath ?: ""}${file.name}")
                startActivity(intent)
            }
            file.isMarkdown -> {
                val intent = Intent(this, MdReaderActivity::class.java)
                intent.putExtra(MdReaderActivity.EXTRA_URL, fullUrl)
                intent.putExtra(MdReaderActivity.EXTRA_NAME, file.name)
                intent.putExtra(MdReaderActivity.EXTRA_PATH, "${file.folderPath ?: ""}${file.name}")
                startActivity(intent)
            }
            else -> {
                SessionManager.get(this).saveLastWatched(file.folderPath ?: "/", file.name)
                val intent = Intent(this, PlayerActivity::class.java)
                intent.putExtra(PlayerActivity.EXTRA_URL, fullUrl)
                intent.putExtra(PlayerActivity.EXTRA_TITLE, file.name)
                intent.putExtra(PlayerActivity.EXTRA_FOLDER_PATH, file.folderPath ?: "")
                startActivity(intent)
            }
        }
    }

    /** v2.1.5: abrir um documento marcado (PDF/MD) no leitor embutido. */
    private fun openBookmark(b: SessionManager.Bookmark) {
        // O bookmark guarda o path; a URL de download precisa do link do
        // Drive, que não é persistido. Reabre-se a pasta do documento
        // (o leitor recebe a URL quando aberto pela aula). Sem o link,
        // abre o detalhe da pasta que contém o documento.
        val folder = b.path.substringBeforeLast("/", "")
        val intent = Intent(this, DetailActivity::class.java)
        intent.putExtra("drivePath", if (folder.endsWith("/")) folder else "$folder/")
        intent.putExtra("folderName", folder.substringAfterLast("/"))
        Toast.makeText(this, "Abrindo a pasta de \"${b.name}\"", Toast.LENGTH_SHORT).show()
        startActivity(intent)
    }
}
