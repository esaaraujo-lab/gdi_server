package com.meggy.app.ui.mylist

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.animation.AnimationUtils
import android.widget.Toast
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.meggy.app.data.ApiService
import com.meggy.app.data.colorFromString
import com.meggy.app.databinding.ItemMylistCardBinding
import com.meggy.app.util.CardGradient
import com.meggy.app.util.FocusAnimator
import com.meggy.app.util.TapFeedback
import com.meggy.app.util.LibraryCovers
import com.meggy.app.util.ThumbArt
import com.meggy.app.util.SessionManager
import com.meggy.app.util.TvUtils

/**
 * v2.7.6 — Minha lista — aba Cursos (e Concursos).
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

    // R21 — maior posição já animada neste adapter (ver onBindViewHolder).
    private var lastAnimatedPosition = -1

    // R21 — totais reais por curso (GET /api/courses/unified via
    // ApiService; chave normalizada de ApiService.normalizeCourseKey).
    // Vazio = sem dados: a linha de progresso fica escondida, como antes.
    var courseTotals: Map<String, Int> = emptyMap()


    inner class VH(val binding: ItemMylistCardBinding) : RecyclerView.ViewHolder(binding.root) {
        init {
            binding.root.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos == RecyclerView.NO_POSITION) return@setOnClickListener
                onCourse(getItem(pos))
            }
            // R18B (Bug 1 #9): 1.05x na TV (latente — sem ponto
            // de entrada na TV; a thumb sobrevive ao corte).
            FocusAnimator.attach(binding.root, TvUtils.isTv(binding.root.context), scaleTv = FocusAnimator.SCALE_TV_DENSE)
            TapFeedback.attachPress(binding.root, TvUtils.isTv(binding.root.context))
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
            // 2.7.13 camada (3) ESTRITA: imagem da biblioteca pelo
            // nome/caminho do curso; sem match, a capa gerada do
            // drive (ThumbArt) — nunca o livro 'geral' nem monograma.
            val coverRes = ThumbArt.coverResForPath(course.drivePath)
            val libraryUrl = LibraryCovers.resolveStrict(course.name, course.drivePath)
            if (libraryUrl != null) {
                mylistThumb.visibility = View.VISIBLE
                mylistMonogram.visibility = View.GONE
                mylistThumb.load(libraryUrl) {
                    error(coverRes)
                    listener(onError = { _, _ ->
                        mylistThumb.visibility = View.VISIBLE
                        mylistMonogram.visibility = View.GONE
                        mylistThumb.setImageResource(coverRes)
                    })
                }
            } else {
                mylistThumb.visibility = View.VISIBLE
                mylistMonogram.visibility = View.GONE
                mylistThumb.setImageResource(coverRes)
            }
            // R21: progresso do curso quando o total REAL é
            // conhecido (unified): assistidas locais (SessionManager)
            // sobre o total do servidor — alinha com a PROG-1 (a
            // progressão visível nos cartões). Sem total conhecido, a
            // linha fica escondida: nunca um % inventado.
            val courseTotal = ApiService.unifiedTotalFor(courseTotals, course.drivePath)
            if (courseTotal != null && courseTotal > 0) {
                val watched = SessionManager.get(ctx).watchedCountUnder(course.drivePath)
                val pct = (watched * 100 / courseTotal).coerceIn(0, 100)
                mylistProgressRow.visibility = View.VISIBLE
                mylistProgress.progress = pct
                mylistProgressText.text = "$watched/$courseTotal aulas · $pct%"
                mylistMeta.text = "Curso salvo · $pct% concluído"
            } else {
                mylistProgressRow.visibility = View.GONE
            }
            mylistContinue.visibility = View.VISIBLE
            mylistContinue.setOnClickListener { onCourse(course) }

            mylistFav.setOnClickListener {
                SessionManager.get(ctx).toggleFavoriteCourse(course.drivePath, course.name)
                onRemove(course)
                Toast.makeText(ctx, "Curso removido da Minha lista", Toast.LENGTH_SHORT).show()
            }
        }

        // R21: idem — animação só na primeira aparição da posição.
        if (position > lastAnimatedPosition) {
            lastAnimatedPosition = position
            val anim = AnimationUtils.loadAnimation(ctx, android.R.anim.fade_in)
            anim.startOffset = (position % 12) * 40L
            holder.binding.root.startAnimation(anim)
        }
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
