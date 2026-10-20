package com.bibigyn.app.ui.home

import android.content.res.Resources
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.animation.AnimationUtils
import androidx.recyclerview.widget.RecyclerView
import com.bibigyn.app.R
import com.bibigyn.app.data.colorFromString
import com.bibigyn.app.databinding.ItemRailCardBinding

/**
 * Horizontal-rail adapter for "Continue Assistindo" + future rails (v1.8.0).
 *
 * Each card mirrors the browse-grid tile style: 200dp wide × 200dp tall
 * thumbnail with top + bottom scrims, overlaid title/subtitle, optional
 * progress bar and ▶/✓ badges.
 *
 * Animations
 * ----------
 *  • [tile_appear] staggered fade-in + slide-up on first bind.
 *  • Focus change — scale 1.0 ↔ 1.06, elevation 0 ↔ 16dp, pink halo
 *    ring toggled.
 */
data class RailItem(
    val title: String,
    val subtitle: String,
    val icon: String,
    val hasProgress: Boolean,
    val progress: Int,          // 0..100
    val isWatched: Boolean,
    val hasResume: Boolean,
    val colorHint: String? = null
)

class RailAdapter(
    private val items: List<RailItem>,
    private val onClick: (RailItem) -> Unit
) : RecyclerView.Adapter<RailAdapter.VH>() {

    inner class VH(val binding: ItemRailCardBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos != RecyclerView.NO_POSITION) onClick(items[pos])
            }
            binding.root.isFocusable = true
            binding.root.isFocusableInTouchMode = true
            binding.root.setOnFocusChangeListener { _, hasFocus ->
                animateFocus(hasFocus)
            }
        }

        fun animateFocus(hasFocus: Boolean) {
            val scale = if (hasFocus) 1.06f else 1f
            binding.cardRoot.animate().scaleX(scale).scaleY(scale)
                .setDuration(180)
                .start()
            binding.cardRoot.cardElevation = if (hasFocus) 16f else 0f
            binding.focusRing.visibility = if (hasFocus) View.VISIBLE else View.INVISIBLE
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val inflater = LayoutInflater.from(parent.context)
        return VH(ItemRailCardBinding.inflate(inflater, parent, false))
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = items[position]
        val res = holder.itemView.resources

        with(holder.binding) {
            cardIcon.text = item.icon
            cardTitle.text = item.title
            cardSubtitle.text = item.subtitle

            // Per-card gradient background derived from the title hash (or explicit hint).
            val baseColor = colorFromString(item.colorHint ?: item.title)
            cardBg.background = railGradientDrawable(res, baseColor)

            // Progress bar
            progressBar.visibility = if (item.hasProgress) View.VISIBLE else View.GONE
            if (item.hasProgress) {
                val cardWidthPx = (200 * res.displayMetrics.density).toInt()
                val lp = progressBar.layoutParams
                lp.width = (cardWidthPx * item.progress / 100).coerceAtLeast(1)
                progressBar.layoutParams = lp
            }

            // Watched badge
            watchedBadge.visibility = if (item.isWatched) View.VISIBLE else View.GONE

            // Continue badge
            continueBadge.visibility = if (item.hasResume) View.VISIBLE else View.GONE
        }

        // Staggered appear animation
        val anim = AnimationUtils.loadAnimation(holder.itemView.context, R.anim.tile_appear)
        anim.startOffset = (position % 12) * 40L
        holder.binding.root.startAnimation(anim)
    }

    override fun getItemCount(): Int = items.size

    private fun railGradientDrawable(res: Resources, baseColor: Int): GradientDrawable {
        val r = Color.red(baseColor)
        val g = Color.green(baseColor)
        val b = Color.blue(baseColor)
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
}
