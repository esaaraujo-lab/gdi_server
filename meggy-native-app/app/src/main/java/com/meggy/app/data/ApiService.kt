package com.meggy.app.data

import com.meggy.app.MeggyApp
import com.meggy.app.util.SessionManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.FormBody
import okhttp3.MediaType.Companion.toJsonMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

/**
 * ApiService — thin Kotlin wrapper around the worker.js HTTP API at https://educa.eu.org.
 *
 * All methods are `suspend` and run on [Dispatchers.IO]. Throws [ApiException] on
 * any non-2xx (or unexpected redirect) response.
 *
 * Endpoints used:
 *   POST /login                                    (form-encoded, expect 302 + Set-Cookie)
 *   POST /<driveIdx>:/                             (JSON body, list folder)
 *   GET  /api/courses/list                         (JSON, list enrolled courses)
 */
class ApiService(private val app: MeggyApp) {

    /**
     * Login. Returns the session cookie value (without the `session=` prefix).
     *
     * The worker returns 302 on success and a 200/401 on failure. We deliberately
     * disable auto-redirect in the OkHttp client so we can capture the Set-Cookie
     * header from the 302 response.
     */
    suspend fun login(username: String, password: String): LoginResult = withContext(Dispatchers.IO) {
        try {
            val form = FormBody.Builder()
                .add("username", username)
                .add("password", password)
                .build()
            val req = Request.Builder()
                .url("${MeggyApp.BASE_URL}/login")
                .post(form)
                .build()
            val resp = app.client.newCall(req).execute()
            resp.use { r ->
                when (r.code) {
                    in 300..399 -> {
                        // Success — extract session cookie from Set-Cookie
                        val cookieHeader = r.header("Set-Cookie") ?: return@use LoginResult.Failure(
                            "Servidor não retornou cookie de sessão (resposta vazia)."
                        )
                        val cookie = parseCookieValue(cookieHeader, "session")
                            ?: return@use LoginResult.Failure("Cookie de sessão não encontrado.")
                        LoginResult.Success(sessionCookie = cookie, username = username)
                    }
                    200 -> LoginResult.Failure(
                        "Credenciais inválidas ou endpoint de login em manutenção (200)."
                    )
                    401, 403 -> LoginResult.Failure("Usuário ou senha incorretos.")
                    else -> LoginResult.Failure("Erro de login: HTTP ${r.code}")
                }
            }
        } catch (e: Exception) {
            LoginResult.Failure("Falha de rede: ${e.message ?: e.javaClass.simpleName}")
        }
    }

    /**
     * List the contents of a folder.
     *
     * @param driveIdx  drive index (0..11) — path segment of the URL.
     * @param folderId  encrypted folder ID. Pass `null` for the root of the drive.
     * @param pageToken continuation token from a previous call, or null for the first page.
     */
    suspend fun listFolder(
        driveIdx: Int,
        folderId: String?,
        pageToken: String? = null
    ): FolderListing = withContext(Dispatchers.IO) {
        val session = SessionManager.get(app).sessionCookie
            ?: throw ApiException("Not logged in")

        val bodyJson = JSONObject().apply {
            put("id", folderId ?: "")
            put("type", "folder")
            put("password", "")
            put("page_token", pageToken ?: JSONObject.NULL)
            put("page_index", 0)
        }.toString()

        val req = Request.Builder()
            .url("${MeggyApp.BASE_URL}/$driveIdx:/")
            .header("Cookie", "session=$session")
            .header("Content-Type", "application/json")
            .post(bodyJson.toRequestBody("application/json".toJsonMediaType()))
            .build()

        val resp = app.client.newCall(req).execute()
        resp.use { r ->
            if (!r.isSuccessful) {
                throw ApiException("listFolder HTTP ${r.code}: ${r.message}")
            }
            val text = r.body?.string().orEmpty()
            if (text.isBlank()) throw ApiException("listFolder: resposta vazia do servidor")
            try {
                FolderListing.parse(text)
            } catch (e: Exception) {
                throw ApiException("listFolder: JSON inválido — ${e.message}")
            }
        }
    }

    /**
     * List the courses the current user is enrolled in. May return an empty list
     * if the worker does not have the /api/courses/list endpoint enabled.
     */
    suspend fun listCourses(): List<CourseItem> = withContext(Dispatchers.IO) {
        val session = SessionManager.get(app).sessionCookie ?: return@withContext emptyList()
        val req = Request.Builder()
            .url("${MeggyApp.BASE_URL}/api/courses/list")
            .header("Cookie", "session=$session")
            .get()
            .build()
        try {
            val resp = app.client.newCall(req).execute()
            resp.use { r ->
                if (!r.isSuccessful) return@use emptyList()
                val text = r.body?.string().orEmpty()
                if (text.isBlank()) return@use emptyList()
                CourseItem.parse(text)
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    // ───────── helpers ─────────

    /**
     * Extract the value of [name] from a Set-Cookie header such as
     * `session=abc; Path=/; HttpOnly`. Returns null if not found.
     */
    private fun parseCookieValue(setCookie: String, name: String): String? {
        val parts = setCookie.split(';')
        for (p in parts) {
            val trimmed = p.trim()
            val eq = trimmed.indexOf('=')
            if (eq > 0 && trimmed.substring(0, eq) == name) {
                return trimmed.substring(eq + 1).trim()
            }
        }
        return null
    }
}

/** Thrown when an API call fails for any reason. */
class ApiException(message: String) : Exception(message)
