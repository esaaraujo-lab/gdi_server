package com.meggy.app.util

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * 2.7.58 — memória local do chat da Meggy, no molde do widget da web
 * (meggy-widget.js `buildMemoryContext`): interacções, tópicos
 * recentes (≤ 50), últimas aulas (≤ 10) e pontos fracos derivados das
 * respostas LOCAIS do simulado (até existir a tabela de respostas no
 * servidor, ronda do worker .94 — desenho de destinos §1.5/§4).
 *
 * O texto "Contexto do aluno: …" cola-se na 1.ª mensagem enviada ao
 * `POST /api/ai`, como o widget faz. Store próprio em
 * SharedPreferences — nunca uma fonte definitiva: é o espelho local,
 * como o localStorage da web.
 */
object MeggyMemory {

    private const val PREFS_NAME = "meggy_chat_memory"
    private const val KEY_TOPICS = "topics_json"
    private const val KEY_LESSONS = "lessons_json"
    private const val KEY_INTERACTIONS = "interactions"
    private const val KEY_ANSWERS = "answers_json"
    private const val MAX_TOPICS = 50
    private const val MAX_LESSONS = 10

    private fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private fun readArray(prefs: SharedPreferences, key: String): JSONArray =
        try {
            JSONArray(prefs.getString(key, "[]"))
        } catch (_: Exception) {
            JSONArray()
        }

    private fun pushFront(prefs: SharedPreferences, key: String, value: String, max: Int) {
        if (value.isBlank()) return
        val arr = readArray(prefs, key)
        val out = JSONArray()
        out.put(value)
        for (i in 0 until arr.length()) {
            val v = arr.optString(i)
            if (v.isNotEmpty() && v != value && out.length() < max) out.put(v)
        }
        prefs.edit().putString(key, out.toString()).apply()
    }

    /** Regista uma interacção do chat (tópico = a mensagem do aluno). */
    fun noteInteraction(context: Context, userMessage: String) {
        val p = prefs(context)
        val n = p.getInt(KEY_INTERACTIONS, 0) + 1
        p.edit().putInt(KEY_INTERACTIONS, n).apply()
        pushFront(p, KEY_TOPICS, userMessage.trim().take(80), MAX_TOPICS)
    }

    /** Regista a aula em foco (quando o chat abre do detalhe/player). */
    fun noteLesson(context: Context, lessonName: String?) {
        if (lessonName.isNullOrBlank()) return
        pushFront(prefs(context), KEY_LESSONS, lessonName.trim(), MAX_LESSONS)
    }

    /**
     * Regista uma resposta do simulado (registo LOCAL por questão —
     * espelho transitório até à tabela do servidor; alimenta os
     * pontos fracos da memória, como o widget deriva do
     * `gdi-questions-v1`/`gdi-q-srs-v1` locais).
     */
    fun noteAnswer(context: Context, subject: String, correct: Boolean) {
        if (subject.isBlank()) return
        val p = prefs(context)
        val root = try {
            JSONObject(p.getString(KEY_ANSWERS, "{}"))
        } catch (_: Exception) {
            JSONObject()
        }
        val entry = root.optJSONObject(subject) ?: JSONObject()
        entry.put("total", entry.optInt("total", 0) + 1)
        if (correct) entry.put("hits", entry.optInt("hits", 0) + 1)
        root.put(subject, entry)
        p.edit().putString(KEY_ANSWERS, root.toString()).apply()
    }

    /** Pontos fracos: matérias com ≥ 2 respostas e < 50% de acerto (máx. 5). */
    private fun weakSubjects(context: Context): List<String> {
        val p = prefs(context)
        val root = try {
            JSONObject(p.getString(KEY_ANSWERS, "{}"))
        } catch (_: Exception) {
            return emptyList()
        }
        val weak = ArrayList<String>()
        val keys = root.keys()
        while (keys.hasNext()) {
            val subject = keys.next()
            val entry = root.optJSONObject(subject) ?: continue
            val total = entry.optInt("total", 0)
            val hits = entry.optInt("hits", 0)
            if (total >= 2 && hits * 2 < total) weak.add(subject)
        }
        return weak.take(5)
    }

    /**
     * O bloco "Contexto do aluno: …" para colar na 1.ª mensagem do
     * histórico enviado ao servidor (molde do widget). Vazio quando
     * ainda não há nada registado.
     */
    fun buildContextPrefix(context: Context): String {
        val p = prefs(context)
        val parts = ArrayList<String>()
        val lessons = readArray(p, KEY_LESSONS)
        if (lessons.length() > 0) {
            val names = (0 until lessons.length()).map { lessons.optString(it) }
            parts.add("Últimas aulas vistas: ${names.joinToString(", ")}")
        }
        val weak = weakSubjects(context)
        if (weak.isNotEmpty()) {
            parts.add("Pontos fracos (simulados): ${weak.joinToString(", ")}")
        }
        val interactions = p.getInt(KEY_INTERACTIONS, 0)
        if (interactions > 0) {
            parts.add("Interacções anteriores com a Meggy: $interactions")
        }
        if (parts.isEmpty()) return ""
        return "Contexto do aluno: " + parts.joinToString(". ") + "."
    }
}
