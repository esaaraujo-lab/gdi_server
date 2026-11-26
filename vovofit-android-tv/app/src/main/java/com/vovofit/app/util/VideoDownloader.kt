package com.vovofit.app.util

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Environment
import java.io.File

/**
 * 1.0.40 — escritor dos downloads de aulas (porte do VideoDownloader
 * da Meggy 2.7.58, adaptado): enfileira o vídeo da aula no
 * `DownloadManager` do sistema para a pasta pública
 * `Download/VovoFit/`, com o cookie de sessão (os links de playback
 * são autenticados) e regista a entrada no [DownloadRegistry] — é o
 * registo que a tela de Downloads lista.
 *
 * O download corre no sistema, em 2º plano: nunca bloqueia a
 * reprodução. O gate "só Wi-Fi" (`SessionManager.wifiOnlyDownloads`)
 * é verificado pelo CHAMADOR antes de enfileirar (a UI mostra o
 * aviso); aqui aplica-se também `setAllowedOverMetered(!wifiOnly)`
 * como segunda barreira.
 */
object VideoDownloader {

    sealed class Outcome {
        data class Started(val entry: DownloadRegistry.Entry) : Outcome()
        object AlreadyDownloaded : Outcome()
        object Failed : Outcome()
    }

    /**
     * Enfileira o download de [url] (URL completa de playback) para a
     * aula ([folderPath] + [videoName]); [lessonName] é o nome de
     * apresentação (o tema da aula). Devolve o resultado sem lançar.
     */
    fun enqueue(
        context: Context,
        url: String,
        folderPath: String,
        videoName: String,
        lessonName: String
    ): Outcome {
        val existing = DownloadRegistry.find(context, folderPath, videoName)
        if (existing != null && existing.exists()) return Outcome.AlreadyDownloaded

        val fileName = DownloadRegistry.fileNameFor(videoName, folderPath)
        val target = File(DownloadRegistry.downloadsDir(), fileName)
        // Ficheiro órfão com o mesmo nome (sem registo): remove-se
        // para o DownloadManager não falhar por colisão.
        if (target.exists() && existing == null) {
            try {
                target.delete()
            } catch (_: Exception) {
            }
        }

        val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as? DownloadManager
            ?: return Outcome.Failed
        val sm = SessionManager.get(context)
        val request = DownloadManager.Request(Uri.parse(url)).apply {
            setTitle(lessonName)
            setDescription(videoName)
            setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            setDestinationInExternalPublicDir(
                Environment.DIRECTORY_DOWNLOADS,
                "${DownloadRegistry.SUBDIR}/$fileName"
            )
            setAllowedOverMetered(!sm.wifiOnlyDownloads)
            setAllowedOverRoaming(false)
            val cookie = sm.sessionCookie
            if (!cookie.isNullOrBlank()) {
                addRequestHeader("Cookie", "session=$cookie")
            }
            addRequestHeader("User-Agent", "VovoFitNative/1.0")
        }
        val id = try {
            dm.enqueue(request)
        } catch (_: Exception) {
            return Outcome.Failed
        }
        val entry = DownloadRegistry.Entry(
            fileName = fileName,
            lessonName = lessonName,
            folderPath = folderPath,
            videoName = videoName,
            size = 0L,
            downloadedAt = System.currentTimeMillis(),
            downloadId = id
        )
        DownloadRegistry.register(context, entry)
        return Outcome.Started(entry)
    }

    /** Estado de um download enfileirado (DownloadManager.Query). */
    fun status(context: Context, entry: DownloadRegistry.Entry): Int? {
        if (entry.downloadId < 0) return null
        val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as? DownloadManager
            ?: return null
        return try {
            dm.query(DownloadManager.Query().setFilterById(entry.downloadId))?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val idx = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
                    if (idx >= 0) cursor.getInt(idx) else null
                } else null
            }
        } catch (_: Exception) {
            null
        }
    }
}
