package com.meggy.app.ui.home

import android.content.Context
import android.util.AttributeSet
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.meggy.app.BuildConfig
import com.meggy.app.R
import com.meggy.app.util.FocusAnimator
import com.meggy.app.util.SessionManager
import com.meggy.app.util.TvUtils

/**
 * 2.7.48 — Menu lateral da TV (conceito 3/4, decisão 21:37: o menu
 * retráctil é SÓ da TV; no celular a navegação é a barra inferior).
 *
 * Coluna fixa à esquerda da home da TV: logo + Início / Drives /
 * Simulados / Meggy / Downloads / Ajustes + recolher + versão.
 * As linhas constroem-se em código (sem XML de item separado — um
 * ficheiro só): cada linha é ícone + rótulo, focável p/ D-pad, com
 * o anel de foco do FocusAnimator. Recolhido, só os ícones ficam
 * (64dp); expandido, 240dp. O estado vive em SessionManager
 * (tvSideMenuCollapsed); o interruptor de ligar/desligar está nos
 * Ajustes (tvSideMenuEnabled) — desligado, a TV volta aos ícones do
 * cabeçalho como antes.
 *
 * Destinos (provisórios Q1–Q3, ver SPEC 2.7.48 §2 — nada de novo):
 * Simulados -> drive RETA FINAL TRTs; Meggy -> busca; Downloads ->
 * Minha lista. A Home liga as acções via [onMenuItemSelected].
 */
class SideMenuView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : LinearLayout(context, attrs, defStyleAttr) {

    enum class MenuItem(val label: String, val iconRes: Int) {
        HOME("Início", R.drawable.ic_nav_home),
        DRIVES("Drives", R.drawable.ic_folder),
        SIMULADOS("Simulados", R.drawable.ic_nav_simulados),
        MEGGY("Meggy", R.drawable.ic_nav_meggy),
        DOWNLOADS("Downloads", R.drawable.ic_nav_downloads),
        SETTINGS("Ajustes", R.drawable.ic_nav_settings)
    }

    var onMenuItemSelected: ((MenuItem) -> Unit)? = null
    var onCollapseToggled: (() -> Unit)? = null
    /** Sair (logout): o menu esconde o cabeçalho, onde vivia o Sair. */
    var onLogoutSelected: (() -> Unit)? = null

    private var selectedItem: MenuItem = MenuItem.HOME
    private val rowViews = HashMap<MenuItem, View>()
    private val rowLabels = HashMap<MenuItem, TextView>()
    private var collapseLabel: TextView? = null

    init {
        orientation = VERTICAL
        setBackgroundColor(ContextCompat.getColor(context, R.color.tile_bg))
        val pad = dp(12f)
        setPadding(pad, dp(20f), pad, dp(16f))
        buildRows()
    }

    private fun dp(value: Float): Int =
        TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, value, resources.displayMetrics
        ).toInt()

    private fun buildRows() {
        // Logo: ícone da app + "Meggy" (a abelha do conceito é arte
        // gerada, NÃO é a marca — fica a cara real da Meggy, o ícone).
        val logoRow = LinearLayout(context).apply {
            orientation = HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 0, 0, dp(16f))
        }
        val logo = ImageView(context).apply {
            setImageResource(R.drawable.ic_launcher_foreground_img)
            layoutParams = LayoutParams(dp(40f), dp(40f))
        }
        val logoText = TextView(context).apply {
            text = context.getString(R.string.app_name)
            setTextColor(ContextCompat.getColor(context, R.color.md_primary))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
            setTypeface(null, android.graphics.Typeface.BOLD)
            setPadding(dp(10f), 0, 0, 0)
            tag = TAG_LOGO_TEXT
        }
        logoRow.addView(logo)
        logoRow.addView(logoText)
        addView(logoRow)

        for (item in MenuItem.values()) {
            addView(buildRow(item))
        }

        // Espaço flexível + rodapé: recolher + versão.
        val spacer = View(context).apply {
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f)
        }
        addView(spacer)

        val collapse = buildRow(null, TAG_COLLAPSE_LABEL)
        collapse.setOnClickListener { onCollapseToggled?.invoke() }
        addView(collapse)

        // Sair: o cabeçalho some com o menu ligado — o logout vive
        // aqui (linha de texto, sem ícone: não há ícone de sair nos
        // drawables e o texto basta).
        val logoutRow = buildRow(null, TAG_LOGOUT_TEXT).apply {
            setOnClickListener { onLogoutSelected?.invoke() }
        }
        logoutRow.findViewWithTag<TextView>(TAG_LOGOUT_TEXT)?.text =
            context.getString(R.string.logout)
        addView(logoutRow)

        val version = TextView(context).apply {
            text = context.getString(
                R.string.side_menu_version, BuildConfig.VERSION_NAME
            )
            setTextColor(
                ContextCompat.getColor(context, R.color.md_on_surface_variant)
            )
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
            setPadding(dp(12f), dp(12f), dp(12f), 0)
            tag = TAG_VERSION_TEXT
        }
        addView(version)
        applyCollapsed(SessionManager.get(context).tvSideMenuCollapsed)
    }

    /**
     * Uma linha do menu: ícone + rótulo. [item] null = linha de
     * acção (recolher/expandir ou Sair): só o rótulo, sem ícone.
     * [labelTag] distingue as duas (o rótulo de recolher muda com o
     * estado; o de Sair é fixo).
     */
    private fun buildRow(item: MenuItem?, labelTag: String? = null): LinearLayout {
        val row = LinearLayout(context).apply {
            id = View.generateViewId()
            orientation = HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, dp(48f)).apply {
                bottomMargin = dp(4f)
            }
            setPadding(dp(12f), 0, dp(12f), 0)
            isClickable = true
            isFocusable = true
            isFocusableInTouchMode = true
            background = ContextCompat.getDrawable(context, R.drawable.focus_ring_transparent)
        }
        if (item != null) {
            val icon = ImageView(context).apply {
                layoutParams = LayoutParams(dp(24f), dp(24f))
                setImageResource(item.iconRes)
                setColorFilter(ContextCompat.getColor(context, R.color.md_on_surface))
            }
            row.addView(icon)
        }
        val label = TextView(context).apply {
            text = item?.label ?: ""
            setTextColor(ContextCompat.getColor(context, R.color.md_on_surface))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            setPadding(if (item == null) 0 else dp(12f), 0, 0, 0)
            if (labelTag != null) tag = labelTag
        }
        row.addView(label)
        if (item != null) {
            rowViews[item] = row
            rowLabels[item] = label
            row.setOnClickListener {
                setSelected(item)
                onMenuItemSelected?.invoke(item)
            }
            FocusAnimator.attach(row, true)
        } else {
            // Linha de acção: o rótulo de recolher é o que muda com o
            // estado; o de Sair fica como está.
            if (labelTag == TAG_COLLAPSE_LABEL) collapseLabel = label
            FocusAnimator.attach(row, true)
        }
        return row
    }

    /** Linhas do menu (p/ as cadeias de foco da Home). */
    fun rows(): List<View> = rowViews.values.toList()

    /** Marca o item actual (fundo rosa suave). */
    fun setSelected(item: MenuItem) {
        selectedItem = item
        val primary = ContextCompat.getColor(context, R.color.md_primary)
        val selectedBg = (primary and 0x00FFFFFF) or 0x28000000
        for ((key, row) in rowViews) {
            row.setBackgroundColor(
                if (key == item) selectedBg else android.graphics.Color.TRANSPARENT
            )
        }
    }

    /** Id da vista da linha seleccionada (p/ nextFocusLeft do conteúdo). */
    fun selectedRowId(): Int = rowViews[selectedItem]?.id ?: View.NO_ID

    /**
     * Aplica o estado recolhido/expandido: largura da coluna + rótulos
     * visíveis ou não. A Home volta a correr o TvAutoFit depois disto
     * (a largura do conteúdo muda).
     */
    fun applyCollapsed(collapsed: Boolean) {
        val widthDp = if (collapsed) WIDTH_COLLAPSED_DP else WIDTH_EXPANDED_DP
        layoutParams = layoutParams?.apply {
            width = dp(widthDp)
        } ?: LayoutParams(dp(widthDp), LayoutParams.MATCH_PARENT)
        val showLabels = !collapsed
        for ((_, label) in rowLabels) label.visibility = if (showLabels) View.VISIBLE else View.GONE
        // O rótulo do logo e a versão somem recolhido; a linha de
        // recolher mostra "Expandir »" (ou "« Recolher" expandido).
        findViewWithTag<TextView>(TAG_LOGO_TEXT)?.visibility =
            if (showLabels) View.VISIBLE else View.GONE
        findViewWithTag<TextView>(TAG_VERSION_TEXT)?.visibility =
            if (showLabels) View.VISIBLE else View.GONE
        collapseLabel?.text = context.getString(
            if (collapsed) R.string.side_menu_expand else R.string.side_menu_collapse
        )
        requestLayout()
    }

    companion object {
        const val WIDTH_EXPANDED_DP = 240f
        const val WIDTH_COLLAPSED_DP = 64f
        private const val TAG_LOGO_TEXT = "side_menu_logo_text"
        private const val TAG_VERSION_TEXT = "side_menu_version_text"
        private const val TAG_COLLAPSE_LABEL = "side_menu_collapse_label"
        private const val TAG_LOGOUT_TEXT = "side_menu_logout_text"

        /**
         * Largura actual do menu em dp (0 = sem menu: celular, ou TV
         * com o menu desligado). É isto que o TvAutoFit desconta da
         * largura do viewport p/ dimensionar o conteúdo.
         */
        fun currentWidthDp(context: Context): Float {
            val sm = SessionManager.get(context)
            if (!TvUtils.isTv(context) || !sm.tvSideMenuEnabled) return 0f
            return if (sm.tvSideMenuCollapsed) WIDTH_COLLAPSED_DP else WIDTH_EXPANDED_DP
        }
    }
}
