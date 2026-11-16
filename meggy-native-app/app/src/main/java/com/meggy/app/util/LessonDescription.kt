package com.meggy.app.util

import android.content.Context
import com.meggy.app.MeggyApp
import com.meggy.app.data.AiService
import com.meggy.app.data.FileItem
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

/**
 * v2.7.6 — Descrição (texto explicativo) da aula — Elton 00:21.
 *
 * O texto da aba Resumo é o resumo gerado pela Meggy: o batalhão
 * (POST /api/ai/battalion, job em KV) lê o conteúdo real da aula
 * (transcrição primeiro; sem ela, o texto dos PDFs), a IA escreve o
 * texto explicativo + flashcards + questões e fica guardado
 * (cache ISA + pasta `.gdi-resumos/` da aula) — gera uma vez em
 * segundo plano (minutos), depois é instantâneo. Diagrama:
 * "Como nasce o texto explicativo da aula" (1. pasta → 2. Meggy lê
 * → 3. IA escreve → 4. aparece na aba Resumo, guardado).
 *
 * CADEIA DE FALLBACK (ordem exata, decisão do Elton 00:21;
 *   R14B 2026-11-15 21:48: a provisória passa a ser o NOME DO
 *   ARQUIVO do vídeo; o nome da pasta só vale quando a pasta tem
 *   uma só aula — o nome da pasta de um curso com várias aulas
 *   não descreve nenhuma delas):
 *   (a) descrição gerada guardada → mostra ela;
 *   (b) senão, nome real de aula (NOME DO ARQUIVO do vídeo; sem
 *       ele, NOME DA PASTA quando a pasta tem só uma aula) → usa
 *       o NOME como descrição PROVISÓRIA até a Meggy gerar a de
 *       verdade;
 *   (c) senão, nome genérico (ex. "001 - aula.mp3", "Aula 01") →
 *       EM BRANCO até a Meggy processar os materiais.
 *   Precedência final (ver §4 do REDESIGN_NOTES): quando se verifica
 *   que NÃO HÁ material legível (PDF escaneado sem texto e sem MD),
 *   a descrição fica EM BRANCO COM O MOTIVO — a provisória só vale
 *   enquanto a geração ainda é possível/pendente.
 *
 * PRIORIDADE DAS FONTES para gerar (decisão do Elton 00:21):
 *   1. MD (transcrição/resumo em MD);
 *   2. texto extraído do PDF (resumo de IA em PDF);
 *   3. PÍLULA já salva (arquivo menor — via cache ISA / pasta
 *      `.gdi-resumos/`, que é onde o batalhão e a web guardam).
 *   Sem material legível → branco com o motivo (o OCR, v2.15.4 sem
 *   limites, é a saída — POST /api/ai/ocr existe no worker v2.15.4,
 *   mas o encadeamento OCR→batalhão NÃO está nesta versão; ver
 *   REDESIGN_NOTES.md).
 *
 * GATILHO: ao ABRIR a aula (pasta de aula — ver [isLessonFolder]),
 * o app chama a Meggy automaticamente (DetailActivity). A pré-geração
 * das próximas aulas roda em [DescriptionPregenerator] enquanto o
 * vídeo toca. O batalhão é por CURSO (courseKey = path da pasta):
 * um job concluído não re-roda; job rodando não recebe segundo POST.
 */
object LessonDescription {

    /** Texto máximo enviado ao batalhão por material (teto do worker). */
    const val MAX_TEXT_CHARS = 15_000

    /** Páginas máximas lidas de um PDF para gerar a descrição. */
    private const val MAX_PDF_PAGES_FOR_AI = 20

    /** Mínimo de caracteres não-brancos para um PDF contar como legível. */
    private const val MIN_PDF_READABLE_CHARS = 200

    /** Mínimo de caracteres não-brancos para uma transcrição MD contar. */
    private const val MIN_MD_READABLE_CHARS = 50

    /** Poll da geração no detalhe: 6 tentativas × 30 s (3 min máx.). */
    const val DETAIL_POLL_ATTEMPTS = 6
    const val POLL_DELAY_MS = 30_000L

    // ───────── (b)/(c) — heurística de "nome real de aula" ─────────
    //
    // Regra exata (nada de adivinhar na hora do teste):
    //   1. Candidato = UM nome de cada vez (o chamador escolhe a
    //      ordem — R14B: o ARQUIVO primeiro; a PASTA só quando tem
    //      uma só aula, ver provisionalDescription).
    //   2. Remove a extensão (.mp4/.mp3/.pdf/.md/...).
    //   3. Remove prefixos de numeração no início, até 2 vezes:
    //      "001 - ", "01. ", "1) " e "Aula 01 - ", "Ep. 12 — ",
    //      "Parte 2 - ", "Capítulo 3: " (insensível a maiúsculas).
    //   4. O resto é o TEMA. REJEITA (→ null, descrição em branco) se:
    //      - vazio, ou < 4 caracteres;
    //      - sem nenhuma letra (só dígitos/pontuação);
    //      - for SÓ uma palavra genérica (opcionalmente + número):
    //        aula, vídeo, áudio, episódio, parte, capítulo, lição,
    //        módulo, tópico, arquivo — palavras que apenas ROTULAM o
    //        arquivo, sem dizer nada do conteúdo.
    //      "Introdução", "Revisão", "Simulado" NÃO são genéricas: são
    //      tema (a aula é uma introdução / revisão / simulado).
    //   5. ACEITA → devolve o tema com a capitalização original.
    //
    // Exemplos (tabela de teste em REDESIGN_NOTES.md):
    //   "Aula 01 - História do Direito Penal e Fontes" → "História do Direito Penal e Fontes"
    //   "Aula 01 — Aplicabilidade das Normas" → "Aplicabilidade das Normas"
    //   "Aula 12 - Eficácia das Normas.mp4" → "Eficácia das Normas"
    //   "001 - aula.mp3" → null | "Aula 01" → null | "002 - video.mp4" → null
    //   "Direito Penal - Aula 03" → "Direito Penal - Aula 03" (nome real,
    //     o "Aula 03" está no meio — não é prefixo, mantém-se o nome todo)

    private val EXTENSION_REGEX = Regex("\\.[A-Za-z0-9]{2,5}$")
    private val NUMBER_PREFIX_REGEX = Regex("^\\d{1,3}\\s*[-–—.)\\s]+")
    private val LESSON_PREFIX_REGEX = Regex(
        "^(aula|ep\\.?|episódio|episodio|parte|cap\\.?|capítulo|capitulo|lição|licao|módulo|modulo)\\s*\\d{0,3}\\s*[-–—.)\\s:]*",
        RegexOption.IGNORE_CASE
    )
    private val GENERIC_ONLY_REGEX = Regex(
        "^(aula|vídeo|video|áudio|audio|episódio|episodio|parte|capítulo|capitulo|lição|licao|módulo|modulo|tópico|topico|arquivo|file)(\\s+\\d+)?$",
        RegexOption.IGNORE_CASE
    )
    private val HAS_LETTER_REGEX = Regex("[A-Za-zÀ-ÿ]")

    /** Tema do nome da aula, ou null quando o nome é genérico. */
    fun extractTopic(candidateName: String?): String? {
        if (candidateName.isNullOrBlank()) return null
        var topic = candidateName.trim()
        topic = EXTENSION_REGEX.replace(topic, "")
        // Remove prefixos de numeração/aula no início (até 2 rodadas:
        // ex. "Aula 01 - Parte 2 - Tema" → "Tema").
        repeat(2) {
            val before = topic
            topic = NUMBER_PREFIX_REGEX.replace(topic, "")
            topic = LESSON_PREFIX_REGEX.replace(topic, "")
            topic = topic.trim()
            if (topic == before) return@repeat
        }
        topic = topic.trim(' ', '-', '–', '—', ':', '.').trim()
        if (topic.isEmpty()) return null
        if (topic.length < 4) return null
        if (!HAS_LETTER_REGEX.containsMatchIn(topic)) return null
        if (GENERIC_ONLY_REGEX.matches(topic)) return null
        return topic
    }

    // ───────── ganchos do texto descritivo (onda 2) ─────────
    //
    // Elton 2026-11-14: o texto exibido da aula começa com um GANCHO
    // sorteado A CADA EXIBIÇÃO (não por aula — o mesmo resumo pode
    // abrir com um gancho diferente), combinado com o resumo da
    // Meggy. O gancho é só de exibição (DetailActivity.showDescription):
    // nunca é guardado no cache nem enviado ao servidor, e nunca é
    // inventado conteúdo: sem resumo, não há gancho (o texto fica a
    // provisória / em branco, como antes).
    val DESCRIPTION_HOOKS = listOf(
        "Nesta aula exploramos...",
        "Vamos aprender...",
        "Nesta aula, você vai descobrir...",
        "Prepare-se para mergulhar em...",
        "Hoje vamos ver..."
    )

    /** Resumo com gancho sorteado na hora (exibição). */
    fun withHook(summary: String): String {
        if (summary.isBlank()) return summary
        return "${DESCRIPTION_HOOKS.random()} $summary"
    }

    /**
     * Descrição provisória (b) — R14B (Elton 2026-11-15 21:48):
     * tenta o NOME DO ARQUIVO do vídeo primeiro; sem tema no
     * arquivo, tenta o NOME DA PASTA — SÓ quando a pasta tem uma
     * só aula (folderHasSingleLesson). Numa pasta com várias
     * aulas, o nome da pasta é o nome do curso/módulo e não
     * descreve nenhuma aula — nesse caso não há provisória.
     * Null → branco (c). O resumo gerado pela Meggy não muda:
     * isto é só o fallback provisório.
     */
    fun provisionalDescription(
        folderName: String?,
        fileName: String?,
        folderHasSingleLesson: Boolean = false
    ): String? {
        return extractTopic(fileName)
            ?: if (folderHasSingleLesson) extractTopic(folderName) else null
    }

    // ───────── fontes / resolução do material ─────────

    /** Material com texto pronto para enviar ao batalhão. */
    data class LessonSource(val name: String, val text: String)

    /** Por que não há material legível (para o estado em branco). */
    enum class NoMaterialReason { NO_FILES, SCANNED_PDF, NO_TEXT }

    /**
     * Verdadeiro quando a pasta É uma aula: tem vídeo/áudio direto
     * nela. Pasta de curso (só subpastas) NÃO dispara geração
     * automática ao abrir — o batalhão do curso inteiro é pesado
     * demais para um open (a web dispara ao ADICIONAR o curso);
     * as aulas são geradas uma a uma (detalhe + pré-geração).
     */
    fun isLessonFolder(files: List<FileItem>): Boolean =
        files.any { it.isVideo || it.isAudio }

    /**
     * Resolve o texto-fonte da aula, na prioridade do Elton:
     * MD (transcrição) primeiro; senão, texto extraído do PDF.
     * Retorna o material ou null + motivo (sem MD e sem PDF legível).
     */
    suspend fun resolveSourceText(
        context: Context,
        files: List<FileItem>
    ): Pair<LessonSource?, NoMaterialReason?> {
        // 1) MD primeiro (transcrição/resumo em MD).
        val transcript = files.firstOrNull { it.isTranscript && it.isMarkdown }
            ?: files.firstOrNull { it.isMarkdown }
        if (transcript != null) {
            val url = MeggyApp.BASE_URL + (transcript.link ?: "")
            val text = FileDownloader.downloadText(context, url)
                ?.take(MAX_TEXT_CHARS)
            if (!text.isNullOrBlank() &&
                text.count { !it.isWhitespace() } >= MIN_MD_READABLE_CHARS
            ) {
                return LessonSource(transcript.name, text) to null
            }
            // MD existe mas é curto demais — tenta o PDF antes de desistir.
        }
        // 2) Texto extraído do PDF (limitado: 20 págs, 15.000 chars).
        val pdf = files.firstOrNull { it.isPdf }
        if (pdf != null) {
            val text = extractPdfText(context, pdf)
            if (!text.isNullOrBlank() &&
                text.count { !it.isWhitespace() } >= MIN_PDF_READABLE_CHARS
            ) {
                return LessonSource(pdf.name, text.take(MAX_TEXT_CHARS)) to null
            }
            // PDF existe mas sem texto extraível → escaneado.
            return null to NoMaterialReason.SCANNED_PDF
        }
        if (transcript != null) return null to NoMaterialReason.NO_TEXT
        return null to NoMaterialReason.NO_FILES
    }

    /** Extrai texto de um PDF (pdfbox, como o leitor de PDF). */
    private suspend fun extractPdfText(context: Context, pdf: FileItem): String? {
        return try {
            val url = MeggyApp.BASE_URL + (pdf.link ?: "")
            val file: File = FileDownloader.download(context, url, "pdfs", pdf.name)
                ?: return null
            withContext(Dispatchers.IO) {
                try {
                    PDFBoxResourceLoader.init(context.applicationContext)
                    PDDocument.load(file).use { doc ->
                        val stripper = PDFTextStripper()
                        val sb = StringBuilder()
                        val pages = minOf(doc.numberOfPages, MAX_PDF_PAGES_FOR_AI)
                        for (i in 0 until pages) {
                            stripper.startPage = i + 1
                            stripper.endPage = i + 1
                            val pageText = runCatching { stripper.getText(doc) }.getOrDefault("")
                            sb.append(pageText).append('\n')
                            if (sb.length >= MAX_TEXT_CHARS) break
                        }
                        sb.toString().take(MAX_TEXT_CHARS).takeIf { it.isNotBlank() }
                    }
                } catch (_: Exception) {
                    null
                }
            }
        } catch (_: Exception) {
            null
        }
    }

    // ───────── leitura do gerado ─────────

    /** Path pai de uma pasta ("/11:/Curso/Aula 01" → "/11:/Curso"). */
    fun parentPath(path: String): String {
        val clean = path.trimEnd('/')
        if (clean.isEmpty() || clean == "/") return "/"
        val idx = clean.lastIndexOf('/')
        return if (idx <= 0) "/" else clean.substring(0, idx)
    }

    /**
     * Busca a descrição gerada no servidor, nesta ordem:
     *   1. cache ISA (GET /api/ai/summaries?key=<courseKey>/<nome>) —
     *      tenta a chave do app (pasta atual + nome do material) e a
     *      chave da web (pasta PAI + nome — o batalhão da web usa o
     *      path do CURSO como courseKey);
     *   2. pasta de materiais (GET /api/materials/load-from-folder,
     *      discovery — o arquivo mais recente de `.gdi-resumos/`).
     * `materialNames` = nomes dos PDFs/MDs da pasta (PDFs primeiro).
     * Frente K — devolve o PACOTE gerado (resumo + pilulas +
     * questoes), nao so o texto: o resumo continua a decidir
     * "pronto", mas as pilulas/questoes viajam junto para serem
     * guardadas na pasta de materiais ([MaterialSaver]). O passo 2
     * (pasta de materiais) so tem o resumo — pilulas/questoes de
     * la vem null e sao repostas pela gravacao desta frente.
     * `lessonFilePath` = path COMPLETO de um arquivo dentro da pasta
     * da aula (ex. ".../Aula 01/Aula 01.mp4"): o worker resolve a
     * pasta PAI desse arquivo como a pasta da aula — passar só a
     * pasta resolveria a pasta do CURSO (errado). Null → pula o
     * passo 2.
     */
    suspend fun fetchGenerated(
        context: Context,
        folderPath: String,
        materialNames: List<String>,
        lessonFilePath: String?
    ): AiService.GeneratedBundle? {
        val courseKeys = listOf(folderPath, parentPath(folderPath)).distinct()
        for (courseKey in courseKeys) {
            for (name in materialNames) {
                val key = "$courseKey/$name"
                val bundle = AiService.getGeneratedBundle(context, key)
                if (!bundle?.summary.isNullOrBlank()) return bundle
            }
        }
        if (lessonFilePath != null) {
            val summary = AiService.loadFromFolder(context, lessonFilePath, "resumo")
            if (!summary.isNullOrBlank()) {
                return AiService.GeneratedBundle(summary, null, null)
            }
        }
        return null
    }

    /** Path completo de um arquivo da pasta (o vídeo, de preferência). */
    fun lessonFilePath(folderPath: String, files: List<FileItem>): String? {
        val file = files.firstOrNull { it.isVideo || it.isAudio }
            ?: files.firstOrNull()
            ?: return null
        val base = folderPath.trimEnd('/')
        return "$base/${file.name}"
    }

    /**
     * Nome do arquivo para gravar um material na pasta da aula
     * (`<usuario>_<Aula>.<ext>` — o padrao da web). Frente K: a
     * extensao varia por tipo (resumo e pilulas: `md`; questoes:
     * `json`); o padrao continua `md`, por isso os chamadores
     * antigos nao mudam.
     */
    fun folderFileName(context: Context, folderName: String, extension: String = "md"): String {
        val user = SessionManager.get(context).username?.takeIf { it.isNotBlank() } ?: "meggy"
        val safe = folderName.replace(Regex("[^A-Za-z0-9._-]"), "_").take(60)
        return "${user}_${safe}.$extension"
    }

    // ───────── gatilho + poll ─────────

    sealed class Outcome {
        /**
         * Descricao gerada encontrada (servidor ou apos o poll).
         * Frente K — carrega o PACOTE gerado (resumo + pilulas +
         * questoes); `text` e so o resumo, para os chamadores que
         * so precisam dele (o resumo continua a decidir "pronto").
         */
        data class Ready(val bundle: AiService.GeneratedBundle) : Outcome() {
            val text: String get() = bundle.summary.orEmpty()
        }

        /** Ainda gerando após o poll limitado — tentar na próxima abertura. */
        object Generating : Outcome()

        /** Sem material legível: não há o que gerar (ver motivo). */
        data class NoMaterial(val reason: NoMaterialReason) : Outcome()

        /** Backend sem as rotas de IA (produção pré-v2). */
        object Unavailable : Outcome()

        /** Falha (rede/servidor) — nada concluído desta vez. */
        object Failed : Outcome()
    }

    /**
     * Garante a descrição da pasta da aula: lê o gerado; se não há,
     * dispara o batalhão com o texto-fonte e espera (poll limitado).
     * Chamar SÓ para pasta de aula ([isLessonFolder]) — para pasta de
     * curso, o chamador mostra o fallback sem disparar.
     * Nunca lança exceção (tudo vira [Outcome]).
     */
    suspend fun ensureDescription(
        context: Context,
        folderPath: String,
        folderName: String,
        files: List<FileItem>,
        maxPollAttempts: Int = DETAIL_POLL_ATTEMPTS,
        pollDelayMs: Long = POLL_DELAY_MS
    ): Outcome {
        return try {
            val materialNames = files.filter { it.isPdf || it.isMarkdown }.map { it.name }
            val filePath = lessonFilePath(folderPath, files)
            // 1) Já gerado?
            val existing = fetchGenerated(context, folderPath, materialNames, filePath)
            if (existing != null && !existing.summary.isNullOrBlank()) return Outcome.Ready(existing)
            if (AiService.backendUnavailable) return Outcome.Unavailable

            // 2) Texto-fonte (MD primeiro, senão PDF).
            val (source, noMaterialReason) = resolveSourceText(context, files)
            if (source == null) {
                return Outcome.NoMaterial(noMaterialReason ?: NoMaterialReason.NO_FILES)
            }

            // 3) Gatilho (com as guardas do worker: concluído/rodando).
            val courseKey = folderPath
            when (
                AiService.startBattalion(
                    context, courseKey, folderPath, folderName,
                    listOf(AiService.BattalionPdf(source.name, "", source.text))
                )
            ) {
                AiService.TriggerResult.UNAVAILABLE -> return Outcome.Unavailable
                AiService.TriggerResult.FAILED -> return Outcome.Failed
                AiService.TriggerResult.ALREADY_DONE -> {
                    // Job já concluído: o resumo deve estar no cache.
                    val again = fetchGenerated(context, folderPath, materialNames, filePath)
                    return if (again != null && !again.summary.isNullOrBlank()) Outcome.Ready(again) else Outcome.Failed
                }
                AiService.TriggerResult.RUNNING,
                AiService.TriggerResult.STARTED -> {
                    // 4) Poll limitado: tenta a leitura a cada 30 s.
                    repeat(maxPollAttempts) {
                        delay(pollDelayMs)
                        val found = fetchGenerated(context, folderPath, materialNames, filePath)
                        if (found != null && !found.summary.isNullOrBlank()) return Outcome.Ready(found)
                        val status = AiService.getBattalionStatus(context, courseKey)
                        val skippedNoText = status?.job?.skipped
                            ?.any { it.reason == "no_text" } == true
                        if (skippedNoText) {
                            return Outcome.NoMaterial(NoMaterialReason.SCANNED_PDF)
                        }
                        if (status?.job?.done == true) {
                            val last = fetchGenerated(context, folderPath, materialNames, filePath)
                            return if (last != null && !last.summary.isNullOrBlank()) Outcome.Ready(last) else Outcome.Failed
                        }
                        if (AiService.backendUnavailable) return Outcome.Unavailable
                    }
                    return Outcome.Generating
                }
            }
        } catch (_: Exception) {
            Outcome.Failed
        }
    }

    /**
     * Atalho para a pré-geração: dispara o batalhão para a aula e
     * devolve o texto se já estiver pronto (sem poll longo — a fila
     * não espera a geração terminar; a próxima abertura lê do cache).
     */
    suspend fun triggerOnly(
        context: Context,
        folderPath: String,
        folderName: String,
        files: List<FileItem>
    ): Outcome {
        return try {
            val materialNames = files.filter { it.isPdf || it.isMarkdown }.map { it.name }
            val filePath = lessonFilePath(folderPath, files)
            val existing = fetchGenerated(context, folderPath, materialNames, filePath)
            if (existing != null && !existing.summary.isNullOrBlank()) return Outcome.Ready(existing)
            if (AiService.backendUnavailable) return Outcome.Unavailable
            val (source, noMaterialReason) = resolveSourceText(context, files)
            if (source == null) {
                return Outcome.NoMaterial(noMaterialReason ?: NoMaterialReason.NO_FILES)
            }
            when (
                AiService.startBattalion(
                    context, folderPath, folderPath, folderName,
                    listOf(AiService.BattalionPdf(source.name, "", source.text))
                )
            ) {
                AiService.TriggerResult.UNAVAILABLE -> Outcome.Unavailable
                AiService.TriggerResult.FAILED -> Outcome.Failed
                AiService.TriggerResult.ALREADY_DONE -> {
                    val again = fetchGenerated(context, folderPath, materialNames, filePath)
                    if (again != null && !again.summary.isNullOrBlank()) Outcome.Ready(again) else Outcome.Failed
                }
                AiService.TriggerResult.RUNNING,
                AiService.TriggerResult.STARTED -> Outcome.Generating
            }
        } catch (_: Exception) {
            Outcome.Failed
        }
    }
}
