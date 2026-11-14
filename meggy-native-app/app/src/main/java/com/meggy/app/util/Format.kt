package com.meggy.app.util

/**
 * v2.7.6 — Formatação de tempo/progresso (usada em cards, detalhe,
 * player e "Continuar de onde parou").
 */
object Format {
    /** ms → "12:34" (ou "1:02:03" acima de 1h). */
    fun mmss(ms: Long): String {
        if (ms <= 0L) return "00:00"
        val totalSec = ms / 1000
        val h = totalSec / 3600
        val m = (totalSec % 3600) / 60
        val s = totalSec % 60
        return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%02d:%02d".format(m, s)
    }

    /** ms → "12 min restantes" (arredonda para cima; 0 quando acabou). */
    fun remainingText(durationMs: Long, positionMs: Long): String {
        val remain = (durationMs - positionMs).coerceAtLeast(0L)
        val min = ((remain + 59_999L) / 60_000L).toInt()
        return if (min <= 0) "terminando" else "$min min restantes"
    }

    /** "68% concluído · 12 min restantes" (conceito home). */
    fun progressText(progressPct: Int, durationMs: Long, positionMs: Long): String =
        "$progressPct% concluído · ${remainingText(durationMs, positionMs)}"

    /** "12:34 de 48:20 · 12 min restantes" (conceito TV continuar). */
    fun positionText(positionMs: Long, durationMs: Long): String =
        "${mmss(positionMs)} de ${mmss(durationMs)} · ${remainingText(durationMs, positionMs)}"

    /** "Você está em 22% — 10min assistidos" (rodapé do detalhe TV). */
    fun watchedFooter(progressPct: Int, watchedMs: Long): String {
        val min = (watchedMs / 60_000L).toInt()
        return "Você está em $progressPct% — ${min}min assistidos"
    }
}
