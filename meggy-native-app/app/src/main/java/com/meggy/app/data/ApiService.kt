package com.meggy.app.data

import com.meggy.app.MeggyApp
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException

class ApiService {
    
    companion object {
        private const val TAG = "ApiService"
    }
    
    suspend fun login(username: String, password: String): Boolean {
        val formBody = "username=${java.net.URLEncoder.encode(username, "UTF-8")}" +
                       "&password=${java.net.URLEncoder.encode(password, "UTF-8")}"
        
        val request = Request.Builder()
            .url("${MeggyApp.BASE_URL}/login")
            .post(formBody.toRequestBody("application/x-www-form-urlencoded".toMediaTypeOrNull()))
            .build()
        
        return try {
            val response = MeggyApp.okHttpClient.newCall(request).execute()
            // 302 = success (redirect after login)
            if (response.code == 302 || response.code == 200) {
                // Extract Set-Cookie header
                val cookies = response.headers("Set-Cookie")
                for (cookie in cookies) {
                    if (cookie.startsWith("session=")) {
                        val sessionValue = cookie.substringAfter("session=").substringBefore(";")
                        SessionManager.saveSession(sessionValue)
                        return true
                    }
                }
            }
            false
        } catch (e: IOException) {
            false
        }
    }
    
    suspend fun listFolder(driveIdx: Int, folderId: String, password: String = ""): List<FileItem>? {
        val jsonBody = JSONObject().apply {
            put("id", folderId)
            put("type", "folder")
            put("password", password)
            put("page_token", JSONObject.NULL)
            put("page_index", 0)
        }.toString()
        
        val request = Request.Builder()
            .url("${MeggyApp.BASE_URL}/$driveIdx:/")
            .post(jsonBody.toRequestBody("application/json".toMediaTypeOrNull()))
            .header("Cookie", "session=${SessionManager.getSession()}")
            .build()
        
        return try {
            val response = MeggyApp.okHttpClient.newCall(request).execute()
            if (!response.isSuccessful) return null
            
            val body = response.body?.string() ?: return null
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
                    link = f.optString("link", ""),
                    size = f.optString("size", "0"),
                    modifiedTime = f.optString("modifiedTime", "")
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
            .header("Cookie", "session=${SessionManager.getSession()}")
            .build()
        
        return try {
            val response = MeggyApp.okHttpClient.newCall(request).execute()
            if (!response.isSuccessful) return null
            
            val body = response.body?.string() ?: return null
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
}
