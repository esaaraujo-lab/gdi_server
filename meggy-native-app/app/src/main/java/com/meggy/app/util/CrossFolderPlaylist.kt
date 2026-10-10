package com.meggy.app.util

import com.meggy.app.data.ApiService
import com.meggy.app.data.FileItem
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope

/**
 * CrossFolderPlaylist — v1.2.0
 *
 * Ports the web platform's `loadCrossFolderPlaylist` to Kotlin. When a lesson
 * folder contains a single video, we scan the parent folder's sibling
 * subfolders (6 at a time) and assemble a playlist that spans the whole
 * subject. Each entry is tagged with a `folderLabel` (the subfolder name) so
 * the playlist sidebar can disambiguate `video.mp4` across folders, and a
 * `folderPath` so per-(folder, video) resume keys stay correct.
 *
 * Only `org.json`, `OkHttp` (via ApiService) and `kotlinx.coroutines` are
 * used — no new dependencies.
 */
object CrossFolderPlaylist {

    /** Cap on how many sibling folders we scan (matches the web's 200 cap). */
    private const val MAX_SIBLINGS = 200

    /** How many subfolders we list concurrently (matches the web's 6-way fan-out). */
    private const val CONCURRENCY = 6

    /** Result of a cross-folder playlist build. */
    data class Result(val items: List<FileItem>, val startIndex: Int)

    /**
     * Builds a cross-folder playlist whose root is the parent of [currentPath].
     *
     * [clickedVideo] is the FileItem the user tapped — used to locate the start
     * index in the assembled playlist.
     *
     * Behaviour:
     *  1. Compute the parent path (strip the last segment of [currentPath]).
     *  2. List the parent's children, keep only folders (cap [MAX_SIBLINGS]).
     *  3. For each sibling, list its contents ([CONCURRENCY] at a time) and
     *     collect the videos.
     *  4. Tag every video with `folderLabel` + `folderPath`, sort
     *     numeric-aware by folder then name.
     *  5. Return the list + the index of [clickedVideo] within it.
     *
     * If the parent has no subfolders or all subfolders are empty, falls back
     * to a single-item playlist containing just [clickedVideo].
     */
    suspend fun build(
        currentPath: String,
        clickedVideo: FileItem,
        api: ApiService
    ): Result {
        val parentPath = parentOf(currentPath)

        val siblings = (api.listFolder(parentPath) ?: emptyList())
            .filter { it.isFolder }
            .take(MAX_SIBLINGS)

        if (siblings.isEmpty()) {
            return Result(listOf(clickedVideo.withFolder(currentPath)), 0)
        }

        // Concurrently scan each sibling subfolder in batches of CONCURRENCY.
        val scanned = mutableListOf<Pair<String, List<FileItem>>>()
        for (chunk in siblings.chunked(CONCURRENCY)) {
            val batch = coroutineScope {
                chunk.map { sib ->
                    async {
                        val subPath = joinPath(parentPath, sib.name)
                        val files = api.listFolder(subPath) ?: emptyList()
                        subPath to files.filter { it.isVideo && !it.link.isNullOrEmpty() }
                    }
                }.awaitAll()
            }
            scanned.addAll(batch)
        }

        // Flatten + tag with folderLabel/folderPath.
        val tagged = mutableListOf<FileItem>()
        for ((subPath, vids) in scanned) {
            val label = folderLabelFromPath(subPath)
            for (v in vids) {
                tagged.add(v.copy(folderLabel = label, folderPath = subPath))
            }
        }

        // Sort numeric-aware by folderLabel, then by name.
        tagged.sortWith(
            compareBy({ naturalKey(it.folderLabel ?: "") }, { naturalKey(it.name) })
        )

        if (tagged.isEmpty()) {
            return Result(listOf(clickedVideo.withFolder(currentPath)), 0)
        }

        // Locate the clicked video (match by name within the current folder).
        val start = tagged.indexOfFirst {
            it.name == clickedVideo.name && it.folderPath == currentPath
        }.let { if (it < 0) 0 else it }

        return Result(tagged, start)
    }

    // ──────────────────── path helpers ────────────────────

    /** Strips the last segment of a path: "/0:/PF/Bloco I/Dir/" → "/0:/PF/Bloco I/". */
    private fun parentOf(path: String): String {
        val p = if (path.endsWith("/")) path.dropLast(1) else path
        val idx = p.lastIndexOf('/')
        return if (idx < 0) "/" else p.substring(0, idx + 1)
    }

    private fun joinPath(parent: String, name: String): String {
        val p = if (parent.endsWith("/")) parent else "$parent/"
        return "$p$name/"
    }

    /** Short label for a subfolder path: last segment, no trailing slash. */
    private fun folderLabelFromPath(path: String): String {
        val p = if (path.endsWith("/")) path.dropLast(1) else path
        val idx = p.lastIndexOf('/')
        return if (idx < 0) p else p.substring(idx + 1)
    }

    /**
     * Natural sort key: zero-pads digit runs so "001 - ..." sorts before
     * "002 - ..." (and "10" before "100") under a plain lexicographic compare.
     */
    private fun naturalKey(s: String): String {
        val sb = StringBuilder()
        val num = StringBuilder()
        var inNum = false
        for (c in s) {
            if (c.isDigit()) {
                if (!inNum) { inNum = true; num.clear() }
                num.append(c)
            } else {
                if (inNum) {
                    sb.append(num.toString().padStart(10, '0'))
                    num.clear(); inNum = false
                }
                sb.append(c)
            }
        }
        if (inNum) sb.append(num.toString().padStart(10, '0'))
        return sb.toString()
    }

    private fun FileItem.withFolder(path: String): FileItem =
        copy(folderPath = path, folderLabel = folderLabelFromPath(path))
}
