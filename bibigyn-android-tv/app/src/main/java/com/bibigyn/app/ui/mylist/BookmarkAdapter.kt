package com.bibigyn.app.ui.mylist

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.bibigyn.app.R
import com.bibigyn.app.data.DriveItem
import com.bibigyn.app.util.CoverLibrary
import com.bibigyn.app.databinding.ItemMylistCardBinding
import com.bibigyn.app.util.FocusAnimator
import com.bibigyn.app.util.TapFeedback
import com.bibigyn.app.util.SessionManager
import com.bibigyn.app.util.TvUtils

/**
 * v2.1.5 — "Documentos marcados" (bookmarks dos leitores PDF/MD).
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
            // Camada 3 — biblioteca por tipo (nome do marcador →
            // caminho), ESTRITA (2.1.12, sem 'geral'); sem match, a
            // capa gerada do drive (nunca monograma; o bookmark não
            // tem thumb do Drive para a camada 2).
            val coverRes = DriveItem.coverResForPath(b.path)
            val libraryUrl = CoverLibrary.resolveStrict(
                holder.itemView.context, b.name, b.path
            )
            if (!libraryUrl.isNullOrBlank()) {
                mylistThumb.visibility = android.view.View.VISIBLE
                mylistMonogram.visibility = android.view.View.GONE
                mylistThumb.load(libraryUrl) {
                    error(coverRes ?: R.drawable.card_gradient_pink)
                    listener(onError = { _, _ ->
                        mylistThumb.visibility = android.view.View.VISIBLE
                        mylistMonogram.visibility = android.view.View.GONE
                        mylistThumb.setImageResource(coverRes ?: R.drawable.card_gradient_pink)
                    })
                }
            } else {
                mylistThumb.visibility = android.view.View.VISIBLE
                mylistMonogram.visibility = android.view.View.GONE
                mylistThumb.setImageResource(coverRes ?: R.drawable.card_gradient_pink)
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
