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
import com.bibigyn.app.data.FileItem
import com.bibigyn.app.data.colorFromString
import com.bibigyn.app.databinding.ItemRailCardBinding
import com.bibigyn.app.util.CardGradient
import com.bibigyn.app.util.CoverLibrary
import com.bibigyn.app.util.FocusAnimator
import com.bibigyn.app.util.TapFeedback
import com.bibigyn.app.util.Format
import com.bibigyn.app.util.SessionManager
import com.bibigyn.app.util.TvUtils
import com.bibigyn.app.util.setWordEllipsized

/**
 * v2.1.5 — Rail "Continue assistindo" (conceito home).
 *
 * Card 16:9: foto real via Coil quando há thumbnail (RailItem.thumbnailUrl
 * ou FileItem.thumbnailLink); sem thumb, arte do drive (ícone do drive
 * sobre o gradiente escuro) — NUNCA monograma nem emoji de câmera.
 * Título limpo (Format.lessonTitle), subtítulo = curso, barra de
 * progresso rosa + "% concluído · Xmin restantes".
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
    /** v2.1.5: thumb fotográfica do item (recents / FileItem). */
    val thumbnailUrl: String? = null,
    /**
     * v2.1.9 — ícone do drive/curso (DriveItem.iconForPath): arte de
     * fallback do card quando NÃO há thumb no Drive. Nunca monograma.
     */
    val driveIcon: String = "🎥"
)

class RailAdapter(
    private val items: List<RailItem>,
    /**
     * Frente A (TV) — roteamento D-pad explícito dos cards do rail.
     * O FocusFinder ignora vistas fora do viewport do ScrollView
     * (o rail de baixo começa abaixo do fold), por isso o D-pad
     * UP/DOWN entre rails precisa destes ids. NO_ID = roteamento
     * padrão (o host que não passa nada não muda nada).
     */
    private val nextFocusUpId: Int = View.NO_ID,
    private val nextFocusDownId: Int = View.NO_ID,
    // Build-fix 2.7.16: onClick em ULTIMO — os call sites usam trailing
    // lambda; com onClick em 2o a lambda ligava a nextFocusDownId (Int)
    // e onClick ficava sem valor (compileReleaseKotlin falhou na 2.7.15).
    private val onClick: (RailItem) -> Unit
) : RecyclerView.Adapter<RailAdapter.VH>() {

    inner class VH(val binding: ItemRailCardBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos != RecyclerView.NO_POSITION) onClick(items[pos])
            }
            FocusAnimator.attachCard(binding.cardRoot, TvUtils.isTv(binding.root.context))
            TapFeedback.attachPress(binding.cardRoot, TvUtils.isTv(binding.root.context))
            // Frente A (TV): nextFocus explícito (ver params).
            if (nextFocusUpId != View.NO_ID) itemView.nextFocusUpId = nextFocusUpId
            if (nextFocusDownId != View.NO_ID) itemView.nextFocusDownId = nextFocusDownId
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
            // v2.1.9: título limpo ("001 - aula.mp4" → "Aula 01"/tema);
            // o item.title continua cru — o clique casa por ele.
            cardTitle.setWordEllipsized(Format.lessonTitle(item.title, item.subtitle))
            cardSubtitle.setWordEllipsized(item.subtitle)

            val baseColor = colorFromString(item.colorHint ?: item.title)
            cardBg.background = CardGradient.drawable(res, baseColor)

            // Onda 2: thumb real quando houver; sem thumb (ou se o
            // Coil falhar — ex.: áudio sem thumb no Drive), (c) capa
            // gerada do drive; a arte do drive só quando não há capa
            // gerada. Nunca mais monograma como thumb.
            cardDriveArt.text = item.driveIcon
            val coverRes = item.file?.folderPath
                ?.let { DriveItem.coverResForPath(it) }
            val showGeneratedOrDriveArt = {
                if (coverRes != null) {
                    cardThumbnail.visibility = View.VISIBLE
                    cardDriveArt.visibility = View.GONE
                    cardThumbnail.load(coverRes)
                } else {
                    cardThumbnail.visibility = View.GONE
                    cardDriveArt.visibility = View.VISIBLE
                }
            }
            // Camada 3 ESTRITA (2.1.12) — biblioteca por tipo (aula → curso → caminho);
            // sem match, (4) capa gerada / arte do drive. O thumb
            // falhando e o sem-thumb caem aqui (showDriveArt).
            val showDriveArt = {
                val libraryUrl = CoverLibrary.resolveStrict(
                    ctx, item.title, item.subtitle, item.file?.folderPath
                )
                if (!libraryUrl.isNullOrBlank()) {
                    cardThumbnail.visibility = View.VISIBLE
                    cardDriveArt.visibility = View.GONE
                    cardThumbnail.load(libraryUrl) {
                        error(coverRes ?: R.drawable.card_gradient_pink)
                        listener(onError = { _, _ -> showGeneratedOrDriveArt() })
                    }
                } else {
                    showGeneratedOrDriveArt()
                }
            }
            val thumb = item.thumbnailUrl ?: item.file?.thumbnailLink
            if (!thumb.isNullOrBlank()) {
                cardThumbnail.visibility = View.VISIBLE
                cardDriveArt.visibility = View.GONE
                cardThumbnail.load(thumb) {
                    error(coverRes ?: R.drawable.card_gradient_pink)
                    listener(onError = { _, _ -> showDriveArt() })
                }
                cardThumbnail.setOnClickListener(null)
            } else {
                showDriveArt()
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
