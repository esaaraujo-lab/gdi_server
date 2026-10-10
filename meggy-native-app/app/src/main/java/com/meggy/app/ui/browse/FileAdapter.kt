package com.meggy.app.ui.browse

import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.animation.AnimationUtils
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.meggy.app.R
import com.meggy.app.data.FileItem
import com.meggy.app.data.colorFromString
import com.meggy.app.databinding.ItemRailCardBinding

/**
 * Netflix/Disney+ inspired tile grid adapter (v1.8.0).
 *
 * Each card is a 200dp-wide tile with:
 *  - A 200dp tall thumbnail whose gradient is derived from the file name hash.
 *  - Top + bottom scrims so the overlaid title/subtitle stay legible.
 *  - Pink "▶ continuar" and green ✓ badges in the top corners.
 *  - A pink→purple progress bar at the very bottom (videos only).
 *
 * Animations
 * ----------
 *  • [tile_appear] — staggered fade-in + slide-up played on first bind.
 *    Stagger delay = position × 40ms (capped at 320ms).
 *  • Focus change — animated scale 1.0 ↔ 1.06, elevation 0 ↔ 16dp, and
 *    the [focus_ring] view toggles between INVISIBLE / VISIBLE so the
 *    pink halo + crisp border wrap the focused tile.
 *
 * Click handling: folders invoke [onFolder], files invoke [onFile].
 */
class FileAdapter(
    private val onFolder: (FileItem) -> Unit,
    private val onFile: (FileItem) -> Unit
) : ListAdapter<FileItem, FileAdapter.VH>(DIFF) {

    private var resumedNames: Set<String> = emptySet()
    private var watchedNames: Set<String> = emptySet()
    private val appearHandler = Handler(Looper.getMainLooper())

    /** Feeds the two badge sets for the current folder and refreshes every row. */
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
                animateFocus(hasFocus)
            }
        }

        /** Smooth scale + elevation + ring toggle on focus change. */
        fun animateFocus(hasFocus: Boolean) {
            val scale = if (hasFocus) 1.06f else 1f
            binding.cardRoot.animate().scaleX(scale).scaleY(scale)
                .setDuration(180)
                .withEndAction(null)
                .start()
            binding.cardRoot.cardElevation = if (hasFocus) 16f else 0f
            binding.focusRing.visibility = if (hasFocus) View.VISIBLE else View.INVISIBLE
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
        // Strip horizontal margins so grid spacing is symmetric (parent
        // ItemOffsetsDecoration handles inter-tile gutters).
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
            cardBg.background = tileGradientDrawable(res, baseColor)

            // Progress bar on videos (static 35% — matches web preview).
            val isVideo = item.isVideo
            progressBar.visibility = if (isVideo) View.VISIBLE else View.GONE
            if (isVideo) {
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

        // Staggered tile-appear animation (first bind only).
        playAppear(holder, position)
    }

    private fun playAppear(holder: VH, position: Int) {
        val anim = AnimationUtils.loadAnimation(holder.itemView.context, R.anim.tile_appear)
        val delay = (position % 12) * 40L  // cap stagger so deep scroll positions don't wait
        anim.startOffset = delay.coerceAtMost(320L)
        holder.binding.root.startAnimation(anim)
    }

    /** Two-stop diagonal gradient with the per-name colour tinted at the top-left. */
    private fun tileGradientDrawable(res: android.content.res.Resources, baseColor: Int): GradientDrawable {
        val r = Color.red(baseColor)
        val g = Color.green(baseColor)
        val b = Color.blue(baseColor)
        // 35% opacity tint at the start, fading to near-black ink at the end.
        val start = Color.argb(0x59, r, g, b)
        val end = Color.parseColor("#FF0F1218")
        val cornerPx = (16 * res.displayMetrics.density)
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
