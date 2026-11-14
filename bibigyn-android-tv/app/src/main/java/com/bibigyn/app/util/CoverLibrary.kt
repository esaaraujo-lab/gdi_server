package com.bibigyn.app.util

import android.content.Context
import com.bibigyn.app.BiBiGynApp
import java.text.Normalizer
import java.util.Locale
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject

/**
 * Camada 3 da hierarquia de capa — biblioteca de imagens por tipo
 * de aula (Elton 2026-11-14 19:50).
 *
 * Hierarquia completa da capa (nunca monograma como capa quando há
 * imagem da biblioteca):
 *   (1) foto de capa do admin (`cover_url` / `coverUrl`);
 *   (2) thumb do Drive;
 *   (3) IMAGEM DA BIBLIOTECA POR TIPO (este objeto);
 *   (4) arte padrão gerada (capa do drive / monograma).
 *
 * A biblioteca é gerada por OUTRA equipe e publicada no jsDelivr
 * como um manifesto JSON. O APK resolve a imagem pelo NOME da
 * aula/pasta/curso, casando as keywords do manifesto contra o nome.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ PONTO ÚNICO DE LIGAÇÃO — URL DO MANIFESTO                      │
 * │ [LIBRARY_MANIFEST_URL] abaixo. Hoje está VAZIA (não            │
 * │ configurada): a URL ainda não existe — o Elton vai mandá-la   │
 * │ quando a biblioteca estiver publicada no jsDelivr. Para ligar,│
 * │ basta preencher essa UMA constante com a URL do manifesto;    │
 * │ nenhum outro arquivo precisa mudar.                           │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * CONTRATO DO MANIFESTO (formato sugerido — documentado aqui; o
 * parse é TOLERANTE, ver [parseManifest]):
 * ```json
 * {
 *   "version": 1,
 *   "images": [
 *     {
 *       "id": "hipopressivos",
 *       "keywords": ["hipopressivos"],
 *       "url": "https://cdn.jsdelivr.net/gh/esaaraujo-lab/gdi_server@main/covers/hipopressivos.jpg"
 *     },
 *     {
 *       "id": "cardio",
 *       "keywords": ["cardio", "aerobico", "aerobico"],
 *       "url": "https://cdn.jsdelivr.net/gh/esaaraujo-lab/gdi_server@main/covers/cardio.jpg"
 *     }
 *   ]
 * }
 * ```
 * Formas aceites (todas produzem as mesmas entradas):
 *   - `{"images": [...]}` (forma sugerida) ou um JSONArray raiz `[...]`;
 *   - entrada com lista `keywords` OU string `name` (1 keyword) —
 *     sem nenhuma das duas, usa-se o `id` como keyword;
 *   - campo de imagem `url` OU `image`;
 *   - mapa plano `{"hipopressivos": "https://.../hipopressivos.jpg"}`
 *     (a chave vira a keyword e a URL é o valor).
 * Entradas sem URL ou sem keyword válida são ignoradas. O campo
 * `version` é ignorado (o parse não depende dele).
 *
 * RESOLUÇÃO ([resolve]):
 *   1. Normaliza cada nome candidato ([normalize]): minúsculas,
 *      sem acentos, sem pontuação, espaços colapsados
 *      ("Hipopressivos — Aula 03" → "hipopressivos aula 03").
 *   2. Tenta os candidatos NA ORDEM dada (o chamador passa do mais
 *      específico ao mais genérico: nome da aula, depois pasta,
 *      depois curso/drive ou o caminho completo).
 *   3. Uma keyword casa quando o nome normalizado A CONTÉM como
 *      substring ("musculacao pernas" contém "pernas").
 *   4. Ganha o match com a keyword MAIS LONGA; empate → o primeiro
 *      candidato, depois a primeira entrada do manifesto.
 *   5. Sem match → null (o chamador cai para a camada 4).
 *   Keywords com menos de 3 caracteres normalizados são ignoradas
 *   (uma keyword de 1–2 letras casaria com quase tudo).
 *
 * CACHE / REDE:
 *   - O manifesto é buscado em 2º plano ([warmUp], na abertura da
 *     home / detalhe / player) e NUNCA bloqueia a UI.
 *   - Cache em memória + persistido (SharedPreferences, TTL 24h).
 *   - Sem URL configurada, sem rede, ou fetch falhando → a camada 3
 *     é pulada EM SILÊNCIO (resolve devolve null) e a UI cai para
 *     a camada 4. Nunca trava a tela, nunca toast de erro por isso.
 *   - [resolve] é síncrono e só lê o cache (memória, ou o disco
 *     quando a memória está vazia); nunca faz rede na thread da UI.
 */
object CoverLibrary {

    /**
     * URL DO MANIFESTO DA BIBLIOTECA DE CAPAS (jsDelivr).
     *
     * TODO: ligar quando o Elton mandar a URL do manifesto no
     * jsDelivr — preencher esta constante e SÓ ela. Enquanto estiver
     * vazia, a camada 3 fica desligada e a hierarquia da capa é
     * (1) admin → (2) thumb → (4) arte gerada, como antes.
     */
    const val LIBRARY_MANIFEST_URL = ""

    /** TTL do cache do manifesto (memória + disco): 24h. */
    const val CACHE_TTL_MS = 24L * 60L * 60L * 1000L

    private const val PREFS_NAME = "cover_library"
    private const val KEY_MANIFEST_JSON = "manifest_json"
    private const val KEY_FETCHED_AT_MS = "fetched_at_ms"

    /** Keyword mínima (normalizada) para casar — evita falsos positivos. */
    private const val MIN_KEYWORD_LENGTH = 3

    data class LibraryImage(
        val id: String,
        val keywords: List<String>,
        val url: String
    )

    @Volatile
    private var cachedImages: List<LibraryImage>? = null

    @Volatile
    private var cachedAtMs: Long = 0L

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    // ─────────────────────────── normalização ───────────────────────────

    /**
     * Normaliza um nome para o casamento: minúsculas, sem acentos
     * (NFD + remoção de marcas), só [a-z0-9] e espaços, espaços
     * colapsados. "Bíceps e Tríceps" → "biceps e triceps".
     */
    fun normalize(text: String): String {
        val noAccents = Normalizer.normalize(text, Normalizer.Form.NFD)
            .replace(Regex("\\p{M}+"), "")
        return noAccents.lowercase(Locale.ROOT)
            .replace(Regex("[^a-z0-9]+"), " ")
            .trim()
            .replace(Regex("\\s+"), " ")
    }

    // ─────────────────────────── parse (tolerante) ───────────────────────────

    /** Parse tolerante do manifesto (ver o KDoc do objeto). Nunca lança. */
    fun parseManifest(json: String): List<LibraryImage> {
        return try {
            parseManifestUnchecked(json)
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun parseManifestUnchecked(json: String): List<LibraryImage> {
        val trimmed = json.trim()
        if (trimmed.isEmpty()) return emptyList()
        if (trimmed.startsWith("[")) {
            return parseEntries(JSONArray(trimmed))
        }
        val root = JSONObject(trimmed)
        val imagesArr = root.optJSONArray("images")
        if (imagesArr != null) return parseEntries(imagesArr)
        // Mapa plano {"keyword": "https://..."} — sem "images".
        val out = ArrayList<LibraryImage>()
        val keys = root.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            val value = root.optString(key, "")
            if (value.isBlank()) continue
            val keyword = normalize(key)
            if (keyword.length < MIN_KEYWORD_LENGTH) continue
            out.add(LibraryImage(id = key, keywords = listOf(keyword), url = value.trim()))
        }
        return out
    }

    private fun parseEntries(arr: JSONArray): List<LibraryImage> {
        val out = ArrayList<LibraryImage>()
        for (i in 0 until arr.length()) {
            val entry = arr.optJSONObject(i) ?: continue
            val url = entry.optString("url", "").takeIf { it.isNotBlank() }
                ?: entry.optString("image", "").takeIf { it.isNotBlank() }
                ?: continue
            val id = entry.optString("id", "")
            val keywords = ArrayList<String>()
            val kwArr = entry.optJSONArray("keywords")
            if (kwArr != null) {
                for (j in 0 until kwArr.length()) {
                    val kw = normalize(kwArr.optString(j, ""))
                    if (kw.length >= MIN_KEYWORD_LENGTH) keywords.add(kw)
                }
            }
            if (keywords.isEmpty()) {
                val name = normalize(entry.optString("name", ""))
                if (name.length >= MIN_KEYWORD_LENGTH) keywords.add(name)
            }
            if (keywords.isEmpty()) {
                val idKw = normalize(id)
                if (idKw.length >= MIN_KEYWORD_LENGTH) keywords.add(idKw)
            }
            if (keywords.isEmpty()) continue
            out.add(LibraryImage(id = id.ifBlank { keywords.first() }, keywords = keywords, url = url.trim()))
        }
        return out
    }

    // ─────────────────────────── resolução ───────────────────────────

    /**
     * Resolve a URL da imagem da biblioteca para os nomes dados, do
     * mais específico ao mais genérico (ex.: nome da aula, pasta,
     * curso/drive). Ganha a keyword mais longa; empate → primeiro
     * candidato, depois primeira entrada do manifesto. Null = sem
     * manifesto carregado, sem URL configurada ou sem match — o
     * chamador cai para a camada 4 em silêncio.
     */
    fun resolve(context: Context, vararg names: String?): String? {
        ensureLoadedFromDisk(context)
        val images = cachedImages ?: return null
        if (images.isEmpty()) return null
        var bestUrl: String? = null
        var bestLen = -1
        var bestCandidate = Int.MAX_VALUE
        var bestEntry = Int.MAX_VALUE
        names.forEachIndexed { candidateIdx, rawName ->
            val name = normalize(rawName ?: return@forEachIndexed)
            if (name.isEmpty()) return@forEachIndexed
            images.forEachIndexed { entryIdx, image ->
                for (keyword in image.keywords) {
                    if (keyword.isEmpty() || !name.contains(keyword)) continue
                    val len = keyword.length
                    if (len > bestLen ||
                        (len == bestLen && (candidateIdx < bestCandidate ||
                            (candidateIdx == bestCandidate && entryIdx < bestEntry)))
                    ) {
                        bestLen = len
                        bestCandidate = candidateIdx
                        bestEntry = entryIdx
                        bestUrl = image.url
                    }
                }
            }
        }
        return bestUrl
    }

    // ─────────────────────────── cache + fetch ───────────────────────────

    /** Carrega o manifesto persistido para a memória (se fresco). */
    private fun ensureLoadedFromDisk(context: Context) {
        if (cachedImages != null) return
        try {
            val prefs = context.applicationContext
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val fetchedAt = prefs.getLong(KEY_FETCHED_AT_MS, 0L)
            if (fetchedAt <= 0L ||
                System.currentTimeMillis() - fetchedAt > CACHE_TTL_MS
            ) return
            val json = prefs.getString(KEY_MANIFEST_JSON, null) ?: return
            val parsed = parseManifest(json)
            cachedImages = parsed
            cachedAtMs = fetchedAt
        } catch (_: Exception) {
            // Cache ilegível → camada 3 pulada em silêncio.
        }
    }

    /**
     * Busca o manifesto em 2º plano (se a URL estiver configurada e
     * o cache estiver vencido) e avisa [onLoaded] na thread principal
     * quando terminar — com ou sem sucesso. Nunca lança, nunca mostra
     * erro: sem URL / sem rede / fetch falhando, o cache (se houver)
     * continua valendo e a camada 3 é pulada em silêncio.
     */
    fun warmUp(context: Context, onLoaded: (() -> Unit)? = null) {
        val appContext = context.applicationContext
        scope.launch {
            fetchIfNeeded(appContext)
            if (onLoaded != null) {
                withContext(Dispatchers.Main) {
                    try {
                        onLoaded()
                    } catch (_: Exception) {
                    }
                }
            }
        }
    }

    /** Busca o manifesto (IO) quando necessário. Nunca lança. */
    suspend fun fetchIfNeeded(context: Context) {
        if (LIBRARY_MANIFEST_URL.isBlank()) return
        ensureLoadedFromDisk(context)
        if (cachedImages != null &&
            System.currentTimeMillis() - cachedAtMs <= CACHE_TTL_MS
        ) return
        try {
            val request = Request.Builder()
                .url(LIBRARY_MANIFEST_URL)
                .header("Accept", "application/json")
                .build()
            val body = BiBiGynApp.okHttpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return
                response.body?.string() ?: return
            }
            val parsed = parseManifest(body)
            cachedImages = parsed
            cachedAtMs = System.currentTimeMillis()
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_MANIFEST_JSON, body)
                .putLong(KEY_FETCHED_AT_MS, cachedAtMs)
                .apply()
        } catch (_: Exception) {
            // Sem rede / manifesto inválido → camada 3 pulada em silêncio.
        }
    }
}
