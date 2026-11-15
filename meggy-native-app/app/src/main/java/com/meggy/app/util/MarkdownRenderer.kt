package com.meggy.app.util

import android.text.method.LinkMovementMethod
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.meggy.app.R
import io.noties.markwon.AbstractMarkwonPlugin
import io.noties.markwon.Markwon
import io.noties.markwon.core.MarkwonTheme
import io.noties.markwon.ext.strikethrough.StrikethroughPlugin
import io.noties.markwon.ext.tables.TablePlugin

/**
 * Ronda 9 Frente A — renderizacao de Markdown partilhada (aba Resumo +
 * previa e dialogo "Resumo da aula" no player).
 *
 * Mesma configuracao do MdReaderActivity (Markwon core + tabelas +
 * tachado, tema rosa): H1-H3, negrito/italico, listas, tabelas,
 * codigo, citacoes e links clicaveis. O resumo gerado pela Meggy E
 * Markdown — renderiza-se, nunca se atribui como texto cru (o defeito
 * dos prints da ronda 9: "#", "##", "**" e "---" visiveis como texto).
 *
 * renderPlain() e para a descricao provisoria (nome da aula) e os
 * estados (sem resumo / gerando): texto simples, sem Markdown.
 */
object MarkdownRenderer {

    fun renderMarkdown(textView: TextView, markdown: String) {
        val ctx = textView.context
        val pink = ContextCompat.getColor(ctx, R.color.md_primary)
        val codeBg = ContextCompat.getColor(ctx, R.color.md_surface_container)
        val markwon = Markwon.builder(ctx)
            .usePlugin(TablePlugin.create(ctx))
            .usePlugin(StrikethroughPlugin.create())
            .usePlugin(object : AbstractMarkwonPlugin() {
                override fun configureTheme(builder: MarkwonTheme.Builder) {
                    builder
                        .linkColor(pink)
                        .codeBackgroundColor(codeBg)
                        .codeTextColor(ContextCompat.getColor(ctx, R.color.md_on_surface))
                        .blockQuoteColor(pink)
                        .blockQuoteWidth((8 * ctx.resources.displayMetrics.density).toInt())
                        .listItemColor(pink)
                }
            })
            .build()
        textView.movementMethod = LinkMovementMethod.getInstance()
        markwon.setMarkdown(textView, markdown)
    }

    fun renderPlain(textView: TextView, text: String) {
        textView.movementMethod = null
        textView.text = text
    }
}
