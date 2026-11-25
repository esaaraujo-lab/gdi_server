package com.vovofit.app.util

import android.content.Context
import com.vovofit.app.VovoFitApp
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
 * 1.0.39 — Resume/progresso ENTRE APARELHOS (ecossistema) — LIGADO.
 *
 * Até à 1.0.38 este objecto era só a COSTURA: [SERVER_RESUME_ENABLED]
 * false e o caminho null DE PROPÓSITO, à espera do endpoint do
 * backend. O endpoint existe desde o worker .93 — GET /userstate +
 * POST /userstate/save, as mesmas rotas que o desktop, a Meggy
 * (2.7.48/2.7.53) e a BiBi Fit (2.1.43) usam (SPEC
 * PROGRESSO_ADMIN_94, Parte 3) — e esta versão preenche a costura
 * com esse contrato verificado, sem rota nova:
 *   - o arranque e o regresso à Home importam o estado do servidor
 *     (GET /userstate) e fundem-no nas prefs locais
 *     ([importOnStartup], com guarda anti-duplicação);
 *   - a reprodução grava de volta (POST /userstate/save, patches):
 *     posição a cada 10 s e ao sair do player, "assistido" aos >50%
 *     e no fim, e o evento de histórico no fim da sessão com os
 *     minutos REAIS assistidos.
 * Na Meggy/BiBi o transporte vive num UserStateSync separado; aqui
 * fica tudo neste objecto (a costura histórica da Vovó), com a mesma
 * semântica. O nome reservado SERVER_RESUME_PATH do stub saiu: os
 * caminhos reais são [USERSTATE_GET_PATH] e [USERSTATE_SAVE_PATH]
 * (nada referenciava o nome antigo — verificado).
 *
 * Cliente PRÓPRIO (não o okHttpClient partilhado): o partilhado tem
 * .followRedirects(false) p/ capturar o 302 do cookie de login, e o
 * /userstate devolve 302 sem ele. Alvo: https://educa.eu.org
 * (VovoFitApp.BASE_URL), NUNCA o AI_BASE_URL; cookie: a sessão
 * principal (sessionCookie). Chaves SEMPRE por path (nunca por
 * link). Tudo best-effort e silencioso: sem rede, 5xx ou D1
 * esgotado, o dado fica só local e tenta-se no próximo
 * arranque/tick — nunca toast, nunca modal, nunca bloqueio do
 * player. A leitura do resume continua LOCAL (o import alimenta as
 * mesmas prefs — ver [resolveResume]).
 *
 * ── AUDITORIA DE ECOSSISTEMA (v1.0.8, actualizada na 1.0.39) ──
 *
 * Regra: o que é entre aparelhos vem do backend e do BD
 * compartilhado (BASE_URL educa.eu.org; D1/KV do worker); o app NÃO
 * inventa equivalente local. Cache local (SharedPreferences) é só
 * cache — a fonte da verdade é o backend.
 *
 *   Descrições/resumos ....... BACKEND — AiService (POST /api/ai/battalion,
 *     GET /api/ai/summaries, /api/materials/load|save-in-folder; cache
 *     ISA em KV + .gdi-resumos/ no Drive).
 *   Questões ................. PENDENTE — o batalhão GERA questões
 *     (AiService.BattalionStatus.hasQuestions), mas o app NÃO as lê:
 *     as abas Questões/Flashcards do detalhe mostram só o placeholder.
 *     Falta o endpoint de leitura no backend + a ligação na UI.
 *   Flashcards ............... PENDENTE — idem questões.
 *   Planos de estudo ......... PENDENTE — o app NÃO tem tela nem
 *     chamada de plano (nenhum /api/plans/... no código).
 *   Capas .................... BACKEND + BIBLIOTECA (hierarquia 1-4):
 *     (1) coverUrl do admin (GET /api/featured-courses); (2) thumb do
 *     Drive; (3) biblioteca por tipo (CoverLibrary); (4) capa local.
 *   Legendas ................. BACKEND — SubtitleFetcher (GET
 *     /api/ai/subtitles).
 *   Continuar de onde parou .. ATIVO na 1.0.39 (este objecto): lê e
 *     grava no /userstate do backend (fonte entre aparelhos); o
 *     SessionManager local é a cache de leitura/escrita imediata.
 *   Roku ..................... PENDENTE / FORA DE ESCOPO — outra
 *     plataforma (outro app, BrightScript); não tocado nesta ronda.
 */
object ResumeSync {

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
     * 1.0.39 — guarda de import em curso: o import corre no arranque
     * e ao voltar à Home; dois em simultâneo fariam o mesmo GET e a
     * mesma fusão duas vezes.
     */
    private val importInFlight = AtomicBoolean(false)

    /**
     * Flag-mestra do resume no servidor: true = LIGADO (1.0.39).
     * false = DESLIGADO: nada sai do aparelho (o local continua a
     * funcionar sozinho, como até à 1.0.38).
     */
    val SERVER_RESUME_ENABLED = true

    /** GET do estado (import do arranque + regresso à Home). */
    const val USERSTATE_GET_PATH = "/userstate"

    /** POST dos patches (posição, assistido, histórico). */
    const val USERSTATE_SAVE_PATH = "/userstate/save"

    /** Throttle da posição: 1 POST por 10 s a tocar (como o desktop). */
    private const val RESUME_POST_THROTTLE_MS = 10_000L

    private val lastResumePostAt = HashMap<String, Long>()

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
            .url("${VovoFitApp.BASE_URL}/userstate")
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
            .url("${VovoFitApp.BASE_URL}/userstate/save")
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
     * da Home) e, desde a 1.0.39, também ao voltar à Home (onResume)
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
     *   teto 12 (8 até à 1.0.38).
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
    /**
     * Resolve a posição de resume p/ (pasta, vídeo).
     * Sempre o valor LOCAL: as posições do servidor chegam pelo
     * import do arranque (importOnStartup, neste objecto), que escreve
     * nestas mesmas chaves — consultar a rede aqui seria um bloqueio
     * no caminho do player (o getResume é síncrono). Ver
     * APK_PROGRESS_SYNC_DESIGN §5.1.
     */
    fun resolveResume(folderPath: String, videoName: String, localMs: Long): Long =
        localMs

    /**
     * Regista que a posição de resume mudou (chamado por
     * SessionManager.saveResume() — a cada 2 s a tocar + ao sair do
     * player). POST best-effort throttled a 10 s: {resume:{path:
     * segundos}, durations:{path: segundos}} — segundos (o local é
     * ms). Nunca envia t=0 (o worker ignora-o e não apaga a posição
     * guardada). [force] = POST imediato (saída do player).
     */
    fun noteResumeSaved(
        context: Context,
        folderPath: String,
        videoName: String,
        positionMs: Long,
        force: Boolean = false
    ) {
        if (!SERVER_RESUME_ENABLED) return
        if (positionMs <= 0L) return
        val key = "$folderPath::$videoName"
        val now = System.currentTimeMillis()
        if (!force) {
            val lastAt = lastResumePostAt[key] ?: 0L
            if (now - lastAt < RESUME_POST_THROTTLE_MS) return
        }
        lastResumePostAt[key] = now
        val appContext = context.applicationContext
        ioScope.launch {
            val sm = SessionManager.get(appContext)
            val path = lessonPath(folderPath, videoName)
            val patch = JSONObject()
            val resume = JSONObject()
            resume.put(path, positionMs / 1000)
            patch.put("resume", resume)
            val durMs = sm.getResumeDuration(folderPath, videoName)
            if (durMs > 0L) {
                val durations = JSONObject()
                durations.put(path, durMs / 1000)
                patch.put("durations", durations)
            }
            postUserStatePatch(appContext, patch.toString())
        }
    }

    /**
     * POST final da posição ao sair do player (ignora o throttle):
     * a última posição não pode ficar 10 s à espera. Chamado pelo
     * PlayerActivity.releasePlayer() depois do último saveResumeFor.
     */
    fun flushResume(context: Context, folderPath: String, videoName: String, positionMs: Long) {
        noteResumeSaved(context, folderPath, videoName, positionMs, force = true)
    }

    /**
     * Regista que a aula conta como assistida (chamado por
     * SessionManager.markWatched()). POST {watched:{path:true}}.
     * Chamadores: PlayerActivity.markEnded (fim da aula) e o loop
     * de gravação do player aos >50% da duração
     * (1.0.39 — decisão §11.1, paridade com o desktop). Idempotente
     * do lado do servidor (união; watched_at = max).
     */
    fun noteWatched(context: Context, folderPath: String, videoName: String) {
        if (!SERVER_RESUME_ENABLED) return
        val appContext = context.applicationContext
        ioScope.launch {
            val path = lessonPath(folderPath, videoName)
            val patch = JSONObject()
            val watched = JSONObject()
            watched.put(path, true)
            patch.put("watched", watched)
            postUserStatePatch(appContext, patch.toString())
        }
    }

    /**
     * Evento de histórico do fim da sessão (chamado pelo
     * PlayerActivity ao sair do player / ao fim do vídeo, UMA vez por
     * sessão): {history:[{path, name, at, minutes}]} — `at` é o
     * início da sessão (ms, estável p/ a dedup do servidor) e
     * `minutes` são os minutos REAIS assistidos nesta sessão
     * (segundos de reprodução / 60). É isto que alimenta as horas da
     * semana e a sequência do painel (e as estatísticas do site):
     * sem minutes, o worker regista 0 e o painel fica sempre a 0.
     * Vai no FIM (não no início): INSERT OR IGNORE por (username,
     * lesson_path, event_at) — um evento enviado no início com
     * minutes=0 nunca mais aceitaria os minutos.
     */
    fun noteHistorySession(
        context: Context,
        folderPath: String,
        videoName: String,
        sessionStartMs: Long,
        minutesWatched: Int
    ) {
        if (!SERVER_RESUME_ENABLED) return
        if (sessionStartMs <= 0L) return
        val appContext = context.applicationContext
        ioScope.launch {
            val path = lessonPath(folderPath, videoName)
            val patch = JSONObject()
            val events = JSONArray()
            val event = JSONObject()
            event.put("path", path)
            event.put("name", videoName)
            event.put("at", sessionStartMs)
            event.put("minutes", minutesWatched.coerceAtLeast(0))
            events.put(event)
            patch.put("history", events)
            postUserStatePatch(appContext, patch.toString())
        }
    }
}
