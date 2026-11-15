package com.vovofit.app.data

import android.graphics.Color

import com.vovofit.app.R
import org.json.JSONArray
import org.json.JSONObject

/**
 * Data models for the VOVÓ FIT app.
 *
 * The backend JSON shapes are decoded into these simple Kotlin data classes so that
 * the UI layer never touches raw JSON. All parsers are null-safe and tolerate
 * missing fields (the worker.js API does not always populate every key).
 */

// ──────────────────────────── Drives ────────────────────────────

/**
 * One of the 4 hardcoded root drives shown on the home screen.
 */
/**
 * v1.0.4 — `tagline` é a linha de metadados do card do drive na home
 * (texto curado, descritivo — NUNCA contagens inventadas: o app não
 * lista o conteúdo do drive sem abrir). `isConcurso` marca os drives
 * de concurso, usados pelo filtro "Concursos" da busca e pela aba
 * "Concursos" da Minha lista.
 */
data class DriveItem(
    val index: Int,
    val name: String,
    val rootFolderId: String?,
    val icon: String = "📁",
    val tagline: String = "",
    val isConcurso: Boolean = false
) {
    companion object {
        val ALL: List<DriveItem> = listOf(
            DriveItem(12, "QUEIMA DIÁRIA",    null, "🔥", "Treinos intensos"),
            DriveItem(13, "TODO DIA",         null, "📅", "Rotinas diárias"),
            DriveItem(14, "CLUBE DE CASA",    null, "🏠", "Treinos em casa"),
            DriveItem(15, "SAÚDE E FITNESS",  null, "❤️", "Bem-estar total")
        )
    }
}

// ──────────────────────────── Files / Folders ────────────────────────────

/**
 * A file or folder returned by POST /<driveIdx>:/.
 */
data class FileItem(
    val name: String,
    val mimeType: String,
    val id: String,
    val driveId: String?,
    val link: String?,
    val size: Long,
    val modifiedTime: String?,
    val folderLabel: String? = null,
    val folderPath: String? = null,
    val thumbnailLink: String? = null  // v2.1.0: Google Drive thumbnail URL
) {
    val isFolder: Boolean get() = mimeType == "application/vnd.google-apps.folder"
    val isAudio: Boolean
        get() = mimeType.startsWith("audio/") || name.endsWith(".mp3", true) || name.endsWith(".m4a", true) || name.endsWith(".aac", true) || name.endsWith(".ogg", true) || name.endsWith(".wav", true) || name.endsWith(".flac", true)

    val isVideo: Boolean
        get() = mimeType.startsWith("video/") ||
                name.endsWith(".mp4", true) ||
                name.endsWith(".mkv", true) ||
                name.endsWith(".webm", true) ||
                name.endsWith(".mov", true) ||
                name.endsWith(".avi", true)
    val isPdf: Boolean get() = mimeType == "application/pdf" || name.endsWith(".pdf", true)

    /** v1.0.4: Markdown (.md/.markdown) — abre no leitor de MD embutido. */
    val isMarkdown: Boolean
        get() = name.endsWith(".md", true) || name.endsWith(".markdown", true) ||
            name.endsWith(".txt", true)

    /** v1.0.4: arquivo de legenda (.vtt/.srt) — sidecar da aula. */
    val isSubtitle: Boolean
        get() = name.endsWith(".vtt", true) || name.endsWith(".srt", true)

    /** v1.0.4: transcrição da aula (pasta/arquivo "Transcrição"/"transcript"). */
    val isTranscript: Boolean
        get() = name.contains("transcri", true) || name.contains("transcript", true)

    /** Human-readable file size, e.g. "1.4 GB". */
    val humanSize: String
        get() {
            if (size <= 0) return "—"
            val units = arrayOf("B", "KB", "MB", "GB", "TB")
            var v = size.toDouble()
            var u = 0
            while (v >= 1024.0 && u < units.lastIndex) { v /= 1024.0; u++ }
            return if (u == 0) "${size} B" else String.format("%.1f %s", v, units[u])
        }

    companion object {
        fun fromJson(o: JSONObject): FileItem {
            val sizeStr = o.optString("size", "0")
            val sizeLong = sizeStr.toLongOrNull() ?: 0L
            // v2.1.0: parse thumbnailLink from Google Drive API response.
            // The worker.js passes it through if present. We also try to
            // construct it from the file ID as a fallback.
            val rawThumb = if (o.has("thumbnailLink") && !o.isNull("thumbnailLink"))
                o.getString("thumbnailLink") else null
            val fileId = o.optString("id", "")
            val thumb = when {
                !rawThumb.isNullOrBlank() -> enlargeThumbnail(rawThumb)
                fileId.isNotBlank() -> "https://drive.google.com/thumbnail?id=$fileId&sz=w400"
                else -> null
            }
            return FileItem(
                name = o.optString("name", "(sem nome)"),
                mimeType = o.optString("mimeType", "application/octet-stream"),
                id = fileId,
                driveId = if (o.has("driveId")) o.getString("driveId") else null,
                link = if (o.has("link") && !o.isNull("link")) o.getString("link") else null,
                size = sizeLong,
                modifiedTime = if (o.has("modifiedTime") && !o.isNull("modifiedTime")) o.getString("modifiedTime") else null,
                // ★ v1.0.2: toJson() grava folderPath/folderLabel (usado pelos
                // favoritos) — o fromJson antigo os descartava, então um item
                // favoritado perdia a pasta de origem ao reiniciar o app.
                folderLabel = if (o.has("folderLabel") && !o.isNull("folderLabel")) o.getString("folderLabel") else null,
                folderPath = if (o.has("folderPath") && !o.isNull("folderPath")) o.getString("folderPath") else null,
                thumbnailLink = thumb
            )
        }

        /**
         * v2.1.0 — Google Drive returns thumbnail URLs with a default size
         * parameter (e.g. `sz=s200`). We enlarge it to w400 for sharper
         * tiles on high-DPI screens.
         */
        private fun enlargeThumbnail(url: String): String {
            return try {
                // Replace sz=NNN with sz=w400 (width 400px)
                if (url.contains("sz=")) {
                    url.replace(Regex("sz=[^&]+"), "sz=w400")
                } else if (url.contains("=s")) {
                    // Format: =s200 → =w400
                    url.replace(Regex("=s[0-9]+"), "=w400")
                } else {
                    url
                }
            } catch (_: Exception) { url }
        }

        /** v2.0.0: serializes a FileItem back to JSON for SharedPreferences storage. */
        fun toJson(item: FileItem): JSONObject {
            val o = JSONObject()
            o.put("name", item.name)
            o.put("mimeType", item.mimeType)
            o.put("id", item.id)
            o.put("driveId", item.driveId ?: JSONObject.NULL)
            o.put("link", item.link ?: JSONObject.NULL)
            o.put("size", item.size)
            o.put("modifiedTime", item.modifiedTime ?: JSONObject.NULL)
            item.folderLabel?.let { o.put("folderLabel", it) }
            item.folderPath?.let { o.put("folderPath", it) }
            item.thumbnailLink?.let { o.put("thumbnailLink", it) }
            return o
        }

        fun parseList(arr: JSONArray?): List<FileItem> {
            if (arr == null) return emptyList()
            val out = ArrayList<FileItem>(arr.length())
            for (i in 0 until arr.length()) out.add(fromJson(arr.getJSONObject(i)))
            return out
        }
    }
}

// ──────────────────────────── Folder listing response ────────────────────────────

data class FolderListing(
    val files: List<FileItem>,
    val nextPageToken: String?,
    val currentPageIndex: Int
) {
    companion object {
        fun parse(json: String): FolderListing {
            val root = JSONObject(json)
            val data = root.optJSONObject("data")
            val files = if (data != null) FileItem.parseList(data.optJSONArray("files")) else emptyList()
            val npt = if (root.has("nextPageToken") && !root.isNull("nextPageToken"))
                root.getString("nextPageToken") else null
            val idx = root.optInt("curPageIndex", 0)
            return FolderListing(files, npt, idx)
        }
    }
}

// ──────────────────────────── Login ────────────────────────────

sealed class LoginResult {
    data class Success(val sessionCookie: String, val username: String) : LoginResult()
    data class Failure(val reason: String) : LoginResult()
}

// ──────────────────────────── v2.0.0: Hero rotation ────────────────────────────

/**
 * One hero banner entry — a curated "destaque" course from any drive.
 * Rotated by HomeActivity.HeroRotator every 8s with crossfade.
 */
data class HeroItem(
    val title: String,
    val subtitle: String,
    val badge: String,            // e.g. "🐕 DESTAQUE DA SEMANA"
    val drivePath: String,        // BrowseActivity drivePath
    val driveName: String,        // displayed in browse
    val icon: String,             // emoji shown in hero corner
    val colorHint: String? = null // optional colorFromString hint
) {
    /** v1.0.8 — arte do hero = capa do drive do destaque. */
    val coverRes: Int get() = driveCoverRes(driveIndexFromPath(drivePath) ?: 15)
    companion object {
        /**
         * VOVÓ FIT — 4 destaques, um por drive (Queima Diária, Todo Dia,
         * Clube de Casa, Saúde e Fitness). Cada hero rota a cada 8s com
         * crossfade e leva o usuário direto ao drive correspondente.
         */
        val ALL: List<HeroItem> = listOf(
            HeroItem(
                title = "Queima Diária — Treinos Intensos",
                subtitle = "High-intensity workouts que aceleram seu metabolismo.",
                badge = "DESTAQUE DA SEMANA",
                drivePath = "/12:/",
                driveName = "QUEIMA DIÁRIA",
                icon = "🔥"
            ),
            HeroItem(
                title = "Todo Dia — Movimento Constante",
                subtitle = "Rotinas diárias para manter o corpo ativo.",
                badge = "EM ALTA",
                drivePath = "/13:/",
                driveName = "TODO DIA",
                icon = "📅"
            ),
            HeroItem(
                title = "Clube de Casa — Fitness em Casa",
                subtitle = "Treinos completos sem sair de casa.",
                badge = "NOVIDADE",
                drivePath = "/14:/",
                driveName = "CLUBE DE CASA",
                icon = "🏠"
            ),
            HeroItem(
                title = "Saúde e Fitness — Bem-estar Total",
                subtitle = "Cuidado completo do corpo e da mente.",
                badge = "RECOMENDADO",
                drivePath = "/15:/",
                driveName = "SAÚDE E FITNESS",
                icon = "❤️"
            )
        )
    }
}

// ──────────────────────────── Ronda 10 Frente B: drives do admin ────────────────────────────

/**
 * Um drive adicionado pelo admin (D1 admin_drives — dependência do
 * servidor v2.15.x, AINDA NÃO EXISTE; ver ApiService.getAdminDrives).
 * GET /api/admin-drives → {ok, drives:[{id, driveId, name,
 * targetApps:["meggy"|"bibi"|"vovo"], coverUrl, subCoverUrl,
 * subfolderCovers:{path: url}}]}.
 *
 * Parse defensivo (mesmo padrão de FeaturedCourse.fromJson): aceita
 * snake_case e camelCase, campos ausentes → null/vazio, valores de
 * targetApps fora do vocabulário são descartados. "Capa" = imagem do
 * tile na Home; "sub-capa" = hero do detalhe (a Frente C usa estes
 * campos; esta frente só os guarda e os mostra no formulário).
 */
data class AdminDrive(
    val id: Long,
    val driveId: String,
    val name: String,
    val targetApps: List<String>,
    val coverUrl: String?,
    val subCoverUrl: String?,
    val subfolderCovers: Map<String, String>
) {
    companion object {
        const val TARGET_MEGGY = "meggy"
        const val TARGET_BIBI = "bibi"
        const val TARGET_VOVO = "vovo"
        val ALL_TARGETS = listOf(TARGET_MEGGY, TARGET_BIBI, TARGET_VOVO)

        /** APK de destino correspondente ao package do app que está a correr. */
        fun targetForPackage(packageName: String): String = when (packageName) {
            "com.meggy.app" -> TARGET_MEGGY
            "com.bibigyn.app" -> TARGET_BIBI
            "com.vovofit.app" -> TARGET_VOVO
            else -> TARGET_MEGGY
        }

        fun fromJson(o: JSONObject): AdminDrive {
            val targets = ArrayList<String>()
            val arr = if (o.has("targetApps")) o.optJSONArray("targetApps")
                else o.optJSONArray("target_apps")
            if (arr != null) {
                for (i in 0 until arr.length()) {
                    val t = arr.optString(i, "").trim().lowercase()
                    if (t in ALL_TARGETS && t !in targets) targets.add(t)
                }
            }
            val covers = LinkedHashMap<String, String>()
            val coversObj = if (o.has("subfolderCovers")) o.optJSONObject("subfolderCovers")
                else o.optJSONObject("subfolder_covers")
            if (coversObj != null) {
                val keys = coversObj.keys()
                while (keys.hasNext()) {
                    val path = keys.next()
                    val url = coversObj.optString(path, "").trim()
                    if (path.isNotBlank() && url.isNotBlank()) covers[path] = url
                }
            }
            val cover = o.optString("coverUrl", "").takeIf { it.isNotBlank() }
                ?: o.optString("cover_url", "").takeIf { it.isNotBlank() }
            val subCover = o.optString("subCoverUrl", "").takeIf { it.isNotBlank() }
                ?: o.optString("sub_cover_url", "").takeIf { it.isNotBlank() }
            val driveId = o.optString("driveId", o.optString("drive_id", ""))
            return AdminDrive(
                id = o.optLong("id", 0L),
                driveId = driveId,
                name = o.optString("name", "").takeIf { it.isNotBlank() } ?: driveId,
                targetApps = targets,
                coverUrl = cover,
                subCoverUrl = subCover,
                subfolderCovers = covers
            )
        }

        fun parseList(arr: JSONArray?): List<AdminDrive> {
            if (arr == null) return emptyList()
            val out = ArrayList<AdminDrive>(arr.length())
            for (i in 0 until arr.length()) {
                runCatching { out.add(fromJson(arr.getJSONObject(i))) }
            }
            return out
        }
    }

    /** Este drive tem como destino o app que está a correr? */
    fun targets(packageName: String): Boolean =
        targetApps.contains(targetForPackage(packageName))

    /** Rótulos pt-BR dos APKs de destino ("Meggy, BiBi"). */
    fun targetLabels(): String = targetApps.joinToString(", ") {
        when (it) {
            TARGET_MEGGY -> "Meggy"
            TARGET_BIBI -> "BiBi"
            TARGET_VOVO -> "Vovó"
            else -> it
        }
    }
}

/**
 * Resultado de um POST de admin (add/delete). Unavailable = o servidor
 * respondeu 404 — a rota ainda não existe (dependência v2.15.x); a UI
 * mostra "função indisponível" em vez de um erro genérico.
 */
sealed class AdminDriveResult {
    object Success : AdminDriveResult()
    data class Error(val message: String) : AdminDriveResult()
    object Unavailable : AdminDriveResult()
}

// ──────────────────────────── v1.5.0 colour helpers ────────────────────────────

private val STRING_COLOR_PALETTE: IntArray = intArrayOf(
    0xFFFF6B6B.toInt(),
    0xFF4ECDC4.toInt(),
    0xFFFFD93D.toInt(),
    0xFFA3E635.toInt(),
    0xFF8FAE9B.toInt(),
    0xFF6BCB77.toInt(),
    0xFFFF9F1C.toInt(),
    0xFF7B68EE.toInt(),
    0xFF00BFFF.toInt(),
    0xFFFF4757.toInt(),
    0xFFA8E6CF.toInt(),
    0xFFDDA0DD.toInt()
)

fun colorFromString(str: String): Int {
    var hash = 0
    for (c in str) hash = c.code + ((hash shl 5) - hash)
    return STRING_COLOR_PALETTE[Math.floorMod(hash, STRING_COLOR_PALETTE.size)]
}

fun monogramFor(title: String): String {
    val words = title.split(Regex("[^\\p{L}0-9]+"))
        .filter { it.isNotBlank() && it[0].isLetterOrDigit() }
    if (words.isEmpty()) return "M"
    if (words.size == 1) return words[0].take(2).uppercase()
    return (words[0].take(1) + words[1].take(1)).uppercase()
}

/**
 * v1.0.8 — Arte de capa por drive (drawables locais cover_*, foto real):
 * usada como arte do hero e como fallback dos cards "Continue assistindo"
 * quando o Drive nao devolve thumb (ou o Coil falha). Monograma nunca
 * mais como thumb: a capa garante arte mesmo sem rede. Os 4 drives da
 * Vovo sao os indices 12-15 (QUEIMA DIARIA, TODO DIA, CLUBE DE CASA,
 * SAUDE E FITNESS).
 */
fun driveCoverRes(driveIndex: Int): Int = when (driveIndex) {
    12 -> R.drawable.cover_queima_diaria
    13 -> R.drawable.cover_todo_dia
    14 -> R.drawable.cover_clube_casa
    15 -> R.drawable.cover_saude_fitness
    else -> R.drawable.cover_saude_fitness
}

/** v1.0.8 — Indice do drive no inicio do path ("/12:/Queima/..." -> 12). */
fun driveIndexFromPath(path: String?): Int? {
    if (path.isNullOrBlank()) return null
    return Regex("""^/?(\d+):""").find(path.trim())?.groupValues?.get(1)?.toIntOrNull()
}

// ──────────────────────────── v1.0.8 onda 2 — capa por path ────────────────────────────

/** Capa do drive de um path qualquer (15 = SAUDE E FITNESS quando desconhecido). */
fun coverResForPath(path: String?): Int =
    driveCoverRes(driveIndexFromPath(path) ?: 15)

// ──────────────────────────── Cursos em destaque (admin) ────────────────────────────

/**
 * v1.0.8 onda 2 — Um curso em destaque do admin (GET /api/featured-courses).
 *
 * O backend v2.15.6 passa a devolver `coverUrl` (foto de capa definida pelo
 * admin; URL http(s), ou null). O parse e defensivo e aceita `coverUrl`
 * (contrato v2.15.6) e `cover_url` (snake_case) — null quando o campo ainda
 * nao existe (producao pre-v2 ou backend antigo). Sem coverUrl, a UI usa a
 * thumb do Drive (b), a imagem da biblioteca por tipo (c) ou a capa local
 * do drive (d) — nunca monograma.
 *
 * Hierarquia da capa (Elton 19:43 + adendo 19:50 — camada 3):
 *   (a) coverUrl do admin  >  (b) thumbnailLink do Drive  >
 *   (c) imagem da biblioteca por tipo de aula (CoverLibrary — manifesto
 *       no jsDelivr, resolvida pelo nome da aula/pasta/curso)  >
 *   (d) capa local cover_* (foto 16:9 em drawable-nodpi).
 * Monograma nunca mais como capa.
 */
data class FeaturedCourse(
    val id: Long,
    val coursePath: String,
    val courseName: String,
    val icon: String,
    val color: String?,
    val sortOrder: Int,
    val coverUrl: String?
) {
    /** Indice do drive do curso ("/12:/..." -> 12), ou null. */
    val driveIndex: Int? get() = driveIndexFromPath(coursePath)

    companion object {
        fun fromJson(o: JSONObject): FeaturedCourse {
            val cover = o.optString("coverUrl").takeIf { it.isNotBlank() }
                ?: o.optString("cover_url").takeIf { it.isNotBlank() }
            return FeaturedCourse(
                id = o.optLong("id", 0L),
                coursePath = o.optString("coursePath").takeIf { it.isNotBlank() }
                    ?: o.optString("course_path"),
                courseName = o.optString("courseName").takeIf { it.isNotBlank() }
                    ?: o.optString("course_name"),
                icon = o.optString("icon"),
                color = o.optString("color").takeIf { it.isNotBlank() },
                sortOrder = o.optInt("sortOrder", o.optInt("sort_order", 0)),
                coverUrl = cover
            )
        }

        fun parseList(arr: JSONArray?): List<FeaturedCourse> {
            if (arr == null) return emptyList()
            val out = ArrayList<FeaturedCourse>(arr.length())
            for (i in 0 until arr.length()) out.add(fromJson(arr.getJSONObject(i)))
            return out
        }
    }
}
