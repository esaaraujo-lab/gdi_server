package com.vovofit.app.ui.home

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.animation.AnimationUtils
import android.widget.Toast
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.vovofit.app.R
import com.vovofit.app.data.DriveItem
import com.vovofit.app.data.driveCoverRes
import com.vovofit.app.util.CoverLibrary
import com.vovofit.app.util.setWordEllipsized
import com.vovofit.app.databinding.ItemDriveCardBinding
import com.vovofit.app.util.FocusAnimator
import com.vovofit.app.util.SessionManager
import com.vovofit.app.util.TvUtils

/**
 * v1.0.4 — Rail "Explorar drives" (conceito home).
 *
 * Tile de capa 16:9 (foto do drive) + nome 14sp +
 * linha de metadados (DriveItem.tagline, texto curado). Foco via
 * FocusAnimator.attachCard (anel 3dp da marca + escala + elevação).
 * 1.0.11: o emoji do drive saiu do tile (imagem + nome bastam —
 * Elton 2026-11-14 22:21); a capa é a foto do drive (admin →
 * biblioteca estrita → gerada), nunca o livro 'geral'. Antes o tile
 * não tinha capa nenhuma (só o ícone).
 */
class DriveRailAdapter(
    private val drives: List<DriveItem>,
    /**
     * 1.0.11 — capa do admin por índice do drive (12–15 → URL).
     * Vazio na construção (o GET roda em 2º plano); atualizado por
     * [setFeaturedCovers] quando a resposta chega.
     */
    private var featuredCovers: Map<Int, String> = emptyMap(),
    private val onClick: (DriveItem) -> Unit,
    /**
     * Frente A (TV) — roteamento D-pad explícito dos tiles de drive
     * (mesmo motivo do RailAdapter: o rail de cima pode estar fora
     * do viewport do ScrollView quando o foco está no de baixo).
     */
    private val nextFocusUpId: Int = View.NO_ID,
    private val nextFocusDownId: Int = View.NO_ID
) : RecyclerView.Adapter<DriveRailAdapter.VH>() {

    /** Atualiza as capas do admin e redesenha os cards. */
    fun setFeaturedCovers(covers: Map<Int, String>) {
        featuredCovers = covers
        notifyDataSetChanged()
    }

    inner class VH(val binding: ItemDriveCardBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos != RecyclerView.NO_POSITION) onClick(drives[pos])
            }
            FocusAnimator.attachCard(binding.driveCardRoot, TvUtils.isTv(binding.root.context))
            // Frente A (TV): nextFocus explícito (ver params).
            if (nextFocusUpId != View.NO_ID) itemView.nextFocusUpId = nextFocusUpId
            if (nextFocusDownId != View.NO_ID) itemView.nextFocusDownId = nextFocusDownId
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val inflater = LayoutInflater.from(parent.context)
        return VH(ItemDriveCardBinding.inflate(inflater, parent, false))
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val drive = drives[position]
        with(holder.binding) {
            driveIcon.text = drive.icon  // 1.0.11: fora da tela — imagem + nome bastam (Elton 2026-11-14 22:21)
            driveIcon.visibility = View.GONE
            driveName.setWordEllipsized(drive.name)
            driveMeta.setWordEllipsized(drive.tagline)

            val coursePath = "/${drive.index}:/"
            // 1.0.11 — capa do card: (a) capa do admin (por índice do
            // drive), (b) (o drive raiz não tem vídeo direto — sem
            // thumb), (c) biblioteca ESTRITA por tipo (sem 'geral'),
            // (d) capa gerada do drive. Sem capa, o tile segue escuro
            // (nunca monograma, nunca o livro).
            val adminCover = featuredCovers[drive.index]?.takeIf { it.isNotBlank() }
            val generatedCover = driveCoverRes(drive.index)
            val libraryUrl = CoverLibrary.resolveStrict(
                holder.itemView.context, drive.name, drive.tagline, coursePath
            )
            val showLibraryOrGenerated: () -> Unit = {
                if (!libraryUrl.isNullOrBlank()) {
                    driveCover.visibility = View.VISIBLE
                    driveCover.load(libraryUrl) {
                        error(generatedCover)
                        listener(onError = { _, _ ->
                            driveCover.setImageResource(generatedCover)
                        })
                    }
                } else {
                    driveCover.visibility = View.VISIBLE
                    driveCover.setImageResource(generatedCover)
                }
            }
            when {
                adminCover != null -> {
                    driveCover.visibility = View.VISIBLE
                    driveCover.load(adminCover) {
                        error(generatedCover)
                        listener(onError = { _, _ -> showLibraryOrGenerated() })
                    }
                }
                libraryUrl != null -> showLibraryOrGenerated()
                else -> {
                    driveCover.visibility = View.VISIBLE
                    driveCover.setImageResource(generatedCover)
                }
            }

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
