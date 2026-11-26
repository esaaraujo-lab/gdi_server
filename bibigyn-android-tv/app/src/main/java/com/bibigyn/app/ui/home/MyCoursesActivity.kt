package com.bibigyn.app.ui.home

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.bibigyn.app.R
import com.bibigyn.app.ui.detail.DetailActivity
import com.bibigyn.app.util.AuthHelper
import com.bibigyn.app.util.SiteHttp
import com.bibigyn.app.util.TvUtils
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * v2.1.44 — MEUS CURSOS (item do menu da TV; porte da Meggy 2.7.58):
 * grade estilo biblioteca com os cursos/treinos do aluno — os
 * adicionados por ele (user_courses) e os criados por/para ele. A
 * fonte é a rota que o site já serve, `GET /api/courses/unified`
 * (a mesma dos totais reais dos cartões): cada item traz coursePath
 * + total; o nome vem do item quando o servidor o traz, senão do
 * último segmento do caminho.
 *
 * Tile: capa (cadeia de capas da BiBi — biblioteca por tipo → capa
 * gerada do drive → monograma), nome, "N aulas" e progresso local
 * (assistidos sob o prefixo / total). O toque abre o detalhe do
 * curso — o caminho normal de abertura, sem lógica nova.
 *
 * Sem rede/erro: estado vazio honesto com "Tentar de novo" (401 faz
 * bounce para o login, como no resto do app).
 *
 * Divergência registada vs Meggy: a Meggy calcula as colunas da TV
 * com `TvAutoFit.gridSpanForTile`, que a BiBi não tem — aqui a conta
 * é inline (largura útil / ~176dp por tile, 2..6), sem tocar no
 * TvAutoFit da BiBi.
 */
class MyCoursesActivity : AppCompatActivity() {

    data class CourseEntry(val name: String, val path: String, val total: Int)

    private lateinit var recycler: RecyclerView
    private lateinit var stateText: TextView
    private lateinit var loading: View
    private lateinit var retry: View
    private var adapter: MyCoursesAdapter? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_my_courses)

        findViewById<View>(R.id.myCoursesToolbarBack)?.setOnClickListener { finish() }
        recycler = findViewById(R.id.myCoursesGrid)
        stateText = findViewById(R.id.myCoursesState)
        loading = findViewById(R.id.myCoursesLoading)
        retry = findViewById(R.id.myCoursesRetry)
        retry.setOnClickListener { loadCourses() }

        val span = if (TvUtils.isTv(this)) {
            val widthDp = resources.displayMetrics.widthPixels / resources.displayMetrics.density
            ((widthDp - SideMenuView.WIDTH_COLLAPSED_DP) / 176f).toInt().coerceIn(2, 6)
        } else 2
        recycler.layoutManager = GridLayoutManager(this, span)
        adapter = MyCoursesAdapter { entry ->
            val intent = Intent(this, DetailActivity::class.java)
            intent.putExtra("drivePath", entry.path)
            intent.putExtra("folderName", entry.name)
            startActivity(intent)
        }
        recycler.adapter = adapter

        // Rail persistente da TV (o item Meus Cursos fica seleccionado).
        TvRailHost.attach(
            this,
            findViewById(R.id.tvSideMenu),
            findViewById(R.id.myCoursesContent),
            SideMenuView.MenuItem.MY_COURSES,
            R.id.myCoursesGrid
        )

        loadCourses()
    }

    private fun loadCourses() {
        loading.visibility = View.VISIBLE
        stateText.visibility = View.GONE
        retry.visibility = View.GONE
        lifecycleScope.launch {
            val result = withContext(Dispatchers.IO) {
                try {
                    SiteHttp.get(this@MyCoursesActivity, "/api/courses/unified")
                } catch (_: Exception) {
                    null
                }
            }
            loading.visibility = View.GONE
            if (result == null) {
                showError()
                return@launch
            }
            if (result.isUnauthorized) {
                AuthHelper.bounceToLogin(this@MyCoursesActivity)
                return@launch
            }
            val entries = if (result.isOk && result.body != null) {
                parseCourses(result.body)
            } else {
                showError()
                return@launch
            }
            if (entries.isEmpty()) {
                stateText.text = getString(R.string.my_courses_empty)
                stateText.visibility = View.VISIBLE
                adapter?.submit(emptyList())
                return@launch
            }
            adapter?.submit(entries)
        }
    }

    private fun showError() {
        stateText.text = getString(R.string.courses_load_error)
        stateText.visibility = View.VISIBLE
        retry.visibility = View.VISIBLE
    }

    /**
     * Itens do unified: kind "course" (e "concurso", defensivo) com
     * coursePath + total > 0. Nome: o do item (name/title/courseName)
     * quando existir; senão o último segmento do caminho.
     */
    private fun parseCourses(body: String): List<CourseEntry> {
        val out = ArrayList<CourseEntry>()
        try {
            val json = JSONObject(body)
            if (!json.optBoolean("ok", false)) return out
            val items = json.optJSONArray("items") ?: return out
            for (i in 0 until items.length()) {
                val item = items.optJSONObject(i) ?: continue
                val kind = item.optString("kind")
                if (kind != "course" && kind != "concurso") continue
                val path = item.optString("coursePath")
                val total = item.optInt("total", 0)
                if (path.isBlank() || total <= 0) continue
                val name = item.optString("name").ifBlank { item.optString("title") }
                    .ifBlank { item.optString("courseName") }
                    .ifBlank { path.trimEnd('/').substringAfterLast('/') }
                out.add(CourseEntry(name, path, total))
            }
        } catch (_: Exception) {
            return emptyList()
        }
        return out
    }
}
