package com.meggy.app.ui.browse

import android.graphics.Rect
import android.view.LayoutInflater
import android.view.TouchDelegate
import android.view.View
import android.view.ViewGroup
import android.view.animation.AnimationUtils
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.meggy.app.R
import com.meggy.app.data.FileItem
import com.meggy.app.data.colorFromString
import com.meggy.app.databinding.ItemRailCardBinding
import com.meggy.app.ui.detail.FolderTileProgress
import com.meggy.app.util.CardGradient
import com.meggy.app.util.FocusAnimator
import com.meggy.app.util.TapFeedback
import com.meggy.app.util.Format
import com.meggy.app.util.SessionManager
import com.meggy.app.util.TileColors
import com.meggy.app.util.TvUtils
import com.meggy.app.util.LibraryCovers

/**
 * v2.7.6 — Grade de arquivos (detalhe/navegação).
 *
 * Mesma estrutura do RailAdapter: thumb real via Coil quando houver
 * (vídeos/PDFs/áudios), capa gerada quando não houver —
 * NUNCA emoji de câmera nem monograma. Progresso real (% + "Xmin restantes") para
 * vídeos com resume; badges ✓/▶ continuar; ⭐ (pasta = curso, resto =
 * arquivo). Foco via FocusAnimator.attachCard.
 */
class FileAdapter(
    private val onFolder: (FileItem) -> Unit,
    private val onFile: (FileItem) -> Unit,
    /**
     * Frente A (TV) — id para o qual a 1ª linha da grade volta com
     * UP (o detalhe passa R.id.tabAulas; o BrowseActivity não passa
     * e mantém o roteamento padrão). Sem isto, UP da 1ª linha cai
     * no FocusFinder, que ignora o que está fora do viewport.
     */
    private val firstRowNextFocusUpId: Int = View.NO_ID
) : ListAdapter<FileItem, FileAdapter.VH>(DIFF) {

    // R21 — maior posição já animada neste adapter (ver onBindViewHolder).
    private var lastAnimatedPosition = -1


    private var resumedNames: Set<String> = emptySet()
    private var watchedNames: Set<String> = emptySet()
    private var currentFolderPath: String = "/"

    // Ronda 27 — progresso por pasta (grade de Aulas do celular):
    // chave = folderPath do grupo; o mapa é posto pelo DetailActivity.
    private var folderProgress: Map<String, FolderTileProgress> = emptyMap()

    // Ronda 27 — cor fixa da área do nome (TileColors): cache da
    // última lista + span; recalcula-se quando a lista (referência)
    // ou o span muda — a atribuição depende da ordem da lista.
    private var tileColors: List<Int> = emptyList()
    private var tileColorsList: List<FileItem>? = null
    private var tileColorsSpan: Int = 0

    fun setResumeAndWatched(resumed: Set<String>, watched: Set<String>) {
        resumedNames = resumed
        watchedNames = watched
        if (itemCount > 0) notifyItemRangeChanged(0, itemCount)
    }

    /** Ronda 27 — progresso das pastas; refresca os Tiles visíveis. */
    fun setFolderProgress(progress: Map<String, FolderTileProgress>) {
        folderProgress = progress
        if (itemCount > 0) notifyItemRangeChanged(0, itemCount)
    }

    fun setFolderPath(path: String) {
        currentFolderPath = path
    }

    /** Chave estável do Tile p/ a cor (o caminho da pasta/arquivo). */
    private fun tileKey(item: FileItem): String =
        item.folderPath ?: "$currentFolderPath${item.name}"

    /** Span da grade do pai (1 sem grade; o último válido, se sem pai). */
    private fun spanCountFor(holder: VH): Int {
        val span = (holder.itemView.parent as? RecyclerView)?.layoutManager
            ?.let { it as? GridLayoutManager }?.spanCount
        if (span != null && span > 0) return span
        return if (tileColorsSpan > 0) tileColorsSpan else 1
    }

    private fun ensureTileColors(span: Int) {
        val list = currentList
        if (list === tileColorsList && span == tileColorsSpan) return
        tileColors = TileColors.assign(list.map { tileKey(it) }, span)
        tileColorsList = list
        tileColorsSpan = span
    }

    /**
     * Ronda 27 — altura da capa: 16:9 da coluna, com piso de 72dp
     * (a pilha de selos do canto superior direito precisa de 68dp)
     * e teto de 110dp. Todas as grades do FileAdapter usam
     * GridGutterDecoration(10) — o cálculo assume esse gutter.
     * Só mexe quando muda (sem isto, cada bind re-media o item).
     */
    private fun applyImageHeight(holder: VH) {
        val parent = holder.itemView.parent as? RecyclerView ?: return
        val span = (parent.layoutManager as? GridLayoutManager)?.spanCount ?: return
        val widthPx = parent.width - parent.paddingLeft - parent.paddingRight
        if (widthPx <= 0 || span < 1) return
        val density = holder.itemView.resources.displayMetrics.density
        val gutterPx = (10 * density).toInt()
        val colWidthDp = (widthPx - span * gutterPx) / span / density
        val targetDp = (colWidthDp * 9f / 16f).coerceIn(72f, 110f)
        val targetPx = (targetDp * density).toInt()
        val area = holder.binding.cardImageArea ?: return // FIX CI #102 — o layout-television de item_rail_card não tem card_image_area; sem a vista não há nada a redimensionar
        val lp = area.layoutParams
        if (lp.height != targetPx) {
            lp.height = targetPx
            area.layoutParams = lp
        }
    }

    inner class VH(val binding: ItemRailCardBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos == RecyclerView.NO_POSITION) return@setOnClickListener
                val item = getItem(pos)
                if (item.isFolder) onFolder(item) else onFile(item)
            }
            // Ronda 27 (regra 2.7.44) — título completo ao tocar e
            // segurar: duas pastas podem mostrar o mesmo título
            // cortado ("PF - Papiloscopista…"); o toque longo mostra
            // o nome inteiro. Não muda o toque normal (abre a pasta).
            binding.root.setOnLongClickListener {
                val pos = bindingAdapterPosition
                if (pos == RecyclerView.NO_POSITION) return@setOnLongClickListener false
                Toast.makeText(binding.root.context, getItem(pos).name, Toast.LENGTH_LONG).show()
                true
            }
            // R18B (Bug 1 #7): 1.05x na TV — a 1.10x a folga era
            // só 1,1dp (e a vertical já tocava o vizinho); 1.05x dá
            // 5,5dp / 4,9dp de folga, simétrico com a grade #4.
            // Ronda 27 — anel BRANCO e grosso (4dp): o rosa dá
            // 3,6–4,5:1 sobre as cores fixas dos Tiles; o branco dá
            // 8,0–10,8:1 e o foco continua visível em qualquer cor.
            FocusAnimator.attachCard(
                binding.cardRoot, TvUtils.isTv(binding.root.context),
                scaleTv = FocusAnimator.SCALE_TV_DENSE,
                ringColorRes = R.color.tile_focus_ring_white,
                ringWidthDp = 4f
            )
            TapFeedback.attachPress(binding.cardRoot, TvUtils.isTv(binding.root.context))
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val inflater = LayoutInflater.from(parent.context)
        val vh = VH(ItemRailCardBinding.inflate(inflater, parent, false))
        vh.binding.root.layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        )
        return vh
    }

    /**
     * Frente A (TV) — UP da 1ª linha da grade -> firstRowNextFocusUpId.
     * Feito em onViewAttachedToWindow (e não no onBind) porque o
     * prefetch do RecyclerView pode ligar o VH antes de ele ter
     * pai — e o spanCount só se lê do LayoutManager do pai.
     */
    override fun onViewAttachedToWindow(holder: VH) {
        super.onViewAttachedToWindow(holder)
        // Ronda 27 — a altura da capa depende da largura medida do
        // pai; aqui o pai já está medido (no onBind pode ainda não estar).
        applyImageHeight(holder)
        if (firstRowNextFocusUpId == View.NO_ID) return
        val pos = holder.bindingAdapterPosition
        if (pos == RecyclerView.NO_POSITION) return
        val span = (holder.itemView.parent as? RecyclerView)?.layoutManager
            ?.let { it as? GridLayoutManager }?.spanCount ?: 1
        holder.itemView.nextFocusUpId =
            if (pos < span) firstRowNextFocusUpId else View.NO_ID
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = getItem(position)
        val res = holder.itemView.resources
        val ctx = holder.itemView.context
        // Ronda 27 — capa 16:9 da coluna + cor fixa da área do nome.
        applyImageHeight(holder)
        ensureTileColors(spanCountFor(holder))

        with(holder.binding) {
            cardTitle.text = item.name
            // Ronda 27 — cor fixa da área do nome (TileColors): a
            // imagem fica; o título já é branco; o subtítulo e o
            // texto do progresso passam a branco (o cinza dá 4,3:1
            // e o rosa 3,6–4,5:1 sobre a paleta; o branco dá 8,0–9,9:1).
            cardBody?.setBackgroundColor(tileColors[position]) // FIX CI #102 — o layout-television de item_rail_card não tem card_body; chamada segura: sem a vista salta a cor mas o bind continua (título/subtítulo/progresso)
            val white = ContextCompat.getColor(ctx, R.color.tile_title)
            cardSubtitle.setTextColor(white)
            cardProgressText.setTextColor(white)
            cardSubtitle.text = when {
                item.isFolder -> "pasta"
                item.isVideo -> "vídeo · ${item.humanSize}"
                item.isAudio -> "áudio · ${item.humanSize}"
                item.isPdf -> "PDF · ${item.humanSize}"
                item.isMarkdown -> "Markdown · ${item.humanSize}"
                else -> item.humanSize
            }

            val baseColor = colorFromString(item.name)
            cardBg.background = CardGradient.drawable(res, baseColor)

            // Thumb real quando houver; sem ela, a imagem da biblioteca
            // ESTRITA pelo nome do arquivo/pasta (camada 3, 2.7.13 —
            // sem 'geral'); sem match, a capa gerada do drive (onda 2 —
            // nunca monograma). Pastas também passam pela biblioteca:
            // "Direito Penal" mostra a foto de Direito Penal, não a
            // capa genérica do drive.
            val coverRes = com.meggy.app.util.ThumbArt.coverResForPath(currentFolderPath)
            val thumbUrl = LibraryCovers.remoteCoverStrict(item.thumbnailLink, item.name, currentFolderPath)
            if (thumbUrl != null) {
                cardThumbnail.visibility = View.VISIBLE
                cardThumbnail.load(thumbUrl) {
                    error(coverRes)
                    listener(onError = { _, _ ->
                        cardThumbnail.visibility = View.VISIBLE
                        cardThumbnail.setImageResource(coverRes)
                    })
                }
            } else {
                cardThumbnail.visibility = View.VISIBLE
                cardThumbnail.setImageResource(coverRes)
            }

            // Progresso real para vídeos.
            val sm = SessionManager.get(ctx)
            if (item.isVideo || item.isAudio) {
                val progress = sm.getResumeProgress(currentFolderPath, item.name)
                if (progress > 0) {
                    val pos = sm.getResume(currentFolderPath, item.name)
                    val dur = sm.getResumeDuration(currentFolderPath, item.name)
                    progressRow.visibility = View.VISIBLE
                    cardProgress.progress = progress
                    cardProgressText.text = Format.progressText(progress, dur, pos)
                } else {
                    progressRow.visibility = View.GONE
                }
            } else {
                progressRow.visibility = View.GONE
            }

            continueBadge.visibility =
                if ((item.isVideo || item.isAudio) && item.name in resumedNames) View.VISIBLE else View.GONE
            watchedBadge.visibility =
                if ((item.isVideo || item.isAudio) && item.name in watchedNames) View.VISIBLE else View.GONE

            // Ronda 27 — progresso da PASTA (grade de Aulas do
            // celular): barra + "Continuar" dentro do Tile, no lugar
            // do "Em curso · N%" da linha; pasta completa leva o ✓.
            // Pastas sem progresso não mudam; arquivos não entram aqui.
            val fprog = if (item.isFolder) folderProgress[item.folderPath] else null
            if (fprog != null) {
                if (fprog.showProgress) {
                    progressRow.visibility = View.VISIBLE
                    cardProgress.progress = fprog.barProgress
                    cardProgressText.text = fprog.text
                } else {
                    progressRow.visibility = View.GONE
                }
                continueBadge.visibility = if (fprog.showContinue) View.VISIBLE else View.GONE
                watchedBadge.visibility = if (fprog.complete) View.VISIBLE else View.GONE
            }

            // ★ Minha lista — pasta = curso; resto = arquivo.
            if (item.isFolder) {
                // Ronda 27 — o folderPath do item (grade de Aulas)
                // já é o caminho certo; sem ele (BrowseActivity),
                // compõe-se como antes. Sem isto, no modo por ID a
                // estrela marcava um caminho inexistente.
                val coursePath = item.folderPath
                    ?: if (currentFolderPath.endsWith("/")) "$currentFolderPath${item.name}/"
                    else "$currentFolderPath/${item.name}/"
                favStar.visibility = View.VISIBLE
                favStar.text = if (sm.isFavoriteCourse(coursePath)) "⭐" else "☆"
                favStar.setOnClickListener {
                    val nowFav = sm.toggleFavoriteCourse(coursePath, item.name)
                    favStar.text = if (nowFav) "⭐" else "☆"
                    Toast.makeText(ctx,
                        if (nowFav) "⭐ Curso adicionado à Minha lista"
                        else "Curso removido da Minha lista",
                        Toast.LENGTH_SHORT).show()
                }
            } else {
                val favItem = item.copy(folderPath = currentFolderPath)
                favStar.visibility = View.VISIBLE
                favStar.text = if (sm.isFavorite(currentFolderPath, item.name)) "⭐" else "☆"
                favStar.setOnClickListener {
                    val nowFav = sm.toggleFavorite(favItem)
                    favStar.text = if (nowFav) "⭐" else "☆"
                    Toast.makeText(ctx,
                        if (nowFav) "⭐ Adicionado à Minha lista"
                        else "Removido da Minha lista",
                        Toast.LENGTH_SHORT).show()
                }
            }
        }

        // Ronda 27 — alvo de toque da estrela ≥48dp: a estrela
        // visual tem 32dp; o TouchDelegate no card alarga a área
        // para 48dp (8dp de cada lado). Repõe-se a cada bind (o VH é
        // reciclado) e lê-se a posição no post{} — a estrela só tem
        // posição certa depois do layout. Sem o else, um delegate
        // velho ficava a apontar para a estrela de outro Tile.
        holder.binding.root.post {
            val star = holder.binding.favStar
            val root = holder.binding.root
            if (star.visibility == View.VISIBLE) {
                val rect = Rect()
                star.getHitRect(rect)
                val starParent = star.parent as? View
                if (starParent != null) rect.offset(starParent.left, starParent.top)
                val extra = (8 * holder.itemView.resources.displayMetrics.density).toInt()
                rect.inset(-extra, -extra)
                root.touchDelegate = TouchDelegate(rect, star)
            } else {
                root.touchDelegate = null
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

    companion object {
        val DIFF = object : DiffUtil.ItemCallback<FileItem>() {
            override fun areItemsTheSame(oldItem: FileItem, newItem: FileItem): Boolean =
                oldItem.id == newItem.id && oldItem.name == newItem.name
            override fun areContentsTheSame(oldItem: FileItem, newItem: FileItem): Boolean =
                oldItem == newItem
        }
    }
}
