package com.meggy.app.util

import android.content.Context
import com.meggy.app.data.ApiService
import com.meggy.app.data.FileItem
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * v2.7.6 — Pré-geração das descrições das PRÓXIMAS aulas (Elton 00:21).
 *
 * Enquanto o vídeo roda, o app gera e salva as descrições das próximas
 * aulas da playlist, para a próxima aula já abrir com a descrição
 * pronta. Regras exatas (ordem do Elton):
 *
 *   QUANTAS: no máximo [MAX_AHEAD] = 3 próximas aulas, na ORDEM da
 *     playlist (depois da atual). Uma pasta de aula por vez.
 *   ORDEM: a ordem da playlist (a mesma do player — nunca reordenada).
 *   LIMITES:
 *     - uma por vez, SEQUENCIAL (nunca em paralelo — o batalhão já é
 *       pesado no servidor; 3 chamadas por PDF);
 *     - só com conexão (sem rede, a fila para — sem retry em loop);
 *     - PAUSA quando o vídeo pausa (espera até 5 min e retoma; se o
 *       vídeo continuar pausado, a fila para — nada de girar em
 *       segundo plano);
 *     - PARA quando o app vai para segundo plano ou o player é
 *       destruído (o Job é cancelado; nada sobrevive ao player);
 *     - NÃO dispara em loop se a geração falhar: registra o motivo
 *       (em memória, por pasta) e SEGUE para a próxima aula — a
 *       tentativa volta na próxima abertura da aula (DetailActivity),
 *       nunca em loop aqui;
 *     - backend sem as rotas de IA (produção pré-v2) → para a fila
 *       inteira na primeira resposta (AiService.backendUnavailable).
 *   NUNCA trava o vídeo nem come a banda do streaming: tudo em
 *   Dispatchers.IO, textos limitados a 15.000 chars, PDF com no
 *   máximo 20 páginas; a fila só ANDA quando o vídeo está tocando.
 *
 * Onde fica salvo: cache local (SessionManager, instantâneo na
 * próxima abertura) + pasta de materiais no servidor (POST
 * /api/materials/save-in-folder, `.gdi-resumos/` — best-effort) +
 * cache ISA do batalhão (o próprio worker).
 *
 * A fila NÃO espera a geração terminar: o gatilho dispara o batalhão
 * e a fila segue; o texto fica pronto em segundo plano (minutos) e a
 * próxima abertura da aula o lê do cache/servidor.
 */
class DescriptionPregenerator(private val context: Context) {

    companion object {
        /** Próximas aulas da playlist a pré-gerar (Elton: 2–3). */
        const val MAX_AHEAD = 3

        /** Espera máxima com o vídeo pausado antes de desistir. */
        private const val MAX_PAUSED_WAIT_MS = 5L * 60L * 1000L

        /** Intervalo de re-checagem enquanto pausado. */
        private const val PAUSED_CHECK_MS = 15_000L
    }

    private var job: Job? = null

    /** Motivos das falhas desta sessão (pasta → motivo), só para diagnóstico. */
    private val skippedReasons = mutableMapOf<String, String>()

    fun skippedReason(folderPath: String): String? = skippedReasons[folderPath]

    /**
     * Inicia a fila para os próximos itens da playlist.
     * `isPlaying` = o vídeo está tocando agora; `isActive` = o player
     * está em primeiro plano (não ir para segundo plano).
     * Chamado uma vez por abertura do player; [stop] cancela.
     */
    fun start(
        scope: CoroutineScope,
        playlist: List<FileItem>,
        currentIndex: Int,
        isPlaying: () -> Boolean,
        isActive: () -> Boolean
    ) {
        stop()
        val upcoming = playlist
            .drop(currentIndex + 1)
            .take(MAX_AHEAD)
            .mapNotNull { it.folderPath?.takeIf { p -> p.isNotBlank() } }
            .distinct()
        if (upcoming.isEmpty()) return
        job = scope.launch {
            val api = ApiService(context)
            val sm = SessionManager.get(context)
            for (folderPath in upcoming) {
                if (!isActive()) return@launch
                if (!waitWhilePaused(isPlaying, isActive)) return@launch
                // Já tem descrição guardada → nada a gerar.
                if (sm.getLessonDescription(folderPath) != null) continue
                val files = try {
                    api.listFolder(folderPath)
                } catch (_: Exception) {
                    null
                }
                if (files.isNullOrEmpty()) {
                    skippedReasons[folderPath] = "listFolder vazio/falhou"
                    continue
                }
                if (!isActive()) return@launch
                if (!waitWhilePaused(isPlaying, isActive)) return@launch
                val folderName = folderPath.trimEnd('/').substringAfterLast('/')
                when (
                    val outcome = LessonDescription.triggerOnly(
                        context, folderPath, folderName, files
                    )
                ) {
                    is LessonDescription.Outcome.Ready -> {
                        sm.saveLessonDescription(folderPath, outcome.text)
                        val fileName = LessonDescription.folderFileName(context, folderName)
                        val lessonFile = LessonDescription.lessonFilePath(folderPath, files)
                        if (lessonFile != null) {
                            // Best-effort: grava na pasta de materiais.
                            runCatching {
                                com.meggy.app.data.AiService.saveToFolder(
                                    context, lessonFile, fileName, outcome.text
                                )
                            }
                        }
                    }
                    is LessonDescription.Outcome.Unavailable -> {
                        // Backend sem IA: não adianta tentar as próximas.
                        skippedReasons[folderPath] = "backend sem rotas de IA"
                        return@launch
                    }
                    is LessonDescription.Outcome.NoMaterial -> {
                        skippedReasons[folderPath] = "sem material legível (${outcome.reason})"
                    }
                    is LessonDescription.Outcome.Failed -> {
                        skippedReasons[folderPath] = "falha de rede/servidor"
                    }
                    is LessonDescription.Outcome.Generating -> {
                        // Disparado; o texto fica pronto em 2º plano.
                    }
                }
            }
        }
    }

    /**
     * Espera o vídeo voltar a tocar (pausa da fila). Devolve false se
     * o app saiu de primeiro plano ou se passou o tempo máximo.
     */
    private suspend fun waitWhilePaused(
        isPlaying: () -> Boolean,
        isActive: () -> Boolean
    ): Boolean {
        var waited = 0L
        while (!isPlaying()) {
            if (!isActive()) return false
            if (waited >= MAX_PAUSED_WAIT_MS) return false
            delay(PAUSED_CHECK_MS)
            waited += PAUSED_CHECK_MS
        }
        return isActive()
    }

    fun stop() {
        job?.cancel()
        job = null
    }
}
