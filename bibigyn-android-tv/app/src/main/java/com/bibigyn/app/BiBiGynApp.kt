package com.bibigyn.app

import android.app.Application
import com.bibigyn.app.util.SessionManager
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

class BiBiGynApp : Application() {
    
    companion object {
        const val BASE_URL = "https://educa.eu.org"

        /**
         * v2.1.12 — Base das rotas de IA da Meggy (batalhão, resumos,
         * materiais, legendas, OCR).
         *
         * DECISÃO DO ELTON 2026-11-14 22:42: a IA aponta para o STAGING
         * (staging-c.urso.workers.dev), NÃO para a produção. Motivo:
         * a produção (educa.eu.org, worker pré-v2) tem as rotas de IA
         * antigas — o status do batalhão NÃO traz o objeto `job` —
         * então o app nunca completava a geração por lá; o staging tem
         * o contrato v2 que o app espera (ver AiService). BASE_URL
         * (listagem, cursos, download, login) CONTINUA
         * https://educa.eu.org — só a IA mudou de host. Consequência:
         * o estado da IA (resumos, jobs, materials_meta) é o do SANDBOX
         * (D1 meggy-staging), não o da produção. /api/ai/subtitles NÃO
         * existe em nenhum worker — a legenda continua só via .vtt/.srt
         * que já exista na pasta.
         *
         * Autenticação (AiService): o cookie da sessão do educa NÃO
         * vale no staging (outro host). A 1ª chamada de IA manda o
         * cookie do educa, leva 401, e o AiService faz login no staging
         * com as credenciais guardadas (SessionManager) e repete a
         * chamada com o cookie do staging (aiSessionCookie). Nenhuma
         * ação do usuário é necessária.
         */
        const val AI_BASE_URL = "https://staging-c.urso.workers.dev"

        lateinit var okHttpClient: OkHttpClient
            private set
    }
    
    override fun onCreate() {
        super.onCreate()
        // Ronda 15 Frente B (B2): migração 1× das posições legadas
        // pos_<url> para resume_<pasta>::<vídeo> (ver SessionManager).
        // AI_BASE_URL é a base dos caminhos por ID (== ApiService.
        // SANDBOX_BASE_URL); BASE_URL, a dos drives fixos.
        SessionManager.get(this).migrateLegacyUrlResumes(BASE_URL, AI_BASE_URL)
        okHttpClient = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .followRedirects(false)  // Capture 302 for login cookie
            .build()
    }
}
