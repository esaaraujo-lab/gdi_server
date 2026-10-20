package com.bibigyn.app.util

import android.app.Activity
import android.content.Context
import android.content.Intent
import com.bibigyn.app.ui.login.LoginActivity

/**
 * v2.1.0 — Centralized authentication helper.
 *
 * All activities that detect an expired session (null API response) call
 * [bounceToLogin] instead of duplicating the clearSession + startActivity
 * logic. This guarantees consistent behavior across the app:
 *
 *  • Clears the stale session cookie + playlist.
 *  • Starts LoginActivity with FLAG_ACTIVITY_NEW_TASK | CLEAR_TASK so the
 *    entire back stack is wiped (user can never press back to return to
 *    the expired activity).
 *  • Finishes the current activity.
 *
 * Usage from any Activity:
 *   if (files == null) { AuthHelper.bounceToLogin(this); return }
 */
object AuthHelper {

    /**
     * Clears the session and routes to LoginActivity with a clean back stack.
     * Call this when an API call returns null (indicating an expired cookie
     * or an HTML login redirect from the server).
     */
    fun bounceToLogin(activity: Activity) {
        // Clear the stale session so SplashActivity routes to Login next time.
        SessionManager.get(activity).clearSession()
        PlaylistManager.clear()
        val intent = Intent(activity, LoginActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        activity.startActivity(intent)
        activity.finish()
    }

    /**
     * Returns true if the given result (from ApiService.listFolder etc.)
     * indicates an expired session. ApiService returns null when the server
     * responds with an HTML login redirect or a non-2xx status code.
     *
     * Usage:
     *   val files = api.listFolder(path)
     *   if (AuthHelper.isSessionExpired(files)) {
     *       AuthHelper.bounceToLogin(this)
     *       return
     *   }
     */
    fun isSessionExpired(apiResult: Any?): Boolean = apiResult == null
}
