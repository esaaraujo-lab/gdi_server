package com.meggy.app.util

import android.content.Context
import android.os.Handler
import android.os.Looper
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.text.Normalizer
import java.util.Locale
import java.util.concurrent.TimeUnit

/**
 * v2.7.11 — CAMADA (3) DAS CAPAS: imagem da biblioteca por tipo de aula.
 *
 * Hierarquia da capa (em todo lugar onde ela já existe no app — hero,
 * rail "Continue assistindo", cards de drive, hero do detalhe, cards
 * de aula, capa de áudio, busca, Minha lista):
 *   (1) foto de capa do admin (`cover_url`);
 *   (2) thumb do Drive (thumbnail do arquivo);
 *   (3) ESTA CAMADA — imagem da biblioteca, resolvida pelo NOME da
 *       aula/pasta/curso (ex.: direito constitucional, hipopressivos,
 *       cardio, musculação, pernas, bíceps, tríceps);
 *   (4) arte padrão gerada (ThumbArt — capa do drive).
 * Nunca monograma como capa (a Minha lista ainda usa o monograma como
 * ÚLTIMO recurso, só quando nem a biblioteca tem match — ver
 * MyListAdapter; fora dela, o monograma não é mais usado).
 *
 * A biblioteca de imagens é gerada por OUTRA equipe (disciplinas de
 * concursos, fitness, grandes concursos, tiles de cursos) e servida
 * via jsDelivr, descrita por um manifesto JSON — ver
 * [LIBRARY_MANIFEST_URL] (único ponto de ligação) e o contrato em
 * [parseManifest]. O app NÃO gera imagens.
 *
 * Comportamento: o manifesto é buscado em 2º plano ([warmUp]), nunca
 * bloqueia a UI; guardado em cache (memória + SharedPreferences, TTL
 * 24 h). Sem rede ou fetch falhando (jsDelivr + raw), a camada (3) é
 * pulada EM SILÊNCIO (sem toast, sem travar a tela) e a cadeia cai
 * na (4). Com o manifesto carregado e SEM match p/ o nome, a camada
 * (3) devolve a imagem `geral` (fallback explícito do manifesto —
 * ver [resolve]); só SEM manifesto carregado o chamador cai na (4).
 * As telas re-aplicam as capas quando o manifesto chega
 * ([addOnReadyListener]).
 */
object LibraryCovers {

    /**
     * ÚNICO PONTO DE LIGAÇÃO — URL do manifesto da biblioteca de capas.
     *
     * LIGADO (onda final 2.7.11): manifesto v1 PUBLICADO e verificado —
     * 58 imagens em
     * https://cdn.jsdelivr.net/gh/esaaraujo-lab/gdi_server@main/staging/modular/meggy/covers/cover-manifest.json
     * (md5 d3280cb57cc79073734ce8c446d6009f, 14.950 bytes; cópia local de
     * referência em apk-redesign/covers/cover-manifest.json). Formato:
     * {"version": 1, "images": [{"id", "keywords": [...], "url"}]}.
     *
     * FALLBACK: logo após os commits o jsDelivr devolveu 403 transitório
     * ("Package size exceeded the configured limit of 50 MB") — por
     * isso [warmUp] tenta o raw.githubusercontent.com quando o
     * jsDelivr falha ([LIBRARY_MANIFEST_FALLBACK_URL]). As duas URLs
     * são lidas SÓ aqui, em [warmUp] (via [fetchManifestBody]).
     */
    const val LIBRARY_MANIFEST_URL =
        "https://cdn.jsdelivr.net/gh/esaaraujo-lab/gdi_server@main/staging/modular/meggy/covers/cover-manifest.json"

    /** Fallback do manifesto (mesmo conteúdo, sem CDN) — ver [LIBRARY_MANIFEST_URL]. */
    const val LIBRARY_MANIFEST_FALLBACK_URL =
        "https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/staging/modular/meggy/covers/cover-manifest.json"

    /**
     * Regra de resolução (contrato COVER_LIBRARY_NOTES.md §3): keywords
     * com menos de 3 caracteres são IGNORADAS — a keyword `pf` (2
     * letras) NÃO casa sozinha; o casamento de PF depende de
     * `policia federal` / `agente da policia federal` / `agente pf`.
     * (No manifesto v1 não há nenhuma keyword < 3 caracteres; a
     * guarda existe para as próximas versões do manifesto.)
     */
    private const val MIN_KEYWORD_LENGTH = 3

    /** Id da imagem de fallback da camada (3) — última do manifesto. */
    private const val FALLBACK_IMAGE_ID = "geral"

    /** TTL do cache do manifesto: 24 h (memória + SharedPreferences). */
    private const val CACHE_TTL_MS = 24L * 60L * 60L * 1000L
    private const val PREFS_NAME = "meggy_library_covers"
    private const val KEY_MANIFEST_JSON = "manifest_json"
    private const val KEY_FETCHED_AT_MS = "fetched_at_ms"

    /** Uma entrada da biblioteca: id + palavras-chave + URL da imagem. */
    data class LibraryImage(
        val id: String,
        val keywords: List<String>,
        val url: String
    ) {
        /** Keywords já normalizadas (ver [normalize]), para o match. */
        val normalizedKeywords: List<String> =
            keywords.map { normalize(it) }.filter { it.isNotEmpty() }
    }

    @Volatile
    private var manifest: List<LibraryImage> = emptyList()

    @Volatile
    private var loadedAtMs: Long = 0L

    @Volatile
    private var fetching: Boolean = false

    private val fetchScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val mainHandler = Handler(Looper.getMainLooper())
    private val listeners = mutableSetOf<() -> Unit>()

    // Cliente próprio (não o do MeggyApp): o jsDelivr responde com
    // redirect p/ a CDN e o cliente do app tem followRedirects=false
    // (precisa dele p/ capturar o 302 do login). Sem cookies/sessão.
    private val fetchClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .followRedirects(true)
            .followSslRedirects(true)
            .build()
    }

    /**
     * Normaliza um nome p/ o match: minúsculas, sem acentos, sem
     * pontuação, espaços colapsados. Ex.: "Direito Constitucional —
     * Aula 08" → "direito constitucional aula 08"; "Bíceps e Tríceps"
     * → "biceps e triceps". Função pura (o teste-espelho em Python
     * replica esta lógica exata).
     */
    fun normalize(text: String?): String {
        if (text.isNullOrBlank()) return ""
        val noAccents = Normalizer.normalize(text, Normalizer.Form.NFD)
            .replace(Regex("\\p{M}+"), "")
        return noAccents.lowercase(Locale.ROOT)
            .replace(Regex("[^a-z0-9]+"), " ")
            .trim()
            .replace(Regex("\\s+"), " ")
    }

    /**
     * CONTRATO DO MANIFESTO (formato PUBLICADO — v1, 58 entradas;
     * ver [LIBRARY_MANIFEST_URL]). O parse continua TOLERANTE a mais
     * de uma forma (compatibilidade com versões futuras do manifesto).
     *
     * Forma preferida:
     * ```
     * {
     *   "version": 1,
     *   "images": [
     *     {
     *       "id": "direito-constitucional",
     *       "keywords": ["direito constitucional", "constitucional"],
     *       "url": "https://cdn.jsdelivr.net/gh/.../direito-constitucional.jpg"
     *     }
     *   ]
     * }
     * ```
     *
     * Formas também aceitas (ver [parseManifest]):
     * - entrada com `name` (string única) no lugar de `keywords`
     *   (lista), e `keywords` como string única;
     * - campo `image` no lugar de `url`;
     * - um array puro `[{...}]` no topo, sem o objeto `{"images": ...}`;
     * - um mapa plano `{"direito constitucional": "https://..."}` (a
     *   chave vira a keyword; o id é a chave normalizada com `-`;
     *   a chave `version`, se houver, é ignorada).
     * Entradas sem URL http(s) ou sem keyword são descartadas; JSON
     * inválido devolve lista vazia (nunca exception p/ fora).
     */
    fun parseManifest(json: String): List<LibraryImage> {
        val out = ArrayList<LibraryImage>()
        val trimmed = json.trim()
        if (trimmed.isEmpty()) return out
        runCatching {
            when {
                trimmed.startsWith("[") -> parseImageArray(JSONArray(trimmed), out)
                trimmed.startsWith("{") -> {
                    val obj = JSONObject(trimmed)
                    val arr = obj.optJSONArray("images")
                    if (arr != null) {
                        parseImageArray(arr, out)
                    } else {
                        // Mapa plano {"direito constitucional": "https://..."}
                        val keys = obj.keys()
                        while (keys.hasNext()) {
                            val key = keys.next()
                            if (key == "version") continue
                            val url = obj.optString(key, "").trim()
                            if (key.isNotBlank() && isHttpUrl(url)) {
                                out.add(
                                    LibraryImage(
                                        id = normalize(key).replace(' ', '-'),
                                        keywords = listOf(key),
                                        url = url
                                    )
                                )
                            }
                        }
                    }
                }
            }
        }
        return out
    }

    private fun isHttpUrl(url: String): Boolean =
        url.startsWith("http://") || url.startsWith("https://")

    private fun parseImageArray(arr: JSONArray, out: MutableList<LibraryImage>) {
        for (i in 0 until arr.length()) {
            val entry = arr.optJSONObject(i) ?: continue
            parseImageEntry(entry)?.let { out.add(it) }
        }
    }

    private fun parseImageEntry(o: JSONObject): LibraryImage? {
        val url = o.optString("url", "").trim()
            .ifBlank { o.optString("image", "").trim() }
        if (!isHttpUrl(url)) return null
        val keywords = ArrayList<String>()
        val kwArr = o.optJSONArray("keywords")
        if (kwArr != null) {
            for (i in 0 until kwArr.length()) {
                kwArr.optString(i, "").trim().takeIf { it.isNotEmpty() }?.let { keywords.add(it) }
            }
        }
        if (keywords.isEmpty()) {
            // `keywords` como string única, ou `name`, ou o `id`.
            val single = o.optString("keywords", "").trim()
                .ifBlank { o.optString("name", "").trim() }
                .ifBlank {
                    o.optString("id", "").replace('-', ' ').replace('_', ' ').trim()
                }
            if (single.isNotEmpty()) keywords.add(single)
        }
        if (keywords.isEmpty()) return null
        val id = o.optString("id", "").trim()
            .ifBlank { normalize(keywords.first()).replace(' ', '-') }
        return LibraryImage(id = id, keywords = keywords, url = url)
    }

    /**
     * Resolução por nome (síncrona, só o manifesto em memória — nunca
     * rede, nunca bloqueia a UI).
     *
     * REGRA OFICIAL (COVER_LIBRARY_NOTES.md §3):
     *   1. os nomes candidatos são normalizados ([normalize]) e
     *      tentados JUNTOS (o chamador passa do mais específico ao
     *      mais genérico: nome da aula, depois pasta, depois
     *      curso/drive);
     *   2. vence a keyword MAIS LONGA considerando TODOS os nomes
     *      juntos — NÃO o primeiro nome com match (a ordem dos nomes
     *      NÃO decide; só o comprimento da keyword);
     *   3. empate resolve pela ORDEM DO MANIFESTO (entradas
     *      específicas primeiro) — a iteração é na ordem do manifesto
     *      e só uma keyword ESTRITAMENTE mais longa destrona a atual;
     *   4. keywords com menos de 3 caracteres são IGNORADAS
     *      ([MIN_KEYWORD_LENGTH]) — `pf` sozinho nunca casa;
     *   5. sem match nenhum, devolve a imagem `geral` (fallback
     *      explícito da camada (3) — [FALLBACK_IMAGE_ID]).
     *
     * Devolve null SÓ sem manifesto carregado (ou sem nenhum nome
     * válido e sem `geral` no manifesto): nesse caso o chamador cai
     * na capa gerada (4).
     */
    fun resolve(vararg names: String?): String? {
        val images = manifest
        if (images.isEmpty()) return null
        val normalized = names.map { normalize(it) }.filter { it.isNotEmpty() }
        if (normalized.isEmpty()) return fallbackUrl(images)
        var best: LibraryImage? = null
        var bestLen = 0
        // Iteração na ordem do manifesto: o `>` estrito faz o empate
        // ficar com a PRIMEIRA entrada do manifesto, e a keyword mais
        // longa entre TODOS os nomes vence (a ordem dos nomes não
        // decide — ver KDoc acima).
        for (image in images) {
            for (keyword in image.normalizedKeywords) {
                if (keyword.length < MIN_KEYWORD_LENGTH) continue
                if (keyword.length <= bestLen) continue
                if (normalized.any { it.contains(keyword) }) {
                    best = image
                    bestLen = keyword.length
                }
            }
        }
        return best?.url ?: fallbackUrl(images)
    }

    /**
     * Fallback explícito da camada (3): a imagem `geral` do manifesto
     * (última entrada; keyword `meggy`). Null se o manifesto não
     * trouxer a entrada `geral` — nesse caso o chamador cai na (4).
     */
    private fun fallbackUrl(images: List<LibraryImage>): String? =
        images.firstOrNull { it.id == FALLBACK_IMAGE_ID }?.url

    /**
     * Atalho da cadeia (2)+(3): thumb do Drive quando houver, senão a
     * imagem da biblioteca ([resolve]) pelos nomes. Null = sem (2)
     * nem (3): o chamador mostra a capa gerada (4).
     */
    fun remoteCover(thumbUrl: String?, vararg names: String?): String? {
        if (!thumbUrl.isNullOrBlank()) return thumbUrl
        return resolve(*names)
    }

    /**
     * Busca o manifesto em 2º plano (chamado na abertura da home e do
     * detalhe). Nunca bloqueia a UI, nunca toast, nunca exception p/
     * fora: sem rede ou fetch falhando (jsDelivr E raw — ver
     * [fetchManifestBody]), a camada (3) é pulada em silêncio. Cache: memória + SharedPreferences,
     * TTL 24 h (cache persistido ainda válido é usado sem rede).
     * Quando o fetch termina com sucesso, os listeners
     * ([addOnReadyListener]) são chamados na thread principal p/ a UI
     * re-aplicar as capas.
     */
    fun warmUp(context: Context) {
        val appContext = context.applicationContext
        if (LIBRARY_MANIFEST_URL.isBlank()) return
        if (manifest.isNotEmpty() &&
            System.currentTimeMillis() - loadedAtMs < CACHE_TTL_MS
        ) return
        synchronized(this) {
            if (fetching) return
            // Cache persistido ainda válido → usa sem rede.
            runCatching {
                val prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                val savedAt = prefs.getLong(KEY_FETCHED_AT_MS, 0L)
                val savedJson = prefs.getString(KEY_MANIFEST_JSON, null)
                if (savedJson != null &&
                    System.currentTimeMillis() - savedAt < CACHE_TTL_MS
                ) {
                    manifest = parseManifest(savedJson)
                    loadedAtMs = savedAt
                    return
                }
            }
            fetching = true
        }
        fetchScope.launch {
            var ok = false
            runCatching {
                // jsDelivr primeiro; se falhar (ex.: o 403 transitório
                // "Package size exceeded..." logo após os commits),
                // tenta o raw — ver [fetchManifestBody].
                val body = fetchManifestBody()
                if (body != null) {
                    val parsed = parseManifest(body)
                    manifest = parsed
                    loadedAtMs = System.currentTimeMillis()
                    appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                        .edit()
                        .putString(KEY_MANIFEST_JSON, body)
                        .putLong(KEY_FETCHED_AT_MS, loadedAtMs)
                        .apply()
                    ok = true
                }
            }
            synchronized(this@LibraryCovers) { fetching = false }
            if (ok) notifyReady()
        }
    }

    /**
     * Busca o manifesto: jsDelivr ([LIBRARY_MANIFEST_URL]) e, se ele
     * falhar (rede, HTTP não-2xx, corpo vazio ou JSON que não parseia
     * nenhuma entrada — ex. página de erro 403 do jsDelivr), o raw
     * ([LIBRARY_MANIFEST_FALLBACK_URL]). Devolve o corpo do PRIMEIRO
     * que responder com um manifesto válido, ou null se nenhum
     * responder. Nunca exception p/ fora; nunca toast.
     */
    private fun fetchManifestBody(): String? {
        for (url in listOf(LIBRARY_MANIFEST_URL, LIBRARY_MANIFEST_FALLBACK_URL)) {
            runCatching {
                val request = Request.Builder().url(url)
                    .header("Accept", "application/json").build()
                fetchClient.newCall(request).execute().use { response ->
                    val body = response.body?.string()
                    if (response.isSuccessful && !body.isNullOrBlank() &&
                        parseManifest(body).isNotEmpty()
                    ) return body
                }
            }
        }
        return null
    }

    private fun notifyReady() {
        val copy: List<() -> Unit> = synchronized(this) { listeners.toList() }
        if (copy.isEmpty()) return
        mainHandler.post { copy.forEach { runCatching { it() } } }
    }

    /** Chamado na thread principal quando um fetch termina com sucesso. */
    fun addOnReadyListener(listener: () -> Unit) {
        synchronized(this) { listeners.add(listener) }
    }

    fun removeOnReadyListener(listener: () -> Unit) {
        synchronized(this) { listeners.remove(listener) }
    }
}
