package com.meggy.app.data

import android.content.Context
import com.meggy.app.MeggyApp
import com.meggy.app.util.SessionManager
import java.net.URLEncoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

/**
 * v2.7.6 — Cliente das rotas de IA da Meggy (descrição/resumo da aula).
 *
 * Contratos VERIFICADOS no worker v2.15.4 deployado em staging-c/meuc
 * (deploy-staging-c/worker.js + staging/modular/meggy/meggy-summaries.js).
 * Nada aqui foi inventado — cada rota, corpo e resposta abaixo existe
 * no worker; o que NÃO existe (na produção) é tratado como indisponível.
 *
 *   POST /api/ai/battalion
 *     body {courseKey, coursePath, lessonName, pdfs:[{name, url, text}]}
 *     → {ok, message, courseKey, pdfs: n,
 *        job:{jobId, module, total, processed, skipped:[{name, reason}],
 *             done, updatedAt, error}}
 *     O batalhão gera, por PDF: resumo + pílulas + questões (3 chamadas
 *     sequenciais por PDF). O job fica em KV (`battalion-job:<courseKey>`,
 *     TTL 7 dias); done=true SÓ com processed>0. Um job concluído NÃO
 *     re-roda (o worker retorna sem gerar); um job com 0 processados
 *     permite retry. Sem texto no PDF → skipped 'no_text' (o worker
 *     NÃO extrai texto de PDF no servidor — "Client must send pdf.text").
 *     pdfs vazio → o worker escaneia a pasta, mas sem texto tudo vira
 *     'no_text': o app SEMPRE manda o texto (transcrição MD primeiro,
 *     senão o texto extraído do PDF).
 *     courseKey = coursePath (a web passa os dois iguais).
 *
 *   GET /api/ai/battalion/status?courseKey=
 *     → {ok, processed: job.done, hasSummary, hasQuestions, date, job}
 *
 *   GET /api/ai/summaries?key=<courseKey>/<pdfName>
 *     → {ok:true, cached:{summary, lessonName, coursePath, outdated, ...},
 *        source:'kv'|'drive'} — o cache ISA do batalhão. A chave é
 *        `courseKey + '/' + pdfName`, com pdfName = o `name` enviado
 *        no POST do batalhão. O app lê com o MESMO nome que enviou.
 *
 *   GET /api/materials/load-from-folder?lessonPath=&materialType=resumo
 *     (sem fileName → discovery: o arquivo mais recente da pasta
 *     `.gdi-resumos/` da pasta da aula)
 *     → {ok:true, content, file, author} | {ok:false, reason:'not_found'}
 *
 *   POST /api/materials/save-in-folder
 *     body {lessonPath, materialType, fileName, content}
 *     → {ok:true, file} — grava o material na pasta da aula, a
 *     "pasta de materiais" (`.gdi-<tipo>s/<fileName>`). Tipos
 *     validos no worker: 'resumo' → `.gdi-resumos/`, 'questoes'
 *     → `.gdi-questoess/`, 'flashcard' → `.gdi-flashcards/`
 *     (Frente K: os tres sao gravados pelo [MaterialSaver]).
 *
 *   Auth: todas exigem `Cookie: session=<sessão>` (401 sem ela).
 *   ATENÇÃO: o worker tem um portão de auth para TODO /api/... — um 401
 *   NÃO prova que a rota existe (até rota inexistente dá 401 sem
 *   sessão). Só um 404 COM sessão válida prova ausência da rota.
 *
 * DEPENDÊNCIA DE BACKEND (audit de conexão 2026-11-15, corrigido):
 *   Contrato v2 no STAGING (decisão do Elton 2026-11-14 22:42):
 *   a IA aponta para https://staging-c.urso.workers.dev (a produção
 *   TEM as rotas antigas, mas o status do batalhão NÃO traz o objeto
 *   `job` — contra ela o app nunca completava a geração). O estado da
 *   IA (resumos, jobs, materials_meta) é o do SANDBOX (D1
 *   meggy-staging). /api/ai/subtitles NÃO existe em nenhum worker —
 *   a legenda continua só via .vtt/.srt que já exista na pasta. Se o
 *   staging responder 404 com sessão válida, o app marca
 *   [backendUnavailable] e NÃO tenta de novo em loop.
 */
object AiService {

    data class BattalionPdf(val name: String, val url: String = "", val text: String)
    data class BattalionSkipped(val name: String, val reason: String)
    data class BattalionJob(
        val jobId: String,
        val done: Boolean,
        /** R23 — o job TERMINOU (v2.15.6 P9): o poll pára aqui, mesmo
         *  com 0 processados. `done` só é true com processed>0, por
         *  isso um job terminado sem nada gerado nunca o punha a
         *  true e o poll girava até ao teto. */
        val finished: Boolean,
        val processed: Int,
        val total: Int,
        val skipped: List<BattalionSkipped>,
        val error: String?,
        val updatedAt: Long
    )

    data class BattalionStatus(
        val processed: Boolean,
        val hasSummary: Boolean,
        val hasQuestions: Boolean,
        val job: BattalionJob?
    )

    /** Resultado do gatilho do batalhão (uma tentativa). */
    enum class TriggerResult { STARTED, ALREADY_DONE, RUNNING, FAILED, UNAVAILABLE }

    /**
     * Verdadeiro quando o backend respondeu 404 com sessão válida numa
     * rota de IA (= backend sem os endpoints, ex. produção pré-v2).
     * Em memória (não persistido): zerado a cada abertura do app e em
     * qualquer 2xx de IA. Evita retentar em loop o que não existe.
     *
     * Frente R5A: um 404 de `load-from-folder` NÃO arma esta flag —
     * "ficheiro guardado em falta" é o caso normal de um material
     * nunca gerado, não "backend sem rotas" (ver [loadFromFolder]).
     * Um retry explícito do utilizador limpa a flag antes de tentar
     * de novo (ver [clearBackendUnavailable]).
     */
    /**
     * R21: o latch passou a ter TTL (10 min). Antes era pegajoso até
     * um retry explícito o limpar — e o único chamador de
     * [clearBackendUnavailable] era o PdfReader: um 404 transitório
     * ou mal-atribuído no Detail/Player desligava a IA para o resto
     * da sessão do processo, sem forma de recuperar. Agora o latch
     * expira sozinho passado o TTL (o getter devolve false) e volta
     * a armar-se se um 404 genuíno voltar. Leituras e escritas
     * existentes não mudam — só a semântica temporal.
     */
    @Volatile private var backendUnavailableAt: Long = 0L

    var backendUnavailable: Boolean
        get() = backendUnavailableAt != 0L &&
            System.currentTimeMillis() - backendUnavailableAt < BACKEND_LATCH_TTL_MS
        private set(value) {
            backendUnavailableAt = if (value) System.currentTimeMillis() else 0L
        }

    /** TTL do latch [backendUnavailable] (R21). */
    private const val BACKEND_LATCH_TTL_MS = 10L * 60L * 1000L

    /**
     * Frente R5A — saída do latch: um retry EXPLÍCITO do utilizador
     * (novo toque em "✨ Resumo" / "Gerar novamente") limpa a flag
     * antes de tentar de facto. A flag volta a armar-se sozinha se
     * um 404 genuíno de rota de IA voltar (ver [runCall]). R21: além
     * do gesto, o latch também expira sozinho ao fim do TTL (ver
     * [backendUnavailable]) — continua sem polling.
     */
    fun clearBackendUnavailable() {
        backendUnavailable = false
    }

    /** Guarda em memória contra POST duplo simultâneo do mesmo curso. */
    private val runningTriggers = mutableSetOf<String>()

    /** Job "rodando" = não concluído e atualizado há menos de 10 min. */
    private const val RUNNING_JOB_MAX_AGE_MS = 10L * 60L * 1000L

    @Synchronized
    fun tryBeginTrigger(courseKey: String): Boolean {
        if (runningTriggers.contains(courseKey)) return false
        runningTriggers.add(courseKey)
        return true
    }

    @Synchronized
    fun endTrigger(courseKey: String) {
        runningTriggers.remove(courseKey)
    }

    // ───────── baixo nível ─────────

    private data class HttpResult(val code: Int, val body: String?)

    private fun cookieFor(context: Context): String? {
        val sm = SessionManager.get(context)
        return sm.aiSessionCookie?.takeIf { it.isNotBlank() }
            ?: sm.sessionCookie?.takeIf { it.isNotBlank() }
    }

    /**
     * Login no host de IA com as credenciais guardadas (mesmo formulário
     * do ApiService.login). Só quando AI_BASE_URL != BASE_URL: no mesmo
     * host, a sessão principal já é a certa (e o refresh dela é papel
     * do validateOrReLogin, não daqui). Grava o cookie em aiSessionCookie.
     */
    private suspend fun aiLogin(context: Context): Boolean = withContext(Dispatchers.IO) {
        if (MeggyApp.AI_BASE_URL == MeggyApp.BASE_URL) return@withContext false
        val sm = SessionManager.get(context)
        val user = sm.username
        val pass = sm.password
        if (user.isNullOrEmpty() || pass.isNullOrEmpty()) return@withContext false
        try {
            val formBody = "username=${URLEncoder.encode(user, "UTF-8")}" +
                "&password=${URLEncoder.encode(pass, "UTF-8")}"
            val request = Request.Builder()
                .url("${MeggyApp.AI_BASE_URL}/login")
                .post(formBody.toRequestBody("application/x-www-form-urlencoded".toMediaTypeOrNull()))
                .build()
            MeggyApp.okHttpClient.newCall(request).execute().use { response ->
                if (response.code == 302 || response.code == 200) {
                    for (cookie in response.headers("Set-Cookie")) {
                        if (cookie.startsWith("session=")) {
                            sm.aiSessionCookie = cookie.substringAfter("session=").substringBefore(";")
                            return@withContext true
                        }
                    }
                }
                false
            }
        } catch (_: Exception) {
            false
        }
    }

    private suspend fun execute(
        context: Context,
        request: Request,
        latchOn404: Boolean = true
    ): HttpResult =
        withContext(Dispatchers.IO) {
            val first = runCall(request, latchOn404)
            if (first.code != 401) return@withContext first
            // 401 → tenta login no host de IA (uma vez) e repete.
            if (!aiLogin(context)) return@withContext first
            val cookie = cookieFor(context)
            val retry = request.newBuilder().apply {
                if (!cookie.isNullOrBlank()) header("Cookie", "session=$cookie")
            }.build()
            runCall(retry, latchOn404)
        }

    private fun runCall(request: Request, latchOn404: Boolean = true): HttpResult {
        return try {
            MeggyApp.okHttpClient.newCall(request).execute().use { response ->
                val code = response.code
                // Frente R5A: só um 404 de rota de IA genuína arma o
                // latch. Um 404 de `load-from-folder` (ficheiro em
                // falta — o caso normal) passa latchOn404=false e
                // nunca arma a flag.
                if (code == 404 && latchOn404) backendUnavailable = true
                if (code in 200..299) backendUnavailable = false
                HttpResult(code, response.body?.string())
            }
        } catch (_: Exception) {
            HttpResult(0, null)
        }
    }

    private suspend fun get(
        context: Context,
        path: String,
        latchOn404: Boolean = true
    ): HttpResult {
        val cookie = cookieFor(context)
        val request = Request.Builder()
            .url("${MeggyApp.AI_BASE_URL}$path")
            .header("User-Agent", "MeggyNative/2.7 (Android)")
            .apply {
                if (!cookie.isNullOrBlank()) header("Cookie", "session=$cookie")
            }
            .build()
        return execute(context, request, latchOn404)
    }

    private suspend fun postJson(
        context: Context,
        path: String,
        json: String,
        latchOn404: Boolean = true
    ): HttpResult {
        val cookie = cookieFor(context)
        val request = Request.Builder()
            .url("${MeggyApp.AI_BASE_URL}$path")
            .post(json.toRequestBody("application/json".toMediaTypeOrNull()))
            .header("User-Agent", "MeggyNative/2.7 (Android)")
            .apply {
                if (!cookie.isNullOrBlank()) header("Cookie", "session=$cookie")
            }
            .build()
        return execute(context, request, latchOn404)
    }

    // ───────── rotas ─────────

    /**
     * R22 — lê um campo de texto que pode vir com null JSON.
     * No Android, JSONObject.optString() devolve a STRING "null"
     * quando o campo está presente com valor null (o JSONObject.NULL
     * é convertido por toString) — foi assim que um pacote ISA só
     * com resumo (mindmap/questions a null no servidor) virou a
     * pílula literal "null" no ecrã. Este helper trata null JSON,
     * vazio e a string "null" como ausência. (O campo `questions`
     * já tinha a guarda isNull; summary/mindmap não tinham.)
     */
    private fun JSONObject.optText(name: String): String? {
        if (isNull(name)) return null
        val v = optString(name).trim()
        return v.takeIf { it.isNotEmpty() && !it.equals("null", ignoreCase = true) }
    }

    /**
     * Frente K — pacote gerado pelo batalhao para UM material
     * (uma chave `<courseKey>/<pdfName>` do cache ISA): o resumo
     * (`summary`, Markdown), as pilulas (`mindmap`, Markdown em
     * bullets) e as questoes (`questions`, array JSON — ou texto,
     * conforme o worker as guardou). Qualquer campo pode ser null
     * (o batalhao pode ter gerado so parte dos tres). O cache ISA
     * e a fonte partilhada no servidor; a pasta de materiais no
     * Drive (ver MaterialSaver, no pacote `util` de cada app)
     * e o espelho por aula.
     */
    data class GeneratedBundle(
        val summary: String?,
        val mindmap: String?,
        val questionsJson: String?,
        /**
         * R23 — o servidor marca o pacote como desatualizado
         * (battalionGenSummary: `outdated` no cache ISA, quando o
         * resumo detecta lei revogada/desatualizada). É o MESMO
         * sinal que faz o batalhão PULAR as questões
         * (battalionGenQuestions: isOutdatedLocal, mesmo padrão) —
         * por isso, com resumo-só + outdated=true, o motivo real
         * das questões em falta é este, e não um palpite do cliente.
         * Default false: pacotes antigos sem o campo não mudam.
         */
        val outdated: Boolean = false
    )

    /**
     * Le o pacote gerado do cache ISA (GET /api/ai/summaries?key=).
     * Retorna null quando nao ha nada gerado (ou erro / backend
     * sem a rota). O `summary` continua a ser o que decide
     * "pronto" (ver LessonDescription) — as pilulas/questoes
     * viajam junto no pacote para serem guardadas na pasta de
     * materiais.
     */
    suspend fun getGeneratedBundle(context: Context, key: String): GeneratedBundle? {
        if (backendUnavailable) return null
        val encoded = URLEncoder.encode(key, "UTF-8")
        val res = get(context, "/api/ai/summaries?key=$encoded")
        if (res.code != 200) return null
        return try {
            val json = JSONObject(res.body ?: return null)
            if (!json.optBoolean("ok", false)) return null
            val cached = json.optJSONObject("cached") ?: return null
            val summary = cached.optText("summary")
            val mindmap = cached.optText("mindmap")
            val questionsJson = if (!cached.isNull("questions")) {
                val arr = cached.optJSONArray("questions")
                if (arr != null) arr.toString()
                else cached.optText("questions")
            } else {
                null
            }
            if (summary == null && mindmap == null && questionsJson == null) return null
            GeneratedBundle(summary, mindmap, questionsJson, cached.optBoolean("outdated", false))
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Lê o resumo gerado do cache ISA.
     * `key` = "<courseKey>/<pdfName>" — o MESMO nome enviado no POST.
     * Retorna o texto do resumo (Markdown) ou null (sem resumo ainda,
     * erro ou backend sem a rota).
     */
    suspend fun getSummary(context: Context, key: String): String? =
        getGeneratedBundle(context, key)?.summary

    /** Estado do job do batalhão para o curso (ou null em erro/rede). */
    suspend fun getBattalionStatus(context: Context, courseKey: String): BattalionStatus? {
        if (backendUnavailable) return null
        val encoded = URLEncoder.encode(courseKey, "UTF-8")
        val res = get(context, "/api/ai/battalion/status?courseKey=$encoded")
        if (res.code != 200) return null
        return try {
            val json = JSONObject(res.body ?: return null)
            if (!json.optBoolean("ok", false)) return null
            val jobJson = json.optJSONObject("job")
            val job = jobJson?.let {
                val skipped = ArrayList<BattalionSkipped>()
                val arr: JSONArray? = it.optJSONArray("skipped")
                if (arr != null) {
                    for (i in 0 until arr.length()) {
                        val o = arr.getJSONObject(i)
                        skipped.add(BattalionSkipped(o.optString("name"), o.optString("reason")))
                    }
                }
                BattalionJob(
                    jobId = it.optString("jobId"),
                    done = it.optBoolean("done", false),
                    finished = it.optBoolean("finished", false),
                    processed = it.optInt("processed", 0),
                    total = it.optInt("total", 0),
                    skipped = skipped,
                    // R23 — optText, não optString: um `error` com
                    // null JSON virava a string "null" (mesmo bug
                    // da R22) e o motivo mostrado seria literal.
                    error = it.optText("error"),
                    updatedAt = it.optLong("updatedAt", 0L)
                )
            }
            BattalionStatus(
                processed = json.optBoolean("processed", false),
                hasSummary = json.optBoolean("hasSummary", false),
                hasQuestions = json.optBoolean("hasQuestions", false),
                job = job
            )
        } catch (_: Exception) {
            null
        }
    }

    /**
     * R23 — 4.ª fonte de questões: o banco unificado por aula.
     * GET /api/ai/question-bank/by-lesson?coursePath=&lessonName=
     * (item de worker especificado na R22 §2: devolve as questões
     * do banco cuja proveniência — coursePath + lessonName,
     * gravada no upsert — casa com a aula, no formato do
     * batalhão). A resposta pode vir como array nu `[...]` ou
     * como objeto `{ok:true, questions:[...]}`; devolve-se a
     * string do array, que os parsers actuais lêem sem mudança.
     * latchOn404=false: a rota pode ainda não existir no worker
     * (404 = "rota por construir", não "backend sem IA") — um
     * 404 aqui NUNCA arma [backendUnavailable]. Null = sem
     * questões no banco p/ esta aula (ou rota ausente/erro).
     * Nunca lança exceção.
     */
    suspend fun getQuestionsByLesson(
        context: Context,
        coursePath: String,
        lessonName: String
    ): String? {
        if (coursePath.isBlank() || lessonName.isBlank()) return null
        val path = "/api/ai/question-bank/by-lesson" +
            "?coursePath=${URLEncoder.encode(coursePath, "UTF-8")}" +
            "&lessonName=${URLEncoder.encode(lessonName, "UTF-8")}"
        val res = get(context, path, latchOn404 = false)
        if (res.code != 200) return null
        return try {
            val trimmed = (res.body ?: return null).trim()
            if (trimmed.isEmpty()) return null
            val arr = when {
                trimmed.startsWith("[") -> JSONArray(trimmed)
                trimmed.startsWith("{") -> {
                    val obj = JSONObject(trimmed)
                    if (!obj.optBoolean("ok", true)) return null
                    obj.optJSONArray("questions") ?: return null
                }
                else -> return null
            }
            if (arr.length() == 0) return null
            arr.toString()
        } catch (_: Exception) {
            null
        }
    }

    /** Resultado do POST /api/generation/enqueue (Frente R14B). */
    enum class GenerationEnqueueResult { QUEUED, EXISTS, RUNNING, DONE }

    /**
     * Frente R14B — enfileira a geração automática ao PLAY
     * (POST /api/generation/enqueue — contrato da Frente R14C, que
     * implementa a rota no worker; codificado contra o contrato).
     * Corpo: lessonPath (pasta da aula), videoPath (ficheiro do
     * vídeo), courseKey (pasta do curso = pai da pasta da aula),
     * source "play". Resposta: ok + status queued, exists, running
     * ou done. A idempotência é do servidor; o chamador (Player)
     * só dispara 1x por aula por sessão como primeira barreira.
     * Silencioso por desenho: null em qualquer falha ou rota
     * ausente (o worker antigo ainda não tem a rota — um 404 aqui
     * NÃO arma backendUnavailable, por isso latchOn404=false).
     * Nunca lança exceção.
     */
    suspend fun enqueueGeneration(
        context: Context,
        lessonPath: String,
        videoPath: String,
        courseKey: String
    ): GenerationEnqueueResult? {
        if (lessonPath.isBlank() || videoPath.isBlank()) return null
        return try {
            val body = JSONObject().apply {
                put("lessonPath", lessonPath)
                put("videoPath", videoPath)
                put("courseKey", courseKey)
                put("source", "play")
            }.toString()
            val res = postJson(context, "/api/generation/enqueue", body, latchOn404 = false)
            if (res.code != 200) return null
            val json = JSONObject(res.body ?: return null)
            if (!json.optBoolean("ok", false)) return null
            when (json.optString("status")) {
                "queued" -> GenerationEnqueueResult.QUEUED
                "exists" -> GenerationEnqueueResult.EXISTS
                "running" -> GenerationEnqueueResult.RUNNING
                "done" -> GenerationEnqueueResult.DONE
                else -> null
            }
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Dispara o batalhão para o curso. `pdfs` leva o TEXTO de cada
     * material (o worker não extrai texto de PDF — sem texto, o item
     * vira skipped 'no_text'). Não re-dispara se o job já estiver
     * concluído ou rodando (lê o status antes de postar).
     */
    suspend fun startBattalion(
        context: Context,
        courseKey: String,
        coursePath: String,
        lessonName: String,
        pdfs: List<BattalionPdf>
    ): TriggerResult {
        if (backendUnavailable) return TriggerResult.UNAVAILABLE
        if (pdfs.isEmpty()) return TriggerResult.FAILED
        // Guarda do worker: job concluído (processed>0) não re-roda;
        // job rodando não recebe um segundo POST (a web faz igual com
        // o Set _battalionRunning). Um job NÃO-concluído e ANTIGO
        // (sem atualização há mais de 10 min — a execução anterior
        // provavelmente morreu) PERMITE retry: o worker diz o mesmo
        // ("um job NÃO-done (0 processados) permite retry sempre").
        val status = getBattalionStatus(context, courseKey)
        if (status?.job?.done == true && (status.job.processed > 0)) {
            return TriggerResult.ALREADY_DONE
        }
        val job = status?.job
        val recentlyUpdated = job != null && !job.done && job.jobId.isNotBlank() &&
            job.updatedAt > 0L && (System.currentTimeMillis() - job.updatedAt) < RUNNING_JOB_MAX_AGE_MS
        if (recentlyUpdated) {
            return TriggerResult.RUNNING
        }
        if (!tryBeginTrigger(courseKey)) return TriggerResult.RUNNING
        try {
            val pdfsJson = JSONArray()
            for (p in pdfs) {
                pdfsJson.put(JSONObject().apply {
                    put("name", p.name)
                    put("url", p.url)
                    put("text", p.text)
                })
            }
            val body = JSONObject().apply {
                put("courseKey", courseKey)
                put("coursePath", coursePath)
                put("lessonName", lessonName)
                put("pdfs", pdfsJson)
            }.toString()
            val res = postJson(context, "/api/ai/battalion", body)
            if (res.code == 404) return TriggerResult.UNAVAILABLE
            if (res.code != 200) return TriggerResult.FAILED
            return try {
                val json = JSONObject(res.body ?: return TriggerResult.FAILED)
                if (json.optBoolean("ok", false)) TriggerResult.STARTED else TriggerResult.FAILED
            } catch (_: Exception) {
                TriggerResult.FAILED
            }
        } finally {
            endTrigger(courseKey)
        }
    }

    /**
     * Lê o resumo da pasta da aula (`.gdi-resumos/`, discovery: o
     * arquivo mais recente do tipo). Retorna o conteúdo ou null.
     *
     * Frente R5A: um 404 aqui (ficheiro em falta — o caso normal de
     * um material nunca gerado) NÃO arma [backendUnavailable]: a
     * chamada passa latchOn404=false. Só as rotas de IA genuínas
     * (POST /api/ai, /api/ai/ocr, /api/ai/summaries POST,
     * /api/ai/battalion, save-in-folder) podem armar a flag.
     */
    suspend fun loadFromFolder(
        context: Context,
        lessonPath: String,
        materialType: String = "resumo"
    ): String? {
        if (backendUnavailable) return null
        val path = "/api/materials/load-from-folder" +
            "?lessonPath=${URLEncoder.encode(lessonPath, "UTF-8")}" +
            "&materialType=${URLEncoder.encode(materialType, "UTF-8")}"
        // Frente R5A: 404 = "ficheiro em falta", não "backend sem
        // rotas" — nunca arma backendUnavailable (ver runCall).
        val res = get(context, path, latchOn404 = false)
        if (res.code != 200) return null
        return try {
            val json = JSONObject(res.body ?: return null)
            if (!json.optBoolean("ok", false)) return null
            json.optText("content")
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Grava o resumo na pasta da aula (`.gdi-resumos/<fileName>`).
     * Best-effort: falha silenciosa (a fonte da verdade continua
     * sendo o cache ISA + o cache local). `fileName` segue o padrão
     * da web: "<username>_<Aula>.md".
     */
    suspend fun saveToFolder(
        context: Context,
        lessonPath: String,
        fileName: String,
        content: String,
        materialType: String = "resumo"
    ): Boolean {
        if (backendUnavailable) return false
        val body = JSONObject().apply {
            put("lessonPath", lessonPath)
            put("materialType", materialType)
            put("fileName", fileName)
            put("content", content)
        }.toString()
        val res = postJson(context, "/api/materials/save-in-folder", body)
        if (res.code != 200) return false
        return try {
            JSONObject(res.body ?: return false).optBoolean("ok", false)
        } catch (_: Exception) {
            false
        }
    }

    // ───────── Frente J — resumo de UM pdf (leitor de PDF) ─────────
    //
    // Contratos VERIFICADOS no worker vivo (deploy-staging-c/worker.js):
    //   POST /api/ai {message, messages:[], kind:"resumo"}
    //     → {ok:true, response, provider, model, latency_ms, remaining}
    //     Rota em worker.js:6274; handler handleAi em 14231; a resposta
    //     é montada em 14876. `kind:"resumo"` é lido em 14591 e roteia
    //     para o modelo de resumo. É o MESMO endpoint que a web usa
    //     para o resumo de cada PDF (staging/modular/gdi-meggy.js:552,
    //     callIsa → POST /api/ai {message, messages:[]}); a web NÃO
    //     manda `kind`, mas o worker aceita-o (14591) — mandamos para
    //     não depender da detecção por palavra-chave.
    //   POST /api/ai/ocr {image, page, totalPages}
    //     → {ok:true, response, model} — rota 6281, handler 14092.
    //   POST /api/ai/summaries {key, summary, lessonName}
    //     → {ok:true} — rota 6291, handler handleIsaCacheSave 1550;
    //     grava em KV ('summary:'+key, 1590) e no Drive. É a MESMA
    //     chave que getSummary lê — o detalhe da aula encontra o
    //     resumo gerado aqui sem regenerar.
    //   POST /api/materials/save-in-folder {lessonPath, materialType,
    //     fileName, content} — já embrulhado em saveToFolder (acima);
    //     grava o resumo na pasta `.gdi-resumos/` da aula (a "pasta
    //     de materiais" — a Frente K é dona da UX/listagem dela; aqui
    //     só se REUTILIZA a gravação existente).
    // O worker NÃO extrai texto de PDF no servidor (ver doc do
    // batalhão no topo): o app envia o texto que JÁ extrai com
    // pdfbox (PdfReaderActivity) ou, sem camada de texto, o texto
    // lido por OCR (POST /api/ai/ocr) a partir das páginas
    // renderizadas. Nenhum endpoint novo foi inventado.

    /** Resultado da geração de resumo de um PDF via POST /api/ai. */
    sealed class PdfSummaryResult {
        data class Ok(val text: String) : PdfSummaryResult()
        /** Backend sem as rotas de IA (404 com sessão válida). */
        object Unavailable : PdfSummaryResult()
        /** Limite de 30 mensagens/hora do /api/ai (HTTP 429). */
        object RateLimited : PdfSummaryResult()
        /** Falha de rede/servidor ou resposta inválida. */
        object Failed : PdfSummaryResult()
    }

    /**
     * Gera um resumo (Markdown) a partir do `prompt` completo
     * (prompt rico da web + texto do PDF — ver PdfReaderActivity).
     * Síncrono: o /api/ai devolve o texto na resposta (ao contrário
     * do batalhão, que é um job assíncrono por curso — pesado demais
     * para um botão no leitor e sem courseKey conhecida aqui).
     */
    suspend fun generatePdfSummary(context: Context, prompt: String): PdfSummaryResult {
        if (backendUnavailable) return PdfSummaryResult.Unavailable
        val body = JSONObject().apply {
            put("message", prompt)
            put("messages", JSONArray())
            put("kind", "resumo")
        }.toString()
        val res = postJson(context, "/api/ai", body)
        if (res.code == 404) return PdfSummaryResult.Unavailable
        if (res.code == 429) return PdfSummaryResult.RateLimited
        if (res.code != 200) return PdfSummaryResult.Failed
        return try {
            val json = JSONObject(res.body ?: return PdfSummaryResult.Failed)
            if (!json.optBoolean("ok", false)) return PdfSummaryResult.Failed
            val text = json.optString("response").takeIf { it.isNotBlank() }
                ?: return PdfSummaryResult.Failed
            PdfSummaryResult.Ok(text)
        } catch (_: Exception) {
            PdfSummaryResult.Failed
        }
    }

    /**
     * OCR de uma página do PDF renderizada (JPEG em base64).
     * POST /api/ai/ocr — o worker aceita base64 puro ou data-URL
     * (14092) e devolve {ok, response} com o texto transcrito.
     * Devolve o texto ou null (falha / sem texto na página).
     */
    suspend fun ocrPageImage(
        context: Context,
        imageB64: String,
        page: Int,
        totalPages: Int
    ): String? {
        if (backendUnavailable) return null
        val body = JSONObject().apply {
            put("image", imageB64)
            put("page", page)
            put("totalPages", totalPages)
        }.toString()
        val res = postJson(context, "/api/ai/ocr", body)
        if (res.code != 200) return null
        return try {
            val json = JSONObject(res.body ?: return null)
            if (!json.optBoolean("ok", false)) return null
            json.optString("response").takeIf { it.isNotBlank() }
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Grava o resumo no cache ISA (POST /api/ai/summaries).
     * `key` = "<pastaDaAula>/<nomeDoPdf>" — a MESMA chave que
     * [getSummary] lê. Best-effort: false não bloqueia a exibição.
     */
    suspend fun saveSummary(
        context: Context,
        key: String,
        summary: String,
        lessonName: String
    ): Boolean {
        if (backendUnavailable) return false
        val body = JSONObject().apply {
            put("key", key)
            put("summary", summary)
            put("lessonName", lessonName)
        }.toString()
        val res = postJson(context, "/api/ai/summaries", body)
        if (res.code != 200) return false
        return try {
            JSONObject(res.body ?: return false).optBoolean("ok", false)
        } catch (_: Exception) {
            false
        }
    }
}
