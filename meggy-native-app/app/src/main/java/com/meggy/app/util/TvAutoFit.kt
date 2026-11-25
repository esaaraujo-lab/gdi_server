package com.meggy.app.util

import android.content.Context
import android.util.Log
import android.view.View
import android.view.ViewGroup
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Ronda 7 Frente B — Auto-ajuste da tela inicial da TV ao tamanho da tela.
 *
 * Problema (DIAGNOSIS.md, Frente A): a home da TV usava UM tamanho fixo em dp
 * para todas as TVs (calibrado na 32"), sem ler o tamanho real da tela. Como o
 * dp de uma TV Android nao e uma medida fisica fixa, esse layout fica 31%
 * maior em centimetros numa 42" com o mesmo bucket (mecanismo 1) e muda de
 * proporcoes quando a TV reporta outro density bucket (mecanismo 2: hero
 * 39% -> 59% da altura, 6 -> 4 cartoes por linha).
 *
 * Regra: derivar tudo do viewport medido em runtime, com a mesma formula do
 * precedente BrowseActivity.calculateSpanCount():
 *   screenWidthDp = displayMetrics.widthPixels / displayMetrics.density
 * A referencia a preservar sao as FRACCOES da 32" aprovada pelo Elton, nao os
 * dp fixos — e como nao se sabe se a 32" e tvdpi (viewport 1442x811dp) ou
 * xhdpi (960x540dp), a referencia e uma BANDA (960-1443dp de largura), nao
 * um ponto: dentro da banda a escala e 1.0 e a 32" fica pixel a pixel igual
 * a hoje, qualquer que seja o seu bucket. (Os tectos 1443/812dp sao os
 * valores exatos 1442.25/811.27dp arredondados para cima, para o viewport
 * tvdpi cair dentro da banda e nao 0,02% acima dela.)
 *
 * Tres fontes (precedencia nesta ordem):
 * - FRACTION: viewport acima da banda (4K): escala linear
 *   widthDp / 1443, ate 1.6 — preserva as fraccoes da referencia
 *   (card 13,9% da largura, 6 cartoes/linha, hero ~39% da altura).
 *   O hero usa a altura do viewport (heroScale) para a fraccao se manter
 *   mesmo em ecras fora de 16:9.
 * - PHYSICAL: viewport dentro da banda MAS a TV e fisicamente maior que a
 *   32" (mecanismo 1 — so visivel quando xdpi/ydpi sao honestos): a escala
 *   e 27.9 / larguraFisicaPol, ate 0.70 — o card/hero/texto mantem o tamanho
 *   FISICO da 32". So dispara com diagonal calculada entre 20" e 90"
 *   (xdpi a mentir — igual ao bucket — da ~10" e e rejeitado).
 * - IDENTITY: dentro da banda sem xdpi honesto: escala 1.0 (status quo).
 *
 * Limites (clamps): escala [0.70, 1.6]; texto segue a mesma escala, tambem
 * [0.70, 1.35]; margens crescem a metade do ritmo, [0.85, 1.25], com pisos
 * de overscan 48dp nos 4 lados (skill android-tv-design). Abaixo da banda
 * nunca se encolhe: uma TV pequena mantem a geometria da 32".
 *
 * Foco (ronda 1, intacto): 1.10x + anel 3dp + elevacao 16dp, 180ms. O gap
 * total do rail era 16dp e o card focado (200 x 1.10 = 220dp) excede o passo
 * (216dp) — 2dp de sobreposicao por lado, invisivel na pratica (elevacao +
 * escala centrada). A escala <= 1.0 MANTEM os 16dp para a 32" ficar identica
 * (10% de 200dp seriam 20dp — o gap de 16dp e o da 32" e mantem-se por
 * fidelidade a referencia, com a sobreposicao pre-existente); acima de 1.0
 * o gap passa a 10% da largura do card, e o foco cabe sem sobreposicao
 * (gapHalfPx / gutterDp). Sem isto, subir o gap para 20dp na 32" tirava um
 * cartao por linha no viewport xhdpi (4 -> 3).
 *
 * Tipos: os valores deste arquivo NAO sobem para os pisos da skill
 * (48/28/24sp) — o Elton aprovou o aspecto atual na 32"; o texto escala
 * a partir dos valores actuais (titulo 30sp, secao 18sp, card 13sp).
 *
 * Uso: so na TV (os call sites salvam com TvUtils.isTv). O celular nao
 * chama nada disto e fica exatamente como esta.
 */
object TvAutoFit {

    /** Largura do viewport da 32" tvdpi — teto da banda de referencia. */
    const val REFERENCE_WIDTH_DP = 1443f
    /** Altura do viewport da 32" tvdpi — teto da banda (hero). */
    const val REFERENCE_HEIGHT_DP = 812f
    /** Largura fisica da 32" 16:9 (70,8 cm). */
    const val REFERENCE_PHYSICAL_WIDTH_IN = 27.9f
    /** Crescimento maximo (4K tvdpi precisaria de 2.0 para preservar as
        fraccoes exactas; 1.6 cumpre os criterios do DIAGNOSIS §7 sem
        cartoes de 17 cm). */
    const val SCALE_MAX = 1.6f
    /** Encolhimento maximo (fisico): abaixo disto o texto fica ilegivel. */
    const val SCALE_MIN_PHYSICAL = 0.70f
    const val TEXT_SCALE_MAX = 1.35f
    const val TEXT_SCALE_MIN = 0.70f
    const val MARGIN_SCALE_MAX = 1.25f
    const val MARGIN_SCALE_MIN = 0.85f
    /** Overscan minimo da skill, nos 4 lados. */
    const val MIN_SIDE_MARGIN_DP = 48f
    const val MIN_TOP_BOTTOM_MARGIN_DP = 48f
    /** Diagonal plausivel de uma TV (filtro do xdpi mentiroso). */
    const val MIN_DIAGONAL_IN = 20f
    const val MAX_DIAGONAL_IN = 90f
    /** Gap total minimo do rail (o da 32": 8dp marginEnd + 8dp decoracao). */
    const val GAP_MIN_TOTAL_DP = 16f
    /** Escala de foco (espelho da constante SCALE_TV do FocusAnimator). */
    const val FOCUS_SCALE = 1.10f

    const val TAG = "TvAutoFit"

    enum class Source { FRACTION, PHYSICAL, IDENTITY }

    data class Fit(
        /** Escala da geometria (cards, drives, gaps). 1.0 = 32" de referencia. */
        val scale: Float,
        /** Escala da altura do hero (derivada da altura do viewport). */
        val heroScale: Float,
        /** Escala do texto (mesmo factor, com teto proprio). */
        val textScale: Float,
        /** Escala das margens/espacamentos (metade do ritmo). */
        val marginScale: Float,
        val widthDp: Float,
        val heightDp: Float,
        val widthPx: Int,
        val heightPx: Int,
        val densityDpi: Int,
        val density: Float,
        val fontScale: Float,
        /** Largura fisica em polegadas (null = xdpi nao e de fianca). */
        val physicalWidthIn: Float?,
        val source: Source
    ) {
        /** dp de geometria -> px (escala). */
        fun layoutPx(dp: Float): Int = (dp * scale * density).roundToInt()

        /** dp de altura do hero -> px (escala da altura). */
        fun heroPx(dp: Float): Int = (dp * heroScale * density).roundToInt()

        /** sp -> sp escalado (o fontScale do sistema continua a aplicar-se
            por cima, porque os call sites usam COMPLEX_UNIT_SP). */
        fun textSp(sp: Float): Float = sp * textScale

        /** dp de margem/espacamento -> px (escala das margens). */
        fun marginPx(dp: Float): Int = (dp * marginScale * density).roundToInt()

        /** Margem lateral de overscan: 56dp escalada, nunca abaixo de 48dp. */
        fun sideMarginPx(): Int =
            max((MIN_SIDE_MARGIN_DP * density).roundToInt(), marginPx(56f))

        /** Margem de topo de overscan: 48dp escalada, nunca abaixo de 48dp.
            O dimen tv_margin_top e 40dp e e partilhado com o detalhe TV —
            por isso o piso de 48dp aplica-se aqui, em codigo, so na home. */
        fun topMarginPx(): Int =
            max((MIN_TOP_BOTTOM_MARGIN_DP * density).roundToInt(),
                marginPx(MIN_TOP_BOTTOM_MARGIN_DP))

        /** Margem de fundo de overscan (igual a de topo). */
        fun bottomMarginPx(): Int = topMarginPx()

        /**
         * Metade do gap total do rail, em px, para o marginEnd do item.
         * Gap total = 16dp a escala <= 1.0 (o da 32"); acima disso, 10% da
         * largura do card — e o card focado (x1.10) cabe no passo sem
         * sobrepor os vizinhos. A descontinuidade e intencional: 10% de
         * 200dp seriam 20dp, e subir o gap da 32" para 20dp tirava um
         * cartao por linha no viewport xhdpi (4 -> 3).
         */
        fun gapHalfPx(cardBaseDp: Float): Int {
            val totalGapDp = totalGapDp(cardBaseDp * scale)
            return (totalGapDp / 2f * density).roundToInt()
        }

        /** Metade do gap total do rail, em dp, para o RailGutterDecoration. */
        fun gutterDp(cardBaseDp: Float): Int {
            val totalGapDp = totalGapDp(cardBaseDp * scale)
            return (totalGapDp / 2f).roundToInt()
        }

        private fun totalGapDp(cardWidthDp: Float): Float =
            if (scale <= 1f) GAP_MIN_TOTAL_DP
            else max(GAP_MIN_TOTAL_DP, cardWidthDp * (FOCUS_SCALE - 1f))

        /** Aplica uma margem de topo a uma vista (re-atribui os params). */
        fun applyTopMargin(view: View, marginPx: Int) {
            val lp = view.layoutParams as? ViewGroup.MarginLayoutParams ?: return
            lp.topMargin = marginPx
            view.layoutParams = lp
        }

        /**
         * Linha unica de diagnostico (passo 0 da Frente A): registar em
         * cada TV do Elton — densityDpi/density/widthPixels/fontScale e a
         * fonte da escala — para se saber qual dos dois mecanismos actua.
         */
        fun describe(): String =
            "viewport ${widthPx}x${heightPx}px density=$density " +
                "densityDpi=$densityDpi fontScale=$fontScale " +
                "screen ${"%.0f".format(widthDp)}x${"%.0f".format(heightDp)}dp " +
                "physW=${physicalWidthIn?.let { "%.1f".format(it) + "in" } ?: "?"} " +
                "source=$source scale=${"%.3f".format(scale)} " +
                "hero=${"%.3f".format(heroScale)} " +
                "text=${"%.3f".format(textScale)} " +
                "margin=${"%.3f".format(marginScale)}"
    }

    /**
     * 2.7.48 — [sideMenuWidthDp] desconta a largura do menu lateral
     * da TV (0 quando não há menu: celular, ou TV com o menu
     * desligado) da largura do viewport antes de dimensionar o
     * conteúdo. Ver SideMenuView.currentWidthDp(). No detalhe da TV
     * o menu não existe: usa-se forContext(context) (0). Nota: o
     * ramo PHYSICAL passa a ver a largura do conteúdo (não a do
     * painel) — a diferença é ~13% e fica dentro dos clamps.
     */
    fun forContext(context: Context, sideMenuWidthDp: Float): Fit {
        val dm = context.resources.displayMetrics
        val menuPx = (sideMenuWidthDp * dm.density).roundToInt()
        return compute(
            widthPx = (dm.widthPixels - menuPx).coerceAtLeast(1),
            heightPx = dm.heightPixels,
            densityDpi = dm.densityDpi,
            density = dm.density,
            fontScale = context.resources.configuration.fontScale,
            xdpi = dm.xdpi,
            ydpi = dm.ydpi
        )
    }

    /** Mede o viewport e a densidade fisica a partir dos recursos. */
    fun forContext(context: Context): Fit = forContext(context, 0f)

    /**
     * 2.7.56 — span da grade de Tiles da TV derivado da LARGURA ÚNICA
     * do tile (proposta Plex, aprovada 2026-11-25): tile de 152dp +
     * gutter de 10dp (GridGutterDecoration(10) de todas as grades do
     * FileAdapter); a largura útil é o viewport menos as margens de
     * overscan (56dp × 2) e menos [extraInsetDp] (o padding próprio
     * da lista — ex.: 16dp × 2 na grade do detalhe). A 1080p
     * (960dp): (848+10)/162 = 5 colunas — o mesmo número no Browse e
     * no detalhe, e é ESTE span que se passa ao TileColors.assign
     * (vizinhos certos). Clamp [3, 8] para painéis fora do comum.
     */
    fun gridSpanForTile(
        context: Context,
        tileWidthDp: Float = 152f,
        gapDp: Float = 10f,
        extraInsetDp: Float = 0f
    ): Int {
        val dm = context.resources.displayMetrics
        val widthDp = dm.widthPixels / dm.density
        // 56dp = @dimen/tv_margin_side (a margem de overscan real das
        // telas de grade; MIN_SIDE_MARGIN_DP é o piso de 48dp do Fit).
        val usable = widthDp - 2 * 56f - extraInsetDp
        return ((usable + gapDp) / (tileWidthDp + gapDp)).toInt().coerceIn(3, 8)
    }

    /**
     * Matematica pura da escala (testavel sem Android — ver verify-B.py).
     * `density` e o factor dp->px; `xdpi`/`ydpi` sao os dpi fisicos
     * reportados (muitas TVs retornam o bucket em vez do valor fisico —
     * o filtro da diagonal rejeita esses casos).
     */
    fun compute(
        widthPx: Int,
        heightPx: Int,
        densityDpi: Int,
        density: Float,
        fontScale: Float,
        xdpi: Float,
        ydpi: Float
    ): Fit {
        val safeDensity = if (density > 0f) density else densityDpi / 160f
        val widthDp = widthPx / safeDensity
        val heightDp = heightPx / safeDensity
        // Largura fisica, so quando o xdpi/ydpi e de fianca: a diagonal
        // calculada precisa ser a de uma TV (20"-90"). xdpi = bucket
        // (213/320) da uma diagonal de ~10" e e rejeitado.
        val physicalWidthIn: Float? = if (xdpi > 0f && ydpi > 0f) {
            val wIn = widthPx / xdpi
            val diagIn = hypot(wIn, heightPx / ydpi)
            if (diagIn in MIN_DIAGONAL_IN..MAX_DIAGONAL_IN && wIn in 15f..80f) wIn
            else null
        } else null
        val (scale, heroScale, source) = when {
            widthDp > REFERENCE_WIDTH_DP -> {
                // 4K (ou maior): preservar as fraccoes da referencia.
                val s = min(widthDp / REFERENCE_WIDTH_DP, SCALE_MAX)
                val hs = if (heightDp > REFERENCE_HEIGHT_DP) {
                    min(heightDp / REFERENCE_HEIGHT_DP, SCALE_MAX)
                } else 1f
                Triple(s, hs, Source.FRACTION)
            }
            physicalWidthIn != null -> {
                // Mesmo viewport em dp, painel fisicamente maior (mecanismo 1):
                // encolher para o tamanho fisico da 32". Nunca crescer por
                // aqui (o crescimento vem do caminho FRACTION).
                val s = (REFERENCE_PHYSICAL_WIDTH_IN / physicalWidthIn)
                    .coerceIn(SCALE_MIN_PHYSICAL, 1f)
                Triple(s, s, Source.PHYSICAL)
            }
            else -> Triple(1f, 1f, Source.IDENTITY)
        }
        val textScale = scale.coerceIn(TEXT_SCALE_MIN, TEXT_SCALE_MAX)
        val marginScale =
            (1f + (scale - 1f) * 0.5f).coerceIn(MARGIN_SCALE_MIN, MARGIN_SCALE_MAX)
        return Fit(
            scale = scale,
            heroScale = heroScale,
            textScale = textScale,
            marginScale = marginScale,
            widthDp = widthDp,
            heightDp = heightDp,
            widthPx = widthPx,
            heightPx = heightPx,
            densityDpi = densityDpi,
            density = safeDensity,
            fontScale = fontScale,
            physicalWidthIn = physicalWidthIn,
            source = source
        )
    }
}
