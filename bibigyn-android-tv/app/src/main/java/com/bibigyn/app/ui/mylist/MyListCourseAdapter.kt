package com.bibigyn.app.ui.mylist

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.animation.AnimationUtils
import android.widget.Toast
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.bibigyn.app.data.colorFromString
import com.bibigyn.app.data.monogramFor
import com.bibigyn.app.databinding.ItemMylistCardBinding
import com.bibigyn.app.util.CardGradient
import com.bibigyn.app.util.FocusAnimator
import com.bibigyn.app.util.SessionManager
import com.bibigyn.app.util.TvUtils

/**
 * v2.1.5 — Minha lista — aba Cursos (e Concursos).
 *
 * Card com chip "CURSO", monograma, nome, botão rosa "Continuar"
 * (abre o DetailActivity do curso) e ⭐ para remover. Sem contagem
 * "X de Y aulas": o total de aulas exige listar a pasta (chamada de
 * rede por curso) — dado não disponível sem custo; documentado nas
 * REDESIGN_NOTES. Foco via FocusAnimator.attachCard.
 */
class MyListCourseAdapter(
    private val onCourse: (SessionManager.FavCourse) -> Unit,
    private val onRemove: (SessionManager.FavCourse) -> Unit = {}
) : ListAdapter<SessionManager.FavCourse, MyListCourseAdapter.VH>(DIFF) {

    inner class VH(val binding: ItemMylistCardBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos == RecyclerView.NO_POSITION) return@setOnClickListener
                onCourse(getItem(pos))
            }
            FocusAnimator.attach(binding.root, TvUtils.isTv(binding.root.context))
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val inflater = LayoutInflater.from(parent.context)
        return VH(ItemMylistCardBinding.inflate(inflater, parent, false))
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val course = getItem(position)
        val res = holder.itemView.resources
        val ctx = holder.itemView.context

        with(holder.binding) {
            mylistTypeChip.text = "CURSO"
            mylistMeta.text = "Curso salvo"
            mylistTitle.text = course.name
            mylistBg.background = CardGradient.drawable(res, colorFromString(course.name))
            mylistThumb.visibility = View.GONE
            mylistMonogram.visibility = View.VISIBLE
            mylistMonogram.text = monogramFor(course.name)
            // Sem progresso por curso (não há agregado local); o
            // progresso vive por aula dentro do detalhe.
            mylistProgressRow.visibility = View.GONE
            mylistContinue.visibility = View.VISIBLE
            mylistContinue.setOnClickListener { onCourse(course) }

            mylistFav.setOnClickListener {
                SessionManager.get(ctx).toggleFavoriteCourse(course.drivePath, course.name)
                onRemove(course)
                Toast.makeText(ctx, "Curso removido da Minha lista", Toast.LENGTH_SHORT).show()
            }
        }

        val anim = AnimationUtils.loadAnimation(ctx, android.R.anim.fade_in)
        anim.startOffset = (position % 12) * 40L
        holder.binding.root.startAnimation(anim)
    }

    companion object {
        val DIFF = object : DiffUtil.ItemCallback<SessionManager.FavCourse>() {
            override fun areItemsTheSame(oldItem: SessionManager.FavCourse, newItem: SessionManager.FavCourse): Boolean =
                oldItem.drivePath == newItem.drivePath
            override fun areContentsTheSame(oldItem: SessionManager.FavCourse, newItem: SessionManager.FavCourse): Boolean =
                oldItem == newItem
        }
    }
}
