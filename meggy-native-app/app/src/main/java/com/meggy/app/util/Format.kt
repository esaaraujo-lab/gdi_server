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

    /**
     * v2.7.11 — título de exibição de um arquivo de aula (nome cru do
     * Drive → título limpo): tira a extensão e a numeração inicial
     * ("001 - ", "01. ", "Aula 01 - ") via LessonDescription.extractTopic
     * (mesmas regras testadas 21/21 na v2.7.6). Null quando o nome é
     * genérico ("001 - aula.mp4", "video.mp4") — nunca inventa tema.
     */
    fun displayTitle(rawName: String): String? = LessonDescription.extractTopic(rawName)

    /** "Aula 08" a partir do nome cru ("Aula 08 - X", "008 - X", "X - Aula 08"), ou null. */
    fun lessonNumberLabel(rawName: String): String? {
        val m = Regex("(?i)(?:^|\\b)(?:aula|ep\\.?|episódio|episodio|parte|cap\\.?|capítulo|capitulo|módulo|modulo)\\s*(\\d{1,3})\\b")
            .find(rawName)?.groupValues?.getOrNull(1)
            ?: Regex("^\\s*(\\d{1,3})\\s*[-–—.)\\s]").find(rawName)?.groupValues?.getOrNull(1)
        val n = m?.toIntOrNull() ?: return null
        return "Aula %02d".format(n)
    }

    /**
     * v2.7.11 — título do card "Continue assistindo" no estilo do
     * conceito ("Direito Constitucional — Aula 08"): tema limpo +
     * número da aula; sem tema, "Curso — Aula NN"; sem número, só o
     * curso (nunca o nome cru do arquivo). O nome cru continua sendo a
     * identidade do item (o clique casa por videoName, não por este
     * título) — ver RailItem.displayTitle.
     */
    fun lessonDisplayTitle(videoName: String, courseName: String): String {
        val topic = displayTitle(videoName)
        val num = lessonNumberLabel(videoName)
        return when {
            // Tema já traz o número ("Direito Penal - Aula 03"): só
            // normaliza o separador para o traço longo do conceito.
            topic != null && num != null && topic.contains(num, ignoreCase = true) ->
                Regex(" - ${Regex.escape(num)}", RegexOption.IGNORE_CASE).replace(topic, " — $num")
            topic != null && num != null -> "$topic — $num"
            topic != null -> topic
            num != null && courseName.isNotBlank() -> "$courseName — $num"
            courseName.isNotBlank() -> courseName
            else -> videoName
        }
    }

    /** "Você está em 22% — 10min assistidos" (rodapé do detalhe TV). */
    fun watchedFooter(progressPct: Int, watchedMs: Long): String {
        val min = (watchedMs / 60_000L).toInt()
        return "Você está em $progressPct% — ${min}min assistidos"
    }
}
