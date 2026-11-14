package com.vovofit.app.data

import android.content.Context
import com.vovofit.app.VovoFitApp
import com.vovofit.app.util.SessionManager
import java.net.URLEncoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

/**
 * v1.0.4 — Cliente das rotas de IA da Meggy (descrição/resumo da aula).
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
 *     body {lessonPath, materialType:'resumo', fileName, content}
 *     → {ok:true, file} — grava o resumo na pasta da aula
 *     (`.gdi-resumos/<fileName>`), a "pasta de materiais".
 *
 *   Auth: todas exigem `Cookie: session=<sessão>` (401 sem ela).
 *   ATENÇÃO: o worker tem um portão de auth para TODO /api/... — um 401
 *   NÃO prova que a rota existe (até rota inexistente dá 401 sem
 *   sessão). Só um 404 COM sessão válida prova ausência da rota.
 *
 * DEPENDÊNCIA DE BACKEND (verificado 2026-11-14):
 *   A produção (educa.eu.org, worker pré-v2) NÃO tem nenhuma destas
 *   rotas (grep no worker de produção auditado: nenhum registro).
 *   Contra ela, as chamadas dão 404 com sessão válida → o app marca
 *   [backendUnavailable] e NÃO tenta de novo em loop; a aba Resumo
 *   mostra o fallback (nome provisório / em branco com motivo) e a
 *   geração fica pendente até o deploy da v2 na produção (ordem do
 *   Elton pendente). Ver REDESIGN_NOTES.md ("Descrição da aula").
 *   Para testar ao vivo contra staging-c/meuc, trocar
 *   VovoFitApp.AI_BASE_URL (1 linha).
 */
object AiService {

    data class BattalionPdf(val name: String, val url: String = "", val text: String)
    data class BattalionSkipped(val name: String, val reason: String)
    data class BattalionJob(
        val jobId: String,
        val done: Boolean,
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
     */
    @Volatile var backendUnavailable: Boolean = false
        private set

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
        if (VovoFitApp.AI_BASE_URL == VovoFitApp.BASE_URL) return@withContext false
        val sm = SessionManager.get(context)
        val user = sm.username
        val pass = sm.password
        if (user.isNullOrEmpty() || pass.isNullOrEmpty()) return@withContext false
        try {
            val formBody = "username=${URLEncoder.encode(user, "UTF-8")}" +
                "&password=<redacted> \"UTF-8\")}"
            val request = Request.Builder()
                .url("${VovoFitApp.AI_BASE_URL}/login")
                .post(formBody.toRequestBody("application/x-www-form-urlencoded".toMediaTypeOrNull()))
                .build()
            VovoFitApp.okHttpClient.newCall(request).execute().use { response ->
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

    private suspend fun execute(context: Context, request: Request): HttpResult =
        withContext(Dispatchers.IO) {
            val first = runCall(request)
            if (first.code != 401) return@withContext first
            // 401 → tenta login no host de IA (uma vez) e repete.
            if (!aiLogin(context)) return@withContext first
            val cookie = cookieFor(context)
            val retry = request.newBuilder().apply {
                if (!cookie.isNullOrBlank()) header("Cookie", "session=$cookie")
            }.build()
            runCall(retry)
        }

    private fun runCall(request: Request): HttpResult {
        return try {
            VovoFitApp.okHttpClient.newCall(request).execute().use { response ->
                val code = response.code
                if (code == 404) backendUnavailable = true
                if (code in 200..299) backendUnavailable = false
                HttpResult(code, response.body?.string())
            }
        } catch (_: Exception) {
            HttpResult(0, null)
        }
    }

    private suspend fun get(context: Context, path: String): HttpResult {
        val cookie = cookieFor(context)
        val request = Request.Builder()
            .url("${VovoFitApp.AI_BASE_URL}$path")
            .header("User-Agent", "VovoNative/1.0 (Android)")
            .apply {
                if (!cookie.isNullOrBlank()) header("Cookie", "session=$cookie")
            }
            .build()
        return execute(context, request)
    }

    private suspend fun postJson(context: Context, path: String, json: String): HttpResult {
        val cookie = cookieFor(context)
        val request = Request.Builder()
            .url("${VovoFitApp.AI_BASE_URL}$path")
            .post(json.toRequestBody("application/json".toMediaTypeOrNull()))
            .header("User-Agent", "VovoNative/1.0 (Android)")
            .apply {
                if (!cookie.isNullOrBlank()) header("Cookie", "session=$cookie")
            }
            .build()
        return execute(context, request)
    }

    // ───────── rotas ─────────

    /**
     * Lê o resumo gerado do cache ISA.
     * `key` = "<courseKey>/<pdfName>" — o MESMO nome enviado no POST.
     * Retorna o texto do resumo (Markdown) ou null (sem resumo ainda,
     * erro ou backend sem a rota).
     */
    suspend fun getSummary(context: Context, key: String): String? {
        if (backendUnavailable) return null
        val encoded = URLEncoder.encode(key, "UTF-8")
        val res = get(context, "/api/ai/summaries?key=$encoded")
        if (res.code != 200) return null
        return try {
            val json = JSONObject(res.body ?: return null)
            if (!json.optBoolean("ok", false)) return null
            json.optJSONObject("cached")?.optString("summary")?.takeIf { it.isNotBlank() }
        } catch (_: Exception) {
            null
        }
    }

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
                    processed = it.optInt("processed", 0),
                    total = it.optInt("total", 0),
                    skipped = skipped,
                    error = it.optString("error").takeIf { s -> s.isNotBlank() },
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
        val res = get(context, path)
        if (res.code != 200) return null
        return try {
            val json = JSONObject(res.body ?: return null)
            if (!json.optBoolean("ok", false)) return null
            json.optString("content").takeIf { it.isNotBlank() }
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
}
