package com.bibigyn.app.ui.detail

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.google.android.material.card.MaterialCardView
import com.bibigyn.app.R
import com.bibigyn.app.data.FileItem
import com.bibigyn.app.util.FocusAnimator
import com.bibigyn.app.util.Format
import com.bibigyn.app.util.SessionManager

/**
 * v2.1.41 — fileira horizontal de aulas do detalhe TV (conceito
 * "tv-detalhe-video", SPEC §4). Só apresentação: mostra os vídeos
 * DIRECTOS da pasta, na ordem recebida da listagem. O toque entrega
 * o FileItem ao chamador, que abre pela via de sempre (openFile —
 * a mesma da grade da pasta, com a playlist completa).
 *
 * Dados: só o que já existe no aparelho — thumb do FileItem,
 * watched/resume/duração da SessionManager (a duração só aparece
 * quando conhecida, i.e. quando há resume guardado). Nenhuma
 * chamada de rede por item.
 *
 * Foco: anel branco 4dp + escala 1.05 (padrão R27 das grades).
 */
class TvLessonRailAdapter(
    private val folderPath: String,
    private var items: List<FileItem>,
    private var resumeName: String?,
    private val nextFocusUpId: Int,
    private val onClick: (FileItem) -> Unit
) : RecyclerView.Adapter<TvLessonRailAdapter.VH>() {

    fun submit(newItems: List<FileItem>, newResumeName: String?) {
        items = newItems
        resumeName = newResumeName
        notifyDataSetChanged()
    }

    inner class VH(itemView: View) : RecyclerView.ViewHolder(itemView) {
        val card: MaterialCardView = itemView.findViewById(R.id.lessonCardRoot)
        val thumb: ImageView = itemView.findViewById(R.id.lessonThumb)
        val watchedBadge: TextView = itemView.findViewById(R.id.lessonWatchedBadge)
        val number: TextView = itemView.findViewById(R.id.lessonNumber)
        val name: TextView = itemView.findViewById(R.id.lessonName)
        val meta: TextView = itemView.findViewById(R.id.lessonMeta)

        init {
            itemView.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos != RecyclerView.NO_POSITION) onClick(items[pos])
            }
            FocusAnimator.attachCard(
                card, true,
                scaleTv = FocusAnimator.SCALE_TV_DENSE,
                ringColorRes = R.color.tile_focus_ring_white,
                ringWidthDp = 4f
            )
            if (nextFocusUpId != View.NO_ID) itemView.nextFocusUpId = nextFocusUpId
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_tv_lesson_card, parent, false)
        return VH(view)
    }

    override fun getItemCount(): Int = items.size

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = items[position]
        val context = holder.itemView.context
        val sm = SessionManager.get(context)

        holder.number.text = Format.lessonNumberLabel(item.name) ?: "Aula ${position + 1}"
        holder.name.text = Format.displayTitle(item.name).ifBlank { item.name }

        if (!item.thumbnailLink.isNullOrBlank()) {
            holder.thumb.visibility = View.VISIBLE
            holder.thumb.load(item.thumbnailLink) {
                error(R.drawable.card_gradient_pink)
            }
        } else {
            holder.thumb.visibility = View.GONE
        }

        val watched = sm.isWatched(folderPath, item.name)
        holder.watchedBadge.visibility = if (watched) View.VISIBLE else View.GONE

        val progress = sm.getResumeProgress(folderPath, item.name)
        val duration = sm.getResumeDuration(folderPath, item.name)
        val durationText = if (duration > 0) "${duration / 60_000} min" else null
        val isNowWatching = resumeName != null && item.name == resumeName
        val brand = ContextCompat.getColor(context, R.color.md_primary)
        val green = ContextCompat.getColor(context, R.color.accent_green)
        val muted = ContextCompat.getColor(context, R.color.tile_subtitle)
        val (metaText, metaColor) = when {
            isNowWatching -> {
                val now = context.getString(R.string.tv_now_watching)
                (if (durationText != null) "$durationText • $now" else now) to brand
            }
            watched -> {
                val done = context.getString(R.string.tv_watched_label)
                (if (durationText != null) "$durationText • $done" else done) to green
            }
            progress > 0 ->
                (if (durationText != null) "$durationText • $progress%" else "$progress%") to muted
            else -> (durationText ?: "") to muted
        }
        holder.meta.text = metaText
        holder.meta.setTextColor(metaColor)
        holder.meta.visibility = if (metaText.isBlank()) View.GONE else View.VISIBLE
    }
}
