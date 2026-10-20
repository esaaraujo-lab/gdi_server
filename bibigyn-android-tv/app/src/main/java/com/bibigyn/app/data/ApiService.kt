package com.bibigyn.app.data

import com.bibigyn.app.BiBiGynApp
import com.bibigyn.app.util.SessionManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.FormBody
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import org.json.JSONArray

/**
 * ApiService — thin Kotlin wrapper around the worker.js HTTP API at https://educa.eu.org.
 */
class ApiService(private val app: BiBiGynApp) {

    /**
     * Login. Returns the session cookie value (without the `session=` prefix).
     *
     * ★ FIX: Worker retorna HTTP 200 (não 302) no sucesso, com Set-Cookie header.
     * Antes o app tratava 200 como falha — agora verifica Set-Cookie em ambos 200 e 302.
     */
    suspend fun login(username: String, password: String): LoginResult = withContext(Dispatchers.IO) {
        try {
            val form = FormBody.Builder()
                .add("username", username)
                .add("password", password)
                .build()
            val req = Request.Builder()
                .url("${BiBiGynApp.BASE_URL}/login")
                .post(form)
                .build()
            val resp = app.client.newCall(req).execute()
            resp.use { r ->
                // ★ Worker retorna 200 com Set-Cookie no sucesso, 401 no fracasso
                if (r.code == 200 || r.code == 302) {
                    // Verifica Set-Cookie (pode vir múltiplos headers)
                    val cookies = r.headers("Set-Cookie")
                    for (cookie in cookies) {
                        if (cookie.startsWith("session=")) {
                            val sessionValue = cookie.substringAfter("session=").substringBefore(";")
                            if (sessionValue.isNotEmpty()) {
                                return@use LoginResult.Success(sessionCookie = sessionValue, username = username)
                            }
                        }
                    }
                    // 200/302 sem cookie de sessão → credenciais inválidas
                    return@use LoginResult.Failure("Usuário ou senha incorretos.")
                }
                if (r.code == 401 || r.code == 403) {
                    LoginResult.Failure("Usuário ou senha incorretos.")
                } else {
                    LoginResult.Failure("Erro de login: HTTP ${r.code}")
                }
            }
        } catch (e: Exception) {
            LoginResult.Failure("Falha de rede: ${e.message ?: e.javaClass.simpleName}")
        }
    }

    /**
     * List the contents of a folder.
     */
    suspend fun listFolder(
        driveIdx: Int,
        folderId: String?,
        pageToken: String? = null
    ): FolderListing = withContext(Dispatchers.IO) {
        val session = SessionManager.get(app).sessionCookie
            ?: throw ApiException("Not logged in")

        val jsonBody = JSONObject().apply {
            put("id", folderId ?: "")
            put("type", "folder")
            put("password", "")
            put("page_token", if (pageToken != null) pageToken else JSONObject.NULL)
            put("page_index", 0)
        }.toString()

        val req = Request.Builder()
            .url("${BiBiGynApp.BASE_URL}/$driveIdx:/")
            .post(jsonBody.toRequestBody("application/json".toMediaType()))
            .header("Cookie", "session=$session")
            .header("Content-Type", "application/json")
            .build()

        val resp = app.client.newCall(req).execute()
        resp.use { r ->
            if (!r.isSuccessful) throw ApiException("HTTP ${r.code}")

            val body = r.body?.string() ?: throw ApiException("Empty response")

            // Check if response is HTML (login redirect)
            if (body.trimStart().startsWith("<!DOCTYPE") || body.trimStart().startsWith("<html")) {
                throw ApiException("Session expired")
            }

            val json = JSONObject(body)
            val files = json.optJSONObject("data")?.optJSONArray("files") ?: JSONArray()
            val result = mutableListOf<FileItem>()
            for (i in 0 until files.length()) {
                val f = files.getJSONObject(i)
                result.add(FileItem(
                    name = f.optString("name"),
                    mimeType = f.optString("mimeType"),
                    id = f.optString("id"),
                    driveId = f.optString("driveId"),
                    link = f.optString("link", null),
                    size = f.optLong("size", 0L),
                    modifiedTime = f.optString("modifiedTime", null)
                ))
            }
            FolderListing(files = result, nextPageToken = null)
        }
    }

    /**
     * List enrolled courses.
     */
    suspend fun listCourses(): List<CourseItem> = withContext(Dispatchers.IO) {
        val session = SessionManager.get(app).sessionCookie
            ?: return@withContext emptyList()

        val req = Request.Builder()
            .url("${BiBiGynApp.BASE_URL}/api/courses/list")
            .header("Cookie", "session=$session")
            .build()

        try {
            val resp = app.client.newCall(req).execute()
            resp.use { r ->
                if (!r.isSuccessful) return@use emptyList()
                val body = r.body?.string() ?: return@use emptyList()
                if (body.trimStart().startsWith("<")) return@use emptyList()

                val json = JSONObject(body)
                if (!json.optBoolean("ok")) return@use emptyList()

                val courses = json.optJSONArray("courses") ?: return@use emptyList()
                val result = mutableListOf<CourseItem>()
                for (i in 0 until courses.length()) {
                    val c = courses.getJSONObject(i)
                    result.add(CourseItem(
                        coursePath = c.optString("coursePath"),
                        courseName = c.optString("courseName")
                    ))
                }
                result
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    private fun parseCookieValue(header: String, key: String): String? {
        for (part in header.split(";")) {
            val trimmed = part.trim()
            if (trimmed.startsWith("$key=")) {
                return trimmed.substringAfter("=")
            }
        }
        return null
    }
}
