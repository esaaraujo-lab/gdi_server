package com.meggy.app.ui.home

import android.content.res.Resources
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.meggy.app.data.colorFromString
import com.meggy.app.databinding.ItemRailCardBinding

/**
 * Lightweight item rendered in a horizontal rail (Continue Assistindo, Cursos Recentes).
 *
 * Each card carries:
 *  - A gradient background whose hue is derived from [title] via [colorFromString] so
 *    every card visually differs even when icons are repeated.
 *  - An optional progress bar (pink→purple gradient) for partially-watched videos.
 *  - A green ✓ "watched" badge.
 *  - A pink "▶ continuar" badge for items with a saved resume position.
 *
 * TV focus scales the card by 1.05× to mimic the Netflix hover effect.
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
                val scale = if (hasFocus) 1.05f else 1f
                binding.root.scaleX = scale
                binding.root.scaleY = scale
                binding.root.z = if (hasFocus) 8f else 0f
            }
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
            cardBg.background = railCardDrawable(res, baseColor)

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
    }

    override fun getItemCount(): Int = items.size

    private fun railCardDrawable(res: Resources, baseColor: Int): GradientDrawable {
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
}
