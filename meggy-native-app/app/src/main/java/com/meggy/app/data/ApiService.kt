package com.meggy.app.data

import android.content.Context
import com.meggy.app.MeggyApp
import com.meggy.app.util.SessionManager
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
            .url("${MeggyApp.BASE_URL}/login")
            .post(formBody.toRequestBody("application/x-www-form-urlencoded".toMediaTypeOrNull()))
            .build()
        
        return try {
            val response = MeggyApp.okHttpClient.newCall(request).execute()
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
    suspend fun listFolder(fullPath: String): List<FileItem>? {
        val jsonBody = JSONObject().apply {
            put("id", "")
            put("type", "folder")
            put("password", "")
            put("page_token", JSONObject.NULL)
            put("page_index", 0)
        }.toString()
        
        // Garantir trailing slash
        val path = if (fullPath.endsWith("/")) fullPath else "$fullPath/"
        
        val request = Request.Builder()
            .url("${MeggyApp.BASE_URL}$path")
            .post(jsonBody.toRequestBody("application/json".toMediaTypeOrNull()))
            .header("Cookie", "session=${sessionManager.sessionCookie ?: ""}")
            .build()
        
        return try {
            val response = MeggyApp.okHttpClient.newCall(request).execute()
            if (!response.isSuccessful) return null
            
            val body = response.body?.string() ?: return null
            
            // ★ v1.0.8: verificar se resposta é HTML (login redirect) em vez de JSON
            if (body.trimStart().startsWith("<!DOCTYPE") || body.trimStart().startsWith("<html")) {
                return null  // sessão expirou — precisa re-login
            }
            
            val json = JSONObject(body)
            val files = json.optJSONObject("data")?.optJSONArray("files") ?: return emptyList()
            
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
            result
        } catch (e: Exception) {
            null
        }
    }
    
    suspend fun listCourses(): List<CourseItem>? {
        val request = Request.Builder()
            .url("${MeggyApp.BASE_URL}/api/courses/list")
            .header("Cookie", "session=${sessionManager.sessionCookie ?: ""}")
            .build()

        return try {
            val response = MeggyApp.okHttpClient.newCall(request).execute()
            if (!response.isSuccessful) return null

            val body = response.body?.string() ?: return null
            if (body.trimStart().startsWith("<")) return null

            val json = JSONObject(body)
            if (!json.optBoolean("ok")) return null

            val courses = json.optJSONArray("courses") ?: return emptyList()
            val result = mutableListOf<CourseItem>()
            for (i in 0 until courses.length()) {
                val c = courses.getJSONObject(i)
                result.add(CourseItem(
                    coursePath = c.optString("coursePath"),
                    courseName = c.optString("courseName")
                ))
            }
            result
        } catch (e: Exception) {
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
    suspend fun validateOrReLogin(): Boolean {
        // 1) Probe with a lightweight listFolder call — listing the first
        //    drive root is cheap (one round-trip, JSON-encoded folder list).
        //    listFolder returns null on (a) non-2xx, (b) HTML body (login
        //    redirect), or (c) any exception — all 3 mean session is gone.
        val probe = try {
            listFolder("0:")
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
