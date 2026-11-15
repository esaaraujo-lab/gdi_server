package com.meggy.app.util

import android.app.Activity
import android.app.AlertDialog
import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.provider.Settings
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.FileProvider
import com.meggy.app.MeggyApp
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
 *
 * ★ v2.7.11 — AUTO-UPDATE (ordem do Elton 2026-11-14):
 *  - A Home já chama checkForUpdateThrottled no onCreate E no onResume
 *    (a Splash leva à Home em ~1,5s) — ou seja, o app checa sozinho a
 *    cada abertura, sem tocar em nada. O throttle passa a 1×/1h (R8A).
 *  - Achando versão nova, o APK BAIXA SOZINHO em 2º plano (sem o
 *    diálogo modal de progresso; só um toast discreto) e, ao terminar,
 *    ABRE o instalador do sistema SOZINHO.
 *  - NUNCA interrompe reprodução: se o PlayerActivity está em 1º
 *    plano, o instalador NÃO abre — o APK fica pendente e dispara ao
 *    voltar à Home (resumePendingApk).
 *  - NUNCA baixa/lança 2× a mesma versão: `offered_version` registra a
 *    versão cujo instalador já foi aberto (ou cuja permissão já foi
 *    pedida); o modo automático pula essa versão. A checagem MANUAL em
 *    Ajustes ignora o guarda e sempre oferece de novo.
 *  - Falha de rede/HTTP no automático = silenciosa, sem toast, e NÃO
 *    queima a janela de 24h (regra da 2.7.9, mantida).
 *  - "Baixar só no Wi-Fi" (Ajustes) controla SÓ o cache de vídeo do
 *    ExoPlayer (VideoCache) — NÃO é um ajuste geral de download; por
 *    isso o APK de atualização baixa em qualquer conexão (um APK de
 *    ~17 MB parado por falta de Wi-Fi deixaria o auto-update morto na
 *    prática). Decisão documentada, não um bug.
 *  - LIMITE REAL DO ANDROID (honesto): não existe instalação
 *    silenciosa sem privilégios de sistema. O instalador do sistema
 *    SEMPRE exige o toque do usuário em "Instalar", e a permissão
 *    "Instalar apps desconhecidos" precisa ser concedida uma vez (o
 *    app leva aos ajustes e retoma sozinho depois). O automático cobre
 *    checar + baixar + abrir o instalador — o toque final é do sistema.
 *
 * ★ §9 (GOLDEN_RULES.md, 2026-11-15) — pasta pública Download:
 *  - O APK descarrega SEMPRE para Environment.DIRECTORY_DOWNLOADS
 *    (pasta pública Download) — nunca para o diretório privado do app.
 *  - file_paths.xml ganhou <external-path path="Download/">: sem ele
 *    o FileProvider não serve o APK e o instalador nunca abre.
 *  - Depois de a instalação ser confirmada, o APK é apagado
 *    (deleteDownloadedApkIfInstalled + UpdateCleanupReceiver).
 * ★ R8A (2026-11-15) — throttle 24h → 1h (regra do Elton §11);
 *   falha de checagem/download espera 15 min (não queima a janela de
 *   1h, nem tenta em cada onResume); guarda em memória 30 s contra a
 *   dupla checagem onCreate+onResume; "Depois" na permissão só volta a
 *   perguntar 24h depois e já não mata o auto-update da versão;
 *   <queries> no manifesto p/ o instalador ser visível (API 30+).
 */
object UpdateChecker {

    private const val PREFS_UPDATE = "meggy_update"
    private const val KEY_LAST_CHECK = "last_check_ms"
    // R8A — intervalo entre checagens de rede: 1h (era 24h). Regra do
    // Elton (§11): ao abrir o app, se houver versão nova, a TV baixa e
    // instala — com 24h uma release publicada depois da última checagem
    // só aparecia até 24h depois. 1h é o mínimo seguro sem martelar a
    // API do GitHub (sem auth: 60 req/h por IP; 1 aparelho = 24/dia).
    private const val CHECK_INTERVAL_MS = 1L * 60 * 60 * 1000 // 1h
    // R8A — falha de checagem NÃO queima a janela de 1h, mas também não
    // pode tentar em cada onResume: após uma falha, espera 15 min.
    private const val KEY_LAST_FAILED_CHECK = "last_failed_check_ms"
    private const val FAILED_CHECK_RETRY_MS = 15L * 60 * 1000 // 15 min
    // R8A — guarda em memória (30 s) p/ a dupla checagem Home onCreate +
    // onResume não disparar 2 requests antes de o timestamp gravar
    // (mesmo padrão da BiBi 2.1.9; a Meggy não o tinha).
    private var lastCheckAttemptMs = 0L
    // R8A — permissão recusada ("Depois"): só volta a perguntar 24h
    // depois (mesmo padrão da Vovó 1.0.8). Antes, o "Depois" marcava a
    // versão como oferecida e o auto-update morria p/ essa versão.
    private const val KEY_PERMISSION_DECLINED_AT = "perm_declined_at"
    private const val PERMISSION_REPROMPT_MS = 24L * 60 * 60 * 1000 // 24h

    /**
     * v2.7.6 — Checagem com throttle (máx. 1×/1h desde a R8A, era 1×/24h; persistido em prefs).
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
     * dentro da janela de 1h.
     */
    fun checkForUpdateThrottled(context: Context, currentVersion: String) {
        // §9 — lixo da atualização anterior: se o APK descarregado já
        // foi instalado, apaga-o da pasta Download (só depois de a
        // instalação ser confirmada). Corre sempre, mesmo dentro da
        // janela de 24h do throttle — não é uma checagem de rede.
        deleteDownloadedApkIfInstalled(context)
        // 1) APK pendente primeiro — nunca atrasado pelo throttle. Se
        // instalou, retorna (o checkForUpdate faria a mesma instalação).
        if (resumePendingApk(context)) return
        // R8A — guarda em memória (30 s): onCreate + onResume da Home
        // disparam no mesmo arranque; sem isto iam 2 requests ao GitHub
        // antes de o timestamp da checagem gravar.
        val nowAttempt = System.currentTimeMillis()
        if (nowAttempt - lastCheckAttemptMs < 30_000L) return
        lastCheckAttemptMs = nowAttempt
        // 2) Throttle: 1×/1h (R8A; era 1×/24h).
        val prefs = context.getSharedPreferences(PREFS_UPDATE, Context.MODE_PRIVATE)
        val last = prefs.getLong(KEY_LAST_CHECK, 0L)
        val now = System.currentTimeMillis()
        if (now - last < CHECK_INTERVAL_MS) return
        // R8A — falha recente: espera FAILED_CHECK_RETRY_MS antes de
        // tentar de novo. Sem isto, cada onResume disparava 1 request
        // enquanto a rede/GitHub estivesse fora.
        val lastFailed = prefs.getLong(KEY_LAST_FAILED_CHECK, 0L)
        if (now - lastFailed < FAILED_CHECK_RETRY_MS) return
        // v2.7.9 — o timestamp NÃO é gravado aqui: só após uma
        // resposta bem-sucedida (HTTP 200 + corpo JSON válido) dentro de
        // checkForUpdate. Uma checagem que falha (sem rede / rate limit)
        // não queima a janela de 1h (R8A: espera 15 min — ver FAILED_CHECK_RETRY_MS).
        checkForUpdate(context, currentVersion, showFeedback = false, auto = true)
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
    // v2.7.11 — versão cujo instalador já foi aberto (ou cuja permissão
    // de instalar já foi pedida) no modo automático. Evita baixar/lançar
    // de novo uma versão que o usuário dispensou. A checagem manual
    // (Ajustes) ignora este guarda.
    private const val KEY_OFFERED_VERSION = "offered_version"
    // §9 (GOLDEN_RULES.md, 2026-11-15) — atualização SEMPRE pela pasta
    // pública Download. Até aqui o APK ia para
    // getExternalFilesDir(DIRECTORY_DOWNLOADS)
    // (Android/data/<pacote>/files/Download) e o file_paths.xml só
    // declarava <cache-path> — ou seja, o FileProvider NÃO conseguia
    // servir o APK (IllegalArgumentException) e o instalador nunca
    // abria; confirmado nos APKs publicados 2.7.14/2.1.13/1.0.12.
    private const val APK_MIME_TYPE = "application/vnd.android.package-archive"
    private const val APK_FILE_PREFIX = "meggy-"

    /**
     * §9 — ficheiro do APK de atualização na pasta pública Download.
     * getExternalStoragePublicDirectory está deprecado desde a API 29
     * mas continua a devolver o caminho real; a escrita em si, na
     * API 29+, passa pelo MediaStore (ver openPublicDownloadOutput).
     */
    @Suppress("DEPRECATION")
    private fun publicDownloadFile(fileName: String): File =
        File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), fileName)

    /** §9 — mesmo ficheiro no destino privado antigo (pré-§9), só para limpar lixo. */
    private fun legacyDownloadFile(context: Context, fileName: String): File =
        File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName)

    /**
     * §9 — abre a escrita do APK na pasta pública Download.
     * API 29+ (scoped storage): MediaStore.Downloads — sem permissões, o
     * ficheiro fica em /storage/emulated/0/Download e pertence ao app
     * (o instalador lê-o depois via FileProvider <external-path>).
     * API <=28: ficheiro direto (WRITE_EXTERNAL_STORAGE já declarada no
     * manifesto com maxSdkVersion 28). Remove primeiro um resto com o
     * mesmo nome para o MediaStore não criar "nome (1).apk".
     * Lança exceção se não conseguir abrir o destino (o chamador cai no
     * fallback do DownloadManager / no silêncio do automático).
     */
    private fun openPublicDownloadOutput(context: Context, fileName: String): Pair<File, java.io.OutputStream> {
        val target = publicDownloadFile(fileName)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            deletePublicDownload(context, fileName)
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, fileName)
                put(MediaStore.Downloads.MIME_TYPE, APK_MIME_TYPE)
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
            }
            val uri = context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: throw IllegalStateException("MediaStore insert falhou (Download)")
            val out = context.contentResolver.openOutputStream(uri)
                ?: throw IllegalStateException("MediaStore openOutputStream falhou (Download)")
            return target to out
        }
        target.parentFile?.mkdirs()
        return target to FileOutputStream(target)
    }

    /** §9 — apaga um APK da pasta pública Download (ficheiro + linha no MediaStore). Nunca lança. */
    private fun deletePublicDownload(context: Context, fileName: String) {
        try { publicDownloadFile(fileName).delete() } catch (_: Exception) {}
        deletePublicDownloadRow(context, fileName)
    }

    /** §9 — apaga as linhas do MediaStore.Downloads com este DISPLAY_NAME. Nunca lança. */
    private fun deletePublicDownloadRow(context: Context, fileName: String) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
        try {
            val uri = MediaStore.Downloads.EXTERNAL_CONTENT_URI
            context.contentResolver.query(
                uri, arrayOf(MediaStore.Downloads._ID),
                "${MediaStore.Downloads.DISPLAY_NAME} = ?",
                arrayOf(fileName), null
            )?.use { cursor ->
                val idIdx = cursor.getColumnIndexOrThrow(MediaStore.Downloads._ID)
                while (cursor.moveToNext()) {
                    val rowUri = ContentUris.withAppendedId(uri, cursor.getLong(idIdx))
                    try { context.contentResolver.delete(rowUri, null, null) } catch (_: Exception) {}
                }
            }
        } catch (_: Exception) {}
    }

    /** §9 — apaga o ficheiro do APK (pública ou legada). Nunca lança. */
    private fun deleteUpdateApk(context: Context, file: File) {
        try { file.delete() } catch (_: Exception) {}
        if (file.exists()) deletePublicDownloadRow(context, file.name)
    }

    /**
     * §9 — a versão instalada já é >= à versão do APK descarregado?
     * Primeiro pelo nome da versão (barato, sem ler o APK); se o nome
     * disser que ainda não instalou, confirma pelo versionCode do APK
     * (getPackageArchiveInfo). Se nem o APK se consegue ler, assume que
     * NÃO instalou (conservador: nunca apaga um APK por instalar).
     */
    @Suppress("DEPRECATION")
    private fun installedVersionAtLeast(context: Context, downloadedVersion: String, apkFile: File): Boolean {
        val pkgInfo = try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.packageManager.getPackageInfo(context.packageName, PackageManager.PackageInfoFlags.of(0))
            } else {
                context.packageManager.getPackageInfo(context.packageName, 0)
            }
        } catch (_: Exception) { return false }
        val installedName = pkgInfo.versionName ?: ""
        if (!isNewer(downloadedVersion, installedName)) return true
        val apkInfo = try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.packageManager.getPackageArchiveInfo(apkFile.absolutePath, PackageManager.PackageInfoFlags.of(0))
            } else {
                context.packageManager.getPackageArchiveInfo(apkFile.absolutePath, 0)
            }
        } catch (_: Exception) { null }
        val apkCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            apkInfo?.longVersionCode ?: -1L
        } else {
            apkInfo?.versionCode?.toLong() ?: -1L
        }
        val installedCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            pkgInfo.longVersionCode
        } else {
            pkgInfo.versionCode.toLong()
        }
        return apkCode > 0 && installedCode >= apkCode
    }

    /**
     * §9 — apaga o APK descarregado SÓ depois de a instalação ser
     * confirmada (versão instalada >= versão do APK). Chamado no arranque
     * (checkForUpdateThrottled/checkForUpdate, antes de qualquer retoma
     * de pendente e fora do throttle) e pelo UpdateCleanupReceiver
     * (MY_PACKAGE_REPLACED). Nunca apaga antes/durante a instalação:
     * se o usuário dispensou o instalador, a versão instalada continua
     * inferior e o ficheiro fica (o automático não re-oferece graças ao
     * guarda offered_version; o manual re-oferece). Limpa também um
     * resto do destino privado pré-§9 com a mesma versão. Devolve true
     * quando apagou pelo menos um ficheiro.
     */
    fun deleteDownloadedApkIfInstalled(context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val downloaded = prefs.getString(KEY_DOWNLOADED_VERSION, null) ?: return false
        val fileName = APK_FILE_PREFIX + downloaded + ".apk"
        val candidates = mutableListOf<Pair<File, String?>>()
        candidates += publicDownloadFile(fileName) to null
        candidates += legacyDownloadFile(context, fileName) to null
        prefs.getString(KEY_PENDING_APK, null)?.takeIf { it.isNotBlank() }?.let {
            candidates += File(it) to KEY_PENDING_APK
        }
        var deletedAny = false
        for ((file, prefKey) in candidates) {
            if (!file.exists()) continue
            if (!installedVersionAtLeast(context, downloaded, file)) continue
            deleteUpdateApk(context, file)
            if (prefKey != null) prefs.edit().remove(prefKey).apply()
            deletedAny = true
        }
        // Sem ficheiro restante, o marcador fica obsoleto — limpa-o para
        // esta verificação não correr em cada arranque.
        if (candidates.none { (file, _) -> file.exists() }) {
            prefs.edit().remove(KEY_DOWNLOADED_VERSION).apply()
        }
        return deletedAny
    }


    fun checkForUpdate(context: Context, currentVersion: String, showFeedback: Boolean = false, auto: Boolean = false) {
        // §9 — apaga o APK já instalado da pasta Download (ver
        // checkForUpdateThrottled); corre também na checagem manual.
        deleteDownloadedApkIfInstalled(context)
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
                    // R8A — falha: regista p/ tentar de novo em 15 min
                    // (não queima a janela de 1h, nem tenta em cada resume).
                    prefs.edit().putLong(KEY_LAST_FAILED_CHECK, System.currentTimeMillis()).apply()
                    if (showFeedback) showToast(context, "Erro ao verificar (HTTP ${response.code})")
                    return@Thread
                }

                val body = response.body?.string()
                if (body.isNullOrBlank()) {
                    prefs.edit().putLong(KEY_LAST_FAILED_CHECK, System.currentTimeMillis()).apply()
                    if (showFeedback) showToast(context, "Resposta vazia do servidor")
                    return@Thread
                }

                val releasesArray = JSONArray(body)

                // v2.7.9 — checagem OK (HTTP 200 + corpo válido): grava o
                // timestamp do throttle agora. Falhas de rede/HTTP acima
                // retornam antes daqui e não queimam a janela de 1h (R8A).
                prefs.edit().putLong(KEY_LAST_CHECK, System.currentTimeMillis())
                    .remove(KEY_LAST_FAILED_CHECK).apply()

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

                // v2.7.11 — modo automático: esta versão já foi oferecida
                // (instalador aberto ou permissão pedida) e não foi
                // instalada — não baixar nem lançar de novo. A checagem
                // manual em Ajustes ignora este guarda.
                val offered = prefs.getString(KEY_OFFERED_VERSION, "") ?: ""
                if (auto && remoteVersion == offered) return@Thread

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
                    val downloadedFile = publicDownloadFile(fileName)

                    if (downloadedFile.exists() && lastDownloaded == remoteVersion) {
                        showToast(context, "Instalando v$remoteVersion...")
                        installApk(context, downloadedFile, remoteVersion)
                    } else {
                        // v2.7.11 — automático: só um toast discreto (o
                        // download roda em 2º plano, sem diálogo modal).
                        if (auto) showToast(context, "Baixando atualização v$remoteVersion em segundo plano…")
                        else showToast(context, "Baixando v$remoteVersion...$sizeStr")
                        downloadInApp(context, apkUrl, fileName, remoteVersion, apkSize, prefs, silent = auto)
                    }
                } else {
                    if (showFeedback) showToast(context, "Voce esta na versao mais recente (v$localVersion)")
                }
            } catch (e: Exception) {
                // R8A — falha de rede: tenta de novo em 15 min.
                prefs.edit().putLong(KEY_LAST_FAILED_CHECK, System.currentTimeMillis()).apply()
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
        prefs: android.content.SharedPreferences,
        silent: Boolean = false
    ) {
        val mainHandler = Handler(Looper.getMainLooper())
        val cancelled = AtomicBoolean(false)
        var dialog: AlertDialog? = null
        var progressBar: ProgressBar? = null
        var progressText: TextView? = null

        // Diálogo de progresso (só quando o contexto é uma Activity).
        // v2.7.11 — no modo automático (silent) NÃO há diálogo modal: o
        // download é invisível, só o toast discreto do chamador.
        if (!silent && context is Activity) {
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
            try {
                // §9 — destino: pasta pública Download (ver
                // openPublicDownloadOutput). A abertura do stream está
                // dentro do try para uma falha aqui cair no fallback do
                // DownloadManager (ou no silêncio, no automático).
                val (target, downloadOut) = openPublicDownloadOutput(context, fileName)
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
                    downloadOut.use { output ->
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
                installApk(context, target, remoteVersion)
            } catch (e: InterruptedException) {
                mainHandler.post { dialog?.dismiss() }
                deletePublicDownload(context, fileName)
                showToast(context, "Download cancelado")
            } catch (e: Exception) {
                mainHandler.post { dialog?.dismiss() }
                // R8A — falha de download no automático: limpa o timestamp
                // da checagem (padrão da BiBi 2.1.9) e regista a falha p/
                // tentar de novo em 15 min, não só na próxima janela de 1h.
                if (silent) {
                    prefs.edit().remove(KEY_LAST_CHECK)
                        .putLong(KEY_LAST_FAILED_CHECK, System.currentTimeMillis()).apply()
                }
                // Fallback: fluxo antigo via DownloadManager do sistema.
                // v2.7.11 — no automático, o fallback também é silencioso
                // (sem toast): falha de rede não acorda o usuário.
                if (!silent) showToast(context, "Download direto falhou — tentando pelo sistema...")
                downloadAndInstall(context, url, fileName, remoteVersion, prefs, silent)
            }
        }.start()
    }

    private fun downloadAndInstall(
        context: Context, url: String, fileName: String,
        remoteVersion: String, prefs: android.content.SharedPreferences,
        silent: Boolean = false
    ) {
        try {
            val request = DownloadManager.Request(Uri.parse(url)).apply {
                setTitle("Meggy — Atualizacao v$remoteVersion")
                setDescription("Baixando nova versao do app...")
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                // §9 — pasta pública Download (o DownloadManager é um
                // serviço do sistema e escreve lá em qualquer API level).
                // setDestinationInExternalPublicDir está deprecado desde
                // a API 29 mas continua funcional; é o único destino
                // público que o DownloadManager oferece.
                setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
            }

            val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            val downloadId = dm.enqueue(request)

            val receiver = object : BroadcastReceiver() {
                override fun onReceive(ctx: Context?, intent: Intent?) {
                    val id = intent?.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) ?: -1
                    if (id == downloadId) {
                        val file = publicDownloadFile(fileName)
                        if (file.exists()) {
                            prefs.edit().putString(KEY_DOWNLOADED_VERSION, remoteVersion).apply()
                            installApk(context, file, remoteVersion)
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
            if (!silent) showToast(context, "Erro ao baixar: ${e.message}")
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
    private fun installApk(context: Context, file: File, version: String? = null) {
        // v2.7.11 — NUNCA interromper reprodução: com o player em 1º
        // plano, guarda o APK como pendente e NÃO abre o instalador.
        // Ao voltar à Home, resumePendingApk dispara sozinho.
        if (MeggyApp.isPlayerForeground()) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().putString(KEY_PENDING_APK, file.absolutePath).apply()
            return
        }
        // Passo 1: permissão de instalar de fontes desconhecidas.
        if (!canInstallPackages(context)) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().putString(KEY_PENDING_APK, file.absolutePath).apply()
            // R8A — "Depois" há menos de 24h: mantém pendente em
            // silêncio, sem perguntar de novo (padrão da Vovó 1.0.8).
            // NÃO marca a versão como oferecida aqui: sem a permissão o
            // instalador nunca abriu, e marcar mataria o auto-update
            // desta versão para sempre (bug da 2.7.11).
            val declinedAt = prefs.getLong(KEY_PERMISSION_DECLINED_AT, 0L)
            if (System.currentTimeMillis() - declinedAt < PERMISSION_REPROMPT_MS) return
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
                        .setNegativeButton("Depois") { _, _ ->
                            prefs.edit().putLong(KEY_PERMISSION_DECLINED_AT, System.currentTimeMillis()).apply()
                        }
                        .setOnCancelListener {
                            prefs.edit().putLong(KEY_PERMISSION_DECLINED_AT, System.currentTimeMillis()).apply()
                        }
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
                    if (version != null) {
                        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                            .edit().putString(KEY_OFFERED_VERSION, version).apply()
                    }
                    context.startActivity(altIntent)
                    showToast(context, "📲 Instalador aberto — confirme a instalação na tela do sistema")
                } catch (_: Exception) {
                    showInstallBlockedDialog(context, file)
                }
                return
            }

            // v2.7.11 — instalador aberto: registra como "oferecida"
            // para o automático não relançar esta versão se o usuário
            // dispensar a instalação (a checagem manual ignora o guarda).
            if (version != null) {
                context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .edit().putString(KEY_OFFERED_VERSION, version).apply()
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
