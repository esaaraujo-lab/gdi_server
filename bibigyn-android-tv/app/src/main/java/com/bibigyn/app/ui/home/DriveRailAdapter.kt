package com.bibigyn.app.ui.home

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.animation.AnimationUtils
import android.widget.Toast
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.bibigyn.app.R
import com.bibigyn.app.data.DriveItem
import com.bibigyn.app.util.setWordEllipsized
import com.bibigyn.app.databinding.ItemDriveCardBinding
import com.bibigyn.app.util.FocusAnimator
import com.bibigyn.app.util.TapFeedback
import com.bibigyn.app.util.CoverLibrary
import com.bibigyn.app.util.SessionManager
import com.bibigyn.app.util.TvUtils

/**
 * v2.1.5 — Rail "Explorar drives" (conceito home).
 *
 * Tile de capa 16:9 (foto do drive) + nome 14sp +
 * linha de metadados (DriveItem.tagline, texto curado). Foco via
 * FocusAnimator.attachCard (anel 3dp da marca + escala + elevação).
 * 2.1.11: o emoji do drive saiu do tile (imagem + nome bastam —
 * Elton 2026-11-14 22:21); a capa é a foto do drive (admin →
 * biblioteca estrita → gerada), nunca o livro 'geral'.
 */
class DriveRailAdapter(
    private val drives: List<DriveItem>,
    /**
     * Onda 2 (a) — capa do admin por coursePath ("/6:/" → URL).
     * Vazio na construção (o GET roda em 2º plano); atualizado por
     * [setFeaturedCovers] quando a resposta chega.
     */
    private var featuredCovers: Map<String, String> = emptyMap(),
    /**
     * Frente A (TV) — roteamento D-pad explícito dos tiles de drive
     * (mesmo motivo do RailAdapter: o rail de cima pode estar fora
     * do viewport do ScrollView quando o foco está no de baixo).
     */
    private val nextFocusUpId: Int = View.NO_ID,
    private val nextFocusDownId: Int = View.NO_ID,
    // Build-fix 2.7.16: onClick em ULTIMO (mesmo motivo do RailAdapter).
    private val onClick: (DriveItem) -> Unit
) : RecyclerView.Adapter<DriveRailAdapter.VH>() {

    /** Atualiza as capas do admin e redesenha os cards. */
    fun setFeaturedCovers(covers: Map<String, String>) {
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
            TapFeedback.attachPress(binding.driveCardRoot, TvUtils.isTv(binding.root.context))
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
            driveIcon.text = drive.icon  // 2.1.11: fora da tela — imagem + nome bastam (Elton 2026-11-14 22:21)
            driveIcon.visibility = View.GONE
            driveName.setWordEllipsized(drive.name)
            driveMeta.setWordEllipsized(drive.tagline)

            val coursePath = "/${drive.index}:/"
            // Onda 2 — capa do card: (a) capa do admin, (b) (o drive
            // raiz não tem vídeo direto — sem thumb), (c) capa gerada
            // do drive. 2.1.11: a foto É a capa do tile (sem chip de
            // ícone); sem capa, o tile segue escuro (nunca monograma).
            val adminCover = featuredCovers[coursePath]?.takeIf { it.isNotBlank() }
            val generatedCover = DriveItem.coverResForDrive(drive.index)
            // Camada 3 ESTRITA — biblioteca por tipo (nome do drive →
            // tagline → caminho). Sem match, (4) capa gerada (nunca
            // o livro 'geral' — 2.1.11).
            val libraryUrl = CoverLibrary.resolveStrict(
                holder.itemView.context, drive.name, drive.tagline, coursePath
            )
            val showLibraryOrGenerated: () -> Unit = {
                if (!libraryUrl.isNullOrBlank()) {
                    driveCover.visibility = View.VISIBLE
                    driveCover.load(libraryUrl) {
                        error(generatedCover ?: R.drawable.card_gradient_pink)
                        listener(onError = { _, _ ->
                            if (generatedCover != null) {
                                driveCover.setImageResource(generatedCover)
                            }
                        })
                    }
                } else if (generatedCover != null) {
                    driveCover.visibility = View.VISIBLE
                    driveCover.setImageResource(generatedCover)
                } else {
                    driveCover.visibility = View.GONE
                }
            }
            when {
                adminCover != null -> {
                    driveCover.visibility = View.VISIBLE
                    driveCover.load(adminCover) {
                        error(generatedCover ?: R.drawable.card_gradient_pink)
                        listener(onError = { _, _ -> showLibraryOrGenerated() })
                    }
                }
                libraryUrl != null -> showLibraryOrGenerated()
                generatedCover != null -> {
                    driveCover.visibility = View.VISIBLE
                    driveCover.setImageResource(generatedCover)
                }
                else -> driveCover.visibility = View.GONE
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
