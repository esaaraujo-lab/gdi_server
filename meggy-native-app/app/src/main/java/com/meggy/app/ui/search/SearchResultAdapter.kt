package com.meggy.app.ui.search

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.animation.AnimationUtils
import android.widget.Toast
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.meggy.app.R
import com.meggy.app.data.DriveItem
import com.meggy.app.data.FileItem
import com.meggy.app.data.colorFromString
import com.meggy.app.databinding.ItemSearchResultBinding
import com.meggy.app.util.CardGradient
import com.meggy.app.util.FocusAnimator
import com.meggy.app.util.TapFeedback
import com.meggy.app.util.Format
import com.meggy.app.util.SessionManager
import com.meggy.app.util.ThumbArt
import com.meggy.app.util.LibraryCovers
import com.meggy.app.util.TvUtils

/**
 * v2.0.0 — Tipo de resultado usado pela [SearchActivity].
 */
sealed class SearchResult {
    data class Drive(val drive: DriveItem) : SearchResult()
    data class File(val file: FileItem) : SearchResult()
}

/**
 * v2.7.6 — Resultados como cards horizontais (conceito Buscar): thumb/
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
            // R18B (Bug 1 #8): 1.05x na TV — ±22,4dp < 32dp de
            // respiro, anel inteiro; o halo vai na raiz do layout.
            FocusAnimator.attach(binding.root, TvUtils.isTv(binding.root.context), scaleTv = FocusAnimator.SCALE_TV_DENSE)
            TapFeedback.attachPress(binding.root, TvUtils.isTv(binding.root.context))
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
                    // v2.7.11 onda 2 + camada (3) ESTRITA (2.7.13, sem
                    // 'geral') — resultado de drive: imagem da biblioteca
                    // pelo nome do drive; sem match, a capa gerada do
                    // drive (nunca monograma).
                    resultThumb.visibility = View.VISIBLE
                    resultMonogram.visibility = View.GONE
                    val libraryUrl = LibraryCovers.resolveStrict(d.name)
                    if (libraryUrl != null) {
                        resultThumb.load(libraryUrl) {
                            error(ThumbArt.coverResForDriveIndex(d.index))
                            listener(onError = { _, _ ->
                                resultThumb.setImageResource(ThumbArt.coverResForDriveIndex(d.index))
                            })
                        }
                    } else {
                        resultThumb.setImageResource(ThumbArt.coverResForDriveIndex(d.index))
                    }
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
                    // v2.7.11 onda 2 + camada (3) ESTRITA (2.7.13, sem
                    // 'geral') — sem thumb, a imagem da biblioteca pelo
                    // nome do arquivo/pasta; sem match, a capa gerada do
                    // drive (nunca monograma).
                    val coverRes = ThumbArt.coverResForPath(f.folderPath ?: "")
                    val thumb = LibraryCovers.remoteCoverStrict(f.thumbnailLink, f.name, f.folderPath)
                    if (!thumb.isNullOrBlank() && (f.isVideo || f.isAudio || f.isPdf)) {
                        resultThumb.visibility = View.VISIBLE
                        resultMonogram.visibility = View.GONE
                        resultThumb.load(thumb) {
                            error(coverRes)
                            listener(onError = { _, _ -> resultThumb.setImageResource(coverRes) })
                        }
                    } else {
                        resultThumb.visibility = View.VISIBLE
                        resultMonogram.visibility = View.GONE
                        resultThumb.setImageResource(coverRes)
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
