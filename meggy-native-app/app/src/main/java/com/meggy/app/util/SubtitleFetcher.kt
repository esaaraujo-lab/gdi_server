package com.meggy.app.util

import android.content.Context
import com.meggy.app.MeggyApp
import java.io.File
import java.net.URLEncoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Request
import org.json.JSONObject

/**
 * v2.7.6 — Legendas no player (contrato /api/ai/subtitles).
 *
 * Fontes, nesta ordem:
 *  1. Sidecar na pasta da aula (.vtt/.srt com o mesmo nome do vídeo) —
 *     usado direto, sem rede extra.
 *  2. Endpoint do worker (ainda NÃO existe — o coordenador da v2.15.4
 *     está implementando): GET /api/ai/subtitles?lesson=<path codificado>
 *     &lang=pt-BR
 *       200 text/vtt ......... VTT pronto (com timestamps do Whisper)
 *       202 {status:"generating"} ... Whisper gerando em 2º plano
 *       404 {status:"none"} ... não há legenda possível
 *     O VTT baixado é guardado no cache do app (por path da aula) e
 *     anexado ao MediaItem como SubtitleConfiguration.
 *
 *  3. Transcrição em texto puro (.md/.txt) NÃO vira legenda: não tem
 *     timestamps. O Whisper COM timestamps é obrigatório para a
 *     legenda estilo YouTube (frase no momento certo).
 *
 * Enquanto o endpoint não existir, qualquer erro de rede/404 é tratado
 * como "sem legenda" (o botão CC mostra "sem legendas" — nunca um
 * menu vazio ou falso).
 */
object SubtitleFetcher {

    sealed class Result {
        /** VTT pronto (arquivo local). `language` = "pt-BR" etc. */
        data class Ready(val vttFile: File, val language: String) : Result()
        /** Whisper gerando em segundo plano — tentar de novo depois. */
        object Generating : Result()
        /** Não há legenda possível para esta aula. */
        object None : Result()
    }

    private const val LANG = "pt-BR"
    private const val MAX_GENERATING_RETRIES = 3

    /**
     * Busca a legenda da aula. `lessonPath` = path completo da pasta da
     * aula (ex.: "/0:/PF - Agente/Aula 01/"), `videoName` = nome do vídeo.
     * `sidecar` = arquivo .vtt/.srt já listado na pasta (ou null).
     */
    suspend fun fetch(
        context: Context,
        lessonPath: String,
        videoName: String,
        sidecarUrl: String?,
        sidecarName: String?,
        generatingRetry: Int = 0
    ): Result = withContext(Dispatchers.IO) {
        // 1) Sidecar direto.
        if (!sidecarUrl.isNullOrBlank()) {
            val file = FileDownloader.download(context, sidecarUrl, "subtitles", sidecarName ?: "sub.vtt")
            if (file != null) {
                return@withContext Result.Ready(file, guessLanguage(sidecarName))
            }
        }

        // 2) Endpoint do worker.
        try {
            val lesson = URLEncoder.encode("$lessonPath$videoName", "UTF-8")
            val url = "${MeggyApp.BASE_URL}/api/ai/subtitles?lesson=$lesson&lang=$LANG"
            val cookie = SessionManager.get(context).sessionCookie
            val request = Request.Builder()
                .url(url)
                .header("User-Agent", "MeggyNative/2.7 (Android)")
                .apply {
                    if (!cookie.isNullOrBlank()) header("Cookie", "session=$cookie")
                }
                .build()
            val response = MeggyApp.okHttpClient.newCall(request).execute()
            when (response.code) {
                200 -> {
                    val body = response.body?.string() ?: return@withContext Result.None
                    if (!body.contains("WEBVTT") && !body.contains("-->")) {
                        return@withContext Result.None
                    }
                    val file = File(File(context.cacheDir, "subtitles").apply { mkdirs() },
                        "${lesson.hashCode()}_$LANG.vtt")
                    file.writeText(body)
                    Result.Ready(file, LANG)
                }
                202 -> {
                    // Gerando em 2º plano: o chamador mostra "gerando
                    // legenda…" e pode tentar de novo (limitado).
                    val status = try {
                        JSONObject(response.body?.string() ?: "").optString("status")
                    } catch (_: Exception) { "" }
                    if (status == "generating" || generatingRetry < MAX_GENERATING_RETRIES) {
                        Result.Generating
                    } else {
                        Result.None
                    }
                }
                else -> Result.None
            }
        } catch (_: Exception) {
            Result.None
        }
    }

    private fun guessLanguage(name: String?): String {
        val n = (name ?: "").lowercase()
        return when {
            n.contains("pt-br") || n.contains("pt_br") || n.contains("portugu") -> "pt-BR"
            n.contains("-en") || n.contains("_en") || n.contains("english") -> "en"
            n.contains("-es") || n.contains("_es") -> "es"
            else -> "pt-BR"
        }
    }
}
