package com.vovofit.app.ui.home

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.animation.AnimationUtils
import android.widget.Toast
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.vovofit.app.R
import com.vovofit.app.data.FileItem
import com.vovofit.app.data.colorFromString
import com.vovofit.app.data.driveCoverRes
import com.vovofit.app.data.driveIndexFromPath
import com.vovofit.app.databinding.ItemRailCardBinding
import com.vovofit.app.util.CardGradient
import com.vovofit.app.util.FocusAnimator
import com.vovofit.app.util.CoverLibrary
import com.vovofit.app.util.loadCoverChain
import com.vovofit.app.util.Format
import com.vovofit.app.util.SessionManager
import com.vovofit.app.util.TvUtils
import com.vovofit.app.util.setWordEllipsized

/**
 * v1.0.4 — Rail "Continue assistindo" (conceito home).
 *
 * Card 16:9: foto real via Coil quando há thumbnail (RailItem.thumbnailUrl
 * ou FileItem.thumbnailLink), capa do drive quando não há (v1.0.8 —
 * monograma nunca mais como thumb). NUNCA emoji de câmera. Título 16sp
 * (máx. 2 linhas), subtítulo 14sp,
 * barra de progresso rosa + "% concluído · Xmin restantes".
 * Foco: FocusAnimator.attachCard (anel 3dp da marca + escala + elevação).
 */
data class RailItem(
    val title: String,
    val subtitle: String,
    val icon: String,
    val hasProgress: Boolean,
    val progress: Int,          // 0..100
    val isWatched: Boolean,
    val hasResume: Boolean,
    val colorHint: String? = null,
    val file: FileItem? = null,
    /** v1.0.4: thumb fotográfica do item (recents / FileItem). */
    val thumbnailUrl: String? = null
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
            FocusAnimator.attachCard(binding.cardRoot, TvUtils.isTv(binding.root.context))
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val inflater = LayoutInflater.from(parent.context)
        return VH(ItemRailCardBinding.inflate(inflater, parent, false))
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = items[position]
        val res = holder.itemView.resources
        val ctx = holder.itemView.context

        with(holder.binding) {
            // v1.0.8 — título limpo ("001 - aula.mp4" -> "Aula 1 — Tema"
            // quando número+tema conhecidos; senão sem extensão/numeração).
            cardTitle.setWordEllipsized(Format.lessonTitle(item.title))
            cardSubtitle.setWordEllipsized(item.subtitle)

            val baseColor = colorFromString(item.colorHint ?: item.title)
            cardBg.background = CardGradient.drawable(res, baseColor)

            // v1.0.8 — Thumb fotográfica quando houver; senão a IMAGEM
            // DA BIBLIOTECA pelo título/pasta (camada 3); senão a CAPA DO
            // DRIVE (arte local cover_*, foto real). Monograma nunca mais:
            // quando o Drive não devolve thumb (ou o Coil falha — as
            // thumbs do Drive nem sempre abrem sem sessão Google), a
            // biblioteca ou a capa garante arte no card. Sem pasta
            // conhecida e sem thumb nem match, fica só o gradiente
            // escuro limpo (sem letras).
            val thumb = item.thumbnailUrl ?: item.file?.thumbnailLink
            val coverRes = item.file?.folderPath
                ?.let { driveIndexFromPath(it) }?.let { driveCoverRes(it) }
            val libUrl = CoverLibrary.resolve(
                ctx, item.title, item.file?.name, item.file?.folderPath
            )
            if (!thumb.isNullOrBlank()) {
                cardThumbnail.visibility = View.VISIBLE
                cardThumbnail.loadCoverChain(
                    thumb,
                    coverRes ?: R.drawable.card_gradient_pink,
                    item.title, item.file?.name, item.file?.folderPath
                )
                cardThumbnail.setOnClickListener(null)
            } else if (libUrl != null) {
                cardThumbnail.visibility = View.VISIBLE
                cardThumbnail.load(libUrl) {
                    error(coverRes ?: R.drawable.card_gradient_pink)
                }
                cardThumbnail.setOnClickListener(null)
            } else if (coverRes != null) {
                cardThumbnail.visibility = View.VISIBLE
                cardThumbnail.setImageResource(coverRes)
                cardThumbnail.setOnClickListener(null)
            } else {
                cardThumbnail.visibility = View.GONE
            }

            // Progresso real: barra + "% concluído · Xmin restantes".
            if (item.hasProgress && item.file != null) {
                val sm = SessionManager.get(ctx)
                val fp = item.file.folderPath ?: ""
                val pos = sm.getResume(fp, item.file.name)
                val dur = sm.getResumeDuration(fp, item.file.name)
                progressRow.visibility = View.VISIBLE
                cardProgress.progress = item.progress
                cardProgressText.text = Format.progressText(item.progress, dur, pos)
            } else if (item.hasProgress) {
                progressRow.visibility = View.VISIBLE
                cardProgress.progress = item.progress
                cardProgressText.text = "${item.progress}% concluído"
            } else {
                progressRow.visibility = View.GONE
            }

            watchedBadge.visibility = if (item.isWatched) View.VISIBLE else View.GONE
            continueBadge.visibility = if (item.hasResume) View.VISIBLE else View.GONE

            // ★ Minha lista (só quando o RailItem carrega o FileItem).
            val favItem = item.file
            if (favItem != null) {
                val sm = SessionManager.get(ctx)
                val fp = favItem.folderPath ?: ""
                favStar.visibility = View.VISIBLE
                favStar.text = if (sm.isFavorite(fp, favItem.name)) "⭐" else "☆"
                favStar.setOnClickListener {
                    val nowFav = sm.toggleFavorite(favItem)
                    favStar.text = if (nowFav) "⭐" else "☆"
                    Toast.makeText(ctx,
                        if (nowFav) "⭐ Adicionado à Minha lista"
                        else "Removido da Minha lista",
                        Toast.LENGTH_SHORT).show()
                }
            } else {
                favStar.visibility = View.GONE
            }
        }

        val anim = AnimationUtils.loadAnimation(holder.itemView.context, R.anim.tile_appear)
        anim.startOffset = (position % 12) * 40L
        holder.binding.root.startAnimation(anim)
    }

    override fun getItemCount(): Int = items.size
}
