package com.meggy.app.ui.simulado

import android.os.Bundle
import android.os.CountDownTimer
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.meggy.app.R
import com.meggy.app.util.AuthHelper
import com.meggy.app.util.BankClient
import com.meggy.app.util.MeggyMemory
import com.meggy.app.util.UserStateSync
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.text.DateFormat
import java.util.Date

/**
 * 2.7.58 — SIMULADOS (destino real; desenho de destinos §1): página
 * de simulados como a da web — matéria (`question-bank/lists`, com
 * degradação p/ `shared-subjects`), assunto com contagens
 * (`question-topics`, "Todos os assuntos" incluído), quantidade e
 * tempo por chips (defaults Q-S2: 5/10/20/30, defeito 10; 15/30/60/90
 * min, defeito 30), sorteio do banco (`shared-flashcards?
 * kind=question`, pool paginado até 5000, dedup por enunciado),
 * pergunta primeiro e feedback depois (explicação + fundamentação +
 * texto legal), Anterior/Próxima sem perder nem repetir respostas,
 * cronómetro com auto-submissão, resultado + Refazer, e histórico no
 * formato da web (`meggy-simulados-v1`, últimos 20) espelhado no
 * servidor pelo `POST /userstate/save` existente (Q-S6).
 *
 * Assunto com menos questões que o pedido: o simulado ENCOLHE p/ o
 * tamanho do pool, com aviso (comportamento da web — Q-S1).
 * 401 em qualquer chamada = sessão expirada → login.
 */
class SimuladoActivity : AppCompatActivity() {

    data class Question(
        val statement: String,
        val options: List<String>,
        val correctIndex: Int,
        val explanation: String,
        val basis: String,
        val legalText: String,
        val subject: String,
        val topic: String
    )

    data class HistoryEntry(
        val title: String,
        val date: Long,
        val hits: Int,
        val total: Int,
        val durationSec: Int
    )

    // ── setup views ──
    private lateinit var setupPanel: View
    private lateinit var quizPanel: View
    private lateinit var resultPanel: View
    private lateinit var subjectSpinner: Spinner
    private lateinit var topicSpinner: Spinner
    private lateinit var setupState: TextView
    private lateinit var startButton: Button
    private lateinit var historyList: RecyclerView

    // ── quiz views ──
    private lateinit var quizCounter: TextView
    private lateinit var quizTimer: TextView
    private lateinit var quizStatement: TextView
    private lateinit var quizOptions: LinearLayout
    private lateinit var quizFeedback: TextView
    private lateinit var quizExplanation: TextView
    private lateinit var quizPrev: Button
    private lateinit var quizNext: Button
    private lateinit var quizFinish: Button

    // ── result views ──
    private lateinit var resultScore: TextView
    private lateinit var resultMessage: TextView

    private var subjects: List<String> = emptyList()
    private var topics: List<Pair<String, Int?>> = emptyList() // (nome, contagem?)
    private var selectedCount = 10
    private var selectedMinutes = 30

    private var questions: List<Question> = emptyList()
    private var answers: IntArray = IntArray(0)
    private var currentIndex = 0
    private var timer: CountDownTimer? = null
    private var quizStartedAt = 0L
    private var quizTitle = ""
    private var finished = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_simulado)

        findViewById<View>(R.id.simuladoBack)?.setOnClickListener { finish() }
        // Rail persistente na TV (a tela não é um item do menu —
        // fica sem selecção própria; HOME é o item neutro).
        com.meggy.app.ui.home.TvRailHost.attach(
            this,
            findViewById(R.id.tvSideMenu),
            findViewById(R.id.simuladoContent),
            com.meggy.app.ui.home.SideMenuView.MenuItem.HOME,
            R.id.simuladoSetupPanel
        )
        setupPanel = findViewById(R.id.simuladoSetupPanel)
        quizPanel = findViewById(R.id.simuladoQuizPanel)
        resultPanel = findViewById(R.id.simuladoResultPanel)
        subjectSpinner = findViewById(R.id.simuladoSubject)
        topicSpinner = findViewById(R.id.simuladoTopic)
        setupState = findViewById(R.id.simuladoSetupState)
        startButton = findViewById(R.id.simuladoStart)
        historyList = findViewById(R.id.simuladoHistory)
        historyList.layoutManager = LinearLayoutManager(this)

        quizCounter = findViewById(R.id.quizCounter)
        quizTimer = findViewById(R.id.quizTimer)
        quizStatement = findViewById(R.id.quizStatement)
        quizOptions = findViewById(R.id.quizOptions)
        quizFeedback = findViewById(R.id.quizFeedback)
        quizExplanation = findViewById(R.id.quizExplanation)
        quizPrev = findViewById(R.id.quizPrev)
        quizNext = findViewById(R.id.quizNext)
        quizFinish = findViewById(R.id.quizFinish)

        resultScore = findViewById(R.id.simuladoResultScore)
        resultMessage = findViewById(R.id.simuladoResultMessage)

        setupChips(
            findViewById(R.id.simuladoCountChips),
            listOf(5, 10, 20, 30), selectedCount
        ) { selectedCount = it }
        setupChips(
            findViewById(R.id.simuladoTimeChips),
            listOf(15, 30, 60, 90), selectedMinutes
        ) { selectedMinutes = it }

        subjectSpinner.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, pos: Int, id: Long) {
                val subject = subjects.getOrNull(pos) ?: return
                loadTopics(subject)
            }

            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }
        startButton.setOnClickListener { startQuiz() }
        quizPrev.setOnClickListener { if (currentIndex > 0) { currentIndex--; renderQuestion() } }
        quizNext.setOnClickListener {
            if (currentIndex < questions.lastIndex) { currentIndex++; renderQuestion() }
        }
        quizFinish.setOnClickListener { finishQuiz() }
        findViewById<View>(R.id.simuladoResultBack)?.setOnClickListener { showSetup() }
        findViewById<View>(R.id.simuladoResultRedo)?.setOnClickListener { redoQuiz() }
        findViewById<View>(R.id.simuladoRetry)?.setOnClickListener { loadSubjects() }

        showSetup()
        loadSubjects()
        renderHistory()
    }

    override fun onDestroy() {
        timer?.cancel()
        super.onDestroy()
    }

    // ─────────────────────────── setup ───────────────────────────

    private fun showSetup() {
        timer?.cancel()
        finished = false
        setupPanel.visibility = View.VISIBLE
        quizPanel.visibility = View.GONE
        resultPanel.visibility = View.GONE
        renderHistory()
    }

    private fun setupChips(container: LinearLayout, values: List<Int>, initial: Int, onPick: (Int) -> Unit) {
        container.removeAllViews()
        for (value in values) {
            val chip = TextView(this).apply {
                text = value.toString()
                setPadding(28, 12, 28, 12)
                isClickable = true
                isFocusable = true
                val lp = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
                lp.marginEnd = 12
                layoutParams = lp
                tag = value
            }
            chip.setOnClickListener {
                onPick(value)
                paintChips(container, value)
            }
            container.addView(chip)
        }
        paintChips(container, initial)
    }

    private fun paintChips(container: LinearLayout, selected: Int) {
        val onPink = ContextCompat.getColor(this, R.color.md_on_primary)
        val muted = ContextCompat.getColor(this, R.color.md_on_surface_variant)
        for (i in 0 until container.childCount) {
            val chip = container.getChildAt(i) as TextView
            val active = chip.tag == selected
            chip.background = ContextCompat.getDrawable(
                this,
                if (active) R.drawable.chip_filter_selected else R.drawable.chip_outline
            )
            chip.setTextColor(if (active) onPink else muted)
            chip.typeface = if (active) android.graphics.Typeface.DEFAULT_BOLD
            else android.graphics.Typeface.DEFAULT
        }
    }

    private fun loadSubjects() {
        setupState.visibility = View.VISIBLE
        setupState.text = getString(R.string.simulado_loading)
        findViewById<View>(R.id.simuladoRetry).visibility = View.GONE
        startButton.isEnabled = false
        lifecycleScope.launch {
            val reply = withContext(Dispatchers.IO) { BankClient.fetchLists(this@SimuladoActivity) }
            if (reply is BankClient.Reply.Unauthorized) {
                AuthHelper.bounceToLogin(this@SimuladoActivity)
                return@launch
            }
            var list = parseSubjects(reply)
            if (list.isEmpty()) {
                // Degradação da web: shared-subjects.
                val fallback = withContext(Dispatchers.IO) {
                    BankClient.get(this@SimuladoActivity, "/api/ai/shared-subjects")
                }
                if (fallback is BankClient.Reply.Unauthorized) {
                    AuthHelper.bounceToLogin(this@SimuladoActivity)
                    return@launch
                }
                list = parseSharedSubjects(fallback)
            }
            if (list.isEmpty()) {
                setupState.text = if (reply is BankClient.Reply.Failed) {
                    getString(R.string.simulado_error)
                } else {
                    getString(R.string.simulado_empty_subjects)
                }
                findViewById<View>(R.id.simuladoRetry).visibility = View.VISIBLE
                return@launch
            }
            subjects = list
            setupState.visibility = View.GONE
            startButton.isEnabled = true
            subjectSpinner.adapter = ArrayAdapter(
                this@SimuladoActivity,
                android.R.layout.simple_spinner_dropdown_item,
                list
            )
        }
    }

    private fun parseSubjects(reply: BankClient.Reply): List<String> {
        val json = (reply as? BankClient.Reply.Ok)?.json ?: return emptyList()
        val arr = json.optJSONArray("disciplines") ?: return emptyList()
        val out = ArrayList<String>()
        for (i in 0 until arr.length()) {
            val name = arr.optString(i)
            if (name.isNotBlank()) out.add(name)
        }
        return out
    }

    private fun parseSharedSubjects(reply: BankClient.Reply): List<String> {
        val json = (reply as? BankClient.Reply.Ok)?.json ?: return emptyList()
        val arr = json.optJSONArray("questionSubjects") ?: return emptyList()
        val out = ArrayList<String>()
        for (i in 0 until arr.length()) {
            val name = arr.optString(i)
            if (name.isNotBlank()) out.add(name)
        }
        return out
    }

    private fun loadTopics(subject: String) {
        topicSpinner.isEnabled = false
        topics = listOf(getString(R.string.simulado_topic_all) to null)
        topicSpinner.adapter = ArrayAdapter(
            this, android.R.layout.simple_spinner_dropdown_item,
            topics.map { it.first }
        )
        lifecycleScope.launch {
            val reply = withContext(Dispatchers.IO) {
                BankClient.fetchTopics(this@SimuladoActivity, subject)
            }
            if (reply is BankClient.Reply.Unauthorized) {
                AuthHelper.bounceToLogin(this@SimuladoActivity)
                return@launch
            }
            val json = (reply as? BankClient.Reply.Ok)?.json ?: return@launch
            val arr = json.optJSONArray("topics") ?: return@launch
            val loaded = ArrayList<Pair<String, Int?>>()
            loaded.add(getString(R.string.simulado_topic_all) to null)
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                val name = o.optString("topic")
                if (name.isBlank()) continue
                val count = if (o.has("count")) o.optInt("count") else null
                loaded.add(name to count)
            }
            topics = loaded
            topicSpinner.adapter = ArrayAdapter(
                this@SimuladoActivity,
                android.R.layout.simple_spinner_dropdown_item,
                loaded.map { (name, count) ->
                    if (count != null) "$name ($count)" else name
                }
            )
            topicSpinner.isEnabled = true
        }
    }

    // ─────────────────────────── quiz ───────────────────────────

    private fun startQuiz() {
        val subject = subjects.getOrNull(subjectSpinner.selectedItemPosition) ?: return
        val topic = topics.getOrNull(topicSpinner.selectedItemPosition)?.first
            ?.takeIf { topicSpinner.selectedItemPosition > 0 }
        quizTitle = if (topic != null) "$subject · $topic" else subject
        startButton.isEnabled = false
        setupState.visibility = View.VISIBLE
        setupState.text = getString(R.string.simulado_loading)
        lifecycleScope.launch {
            val pool = withContext(Dispatchers.IO) {
                fetchPool(subject, topic)
            }
            startButton.isEnabled = true
            setupState.visibility = View.GONE
            if (pool == null) {
                setupState.visibility = View.VISIBLE
                setupState.text = getString(R.string.simulado_error)
                return@launch
            }
            if (pool.isEmpty()) {
                Toast.makeText(
                    this@SimuladoActivity,
                    getString(R.string.simulado_empty_subjects),
                    Toast.LENGTH_LONG
                ).show()
                return@launch
            }
            if (pool.size < selectedCount) {
                Toast.makeText(
                    this@SimuladoActivity,
                    getString(R.string.simulado_shrunk, pool.size),
                    Toast.LENGTH_LONG
                ).show()
            }
            questions = pool.shuffled().take(selectedCount)
            beginQuiz()
        }
    }

    /** Pool paginado (limit=500 até 5000), dedup por enunciado. Null = 401/falha tratada. */
    private suspend fun fetchPool(subject: String, topic: String?): List<Question>? {
        val out = ArrayList<Question>()
        val seen = HashSet<String>()
        var offset = 0
        while (out.size < 5000) {
            val reply = BankClient.fetchQuestionPage(
                this@SimuladoActivity, subject, topic, 500, offset
            )
            if (reply is BankClient.Reply.Unauthorized) {
                withContext(Dispatchers.Main) {
                    AuthHelper.bounceToLogin(this@SimuladoActivity)
                }
                return null
            }
            val json = (reply as? BankClient.Reply.Ok)?.json ?: return null
            val items = json.optJSONArray("items") ?: break
            if (items.length() == 0) break
            for (i in 0 until items.length()) {
                val q = parseQuestion(items.optJSONObject(i) ?: continue, subject) ?: continue
                val key = q.statement.trim().lowercase()
                if (key.isNotBlank() && seen.add(key)) out.add(q)
            }
            offset += items.length()
            if (items.length() < 500) break
        }
        return out
    }

    private fun parseQuestion(o: JSONObject, fallbackSubject: String): Question? {
        val statement = o.optString("statement").ifBlank { o.optString("front") }
        if (statement.isBlank()) return null
        val rawOptions = ArrayList<String>()
        val arr = o.optJSONArray("options")
        if (arr != null) {
            for (i in 0 until arr.length()) {
                val v = arr.optString(i)
                if (v.isNotBlank()) rawOptions.add(v)
            }
        }
        var correct = -1
        if (o.has("correct") && !o.isNull("correct")) {
            val c = o.opt("correct")
            correct = when (c) {
                is Number -> c.toInt()
                is Boolean -> if (c) 0 else 1
                is String -> {
                    val s = c.trim()
                    when {
                        s.length == 1 && s.uppercase() in "ABCDE" ->
                            s.uppercase()[0] - 'A'
                        s.equals("certo", true) -> 0
                        s.equals("errado", true) -> 1
                        else -> rawOptions.indexOfFirst { it.equals(s, true) }
                    }
                }
                else -> -1
            }
        }
        val options: List<String>
        if (rawOptions.size >= 2) {
            options = rawOptions
        } else {
            // Certo/Errado (type != mc ou sem opções): sintetiza as duas.
            options = listOf("Certo", "Errado")
            if (correct !in 0..1) correct = -1
        }
        if (correct !in options.indices) return null
        return Question(
            statement = statement,
            options = options,
            correctIndex = correct,
            explanation = o.optString("explanation").ifBlank { o.optString("back") },
            basis = o.optString("fundamentacao"),
            legalText = o.optString("legalText").ifBlank { o.optString("legal_text") },
            subject = o.optString("subject").ifBlank { fallbackSubject },
            topic = o.optString("topic")
        )
    }

    private fun beginQuiz() {
        answers = IntArray(questions.size) { -1 }
        currentIndex = 0
        finished = false
        quizStartedAt = System.currentTimeMillis()
        setupPanel.visibility = View.GONE
        resultPanel.visibility = View.GONE
        quizPanel.visibility = View.VISIBLE
        renderQuestion()
        timer?.cancel()
        timer = object : CountDownTimer(selectedMinutes * 60_000L, 1000L) {
            override fun onTick(millisUntilFinished: Long) {
                val s = millisUntilFinished / 1000
                quizTimer.text = getString(
                    R.string.simulado_timer,
                    String.format("%02d:%02d", s / 60, s % 60)
                )
            }

            override fun onFinish() {
                if (!finished) finishQuiz()
            }
        }.start()
    }

    private fun renderQuestion() {
        val q = questions[currentIndex]
        val answered = answers[currentIndex] >= 0
        val hits = answers.indices.count { answers[it] == questions[it].correctIndex }
        val responded = answers.count { it >= 0 }
        quizCounter.text = getString(
            R.string.simulado_question_counter,
            currentIndex + 1, questions.size, hits, responded
        )
        quizStatement.text = q.statement
        quizOptions.removeAllViews()
        val letters = listOf("A", "B", "C", "D", "E")
        q.options.forEachIndexed { idx, option ->
            val view = TextView(this).apply {
                text = "${letters.getOrElse(idx) { "" }}. $option"
                setPadding(24, 18, 24, 18)
                isClickable = true
                isFocusable = true
                val lp = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
                lp.bottomMargin = 12
                layoutParams = lp
                background = ContextCompat.getDrawable(
                    context, R.drawable.chip_outline
                )
                setTextColor(ContextCompat.getColor(context, R.color.md_on_surface))
                if (answered) {
                    when (idx) {
                        q.correctIndex -> {
                            background = ContextCompat.getDrawable(
                                context, R.drawable.chip_filter_selected
                            )
                            setTextColor(ContextCompat.getColor(context, R.color.md_on_primary))
                        }
                        answers[currentIndex] -> {
                            setTextColor(ContextCompat.getColor(context, R.color.md_primary))
                        }
                    }
                }
            }
            view.setOnClickListener {
                if (answers[currentIndex] < 0 && !finished) {
                    answers[currentIndex] = idx
                    MeggyMemory.noteAnswer(this, q.subject, idx == q.correctIndex)
                    renderQuestion()
                }
            }
            quizOptions.addView(view)
        }
        if (answered) {
            val ok = answers[currentIndex] == q.correctIndex
            quizFeedback.visibility = View.VISIBLE
            quizFeedback.text = getString(
                if (ok) R.string.simulado_correct else R.string.simulado_wrong
            )
            quizFeedback.setTextColor(
                ContextCompat.getColor(
                    this,
                    if (ok) R.color.md_primary else R.color.md_on_surface
                )
            )
            val parts = ArrayList<String>()
            if (q.explanation.isNotBlank()) {
                parts.add("${getString(R.string.simulado_explanation_label)}: ${q.explanation}")
            }
            if (q.basis.isNotBlank()) {
                parts.add("${getString(R.string.simulado_basis_label)}: ${q.basis}")
            }
            if (q.legalText.isNotBlank()) parts.add(q.legalText)
            quizExplanation.visibility = if (parts.isEmpty()) View.GONE else View.VISIBLE
            quizExplanation.text = parts.joinToString("\n\n")
        } else {
            quizFeedback.visibility = View.GONE
            quizExplanation.visibility = View.GONE
        }
        quizPrev.isEnabled = currentIndex > 0
        quizNext.isEnabled = currentIndex < questions.lastIndex
        quizFinish.visibility = if (currentIndex == questions.lastIndex) View.VISIBLE else View.GONE
    }

    private fun redoQuiz() {
        // Refazer com as MESMAS questões (molde da web/desktop).
        beginQuiz()
    }

    private fun finishQuiz() {
        if (finished) return
        finished = true
        timer?.cancel()
        val hits = answers.indices.count { answers[it] == questions[it].correctIndex }
        val total = questions.size
        val durationSec = ((System.currentTimeMillis() - quizStartedAt) / 1000).toInt()
        saveHistory(
            HistoryEntry(
                title = quizTitle,
                date = System.currentTimeMillis(),
                hits = hits,
                total = total,
                durationSec = durationSec
            )
        )
        quizPanel.visibility = View.GONE
        resultPanel.visibility = View.VISIBLE
        val pct = if (total > 0) hits * 100 / total else 0
        resultScore.text = getString(R.string.simulado_result_score, hits, total, pct)
        resultMessage.text = when {
            pct >= 80 -> "Excelente! Continua assim. 🎉"
            pct >= 60 -> "Bom trabalho! Quase lá."
            pct >= 40 -> "A rever a matéria e a tentar de novo."
            else -> "Não desanimes — revê a matéria e tenta outra vez."
        }
    }

    // ─────────────────────────── histórico ───────────────────────────

    private fun historyPrefs() =
        getSharedPreferences("meggy_simulados_history", MODE_PRIVATE)

    private fun readHistory(): List<HistoryEntry> {
        val raw = historyPrefs().getString("meggy-simulados-v1", "[]") ?: "[]"
        val out = ArrayList<HistoryEntry>()
        try {
            val arr = JSONArray(raw)
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                out.add(
                    HistoryEntry(
                        title = o.optString("title"),
                        date = o.optLong("date", 0L),
                        hits = o.optInt("hits", 0),
                        total = o.optInt("total", 0),
                        durationSec = o.optInt("duration", 0)
                    )
                )
            }
        } catch (_: Exception) {
        }
        return out
    }

    private fun saveHistory(entry: HistoryEntry) {
        val all = ArrayList<HistoryEntry>()
        all.add(entry)
        all.addAll(readHistory())
        val trimmed = all.take(20)
        val arr = JSONArray()
        for (e in trimmed) {
            val o = JSONObject()
            o.put("id", e.date.toString())
            o.put("date", e.date)
            o.put("title", e.title)
            o.put("duration", e.durationSec)
            o.put("hits", e.hits)
            o.put("misses", e.total - e.hits)
            o.put("total", e.total)
            arr.put(o)
        }
        historyPrefs().edit().putString("meggy-simulados-v1", arr.toString()).apply()
        // Espelho no servidor pela rota existente (Q-S6): POST
        // /userstate/save com a chave "simulados" (agregado só).
        val patch = JSONObject()
        patch.put("simulados", arr)
        UserStateSync.postPatchAsync(this, patch.toString())
        renderHistory()
    }

    private fun renderHistory() {
        val entries = readHistory()
        val title = findViewById<TextView>(R.id.simuladoHistoryTitle)
        title.text = getString(R.string.simulado_history_title) +
            if (entries.isEmpty()) " — ${getString(R.string.simulado_history_empty)}" else ""
        historyList.adapter = object : RecyclerView.Adapter<HistoryVH>() {
            override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): HistoryVH {
                val view = LayoutInflater.from(parent.context)
                    .inflate(R.layout.item_simulado_history, parent, false)
                return HistoryVH(view)
            }

            override fun onBindViewHolder(holder: HistoryVH, position: Int) {
                val e = entries[position]
                holder.title.text = e.title
                val pct = if (e.total > 0) e.hits * 100 / e.total else 0
                val date = if (e.date > 0) {
                    DateFormat.getDateInstance(DateFormat.SHORT).format(Date(e.date))
                } else ""
                holder.meta.text = "$date · ${e.hits}/${e.total} ($pct%)"
                holder.meta.setTextColor(
                    ContextCompat.getColor(
                        holder.itemView.context,
                        if (pct >= 60) R.color.md_primary else R.color.md_on_surface_variant
                    )
                )
            }

            override fun getItemCount(): Int = entries.size
        }
    }

    class HistoryVH(view: View) : RecyclerView.ViewHolder(view) {
        val title: TextView = view.findViewById(R.id.historyItemTitle)
        val meta: TextView = view.findViewById(R.id.historyItemMeta)
    }
}
