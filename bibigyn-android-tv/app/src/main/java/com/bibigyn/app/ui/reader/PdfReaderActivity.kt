package com.bibigyn.app.ui.reader

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.Bundle
import android.os.ParcelFileDescriptor
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import androidx.lifecycle.lifecycleScope
import com.bibigyn.app.R
import com.bibigyn.app.databinding.ActivityPdfReaderBinding
import com.bibigyn.app.ui.home.HomeActivity
import com.bibigyn.app.ui.mylist.MyListActivity
import com.bibigyn.app.ui.search.SearchActivity
import com.bibigyn.app.ui.settings.SettingsActivity
import com.bibigyn.app.util.FileDownloader
import com.bibigyn.app.util.SessionManager
import com.bibigyn.app.util.TvUtils
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * v2.1.5 — Leitor de PDF embutido (conceito leitor-pdf).
 *
 * Renderização nativa com PdfRenderer (página como card branco);
 * navegação anterior/próxima + ir para página (toque no rótulo);
 * zoom por botões (75/100/150/200/300% — sem pinch, documentado);
 * busca no texto via pdfbox-android (PDFTextStripper por página,
 * ocorrências navegáveis); compartilhar via FileProvider; bookmark
 * (salva o documento; aparece em Minha lista → Documentos marcados);
 * retoma a última página lida (savePdfPage).
 *
 * Limitações (documentadas): PDFs escaneados sem camada de texto não
 * têm o que buscar — a busca informa "o PDF pode ser escaneado (sem
 * texto)". Pinch-to-zoom não implementado (botões cobrem o zoom).
 * TV: botões focáveis pelo D-pad; o ScrollView da página recebe o
 * foco para rolar com as setas.
 */
class PdfReaderActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_URL = "pdf_url"
        const val EXTRA_NAME = "pdf_name"
        const val EXTRA_PATH = "pdf_path"
    }

    private lateinit var binding: ActivityPdfReaderBinding
    private var renderer: PdfRenderer? = null
    private var pdfFile: File? = null
    private var pageCount = 0
    private var currentPage = 0
    private val zooms = floatArrayOf(0.75f, 1.0f, 1.5f, 2.0f, 3.0f)
    private var zoomIdx = 1
    private var docPath: String = ""
    private var docName: String = "Documento"

    // Busca no texto (pdfbox-android, por página).
    private var pageTexts: List<String>? = null
    private var occurrences: List<Int> = emptyList()
    private var occurrenceIdx = -1

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityPdfReaderBinding.inflate(layoutInflater)
        setContentView(binding.root)

        docName = intent.getStringExtra(EXTRA_NAME) ?: "Documento"
        docPath = intent.getStringExtra(EXTRA_PATH) ?: docName
        val url = intent.getStringExtra(EXTRA_URL) ?: ""

        binding.toolbar.title = docName
        binding.toolbar.setNavigationOnClickListener { finish() }
        if (TvUtils.isTv(this)) {
            binding.bottomNav.visibility = View.GONE
            binding.pageScrollV.isFocusable = true
        } else {
            binding.bottomNav.setOnItemSelectedListener { item ->
                when (item.itemId) {
                    R.id.nav_home -> { startActivity(Intent(this, HomeActivity::class.java)); true }
                    R.id.nav_search -> { startActivity(Intent(this, SearchActivity::class.java)); true }
                    R.id.nav_mylist -> { startActivity(Intent(this, MyListActivity::class.java)); true }
                    R.id.nav_settings -> { startActivity(Intent(this, SettingsActivity::class.java)); true }
                    else -> false
                }
            }
        }

        binding.btnPrevPage.setOnClickListener { goToPage(currentPage - 1) }
        binding.btnNextPage.setOnClickListener { goToPage(currentPage + 1) }
        binding.pageLabel.setOnClickListener { showGoToPageDialog() }
        binding.btnZoomOut.setOnClickListener { setZoom(zoomIdx - 1) }
        binding.btnZoomIn.setOnClickListener { setZoom(zoomIdx + 1) }
        binding.btnSearch.setOnClickListener {
            val show = binding.searchBar.visibility != View.VISIBLE
            binding.searchBar.visibility = if (show) View.VISIBLE else View.GONE
            if (show) binding.searchInput.requestFocus()
        }
        binding.btnSearchNext.setOnClickListener { nextOccurrence() }
        binding.btnSearchPrev.setOnClickListener { prevOccurrence() }
        binding.searchInput.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) = runSearch(s?.toString().orEmpty())
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        })
        binding.btnShare.setOnClickListener { sharePdf() }
        updateBookmarkButton()
        binding.btnBookmark.setOnClickListener {
            val added = SessionManager.get(this).toggleBookmark(docPath, docName, "pdf")
            updateBookmarkButton()
            Toast.makeText(this,
                if (added) "🔖 Documento marcado" else "Marcador removido",
                Toast.LENGTH_SHORT).show()
        }

        loadPdf(url)
    }

    private fun updateBookmarkButton() {
        val marked = SessionManager.get(this).isBookmarked(docPath)
        binding.btnBookmark.text = if (marked) "🔖" else "☆"
    }

    private fun loadPdf(url: String) {
        binding.loadingView.visibility = View.VISIBLE
        binding.errorView.visibility = View.GONE
        lifecycleScope.launch {
            val file = withContext(Dispatchers.IO) {
                FileDownloader.download(this@PdfReaderActivity, url, "pdfs", docName)
            }
            binding.loadingView.visibility = View.GONE
            if (file == null) {
                binding.errorView.visibility = View.VISIBLE
                binding.errorView.text = "Não foi possível baixar o PDF. Verifique a conexão."
                return@launch
            }
            pdfFile = file
            try {
                val pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
                renderer = PdfRenderer(pfd)
                pageCount = renderer?.pageCount ?: 0
                if (pageCount <= 0) {
                    binding.errorView.visibility = View.VISIBLE
                    binding.errorView.text = "O PDF não tem páginas legíveis."
                    return@launch
                }
                // Retomar a última página lida.
                currentPage = SessionManager.get(this@PdfReaderActivity)
                    .getPdfPage(docPath).coerceIn(0, pageCount - 1)
                renderPage()
                extractTextsInBackground(file)
            } catch (e: Exception) {
                binding.errorView.visibility = View.VISIBLE
                binding.errorView.text = "Não foi possível abrir o PDF (${e.message})."
            }
        }
    }

    /** Extrai o texto de todas as páginas (pdfbox) para a busca. */
    private fun extractTextsInBackground(file: File) {
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                PDFBoxResourceLoader.init(applicationContext)
                PDDocument.load(file).use { doc ->
                    val stripper = PDFTextStripper()
                    val texts = (0 until doc.numberOfPages).map { i ->
                        stripper.startPage = i + 1
                        stripper.endPage = i + 1
                        runCatching { stripper.getText(doc) }.getOrDefault("")
                    }
                    pageTexts = texts
                }
            } catch (_: Exception) {
                pageTexts = emptyList()
            }
        }
    }

    private fun renderPage() {
        val r = renderer ?: return
        if (currentPage !in 0 until pageCount) return
        val page = r.openPage(currentPage)
        val zoom = zooms[zoomIdx]
        val width = (page.width * zoom * 2).toInt().coerceAtLeast(1)
        val height = (page.height * zoom * 2).toInt().coerceAtLeast(1)
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        bitmap.eraseColor(android.graphics.Color.WHITE)
        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
        page.close()
        binding.pageImage.setImageBitmap(bitmap)
        binding.pageLabel.text = "Página ${currentPage + 1} de $pageCount"
        binding.zoomLabel.text = "${(zoom * 100).toInt()}%"
        binding.btnPrevPage.isEnabled = currentPage > 0
        binding.btnNextPage.isEnabled = currentPage < pageCount - 1
        SessionManager.get(this).savePdfPage(docPath, currentPage)
        binding.pageScrollV.scrollTo(0, 0)
    }

    private fun goToPage(page: Int) {
        if (page in 0 until pageCount) {
            currentPage = page
            renderPage()
        }
    }

    private fun setZoom(idx: Int) {
        zoomIdx = idx.coerceIn(0, zooms.lastIndex)
        renderPage()
    }

    private fun showGoToPageDialog() {
        val input = EditText(this).apply {
            inputType = android.text.InputType.TYPE_CLASS_NUMBER
            setText((currentPage + 1).toString())
            setSelection(text.length)
        }
        AlertDialog.Builder(this)
            .setTitle("Ir para a página (1–$pageCount)")
            .setView(input)
            .setPositiveButton("Ir") { _, _ ->
                val page = input.text.toString().toIntOrNull()?.minus(1)
                if (page != null) goToPage(page)
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun runSearch(query: String) {
        val texts = pageTexts
        if (query.length < 2) {
            occurrences = emptyList()
            occurrenceIdx = -1
            binding.searchCount.text = ""
            return
        }
        if (texts == null) {
            binding.searchCount.text = "Extraindo texto…"
            return
        }
        occurrences = texts.mapIndexedNotNull { i, t ->
            if (t.contains(query, ignoreCase = true)) i else null
        }
        occurrenceIdx = -1
        binding.searchCount.text = if (occurrences.isEmpty()) {
            "Nenhuma ocorrência — o PDF pode ser escaneado (sem texto)"
        } else {
            "${occurrences.size} página(s) com \"$query\""
        }
        if (occurrences.isNotEmpty()) nextOccurrence()
    }

    private fun nextOccurrence() {
        if (occurrences.isEmpty()) return
        occurrenceIdx = (occurrenceIdx + 1) % occurrences.size
        goToPage(occurrences[occurrenceIdx])
    }

    private fun prevOccurrence() {
        if (occurrences.isEmpty()) return
        occurrenceIdx = (occurrenceIdx - 1 + occurrences.size) % occurrences.size
        goToPage(occurrences[occurrenceIdx])
    }

    private fun sharePdf() {
        val file = pdfFile ?: return
        try {
            val uri = FileProvider.getUriForFile(
                this, "com.bibigyn.app.fileprovider", file
            )
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "application/pdf"
                putExtra(Intent.EXTRA_STREAM, uri)
                putExtra(Intent.EXTRA_SUBJECT, docName)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivity(Intent.createChooser(intent, "Compartilhar PDF"))
        } catch (e: Exception) {
            Toast.makeText(this, "Não foi possível compartilhar (${e.message})", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onPause() {
        super.onPause()
        SessionManager.get(this).savePdfPage(docPath, currentPage)
    }

    override fun onDestroy() {
        super.onDestroy()
        try { renderer?.close() } catch (_: Exception) {}
    }
}
