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
import com.bibigyn.app.data.AdminDrive
import com.bibigyn.app.data.ApiService
import com.bibigyn.app.data.DriveItem
import com.bibigyn.app.util.setWordEllipsized
import com.bibigyn.app.databinding.ItemDriveCardBinding
import com.bibigyn.app.util.DriveRailItem
import com.bibigyn.app.util.FocusAnimator
import com.bibigyn.app.util.TapFeedback
import com.bibigyn.app.util.CoverLibrary
import com.bibigyn.app.util.SessionManager
import com.bibigyn.app.util.TvUtils
import com.bibigyn.app.util.TvAutoFit

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
    // Ronda 10 Frente C — itens fundidos (fixos + admin);
    // a Home substitui-os com updateItems() quando os drives
    // do admin chegam (ou somem, após o remover da Frente B).
    private var items: List<DriveRailItem>,
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
    private var nextFocusUpId: Int = View.NO_ID,
    private var nextFocusDownId: Int = View.NO_ID,
    // Build-fix 2.7.16: onClick em ULTIMO (mesmo motivo do RailAdapter).
    private val onClick: (DriveRailItem) -> Unit
) : RecyclerView.Adapter<DriveRailAdapter.VH>() {

    // Ronda 18 Frente C (F2) — ver RailAdapter.updateFocusIds: o
    // DiffUtil já não re-liga os itens que não mudaram, por isso os
    // ids de foco D-pad re-aplicam-se aos holders já ligados.
    private var attachedRecyclerView: RecyclerView? = null

    override fun onAttachedToRecyclerView(recyclerView: RecyclerView) {
        attachedRecyclerView = recyclerView
    }

    override fun onDetachedFromRecyclerView(recyclerView: RecyclerView) {
        if (attachedRecyclerView === recyclerView) attachedRecyclerView = null
    }

    /**
     * Ronda 17 Frente B — guarda os ids de foco D-pad; o onBind
     * aplica-os aos holders (ver RailAdapter.updateFocusIds).
     */
    fun updateFocusIds(upId: Int) {
        if (upId == nextFocusUpId) return
        nextFocusUpId = upId
        val rv = attachedRecyclerView ?: return
        for (i in 0 until rv.childCount) {
            val child = rv.getChildAt(i)
            if (upId != View.NO_ID) child.nextFocusUpId = upId
        }
    }

    /** Atualiza as capas do admin e redesenha os cards. */
    fun setFeaturedCovers(covers: Map<String, String>): Boolean {
        // Ronda 17 Frente B — sem mudanças, nem redesenha (o
        // fetchAdminDrives corre em cada onResume — gatilho E).
        if (covers == featuredCovers) return false
        val old = featuredCovers
        featuredCovers = covers
        // Ronda 18 Frente C (F2) — só os tiles cuja capa mudou são
        // re-ligados (a capa só afecta os fixos, por "/N:/"); os do
        // admin usam a coverUrl do registo, nunca este mapa.
        var changed = false
        items.forEachIndexed { index, item ->
            if (item is DriveRailItem.Fixed) {
                val key = "/${item.drive.index}:/"
                if (old[key] != covers[key]) {
                    notifyItemChanged(index)
                    changed = true
                }
            }
        }
        return changed
    }

    /** v2.1.44 — leitura p/ o hero ambiente da Home TV (o item na
     *  posição focada alimenta o topo). Porte da Meggy 2.7.58. */
    fun itemAt(position: Int): DriveRailItem? = items.getOrNull(position)

    /** Ronda 10 Frente C — substitui os itens do rail (fixos +
     *  admin) e redesenha. */
    fun updateItems(newItems: List<DriveRailItem>): Boolean {
        // Ronda 17 Frente B — sem mudanças, nem redesenha (ver acima).
        if (newItems == items) return false
        val oldItems = items
        items = newItems
        // Ronda 18 Frente C (F2) — DiffUtil em vez de
        // notifyDataSetChanged() total (ver RailAdapter.updateItems).
        // Identidade: índice do drive (fixos) / driveId (admin).
        DiffUtil.calculateDiff(object : DiffUtil.Callback() {
            override fun getOldListSize(): Int = oldItems.size
            override fun getNewListSize(): Int = newItems.size
            override fun areItemsTheSame(oldPos: Int, newPos: Int): Boolean {
                val old = oldItems[oldPos]
                val new = newItems[newPos]
                return when {
                    old is DriveRailItem.Fixed && new is DriveRailItem.Fixed ->
                        old.drive.index == new.drive.index
                    old is DriveRailItem.Admin && new is DriveRailItem.Admin ->
                        old.drive.driveId == new.drive.driveId
                    else -> false
                }
            }
            override fun areContentsTheSame(oldPos: Int, newPos: Int): Boolean =
                oldItems[oldPos] == newItems[newPos]
        }).dispatchUpdatesTo(this)
        return true
    }

    inner class VH(val binding: ItemDriveCardBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos != RecyclerView.NO_POSITION) onClick(items[pos])
            }
            // v2.1.41 — tile de drive grande na TV (conceito):
            // anel branco 4dp + escala 1.05 (padrão R27).
            if (TvUtils.isTv(binding.root.context)) {
                FocusAnimator.attachCard(
                    binding.driveCardRoot, true,
                    scaleTv = FocusAnimator.SCALE_TV_DENSE,
                    ringColorRes = R.color.tile_focus_ring_white,
                    ringWidthDp = 4f
                )
            } else {
                FocusAnimator.attachCard(binding.driveCardRoot, TvUtils.isTv(binding.root.context))
            }
            TapFeedback.attachPress(binding.driveCardRoot, TvUtils.isTv(binding.root.context))
            // Ronda 7 Frente B — auto-ajuste TV (TvAutoFit): o tile
            // deriva do viewport medido. v2.1.41 — a base passa de
            // 150x210 para 230x300 (cartões grandes do conceito; a
            // proporção retrato mantém-se). No celular nada muda.
            if (TvUtils.isTv(binding.root.context)) {
                val fit = TvAutoFit.forContext(binding.root.context)
                val driveLp = binding.driveCardRoot.layoutParams as ViewGroup.MarginLayoutParams
                driveLp.width = fit.layoutPx(230f)
                driveLp.height = fit.layoutPx(300f)
                driveLp.marginEnd = fit.gapHalfPx(230f)
                binding.driveCardRoot.layoutParams = driveLp
                binding.driveName.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(16f))
                binding.driveMeta.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(12f))
                binding.driveFavStar.layoutParams = binding.driveFavStar.layoutParams.apply {
                    width = fit.layoutPx(32f)
                    height = fit.layoutPx(32f)
                }
                binding.driveFavStar.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(16f))
                binding.driveIcon.layoutParams = binding.driveIcon.layoutParams.apply {
                    width = fit.layoutPx(64f)
                    height = fit.layoutPx(64f)
                }
                binding.driveIcon.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(32f))
            }
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
        // Ronda 17 Frente B — os ids de foco D-pad re-aplicam-se a
        // cada bind (o updateFocusIds da Home só os guarda).
        if (nextFocusUpId != View.NO_ID) holder.itemView.nextFocusUpId = nextFocusUpId
        if (nextFocusDownId != View.NO_ID) holder.itemView.nextFocusDownId = nextFocusDownId
        // Ronda 10 Frente C — o tile fixo e o tile do admin
        // partilham o layout, mas a capa e o favorito diferem
        // (ver bindFixed / bindAdmin).
        when (val item = items[position]) {
            is DriveRailItem.Fixed -> bindFixed(holder, item.drive)
            is DriveRailItem.Admin -> bindAdmin(holder, item.drive)
        }
        val anim = AnimationUtils.loadAnimation(holder.itemView.context, R.anim.tile_appear)
        anim.startOffset = (position % 12) * 40L
        holder.binding.root.startAnimation(anim)
    }

    /**
     * Ronda 10 Frente C — tile de drive FIXO: corpo original do
     * onBind, movido para aqui sem mudanças (a hierarquia da
     * capa continua (1) featured → (3) biblioteca estrita →
     * (4) gerada).
     */
    private fun bindFixed(holder: VH, drive: DriveItem) {
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
    }

    /**
     * Ronda 10 Frente C — tile de drive do ADMIN.
     * Hierarquia da capa: (1) coverUrl do admin; sem ela, (3) imagem
     * da biblioteca por nome do drive; sem match, o gradiente rosa
     * genérico (o admin não tem índice de drive — coverResForDrive
     * não se aplica; o gradiente é o fallback que o adapter já usa
     * como erro do Coil). A estrela de favorito EXISTE aqui: o drive
     * do admin agora tem caminho ("by-id:<id>"), guardado como
     * favorito e reaberto por ID.
     */
    private fun bindAdmin(holder: VH, adminDrive: AdminDrive) {
        with(holder.binding) {
            driveIcon.text = "\uD83D\uDCC1"
            driveIcon.visibility = View.GONE
            driveName.setWordEllipsized(adminDrive.name)
            driveMeta.setWordEllipsized(
                holder.itemView.context.getString(R.string.admin_drive_tile_tag))

            val adminCover = adminDrive.coverUrl?.takeIf { it.isNotBlank() }
            val libraryUrl = CoverLibrary.resolveStrict(
                holder.itemView.context, adminDrive.name)
            val showLibraryOrGenerated: () -> Unit = {
                if (!libraryUrl.isNullOrBlank()) {
                    driveCover.visibility = View.VISIBLE
                    driveCover.load(libraryUrl) {
                        error(R.drawable.card_gradient_pink)
                        listener(onError = { _, _ ->
                            driveCover.setImageResource(R.drawable.card_gradient_pink)
                        })
                    }
                } else {
                    driveCover.visibility = View.VISIBLE
                    driveCover.setImageResource(R.drawable.card_gradient_pink)
                }
            }
            when {
                adminCover != null -> {
                    driveCover.visibility = View.VISIBLE
                    driveCover.load(adminCover) {
                        error(R.drawable.card_gradient_pink)
                        listener(onError = { _, _ -> showLibraryOrGenerated() })
                    }
                }
                libraryUrl != null -> showLibraryOrGenerated()
                else -> {
                    driveCover.visibility = View.VISIBLE
                    driveCover.setImageResource(R.drawable.card_gradient_pink)
                }
            }

            // Ronda 13 Frente C — o drive do admin agora TEM caminho
            // ("by-id:<id>"): a estrela favorita como nos fixos; o
            // favorito guarda o path por ID e a Minha Lista reabre-o
            // pelo DetailActivity (o listFolder despacha p/ by-id).
            // (Tambem corrige um vazamento da Ronda 10: o GONE aqui
            // ficava no view-holder reciclado e escondia a estrela
            // dos fixos a seguir.)
            val adminCoursePath = ApiService.byIdPath(adminDrive.driveId)
            driveFavStar.visibility = View.VISIBLE
            val sm = SessionManager.get(holder.itemView.context)
            driveFavStar.text = if (sm.isFavoriteCourse(adminCoursePath)) "⭐" else "☆"
            driveFavStar.setOnClickListener {
                val nowFav = sm.toggleFavoriteCourse(adminCoursePath, adminDrive.name)
                driveFavStar.text = if (nowFav) "⭐" else "☆"
                Toast.makeText(holder.itemView.context,
                    if (nowFav) "⭐ Curso adicionado à Minha lista"
                    else "Curso removido da Minha lista",
                    Toast.LENGTH_SHORT).show()
            }
        }
    }

    override fun getItemCount(): Int = items.size
}
