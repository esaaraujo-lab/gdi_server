package com.bibigyn.app.util

/**
 * v2.1.5 — Formatação de tempo/progresso (usada em cards, detalhe,
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

    /**
     * v2.1.9 — título cru de arquivo → título limpo (conceito home):
     * remove a extensão e a numeração inicial ("001 - ", "01. ").
     * Ex.: "001 - aula.mp4" → "aula"; "01. Treino de pernas.mp4" →
     * "Treino de pernas". NÃO inventa descrição (a da Meggy depende
     * dos endpoints de IA — produção bloqueada, outro trabalho).
     */
    fun displayTitle(raw: String?): String {
        if (raw.isNullOrBlank()) return ""
        var t = raw.trim()
        t = Regex("\\.[A-Za-z0-9]{2,5}$").replace(t, "")
        repeat(2) {
            val before = t
            t = Regex("^\\d{1,3}\\s*[-–—.)\\s]+").replace(t, "").trim()
            if (t == before) return@repeat
        }
        t = t.trim(' ', '-', '–', '—', ':', '.').trim()
        return t.ifBlank { raw.trim() }
    }

    /**
     * v2.1.9 — título do card no estilo do conceito ("Disciplina —
     * Aula NN"): tema real do nome (LessonDescription.extractTopic),
     * senão "Aula NN" da numeração do arquivo, senão o título limpo.
     * A disciplina vai no SUBTÍTULO do card (já é o courseName) —
     * título + subtítulo compõem "Disciplina — Aula NN" sem duplicar
     * o nome do curso nas duas linhas.
     */
    fun lessonTitle(videoName: String, courseName: String): String {
        val topic = LessonDescription.extractTopic(videoName)
        if (!topic.isNullOrBlank()) return topic
        val num = Regex("(?:aula|ep\\.?|episódio|episodio|parte)\\s*(\\d{1,3})",
            RegexOption.IGNORE_CASE).find(videoName)
            ?.groupValues?.getOrNull(1)?.toIntOrNull()
            ?: Regex("^\\d{1,3}").find(videoName)?.value?.toIntOrNull()
        if (num != null) return "Aula ${"%02d".format(num)}"
        return displayTitle(videoName)
    }

    /** "Você está em 22% — 10min assistidos" (rodapé do detalhe TV). */
    fun watchedFooter(progressPct: Int, watchedMs: Long): String {
        val min = (watchedMs / 60_000L).toInt()
        return "Você está em $progressPct% — ${min}min assistidos"
    }
}
