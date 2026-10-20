package com.bibigyn.app.util

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import androidx.core.content.FileProvider
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * v2.6.0 — UpdateChecker com filtro por tag prefix native-v*
 *
 * ★ Mudancas:
 *  - NAO usa mais releases/latest (que pode retornar bibigyn-v* ou desktop-v*)
 *  - Lista todas as releases e filtra por tag prefix "native-v"
 *  - Auto-download + auto-install silencioso (sem dialog — so toast)
 *  - Se ja esta na ultima versao, NAO faz nada (silencioso)
 */
object UpdateChecker {

    private const val GITHUB_RELEASES_API = "https://api.github.com/repos/esaaraujo-lab/gdi_server/releases?per_page=10"
    private const val TAG_PREFIX = "bibigyn-v"
    private const val PREFS_NAME = "meggy_update"
    private const val KEY_DOWNLOADED_VERSION = "downloaded_version"

    fun checkForUpdate(context: Context, currentVersion: String, showFeedback: Boolean = false) {
        val localVersion = currentVersion.replace(TAG_PREFIX, "").replace("v", "").trim()

        Thread {
            try {
                val client = OkHttpClient.Builder()
                    .connectTimeout(10, TimeUnit.SECONDS)
                    .readTimeout(15, TimeUnit.SECONDS)
                    .build()
                val request = Request.Builder()
                    .url(GITHUB_RELEASES_API)
                    .header("Accept", "application/vnd.github+json")
                    .header("User-Agent", "BiBiFit-UpdateChecker")
                    .build()
                val response = client.newCall(request).execute()
                if (!response.isSuccessful) {
                    if (showFeedback) showToast(context, "Erro ao verificar (HTTP ${response.code})")
                    return@Thread
                }

                val body = response.body?.string()
                if (body.isNullOrBlank()) {
                    if (showFeedback) showToast(context, "Resposta vazia do servidor")
                    return@Thread
                }

                val releasesArray = JSONArray(body)

                // Busca a primeira release com tag prefix "native-v"
                var remoteVersion = ""
                var apkUrl: String? = null
                var apkSize = 0L

                for (i in 0 until releasesArray.length()) {
                    val release = releasesArray.getJSONObject(i)
                    val tagName = release.optString("tag_name", "")
                    if (tagName.startsWith(TAG_PREFIX)) {
                        remoteVersion = tagName.replace(TAG_PREFIX, "").trim()
                        val assets = release.optJSONArray("assets")
                        if (assets != null) {
                            for (j in 0 until assets.length()) {
                                val asset = assets.getJSONObject(j)
                                if (asset.optString("name").endsWith(".apk")) {
                                    apkUrl = asset.optString("browser_download_url")
                                    apkSize = asset.optLong("size", 0)
                                    break
                                }
                            }
                        }
                        break
                    }
                }

                if (remoteVersion.isEmpty()) {
                    if (showFeedback) showToast(context, "Nenhuma release native-v* encontrada")
                    return@Thread
                }

                // Mesma versao — NAO fazer nada (silencioso)
                if (remoteVersion == localVersion) {
                    if (showFeedback) showToast(context, "Voce esta na versao mais recente (v$localVersion)")
                    return@Thread
                }

                // Versao remota e mais nova → auto-download + auto-install
                if (isNewer(remoteVersion, localVersion) && apkUrl != null) {
                    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    val sizeStr = if (apkSize > 0) " (${apkSize / 1024 / 1024} MB)" else ""
                    val fileName = "meggy-$remoteVersion.apk"

                    val lastDownloaded = prefs.getString(KEY_DOWNLOADED_VERSION, "") ?: ""
                    val downloadedFile = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName)

                    if (downloadedFile.exists() && lastDownloaded == remoteVersion) {
                        showToast(context, "Instalando v$remoteVersion...")
                        installApk(context, downloadedFile)
                    } else {
                        showToast(context, "Baixando v$remoteVersion...$sizeStr")
                        downloadAndInstall(context, apkUrl, fileName, remoteVersion, prefs)
                    }
                } else {
                    if (showFeedback) showToast(context, "Voce esta na versao mais recente (v$localVersion)")
                }
            } catch (e: Exception) {
                if (showFeedback) showToast(context, "Erro de rede: ${e.message ?: "verifique sua conexao"}")
            }
        }.start()
    }

    private fun showToast(context: Context, message: String) {
        val mainHandler = Handler(Looper.getMainLooper())
        mainHandler.post {
            Toast.makeText(context, message, Toast.LENGTH_LONG).show()
        }
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
        return false
    }

    private fun downloadAndInstall(
        context: Context, url: String, fileName: String,
        remoteVersion: String, prefs: android.content.SharedPreferences
    ) {
        try {
            val request = DownloadManager.Request(Uri.parse(url)).apply {
                setTitle("Meggy — Atualizacao v$remoteVersion")
                setDescription("Baixando nova versao do app...")
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
                            prefs.edit().putString(KEY_DOWNLOADED_VERSION, remoteVersion).apply()
                            installApk(context, file)
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
            showToast(context, "Erro ao baixar: ${e.message}")
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
            showToast(context, "Nao foi possivel instalar. Baixe manualmente.")
        }
    }
}
