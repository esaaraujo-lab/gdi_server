package com.vovofit.app

import android.app.Application
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

class VovoFitApp : Application() {
    
    companion object {
        const val BASE_URL = "https://educa.eu.org"

        /**
         * v1.0.4 — Base das rotas de IA da Meggy (batalhão, resumos,
         * materiais, legendas, OCR).
         *
         * Por padrão é o MESMO host do app (BASE_URL). VERIFICADO
         * 2026-11-14: a produção (educa.eu.org, worker pré-v2) NÃO tem
         * nenhuma dessas rotas (nenhum registro de
         * /api/ai/battalion, /api/ai/summaries, /api/materials/... no
         * worker de produção auditado) — contra ela, as chamadas de IA
         * devolvem 404 e o app trata como "geração indisponível"
         * (nunca finge que gerou). As rotas existem no worker v2.15.4
         * deployado em staging-c e no meuc:
         *   staging-c: https://meggy-staging.aprovado.workers.dev
         *   meuc:      https://meuc.urso.workers.dev
         * Para testar a geração ao vivo, trocar esta constante para um
         * desses hosts (1 linha). A geração ao vivo na produção depende
         * do deploy da v2 nela — ordem do Elton pendente. Ver
         * REDESIGN_NOTES.md ("Descrição da aula").
         */
        const val AI_BASE_URL = BASE_URL

        lateinit var okHttpClient: OkHttpClient
            private set
    }
    
    override fun onCreate() {
        super.onCreate()
        okHttpClient = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .followRedirects(false)  // Capture 302 for login cookie
            .build()
    }
}
