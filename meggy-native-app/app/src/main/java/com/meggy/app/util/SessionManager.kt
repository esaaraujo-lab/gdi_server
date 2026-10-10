package com.meggy.app.util

import android.content.Context
import android.content.SharedPreferences

/**
 * SessionManager — persists the worker.js `session` cookie (an opaque encrypted
 * string returned by POST /login) in SharedPreferences.
 *
 * The cookie is reused on every subsequent API call (see [com.meggy.app.data.ApiService]).
 *
 * Also persists per-file video resume positions: the key is the file's download link
 * (which is unique per file) and the value is the playback position in milliseconds.
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

    // ───────── video resume positions ─────────

    /**
     * Returns the saved playback position in milliseconds for the given file URL,
     * or 0L if no position was saved. We also clear positions that are within
     * the last 5 seconds of the file (treat those as "finished").
     */
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
