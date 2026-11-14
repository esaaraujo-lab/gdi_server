package com.meggy.app.util

import android.app.UiModeManager
import android.content.Context
import android.content.res.Configuration

/**
 * v2.7.6 — Detecção de TV (android-tv-design skill).
 *
 * Um único ponto de verdade: o app decide phone vs. TV por
 * UiModeManager (UI_MODE_TYPE_TELEVISION) e NÃO por tamanho de tela,
 * porque um celular em modo desktop ou um tablet grande não é TV.
 * Os layouts `layout-television/` seguem o mesmo sinal (o sistema
 * escolhe o qualificador television quando o modo é TV).
 */
object TvUtils {
    fun isTv(context: Context): Boolean {
        val uiModeManager =
            context.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
        if (uiModeManager?.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION) {
            return true
        }
        // Fallback: o qualificador `television` já resolveu o recurso.
        return context.resources.configuration.uiMode and
            Configuration.UI_MODE_TYPE_MASK == Configuration.UI_MODE_TYPE_TELEVISION
    }
}
