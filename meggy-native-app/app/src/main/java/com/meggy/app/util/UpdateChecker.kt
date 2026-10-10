package com.meggy.app.util

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.widget.Toast
import androidx.core.content.FileProvider
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File

object UpdateChecker {

    private const val GITHUB_API = "https://api.github.com/repos/esaaraujo-lab/gdi_server/releases/latest"
    private const val PREFS_NAME = "meggy_update"
    private const val KEY_INSTALLED_VERSION = "installed_version"

    /**
     * v1.7.0: Verifica se há nova versão AO ABRIR O APP.
     * Compara versionName (ex: "1.6.3" vs "1.7.0").
     * Se for a MESMA versão, não faz nada.
     * Se for versão NOVA, baixa e instala.
     */
    fun checkForUpdate(context: Context, currentVersion: String) {
        // Limpar versão (remover prefixos)
        val localVersion = currentVersion.replace("native-v", "").replace("v", "").trim()
        
        // Verificar se já instalamos esta versão (evita loop de reinstalação)
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val lastInstalled = prefs.getString(KEY_INSTALLED_VERSION, "") ?: ""
        if (localVersion == lastInstalled) {
            // Já verificamos e é a mesma versão — não fazer nada
            return
        }

        Thread {
            try {
                val client = OkHttpClient.Builder().build()
                val request = Request.Builder()
                    .url(GITHUB_API)
                    .header("Accept", "application/vnd.github+json")
                    .build()
                val response = client.newCall(request).execute()
                if (!response.isSuccessful) return@Thread
                
                val body = response.body?.string() ?: return@Thread
                val json = JSONObject(body)
                val tagName = json.optString("tag_name", "")
                
                // Extrair versão remota do tag (ex: "native-v1.7.0" → "1.7.0")
                val remoteVersion = tagName.replace("native-v", "").replace("v", "").trim()
                
                // ★ v1.7.0: Se for a MESMA versão, NÃO fazer nada
                if (remoteVersion == localVersion) {
                    prefs.edit().putString(KEY_INSTALLED_VERSION, localVersion).apply()
                    return@Thread
                }
                
                // Se versão remota é MAIOR, baixar e instalar
                if (remoteVersion.isNotEmpty() && isNewer(remoteVersion, localVersion)) {
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
                        val mainHandler = android.os.Handler(android.os.Looper.getMainLooper())
                        mainHandler.post {
                            Toast.makeText(context, "🐾 Atualizando para v$remoteVersion...", Toast.LENGTH_LONG).show()
                        }
                        downloadAndInstall(context, apkUrl, "meggy-$remoteVersion.apk", remoteVersion, prefs)
                    }
                } else {
                    // Versão local é igual ou maior — marcar como instalada
                    prefs.edit().putString(KEY_INSTALLED_VERSION, localVersion).apply()
                }
            } catch (e: Exception) {
                // Silencioso
            }
        }.start()
    }

    private fun isNewer(remote: String, local: String): Boolean {
        val r = remote.split(".").map { it.toIntOrNull() ?: 0 }
        val l = local.split(".").map { it.toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(r.size, l.size)) {
            val rv = r.getOrNull(i) ?: 0
            val lv = l.getOrNull(i) ?: 0
            if (rv > lv) return true
            if (rv < lv) return false
        }
        return false // São iguais — não é "mais nova"
    }

    private fun downloadAndInstall(
        context: Context, url: String, fileName: String,
        remoteVersion: String, prefs: android.content.SharedPreferences
    ) {
        try {
            val request = DownloadManager.Request(Uri.parse(url)).apply {
                setTitle("Meggy — Atualização v$remoteVersion")
                setDescription("Baixando nova versão do app...")
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, fileName)
            }
            
            val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            val downloadId = dm.enqueue(request)
            
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(ctx: Context?, intent: Intent?) {
                    val id = intent?.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) ?: -1
                    if (id == downloadId) {
                        val file = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName)
                        if (file.exists()) {
                            installApk(context, file)
                            // Marcar como instalada para não repetir
                            prefs.edit().putString(KEY_INSTALLED_VERSION, remoteVersion).apply()
                        }
                        try { context.unregisterReceiver(this) } catch (_: Exception) {}
                    }
                }
            }
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(receiver, IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), Context.RECEIVER_NOT_EXPORTED)
            } else {
                context.registerReceiver(receiver, IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE))
            }
        } catch (e: Exception) {
            val mainHandler = android.os.Handler(android.os.Looper.getMainLooper())
            mainHandler.post {
                Toast.makeText(context, "Erro ao baixar atualização", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun installApk(context: Context, file: File) {
        try {
            val apkUri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                file
            )
            
            val installIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(apkUri, "application/vnd.android.package-archive")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
            }
            
            val resInfo = context.packageManager.queryIntentActivities(installIntent, 0)
            for (ri in resInfo) {
                context.grantUriPermission(
                    ri.activityInfo.packageName,
                    apkUri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                )
            }
            
            context.startActivity(installIntent)
        } catch (e: Exception) {
            try {
                @Suppress("DEPRECATION")
                val installIntent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(Uri.fromFile(file), "application/vnd.android.package-archive")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                context.startActivity(installIntent)
            } catch (e2: Exception) {
                val mainHandler = android.os.Handler(android.os.Looper.getMainLooper())
                mainHandler.post {
                    Toast.makeText(context, "Não foi possível instalar. Baixe manualmente.", Toast.LENGTH_LONG).show()
                }
            }
        }
    }
}
