package com.bibigyn.app.util

import android.content.Context
import com.bibigyn.app.BiBiGynApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar
import java.util.TimeZone
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * 2.1.43 — Transporte do progresso p/ o servidor (regra multiplataforma
 * do Elton 2026-11-24 22:41: nada funciona só no app).
 *
 * Usa AS MESMAS rotas que o desktop usa (worker .93, já existentes —
 * nenhuma rota nova): GET /userstate (ler) + POST /userstate/save
 * (gravar), tabelas user_watched + user_history_events, D1 primeiro
 * com journal no Drive em falha (o worker devolve {ok:true,
 * fallback:true} e o dado não se perde). Contrato verificado em
 * APK_PROGRESS_SYNC_DESIGN.md §2 (worker .93: handleUserStateGet /
 * handleUserStateSave, userStateSaveApplyD1, userStateComposeD1).
 *
 * Cliente PRÓPRIO (não o okHttpClient partilhado): o partilhado tem
 * .followRedirects(false) p/ capturar o 302 do cookie de login, e o
 * /userstate devolve 302 sem ele — o desktop passou pelo mesmo na
 * 1.9.8 e criou um cliente separado que segue redirects. Alvo:
 * https://educa.eu.org (BiBiGynApp.BASE_URL), NUNCA o AI_BASE_URL
 * (staging-c); cookie: a sessão principal (sessionCookie), NUNCA o
 * aiSessionCookie.
 *
 * Tudo best-effort e silencioso (como o desktop): sem rede, 5xx ou
 * D1 esgotado (GET 502), o dado fica só local e tenta-se no próximo
 * arranque/tick — nunca toast, nunca modal, nunca bloqueio do player.
 * 401 = sessão expirada: não se faz bounce daqui (o tratamento de
 * sessão vive no ApiService/AuthHelper); o import fica p/ o próximo
 * arranque, com a sessão reposta.
 *
 * Os minutos (weekMinutes/streak do painel) vêm dos history events:
 * o worker GRAVA `minutes` quando o evento o traz (INSERT OR IGNORE
 * em user_history_events, worker .93 L1273) e o GET devolve-o — mas o
 * desktop NUNCA o envia (fica 0). Por isso o app envia os minutos
 * reais da sessão no evento de histórico (ver ProgressSync).
 * A derivação dos agregados copia EXACTAMENTE a do site
 * (handleAnalyticsSummary, worker .93 L21790-21815): weekMinutes =
 * soma dos minutes dos eventos dos últimos 7 dias; streak = dias
 * consecutivos (a começar HOJE) com minutes > 0; os dias são em UTC
 * (o servidor corre em UTC). Sem campo no servidor p/ "horas da
 * semana", o cálculo é este — nunca um registo local como fonte.
 */
object UserStateSync {

    /** Cliente que SEGUE redirects (até 5, padrão do OkHttp). */
    private val client: OkHttpClient = OkHttpClient.Builder()
        .followRedirects(true)
        .followSslRedirects(true)
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    /** Âmbito p/ os POSTs fire-and-forget (nunca bloqueiam o player). */
    val ioScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /**
     * 2.1.43 — guarda de import em curso: o import corre no arranque
     * e ao voltar à Home; dois em simultâneo fariam o mesmo GET e a
     * mesma fusão duas vezes.
     */
    private val importInFlight = AtomicBoolean(false)

    /** Um evento de histórico do blob /userstate. */
    data class HistoryEvent(
        val path: String,
        val atMs: Long,
        val minutes: Int,
        val name: String?,
        val coursePath: String?
    )

    /** Blob /userstate (só os campos que o app consome). */
    data class UserStateBlob(
        /** path -> watched_at (ms; 0 quando o servidor gravou escalar). */
        val watchedAt: Map<String, Long>,
        /** path -> posição (segundos). */
        val resumeSec: Map<String, Long>,
        /** path -> duração (segundos). */
        val durationsSec: Map<String, Long>,
        val history: List<HistoryEvent>
    )

    // ───────── leitura ─────────

    /**
     * GET /userstate (bloqueante — chamar em Dispatchers.IO).
     * 200 -> blob; 401/404/502/outro/sem sessão/sem rede -> null.
     * 404 = "aluno sem estado", não é erro.
     */
    fun fetchUserState(context: Context): UserStateBlob? {
        val cookie = SessionManager.get(context).sessionCookie
            ?.takeIf { it.isNotBlank() } ?: return null
        val request = Request.Builder()
            .url("${BiBiGynApp.BASE_URL}/userstate")
            .header("Cookie", "session=$cookie")
            .get()
            .build()
        return try {
            client.newCall(request).execute().use { response ->
                if (response.code != 200) return null
                val body = response.body?.string() ?: return null
                parseBlob(JSONObject(body))
            }
        } catch (_: Exception) {
            null
        }
    }

    /** Parse defensivo do blob: formas escalares e objecto coexistem. */
    fun parseBlob(json: JSONObject): UserStateBlob {
        val watchedAt = HashMap<String, Long>()
        json.optJSONObject("watched")?.let { watched ->
            val keys = watched.keys()
            while (keys.hasNext()) {
                val path = keys.next()
                val value = watched.opt(path)
                val at = when (value) {
                    is JSONObject -> value.optLong("at", 0L)
                    else -> 0L // escalar true: assistido, sem timestamp
                }
                watchedAt[path] = at
            }
        }
        val resumeSec = HashMap<String, Long>()
        json.optJSONObject("resume")?.let { resume ->
            val keys = resume.keys()
            while (keys.hasNext()) {
                val path = keys.next()
                val value = resume.opt(path)
                val seconds = when (value) {
                    is Number -> value.toLong()
                    is JSONObject -> value.optLong("t", 0L)
                    else -> 0L
                }
                if (seconds > 0) resumeSec[path] = seconds
            }
        }
        val durationsSec = HashMap<String, Long>()
        json.optJSONObject("durations")?.let { durations ->
            val keys = durations.keys()
            while (keys.hasNext()) {
                val path = keys.next()
                val seconds = durations.optLong(path, 0L)
                if (seconds > 0) durationsSec[path] = seconds
            }
        }
        val history = ArrayList<HistoryEvent>()
        json.optJSONArray("history")?.let { arr ->
            for (i in 0 until arr.length()) {
                val ev = arr.optJSONObject(i) ?: continue
                val path = ev.optString("path").takeIf { it.isNotBlank() } ?: continue
                history.add(
                    HistoryEvent(
                        path = path,
                        atMs = ev.optLong("at", 0L),
                        minutes = ev.optInt("minutes", 0),
                        name = ev.optString("name").takeIf { it.isNotBlank() },
                        coursePath = ev.optString("course_path").takeIf { it.isNotBlank() }
                    )
                )
            }
        }
        return UserStateBlob(watchedAt, resumeSec, durationsSec, history)
    }

    // ───────── escrita ─────────

    /**
     * POST /userstate/save com um PATCH (só o que mudou — NÃO o blob
     * inteiro; o worker funde do lado dele). Bloqueante — chamar em
     * Dispatchers.IO. true = {ok:true} (inclui fallback:true, journal
     * no Drive); false = sem sessão, erro ou sem rede.
     */
    fun postUserStatePatch(context: Context, patchJson: String): Boolean {
        val cookie = SessionManager.get(context).sessionCookie
            ?.takeIf { it.isNotBlank() } ?: return false
        val request = Request.Builder()
            .url("${BiBiGynApp.BASE_URL}/userstate/save")
            .header("Cookie", "session=$cookie")
            .header("Content-Type", "application/json")
            .post(patchJson.toRequestBody("application/json".toMediaTypeOrNull()))
            .build()
        return try {
            client.newCall(request).execute().use { response ->
                if (response.code != 200) return false
                val body = response.body?.string() ?: return false
                JSONObject(body).optBoolean("ok", false)
            }
        } catch (_: Exception) {
            false
        }
    }

    /** POST fire-and-forget (nunca bloqueia o chamador). */
    fun postPatchAsync(context: Context, patchJson: String) {
        val appContext = context.applicationContext
        ioScope.launch { postUserStatePatch(appContext, patchJson) }
    }

    // ───────── caminhos ─────────

    /**
     * Path do servidor p/ (pasta, vídeo) — o mesmo formato do desktop
     * (lessonPathOf, Home.tsx): "/"+partes da pasta+vídeo, SEM barra
     * final. A pasta local traz quase sempre a barra final ("/0:/…/");
     * aqui ela é normalizada. NUNCA chavear por link.
     */
    fun lessonPath(folderPath: String, videoName: String): String {
        val folder = SessionManager.migrateLegacyCoursePath(folderPath).trimEnd('/')
        return "$folder/$videoName"
    }

    /** Decompõe um path do servidor em (pasta, vídeo); null se inválido. */
    fun splitLessonPath(path: String): Pair<String, String>? {
        val clean = path.trim()
        val idx = clean.lastIndexOf('/')
        if (idx <= 0 || idx >= clean.length - 1) return null
        return clean.substring(0, idx) to clean.substring(idx + 1)
    }

    /**
     * A pasta local (chaves resume_/dur_/watched_ e recents) traz a
     * barra final nos caminhos de drive ("/0:/…/") e NÃO a traz nos
     * by-id ("by-id:<id>"). O path do servidor nunca traz a barra
     * final — por isso, ao importar, repõe-se a forma local: com
     * barra final p/ drives, tal como vem p/ by-id. Sem isto, a
     * importação escrevia chaves que nenhuma leitura local casava.
     */
    fun serverFolderToLocal(folder: String): String =
        if (folder.startsWith("/")) folder.trimEnd('/') + "/" else folder

    // ───────── importação (arranque + regresso à Home) ─────────

    /**
     * Importação (APK_PROGRESS_SYNC_DESIGN §5.4): GET + merge nas
     * prefs locais + agregados do painel. Corre no arranque (onCreate
     * da Home) e, desde a 2.1.43, também ao voltar à Home (onResume)
     * — assim o progresso feito noutro aparelho enquanto a app estava
     * aberta aparece sem reiniciar a app. Corre em Dispatchers.IO;
     * não lança excepção; falha = nada muda (o local continua a
     * funcionar e o próximo arranque/regresso tenta outra vez).
     * A guarda [importInFlight] impede imports duplicados em
     * simultâneo (quem chega segundo salta; a fusão em curso já lê
     * o estado local no momento em que corre, depois do GET).
     * Regras de merge (local ganha onde há conflito):
     * - resume: só importa quando o local é 0/ausente;
     * - durations: idem; - watched: união (nunca se desmarca);
     * - history -> recents: só os eventos cuja (pasta, vídeo) não
     *   existe nos recents locais; fundidos por timestamp DESC,
     *   teto 12 (8 até à 2.1.42).
     * Os agregados do painel derivam-se do MESMO blob (fórmula do
     * site) e ficam em cache — a cache é só cache, nunca a fonte.
     */
    fun importOnStartup(context: Context) {
        if (!importInFlight.compareAndSet(false, true)) return
        try {
            importMerged(context)
        } finally {
            importInFlight.set(false)
        }
    }

    /** Corpo do import (GET + fusão) — só corre com a guarda tomada. */
    private fun importMerged(context: Context) {
        val blob = fetchUserState(context) ?: return
        val sm = SessionManager.get(context)

        val resumeMs = HashMap<Pair<String, String>, Long>()
        for ((path, seconds) in blob.resumeSec) {
            val (folder, video) = splitLessonPath(path) ?: continue
            resumeMs[serverFolderToLocal(folder) to video] = seconds * 1000L
        }
        val durationsMs = HashMap<Pair<String, String>, Long>()
        for ((path, seconds) in blob.durationsSec) {
            val (folder, video) = splitLessonPath(path) ?: continue
            durationsMs[serverFolderToLocal(folder) to video] = seconds * 1000L
        }
        val watched = HashSet<Pair<String, String>>()
        for (path in blob.watchedAt.keys) {
            val (folder, video) = splitLessonPath(path) ?: continue
            watched.add(serverFolderToLocal(folder) to video)
        }

        // Recents fundidos: locais (com thumb/link) + eventos do
        // servidor sem correspondência local (sem thumb/link — o
        // servidor não os tem; o toque usa o caminho lento).
        val localRecents = sm.getRecents()
        val localKeys = localRecents.map {
            SessionManager.migrateLegacyCoursePath(it.folderPath).trimEnd('/') to it.videoName
        }.toHashSet()
        val imported = blob.history
            .sortedByDescending { it.atMs }
            .mapNotNull { ev ->
                val (folder, video) = splitLessonPath(ev.path) ?: return@mapNotNull null
                val key = SessionManager.migrateLegacyCoursePath(folder).trimEnd('/') to video
                if (key in localKeys) return@mapNotNull null
                SessionManager.RecentItem(
                    folderPath = serverFolderToLocal(folder),
                    videoName = video,
                    timestamp = ev.atMs,
                    thumbnailLink = null,
                    link = null
                )
            }
        val mergedRecents = (localRecents + imported)
            .sortedByDescending { it.timestamp }
            .take(12)

        val (weekMinutes, streak) = derivePanelAggregates(blob.history)
        sm.importServerState(resumeMs, durationsMs, watched, mergedRecents)
        sm.cachePanelAggregates(weekMinutes, streak)
    }

    // ───────── agregados do painel (fórmula do site) ─────────

    /**
     * Cópia da derivação do site (handleAnalyticsSummary, worker .93):
     * weekMinutes = soma dos minutes dos eventos dos últimos 7 dias
     * (janela rolante, não semana de calendário); streak = dias
     * consecutivos a começar HOJE com minutes > 0 (se hoje ainda não
     * houve minutos, o streak é 0 — é a regra do site, não um bug).
     * Os dias são em UTC (o servidor corre em UTC); usar o fuso do
     * aparelho deslocava a fronteira do dia em 3 h.
     */
    fun derivePanelAggregates(
        history: List<HistoryEvent>,
        nowMs: Long = System.currentTimeMillis()
    ): Pair<Int, Int> {
        val weekAgo = nowMs - 7L * 24 * 60 * 60 * 1000
        var weekMinutes = 0
        val heatmap = HashMap<String, Int>()
        for (h in history) {
            if (h.atMs <= 0) continue
            val mins = h.minutes
            if (h.atMs >= weekAgo) weekMinutes += mins
            val key = utcDayKey(h.atMs)
            heatmap[key] = (heatmap[key] ?: 0) + mins
        }
        var streak = 0
        var dayStartMs = utcDayStart(nowMs)
        while (true) {
            val key = utcDayKey(dayStartMs)
            if ((heatmap[key] ?: 0) > 0) {
                streak++
                dayStartMs -= 24L * 60 * 60 * 1000
            } else {
                break
            }
        }
        return weekMinutes to streak
    }

    /** "YYYY-MM-DD" em UTC. */
    fun utcDayKey(epochMs: Long): String {
        val cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
        cal.timeInMillis = epochMs
        return "%04d-%02d-%02d".format(
            cal.get(Calendar.YEAR),
            cal.get(Calendar.MONTH) + 1,
            cal.get(Calendar.DAY_OF_MONTH)
        )
    }

    /** Meia-noite UTC do dia de [epochMs]. */
    fun utcDayStart(epochMs: Long): Long {
        val cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
        cal.timeInMillis = epochMs
        cal.set(Calendar.HOUR_OF_DAY, 0)
        cal.set(Calendar.MINUTE, 0)
        cal.set(Calendar.SECOND, 0)
        cal.set(Calendar.MILLISECOND, 0)
        return cal.timeInMillis
    }

    /** Formato do painel: 90 min -> "1h 30min"; 45 min -> "45min". */
    fun formatWeekHours(weekMinutes: Int): String {
        val hours = weekMinutes / 60
        val minutes = weekMinutes % 60
        return if (hours > 0) "${hours}h ${minutes}min" else "${minutes}min"
    }
}
