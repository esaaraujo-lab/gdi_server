package com.meggy.app.ui.home

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.animation.AnimationUtils
import android.widget.Toast
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.meggy.app.R
import com.meggy.app.data.FileItem
import com.meggy.app.data.colorFromString
import com.meggy.app.databinding.ItemRailCardBinding
import com.meggy.app.util.CardGradient
import com.meggy.app.util.ThumbArt
import com.meggy.app.util.LibraryCovers
import com.meggy.app.util.FocusAnimator
import com.meggy.app.util.Format
import com.meggy.app.util.SessionManager
import com.meggy.app.util.TvUtils
import com.meggy.app.util.setWordEllipsized

/**
 * v2.7.6 — Rail "Continue assistindo" (conceito home).
 *
 * Card 16:9: foto real via Coil quando há thumbnail (RailItem.thumbnailUrl
 * ou FileItem.thumbnailLink), arte-padrão do drive (ícone) quando não há —
 * NUNCA monograma com letras, NUNCA emoji de câmera. Título 16sp
 * (máx. 2 linhas), subtítulo 14sp,
 * barra de progresso rosa + "% concluído · Xmin restantes".
 * Foco: FocusAnimator.attachCard (anel 3dp da marca + escala + elevação).
 */
data class RailItem(
    // v2.7.11 — `title` é o nome CRU do arquivo (identidade do item: o
    // clique casa por videoName). `displayTitle` é o título LIMPO
    // (Format.lessonDisplayTitle) exibido no card; null = mostra title.
    val title: String,
    val displayTitle: String? = null,
    val subtitle: String,
    val icon: String,
    val hasProgress: Boolean,
    val progress: Int,          // 0..100
    val isWatched: Boolean,
    val hasResume: Boolean,
    val colorHint: String? = null,
    val file: FileItem? = null,
    /** v2.7.6: thumb fotográfica do item (recents / FileItem). */
    val thumbnailUrl: String? = null
)

class RailAdapter(
    private val items: List<RailItem>,
    private val onClick: (RailItem) -> Unit,
    /**
     * Frente A (TV) — roteamento D-pad explícito dos cards do rail.
     * O FocusFinder ignora vistas fora do viewport do ScrollView
     * (o rail de baixo começa abaixo do fold), por isso o D-pad
     * UP/DOWN entre rails precisa destes ids. NO_ID = roteamento
     * padrão (o host que não passa nada não muda nada).
     */
    private val nextFocusUpId: Int = View.NO_ID,
    private val nextFocusDownId: Int = View.NO_ID
) : RecyclerView.Adapter<RailAdapter.VH>() {

    inner class VH(val binding: ItemRailCardBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos != RecyclerView.NO_POSITION) onClick(items[pos])
            }
            FocusAnimator.attachCard(binding.cardRoot, TvUtils.isTv(binding.root.context))
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
            cardTitle.setWordEllipsized(item.displayTitle ?: item.title)
            cardSubtitle.setWordEllipsized(item.subtitle)
            // v2.7.11 — subtítulo vazio (título já traz o curso) some,
            // em vez de deixar uma linha em branco no card.
            cardSubtitle.visibility = if (item.subtitle.isBlank()) View.GONE else View.VISIBLE

            val baseColor = colorFromString(item.colorHint ?: item.title)
            cardBg.background = CardGradient.drawable(res, baseColor)

            // v2.7.11 onda 2 + camada (3) ESTRITA (2.7.13, sem 'geral')
            // — thumb fotográfica quando houver; sem ela, a imagem da
            // biblioteca por tipo de aula (nome da aula → curso → pasta);
            // sem match, a capa GERADA do drive (ThumbArt) — inclusive
            // quando o Coil falhar. Monograma com letras NUNCA mais é thumb.
            val thumb = LibraryCovers.remoteCoverStrict(
                item.thumbnailUrl ?: item.file?.thumbnailLink,
                item.displayTitle ?: item.title, item.subtitle,
                item.file?.folderPath
            )
            val coverRes = ThumbArt.coverResForPath(item.file?.folderPath ?: "")
            fun showFallbackArt() {
                cardThumbnail.visibility = View.VISIBLE
                cardFallbackIcon.visibility = View.GONE
                cardThumbnail.setImageResource(coverRes)
            }
            if (!thumb.isNullOrBlank()) {
                cardThumbnail.visibility = View.VISIBLE
                cardFallbackIcon.visibility = View.GONE
                cardThumbnail.load(thumb) {
                    error(coverRes)
                    listener(onError = { _, _ -> showFallbackArt() })
                }
                cardThumbnail.setOnClickListener(null)
            } else {
                showFallbackArt()
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
