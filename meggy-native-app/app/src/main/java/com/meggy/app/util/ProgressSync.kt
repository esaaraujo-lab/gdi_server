package com.meggy.app.util

/**
 * v2.7.11 — COSTURA DO ECOSSISTEMA: resume/progresso entre aparelhos.
 *
 * PENDENTE — NÃO ATIVO. O "Continuar de onde parou" hoje é 100% LOCAL
 * (SessionManager, SharedPreferences por aparelho): a posição e a
 * duração de cada (pasta, vídeo) e o flag "assistido" nunca saem do
 * aparelho. Entre aparelhos, o aluno recomeça do zero.
 *
 * O endpoint de progresso/resume no servidor está no escopo da v2.15.6
 * do backend (worker v2) e AINDA NÃO EXISTE — nenhuma rota /api/progress
 * (ou equivalente) foi encontrada no worker auditado, por isso NADA
 * aqui chama a rede: inventar um endpoint local seria um silo novo, o
 * oposto da diretriz do Elton (20:06).
 *
 * COMO LIGAR (quando o endpoint existir):
 *   1. confirmar a rota real no worker (método, path, corpo, resposta)
 *      e preencher [RESUME_ENDPOINT_PATH] — hoje é null DE PROPÓSITO
 *      (o path não foi adivinhado; um literal seria um chute, não o
 *      contrato);
 *   2. implementar o GET/POST em [resolveResume]/[noteResumeSaved]
 *      com o cookie de sessão (mesmo padrão do AiService);
 *   3. pôr [SERVER_RESUME_ENABLED] = true.
 * Os pontos de chamada JÁ EXISTEM e são inertes enquanto a flag é
 * false: SessionManager.getResume() (leitura) e
 * SessionManager.saveResume() (escrita) chamam [resolveResume] e
 * [noteResumeSaved] — que hoje devolvem o valor local / não fazem
 * nada. Nenhum outro arquivo precisa mudar para ligar.
 *
 * O MESMO valeria para o resto do estado local (ver auditoria abaixo):
 * quando o backend tiver rota, cada um ganha a sua costura no mesmo
 * molde — nunca um equivalente local inventado.
 *
 * ── AUDITORIA DE ECOSSISTEMA (2.7.11 — item por item; "fonte da
 * verdade" = quem manda no dado) ──
 *
 *   BACKEND (fonte da verdade no servidor; app só lê/mostra):
 *   - Cursos/pastas/aulas: POST /<driveIdx>:/ (listFolder) em
 *     educa.eu.org — D1/Drive do backend; o app não inventa conteúdo.
 *   - Capas (1): GET /api/featured-courses → cover_url do admin
 *     (D1 featured_courses.cover_url, v2.15.6; teste logado 23:06 UTC
 *     confirmou coverUrl nas respostas). Parse defensivo
 *     (FeaturedCourse/HeroItem.fromJson aceitam cover_url e coverUrl).
 *   - Capas (2): thumb do Drive (thumbnailLink do arquivo).
 *   - Capas (3): manifesto da biblioteca (LibraryCovers) — ver nota.
 *   - Descrições/resumos: AiService — GET /api/ai/summaries (cache ISA
 *     do batalhão) + GET /api/materials/load-from-folder (resumo da
 *     pasta .gdi-resumos) + POST /api/ai/battalion (geração pela Meggy).
 *     Fonte da verdade: backend. O cache local em SharedPreferences
 *     (SessionManager.getLessonDescription) é SÓ cache: expira/é
 *     re-validado a partir do backend; sem backend (produção pré-v2),
 *     o app mostra o motivo em vez de inventar texto.
 *   - Questões do batalhão: o backend GERA (hasQuestions no status do
 *     batalhão), mas o app NÃO LÊ o conteúdo — ver PENDENTE abaixo.
 *
 *   CACHE LOCAL COM FONTE NO BACKEND (o dado local é cópia; o servidor
 *   manda — apagar o cache não perde nada):
 *   - Descrição/resumo da aula (SessionManager.getLessonDescription,
 *     teto de 200 entradas) — fonte: AiService/backend (acima).
 *   - Manifesto de capas (LibraryCovers: memória + SharedPreferences,
 *     TTL 24 h) — fonte: manifesto publicado no jsDelivr/raw.
 *   - Thumbs de recentes (updateRecentThumb) — fonte: thumbnailLink.
 *   - Vídeo em cache (VideoCache/ExoPlayer) — bytes; não é dado.
 *
 *   PENDENTE (não existe no backend OU o app não consome — registrado,
 *   NÃO inventado):
 *   - Resume entre aparelhos: endpoint v2.15.6 (este arquivo).
 *   - "Assistido" (watched), favoritos e recentes: só SharedPreferences
 *     locais; sem rota no backend — quando existir, costurar no mesmo
 *     molde deste arquivo.
 *   - Questões/flashcards no app: as abas Questões/Flashcards do
 *     detalhe mostram estados vazios POR DESENHO ("o app não tem fonte
 *     de dados para elas — nunca inventar perguntas"); o batalhão gera
 *     questões no backend, mas não há rota de LEITURA consumida pelo
 *     app (só o flag hasQuestions). Falta: endpoint de leitura +
 *     UI — escopo futuro, não desta rodada.
 *   - Planos de estudo: NÃO EXISTEM no app — nenhuma tela, nenhuma
 *     chamada a /api/plans ou /api/plans/generate (o POST novo da
 *     v2.15.6-plan é só web, /plano). Falta: tela + consumo da API —
 *     escopo futuro, não desta rodada.
 *   - Roku: OUTRA PLATAFORMA (outro app, BrightScript) — fora do
 *     escopo desta rodada de APKs Android; registrado aqui como item
 *     pendente de ecossistema, sem tocar no Roku.
 */
object ProgressSync {

    /**
     * Flag-mestra do resume no servidor. false = DESLIGADO: o resume
     * continua 100% local (SessionManager) e nenhum byte de progresso
     * sai do aparelho. Só pôr true DEPOIS que o endpoint existir de
     * verdade no worker v2.15.6 (e com o path confirmado).
     *
     * É `val` (não `const`) de propósito: com `const val false` o
     * compilador marcaria o corpo de [resolveResume]/[noteResumeSaved]
     * como inalcançável; como `val`, o ramo desligado continua sendo
     * código normal e a flag pode ser ligada sem tocar na lógica.
     */
    val SERVER_RESUME_ENABLED = false

    /**
     * Path do endpoint de progresso/resume (v2.15.6) — null DE PROPÓSITO.
     * A rota ainda não existe no backend e o path real não foi adivinhado:
     * um literal aqui seria um chute, não o contrato. Não chamar (nem
     * "só para testar") enquanto [SERVER_RESUME_ENABLED] for false: um
     * 404 com sessão válida é o sinal de "rota inexistente" (ver
     * AiService.backendUnavailable) e não deve virar loop. Quando existir,
     * preencher com o path real confirmado no worker. Contrato esperado:
     * GET com sessão devolve a posição salva do usuário p/
     * (folderPath, videoName); POST grava posição + duração + assistido.
     */
    val RESUME_ENDPOINT_PATH: String? = null

    /**
     * Resolve a posição de resume p/ (pasta, vídeo).
     * Hoje: devolve [localMs] SEMPRE (flag desligada — o servidor não
     * é consultado). Quando o endpoint existir e a flag ligar: se
     * [localMs] for 0 (sem resume neste aparelho), busca a posição no
     * servidor e devolve a dele quando válida; se houver resume local,
     * o local vence (é o aparelho que está a tocar). Chamado por
     * SessionManager.getResume() — nenhum outro chamador.
     */
    fun resolveResume(folderPath: String, videoName: String, localMs: Long): Long {
        if (!SERVER_RESUME_ENABLED) return localMs
        // Endpoint ainda não existe — sem implementação possível sem
        // inventar o contrato. Quando existir, implementar aqui o GET
        // autenticado em RESUME_ENDPOINT_PATH (ver KDoc da classe).
        return localMs
    }

    /**
     * Regista que a posição de resume mudou (chamado por
     * SessionManager.saveResume()). Hoje: não faz NADA (flag
     * desligada — a gravação local acima já aconteceu). Quando o
     * endpoint existir e a flag ligar: POST best-effort (sem bloquear
     * o player, sem toast em falha) da posição + duração.
     */
    fun noteResumeSaved(folderPath: String, videoName: String, positionMs: Long) {
        if (!SERVER_RESUME_ENABLED) return
        // Endpoint ainda não existe — ver KDoc da classe.
    }
}
