package com.meggy.app.ui.home

import android.content.res.Resources
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.meggy.app.data.DriveItem
import com.meggy.app.data.colorFromString
import com.meggy.app.databinding.ItemDriveCardBinding

/**
 * Horizontal-rail adapter for the 12 root drives.
 *
 * Each card is 160dp wide with a 170dp tall gradient thumbnail whose hue is derived
 * from the drive name (so each drive has a distinct colour identity, matching the
 * web preview). TV focus scales the card by 1.05× to mimic the Netflix hover effect.
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
                val scale = if (hasFocus) 1.05f else 1f
                binding.root.scaleX = scale
                binding.root.scaleY = scale
                binding.root.z = if (hasFocus) 8f else 0f
            }
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
            driveIcon.background = driveCardDrawable(holder.itemView.resources, baseColor)
        }
    }

    override fun getItemCount(): Int = drives.size

    private fun driveCardDrawable(res: Resources, baseColor: Int): GradientDrawable {
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
