package com.meggy.app.ui.downloads

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.meggy.app.R
import com.meggy.app.util.DownloadRegistry
import com.meggy.app.util.FocusAnimator
import com.meggy.app.util.Format
import com.meggy.app.util.TvUtils
import java.text.DateFormat
import java.util.Date

/**
 * 2.7.58 — linhas da tela de Downloads: nome da aula (o TEMA, nunca
 * o nome do ficheiro — regra 14:51), curso/pasta, tamanho, data e
 * estado (a baixar / pronto / falhou). Toque toca offline; o botão
 * Apagar remove ficheiro + registo.
 */
class DownloadsAdapter(
    private val onPlay: (DownloadRegistry.Entry) -> Unit,
    private val onDelete: (DownloadRegistry.Entry) -> Unit
) : RecyclerView.Adapter<DownloadsAdapter.VH>() {

    private var items: List<DownloadRegistry.Entry> = emptyList()
    private var states: Map<String, Int> = emptyMap()

    fun submit(list: List<DownloadRegistry.Entry>, stateMap: Map<String, Int>) {
        items = list
        states = stateMap
        notifyDataSetChanged()
    }

    inner class VH(view: View) : RecyclerView.ViewHolder(view) {
        val title: TextView = view.findViewById(R.id.downloadTitle)
        val meta: TextView = view.findViewById(R.id.downloadMeta)
        val state: TextView = view.findViewById(R.id.downloadState)
        val delete: TextView = view.findViewById(R.id.downloadDelete)

        init {
            view.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos != RecyclerView.NO_POSITION) onPlay(items[pos])
            }
            delete.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos != RecyclerView.NO_POSITION) onDelete(items[pos])
            }
            FocusAnimator.attachCard(view, TvUtils.isTv(view.context))
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_download, parent, false)
        return VH(view)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = items[position]
        holder.title.text = item.lessonName.ifBlank { item.videoName }
        val course = Format.extractCourseName(item.folderPath)
        val sizeText = if (item.size > 0) formatSize(item.size) else ""
        val dateText = if (item.downloadedAt > 0) {
            DateFormat.getDateInstance(DateFormat.SHORT).format(Date(item.downloadedAt))
        } else ""
        holder.meta.text = listOf(course, sizeText, dateText)
            .filter { it.isNotBlank() }.joinToString(" · ")
        val state = states[item.videoName + "|" + item.folderPath] ?: STATE_READY
        holder.state.text = when (state) {
            STATE_DOWNLOADING -> "A baixar…"
            STATE_FAILED -> "Falhou — apaga e baixa de novo"
            else -> "Pronto ✓"
        }
    }

    override fun getItemCount(): Int = items.size

    private fun formatSize(bytes: Long): String {
        if (bytes <= 0) return ""
        val units = arrayOf("B", "KB", "MB", "GB")
        var v = bytes.toDouble()
        var u = 0
        while (v >= 1024.0 && u < units.lastIndex) {
            v /= 1024.0
            u++
        }
        return if (u == 0) "$bytes B" else String.format("%.1f %s", v, units[u])
    }

    companion object {
        const val STATE_READY = 0
        const val STATE_DOWNLOADING = 1
        const val STATE_FAILED = 2
    }
}
