package com.meggy.app.ui.home

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.meggy.app.data.DriveItem
import com.meggy.app.databinding.ItemDriveCardBinding

/**
 * Adapter for the legacy 12-root-drive grid (kept for backward compatibility).
 *
 * v1.5.0: renders each drive as a Netflix-style gradient card via
 * [ItemDriveCardBinding]. Drive emoji is now stored directly on [DriveItem.icon]
 * so no lookup table is needed.
 */
class DriveAdapter(
    private val onClick: (DriveItem) -> Unit
) : ListAdapter<DriveItem, DriveAdapter.VH>(DIFF) {

    inner class VH(val binding: ItemDriveCardBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
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
        return VH(ItemDriveCardBinding.inflate(inflater, parent, false))
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = getItem(position)
        with(holder.binding) {
            driveName.text = item.name
            driveIcon.text = item.icon
        }
    }

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<DriveItem>() {
            override fun areItemsTheSame(o: DriveItem, n: DriveItem) = o.index == n.index
            override fun areContentsTheSame(o: DriveItem, n: DriveItem) = o == n
        }
    }
}
