package com.vovofit.app.util

import android.content.Context
import android.content.SharedPreferences
import android.os.Environment
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * 1.0.40 — registo dos downloads de aulas (porte do DownloadRegistry
 * da Meggy 2.7.58, adaptado: pasta pública `Download/VovoFit/` e
 * preferências próprias `vovo_downloads`).
 *
 * A tela de Downloads lista ESTE REGISTO (SharedPreferences, uma
 * entrada por aula), nunca um scan da pasta — o scan apanharia os
 * APKs de update e ficheiros estranhos. Entradas cujo ficheiro já
 * não existe (apagado fora do app) são limpas ao abrir a tela
 * (prune).
 */
object DownloadRegistry {

    data class Entry(
        val fileName: String,
        val lessonName: String,
        val folderPath: String,
        val videoName: String,
        val size: Long,
        val downloadedAt: Long,
        val downloadId: Long
    ) {
        fun file(): File = File(downloadsDir(), fileName)
        fun exists(): Boolean = file().exists()
    }

    private const val PREFS_NAME = "vovo_downloads"
    private const val KEY_ENTRIES = "entries_json"
    const val SUBDIR = "VovoFit"

    fun downloadsDir(): File =
        File(
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
            SUBDIR
        )

    private fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private fun readAll(context: Context): MutableList<Entry> {
        val raw = prefs(context).getString(KEY_ENTRIES, "[]") ?: "[]"
        val out = ArrayList<Entry>()
        try {
            val arr = JSONArray(raw)
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                out.add(
                    Entry(
                        fileName = o.optString("fileName"),
                        lessonName = o.optString("lessonName"),
                        folderPath = o.optString("folderPath"),
                        videoName = o.optString("videoName"),
                        size = o.optLong("size", 0L),
                        downloadedAt = o.optLong("downloadedAt", 0L),
                        downloadId = o.optLong("downloadId", -1L)
                    )
                )
            }
        } catch (_: Exception) {
            // Registo corrompido = lista vazia (nunca crash).
        }
        return out
    }

    private fun writeAll(context: Context, entries: List<Entry>) {
        val arr = JSONArray()
        for (e in entries) {
            val o = JSONObject()
            o.put("fileName", e.fileName)
            o.put("lessonName", e.lessonName)
            o.put("folderPath", e.folderPath)
            o.put("videoName", e.videoName)
            o.put("size", e.size)
            o.put("downloadedAt", e.downloadedAt)
            o.put("downloadId", e.downloadId)
            arr.put(o)
        }
        prefs(context).edit().putString(KEY_ENTRIES, arr.toString()).apply()
    }

    /** Lista actual, mais recente primeiro. */
    fun list(context: Context): List<Entry> =
        readAll(context).sortedByDescending { it.downloadedAt }

    /** Entrada de uma aula (pela mesma chave do resume: pasta + vídeo). */
    fun find(context: Context, folderPath: String, videoName: String): Entry? =
        readAll(context).firstOrNull { it.folderPath == folderPath && it.videoName == videoName }

    /** Regista (ou substitui) o download de uma aula. */
    fun register(context: Context, entry: Entry) {
        val all = readAll(context)
        all.removeAll { it.folderPath == entry.folderPath && it.videoName == entry.videoName }
        all.add(entry)
        writeAll(context, all)
    }

    /** Remove a entrada E o ficheiro (acção Apagar da tela). */
    fun remove(context: Context, entry: Entry) {
        try {
            entry.file().delete()
        } catch (_: Exception) {
        }
        val all = readAll(context)
        all.removeAll { it.folderPath == entry.folderPath && it.videoName == entry.videoName }
        writeAll(context, all)
    }

    /** Limpa entradas sem ficheiro (apagados fora do app). Devolve a lista limpa. */
    fun prune(context: Context): List<Entry> {
        val all = readAll(context)
        val alive = all.filter { it.exists() }
        if (alive.size != all.size) writeAll(context, alive)
        return alive.sortedByDescending { it.downloadedAt }
    }

    /**
     * Nome de ficheiro legível e único por aula: "<aula>.mp4" a partir
     * do nome do vídeo; em colisão com outra aula, sufixo com o hash
     * do caminho. A extensão preserva-se do nome original.
     */
    fun fileNameFor(videoName: String, folderPath: String): String {
        val clean = videoName.replace(Regex("[\\\\/:*?\"<>|]"), "_").trim()
        return clean.ifBlank { "aula-${folderPath.hashCode()}.mp4" }
    }
}
