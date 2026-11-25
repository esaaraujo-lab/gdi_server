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
 *  • Recent items — circular list of last 12 (folder, video, timestamp)
 *    used by the "Continue assistindo" rail (was single-item before;
 *    teto 8 até à 2.7.52, 12 desde a 2.7.53).
 *  • Favorites — JSON list of FileItem used by "Minha lista".
 *  • Settings — default playback speed, autoplay-next toggle,
 *    sleep-timer default, stored as primitives.
 */
class SessionManager private constructor(context: Context) {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    // 2.7.48 — contexto da app p/ a costura do servidor (ProgressSync):
    // as chamadas de rede correm em 2º plano e precisam de um Context
    // seguro fora do ciclo de vida de qualquer Activity.
    private val appContext: Context = context.applicationContext

    // ───────── session cookie ─────────

    var sessionCookie: String?
        get() = prefs.getString(KEY_SESSION, null)
        set(value) = prefs.edit().putString(KEY_SESSION, value).apply()

    var username: String?
        get() = prefs.getString(KEY_USERNAME, null)
        set(value) = prefs.edit().putString(KEY_USERNAME, value).apply()

    /**
     * ★ v2.7.3: Persisted password — used by ApiService.validateOrReLogin() to
     * auto re-login when the server cookie expires after a few days.
     * NOTE: This is intentionally preserved by clearSession() so the user does
     * not have to re-enter credentials just because the cookie expired.
     * A full logout (via SettingsActivity) should call a separate fullLogout().
     */
    var password: String?
        get() = prefs.getString(KEY_PASSWORD, null)
        set(value) = prefs.edit().putString(KEY_PASSWORD, value).apply()

    /**
     * v2.7.6 — Sessão no host de IA (AiService).
     *
     * Separada da sessão principal porque o host de IA pode ser outro
     * worker (staging-c/meuc) com outro KV de sessões: o cookie da
     * produção (educa.eu.org) NÃO vale no meuc (KV ENV próprio) e
     * pode valer no staging-c (KV ENV compartilhado com a produção —
     * não garantido). O AiService tenta primeiro este cookie, depois
     * o principal, e por fim faz login no host de IA com as
     * credenciais salvas (username/password) e grava aqui.
     * O fullLogout() também a remove (logout completo limpa tudo).
     */
    var aiSessionCookie: String?
        get() = prefs.getString(KEY_AI_SESSION, null)
        set(value) = prefs.edit().putString(KEY_AI_SESSION, value).apply()

    val isLoggedIn: Boolean get() = !sessionCookie.isNullOrEmpty()

    // ───────── Ronda 10 Frente B: papel de admin (cache) ─────────
    //
    // O app não tem endpoint de papel até o servidor ganhar GET /api/me
    // (dependência v2.15.x); ApiService.checkAdmin() resolve o papel
    // (servidor, ou fallback provisório username == ADMIN_USERS) e
    // salva-o aqui JUNTO com o username a que diz respeito — se o
    // username mudar, o cache deixa de valer e é revalidado.
    // clearSession()/fullLogout() limpam-no. O cache só decide o que a
    // UI MOSTRA (a linha "Gerenciar drives"); o servidor continua a ser o
    // executor (POSTs admin dão 403 a não-admins).

    /** Papel de admin em cache (último valor resolvido). */
    var isAdmin: Boolean
        get() = prefs.getBoolean(KEY_IS_ADMIN, false)
        set(value) = prefs.edit().putBoolean(KEY_IS_ADMIN, value).apply()

    /** Username a que o isAdmin em cache diz respeito. */
    var isAdminForUser: String?
        get() = prefs.getString(KEY_IS_ADMIN_USER, null)
        set(value) = prefs.edit().putString(KEY_IS_ADMIN_USER, value).apply()

    /** isAdmin em cache, mas SÓ se for do username atual; null = sem cache válido. */
    fun cachedIsAdmin(username: String?): Boolean? {
        if (username.isNullOrBlank()) return null
        return if (isAdminForUser == username) isAdmin else null
    }

    fun cacheIsAdmin(username: String?, admin: Boolean) {
        isAdminForUser = username
        isAdmin = admin
    }

    fun clearCachedAdmin() {
        prefs.edit().remove(KEY_IS_ADMIN).remove(KEY_IS_ADMIN_USER).apply()
    }

    /**
     * Clears only the session cookie (+ flags de admin), but PRESERVES
     * username and password so ApiService.reLoginWithSavedCredentials()
     * can auto re-login when the cookie expires. This is the version
     * called by AuthHelper.bounceToLogin().
     *
     * R21: o username deixou de ser apagado — a versão anterior removia
     * KEY_USERNAME e mantinha só a senha, o que tornava o auto re-login
     * impossível (ele exige username E senha) e contradizia este KDoc.
     */
    fun clearSession() {
        prefs.edit()
            .remove(KEY_SESSION)
            .remove(KEY_IS_ADMIN)
            .remove(KEY_IS_ADMIN_USER)
            .apply()
    }

    /**
     * ★ v2.7.3: Full logout — also wipes username + password so the next
     * launch forces manual re-authentication. Called from SettingsActivity
     * when the user explicitly logs out.
     */
    fun fullLogout() {
        prefs.edit()
            .remove(KEY_SESSION)
            .remove(KEY_USERNAME)
            .remove(KEY_PASSWORD)
            .remove(KEY_AI_SESSION)
            .remove(KEY_IS_ADMIN)
            .remove(KEY_IS_ADMIN_USER)
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

    // ───────── Ronda 15 Frente B (B2): migração 1× loja legada ─────────
    //
    // O progresso já visto antes do fix vive em `pos_<url>` (loja legada
    // por URL de playback), que nenhuma UI lê. Os recents_v1 salvam o
    // (folderPath, videoName, link) certo — por isso, uma única vez após
    // o update, cada posição legada é reposta na loja por (pasta, vídeo).
    //
    // LIMITES HONESTOS (diagnóstico §5.1/B2):
    //  • a duração (dur_) NÃO existe na loja legada e não pode ser
    //    inventada — o % só aparece após a 1.ª reprodução pós-fix
    //    (o player volta a gravar dur_ no 1.º saveResumeFor). A migração
    //    repõe a POSIÇÃO ("Continuar" retoma); o % vem depois.
    //  • a flag watched também não é recuperável — fica false até o
    //    vídeo terminar pós-fix.
    //  • recents sem link (anteriores à Frente H) não dão para migrar:
    //    sem o link não se reconstrói a URL legada — são ignorados.
    //  • nunca sobrescreve uma posição já salva na loja certa.
    //  • as chaves legadas pos_ NÃO são apagadas (a loja nova tem
    //    precedência no player; apagar seria perder o fallback).
    //  • a base da URL legada depende do caminho: pastas por ID
    //    ("by-id:", == ApiService.BY_ID_PREFIX) usam o host do sandbox;
    //    drives fixos usam BASE_URL. Recents do Browse em pastas por ID
    //    salvam o link já como URL completa — detectam-se pelo prefixo
    //    http(s) e usam-se como estão.
    // Guarda 1×: KEY_LEGACY_RESUME_MIGRATED. Idempotente (o salto por
    // resume_ já existente torna um 2.º arranque inofensivo).
    fun migrateLegacyUrlResumes(baseUrl: String, sandboxBaseUrl: String): Int {
        if (prefs.getBoolean(KEY_LEGACY_RESUME_MIGRATED, false)) return 0
        var migrated = 0
        try {
            for (recent in getRecents()) {
                try {
                    val link = recent.link ?: continue
                    if (recent.folderPath.isBlank() || recent.videoName.isBlank()) continue
                    if (getResume(recent.folderPath, recent.videoName) > 0L) continue
                    val url = when {
                        link.startsWith("http://") || link.startsWith("https://") -> link
                        recent.folderPath.startsWith("by-id:") -> sandboxBaseUrl + link
                        else -> baseUrl + link
                    }
                    val pos = getResumePosition(url)
                    if (pos > 0L) {
                        saveResume(recent.folderPath, recent.videoName, pos)
                        migrated++
                    }
                } catch (_: Exception) {
                    // Best-effort por recent: um item mau não trava os outros.
                }
            }
        } finally {
            prefs.edit().putBoolean(KEY_LEGACY_RESUME_MIGRATED, true).apply()
        }
        return migrated
    }

    // ───────── per-(folder, video) resume (v1.2.0) ─────────

    fun saveResume(folderPath: String, videoName: String, positionMs: Long) {
        prefs.edit().putLong(resumeKey(folderPath, videoName), positionMs).apply()
        // 2.7.48 — costura do resume entre aparelhos (ProgressSync,
        // POST /userstate/save throttled a 10 s): o servidor recebe a
        // posição; a leitura continua local (o import do arranque
        // alimenta estas mesmas prefs — ver UserStateSync).
        ProgressSync.noteResumeSaved(appContext, folderPath, videoName, positionMs)
    }

    /**
     * v2.3.1 FIX: Returns the saved position, but returns 0 if the position
     * is within 10 seconds of the end (using the saved duration). This
     * prevents the "auto-skip cascade" where opening a nearly-finished
     * video causes it to immediately end and jump to the next one.
     */
    fun getResume(folderPath: String, videoName: String): Long {
        val pos = prefs.getLong(resumeKey(folderPath, videoName), 0L)
        // 2.7.48 — a leitura continua LOCAL: as posições do servidor
        // chegam pelo import do arranque (UserStateSync), que escreve
        // nestas mesmas chaves. resolveResume só devolve o local.
        if (pos <= 0L) return ProgressSync.resolveResume(folderPath, videoName, 0L)
        val dur = prefs.getLong(durKey(folderPath, videoName), 0L)
        // If we know the duration and the position is within 10s of the end,
        // treat as "finished" — return 0 so the player starts from the beginning.
        if (dur > 0L && dur - pos < 10_000L) return 0L
        return ProgressSync.resolveResume(folderPath, videoName, pos)
    }

    /**
     * 2.7.48 — posição gravada SEM a regra dos 10 s do fim (valor
     * cru). Só o import do servidor usa isto: a decisão "local > 0
     * vence" precisa do valor guardado, não do valor já ajustado
     * p/ leitura.
     */
    fun getResumeRaw(folderPath: String, videoName: String): Long =
        prefs.getLong(resumeKey(folderPath, videoName), 0L)

    /**
     * v2.3.1: Uses getResume() so the ▶ continuar badge disappears when the
     * video is essentially finished (within 10s of end).
     */
    fun hasResume(folderPath: String, videoName: String): Boolean =
        getResume(folderPath, videoName) > 0L

    fun clearResume(folderPath: String, videoName: String) {
        prefs.edit().remove(resumeKey(folderPath, videoName)).apply()
    }

    private fun resumeKey(folderPath: String, videoName: String): String =
        "resume_${migrateLegacyCoursePath(folderPath)}::$videoName"

    // ───────── v2.1.0: per-(folder, video) duration ─────────
    //
    // Stored alongside the resume position so adapters can compute the
    // real progress percentage:  progress = position * 100 / duration.
    // Keyed by "dur_<folderPath>::<videoName>".

    /** Saves the total duration (ms) for the (folder, video) pair. */
    fun saveResumeDuration(folderPath: String, videoName: String, durationMs: Long) {
        if (durationMs > 0L) {
            prefs.edit().putLong(durKey(folderPath, videoName), durationMs).apply()
        }
    }

    /** Returns the saved duration (ms) for the (folder, video) pair, or 0. */
    fun getResumeDuration(folderPath: String, videoName: String): Long {
        return prefs.getLong(durKey(folderPath, videoName), 0L)
    }

    /**
     * Returns the progress percentage (0..100) for the (folder, video) pair.
     * Returns 0 if no resume position or duration is stored, or if duration
     * is 0 (avoid div-by-zero).
     */
    fun getResumeProgress(folderPath: String, videoName: String): Int {
        val pos = getResume(folderPath, videoName)
        if (pos <= 0L) return 0
        val dur = getResumeDuration(folderPath, videoName)
        if (dur <= 0L) return 0
        return ((pos * 100L) / dur).toInt().coerceIn(0, 100)
    }

    private fun durKey(folderPath: String, videoName: String): String =
        "dur_${migrateLegacyCoursePath(folderPath)}::$videoName"

    // ───────── per-(folder, video) watched flag (v1.2.0) ─────────

    fun markWatched(folderPath: String, videoName: String) {
        prefs.edit().putBoolean(watchedKey(folderPath, videoName), true).apply()
        // 2.7.48 — o "assistido" também vai p/ o servidor (POST
        // /userstate/save, {watched:{path:true}}), p/ o visto do
        // curso casar entre aparelhos. Best-effort, sem bloquear.
        ProgressSync.noteWatched(appContext, folderPath, videoName)
    }

    fun isWatched(folderPath: String, videoName: String): Boolean =
        prefs.getBoolean(watchedKey(folderPath, videoName), false)

    /**
     * R21 — nº de aulas marcadas como assistidas sob o prefixo de um
     * curso (conta as chaves watched_<pasta>::<vídeo>). É o numerador
     * da progressão dos cartões da Minha Lista; o denominador é o
     * total real do /api/courses/unified (ApiService).
     */
    fun watchedCountUnder(coursePath: String): Int {
        val prefix = migrateLegacyCoursePath(coursePath).trimEnd('/')
        if (prefix.isBlank()) return 0
        return prefs.all.keys.count { key ->
            if (!key.startsWith("watched_")) return@count false
            val folder = key.removePrefix("watched_").substringBefore("::")
            folder == prefix || folder.startsWith("$prefix/")
        }
    }

    private fun watchedKey(folderPath: String, videoName: String): String =
        "watched_${migrateLegacyCoursePath(folderPath)}::$videoName"

    // ───────── per-folder last watched (v1.1.0, retained) ─────────

    fun saveLastWatched(folderPath: String, videoName: String) {
        val folderPath = migrateLegacyCoursePath(folderPath)
        prefs.edit().putString("last_watch_folder", folderPath)
            .putString("last_watch_video", videoName).apply()
        prefs.edit().putString("last_$folderPath", videoName).apply()
    }

    fun getLastWatched(folderPath: String): String? =
        prefs.getString("last_${migrateLegacyCoursePath(folderPath)}", null)

    fun getLastWatchedFolder(): String? =
        prefs.getString("last_watch_folder", null)?.let { migrateLegacyCoursePath(it) }
    fun getLastWatchedVideoName(): String? = prefs.getString("last_watch_video", null)

    // ───────── v2.0.0: Recent items (Continue Assistindo rail) ─────────
    //
    // Circular list of last 12 watched items, stored as a JSON array
    // (teto 8 até à 2.7.52). Each entry: { folder, video, ts }.
    // Deduped by (folder, video).

    /** Adds (or moves to top) a (folder, video) entry in the recents list. */
    fun addRecent(folderPath: String, videoName: String, thumbnailLink: String? = null, link: String? = null) {
        val folderPath = migrateLegacyCoursePath(folderPath)
        val arr = recentArray()
        // v2.7.6: preserva a thumb já salva quando a nova chamada não traz
        // uma (ex.: launchPlayer sem thumb apagava a thumb salva pelo player).
        val oldThumb = arr.objects()
            .firstOrNull {
                migrateLegacyCoursePath(it.optString("folder")) == migrateLegacyCoursePath(folderPath) && it.optString("video") == videoName
            }?.optString("thumb").takeIf { !it.isNullOrBlank() }
        val thumb = thumbnailLink.takeIf { !it.isNullOrBlank() } ?: oldThumb
        // Frente H — preserva o link já salvo quando a nova chamada não traz
        // um (o saveJob do player chama addRecent sem link); sem isto o
        // caminho rápido do "Continuar assistindo" perdia o link.
        val oldLink = arr.objects()
            .firstOrNull {
                migrateLegacyCoursePath(it.optString("folder")) == migrateLegacyCoursePath(folderPath) && it.optString("video") == videoName
            }?.optString("link").takeIf { !it.isNullOrBlank() }
        val savedLink = link.takeIf { !it.isNullOrBlank() } ?: oldLink
        // Remove any existing entry with the same (folder, video)
        val filtered = arr.objects()
            .filter {
                !(migrateLegacyCoursePath(it.optString("folder")) == migrateLegacyCoursePath(folderPath) && it.optString("video") == videoName)
            }
        val newList = ArrayList(filtered)
        val entry = JSONObject()
        entry.put("folder", folderPath)
        entry.put("video", videoName)
        entry.put("ts", System.currentTimeMillis())
        if (!thumb.isNullOrBlank()) entry.put("thumb", thumb)
        // Frente H — link de playback: permite ao "Continuar assistindo"
        // navegar para o player sem o listFolder prévio.
        if (!savedLink.isNullOrBlank()) entry.put("link", savedLink)
        newList.add(0, entry)
        // Cap at 12 (2.7.53 — paridade com os 12 cursos do desktop;
        // antes 8, decisão §11.3 do APK_PROGRESS_SYNC_DESIGN)
        while (newList.size > 12) newList.removeAt(newList.size - 1)
        val out = JSONArray()
        newList.forEach { out.put(it) }
        prefs.edit().putString(KEY_RECENTS, out.toString()).apply()
    }

    /**
     * v2.7.11 — Atualiza SÓ a thumb de um recent existente, no lugar
     * (sem reordenar a lista e sem mexer no timestamp). Usado pelo
     * backfill da Home: recents criados antes da 2.7.8 não tinham thumb
     * salva (o listFolder da época descartava o campo). Não faz nada se
     * o recent não existir.
     */
    fun updateRecentThumb(folderPath: String, videoName: String, thumbnailLink: String) {
        if (thumbnailLink.isBlank()) return
        val arr = recentArray()
        val list = arr.objects().toMutableList()
        val idx = list.indexOfFirst {
            migrateLegacyCoursePath(it.optString("folder")) == migrateLegacyCoursePath(folderPath) && it.optString("video") == videoName
        }
        if (idx < 0) return
        list[idx].put("thumb", thumbnailLink)
        val out = JSONArray()
        list.forEach { out.put(it) }
        prefs.edit().putString(KEY_RECENTS, out.toString()).apply()
    }

    /** Returns the list of recent items as List<RecentItem>, most-recent first. */
    fun getRecents(): List<RecentItem> {
        val arr = recentArray()
        val out = ArrayList<RecentItem>(arr.length())
        for (o in arr.objects()) {
            out.add(RecentItem(
                folderPath = migrateLegacyCoursePath(o.optString("folder")),
                videoName = o.optString("video"),
                timestamp = o.optLong("ts", 0L),
                thumbnailLink = o.optString("thumb").takeIf { it.isNotBlank() },
                // Frente H — link de playback (ausente nos recents antigos).
                link = o.optString("link").takeIf { it.isNotBlank() }
            ))
        }
        return out
    }

    // ───────── 2.7.48: importação do servidor (UserStateSync) ─────────
    //
    // O GET /userstate do arranque funde-se nestas mesmas prefs, num
    // só apply() (um aluno com muitas aulas não pode travar o arranque
    // com um apply por chave). Regras (APK_PROGRESS_SYNC_DESIGN §5.4):
    // resume/durations só entram quando o local é 0/ausente (o aparelho
    // em uso tem sempre a posição mais fresca); watched é união; os
    // recents chegam já fundidos e ordenados (locais + servidor,
    // teto 12 desde a 2.7.53) e substituem a lista. As chamadas são
    // no arranque (onCreate da Home) e ao voltar à Home (onResume,
    // 2.7.53): a fusão lê os recents locais no momento em que corre
    // (depois do GET), por isso um recent gravado pelo player entretanto
    // entra na fusão; resume/watched locais nunca recuam (regras acima).

    /**
     * Funde o estado do servidor nas prefs locais, num só apply().
     * As chaves (folder, video) já vêm na forma local (pasta com a
     * barra final nos drives — ver UserStateSync.serverFolderToLocal).
     */
    fun importServerState(
        resumeMs: Map<Pair<String, String>, Long>,
        durationsMs: Map<Pair<String, String>, Long>,
        watched: Set<Pair<String, String>>,
        recents: List<RecentItem>
    ) {
        val editor = prefs.edit()
        for ((key, ms) in resumeMs) {
            if (ms <= 0L) continue
            val (folder, video) = key
            if (prefs.getLong(resumeKey(folder, video), 0L) == 0L) {
                editor.putLong(resumeKey(folder, video), ms)
            }
        }
        for ((key, ms) in durationsMs) {
            if (ms <= 0L) continue
            val (folder, video) = key
            if (prefs.getLong(durKey(folder, video), 0L) == 0L) {
                editor.putLong(durKey(folder, video), ms)
            }
        }
        for ((folder, video) in watched) {
            if (!prefs.getBoolean(watchedKey(folder, video), false)) {
                editor.putBoolean(watchedKey(folder, video), true)
            }
        }
        val out = JSONArray()
        for (r in recents) {
            val o = JSONObject()
            o.put("folder", r.folderPath)
            o.put("video", r.videoName)
            o.put("ts", r.timestamp)
            r.thumbnailLink?.let { o.put("thumb", it) }
            r.link?.let { o.put("link", it) }
            out.put(o)
        }
        editor.putString(KEY_RECENTS, out.toString())
        editor.apply()
    }

    // ───────── 2.7.48: cache dos agregados do painel de progresso ─────────
    //
    // FONTE: o servidor (GET /userstate + fórmula do site). A cache
    // guarda o último valor derivado p/ o painel mostrar alguma coisa
    // quando o GET falha (sem rede / D1 esgotado); sem cache, o painel
    // esconde-se. Nunca se escreve aqui um valor inventado no aparelho:
    // os minutos assistidos só entram via eventos de histórico do
    // servidor (ver ProgressSync.noteHistorySession).

    data class PanelAggregates(
        val weekMinutes: Int,
        val streak: Int,
        val fetchedAt: Long
    )

    fun cachePanelAggregates(weekMinutes: Int, streak: Int) {
        val o = JSONObject()
        o.put("fetchedAt", System.currentTimeMillis())
        o.put("weekMinutes", weekMinutes)
        o.put("streak", streak)
        prefs.edit().putString(KEY_PANEL_CACHE, o.toString()).apply()
    }

    fun getCachedPanelAggregates(): PanelAggregates? {
        val raw = prefs.getString(KEY_PANEL_CACHE, null) ?: return null
        return try {
            val o = JSONObject(raw)
            PanelAggregates(
                weekMinutes = o.optInt("weekMinutes", 0),
                streak = o.optInt("streak", 0),
                fetchedAt = o.optLong("fetchedAt", 0L)
            )
        } catch (_: Exception) {
            null
        }
    }

    // ───────── 2.7.48: preferências da interface nova ─────────

    /**
     * Menu lateral da TV ligado (interruptor nos Ajustes). Padrão:
     * ligado. Desligado, a TV volta à navegação anterior (ícones no
     * cabeçalho).
     */
    var tvSideMenuEnabled: Boolean
        get() = prefs.getBoolean(KEY_TV_SIDE_MENU, true)
        set(value) = prefs.edit().putBoolean(KEY_TV_SIDE_MENU, value).apply()

    /** Menu lateral da TV recolhido (só ícones). Padrão: expandido. */
    var tvSideMenuCollapsed: Boolean
        get() = prefs.getBoolean(KEY_TV_SIDE_MENU_COLLAPSED, false)
        set(value) = prefs.edit().putBoolean(KEY_TV_SIDE_MENU_COLLAPSED, value).apply()

    /** Lista plana do detalhe em grade (vs lista). Padrão: lista. */
    var flatListGrid: Boolean
        get() = prefs.getBoolean(KEY_FLAT_LIST_GRID, false)
        set(value) = prefs.edit().putBoolean(KEY_FLAT_LIST_GRID, value).apply()

    /**
     * R21 — elementos-objecto de um JSONArray, saltando os que não
     * são objectos. Antes, `getJSONObject` por elemento não tinha
     * salva em addRecent/getRecents/getLessonDescription/etc.: um
     * elemento corrompido nas prefs lançava JSONException e rebentava
     * o chamador (o saveJob do player chama addRecent a cada 2 s).
     */
    private fun JSONArray.objects(): List<JSONObject> =
        (0 until length()).mapNotNull { optJSONObject(it) }

    private fun recentArray(): JSONArray {
        val raw = prefs.getString(KEY_RECENTS, null) ?: return JSONArray()
        return try { JSONArray(raw) } catch (_: Exception) { JSONArray() }
    }

    // ───────── v2.7.6: descrições geradas das aulas (aba Resumo) ─────────
    //
    // Cache local do texto explicativo gerado pela Meggy, chaveado pelo
    // path da pasta da aula. Mesmo padrão dos recents (JSONArray de
    // objetos {path, text, at}, mais recente primeiro, teto de 200).
    // A fonte da verdade é o servidor (cache ISA + pasta .gdi-resumos);
    // isto só evita baixar de novo o que já foi lido — a próxima
    // abertura da aula é instantânea, como no diagrama ("Salvo —
    // abre na hora da próxima vez").

    /** Descrição gerada salva para a pasta da aula (ou null). */
    fun getLessonDescription(lessonPath: String): String? {
        val arr = descriptionArray()
        for (o in arr.objects()) {
            if (o.optString("path") == lessonPath) return o.optString("text").takeIf { it.isNotBlank() }
        }
        return null
    }

    /** Guarda (ou substitui) a descrição gerada da pasta da aula. */
    fun saveLessonDescription(lessonPath: String, text: String) {
        if (text.isBlank()) return
        val arr = descriptionArray()
        val filtered = arr.objects()
            .filter { it.optString("path") != lessonPath }
        val newList = ArrayList(filtered)
        val entry = JSONObject()
        entry.put("path", lessonPath)
        entry.put("text", text)
        entry.put("at", System.currentTimeMillis())
        newList.add(0, entry)
        while (newList.size > MAX_LESSON_DESCRIPTIONS) newList.removeAt(newList.size - 1)
        val out = JSONArray()
        newList.forEach { out.put(it) }
        prefs.edit().putString(KEY_LESSON_DESCRIPTIONS, out.toString()).apply()
    }

    private fun descriptionArray(): JSONArray {
        val raw = prefs.getString(KEY_LESSON_DESCRIPTIONS, null) ?: return JSONArray()
        return try { JSONArray(raw) } catch (_: Exception) { JSONArray() }
    }

    data class RecentItem(
        val folderPath: String,
        val videoName: String,
        val timestamp: Long,
        val thumbnailLink: String? = null,
        // Frente H — link relativo de playback (BASE_URL + link).
        val link: String? = null
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
            for (obj in arr.objects()) {
                val item = runCatching { FileItem.fromJson(obj) }.getOrNull() ?: continue
                out.add(if (item.folderPath.isNullOrBlank()) item
                    else item.copy(folderPath = migrateLegacyCoursePath(item.folderPath)))
            }
            out
        } catch (_: Exception) { emptyList() }
    }

    /** True if (folderPath, name) is in the favorites list. */
    fun isFavorite(folderPath: String?, name: String): Boolean {
        val fp = migrateLegacyCoursePath(folderPath ?: "")
        return getFavorites().any { (it.folderPath ?: "") == fp && it.name == name }
    }

    /** Toggles favorite status. Returns true if item is now favorited. */
    fun toggleFavorite(item: FileItem): Boolean {
        val list = getFavorites().toMutableList()
        val fp = migrateLegacyCoursePath(item.folderPath ?: "")
        val idx = list.indexOfFirst { (it.folderPath ?: "") == fp && it.name == item.name }
        return if (idx >= 0) {
            list.removeAt(idx)
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

    // ───────── v2.7.4: Favorite COURSES ("Minha lista" — cursos/pastas) ─────────
    //
    // Um curso é uma pasta do Drive (drive raiz "/3:/" ou subpasta
    // "/9:/Tribunais/..."). Salvo como JSON [{drivePath, name}].
    // Separado dos favoritos de arquivo (favorites_v1) porque um curso
    // não é um FileItem.

    data class FavCourse(val drivePath: String, val name: String)

    /** Returns the list of favorited courses, most-recently-added first. */
    fun getFavoriteCourses(): List<FavCourse> {
        val raw = prefs.getString(KEY_FAV_COURSES, null) ?: return emptyList()
        return try {
            val arr = JSONArray(raw)
            val out = ArrayList<FavCourse>(arr.length())
            for (o in arr.objects()) {
                val path = migrateLegacyCoursePath(o.optString("drivePath", ""))
                val name = o.optString("name", "")
                if (path.isNotBlank()) out.add(FavCourse(path, name.ifBlank { path }))
            }
            out
        } catch (_: Exception) { emptyList() }
    }

    /** True if drivePath is in the favorite-courses list. */
    fun isFavoriteCourse(drivePath: String): Boolean =
        getFavoriteCourses().any { it.drivePath == migrateLegacyCoursePath(drivePath) }

    /** Toggles a course favorite. Returns true if it is now favorited. */
    fun toggleFavoriteCourse(drivePath: String, name: String): Boolean {
        val drivePath = migrateLegacyCoursePath(drivePath)
        val list = getFavoriteCourses().toMutableList()
        val idx = list.indexOfFirst { it.drivePath == drivePath }
        return if (idx >= 0) {
            list.removeAt(idx)
            saveFavoriteCourses(list)
            false
        } else {
            list.add(0, FavCourse(drivePath, name))
            saveFavoriteCourses(list)
            true
        }
    }

    private fun saveFavoriteCourses(list: List<FavCourse>) {
        val out = JSONArray()
        list.forEach {
            val o = JSONObject()
            o.put("drivePath", it.drivePath)
            o.put("name", it.name)
            out.put(o)
        }
        prefs.edit().putString(KEY_FAV_COURSES, out.toString()).apply()
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

    // ───────── v2.7.6: Ajustes reais (ver REDESIGN_NOTES.md) ─────────

    /** Lembrete diário de estudo às 19:00 (StudyReminder). Padrão: desligado. */
    var notificationsEnabled: Boolean
        get() = prefs.getBoolean(KEY_NOTIFICATIONS, false)
        set(value) = prefs.edit().putBoolean(KEY_NOTIFICATIONS, value).apply()

    /**
     * "Baixar só no Wi-Fi": quando ligado, o cache de vídeo do ExoPlayer
     * (VideoCache) só GRAVA em Wi-Fi. Padrão: ligado.
     */
    var wifiOnlyDownloads: Boolean
        get() = prefs.getBoolean(KEY_WIFI_ONLY, true)
        set(value) = prefs.edit().putBoolean(KEY_WIFI_ONLY, value).apply()

    /**
     * Legendas: controla a renderização de trilhas de texto no player
     * (DefaultTrackSelector). As aulas atuais não trazem trilha de legenda,
     * então o controle fica dormente até o conteúdo ter legendas.
     * Padrão: ligado.
     */
    var subtitlesEnabled: Boolean
        get() = prefs.getBoolean(KEY_SUBTITLES, true)
        set(value) = prefs.edit().putBoolean(KEY_SUBTITLES, value).apply()

    /**
     * Qualidade do vídeo: "auto" | "hd" | "sd". Aplicada via
     * DefaultTrackSelector, MAS só quando houver mais de uma trilha de
     * vídeo (renditions adaptativas) — as aulas atuais são MP4 progressivo
     * de trilha única, e limitar a única trilha apagaria o vídeo.
     * Padrão: "auto".
     */
    var videoQuality: String
        get() = prefs.getString(KEY_VIDEO_QUALITY, "auto") ?: "auto"
        set(value) = prefs.edit().putString(KEY_VIDEO_QUALITY, value).apply()

    // ───────── v2.7.6: buscas recentes (máx. 5) ─────────

    fun addRecentSearch(query: String) {
        val q = query.trim()
        if (q.length < 2) return
        val list = getRecentSearches().toMutableList()
        list.removeAll { it.equals(q, ignoreCase = true) }
        list.add(0, q)
        while (list.size > 5) list.removeAt(list.size - 1)
        prefs.edit().putString(KEY_RECENT_SEARCHES, JSONArray(list).toString()).apply()
    }

    fun getRecentSearches(): List<String> {
        val raw = prefs.getString(KEY_RECENT_SEARCHES, null) ?: return emptyList()
        return try {
            val arr = JSONArray(raw)
            (0 until arr.length()).map { arr.optString(it) }.filter { it.isNotBlank() }
        } catch (_: Exception) { emptyList() }
    }

    // ───────── v2.7.6: documentos marcados (leitores PDF/MD) ─────────

    data class Bookmark(val path: String, val name: String, val kind: String)

    fun toggleBookmark(path: String, name: String, kind: String): Boolean {
        val path = migrateLegacyCoursePath(path)
        val list = getBookmarks().toMutableList()
        val existing = list.indexOfFirst { it.path == path }
        return if (existing >= 0) {
            list.removeAt(existing); saveBookmarks(list); false
        } else {
            list.add(0, Bookmark(path, name, kind)); saveBookmarks(list); true
        }
    }

    fun isBookmarked(path: String): Boolean = getBookmarks().any { it.path == migrateLegacyCoursePath(path) }

    fun getBookmarks(): List<Bookmark> {
        val raw = prefs.getString(KEY_BOOKMARKS, null) ?: return emptyList()
        return try {
            val arr = JSONArray(raw)
            arr.objects().map { o ->
                Bookmark(migrateLegacyCoursePath(o.optString("path")), o.optString("name"), o.optString("kind"))
            }
        } catch (_: Exception) { emptyList() }
    }

    private fun saveBookmarks(list: List<Bookmark>) {
        val out = JSONArray()
        list.forEach {
            val o = JSONObject()
            o.put("path", it.path); o.put("name", it.name); o.put("kind", it.kind)
            out.put(o)
        }
        prefs.edit().putString(KEY_BOOKMARKS, out.toString()).apply()
    }

    /** Escala da fonte do leitor de MD (A−/A+, 0.7–2.0). Padrão 1.0. */
    var mdFontScale: Float
        get() = prefs.getFloat(KEY_MD_FONT_SCALE, 1.0f)
        set(value) = prefs.edit().putFloat(KEY_MD_FONT_SCALE, value.coerceIn(0.7f, 2.0f)).apply()

    /** Última página lida de um PDF (retomar de onde parou). */
    fun savePdfPage(path: String, page: Int) {
        prefs.edit().putInt("pdf_page_${path.hashCode()}", page).apply()
    }

    fun getPdfPage(path: String): Int = prefs.getInt("pdf_page_${path.hashCode()}", 0)

    companion object {
        private const val PREFS_NAME = "meggy_session"
        private const val KEY_SESSION = "session_cookie"
        private const val KEY_USERNAME = "username"
        private const val KEY_PASSWORD = "password"
        private const val KEY_RECENTS = "recents_v1"
        private const val KEY_LEGACY_RESUME_MIGRATED = "r15_legacy_resume_migrated"
        private const val KEY_FAVORITES = "favorites_v1"
        private const val KEY_FAV_COURSES = "fav_courses_v1"
        private const val KEY_DEFAULT_SPEED = "default_speed"
        private const val KEY_AUTOPLAY_NEXT = "autoplay_next"
        private const val KEY_SLEEP_TIMER_MIN = "sleep_timer_min"
        private const val KEY_NOTIFICATIONS = "notifications_enabled"
        private const val KEY_WIFI_ONLY = "wifi_only_downloads"
        private const val KEY_SUBTITLES = "subtitles_enabled"
        private const val KEY_VIDEO_QUALITY = "video_quality"
        private const val KEY_RECENT_SEARCHES = "recent_searches_v1"
        private const val KEY_BOOKMARKS = "bookmarks_v1"
        private const val KEY_MD_FONT_SCALE = "md_font_scale"
        private const val KEY_AI_SESSION = "ai_session_cookie"
        private const val KEY_IS_ADMIN = "is_admin"
        private const val KEY_IS_ADMIN_USER = "is_admin_user"
        private const val KEY_LESSON_DESCRIPTIONS = "lesson_descriptions_v1"
        private const val MAX_LESSON_DESCRIPTIONS = 200

        // 2.7.48 — cache dos agregados do painel de progresso (fonte:
        // servidor, via GET /userstate; a cache é só cache — ver
        // UserStateSync.derivePanelAggregates).
        private const val KEY_PANEL_CACHE = "panel_cache_v1"
        // 2.7.48 — menu lateral da TV (interruptor nos Ajustes) e o
        // seu estado recolhido (só ícones).
        private const val KEY_TV_SIDE_MENU = "tv_side_menu_enabled"
        private const val KEY_TV_SIDE_MENU_COLLAPSED = "tv_side_menu_collapsed"
        // 2.7.48 — lista plana do detalhe em grade (vs lista).
        private const val KEY_FLAT_LIST_GRID = "flat_list_grid"

        // ───────── Ronda 12: migração de caminhos salvos ─────────
        //
        // A organização antiga do drive 11 punha os cursos sob
        // "/11:/CURSOS 2026/…" — esse prefixo já não existe no
        // drive 11 (a organização vive hoje no drive 9, e os cursos
        // do 11 estão directamente na raiz). Os caminhos salvos
        // (favoritos de curso, favoritos de arquivo, recents,
        // bookmarks) salvam o drivePath LITERAL da altura em que
        // foram marcados, por isso um favorito antigo continua a
        // pedir um caminho inexistente (produção: 200 + files:[])
        // mesmo depois de a navegação estar certa. Normalizar na
        // LEITURA (o JSON salvo não é reescrito): "/11:/CURSOS
        // 2026/<resto>" e a variante codificada "/11:/CURSOS%202026/
        // <resto>" passam a "/11:/<resto>". ÂMBITO ESTRITO: só o
        // prefixo /11:/ — o "/9:/CURSOS 2026/" existe e NÃO se toca.
        // Forma salva no app: espaço cru ("CURSOS 2026"), porque
        // os caminhos salvos vêm do currentPath, construído com
        // os nomes crus retornados pelo servidor; a variante %20 é
        // aceite por defesa (ex.: caminho vindo do D1).
        fun migrateLegacyCoursePath(path: String): String {
            for (legacy in listOf("/11:/CURSOS 2026", "/11:/CURSOS%202026")) {
                if (path == legacy || path == "$legacy/") return "/11:/"
                if (path.startsWith("$legacy/")) return "/11:/" + path.removePrefix("$legacy/")
            }
            return path
        }

        @Volatile private var instance: SessionManager? = null
        fun get(context: Context): SessionManager =
            instance ?: synchronized(this) {
                instance ?: SessionManager(context).also { instance = it }
            }
    }
}
