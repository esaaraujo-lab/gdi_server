package com.bibigyn.app.util

import android.content.Context

/**
 * Ponto de integração do "Continuar de onde parou" ENTRE APARELHOS
 * (diretriz de ecossistema do Elton 2026-11-14 20:06).
 *
 * ESTADO: DESLIGADO — [SERVER_RESUME_ENABLED] = false. O endpoint de
 * progresso/resume no servidor está no escopo da v2.15.6 do worker e
 * AINDA NÃO EXISTE: o caminho, o formato do corpo e o auth NÃO foram
 * definidos pelo backend, e NADA aqui foi inventado — [SERVER_RESUME_PATH]
 * é null de propósito. Quando o backend definir o endpoint, a ligação é:
 *   1. preencher [SERVER_RESUME_PATH] com o caminho REAL do worker;
 *   2. pôr [SERVER_RESUME_ENABLED] = true;
 *   3. chamar [fetchServerResume] no lugar de (ou antes de)
 *      [SessionManager.getResume] no player / "Continuar assistindo",
 *      e [pushResume] ao salvar a posição.
 * Até lá, o resume continua 100% LOCAL ([SessionManager] —
 * SharedPreferences, chaves `resume_<pasta>::<video>`), SEM MUDANÇA
 * de comportamento: nenhum call site chama este objeto hoje.
 *
 * AUDITORIA DE ECOSSISTEMA (BiBi 2.1.9 — ver
 * apk-redesign/ECOSYSTEM_AUDIT_BIBI_2.1.9.md):
 *   - JÁ VEM DO BACKEND / BD COMPARTILHADO: descrições e resumos
 *     (batalhão Meggy, /api/ai/battalion + /api/ai/summaries +
 *     /api/materials/... via AiService; BASE_URL educa.eu.org, mesma
 *     sessão por aparelho, dados por usuário); capas camada 1
 *     (coverUrl do admin, /api/featured-courses e /api/courses/unified);
 *     cursos/aulas (Drive + D1 via /api/...); legendas (/api/ai/subtitles).
 *   - CACHE LOCAL COM FONTE NO BACKEND: capas camada 3 (manifesto
 *     jsDelivr, cache 24h em CoverLibrary); "Continuar assistindo"
 *     (recents) e posições de resume (SessionManager) — a fonte da
 *     verdade AINDA é local até o endpoint existir (este objeto).
 *   - PENDENTE (sem equivalente local inventado): planos de estudo
 *     (o app NÃO tem tela nem chamada — o backend ganha
 *     POST /api/plans/generate na v2.15.6-plan, ainda não deployado);
 *     questões e flashcards (abas existem mas mostram estado vazio
 *     desenhado — o app não tem fonte de dados para elas; o batalhão
 *     gera o material, mas o carregamento no app ainda não existe);
 *     resume entre aparelhos (este objeto, desligado); Roku
 *     (outra plataforma, BrightScript — fora do escopo dos APKs Android).
 */
object ProgressSync {

    /** Resume no servidor — DESLIGADO até o endpoint v2.15.6 existir. */
    const val SERVER_RESUME_ENABLED = false

    /**
     * Caminho do endpoint de progresso/resume no worker — NULL DE
     * PROPÓSITO: o backend (v2.15.6) ainda não o definiu. NÃO
     * adivinhar um caminho (ex.: /api/progress): um POST num caminho
     * errado seria silêncio ou 404 e mascararia a pendência.
     */
    val SERVER_RESUME_PATH: String? = null

    /**
     * Posição salva no servidor (ms) para (pasta, vídeo), ou null
     * quando o resume no servidor está desligado / sem posição /
     * sem rede. Hoje devolve SEMPRE null ([SERVER_RESUME_ENABLED]
     * = false): o player segue usando [SessionManager.getResume].
     */
    suspend fun fetchServerResume(
        context: Context,
        folderPath: String,
        videoName: String
    ): Long? {
        if (!SERVER_RESUME_ENABLED) return null
        // Ligado só quando SERVER_RESUME_PATH for o caminho real.
        return null
    }

    /**
     * Envia a posição atual ao servidor. Hoje é NO-OP (desligado):
     * devolve false e NÃO faz rede. O [SessionManager.saveResume]
     * continua sendo o único a persistir a posição.
     */
    suspend fun pushResume(
        context: Context,
        folderPath: String,
        videoName: String,
        positionMs: Long,
        durationMs: Long
    ): Boolean {
        if (!SERVER_RESUME_ENABLED) return false
        // Ligado só quando SERVER_RESUME_PATH for o caminho real.
        return false
    }
}
