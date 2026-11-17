package com.meggy.app.ui.home

import android.util.TypedValue
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.animation.AnimationUtils
import android.widget.Toast
import androidx.recyclerview.widget.DiffUtil
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
import com.meggy.app.util.TapFeedback
import com.meggy.app.util.Format
import com.meggy.app.util.SessionManager
import com.meggy.app.util.TvUtils
import com.meggy.app.util.TvAutoFit
import com.meggy.app.util.setWordEllipsized

/**
 * v2.7.6 — Rail "Continue assistindo" (conceito home).
 *
 * Card 16:9: foto real via Coil quando há thumbnail (RailItem.thumbnailUrl
 * ou FileItem.thumbnailLink), arte-padrão do drive (ícone) quando não há —
 * NUNCA monograma com letras, NUNCA emoji de câmera. Título 13sp
 * (máx. 2 linhas), subtítulo 10.5sp — valores reais da TV (o KDoc
 * dizia 16sp/14sp, que sao os do celular). Ronda 7 Frente B.
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
        val oldItems = items
        items = newItems
        // Ronda 18 Frente C (F2) — DiffUtil em vez de
        // notifyDataSetChanged() total: só os itens que mudaram /
        // entraram / saíram são re-ligados; os holders dos outros nem
        // se desanexam — mata o flicker do BACK do player e a janela
        // em que o toque caía sobre um holder destacado (o clique
        // consulta bindingAdapterPosition e é ignorado quando o holder
        // está destacado). A identidade é (título, pasta): o par
        // (folder, video) é a identidade do recent (ver
        // SessionManager.addRecent).
        DiffUtil.calculateDiff(object : DiffUtil.Callback() {
            override fun getOldListSize(): Int = oldItems.size
            override fun getNewListSize(): Int = newItems.size
            override fun areItemsTheSame(oldPos: Int, newPos: Int): Boolean {
                val old = oldItems[oldPos]
                val new = newItems[newPos]
                return old.title == new.title &&
                    old.file?.folderPath == new.file?.folderPath
            }
            override fun areContentsTheSame(oldPos: Int, newPos: Int): Boolean =
                oldItems[oldPos] == newItems[newPos]
        }).dispatchUpdatesTo(this)
        return true
    }

    // Ronda 18 Frente C (F2) — o DiffUtil já não re-liga os itens que
    // não mudaram, por isso os ids de foco D-pad têm de ser
    // re-aplicados aos holders JÁ ligados quando mudam (antes o
    // notifyDataSetChanged() total fazia-o por acidente, ao re-ligar
    // tudo). O onBind continua a aplicá-los aos holders reciclados.
    private var attachedRecyclerView: RecyclerView? = null

    override fun onAttachedToRecyclerView(recyclerView: RecyclerView) {
        attachedRecyclerView = recyclerView
    }

    override fun onDetachedFromRecyclerView(recyclerView: RecyclerView) {
        if (attachedRecyclerView === recyclerView) attachedRecyclerView = null
    }

    fun updateFocusIds(upId: Int, downId: Int) {
        if (upId == nextFocusUpId && downId == nextFocusDownId) return
        nextFocusUpId = upId
        nextFocusDownId = downId
        val rv = attachedRecyclerView ?: return
        for (i in 0 until rv.childCount) {
            val child = rv.getChildAt(i)
            if (upId != View.NO_ID) child.nextFocusUpId = upId
            if (downId != View.NO_ID) child.nextFocusDownId = downId
        }
    }

    /** Posição actual do item nos dados do adapter (-1 se já não existir). */
    fun indexOf(item: RailItem): Int = items.indexOf(item)

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
                binding.cardFallbackIcon.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(44f))
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
