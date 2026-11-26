package com.meggy.app.ui.detail

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.meggy.app.R
import com.meggy.app.data.FileItem
import com.meggy.app.util.LibraryCovers
import com.meggy.app.util.ThumbArt

/**
 * 2.7.58 — LISTA UNIFICADA DE AULAS do detalhe MOBILE (SPEC §2):
 * UMA apresentação estilo lista de episódios do Plex para as duas
 * estruturas de pasta — grupos interfolder (cada aula na sua pasta)
 * e pasta plana (todas as aulas juntas) convergem nas mesmas
 * linhas: miniatura 16:9 do próprio vídeo, título = tema da aula,
 * 2.ª linha com duração/progresso, selo "Aula atual" e barra de
 * progresso. Os dados vêm EXCLUSIVAMENTE do que o DetailActivity já
 * produz (grupos + filhos do prefetch; allFiles no modo plano) —
 * nenhuma chamada de rede nova. O toque usa os caminhos actuais
 * (openFileInFolder/openFile) via callbacks da activity.
 *
 * Linhas: Header (nome do grupo com N vídeos / "Materiais"),
 * Lesson (1 vídeo do grupo ou vídeo plano), Folder (grupo sem
 * vídeos directos → abre o detalhe do grupo), Material (ficheiro
 * não-vídeo de qualquer grupo → seção Materiais no fim), Pending
 * (grupo ainda sem filhos do prefetch — some no refresh seguinte).
 */
class UnifiedLessonAdapter(
    private val onPlayVideo: (FileItem, String) -> Unit,
    private val onOpenGroup: (LessonGroup) -> Unit,
    private val onOpenMaterial: (FileItem, String) -> Unit
) : RecyclerView.Adapter<RecyclerView.ViewHolder>() {

    sealed class Row {
        data class Header(val title: String) : Row()
        data class Lesson(
            val file: FileItem,
            val groupPath: String,
            val title: String,
            val secondLine: String?,
            val watched: Boolean,
            val progress: Int,
            val durationMs: Long,
            val isCurrent: Boolean
        ) : Row()

        data class Folder(val group: LessonGroup) : Row()
        data class Material(val file: FileItem, val groupPath: String) : Row()
        data class Pending(val group: LessonGroup) : Row()
    }

    private var rows: List<Row> = emptyList()

    fun submit(newRows: List<Row>) {
        rows = newRows
        notifyDataSetChanged()
    }

    override fun getItemViewType(position: Int): Int = when (rows[position]) {
        is Row.Header -> 0
        is Row.Lesson -> 1
        is Row.Folder -> 2
        is Row.Material -> 3
        is Row.Pending -> 4
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        val inflater = LayoutInflater.from(parent.context)
        return when (viewType) {
            0 -> HeaderVH(inflater.inflate(R.layout.item_unified_header, parent, false))
            2 -> FolderVH(inflater.inflate(R.layout.item_unified_lesson, parent, false))
            3 -> MaterialVH(inflater.inflate(R.layout.item_unified_lesson, parent, false))
            4 -> PendingVH(inflater.inflate(R.layout.item_unified_lesson, parent, false))
            else -> LessonVH(inflater.inflate(R.layout.item_unified_lesson, parent, false))
        }
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        when (val row = rows[position]) {
            is Row.Header -> (holder as HeaderVH).title.text = row.title
            is Row.Lesson -> bindLesson(holder as LessonVH, row)
            is Row.Folder -> bindFolder(holder as FolderVH, row)
            is Row.Material -> bindMaterial(holder as MaterialVH, row)
            is Row.Pending -> bindPending(holder as PendingVH, row)
        }
    }

    override fun getItemCount(): Int = rows.size

    private fun bindLesson(holder: LessonVH, row: Row.Lesson) {
        holder.title.text = row.title
        val parts = ArrayList<String>()
        if (!row.secondLine.isNullOrBlank()) parts.add(row.secondLine)
        if (row.durationMs > 0) parts.add(formatDuration(row.durationMs))
        if (row.watched) parts.add("✓")
        holder.meta.text = parts.joinToString(" · ")
        holder.meta.visibility = if (parts.isEmpty()) View.GONE else View.VISIBLE
        holder.badge.visibility = if (row.isCurrent) View.VISIBLE else View.GONE
        if (row.progress > 0) {
            holder.progress.visibility = View.VISIBLE
            holder.progress.progress = row.progress
        } else {
            holder.progress.visibility = View.GONE
        }
        loadThumb(holder.thumb, row.file, row.groupPath)
        holder.itemView.setOnClickListener { onPlayVideo(row.file, row.groupPath) }
    }

    private fun bindFolder(holder: FolderVH, row: Row.Folder) {
        holder.title.text = row.group.folder.name
        holder.meta.text = "›"
        holder.meta.visibility = View.VISIBLE
        holder.badge.visibility = View.GONE
        holder.progress.visibility = View.GONE
        loadThumb(holder.thumb, row.group.folder, row.group.folderPath)
        holder.itemView.setOnClickListener { onOpenGroup(row.group) }
    }

    private fun bindMaterial(holder: MaterialVH, row: Row.Material) {
        holder.title.text = row.file.name
        holder.meta.text = when {
            row.file.isPdf -> "PDF"
            row.file.isMarkdown -> "Texto"
            row.file.isFolder -> "Pasta ›"
            else -> ""
        }
        holder.meta.visibility = if (holder.meta.text.isEmpty()) View.GONE else View.VISIBLE
        holder.badge.visibility = View.GONE
        holder.progress.visibility = View.GONE
        loadThumb(holder.thumb, row.file, row.groupPath)
        holder.itemView.setOnClickListener { onOpenMaterial(row.file, row.groupPath) }
    }

    private fun bindPending(holder: PendingVH, row: Row.Pending) {
        holder.title.text = row.group.folder.name
        holder.meta.text = "…"
        holder.meta.visibility = View.VISIBLE
        holder.badge.visibility = View.GONE
        holder.progress.visibility = View.GONE
        loadThumb(holder.thumb, row.group.folder, row.group.folderPath)
        holder.itemView.setOnClickListener { onOpenGroup(row.group) }
    }

    /** Miniatura: a do próprio vídeo (Drive); pasta/ficheiro sem
     *  thumb → capa da matéria (LibraryCovers) → arte fixa. */
    private fun loadThumb(image: ImageView, file: FileItem, groupPath: String) {
        val remote = LibraryCovers.remoteCoverStrict(
            file.thumbnailLink, file.name, file.name, groupPath
        )
        if (remote != null) {
            image.load(remote) {
                error(ThumbArt.coverResForPath(groupPath))
            }
        } else {
            image.setImageResource(ThumbArt.coverResForPath(groupPath))
        }
    }

    private fun formatDuration(ms: Long): String {
        val totalSec = ms / 1000
        val h = totalSec / 3600
        val m = (totalSec % 3600) / 60
        val s = totalSec % 60
        return if (h > 0) String.format("%d:%02d:%02d", h, m, s)
        else String.format("%d:%02d", m, s)
    }

    class HeaderVH(view: View) : RecyclerView.ViewHolder(view) {
        val title: TextView = view.findViewById(R.id.unifiedHeaderTitle)
    }

    abstract class RowVH(view: View) : RecyclerView.ViewHolder(view) {
        val thumb: ImageView = view.findViewById(R.id.unifiedThumb)
        val title: TextView = view.findViewById(R.id.unifiedTitle)
        val meta: TextView = view.findViewById(R.id.unifiedMeta)
        val badge: TextView = view.findViewById(R.id.unifiedBadge)
        val progress: ProgressBar = view.findViewById(R.id.unifiedProgress)
    }

    class LessonVH(view: View) : RowVH(view)
    class FolderVH(view: View) : RowVH(view)
    class MaterialVH(view: View) : RowVH(view)
    class PendingVH(view: View) : RowVH(view)
}
