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

    /**
     * R28 — nome do curso a partir do caminho da pasta (movido da
     * HomeActivity, sem mudar a lógica: era private dela e o
     * DetailActivity precisa da mesma regra no seu rail Continuar).
     * Devolve um rótulo legível ("PF - Agente", "DirAdmin") conforme
     * a profundidade do caminho: salta o índice do drive ("0:", "9:")
     * e, do mais fundo para o mais raso, o primeiro segmento que não
     * é módulo, aula ou pasta genérica.
     */
    fun extractCourseName(folderPath: String): String {
        val segments = folderPath.trim('/').split('/').filter { it.isNotBlank() }
        if (segments.isEmpty()) return folderPath

        // Skip drive index ("0:", "9:", etc.)
        val startIdx = if (segments[0].matches(Regex("^\\d+:$"))) 1 else 0
        val pathSegments = segments.drop(startIdx)
        if (pathSegments.isEmpty()) return segments.last()

        /**
         * Returns true if a segment is a MODULE or LESSON or GENERIC bucket
         * (not a course name). These are skipped when searching for the course.
         */
        fun isModuleOrLesson(seg: String): Boolean {
            val lower = seg.trim().lowercase()
            // Module/lesson patterns: "MÓDULO 1", "AULA 01", "BLOCO I", "PARTE 1"
            if (lower.matches(Regex("^(módulo|modulo|aula|bloco|parte|capítulo|capitulo|unidade|topico|tópico)\\s*\\d+.*"))) return true
            // Numbered prefix: "001 - PODERES", "01 - INTRODUÇÃO" (lesson names)
            if (seg.matches(Regex("^\\d{2,}\\s*[-–].*"))) return true
            // Pure number: "001", "2026", "1"
            if (seg.matches(Regex("^\\d+$"))) return true
            // Too short to be a course name (less than 3 chars): "I", "A", "1A", "Sub"
            if (seg.trim().length < 3) return true
            // GENERIC bucket names — organizational folders, NOT courses
            val GENERIC = setOf(
                "diversos", "vídeos", "videos", "aulas", "aulão", "aulao",
                "curso", "cursos", "cursinho", "cursinhos", "completo", "completos",
                "módulos", "modulos", "modulo", "módulo", "bloco", "blocos",
                "material", "materiais", "apostila", "apostilas", "pdf", "pdfs",
                "plataforma", "plataformas", "novidades", "atualizado", "atualizados",
                "sub", "subs", "subpasta", "subpastas", "geral", "extra", "extras",
                "provas", "exercícios", "exercicios", "questões", "questoes",
                "leilão vendas e cripto", "leilao vendas e cripto",
                "cursos e cursinhos completo", "cursos e cursinhos",
                "retas final", "reta final", "retafinal",
                "2024", "2025", "2026", "2027"
            )
            if (lower in GENERIC) return true
            // "0 DIVERSOS", "1 VÍDEOS", "2 AULAS" — starts with number + space
            if (seg.matches(Regex("^\\d+\\s+.*"))) return true
            // Ends with file extension (it's a file, not a folder): .mp4, .mp3, .pdf
            if (lower.matches(Regex("^.*\\.(mp4|mkv|webm|mov|avi|mp3|m4a|aac|ogg|wav|flac|pdf)$"))) return true
            return false
        }

        // Walk from DEEPEST to SHALLOWEST, skip modules/lessons, return first real segment.
        // This finds the course name = the deepest folder that isn't a module/lesson bucket.
        for (seg in pathSegments.reversed()) {
            if (!isModuleOrLesson(seg)) {
                return seg
            }
        }

        // Fallback: all segments were modules/lessons → return the deepest one
        return pathSegments.last()
    }

    /**
     * R28 — subtítulo do card "Continuar" (regra R26, partilhada
     * pelos dois rails — Home e Detalhe): duas aulas da mesma
     * disciplina mostravam o mesmo título cortado ("Direito…") e a
     * mesma capa. Quando o título é comprido demais para caber no
     * cartão (2 linhas a 16sp ≈ 36 caracteres no celular; ≈ 56 na
     * TV), o número da aula vai para o subtítulo — primeiro, para
     * sobreviver ao corte. O limite é aproximado (depende da fonte);
     * no pior caso o cartão fica como hoje. Títulos curtos não mudam.
     * Quando o título já traz o curso, o subtítulo some (o adapter
     * esconde subtítulo vazio) em vez de deixar uma linha em branco.
     */
    fun continueSubtitle(displayTitle: String, videoName: String, courseName: String, isTv: Boolean): String {
        val numLabel = lessonNumberLabel(videoName)
        val cutThreshold = if (isTv) 56 else 36
        return when {
            numLabel != null && displayTitle.length > cutThreshold ->
                if (courseName.isNotBlank()) "$numLabel · $courseName" else numLabel
            displayTitle.startsWith(courseName) -> ""
            else -> courseName
        }
    }
}
