package com.vovofit.app.util

import android.content.Context
import android.content.Intent
import com.vovofit.app.data.AdminDrive
import com.vovofit.app.data.DriveItem
import org.json.JSONArray
import org.json.JSONObject

/**
 * Ronda 10 Frente C — exibição dos drives do admin (ver NOTES.md da
 * frente; depende do AdminDrive + getAdminDrives() da Frente B).
 *
 * Um drive do admin é uma pasta do Drive que o admin adicionou por ID
 * (GET /api/admin-drives) e escolheu mostrar num ou mais APKs
 * (targetApps). Até o servidor ganhar a listagem por ID (dependência
 * v2.15.x), o drive aparece no rail da Home mas NÃO abre — o toque
 * mostra só o aviso (HomeActivity.onAdminDriveClick).
 *
 * Este ficheiro concentra o que a Frente C precisou de novo:
 *   - [DriveRailItem]: o rail funde drives fixos e drives do admin
 *     numa só lista (fixos primeiro, admin a seguir);
 *   - transporte do AdminDrive em extras do intent (o DetailActivity
 *     lê-o p/ a sub-capa e as capas de sub-pasta; as navegações p/
 *     sub-pastas herdam os extras com [forwardAdminDrive]);
 *   - [generalCoverUrl]: a sub-capa GENÉRICA = imagem 'geral' do
 *     manifesto da biblioteca de capas (ver o KDoc da função);
 *   - registo das capas de sub-pasta ([setSubfolderCovers] /
 *     [subfolderCoverFor]): a biblioteca de capas consulta-o no topo
 *     de resolveInternal, POR CIMA da resolução por biblioteca.
 */
sealed class DriveRailItem {
    /** Drive fixo do código (DriveItem.ALL). */
    data class Fixed(val drive: DriveItem) : DriveRailItem()

    /** Drive adicionado pelo admin (GET /api/admin-drives). */
    data class Admin(val drive: AdminDrive) : DriveRailItem()

    /** Nome a mostrar no tile. */
    val name: String
        get() = when (this) {
            is Fixed -> drive.name
            is Admin -> drive.name
        }

    /** Emoji do tile (o admin não tem ícone próprio: pasta genérica). */
    val icon: String
        get() = when (this) {
            is Fixed -> drive.icon
            is Admin -> "📁"
        }
}

object AdminDriveUi {

    // ── Extras do intent p/ o DetailActivity (ver [putAdminDrive]) ──
    const val EXTRA_DRIVE_ID = "admin_drive_id"
    const val EXTRA_DRIVE_DRIVE_ID = "admin_drive_drive_id"
    const val EXTRA_DRIVE_NAME = "admin_drive_name"
    const val EXTRA_DRIVE_TARGETS = "admin_drive_targets"
    const val EXTRA_DRIVE_COVER_URL = "admin_drive_cover_url"
    const val EXTRA_DRIVE_SUB_COVER_URL = "admin_drive_sub_cover_url"
    const val EXTRA_DRIVE_SUBFOLDER_COVERS = "admin_drive_subfolder_covers"
    const val EXTRA_DRIVE_ROOT_PATH = "admin_drive_root_path"

    /**
     * Guarda o AdminDrive nos extras do intent que abre o
     * DetailActivity. [rootPath] é o drivePath usado p/ abrir o drive
     * (a raiz do drive do admin) — fica fixo nas navegações p/
     * sub-pastas (ver [forwardAdminDrive]) e é a raiz do registo de
     * capas de sub-pasta. AdminDrive não é Parcelable: os campos vão
     * como extras simples e [adminDriveFromIntent] reconstrói-o com
     * AdminDrive.fromJson (o parse defensivo da Frente B).
     */
    fun putAdminDrive(intent: Intent, drive: AdminDrive, rootPath: String) {
        intent.putExtra(EXTRA_DRIVE_ID, drive.id)
        intent.putExtra(EXTRA_DRIVE_DRIVE_ID, drive.driveId)
        intent.putExtra(EXTRA_DRIVE_NAME, drive.name)
        intent.putExtra(EXTRA_DRIVE_TARGETS, drive.targetApps.joinToString(","))
        drive.coverUrl?.let { intent.putExtra(EXTRA_DRIVE_COVER_URL, it) }
        drive.subCoverUrl?.let { intent.putExtra(EXTRA_DRIVE_SUB_COVER_URL, it) }
        if (drive.subfolderCovers.isNotEmpty()) {
            intent.putExtra(EXTRA_DRIVE_SUBFOLDER_COVERS,
                JSONObject(drive.subfolderCovers).toString())
        }
        intent.putExtra(EXTRA_DRIVE_ROOT_PATH, rootPath)
    }

    /** Reconstrói o AdminDrive dos extras (null = drive fixo, sem extras). */
    fun adminDriveFromIntent(intent: Intent): AdminDrive? {
        val driveId = intent.getStringExtra(EXTRA_DRIVE_DRIVE_ID)
            ?.takeIf { it.isNotBlank() } ?: return null
        val covers = JSONObject()
        runCatching {
            val raw = intent.getStringExtra(EXTRA_DRIVE_SUBFOLDER_COVERS)
            if (!raw.isNullOrBlank()) {
                val parsed = JSONObject(raw)
                val keys = parsed.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    covers.put(key, parsed.optString(key, ""))
                }
            }
        }
        val targets = JSONArray()
        for (t in (intent.getStringExtra(EXTRA_DRIVE_TARGETS) ?: "")
            .split(",").map { it.trim() }.filter { it.isNotEmpty() }) {
            targets.put(t)
        }
        val json = JSONObject().apply {
            put("id", intent.getLongExtra(EXTRA_DRIVE_ID, 0L))
            put("driveId", driveId)
            put("name", intent.getStringExtra(EXTRA_DRIVE_NAME) ?: driveId)
            put("targetApps", targets)
            intent.getStringExtra(EXTRA_DRIVE_COVER_URL)?.let { put("coverUrl", it) }
            intent.getStringExtra(EXTRA_DRIVE_SUB_COVER_URL)?.let { put("subCoverUrl", it) }
            put("subfolderCovers", covers)
        }
        return runCatching { AdminDrive.fromJson(json) }.getOrNull()
    }

    /** Raiz do drive do admin guardada nos extras (null = sem drive do admin). */
    fun adminDriveRootFromIntent(intent: Intent): String? =
        intent.getStringExtra(EXTRA_DRIVE_ROOT_PATH)?.takeIf { it.isNotBlank() }

    /**
     * Copia os extras do drive do admin de um intent p/ outro (o
     * DetailActivity-filho herda o drive do admin quando navega p/
     * uma sub-pasta — sub-capa e capas de sub-pasta continuam a
     * valer lá dentro). Sem drive do admin na origem, não faz nada.
     */
    fun forwardAdminDrive(source: Intent, target: Intent) {
        val drive = adminDriveFromIntent(source) ?: return
        val root = adminDriveRootFromIntent(source)
            ?: source.getStringExtra("drivePath") ?: "/"
        putAdminDrive(target, drive, root)
    }

    /**
     * Ronda 10 Frente C — a sub-capa GENÉRICA do drive do admin: a
     * imagem 'geral' do manifesto da biblioteca de capas. É a sub-capa
     * usada no hero do detalhe quando o admin não definiu subCoverUrl.
     * Null sem manifesto carregado (ou sem entrada 'geral') — nesse
     * caso o detalhe cai na hierarquia actual (thumb/biblioteca/
     * gerada), nunca fica sem capa.
     *
     * NÃO é o resolveStrict usado nas outras superfícies (que exclui
     * a 'geral' de propósito — 2.7.13/2.1.11/1.0.11: o livro 'geral'
     * não é a imagem de nenhum curso/pasta): aqui a 'geral' é a escolha
     * explícita do admin ("só a capa + sub-capa genérica"), por isso
     * usa-se a resolução NÃO-estrita. Meggy/BiBi: resolve() sem nomes
     * (o resolveInternal devolve o fallback 'geral' sem candidatos);
     * Vovó: CoverLibrary.generalCoverUrl() (o resolveInternal da Vovó
     * devolve null sem candidatos — ver CoverLibrary).
     */
    fun generalCoverUrl(context: Context): String? = CoverLibrary.generalCoverUrl(context)

    // ── Registo das capas de sub-pasta (consultado pela biblioteca) ──

    @Volatile
    private var subfolderRoot: String? = null

    @Volatile
    private var subfolderCovers: Map<String, String> = emptyMap()

    /** Prefixo "N:/" do caminho de um drive ("0:/drive/sub"). */
    private val DRIVE_PREFIX_REGEX = Regex("^\\d+:/")

    /**
     * Activa as capas de sub-pasta de um drive do admin: [rootPath] é
     * a raiz do drive (o drivePath do intent) e [covers] o mapa
     * subfolderCovers do AdminDrive dono. As chaves são normalizadas
     * (ver [normalizePath]) na gravação; o DetailActivity chama isto
     * no onCreate e no onResume e [clearSubfolderCovers] no onDestroy
     * (um detalhe-filho destruído limpa o registo ao sair; ao voltar,
     * o detalhe-pai volta a valer no onResume).
     */
    fun setSubfolderCovers(rootPath: String, covers: Map<String, String>) {
        val root = normalizePath(rootPath) ?: return
        val norm = LinkedHashMap<String, String>()
        for ((path, url) in covers) {
            val key = normalizePath(path) ?: continue
            val value = url.trim()
            if (value.isNotEmpty()) norm[key] = value
        }
        subfolderRoot = root
        subfolderCovers = norm
    }

    /** Desactiva as capas de sub-pasta (DetailActivity.onDestroy). */
    fun clearSubfolderCovers() {
        subfolderRoot = null
        subfolderCovers = emptyMap()
    }

    /**
     * Ronda 10 Frente C — capa de sub-pasta do drive do admin p/ os
     * nomes dados (chamado pela biblioteca de capas no topo de
     * resolveInternal, POR CIMA da resolução por biblioteca — camada
     * 3; sem entrada no mapa, null e o fluxo segue como antes).
     *
     * Âmbito: a chamada só vale quando UM dos nomes é um caminho
     * dentro da raiz do drive do admin ([subfolderRoot]) — sem isto,
     * uma chave de nome simples ("Aula 01") roubaria a capa de
     * qualquer outra tela que resolvesse o mesmo nome enquanto o
     * detalhe do admin estivesse vivo na pilha. Dentro do âmbito,
     * casa primeiro o caminho completo ("drive/sub") e depois o nome
     * simples da pasta ("sub") — o admin escreve o caminho da
     * sub-pasta como quiser no formulário da Frente B. O caminho
     * completo é o relativo ao drive: o prefixo "N:/" ("0:/drive/sub"
     * -> "drive/sub") é ignorado na comparação.
     */
    fun subfolderCoverFor(vararg names: String?): String? {
        val root = subfolderRoot ?: return null
        val covers = subfolderCovers
        if (covers.isEmpty()) return null
        var inScope = false
        for (raw in names) {
            val n = normalizePath(raw) ?: continue
            if (n == root || n.startsWith("$root/")) {
                inScope = true
                break
            }
        }
        if (!inScope) return null
        // 1.º passe: caminho completo — absoluto ("0:/drive/sub") ou
        // relativo ao drive ("drive/sub", sem o prefixo "N:/"). O
        // caminho completo vence o nome simples: sem os dois passes,
        // "Aula 02" casaria antes de "drive/aula 02" ser tentado.
        for (raw in names) {
            val n = normalizePath(raw) ?: continue
            if ('/' in n) covers[n]?.let { return it }
            val rel = relativePath(n)
            if (rel != null && '/' in rel) covers[rel]?.let { return it }
        }
        // 2.º passe: nome simples da pasta ("sub").
        for (raw in names) {
            val n = normalizePath(raw) ?: continue
            val last = n.substringAfterLast('/')
            covers[last]?.let { return it }
        }
        return null
    }

    /**
     * Caminho relativo ao drive ("0:/drive/sub" -> "drive/sub"): tira
     * o prefixo "N:/" do caminho normalizado. Sem prefixo de drive,
     * o caminho já é relativo e volta como está.
     */
    private fun relativePath(normalized: String): String? {
        val rel = DRIVE_PREFIX_REGEX.replace(normalized, "")
        return rel.ifEmpty { null }
    }

    /** Normaliza um caminho p/ o registo: minúsculas, sem '/' nas pontas. */
    private fun normalizePath(path: String?): String? {
        val t = path?.trim()?.lowercase()?.trim('/') ?: return null
        return t.ifEmpty { null }
    }
}
