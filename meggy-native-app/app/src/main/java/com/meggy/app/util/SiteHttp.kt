package com.meggy.app.util

import android.content.Context
import com.meggy.app.MeggyApp
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/**
 * 2.7.58 — cliente HTTP único para as funções do SITE (banco de
 * questões, chat da Meggy, cursos do aluno): alvo `MeggyApp.BASE_URL`
 * (educa.eu.org) com o cookie de sessão PRINCIPAL
 * (`SessionManager.sessionCookie`).
 *
 * Cliente próprio com `followRedirects(true)` e timeout de 30 s: o
 * cliente partilhado `MeggyApp.okHttpClient` tem
 * `followRedirects(false)` (existe para capturar o 302 do login) e
 * NÃO serve para estas rotas — o mesmo motivo que levou o
 * `UserStateSync` a criar o seu cliente privado. O banco e o chat
 * NÃO vão pelo `AiService` (host staging-c e sessão de IA próprios —
 * errados para as funções do site).
 *
 * As funções são BLOQUEANTES: chamar sempre fora da thread principal
 * (Dispatchers.IO). O resultado distingue 401 (sessão expirada — o
 * chamador faz `AuthHelper.bounceToLogin`) de qualquer outro erro.
 */
object SiteHttp {

    data class Result(val code: Int, val body: String?) {
        val isUnauthorized: Boolean get() = code == 401
        val isOk: Boolean get() = code in 200..299
    }

    private val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .followRedirects(true)
            .build()
    }

    private fun requestBuilder(context: Context, path: String): Request.Builder {
        val builder = Request.Builder().url(MeggyApp.BASE_URL + path)
        val cookie = SessionManager.get(context).sessionCookie
        if (!cookie.isNullOrBlank()) {
            builder.header("Cookie", "session=$cookie")
        }
        builder.header("User-Agent", "MeggyNative/2.7")
        return builder
    }

    /** GET bloqueante. Lança em falha de rede — o chamador trata. */
    fun get(context: Context, path: String): Result {
        val request = requestBuilder(context, path).get().build()
        client.newCall(request).execute().use { response ->
            return Result(response.code, response.body?.string())
        }
    }

    /** POST JSON bloqueante. Lança em falha de rede — o chamador trata. */
    fun postJson(context: Context, path: String, jsonBody: String): Result {
        val body = jsonBody.toRequestBody("application/json; charset=utf-8".toMediaType())
        val request = requestBuilder(context, path).post(body).build()
        client.newCall(request).execute().use { response ->
            return Result(response.code, response.body?.string())
        }
    }
}
