package com.bibigyn.app.ui.home

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.google.android.material.card.MaterialCardView
import com.bibigyn.app.R
import com.bibigyn.app.data.DriveItem
import com.bibigyn.app.util.CoverLibrary
import com.bibigyn.app.util.FocusAnimator
import com.bibigyn.app.util.SessionManager
import com.bibigyn.app.util.TvUtils

/**
 * v2.1.44 — Tiles da grade de Meus Cursos (porte Meggy 2.7.58,
 * adaptado à cadeia de capas da BiBi): capa no topo (biblioteca por
 * tipo CoverLibrary → capa gerada do drive → monograma), nome,
 * "N aulas · Z%" e barra de progresso (assistidos locais sob o
 * prefixo do curso / total real do servidor).
 */
class MyCoursesAdapter(
    private val onClick: (MyCoursesActivity.CourseEntry) -> Unit
) : RecyclerView.Adapter<MyCoursesAdapter.VH>() {

    private var items: List<MyCoursesActivity.CourseEntry> = emptyList()

    fun submit(list: List<MyCoursesActivity.CourseEntry>) {
        items = list
        notifyDataSetChanged()
    }

    inner class VH(view: MaterialCardView) : RecyclerView.ViewHolder(view) {
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
            // attachCard exige MaterialCardView (a raiz de
            // item_my_course É MaterialCardView — o cast alinha os
            // dois lados; foi um dos erros da CI da Meggy 2.7.58).
            FocusAnimator.attachCard(view, TvUtils.isTv(view.context))
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_my_course, parent, false) as MaterialCardView
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

        val cover = CoverLibrary.resolveStrict(ctx, item.name, item.path)
        val art = DriveItem.coverResForPath(item.path)
        if (!cover.isNullOrBlank()) {
            holder.thumb.visibility = View.VISIBLE
            holder.monogram.visibility = View.GONE
            holder.thumb.load(cover) {
                if (art != null) error(art)
                listener(onError = { _, _ ->
                    if (art != null) holder.thumb.setImageResource(art)
                    else {
                        holder.thumb.visibility = View.GONE
                        holder.monogram.visibility = View.VISIBLE
                        holder.monogram.text = item.name.trim().take(1).uppercase()
                    }
                })
            }
        } else if (art != null) {
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
