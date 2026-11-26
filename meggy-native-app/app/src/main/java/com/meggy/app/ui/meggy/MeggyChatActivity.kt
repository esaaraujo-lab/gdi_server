package com.meggy.app.ui.meggy

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.meggy.app.R
import com.meggy.app.data.FileItem
import com.meggy.app.util.AuthHelper
import com.meggy.app.util.MeggyMemory
import com.meggy.app.util.SessionManager
import com.meggy.app.util.SiteHttp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

/**
 * 2.7.58 — MEGGY (destino real; desenho de destinos §2): o chat da
 * Meggy do APK é a MESMA Meggy da web, NA NUVEM — `POST /api/ai` no
 * host principal com o cookie da sessão principal (SiteHttp). Nada
 * de modelo local. A memória local (MeggyMemory) viaja como prefixo
 * de contexto na 1.ª mensagem do aluno, no molde do widget da web.
 * A carinha é a foto real da Meggy (a mesma do educa).
 *
 * Erros: 401 → login; 429 → mensagem do servidor; outro erro → bolha
 * de erro clicável (Tentar de novo) SEM perder o texto digitado —
 * o campo só limpa depois de a mensagem entrar no histórico.
 * Streaming (`/api/ai/stream`) fica fora desta ronda (desenho §2.5).
 */
class MeggyChatActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_LESSON_PATH = "meggy_lesson_path"
        const val EXTRA_LESSON_NAME = "meggy_lesson_name"
        const val EXTRA_VIDEO_NAME = "meggy_video_name"

        fun intent(
            context: Context,
            lessonPath: String? = null,
            lessonName: String? = null,
            videoName: String? = null
        ): Intent {
            val i = Intent(context, MeggyChatActivity::class.java)
            if (!lessonPath.isNullOrBlank()) i.putExtra(EXTRA_LESSON_PATH, lessonPath)
            if (!lessonName.isNullOrBlank()) i.putExtra(EXTRA_LESSON_NAME, lessonName)
            if (!videoName.isNullOrBlank()) i.putExtra(EXTRA_VIDEO_NAME, videoName)
            return i
        }
    }

    private lateinit var list: RecyclerView
    private lateinit var input: EditText
    private lateinit var adapter: ChatAdapter

    private var lessonPath: String? = null
    private var lessonName: String? = null
    private var videoName: String? = null
    private var sending = false
    private var lastFailedText: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_meggy_chat)

        lessonPath = intent.getStringExtra(EXTRA_LESSON_PATH)
        lessonName = intent.getStringExtra(EXTRA_LESSON_NAME)
        videoName = intent.getStringExtra(EXTRA_VIDEO_NAME)

        findViewById<View>(R.id.meggyChatBack)?.setOnClickListener { finish() }
        com.meggy.app.ui.home.TvRailHost.attach(
            this,
            findViewById(R.id.tvSideMenu),
            findViewById(R.id.meggyChatContent),
            com.meggy.app.ui.home.SideMenuView.MenuItem.HOME,
            R.id.meggyChatList
        )

        list = findViewById(R.id.meggyChatList)
        input = findViewById(R.id.meggyChatInput)
        adapter = ChatAdapter { retryLast() }
        list.layoutManager = LinearLayoutManager(this).apply { stackFromEnd = true }
        list.adapter = adapter

        findViewById<View>(R.id.meggyChatSend).setOnClickListener { sendCurrent() }

        // Saudação (NUNCA promete plano de estudo — desenho §2.5).
        adapter.add(ChatAdapter.Msg("assistant", getString(R.string.meggy_chat_greeting)))
        val lp = lessonPath
        if (!lp.isNullOrBlank()) {
            MeggyMemory.noteLesson(this, lp, subjectOf(lp))
        }
    }

    private fun subjectOf(path: String): String =
        com.meggy.app.util.Format.extractCourseName(path)

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
        // (a mensagem do aluno já está no histórico — não duplica).
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
        MeggyMemory.noteInteraction(this)
        val typingIndex = adapter.add(
            ChatAdapter.Msg("assistant", getString(R.string.meggy_chat_typing))
        )
        scrollToEnd()
        val payload = buildPayload(text)
        lifecycleScope.launch {
            val res = withContext(Dispatchers.IO) {
                SiteHttp.postJson(this@MeggyChatActivity, "/api/ai", payload.toString())
            }
            adapter.removeAt(typingIndexAdjusted(typingIndex))
            sending = false
            when {
                res.isUnauthorized -> {
                    AuthHelper.bounceToLogin(this@MeggyChatActivity)
                }
                res.code == 429 -> {
                    val msg = serverMessage(res.body)
                        ?: getString(R.string.meggy_chat_busy)
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
        val typing = getString(R.string.meggy_chat_typing)
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
                getString(R.string.meggy_chat_error),
                isError = true
            )
        )
    }

    private fun buildPayload(currentText: String): JSONObject {
        val body = JSONObject()
        body.put("message", currentText)
        // Histórico: últimas 8 trocas REAIS (sem a saudação inicial
        // nem bolhas de erro), no formato {role, content}.
        val history = adapter.messages.filter {
            !it.isError && it.text != getString(R.string.meggy_chat_greeting)
        }
        val window = history.takeLast(9).dropLast(1) // exclui a msg actual (já em "message")
        val arr = JSONArray()
        val prefix = MeggyMemory.buildContextPrefix(this)
        var prefixUsed = false
        for (m in window) {
            var content = m.text
            if (!prefixUsed && prefix.isNotEmpty() && m.role == "user") {
                content = prefix + "\n\n" + content
                prefixUsed = true
            }
            val o = JSONObject()
            o.put("role", m.role)
            o.put("content", content)
            arr.put(o)
        }
        var message = currentText
        if (!prefixUsed && prefix.isNotEmpty()) {
            // Primeira mensagem do aluno nesta conversa: o prefixo
            // vai colado nela (molde do widget da web).
            message = prefix + "\n\n" + currentText
            body.put("message", message)
        }
        body.put("messages", arr)
        // Contexto da vista actual (molde do widget da web).
        val ctx = JSONObject()
        ctx.put("view", if (lessonPath != null) "lesson" else "chat")
        val lp = lessonPath
        if (!lp.isNullOrBlank()) {
            ctx.put("path", lp)
            ctx.put("title", lessonName ?: "")
            ctx.put("subject", subjectOf(lp))
            val vn = videoName
            if (!vn.isNullOrBlank()) {
                val sm = SessionManager.get(this)
                val probe = FileItem(
                    name = vn, mimeType = "video/mp4", id = "",
                    driveId = null, link = null, size = 0L,
                    modifiedTime = null, folderPath = lp
                )
                val progress = JSONObject()
                progress.put("watched", sm.isWatched(probe))
                progress.put("positionSec", sm.getResume(lp, vn) / 1000)
                progress.put("durationSec", sm.getResumeDuration(lp, vn) / 1000)
                ctx.put("progress", progress)
            }
            val lesson = JSONObject()
            lesson.put("lessonPath", lp)
            lesson.put("lessonName", lessonName ?: "")
            body.put("lesson", lesson)
        }
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
