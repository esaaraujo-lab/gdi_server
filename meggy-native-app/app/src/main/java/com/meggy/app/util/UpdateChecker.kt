package com.meggy.app.util

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.widget.Toast
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File

/**
 * UpdateChecker — verifica GitHub releases por novas versões do APK.
 * 
 * Como funciona:
 * 1. No app start, verifica a API do GitHub: /repos/esaaraujo-lab/gdi_server/releases/latest
 * 2. Compara o tag_name (ex: "native-v1.3.0") com a versão atual (BuildConfig.VERSION_NAME)
 * 3. Se diferente, baixa o APK via DownloadManager
 * 4. Quando download completa, abre o APK para instalação
 * 
 * O usuário precisa permitir "Instalar apps desconhecidos" para o app Meggy.
 */
object UpdateChecker {

    private const val GITHUB_API = "https://api.github.com/repos/esaaraujo-lab/gdi_server/releases/latest"
    private const val PREFS_NAME = "meggy_update"
    private const val KEY_LAST_CHECK = "last_check"
    private const val KEY_LAST_VERSION = "last_version"
    private const val CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000L // 6 horas

    /**
     * Verifica se há nova versão. Se houver, baixa e instala.
     * Chamar no onCreate de HomeActivity (ou SplashActivity).
     */
    fun checkForUpdate(context: Context, currentVersion: String) {
        // Não verificar muito frequentemente (6h)
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val lastCheck = prefs.getLong(KEY_LAST_CHECK, 0)
        val now = System.currentTimeMillis()
        if (now - lastCheck < CHECK_INTERVAL_MS) return
        
        prefs.edit().putLong(KEY_LAST_CHECK, now).apply()

        Thread {
            try {
                val client = OkHttpClient.Builder().build()
                val request = Request.Builder().url(GITHUB_API).build()
                val response = client.newCall(request).execute()
                if (!response.isSuccessful) return@Thread
                
                val body = response.body?.string() ?: return@Thread
                val json = JSONObject(body)
                val tagName = json.optString("tag_name", "")
                val releaseName = json.optString("name", "")
                
                // Extrair versão do tag (ex: "native-v1.3.0" → "1.3.0")
                val remoteVersion = tagName.replace("native-v", "").replace("v", "")
                val localVersion = currentVersion.replace("native-v", "").replace("v", "")
                
                // Comparar versões
                if (isNewer(remoteVersion, localVersion)) {
                    // Pegar URL do APK
                    val assets = json.optJSONArray("assets") ?: return@Thread
                    var apkUrl: String? = null
                    for (i in 0 until assets.length()) {
                        val asset = assets.getJSONObject(i)
                        if (asset.optString("name").endsWith(".apk")) {
                            apkUrl = asset.optString("browser_download_url")
                            break
                        }
                    }
                    
                    if (apkUrl != null) {
                        // Baixar na main thread (DownloadManager é async)
                        val finalApkUrl = apkUrl
                        (context as? android.app.Activity)?.runOnUiThread {
                            Toast.makeText(context, "🌙 Nova versão $remoteVersion disponível! Baixando...", Toast.LENGTH_LONG).show()
                            downloadAndInstall(context, finalApkUrl, "meggy-$remoteVersion.apk")
                        }
                    }
                }
            } catch (e: Exception) {
                // Silencioso — não incomodar usuário com erros de rede
            }
        }.start()
    }

    /**
     * Compara versões no formato X.Y.Z
     * Retorna true se remote > local
     */
    private fun isNewer(remote: String, local: String): Boolean {
        val r = remote.split(".").map { it.toIntOrNull() ?: 0 }
        val l = local.split(".").map { it.toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(r.size, l.size)) {
            val rv = r.getOrNull(i) ?: 0
            val lv = l.getOrNull(i) ?: 0
            if (rv > lv) return true
            if (rv < lv) return false
        }
        return false
    }

    /**
     * Baixa o APK via DownloadManager e registra receiver para instalação automática.
     */
    private fun downloadAndInstall(context: Context, url: String, fileName: String) {
        try {
            val request = DownloadManager.Request(Uri.parse(url)).apply {
                setTitle("Meggy — Atualização")
                setDescription("Baixando nova versão do app...")
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, fileName)
            }
            
            val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            val downloadId = dm.enqueue(request)
            
            // Registrar receiver para instalar quando download completar
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(ctx: Context?, intent: Intent?) {
                    val id = intent?.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) ?: -1
                    if (id == downloadId) {
                        // Download completo — instalar
                        val file = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName)
                        if (file.exists()) {
                            val installIntent = Intent(Intent.ACTION_VIEW).apply {
                                setDataAndType(Uri.fromFile(file), "application/vnd.android.package-archive")
                                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
                            }
                            context.startActivity(installIntent)
                        }
                        // Desregistrar receiver
                        context.unregisterReceiver(this)
                    }
                }
            }
            
            context.registerReceiver(receiver, IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE))
        } catch (e: Exception) {
            Toast.makeText(context, "Erro ao baixar atualização: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }
}
