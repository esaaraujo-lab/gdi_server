package com.meggy.app.util

import com.meggy.app.data.ApiService
import com.meggy.app.data.FileItem

/**
 * Frente R14A — materiais nos DOIS sitios (Elton 2026-11-15 21:34).
 *
 * O site (staging/modular/gdi-core.js, modulo M9, funcao build) descobre
 * os materiais da aula em tres passos: (1) ficheiros na pasta do video,
 * (2) subpastas dessa pasta, (3) ficheiros diretamente na pasta pai.
 * O APK so fazia o passo 1 (um unico ApiService.listFolder da pasta da
 * aula) — por isso o player mostrava "Ainda sem materiais para esta
 * aula" quando os materiais viviam ao lado do video. Esta frente porta
 * os passos 2 e 3 e soma um passo 4, a pasta-irma da pasta da aula
 * (regra do Elton: os materiais podem estar JUNTO ao video na MESMA
 * pasta OU dentro de uma pasta AO LADO do video).
 *
 * Ordem e paridade com o site (fallthrough): so se procura fora da
 * pasta da aula quando ela NAO tem materiais proprios. No caso comum
 * (materiais na pasta) nao ha nenhuma chamada extra. Havendo materiais
 * fora, procura-se por ordem — subpastas da aula, ficheiros do pai,
 * pastas-irmas — e para-se na primeira fonte com materiais (o site
 * faz o mesmo nas subpastas). Tudo em 2o plano, sem bloquear o play;
 * falha de rede devolve lista vazia, nunca excecao.
 *
 * Limites honestos (ver NOTES.md da frente): caminho por ID
 * ("by-id:...") nao tem pai conhecido — os passos 3 e 4 ficam de fora
 * e so as subpastas (por ID) valem; a lista extra corta em 12
 * ficheiros, como o site.
 */
object MaterialDiscovery {

    // Maximo de subpastas da aula tentadas (o site tenta 20; 5 chegam
    // para o layout real — aula com mais de 5 pastas de materiais
    // nao existe hoje — e cada tentativa e uma chamada de rede).
    private const val MAX_SUBFOLDERS_TRIED = 5

    // Maximo de pastas-irmas tentadas (mesma razao do teto acima).
    private const val MAX_SIBLINGS_TRIED = 5

    // Teto de ficheiros extra (o site corta em 12 — M9, pdfs.slice).
    private const val MAX_EXTRA_FILES = 12

    /**
     * Um ficheiro conta como material quando e PDF, Markdown (.md,
     * .markdown, .txt — o mesmo FileItem.isMarkdown) ou HTML — os
     * mesmos tipos que o site aceita (M9 isMaterial: pdf, md, txt,
     * html). Legendas .vtt/.srt NUNCA sao materiais: continuam
     * escondidas da lista (regra existente) e a carregar no player
     * pelo SubtitleFetcher.
     */
    fun isMaterialFile(file: FileItem): Boolean {
        if (file.isFolder || file.isSubtitle) return false
        if (file.isPdf || file.isMarkdown) return true
        val name = file.name.lowercase()
        return name.endsWith(".html") || name.endsWith(".htm")
    }

    /**
     * Procura materiais fora da pasta da aula ([folderPath]), com a
     * listagem da pasta ([sameFolderFiles]) ja feita pelo chamador.
     * Devolve os ficheiros com folderPath carimbado (a pasta onde
     * cada um vive, com barra final) e folderLabel com o nome dessa
     * pasta — sem isso os leitores nao saberiam onde abrir o
     * ficheiro. Lista vazia quando nao ha nada ou quando a procura
     * nao se aplica (pasta sem video, caminho por ID sem pai).
     */
    suspend fun discoverExtraMaterials(
        api: ApiService,
        folderPath: String,
        sameFolderFiles: List<FileItem>
    ): List<FileItem> {
        // So pastas de aula (com video ou audio) tem materiais ao lado.
        if (!LessonDescription.isLessonFolder(sameFolderFiles)) return emptyList()
        // Paridade com o site: havendo materiais na propria pasta,
        // nao se procura noutro sitio (zero chamadas extra no caso
        // comum). Sem materiais, procuram-se os dois sitios.
        if (sameFolderFiles.any { isMaterialFile(it) }) return emptyList()
        val found = ArrayList<FileItem>()
        val seen = HashSet<String>()
        fun add(files: List<FileItem>, sourcePath: String): Boolean {
            var added = false
            for (f in files) {
                if (!isMaterialFile(f)) continue
                if (!seen.add(f.name.lowercase())) continue
                found.add(
                    f.copy(
                        folderPath = sourcePath,
                        folderLabel = folderLabelFromPath(sourcePath)
                    )
                )
                added = true
                if (found.size >= MAX_EXTRA_FILES) break
            }
            return added
        }
        val byId = ApiService.isByIdPath(folderPath)
        // Passo 1 — subpastas da pasta da aula (o site, M9). Por ID
        // usa-se o ID da subpasta; por caminho, junta-se o nome.
        // Para-se na primeira subpasta com materiais, como o site.
        val subfolders = sameFolderFiles.filter { it.isFolder }.take(MAX_SUBFOLDERS_TRIED)
        for (sub in subfolders) {
            val subPath = if (byId) ApiService.byIdPath(sub.id)
                else joinPath(folderPath, sub.name)
            // R19B (P1): FolderResult — best-effort: falha vale
            // como sem ficheiros (continua sem os extras).
            val files = api.listFolder(subPath).filesOrNull ?: continue
            if (add(files, withTrailingSlash(subPath))) break
            if (found.size >= MAX_EXTRA_FILES) break
        }
        if (found.isNotEmpty()) return found
        // Passos 2 e 3 precisam do PAI da pasta da aula. Num caminho
        // por ID o pai nao e conhecido (o ID nao tem nome para subir),
        // por isso ai ficam-se os passos 2 e 3: so as subpastas valem.
        if (byId) return found
        val parent = LessonDescription.parentPath(folderPath)
        if (parent == "/" || isDriveRoot(parent)) return found
        val parentFiles = api.listFolder(parent).filesOrNull ?: return found
        // Passo 2 — ficheiros de material DIRETAMENTE na pasta pai
        // (o site, M9: gdiListAllFiles da pasta pai).
        add(parentFiles, withTrailingSlash(parent))
        if (found.isNotEmpty()) return found
        // Passo 3 — pastas-irmas da pasta da aula (a pasta AO LADO do
        // video). A listagem do pai ja as trouxe (sem chamada extra);
        // tenta-se por ordem, ate a primeira com materiais.
        val selfName = lastSegment(folderPath)
        val siblings = parentFiles
            .filter { it.isFolder && !it.name.equals(selfName, ignoreCase = true) }
            .take(MAX_SIBLINGS_TRIED)
        for (sib in siblings) {
            val sibPath = joinPath(parent, sib.name)
            val files = api.listFolder(sibPath).filesOrNull ?: continue
            if (add(files, withTrailingSlash(sibPath))) break
            if (found.size >= MAX_EXTRA_FILES) break
        }
        return found
    }

    // Junta "pai" + "nome" com uma so barra (o pai pode ja traze-la).
    private fun joinPath(parent: String, name: String): String {
        val p = if (parent.endsWith("/")) parent else "$parent/"
        return "$p$name/"
    }

    // Garante a barra final (os leitores juntam pasta + nome).
    private fun withTrailingSlash(path: String): String =
        if (path.endsWith("/")) path else "$path/"

    // Ultimo segmento de um caminho ("/11:/Curso/Aula 01" -> "Aula 01").
    private fun lastSegment(path: String): String {
        val clean = path.trimEnd('/')
        val idx = clean.lastIndexOf('/')
        return if (idx < 0) clean else clean.substring(idx + 1)
    }

    // Rotulo curto de uma pasta (o ultimo segmento, sem barra final).
    private fun folderLabelFromPath(path: String): String = lastSegment(path)

    // Raiz de um drive ("/11:"): nao e uma pasta-pai util — listar
    // ai devolveria as pastas dos cursos, nao materiais da aula.
    private fun isDriveRoot(path: String): Boolean {
        val clean = path.trimEnd('/')
        return clean.matches(Regex("^/\\d+:$"))
    }
}
