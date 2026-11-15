package com.vovofit.app.ui.mylist

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.vovofit.app.data.coverResForPath
import com.vovofit.app.databinding.ItemMylistCardBinding
import com.vovofit.app.util.FocusAnimator
import com.vovofit.app.util.TapFeedback
import com.vovofit.app.util.CoverLibrary
import com.vovofit.app.util.loadCoverChain
import com.vovofit.app.util.SessionManager
import com.vovofit.app.util.TvUtils

/**
 * v1.0.4 — "Documentos marcados" (bookmarks dos leitores PDF/MD).
 * Reutiliza o card da Minha lista: chip com o tipo, capa do drive, nome.
 */
class BookmarkAdapter(
    private val onOpen: (SessionManager.Bookmark) -> Unit
) : ListAdapter<SessionManager.Bookmark, BookmarkAdapter.VH>(DIFF) {

    inner class VH(val binding: ItemMylistCardBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos == RecyclerView.NO_POSITION) return@setOnClickListener
                onOpen(getItem(pos))
            }
            FocusAnimator.attach(binding.root, TvUtils.isTv(binding.root.context))
            TapFeedback.attachPress(binding.root, TvUtils.isTv(binding.root.context))
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val inflater = LayoutInflater.from(parent.context)
        return VH(ItemMylistCardBinding.inflate(inflater, parent, false))
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val b = getItem(position)
        with(holder.binding) {
            mylistTypeChip.text = b.kind.uppercase()
            mylistTitle.text = b.name
            mylistMeta.text = b.path
            // v1.0.8 camada 3 — documento marcado mostra a imagem da
            // biblioteca pelo nome/pasta quando houver match; senao a capa
            // do drive (nunca monograma).
            mylistThumb.visibility = android.view.View.VISIBLE
            mylistMonogram.visibility = android.view.View.GONE
            mylistThumb.loadCoverChain(
                null, coverResForPath(b.path), b.name, b.path
            )
            mylistProgressRow.visibility = android.view.View.GONE
            mylistContinue.visibility = android.view.View.GONE
            mylistFav.visibility = android.view.View.GONE
        }
    }

    companion object {
        val DIFF = object : DiffUtil.ItemCallback<SessionManager.Bookmark>() {
            override fun areItemsTheSame(oldItem: SessionManager.Bookmark, newItem: SessionManager.Bookmark): Boolean =
                oldItem.path == newItem.path
            override fun areContentsTheSame(oldItem: SessionManager.Bookmark, newItem: SessionManager.Bookmark): Boolean =
                oldItem == newItem
        }
    }
}
