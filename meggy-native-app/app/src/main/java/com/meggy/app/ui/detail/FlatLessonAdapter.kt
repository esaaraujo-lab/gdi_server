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
import com.meggy.app.data.monogramFor
import com.meggy.app.databinding.ItemFlatLessonBinding
import com.meggy.app.util.CardGradient
import com.meggy.app.util.FocusAnimator
import com.meggy.app.util.Format
import com.meggy.app.util.SessionManager
import com.meggy.app.util.TvUtils

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
 */
class FlatLessonAdapter(
    private val folderPath: String,
    private val onPlay: (FileItem) -> Unit,
    private val onOpenPdf: (FileItem) -> Unit,
    private val onOpenMd: (FileItem) -> Unit,
    private val onOpenOther: (FileItem) -> Unit
) : ListAdapter<FileItem, FlatLessonAdapter.VH>(DIFF) {

    inner class VH(val binding: ItemFlatLessonBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos == RecyclerView.NO_POSITION) return@setOnClickListener
                dispatch(getItem(pos))
            }
            binding.flatContinue.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos == RecyclerView.NO_POSITION) return@setOnClickListener
                dispatch(getItem(pos))
            }
            FocusAnimator.attachCard(binding.flatCardRoot, TvUtils.isTv(binding.root.context))
        }

        private fun dispatch(item: FileItem) {
            when {
                item.isVideo || item.isAudio -> onPlay(item)
                item.isPdf -> onOpenPdf(item)
                item.isMarkdown -> onOpenMd(item)
                else -> onOpenOther(item)
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val inflater = LayoutInflater.from(parent.context)
        return VH(ItemFlatLessonBinding.inflate(inflater, parent, false))
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = getItem(position)
        val res = holder.itemView.resources
        val ctx = holder.itemView.context
        val sm = SessionManager.get(ctx)

        with(holder.binding) {
            flatTitle.text = item.name
            flatThumbBg.background = CardGradient.drawable(res, colorFromString(item.name))

            val thumb = item.thumbnailLink
            if (!thumb.isNullOrBlank() && (item.isVideo || item.isAudio || item.isPdf)) {
                flatThumb.visibility = View.VISIBLE
                flatMonogram.visibility = View.GONE
                flatThumb.load(thumb) { error(R.drawable.card_gradient_pink) }
            } else {
                flatThumb.visibility = View.GONE
                flatMonogram.visibility = View.VISIBLE
                flatMonogram.text = monogramFor(item.name)
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
        val DIFF = object : DiffUtil.ItemCallback<FileItem>() {
            override fun areItemsTheSame(oldItem: FileItem, newItem: FileItem): Boolean =
                oldItem.id == newItem.id && oldItem.name == newItem.name
            override fun areContentsTheSame(oldItem: FileItem, newItem: FileItem): Boolean =
                oldItem == newItem
        }
    }
}
