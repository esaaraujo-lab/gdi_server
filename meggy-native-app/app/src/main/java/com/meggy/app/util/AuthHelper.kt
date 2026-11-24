package com.meggy.app.util

import android.app.Activity
import android.content.Context
import android.content.Intent
import com.meggy.app.ui.login.LoginActivity
import com.meggy.app.data.ApiService
import com.meggy.app.data.FolderResult

/**
 * v2.1.0 — Centralized authentication helper.
 *
 * All activities that detect an expired session call [bounceToLogin]
 * instead of duplicating the clearSession + startActivity logic. This
 * guarantees consistent behavior across the app. R19B (P1+P2): a sessão
 * só se dá como expirada depois do [listFolderWithRelogin] (re-login
 * silencioso + 1 repetição); uma falha transitória nunca faz bounce.
 *
 *  • Clears the stale session cookie + playlist.
 *  • Starts LoginActivity with FLAG_ACTIVITY_NEW_TASK | CLEAR_TASK so the
 *    entire back stack is wiped (user can never press back to return to
 *    the expired activity).
 *  • Finishes the current activity.
 *
 * Usage from any Activity (R19B):
 *   val r = AuthHelper.listFolderWithRelogin(api, path)
 *   if (r is FolderResult.SessionExpired) AuthHelper.bounceToLogin(this)
 *   // Transient -> erro + retry; nunca bounce. Ok -> r.files.
 */
object AuthHelper {

    /**
     * Clears the session and routes to LoginActivity with a clean back stack.
     * Call this ONLY when the session is proven expired AND the silent
     * re-login failed (see [listFolderWithRelogin]) — never on a
     * transient network/server failure.
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
     * R19B (P2) — listFolder com re-login silencioso antes do bounce.
     *
     * 1. Corre o listFolder uma vez. Se não for SessionExpired,
     *    retorna-o tal como está (Ok OU Transient — transitória nunca
     *    faz bounce, o chamador mostra erro + retry).
     * 2. Se for SessionExpired, tenta o re-login direto UMA vez
     *    ([ApiService.reLoginWithSavedCredentials] — usa username+senha
     *    salvos; [SessionManager.clearSession] preserva os dois, por
     *    isso o re-login continua possível). R21: sem o probe redundante
     *    do antigo validateOrReLogin — já sabemos que expirou.
     * 3. Se o re-login resultar, repete o listFolder UMA vez e retorna
     *    esse resultado (Ok na maioria dos casos — o destino nem pisca).
     * 4. Se o re-login falhar, retorna SessionExpired — aí sim o
     *    chamador faz [bounceToLogin] (sessão genuinamente expirada).
     *
     * Corre em Dispatchers.IO no chamador (o OkHttp é bloqueante).
     */
    suspend fun listFolderWithRelogin(
        api: ApiService,
        path: String,
        maxPages: Int = 20,
    ): FolderResult {
        val first = api.listFolder(path, maxPages)
        if (first !is FolderResult.SessionExpired) return first
        val relogged = try {
            api.reLoginWithSavedCredentials()
        } catch (_: Exception) {
            false
        }
        if (!relogged) return FolderResult.SessionExpired
        return api.listFolder(path, maxPages)
    }

    /**
     * True quando o resultado tipado de [ApiService.listFolder] diz
     * sessão expirada (HTTP 401/403, corpo HTML de login, ou 200 com
     * corpo de texto "Session Expired" / "Invalid User", R29). R19B: o
     * null único morreu — a distinção é [FolderResult.SessionExpired]
     * vs [FolderResult.Transient].
     */
    fun isSessionExpired(result: FolderResult): Boolean =
        result is FolderResult.SessionExpired
}
