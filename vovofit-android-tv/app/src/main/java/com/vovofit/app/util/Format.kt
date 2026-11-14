package com.vovofit.app.util

/**
 * v1.0.4 — Formatação de tempo/progresso (usada em cards, detalhe,
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

    /**
     * v1.0.8 — Titulo de exibicao: sem extensao e sem numeracao inicial
     * ("001 - aula.mp4" -> "aula"; "01. Introducao.mp4" -> "Introducao").
     * NAO inventa descricao — so limpa o nome cru do arquivo. A
     * descricao da Meggy depende dos endpoints de IA (hoje so no
     * staging v2.15.5; producao bloqueada — outro trabalho).
     */
    fun displayTitle(rawName: String): String {
        var t = rawName.trim()
        t = Regex("""\.[A-Za-z0-9]{2,5}$""").replace(t, "")
        t = Regex("""^\d{1,3}\s*[-–—.)\s]+\s*""").replace(t, "")
        t = t.trim(' ', '-', '–', '—', ':', '.').trim()
        return t.ifEmpty { rawName.substringBeforeLast('.') }
    }

    /**
     * v1.0.8 — "Aula NN — Tema" quando o numero e o tema sao conhecidos
     * (LessonDescription.extractTopic); senao displayTitle(). A
     * disciplina ja e o subtitulo do card — nao e repetida no titulo.
     * Ex.: "Aula 01 - Introducao.mp4" -> "Aula 1 — Introducao";
     * "001 - aula.mp4" -> "aula" (generico, sem numero/tema validos).
     */
    fun lessonTitle(rawName: String): String {
        // Só o marcador explícito ("Aula/Ep/Parte/Cap NN") vira "Aula NN":
        // numeração nua ("01. Introdução", "10 - História") é só ordem
        // de arquivo e some no displayTitle, como pede a tarefa.
        val number = Regex("""(?i)(?:aula|ep\.?|parte|cap\.?)\s*0*(\d{1,3})\b""")
            .find(rawName)?.groupValues?.get(1)
        val topic = LessonDescription.extractTopic(rawName)
        if (number != null && topic != null) {
            // O tema já traz "Aula NN" (ex.: "Direito Penal - Aula 03") —
            // não duplicar o marcador.
            val already = Regex("""(?i)\b(aula|ep\.?|parte|cap\.?)\s*0*$number\b""")
                .containsMatchIn(topic)
            return if (already) topic else "Aula $number — $topic"
        }
        return displayTitle(rawName)
    }
}
