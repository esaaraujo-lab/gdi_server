package com.bibigyn.app.util

import android.content.Context
import com.bibigyn.app.BiBiGynApp
import java.io.File
import java.io.FileOutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Request

/**
 * v2.1.5 — Download autenticado de arquivos do Drive (PDF/MD/VTT).
 *
 * Baixa com o cookie de sessão (como o player) para o cache do app e
 * reutiliza o arquivo enquanto existir (o leitor não baixa duas vezes
 * o mesmo documento). Retorna o File local ou null em falha.
 */
object FileDownloader {
    suspend fun download(
        context: Context,
        url: String,
        subdir: String,
        fileName: String
    ): File? = withContext(Dispatchers.IO) {
        try {
            val dir = File(context.cacheDir, subdir).apply { mkdirs() }
            val safe = fileName.replace(Regex("[^A-Za-z0-9._-]"), "_")
            val out = File(dir, "${url.hashCode()}_$safe")
            if (out.exists() && out.length() > 0) return@withContext out

            val cookie = SessionManager.get(context).sessionCookie
            val request = Request.Builder()
                .url(url)
                .header("User-Agent", "BiBiNative/2.1 (Android)")
                .apply {
                    if (!cookie.isNullOrBlank()) header("Cookie", "session=$cookie")
                }
                .build()
            val response = BiBiGynApp.okHttpClient.newCall(request).execute()
            if (!response.isSuccessful) return@withContext null
            val body = response.body ?: return@withContext null
            FileOutputStream(out).use { fos ->
                body.byteStream().copyTo(fos)
            }
            if (out.length() == 0L) return@withContext null
            out
        } catch (_: Exception) {
            null
        }
    }

    suspend fun downloadText(context: Context, url: String): String? = withContext(Dispatchers.IO) {
        try {
            val cookie = SessionManager.get(context).sessionCookie
            val request = Request.Builder()
                .url(url)
                .header("User-Agent", "BiBiNative/2.1 (Android)")
                .apply {
                    if (!cookie.isNullOrBlank()) header("Cookie", "session=$cookie")
                }
                .build()
            val response = BiBiGynApp.okHttpClient.newCall(request).execute()
            if (!response.isSuccessful) return@withContext null
            response.body?.string()
        } catch (_: Exception) {
            null
        }
    }
}
