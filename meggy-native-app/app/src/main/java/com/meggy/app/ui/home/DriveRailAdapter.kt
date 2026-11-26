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
import com.meggy.app.data.AdminDrive
import com.meggy.app.data.ApiService
import com.meggy.app.data.DriveItem
import com.meggy.app.util.setWordEllipsized
import com.meggy.app.databinding.ItemDriveCardBinding
import com.meggy.app.util.DriveRailItem
import com.meggy.app.util.FocusAnimator
import com.meggy.app.util.TapFeedback
import com.meggy.app.util.SessionManager
import com.meggy.app.util.TvUtils
import com.meggy.app.util.TvAutoFit
import com.meggy.app.util.LibraryCovers
import com.meggy.app.util.ThumbArt

/**
 * v2.7.6 — Rail "Explorar drives" (conceito home).
 *
 * v2.7.11 — card ESCURO com quadrado rosa de ícone + nome +
 * linha de metadados (DriveItem.tagline, texto curado; sem subtítulo
 * quando não houver — nunca contagens inventadas). Antes (2.7.6) o
 * tile inteiro era ROSA. Foco via FocusAnimator.attachCard (anel 3dp
 * da marca + escala + elevação).
 */
class DriveRailAdapter(
    // Ronda 10 Frente C — itens fundidos (fixos + admin);
    // a Home substitui-os com updateItems() quando os drives
    // do admin chegam (ou somem, após o remover da Frente B).
    private var items: List<DriveRailItem>,
    /**
     * Onda 2 (a) — capa do admin por drivePath ("/0:/" → URL).
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
    /** 2.7.56 — LEFT p/ a linha seleccionada do menu lateral (ver RailAdapter). */
    private var nextFocusLeftId: Int = View.NO_ID,
    // Build-fix 2.7.16: onClick em ULTIMO (mesmo motivo do RailAdapter).
    private val onClick: (DriveRailItem) -> Unit
) : RecyclerView.Adapter<DriveRailAdapter.VH>() {

    // R21 — maior posição já animada neste adapter (ver onBindViewHolder).
    private var lastAnimatedPosition = -1


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
     * Ronda 17 Frente B — salva os ids de foco D-pad; o onBind
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
        // admin usam a coverUrl do registro, nunca este mapa.
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

    /** 2.7.58 — leitura p/ o hero ambiente da Home TV. */
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
            FocusAnimator.attachCard(binding.driveCardRoot, TvUtils.isTv(binding.root.context))
            TapFeedback.attachPress(binding.driveCardRoot, TvUtils.isTv(binding.root.context))
            // Ronda 7 Frente B — auto-ajuste TV (TvAutoFit): o tile passa a
            // derivar do viewport medido; a proporcao 150:210 mantem-se.
            // No celular e na 32" de referencia (escala 1.0) nada muda.
            if (TvUtils.isTv(binding.root.context)) {
                val fit = TvAutoFit.forContext(binding.root.context)
                val driveLp = binding.driveCardRoot.layoutParams as ViewGroup.MarginLayoutParams
                driveLp.width = fit.layoutPx(150f)
                driveLp.height = fit.layoutPx(210f)
                driveLp.marginEnd = fit.gapHalfPx(150f)
                binding.driveCardRoot.layoutParams = driveLp
                binding.driveName.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(15f))
                binding.driveMeta.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(13f))
                binding.driveFavStar.layoutParams = binding.driveFavStar.layoutParams.apply {
                    width = fit.layoutPx(32f)
                    height = fit.layoutPx(32f)
                }
                binding.driveFavStar.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(16f))
                // Ronda 16 Frente C — bloco do quadrado do icone removido:
                // o FrameLayout pai do driveIcon vai a GONE em todos os
                // binds (ver bindFixed/bindAdmin); redimensiona-lo aqui
                // era codigo morto.
            }
            // Frente A (TV): nextFocus explícito (ver params).
            if (nextFocusUpId != View.NO_ID) itemView.nextFocusUpId = nextFocusUpId
            if (nextFocusDownId != View.NO_ID) itemView.nextFocusDownId = nextFocusDownId
            if (nextFocusLeftId != View.NO_ID) itemView.nextFocusLeftId = nextFocusLeftId
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val inflater = LayoutInflater.from(parent.context)
        return VH(ItemDriveCardBinding.inflate(inflater, parent, false))
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        // Ronda 17 Frente B — os ids de foco D-pad re-aplicam-se a
        // cada bind (o updateFocusIds da Home só os salva).
        if (nextFocusUpId != View.NO_ID) holder.itemView.nextFocusUpId = nextFocusUpId
        if (nextFocusDownId != View.NO_ID) holder.itemView.nextFocusDownId = nextFocusDownId
        if (nextFocusLeftId != View.NO_ID) holder.itemView.nextFocusLeftId = nextFocusLeftId
        // Ronda 10 Frente C — o tile fixo e o tile do admin
        // partilham o layout, mas a capa e o favorito diferem
        // (ver bindFixed / bindAdmin).
        when (val item = items[position]) {
            is DriveRailItem.Fixed -> bindFixed(holder, item.drive)
            is DriveRailItem.Admin -> bindAdmin(holder, item.drive)
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

    /**
     * Ronda 10 Frente C — tile de drive FIXO: corpo original do
     * onBind, movido para aqui sem mudanças (a hierarquia da
     * capa continua (1) featured → (3) biblioteca estrita →
     * (4) gerada).
     */
    private fun bindFixed(holder: VH, drive: DriveItem) {
        with(holder.binding) {
            // Ronda 16 Frente C — sem quadrado rosa nem emoji (Elton
            // 2026-11-16 20:56): imagem + nome bastam, como na BiBi
            // 2.1.11 / Vovo 1.0.11. O rosa esta no FrameLayout PAI do
            // driveIcon (item_drive_card.xml:61-74) — e o PAI que vai
            // a GONE, nunca so o TextView (deixava o quadrado vazio).
            (driveIcon.parent as View).visibility = View.GONE
            driveName.setWordEllipsized(drive.name)
            driveMeta.setWordEllipsized(drive.tagline)
            driveMeta.visibility = if (drive.tagline.isBlank()) View.GONE else View.VISIBLE

            val coursePath = "/${drive.index}:/"
            // Onda 2 (a) — capa do admin por trás do conteúdo do
            // card (só quando o admin definiu cover_url). Sem capa,
            // o card segue exatamente como antes (gone = sem mudança
            // visual); o else é obrigatório (view reciclada).
            val adminCover = featuredCovers[coursePath]?.takeIf { it.isNotBlank() }
            // v2.7.11 camada (3) ESTRITA (2.7.13, sem 'geral'): sem
            // capa do admin, a imagem da biblioteca pelo nome do
            // drive/curso; sem match, a capa gerada do drive (4) —
            // foto real do curso, nunca o livro 'geral'.
            val driveCoverUrl = adminCover
                ?: LibraryCovers.resolveStrict(drive.name, drive.tagline)
            if (driveCoverUrl != null) {
                driveCover.visibility = View.VISIBLE
                driveScrim.visibility = View.VISIBLE
                driveCover.load(driveCoverUrl) {
                    listener(onError = { _, _ ->
                        driveCover.visibility = View.VISIBLE
                        driveScrim.visibility = View.VISIBLE
                        driveCover.setImageResource(ThumbArt.coverResForDrive(drive))
                    })
                }
            } else {
                driveCover.visibility = View.VISIBLE
                driveScrim.visibility = View.VISIBLE
                driveCover.setImageResource(ThumbArt.coverResForDrive(drive))
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
     * da biblioteca por nome do drive; sem match, (4) capa gerada
     * genérica (o admin não tem índice de drive — coverResForDrive
     * não se aplica; -1 cai na genérica de estudo). A estrela de
     * favorito EXISTE aqui: o drive do admin agora tem caminho
     * ("by-id:<id>"), salvo como favorito e reaberto por ID.
     */
    private fun bindAdmin(holder: VH, adminDrive: AdminDrive) {
        with(holder.binding) {
            // Ronda 16 Frente C — idem bindFixed: sem quadrado rosa
            // nem pasta 📁 no drive do admin; o PAI vai a GONE.
            (driveIcon.parent as View).visibility = View.GONE
            driveName.setWordEllipsized(adminDrive.name)
            driveMeta.setWordEllipsized(
                holder.itemView.context.getString(R.string.admin_drive_tile_tag))
            driveMeta.visibility = View.VISIBLE

            val coverRes = ThumbArt.coverResForDriveIndex(-1)
            val coverUrl = adminDrive.coverUrl?.takeIf { it.isNotBlank() }
                ?: LibraryCovers.resolveStrict(adminDrive.name)
            if (coverUrl != null) {
                driveCover.visibility = View.VISIBLE
                driveScrim.visibility = View.VISIBLE
                driveCover.load(coverUrl) {
                    listener(onError = { _, _ ->
                        driveCover.visibility = View.VISIBLE
                        driveScrim.visibility = View.VISIBLE
                        driveCover.setImageResource(coverRes)
                    })
                }
            } else {
                driveCover.visibility = View.VISIBLE
                driveScrim.visibility = View.VISIBLE
                driveCover.setImageResource(coverRes)
            }

            // Ronda 13 Frente C — o drive do admin agora TEM caminho
            // ("by-id:<id>"): a estrela favorita como nos fixos; o
            // favorito salva o path por ID e a Minha Lista reabre-o
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
