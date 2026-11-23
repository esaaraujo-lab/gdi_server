package com.meggy.app.ui.detail

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.meggy.app.R
import com.meggy.app.data.FileItem
import com.meggy.app.data.colorFromString
import com.meggy.app.databinding.ItemLessonCardBinding
import com.meggy.app.databinding.ItemLessonChildBinding
import com.meggy.app.databinding.ItemLessonHeaderBinding
import com.meggy.app.util.CardGradient
import com.meggy.app.util.FocusAnimator
import com.meggy.app.util.TapFeedback
import com.meggy.app.util.Format
import com.meggy.app.util.SessionManager
import com.meggy.app.util.ThumbArt
import com.meggy.app.util.LibraryCovers
import com.meggy.app.util.TvUtils

/**
 * v2.7.6 — "Escolher as aulas" (conceitos escolher-aulas phone/TV).
 *
 * Estrutura INTERFOLDER preservada: cada aula é uma pasta com o nome
 * da aula; dentro, vídeo + PDF ou pasta de PDFs (+ .md/transcrição).
 * NÃO achatar numa lista só de vídeos.
 *
 * - Celular: [LessonListAdapter] — linha expansível por aula; ao abrir,
 *   os filhos são listados (um `listFolder`, cache em memória) e
 *   aparecem embutidos: vídeo (▶ Vídeo — MM:SS), PDF (nome + tamanho),
 *   pasta de PDFs (N arquivos), .md/transcrição (leitor de MD).
 * - TV/tablet largo: [LessonGridAdapter] — grade 2 colunas de cards.
 *
 * Progresso por aula: % (do vídeo principal, quando há resume),
 * selo "Concluída" (vídeo assistido) e "Continuar" que retoma o
 * ponto exato via o caminho normal do player.
 */

data class LessonGroup(
    val folder: FileItem,
    val folderPath: String,
    var children: List<FileItem>? = null,
    var expanded: Boolean = false,
    var pdfFolderCount: Int = -1 // -1 = não carregado
)

/**
 * Ronda 15 Frente B (B4) — progresso de um grupo (aula).
 *
 * O progresso do 1.º vídeo dos filhos carregados (como antes) é
 * combinado com o melhor progresso dos recents em memória para o
 * mesmo folderPath. Isto resolve o caso children == null (o prefetch
 * pára nos 20 grupos): o grupo pode ter progresso real mesmo sem os
 * filhos carregados, porque o recent guarda o (folderPath, videoName)
 * certo — sem listFolder nenhum, sem rede extra.
 *
 * Ronda 16 Frente B — os recents passam a casar por PREFIXO (a
 * subárvore inteira), não só por igualdade exacta: um vídeo visto
 * numa subpasta marca a pasta-mãe como iniciada ("Continuar" ou
 * "N% concluída", nunca "não iniciada" falso). O prefixo é
 * normalizado com "/" final para não casar com irmãs de nome mais
 * comprido — em modo por ID ("by-id:<id>", sem "/") o prefixo
 * nunca casa com descendentes (ids opacos); aí vale a igualdade.
 * O % continua a ser o MÁXIMO (maxOf), não uma média.
 *
 * Ronda 17 Frente B — a % passa a ser uma FRAÇÃO (terminados /
 * total): 100% SÓ quando TODOS os vídeos conhecidos terminaram. O
 * numerador conta os vídeos directos (filhos carregados) + os
 * recents da subárvore que não são directos (dedup por (pasta,
 * vídeo)); o denominador é a soma dos dois. Só vídeos/áudios —
 * PDFs e pastas ficam FORA (um PDF não tem watched nem %; se
 * contasse, uma pasta com PDFs nunca chegaria a 100%). O grupo
 * "Arquivos avulsos" (__loose__, folderPath = currentPath) casa
 * recents SÓ por igualdade exacta: o prefixo seria a pasta inteira
 * e os vídeos das subpastas (grupos próprios) seriam contados
 * aqui também. Limites honestos ("dos conhecidos"): os recents
 * são só os últimos 8 — um vídeo terminado fora dos recents e fora
 * dos filhos directos é invisível (o % fica por defeito, nunca um
 * 100% falso); em modo por ID o prefixo nunca casa com
 * descendentes (ids opacos); vídeos a ≥2 níveis nunca abertos não
 * entram no denominador — o mesmo limite do chip. E 100% exige
 * filhos carregados (children != null): sem eles o denominador
 * directo é desconhecido e o cartão diz "Em curso", nunca 100%.
 *
 * [hasResume] cobre o caso migrado (B2) em que há posição guardada
 * mas ainda não há duração: o % é desconhecido mas o vídeo pode ser
 * retomado — o cartão mostra "Continuar", não "não iniciada".
 * [known] é falso só quando não há NENHUMA fonte de progresso
 * (sem filhos carregados E sem recents): aí o cartão NÃO pode afirmar
 * "não iniciada" — fica no estado neutro "a carregar…".
 */
private data class GroupProgress(
    /** Melhor progresso parcial conhecido (0..100), para "Em curso". */
    val progress: Int,
    /** Vídeos/áudios conhecidos terminados (flag watched_* por vídeo). */
    val watchedCount: Int,
    /** Vídeos/áudios conhecidos no total (denominador da fração). */
    val totalCount: Int,
    val hasResume: Boolean,
    val known: Boolean,
    /** Filhos carregados (children != null): sem eles o denominador directo é desconhecido. */
    val childrenLoaded: Boolean
) {
    /** % de conclusão da pasta: terminados/total ("dos conhecidos"). */
    val pct: Int get() = if (totalCount > 0) watchedCount * 100 / totalCount else 0
    /**
     * Completa só quando há vídeos conhecidos, todos terminaram E os
     * filhos estão carregados: sem children o denominador directo é
     * desconhecido (ex.: grupos além dos 20 do prefetch) e um 100%
     * por recents seria o mesmo bug de antes, noutra forma.
     */
    val isComplete: Boolean
        get() = totalCount > 0 && watchedCount >= totalCount && childrenLoaded
}

private fun groupProgress(sm: SessionManager, group: LessonGroup): GroupProgress {
    // Vídeos directos conhecidos: os filhos carregados. PDFs e pastas
    // ficam FORA do denominador (ver o KDoc acima).
    val directVideos = group.children?.filter { it.isVideo || it.isAudio }.orEmpty()
    val directWatched = directVideos.count { sm.isWatched(group.folderPath, it.name) }
    val directProgress = directVideos.maxOfOrNull { sm.getResumeProgress(group.folderPath, it.name) } ?: 0
    val directHasResume = directVideos.any { sm.hasResume(group.folderPath, it.name) }
    // Ronda 16 Frente B — a pasta vê os recents de TODA a subárvore, não
    // só os da própria pasta: um vídeo numa subpasta (qualquer nível)
    // marca a pasta-mãe como iniciada. O prefixo leva "/" final — o
    // folderPath por caminho já a traz (buildLessonGroups), mas o modo
    // por ID (ApiService.byIdPath = "by-id:<id>") não: sem a "/" o
    // prefixo casaria com pastas-irmãs de id mais comprido
    // ("by-id:abc" casaria "by-id:abcd"). Em modo por ID os ids são
    // opacos — a hierarquia não está no caminho — por isso o prefixo
    // nunca casa com descendentes aí (limite, ver NOTES.md): vale a
    // igualdade exacta para a pasta imediata, como antes.
    // Ronda 17 Frente B — o grupo sintético "Arquivos avulsos"
    // (id "__loose__", folderPath = currentPath) casa recents SÓ por
    // igualdade exacta: o prefixo seria a pasta inteira e os vídeos
    // das subpastas (grupos próprios) seriam contados aqui também.
    // Os filhos soltos já estão pré-carregados em children — o
    // denominador directo cobre-os; os recents só confirmam.
    val folderPrefix = if (group.folderPath.endsWith("/")) group.folderPath else group.folderPath + "/"
    val recents = if (group.folder.id == "__loose__") {
        sm.getRecents().filter { it.folderPath == group.folderPath }
    } else {
        sm.getRecents().filter { it.folderPath == group.folderPath || it.folderPath.startsWith(folderPrefix) }
    }
    // Recents que NÃO são vídeos directos: vídeos de subpastas (≥2
    // níveis) ou de pastas cujos filhos ainda não carregaram. Dedup
    // por (pasta, vídeo) — um recent do vídeo directo não conta duas
    // vezes. Os recents são só os últimos 8: um vídeo terminado fora
    // dos recents e fora dos filhos directos é invisível — o % fica
    // por defeito (nunca um 100% falso; ver o KDoc acima).
    val directKeys = directVideos.map { group.folderPath to it.name }.toSet()
    val extraRecents = recents
        .filter { (it.folderPath to it.videoName) !in directKeys }
        .distinctBy { it.folderPath to it.videoName }
    val extraWatched = extraRecents.count { sm.isWatched(it.folderPath, it.videoName) }
    val extraProgress = extraRecents.maxOfOrNull { sm.getResumeProgress(it.folderPath, it.videoName) } ?: 0
    val extraHasResume = extraRecents.any { sm.hasResume(it.folderPath, it.videoName) }
    return GroupProgress(
        progress = maxOf(directProgress, extraProgress),
        watchedCount = directWatched + extraWatched,
        totalCount = directVideos.size + extraRecents.size,
        hasResume = directHasResume || extraHasResume,
        known = group.children != null || recents.isNotEmpty(),
        childrenLoaded = group.children != null
    )
}

class LessonListAdapter(
    private val onPlayVideo: (FileItem, String) -> Unit,
    private val onOpenPdf: (FileItem, String) -> Unit,
    private val onOpenMd: (FileItem, String) -> Unit,
    private val onOpenFolder: (FileItem, String) -> Unit,
    private val onToggleExpand: (LessonGroup, Int) -> Unit
) : RecyclerView.Adapter<RecyclerView.ViewHolder>() {

    companion object {
        private const val TYPE_HEADER = 0
        private const val TYPE_CHILD = 1
    }

    /** Linhas visíveis: header + filhos da aula expandida. */
    private val rows = mutableListOf<Any>()

    // R21 — estado de expansão por grupo no último submit: os
    // LessonGroup são objectos mutáveis partilhados, por isso o
    // DiffUtil não pode comparar o grupo consigo próprio para saber
    // se a expansão mudou — compara com este instantâneo.
    private var lastExpanded: Map<String, Boolean> = emptyMap()

    fun submit(groups: List<LessonGroup>) {
        // R21: DiffUtil em vez de notifyDataSetChanged() total — o
        // submit corre a CADA TECLA da busca de aulas (filterLessons)
        // e o rebind total perdia o foco D-pad e re-ligava todas as
        // capas. Identidade: grupo = folderPath; filho = folderPath
        // + id do ficheiro (único no Drive). Conteúdo do grupo:
        // expansão (instantâneo), referência dos filhos (muda quando
        // o prefetch/entrega os atribui) e pdfFolderCount.
        val newRows = mutableListOf<Any>()
        groups.forEach { g ->
            newRows.add(g)
            if (g.expanded) g.children?.forEach { newRows.add(LessonChild(g, it)) }
        }
        val diff = DiffUtil.calculateDiff(object : DiffUtil.Callback() {
            override fun getOldSize(): Int = rows.size
            override fun getNewSize(): Int = newRows.size
            override fun areItemsTheSame(oldPos: Int, newPos: Int): Boolean {
                val o = rows[oldPos]
                val n = newRows[newPos]
                return when {
                    o is LessonGroup && n is LessonGroup ->
                        o.folderPath == n.folderPath
                    o is LessonChild && n is LessonChild ->
                        o.group.folderPath == n.group.folderPath && o.item.id == n.item.id
                    else -> false
                }
            }
            override fun areContentsTheSame(oldPos: Int, newPos: Int): Boolean {
                val o = rows[oldPos]
                val n = newRows[newPos]
                return when {
                    o is LessonGroup && n is LessonGroup ->
                        lastExpanded[o.folderPath] == n.expanded &&
                            o.children === n.children &&
                            o.pdfFolderCount == n.pdfFolderCount
                    o is LessonChild && n is LessonChild -> o.item == n.item
                    else -> false
                }
            }
        })
        rows.clear()
        rows.addAll(newRows)
        lastExpanded = groups.associate { it.folderPath to it.expanded }
        diff.dispatchUpdatesTo(this)
    }

    /**
     * Ronda 17 Frente B — actualiza SÓ os cabeçalhos dos grupos
     * indicados (ex.: o prefetch entregou-lhes os filhos). Sem
     * re-bind total: o foco D-pad sobrevive. Os filhos expandidos
     * não são recriados aqui — um grupo expandido com children a
     * null é uma corrida estreita (o expandir carrega logo os
     * filhos); o próximo submit repõe as linhas-filhas.
     */
    fun refreshGroups(changed: Collection<LessonGroup>) {
        for (g in changed) {
            val row = rows.indexOfFirst { it === g }
            if (row >= 0) notifyItemChanged(row)
        }
    }

    data class LessonChild(val group: LessonGroup, val item: FileItem)

    inner class HeaderVH(val binding: ItemLessonHeaderBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos == RecyclerView.NO_POSITION) return@setOnClickListener
                // R21: cast seguro — um submit() entre o bind e o
                // clique podia trocar o tipo da linha (crash evitado).
                val group = rows.getOrNull(pos) as? LessonGroup ?: return@setOnClickListener
                onToggleExpand(group, pos)
            }
            FocusAnimator.attach(binding.root, TvUtils.isTv(binding.root.context))
            TapFeedback.attachPress(binding.root, TvUtils.isTv(binding.root.context))
        }
    }

    inner class ChildVH(val binding: ItemLessonChildBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos == RecyclerView.NO_POSITION) return@setOnClickListener
                val child = rows.getOrNull(pos) as? LessonChild ?: return@setOnClickListener
                when {
                    child.item.isVideo || child.item.isAudio -> onPlayVideo(child.item, child.group.folderPath)
                    child.item.isPdf -> onOpenPdf(child.item, child.group.folderPath)
                    child.item.isMarkdown -> onOpenMd(child.item, child.group.folderPath)
                    child.item.isFolder -> onOpenFolder(child.item, child.group.folderPath)
                }
            }
            FocusAnimator.attach(binding.root, TvUtils.isTv(binding.root.context))
            TapFeedback.attachPress(binding.root, TvUtils.isTv(binding.root.context))
        }
    }

    override fun getItemViewType(position: Int): Int =
        if (rows[position] is LessonGroup) TYPE_HEADER else TYPE_CHILD

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        val inflater = LayoutInflater.from(parent.context)
        return if (viewType == TYPE_HEADER) {
            HeaderVH(ItemLessonHeaderBinding.inflate(inflater, parent, false))
        } else {
            ChildVH(ItemLessonChildBinding.inflate(inflater, parent, false))
        }
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        val ctx = holder.itemView.context
        val sm = SessionManager.get(ctx)
        when (val row = rows[position]) {
            is LessonGroup -> {
                val b = (holder as HeaderVH).binding
                b.lessonTitle.text = row.folder.name
                // Ronda 17 Frente B — progresso via groupProgress, agora
                // uma FRAÇÃO (terminados/total): 100% só com tudo
                // terminado; parcial sem nenhum terminado é "Em curso".
                val video = row.children?.firstOrNull { it.isVideo || it.isAudio }
                val gp = groupProgress(sm, row)
                val progress = gp.progress
                val watchedCount = gp.watchedCount
                val pct = gp.pct
                val complete = gp.isComplete
                val hasResume = gp.hasResume
                val known = gp.known
                // Barra: 100 só quando completa; com terminados, a
                // fração; senão, o melhor parcial (nunca o máximo
                // como "% concluído" — ver o texto abaixo).
                val barProgress = if (complete) 100 else if (watchedCount > 0) pct else progress
                b.lessonProgress.progress = barProgress
                b.lessonProgressText.text = when {
                    complete -> "100% concluído"
                    watchedCount > 0 && pct < 100 -> "$pct% concluído"
                    watchedCount > 0 -> "Em curso"
                    progress > 0 -> "Em curso · $progress%"
                    hasResume -> "Continuar"
                    !known -> "a carregar…"
                    else -> "não iniciado"
                }
                b.lessonBadge.visibility = if (complete) View.VISIBLE else View.GONE
                b.lessonContinue.visibility = if ((progress > 0 || hasResume) && !complete) View.VISIBLE else View.GONE
                b.lessonContinue.setOnClickListener {
                    if (video != null) onPlayVideo(video, row.folderPath)
                }
                b.lessonProgressRow.visibility =
                    if (complete || watchedCount > 0 || progress > 0 || hasResume || !known) View.VISIBLE else View.GONE
                val meta = buildList {
                    video?.let { add(if (it.isAudio) "áudio" else "vídeo") }
                    val pdfs = row.children?.count { it.isPdf } ?: 0
                    if (pdfs > 0) add("$pdfs PDF")
                    if (row.pdfFolderCount >= 0) add("${row.pdfFolderCount} arquivos")
                }.joinToString(" · ")
                b.lessonMeta.text = meta.ifBlank { "" }
                b.lessonMeta.visibility = if (meta.isBlank()) View.GONE else View.VISIBLE
                b.lessonChevron.text = if (row.expanded) "▲" else "▼"
            }
            is LessonChild -> {
                val b = (holder as ChildVH).binding
                val item = row.item
                b.childIcon.text = when {
                    item.isVideo -> "▶"
                    item.isAudio -> "♪"
                    item.isPdf -> "📄"
                    item.isMarkdown -> "≡"
                    item.isFolder -> "📁"
                    else -> "•"
                }
                b.childTitle.text = item.name
                b.childMeta.text = when {
                    item.isVideo -> {
                        val pos = sm.getResume(row.group.folderPath, item.name)
                        val dur = sm.getResumeDuration(row.group.folderPath, item.name)
                        if (dur > 0) "Vídeo — ${Format.mmss(dur)}" else "Vídeo"
                    }
                    item.isAudio -> "Áudio"
                    item.isPdf -> "PDF · ${item.humanSize}"
                    item.isMarkdown -> "Markdown · ${item.humanSize}"
                    item.isFolder -> {
                        val count = row.group.pdfFolderCount
                        if (count >= 0) "Pasta de PDFs — $count arquivos" else "Pasta de PDFs"
                    }
                    else -> item.humanSize
                }
            }
        }
    }

    override fun getItemCount(): Int = rows.size
}

/**
 * v2.7.6 — Grade TV/tablet largo (2 colunas): card por aula com
 * thumb/monograma, título, chips ("▶ Vídeo MM:SS" / "PDF" / "N PDFS"),
 * "% concluída" + barra rosa. Clique = reproduz o vídeo da aula.
 */
class LessonGridAdapter(
    private val onPlayLesson: (LessonGroup) -> Unit,
    private val onOpenLesson: (LessonGroup) -> Unit
) : RecyclerView.Adapter<LessonGridAdapter.VH>() {

    private val groups = mutableListOf<LessonGroup>()

    fun submit(newGroups: List<LessonGroup>) {
        // R21: DiffUtil (identidade = folderPath; conteúdo = filhos/
        // pdfFolderCount por referência) em vez do rebind total.
        val diff = DiffUtil.calculateDiff(object : DiffUtil.Callback() {
            override fun getOldSize(): Int = groups.size
            override fun getNewSize(): Int = newGroups.size
            override fun areItemsTheSame(oldPos: Int, newPos: Int): Boolean =
                groups[oldPos].folderPath == newGroups[newPos].folderPath
            override fun areContentsTheSame(oldPos: Int, newPos: Int): Boolean =
                groups[oldPos].children === newGroups[newPos].children &&
                    groups[oldPos].pdfFolderCount == newGroups[newPos].pdfFolderCount
        })
        groups.clear()
        groups.addAll(newGroups)
        diff.dispatchUpdatesTo(this)
    }

    /**
     * Ronda 17 Frente B — actualiza SÓ as posições indicadas (ex.:
     * o prefetch entregou-lhes os filhos). Sem re-bind total: o
     * foco D-pad sobrevive. As posições são as da lista filtrada
     * que o adapter detém (ver DetailActivity.refreshPrefetchedGroups).
     */
    fun refreshPositions(positions: Collection<Int>) {
        for (pos in positions) {
            if (pos in groups.indices) notifyItemChanged(pos)
        }
    }

    inner class VH(val binding: ItemLessonCardBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos == RecyclerView.NO_POSITION) return@setOnClickListener
                // R21: getOrNull — posição obsoleta após um submit.
                val group = groups.getOrNull(pos) ?: return@setOnClickListener
                onPlayLesson(group)
            }
            // R18B (Bug 1 #4): 1.05x na TV — ±9,9dp < gap 12dp,
            // zero sobreposição; anel 3dp + elevação mantidos.
            FocusAnimator.attachCard(binding.lessonCardRoot, TvUtils.isTv(binding.root.context), scaleTv = FocusAnimator.SCALE_TV_DENSE)
            TapFeedback.attachPress(binding.lessonCardRoot, TvUtils.isTv(binding.root.context))
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val inflater = LayoutInflater.from(parent.context)
        return VH(ItemLessonCardBinding.inflate(inflater, parent, false))
    }

    /**
     * Frente A (TV) — UP da 1ª linha da grade (span 2 fixo no
     * DetailActivity) volta à aba Aulas. Sem isto, UP da 1ª linha
     * cai no FocusFinder, que ignora as abas quando a grade rolou.
     * Em onViewAttachedToWindow (ver FileAdapter): o prefetch pode
     * ligar o VH sem pai e a posição só é fiável quando anexado.
     */
    override fun onViewAttachedToWindow(holder: VH) {
        super.onViewAttachedToWindow(holder)
        val pos = holder.bindingAdapterPosition
        if (pos == RecyclerView.NO_POSITION) return
        holder.itemView.nextFocusUpId = if (pos < 2) R.id.tabAulas else View.NO_ID
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val group = groups[position]
        val res = holder.itemView.resources
        val ctx = holder.itemView.context
        val sm = SessionManager.get(ctx)
        val video = group.children?.firstOrNull { it.isVideo || it.isAudio }
        // Ronda 17 Frente B — ver groupProgress: fração
        // (terminados/total); 100% só com tudo terminado.
        val gp = groupProgress(sm, group)
        val progress = gp.progress
        val watchedCount = gp.watchedCount
        val pct = gp.pct
        val complete = gp.isComplete
        val hasResume = gp.hasResume
        val known = gp.known
        val dur = if (video != null) sm.getResumeDuration(group.folderPath, video.name) else 0L

        with(holder.binding) {
            lessonCardBg.background = CardGradient.drawable(res, colorFromString(group.folder.name))
            // v2.7.11 onda 2 + camada (3) ESTRITA (2.7.13, sem 'geral')
            // — sem thumb do vídeo, a imagem da biblioteca pelo nome da
            // aula/pasta; sem match, a capa gerada do drive (nunca monograma).
            val coverRes = ThumbArt.coverResForPath(group.folderPath)
            val thumb = LibraryCovers.remoteCoverStrict(
                video?.thumbnailLink, group.folder.name, group.folderPath
            )
            if (!thumb.isNullOrBlank()) {
                lessonCardThumb.visibility = View.VISIBLE
                lessonCardMonogram.visibility = View.GONE
                lessonCardThumb.load(thumb) {
                    error(coverRes)
                    listener(onError = { _, _ ->
                        lessonCardThumb.setImageResource(coverRes)
                    })
                }
            } else {
                lessonCardThumb.visibility = View.VISIBLE
                lessonCardMonogram.visibility = View.GONE
                lessonCardThumb.setImageResource(coverRes)
            }
            lessonCardTitle.text = group.folder.name
            if (video != null) {
                lessonCardChipVideo.visibility = View.VISIBLE
                lessonCardChipVideo.text = if (video.isAudio) "♪ Áudio"
                    else "▶ Vídeo${if (dur > 0) " ${Format.mmss(dur)}" else ""}"
            } else {
                lessonCardChipVideo.visibility = View.GONE
            }
            val pdfs = group.children?.count { it.isPdf } ?: 0
            val pdfTotal = pdfs + group.pdfFolderCount.coerceAtLeast(0)
            if (pdfTotal > 0) {
                lessonCardChipPdf.visibility = View.VISIBLE
                lessonCardChipPdf.text = if (pdfTotal == 1) "1 PDF" else "$pdfTotal PDFS"
            } else {
                lessonCardChipPdf.visibility = View.GONE
            }
            // Barra: ver o bind da lista (100 só quando completa;
            // com terminados, a fração; senão, o melhor parcial).
            val barProgress = if (complete) 100 else if (watchedCount > 0) pct else progress
            lessonCardProgress.progress = barProgress
            lessonCardProgressText.text = when {
                complete -> "100% concluída"
                watchedCount > 0 && pct < 100 -> "$pct% concluída"
                watchedCount > 0 -> "Em curso"
                progress > 0 -> "Em curso · $progress%"
                hasResume -> "Continuar"
                !known -> "a carregar…"
                else -> "não iniciada"
            }
        }
    }

    override fun getItemCount(): Int = groups.size
}
