package com.meggy.app.util

import android.content.Context
import com.meggy.app.data.AiService

/**
 * Frente K (ronda APK) — caminho UNICO de gravacao dos materiais
 * gerados pela Meggy na pasta de materiais da aula.
 *
 * O QUE E SALVO (os tres, quando existirem):
 *   resumo    — POST /api/materials/save-in-folder, materialType
 *               'resumo'    -> `.gdi-resumos/<user>_<Aula>.md`
 *   pilulas   — materialType 'flashcard' -> `.gdi-flashcards/<user>_<Aula>.md`
 *               (o `mindmap` do cache ISA: bullets em Markdown)
 *   questoes  — materialType 'questoes'  -> `.gdi-questoess/<user>_<Aula>.json`
 *               (o `questions` do cache ISA, serializado em JSON)
 *   Os tres tipos sao aceites pelo worker (validTypes:
 *   resumo/questoes/flashcard/simulado/explicacao — ver
 *   handleMaterialsSaveInFolder em deploy-staging-c/worker.js).
 *
 * ONDE: a pasta de materiais e a pasta PAI do `lessonFilePath`
 * (o worker resolve-a; por isso passa-se SEMPRE o path completo
 * de um arquivo dentro da pasta da aula — video ou PDF — e nunca
 * so a pasta). E o MESMO caminho partilhado dos videos e da web:
 * servidor/Drive, nunca so local — o resumo salvo tambem no
 * cache local (SessionManager) e so um atalho de leitura, nao a
 * fonte. Quem abre a aula em outro aparelho le do servidor.
 *
 * QUEM CHAMA (um so caminho — nao duplicar a logica de gravacao):
 *   - DetailActivity (pagina do video): no Outcome.Ready e no
 *     retorno do cache local (2o plano, para repor pilulas/
 *     questoes que uma versao antiga nunca salvou);
 *   - DescriptionPregenerator (proximas aulas, em 2o plano);
 *   - PlayerActivity (aula atual, quando o gerado ja existe);
 *   - PdfReaderActivity.saveGeneratedMaterials(...) — PONTO DE
 *     ENTREGA da Frente J (ver la): a J gera, a K salva.
 *
 * Best-effort por desenho: cada tipo e tentado sozinho (a falha
 * de um nao impede os outros) e nada lanca excecao — um material
 * por gravar nao pode travar a tela nem o video.
 */
object MaterialSaver {

    /** O que foi (ou nao) gravado — um item por tipo de material. */
    data class SaveReport(
        val resumo: Boolean = false,
        val pilulas: Boolean = false,
        val questoes: Boolean = false
    ) {
        /** Verdadeiro quando pelo menos um dos tres foi gravado. */
        val anySaved: Boolean get() = resumo || pilulas || questoes
    }

    /**
     * Grava resumo + pilulas + questoes na pasta de materiais.
     * `lessonFilePath` = path COMPLETO de um arquivo dentro da
     * pasta da aula (video ou PDF — o worker resolve a pasta PAI).
     * `lessonName` = nome da aula (a pasta da aula; ou o nome do
     * PDF sem extensao, quando a aula E o PDF — ver o ponto de
     * entrega no PdfReaderActivity). Cada tipo nao-blank e
     * gravado; null/blank = nao gerado (ou ainda gerando) e e
     * saltado em silencio. Nunca lanca excecao.
     */
    suspend fun saveGenerated(
        context: Context,
        lessonFilePath: String,
        lessonName: String,
        summary: String?,
        pills: String?,
        questionsJson: String?
    ): SaveReport {
        var resumo = false
        var pilulas = false
        var questoes = false
        if (!summary.isNullOrBlank()) {
            resumo = runCatching {
                AiService.saveToFolder(
                    context, lessonFilePath,
                    LessonDescription.folderFileName(context, lessonName),
                    summary, "resumo"
                )
            }.getOrDefault(false)
        }
        if (!pills.isNullOrBlank()) {
            pilulas = runCatching {
                AiService.saveToFolder(
                    context, lessonFilePath,
                    LessonDescription.folderFileName(context, lessonName),
                    pills, "flashcard"
                )
            }.getOrDefault(false)
        }
        if (!questionsJson.isNullOrBlank()) {
            questoes = runCatching {
                AiService.saveToFolder(
                    context, lessonFilePath,
                    LessonDescription.folderFileName(context, lessonName, "json"),
                    questionsJson, "questoes"
                )
            }.getOrDefault(false)
        }
        return SaveReport(resumo, pilulas, questoes)
    }
}
