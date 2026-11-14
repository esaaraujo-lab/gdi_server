package com.vovofit.app.util

import android.animation.ObjectAnimator
import android.view.View
import android.view.animation.DecelerateInterpolator
import androidx.core.content.ContextCompat
import com.google.android.material.card.MaterialCardView
import com.vovofit.app.R

/**
 * v1.0.4 — Animação de foco (android-tv-design skill).
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
 */
object FocusAnimator {
    private const val DURATION_MS = 180L
    private const val SCALE_TV = 1.10f
    private const val SCALE_PHONE = 1.06f
    private const val ELEV_TV_DP = 16f
    private const val ELEV_PHONE_DP = 8f

    /** Liga a animação de foco a uma view genérica (linhas, botões). */
    fun attach(view: View, isTv: Boolean) {
        val scale = if (isTv) SCALE_TV else SCALE_PHONE
        val elevDp = if (isTv) ELEV_TV_DP else ELEV_PHONE_DP
        val density = view.resources.displayMetrics.density
        view.setOnFocusChangeListener { v, hasFocus ->
            animate(v, hasFocus, scale, elevDp * density)
        }
    }

    /**
     * Liga a animação de foco a um MaterialCardView, incluindo o anel:
     * stroke 3dp na cor da marca + fundo `tile_bg_focused` quando focado.
     */
    fun attachCard(card: MaterialCardView, isTv: Boolean) {
        val scale = if (isTv) SCALE_TV else SCALE_PHONE
        val elevDp = if (isTv) ELEV_TV_DP else ELEV_PHONE_DP
        val density = card.resources.displayMetrics.density
        val ringColor = ContextCompat.getColor(card.context, R.color.tile_focus_ring)
        val focusedBg = ContextCompat.getColor(card.context, R.color.tile_bg_focused)
        val normalBg = ContextCompat.getColor(card.context, R.color.tile_bg)
        card.setOnFocusChangeListener { v, hasFocus ->
            animate(v, hasFocus, scale, elevDp * density)
            card.strokeWidth = ((if (hasFocus) 3f else 0f) * density).toInt()
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
