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
 * v1.2.0: supports two badges per video card —
 *  • "▶ continuar" pill on videos that have a non-zero resume position in the
 *    current folder (set via [setResumeAndWatched]).
 *  • "✓" checkmark on videos previously watched to the end.
 */
class FileAdapter(
    private val onFolder: (FileItem) -> Unit,
    private val onFile: (FileItem) -> Unit
) : ListAdapter<FileItem, FileAdapter.VH>(DIFF) {

    private var resumedNames: Set<String> = emptySet()
    private var watchedNames: Set<String> = emptySet()

    /**
     * Feeds the two badge sets for the current folder and refreshes every row.
     * Call this right after [submitList].
     */
    fun setResumeAndWatched(resumed: Set<String>, watched: Set<String>) {
        resumedNames = resumed
        watchedNames = watched
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
            // v1.2.0: "continuar" badge on videos with a resume position.
            val showResume = item.isVideo && item.name in resumedNames
            lastWatchedBadge.visibility = if (showResume) View.VISIBLE else View.GONE
            // v1.2.0: watched checkmark on videos watched to the end.
            val showWatched = item.isVideo && item.name in watchedNames
            watchedCheck.visibility = if (showWatched) View.VISIBLE else View.GONE
        }
    }

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<FileItem>() {
            override fun areItemsTheSame(o: FileItem, n: FileItem) = o.id == n.id
            override fun areContentsTheSame(o: FileItem, n: FileItem) = o == n
        }
    }
}
