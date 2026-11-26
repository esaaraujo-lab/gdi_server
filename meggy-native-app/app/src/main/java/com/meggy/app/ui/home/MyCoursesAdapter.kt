package com.meggy.app.ui.home

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.google.android.material.card.MaterialCardView
import com.meggy.app.R
import com.meggy.app.util.FocusAnimator
import com.meggy.app.util.LibraryCovers
import com.meggy.app.util.SessionManager
import com.meggy.app.util.ThumbArt
import com.meggy.app.util.TvUtils

/**
 * 2.7.58 — Tiles da grade de Meus Cursos: capa no topo (cadeia de
 * capas: foto real da pasta → capa da matéria LibraryCovers → arte
 * do drive), nome, "N aulas · Z%" e barra de progresso (assistidos
 * locais sob o prefixo do curso / total real do servidor).
 */
class MyCoursesAdapter(
    private val onClick: (MyCoursesActivity.CourseEntry) -> Unit
) : RecyclerView.Adapter<MyCoursesAdapter.VH>() {

    private var items: List<MyCoursesActivity.CourseEntry> = emptyList()

    fun submit(list: List<MyCoursesActivity.CourseEntry>) {
        items = list
        notifyDataSetChanged()
    }

    inner class VH(view: View) : RecyclerView.ViewHolder(view) {
        val thumb: ImageView = view.findViewById(R.id.myCourseThumb)
        val monogram: TextView = view.findViewById(R.id.myCourseMonogram)
        val title: TextView = view.findViewById(R.id.myCourseTitle)
        val meta: TextView = view.findViewById(R.id.myCourseMeta)
        val progress: ProgressBar = view.findViewById(R.id.myCourseProgress)

        init {
            view.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos != RecyclerView.NO_POSITION) onClick(items[pos])
            }
            FocusAnimator.attachCard(view as MaterialCardView, TvUtils.isTv(view.context))
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_my_course, parent, false)
        return VH(view)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = items[position]
        val ctx = holder.itemView.context
        holder.title.text = item.name
        val sm = SessionManager.get(ctx)
        val watched = sm.watchedCountUnder(item.path)
        val pct = if (item.total > 0) (watched * 100 / item.total).coerceIn(0, 100) else 0
        holder.meta.text = "${item.total} aulas · $pct%"
        holder.progress.progress = pct

        val cover = LibraryCovers.resolveStrict(item.name, item.path)
        val art = ThumbArt.coverResForPath(item.path)
        if (cover != null) {
            holder.thumb.visibility = View.VISIBLE
            holder.monogram.visibility = View.GONE
            holder.thumb.load(cover) {
                error(art)
                listener(onError = { _, _ ->
                    if (art != 0) holder.thumb.setImageResource(art)
                })
            }
        } else if (art != 0) {
            holder.thumb.visibility = View.VISIBLE
            holder.monogram.visibility = View.GONE
            holder.thumb.setImageResource(art)
        } else {
            holder.thumb.visibility = View.GONE
            holder.monogram.visibility = View.VISIBLE
            holder.monogram.text = item.name.trim().take(1).uppercase()
        }
    }

    override fun getItemCount(): Int = items.size
}
