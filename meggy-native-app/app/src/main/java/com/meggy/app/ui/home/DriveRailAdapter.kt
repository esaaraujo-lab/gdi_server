package com.meggy.app.ui.home

import android.util.TypedValue
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.animation.AnimationUtils
import android.widget.Toast
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.meggy.app.R
import com.meggy.app.data.DriveItem
import com.meggy.app.util.setWordEllipsized
import com.meggy.app.databinding.ItemDriveCardBinding
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
    private val drives: List<DriveItem>,
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
    private val nextFocusUpId: Int = View.NO_ID,
    private val nextFocusDownId: Int = View.NO_ID,
    // Build-fix 2.7.16: onClick em ULTIMO (mesmo motivo do RailAdapter).
    private val onClick: (DriveItem) -> Unit
) : RecyclerView.Adapter<DriveRailAdapter.VH>() {

    /** Atualiza as capas do admin e redesenha os cards. */
    fun setFeaturedCovers(covers: Map<String, String>) {
        featuredCovers = covers
        notifyDataSetChanged()
    }

    inner class VH(val binding: ItemDriveCardBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos != RecyclerView.NO_POSITION) onClick(drives[pos])
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
                binding.driveName.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(13f))
                binding.driveMeta.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(10.5f))
                binding.driveFavStar.layoutParams = binding.driveFavStar.layoutParams.apply {
                    width = fit.layoutPx(32f)
                    height = fit.layoutPx(32f)
                }
                binding.driveFavStar.setTextSize(TypedValue.COMPLEX_UNIT_SP, fit.textSp(16f))
                val iconBox = binding.driveIcon.parent as View
                iconBox.layoutParams = iconBox.layoutParams.apply {
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
        val drive = drives[position]
        with(holder.binding) {
            driveIcon.text = drive.icon  // patch: emoji do drive de volta (2.7.5)
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
        val anim = AnimationUtils.loadAnimation(holder.itemView.context, R.anim.tile_appear)
        anim.startOffset = (position % 12) * 40L
        holder.binding.root.startAnimation(anim)
    }

    override fun getItemCount(): Int = drives.size
}
