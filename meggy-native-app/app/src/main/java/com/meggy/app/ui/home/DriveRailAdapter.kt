package com.meggy.app.ui.home

import android.view.LayoutInflater
import android.view.ViewGroup
import android.view.animation.AnimationUtils
import android.widget.Toast
import androidx.recyclerview.widget.RecyclerView
import com.meggy.app.R
import com.meggy.app.data.DriveItem
import com.meggy.app.util.setWordEllipsized
import com.meggy.app.databinding.ItemDriveCardBinding
import com.meggy.app.util.FocusAnimator
import com.meggy.app.util.SessionManager
import com.meggy.app.util.TvUtils

/**
 * v2.7.6 — Rail "Explorar drives" (conceito home).
 *
 * Tile de ícone rosa com o emoji do drive (2.7.5) + nome 14sp +
 * linha de metadados (DriveItem.tagline, texto curado). Foco via
 * FocusAnimator.attachCard (anel 3dp da marca + escala + elevação).
 * O tile rosa é o token `drive_icon_tile` (por marca: rosa/laranja/lima).
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
            FocusAnimator.attachCard(binding.driveCardRoot, TvUtils.isTv(binding.root.context))
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val inflater = LayoutInflater.from(parent.context)
        return VH(ItemDriveCardBinding.inflate(inflater, parent, false))
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val drive = drives[position]
        with(holder.binding) {
            driveIcon.text = drive.icon  // patch: emoji do drive de volta (2.7.5)
            driveName.setWordEllipsized(drive.name)
            driveMeta.setWordEllipsized(drive.tagline)

            val coursePath = "/${drive.index}:/"
            val sm = SessionManager.get(holder.itemView.context)
            driveFavStar.text = if (sm.isFavoriteCourse(coursePath)) "⭐" else "☆"
            driveFavStar.setOnClickListener {
                val nowFav = sm.toggleFavoriteCourse(coursePath, drive.name)
                driveFavStar.text = if (nowFav) "⭐" else "☆"
                Toast.makeText(holder.itemView.context,
                    if (nowFav) "⭐ Curso adicionado à Minha lista"
                    else "Curso removido da Minha lista",
                    Toast.LENGTH_SHORT).show()
            }
        }
        val anim = AnimationUtils.loadAnimation(holder.itemView.context, R.anim.tile_appear)
        anim.startOffset = (position % 12) * 40L
        holder.binding.root.startAnimation(anim)
    }

    override fun getItemCount(): Int = drives.size
}
