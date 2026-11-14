package com.meggy.app.util

import android.content.res.Resources
import android.graphics.Color
import android.graphics.drawable.GradientDrawable

/**
 * v2.7.6 — Gradiente do card a partir da cor do curso (colorFromString).
 * Extraído do RailAdapter (a lógica era privada lá) para ser usado
 * também no hero da home e no hero do detalhe.
 */
object CardGradient {
    fun drawable(res: Resources, baseColor: Int): GradientDrawable {
        val r = Color.red(baseColor)
        val g = Color.green(baseColor)
        val b = Color.blue(baseColor)
        val start = Color.argb(0x59, r, g, b)
        val end = Color.parseColor("#FF0F1218")
        val cornerPx = (16 * res.displayMetrics.density)
        return GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            intArrayOf(start, end)
        ).apply { cornerRadius = cornerPx }
    }
}
