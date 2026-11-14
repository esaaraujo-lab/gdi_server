package com.bibigyn.app.ui.search

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.animation.AnimationUtils
import android.widget.Toast
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.bibigyn.app.R
import com.bibigyn.app.data.DriveItem
import com.bibigyn.app.data.FileItem
import com.bibigyn.app.data.colorFromString
import com.bibigyn.app.data.monogramFor
import com.bibigyn.app.databinding.ItemSearchResultBinding
import com.bibigyn.app.util.CardGradient
import com.bibigyn.app.util.FocusAnimator
import com.bibigyn.app.util.Format
import com.bibigyn.app.util.SessionManager
import com.bibigyn.app.util.TvUtils

/**
 * v2.0.0 — Tipo de resultado usado pela [SearchActivity].
 */
sealed class SearchResult {
    data class Drive(val drive: DriveItem) : SearchResult()
    data class File(val file: FileItem) : SearchResult()
}

/**
 * v2.1.5 — Resultados como cards horizontais (conceito Buscar): thumb/
 * monograma à esquerda, título (2 linhas), metadados, barra de
 * progresso + % e pill "Em andamento" quando retomável. Foco via
 * FocusAnimator (anel do tile_focus_border + escala).
 */
class SearchResultAdapter(
    private val onDrive: (DriveItem) -> Unit,
    private val onFile: (FileItem) -> Unit
) : RecyclerView.Adapter<SearchResultAdapter.VH>() {

    private val items = mutableListOf<SearchResult>()

    fun submit(newItems: List<SearchResult>) {
        items.clear()
        items.addAll(newItems)
        notifyDataSetChanged()
    }

    inner class VH(val binding: ItemSearchResultBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos == RecyclerView.NO_POSITION) return@setOnClickListener
                when (val item = items[pos]) {
                    is SearchResult.Drive -> onDrive(item.drive)
                    is SearchResult.File -> onFile(item.file)
                }
            }
            FocusAnimator.attach(binding.root, TvUtils.isTv(binding.root.context))
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val inflater = LayoutInflater.from(parent.context)
        return VH(ItemSearchResultBinding.inflate(inflater, parent, false))
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val res = holder.itemView.resources
        val ctx = holder.itemView.context
        val sm = SessionManager.get(ctx)
        when (val item = items[position]) {
            is SearchResult.Drive -> {
                val d = item.drive
                with(holder.binding) {
                    resultTitle.text = d.name
                    resultMeta.text = if (d.isConcurso) "Concurso · ${d.tagline}" else "Curso · ${d.tagline}"
                    resultBg.background = CardGradient.drawable(res, colorFromString(d.name))
                    resultThumb.visibility = View.GONE
                    resultMonogram.visibility = View.VISIBLE
                    resultMonogram.text = monogramFor(d.name)
                    resultProgressRow.visibility = View.GONE
                    resultPill.visibility = View.GONE
                }
            }
            is SearchResult.File -> {
                val f = item.file
                with(holder.binding) {
                    resultTitle.text = f.name
                    resultMeta.text = when {
                        f.isVideo -> "Aula em vídeo"
                        f.isAudio -> "Áudio"
                        f.isPdf -> "PDF · ${f.humanSize}"
                        f.isMarkdown -> "Markdown · ${f.humanSize}"
                        f.isFolder -> "Pasta"
                        else -> f.humanSize
                    }
                    resultBg.background = CardGradient.drawable(res, colorFromString(f.name))
                    val thumb = f.thumbnailLink
                    if (!thumb.isNullOrBlank() && (f.isVideo || f.isAudio || f.isPdf)) {
                        resultThumb.visibility = View.VISIBLE
                        resultMonogram.visibility = View.GONE
                        resultThumb.load(thumb) { error(R.drawable.card_gradient_pink) }
                    } else {
                        resultThumb.visibility = View.GONE
                        resultMonogram.visibility = View.VISIBLE
                        resultMonogram.text = monogramFor(f.name)
                    }
                    // Progresso quando retomável.
                    val fp = f.folderPath ?: ""
                    val progress = if (f.isVideo || f.isAudio) sm.getResumeProgress(fp, f.name) else 0
                    if (progress > 0) {
                        val pos = sm.getResume(fp, f.name)
                        val dur = sm.getResumeDuration(fp, f.name)
                        resultProgressRow.visibility = View.VISIBLE
                        resultProgress.progress = progress
                        resultProgressText.text = "$progress% · ${Format.remainingText(dur, pos)}"
                        resultPill.visibility = View.VISIBLE
                    } else {
                        resultProgressRow.visibility = View.GONE
                        resultPill.visibility = View.GONE
                    }
                }
            }
        }
        val anim = AnimationUtils.loadAnimation(ctx, R.anim.tile_appear)
        anim.startOffset = (position % 12) * 40L
        holder.binding.root.startAnimation(anim)
    }

    override fun getItemCount(): Int = items.size
}
