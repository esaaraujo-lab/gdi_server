package com.vovofit.app.data

import android.content.Context
import com.vovofit.app.VovoFitApp
import com.vovofit.app.util.SessionManager
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
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
                        items.add(FileItem(
                            name = f.optString("name"),
                            mimeType = f.optString("mimeType"),
                            id = f.optString("id"),
                            driveId = f.optString("driveId"),
                            link = f.optString("link", null),
                            size = f.optLong("size", 0L),
                            modifiedTime = f.optString("modifiedTime", null)
                        ))
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
