package com.bibigyn.app.ui.downloads

import android.app.DownloadManager
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.bibigyn.app.R
import com.bibigyn.app.data.FileItem
import com.bibigyn.app.ui.home.SideMenuView
import com.bibigyn.app.ui.home.TvRailHost
import com.bibigyn.app.ui.player.PlayerActivity
import com.bibigyn.app.util.DownloadRegistry
import com.bibigyn.app.util.PlaylistManager
import com.bibigyn.app.util.VideoDownloader

/**
 * v2.1.44 — DOWNLOADS (destino real; porte Meggy 2.7.58): lista dos
 * vídeos/aulas baixados no aparelho a partir do REGISTO
 * ([DownloadRegistry]) — nunca um scan da pasta. Entradas sem
 * ficheiro são limpas ao abrir (prune). Estado por item (a baixar /
 * pronto) lido do DownloadManager.
 *
 * Toque num item pronto → reproduz OFFLINE: PlayerActivity com
 * `EXTRA_LOCAL_FILE` (file://); a playlist recebe o item com a chave
 * de sempre (folderPath + videoName), por isso o resume atravessa
 * online/offline. Acção por item: apagar (ficheiro + registo).
 *
 * Na TV é a mesma tela (lista + player) — sem materiais (regra TV).
 */
class DownloadsActivity : AppCompatActivity() {

    private lateinit var recycler: RecyclerView
    private lateinit var emptyText: TextView
    private var adapter: DownloadsAdapter? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_downloads)

        findViewById<View>(R.id.downloadsBack)?.setOnClickListener { finish() }
        recycler = findViewById(R.id.downloadsList)
        emptyText = findViewById(R.id.downloadsEmpty)
        recycler.layoutManager = LinearLayoutManager(this)
        adapter = DownloadsAdapter(
            onPlay = { entry -> playLocal(entry) },
            onDelete = { entry ->
                DownloadRegistry.remove(this, entry)
                Toast.makeText(this, R.string.downloads_deleted, Toast.LENGTH_SHORT).show()
                refresh()
            }
        )
        recycler.adapter = adapter

        TvRailHost.attach(
            this,
            findViewById(R.id.tvSideMenu),
            findViewById(R.id.downloadsContent),
            SideMenuView.MenuItem.DOWNLOADS,
            R.id.downloadsList
        )
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun refresh() {
        // Prune: entradas cujo ficheiro foi apagado fora do app somem.
        val entries = DownloadRegistry.prune(this).map { entry ->
            // Tamanho real do ficheiro quando ele já existe.
            val f = entry.file()
            if (f.exists() && f.length() > 0 && entry.size != f.length()) {
                entry.copy(size = f.length())
            } else entry
        }
        // Estado de cada entrada (a baixar / pronto / falhou).
        val states = entries.associate { entry ->
            entry.videoName + "|" + entry.folderPath to stateOf(entry)
        }
        adapter?.submit(entries, states)
        emptyText.visibility = if (entries.isEmpty()) View.VISIBLE else View.GONE
        recycler.visibility = if (entries.isEmpty()) View.GONE else View.VISIBLE
    }

    private fun stateOf(entry: DownloadRegistry.Entry): Int {
        if (entry.exists()) return DownloadsAdapter.STATE_READY
        val status = VideoDownloader.status(this, entry)
        return when (status) {
            DownloadManager.STATUS_SUCCESSFUL -> DownloadsAdapter.STATE_READY
            DownloadManager.STATUS_FAILED -> DownloadsAdapter.STATE_FAILED
            else -> DownloadsAdapter.STATE_DOWNLOADING
        }
    }

    /** Reprodução offline pelo caminho do player (ficheiro local). */
    private fun playLocal(entry: DownloadRegistry.Entry) {
        val file = entry.file()
        if (!file.exists()) {
            Toast.makeText(this, R.string.downloads_empty, Toast.LENGTH_SHORT).show()
            refresh()
            return
        }
        val item = FileItem(
            name = entry.videoName, mimeType = "video/mp4", id = "",
            driveId = null, link = null, size = file.length(), modifiedTime = null,
            folderPath = entry.folderPath
        )
        PlaylistManager.setPlaylist(listOf(item), 0, this)
        val intent = Intent(this, PlayerActivity::class.java)
        intent.putExtra(PlayerActivity.EXTRA_LOCAL_FILE, Uri.fromFile(file).toString())
        intent.putExtra(PlayerActivity.EXTRA_TITLE, entry.videoName)
        intent.putExtra(PlayerActivity.EXTRA_FOLDER_PATH, entry.folderPath)
        startActivity(intent)
    }
}
