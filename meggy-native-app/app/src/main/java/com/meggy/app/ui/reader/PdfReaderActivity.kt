package com.meggy.app.ui.reader

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.text.Editable
import android.text.TextWatcher
import android.util.Base64
import android.view.View
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.lifecycle.lifecycleScope
import com.meggy.app.R
import com.meggy.app.data.AiService
import com.meggy.app.data.ApiService
import com.meggy.app.databinding.ActivityPdfReaderBinding
import com.meggy.app.ui.home.HomeActivity
import com.meggy.app.ui.mylist.MyListActivity
import com.meggy.app.ui.search.SearchActivity
import com.meggy.app.ui.settings.SettingsActivity
import com.meggy.app.util.FileDownloader
import com.meggy.app.util.MaterialSaver
import com.meggy.app.util.LessonDescription
import com.meggy.app.util.SessionManager
import com.meggy.app.util.TvUtils
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import java.io.ByteArrayOutputStream
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import android.util.LruCache
import android.view.GestureDetector
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.ViewGroup
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.meggy.app.databinding.ItemPdfPageBinding

/**
 * v2.7.15 — Leitor de PDF embutido (conceito leitor-pdf). Frente I:
 * scroll contínuo em tela cheia (RecyclerView vertical; cada página
 * é um item renderizado sob demanda pelo PdfRenderer nativo, com
 * cache LRU de 48 MB e pré-render da próxima página). No celular não
 * há troca de página por botões gigantes: desliza-se para baixo e as
 * páginas seguem em sequência; "<" (voltar) mantém-se na toolbar.
 * Zoom discreto: botões −/+ pequenos (36dp) + pinch (um passo por
 * gesto); ao ampliar, a página rola na horizontal dentro do item.
 * Mantidos: busca no texto (pdfbox-android), compartilhar via
 * FileProvider, bookmark, ir para página (toque no rótulo),
 * retoma da última página lida, botões ‹ › pequenos (TV/D-pad e
 * toque) e bottom nav. TV: RecyclerView focável; setas rolam.
 *
 * Limitações (documentadas): PDFs escaneados sem camada de texto não
 * têm o que buscar; o zoom é em passos (75/100/150/200/300%), sem
 * zoom livre contínuo; o PdfRenderer não é thread-safe — as
 * renderizações são serializadas por Mutex; bitmaps do cache não
 * são reciclados à mão (o GC liberta-os) para nunca desenhar um
 * bitmap reciclado ainda visível num holder.
 *
 * Frente J — botão "✨ Resumo" na toolbar: gera o resumo do PDF
 * pela Meggy no servidor (POST /api/ai, kind "resumo") a partir
 * do texto que o leitor já extrai (pdfbox); sem camada de texto,
 * lê até 4 páginas por OCR (POST /api/ai/ocr). O resumo aparece
 * num diálogo e é guardado no cache ISA + na pasta de materiais
 * (reutiliza AiService.saveSummary/saveToFolder; a Frente K é
 * dona da UX da pasta de materiais).
 */
class PdfReaderActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_URL = "pdf_url"
        const val EXTRA_NAME = "pdf_name"
        const val EXTRA_PATH = "pdf_path"
        // Frente J — resumo do PDF pela Meggy.
        /** Texto máximo enviado à IA (o mesmo teto da web, PROMPTS_RESUMO). */
        const val SUMMARY_MAX_TEXT_CHARS = 20_000
        /** Mínimo de caracteres não-brancos para o PDF contar como legível. */
        const val SUMMARY_MIN_READABLE_CHARS = 200
        /** Páginas máx. lidas por OCR quando o PDF não tem camada de texto. */
        const val SUMMARY_MAX_OCR_PAGES = 4
        /** Frente R5B — atraso sem interação antes de esconder as barras. */
        const val CHROME_HIDE_DELAY_MS = 3000L
        /** Frente R5B — duração da animação das barras (ms). */
        const val CHROME_ANIM_MS = 275L
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

    // Frente J — resumo do PDF pela Meggy (ver KDoc da classe).
    private var pdfSummary: String? = null
    private var summaryJob: Job? = null
    private var summaryDialog: AlertDialog? = null
    private var summaryStatusView: TextView? = null
    private var summaryProgressView: ProgressBar? = null
    private var summaryTextView: TextView? = null
    private var summaryScrollView: ScrollView? = null

    // Busca no texto (pdfbox-android, por página).
    private var pageTexts: List<String>? = null
    private var occurrences: List<Int> = emptyList()
    private var occurrenceIdx = -1

    // Scroll contínuo (Frente I): adapter + layout manager.
    private var pageAdapter: PdfPageAdapter? = null
    private var layoutManager: LinearLayoutManager? = null

    // Frente R5B — PDF em tela cheia no celular (ver bloco R5B).
    private var isTvReader = false
    private var chromeVisible = true
    private val chromeHandler = Handler(Looper.getMainLooper())
    private val hideChromeRunnable = Runnable { hideChrome() }
    private var goToPageDialog: AlertDialog? = null
    private val chromeBarAnims = HashMap<View, ValueAnimator>()
    private val chromeBarHeights = HashMap<View, Int>()
    private val chromeBarMargins = HashMap<View, Int>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityPdfReaderBinding.inflate(layoutInflater)
        setContentView(binding.root)

        docName = intent.getStringExtra(EXTRA_NAME) ?: "Documento"
        docPath = intent.getStringExtra(EXTRA_PATH) ?: docName
        val url = intent.getStringExtra(EXTRA_URL) ?: ""

        binding.toolbar.title = docName
        binding.toolbar.setNavigationOnClickListener { finish() }
        // Frente R5B — guarda p/ o auto-hide (só no celular).
        isTvReader = TvUtils.isTv(this)
        if (isTvReader) {
            binding.bottomNav.visibility = View.GONE
            binding.pdfPages.isFocusable = true
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
            if (show) {
                binding.searchInput.requestFocus()
                // Frente R5B — busca aberta: cancela o auto-hide.
                chromeHandler.removeCallbacks(hideChromeRunnable)
            } else {
                // Frente R5B — busca fechada: rearma o temporizador.
                scheduleChromeHide()
            }
        }
        binding.btnSearchNext.setOnClickListener { nextOccurrence() }
        binding.btnSearchPrev.setOnClickListener { prevOccurrence() }
        binding.searchInput.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) = runSearch(s?.toString().orEmpty())
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        })
        binding.btnShare.setOnClickListener { sharePdf() }
        binding.btnSummary.setOnClickListener { onSummaryClicked() }
        updateBookmarkButton()
        binding.btnBookmark.setOnClickListener {
            val added = SessionManager.get(this).toggleBookmark(docPath, docName, "pdf")
            updateBookmarkButton()
            Toast.makeText(this,
                if (added) "🔖 Documento marcado" else "Marcador removido",
                Toast.LENGTH_SHORT).show()
        }

        // Scroll contínuo (Frente I): lista vertical de páginas.
        layoutManager = LinearLayoutManager(this)
        binding.pdfPages.layoutManager = layoutManager
        binding.pdfPages.addOnScrollListener(object : RecyclerView.OnScrollListener() {
            override fun onScrolled(rv: RecyclerView, dx: Int, dy: Int) {
                // Frente R5B — rolar é interação: rearma o temporizador.
                scheduleChromeHide()
                val first = layoutManager?.findFirstVisibleItemPosition() ?: return
                if (first in 0 until pageCount && first != currentPage) {
                    currentPage = first
                    updatePageUi()
                    SessionManager.get(this@PdfReaderActivity).savePdfPage(docPath, currentPage)
                }
            }
        })
        // Frente R5B — um toque no PDF mostra/esconde as barras
        // (celular). onSingleTapUp (imediato no UP) em vez de
        // onSingleTapConfirmed (espera o timeout do duplo toque):
        // um toque que vira scroll nunca chega aqui (há MOVE antes
        // do UP), por isso o scroll não dispara o toggle.
        val tapDetector = GestureDetector(this,
            object : GestureDetector.SimpleOnGestureListener() {
                override fun onSingleTapUp(e: MotionEvent): Boolean {
                    if (!isTvReader) toggleChrome()
                    return true
                }
            })
        // Pinch-to-zoom discreto: um passo por gesto (Frente I).
        val pinch = ScaleGestureDetector(this,
            object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
                private var factor = 1f
                override fun onScaleBegin(detector: ScaleGestureDetector): Boolean {
                    factor = 1f
                    return true
                }
                override fun onScale(detector: ScaleGestureDetector): Boolean {
                    factor *= detector.scaleFactor
                    return true
                }
                override fun onScaleEnd(detector: ScaleGestureDetector) {
                    when {
                        factor > 1.25f -> setZoom(zoomIdx + 1)
                        factor < 0.8f -> setZoom(zoomIdx - 1)
                    }
                }
            })
        binding.pdfPages.setOnTouchListener { _, event ->
            pinch.onTouchEvent(event)
            tapDetector.onTouchEvent(event)
            false // não consome: o scroll vertical e o pinch continuam
        }

        loadPdf(url)
        // Frente R5B — o temporizador de ~3 s arranca ao abrir o PDF.
        scheduleChromeHide()
    }

    override fun onResume() {
        super.onResume()
        // Frente R5B — regresso ao leitor: rearma o temporizador
        // (o onPause remove os callbacks; com um diálogo aberto o
        // hide fica suprimido na mesma — ver isChromeSuppressed).
        scheduleChromeHide()
    }

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        // Frente R5B — qualquer toque rearma o temporizador (os
        // botões das barras incluídos). Os diálogos são outra janela
        // e não passam por aqui. Só no celular.
        if (!isTvReader && ev.action == MotionEvent.ACTION_DOWN) scheduleChromeHide()
        return super.dispatchTouchEvent(ev)
    }

    // ───────── Frente R5B — PDF em tela cheia no celular ─────────
    //
    // Ao abrir um PDF, ~3 s sem interação escondem sozinhas a toolbar,
    // a barra inferior de controlos (bottomControlsBar) e a bottom nav
    // — SÓ NO CELULAR; na TV os controlos ficam sempre visíveis (o
    // D-pad precisa deles e a bottom nav já nasce GONE lá). Um toque
    // no PDF traz as barras de volta e rearma o temporizador; rolar
    // também rearma (ver onScrolled) e qualquer toque em botão rearma
    // (ver dispatchTouchEvent). NÃO esconde com a barra de busca
    // aberta nem com o diálogo do resumo ou o diálogo "ir para
    // página" aberto (ver isChromeSuppressed).
    //
    // Animação: cada barra colapsa a altura (ValueAnimator, 275 ms)
    // + fade, e a margem inferior (a bottom nav tem marginBottom)
    // colapsa junto — o RecyclerView (peso 1 no LinearLayout)
    // estende-se aos poucos, sem saltos de layout. A altura/margem
    // originais são repostas no fim da animação, para a próxima
    // medição continuar certa.
    //
    // A barra de estado do sistema NÃO é escondida (decisão em
    // NOTES.md): esta Activity nunca ativou edge-to-edge e escondê-la
    // sem isso redimensionava a janela a cada hide/show.

    /** Agenda o auto-hide (~3 s); sem efeito na TV ou de barras escondidas. */
    private fun scheduleChromeHide() {
        if (isTvReader) return
        chromeHandler.removeCallbacks(hideChromeRunnable)
        if (!chromeVisible) return
        if (isChromeSuppressed()) return
        chromeHandler.postDelayed(hideChromeRunnable, CHROME_HIDE_DELAY_MS)
    }

    /** Verdadeiro com a busca aberta ou um diálogo do leitor aberto. */
    private fun isChromeSuppressed(): Boolean =
        binding.searchBar.visibility == View.VISIBLE ||
            summaryDialog?.isShowing == true ||
            goToPageDialog?.isShowing == true

    /** Esconde as 3 barras (celular; na TV nunca corre). */
    private fun hideChrome() {
        if (isTvReader || !chromeVisible || isChromeSuppressed()) return
        chromeVisible = false
        animateChromeBar(binding.toolbar, show = false)
        animateChromeBar(binding.bottomControlsBar, show = false)
        animateChromeBar(binding.bottomNav, show = false)
    }

    /** Mostra as 3 barras e rearma o temporizador. */
    private fun showChrome() {
        if (isTvReader || chromeVisible) return
        chromeVisible = true
        animateChromeBar(binding.toolbar, show = true)
        animateChromeBar(binding.bottomControlsBar, show = true)
        animateChromeBar(binding.bottomNav, show = true)
        scheduleChromeHide()
    }

    /** Um toque no PDF: mostra se escondidas, esconde se visíveis. */
    private fun toggleChrome() {
        if (chromeVisible) hideChrome() else showChrome()
    }

    /**
     * Colapsa/expande UMA barra animando a altura (0 ↔ altura medida)
     * + a margem inferior + o alpha, em CHROME_ANIM_MS. Animações em
     * curso na mesma vista são canceladas antes (toques rápidos não
     * acumulam animações). A altura original (56dp em px na toolbar,
     * WRAP_CONTENT nas outras) e a margem original são guardadas à
     * 1ª chamada e repostas no fim, para a próxima medição ser certa.
     */
    private fun animateChromeBar(view: View, show: Boolean) {
        chromeBarAnims[view]?.cancel()
        val lp = view.layoutParams as? ViewGroup.MarginLayoutParams ?: return
        if (!chromeBarHeights.containsKey(view)) {
            chromeBarHeights[view] = lp.height
            chromeBarMargins[view] = lp.bottomMargin
        }
        val origHeight = chromeBarHeights[view] ?: ViewGroup.LayoutParams.WRAP_CONTENT
        val origMargin = chromeBarMargins[view] ?: 0
        val fullHeight = if (origHeight > 0) origHeight else measureBarHeight(view)
        val startHeight = if (show) lp.height.coerceIn(0, fullHeight) else view.height
        val startMargin = if (show) lp.bottomMargin.coerceIn(0, origMargin) else lp.bottomMargin
        val startAlpha = view.alpha
        if (show) {
            // Altura/margem/alpha iniciais ANTES de ficar visível:
            // sem isto havia 1 frame à altura cheia.
            lp.height = startHeight
            lp.bottomMargin = startMargin
            view.alpha = startAlpha
            view.visibility = View.VISIBLE
            view.requestLayout()
        }
        val anim = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = CHROME_ANIM_MS
            addUpdateListener { a ->
                val f = a.animatedValue as Float
                lp.height = if (show) {
                    (startHeight + (fullHeight - startHeight) * f).toInt()
                } else {
                    (startHeight * (1f - f)).toInt()
                }
                lp.bottomMargin = if (show) {
                    (startMargin + (origMargin - startMargin) * f).toInt()
                } else {
                    (startMargin * (1f - f)).toInt()
                }
                view.alpha = if (show) startAlpha + (1f - startAlpha) * f
                    else startAlpha * (1f - f)
                view.requestLayout()
            }
            addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    chromeBarAnims.remove(view)
                    if (!show) view.visibility = View.GONE
                    // Repõe altura/margem/alpha originais (a vista
                    // GONE não ocupa espaço; a VISIBLE mede de novo).
                    lp.height = origHeight
                    lp.bottomMargin = origMargin
                    view.alpha = 1f
                    view.requestLayout()
                }
            })
        }
        chromeBarAnims[view] = anim
        anim.start()
    }

    /** Altura natural da barra (p/ as de WRAP_CONTENT). */
    private fun measureBarHeight(view: View): Int {
        val widthSpec = View.MeasureSpec.makeMeasureSpec(
            resources.displayMetrics.widthPixels, View.MeasureSpec.EXACTLY)
        val heightSpec = View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
        view.measure(widthSpec, heightSpec)
        return view.measuredHeight.coerceAtLeast(1)
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
                // Tamanhos das páginas (p/ o adapter dimensionar cada item).
                val sizes = withContext(Dispatchers.IO) {
                    val r = renderer ?: return@withContext emptyList<Pair<Int, Int>>()
                    (0 until pageCount).map { i ->
                        val p = r.openPage(i)
                        val s = p.width to p.height
                        p.close()
                        s
                    }
                }
                pageAdapter = PdfPageAdapter(sizes)
                binding.pdfPages.adapter = pageAdapter
                binding.pdfPages.scrollToPosition(currentPage)
                updatePageUi()
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

    /** Atualiza rótulo/botões/zoom para a página atual (sem re-renderizar). */
    private fun updatePageUi() {
        binding.pageLabel.text = "Página ${currentPage + 1} de $pageCount"
        binding.zoomLabel.text = "${(zooms[zoomIdx] * 100).toInt()}%"
        binding.btnPrevPage.isEnabled = currentPage > 0
        binding.btnNextPage.isEnabled = currentPage < pageCount - 1
    }

    private fun goToPage(page: Int) {
        if (page in 0 until pageCount) {
            currentPage = page
            // Salto curto: suave; salto longo: direto (evita atravessar o doc).
            val first = layoutManager?.findFirstVisibleItemPosition() ?: page
            if (kotlin.math.abs(page - first) <= 2) {
                binding.pdfPages.smoothScrollToPosition(page)
            } else {
                binding.pdfPages.scrollToPosition(page)
            }
            updatePageUi()
            SessionManager.get(this).savePdfPage(docPath, currentPage)
        }
    }

    private fun setZoom(idx: Int) {
        val next = idx.coerceIn(0, zooms.lastIndex)
        if (next == zoomIdx) return
        zoomIdx = next
        // Desanexar antes de limpar o cache: nenhum holder desenha
        // enquanto os bitmaps antigos saem (nunca reciclar à mão).
        binding.pdfPages.adapter = null
        pageAdapter?.clearCache()
        binding.pdfPages.adapter = pageAdapter
        pageAdapter?.notifyDataSetChanged()
        binding.pdfPages.scrollToPosition(currentPage)
        updatePageUi()
    }

    private fun showGoToPageDialog() {
        val input = EditText(this).apply {
            inputType = android.text.InputType.TYPE_CLASS_NUMBER
            setText((currentPage + 1).toString())
            setSelection(text.length)
        }
        // Frente R5B — guarda a referência: enquanto estiver aberto o
        // auto-hide fica suprimido (ver isChromeSuppressed); ao fechar
        // rearma o temporizador.
        goToPageDialog = AlertDialog.Builder(this)
            .setTitle("Ir para a página (1–$pageCount)")
            .setView(input)
            .setPositiveButton("Ir") { _, _ ->
                val page = input.text.toString().toIntOrNull()?.minus(1)
                if (page != null) goToPage(page)
            }
            .setNegativeButton("Cancelar", null)
            .setOnDismissListener {
                goToPageDialog = null
                scheduleChromeHide()
            }
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


    // ── FRENTE K — PONTO DE ENTREGA PARA A FRENTE J ─────────────
    //
    // A Frente J (botao "Gerar resumo" no leitor) GERA o resumo, as
    // pilulas e as questoes deste PDF; a Frente K GUARDA-os. A J chama
    // [saveGeneratedMaterials] com o que gerou (tudo o que existir;
    // null/blank = nao gerado) e esta frente grava os tres na pasta
    // de materiais da aula a que o PDF pertence — o MESMO caminho
    // partilhado dos videos (POST /api/materials/save-in-folder,
    // `.gdi-resumos/` / `.gdi-flashcards/` / `.gdi-questoess/`),
    // via [MaterialSaver]. Nada fica so no aparelho: o servidor/
    // Drive e a fonte partilhada entre aparelhos/alunos.
    //
    // `docPath` e o path COMPLETO do PDF (ex. "/11:/Curso/Aula 01/
    // Aula 01.pdf"): o worker resolve a pasta PAI como a pasta da
    // aula. `questionsJson` e o JSON das questoes (array, como o
    // cache ISA as devolve); se a J tiver so texto, passa o texto.
    // Best-effort e silencioso: devolve o que foi gravado; a UI da
    // J decide o que mostrar. NAO chamar antes de a J gerar — sem
    // conteudo nao ha nada a guardar.
    suspend fun saveGeneratedMaterials(
        summary: String?,
        pills: String?,
        questionsJson: String?
    ): MaterialSaver.SaveReport {
        val lessonName = docName
            .removeSuffix(".pdf").removeSuffix(".PDF")
            .ifBlank { "Aula" }
        return MaterialSaver.saveGenerated(
            this, docPath, lessonName, summary, pills, questionsJson
        )
    }

    private fun sharePdf() {
        val file = pdfFile ?: return
        try {
            val uri = FileProvider.getUriForFile(
                this, "com.meggy.app.fileprovider", file
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

    /**
     * Adapter do scroll contínuo (Frente I). Cada página é renderizada
     * sob demanda com PdfRenderer, numa thread de IO, serializada por
     * Mutex (o PdfRenderer não é thread-safe). Cache LRU de 48 MB;
     * pré-render da página seguinte para o scroll não tropeçar.
     */
    private inner class PdfPageAdapter(
        private val pageSizes: List<Pair<Int, Int>>,
    ) : RecyclerView.Adapter<PdfPageAdapter.PageViewHolder>() {

        private val renderMutex = Mutex()
        private val pageCache = object : LruCache<Int, Bitmap>(48 * 1024) {
            override fun sizeOf(key: Int, bitmap: Bitmap): Int = bitmap.byteCount / 1024
        }

        inner class PageViewHolder(val itemBinding: ItemPdfPageBinding) :
            RecyclerView.ViewHolder(itemBinding.root)

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): PageViewHolder {
            val itemBinding = ItemPdfPageBinding.inflate(
                LayoutInflater.from(parent.context), parent, false
            )
            return PageViewHolder(itemBinding)
        }

        override fun getItemCount(): Int = pageCount

        override fun onBindViewHolder(holder: PageViewHolder, position: Int) {
            val (pw, ph) = pageSizes.getOrNull(position) ?: (1 to 1)
            val viewW = targetViewWidthPx()
            val viewH = (viewW * ph / pw.toFloat()).toInt().coerceAtLeast(1)
            holder.itemBinding.pageImage.layoutParams =
                holder.itemBinding.pageImage.layoutParams.apply {
                    width = viewW
                    height = viewH
                }
            holder.itemBinding.pageImage.setImageBitmap(null)
            val cached = pageCache.get(position)
            if (cached != null) {
                holder.itemBinding.pageImage.setImageBitmap(cached)
            } else {
                renderPageInto(holder, position)
            }
            // Pré-render da próxima página para o scroll não tropeçar.
            if (position + 1 < pageCount && pageCache.get(position + 1) == null) {
                lifecycleScope.launch(Dispatchers.IO) { renderBitmap(position + 1) }
            }
        }

        override fun onViewRecycled(holder: PageViewHolder) {
            holder.itemBinding.pageImage.setImageBitmap(null)
        }

        private fun renderPageInto(holder: PageViewHolder, position: Int) {
            lifecycleScope.launch(Dispatchers.IO) {
                val bitmap = renderBitmap(position) ?: return@launch
                withContext(Dispatchers.Main) {
                    // Só aplica se o holder ainda mostra esta página.
                    if (holder.bindingAdapterPosition == position) {
                        holder.itemBinding.pageImage.setImageBitmap(bitmap)
                    }
                }
            }
        }

        /** Largura do item em px: largura útil do ecrã × zoom. */
        private fun targetViewWidthPx(): Int {
            val marginPx = (16 * resources.displayMetrics.density).toInt()
            val avail = (resources.displayMetrics.widthPixels - marginPx).coerceAtLeast(1)
            return (avail * zooms[zoomIdx]).toInt().coerceAtLeast(1)
        }

        /** Renderiza (e guarda em cache) a página; null se falhar. */
        private suspend fun renderBitmap(position: Int): Bitmap? {
            pageCache.get(position)?.let { return it }
            val r = renderer ?: return null
            if (position !in 0 until pageCount) return null
            return renderMutex.withLock {
                pageCache.get(position)?.let { return@withLock it }
                try {
                    val page = r.openPage(position)
                    // Supersampling 1.5x para nitidez, com teto p/ memória.
                    var scale = targetViewWidthPx() * 1.5f / page.width
                    if (page.width * scale > 1600) scale = 1600 / page.width.toFloat()
                    if (page.height * scale > 2400) scale = 2400 / page.height.toFloat()
                    val width = (page.width * scale).toInt().coerceAtLeast(1)
                    val height = (page.height * scale).toInt().coerceAtLeast(1)
                    // Frente G (port p/ o leitor novo da Frente I): o teto
                    // de pixels ja existe (1600x2400), mas sem este catch
                    // um OOM rebentava a coroutine — catch (Exception)
                    // nao apanha Error. Fecha a pagina e limpa o cache.
                    val bitmap = try {
                        Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                    } catch (_: OutOfMemoryError) {
                        page.close()
                        pageCache.evictAll()
                        return@withLock null
                    }
                    bitmap.eraseColor(android.graphics.Color.WHITE)
                    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    page.close()
                    pageCache.put(position, bitmap)
                    bitmap
                } catch (_: Exception) {
                    null
                }
            }
        }

        fun clearCache() {
            pageCache.evictAll()
        }

        fun release() {
            pageCache.evictAll()
        }
    }

    override fun onPause() {
        super.onPause()
        // Frente R5B — sem hide enquanto a Activity não está visível.
        chromeHandler.removeCallbacks(hideChromeRunnable)
        SessionManager.get(this).savePdfPage(docPath, currentPage)
    }

    override fun onDestroy() {
        super.onDestroy()
        // Frente R5B — sem callbacks nem animações pendentes.
        chromeHandler.removeCallbacks(hideChromeRunnable)
        chromeBarAnims.values.forEach { it.cancel() }
        chromeBarAnims.clear()
        summaryJob?.cancel()
        summaryDialog?.dismiss()
        pageAdapter?.release()
        try { renderer?.close() } catch (_: Exception) {}
    }

    // ───────── Frente J — resumo do PDF pela Meggy ─────────
    //
    // Fluxo (tudo em endpoints que JÁ existem no worker — nada
    // inventado; ver AiService, secção "Frente J"):
    //   1. resumo guardado? cache ISA (GET /api/ai/summaries, chave
    //      "<pastaDaAula>/<nomeDoPdf>") e pasta de materiais
    //      (GET /api/materials/load-from-folder) — se há, mostra sem
    //      gerar de novo;
    //   2. senão, texto do PDF: o que o leitor já extraiu (pdfbox,
    //      pageTexts); sem camada de texto, OCR de até 4 páginas
    //      (POST /api/ai/ocr) a partir das páginas renderizadas;
    //   3. POST /api/ai {kind:"resumo"} com o prompt rico da web
    //      (PROMPTS_RESUMO nível 7, gdi-meggy.js:1218) + até 20.000
    //      chars do texto — resposta síncrona com o resumo;
    //   4. guarda best-effort: cache ISA (POST /api/ai/summaries,
    //      mesma chave do passo 1) + pasta `.gdi-resumos/` da aula
    //      (POST /api/materials/save-in-folder, via
    //      AiService.saveToFolder). PONTO DE ENTREGA p/ a Frente K:
    //      a gravação na pasta de materiais JÁ existe aqui; a K é
    //      dona de a listar/mostrar — NÃO duplicar a gravação.
    // A navegação do leitor (Frente I) NÃO é tocada: o único toque
    // no layout é o botão btnSummary na toolbar; o diálogo do resumo
    // é construído em código (sem novo layout). Se o utilizador
    // fechar o diálogo a meio da geração, o job continua em segundo
    // plano e o resultado fica em pdfSummary (mostrado no próximo
    // toque no botão) — o cancelamento só acontece no onDestroy.

    /** Pasta da aula = pasta-mãe do PDF (o docPath é ".../Aula/ficheiro.pdf"). */
    private fun lessonFolderPath(): String = LessonDescription.parentPath(docPath)

    /** Nome da pasta da aula (último segmento da pasta-mãe). */
    private fun lessonFolderName(): String =
        lessonFolderPath().trimEnd('/').substringAfterLast('/').ifBlank { docName }

    /** Chave do cache ISA para este PDF ("<pastaDaAula>/<nomeDoPdf>"). */
    private fun summaryCacheKey(): String = "${lessonFolderPath().trimEnd('/')}/$docName"

    private fun onSummaryClicked() {
        if (pdfSummary != null) {
            openSummaryDialog()
            showSummaryReady(pdfSummary!!, getString(R.string.pdf_summary_cached))
            return
        }
        openSummaryDialog()
        setSummaryLoading(getString(R.string.pdf_summary_searching_saved))
        summaryJob?.cancel()
        summaryJob = lifecycleScope.launch {
            // Frente R5A — retry explícito do utilizador: este toque
            // em "✨ Resumo" (ou "Gerar novamente") limpa o latch
            // ANTES de procurar o resumo guardado, para a procura e
            // a geração voltarem a tentar de facto. Sem isto, um 404
            // de `load-from-folder` (ficheiro em falta) de uma
            // tentativa anterior deixava a flag armada e o POST
            // /api/ai nunca era tentado nesta sessão. A flag volta a
            // armar-se se um 404 genuíno de rota de IA voltar — o
            // cheque abaixo continua a mostrar "indisponível" nesse
            // caso, sem loop (uma tentativa por toque).
            AiService.clearBackendUnavailable()
            // 1) Resumo já guardado? (cache ISA + pasta de materiais)
            val cached = findSavedSummary()
            if (cached != null) {
                pdfSummary = cached
                showSummaryReady(cached, getString(R.string.pdf_summary_cached))
                return@launch
            }
            if (AiService.backendUnavailable) {
                showSummaryError(getString(R.string.pdf_summary_unavailable))
                return@launch
            }
            // 2) Texto-fonte (Frente R5A2: MD primeiro, senão PDF; senão OCR).
            setSummaryLoading(getString(R.string.pdf_summary_extracting))
            val source = resolveSummarySource()
            if (source == null) {
                showSummaryError(getString(R.string.pdf_summary_no_text))
                return@launch
            }
            // 3) Geração no servidor (POST /api/ai, kind "resumo").
            setSummaryLoading(getString(R.string.pdf_summary_generating))
            when (val result = AiService.generatePdfSummary(this@PdfReaderActivity, summaryPrompt(source.text))) {
                is AiService.PdfSummaryResult.Ok -> showGeneratedSummary(result.text)
                AiService.PdfSummaryResult.Unavailable ->
                    showSummaryError(getString(R.string.pdf_summary_unavailable))
                AiService.PdfSummaryResult.RateLimited ->
                    showSummaryError(getString(R.string.pdf_summary_rate_limited))
                AiService.PdfSummaryResult.Failed -> {
                    // Frente R5A2 — fallback entre endpoints (regra do
                    // Elton 17:43): o POST /api/ai falhou — tenta o
                    // batalhão com o MESMO texto-fonte antes de
                    // declarar erro. Só se o batalhão também falhar é
                    // que se mostra a falha (nunca "indisponível"
                    // enquanto houver outro endpoint por tentar).
                    setSummaryLoading(getString(R.string.pdf_summary_generating_fallback))
                    when (val fb = generateViaBattalion(source)) {
                        is AiService.PdfSummaryResult.Ok -> showGeneratedSummary(fb.text)
                        AiService.PdfSummaryResult.Unavailable ->
                            showSummaryError(getString(R.string.pdf_summary_unavailable))
                        AiService.PdfSummaryResult.RateLimited ->
                            showSummaryError(getString(R.string.pdf_summary_rate_limited))
                        AiService.PdfSummaryResult.Failed ->
                            showSummaryError(getString(R.string.pdf_summary_failed))
                    }
                }
            }
        }
    }

    /** Procura um resumo já guardado (ISA + pasta de materiais). */
    private suspend fun findSavedSummary(): String? {
        val folder = lessonFolderPath().trimEnd('/')
        val keys = listOf(
            summaryCacheKey(),
            "${LessonDescription.parentPath(folder)}/$docName"
        ).distinct()
        for (key in keys) {
            val s = AiService.getSummary(this, key)
            if (!s.isNullOrBlank()) return s
        }
        return AiService.loadFromFolder(this, docPath, "resumo")
    }

    /** Fonte do resumo: nome do material + texto. Nunca o vídeo. */
    private data class PdfSummarySource(val name: String, val text: String)

    /**
     * Texto-fonte do resumo, na prioridade do Elton (17:43):
     *   1. transcrição em MD da pasta da aula (via
     *      LessonDescription.resolveSourceText — MD primeiro, senão
     *      PDF; nunca o vídeo);
     *   2. texto do próprio PDF, já extraído pelo leitor (mesmo
     *      conteúdo que a fonte PDF do resolveSourceText, sem novo
     *      download);
     *   3. OCR das primeiras páginas (PDF escaneado).
     * Sem fonte legível → null.
     */
    private suspend fun resolveSummarySource(): PdfSummarySource? {
        // 1) MD da pasta da aula primeiro (falha de rede ao listar →
        //    segue como antes, sem bloquear a geração).
        val files = runCatching {
            ApiService(this).listFolder(lessonFolderPath())
        }.getOrNull()
        if (files != null) {
            val (source, _) = LessonDescription.resolveSourceText(this, files)
            if (source != null) {
                if (source.name.endsWith(".pdf", ignoreCase = true)) {
                    // Fonte é o PDF: prefere o texto já extraído pelo
                    // leitor (mesmo conteúdo); se a extração ainda não
                    // acabou, usa o texto do resolveSourceText.
                    val extracted = pageTexts?.joinToString("\n").orEmpty()
                    if (extracted.count { !it.isWhitespace() } >= SUMMARY_MIN_READABLE_CHARS) {
                        return PdfSummarySource(docName, extracted.take(SUMMARY_MAX_TEXT_CHARS))
                    }
                    return PdfSummarySource(source.name, source.text)
                }
                return PdfSummarySource(source.name, source.text)
            }
            // Sem fonte (PDF escaneado / sem ficheiros) → OCR abaixo.
        }
        // 2) Texto do próprio PDF (extraído em 2º plano; espera até 10 s).
        var waited = 0
        while (pageTexts == null && waited < 10_000) {
            delay(250)
            waited += 250
        }
        val extracted = pageTexts?.joinToString("\n").orEmpty()
        if (extracted.count { !it.isWhitespace() } >= SUMMARY_MIN_READABLE_CHARS) {
            return PdfSummarySource(docName, extracted.take(SUMMARY_MAX_TEXT_CHARS))
        }
        // 3) Sem camada de texto → OCR das primeiras páginas.
        val ocr = ocrPdfText() ?: return null
        return PdfSummarySource(docName, ocr)
    }

    /** Mostra o resumo gerado e guarda-o (ISA + pasta de materiais). */
    private suspend fun showGeneratedSummary(text: String) {
        pdfSummary = text
        // Guarda best-effort (ISA + pasta de materiais).
        val key = summaryCacheKey()
        val savedIsa = AiService.saveSummary(
            this@PdfReaderActivity, key, text, lessonFolderName()
        )
        // Frente K — a gravação na pasta de materiais passa pelo
        // caminho único (saveGeneratedMaterials -> MaterialSaver):
        // resumo + pílulas + questões que já existam no ISA p/ esta
        // chave (a J gera só o resumo; o resto vem do cache quando
        // existir).
        val bundle = AiService.getGeneratedBundle(this@PdfReaderActivity, key)
        val report = saveGeneratedMaterials(
            text, bundle?.mindmap, bundle?.questionsJson
        )
        val note = if (savedIsa || report.anySaved) getString(R.string.pdf_summary_saved)
            else getString(R.string.pdf_summary_save_failed)
        showSummaryReady(text, note)
    }

    /**
     * Geração de recurso via batalhão (POST /api/ai/battalion) com o
     * mesmo texto-fonte do primário + poll limitado do cache ISA
     * (mesmos limites do detalhe da aula). O job continua no servidor
     * mesmo que o utilizador feche o diálogo — o próximo toque lê o
     * resumo guardado (findSavedSummary).
     */
    private suspend fun generateViaBattalion(source: PdfSummarySource): AiService.PdfSummaryResult {
        val key = summaryCacheKey()
        val folder = lessonFolderPath()
        when (AiService.startBattalion(
            this, folder, folder, lessonFolderName(),
            listOf(AiService.BattalionPdf(source.name, "", source.text))
        )) {
            AiService.TriggerResult.UNAVAILABLE -> return AiService.PdfSummaryResult.Unavailable
            AiService.TriggerResult.FAILED -> return AiService.PdfSummaryResult.Failed
            AiService.TriggerResult.ALREADY_DONE -> {
                val again = AiService.getSummary(this, key)
                return if (!again.isNullOrBlank()) AiService.PdfSummaryResult.Ok(again)
                    else AiService.PdfSummaryResult.Failed
            }
            AiService.TriggerResult.RUNNING, AiService.TriggerResult.STARTED -> {
                repeat(LessonDescription.DETAIL_POLL_ATTEMPTS) {
                    delay(LessonDescription.POLL_DELAY_MS)
                    val found = AiService.getSummary(this, key)
                    if (!found.isNullOrBlank()) return AiService.PdfSummaryResult.Ok(found)
                    val status = AiService.getBattalionStatus(this, folder)
                    if (status?.job?.done == true) {
                        val last = AiService.getSummary(this, key)
                        return if (!last.isNullOrBlank()) AiService.PdfSummaryResult.Ok(last)
                            else AiService.PdfSummaryResult.Failed
                    }
                    if (AiService.backendUnavailable) return AiService.PdfSummaryResult.Unavailable
                }
                return AiService.PdfSummaryResult.Failed
            }
        }
    }

    /** Lê até SUMMARY_MAX_OCR_PAGES páginas por OCR (POST /api/ai/ocr). */
    private suspend fun ocrPdfText(): String? {
        val r = renderer ?: return null
        if (pageCount <= 0) return null
        val pages = minOf(pageCount, SUMMARY_MAX_OCR_PAGES)
        val sb = StringBuilder()
        for (i in 0 until pages) {
            setSummaryLoading(getString(R.string.pdf_summary_ocr, i + 1, pages))
            val b64 = renderPageForOcr(r, i) ?: continue
            val text = AiService.ocrPageImage(this, b64, i + 1, pageCount)
            if (!text.isNullOrBlank()) sb.append(text).append('\n')
            if (sb.length >= SUMMARY_MAX_TEXT_CHARS) break
        }
        val out = sb.toString()
        return out.take(SUMMARY_MAX_TEXT_CHARS)
            .takeIf { it.count { c -> !c.isWhitespace() } >= SUMMARY_MIN_READABLE_CHARS }
    }

    /** Renderiza a página para JPEG base64 (OCR) — ~1000 px de largura. */
    private fun renderPageForOcr(r: PdfRenderer, pageIndex: Int): String? {
        return try {
            val page = r.openPage(pageIndex)
            val scale = 1000f / page.width.toFloat()
            val width = (page.width * scale).toInt().coerceAtLeast(1)
            val height = (page.height * scale).toInt().coerceAtLeast(1)
            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            bitmap.eraseColor(android.graphics.Color.WHITE)
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            page.close()
            val out = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, 70, out)
            bitmap.recycle()
            Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Prompt rico da web (PROMPTS_RESUMO nível 7, gdi-meggy.js:1218)
     * + até 20.000 chars do texto do PDF.
     */
    private fun summaryPrompt(text: String): String {
        return "Você é um professor especialista em concursos públicos. Leia TODO o material abaixo e crie um RESUMO PROFUNDO E DETALHADO em Markdown.\n\n" +
            "REQUISITOS:\n" +
            "- Estruture com ## títulos e ### subtítulos\n" +
            "- Para CADA tópico: explique o conceito, dê EXEMPLOS práticos\n" +
            "- Use **negrito** para palavras-chave e dispositivos legais\n" +
            "- Inclua uma seção ## Pegadinhas de Prova no final\n" +
            "- Inclua uma seção ## Resumo Rápido com 5-10 bullets\n\n" +
            "Material:\n" + text.take(SUMMARY_MAX_TEXT_CHARS)
    }

    /** Abre (ou reabre) o diálogo do resumo. Construído em código. */
    private fun openSummaryDialog() {
        if (summaryDialog?.isShowing == true) return
        val ctx = this
        val status = TextView(ctx).apply {
            textSize = 15f
            setTextColor(ContextCompat.getColor(ctx, R.color.md_on_surface))
            setPadding(8, 8, 8, 8)
        }
        val progress = ProgressBar(ctx).apply {
            isIndeterminate = true
            setPadding(8, 8, 8, 8)
        }
        val text = TextView(ctx).apply {
            textSize = 15f
            setTextColor(ContextCompat.getColor(ctx, R.color.md_on_surface))
            setTextIsSelectable(true)
            setPadding(8, 8, 8, 8)
            visibility = View.GONE
        }
        val scroll = ScrollView(ctx).apply {
            addView(text)
            visibility = View.GONE
        }
        val layout = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 16, 48, 16)
            addView(status)
            addView(progress)
            addView(scroll)
        }
        summaryStatusView = status
        summaryProgressView = progress
        summaryTextView = text
        summaryScrollView = scroll
        summaryDialog = AlertDialog.Builder(ctx)
            .setTitle(getString(R.string.pdf_summary_title))
            .setView(layout)
            .setPositiveButton(R.string.pdf_summary_close, null)
            // Frente R5B — fechar o diálogo rearma o temporizador.
            .setOnDismissListener { scheduleChromeHide() }
            .setNeutralButton(R.string.pdf_summary_regenerate) { _, _ ->
                pdfSummary = null
                // Fecha o diálogo atual ANTES de gerar de novo: sem
                // isto o openSummaryDialog() veria o diálogo antigo
                // ainda visível e o novo progresso nunca aparecia.
                summaryDialog?.dismiss()
                onSummaryClicked()
            }
            .show()
    }

    private fun setSummaryLoading(status: String) {
        if (summaryDialog?.isShowing != true) return
        summaryStatusView?.text = status
        summaryStatusView?.visibility = View.VISIBLE
        summaryProgressView?.visibility = View.VISIBLE
        summaryScrollView?.visibility = View.GONE
    }

    private fun showSummaryReady(summary: String, note: String) {
        if (summaryDialog?.isShowing != true) return
        summaryStatusView?.text = note
        summaryStatusView?.visibility = if (note.isBlank()) View.GONE else View.VISIBLE
        summaryProgressView?.visibility = View.GONE
        summaryTextView?.text = summary
        summaryScrollView?.visibility = View.VISIBLE
    }

    private fun showSummaryError(message: String) {
        if (summaryDialog?.isShowing != true) return
        summaryStatusView?.text = message
        summaryStatusView?.visibility = View.VISIBLE
        summaryProgressView?.visibility = View.GONE
        summaryScrollView?.visibility = View.GONE
    }
}
