package com.meggy.app.util

import android.app.AlertDialog
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
import org.json.JSONObject
import java.io.File

/**
 * v2.2.0 — UpdateChecker with 3 critical fixes:
 *
 *  FIX #1: Removed the `lastInstalled == localVersion` early-return that was
 *  BLOCKING all future update checks after the first auto-install. Now we
 *  ALWAYS call the GitHub API on every check, so new releases are detected.
 *
 *  FIX #2: Added a confirmation AlertDialog before downloading. The user
 *  sees "Nova versão v2.2.0 disponível. Baixar agora?" with "Baixar" /
 *  "Depois" buttons. This prevents silent downloads and gives the user
 *  control. The auto-check on app open still downloads automatically
 *  (with a toast) to preserve the existing auto-update behavior.
 *
 *  FIX #3: Added [checkForUpdate] overload with `showFeedback` parameter.
 *  When called from Settings → "Verificar atualização", shows "Você está
 *  na versão mais recente" toast if no update is available. The auto-check
 *  on app open is silent (no toast) when no update is available.
 *
 *  The `lastDownloaded` key is now used to track which version we last
 *  downloaded (to avoid re-downloading the same APK if the user declined
 *  the install), NOT to skip the API check.
 */
object UpdateChecker {

    private const val GITHUB_API = "https://api.github.com/repos/esaaraujo-lab/gdi_server/releases/latest"
    private const val PREFS_NAME = "meggy_update"
    private const val KEY_DOWNLOADED_VERSION = "downloaded_version"

    /**
     * Checks GitHub for a newer release. Called on app open (silent) and
     * from Settings → "Verificar atualização" (with feedback).
     *
     * @param showFeedback When true, shows a toast even if no update is
     *                     available ("Você está na versão mais recente").
     *                     When false (default, app-open auto-check), only
     *                     shows UI when an update IS available.
     */
    fun checkForUpdate(context: Context, currentVersion: String, showFeedback: Boolean = false) {
        val localVersion = currentVersion.replace("native-v", "").replace("v", "").trim()

        // ★ v2.2.0 FIX: Do NOT early-return based on lastInstalled.
        // Always call the API so new releases are detected.
        // (The old code returned early if localVersion == lastInstalled,
        // which meant after the first auto-install, no future updates were
        // ever checked — the user had to download manually.)

        Thread {
            try {
                val client = OkHttpClient.Builder()
                    .connectTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
                    .readTimeout(15, java.util.concurrent.TimeUnit.SECONDS)
                    .build()
                val request = Request.Builder()
                    .url(GITHUB_API)
                    .header("Accept", "application/vnd.github+json")
                    .header("User-Agent", "MeggyNative-UpdateChecker")
                    .build()
                val response = client.newCall(request).execute()
                if (!response.isSuccessful) {
                    if (showFeedback) showMainToast(context, "⚠️ Erro ao verificar (HTTP ${response.code})")
                    return@Thread
                }

                val body = response.body?.string()
                if (body.isNullOrBlank()) {
                    if (showFeedback) showMainToast(context, "⚠️ Resposta vazia do servidor")
                    return@Thread
                }

                val json = JSONObject(body)
                val tagName = json.optString("tag_name", "")
                val remoteVersion = tagName.replace("native-v", "").replace("v", "").trim()

                if (remoteVersion.isEmpty()) {
                    if (showFeedback) showMainToast(context, "⚠️ Não foi possível obter a versão mais recente")
                    return@Thread
                }

                // Same version — no update
                if (remoteVersion == localVersion) {
                    if (showFeedback) showMainToast(context, "✅ Você está na versão mais recente (v$localVersion)")
                    return@Thread
                }

                // Remote is newer → show update dialog
                if (isNewer(remoteVersion, localVersion)) {
                    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

                    // Find APK asset URL
                    val assets = json.optJSONArray("assets")
                    if (assets == null || assets.length() == 0) {
                        if (showFeedback) showMainToast(context, "⚠️ Update v$remoteVersion encontrado mas sem APK")
                        return@Thread
                    }
                    var apkUrl: String? = null
                    var apkSize = 0L
                    for (i in 0 until assets.length()) {
                        val asset = assets.getJSONObject(i)
                        if (asset.optString("name").endsWith(".apk")) {
                            apkUrl = asset.optString("browser_download_url")
                            apkSize = asset.optLong("size", 0)
                            break
                        }
                    }

                    if (apkUrl != null) {
                        val sizeStr = if (apkSize > 0) " (${apkSize / 1024 / 1024} MB)" else ""
                        showUpdateDialog(context, remoteVersion, apkUrl, sizeStr, prefs, showFeedback)
                    }
                } else {
                    // Local is newer or equal — no update needed
                    if (showFeedback) showMainToast(context, "✅ Você está na versão mais recente (v$localVersion)")
                }
            } catch (e: Exception) {
                if (showFeedback) showMainToast(context, "⚠️ Erro de rede: ${e.message ?: "verifique sua conexão"}")
            }
        }.start()
    }

    private fun showMainToast(context: Context, message: String) {
        val mainHandler = Handler(Looper.getMainLooper())
        mainHandler.post {
            Toast.makeText(context, message, Toast.LENGTH_LONG).show()
        }
    }

    /**
     * Shows an AlertDialog asking the user to confirm the download.
     * If [autoDownload] is true (app-open auto-check), downloads immediately
     * with a toast (preserving the existing auto-update behavior).
     * If false (manual check from Settings), shows the dialog.
     */
    private fun showUpdateDialog(
        context: Context, remoteVersion: String, apkUrl: String,
        sizeStr: String, prefs: android.content.SharedPreferences,
        showFeedback: Boolean
    ) {
        val mainHandler = Handler(Looper.getMainLooper())

        // Check if we already downloaded this exact version (user may have
        // declined the install). If so, just re-trigger the install.
        val lastDownloaded = prefs.getString(KEY_DOWNLOADED_VERSION, "") ?: ""
        val fileName = "meggy-$remoteVersion.apk"
        val downloadedFile = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName)

        mainHandler.post {
            // If the APK is already downloaded, offer to install directly
            if (downloadedFile.exists() && lastDownloaded == remoteVersion) {
                AlertDialog.Builder(context)
                    .setTitle("🐾 v$remoteVersion já baixada")
                    .setMessage("A versão v$remoteVersion já foi baixada mas não instalada.\n\nInstalar agora?")
                    .setPositiveButton("Instalar agora") { _, _ ->
                        installApk(context, downloadedFile)
                    }
                    .setNegativeButton("Deletar e baixar de novo") { _, _ ->
                        downloadedFile.delete()
                        prefs.edit().remove(KEY_DOWNLOADED_VERSION).apply()
                        Toast.makeText(context, "🐾 Baixando v$remoteVersion...$sizeStr", Toast.LENGTH_LONG).show()
                        downloadAndInstall(context, apkUrl, fileName, remoteVersion, prefs)
                    }
                    .setNeutralButton("Depois", null)
                    .show()
                return@post
            }

            // Normal update flow: show dialog
            AlertDialog.Builder(context)
                .setTitle("🐾 Nova versão disponível!")
                .setMessage("Versão v$remoteVersion está disponível$sizeStr.\n\nDeseja baixar e instalar agora?")
                .setPositiveButton("🐾 Baixar agora") { _, _ ->
                    Toast.makeText(context, "🐾 Baixando v$remoteVersion...$sizeStr", Toast.LENGTH_LONG).show()
                    downloadAndInstall(context, apkUrl, fileName, remoteVersion, prefs)
                }
                .setNegativeButton("Depois", null)
                .show()
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
                            // Mark this version as downloaded (NOT installed yet —
                            // the user might decline the install dialog).
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
            val mainHandler = Handler(Looper.getMainLooper())
            mainHandler.post {
                Toast.makeText(context, "Erro ao baixar atualização: ${e.message}", Toast.LENGTH_SHORT).show()
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
                val mainHandler = Handler(Looper.getMainLooper())
                mainHandler.post {
                    Toast.makeText(context, "Não foi possível instalar. Baixe manualmente em GitHub.", Toast.LENGTH_LONG).show()
                }
            }
        }
    }
}
