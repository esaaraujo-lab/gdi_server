package com.meggy.app.ui.browse

import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.meggy.app.data.FileItem
import com.meggy.app.data.colorFromString
import com.meggy.app.databinding.ItemRailCardBinding

/**
 * Netflix-style file/folder grid adapter (v1.5.0).
 *
 * Reuses [ItemRailCardBinding] (the same layout used by the home rails) but
 * overrides the root width to MATCH_PARENT so each card fills its grid column.
 *
 * Each card carries:
 *  - A gradient background whose hue is derived from the file name hash.
 *  - A progress bar on video cards (static 35% — matches the web preview; the
 *    real per-video resume percentage is shown on the player).
 *  - A green ✓ "watched" badge for videos previously watched to the end.
 *  - A pink "▶ continuar" badge for videos with a saved resume position.
 *
 * Click handling is delegated to two callbacks: [onFolder] for folders and
 * [onFile] for downloadable files.
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

    inner class VH(val binding: ItemRailCardBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.isFocusable = true
            binding.root.isFocusableInTouchMode = true
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos == RecyclerView.NO_POSITION) return@setOnClickListener
                val item = getItem(pos)
                if (item.isFolder) onFolder(item) else onFile(item)
            }
            binding.root.setOnFocusChangeListener { _, hasFocus ->
                val scale = if (hasFocus) 1.05f else 1f
                binding.root.scaleX = scale
                binding.root.scaleY = scale
                binding.root.z = if (hasFocus) 8f else 0f
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val inflater = LayoutInflater.from(parent.context)
        val vh = VH(ItemRailCardBinding.inflate(inflater, parent, false))
        // Cards in the grid fill their column width.
        vh.binding.root.layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        )
        // Remove the horizontal end-margin so grid spacing is symmetric.
        val lp = vh.binding.root.layoutParams as? ViewGroup.MarginLayoutParams
        lp?.let {
            it.marginEnd = 0
            it.marginStart = 0
            vh.binding.root.layoutParams = it
        }
        return vh
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = getItem(position)
        val res = holder.itemView.resources
        with(holder.binding) {
            // Title & subtitle
            cardTitle.text = item.name
            cardSubtitle.text = when {
                item.isFolder -> "pasta"
                item.isVideo -> "vídeo · ${item.humanSize}"
                item.isAudio -> "áudio · ${item.humanSize}"
                item.isPdf -> "PDF · ${item.humanSize}"
                else -> item.humanSize
            }
            cardIcon.text = when {
                item.isFolder -> "\uD83D\uDCC1" // 📁
                item.isVideo  -> "\uD83C\uDFA5" // 🎥
                item.isAudio  -> "\uD83C\uDFB5" // 🎵
                item.isPdf    -> "\uD83D\uDCC4" // 📄
                else          -> "\uD83D\uDCC4" // 📄
            }

            // Per-card gradient background derived from the file name hash.
            val baseColor = colorFromString(item.name)
            cardBg.background = gridCardDrawable(res, baseColor)

            // Progress bar on videos (static 35% — matches web preview).
            val isVideo = item.isVideo
            progressBar.visibility = if (isVideo) View.VISIBLE else View.GONE
            if (isVideo) {
                // Width relative to the card thumbnail (match_parent in grid).
                cardBg.post {
                    val w = cardBg.width
                    if (w > 0) {
                        val lp = progressBar.layoutParams
                        lp.width = (w * 35 / 100).coerceAtLeast(1)
                        progressBar.layoutParams = lp
                    }
                }
            }

            // "continuar" badge on videos with a resume position.
            val showResume = isVideo && item.name in resumedNames
            continueBadge.visibility = if (showResume) View.VISIBLE else View.GONE

            // Watched ✓ on videos watched to the end.
            val showWatched = isVideo && item.name in watchedNames
            watchedBadge.visibility = if (showWatched) View.VISIBLE else View.GONE
        }
    }

    private fun gridCardDrawable(res: android.content.res.Resources, baseColor: Int): GradientDrawable {
        val r = Color.red(baseColor)
        val g = Color.green(baseColor)
        val b = Color.blue(baseColor)
        val start = Color.argb(0x33, r, g, b)
        val end = Color.parseColor("#1a1a2e")
        val cornerPx = (10 * res.displayMetrics.density)
        return GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            intArrayOf(start, end)
        ).apply {
            cornerRadius = cornerPx
        }
    }

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<FileItem>() {
            override fun areItemsTheSame(o: FileItem, n: FileItem) = o.id == n.id
            override fun areContentsTheSame(o: FileItem, n: FileItem) = o == n
        }
    }
}
