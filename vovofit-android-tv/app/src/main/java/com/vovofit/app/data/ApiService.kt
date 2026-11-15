package com.vovofit.app.data

import android.content.Context
import com.vovofit.app.VovoFitApp
import com.vovofit.app.util.SessionManager
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
            .url("${VovoFitApp.BASE_URL}/login")
            .post(formBody.toRequestBody("application/x-www-form-urlencoded".toMediaTypeOrNull()))
            .build()
        
        return try {
            val response = VovoFitApp.okHttpClient.newCall(request).execute()
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
    // ★ v1.0.5 (diagnóstico listagem): pagina TODAS as páginas.
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
                .url("${VovoFitApp.BASE_URL}$path")
                .post(jsonBody.toRequestBody("application/json".toMediaTypeOrNull()))
                .header("Cookie", "session=${sessionManager.sessionCookie ?: ""}")
                .build()

            val page: Pair<List<FileItem>, String?> = try {
                val response = VovoFitApp.okHttpClient.newCall(request).execute()
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
                if (files != null) {
                    for (i in 0 until files.length()) {
                        val f = files.getJSONObject(i)
                        // v1.0.8 — usar FileItem.fromJson: a construcao
                        // manual acima descartava thumbnailLink (e
                        // folderPath/folderLabel). Sem thumb, o addRecent
                        // salvava o recent SEM thumb e o card caia no
                        // monograma — era a causa-raiz dos monogramas no
                        // "Continue assistindo". O fromJson ainda gera o
                        // fallback drive.google.com/thumbnail?id=<id>
                        // quando a API nao devolve thumbnailLink.
                        items.add(FileItem.fromJson(f))
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
     * v1.0.8 onda 2 — Cursos em destaque do admin (GET /api/featured-courses).
     * Devolve a lista (vazia em qualquer falha — silencioso: a home cai para
     * as capas locais). O backend v2.15.6 inclui `coverUrl` por curso; sem
     * ele (producao pre-v2: 404), a lista vem vazia e nada muda na UI.
     * Nao lanca excecao; nunca mostra toast.
     */
    suspend fun getFeaturedCourses(): List<FeaturedCourse> {
        return try {
            val request = Request.Builder()
                .url("${VovoFitApp.BASE_URL}/api/featured-courses")
                .header("Cookie", "session=${sessionManager.sessionCookie ?: ""}")
                .build()
            VovoFitApp.okHttpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return emptyList()
                val body = response.body?.string() ?: return emptyList()
                val json = JSONObject(body)
                if (!json.optBoolean("ok", false)) return emptyList()
                FeaturedCourse.parseList(json.optJSONArray("courses"))
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    // ── Ronda 10 Frente B: drives do admin ──

    /**
     * Ronda 10 Frente B — GET /api/admin-drives: drives que o admin
     * adicionou por ID (tabela D1 admin_drives — dependência do servidor
     * v2.15.x, AINDA NÃO EXISTE: hoje dá 404). Best-effort e silencioso:
     * null em qualquer falha (rede/auth/rota ausente) — o ecrã "Gerir
     * drives" mostra "função indisponível" e NÃO uma lista vazia
     * enganadora. O admin vê TODOS os drives que criou, em qualquer APK
     * (o filtro por targetApps é da Frente C, na Home).
     */
    suspend fun getAdminDrives(): List<AdminDrive>? {
        val request = Request.Builder()
            .url("${VovoFitApp.BASE_URL}/api/admin-drives")
            .header("Cookie", "session=${sessionManager.sessionCookie ?: ""}")
            .build()
        return try {
            val response = VovoFitApp.okHttpClient.newCall(request).execute()
            if (!response.isSuccessful) return null
            val body = response.body?.string() ?: return null
            val json = JSONObject(body)
            if (!json.optBoolean("ok", false)) return null
            AdminDrive.parseList(json.optJSONArray("drives"))
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Ronda 10 Frente B — POST /api/admin/admin-drives/add
     * {driveId, name, targetApps[], coverUrl?, subCoverUrl?,
     * subfolderCovers?}. Só ADMIN_USERS no servidor (403 a não-admins).
     * 404 → Unavailable (rota ainda não existe); erro legível em pt-BR.
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
        val request = Request.Builder()
            .url("${VovoFitApp.BASE_URL}/api/admin/admin-drives/add")
            .post(body.toRequestBody("application/json".toMediaTypeOrNull()))
            .header("Cookie", "session=${sessionManager.sessionCookie ?: ""}")
            .build()
        return try {
            val response = VovoFitApp.okHttpClient.newCall(request).execute()
            adminPostResult(response.code, response.body?.string())
        } catch (_: Exception) {
            AdminDriveResult.Error("Não foi possível guardar. Verifique a conexão e tente novamente.")
        }
    }

    /** Ronda 10 Frente B — POST /api/admin/admin-drives/delete {id}. */
    suspend fun deleteAdminDrive(id: Long): AdminDriveResult {
        val body = JSONObject().apply { put("id", id) }.toString()
        val request = Request.Builder()
            .url("${VovoFitApp.BASE_URL}/api/admin/admin-drives/delete")
            .post(body.toRequestBody("application/json".toMediaTypeOrNull()))
            .header("Cookie", "session=${sessionManager.sessionCookie ?: ""}")
            .build()
        return try {
            val response = VovoFitApp.okHttpClient.newCall(request).execute()
            adminPostResult(response.code, response.body?.string())
        } catch (_: Exception) {
            AdminDriveResult.Error("Não foi possível remover. Verifique a conexão e tente novamente.")
        }
    }

    /**
     * Ronda 10 Frente B — GET /api/me → {ok, user, isAdmin}: fonte de
     * verdade do papel de admin (dependência v2.15.x, AINDA NÃO EXISTE:
     * hoje dá 404). Em 404/erro/rede, FALLBACK PROVISÓRIO VERIFICADO
     * (não inventado): o username guardado é exatamente o da sessão e
     * o servidor só aceita como admin ADMIN_USERS =
     * ['elton@araujo.eu.org'] — username == esse email ⇒ admin. O
     * servidor continua a ser o executor: os POSTs admin dão 403 a
     * não-admins, por isso o fallback só decide o que a UI MOSTRA.
     * O resultado é guardado em SessionManager com o username a que
     * diz respeito (revalidado quando o username muda).
     */
    suspend fun checkAdmin(): Boolean {
        val user = sessionManager.username
        val fromServer: Boolean? = try {
            val request = Request.Builder()
                .url("${VovoFitApp.BASE_URL}/api/me")
                .header("Cookie", "session=${sessionManager.sessionCookie ?: ""}")
                .build()
            val response = VovoFitApp.okHttpClient.newCall(request).execute()
            if (response.code == 404) null
            else if (!response.isSuccessful) null
            else {
                val json = JSONObject(response.body?.string() ?: "")
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

    companion object {
        /**
         * Ronda 10 Frente B — fallback PROVISÓRIO de admin (ver
         * checkAdmin): o único admin no servidor é
         * ADMIN_USERS = ['elton@araujo.eu.org'].
         */
        const val ADMIN_FALLBACK_EMAIL = "elton@araujo.eu.org"
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
        //    v1.0.5: maxPages = 1 — o probe só precisa saber se a sessão
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
