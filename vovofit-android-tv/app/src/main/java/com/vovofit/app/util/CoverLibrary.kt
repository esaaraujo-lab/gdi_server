package com.vovofit.app.util

import android.content.Context
import android.widget.ImageView
import coil.load
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.Normalizer
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * v1.0.8 — CAMADA 3 DAS CAPAS: biblioteca de imagens por tipo de aula
 * (adendo do Elton, 2026-11-14 19:50).
 *
 * Hierarquia completa da capa (onde quer que uma capa seja exibida):
 *   (1) foto de capa do admin (`coverUrl` / FeaturedCourse) — quando o
 *       site a devolve p/ aquele curso/drive;
 *   (2) thumb do Drive (`thumbnailLink`) — foto real do arquivo;
 *   (3) IMAGEM DA BIBLIOTECA POR TIPO DE AULA (este arquivo) — a imagem
 *       da disciplina/tipo correspondente ao NOME da aula/pasta/curso
 *       (ex.: cardio, musculacao, pernas, biceps, triceps,
 *       hipopressivos), resolvida pelo manifesto no jsDelivr;
 *   (4) arte padrão gerada — capa local do drive (`cover_*`, foto 16:9
 *       em drawable-nodpi).
 * Sem match na (3), cai na (4). Sem URL configurada, sem rede ou fetch
 * falhando, a (3) é pulada EM SILÊNCIO (nunca trava a tela, nunca toast
 * de erro por isso) e a cadeia cai na (4).
 *
 * ── CONTRATO DO MANIFESTO (formato esperado) ──
 *
 * O manifesto é um JSON servido no jsDelivr, gerado por OUTRA equipe
 * (ela ainda está gerando as imagens; o formato exato não foi fixado
 * quando este código foi escrito). O formato SUGERIDO — e o que a outra
 * equipe deve seguir — é:
 *
 *     {
 *       "version": 1,
 *       "images": [
 *         {
 *           "id": "cardio",
 *           "keywords": ["cardio", "aerobico", "hiit"],
 *           "url": "https://cdn.jsdelivr.net/gh/<repo>@<ref>/covers/cardio.jpg"
 *         },
 *         {
 *           "id": "pernas",
 *           "keywords": ["pernas", "quadriceps", "gluteos"],
 *           "url": "https://cdn.jsdelivr.net/gh/<repo>@<ref>/covers/pernas.jpg"
 *         }
 *       ]
 *     }
 *
 * O parse é TOLERANTE e aceita mais de uma forma (a outra equipe pode
 * entregar o manifesto em qualquer uma delas):
 *   Raiz:
 *     - objeto com lista "images" (formato sugerido acima), OU
 *     - mapa plano {"cardio": "https://.../cardio.jpg", ...}
 *       (a chave vira a keyword única da entrada).
 *   Entrada (objeto):
 *     - keywords: lista "keywords" OU string "name" (uma keyword só);
 *       "id" também entra como keyword quando não há "keywords"/"name".
 *     - url: campo "url" OU campo "image".
 *   Entradas sem URL ou sem keyword são descartadas.
 *
 * ── RESOLUÇÃO POR NOME ──
 *
 * 1. Normalização: minúsculas, sem acentos (NFD + remoção de marcas
 *    combinantes: "Musculação" -> "musculacao", "Bíceps" -> "biceps"),
 *    sem pontuação (qualquer sequência de não [a-z0-9] vira um espaço:
 *    "Hipopressivos — Aula 03" -> "hipopressivos aula 03"), espaços
 *    colapsados, sem espaços nas pontas.
 * 2. Ordem de tentativa (do mais específico ao mais geral): o chamador
 *    passa os nomes nessa ordem — nome da aula, depois pasta, depois
 *    curso/drive. O PRIMEIRO nome que tiver algum match vence (a
 *    especificidade manda, mesmo que um nome mais geral tivesse uma
 *    keyword mais longa).
 * 3. Dentro de um nome: uma keyword casa quando aparece como substring
 *    do nome normalizado ("cardio" casa "cardio hiit aula 01").
 *    Ganha o match MAIS LONGO (a keyword mais longa); empate -> a
 *    PRIMEIRA entrada do manifesto (ordem do arquivo).
 * 4. Sem match em nenhum nome -> null (o chamador cai na camada 4).
 *
 * ── CACHE / FETCH ──
 *
 * O manifesto é buscado em 2º plano (nunca bloqueia a UI), na abertura
 * do app (VovoFitApp) e na abertura da home (HomeActivity). Fica em
 * cache em memória + persistido em SharedPreferences, com TTL de 24h.
 * `refreshAsync` é idempotente (não re-busca se estiver fresco ou se
 * já houver um fetch em andamento). Sem URL configurada, não há fetch
 * nenhum — `resolve` só devolve null e a camada 3 é pulada.
 *
 * ── COMO LIGAR ──
 *
 * ÚNICO PONTO DE LIGAÇÃO: a constante [LIBRARY_MANIFEST_URL] abaixo.
 * Quando o Elton mandar a URL do manifesto publicado no jsDelivr,
 * colar a URL nela (1 linha, este arquivo). Nada mais precisa mudar:
 * todos os pontos de capa do app já chamam [resolve] / [loadCoverChain].
 */
object CoverLibrary {

    /**
     * ÚNICO PONTO DE LIGAÇÃO — URL do manifesto da biblioteca no jsDelivr.
     * AINDA NÃO EXISTE: a outra equipe está gerando as imagens + o manifesto.
     * Para ligar, colar aqui a URL publicada, por exemplo:
     *   "https://cdn.jsdelivr.net/gh/esaaraujo-lab/gdi_server@main/covers/cover-library.json"
     * Enquanto estiver vazia, a camada 3 é pulada em silêncio e a cadeia
     * de capa cai direto da (2) para a (4). NÃO colocar nenhuma outra URL
     * aqui (não é BASE_URL nem endpoint de IA).
     */
    const val LIBRARY_MANIFEST_URL = "" // TODO: ligar quando o Elton mandar a URL do manifesto no jsDelivr

    /** TTL do cache do manifesto: 24h. */
    private val TTL_MS: Long = TimeUnit.HOURS.toMillis(24)
    private const val PREFS = "cover_library"
    private const val KEY_JSON = "manifest_json"
    private const val KEY_FETCHED_AT = "fetched_at_ms"

    /** Uma entrada do manifesto: keywords já normalizadas + URL da imagem. */
    data class LibraryImage(val id: String, val keywords: List<String>, val url: String)

    @Volatile
    private var cached: List<LibraryImage>? = null

    @Volatile
    private var cacheLoaded: Boolean = false

    @Volatile
    private var fetching: Boolean = false

    private val fetchScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    // ──────────── normalização ────────────

    /**
     * Normaliza um nome p/ comparação: minúsculas, sem acentos, sem
     * pontuação, espaços colapsados. Ex.: "Musculação - Pernas" ->
     * "musculacao pernas"; "Hipopressivos — Aula 03" -> "hipopressivos
     * aula 03"; "Bíceps e Tríceps" -> "biceps e triceps".
     */
    fun normalize(text: String): String {
        val noAccents = Normalizer.normalize(text, Normalizer.Form.NFD)
            .replace(Regex("\\p{InCombiningDiacriticalMarks}+"), "")
        return noAccents.lowercase()
            .replace(Regex("[^a-z0-9]+"), " ")
            .trim()
            .replace(Regex("\\s+"), " ")
    }

    // ──────────── parse (tolerante) ────────────

    /**
     * Parse tolerante do manifesto. Aceita:
     *   {"version": 1, "images": [{"id", "keywords"|"name", "url"|"image"}]}
     *   {"cardio": "https://..."} (mapa plano: chave = keyword, valor = URL)
     * Devolve a lista na ordem do manifesto (a ordem decide os empates).
     * Nunca lança: JSON inválido -> lista vazia.
     */
    fun parseManifest(json: String): List<LibraryImage> {
        return try {
            val root = JSONObject(json)
            val out = ArrayList<LibraryImage>()
            if (root.has("images")) {
                // Chave "images" presente mas nao e lista -> manifesto
                // malformado: nao tentar ler como mapa plano (a chave
                // "images" viraria uma keyword falsa).
                val images = root.optJSONArray("images") ?: return emptyList()
                parseImageArray(images, out)
            } else {
                // Mapa plano: {"cardio": "https://.../cardio.jpg"}
                val keys = root.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    if (key == "version") continue
                    val url = root.optString(key).takeIf { it.isNotBlank() } ?: continue
                    val kw = normalize(key).takeIf { it.isNotBlank() } ?: continue
                    out.add(LibraryImage(id = key, keywords = listOf(kw), url = url))
                }
            }
            out
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun parseImageArray(images: JSONArray, out: MutableList<LibraryImage>) {
        for (i in 0 until images.length()) {
            val o = images.optJSONObject(i) ?: continue
            val url = o.optString("url").takeIf { it.isNotBlank() }
                ?: o.optString("image").takeIf { it.isNotBlank() }
                ?: continue
            val keywords = ArrayList<String>()
            val kwArr = o.optJSONArray("keywords")
            if (kwArr != null) {
                for (j in 0 until kwArr.length()) {
                    normalize(kwArr.optString(j)).takeIf { it.isNotBlank() }?.let { keywords.add(it) }
                }
            }
            if (keywords.isEmpty()) {
                normalize(o.optString("name")).takeIf { it.isNotBlank() }?.let { keywords.add(it) }
            }
            if (keywords.isEmpty()) {
                normalize(o.optString("id")).takeIf { it.isNotBlank() }?.let { keywords.add(it) }
            }
            if (keywords.isEmpty()) continue
            out.add(LibraryImage(id = o.optString("id"), keywords = keywords, url = url))
        }
    }

    // ──────────── cache ────────────

    /** Carrega o manifesto persistido p/ a memória (1ª vez; barato). */
    private fun ensureLoaded(context: Context) {
        if (cacheLoaded) return
        synchronized(this) {
            if (cacheLoaded) return
            try {
                val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                val json = prefs.getString(KEY_JSON, null)
                cached = if (!json.isNullOrBlank()) parseManifest(json) else emptyList()
            } catch (_: Exception) {
                cached = emptyList()
            }
            cacheLoaded = true
        }
    }

    private fun persist(context: Context, json: String) {
        try {
            context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_JSON, json)
                .putLong(KEY_FETCHED_AT, System.currentTimeMillis())
                .apply()
        } catch (_: Exception) {
            // Cache persistido é best-effort; a memória já tem o manifesto.
        }
    }

    private fun isFresh(context: Context): Boolean {
        return try {
            val at = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getLong(KEY_FETCHED_AT, 0L)
            at > 0L && System.currentTimeMillis() - at < TTL_MS
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Busca o manifesto em 2º plano (nunca bloqueia a UI) e atualiza o
     * cache. Idempotente: sem URL configurada, com cache fresco (< 24h)
     * ou com um fetch já em andamento, não faz nada. Qualquer falha
     * (sem rede, HTTP != 200, JSON inválido) é engolida em silêncio —
     * a camada 3 simplesmente não é usada até a próxima tentativa.
     * Chamado na abertura do app (VovoFitApp) e na abertura da home.
     */
    fun refreshAsync(context: Context) {
        if (LIBRARY_MANIFEST_URL.isBlank()) return
        ensureLoaded(context)
        if (isFresh(context) || fetching) return
        fetching = true
        val appContext = context.applicationContext
        fetchScope.launch {
            try {
                val conn = (URL(LIBRARY_MANIFEST_URL).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 10_000
                    readTimeout = 15_000
                    instanceFollowRedirects = true
                }
                try {
                    if (conn.responseCode != HttpURLConnection.HTTP_OK) return@launch
                    val body = conn.inputStream.bufferedReader().use { it.readText() }
                    val parsed = parseManifest(body)
                    if (parsed.isEmpty()) return@launch
                    cached = parsed
                    persist(appContext, body)
                } finally {
                    conn.disconnect()
                }
            } catch (_: Exception) {
                // Silêncio: sem rede ou manifesto fora do ar -> camada 3
                // pulada; a próxima abertura tenta de novo.
            } finally {
                fetching = false
            }
        }
    }

    // ──────────── resolução ────────────

    /**
     * Resolve a imagem da biblioteca p/ os nomes dados, na ordem
     * (aula, pasta, curso/drive). O primeiro nome com match vence; dentro
     * dele, a keyword MAIS LONGA vence; empate -> primeira do manifesto.
     * Sem manifesto carregado, sem match ou sem nomes -> null.
     */
    fun resolve(context: Context, vararg names: String?): String? {
        ensureLoaded(context)
        val entries = cached ?: return null
        if (entries.isEmpty()) return null
        for (raw in names) {
            val name = raw?.let { normalize(it) }?.takeIf { it.isNotBlank() } ?: continue
            var bestUrl: String? = null
            var bestLen = -1
            for (entry in entries) {
                for (kw in entry.keywords) {
                    if (kw.isNotBlank() && name.contains(kw) && kw.length > bestLen) {
                        bestLen = kw.length
                        bestUrl = entry.url
                    }
                }
            }
            if (bestUrl != null) return bestUrl
        }
        return null
    }
}

/**
 * Cadeia de capa com a camada (3) incluída — usar em TODOS os pontos de
 * capa do app (hero, rails, cards de aula, detalhe, player/áudio, busca,
 * Minha lista), para a hierarquia não divergir por tela:
 *   (1)/(2) `remoteUrl` (coverUrl do admin ou thumb do Drive) via Coil;
 *     se falhar, tenta a (3); se a (3) falhar, (4) `fallbackRes`.
 *   (3) sem `remoteUrl`: resolve a biblioteca pelos `names` e carrega
 *     via Coil; se falhar, (4).
 *   (4) sem `remoteUrl` e sem match: `fallbackRes` (capa local do drive).
 * Nunca lança e nunca mostra erro: sem match ou sem manifesto, cai na (4).
 *
 * `names` na ordem aula -> pasta -> curso/drive (ver [CoverLibrary.resolve]).
 * `placeholderRes` é opcional (só o hero o usa, como antes).
 */
fun ImageView.loadCoverChain(
    remoteUrl: String?,
    fallbackRes: Int,
    vararg names: String?,
    placeholderRes: Int? = null
) {
    val libUrl = CoverLibrary.resolve(context, *names)
    if (!remoteUrl.isNullOrBlank()) {
        load(remoteUrl) {
            if (placeholderRes != null) placeholder(placeholderRes)
            error(fallbackRes)
            listener(onError = { _, _ ->
                if (libUrl != null) {
                    load(libUrl) { error(fallbackRes) }
                } else {
                    setImageResource(fallbackRes)
                }
            })
        }
    } else if (libUrl != null) {
        load(libUrl) { error(fallbackRes) }
    } else {
        setImageResource(fallbackRes)
    }
}
