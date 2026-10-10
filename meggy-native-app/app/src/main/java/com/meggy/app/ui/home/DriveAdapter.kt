package com.meggy.app.ui.home

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.meggy.app.data.DriveItem
import com.meggy.app.databinding.ItemDriveBinding

/**
 * Adapter for the 12 root drives on the home screen.
 *
 * Uses ListAdapter + DiffUtil so the same adapter can also render the user's
 * enrolled courses (mapped onto DriveItem via the coursePath index) if needed.
 */
class DriveAdapter(
    private val onClick: (DriveItem) -> Unit
) : ListAdapter<DriveItem, DriveAdapter.VH>(DIFF) {

    inner class VH(val binding: ItemDriveBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            // D-pad / keyboard focus support.
            binding.root.isFocusable = true
            binding.root.isFocusableInTouchMode = true
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos != RecyclerView.NO_POSITION) onClick(getItem(pos))
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val inflater = LayoutInflater.from(parent.context)
        return VH(ItemDriveBinding.inflate(inflater, parent, false))
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = getItem(position)
        with(holder.binding) {
            driveName.text = item.name
            // Icon is a single emoji per drive "category" — drawn as text in the
            // circular thumbnail so we don't need extra image assets.
            driveIcon.text = driveEmoji(item)
        }
    }

    private fun driveEmoji(item: DriveItem): String = when (item.icon) {
        "trt"         -> "\uD83C\uDFDB\uFE0F"  // classical building
        "courses"     -> "\uD83D\uDCDA"        // books
        "vestibular"  -> "\uD83C\uDF93"        // graduation cap
        "music"       -> "\uD83C\uDFB5"        // musical note
        "career"      -> "\uD83D\uDCBC"        // briefcase
        "fitness"     -> "\uD83D\uDCAA"        // flexed biceps
        "health"      -> "\u2764\uFE0F"        // heart
        "tribunais"   -> "\u2696\uFE0F"        // scales
        "alfa"        -> "\uD83C\uDFC6"        // trophy
        "oab"         -> "\u2696\uFE0F"        // scales
        else          -> "\uD83D\uDCC2"        // open file folder
    }

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<DriveItem>() {
            override fun areItemsTheSame(o: DriveItem, n: DriveItem) = o.index == n.index
            override fun areContentsTheSame(o: DriveItem, n: DriveItem) = o == n
        }
    }
}
