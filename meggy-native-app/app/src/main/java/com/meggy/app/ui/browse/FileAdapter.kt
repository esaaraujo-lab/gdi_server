package com.meggy.app.ui.browse

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.meggy.app.data.FileItem
import com.meggy.app.databinding.ItemFileBinding

/**
 * Adapter for the contents of a folder (mix of subfolders + files).
 *
 * Click handling is delegated to two callbacks: [onFolder] for folders and
 * [onFile] for downloadable files.
 *
 * v1.1.0: supports a "continuar de onde parou" badge — call [setLastWatched]
 * with the name of the video the user last played in this folder and the
 * matching card will show a pink "▶ continuar" pill.
 */
class FileAdapter(
    private val onFolder: (FileItem) -> Unit,
    private val onFile: (FileItem) -> Unit
) : ListAdapter<FileItem, FileAdapter.VH>(DIFF) {

    private var lastWatchedName: String? = null

    /** Highlights the video whose name matches [name] with a resume badge. */
    fun setLastWatched(name: String?) {
        lastWatchedName = name
        if (itemCount > 0) notifyItemRangeChanged(0, itemCount)
    }

    inner class VH(val binding: ItemFileBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.isFocusable = true
            binding.root.isFocusableInTouchMode = true
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos == RecyclerView.NO_POSITION) return@setOnClickListener
                val item = getItem(pos)
                if (item.isFolder) onFolder(item) else onFile(item)
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val inflater = LayoutInflater.from(parent.context)
        return VH(ItemFileBinding.inflate(inflater, parent, false))
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = getItem(position)
        with(holder.binding) {
            fileName.text = item.name
            fileMeta.text = when {
                item.isFolder -> "pasta"
                item.isVideo -> "vídeo · ${item.humanSize}"
                item.isPdf -> "PDF · ${item.humanSize}"
                else -> item.humanSize
            }
            fileIcon.text = when {
                item.isFolder -> "\uD83D\uDCC1"   // 📁
                item.isVideo  -> "\uD83C\uDFA5"   // 🎥
                item.isPdf    -> "\uD83D\uDCC4"   // 📄
                else          -> "\uD83D\uDCC4"   // 📄
            }
            // v1.1.0: resume badge
            val showBadge = item.isVideo && item.name == lastWatchedName
            lastWatchedBadge.visibility = if (showBadge) View.VISIBLE else View.GONE
        }
    }

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<FileItem>() {
            override fun areItemsTheSame(o: FileItem, n: FileItem) = o.id == n.id
            override fun areContentsTheSame(o: FileItem, n: FileItem) = o == n
        }
    }
}
