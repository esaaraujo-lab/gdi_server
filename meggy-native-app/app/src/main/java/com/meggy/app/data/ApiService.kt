package com.meggy.app.data

import android.content.Context
import com.meggy.app.MeggyApp
import com.meggy.app.util.SessionManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.URLEncoder

/**
 * R19B (P1) — resultado tipado de [ApiService.listFolder] /
 * [ApiService.listFolderById]. O null único morreu: ele escondia dois
 * casos com tratamento oposto — sessão expirada (bounce para o login,
 * depois de tentar o re-login) e falha transitória (erro + retry, o
 * destino fica aberto e NUNCA faz bounce). Ver DIAGNOSIS R19A §4.
 *
 *  • [Ok] — listagem OK. Pode ser parcial: uma falha numa página > 0
 *    retorna o que já foi acumulado em vez de derrubar a tela.
 *  • [SessionExpired] — HTTP 401/403, corpo HTML de login, ou 200
 *    com corpo de texto de sessão ("Session Expired" / "Invalid User",
 *    R29: o portão do worker devolve 200 + texto quando a sessão
 *    expira por tempo, e o JSONObject desse texto lançava exceção —
 *    caía em Transient e nunca fazia bounce nem re-login).
 *  • [Transient] — excepção de rede/timeout, outro não-2xx (ex.: 5xx),
 *    corpo nulo ou JSON inválido. NUNCA faz bounce.
 */
sealed class FolderResult {
    /** Listagem OK (ver [FolderResult] — pode ser parcial). */
    data class Ok(val files: List<FileItem>) : FolderResult()

    /** Sessão expirada: HTTP 401/403 ou corpo HTML de login. */
    object SessionExpired : FolderResult()

    /** Falha transitória (rede/timeout/servidor) — nunca faz bounce. */
    object Transient : FolderResult()

    /** A lista quando [Ok], null nos outros casos. */
    val filesOrNull: List<FileItem>? get() = (this as? Ok)?.files

    /** A lista quando [Ok], vazia nos outros casos (chamadores best-effort). */
    fun orEmpty(): List<FileItem> = filesOrNull ?: emptyList()
}

/**
 * R21 — resultado tipado da validação de sessão no arranque.
 *
 *  • [VALID] — a sessão responde, ou o re-login silencioso resultou.
 *  • [INVALID] — sessão provada expirada E sem credenciais/re-login.
 *  • [UNKNOWN] — falha transitória (rede/timeout/5xx/quota): NÃO se
 *    sabe se a sessão é válida; nunca deve mandar o usuário para o
 *    login (era o defeito do Splash pré-R21: quota esgotada ou rede
 *    caída no arranque = bounce para o login com a sessão boa).
 */
enum class SessionCheck { VALID, INVALID, UNKNOWN }

class ApiService(private val context: Context) {
    
    private val sessionManager get() = SessionManager.get(context)
    
    suspend fun login(username: String, password: String): Boolean {
        val formBody = "username=${java.net.URLEncoder.encode(username, "UTF-8")}" +
                       "&password=${java.net.URLEncoder.encode(password, "UTF-8")}"
        
        val request = Request.Builder()
            .url("${MeggyApp.BASE_URL}/login")
            .post(formBody.toRequestBody("application/x-www-form-urlencoded".toMediaTypeOrNull()))
            .build()
        
        return try {
            // R21: .use{} — a resposta (e o corpo por consumir nos
            // caminhos de erro) passa a ser sempre fechada.
            MeggyApp.okHttpClient.newCall(request).execute().use { response ->
            if (response.code == 302 || response.code == 200) {
                val cookies = response.headers("Set-Cookie")
                for (cookie in cookies) {
                    if (cookie.startsWith("session=")) {
                        val sessionValue = cookie.substringAfter("session=").substringBefore(";")
                        sessionManager.sessionCookie = sessionValue
                        sessionManager.username = username
                        return true
                    }
                }
            }
            false
            }
        } catch (e: IOException) {
            false
        }
    }
    
    // ★ v1.0.8: POST para o PATH COMPLETO. OkHttp faz o encoding correto (%20).
    // ★ v2.7.7 (diagnóstico listagem): pagina TODAS as páginas.
    // Antes: só page_index 0 / page_token null — qualquer pasta com mais
    // de 100 itens (pageSize do worker, files_list_page_size: 100) perdia
    // o resto em silêncio, pastas inclusive. O worker retorna
    // nextPageToken no TOPO do JSON (não dentro de data); a próxima
    // página usa esse token (page_index é só ecoado como curPageIndex).
    // Travas: no máximo `maxPages` páginas e parada se o token repetir.
    // R19B (P1): falha na página 0 retorna um FolderResult tipado —
    // SessionExpired (401/403 ou HTML de login) ou Transient (rede/
    // timeout, outro não-2xx, corpo nulo, JSON inválido). Falha numa
    // página posterior retorna o que já foi acumulado (Ok parcial).
    suspend fun listFolder(fullPath: String, maxPages: Int = 20): FolderResult {
        // Ronda 13 Frente C — caminho por ID ("by-id:<folderId>"): a
        // listagem vai para o sandbox (POST /api/drive/by-id), nao
        // para a producao (o router dela so aceita /<idx>:/...).
        // Vale p/ TODOS os chamadores (detalhe, home, player,
        // CrossFolderPlaylist, leitores): o prefixo nunca e um
        // caminho de producao valido. Sem prefixo, tudo igual.
        folderIdOfByIdPath(fullPath)?.let { return listFolderById(it, maxPages) }
        // Garantir trailing slash
        val path = if (fullPath.endsWith("/")) fullPath else "$fullPath/"

        val result = mutableListOf<FileItem>()
        var pageToken: String? = null
        var pageIndex = 0
        while (pageIndex < maxPages) {
            val jsonBody = JSONObject().apply {
                put("id", "")
                put("type", "folder")
                put("password", "")
                put("page_token", if (pageToken == null) JSONObject.NULL else pageToken)
                put("page_index", pageIndex)
            }.toString()

            val request = Request.Builder()
                .url("${MeggyApp.BASE_URL}$path")
                .post(jsonBody.toRequestBody("application/json".toMediaTypeOrNull()))
                .header("Cookie", "session=${sessionManager.sessionCookie ?: ""}")
                .build()

            // R21: .use{} fecha a resposta em todos os caminhos
            // (erros devolviam sem consumir o corpo — fuga de ligações
            // do pool). Os `break` internos viram `return@use null`
            // (break não é permitido dentro do lambda do use) e o
            // chamador trata null como "parar a paginação".
            val page: Pair<List<FileItem>, String?>? = try {
                MeggyApp.okHttpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    // R19B (P1): 401/403 = sessão expirada;
                    // qualquer outro não-2xx (ex.: 5xx) = falha
                    // transitória — nunca faz bounce.
                    if (pageIndex == 0) {
                        return if (response.code == 401 || response.code == 403) {
                            FolderResult.SessionExpired
                        } else {
                            FolderResult.Transient
                        }
                    }
                    return@use null
                }
                val body = response.body?.string()
                if (body == null) {
                    // R19B (P1): corpo nulo = falha transitória.
                    if (pageIndex == 0) return FolderResult.Transient
                    return@use null
                }

                // ★ v1.0.8: verificar se resposta é HTML (login redirect) em vez de JSON
                if (body.trimStart().startsWith("<!DOCTYPE") || body.trimStart().startsWith("<html")) {
                    // R19B (P1): HTML de login = sessão expirada.
                    if (pageIndex == 0) return FolderResult.SessionExpired
                    return@use null
                }

                // R29 — defesa contra sessão expirada devolvida como
                // 200 + texto ("Session Expired!" / "Invalid User!"):
                // o portão do worker responde 200 nesses dois casos e
                // o JSONObject do texto lançava exceção → Transient →
                // toast para sempre, sem bounce nem re-login. Só estes
                // dois textos viram SessionExpired — qualquer outro
                // corpo estranho continua Transient (o JSONObject
                // abaixo lança e o catch classifica como Transient).
                // Página 0 = SessionExpired; páginas > 0 = lista
                // parcial acumulada (mesmo padrão do HTML de login).
                if (isSessionExpiredText(body)) {
                    if (pageIndex == 0) return FolderResult.SessionExpired
                    return@use null
                }

                val json = JSONObject(body)
                // v2.7.11 — CAUSA RAIZ DO MONOGRAMA: o código antigo
                // montava o FileItem À MÃO e descartava o thumbnailLink
                // (o worker retorna thumbnailLink — fields pede o campo).
                // Sem thumb, launchPlayer() recebia null, addRecent()
                // nunca gravava thumb nenhuma e o card caía no monograma.
                // FileItem.fromJson() lê thumbnailLink + aplica o fallback
                // drive.google.com/thumbnail?id=<id> quando o campo falta.
                val files = json.optJSONObject("data")?.optJSONArray("files")
                val items = mutableListOf<FileItem>()
                if (files != null) {
                    for (i in 0 until files.length()) {
                        // R21: parse por elemento — um item malformado
                        // já não deita fora a pasta inteira (Models.kt).
                        files.optJSONObject(i)?.let { obj ->
                            runCatching { FileItem.fromJson(obj) }.getOrNull()
                        }?.let { items.add(it) }
                    }
                }
                val next = if (json.isNull("nextPageToken")) null
                    else json.optString("nextPageToken").takeIf { it.isNotBlank() }
                items to next
                }
            } catch (e: Exception) {
                // R19B (P1): excepção de rede/timeout = falha
                // transitória — nunca faz bounce.
                if (pageIndex == 0) return FolderResult.Transient
                break
            }
            if (page == null) break
            result.addAll(page.first)
            val next = page.second
            if (next == null || next == pageToken) break
            pageToken = next
            pageIndex++
        }
        return FolderResult.Ok(result)
    }
    
    /**
     * Onda 2 — GET /api/featured-courses (rota real do worker v2,
     * handleFeaturedList): cursos em destaque do admin, com
     * `cover_url` a partir da v2.15.6 (parse defensivo em
     * FeaturedCourse.fromJson — null quando ausente). Best-effort e
     * silencioso: null em qualquer falha (rede/auth/servidor sem a
     * rota) — a UI cai para a thumb do Drive e depois para a capa
     * gerada. Não inventa endpoint nem muda BASE_URL.
     */
    suspend fun getFeaturedCourses(): List<FeaturedCourse>? {
        val request = Request.Builder()
            .url("${MeggyApp.BASE_URL}/api/featured-courses")
            .header("Cookie", "session=${sessionManager.sessionCookie ?: ""}")
            .build()
        return try {
            // R21: .use{} — idem (corpo por fechar nos erros).
            MeggyApp.okHttpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return null
                val body = response.body?.string() ?: return null
                val json = JSONObject(body)
                if (!json.optBoolean("ok", false)) return null
                FeaturedCourse.parseList(json.optJSONArray("courses"))
            }
        } catch (_: Exception) {
            null
        }
    }

    /**
     * R21 — totais REAIS de aulas por curso: GET /api/courses/unified
     * (a mesma fonte dos cartões da web desde a v2.15.44; o `total`
     * de cada item kind='course' é o nº de pastas de aula do curso
     * no D1/fallback do worker). Retorna mapa chave normalizada →
     * total (> 0), ou null em qualquer falha (rede/auth/rota) — os
     * chamadores mantêm a contagem local, nunca inventam números.
     * Cache de processo de 5 min, partilhado por todas as instâncias
     * (Home/Minha Lista/Detalhe chamam sem custo repetido).
     */
    suspend fun getUnifiedCourseTotals(): Map<String, Int>? {
        val now = System.currentTimeMillis()
        unifiedTotalsCache?.let { cached ->
            if (now - unifiedTotalsAt < UNIFIED_TOTALS_TTL_MS) return cached
        }
        val request = Request.Builder()
            .url("${MeggyApp.BASE_URL}/api/courses/unified")
            .header("Cookie", "session=${sessionManager.sessionCookie ?: ""}")
            .build()
        return try {
            val parsed = MeggyApp.okHttpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return null
                val body = response.body?.string() ?: return null
                val json = JSONObject(body)
                if (!json.optBoolean("ok", false)) return null
                val items = json.optJSONArray("items") ?: return null
                val out = HashMap<String, Int>()
                for (i in 0 until items.length()) {
                    val item = items.optJSONObject(i) ?: continue
                    if (item.optString("kind") != "course") continue
                    val path = item.optString("coursePath")
                    val total = item.optInt("total", 0)
                    if (path.isNotBlank() && total > 0) {
                        out[normalizeCourseKey(path)] = total
                    }
                }
                out
            }
            unifiedTotalsCache = parsed
            unifiedTotalsAt = now
            parsed
        } catch (_: Exception) {
            null
        }
    }

    // ── Ronda 10 Frente B: drives do admin ──

    /**
     * Ronda 13 Frente C — GET /api/admin-drives (SANDBOX, ver
     * [SANDBOX_BASE_URL]): drives do admin + os 16 fixos como
     * registros gerenciados (a Home usa a resposta como fonte de verdade).
     * Best-effort e silencioso: null em qualquer falha — a Home cai
     * para DriveItem.ALL e a tela "Gerenciar drives" mostra "funcao
     * indisponivel". O admin ve TODOS os drives que criou, em
     * qualquer APK (o filtro por targetApps e da Home).
     */
    suspend fun getAdminDrives(): List<AdminDrive>? {
        val (code, body) = sandboxCall("/api/admin-drives", null)
        if (code !in 200..299 || body == null) return null
        return try {
            val json = JSONObject(body)
            if (!json.optBoolean("ok", false)) return null
            AdminDrive.parseList(json.optJSONArray("drives"))
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Ronda 13 Frente C — POST /api/admin/admin-drives/add
     * {driveId, name, targetApps[], coverUrl?, subCoverUrl?,
     * subfolderCovers?} (SANDBOX, ver [SANDBOX_BASE_URL]). So
     * ADMIN_USERS no servidor (403 a nao-admins); erro legivel em
     * pt-BR. Re-adicionar o mesmo driveId faz upsert no servidor
     * (atualiza sem duplicar).
     */
    suspend fun addAdminDrive(
        driveId: String,
        name: String,
        targetApps: List<String>,
        coverUrl: String?,
        subCoverUrl: String?,
        subfolderCovers: Map<String, String>
    ): AdminDriveResult {
        val body = JSONObject().apply {
            put("driveId", driveId)
            put("name", name)
            put("targetApps", JSONArray(targetApps))
            if (coverUrl != null) put("coverUrl", coverUrl)
            if (subCoverUrl != null) put("subCoverUrl", subCoverUrl)
            if (subfolderCovers.isNotEmpty()) {
                val covers = JSONObject()
                for ((path, url) in subfolderCovers) covers.put(path, url)
                put("subfolderCovers", covers)
            }
        }.toString()
        val (code, respBody) = sandboxCall("/api/admin/admin-drives/add", body)
        if (code == 0) return AdminDriveResult.Error(
            "Não foi possível salvar. Verifique a conexão e tente novamente.")
        return adminPostResult(code, respBody)
    }

    /** Ronda 13 Frente C — POST /api/admin/admin-drives/delete {id}
     * (SANDBOX). Apaga SO o registro D1 — nunca a pasta no Drive. */
    suspend fun deleteAdminDrive(id: Long): AdminDriveResult {
        val body = JSONObject().apply { put("id", id) }.toString()
        val (code, respBody) = sandboxCall("/api/admin/admin-drives/delete", body)
        if (code == 0) return AdminDriveResult.Error(
            "Não foi possível remover. Verifique a conexão e tente novamente.")
        return adminPostResult(code, respBody)
    }

    /**
     * Ronda 13 Frente C — POST /api/admin/admin-drives/update {id,
     * name?, targetApps?, coverUrl?, subCoverUrl?, subfolderCovers?}
     * (SANDBOX; so ADMIN_USERS, 403 a nao-admins). A tela "Gerenciar
     * drives" manda TODOS os campos do formulario: capa / sub-capa
     * vazias vao como null JSON e LIMPAM a capa no servidor (o update
     * e parcial no servidor — so os campos presentes mudam).
     */
    suspend fun updateAdminDrive(
        id: Long,
        name: String,
        targetApps: List<String>,
        coverUrl: String?,
        subCoverUrl: String?,
        subfolderCovers: Map<String, String>
    ): AdminDriveResult {
        val body = JSONObject().apply {
            put("id", id)
            put("name", name)
            put("targetApps", JSONArray(targetApps))
            if (coverUrl != null) put("coverUrl", coverUrl)
            else put("coverUrl", JSONObject.NULL)
            if (subCoverUrl != null) put("subCoverUrl", subCoverUrl)
            else put("subCoverUrl", JSONObject.NULL)
            val covers = JSONObject()
            for ((path, url) in subfolderCovers) covers.put(path, url)
            put("subfolderCovers", covers)
        }.toString()
        val (code, respBody) = sandboxCall("/api/admin/admin-drives/update", body)
        if (code == 0) return AdminDriveResult.Error(
            "Não foi possível atualizar. Verifique a conexão e tente novamente.")
        return adminPostResult(code, respBody)
    }

    /**
     * Ronda 13 Frente C — GET /api/me → {ok, user, isAdmin}: fonte de
     * verdade do papel de admin (SANDBOX, ver [SANDBOX_BASE_URL]).
     * Em 404/erro/rede, FALLBACK PROVISORIO VERIFICADO (nao
     * inventado): o username salvo e exatamente o da sessao e o
     * servidor so aceita como admin ADMIN_USERS =
     * ['elton@araujo.eu.org'] — username == esse email ⇒ admin. O
     * servidor continua a ser o executor: os POSTs admin dao 403 a
     * nao-admins, por isso o fallback so decide o que a UI MOSTRA.
     * O resultado e salvo em SessionManager com o username a que
     * diz respeito (revalidado quando o username muda).
     */
    suspend fun checkAdmin(): Boolean {
        val user = sessionManager.username
        val fromServer: Boolean? = try {
            val (code, body) = sandboxCall("/api/me", null)
            if (code !in 200..299 || body == null) null
            else {
                val json = JSONObject(body)
                if (!json.optBoolean("ok", true)) null
                else json.optBoolean("isAdmin", false)
            }
        } catch (_: Exception) {
            null
        }
        val admin = fromServer ?: (user == ADMIN_FALLBACK_EMAIL)
        sessionManager.cacheIsAdmin(user, admin)
        return admin
    }

    /**
     * Ronda 10 Frente B — traduz o HTTP + corpo de um POST admin num
     * AdminDriveResult. 404 = rota inexistente (Unavailable); 401 =
     * sessão expirada; 403 = não-admin; 2xx com ok:false = mensagem
     * "error" do servidor quando a houver.
     */
    private fun adminPostResult(code: Int, body: String?): AdminDriveResult {
        if (code == 404) return AdminDriveResult.Unavailable
        if (code == 401) return AdminDriveResult.Error("Sessão expirada. Entre novamente.")
        if (code == 403) return AdminDriveResult.Error("Só o administrador pode gerenciar drives.")
        if (code !in 200..299) {
            return AdminDriveResult.Error("Não foi possível concluir. Verifique a conexão e tente novamente.")
        }
        val json = try { JSONObject(body ?: "") } catch (_: Exception) { null }
        if (json == null || !json.optBoolean("ok", false)) {
            val serverMsg = json?.optString("error", "")?.takeIf { it.isNotBlank() }
            return AdminDriveResult.Error(
                serverMsg ?: "Não foi possível concluir. Verifique a conexão e tente novamente."
            )
        }
        return AdminDriveResult.Success
    }

    // ── Ronda 13 Frente C: sandbox + listagem por ID ──

    private data class SandboxResult(val code: Int, val body: String?)

    /**
     * Cookie p/ o sandbox: primeiro o da sessao de IA (o login no
     * staging-c ja feito pelo AiService), senao o da producao (que
     * o sandbox rejeita com 401 — ai o sandboxLogin abaixo entra).
     */
    private fun sandboxCookie(): String? {
        val sm = sessionManager
        return sm.aiSessionCookie?.takeIf { it.isNotBlank() }
            ?: sm.sessionCookie?.takeIf { it.isNotBlank() }
    }

    /**
     * Login no sandbox com as credenciais salvas (mesmo padrao do
     * AiService.aiLogin; o cookie fica em aiSessionCookie). So quando
     * SANDBOX_BASE_URL != BASE_URL. Roda em Dispatchers.IO.
     */
    private suspend fun sandboxLogin(): Boolean = withContext(Dispatchers.IO) {
        if (SANDBOX_BASE_URL == MeggyApp.BASE_URL) return@withContext false
        val sm = sessionManager
        val user = sm.username
        val pass = sm.password
        if (user.isNullOrEmpty() || pass.isNullOrEmpty()) return@withContext false
        try {
            val formBody = "username=${java.net.URLEncoder.encode(user, "UTF-8")}" +
                "&password=${java.net.URLEncoder.encode(pass, "UTF-8")}"
            val request = Request.Builder()
                .url("$SANDBOX_BASE_URL/login")
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

    /**
     * Uma chamada ao sandbox (GET sem json, POST com json): 401
     * -> login no sandbox (uma vez) e repeticao. code 0 = falha de
     * rede (sem resposta). Roda em Dispatchers.IO — os chamadores da
     * Frente B (AdminDrivesActivity, SettingsActivity) correm no Main
     * e o OkHttp bloqueante da Ronda 10 rebentava ai com
     * NetworkOnMainThreadException (apanhada pelo try/catch e lida
     * como "funcao indisponivel"); aqui a rede nunca corre no Main.
     */
    private suspend fun sandboxCall(path: String, json: String?): SandboxResult =
        withContext(Dispatchers.IO) {
            fun build(cookie: String?): Request {
                val b = Request.Builder().url("$SANDBOX_BASE_URL$path")
                if (json != null) {
                    b.post(json.toRequestBody("application/json".toMediaTypeOrNull()))
                }
                if (!cookie.isNullOrBlank()) b.header("Cookie", "session=$cookie")
                return b.build()
            }
            fun call(req: Request): SandboxResult {
                return try {
                    MeggyApp.okHttpClient.newCall(req).execute().use { response ->
                        SandboxResult(response.code, response.body?.string())
                    }
                } catch (_: Exception) {
                    SandboxResult(0, null)
                }
            }
            val first = call(build(sandboxCookie()))
            if (first.code != 401) return@withContext first
            if (!sandboxLogin()) return@withContext first
            call(build(sandboxCookie()))
        }

    /**
     * Ronda 13 Frente C — POST /api/drive/by-id {folderId, pageToken?,
     * pageIndex?} (SANDBOX): lista a pasta pelo ID, com o MESMO
     * envelope do listFolder ({data:{files}, nextPageToken}) e a mesma
     * paginacao (maxPages; FolderResult na falha da pagina 0 —
     * SessionExpired = sessao expirada, Transient = falha de rede/
     * servidor ou pasta inexistente; o chamador decide; 404 da pasta
     * vem como ok:false e cai em Transient, nunca em bounce). O `link`
     * de cada arquivo
     * e cunhado pelo sandbox (ver fileBaseUrl no DetailActivity).
     */
    suspend fun listFolderById(folderId: String, maxPages: Int = 20): FolderResult {
        val result = mutableListOf<FileItem>()
        var pageToken: String? = null
        var pageIndex = 0
        while (pageIndex < maxPages) {
            val jsonBody = JSONObject().apply {
                put("folderId", folderId)
                put("pageToken", if (pageToken == null) JSONObject.NULL else pageToken)
                put("pageIndex", pageIndex)
            }.toString()
            val (code, body) = sandboxCall("/api/drive/by-id", jsonBody)
            if (code !in 200..299 || body == null) {
                // R19B (P1): 401/403 = sessão expirada; código 0
                // (falha de rede, sem resposta), outro não-2xx ou
                // corpo nulo = falha transitória.
                if (pageIndex == 0) {
                    return if (code == 401 || code == 403) FolderResult.SessionExpired
                    else FolderResult.Transient
                }
                break
            }
            if (body.trimStart().startsWith("<!DOCTYPE") || body.trimStart().startsWith("<html")) {
                // R19B (P1): HTML de login = sessão expirada.
                if (pageIndex == 0) return FolderResult.SessionExpired
                break
            }
            // R29 — mesmo caso do listFolder (200 + texto de sessão
            // expirada): SessionExpired na página 0, parcial acima.
            if (isSessionExpiredText(body)) {
                if (pageIndex == 0) return FolderResult.SessionExpired
                break
            }
            val json = try {
                JSONObject(body)
            } catch (_: Exception) {
                // R19B (P1): JSON inválido = falha transitória.
                if (pageIndex == 0) return FolderResult.Transient
                break
            }
            if (!json.optBoolean("ok", false)) {
                // R19B (P1): ok:false com 200 = o servidor
                // respondeu (a sessão está válida) — ex.: pasta
                // inexistente. Transitória, nunca bounce.
                if (pageIndex == 0) return FolderResult.Transient
                break
            }
            val files = json.optJSONObject("data")?.optJSONArray("files")
            val items = mutableListOf<FileItem>()
            if (files != null) {
                for (i in 0 until files.length()) {
                    // R21: parse por elemento — um item malformado já não
                    // deita fora a pasta inteira (padrão de Models.kt).
                    files.optJSONObject(i)?.let { obj ->
                        runCatching { FileItem.fromJson(obj) }.getOrNull()
                    }?.let { items.add(it) }
                }
            }
            val next = if (json.isNull("nextPageToken")) null
                else json.optString("nextPageToken").takeIf { it.isNotBlank() }
            result.addAll(items)
            if (next == null || next == pageToken) break
            pageToken = next
            pageIndex++
        }
        return FolderResult.Ok(result)
    }

    companion object {
        /**
         * Ronda 10 Frente B — fallback PROVISÓRIO de admin (ver
         * checkAdmin): o único admin no servidor é
         * ADMIN_USERS = ['elton@araujo.eu.org'].
         */
        const val ADMIN_FALLBACK_EMAIL = "elton@araujo.eu.org"

        // R21 — cache dos totais do /api/courses/unified (processo).
        @Volatile
        private var unifiedTotalsCache: Map<String, Int>? = null
        @Volatile
        private var unifiedTotalsAt: Long = 0L
        private const val UNIFIED_TOTALS_TTL_MS = 5 * 60 * 1000L

        /**
         * R21 — chave canónica de curso: minúsculas, URL descodificado
         * e sem barra final, aplicada dos dois lados (parse e procura)
         * para as grafias "%20"/espaço e com/sem "/" convergirem —
         * o mesmo casamento por variantes que a web faz.
         */
        fun normalizeCourseKey(path: String): String {
            val decoded = try {
                java.net.URLDecoder.decode(path, "UTF-8")
            } catch (_: Exception) {
                path
            }
            return decoded.trim().lowercase().trimEnd('/')
        }

        /** R21 — total do unified para um path local (ou null). */
        fun unifiedTotalFor(totals: Map<String, Int>, path: String): Int? =
            totals[normalizeCourseKey(path)]

        /**
         * Ronda 13 Frente C — DECISAO DA BASE URL: as rotas de
         * admin-drives (GET /api/admin-drives, POST
         * /api/admin/admin-drives/..., GET /api/me) e a listagem por ID
         * (POST /api/drive/by-id) existem SO no sandbox (staging-c +
         * meuc, Frente A da ronda 13); a PRODUCAO (BASE_URL =
         * educa.eu.org, worker v1.0.216) NAO as serve — funcao
         * sandbox-first. Usa-se o MESMO host da IA (AI_BASE_URL =
         * staging-c.urso.workers.dev): o app ja tem sessao nesse host
         * (aiSessionCookie, ver AiService) e o login de la e
         * reutilizado. A listagem normal continua na producao e a IA
         * continua no AI_BASE_URL — nada mais muda de host.
         */
        const val SANDBOX_BASE_URL = MeggyApp.AI_BASE_URL

        /** Prefixo dos caminhos por ID ("by-id:<folderId do Drive>"). */
        const val BY_ID_PREFIX = "by-id:"

        /** Caminho por ID p/ uma pasta do Drive. */
        fun byIdPath(folderId: String): String = "$BY_ID_PREFIX$folderId"

        /** True quando o caminho e por ID (listagem no sandbox). */
        fun isByIdPath(path: String?): Boolean =
            path?.startsWith(BY_ID_PREFIX) == true

        /** O folderId de um caminho por ID (null quando nao e). */
        fun folderIdOfByIdPath(path: String?): String? {
            val p = path?.trim()?.trimEnd('/') ?: return null
            if (!p.startsWith(BY_ID_PREFIX)) return null
            return p.removePrefix(BY_ID_PREFIX).takeIf { it.isNotBlank() }
        }

        /**
         * Ronda 13 Frente C — tira a base (producao ou sandbox) de
         * uma URL de playback p/ salvar so o link
         * (/download.aspx?...). Null quando a URL nao e de nenhuma
         * das bases (ex.: externa).
         */
        fun linkFromPlaybackUrl(url: String): String? {
            for (base in listOf(MeggyApp.BASE_URL, SANDBOX_BASE_URL)) {
                if (url.startsWith(base)) {
                    return url.removePrefix(base).takeIf { it.isNotBlank() }
                }
            }
            return null
        }
    }

    /**
     * R29 — busca de aulas no D1 (GET /api/d1/lessons/search, rota
     * do worker .92 — a mesma que a busca da web usa): devolve, por
     * aula, lesson_path (o caminho ATUAL da aula, codificado),
     * lesson_name, course_path e lesson_type. O lesson_path é o
     * caminho do ARQUIVO — a pasta é o caminho sem o último segmento
     * (ver StaleRecentResolver.folderOfLessonPath). Null em qualquer
     * falha (rede, 401, D1 desligado ou quota esgotada) — o chamador
     * cai para o passeio no Drive (listFolder), que não depende do D1.
     * Lista vazia = a busca correu e não achou nada.
     */
    data class D1LessonHit(
        val lessonName: String,
        val lessonPath: String,
        val coursePath: String,
        val lessonType: String?
    )

    suspend fun searchLessonsD1(query: String, limit: Int = 10): List<D1LessonHit>? {
        if (query.isBlank()) return emptyList()
        val url = "${MeggyApp.BASE_URL}/api/d1/lessons/search" +
            "?q=${URLEncoder.encode(query, "UTF-8")}&limit=$limit"
        val request = Request.Builder()
            .url(url)
            .header("Cookie", "session=${sessionManager.sessionCookie ?: ""}")
            .build()
        return try {
            MeggyApp.okHttpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return null
                val body = response.body?.string() ?: return null
                val json = JSONObject(body)
                if (!json.optBoolean("ok", false)) return null
                val arr = json.optJSONArray("lessons") ?: return emptyList()
                val out = ArrayList<D1LessonHit>(arr.length())
                for (i in 0 until arr.length()) {
                    val obj = arr.optJSONObject(i) ?: continue
                    val path = obj.optString("lesson_path").takeIf { it.isNotBlank() } ?: continue
                    out.add(
                        D1LessonHit(
                            lessonName = obj.optString("lesson_name"),
                            lessonPath = path,
                            coursePath = obj.optString("course_path"),
                            lessonType = obj.optString("lesson_type").takeIf { it.isNotBlank() }
                        )
                    )
                }
                out
            }
        } catch (_: Exception) {
            null
        }
    }

    /**
     * ★ v2.7.3 LOGIN PERSISTENCE FIX:
     * Validates the current session by making a lightweight API call.
     * If the session cookie has expired (server returns HTML login page or
     * a non-2xx code), AND we have a saved (username, password), automatically
     * re-issues a login request — the OkHttp layer in login() captures the
     * fresh `session=` cookie from Set-Cookie and persists it via
     * SessionManager.
     *
     * Returns true if (a) session was already valid OR (b) auto re-login
     * succeeded; false if no saved credentials OR re-login failed.
     *
     * Called from SplashActivity so the user never has to re-enter
     * credentials just because the server cookie expired.
     */
    suspend fun validateOrReLogin(): Boolean =
        validateSession() == SessionCheck.VALID

    /**
     * R21 — re-login direto com as credenciais salvas, SEM o probe
     * de listagem. Para chamadores que já sabem que a sessão expirou
     * (ex.: AuthHelper.listFolderWithRelogin, que acabou de receber um
     * SessionExpired): o probe antigo repetia uma ida à rede condenada
     * antes de tentar o login. Retorna false sem credenciais salvas.
     */
    suspend fun reLoginWithSavedCredentials(): Boolean {
        val user = sessionManager.username
        val pass = sessionManager.password
        if (user.isNullOrEmpty() || pass.isNullOrEmpty()) return false
        // login() persists the new cookie + username via SessionManager.
        return try {
            login(user, pass)
        } catch (_: Exception) {
            false
        }
    }

    /**
     * R29 — True quando o corpo de um 200 é o texto de sessão
     * expirada do portão do worker ("Session Expired!" por tempo,
     * "Invalid User!" quando o usuário não existe). Só estes dois
     * textos — qualquer outro corpo não-JSON continua sendo falha
     * transitória (o JSONObject lança e o catch classifica assim).
     */
    private fun isSessionExpiredText(body: String): Boolean {
        val trimmed = body.trimStart()
        return trimmed.startsWith("Session Expired") ||
            trimmed.startsWith("Invalid User")
    }

    /**
     * R21 — validação tipada da sessão (ver [SessionCheck]).
     *
     * 1) Probe leve (listFolder da raiz, 1 página): Ok = VALID.
     * 2) Transient (rede/timeout/5xx/quota) = UNKNOWN — NÃO tenta
     *    re-login às cegas: sem rede ele falharia na mesma, e com a
     *    quota esgotada só gastaria pedidos; a sessão pode estar boa.
     * 3) SessionExpired = tenta o re-login silencioso uma vez:
     *    resultou → VALID; falhou/sem credenciais → INVALID.
     *
     * R29 — o passo 3 agora cobre também o servidor que diz que a
     * sessão morreu com 200 + texto ("Session Expired" / "Invalid
     * User") ou 401: o listFolder classifica esses dois sinais como
     * SessionExpired, por isso o probe deles cai aqui (re-login →
     * INVALID quando não há como recuperar) em vez de UNKNOWN. Sem
     * resposta do servidor continua UNKNOWN — o Splash entra na Home
     * e as listagens fazem bounce depois, se for mesmo expiração.
     * É esta distinção que impede o Splash de entrar na Home com a
     * sessão morta quando o fix do worker falhar.
     */
    suspend fun validateSession(): SessionCheck {
        val probe = try {
            listFolder("0:", maxPages = 1)
        } catch (_: Exception) {
            FolderResult.Transient
        }
        return when (probe) {
            is FolderResult.Ok -> SessionCheck.VALID
            is FolderResult.Transient -> SessionCheck.UNKNOWN
            is FolderResult.SessionExpired ->
                if (reLoginWithSavedCredentials()) SessionCheck.VALID
                else SessionCheck.INVALID
        }
    }
}
