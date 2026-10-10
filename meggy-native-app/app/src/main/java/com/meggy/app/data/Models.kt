package com.meggy.app.data

import android.graphics.Color
import org.json.JSONArray
import org.json.JSONObject

/**
 * Data models for the Meggy app.
 *
 * The backend JSON shapes are decoded into these simple Kotlin data classes so that
 * the UI layer never touches raw JSON. All parsers are null-safe and tolerate
 * missing fields (the worker.js API does not always populate every key).
 */

// ──────────────────────────── Drives ────────────────────────────

/**
 * One of the 12 hardcoded root drives shown on the home screen.
 *
 * Drives 0..1 have known root Google Drive IDs (so we can list their top-level folder
 * without first asking the server). Drives 2..11 are addressed by index — the worker
 * resolves the underlying Drive folder transparently.
 *
 * v1.5.0: [icon] now carries the emoji string rendered on the card (was a category
 * slug like "trt"/"courses" before).
 */
data class DriveItem(
    val index: Int,
    val name: String,
    val rootFolderId: String?,
    val icon: String = "📁"
) {
    companion object {
        /**
         * The 12 hardcoded root drives, in the exact order the worker expects.
         * Index 0 and 1 have known root folder IDs that the worker.js API recognises.
         * Indices 2..11 use the drive index as the path segment (e.g. POST /2:/).
         */
        val ALL: List<DriveItem> = listOf(
            DriveItem(0,  "RETA FINAL TRTs",                "18pNVx52TY5ImVTTEyxp30oEQJCnKgzL7", "⚖️"),
            DriveItem(1,  "CURSOS - PLATAFORMAS COMPLETAS", "1lZo5wBhqC44yEySqX6rjyzBuJEEvGPs7", "📚"),
            DriveItem(2,  "VESTIBULARES PLATAFORMAS",       null, "🎯"),
            DriveItem(3,  "VESTIBULARES ISOLADAS",          null, "🎨"),
            DriveItem(4,  "MUSICA E CANTO",                 null, "🎼"),
            DriveItem(5,  "CARREIRAS EDUCACIONAIS",         null, "🏆"),
            DriveItem(6,  "CLUBE FIT",                      null, "💪"),
            DriveItem(7,  "HIPOPRESSIVOS",                  null, "🧘"),
            DriveItem(8,  "SAÚDE E MEDICINA",               null, "⚕️"),
            DriveItem(9,  "TUDO DE TRIBUNAIS",              null, "⚖️"),
            DriveItem(10, "ALFACON 2026",                   null, "🎓"),
            DriveItem(11, "PREPARATÓRIO OAB",               null, "🛡️")
        )
    }
}

// ──────────────────────────── Files / Folders ────────────────────────────

/**
 * A file or folder returned by POST /<driveIdx>:/.
 *
 * `link` is null for folders (folders are not downloadable). For files, prepend
 * [com.meggy.app.MeggyApp.BASE_URL] to obtain the full streaming URL.
 *
 * v1.2.0 additions:
 *  • [folderLabel] — short folder name used to disambiguate entries in a
 *    cross-folder playlist (e.g. "001 - PODERES DA ADMINISTRAÇÃO"). Null for
 *    same-folder playlists where every entry shares the same folder.
 *  • [folderPath] — full folder path ("/0:/PF.../Bloco I/DirAdmin/001 - .../")
 *    used as the resume-key prefix. Null when the item came straight from a
 *    folder listing (BrowseActivity fills it in when building the playlist).
 */
data class FileItem(
    val name: String,
    val mimeType: String,
    val id: String,
    val driveId: String?,
    val link: String?,
    val size: Long,
    val modifiedTime: String?,
    val folderLabel: String? = null,
    val folderPath: String? = null
) {
    val isFolder: Boolean get() = mimeType == "application/vnd.google-apps.folder"
    val isAudio: Boolean
        get() = mimeType.startsWith("audio/") || name.endsWith(".mp3", true) || name.endsWith(".m4a", true) || name.endsWith(".aac", true) || name.endsWith(".ogg", true) || name.endsWith(".wav", true) || name.endsWith(".flac", true)

    val isVideo: Boolean
        get() = mimeType.startsWith("video/") ||
                name.endsWith(".mp4", true) ||
                name.endsWith(".mkv", true) ||
                name.endsWith(".webm", true) ||
                name.endsWith(".mov", true) ||
                name.endsWith(".avi", true)
    val isPdf: Boolean get() = mimeType == "application/pdf" || name.endsWith(".pdf", true)

    /** Human-readable file size, e.g. "1.4 GB". */
    val humanSize: String
        get() {
            if (size <= 0) return "—"
            val units = arrayOf("B", "KB", "MB", "GB", "TB")
            var v = size.toDouble()
            var u = 0
            while (v >= 1024.0 && u < units.lastIndex) { v /= 1024.0; u++ }
            return if (u == 0) "${size} B" else String.format("%.1f %s", v, units[u])
        }

    companion object {
        fun fromJson(o: JSONObject): FileItem {
            val sizeStr = o.optString("size", "0")
            val sizeLong = sizeStr.toLongOrNull() ?: 0L
            return FileItem(
                name = o.optString("name", "(sem nome)"),
                mimeType = o.optString("mimeType", "application/octet-stream"),
                id = o.optString("id", ""),
                driveId = if (o.has("driveId")) o.getString("driveId") else null,
                link = if (o.has("link") && !o.isNull("link")) o.getString("link") else null,
                size = sizeLong,
                modifiedTime = if (o.has("modifiedTime") && !o.isNull("modifiedTime")) o.getString("modifiedTime") else null
            )
        }

        fun parseList(arr: JSONArray?): List<FileItem> {
            if (arr == null) return emptyList()
            val out = ArrayList<FileItem>(arr.length())
            for (i in 0 until arr.length()) out.add(fromJson(arr.getJSONObject(i)))
            return out
        }
    }
}

// ──────────────────────────── Folder listing response ────────────────────────────

/**
 * Response envelope for POST /<driveIdx>:/.
 *
 * The worker returns `{ "nextPageToken": null, "curPageIndex": 0, "data": { "files": [...] } }`.
 */
data class FolderListing(
    val files: List<FileItem>,
    val nextPageToken: String?,
    val currentPageIndex: Int
) {
    companion object {
        fun parse(json: String): FolderListing {
            val root = JSONObject(json)
            val data = root.optJSONObject("data")
            val files = if (data != null) FileItem.parseList(data.optJSONArray("files")) else emptyList()
            val npt = if (root.has("nextPageToken") && !root.isNull("nextPageToken"))
                root.getString("nextPageToken") else null
            val idx = root.optInt("curPageIndex", 0)
            return FolderListing(files, npt, idx)
        }
    }
}

// ──────────────────────────── Login ────────────────────────────

/**
 * Result of a login attempt. On success, `sessionCookie` is the raw value
 * (without the `session=` prefix) extracted from the Set-Cookie header.
 */
sealed class LoginResult {
    data class Success(val sessionCookie: String, val username: String) : LoginResult()
    data class Failure(val reason: String) : LoginResult()
}

// ──────────────────────────── User courses ────────────────────────────

/**
 * One enrolled course returned by GET /api/courses/list.
 */
data class CourseItem(
    val coursePath: String,
    val courseName: String
) {
    companion object {
        fun parse(json: String): List<CourseItem> {
            val root = JSONObject(json)
            if (!root.optBoolean("ok", false)) return emptyList()
            val arr = root.optJSONArray("courses") ?: return emptyList()
            val out = ArrayList<CourseItem>(arr.length())
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                out.add(CourseItem(
                    coursePath = o.optString("coursePath", ""),
                    courseName = o.optString("courseName", "(sem nome)")
                ))
            }
            return out
        }
    }
}

// ──────────────────────────── v1.5.0 colour helpers ────────────────────────────

/**
 * 12-colour palette mirroring the web preview's `colorFromString` palette.
 * Used to give every drive/course/file card a visually distinct gradient.
 */
private val STRING_COLOR_PALETTE: IntArray = intArrayOf(
    0xFFFF6B6B.toInt(),
    0xFF4ECDC4.toInt(),
    0xFFFFD93D.toInt(),
    0xFFFF8B9F.toInt(),
    0xFFC026D3.toInt(),
    0xFF6BCB77.toInt(),
    0xFFFF9F1C.toInt(),
    0xFF7B68EE.toInt(),
    0xFF00BFFF.toInt(),
    0xFFFF4757.toInt(),
    0xFFA8E6CF.toInt(),
    0xFFDDA0DD.toInt()
)

/**
 * Returns a stable ARGB colour int (opaque) for the given string by hashing it
 * and picking from [STRING_COLOR_PALETTE]. Matches the JS web preview's
 * `colorFromString` so cards look identical across web/native.
 */
fun colorFromString(str: String): Int {
    var hash = 0
    for (c in str) hash = c.code + ((hash shl 5) - hash)
    return STRING_COLOR_PALETTE[Math.floorMod(hash, STRING_COLOR_PALETTE.size)]
}
