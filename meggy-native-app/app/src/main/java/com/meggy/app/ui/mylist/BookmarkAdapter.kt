package com.meggy.app.ui.mylist

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.meggy.app.databinding.ItemMylistCardBinding
import com.meggy.app.util.FocusAnimator
import com.meggy.app.util.LibraryCovers
import com.meggy.app.util.ThumbArt
import com.meggy.app.util.SessionManager
import com.meggy.app.util.TvUtils

/**
 * v2.7.6 — "Documentos marcados" (bookmarks dos leitores PDF/MD).
 * Reutiliza o card da Minha lista: chip com o tipo, monograma, nome.
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
            // 2.7.13 camada (3) ESTRITA: imagem da biblioteca pelo
            // nome/caminho do marcador; sem match, a capa gerada do
            // drive (ThumbArt) — nunca o livro 'geral' nem monograma.
            val coverRes = ThumbArt.coverResForPath(b.path)
            val libraryUrl = LibraryCovers.resolveStrict(
                b.name, b.path
            )
            if (libraryUrl != null) {
                mylistThumb.visibility = android.view.View.VISIBLE
                mylistMonogram.visibility = android.view.View.GONE
                mylistThumb.load(libraryUrl) {
                    error(coverRes)
                    listener(onError = { _, _ ->
                        mylistThumb.visibility = android.view.View.VISIBLE
                        mylistMonogram.visibility = android.view.View.GONE
                        mylistThumb.setImageResource(coverRes)
                    })
                }
            } else {
                mylistThumb.visibility = android.view.View.VISIBLE
                mylistMonogram.visibility = android.view.View.GONE
                mylistThumb.setImageResource(coverRes)
            }
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
