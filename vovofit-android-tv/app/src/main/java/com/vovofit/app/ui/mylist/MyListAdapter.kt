package com.vovofit.app.ui.mylist

import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.animation.AnimationUtils
import androidx.recyclerview.widget.RecyclerView
import com.vovofit.app.R
import com.vovofit.app.data.FileItem
import com.vovofit.app.util.SessionManager
import com.vovofit.app.data.colorFromString
import com.vovofit.app.databinding.ItemRailCardBinding

/**
 * v2.0.0 — Adapter for the "Minha lista" grid.
 * Mirrors FileAdapter's tile styling (gradient + scrim + overlays)
 * without the watched/resume badge logic (favorites have no playback
 * state on this screen).
 */
/**
 * v1.0.2 — a ⭐ no card REMOVE o item da lista (toggle + reload na Activity).
 */
class MyListAdapter(
    private val onClick: (FileItem) -> Unit,
    private val onFavoriteToggle: (FileItem) -> Unit = {}
) : RecyclerView.Adapter<MyListAdapter.VH>() {

    private val items = mutableListOf<FileItem>()

    fun submit(newItems: List<FileItem>) {
        items.clear(); items.addAll(newItems); notifyDataSetChanged()
    }

    inner class VH(val binding: ItemRailCardBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.isFocusable = true
            binding.root.isFocusableInTouchMode = true
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos == RecyclerView.NO_POSITION) return@setOnClickListener
                onClick(items[pos])
            }
            binding.root.setOnFocusChangeListener { _, hasFocus -> animateFocus(hasFocus) }
        }
        fun animateFocus(hasFocus: Boolean) {
            val scale = if (hasFocus) 1.06f else 1f
            binding.cardRoot.animate().scaleX(scale).scaleY(scale).setDuration(180).start()
            binding.cardRoot.cardElevation = if (hasFocus) 16f else 0f
            binding.focusRing.visibility = if (hasFocus) View.VISIBLE else View.INVISIBLE
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

    override fun onBindViewHolder(holder: VH, position: Int) {
        val f = items[position]
        val res = holder.itemView.resources
        with(holder.binding) {
            cardTitle.text = f.name
            cardSubtitle.text = when {
                f.isVideo -> "vídeo"
                f.isAudio -> "áudio"
                f.isPdf -> "PDF"
                else -> f.humanSize
            }
            cardIcon.text = when {
                f.isVideo -> "\uD83C\uDFA5"
                f.isAudio -> "\uD83C\uDFB5"
                f.isPdf -> "\uD83D\uDCC4"
                else -> "\uD83D\uDCC4"
            }
            val base = colorFromString(f.name)
            cardBg.background = gradient(res, base)
            progressBar.visibility = View.GONE
            watchedBadge.visibility = View.GONE
            continueBadge.visibility = View.GONE

            // ★ v1.0.2: ⭐ aqui REMOVE da lista (o item já está favoritado).
            favStar.visibility = View.VISIBLE
            favStar.text = "⭐"
            favStar.setOnClickListener { onFavoriteToggle(f) }
        }
        val anim = AnimationUtils.loadAnimation(holder.itemView.context, R.anim.tile_appear)
        anim.startOffset = (position % 12) * 40L
        holder.binding.root.startAnimation(anim)
    }

    override fun getItemCount(): Int = items.size

    private fun gradient(res: android.content.res.Resources, baseColor: Int): GradientDrawable {
        val r = Color.red(baseColor); val g = Color.green(baseColor); val b = Color.blue(baseColor)
        val start = Color.argb(0x59, r, g, b)
        val end = Color.parseColor("#FF0F1218")
        return GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(start, end)).apply {
            cornerRadius = 16 * res.displayMetrics.density
        }
    }
}

/**
 * v1.0.2 — Adapter da seção "📚 Cursos" da Minha lista.
 * Um curso favorito é uma pasta do Drive (drive raiz ou subpasta).
 * Clique abre o curso; a ⭐ remove da lista.
 */
class MyListCourseAdapter(
    private val onClick: (SessionManager.FavCourse) -> Unit,
    private val onFavoriteToggle: (SessionManager.FavCourse) -> Unit = {}
) : RecyclerView.Adapter<MyListCourseAdapter.VH>() {

    private val items = mutableListOf<SessionManager.FavCourse>()

    fun submit(newItems: List<SessionManager.FavCourse>) {
        items.clear(); items.addAll(newItems); notifyDataSetChanged()
    }

    inner class VH(val binding: ItemRailCardBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.isFocusable = true
            binding.root.isFocusableInTouchMode = true
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos == RecyclerView.NO_POSITION) return@setOnClickListener
                onClick(items[pos])
            }
            binding.root.setOnFocusChangeListener { _, hasFocus -> animateFocus(hasFocus) }
        }
        fun animateFocus(hasFocus: Boolean) {
            val scale = if (hasFocus) 1.06f else 1f
            binding.cardRoot.animate().scaleX(scale).scaleY(scale).setDuration(180).start()
            binding.cardRoot.cardElevation = if (hasFocus) 16f else 0f
            binding.focusRing.visibility = if (hasFocus) View.VISIBLE else View.INVISIBLE
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

    override fun onBindViewHolder(holder: VH, position: Int) {
        val c = items[position]
        val res = holder.itemView.resources
        with(holder.binding) {
            cardTitle.text = c.name
            cardSubtitle.text = "curso"
            cardIcon.text = "\uD83D\uDCC1"
            val base = colorFromString(c.name)
            cardBg.background = gradient(res, base)
            progressBar.visibility = View.GONE
            watchedBadge.visibility = View.GONE
            continueBadge.visibility = View.GONE

            // ★ v1.0.2: ⭐ aqui REMOVE o curso da lista.
            favStar.visibility = View.VISIBLE
            favStar.text = "⭐"
            favStar.setOnClickListener { onFavoriteToggle(c) }
        }
        val anim = AnimationUtils.loadAnimation(holder.itemView.context, R.anim.tile_appear)
        anim.startOffset = (position % 12) * 40L
        holder.binding.root.startAnimation(anim)
    }

    override fun getItemCount(): Int = items.size

    private fun gradient(res: android.content.res.Resources, baseColor: Int): GradientDrawable {
        val r = Color.red(baseColor); val g = Color.green(baseColor); val b = Color.blue(baseColor)
        val start = Color.argb(0x59, r, g, b)
        val end = Color.parseColor("#FF0F1218")
        return GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(start, end)).apply {
            cornerRadius = 16 * res.displayMetrics.density
        }
    }
}
