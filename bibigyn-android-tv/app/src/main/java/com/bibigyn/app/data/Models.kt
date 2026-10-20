package com.bibigyn.app.data

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
 */
data class DriveItem(
    val index: Int,
    val name: String,
    val rootFolderId: String?,
    val icon: String = "📁"
) {
    companion object {
        val ALL: List<DriveItem> = listOf(
            DriveItem(6,  "CLUBE FIT",                   null, "💪"),
            DriveItem(7,  "HIPOPRESSIVOS",               null, "🧘")
        )
    }
}

// ──────────────────────────── Files / Folders ────────────────────────────

/**
 * A file or folder returned by POST /<driveIdx>:/.
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
    val folderPath: String? = null,
    val thumbnailLink: String? = null  // v2.1.0: Google Drive thumbnail URL
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
            // v2.1.0: parse thumbnailLink from Google Drive API response.
            // The worker.js passes it through if present. We also try to
            // construct it from the file ID as a fallback.
            val rawThumb = if (o.has("thumbnailLink") && !o.isNull("thumbnailLink"))
                o.getString("thumbnailLink") else null
            val fileId = o.optString("id", "")
            val thumb = when {
                !rawThumb.isNullOrBlank() -> enlargeThumbnail(rawThumb)
                fileId.isNotBlank() -> "https://drive.google.com/thumbnail?id=$fileId&sz=w400"
                else -> null
            }
            return FileItem(
                name = o.optString("name", "(sem nome)"),
                mimeType = o.optString("mimeType", "application/octet-stream"),
                id = fileId,
                driveId = if (o.has("driveId")) o.getString("driveId") else null,
                link = if (o.has("link") && !o.isNull("link")) o.getString("link") else null,
                size = sizeLong,
                modifiedTime = if (o.has("modifiedTime") && !o.isNull("modifiedTime")) o.getString("modifiedTime") else null,
                thumbnailLink = thumb
            )
        }

        /**
         * v2.1.0 — Google Drive returns thumbnail URLs with a default size
         * parameter (e.g. `sz=s200`). We enlarge it to w400 for sharper
         * tiles on high-DPI screens.
         */
        private fun enlargeThumbnail(url: String): String {
            return try {
                // Replace sz=NNN with sz=w400 (width 400px)
                if (url.contains("sz=")) {
                    url.replace(Regex("sz=[^&]+"), "sz=w400")
                } else if (url.contains("=s")) {
                    // Format: =s200 → =w400
                    url.replace(Regex("=s[0-9]+"), "=w400")
                } else {
                    url
                }
            } catch (_: Exception) { url }
        }

        /** v2.0.0: serializes a FileItem back to JSON for SharedPreferences storage. */
        fun toJson(item: FileItem): JSONObject {
            val o = JSONObject()
            o.put("name", item.name)
            o.put("mimeType", item.mimeType)
            o.put("id", item.id)
            o.put("driveId", item.driveId ?: JSONObject.NULL)
            o.put("link", item.link ?: JSONObject.NULL)
            o.put("size", item.size)
            o.put("modifiedTime", item.modifiedTime ?: JSONObject.NULL)
            item.folderLabel?.let { o.put("folderLabel", it) }
            item.folderPath?.let { o.put("folderPath", it) }
            item.thumbnailLink?.let { o.put("thumbnailLink", it) }
            return o
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

sealed class LoginResult {
    data class Success(val sessionCookie: String, val username: String) : LoginResult()
    data class Failure(val reason: String) : LoginResult()
}

// ──────────────────────────── User courses ────────────────────────────

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

// ──────────────────────────── v2.0.0: Hero rotation ────────────────────────────

/**
 * One hero banner entry — a curated "destaque" course from any drive.
 * Rotated by HomeActivity.HeroRotator every 8s with crossfade.
 */
data class HeroItem(
    val title: String,
    val subtitle: String,
    val badge: String,            // e.g. "🐕 DESTAQUE DA SEMANA"
    val drivePath: String,        // BrowseActivity drivePath
    val driveName: String,        // displayed in browse
    val icon: String,             // emoji shown in hero corner
    val colorHint: String? = null // optional colorFromString hint
) {
    companion object {
        /**
         * Curated list of destaques spanning multiple drives. Picked 1-2
         * per major drive so the rotation surfaces content from across
         * the whole library, not just the first drive.
         */
        val ALL: List<HeroItem> = listOf(
            HeroItem(
                title = "Clube Fit — Treinos Completos",
                subtitle = "Aulas de fitness, musculação e cardio. Vídeos HD.",
                badge = "💪 DESTAQUE DA SEMANA",
                drivePath = "/6:/",
                driveName = "CLUBE FIT",
                icon = "💪"
            ),
            HeroItem(
                title = "Hipopressivos — Técnica Completa",
                subtitle = "Exercícios hipopressivos para fortalecimento core.",
                badge = "🧘 EM ALTA",
                drivePath = "/7:/",
                driveName = "HIPOPRESSIVOS",
                icon = "🧘"
            )
        )
    }
}

// ──────────────────────────── v1.5.0 colour helpers ────────────────────────────

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

fun colorFromString(str: String): Int {
    var hash = 0
    for (c in str) hash = c.code + ((hash shl 5) - hash)
    return STRING_COLOR_PALETTE[Math.floorMod(hash, STRING_COLOR_PALETTE.size)]
}
