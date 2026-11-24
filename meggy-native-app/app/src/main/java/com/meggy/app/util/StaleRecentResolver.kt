package com.meggy.app.util

import android.content.Context
import com.meggy.app.data.ApiService
import com.meggy.app.data.FileItem
import com.meggy.app.data.FolderResult
import java.net.URLDecoder
import java.text.Normalizer

/**
 * R29 — resolve um recent cujo caminho guardado ficou obsoleto (a
 * pasta foi renomeada/movida no Drive e a listagem lenta devolve
 * vazia). Em vez de abrir a pasta-mãe, tenta achar o vídeo no
 * caminho atual e devolvê-lo para tocar como o caminho rápido faz
 * (playlist + link de playback). Sem resultado, devolve null e o
 * chamador mantém o comportamento atual (abre a pasta-mãe).
 *
 * Rotas usadas — só as que já existem, nenhuma busca nova:
 *  • GET /api/d1/lessons/search (worker .92, a mesma da busca da
 *    web): devolve o lesson_path ATUAL da aula — mas atenção, o D1
 *    pode não ter a aula (o curso do Elton tem zero linhas
 *    "PODERES" no D1) e a quota do D1 pode estar esgotada; por
 *    isso é só a 1.ª tentativa, nunca a única.
 *  • listFolder (a listagem normal): passeio no Drive — sobe pelos
 *    ancestrais do caminho guardado até achar o primeiro com
 *    conteúdo e desce até 2 níveis procurando a pasta da aula pelo
 *    tema. Funciona mesmo com o D1 morto.
 *
 * NÃO serve para resolver:
 *  • A aba Buscar do app — é só filtro LOCAL (drives + favoritos +
 *    recents guardados, SearchActivity.kt); não há rota de busca
 *    nela para reutilizar.
 *  • GET /api/ai/question-bank/by-lesson — devolve só questões/
 *    resumo/pílulas da aula, sem link de vídeo nem caminho de
 *    pasta; confirma que a aula existe no banco, mas não dá para
 *    tocar nada com isso.
 *
 * A posição de retoma migra junto (resume_/dur_ copiados do caminho
 * antigo para o novo, só quando o destino ainda não tem nada — o
 * progresso antigo NUNCA é apagado; as chaves antigas ficam). O
 * "assistido" só migra quando é o mesmo arquivo (mesmo nome).
 */
object StaleRecentResolver {

    /** O vídeo resolvido, pronto para tocar como o caminho rápido. */
    data class Resolved(
        val folderPath: String,
        val video: FileItem,
        val playable: List<FileItem>
    )

    /**
     * Tenta resolver (oldFolderPath, videoName) para o caminho atual.
     * Null = não resolveu (o chamador abre a pasta-mãe, como antes).
     * Nunca lança exceção.
     */
    suspend fun resolve(
        api: ApiService,
        context: Context,
        oldFolderPath: String,
        videoName: String
    ): Resolved? {
        val tokens = themeTokens(oldFolderPath, videoName)
        if (tokens.isEmpty()) return null
        val found = try {
            searchD1(api, tokens, oldFolderPath, videoName)
                ?: walkDrive(api, tokens, oldFolderPath, videoName)
        } catch (_: Exception) {
            null
        } ?: return null
        runCatching {
            migrateProgress(
                SessionManager.get(context),
                oldFolderPath, videoName,
                found.folderPath, found.video.name
            )
        }
        return found
    }

    // ───────── tentativa 1: busca no D1 ─────────

    private suspend fun searchD1(
        api: ApiService,
        tokens: List<String>,
        oldFolderPath: String,
        videoName: String
    ): Resolved? {
        val hits = try {
            api.searchLessonsD1(tokens.joinToString(" "), limit = 10)
        } catch (_: Exception) {
            null
        } ?: return null
        if (hits.isEmpty()) return null
        val drivePrefix = "/" + oldFolderPath.trim('/').substringBefore('/') + "/"
        val coursePrefix = ancestorPath(oldFolderPath, 3)
        val ranked = hits
            .map { hit -> decodePath(hit.lessonPath) to hit.lessonPath }
            .filter { (decoded, _) -> decoded.startsWith(drivePrefix) }
            .sortedWith(
                compareByDescending<Pair<String, String>> { (decoded, _) ->
                    coursePrefix != null && decoded.startsWith(coursePrefix)
                }
            )
            .take(5)
        for ((decoded, raw) in ranked) {
            val folder = folderOfLessonPath(decoded)
            // O D1 guarda o caminho codificado; o listFolder recebe o
            // caminho decodificado (o formato que o app já usa). Se a
            // decodificação estiver errada, a 2.ª tentativa usa o
            // caminho como veio do D1.
            findVideoIn(api, folder, videoName)?.let { return it }
            if (raw != decoded) {
                findVideoIn(api, folderOfLessonPath(raw), videoName)?.let { return it }
            }
        }
        return null
    }

    /**
     * Pasta listável de um lesson_path do D1 (caminho do ARQUIVO):
     * tira o último segmento; "/material" no fim também sai (é a
     * subpasta de materiais, não a pasta da aula). Mesmo corte que o
     * lessonFolderKey do worker faz.
     */
    internal fun folderOfLessonPath(decodedLessonPath: String): String {
        var p = decodedLessonPath.trim().trimEnd('/')
        if (p.endsWith("/material")) p = p.removeSuffix("/material")
        val folder = p.substringBeforeLast('/', "").trimEnd('/')
        if (folder.isBlank()) return "$p/"
        return "$folder/"
    }

    // ───────── tentativa 2: passeio no Drive (listFolder) ─────────

    private suspend fun walkDrive(
        api: ApiService,
        tokens: List<String>,
        oldFolderPath: String,
        videoName: String
    ): Resolved? {
        // Sobe pelos ancestrais até o primeiro com conteúdo — a
        // âncora (ex.: a pasta do curso, quando a pasta do módulo
        // antiga também já não existe). Máx. 5 níveis.
        var anchor: Pair<String, List<FileItem>>? = null
        for (ancestor in ancestorPaths(oldFolderPath)) {
            val files = listOk(api, ancestor, maxPages = 2) ?: continue
            if (files.isNotEmpty()) {
                anchor = ancestor to files
                break
            }
        }
        val (anchorPath, anchorFiles) = anchor ?: return null
        // A aula pode estar direto sob a âncora (estrutura plana).
        for (candidate in lessonCandidates(anchorPath, anchorFiles, tokens)) {
            findVideoIn(api, candidate, videoName)?.let { return it }
        }
        // Ou um nível abaixo (curso → módulo → aula). Máx. 8 módulos.
        val subfolders = anchorFiles.filter { it.isFolder }
            .take(8)
            .map { joinPath(anchorPath, it.name) }
        for (sub in subfolders) {
            val subFiles = listOk(api, sub, maxPages = 2) ?: continue
            for (candidate in lessonCandidates(sub, subFiles, tokens)) {
                findVideoIn(api, candidate, videoName)?.let { return it }
            }
        }
        return null
    }

    /** Pastas filhas de [parent] cujo nome casa com o tema. Máx. 6. */
    private fun lessonCandidates(
        parent: String,
        files: List<FileItem>,
        tokens: List<String>
    ): List<String> =
        files.filter { it.isFolder && matchesTheme(it.name, tokens) }
            .take(6)
            .map { joinPath(parent, it.name) }

    /** Ancestrais do caminho guardado, do mais perto ao drive. */
    internal fun ancestorPaths(folderPath: String): List<String> {
        val segments = folderPath.trim('/').split('/').filter { it.isNotBlank() }
        val out = ArrayList<String>()
        for (end in segments.size - 1 downTo 1) {
            out.add("/" + segments.subList(0, end).joinToString("/") + "/")
        }
        return out.take(5)
    }

    /** Os 3 primeiros segmentos (drive + 2) — o prefixo do curso. */
    private fun ancestorPath(folderPath: String, segments: Int): String? {
        val parts = folderPath.trim('/').split('/').filter { it.isNotBlank() }
        if (parts.size < segments) return null
        return "/" + parts.subList(0, segments).joinToString("/") + "/"
    }

    private fun joinPath(parent: String, name: String): String =
        parent.trimEnd('/') + "/" + name.trim('/') + "/"

    /** listFolder que devolve null em qualquer falha (nunca lança). */
    private suspend fun listOk(api: ApiService, path: String, maxPages: Int): List<FileItem>? {
        return when (val r = AuthHelper.listFolderWithRelogin(api, path, maxPages)) {
            is FolderResult.Ok -> r.files
            else -> null
        }
    }

    /**
     * Procura o vídeo dentro de [folderPath]: casa exato pelo nome;
     * se o nome é genérico ("video.mp4", "Videoaula.mp4") e a pasta
     * só tem vídeos da aula, toca o 1.º vídeo da pasta. Null = a
     * pasta não tem o vídeo (ou não lista).
     */
    private suspend fun findVideoIn(
        api: ApiService,
        folderPath: String,
        videoName: String
    ): Resolved? {
        val files = listOk(api, folderPath, maxPages = 2) ?: return null
        if (files.isEmpty()) return null
        val playable = files.filter { (it.isVideo || it.isAudio) && !it.link.isNullOrEmpty() }
        if (playable.isEmpty()) return null
        val video = playable.firstOrNull { it.name == videoName }
            ?: if (isGenericVideoName(videoName)) playable.first() else return null
        return Resolved(folderPath, video, playable)
    }

    // ───────── progresso: copia, nunca apaga ─────────

    private fun migrateProgress(
        sm: SessionManager,
        oldFolderPath: String,
        oldVideoName: String,
        newFolderPath: String,
        newVideoName: String
    ) {
        val pos = sm.getResume(oldFolderPath, oldVideoName)
        if (pos > 0L && sm.getResume(newFolderPath, newVideoName) <= 0L) {
            sm.saveResume(newFolderPath, newVideoName, pos)
        }
        val dur = sm.getResumeDuration(oldFolderPath, oldVideoName)
        if (dur > 0L && sm.getResumeDuration(newFolderPath, newVideoName) <= 0L) {
            sm.saveResumeDuration(newFolderPath, newVideoName, dur)
        }
        // "Assistido" só migra quando é o MESMO arquivo: um vídeo
        // diferente na pasta nova não herda o "visto".
        if (oldVideoName == newVideoName &&
            sm.isWatched(oldFolderPath, oldVideoName) &&
            !sm.isWatched(newFolderPath, newVideoName)
        ) {
            sm.markWatched(newFolderPath, newVideoName)
        }
    }

    // ───────── tema: palavras do nome da pasta/vídeo ─────────

    /**
     * Palavras do tema a partir do nome da pasta guardada e do nome
     * do vídeo (ex.: "002 - PODERES DA ADMINISTRAÇÃO" →
     * [poderes, administracao]). Sem acento, minúsculas, sem
     * números de aula, sem stopwords e sem termos genéricos
     * ("video", "aula", "parte", "módulo").
     */
    internal fun themeTokens(folderPath: String, videoName: String): List<String> {
        val folderName = folderPath.trim('/').substringAfterLast('/')
        val videoBase = videoName.substringBeforeLast('.', videoName)
        val words = (normalizeWords(folderName) + normalizeWords(videoBase))
            .filter { it.length >= 2 }
            .filter { it !in STOPWORDS && it !in GENERIC }
            .filter { !(it.all { c -> c.isDigit() } && it.length < 4) }
        return words.distinct()
    }

    private val STOPWORDS = setOf(
        "da", "de", "do", "das", "dos", "e", "a", "o", "em", "para",
        "com", "por", "ao", "aos", "na", "no", "nas", "nos", "um",
        "uma", "uns", "umas", "se", "que", "os", "as"
    )

    private val GENERIC = setOf(
        "video", "videoaula", "aula", "parte", "modulo", "curso",
        "arquivo", "material", "novo", "nova"
    )

    private fun normalizeWords(text: String): List<String> {
        val deburred = Normalizer.normalize(text.lowercase(), Normalizer.Form.NFD)
            .replace(Regex("[\\u0300-\\u036f]"), "")
        return deburred.split(Regex("[^a-z0-9]+")).filter { it.isNotBlank() }
    }

    /**
     * True quando TODOS os tokens casam com o nome da pasta. Token
     * curto (< 6 letras) exige a palavra exata; token longo casa
     * por prefixo de 6+ letras — "administracao" casa
     * "administrativos" (prefixo "administra"), e "poderes" casa
     * "poderes". Sem isto, a aula renomeada não casava nunca.
     */
    internal fun matchesTheme(folderName: String, tokens: List<String>): Boolean {
        if (tokens.isEmpty()) return false
        val words = normalizeWords(folderName)
        return tokens.all { token -> tokenMatches(words, token) }
    }

    private fun tokenMatches(words: List<String>, token: String): Boolean {
        if (token.length < 6) return token in words
        return words.any { w -> commonPrefix(w, token) >= 6 }
    }

    private fun commonPrefix(a: String, b: String): Int {
        var i = 0
        while (i < a.length && i < b.length && a[i] == b[i]) i++
        return i
    }

    /** Nome genérico de vídeo ("video.mp4", "Videoaula.mp4", "01 - video.mp4"). */
    internal fun isGenericVideoName(videoName: String): Boolean {
        val base = videoName.substringBeforeLast('.', videoName).trim().lowercase()
        if (base == "video" || base == "videoaula") return true
        return Regex("^\\d+\\s*[-–_.]?\\s*video(aula)?\$").matches(base)
    }

    private fun decodePath(path: String): String =
        try {
            URLDecoder.decode(path, "UTF-8")
        } catch (_: Exception) {
            path
        }
}
