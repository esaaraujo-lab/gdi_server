package com.meggy.app.ui.mylist

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.animation.AnimationUtils
import android.widget.Toast
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.meggy.app.R
import com.meggy.app.data.FileItem
import com.meggy.app.data.colorFromString
import com.meggy.app.data.monogramFor
import com.meggy.app.databinding.ItemMylistCardBinding
import com.meggy.app.util.CardGradient
import com.meggy.app.util.FocusAnimator
import com.meggy.app.util.Format
import com.meggy.app.util.SessionManager
import com.meggy.app.util.TvUtils

/**
 * v2.7.6 — Minha lista — abas Aulas (e Concursos).
 *
 * Cards com chip de tipo ("AULA"), thumb/monograma, título, progresso
 * real + % (vídeos/áudios com resume), ⭐ rosa para remover dos
 * favoritos. Foco via FocusAnimator.attachCard.
 * O "Continuar" (abrir) é o clique no card — a aba Cursos usa
 * [MyListCourseAdapter], que tem o botão Continuar rosa.
 */
class MyListAdapter(
    private val onFile: (FileItem) -> Unit
) : ListAdapter<FileItem, MyListAdapter.VH>(DIFF) {

    private var currentFolderPath: String = ""

    fun setFolderPath(path: String) {
        currentFolderPath = path
    }

    inner class VH(val binding: ItemMylistCardBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos == RecyclerView.NO_POSITION) return@setOnClickListener
                onFile(getItem(pos))
            }
            FocusAnimator.attach(binding.root, TvUtils.isTv(binding.root.context))
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val inflater = LayoutInflater.from(parent.context)
        return VH(ItemMylistCardBinding.inflate(inflater, parent, false))
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = getItem(position)
        val res = holder.itemView.resources
        val ctx = holder.itemView.context

        with(holder.binding) {
            mylistMeta.text = item.folderPath ?: ""
            mylistTypeChip.text = when {
                item.isVideo -> "AULA"
                item.isAudio -> "ÁUDIO"
                item.isPdf -> "PDF"
                item.isMarkdown -> "MD"
                item.isFolder -> "CURSO"
                else -> "ARQUIVO"
            }
            mylistTitle.text = item.name
            mylistBg.background = CardGradient.drawable(res, colorFromString(item.name))

            val thumb = item.thumbnailLink
            if (!thumb.isNullOrBlank() && (item.isVideo || item.isAudio || item.isPdf)) {
                mylistThumb.visibility = View.VISIBLE
                mylistMonogram.visibility = View.GONE
                mylistThumb.load(thumb) { error(R.drawable.card_gradient_pink) }
            } else {
                mylistThumb.visibility = View.GONE
                mylistMonogram.visibility = View.VISIBLE
                mylistMonogram.text = monogramFor(item.name)
            }

            val sm = SessionManager.get(ctx)
            val fp = item.folderPath ?: currentFolderPath
            val progress = if (item.isVideo || item.isAudio) sm.getResumeProgress(fp, item.name) else 0
            if (progress > 0) {
                val pos = sm.getResume(fp, item.name)
                val dur = sm.getResumeDuration(fp, item.name)
                mylistProgressRow.visibility = View.VISIBLE
                mylistProgress.progress = progress
                mylistProgressText.text = "$progress% · ${Format.remainingText(dur, pos)}"
                mylistContinue.visibility = View.VISIBLE
            } else {
                mylistProgressRow.visibility = View.GONE
                mylistContinue.visibility = if (item.isVideo || item.isAudio) View.VISIBLE else View.GONE
            }

            mylistFav.setOnClickListener {
                sm.toggleFavorite(item.copy(folderPath = fp))
                Toast.makeText(ctx, "Removido da Minha lista", Toast.LENGTH_SHORT).show()
            }
            mylistContinue.setOnClickListener { onFile(item) }
        }

        val anim = AnimationUtils.loadAnimation(holder.itemView.context, R.anim.tile_appear)
        anim.startOffset = (position % 12) * 40L
        holder.binding.root.startAnimation(anim)
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
