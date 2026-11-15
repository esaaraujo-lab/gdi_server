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
 * │ PONTO ÚNICO DE LIGAÇÃO — URL DO MANIFESTO (LIGADA 2.1.9)      │
 * │ [LIBRARY_MANIFEST_URL] abaixo: manifesto v1, 58 imagens,      │
 * │ publicado e verificado no jsDelivr (md5                         │
 * │ d3280cb57cc79073734ce8c446d6009f, 14.950 bytes). Fallback:       │
 * │ [LIBRARY_MANIFEST_RAW_URL] (raw.githubusercontent.com, mesmo   │
 * │ conteúdo) — o jsDelivr já devolveu 403 transitório ("Package   │
 * │ size exceeded the configured limit of 50 MB") logo após o      │
 * │ lote de commits; ver COVER_LIBRARY_NOTES.md §6.               │
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
 *       "url": "https://cdn.jsdelivr.net/gh/esaaraujo-lab/gdi_server@main/staging/modular/meggy/covers/hipopressivos.jpg"
 *     },
 *     {
 *       "id": "cardio",
 *       "keywords": ["cardio", "aerobico", "hiit"],
 *       "url": "https://cdn.jsdelivr.net/gh/esaaraujo-lab/gdi_server@main/staging/modular/meggy/covers/cardio.jpg"
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
 *   2. Tenta TODOS os candidatos juntos (o chamador passa do mais
 *      específico ao mais genérico: nome da aula, depois pasta,
 *      depois curso/drive ou o caminho completo).
 *   3. Uma keyword casa quando o nome normalizado A CONTÉM como
 *      substring ("musculacao pernas" contém "pernas").
 *   4. Ganha o match com a keyword MAIS LONGA, considerando TODOS
 *      os nomes candidatos juntos; empate → a PRIMEIRA entrada do
 *      manifesto (entradas específicas primeiro — regra oficial
 *      COVER_LIBRARY_NOTES.md §3). A ordem dos candidatos NÃO
 *      desempata: só serve para juntar os nomes a casar.
 *   5. Sem match e com o manifesto carregado → a imagem 'geral'
 *      (última do manifesto, keyword 'meggy'): fallback EXPLÍCITO
 *      da camada 3. Sem manifesto carregado → null (o chamador cai
 *      para a camada 4, arte padrão).
 *   Keywords com menos de 3 caracteres normalizados são ignoradas
 *   (uma keyword de 1–2 letras casaria com quase tudo): a keyword
 *   'pf' (2 letras) NÃO casa sozinha — PF casa por 'policia
 *   federal' / 'agente da policia federal' / 'agente pf'.
 *
 * CACHE / REDE:
 *   - O manifesto é buscado em 2º plano ([warmUp], na abertura da
 *     home / detalhe / player) e NUNCA bloqueia a UI.
 *   - Cache em memória + persistido (SharedPreferences, TTL 24h).
 *   - Sem URL configurada, sem rede, ou fetch falhando nas DUAS
 *     URLs (jsDelivr e raw) → a camada 3 é pulada EM SILÊNCIO
 *     (resolve devolve null) e a UI cai para a camada 4. Nunca
 *     trava a tela, nunca toast de erro por isso.
 *   - [resolve] é síncrono e só lê o cache (memória, ou o disco
 *     quando a memória está vazia); nunca faz rede na thread da UI.
 */
object CoverLibrary {

    /**
     * URL DO MANIFESTO DA BIBLIOTECA DE CAPAS (jsDelivr) — LIGADA
     * na onda final 2.1.9. Manifesto v1, 58 imagens, publicado em
     * gdi_server@main/staging/modular/meggy/covers/ e verificado
     * (md5 d3280cb57cc79073734ce8c446d6009f, 14.950 bytes).
     */
    const val LIBRARY_MANIFEST_URL =
        "https://cdn.jsdelivr.net/gh/esaaraujo-lab/gdi_server@main/staging/modular/meggy/covers/cover-manifest.json"

    /**
     * Fallback do manifesto (raw.githubusercontent.com, mesmo
     * conteúdo, sem CDN). O jsDelivr já devolveu 403 transitório
     * ("Package size exceeded the configured limit of 50 MB") logo
     * após o lote de commits da biblioteca — ver
     * COVER_LIBRARY_NOTES.md §6. [fetchManifestBody] tenta a CDN
     * primeiro e o raw em seguida; o raw é fallback imediato.
     */
    const val LIBRARY_MANIFEST_RAW_URL =
        "https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/staging/modular/meggy/covers/cover-manifest.json"

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
     * curso/drive). Ganha a keyword mais longa, considerando TODOS
     * os candidatos juntos; empate → primeira entrada do manifesto.
     * Com o manifesto carregado e sem match, devolve a imagem
     * 'geral' (fallback explícito da camada 3). Null = sem manifesto
     * carregado, sem URL configurada, ou manifesto sem 'geral' — o
     * chamador cai para a camada 4 em silêncio.
     */
    fun resolve(context: Context, vararg names: String?): String? =
        resolveInternal(context, names, allowGeneral = true)

    /**
     * Resolve ESTRITO (2.1.11, banners dos drives): igual a [resolve],
     * mas SEM o fallback 'geral'. Sem match, devolve null e o chamador
     * cai na camada (4) — a capa local do drive. Usar em superfícies
     * por drive/curso (tile de drive, hero, detalhe do curso): o livro
     * 'geral' não é banner de nenhum curso — o Clube Fit mostrava o
     * livro porque nenhuma keyword casava com "clube fit" /
     * "treinos saude" / "/6:/" (Elton 2026-11-14 22:21).
     */
    fun resolveStrict(context: Context, vararg names: String?): String? =
        resolveInternal(context, names, allowGeneral = false)

    private fun resolveInternal(
        context: Context,
        names: Array<out String?>,
        allowGeneral: Boolean
    ): String? {
        ensureLoadedFromDisk(context)
        val images = cachedImages ?: return null
        if (images.isEmpty()) return null
        var bestUrl: String? = null
        var bestLen = -1
        var bestEntry = Int.MAX_VALUE
        names.forEach { rawName ->
            val name = normalize(rawName ?: return@forEach)
            if (name.isEmpty()) return@forEach
            images.forEachIndexed { entryIdx, image ->
                for (keyword in image.keywords) {
                    if (keyword.isEmpty() || !name.contains(keyword)) continue
                    val len = keyword.length
                    if (len > bestLen ||
                        (len == bestLen && entryIdx < bestEntry)
                    ) {
                        bestLen = len
                        bestEntry = entryIdx
                        bestUrl = image.url
                    }
                }
            }
        }
        if (bestUrl != null) return bestUrl
        // Fallback explícito da camada 3 (regra oficial §3): manifesto
        // carregado e nenhum match → imagem 'geral' (última do
        // manifesto, id "geral"). Sem entrada 'geral', null (camada 4).
        // Estrito (resolveStrict): sem 'geral' — cai na camada 4.
        if (!allowGeneral) return null
        return images.firstOrNull { it.id == "geral" }?.url
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
     * Busca o manifesto em 2º plano (se uma URL estiver configurada e
     * o cache estiver vencido — jsDelivr, com fallback para o raw) e
     * avisa [onLoaded] na thread principal
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

    /**
     * Busca o corpo do manifesto (IO): tenta a CDN (jsDelivr) e, em
     * falha (HTTP não-2xx, corpo vazio ou exceção — ex. o 403
     * transitório de limite de pacote), tenta o raw. Devolve null se
     * as duas falharem. Nunca lança.
     */
    private fun fetchManifestBody(): String? {
        val urls = listOf(LIBRARY_MANIFEST_URL, LIBRARY_MANIFEST_RAW_URL)
        for (url in urls) {
            if (url.isBlank()) continue
            try {
                val request = Request.Builder()
                    .url(url)
                    .header("Accept", "application/json")
                    .build()
                val body = BiBiGynApp.okHttpClient.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) return@use null
                    response.body?.string()
                } ?: continue
                if (body.isBlank()) continue
                return body
            } catch (_: Exception) {
                // Próxima URL (ou desiste em silêncio, sem travar a UI).
            }
        }
        return null
    }

    /** Busca o manifesto (IO) quando necessário. Nunca lança. */
    suspend fun fetchIfNeeded(context: Context) {
        if (LIBRARY_MANIFEST_URL.isBlank() && LIBRARY_MANIFEST_RAW_URL.isBlank()) return
        ensureLoadedFromDisk(context)
        if (cachedImages != null &&
            System.currentTimeMillis() - cachedAtMs <= CACHE_TTL_MS
        ) return
        try {
            val body = fetchManifestBody() ?: return
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
