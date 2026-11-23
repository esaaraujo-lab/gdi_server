package com.meggy.app.ui.detail

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.meggy.app.R
import com.meggy.app.data.FileItem
import com.meggy.app.data.colorFromString
import com.meggy.app.databinding.ItemFlatLessonBinding
import com.meggy.app.databinding.ItemSectionHeaderBinding
import com.meggy.app.util.CardGradient
import com.meggy.app.util.FocusAnimator
import com.meggy.app.util.TapFeedback
import com.meggy.app.util.Format
import com.meggy.app.util.LessonDescription
import com.meggy.app.util.SessionManager
import com.meggy.app.util.ThumbArt
import com.meggy.app.util.LibraryCovers
import com.meggy.app.util.TvUtils

/**
 * Frente R4B — linhas da lista plana: cabeçalho de secção ou item.
 * O cabeçalho guarda o recurso do título ("Vídeos"/"Materiais") e a
 * contagem da secção; o item guarda o ficheiro.
 */
sealed interface FlatRow {
    data class Header(val titleRes: Int, val count: Int) : FlatRow
    data class Item(val file: FileItem) : FlatRow
}

/** Frente R4B — filtro dos chips: Todos / Vídeos / Materiais. */
enum class FlatFilter { ALL, VIDEOS, MATERIALS }

/**
 * v2.7.6 — Lista PLANA (conceito escolher-aulas-pasta-unica, Elton 00:04).
 *
 * Para pastas SEM subpastas (todos os vídeos numa só pasta): linhas com
 * thumb, título + duração, barra de progresso e estado — "✓ Concluída"
 * (assistida), botão "Continuar" (em andamento, retoma o ponto exato)
 * ou "X% concluída". A duração só é conhecida depois da 1ª reprodução
 * (o app aprende a duração no player via `saveResumeDuration`) — vídeo
 * nunca assistido mostra só "Vídeo".
 *
 * A ordem da listagem é a da API (não reordenada). PDFs/MD da mesma
 * pasta aparecem como linhas (sem progresso) e abrem os leitores
 * embutidos — nada fica inalcançável.
 *
 * Frente R4B — lista partida em secções: Vídeos (só .mp4, por ordem,
 * com progresso) primeiro e Materiais (PDFs, .md, áudios e outros) a
 * seguir; cada secção tem cabeçalho com a contagem. Legendas .srt/.vtt
 * (FileItem.isSubtitle) nunca entram na lista — continuam a carregar
 * no player via SubtitleFetcher, que lê o listFolder completo.
 */
class FlatLessonAdapter(
    private val folderPath: String,
    private val onPlay: (FileItem) -> Unit,
    private val onOpenPdf: (FileItem) -> Unit,
    private val onOpenMd: (FileItem) -> Unit,
    private val onOpenOther: (FileItem) -> Unit
) : ListAdapter<FlatRow, RecyclerView.ViewHolder>(DIFF) {

    // Frente R4B — secções da lista plana + filtro dos chips.
    private var videos: List<FileItem> = emptyList()
    private var materials: List<FileItem> = emptyList()
    private var filter: FlatFilter = FlatFilter.ALL

    /**
     * Recebe as duas secções já partidas (Vídeos .mp4 / Materiais, sem
     * legendas — ver DetailActivity.refreshFlatList) e o filtro ativo,
     * e reconstrói as linhas: cabeçalho + itens por secção não vazia.
     * Secção vazia não aparece (nem o cabeçalho).
     */
    fun submitSections(videos: List<FileItem>, materials: List<FileItem>, filter: FlatFilter) {
        this.videos = videos
        this.materials = materials
        this.filter = filter
        val rows = ArrayList<FlatRow>()
        if (filter != FlatFilter.MATERIALS && videos.isNotEmpty()) {
            rows.add(FlatRow.Header(R.string.flat_section_videos, videos.size))
            videos.forEach { rows.add(FlatRow.Item(it)) }
        }
        if (filter != FlatFilter.VIDEOS && materials.isNotEmpty()) {
            rows.add(FlatRow.Header(R.string.flat_section_materials, materials.size))
            materials.forEach { rows.add(FlatRow.Item(it)) }
        }
        submitList(rows)
    }

    // R21: cast seguro — posição/tipo obsoletos devolvem null em vez
    // de rebentar (os chamadores tratam null como "ignora o clique").
    private fun fileAt(pos: Int): FileItem? = (getItem(pos) as? FlatRow.Item)?.file

    override fun getItemViewType(position: Int): Int =
        if (getItem(position) is FlatRow.Header) TYPE_HEADER else TYPE_ITEM

    /** Frente R4B — cabeçalho de secção ("Vídeos · 13" / "Materiais · 5"). */
    inner class HeaderVH(val binding: ItemSectionHeaderBinding) :
        RecyclerView.ViewHolder(binding.root) {
        fun bind(row: FlatRow.Header) {
            binding.sectionHeaderTitle.text =
                "${binding.root.context.getString(row.titleRes)} · ${row.count}"
        }
    }

    inner class VH(val binding: ItemFlatLessonBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos == RecyclerView.NO_POSITION) return@setOnClickListener
                dispatch(fileAt(pos))
            }
            binding.flatContinue.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos == RecyclerView.NO_POSITION) return@setOnClickListener
                dispatch(fileAt(pos))
            }
            FocusAnimator.attachCard(binding.flatCardRoot, TvUtils.isTv(binding.root.context))
            TapFeedback.attachPress(binding.flatCardRoot, TvUtils.isTv(binding.root.context))
        }

        private fun dispatch(item: FileItem?) {
            // R21: item nulo (posição obsoleta) = clique ignorado.
            if (item == null) return
            when {
                item.isVideo || item.isAudio -> onPlay(item)
                item.isPdf -> onOpenPdf(item)
                item.isMarkdown -> onOpenMd(item)
                else -> onOpenOther(item)
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        val inflater = LayoutInflater.from(parent.context)
        return if (viewType == TYPE_HEADER) {
            HeaderVH(ItemSectionHeaderBinding.inflate(inflater, parent, false))
        } else {
            VH(ItemFlatLessonBinding.inflate(inflater, parent, false))
        }
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        val row = getItem(position)
        if (row is FlatRow.Header) {
            (holder as HeaderVH).bind(row)
            return
        }
        val vh = holder as VH
        val item = (row as FlatRow.Item).file
        val res = vh.itemView.resources
        val ctx = vh.itemView.context
        val sm = SessionManager.get(ctx)

        with(vh.binding) {
            // R22 — regra do site p/ o nome da aula: ficheiro
            // genérico ("video.mp4") mostra o nome da pasta da aula;
            // nome real fica intacto.
            flatTitle.text = LessonDescription.displayNameForLesson(
                item.name, LessonDescription.folderNameFromPath(folderPath)
            ) ?: item.name
            flatThumbBg.background = CardGradient.drawable(res, colorFromString(item.name))

            // v2.7.11 onda 2 + camada (3) ESTRITA (2.7.13, sem 'geral')
            // — sem thumb, a imagem da biblioteca pelo nome da aula/pasta;
            // sem match, a capa gerada do drive (nunca monograma).
            val coverRes = ThumbArt.coverResForPath(folderPath)
            val thumb = LibraryCovers.remoteCoverStrict(item.thumbnailLink, item.name, folderPath)
            if (!thumb.isNullOrBlank() && (item.isVideo || item.isAudio || item.isPdf)) {
                flatThumb.visibility = View.VISIBLE
                flatMonogram.visibility = View.GONE
                flatThumb.load(thumb) {
                    error(coverRes)
                    listener(onError = { _, _ -> flatThumb.setImageResource(coverRes) })
                }
            } else {
                flatThumb.visibility = View.VISIBLE
                flatMonogram.visibility = View.GONE
                flatThumb.setImageResource(coverRes)
            }

            val dur = if (item.isVideo || item.isAudio) sm.getResumeDuration(folderPath, item.name) else 0L
            flatMeta.text = when {
                item.isVideo -> if (dur > 0) "Vídeo · ${Format.mmss(dur)}" else "Vídeo"
                item.isAudio -> if (dur > 0) "Áudio · ${Format.mmss(dur)}" else "Áudio"
                item.isPdf -> "PDF · ${item.humanSize}"
                item.isMarkdown -> "Markdown · ${item.humanSize}"
                else -> item.humanSize
            }

            // Progresso/estado (só vídeos/áudios).
            val progress = if (item.isVideo || item.isAudio) sm.getResumeProgress(folderPath, item.name) else 0
            val watched = if (item.isVideo || item.isAudio) sm.isWatched(folderPath, item.name) else false
            flatProgress.progress = if (watched) 100 else progress
            when {
                watched -> {
                    flatDoneBadge.visibility = View.VISIBLE
                    flatContinue.visibility = View.GONE
                    flatProgressText.visibility = View.GONE
                }
                progress > 0 -> {
                    flatDoneBadge.visibility = View.GONE
                    flatContinue.visibility = View.VISIBLE
                    flatProgressText.visibility = View.VISIBLE
                    flatProgressText.text = "$progress% concluída"
                }
                else -> {
                    flatDoneBadge.visibility = View.GONE
                    flatContinue.visibility = View.GONE
                    flatProgressText.visibility = View.GONE
                }
            }
        }
    }

    companion object {
        private const val TYPE_HEADER = 0
        private const val TYPE_ITEM = 1

        val DIFF = object : DiffUtil.ItemCallback<FlatRow>() {
            override fun areItemsTheSame(oldItem: FlatRow, newItem: FlatRow): Boolean =
                when {
                    oldItem is FlatRow.Header && newItem is FlatRow.Header ->
                        oldItem.titleRes == newItem.titleRes
                    oldItem is FlatRow.Item && newItem is FlatRow.Item ->
                        oldItem.file.id == newItem.file.id &&
                            oldItem.file.name == newItem.file.name
                    else -> false
                }
            override fun areContentsTheSame(oldItem: FlatRow, newItem: FlatRow): Boolean =
                oldItem == newItem
        }
    }
}
