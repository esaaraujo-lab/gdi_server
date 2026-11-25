package com.bibigyn.app.util

import android.content.Context
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

/**
 * 2.1.43 — COSTURA DO ECOSSISTEMA: resume/progresso entre aparelhos.
 *
 * ATIVO. O "Continuar de onde parou" lê as SharedPreferences locais,
 * mas elas já não são só locais: o arranque importa o estado do
 * servidor (GET /userstate — ver UserStateSync) e a reprodução grava
 * de volta (POST /userstate/save). Mesmas rotas que o desktop usa
 * (worker .93, tabelas user_watched + user_history_events, D1
 * primeiro + journal no Drive em falha — ver APK_PROGRESS_SYNC_DESIGN
 * §2). Nenhuma rota nova no servidor.
 *
 * COMO FUNCIONA (porte da Meggy 2.7.48/2.7.53 — SPEC
 * PROGRESSO_ADMIN_94, Parte 3; os pontos de chamada foram ligados
 * nesta versão — o stub anterior nunca era chamado):
 *   - SessionManager.saveResume() -> [noteResumeSaved]: POST throttled
 *     a 10 s (posição em segundos + duração) + POST final ao sair do
 *     player ([flushResume]);
 *   - SessionManager.markWatched() -> [noteWatched]: POST
 *     {watched:{path:true}} — no fim da aula e, desde a 2.1.43, aos
 *     >50% da duração (decisão §11.1 tomada na SPEC
 *     PROGRESSO_ADMIN_94: paridade com o desktop);
 *   - PlayerActivity (fim da sessão) -> [noteHistorySession]: POST do
 *     evento de histórico {path, name, at, minutes} com os MINUTOS
 *     REAIS assistidos — é isto que alimenta as horas da semana e a
 *     sequência do painel de progresso (e as estatísticas do site).
 *     O evento vai no FIM da sessão (não no início): o worker faz
 *     INSERT OR IGNORE por (username, lesson_path, event_at), por isso
 *     um evento enviado no início com minutes=0 nunca mais aceitaria
 *     os minutos — ver SPEC Meggy 2.7.48 §6.
 *   - SessionManager.getResume() -> [resolveResume]: continua LOCAL
 *     (as posições do servidor já lá estão via import do arranque).
 *
 * PATCHES, não GET+merge (o desktop faz GET+merge+POST do blob
 * inteiro; o APK poupa um GET por gravação porque o worker funde do
 * lado dele). Tudo fire-and-forget em Dispatchers.IO: falhou, fica
 * só local e tenta-se no próximo tick/arranque — nunca toast, nunca
 * bloqueio do player, nunca bounce p/ o login daqui.
 * Nunca enviar resume 0 (o worker ignora t=0). Chave SEMPRE por path
 * (nunca por link).
 *
 * O MESMO valeria para o resto do estado local (ver auditoria abaixo):
 * quando o backend tiver rota, cada um ganha a sua costura no mesmo
 * molde — nunca um equivalente local inventado.
 *
 * ── AUDITORIA DE ECOSSISTEMA (2.1.9, actualizada na 2.1.43) ──
 *
 *   BACKEND (fonte da verdade no servidor; app só lê/mostra):
 *   - Cursos/pastas/aulas: listFolder em educa.eu.org — D1/Drive do
 *     backend; descrições e resumos (batalhão Meggy, /api/ai/battalion
 *     + /api/ai/summaries + /api/materials/... via AiService); capas
 *     camada 1 (coverUrl do admin, /api/featured-courses e
 *     /api/courses/unified); legendas (/api/ai/subtitles).
 *   - Resume/progresso entre aparelhos: ATIVO na 2.1.43 (este
 *     objecto + UserStateSync) — GET /userstate + POST
 *     /userstate/save, as mesmas rotas do desktop e da Meggy
 *     (worker .93, tabelas user_watched + user_history_events, D1
 *     primeiro + journal no Drive em falha).
 *
 *   CACHE LOCAL COM FONTE NO BACKEND:
 *   - Capas camada 3 (manifesto jsDelivr, cache 24h em CoverLibrary);
 *     "Continuar assistindo" (recents) e posições de resume
 *     (SessionManager) — desde a 2.1.43 a fonte entre aparelhos é o
 *     servidor (import do /userstate); o local é a cache de leitura.
 *
 *   PENDENTE (não existe no backend OU o app não consome — registrado,
 *   NÃO inventado):
 *   - Planos de estudo: o app NÃO tem tela nem chamada (o backend tem
 *     POST /api/plans/generate p/ a web).
 *   - Questões e flashcards: as abas existem mas mostram estado vazio
 *     desenhado — o app não tem fonte de dados para elas; o batalhão
 *     gera o material, mas o carregamento no app ainda não existe.
 *   - Favoritos: continuam só locais — sem rota no backend; quando
 *     existir, costurar no mesmo molde.
 *   - Roku: OUTRA PLATAFORMA (BrightScript) — fora do escopo desta
 *     ronda de APKs Android.
 */
object ProgressSync {

    /**
     * Flag-mestra do resume no servidor. true = LIGADO (2.1.43): as
     * rotas existem no worker .93 (GET /userstate + POST
     * /userstate/save) e os POSTs abaixo correm. false = DESLIGADO:
     * nada sai do aparelho (o local continua a funcionar sozinho).
     */
    val SERVER_RESUME_ENABLED = true

    /** GET do estado (import do arranque — ver UserStateSync). */
    const val USERSTATE_GET_PATH = "/userstate"

    /** POST dos patches (posição, assistido, histórico). */
    const val USERSTATE_SAVE_PATH = "/userstate/save"

    /** Throttle da posição: 1 POST por 10 s a tocar (como o desktop). */
    private const val RESUME_POST_THROTTLE_MS = 10_000L

    private val lastResumePostAt = HashMap<String, Long>()

    /**
     * Resolve a posição de resume p/ (pasta, vídeo).
     * Sempre o valor LOCAL: as posições do servidor chegam pelo
     * import do arranque (UserStateSync.importOnStartup), que escreve
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
        UserStateSync.ioScope.launch {
            val sm = SessionManager.get(appContext)
            val path = UserStateSync.lessonPath(folderPath, videoName)
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
            UserStateSync.postUserStatePatch(appContext, patch.toString())
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
     * Chamadores: PlayerActivity.markEnded (fim da aula, desde a
     * 2.1.43) e o loop de gravação do player aos >50% da duração
     * (2.1.43 — decisão §11.1, paridade com o desktop). Idempotente
     * do lado do servidor (união; watched_at = max).
     */
    fun noteWatched(context: Context, folderPath: String, videoName: String) {
        if (!SERVER_RESUME_ENABLED) return
        val appContext = context.applicationContext
        UserStateSync.ioScope.launch {
            val path = UserStateSync.lessonPath(folderPath, videoName)
            val patch = JSONObject()
            val watched = JSONObject()
            watched.put(path, true)
            patch.put("watched", watched)
            UserStateSync.postUserStatePatch(appContext, patch.toString())
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
        UserStateSync.ioScope.launch {
            val path = UserStateSync.lessonPath(folderPath, videoName)
            val patch = JSONObject()
            val events = JSONArray()
            val event = JSONObject()
            event.put("path", path)
            event.put("name", videoName)
            event.put("at", sessionStartMs)
            event.put("minutes", minutesWatched.coerceAtLeast(0))
            events.put(event)
            patch.put("history", events)
            UserStateSync.postUserStatePatch(appContext, patch.toString())
        }
    }
}
