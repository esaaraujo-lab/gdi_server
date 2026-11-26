package com.meggy.app.ui.player

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.meggy.app.R
import com.meggy.app.data.FileItem
import com.meggy.app.util.LibraryCovers
import com.meggy.app.util.LessonDescription
import com.meggy.app.util.ThumbArt

/**
 * 2.7.58 — lista "A seguir" do player (desenho §4.5): as aulas da
 * playlist ACTUAL (PlaylistManager), a actual em rosa, o toque
 * salta pelo playItem existente. Só apresentação — nenhum dado
 * novo, nenhuma chamada de rede.
 */
class UpNextAdapter(
    private val onItem: (FileItem) -> Unit
) : RecyclerView.Adapter<UpNextAdapter.VH>() {

    private var items: List<FileItem> = emptyList()
    private var currentIndex: Int = -1

    fun submit(newItems: List<FileItem>, current: Int) {
        items = newItems
        currentIndex = current
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_upnext, parent, false)
        return VH(view)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = items[position]
        val ctx = holder.itemView.context
        val folder = item.folderLabel?.takeIf { it.isNotBlank() }
            ?: LessonDescription.folderNameFromPath(item.folderPath)
        val shown = LessonDescription.displayNameForLesson(item.name, folder)
            ?: item.name
        holder.title.text = shown
        val isCurrent = position == currentIndex
        holder.title.setTextColor(
            ContextCompat.getColor(
                ctx,
                if (isCurrent) R.color.md_primary else R.color.md_on_surface
            )
        )
        holder.marker.visibility = if (isCurrent) View.VISIBLE else View.INVISIBLE
        val remote = LibraryCovers.remoteCoverStrict(
            item.thumbnailLink, item.name, item.folderLabel, item.folderPath
        )
        if (!remote.isNullOrBlank()) {
            holder.thumb.load(remote) {
                error(ThumbArt.coverResForPath(item.folderPath ?: ""))
            }
        } else {
            holder.thumb.setImageResource(ThumbArt.coverResForPath(item.folderPath ?: ""))
        }
        holder.itemView.setOnClickListener { onItem(item) }
    }

    override fun getItemCount(): Int = items.size

    class VH(view: View) : RecyclerView.ViewHolder(view) {
        val thumb: ImageView = view.findViewById(R.id.upnextThumb)
        val title: TextView = view.findViewById(R.id.upnextTitle)
        val marker: TextView = view.findViewById(R.id.upnextMarker)
    }
}
