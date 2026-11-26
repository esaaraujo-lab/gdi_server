package com.meggy.app.util

import android.content.Context
import org.json.JSONObject
import java.net.URLEncoder

/**
 * 2.7.58 — cliente do BANCO DE QUESTÕES do site (Simulados), no molde
 * do `bank_get` do desktop: allowlist fechada de 3 prefixos, cookie de
 * sessão principal, via [SiteHttp] (BASE_URL, redirects ligados).
 *
 * Rotas (worker .93 — existem, nenhuma rota nova):
 *  - `GET /api/ai/question-bank/lists` → {disciplines[], topics{}}
 *  - `GET /api/ai/question-topics?subject=` → {topics:[{topic, count}]}
 *  - `GET /api/ai/shared-flashcards?kind=question&...` → {items:[...]}
 *  - `GET /api/ai/shared-subjects` → {questionSubjects[]} (degradação)
 *
 * 401 = sessão expirada (o chamador faz bounceToLogin); qualquer
 * outro erro devolve null e o chamador mostra "Tentar de novo".
 */
object BankClient {

    private val ALLOWED_PREFIXES = listOf(
        "/api/ai/question-bank/",
        "/api/ai/question-topics",
        "/api/ai/shared-flashcards",
        "/api/ai/shared-subjects"
    )

    sealed class Reply {
        data class Ok(val json: JSONObject) : Reply()
        object Unauthorized : Reply()
        object Failed : Reply()
    }

    private fun enc(value: String): String =
        URLEncoder.encode(value, "UTF-8")

    /** GET com a allowlist aplicada. Bloqueante (Dispatchers.IO). */
    fun get(context: Context, path: String): Reply {
        if (ALLOWED_PREFIXES.none { path.startsWith(it) }) return Reply.Failed
        return try {
            val result = SiteHttp.get(context, path)
            when {
                result.isUnauthorized -> Reply.Unauthorized
                result.isOk && result.body != null -> Reply.Ok(JSONObject(result.body))
                else -> Reply.Failed
            }
        } catch (_: Exception) {
            Reply.Failed
        }
    }

    /** Matérias do banco; null = falhou (401 vem como [Reply.Unauthorized]). */
    fun fetchLists(context: Context): Reply =
        get(context, "/api/ai/question-bank/lists")

    /** Assuntos de uma matéria, com contagens. */
    fun fetchTopics(context: Context, subject: String): Reply =
        get(context, "/api/ai/question-topics?subject=${enc(subject)}")

    /** Uma página do pool de questões (limit 1..500 no servidor). */
    fun fetchQuestionPage(
        context: Context,
        subject: String,
        topic: String?,
        limit: Int,
        offset: Int
    ): Reply {
        val sb = StringBuilder("/api/ai/shared-flashcards?kind=question")
        if (subject.isNotBlank()) sb.append("&subject=").append(enc(subject))
        if (!topic.isNullOrBlank()) sb.append("&topic=").append(enc(topic))
        sb.append("&limit=").append(limit).append("&offset=").append(offset)
        return get(context, sb.toString())
    }
}
