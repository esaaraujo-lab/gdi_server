package com.meggy.app.ui.search

import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.animation.AnimationUtils
import androidx.recyclerview.widget.RecyclerView
import com.meggy.app.R
import com.meggy.app.data.DriveItem
import com.meggy.app.data.FileItem
import com.meggy.app.data.colorFromString
import com.meggy.app.databinding.ItemRailCardBinding

/**
 * v2.0.0 — Sealed result type used by [SearchActivity].
 * Either a Drive (folder) or a File (playable item).
 */
sealed class SearchResult {
    data class Drive(val drive: DriveItem) : SearchResult()
    data class File(val file: FileItem) : SearchResult()
}

/**
 * Adapter that renders [SearchResult] items as Netflix-style tiles.
 * Uses the same item_rail_card.xml layout as the browse grid so the
 * search results look visually identical.
 */
class SearchResultAdapter(
    private val onDrive: (DriveItem) -> Unit,
    private val onFile: (FileItem) -> Unit
) : RecyclerView.Adapter<SearchResultAdapter.VH>() {

    private val items = mutableListOf<SearchResult>()

    fun submit(newItems: List<SearchResult>) {
        items.clear()
        items.addAll(newItems)
        notifyDataSetChanged()
    }

    inner class VH(val binding: ItemRailCardBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.isFocusable = true
            binding.root.isFocusableInTouchMode = true
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos == RecyclerView.NO_POSITION) return@setOnClickListener
                when (val item = items[pos]) {
                    is SearchResult.Drive -> onDrive(item.drive)
                    is SearchResult.File -> onFile(item.file)
                }
            }
            binding.root.setOnFocusChangeListener { _, hasFocus -> animateFocus(hasFocus) }
        }

        fun animateFocus(hasFocus: Boolean) {
            val scale = if (hasFocus) 1.06f else 1f
            binding.cardRoot.animate().scaleX(scale).scaleY(scale).setDuration(180).start()
            binding.cardRoot.cardElevation = if (hasFocus) 16f else 0f
            binding.focusRing.visibility = if (hasFocus) View.VISIBLE else View.INVISIBLE
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val inflater = LayoutInflater.from(parent.context)
        val vh = VH(ItemRailCardBinding.inflate(inflater, parent, false))
        vh.binding.root.layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        )
        return vh
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val res = holder.itemView.resources
        when (val item = items[position]) {
            is SearchResult.Drive -> {
                val d = item.drive
                with(holder.binding) {
                    cardTitle.text = d.name
                    cardSubtitle.text = "drive"
                    cardIcon.text = d.icon
                    val base = colorFromString(d.name)
                    cardBg.background = gradient(res, base)
                    progressBar.visibility = View.GONE
                    watchedBadge.visibility = View.GONE
                    continueBadge.visibility = View.GONE
                }
            }
            is SearchResult.File -> {
                val f = item.file
                with(holder.binding) {
                    cardTitle.text = f.name
                    cardSubtitle.text = when {
                        f.isVideo -> "vídeo"
                        f.isAudio -> "áudio"
                        f.isPdf -> "PDF"
                        else -> f.humanSize
                    }
                    cardIcon.text = when {
                        f.isVideo -> "\uD83C\uDFA5"
                        f.isAudio -> "\uD83C\uDFB5"
                        f.isPdf -> "\uD83D\uDCC4"
                        else -> "\uD83D\uDCC4"
                    }
                    val base = colorFromString(f.name)
                    cardBg.background = gradient(res, base)
                    progressBar.visibility = View.GONE
                    watchedBadge.visibility = View.GONE
                    continueBadge.visibility = View.GONE
                }
            }
        }
        // Staggered appear
        val anim = AnimationUtils.loadAnimation(holder.itemView.context, R.anim.tile_appear)
        anim.startOffset = (position % 12) * 40L
        holder.binding.root.startAnimation(anim)
    }

    override fun getItemCount(): Int = items.size

    private fun gradient(res: android.content.res.Resources, baseColor: Int): GradientDrawable {
        val r = Color.red(baseColor); val g = Color.green(baseColor); val b = Color.blue(baseColor)
        val start = Color.argb(0x59, r, g, b)
        val end = Color.parseColor("#FF0F1218")
        return GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(start, end)).apply {
            cornerRadius = 16 * res.displayMetrics.density
        }
    }
}
