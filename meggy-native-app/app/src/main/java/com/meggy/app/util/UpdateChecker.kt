package com.meggy.app.util

import android.app.Activity
import android.app.AlertDialog
import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.FileProvider
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * v2.7.4 — UpdateChecker com filtro por tag prefix native-v*
 *
 * ★ Mudanças v2.7.4 (instalação dentro do app):
 *  - Download IN-APP com progresso visível (diálogo com barra de progresso
 *    + % + Cancelar) via OkHttp — em algumas TVs o DownloadManager não
 *    mostra nada e o usuário não sabe que está baixando. O DownloadManager
 *    continua como fallback se o download in-app falhar.
 *  - Permissão de instalar de fontes desconhecidas: antes de instalar,
 *    verifica packageManager.canRequestPackageInstalls(). Se não concedida,
 *    abre a tela do sistema (ACTION_MANAGE_UNKNOWN_APP_SOURCES) e guarda
 *    o APK como "pendente" — na próxima verificação (ou ao abrir o app),
 *    com a permissão concedida, a instalação dispara sozinha.
 *  - Instalador ausente: se nenhum app resolve o intent de instalação
 *    (algumas TVs não têm instalador), mostra diálogo com o caminho do APK
 *    e instruções em vez de falhar em silêncio.
 *  - Confirmação: toast "Instalador aberto — confirme a instalação" quando
 *    o instalador é disparado com sucesso.
 *  - A consulta de versão SEMPRE vai à API de releases do GitHub e pega a
 *    primeira release com prefixo native-v* (per_page=100 para a release
 *    nunca cair da primeira página). Nenhum cache de versão.
 */
object UpdateChecker {

    private const val PREFS_UPDATE = "meggy_update"
    private const val KEY_LAST_CHECK = "last_check_ms"
    private const val CHECK_INTERVAL_MS = 24L * 60 * 60 * 1000 // 24h

    /**
     * v2.7.6 — Checagem com throttle (máx. 1×/24h, persistido em prefs).
     * v2.7.9 — timestamp só após HTTP 200 + corpo válido
     * (antes era gravado ANTES da rede e uma falha queimava a janela).
     *
     * Motivo (UPDATECHECKER_DIAGNOSIS.md): a 2.7.2 só checava no onCreate
     * da Home e falhava 100% silenciosa — por isso o Elton ficou na 2.7.2.
     * Agora a Home re-checa também no onResume, mas o throttle impede
     * chamadas repetidas à API do GitHub (limite 60 req/h sem auth).
     *
     * O resume de um APK pendente NUNCA é adiado pelo throttle: um APK
     * já baixado tem que instalar na hora, mesmo que a checagem esteja
     * dentro da janela de 24h.
     */
    fun checkForUpdateThrottled(context: Context, currentVersion: String) {
        // 1) APK pendente primeiro — nunca atrasado pelo throttle. Se
        // instalou, retorna (o checkForUpdate faria a mesma instalação).
        if (resumePendingApk(context)) return
        // 2) Throttle: 1×/24h.
        val prefs = context.getSharedPreferences(PREFS_UPDATE, Context.MODE_PRIVATE)
        val last = prefs.getLong(KEY_LAST_CHECK, 0L)
        val now = System.currentTimeMillis()
        if (now - last < CHECK_INTERVAL_MS) return
        // v2.7.9 — o timestamp NÃO é gravado aqui: só após uma
        // resposta bem-sucedida (HTTP 200 + corpo JSON válido) dentro de
        // checkForUpdate. Uma checagem que falha (sem rede / rate limit)
        // não queima a janela de 24h.
        checkForUpdate(context, currentVersion, showFeedback = false)
    }

    /**
     * v2.7.6 — Retoma a instalação de um APK já baixado (KEY_PENDING_APK),
     * se existir. Mesma lógica do início de checkForUpdate (v2.7.4),
     * extraída para ser chamada antes do throttle. Retorna true quando
     * instalou (ou quando não havia APK pendente instalável — o
     * chamador decide se segue para a checagem de rede).
     */
    fun resumePendingApk(context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREFS_UPDATE, Context.MODE_PRIVATE)
        val pending = prefs.getString(KEY_PENDING_APK, null) ?: return false
        val file = java.io.File(pending)
        if (!file.exists()) {
            prefs.edit().remove(KEY_PENDING_APK).apply()
            return false
        }
        if (!canInstallPackages(context)) return false
        prefs.edit().remove(KEY_PENDING_APK).apply()
        showToast(context, "Instalando atualização...")
        installApk(context, file)
        return true
    }


    private const val GITHUB_RELEASES_API = "https://api.github.com/repos/esaaraujo-lab/gdi_server/releases?per_page=100"
    private const val TAG_PREFIX = "native-v"
    private const val PREFS_NAME = "meggy_update"
    private const val KEY_DOWNLOADED_VERSION = "downloaded_version"
    private const val KEY_PENDING_APK = "pending_apk_path"

    fun checkForUpdate(context: Context, currentVersion: String, showFeedback: Boolean = false) {
        // ★ v2.7.4: APK pendente (usuário acabou de conceder a permissão de
        // instalar) — dispara a instalação agora, sem baixar de novo.
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val pendingPath = prefs.getString(KEY_PENDING_APK, null)
        if (!pendingPath.isNullOrBlank()) {
            val pendingFile = File(pendingPath)
            if (pendingFile.exists() && canInstallPackages(context)) {
                prefs.edit().remove(KEY_PENDING_APK).apply()
                showToast(context, "Instalando atualização...")
                installApk(context, pendingFile)
                return
            } else if (!pendingFile.exists()) {
                prefs.edit().remove(KEY_PENDING_APK).apply()
            }
        }

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
                    .header("User-Agent", "MeggyNative-UpdateChecker")
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

                // v2.7.9 — checagem OK (HTTP 200 + corpo válido): grava o
                // timestamp do throttle agora. Falhas de rede/HTTP acima
                // retornam antes daqui e não queimam a janela de 24h.
                prefs.edit().putLong(KEY_LAST_CHECK, System.currentTimeMillis()).apply()

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

                // Versao remota e mais nova → download in-app + install
                if (isNewer(remoteVersion, localVersion) && apkUrl != null) {
                    val sizeStr = if (apkSize > 0) " (${apkSize / 1024 / 1024} MB)" else ""
                    val fileName = "meggy-$remoteVersion.apk"

                    val lastDownloaded = prefs.getString(KEY_DOWNLOADED_VERSION, "") ?: ""
                    val downloadedFile = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName)

                    if (downloadedFile.exists() && lastDownloaded == remoteVersion) {
                        showToast(context, "Instalando v$remoteVersion...")
                        installApk(context, downloadedFile)
                    } else {
                        showToast(context, "Baixando v$remoteVersion...$sizeStr")
                        downloadInApp(context, apkUrl, fileName, remoteVersion, apkSize, prefs)
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
        Handler(Looper.getMainLooper()).post {
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

    /** Android 8+: o app pode pedir para instalar de fontes desconhecidas? */
    private fun canInstallPackages(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.packageManager.canRequestPackageInstalls()
        } else {
            true
        }
    }

    /**
     * ★ v2.7.4: download IN-APP com progresso visível.
     * Diálogo com barra de progresso + % + botão Cancelar (funciona em TV).
     * Em caso de falha, cai para o DownloadManager do sistema (fluxo antigo).
     */
    private fun downloadInApp(
        context: Context, url: String, fileName: String,
        remoteVersion: String, expectedSize: Long,
        prefs: android.content.SharedPreferences
    ) {
        val mainHandler = Handler(Looper.getMainLooper())
        val cancelled = AtomicBoolean(false)
        var dialog: AlertDialog? = null
        var progressBar: ProgressBar? = null
        var progressText: TextView? = null

        // Diálogo de progresso (só quando o contexto é uma Activity).
        if (context is Activity) {
            mainHandler.post {
                val bar = ProgressBar(context, null, android.R.attr.progressBarStyleHorizontal).apply {
                    max = 100
                    isIndeterminate = expectedSize <= 0
                }
                val text = TextView(context).apply {
                    text = "Baixando v$remoteVersion... 0%"
                    setPadding(48, 16, 48, 0)
                }
                val layout = android.widget.LinearLayout(context).apply {
                    orientation = android.widget.LinearLayout.VERTICAL
                    setPadding(48, 32, 48, 16)
                    addView(bar, android.widget.LinearLayout.LayoutParams(
                        android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                        android.widget.LinearLayout.LayoutParams.WRAP_CONTENT))
                    addView(text)
                }
                progressBar = bar
                progressText = text
                dialog = AlertDialog.Builder(context)
                    .setTitle("Meggy — Atualização v$remoteVersion")
                    .setView(layout)
                    .setCancelable(false)
                    .setNegativeButton("Cancelar") { _, _ ->
                        cancelled.set(true)
                    }
                    .create()
                dialog?.show()
            }
        }

        Thread {
            val target = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName)
            try {
                val client = OkHttpClient.Builder()
                    .connectTimeout(15, TimeUnit.SECONDS)
                    .readTimeout(60, TimeUnit.SECONDS)
                    .build()
                val request = Request.Builder()
                    .url(url)
                    .header("User-Agent", "MeggyNative-UpdateChecker")
                    .build()
                val response = client.newCall(request).execute()
                if (!response.isSuccessful) throw Exception("HTTP ${response.code}")
                val body = response.body ?: throw Exception("resposta vazia")
                val total = body.contentLength().takeIf { it > 0 } ?: expectedSize
                var downloaded = 0L
                val buffer = ByteArray(8192)
                body.byteStream().use { input ->
                    FileOutputStream(target).use { output ->
                        var read: Int
                        while (input.read(buffer).also { read = it } != -1) {
                            if (cancelled.get()) throw InterruptedException("cancelado")
                            output.write(buffer, 0, read)
                            downloaded += read
                            if (total > 0) {
                                val pct = ((downloaded * 100) / total).toInt().coerceIn(0, 100)
                                mainHandler.post {
                                    progressBar?.progress = pct
                                    progressText?.text = "Baixando v$remoteVersion... $pct%"
                                }
                            }
                        }
                        output.flush()
                    }
                }
                mainHandler.post { dialog?.dismiss() }
                prefs.edit().putString(KEY_DOWNLOADED_VERSION, remoteVersion).apply()
                installApk(context, target)
            } catch (e: InterruptedException) {
                mainHandler.post { dialog?.dismiss() }
                target.delete()
                showToast(context, "Download cancelado")
            } catch (e: Exception) {
                mainHandler.post { dialog?.dismiss() }
                // Fallback: fluxo antigo via DownloadManager do sistema.
                showToast(context, "Download direto falhou — tentando pelo sistema...")
                downloadAndInstall(context, url, fileName, remoteVersion, prefs)
            }
        }.start()
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

    /**
     * ★ v2.7.4: instala o APK com o fluxo completo:
     *  1. Se a permissão de fontes desconhecidas não foi concedida, abre a
     *     tela do sistema para concedê-la e guarda o APK como pendente.
     *  2. Se nenhum instalador resolve o intent (algumas TVs), mostra um
     *     diálogo com o caminho do APK em vez de falhar em silêncio.
     *  3. Se o instalador abrir, confirma com toast.
     */
    private fun installApk(context: Context, file: File) {
        // Passo 1: permissão de instalar de fontes desconhecidas.
        if (!canInstallPackages(context)) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().putString(KEY_PENDING_APK, file.absolutePath).apply()
            Handler(Looper.getMainLooper()).post {
                if (context is Activity) {
                    AlertDialog.Builder(context)
                        .setTitle("Permitir instalação")
                        .setMessage("Para atualizar, permita que o Meggy instale apps de fontes desconhecidas. Depois de ativar, volte ao app — a instalação começa sozinha.")
                        .setPositiveButton("Abrir configurações") { _, _ ->
                            val intent = Intent(
                                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                Uri.parse("package:${context.packageName}")
                            ).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK }
                            try { context.startActivity(intent) } catch (_: Exception) {
                                showToast(context, "Abra Configurações > Apps > Meggy > Instalar apps desconhecidos")
                            }
                        }
                        .setNegativeButton("Depois", null)
                        .show()
                } else {
                    showToast(context, "Ative \"Instalar apps desconhecidos\" para o Meggy e tente de novo")
                    val intent = Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:${context.packageName}")
                    ).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK }
                    try { context.startActivity(intent) } catch (_: Exception) {}
                }
            }
            return
        }

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

            // Passo 2: nenhum instalador no aparelho (algumas TVs).
            if (resInfo.isEmpty()) {
                val altIntent = Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
                    setDataAndType(apkUri, "application/vnd.android.package-archive")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
                }
                val altInfo = context.packageManager.queryIntentActivities(altIntent, 0)
                if (altInfo.isEmpty()) {
                    showInstallBlockedDialog(context, file)
                    return
                }
                try {
                    context.startActivity(altIntent)
                    showToast(context, "📲 Instalador aberto — confirme a instalação na tela do sistema")
                } catch (_: Exception) {
                    showInstallBlockedDialog(context, file)
                }
                return
            }

            context.startActivity(installIntent)
            // Passo 3: confirmação de que a instalação foi disparada.
            showToast(context, "📲 Instalador aberto — confirme a instalação na tela do sistema")
        } catch (e: Exception) {
            showInstallBlockedDialog(context, file)
        }
    }

    /** Diálogo quando o aparelho não tem instalador ou o intent falhou. */
    private fun showInstallBlockedDialog(context: Context, file: File) {
        Handler(Looper.getMainLooper()).post {
            if (context is Activity) {
                AlertDialog.Builder(context)
                    .setTitle("Não foi possível abrir o instalador")
                    .setMessage("O APK da nova versão já foi baixado e está em:\n\n${file.absolutePath}\n\nAbra um gerenciador de arquivos e toque no APK para instalar, ou ative \"Instalar apps desconhecidos\" nas configurações do aparelho.")
                    .setPositiveButton("OK", null)
                    .show()
            } else {
                showToast(context, "APK baixado em ${file.absolutePath} — instale manualmente")
            }
        }
    }
}
