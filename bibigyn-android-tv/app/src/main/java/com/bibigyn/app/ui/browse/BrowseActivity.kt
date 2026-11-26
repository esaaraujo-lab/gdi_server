package com.bibigyn.app.ui.browse

import android.content.Intent
import android.graphics.Rect
import android.net.Uri
import android.os.Bundle
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.bibigyn.app.BiBiGynApp
import com.bibigyn.app.R
import com.bibigyn.app.data.ApiService
import com.bibigyn.app.data.FolderResult
import com.bibigyn.app.data.FileItem
import com.bibigyn.app.databinding.ActivityBrowseBinding
import com.bibigyn.app.ui.detail.LessonGroup
import com.bibigyn.app.ui.detail.folderTileProgress
import com.bibigyn.app.ui.player.PlayerActivity
import com.bibigyn.app.ui.search.SearchActivity
import com.bibigyn.app.util.AuthHelper
import com.bibigyn.app.util.PlaylistManager
import com.bibigyn.app.util.SessionManager
import com.bibigyn.app.util.TapFeedback
import com.bibigyn.app.util.TvUtils
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class BrowseActivity : AppCompatActivity() {

    private lateinit var binding: ActivityBrowseBinding
    private lateinit var api: ApiService
    private var currentPath: String = "/"
    private var folderName: String = "Browse"
    private var fileAdapter: FileAdapter? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityBrowseBinding.inflate(layoutInflater)
        setContentView(binding.root)

        api = ApiService(this)
        currentPath = intent.getStringExtra("drivePath") ?: "/"
        folderName = intent.getStringExtra("folderName") ?: "Browse"

        // ★ v1.8.0: toolbar title + pink chevron breadcrumb.
        binding.toolbar.title = folderName
        binding.toolbar.setNavigationOnClickListener { finish() }
        binding.breadcrumb.text = buildBreadcrumb(currentPath, folderName)
        // ★ v2.1.3: necessário para os ClickableSpans do breadcrumb.
        binding.breadcrumb.movementMethod = android.text.method.LinkMovementMethod.getInstance()
        binding.breadcrumb.highlightColor = android.graphics.Color.TRANSPARENT

        // v2.1.44 — rail lateral da TV (porte da Meggy 2.7.58).
        com.bibigyn.app.ui.home.TvRailHost.attach(
            this,
            findViewById(R.id.tvSideMenu),
            findViewById(R.id.browseContent),
            com.bibigyn.app.ui.home.SideMenuView.MenuItem.DRIVES,
            firstContentId = R.id.recycler
        )

        val spanCount = calculateSpanCount()
        val layoutManager = GridLayoutManager(this, spanCount)
        binding.recycler.layoutManager = layoutManager
        binding.recycler.addItemDecoration(GridGutterDecoration(10))

        // v2.1.41 — TV: entrada de busca (a MESMA SearchActivity de
        // todo o app) + dicas do comando no rodapé + respiro lateral
        // de overscan na grade (56dp). No celular as vistas novas
        // ficam gone e nada muda.
        if (TvUtils.isTv(this)) {
            binding.browseSearch.visibility = View.VISIBLE
            binding.browseTvHint.visibility = View.VISIBLE
            binding.browseSearch.setOnClickListener {
                startActivity(Intent(this, SearchActivity::class.java))
            }
            val sidePx = (56 * resources.displayMetrics.density).toInt()
            binding.recycler.setPadding(
                sidePx, binding.recycler.paddingTop,
                sidePx, binding.recycler.paddingBottom
            )
        }

        binding.retryButton?.setOnClickListener { loadFolder() }

        loadFolder()
    }

    // ★ v2.1.3: breadcrumb clicável — cada segmento volta para aquela pasta.
    private fun buildBreadcrumb(path: String, displayName: String): CharSequence {
        val pinkColor = ForegroundColorSpan(0xFFFF8B9F.toInt())
        val grayColor = ForegroundColorSpan(0xFF8B949E.toInt())
        val sb = SpannableStringBuilder()
        val rootStart = sb.length
        sb.append("BiBi Fit", grayColor, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        sb.setSpan(breadcrumbSpan("/"), rootStart, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        val segments = path.trim('/').split('/').filter { it.isNotBlank() }
        var acc = "/"
        for ((idx, seg) in segments.withIndex()) {
            sb.append("  ›  ", pinkColor, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            val label = if (seg.matches(Regex("^\\d+:$"))) displayName else seg
            acc = if (acc.endsWith("/")) "$acc$seg/" else "$acc/$seg/"
            val start = sb.length
            sb.append(label, grayColor, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            // O último segmento é a pasta atual — não é clicável.
            if (idx < segments.size - 1) {
                sb.setSpan(breadcrumbSpan(acc), start, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            }
        }
        return sb
    }

    /** ClickableSpan que navega para o caminho acumulado (sem empilhar telas). */
    private fun breadcrumbSpan(targetPath: String) = object : android.text.style.ClickableSpan() {
        override fun onClick(widget: View) {
            currentPath = targetPath
            folderName = if (targetPath == "/") "Browse" else targetPath.trim('/').split('/').last()
            binding.toolbar.title = folderName
            binding.breadcrumb.text = buildBreadcrumb(currentPath, folderName)
            loadFolder()
        }
        override fun updateDrawState(ds: android.text.TextPaint) {
            super.updateDrawState(ds)
            ds.isUnderlineText = false
        }
    }

    private fun calculateSpanCount(): Int {
        // v2.1.41 — na TV a grade é de 5 colunas (conceito aprovado),
        // independentemente da largura reportada; fora da TV, a
        // regra por largura de sempre (o celular não muda).
        if (TvUtils.isTv(this)) return 5
        val displayMetrics = resources.displayMetrics
        val screenWidthDp = displayMetrics.widthPixels / displayMetrics.density
        return if (screenWidthDp >= 900) 5 else if (screenWidthDp >= 600) 4 else 2
    }

    private fun loadFolder() {
        binding.loadingView.visibility = View.VISIBLE
        binding.errorState?.visibility = View.GONE
        binding.emptyState.visibility = View.GONE

        lifecycleScope.launch {
            // R19B (P1+P2): o listFolder agora distingue sessão
            // expirada de falha transitória. Transitória mostra o
            // erro com "Tentar de novo" e NUNCA faz bounce;
            // expirada tenta o re-login silencioso uma vez e só
            // faz bounce se ele falhar.
            val result = withContext(Dispatchers.IO) {
                AuthHelper.listFolderWithRelogin(api, currentPath)
            }
            binding.loadingView.visibility = View.GONE

            if (result is FolderResult.SessionExpired) {
                AuthHelper.bounceToLogin(this@BrowseActivity)
                return@launch
            }
            if (result is FolderResult.Transient) {
                // Falha transitória: fica na Browse, mostra o erro
                // com o botão "Tentar de novo" — nunca o bounce.
                binding.errorText?.text = "Não foi possível carregar esta pasta. Verifique a conexão e toque em \"Tentar de novo\"."
                binding.errorState?.visibility = View.VISIBLE
                return@launch
            }
            val files = (result as FolderResult.Ok).files

            val adapter = FileAdapter(
                onFolder = { file -> openFolder(file) },
                onFile = { file -> openFile(file) }
            )
            fileAdapter = adapter
            adapter.setFolderPath(currentPath)
            binding.recycler.adapter = adapter

            if (files.isEmpty()) {
                // ★ v2.1.3: pasta vazia é SUCESSO com 0 arquivos — mostra só
                // o empty state (antes mostrava erro + vazio ao mesmo tempo).
                binding.errorState?.visibility = View.GONE
                binding.emptyState.visibility = View.VISIBLE
                adapter.submitList(emptyList())
            } else {
                // Port R27 da Meggy (B10/B13) — as pastas entram com o
                // folderPath carimbado (o caminho da pasta), p/ a cor
                // fixa do Tile, o progresso e a estrela usarem o
                // caminho certo.
                val listed = files.map { file ->
                    if (file.isFolder) {
                        val path = if (currentPath.endsWith("/")) "$currentPath${file.name}/"
                            else "$currentPath/${file.name}/"
                        file.copy(folderPath = path)
                    } else file
                }
                adapter.submitList(listed)
                val sm = SessionManager.get(this@BrowseActivity)
                val resumed = files.filter { it.isVideo && sm.hasResume(currentPath, it.name) }
                    .map { it.name }.toSet()
                val watched = files.filter { it.isVideo && sm.isWatched(currentPath, it.name) }
                    .map { it.name }.toSet()
                adapter.setResumeAndWatched(resumed, watched)
                // Progresso das pastas (grupos sintéticos, só recents:
                // sem filhos carregados, uma pasta sem recents na
                // subárvore diria "carregando…" para sempre — por isso
                // só entram no mapa as pastas com recents; as outras
                // ficam como hoje, sem linha de progresso).
                val recents = sm.getRecents()
                val folderProgress = listed.filter { it.isFolder }.mapNotNull { folder ->
                    val path = folder.folderPath ?: return@mapNotNull null
                    if (recents.none { it.folderPath == path || it.folderPath.startsWith(path) }) {
                        return@mapNotNull null
                    }
                    path to folderTileProgress(sm, LessonGroup(folder = folder, folderPath = path))
                }.toMap()
                adapter.setFolderProgress(folderProgress)
            }
            // Frente A (TV) — a Browse não definia foco inicial
            // nenhum: o 1º D-pad caía na seta "voltar" da toolbar.
            // Com a grade carregada, o foco vai para o 1º card
            // (só TV; sem itens, findViewHolder devolve null e nada
            // acontece).
            if (TvUtils.isTv(this@BrowseActivity)) {
                binding.recycler.post {
                    binding.recycler.findViewHolderForAdapterPosition(0)
                        ?.itemView?.requestFocus()
                }
            }
        }
    }

    private fun openFolder(file: FileItem) {
        val newPath = if (currentPath.endsWith("/")) {
            "$currentPath${file.name}/"
        } else {
            "$currentPath/${file.name}/"
        }
        val intent = Intent(this, BrowseActivity::class.java)
        intent.putExtra("drivePath", newPath)
        intent.putExtra("folderName", file.name)
        startActivity(intent)
    }

    private fun openFile(file: FileItem) {
        val link = file.link
        if (link.isNullOrEmpty()) return

        val fullUrl = BiBiGynApp.BASE_URL + link

        if (file.isVideo || file.isAudio) {
            val allFiles = fileAdapter?.currentList ?: emptyList()
            val playableItems = allFiles.filter { (it.isVideo || it.isAudio) && !it.link.isNullOrEmpty() }
            val playIndex = playableItems.indexOfFirst { it.id == file.id }

            if (playableItems.size > 1 && playIndex >= 0) {
                // Ronda 15 Frente B (B1): carimbar folderPath — sem isto o progresso cai na loja legada pos_<url>.
                PlaylistManager.setPlaylist(playableItems.map { it.copy(folderPath = currentPath) }, playIndex, this)
                launchPlayer(fullUrl, file.name, currentPath)
            } else {
                // Frente H — ver DetailActivity.openFileInFolder: navega
                // já; a playlist interfolder é enriquecida pelo player.
                if (playableItems.isNotEmpty() && playIndex >= 0) {
                    // Ronda 15 Frente B (B1): carimbar folderPath — sem isto o progresso cai na loja legada pos_<url>.
                    PlaylistManager.setPlaylist(playableItems.map { it.copy(folderPath = currentPath) }, playIndex, this)
                } else {
                    PlaylistManager.setPlaylist(
                        listOf(file.copy(folderPath = currentPath)), 0, this
                    )
                }
                launchPlayer(fullUrl, file.name, currentPath)
            }
        } else if (file.isPdf) {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(fullUrl))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try {
                startActivity(intent)
            } catch (_: Exception) {
                // Frente G: sem visualizador de PDF instalado
                // (comum na TV), o retry sem try relançava a
                // exceção e o app fechava. Avisa em vez disso.
                Toast.makeText(this, "Nenhum app para abrir PDFs", Toast.LENGTH_SHORT).show()
            }
        } else {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(fullUrl))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try {
                startActivity(intent)
            } catch (_: Exception) {
                // Frente G: antes o toque num ficheiro sem app
                // associada não fazia nada nem avisava.
                Toast.makeText(this, "Não foi possível abrir este arquivo", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun launchPlayer(url: String, title: String, folderPath: String) {
        // Frente H — guarda contra duplo toque (ver DetailActivity).
        if (!TapFeedback.tryNavigate(url)) return
        val sm = SessionManager.get(this)
        sm.saveLastWatched(folderPath, title)
        // Frente H — guarda o link no recent: o "Continuar assistindo"
        // passa a navegar sem listFolder prévio (o saveJob do player já
        // criava o recent, mas sem o link).
        sm.addRecent(folderPath, title, null, url.removePrefix(BiBiGynApp.BASE_URL).takeIf { it != url })
        val intent = Intent(this, PlayerActivity::class.java)
        intent.putExtra(PlayerActivity.EXTRA_URL, url)
        intent.putExtra(PlayerActivity.EXTRA_TITLE, title)
        intent.putExtra(PlayerActivity.EXTRA_FOLDER_PATH, folderPath)
        startActivity(intent)
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
