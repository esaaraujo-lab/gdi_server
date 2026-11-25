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
import com.meggy.app.databinding.ItemRailCardBinding
import com.meggy.app.util.CardGradient
import com.meggy.app.util.ThumbArt
import com.meggy.app.util.TileColors
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
    // clique casa por videoName). `displayTitle` é o título exibido no
    // card; R28: o NOME DO TEMA DA AULA = o nome da pasta da aula
    // (último segmento do folderPath) — o nome cru do arquivo some do
    // título; null = mostra title (fallback: lessonDisplayTitle).
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
    /**
     * 2.7.56 — LEFT dos cards para a linha seleccionada do menu
     * lateral da TV (a Home passa o id quando o menu está ligado;
     * NO_ID = roteamento padrão). Aplicado no VH e a cada bind,
     * como os ids de cima/baixo.
     */
    private var nextFocusLeftId: Int = View.NO_ID,
    /**
     * 2.7.48 — anel de foco branco 4dp na TV (conceito 3): o "Continue
     * assistindo" da home passa o anel branco em vez do rosa da marca;
     * os outros rails (Destaques, drives, detalhe) mantêm o rosa.
     * Só tem efeito na TV; no celular o anel não se usa.
     */
    private val whiteFocusRing: Boolean = false,
    /**
     * 2.7.52 — base do cartão na TV (TvAutoFit): 200dp é o cartão de
     * sempre; as fileiras grandes dos conceitos aprovados (Continue
     * da home, aulas do detalhe) passam 340f — cartão ~340dp, textos
     * maiores e foco com escala 1,05 (densa) em vez de 1,10. Só tem
     * efeito na TV (o bloco de geometria do VH é gateado por isTv);
     * no celular nada muda.
     */
    private val tvCardBaseDp: Float = 200f,
    /**
     * 2.7.56 — cartão LARGO da posição 0 (proposta Plex: o item em
     * curso é o cartão de 320dp da 1.ª fileira do Continuar — sem
     * hero separado, sem duplicação). 0 = sem cartão largo. A
     * geometria aplica-se no onBind (a posição só lá se conhece);
     * só TV (o bloco de geometria é gateado por isTv).
     */
    private val firstCardWideDp: Float = 0f,
    // Build-fix 2.7.16: onClick em ULTIMO — os call sites usam trailing
    // lambda; com onClick em 2o a lambda ligava a nextFocusDownId (Int)
    // e onClick ficava sem valor (compileReleaseKotlin falhou na 2.7.15).
    private val onClick: (RailItem) -> Unit
) : RecyclerView.Adapter<RailAdapter.VH>() {

    // R21 — maior posição já animada neste adapter (ver onBindViewHolder).
    private var lastAnimatedPosition = -1

    // R28 — cor fixa de cada card (TileColors, como nas Tiles das
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
     * onResume — re-desenhar sempre era o gatilho A). Retorna true
     * quando houve mudança real (a Home repõe o foco nesse caso).
     * [updateFocusIds] só salva os ids — o onBind aplica-os aos
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

    /** 2.7.56 — idem updateFocusIds, para o LEFT (menu lateral). */
    fun updateFocusLeftId(leftId: Int) {
        if (leftId == nextFocusLeftId) return
        nextFocusLeftId = leftId
        val rv = attachedRecyclerView ?: return
        for (i in 0 until rv.childCount) {
            if (leftId != View.NO_ID) rv.getChildAt(i).nextFocusLeftId = leftId
        }
    }

    /** Posição atual do item nos dados do adapter (-1 se já não existir). */
    fun indexOf(item: RailItem): Int = items.indexOf(item)

    inner class VH(val binding: ItemRailCardBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos != RecyclerView.NO_POSITION) onClick(items[pos])
            }
            // R26 — título completo ao tocar e segurar: duas aulas
            // da mesma disciplina podem mostrar o mesmo título
            // cortado ("Direito…"); o toque longo mostra o título
            // inteiro. Não muda o toque normal (abre a aula).
            binding.root.setOnLongClickListener {
                val pos = bindingAdapterPosition
                if (pos == RecyclerView.NO_POSITION) return@setOnLongClickListener false
                val full = items[pos].displayTitle ?: items[pos].title
                Toast.makeText(binding.root.context, full, Toast.LENGTH_LONG).show()
                true
            }
            // 2.7.48 — anel branco 4dp no "Continue assistindo" da TV
            // (conceito 3); nos outros rails, o rosa da marca (3dp).
            // 2.7.52 — nos cartões GRANDES (base > 200) a escala de
            // foco é a densa (1,05, SPEC §5); nos de 200dp fica a de
            // sempre (1,10).
            if (whiteFocusRing && TvUtils.isTv(binding.root.context)) {
                FocusAnimator.attachCard(
                    binding.cardRoot, true,
                    scaleTv = if (tvCardBaseDp > 200f) FocusAnimator.SCALE_TV_DENSE else null,
                    ringColorRes = R.color.tile_focus_ring_white, ringWidthDp = 4f
                )
            } else {
                FocusAnimator.attachCard(binding.cardRoot, TvUtils.isTv(binding.root.context))
            }
            TapFeedback.attachPress(binding.cardRoot, TvUtils.isTv(binding.root.context))
            // Ronda 7 Frente B — auto-ajuste TV (TvAutoFit): o card e a imagem
            // passam a derivar do viewport medido; no celular e na 32" de
            // referencia (escala 1.0) nada muda. O rail do detalhe usa o
            // mesmo adapter e herda o mesmo tamanho de card (geometria da
            // TV, nao da home) — comportamento intencional e consistente.
            // 2.7.48 — na home da TV o viewport é o conteúdo (viewport
            // menos a largura do menu lateral); no detalhe não há menu.
            if (TvUtils.isTv(binding.root.context)) {
                val ctx = binding.root.context
                val menuDp = if (ctx is HomeActivity) SideMenuView.currentWidthDp(ctx) else 0f
                val fit = TvAutoFit.forContext(ctx, menuDp)
                val cardWidthPx = fit.layoutPx(tvCardBaseDp)
                val rootLp = binding.cardRoot.layoutParams as ViewGroup.MarginLayoutParams
                rootLp.width = cardWidthPx
                rootLp.marginEnd = fit.gapHalfPx(tvCardBaseDp)
                binding.cardRoot.layoutParams = rootLp
                // Imagem 16:9 — a altura deriva da largura (nao de 112dp x escala).
                val imageArea = binding.cardThumbnail.parent as View
                imageArea.layoutParams = imageArea.layoutParams.apply {
                    height = cardWidthPx * 9 / 16
                }
                // 2.7.52 — cartões grandes levam textos maiores
                // (SPEC §5: metadados legíveis a 3 m); os de 200dp
                // mantêm os valores de sempre.
                // 2.7.56 — escala da proposta Plex p/ as fileiras:
                // título de cartão 15sp, metadados 13sp.
                val bigCard = tvCardBaseDp > 200f
                binding.cardTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(if (bigCard) 15f else 13f))
                binding.cardSubtitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(if (bigCard) 13f else 10.5f))
                binding.cardProgressText.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(if (bigCard) 13f else 12f))
                binding.cardFallbackIcon.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(if (bigCard) 56f else 44f))
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
            if (nextFocusLeftId != View.NO_ID) itemView.nextFocusLeftId = nextFocusLeftId
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val inflater = LayoutInflater.from(parent.context)
        return VH(ItemRailCardBinding.inflate(inflater, parent, false))
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = items[position]
        // Ronda 17 Frente B — os ids de foco D-pad re-aplicam-se a
        // cada bind (o updateFocusIds da Home só os salva).
        if (nextFocusUpId != View.NO_ID) holder.itemView.nextFocusUpId = nextFocusUpId
        if (nextFocusDownId != View.NO_ID) holder.itemView.nextFocusDownId = nextFocusDownId
        if (nextFocusLeftId != View.NO_ID) holder.itemView.nextFocusLeftId = nextFocusLeftId
        // 2.7.56 — geometria do cartão largo (posição 0): a mesma
        // matemática do init do VH, com a base larga; os holders
        // reciclados repõem a base normal nas outras posições.
        if (firstCardWideDp > 0f && TvUtils.isTv(holder.itemView.context)) {
            val ctx = holder.itemView.context
            val menuDp = if (ctx is HomeActivity) SideMenuView.currentWidthDp(ctx) else 0f
            val fit = TvAutoFit.forContext(ctx, menuDp)
            val base = if (position == 0) firstCardWideDp else tvCardBaseDp
            val cardWidthPx = fit.layoutPx(base)
            val rootLp = holder.binding.cardRoot.layoutParams as ViewGroup.MarginLayoutParams
            if (rootLp.width != cardWidthPx || rootLp.marginEnd != fit.gapHalfPx(base)) {
                rootLp.width = cardWidthPx
                rootLp.marginEnd = fit.gapHalfPx(base)
                holder.binding.cardRoot.layoutParams = rootLp
            }
            val imageArea = holder.binding.cardThumbnail.parent as View
            val targetH = cardWidthPx * 9 / 16
            if (imageArea.layoutParams.height != targetH) {
                imageArea.layoutParams = imageArea.layoutParams.apply { height = targetH }
            }
        }
        val res = holder.itemView.resources
        val ctx = holder.itemView.context

        with(holder.binding) {
            cardTitle.setWordEllipsized(item.displayTitle ?: item.title)
            cardSubtitle.setWordEllipsized(item.subtitle)
            // v2.7.11 — subtítulo vazio (título já traz o curso) some,
            // em vez de deixar uma linha em branco no card.
            cardSubtitle.visibility = if (item.subtitle.isBlank()) View.GONE else View.VISIBLE

            // R28 — cor fixa do Tile (TileColors, R27): o gradiente
            // atrás da imagem e a área do nome usam a cor da pasta (a
            // mesma do Tile dessa pasta); a imagem fica intacta. Rede
            // de segurança: se a lista mudou sem passar por
            // updateItems, recalcula (como no LessonGridAdapter).
            // Chamada segura no cardBody (FIX CI #102 — o
            // layout-television só ganhou card_body nesta ronda; sem
            // a vista salta a cor mas o bind continua).
            if (itemColors.size != items.size) refreshItemColors()
            val fixedColor = itemColors[position]
            cardBg.background = CardGradient.drawable(res, fixedColor)
            cardBody?.setBackgroundColor(fixedColor)

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
            // v2.7.56 (TV): a barra vive sobre a base da imagem (layout-
            // television) — a visibilidade acompanha a da linha de texto.
            // No celular a barra está dentro da progress_row e o valor é
            // o mesmo, sem efeito visual.
            cardProgress.visibility = progressRow.visibility

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

        // R21: a animação de entrada corre só na PRIMEIRA aparição
        // da posição — antes corria em TODOS os binds, incluindo a
        // reciclagem ao rolar (replay constante = jank, sobretudo
        // na TV). Ver lastAnimatedPosition no adapter.
        if (position > lastAnimatedPosition) {
            lastAnimatedPosition = position
            val anim = AnimationUtils.loadAnimation(holder.itemView.context, R.anim.tile_appear)
            anim.startOffset = (position % 12) * 40L
            holder.binding.root.startAnimation(anim)
        }
    }

    override fun getItemCount(): Int = items.size
}
