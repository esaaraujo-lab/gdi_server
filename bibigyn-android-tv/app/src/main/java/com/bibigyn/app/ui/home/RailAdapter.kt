package com.bibigyn.app.ui.home

import android.util.TypedValue
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.animation.AnimationUtils
import android.widget.Toast
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.bibigyn.app.R
import com.bibigyn.app.data.DriveItem
import com.bibigyn.app.data.FileItem
import com.bibigyn.app.databinding.ItemRailCardBinding
import com.bibigyn.app.util.CardGradient
import com.bibigyn.app.util.CoverLibrary
import com.bibigyn.app.util.FocusAnimator
import com.bibigyn.app.util.TapFeedback
import com.bibigyn.app.util.TileColors
import com.bibigyn.app.util.Format
import com.bibigyn.app.util.SessionManager
import com.bibigyn.app.util.TvUtils
import com.bibigyn.app.util.TvAutoFit
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
    // Port R28 da Meggy — `title` é o nome CRU do arquivo (identidade
    // do item: o clique casa por videoName). `displayTitle` é o título
    // exibido no card: o NOME DO TEMA DA AULA = o nome da pasta da aula
    // (último segmento do folderPath); null = mostra o título antigo.
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
    /** v2.1.5: thumb fotográfica do item (recents / FileItem). */
    val thumbnailUrl: String? = null,
    /**
     * v2.1.9 — ícone do drive/curso (DriveItem.iconForPath): arte de
     * fallback do card quando NÃO há thumb no Drive. Nunca monograma.
     */
    val driveIcon: String = "🎥"
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

    // Port R28 — cor fixa de cada card (TileColors, como nas Tiles das
    // pastas): a chave é o folderPath — o card Continuar de uma pasta
    // tem a cor do Tile dessa pasta. Atribuição por TileColors.assign
    // sobre os itens do rail (span 1 no rail horizontal: vizinhos lado
    // a lado diferentes). Calcula-se quando os itens mudam (o onBind
    // só lê); sem isto, a reciclagem re-sorteava as cores. A cor base
    // é hash(folderPath) % 5 — igual à do Tile; o ajuste de vizinho
    // pode deslocá-la um passo da paleta quando um dos lados precisou
    // dele e o outro não (ver notas da ronda).
    private var itemColors: List<Int> = TileColors.assign(items.map { it.file?.folderPath ?: it.title }, 1)

    private fun refreshItemColors() {
        itemColors = TileColors.assign(items.map { it.file?.folderPath ?: it.title }, 1)
    }

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
        refreshItemColors()
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
            // Port R26 da Meggy — título completo ao tocar e segurar:
            // duas aulas da mesma disciplina podem mostrar o mesmo
            // título cortado ("Direito…"); o toque longo mostra o
            // título inteiro. Não muda o toque normal (abre a aula).
            binding.root.setOnLongClickListener {
                val pos = bindingAdapterPosition
                if (pos == RecyclerView.NO_POSITION) return@setOnLongClickListener false
                val full = items[pos].displayTitle ?: items[pos].title
                Toast.makeText(binding.root.context, full, Toast.LENGTH_LONG).show()
                true
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
                binding.cardDriveArt.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(44f))
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
            // Port R28 da Meggy — o título exibido é o displayTitle
            // (nome do tema = pasta da aula); sem ele, o título limpo
            // antigo. O item.title continua cru — o clique casa por ele.
            cardTitle.setWordEllipsized(item.displayTitle ?: Format.lessonTitle(item.title, item.subtitle))
            cardSubtitle.setWordEllipsized(item.subtitle)
            // v2.7.11 — subtítulo vazio (título já traz o curso) some,
            // em vez de deixar uma linha em branco no card.
            cardSubtitle.visibility = if (item.subtitle.isBlank()) View.GONE else View.VISIBLE

            // Port R28 — cor fixa do Tile (TileColors, R27): o gradiente
            // atrás da imagem e a área do nome usam a cor da pasta (a
            // mesma do Tile dessa pasta); a imagem fica intacta. Rede
            // de segurança: se a lista mudou sem passar por
            // updateItems, recalcula (como no LessonGridAdapter).
            // Chamada segura no cardBody (o layout-television só ganha
            // card_body neste port; sem a vista salta a cor mas o bind
            // continua).
            if (itemColors.size != items.size) refreshItemColors()
            val fixedColor = itemColors[position]
            cardBg.background = CardGradient.drawable(res, fixedColor)
            cardBody?.setBackgroundColor(fixedColor)

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
