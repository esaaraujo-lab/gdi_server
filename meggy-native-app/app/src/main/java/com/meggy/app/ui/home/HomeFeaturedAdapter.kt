package com.meggy.app.ui.home

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.meggy.app.data.colorFromString
import com.meggy.app.data.monogramFor
import com.meggy.app.databinding.ItemHomeFeaturedBinding
import com.meggy.app.util.CardGradient
import com.meggy.app.util.FocusAnimator
import com.meggy.app.util.LibraryCovers
import com.meggy.app.util.ThumbArt
import com.meggy.app.util.TvUtils

/**
 * R22 UI (conceito "início celular") — item da seção "Destaques" da
 * home. Junta as duas fontes REAIS da plataforma num só cartão:
 * cursos em destaque da API (abrem o curso) e, sem resposta da API,
 * os itens curados do hero (abrem o drive, como o hero sempre fez).
 * O selo só aparece quando a fonte o traz (itens curados).
 */
data class HomeFeaturedItem(
    val title: String,
    val subtitle: String,
    val badge: String?,
    val coverUrl: String?,
    val path: String,
    val folderName: String,
    val openAsCourse: Boolean
)

class HomeFeaturedAdapter(
    /** 2.7.56 — LEFT p/ a linha seleccionada do menu lateral da TV
     *  (NO_ID = roteamento padrão; no celular fica NO_ID). */
    private var nextFocusLeftId: Int = View.NO_ID,
    /** 2.7.56 — UP/DOWN entre fileiras da home TV (ver HomeActivity). */
    private var nextFocusUpId: Int = View.NO_ID,
    private var nextFocusDownId: Int = View.NO_ID,
    private val onItem: (HomeFeaturedItem) -> Unit
) : ListAdapter<HomeFeaturedItem, HomeFeaturedAdapter.VH>(DIFF) {

    /** 2.7.56 — o DOWN depende da visibilidade das fileiras de
     *  baixo, que só se conhece depois de todas montadas (a Home
     *  corrige-o nas cadeias de foco). */
    fun updateFocusDownId(downId: Int) {
        nextFocusDownId = downId
    }

    inner class VH(val binding: ItemHomeFeaturedBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos == RecyclerView.NO_POSITION) return@setOnClickListener
                onItem(getItem(pos))
            }
            if (nextFocusLeftId != View.NO_ID) itemView.nextFocusLeftId = nextFocusLeftId
            if (nextFocusUpId != View.NO_ID) itemView.nextFocusUpId = nextFocusUpId
            if (nextFocusDownId != View.NO_ID) itemView.nextFocusDownId = nextFocusDownId
            // 2.7.52 — foco na TV (SPEC §5: anel + escala): a escala
            // 1,05 + elevação vêm do FocusAnimator.attach; o anel
            // branco 4dp vem do fundo com estado da variante TV do
            // layout (featured_card_bg_tv — o cartão é um
            // LinearLayout, não um MaterialCardView, por isso o
            // attachCard não se aplica). No celular nada muda.
            if (TvUtils.isTv(binding.root.context)) {
                FocusAnimator.attach(binding.root, true, scaleTv = FocusAnimator.SCALE_TV_DENSE)
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val binding = ItemHomeFeaturedBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return VH(binding)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        if (nextFocusLeftId != View.NO_ID) holder.itemView.nextFocusLeftId = nextFocusLeftId
        if (nextFocusUpId != View.NO_ID) holder.itemView.nextFocusUpId = nextFocusUpId
        if (nextFocusDownId != View.NO_ID) holder.itemView.nextFocusDownId = nextFocusDownId
        val item = getItem(position)
        val ctx = holder.itemView.context
        val b = holder.binding
        b.homeFeaturedTitle.text = item.title
        if (item.subtitle.isNotBlank()) {
            b.homeFeaturedSubtitle.visibility = View.VISIBLE
            b.homeFeaturedSubtitle.text = item.subtitle
        } else {
            b.homeFeaturedSubtitle.visibility = View.GONE
        }
        if (!item.badge.isNullOrBlank()) {
            b.homeFeaturedBadge.visibility = View.VISIBLE
            b.homeFeaturedBadge.text = item.badge
        } else {
            b.homeFeaturedBadge.visibility = View.GONE
        }

        val res = ctx.resources
        b.homeFeaturedBg.background = CardGradient.drawable(res, colorFromString(item.title))
        val cover = item.coverUrl ?: LibraryCovers.resolveStrict(item.title, item.path)
        if (cover != null) {
            b.homeFeaturedThumb.visibility = View.VISIBLE
            b.homeFeaturedMonogram.visibility = View.GONE
            b.homeFeaturedThumb.load(cover)
        } else {
            val art = ThumbArt.coverResForPath(item.path)
            if (art != 0) {
                b.homeFeaturedThumb.visibility = View.VISIBLE
                b.homeFeaturedMonogram.visibility = View.GONE
                b.homeFeaturedThumb.setImageResource(art)
            } else {
                b.homeFeaturedThumb.visibility = View.GONE
                b.homeFeaturedMonogram.visibility = View.VISIBLE
                b.homeFeaturedMonogram.text = monogramFor(item.title)
            }
        }
    }

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<HomeFeaturedItem>() {
            override fun areItemsTheSame(
                oldItem: HomeFeaturedItem, newItem: HomeFeaturedItem
            ): Boolean = oldItem.path == newItem.path && oldItem.openAsCourse == newItem.openAsCourse

            override fun areContentsTheSame(
                oldItem: HomeFeaturedItem, newItem: HomeFeaturedItem
            ): Boolean = oldItem == newItem
        }
    }
}
