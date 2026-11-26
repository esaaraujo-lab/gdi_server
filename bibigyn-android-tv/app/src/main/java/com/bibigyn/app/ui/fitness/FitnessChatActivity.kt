package com.bibigyn.app.ui.fitness

import android.os.Bundle
import android.view.View
import android.widget.EditText
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.bibigyn.app.R
import com.bibigyn.app.util.AuthHelper
import com.bibigyn.app.util.SiteHttp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

/**
 * v2.1.44 — ASSISTENTE FITNESS (só no celular; desenho
 * FITNESS_MEGGY_DESIGN): chat com a assistente da BiBi NA NUVEM —
 * `POST /api/ai` no host principal com o cookie da sessão principal
 * (SiteHttp) e o campo `persona: "fitness-bibi"`, que o worker usa
 * para aplicar as skills de saúde/fitness (treino, alimentação,
 * emagrecimento, hipertrofia, suplementos — informação geral, nunca
 * consulta médica). Nada de modelo local; nenhuma rota nova — o
 * cliente só envia o campo persona (a variante do worker é uma ronda
 * à parte).
 *
 * Avatar e nome visível = a identidade da BiBi (o ícone da app; a
 * árvore não tem um asset de cara fotográfico da BiBi — ver o
 * relatório da ronda). NUNCA na TV: sem variante layout-television
 * e sem entrada no menu da TV.
 *
 * Erros: 401 → login; 429 → mensagem do servidor; outro erro → bolha
 * de erro clicável (Tentar de novo) SEM perder o texto digitado — o
 * campo só limpa depois de a mensagem entrar no histórico. Molde:
 * MeggyChatActivity da Meggy 2.7.58.
 */
class FitnessChatActivity : AppCompatActivity() {

    private lateinit var list: RecyclerView
    private lateinit var input: EditText
    private lateinit var adapter: ChatAdapter

    private var sending = false
    private var lastFailedText: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_fitness_chat)

        findViewById<View>(R.id.fitnessChatBack)?.setOnClickListener { finish() }

        list = findViewById(R.id.fitnessChatList)
        input = findViewById(R.id.fitnessChatInput)
        adapter = ChatAdapter { retryLast() }
        list.layoutManager = LinearLayoutManager(this).apply { stackFromEnd = true }
        list.adapter = adapter

        findViewById<View>(R.id.fitnessChatSend).setOnClickListener { sendCurrent() }

        // Saudação da assistente (identidade BiBi).
        adapter.add(ChatAdapter.Msg("assistant", getString(R.string.fitness_chat_greeting)))
    }

    private fun sendCurrent() {
        if (sending) return
        val text = input.text?.toString()?.trim().orEmpty()
        if (text.isEmpty()) return
        // Só limpa o campo DEPOIS de a mensagem entrar no histórico.
        adapter.add(ChatAdapter.Msg("user", text))
        input.text?.clear()
        scrollToEnd()
        send(text)
    }

    private fun retryLast() {
        val text = lastFailedText ?: return
        if (sending) return
        // Remove a bolha de erro e tenta outra vez com o mesmo texto
        // (a mensagem do usuário já está no histórico — não duplica).
        for (i in adapter.messages.indices.reversed()) {
            if (adapter.messages[i].isError) {
                adapter.removeAt(i)
                break
            }
        }
        send(text)
    }

    private fun send(text: String) {
        sending = true
        val typingIndex = adapter.add(
            ChatAdapter.Msg("assistant", getString(R.string.fitness_chat_typing))
        )
        scrollToEnd()
        val payload = buildPayload(text)
        lifecycleScope.launch {
            val res = withContext(Dispatchers.IO) {
                try {
                    SiteHttp.postJson(this@FitnessChatActivity, "/api/ai", payload.toString())
                } catch (_: Exception) {
                    null
                }
            }
            adapter.removeAt(typingIndexAdjusted(typingIndex))
            sending = false
            when {
                res == null -> failWith(text)
                res.isUnauthorized -> {
                    AuthHelper.bounceToLogin(this@FitnessChatActivity)
                }
                res.code == 429 -> {
                    val msg = serverMessage(res.body)
                        ?: getString(R.string.fitness_chat_busy)
                    adapter.add(ChatAdapter.Msg("assistant", msg))
                }
                res.isOk -> {
                    val reply = parseReply(res.body)
                    if (reply.isNullOrBlank()) {
                        failWith(text)
                    } else {
                        lastFailedText = null
                        adapter.add(ChatAdapter.Msg("assistant", reply))
                    }
                }
                else -> failWith(text)
            }
            scrollToEnd()
        }
    }

    /** O índice da bolha "a escrever…" pode ter mudado se o retry
     *  removeu bolhas; localiza pela identidade do texto + última. */
    private fun typingIndexAdjusted(fallback: Int): Int {
        val typing = getString(R.string.fitness_chat_typing)
        for (i in adapter.messages.indices.reversed()) {
            if (adapter.messages[i].text == typing && adapter.messages[i].role == "assistant") {
                return i
            }
        }
        return fallback
    }

    private fun failWith(text: String) {
        lastFailedText = text
        adapter.add(
            ChatAdapter.Msg(
                "assistant",
                getString(R.string.fitness_chat_error),
                isError = true
            )
        )
    }

    private fun buildPayload(currentText: String): JSONObject {
        val body = JSONObject()
        body.put("message", currentText)
        // A PERSONA fitness: é este campo que faz o worker responder
        // como assistente de saúde/fitness da BiBi (allowlist do
        // servidor; sem o campo, a rota comporta-se como a Meggy).
        body.put("persona", PERSONA)
        // Histórico: últimas 8 trocas REAIS (sem a saudação inicial
        // nem bolhas de erro), no formato {role, content}.
        val history = adapter.messages.filter {
            !it.isError && it.text != getString(R.string.fitness_chat_greeting)
        }
        val window = history.takeLast(9).dropLast(1) // exclui a msg actual (já em "message")
        val arr = JSONArray()
        for (m in window) {
            val o = JSONObject()
            o.put("role", m.role)
            o.put("content", m.text)
            arr.put(o)
        }
        body.put("messages", arr)
        // Contexto mínimo da vista (molde do widget da web).
        val ctx = JSONObject()
        ctx.put("view", "fitness-chat")
        ctx.put("app", "bibi")
        body.put("context", ctx)
        return body
    }

    private fun parseReply(body: String?): String? {
        if (body.isNullOrBlank()) return null
        return try {
            val o = JSONObject(body)
            o.optString("response")
                .ifBlank { o.optString("reply") }
                .ifBlank { o.optString("text") }
                .takeIf { it.isNotBlank() }
        } catch (_: Exception) {
            null
        }
    }

    private fun serverMessage(body: String?): String? {
        if (body.isNullOrBlank()) return null
        return try {
            val o = JSONObject(body)
            o.optString("message")
                .ifBlank { o.optString("error") }
                .takeIf { it.isNotBlank() }
        } catch (_: Exception) {
            null
        }
    }

    private fun scrollToEnd() {
        if (adapter.itemCount > 0) {
            list.scrollToPosition(adapter.itemCount - 1)
        }
    }

    companion object {
        /** Persona da assistente fitness da BiBi (allowlist do worker). */
        const val PERSONA = "fitness-bibi"
    }
}
