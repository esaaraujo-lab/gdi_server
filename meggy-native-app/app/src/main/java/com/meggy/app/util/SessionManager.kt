package com.meggy.app.util

import android.content.Context
import android.content.SharedPreferences

/**
 * SessionManager — persists the worker.js `session` cookie (an opaque encrypted
 * string returned by POST /login) in SharedPreferences.
 *
 * v1.2.0 additions (alongside the v1.0/v1.1 stores):
 *  • per-(folder, video) resume position — keyed `"resume_<folderPath>::<videoName>"`
 *    so the same video name in two different folders keeps independent resume
 *    positions (critical for cross-folder playlists where every lesson's file
 *    is literally named "video.mp4").
 *  • per-(folder, video) "watched" flag — keyed `"watched_<folderPath>::<videoName>"`
 *    so BrowseActivity can show a ✓ checkmark on finished lessons.
 *
 * The legacy per-URL resume store (`pos_<url>`) and the per-folder last-watched
 * store (`last_<folderPath>`) are retained for backward compatibility.
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
    //
    // Keyed by "resume_<folderPath>::<videoName>". This is what powers the
    // cross-folder playlist: every lesson folder contains a file literally
    // named "video.mp4", so keying on (folder, video) — not just video name —
    // is the only way to keep their resume positions independent.

    /** Saves the playback position for the given (folder, video) pair. */
    fun saveResume(folderPath: String, videoName: String, positionMs: Long) {
        prefs.edit().putLong(resumeKey(folderPath, videoName), positionMs).apply()
    }

    /** Returns the saved position (ms) for the (folder, video) pair, or 0. */
    fun getResume(folderPath: String, videoName: String): Long {
        return prefs.getLong(resumeKey(folderPath, videoName), 0L)
    }

    /** True when there is a non-zero resume position for the (folder, video) pair. */
    fun hasResume(folderPath: String, videoName: String): Boolean =
        prefs.getLong(resumeKey(folderPath, videoName), 0L) > 0L

    /** Clears the resume position for the (folder, video) pair (called on natural end). */
    fun clearResume(folderPath: String, videoName: String) {
        prefs.edit().remove(resumeKey(folderPath, videoName)).apply()
    }

    private fun resumeKey(folderPath: String, videoName: String): String =
        "resume_$folderPath::$videoName"

    // ───────── per-(folder, video) watched flag (v1.2.0) ─────────

    /** Marks the (folder, video) pair as fully watched. */
    fun markWatched(folderPath: String, videoName: String) {
        prefs.edit().putBoolean(watchedKey(folderPath, videoName), true).apply()
    }

    /** True when the (folder, video) pair was previously watched to the end. */
    fun isWatched(folderPath: String, videoName: String): Boolean =
        prefs.getBoolean(watchedKey(folderPath, videoName), false)

    private fun watchedKey(folderPath: String, videoName: String): String =
        "watched_$folderPath::$videoName"

    // ───────── per-folder last watched (v1.1.0, retained) ─────────

    /** Records the name of the last video opened from [folderPath]. */
    fun saveLastWatched(folderPath: String, videoName: String) {
        prefs.edit().putString("last_$folderPath", videoName).apply()
    }

    /** Returns the name of the last video opened from [folderPath], or null. */
    fun getLastWatched(folderPath: String): String? {
        return prefs.getString("last_$folderPath", null)
    }

    companion object {
        private const val PREFS_NAME = "meggy_session"
        private const val KEY_SESSION = "session_cookie"
        private const val KEY_USERNAME = "username"

        @Volatile private var instance: SessionManager? = null
        fun get(context: Context): SessionManager =
            instance ?: synchronized(this) {
                instance ?: SessionManager(context).also { instance = it }
            }
    }
}
