package com.meggy.app.util

import android.content.Context
import android.content.SharedPreferences
import com.meggy.app.data.FileItem
import org.json.JSONArray
import org.json.JSONObject

/**
 * SessionManager — persists the worker.js `session` cookie + per-video
 * resume positions + recent items + favorites + user settings.
 *
 * v2.0.0 additions:
 *  • Recent items — circular list of last 8 (folder, video, timestamp)
 *    used by the "Continue assistindo" rail (was single-item before).
 *  • Favorites — JSON list of FileItem used by "Minha lista".
 *  • Settings — default playback speed, autoplay-next toggle,
 *    sleep-timer default, stored as primitives.
 */
class SessionManager private constructor(context: Context) {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    // ───────── session cookie ─────────

    var sessionCookie: String?
        get() = prefs.getString(KEY_SESSION, null)
        set(value) = prefs.edit().putString(KEY_SESSION, value).apply()

    var username: String?
        get() = prefs.getString(KEY_USERNAME, null)
        set(value) = prefs.edit().putString(KEY_USERNAME, value).apply()

    val isLoggedIn: Boolean get() = !sessionCookie.isNullOrEmpty()

    fun clearSession() {
        prefs.edit()
            .remove(KEY_SESSION)
            .remove(KEY_USERNAME)
            .apply()
    }

    // ───────── legacy per-URL resume positions (v1.0) ─────────

    fun getResumePosition(fileUrl: String, durationMs: Long = -1L): Long {
        val pos = prefs.getLong("pos_$fileUrl", 0L)
        if (pos <= 0L) return 0L
        if (durationMs > 0L && durationMs - pos < 5_000L) return 0L
        return pos
    }

    fun saveResumePosition(fileUrl: String, positionMs: Long) {
        prefs.edit().putLong("pos_$fileUrl", positionMs).apply()
    }

    fun clearResumePosition(fileUrl: String) {
        prefs.edit().remove("pos_$fileUrl").apply()
    }

    // ───────── per-(folder, video) resume (v1.2.0) ─────────

    fun saveResume(folderPath: String, videoName: String, positionMs: Long) {
        prefs.edit().putLong(resumeKey(folderPath, videoName), positionMs).apply()
    }

    fun getResume(folderPath: String, videoName: String): Long {
        return prefs.getLong(resumeKey(folderPath, videoName), 0L)
    }

    fun hasResume(folderPath: String, videoName: String): Boolean =
        prefs.getLong(resumeKey(folderPath, videoName), 0L) > 0L

    fun clearResume(folderPath: String, videoName: String) {
        prefs.edit().remove(resumeKey(folderPath, videoName)).apply()
    }

    private fun resumeKey(folderPath: String, videoName: String): String =
        "resume_$folderPath::$videoName"

    // ───────── per-(folder, video) watched flag (v1.2.0) ─────────

    fun markWatched(folderPath: String, videoName: String) {
        prefs.edit().putBoolean(watchedKey(folderPath, videoName), true).apply()
    }

    fun isWatched(folderPath: String, videoName: String): Boolean =
        prefs.getBoolean(watchedKey(folderPath, videoName), false)

    private fun watchedKey(folderPath: String, videoName: String): String =
        "watched_$folderPath::$videoName"

    // ───────── per-folder last watched (v1.1.0, retained) ─────────

    fun saveLastWatched(folderPath: String, videoName: String) {
        prefs.edit().putString("last_watch_folder", folderPath)
            .putString("last_watch_video", videoName).apply()
        prefs.edit().putString("last_$folderPath", videoName).apply()
    }

    fun getLastWatched(folderPath: String): String? =
        prefs.getString("last_$folderPath", null)

    fun getLastWatchedFolder(): String? = prefs.getString("last_watch_folder", null)
    fun getLastWatchedVideoName(): String? = prefs.getString("last_watch_video", null)

    // ───────── v2.0.0: Recent items (Continue Assistindo rail) ─────────
    //
    // Circular list of last 8 watched items, stored as a JSON array.
    // Each entry: { folder, video, ts }. Deduped by (folder, video).

    /** Adds (or moves to top) a (folder, video) entry in the recents list. */
    fun addRecent(folderPath: String, videoName: String) {
        val arr = recentArray()
        // Remove any existing entry with the same (folder, video)
        val filtered = (0 until arr.length()).map { arr.getJSONObject(it) }
            .filter {
                !(it.optString("folder") == folderPath && it.optString("video") == videoName)
            }
        val newList = ArrayList(filtered)
        val entry = JSONObject()
        entry.put("folder", folderPath)
        entry.put("video", videoName)
        entry.put("ts", System.currentTimeMillis())
        newList.add(0, entry)
        // Cap at 8
        while (newList.size > 8) newList.removeAt(newList.size - 1)
        val out = JSONArray()
        newList.forEach { out.put(it) }
        prefs.edit().putString(KEY_RECENTS, out.toString()).apply()
    }

    /** Returns the list of recent items as List<RecentItem>, most-recent first. */
    fun getRecents(): List<RecentItem> {
        val arr = recentArray()
        val out = ArrayList<RecentItem>(arr.length())
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            out.add(RecentItem(
                folderPath = o.optString("folder"),
                videoName = o.optString("video"),
                timestamp = o.optLong("ts", 0L)
            ))
        }
        return out
    }

    private fun recentArray(): JSONArray {
        val raw = prefs.getString(KEY_RECENTS, null) ?: return JSONArray()
        return try { JSONArray(raw) } catch (_: Exception) { JSONArray() }
    }

    data class RecentItem(
        val folderPath: String,
        val videoName: String,
        val timestamp: Long
    )

    // ───────── v2.0.0: Favorites ("Minha lista") ─────────
    //
    // Stored as a JSON array of FileItem (full serialization).
    // Deduped by (folderPath, name).

    /** Returns the list of favorited FileItems. */
    fun getFavorites(): List<FileItem> {
        val raw = prefs.getString(KEY_FAVORITES, null) ?: return emptyList()
        return try {
            val arr = JSONArray(raw)
            val out = ArrayList<FileItem>(arr.length())
            for (i in 0 until arr.length()) out.add(FileItem.fromJson(arr.getJSONObject(i)))
            out
        } catch (_: Exception) { emptyList() }
    }

    /** True if (folderPath, name) is in the favorites list. */
    fun isFavorite(folderPath: String?, name: String): Boolean {
        val fp = folderPath ?: ""
        return getFavorites().any { (it.folderPath ?: "") == fp && it.name == name }
    }

    /** Toggles favorite status. Returns true if item is now favorited. */
    fun toggleFavorite(item: FileItem): Boolean {
        val list = getFavorites().toMutableList()
        val fp = item.folderPath ?: ""
        val idx = list.indexOfFirst { (it.folderPath ?: "") == fp && it.name == item.name }
        return if (idx >= 0) {
            list.removeAt(idx)
            prefs.edit().putString(KEY_FAVORITES, JSONArray().also { list.forEach { it -> it } }.toString()).apply()
            // Re-serialize properly
            val out = JSONArray()
            list.forEach { out.put(FileItem.toJson(it)) }
            prefs.edit().putString(KEY_FAVORITES, out.toString()).apply()
            false
        } else {
            list.add(0, item)
            val out = JSONArray()
            list.forEach { out.put(FileItem.toJson(it)) }
            prefs.edit().putString(KEY_FAVORITES, out.toString()).apply()
            true
        }
    }

    // ───────── v2.0.0: Settings ─────────

    /** Default playback speed: 0.75, 1.0, 1.25, 1.5, 1.75, 2.0 (default 1.0). */
    var defaultSpeed: Float
        get() = prefs.getString(KEY_DEFAULT_SPEED, "1.0")?.toFloatOrNull() ?: 1.0f
        set(value) = prefs.edit().putString(KEY_DEFAULT_SPEED, value.toString()).apply()

    /** Auto-play next video when current ends (default true). */
    var autoplayNext: Boolean
        get() = prefs.getBoolean(KEY_AUTOPLAY_NEXT, true)
        set(value) = prefs.edit().putBoolean(KEY_AUTOPLAY_NEXT, value).apply()

    /** Default sleep timer in minutes (0 = off, default 0). */
    var defaultSleepTimerMin: Int
        get() = prefs.getInt(KEY_SLEEP_TIMER_MIN, 0)
        set(value) = prefs.edit().putInt(KEY_SLEEP_TIMER_MIN, value).apply()

    companion object {
        private const val PREFS_NAME = "meggy_session"
        private const val KEY_SESSION = "session_cookie"
        private const val KEY_USERNAME = "username"
        private const val KEY_RECENTS = "recents_v1"
        private const val KEY_FAVORITES = "favorites_v1"
        private const val KEY_DEFAULT_SPEED = "default_speed"
        private const val KEY_AUTOPLAY_NEXT = "autoplay_next"
        private const val KEY_SLEEP_TIMER_MIN = "sleep_timer_min"

        @Volatile private var instance: SessionManager? = null
        fun get(context: Context): SessionManager =
            instance ?: synchronized(this) {
                instance ?: SessionManager(context).also { instance = it }
            }
    }
}
