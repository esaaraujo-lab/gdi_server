package com.vovofit.app.ui.assistente

import android.os.Bundle
import android.view.View
import android.widget.EditText
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.vovofit.app.R
import com.vovofit.app.util.AuthHelper
import com.vovofit.app.util.SiteHttp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

/**
 * 1.0.40 — ASSISTENTE FITNESS da Vovó (SÓ NO CELULAR — na TV não há
 * chat, regra do Elton 2026-11-25 19:38). Molde da MeggyChatActivity
 * da Meggy 2.7.58, adaptado:
 *
 * - A assistente vive no SERVIDOR: `POST /api/ai` no host principal
 *   com o cookie da sessão principal (SiteHttp), com o campo
 *   `persona: "fitness-vovo"` — a persona especializada +60 (treino
 *   +60, força/equilíbrio/mobilidade, tireoide, suplementos por
 *   idade; só informação geral, nunca consulta médica) está no
 *   servidor (FITNESS_MEGGY_DESIGN); o cliente só envia o campo.
 * - Avatar e nome visível = a identidade da Vovó Fit (a imagem do
 *   launcher, o asset de identidade que já existe na árvore — não
 *   há um asset de cara isolado; ver relatório da ronda).
 * - Erros: 401 → login; 429 → mensagem do servidor; outro erro →
 *   bolha de erro clicável (tentar de novo) SEM perder o texto
 *   digitado — o campo só limpa depois de a mensagem entrar no
 *   histórico.
 */
class AssistenteChatActivity : AppCompatActivity() {

    private lateinit var list: RecyclerView
    private lateinit var input: EditText
    private lateinit var adapter: ChatAdapter

    private var sending = false
    private var lastFailedText: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_assistente_chat)

        findViewById<View>(R.id.assistenteBack)?.setOnClickListener { finish() }

        list = findViewById(R.id.assistenteList)
        input = findViewById(R.id.assistenteInput)
        adapter = ChatAdapter { retryLast() }
        list.layoutManager = LinearLayoutManager(this).apply { stackFromEnd = true }
        list.adapter = adapter

        findViewById<View>(R.id.assistenteSend).setOnClickListener { sendCurrent() }

        // Saudação da assistente (âmbito fitness +60, sem prometer
        // acompanhamento médico — o limite vive na persona do
        // servidor e é repetido aqui na abertura).
        adapter.add(ChatAdapter.Msg("assistant", getString(R.string.assistente_greeting)))
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
        // (a mensagem da aluna já está no histórico — não duplica).
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
            ChatAdapter.Msg("assistant", getString(R.string.assistente_typing))
        )
        scrollToEnd()
        val payload = buildPayload(text)
        lifecycleScope.launch {
            val res = try {
                withContext(Dispatchers.IO) {
                    SiteHttp.postJson(this@AssistenteChatActivity, "/api/ai", payload.toString())
                }
            } catch (_: Exception) {
                null
            }
            adapter.removeAt(typingIndexAdjusted(typingIndex))
            sending = false
            when {
                res == null -> failWith(text)
                res.isUnauthorized -> {
                    AuthHelper.bounceToLogin(this@AssistenteChatActivity)
                }
                res.code == 429 -> {
                    val msg = serverMessage(res.body)
                        ?: getString(R.string.assistente_busy)
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
        val typing = getString(R.string.assistente_typing)
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
                getString(R.string.assistente_error),
                isError = true
            )
        )
    }

    private fun buildPayload(currentText: String): JSONObject {
        val body = JSONObject()
        body.put("message", currentText)
        // A persona fitness da Vovó (especialização +60 no servidor).
        body.put("persona", "fitness-vovo")
        // Histórico: últimas 8 trocas REAIS (sem a saudação inicial
        // nem bolhas de erro), no formato {role, content}.
        val history = adapter.messages.filter {
            !it.isError && it.text != getString(R.string.assistente_greeting)
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
        // Contexto da vista actual (molde do widget da web).
        val ctx = JSONObject()
        ctx.put("view", "assistente")
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
}
