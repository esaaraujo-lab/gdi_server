package com.meggy.app.ui.detail

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.meggy.app.R
import com.meggy.app.data.FileItem
import com.meggy.app.data.colorFromString
import com.meggy.app.data.monogramFor
import com.meggy.app.databinding.ItemLessonCardBinding
import com.meggy.app.databinding.ItemLessonChildBinding
import com.meggy.app.databinding.ItemLessonHeaderBinding
import com.meggy.app.util.CardGradient
import com.meggy.app.util.FocusAnimator
import com.meggy.app.util.Format
import com.meggy.app.util.SessionManager
import com.meggy.app.util.TvUtils

/**
 * v2.7.6 — "Escolher as aulas" (conceitos escolher-aulas phone/TV).
 *
 * Estrutura INTERFOLDER preservada: cada aula é uma pasta com o nome
 * da aula; dentro, vídeo + PDF ou pasta de PDFs (+ .md/transcrição).
 * NÃO achatar numa lista só de vídeos.
 *
 * - Celular: [LessonListAdapter] — linha expansível por aula; ao abrir,
 *   os filhos são listados (um `listFolder`, cache em memória) e
 *   aparecem embutidos: vídeo (▶ Vídeo — MM:SS), PDF (nome + tamanho),
 *   pasta de PDFs (N arquivos), .md/transcrição (leitor de MD).
 * - TV/tablet largo: [LessonGridAdapter] — grade 2 colunas de cards.
 *
 * Progresso por aula: % (do vídeo principal, quando há resume),
 * selo "Concluída" (vídeo assistido) e "Continuar" que retoma o
 * ponto exato via o caminho normal do player.
 */

data class LessonGroup(
    val folder: FileItem,
    val folderPath: String,
    var children: List<FileItem>? = null,
    var expanded: Boolean = false,
    var pdfFolderCount: Int = -1 // -1 = não carregado
)

class LessonListAdapter(
    private val onPlayVideo: (FileItem, String) -> Unit,
    private val onOpenPdf: (FileItem, String) -> Unit,
    private val onOpenMd: (FileItem, String) -> Unit,
    private val onOpenFolder: (FileItem, String) -> Unit,
    private val onToggleExpand: (LessonGroup, Int) -> Unit
) : RecyclerView.Adapter<RecyclerView.ViewHolder>() {

    companion object {
        private const val TYPE_HEADER = 0
        private const val TYPE_CHILD = 1
    }

    /** Linhas visíveis: header + filhos da aula expandida. */
    private val rows = mutableListOf<Any>()

    fun submit(groups: List<LessonGroup>) {
        rows.clear()
        groups.forEach { g ->
            rows.add(g)
            if (g.expanded) g.children?.forEach { rows.add(LessonChild(g, it)) }
        }
        notifyDataSetChanged()
    }

    data class LessonChild(val group: LessonGroup, val item: FileItem)

    inner class HeaderVH(val binding: ItemLessonHeaderBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos == RecyclerView.NO_POSITION) return@setOnClickListener
                val group = rows[pos] as LessonGroup
                onToggleExpand(group, pos)
            }
            FocusAnimator.attach(binding.root, TvUtils.isTv(binding.root.context))
        }
    }

    inner class ChildVH(val binding: ItemLessonChildBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos == RecyclerView.NO_POSITION) return@setOnClickListener
                val child = rows[pos] as LessonChild
                when {
                    child.item.isVideo || child.item.isAudio -> onPlayVideo(child.item, child.group.folderPath)
                    child.item.isPdf -> onOpenPdf(child.item, child.group.folderPath)
                    child.item.isMarkdown -> onOpenMd(child.item, child.group.folderPath)
                    child.item.isFolder -> onOpenFolder(child.item, child.group.folderPath)
                }
            }
            FocusAnimator.attach(binding.root, TvUtils.isTv(binding.root.context))
        }
    }

    override fun getItemViewType(position: Int): Int =
        if (rows[position] is LessonGroup) TYPE_HEADER else TYPE_CHILD

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        val inflater = LayoutInflater.from(parent.context)
        return if (viewType == TYPE_HEADER) {
            HeaderVH(ItemLessonHeaderBinding.inflate(inflater, parent, false))
        } else {
            ChildVH(ItemLessonChildBinding.inflate(inflater, parent, false))
        }
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        val ctx = holder.itemView.context
        val sm = SessionManager.get(ctx)
        when (val row = rows[position]) {
            is LessonGroup -> {
                val b = (holder as HeaderVH).binding
                b.lessonTitle.text = row.folder.name
                // Progresso da aula = progresso do vídeo principal (se já
                // foi listado) ou do resume do nome da aula.
                val video = row.children?.firstOrNull { it.isVideo || it.isAudio }
                val videoName = video?.name ?: row.folder.name
                val progress = sm.getResumeProgress(row.folderPath, videoName)
                val watched = sm.isWatched(row.folderPath, videoName)
                b.lessonProgress.progress = progress
                b.lessonProgressText.text = when {
                    watched -> "100% concluído"
                    progress > 0 -> "$progress% concluído"
                    else -> "não iniciado"
                }
                b.lessonBadge.visibility = if (watched) View.VISIBLE else View.GONE
                b.lessonContinue.visibility = if (progress > 0 && !watched) View.VISIBLE else View.GONE
                b.lessonContinue.setOnClickListener {
                    if (video != null) onPlayVideo(video, row.folderPath)
                }
                b.lessonProgressRow.visibility =
                    if (watched || progress > 0) View.VISIBLE else View.GONE
                val meta = buildList {
                    video?.let { add(if (it.isAudio) "áudio" else "vídeo") }
                    val pdfs = row.children?.count { it.isPdf } ?: 0
                    if (pdfs > 0) add("$pdfs PDF")
                    if (row.pdfFolderCount >= 0) add("${row.pdfFolderCount} arquivos")
                }.joinToString(" · ")
                b.lessonMeta.text = meta.ifBlank { "" }
                b.lessonMeta.visibility = if (meta.isBlank()) View.GONE else View.VISIBLE
                b.lessonChevron.text = if (row.expanded) "▲" else "▼"
            }
            is LessonChild -> {
                val b = (holder as ChildVH).binding
                val item = row.item
                b.childIcon.text = when {
                    item.isVideo -> "▶"
                    item.isAudio -> "♪"
                    item.isPdf -> "📄"
                    item.isMarkdown -> "≡"
                    item.isFolder -> "📁"
                    else -> "•"
                }
                b.childTitle.text = item.name
                b.childMeta.text = when {
                    item.isVideo -> {
                        val pos = sm.getResume(row.group.folderPath, item.name)
                        val dur = sm.getResumeDuration(row.group.folderPath, item.name)
                        if (dur > 0) "Vídeo — ${Format.mmss(dur)}" else "Vídeo"
                    }
                    item.isAudio -> "Áudio"
                    item.isPdf -> "PDF · ${item.humanSize}"
                    item.isMarkdown -> "Markdown · ${item.humanSize}"
                    item.isFolder -> {
                        val count = row.group.pdfFolderCount
                        if (count >= 0) "Pasta de PDFs — $count arquivos" else "Pasta de PDFs"
                    }
                    else -> item.humanSize
                }
            }
        }
    }

    override fun getItemCount(): Int = rows.size
}

/**
 * v2.7.6 — Grade TV/tablet largo (2 colunas): card por aula com
 * thumb/monograma, título, chips ("▶ Vídeo MM:SS" / "PDF" / "N PDFS"),
 * "% concluída" + barra rosa. Clique = reproduz o vídeo da aula.
 */
class LessonGridAdapter(
    private val onPlayLesson: (LessonGroup) -> Unit,
    private val onOpenLesson: (LessonGroup) -> Unit
) : RecyclerView.Adapter<LessonGridAdapter.VH>() {

    private val groups = mutableListOf<LessonGroup>()

    fun submit(newGroups: List<LessonGroup>) {
        groups.clear()
        groups.addAll(newGroups)
        notifyDataSetChanged()
    }

    inner class VH(val binding: ItemLessonCardBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos == RecyclerView.NO_POSITION) return@setOnClickListener
                onPlayLesson(groups[pos])
            }
            FocusAnimator.attachCard(binding.lessonCardRoot, TvUtils.isTv(binding.root.context))
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val inflater = LayoutInflater.from(parent.context)
        return VH(ItemLessonCardBinding.inflate(inflater, parent, false))
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val group = groups[position]
        val res = holder.itemView.resources
        val ctx = holder.itemView.context
        val sm = SessionManager.get(ctx)
        val video = group.children?.firstOrNull { it.isVideo || it.isAudio }
        val videoName = video?.name ?: group.folder.name
        val progress = sm.getResumeProgress(group.folderPath, videoName)
        val watched = sm.isWatched(group.folderPath, videoName)
        val dur = if (video != null) sm.getResumeDuration(group.folderPath, video.name) else 0L

        with(holder.binding) {
            lessonCardBg.background = CardGradient.drawable(res, colorFromString(group.folder.name))
            val thumb = video?.thumbnailLink
            if (!thumb.isNullOrBlank()) {
                lessonCardThumb.visibility = View.VISIBLE
                lessonCardMonogram.visibility = View.GONE
                lessonCardThumb.load(thumb) { error(R.drawable.card_gradient_pink) }
            } else {
                lessonCardThumb.visibility = View.GONE
                lessonCardMonogram.visibility = View.VISIBLE
                lessonCardMonogram.text = monogramFor(group.folder.name)
            }
            lessonCardTitle.text = group.folder.name
            if (video != null) {
                lessonCardChipVideo.visibility = View.VISIBLE
                lessonCardChipVideo.text = if (video.isAudio) "♪ Áudio"
                    else "▶ Vídeo${if (dur > 0) " ${Format.mmss(dur)}" else ""}"
            } else {
                lessonCardChipVideo.visibility = View.GONE
            }
            val pdfs = group.children?.count { it.isPdf } ?: 0
            val pdfTotal = pdfs + group.pdfFolderCount.coerceAtLeast(0)
            if (pdfTotal > 0) {
                lessonCardChipPdf.visibility = View.VISIBLE
                lessonCardChipPdf.text = if (pdfTotal == 1) "1 PDF" else "$pdfTotal PDFS"
            } else {
                lessonCardChipPdf.visibility = View.GONE
            }
            lessonCardProgress.progress = if (watched) 100 else progress
            lessonCardProgressText.text = when {
                watched -> "100% concluída"
                progress > 0 -> "$progress% concluída"
                else -> "não iniciada"
            }
        }
    }

    override fun getItemCount(): Int = groups.size
}
