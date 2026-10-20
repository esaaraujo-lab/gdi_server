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
import com.bibigyn.app.data.DriveItem
import com.bibigyn.app.data.colorFromString
import com.bibigyn.app.databinding.ItemDriveCardBinding

/**
 * Horizontal-rail adapter for the 12 root drives (v1.8.0).
 *
 * Each card is a 150dp × 210dp poster-style tile with a per-drive
 * gradient derived from the drive name hash, big emoji icon, and the
 * drive name overlaid on a bottom scrim.
 *
 * Animations
 * ----------
 *  • [tile_appear] staggered fade-in + slide-up on first bind.
 *  • Focus change — scale 1.0 ↔ 1.06, elevation 0 ↔ 16dp, pink halo
 *    ring toggled.
 */
class DriveRailAdapter(
    private val drives: List<DriveItem>,
    private val onClick: (DriveItem) -> Unit
) : RecyclerView.Adapter<DriveRailAdapter.VH>() {

    inner class VH(val binding: ItemDriveCardBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos != RecyclerView.NO_POSITION) onClick(drives[pos])
            }
            binding.root.isFocusable = true
            binding.root.isFocusableInTouchMode = true
            binding.root.setOnFocusChangeListener { _, hasFocus ->
                animateFocus(hasFocus)
            }
        }

        fun animateFocus(hasFocus: Boolean) {
            val scale = if (hasFocus) 1.06f else 1f
            binding.driveCardRoot.animate().scaleX(scale).scaleY(scale)
                .setDuration(180)
                .start()
            binding.driveCardRoot.cardElevation = if (hasFocus) 16f else 0f
            binding.driveFocusRing.visibility = if (hasFocus) View.VISIBLE else View.INVISIBLE
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val inflater = LayoutInflater.from(parent.context)
        return VH(ItemDriveCardBinding.inflate(inflater, parent, false))
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val drive = drives[position]
        with(holder.binding) {
            driveIcon.text = drive.icon
            driveName.text = drive.name
            // Per-drive gradient background derived from the drive name hash.
            val baseColor = colorFromString(drive.name)
            driveBg.background = driveGradientDrawable(holder.itemView.resources, baseColor)
        }
        // Staggered appear animation
        val anim = AnimationUtils.loadAnimation(holder.itemView.context, R.anim.tile_appear)
        anim.startOffset = (position % 12) * 40L
        holder.binding.root.startAnimation(anim)
    }

    override fun getItemCount(): Int = drives.size

    private fun driveGradientDrawable(res: Resources, baseColor: Int): GradientDrawable {
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
