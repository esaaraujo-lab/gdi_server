package com.vovofit.app.util

/**
 * v1.0.8 — Ponto de integração do resume ENTRE APARELHOS (ecossistema).
 *
 * "Continuar de onde parou" hoje é LOCAL: [SessionManager] guarda a
 * posição por (pasta, vídeo) + a posição por URL em SharedPreferences,
 * só neste aparelho. O endpoint de progresso/resume NO SERVIDOR está no
 * escopo da v2.15.6 do backend — quando existir, o app passa a usá-lo
 * (ler a posição do servidor na abertura e gravar nela a cada save).
 *
 * Este objeto é a COSTURA, não a ligação: [SERVER_RESUME_ENABLED] é
 * false e [SERVER_RESUME_PATH] é null DE PROPÓSITO. Nenhum código o
 * chama enquanto a flag estiver desligada (ver os futuros pontos de
 * chamada abaixo) e o resume local continua EXATAMENTE como hoje —
 * nada muda de comportamento nesta versão.
 *
 * ── AUDITORIA DE ECOSSISTEMA (ordem do Elton 2026-11-14 20:06) ──
 *
 * Regra: o que é entre aparelhos vem do backend/Meggy e do BD
 * compartilhado (BASE_URL educa.eu.org; D1/KV do worker); o app NÃO
 * inventa equivalente local. Cache local (SharedPreferences) é só
 * cache — a fonte da verdade é o backend.
 *
 *   Descrições/resumos ....... BACKEND — AiService (POST /api/ai/battalion,
 *     GET /api/ai/summaries, /api/materials/load|save-in-folder; cache
 *     ISA em KV + .gdi-resumos/ no Drive; LessonDescription lê o gerado
 *     e dispara o batalhão; SessionManager guarda só cópia local).
 *     BLOQUEADO NA PRODUÇÃO: o worker pré-v2 não tem essas rotas
 *     (404 com sessão válida -> AiService.backendUnavailable); depende
 *     do deploy da v2 na produção (ordem pendente; avaliação STOP
 *     2026-11-14 ~20:40 UTC).
 *   Questões ................. PENDENTE — o batalhão GERA questões
 *     (AiService.BattalionStatus.hasQuestions), mas o app NÃO as lê:
 *     as abas Questões/Flashcards do detalhe mostram só o placeholder
 *     (@string/no_questions, @string/no_flashcards). Falta o endpoint
 *     de leitura no backend + a ligação na UI. Nada inventado no local.
 *   Flashcards ............... PENDENTE — idem questões.
 *   Planos de estudo ......... PENDENTE — o app NÃO tem tela nem
 *     chamada de plano (nenhum /api/plans/... no código). O backend
 *     v2.15.6-plan tem POST /api/plans/generate (Meggy + edital +
 *     histórico da banca, D1 study_plans), implementado localmente e
 *     NÃO deployado. Quando deployar, o app ganha a tela/chamada.
 *   Capas .................... BACKEND + BIBLIOTECA (hierarquia 1-4):
 *     (1) coverUrl do admin (GET /api/featured-courses, v2.15.6;
 *     confirmado ao vivo 2026-11-14 23:06 UTC nas duas APIs);
 *     (2) thumb do Drive; (3) biblioteca por tipo (CoverLibrary,
 *     manifesto jsDelivr + fallback raw); (4) capa local cover_*.
 *   Legendas ................. BACKEND — SubtitleFetcher (GET
 *     /api/ai/subtitles, Whisper; bloqueado na produção pré-v2
 *     como as demais rotas de IA).
 *   OCR ...................... PENDENTE — POST /api/ai/ocr existe no
 *     worker v2.15.4, mas o encadeamento OCR -> batalhão não está
 *     ligado no app (ver LessonDescription).
 *   Continuar de onde parou .. LOCAL HOJE (SessionManager) — é o
 *     escopo deste objeto (abaixo): quando o endpoint v2.15.6
 *     existir, o app passa a ler/gravar nele (fonte entre aparelhos).
 *   Roku ..................... PENDENTE / FORA DE ESCOPO — outra
 *     plataforma (outro app, BrightScript); não tocado nesta rodada
 *     de APKs Android.
 */
object ResumeSync {

    /**
     * Flag-mestra do resume no servidor: false = o app usa SOMENTE o
     * resume local ([SessionManager] — SharedPreferences, por aparelho).
     * Ligar SÓ quando o endpoint existir no backend e o contrato
     * estiver verificado ao vivo — ver [SERVER_RESUME_PATH].
     */
    const val SERVER_RESUME_ENABLED = false

    /**
     * Path reservado do endpoint de progresso/resume no servidor.
     * null DE PROPÓSITO: o path real ainda não existe — o endpoint
     * está no escopo da v2.15.6 do backend e o seu contrato (método,
     * path, corpo, resposta) ainda não foi publicado. NÃO inventar um
     * path aqui: quando a v2.15.6 publicar o endpoint, preencher com
     * o path real e ligar [SERVER_RESUME_ENABLED] (com verificação
     * ao vivo). Até lá, este objeto é só a costura: nenhum código o
     * chama e nada muda no resume local.
     */
    const val SERVER_RESUME_PATH: String? = null

    /**
     * Lê a posição salva no servidor p/ (pasta, vídeo). Devolve null
     * enquanto [SERVER_RESUME_ENABLED] for false — o chamador usa o
     * resume local ([SessionManager.getResume]) como hoje.
     * Futuro ponto de chamada: PlayerActivity.resumeFor().
     */
    fun getServerResume(folderPath: String, videoName: String): Long? = null

    /**
     * Salva a posição no servidor. Devolve false enquanto
     * [SERVER_RESUME_ENABLED] for false — o chamador continua a
     * salvar só no local ([SessionManager.saveResume]).
     * Futuro ponto de chamada: PlayerActivity.saveResumeFor().
     */
    fun saveServerResume(folderPath: String, videoName: String, positionMs: Long): Boolean = false
}
