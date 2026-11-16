package com.bibigyn.app.data

import android.content.Context
import com.bibigyn.app.BiBiGynApp
import com.bibigyn.app.util.SessionManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException

class ApiService(private val context: Context) {
    
    private val sessionManager get() = SessionManager.get(context)
    
    suspend fun login(username: String, password: String): Boolean {
        val formBody = "username=${java.net.URLEncoder.encode(username, "UTF-8")}" +
                       "&password=${java.net.URLEncoder.encode(password, "UTF-8")}"
        
        val request = Request.Builder()
            .url("${BiBiGynApp.BASE_URL}/login")
            .post(formBody.toRequestBody("application/x-www-form-urlencoded".toMediaTypeOrNull()))
            .build()
        
        return try {
            val response = BiBiGynApp.okHttpClient.newCall(request).execute()
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
        } catch (e: IOException) {
            false
        }
    }
    
    // ★ v1.0.8: POST para o PATH COMPLETO. OkHttp faz o encoding correto (%20).
    // ★ v2.1.6 (diagnóstico listagem): pagina TODAS as páginas.
    // Antes: só page_index 0 / page_token null — qualquer pasta com mais
    // de 100 itens (pageSize do worker, files_list_page_size: 100) perdia
    // o resto em silêncio, pastas inclusive. O worker devolve
    // nextPageToken no TOPO do JSON (não dentro de data); a próxima
    // página usa esse token (page_index é só ecoado como curPageIndex).
    // Travas: no máximo `maxPages` páginas e parada se o token repetir.
    // Falha na página 0 mantém a semântica antiga (null = sessão
    // expirada → bounceToLogin); falha numa página posterior devolve o
    // que já foi acumulado em vez de derrubar a tela para o login.
    suspend fun listFolder(fullPath: String, maxPages: Int = 20): List<FileItem>? {
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
                .url("${BiBiGynApp.BASE_URL}$path")
                .post(jsonBody.toRequestBody("application/json".toMediaTypeOrNull()))
                .header("Cookie", "session=${sessionManager.sessionCookie ?: ""}")
                .build()

            val page: Pair<List<FileItem>, String?> = try {
                val response = BiBiGynApp.okHttpClient.newCall(request).execute()
                if (!response.isSuccessful) {
                    if (pageIndex == 0) return null
                    break
                }
                val body = response.body?.string()
                if (body == null) {
                    if (pageIndex == 0) return null
                    break
                }

                // ★ v1.0.8: verificar se resposta é HTML (login redirect) em vez de JSON
                if (body.trimStart().startsWith("<!DOCTYPE") || body.trimStart().startsWith("<html")) {
                    if (pageIndex == 0) return null  // sessão expirou — precisa re-login
                    break
                }

                val json = JSONObject(body)
                val files = json.optJSONObject("data")?.optJSONArray("files")
                val items = mutableListOf<FileItem>()
                // ★ v2.1.9 — CAUSA RAIZ DO MONOGRAMA: o código antigo
                // montava FileItem à mão e NUNCA lia "thumbnailLink" nem
                // aplicava o fallback drive.google.com/thumbnail?id=<id>
                // (só FileItem.fromJson faz isso). O thumbnailLink vinha
                // sempre null → launchPlayer/addRecent gravavam recents
                // sem thumb → os cards caíam no monograma. fromJson é o
                // único parser (usado também nos favoritos) — passar a
                // usá-lo aqui corrige a thumb em TODAS as telas que
                // listam pastas (home, detalhe, busca, browse, player).
                if (files != null) {
                    for (i in 0 until files.length()) {
                        items.add(FileItem.fromJson(files.getJSONObject(i)))
                    }
                }
                val next = if (json.isNull("nextPageToken")) null
                    else json.optString("nextPageToken").takeIf { it.isNotBlank() }
                items to next
            } catch (e: Exception) {
                if (pageIndex == 0) return null
                break
            }
            result.addAll(page.first)
            val next = page.second
            if (next == null || next == pageToken) break
            pageToken = next
            pageIndex++
        }
        return result
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
            .url("${BiBiGynApp.BASE_URL}/api/featured-courses")
            .header("Cookie", "session=${sessionManager.sessionCookie ?: ""}")
            .build()
        return try {
            val response = BiBiGynApp.okHttpClient.newCall(request).execute()
            if (!response.isSuccessful) return null
            val body = response.body?.string() ?: return null
            val json = JSONObject(body)
            if (!json.optBoolean("ok", false)) return null
            FeaturedCourse.parseList(json.optJSONArray("courses"))
        } catch (_: Exception) {
            null
        }
    }

    // ── Ronda 10 Frente B: drives do admin ──

    /**
     * Ronda 13 Frente C — GET /api/admin-drives (SANDBOX, ver
     * [SANDBOX_BASE_URL]): drives do admin + os 16 fixos como
     * registos geridos (a Home usa a resposta como fonte de verdade).
     * Best-effort e silencioso: null em qualquer falha — a Home cai
     * para DriveItem.ALL e o ecra "Gerir drives" mostra "funcao
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
     * (actualiza sem duplicar).
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
            "Não foi possível guardar. Verifique a conexão e tente novamente.")
        return adminPostResult(code, respBody)
    }

    /** Ronda 13 Frente C — POST /api/admin/admin-drives/delete {id}
     * (SANDBOX). Apaga SO o registo D1 — nunca a pasta no Drive. */
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
     * (SANDBOX; so ADMIN_USERS, 403 a nao-admins). O ecra "Gerir
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
     * inventado): o username guardado e exatamente o da sessao e o
     * servidor so aceita como admin ADMIN_USERS =
     * ['elton@araujo.eu.org'] — username == esse email ⇒ admin. O
     * servidor continua a ser o executor: os POSTs admin dao 403 a
     * nao-admins, por isso o fallback so decide o que a UI MOSTRA.
     * O resultado e guardado em SessionManager com o username a que
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
        if (code == 403) return AdminDriveResult.Error("Só o administrador pode gerir drives.")
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
     * Login no sandbox com as credenciais guardadas (mesmo padrao do
     * AiService.aiLogin; o cookie fica em aiSessionCookie). So quando
     * SANDBOX_BASE_URL != BASE_URL. Roda em Dispatchers.IO.
     */
    private suspend fun sandboxLogin(): Boolean = withContext(Dispatchers.IO) {
        if (SANDBOX_BASE_URL == BiBiGynApp.BASE_URL) return@withContext false
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
            BiBiGynApp.okHttpClient.newCall(request).execute().use { response ->
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
                    BiBiGynApp.okHttpClient.newCall(req).execute().use { response ->
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
     * paginacao (maxPages; null na falha da pagina 0 = sessa o
     * expirada / pasta inexistente — o chamador decide; 404 da pasta
     * vem como ok:false e cai no mesmo null). O `link` de cada ficheiro
     * e cunhado pelo sandbox (ver fileBaseUrl no DetailActivity).
     */
    suspend fun listFolderById(folderId: String, maxPages: Int = 20): List<FileItem>? {
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
                if (pageIndex == 0) return null
                break
            }
            if (body.trimStart().startsWith("<!DOCTYPE") || body.trimStart().startsWith("<html")) {
                if (pageIndex == 0) return null
                break
            }
            val json = try {
                JSONObject(body)
            } catch (_: Exception) {
                if (pageIndex == 0) return null
                break
            }
            if (!json.optBoolean("ok", false)) {
                if (pageIndex == 0) return null
                break
            }
            val files = json.optJSONObject("data")?.optJSONArray("files")
            val items = mutableListOf<FileItem>()
            if (files != null) {
                for (i in 0 until files.length()) {
                    items.add(FileItem.fromJson(files.getJSONObject(i)))
                }
            }
            val next = if (json.isNull("nextPageToken")) null
                else json.optString("nextPageToken").takeIf { it.isNotBlank() }
            result.addAll(items)
            if (next == null || next == pageToken) break
            pageToken = next
            pageIndex++
        }
        return result
    }

    companion object {
        /**
         * Ronda 10 Frente B — fallback PROVISÓRIO de admin (ver
         * checkAdmin): o único admin no servidor é
         * ADMIN_USERS = ['elton@araujo.eu.org'].
         */
        const val ADMIN_FALLBACK_EMAIL = "elton@araujo.eu.org"

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
        const val SANDBOX_BASE_URL = BiBiGynApp.AI_BASE_URL

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
         * uma URL de playback p/ guardar so o link
         * (/download.aspx?...). Null quando a URL nao e de nenhuma
         * das bases (ex.: externa).
         */
        fun linkFromPlaybackUrl(url: String): String? {
            for (base in listOf(BiBiGynApp.BASE_URL, SANDBOX_BASE_URL)) {
                if (url.startsWith(base)) {
                    return url.removePrefix(base).takeIf { it.isNotBlank() }
                }
            }
            return null
        }
    }

    /**
     * ★ v2.1.2 LOGIN PERSISTENCE FIX:
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
    suspend fun validateOrReLogin(): Boolean {
        // 1) Probe with a lightweight listFolder call — listing the first
        //    drive root is cheap (one round-trip, JSON-encoded folder list).
        //    listFolder returns null on (a) non-2xx, (b) HTML body (login
        //    redirect), or (c) any exception — all 3 mean session is gone.
        //    v2.1.6: maxPages = 1 — o probe só precisa saber se a sessão
        //    responde; não precisa listar a pasta inteira.
        val probe = try {
            listFolder("0:", maxPages = 1)
        } catch (_: Exception) {
            null
        }
        if (probe != null) return true  // session is valid

        // 2) Session is invalid — see if we have saved credentials.
        val user = sessionManager.username
        val pass = sessionManager.password
        if (user.isNullOrEmpty() || pass.isNullOrEmpty()) return false

        // 3) Try a re-login. login() persists the new cookie + username via
        //    SessionManager; we do NOT need to re-save the password (already
        //    persisted) but we keep it current in case the user typed a new
        //    one — though here we are using the saved one.
        val ok = try {
            login(user, pass)
        } catch (_: Exception) {
            false
        }
        return ok
    }
}
