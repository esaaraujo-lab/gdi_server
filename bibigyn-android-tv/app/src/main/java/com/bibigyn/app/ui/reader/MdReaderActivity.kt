package com.bibigyn.app.ui.reader

import android.os.Bundle
import android.text.method.LinkMovementMethod
import android.util.TypedValue
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.bibigyn.app.R
import com.bibigyn.app.databinding.ActivityMdReaderBinding
import com.bibigyn.app.ui.home.HomeActivity
import com.bibigyn.app.ui.mylist.MyListActivity
import com.bibigyn.app.ui.search.SearchActivity
import com.bibigyn.app.ui.settings.SettingsActivity
import com.bibigyn.app.util.FileDownloader
import com.bibigyn.app.util.SessionManager
import com.bibigyn.app.util.TvUtils
import io.noties.markwon.Markwon
import io.noties.markwon.ext.strikethrough.StrikethroughPlugin
import io.noties.markwon.ext.tables.TablePlugin
import io.noties.markwon.AbstractMarkwonPlugin
import io.noties.markwon.core.MarkwonTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import android.content.Intent

/**
 * v2.1.5 — Leitor de Markdown (conceito leitor-md).
 *
 * Renderização de verdade com Markwon (core + tabelas + tachado):
 * H1–H3, negrito/itálico, listas, tabelas (rolagem horizontal),
 * blocos de código (monoespaçado + fundo distinto), citações (borda
 * rosa à esquerda), links clicáveis (abrem o destino real). Nunca
 * mostra o texto cru com # e *.
 *
 * A−/A+ mudam o tamanho da fonte de verdade (pref mdFontScale,
 * passos ×1.15, 0.7–2.0, re-renderiza). Bookmark salva o documento
 * (Minha lista → Documentos marcados). Vale para os .md da pasta da
 * aula — INCLUINDO as transcrições .md (fonte dos resumos).
 * TV: texto legível, D-pad rola o conteúdo.
 */
class MdReaderActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_URL = "md_url"
        const val EXTRA_NAME = "md_name"
        const val EXTRA_PATH = "md_path"
    }

    private lateinit var binding: ActivityMdReaderBinding
    private var docPath: String = ""
    private var docName: String = "Documento"
    private var markdown: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMdReaderBinding.inflate(layoutInflater)
        setContentView(binding.root)

        docName = intent.getStringExtra(EXTRA_NAME) ?: "Documento"
        docPath = intent.getStringExtra(EXTRA_PATH) ?: docName
        val url = intent.getStringExtra(EXTRA_URL) ?: ""

        binding.toolbar.title = docName
        binding.toolbar.setNavigationOnClickListener { finish() }
        if (TvUtils.isTv(this)) {
            binding.bottomNav.visibility = View.GONE
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

        binding.mdContent.movementMethod = LinkMovementMethod.getInstance()
        binding.btnFontDown.setOnClickListener { changeFontSize(1f / 1.15f) }
        binding.btnFontUp.setOnClickListener { changeFontSize(1.15f) }
        updateBookmarkButton()
        binding.btnBookmark.setOnClickListener {
            val added = SessionManager.get(this).toggleBookmark(docPath, docName, "md")
            updateBookmarkButton()
            Toast.makeText(this,
                if (added) "🔖 Documento marcado" else "Marcador removido",
                Toast.LENGTH_SHORT).show()
        }

        loadMarkdown(url)
    }

    private fun updateBookmarkButton() {
        val marked = SessionManager.get(this).isBookmarked(docPath)
        binding.btnBookmark.text = if (marked) "🔖" else "☆"
    }

    private fun changeFontSize(factor: Float) {
        val sm = SessionManager.get(this)
        sm.mdFontScale = sm.mdFontScale * factor
        renderMarkdown()
    }

    private fun loadMarkdown(url: String) {
        binding.loadingView.visibility = View.VISIBLE
        binding.errorView.visibility = View.GONE
        lifecycleScope.launch {
            val text = withContext(Dispatchers.IO) {
                FileDownloader.downloadText(this@MdReaderActivity, url)
            }
            binding.loadingView.visibility = View.GONE
            if (text.isNullOrBlank()) {
                binding.errorView.visibility = View.VISIBLE
                binding.errorView.text = "Não foi possível carregar o documento."
                return@launch
            }
            markdown = text
            renderMarkdown()
        }
    }

    private fun renderMarkdown() {
        val text = markdown ?: return
        val scale = SessionManager.get(this).mdFontScale
        binding.mdContent.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f * scale)

        val pink = ContextCompat.getColor(this, R.color.md_primary)
        val codeBg = ContextCompat.getColor(this, R.color.md_surface_container)
        val markwon = Markwon.builder(this)
            .usePlugin(TablePlugin.create(this))
            .usePlugin(StrikethroughPlugin.create())
            .usePlugin(object : AbstractMarkwonPlugin() {
                override fun configureTheme(builder: MarkwonTheme.Builder) {
                    builder
                        .linkColor(pink)
                        .codeBackgroundColor(codeBg)
                        .codeTextColor(ContextCompat.getColor(this@MdReaderActivity, R.color.md_on_surface))
                        .blockQuoteColor(pink)
                        .blockQuoteWidth((8 * resources.displayMetrics.density).toInt())
                        .listItemColor(pink)
                }
            })
            .build()
        markwon.setMarkdown(binding.mdContent, text)
    }
}
