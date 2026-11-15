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
 * Sem match na (3) com manifesto carregado, cai na imagem 'geral'
 * (ainda camada 3). Sem manifesto (rede falhou nos dois hosts ou o
 * fetch nunca rodou), a (3) é pulada EM SILÊNCIO (nunca trava a tela,
 * nunca toast de erro por isso) e a cadeia cai na (4).
 *
 * ── CONTRATO DO MANIFESTO (formato esperado) ──
 *
 * O manifesto é um JSON servido no jsDelivr (v1, publicado e
 * verificado ao vivo 2026-11-14: 58 entradas, md5
 * d3280cb57cc79073734ce8c446d6009f, 14.950 bytes). O formato é:
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
 *   Keywords com menos de 3 caracteres são IGNORADAS (contrato §3:
 *   'pf' NÃO casa sozinho — o casamento de PF depende de 'policia
 *   federal' / 'agente da policia federal' / 'agente pf').
 *
 * ── RESOLUÇÃO POR NOME ──
 *
 * 1. Normalização: minúsculas, sem acentos (NFD + remoção de marcas
 *    combinantes: "Musculação" -> "musculacao", "Bíceps" -> "biceps"),
 *    sem pontuação (qualquer sequência de não [a-z0-9] vira um espaço:
 *    "Hipopressivos — Aula 03" -> "hipopressivos aula 03"), espaços
 *    colapsados, sem espaços nas pontas.
 * 2. Casamento em TODOS os nomes juntos (contrato
 *    COVER_LIBRARY_NOTES.md §3): o chamador passa os nomes (aula,
 *    pasta, curso/drive) e o resolver considera TODOS — vence a
 *    keyword MAIS LONGA entre todos eles, seja qual for o nome onde
 *    ela casou. Empate -> a PRIMEIRA entrada do manifesto (ordem do
 *    arquivo; as específicas vêm primeiro). Ex.: aula "Cardio" numa
 *    pasta "Musculação" casa "musculacao" (10) e não "cardio" (6).
 * 3. Uma keyword casa quando aparece como substring do nome
 *    normalizado ("cardio" casa "cardio hiit aula 01"). Keywords com
 *    menos de 3 caracteres são IGNORADAS ('pf' NÃO casa sozinho — o
 *    casamento de PF depende de 'policia federal' / 'agente da policia
 *    federal' / 'agente pf', já nas keywords de 'pf').
 * 4. Sem match em nenhum nome (manifesto carregado) -> a imagem
 *    'geral' (última do manifesto, keyword 'meggy') — fallback
 *    explícito da camada 3. Sem manifesto carregado, devolve null e
 *    o chamador cai na camada (4) arte padrão.
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
 * ── LIGAÇÃO (2026-11-14, onda final) ──
 *
 * LIGADO: [LIBRARY_MANIFEST_URL] tem a URL do manifesto publicado
 * (v1, 58 imagens, md5 d3280cb57cc79073734ce8c446d6009f) e
 * [LIBRARY_MANIFEST_URL_RAW] é o fallback (raw.githubusercontent.com)
 * usado quando o jsDelivr falha (403 transitório "Package size
 * exceeded the configured limit of 50 MB" logo após commits — ver
 * COVER_LIBRARY_NOTES.md §6). Todos os pontos de capa do app já
 * chamam [resolve] / [loadCoverChain]; nada mais precisa mudar.
 */
object CoverLibrary {

    /**
     * ÚNICO PONTO DE LIGAÇÃO — URL do manifesto da biblioteca no jsDelivr.
     * LIGADO 2026-11-14 (onda final): manifesto v1 publicado e verificado
     * ao vivo (58 imagens, md5 d3280cb57cc79073734ce8c446d6009f, 14.950
     * bytes). NÃO colocar nenhuma outra URL aqui (não é BASE_URL nem
     * endpoint de IA).
     */
    const val LIBRARY_MANIFEST_URL = "https://cdn.jsdelivr.net/gh/esaaraujo-lab/gdi_server@main/staging/modular/meggy/covers/cover-manifest.json"

    /**
     * Fallback do manifesto (mesmo conteúdo, sem CDN): tentado quando o
     * fetch no jsDelivr falha (sem rede, HTTP != 200 ou JSON inválido —
     * ex.: o 403 transitório "Package size exceeded the configured limit
     * of 50 MB" logo após commits, ver COVER_LIBRARY_NOTES.md §6).
     * O raw serve o mesmo arquivo desde o início.
     */
    const val LIBRARY_MANIFEST_URL_RAW = "https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/staging/modular/meggy/covers/cover-manifest.json"

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
                    val kw = normalize(key).takeIf { it.length >= 3 } ?: continue
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
                    normalize(kwArr.optString(j)).takeIf { it.length >= 3 }?.let { keywords.add(it) }
                }
            }
            if (keywords.isEmpty()) {
                normalize(o.optString("name")).takeIf { it.length >= 3 }?.let { keywords.add(it) }
            }
            if (keywords.isEmpty()) {
                normalize(o.optString("id")).takeIf { it.length >= 3 }?.let { keywords.add(it) }
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
     * Busca o manifesto (jsDelivr primeiro; se falhar, o raw) e devolve
     * o corpo JSON quando parseia em ao menos 1 entrada. Null quando os
     * dois hosts falham (sem rede, HTTP != 200, JSON inválido/vazio).
     * Sem exceção: qualquer falha numa URL cai para a próxima.
     */
    private fun fetchManifestText(): String? {
        for (url in listOf(LIBRARY_MANIFEST_URL, LIBRARY_MANIFEST_URL_RAW)) {
            try {
                val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 10_000
                    readTimeout = 15_000
                    instanceFollowRedirects = true
                }
                try {
                    if (conn.responseCode != HttpURLConnection.HTTP_OK) continue
                    val body = conn.inputStream.bufferedReader().use { it.readText() }
                    if (parseManifest(body).isNotEmpty()) return body
                } finally {
                    conn.disconnect()
                }
            } catch (_: Exception) {
                // Próxima URL (raw) — falha silenciosa por host.
            }
        }
        return null
    }

    /**
     * Busca o manifesto em 2º plano (nunca bloqueia a UI) e atualiza o
     * cache. Idempotente: sem URL configurada, com cache fresco (< 24h)
     * ou com um fetch já em andamento, não faz nada. Qualquer falha
     * (sem rede, HTTP != 200 nos dois hosts, JSON inválido) é engolida
     * em silêncio — a camada 3 simplesmente não é usada até a próxima
     * tentativa. Chamado na abertura do app (VovoFitApp) e na abertura
     * da home.
     */
    fun refreshAsync(context: Context) {
        if (LIBRARY_MANIFEST_URL.isBlank()) return
        ensureLoaded(context)
        if (isFresh(context) || fetching) return
        fetching = true
        val appContext = context.applicationContext
        fetchScope.launch {
            try {
                val body = fetchManifestText() ?: return@launch
                val parsed = parseManifest(body)
                if (parsed.isEmpty()) return@launch
                cached = parsed
                persist(appContext, body)
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
     * Resolve a imagem da biblioteca p/ os nomes dados (aula, pasta,
     * curso/drive — contrato COVER_LIBRARY_NOTES.md §3, regra 1.0.12):
     * candidatos do MAIS ESPECIFICO ao mais generico — primeiro o nome
     * do item; depois cada caminho, segmento a segmento, do mais
     * profundo ao mais raso. Dentro de UM candidato vence a keyword
     * MAIS LONGA; o PRIMEIRO candidato com match decide; empate dentro
     * do candidato -> a PRIMEIRA entrada do manifesto. Sem match com o
     * manifesto carregado -> a imagem 'geral' (fallback explícito da
     * camada 3). Sem manifesto carregado ou sem nomes -> null (o
     * chamador cai na camada 4).
     */
    fun resolve(context: Context, vararg names: String?): String? =
        resolveInternal(context, names, allowGeneral = true)

    /**
     * Resolve ESTRITO (1.0.11, banners dos drives): igual a [resolve],
     * mas SEM o fallback 'geral'. Sem match, devolve null e o chamador
     * cai na camada (4) — a capa local do drive. Usar em superfícies
     * por drive/curso (tile de drive, hero, detalhe do curso): o livro
     * 'geral' não é banner de nenhum curso — Queima Diária e os outros
     * drives Vovó não casam nenhuma keyword (Elton 2026-11-14 22:21).
     */
    fun resolveStrict(context: Context, vararg names: String?): String? =
        resolveInternal(context, names, allowGeneral = false)

    /**
     * Ronda 10 Frente C — imagem 'geral' do manifesto (a sub-capa
     * GENÉRICA do drive do admin — ver AdminDriveUi.generalCoverUrl).
     * Ao contrário de resolve(context) sem nomes (que devolve null —
     * o resolveInternal sai cedo sem candidatos), esta lê a entrada
     * 'geral' directamente. Null sem manifesto carregado ou sem
     * entrada 'geral' no manifesto.
     */
    fun generalCoverUrl(context: Context): String? {
        ensureLoaded(context)
        return cached?.firstOrNull { it.id == "geral" }?.url
    }

    private fun resolveInternal(
        context: Context,
        names: Array<out String?>,
        allowGeneral: Boolean
    ): String? {
        // Ronda 10 Frente C — capa de sub-pasta do drive do admin
        // (AdminDriveUi.subfolderCoverFor): POR CIMA da resolução por
        // biblioteca; sem entrada no mapa, null e o fluxo segue igual.
        AdminDriveUi.subfolderCoverFor(*names)?.let { return it }
        ensureLoaded(context)
        val entries = cached ?: return null
        if (entries.isEmpty()) return null
        // 1.0.12 — candidatos do mais específico ao mais genérico: o
        // nome primeiro; cada caminho vira os seus segmentos do mais
        // profundo ao mais raso (ver o KDoc de [resolve]).
        val candidates = ArrayList<String>()
        for (raw in names) {
            if (raw.isNullOrBlank()) continue
            for (seg in raw.split('/').asReversed()) {
                val n = normalize(seg)
                if (n.isNotBlank()) candidates.add(n)
            }
        }
        if (candidates.isEmpty()) return null
        for (candidate in candidates) {
            var bestUrl: String? = null
            var bestLen = -1
            for (entry in entries) {
                for (kw in entry.keywords) {
                    if (kw.length < 3) continue
                    if (kw.length <= bestLen) continue
                    if (candidate.contains(kw)) {
                        bestLen = kw.length
                        bestUrl = entry.url
                    }
                }
            }
            if (bestUrl != null) return bestUrl
        }
        // Fallback explícito da camada 3: manifesto carregado e nenhum
        // match -> imagem 'geral' (última do manifesto, keyword 'meggy').
        // Estrito (resolveStrict): sem 'geral' — cai na camada 4.
        if (!allowGeneral) return null
        return entries.firstOrNull { it.id == "geral" }?.url
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
 * `names` na ordem aula -> pasta -> curso/drive (ver [CoverLibrary.resolve]:
 * o primeiro candidato com match decide (regra 1.0.12); sem match, 'geral'
 * (só quando strict=false — o default agora é strict=true).
 * `placeholderRes` é opcional (só o hero o usa, como antes).
 * `strict` (1.0.12): camada (3) sem o fallback 'geral' — AGORA O DEFAULT
 * em todas as superfícies (o livro não é a imagem de nenhum curso/pasta).
 */
fun ImageView.loadCoverChain(
    remoteUrl: String?,
    fallbackRes: Int,
    vararg names: String?,
    placeholderRes: Int? = null,
    strict: Boolean = true
) {
    // 1.0.12 — strict=true por default: camada (3) sem o fallback 'geral'
    // (o livro não é imagem de nenhum curso/pasta); sem match, cai na (4).
    val libUrl = if (strict) CoverLibrary.resolveStrict(context, *names)
        else CoverLibrary.resolve(context, *names)
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
