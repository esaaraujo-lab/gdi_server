package com.vovofit.app.util

import android.widget.TextView

/**
 * Truncamento no limite da palavra (patch 2.7.7/2.1.6/1.0.5).
 *
 * O `android:ellipsize="end"` corta no meio da palavra ("Aplicabilidade
 * das Nor…"). Esta extensão mantém o ellipsize da plataforma como rede
 * de segurança, mas depois do layout reescreve o texto cortando na
 * última palavra completa visível + "…". Usa o Layout real, por isso
 * respeita a largura e a fonte de cada cartão (celular e TV).
 * Se a palavra sozinha já não cabe, mantém o corte da plataforma.
 * Só reescreve uma vez por chamada; não há loop (o `post` roda uma vez
 * e o texto reescrito é mais curto, sem elipse).
 */
fun TextView.setWordEllipsized(text: CharSequence) {
    setText(text)
    val expected = text.toString()
    post {
        if (this.text.toString() != expected) return@post
        val layout = layout ?: return@post
        val max = maxLines.coerceAtLeast(1)
        val lastLine = (minOf(max, layout.lineCount) - 1).coerceAtLeast(0)
        if (layout.getEllipsisCount(lastLine) <= 0) return@post
        val ellipsisStart = layout.getEllipsisStart(lastLine)
        if (ellipsisStart <= 0) return@post
        val cut = expected.lastIndexOf(' ', ellipsisStart - 1)
        if (cut <= 0) return@post
        val shortened = expected.substring(0, cut).trimEnd() + "\u2026"
        if (shortened != expected) setText(shortened)
    }
}
