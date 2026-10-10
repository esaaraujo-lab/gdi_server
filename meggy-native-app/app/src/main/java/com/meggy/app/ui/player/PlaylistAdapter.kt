package com.meggy.app.ui.player

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.meggy.app.data.FileItem
import com.meggy.app.databinding.ItemPlaylistBinding

/**
 * Adapter for the playlist sidebar in PlayerActivity.
 *
 * Highlights the currently-playing entry in Meggy pink. Clicking an entry
 * notifies [onClick] with the absolute position so PlayerActivity can jump to
 * it via [com.meggy.app.util.PlaylistManager.setIndex].
 */
class PlaylistAdapter(
    private val items: List<FileItem>,
    private var currentPos: Int,
    private val onClick: (Int) -> Unit
) : RecyclerView.Adapter<PlaylistAdapter.VH>() {

    inner class VH(val binding: ItemPlaylistBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos != RecyclerView.NO_POSITION) onClick(pos)
            }
            binding.root.isFocusable = true
            binding.root.isFocusableInTouchMode = true
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val inflater = LayoutInflater.from(parent.context)
        return VH(ItemPlaylistBinding.inflate(inflater, parent, false))
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = items[position]
        with(holder.binding) {
            playlistIndex.text = "${position + 1}"
            playlistTitle.text = item.name
            val isCurrent = position == currentPos
            if (isCurrent) {
                root.setBackgroundColor(0x33FF8B9F.toInt())
                playlistIndex.setTextColor(0xFFFF8B9F.toInt())
                playlistTitle.setTextColor(0xFFFF8B9F.toInt())
                playlistTitle.setTypeface(null, android.graphics.Typeface.BOLD)
                nowPlayingDot.visibility = View.VISIBLE
            } else {
                root.setBackgroundColor(0x00000000)
                playlistIndex.setTextColor(0xFF8B949E.toInt())
                playlistTitle.setTextColor(0xFFE6EDF3.toInt())
                playlistTitle.setTypeface(null, android.graphics.Typeface.NORMAL)
                nowPlayingDot.visibility = View.GONE
            }
        }
    }

    override fun getItemCount(): Int = items.size

    fun updateCurrent(pos: Int) {
        val old = currentPos
        currentPos = pos
        if (old in items.indices) notifyItemChanged(old)
        if (pos in items.indices && pos != old) notifyItemChanged(pos)
    }
}
