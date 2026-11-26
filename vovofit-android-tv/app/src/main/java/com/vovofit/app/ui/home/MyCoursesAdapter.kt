package com.vovofit.app.ui.home

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.vovofit.app.R
import com.vovofit.app.data.coverResForPath
import com.vovofit.app.util.FocusAnimator
import com.vovofit.app.util.SessionManager
import com.vovofit.app.util.TvUtils
import com.vovofit.app.util.loadCoverChain

/**
 * 1.0.40 — Tiles da grade de Meus Cursos (porte do MyCoursesAdapter
 * da Meggy 2.7.58, adaptado à cadeia de capas da Vovó): capa 16:9 no
 * topo (loadCoverChain: capa da biblioteca por nome/caminho → capa
 * local do drive), nome, meta "N aulas" e — só quando há uma aula
 * em curso nesse curso — "Em curso · Z%" + barra com o progresso
 * DESSA aula (dos recents/resume locais). Sem % de conclusão do
 * curso: a Vovó não tem contagem de assistidos por curso e um número
 * inventado seria pior que a sua ausência.
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
        val title: TextView = view.findViewById(R.id.myCourseTitle)
        val meta: TextView = view.findViewById(R.id.myCourseMeta)
        val progress: ProgressBar = view.findViewById(R.id.myCourseProgress)

        init {
            view.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos != RecyclerView.NO_POSITION) onClick(items[pos])
            }
            // attachCard exige MaterialCardView (assinatura real da
            // Vovó): a raiz de item_my_course É MaterialCardView —
            // cast seguro com fallback p/ attach(View).
            (view as? com.google.android.material.card.MaterialCardView)
                ?.let { FocusAnimator.attachCard(it, TvUtils.isTv(view.context)) }
                ?: FocusAnimator.attach(view, TvUtils.isTv(view.context))
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
        // Aula em curso neste curso (o recent de maior progresso sob
        // o caminho) — o mesmo cálculo do Continuar da Home.
        val best = sm.getRecents()
            .filter { it.folderPath.startsWith(item.path) }
            .filter { sm.hasResume(it.folderPath, it.videoName) }
            .maxByOrNull { sm.getResumeProgress(it.folderPath, it.videoName) }
        val totalText = if (item.total == 1) "1 aula" else "${item.total} aulas"
        if (best != null) {
            val pct = sm.getResumeProgress(best.folderPath, best.videoName)
            holder.meta.text = "$totalText · Em curso $pct%"
            holder.progress.visibility = View.VISIBLE
            holder.progress.progress = pct
        } else {
            holder.meta.text = totalText
            holder.progress.visibility = View.GONE
        }
        holder.thumb.loadCoverChain(
            null,
            coverResForPath(item.path),
            item.name, item.path
        )
    }

    override fun getItemCount(): Int = items.size
}
