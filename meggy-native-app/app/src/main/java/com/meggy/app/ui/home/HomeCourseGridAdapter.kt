package com.meggy.app.ui.home

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.meggy.app.data.ApiService
import com.meggy.app.data.colorFromString
import com.meggy.app.data.monogramFor
import com.meggy.app.databinding.ItemHomeCourseBinding
import com.meggy.app.util.CardGradient
import com.meggy.app.util.LibraryCovers
import com.meggy.app.util.SessionManager
import com.meggy.app.util.ThumbArt

/**
 * R22 UI (conceito "início celular") — grelha "Meus cursos" da home:
 * os cursos favoritos do aluno (a mesma fonte da Minha Lista), com
 * capa da biblioteca, total REAL de aulas (GET /api/courses/unified,
 * via [courseTotals]) e progresso das aulas assistidas guardadas
 * localmente. Sem total conhecido, a meta e a barra ficam escondidas
 * — nunca um número inventado. Só é usado no celular.
 */
class HomeCourseGridAdapter(
    private val onCourse: (SessionManager.FavCourse) -> Unit
) : ListAdapter<SessionManager.FavCourse, HomeCourseGridAdapter.VH>(DIFF) {

    /** Totais reais por curso (chave de ApiService.normalizeCourseKey). */
    var courseTotals: Map<String, Int> = emptyMap()

    inner class VH(val binding: ItemHomeCourseBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos == RecyclerView.NO_POSITION) return@setOnClickListener
                onCourse(getItem(pos))
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val binding = ItemHomeCourseBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return VH(binding)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val course = getItem(position)
        val ctx = holder.itemView.context
        val b = holder.binding
        b.homeCourseTitle.text = course.name

        // Capa: biblioteca por nome/caminho; sem capa, monograma sobre
        // o gradiente da cor do nome (mesmo padrão da Minha Lista).
        val res = ctx.resources
        b.homeCourseBg.background = CardGradient.drawable(res, colorFromString(course.name))
        val cover = LibraryCovers.resolveStrict(course.name, course.drivePath)
        if (cover != null) {
            b.homeCourseThumb.visibility = View.VISIBLE
            b.homeCourseMonogram.visibility = View.GONE
            b.homeCourseThumb.load(cover)
        } else {
            val art = ThumbArt.coverResForPath(course.drivePath)
            if (art != 0) {
                b.homeCourseThumb.visibility = View.VISIBLE
                b.homeCourseMonogram.visibility = View.GONE
                b.homeCourseThumb.setImageResource(art)
            } else {
                b.homeCourseThumb.visibility = View.GONE
                b.homeCourseMonogram.visibility = View.VISIBLE
                b.homeCourseMonogram.text = monogramFor(course.name)
            }
        }

        // Total real + progresso local (mesmas fontes da Minha Lista).
        val total = ApiService.unifiedTotalFor(courseTotals, course.drivePath)
        if (total != null && total > 0) {
            val watched = SessionManager.get(ctx).watchedCountUnder(course.drivePath)
            val pct = (watched * 100 / total).coerceIn(0, 100)
            b.homeCourseMeta.visibility = View.VISIBLE
            b.homeCourseMeta.text = "$total aulas"
            b.homeCourseProgressRow.visibility = View.VISIBLE
            b.homeCourseProgress.progress = pct
            b.homeCoursePct.text = "$pct%"
        } else {
            b.homeCourseMeta.visibility = View.GONE
            b.homeCourseProgressRow.visibility = View.GONE
        }
    }

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<SessionManager.FavCourse>() {
            override fun areItemsTheSame(
                oldItem: SessionManager.FavCourse, newItem: SessionManager.FavCourse
            ): Boolean = oldItem.drivePath == newItem.drivePath

            override fun areContentsTheSame(
                oldItem: SessionManager.FavCourse, newItem: SessionManager.FavCourse
            ): Boolean = oldItem == newItem
        }
    }
}
