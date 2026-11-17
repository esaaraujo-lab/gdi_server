package com.vovofit.app.ui.home

import android.util.TypedValue
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
import com.vovofit.app.util.TapFeedback
import com.vovofit.app.util.CoverLibrary
import com.vovofit.app.util.loadCoverChain
import com.vovofit.app.util.Format
import com.vovofit.app.util.SessionManager
import com.vovofit.app.util.TvUtils
import com.vovofit.app.util.TvAutoFit
import com.vovofit.app.util.setWordEllipsized

/**
 * v1.0.4 — Rail "Continue assistindo" (conceito home).
 *
 * Card 16:9: foto real via Coil quando há thumbnail (RailItem.thumbnailUrl
 * ou FileItem.thumbnailLink), capa do drive quando não há (v1.0.8 —
 * monograma nunca mais como thumb). NUNCA emoji de câmera. Título 13sp
 * (máx. 2 linhas), subtítulo 10.5sp — valores reais da TV (o KDoc
 * dizia 16sp/14sp, que sao os do celular). Ronda 7 Frente B.
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
    private var items: List<RailItem>,
    /**
     * Frente A (TV) — roteamento D-pad explícito dos cards do rail.
     * O FocusFinder ignora vistas fora do viewport do ScrollView
     * (o rail de baixo começa abaixo do fold), por isso o D-pad
     * UP/DOWN entre rails precisa destes ids. NO_ID = roteamento
     * padrão (o host que não passa nada não muda nada).
     */
    private var nextFocusUpId: Int = View.NO_ID,
    private var nextFocusDownId: Int = View.NO_ID,
    // Build-fix 2.7.16: onClick em ULTIMO — os call sites usam trailing
    // lambda; com onClick em 2o a lambda ligava a nextFocusDownId (Int)
    // e onClick ficava sem valor (compileReleaseKotlin falhou na 2.7.15).
    private val onClick: (RailItem) -> Unit
) : RecyclerView.Adapter<RailAdapter.VH>() {

    /**
     * Ronda 17 Frente B — substitui os itens sem recriar o adapter:
     * sem mudanças, nem redesenha (a Home chama isto em cada
     * onResume — re-desenhar sempre era o gatilho A). Devolve true
     * quando houve mudança real (a Home repõe o foco nesse caso).
     * [updateFocusIds] só guarda os ids — o onBind aplica-os aos
     * holders (os já criados apanham-nos no próximo bind, que o
     * updateItems provoca quando há mudança; sem mudança nos dados
     * os ids também não mudam, porque derivam dos mesmos recents).
     */
    fun updateItems(newItems: List<RailItem>): Boolean {
        if (newItems == items) return false
        items = newItems
        notifyDataSetChanged()
        return true
    }

    fun updateFocusIds(upId: Int, downId: Int) {
        nextFocusUpId = upId
        nextFocusDownId = downId
    }

    inner class VH(val binding: ItemRailCardBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos != RecyclerView.NO_POSITION) onClick(items[pos])
            }
            FocusAnimator.attachCard(binding.cardRoot, TvUtils.isTv(binding.root.context))
            TapFeedback.attachPress(binding.cardRoot, TvUtils.isTv(binding.root.context))
            // Ronda 7 Frente B — auto-ajuste TV (TvAutoFit): o card e a imagem
            // passam a derivar do viewport medido; no celular e na 32" de
            // referencia (escala 1.0) nada muda. O rail do detalhe usa o
            // mesmo adapter e herda o mesmo tamanho de card (geometria da
            // TV, nao da home) — comportamento intencional e consistente.
            if (TvUtils.isTv(binding.root.context)) {
                val fit = TvAutoFit.forContext(binding.root.context)
                val cardWidthPx = fit.layoutPx(200f)
                val rootLp = binding.cardRoot.layoutParams as ViewGroup.MarginLayoutParams
                rootLp.width = cardWidthPx
                rootLp.marginEnd = fit.gapHalfPx(200f)
                binding.cardRoot.layoutParams = rootLp
                // Imagem 16:9 — a altura deriva da largura (nao de 112dp x escala).
                val imageArea = binding.cardThumbnail.parent as View
                imageArea.layoutParams = imageArea.layoutParams.apply {
                    height = cardWidthPx * 9 / 16
                }
                binding.cardTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(13f))
                binding.cardSubtitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(10.5f))
                binding.cardProgressText.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(12f))
                binding.watchedBadge.layoutParams = binding.watchedBadge.layoutParams.apply {
                    width = fit.layoutPx(24f)
                    height = fit.layoutPx(24f)
                }
                binding.watchedBadge.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(12f))
                binding.favStar.layoutParams = binding.favStar.layoutParams.apply {
                    width = fit.layoutPx(32f)
                    height = fit.layoutPx(32f)
                    (this as ViewGroup.MarginLayoutParams).topMargin = fit.layoutPx(42f)
                }
                binding.favStar.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(16f))
                binding.continueBadge.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(10f))
            }
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
        // Ronda 17 Frente B — os ids de foco D-pad re-aplicam-se a
        // cada bind (o updateFocusIds da Home só os guarda).
        if (nextFocusUpId != View.NO_ID) holder.itemView.nextFocusUpId = nextFocusUpId
        if (nextFocusDownId != View.NO_ID) holder.itemView.nextFocusDownId = nextFocusDownId
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
            val libUrl = CoverLibrary.resolveStrict(
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
