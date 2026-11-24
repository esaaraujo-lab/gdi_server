package com.bibigyn.app.util

import android.animation.ObjectAnimator
import android.view.View
import android.view.animation.DecelerateInterpolator
import androidx.core.content.ContextCompat
import com.google.android.material.card.MaterialCardView
import com.bibigyn.app.R

/**
 * v2.1.5 — Animação de foco (android-tv-design skill).
 *
 * Foco NUNCA é só cor: escala + anel + elevação, 180ms ease-out
 * (DecelerateInterpolator).
 *
 * - TV:     escala 1.10×, elevação 16dp.
 * - Celular: escala 1.06× (foco por teclado/D-pad externo), elevação 8dp.
 *
 * O anel é a cor da marca (`tile_focus_ring`) com 3dp. Em cards
 * (MaterialCardView) o anel é aplicado via stroke no próprio card —
 * o drawable `tile_focus_border` como background ficaria escondido
 * atrás do card. Em linhas (LinearLayout/FrameLayout) o anel vem do
 * background `tile_focus_border` (state_focused).
 *
 * R18B (Bug 1) — escala por tile na TV: `attach`/`attachCard`
 * aceitam `scaleTv` (só o ramo TV; o telemóvel fica a 1.06×).
 * `SCALE_TV_DENSE` (1.05×) para rails/grades densos onde 1.10×
 * sobrepõe o vizinho; `SCALE_TV_NONE` (1.00×) onde qualquer
 * escala é cortada ou sobrepõe (destaque de largura total,
 * abas com gap 0). Anel 3dp + elevação NÃO mudam — onde a escala
 * vai a 1.00× ficam sempre DOIS sinais de foco (§5.1).
 */
object FocusAnimator {
    private const val DURATION_MS = 180L
    private const val SCALE_TV = 1.10f
    private const val SCALE_PHONE = 1.06f
    /** R18B: escala TV para tiles densos (1.05×, anel + elevação mantidos). */
    const val SCALE_TV_DENSE = 1.05f
    /** R18B: sem escala na TV (1.00×; anel 3dp + elevação são os sinais). */
    const val SCALE_TV_NONE = 1.00f
    private const val ELEV_TV_DP = 16f
    private const val ELEV_PHONE_DP = 8f

    /** Liga a animação de foco a uma view genérica (linhas, botões). */
    fun attach(view: View, isTv: Boolean, scaleTv: Float? = null) {
        val scale = if (isTv) (scaleTv ?: SCALE_TV) else SCALE_PHONE
        val elevDp = if (isTv) ELEV_TV_DP else ELEV_PHONE_DP
        val density = view.resources.displayMetrics.density
        view.setOnFocusChangeListener { v, hasFocus ->
            animate(v, hasFocus, scale, elevDp * density)
        }
    }

    /**
     * Liga a animação de foco a um MaterialCardView, incluindo o anel:
     * stroke 3dp na cor da marca + fundo `tile_bg_focused` quando focado.
     *
     * Port R27 da Meggy — `ringColorRes`/`ringWidthDp` opcionais: os
     * Tiles de pasta com cor fixa usam anel BRANCO e grosso (4dp) — o
     * anel da marca é fraco demais sobre a paleta, e o branco dá
     * 8,0–9,9:1 sobre qualquer cor da paleta. Sem os parâmetros, o
     * comportamento é o de sempre (anel da marca 3dp) — a tela inicial
     * (herói, "Continue assistindo") não muda.
     */
    fun attachCard(
        card: MaterialCardView,
        isTv: Boolean,
        scaleTv: Float? = null,
        ringColorRes: Int = R.color.tile_focus_ring,
        ringWidthDp: Float = 3f
    ) {
        val scale = if (isTv) (scaleTv ?: SCALE_TV) else SCALE_PHONE
        val elevDp = if (isTv) ELEV_TV_DP else ELEV_PHONE_DP
        val density = card.resources.displayMetrics.density
        val ringColor = ContextCompat.getColor(card.context, ringColorRes)
        val focusedBg = ContextCompat.getColor(card.context, R.color.tile_bg_focused)
        val normalBg = ContextCompat.getColor(card.context, R.color.tile_bg)
        card.setOnFocusChangeListener { v, hasFocus ->
            animate(v, hasFocus, scale, elevDp * density)
            card.strokeWidth = ((if (hasFocus) ringWidthDp else 0f) * density).toInt()
            card.strokeColor = ringColor
            card.setCardBackgroundColor(if (hasFocus) focusedBg else normalBg)
        }
    }

    private fun animate(view: View, focused: Boolean, scale: Float, elevPx: Float) {
        val targetScale = if (focused) scale else 1f
        val targetElev = if (focused) elevPx else 0f
        ObjectAnimator.ofFloat(view, View.SCALE_X, targetScale).apply {
            duration = DURATION_MS
            interpolator = DecelerateInterpolator()
            start()
        }
        ObjectAnimator.ofFloat(view, View.SCALE_Y, targetScale).apply {
            duration = DURATION_MS
            interpolator = DecelerateInterpolator()
            start()
        }
        ObjectAnimator.ofFloat(view, "elevation", targetElev).apply {
            duration = DURATION_MS
            interpolator = DecelerateInterpolator()
            start()
        }
    }
}
