package com.vovofit.app.ui.home

import android.animation.ValueAnimator
import android.content.Context
import android.content.res.ColorStateList
import android.util.AttributeSet
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewTreeObserver
import android.view.animation.DecelerateInterpolator
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.vovofit.app.BuildConfig
import com.vovofit.app.R
import com.vovofit.app.util.FocusAnimator
import com.vovofit.app.util.TvUtils

/**
 * 1.0.40 — Menu lateral da TV estilo Plex (porte do SideMenuView da
 * Meggy 2.7.56/2.7.58, adaptado à Vovó — é a PRIMEIRA ronda visual de
 * TV da Vovó):
 *
 * - Em repouso a barra tem 56dp só com ícones; quando o foco ENTRA
 *   no menu, expande para 240dp com os rótulos; quando o foco SAI
 *   para o conteúdo, recolhe. A expansão é UM ValueAnimator que
 *   interpola largura + alfa dos rótulos, e avisa o anfitrião por
 *   [onExpandFractionChanged] para o conteúdo DESLIZAR por baixo
 *   (translationX) sem nunca ser re-medido.
 * - Item seleccionado = tinta da marca a 16%; item focado = pílula
 *   sólida na cor primária com ícone/rótulo em md_on_primary
 *   (escuro sobre o lima — contraste legível; fundo
 *   [R.drawable.side_menu_row_bg] + ColorStateList com
 *   duplicateParentState nas vistas da linha).
 *
 * ADAPTAÇÕES vs Meggy (registadas no relatório da ronda):
 * - A Vovó NÃO tem o interruptor `tvSideMenuEnabled` no
 *   SessionManager (motor protegido, intocado): na TV o rail está
 *   SEMPRE presente (excepto no player, onde nem é montado).
 * - Público +60: rótulos a 18sp e ícones de 28dp (a Meggy usa
 *   16sp/24dp) — legibilidade manda sobre a réplica exacta.
 * - Menu SEM chat e SEM simulados (regra da TV): Início, Explorar,
 *   Meus Cursos, Continuar, Downloads, Ajustes + Sair no rodapé.
 *   CONTINUAR abre o curso em curso pelo DETALHE (caminho normal,
 *   nunca o player directo) — ver [TvRailHost.openContinueCourse].
 */
class SideMenuView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : LinearLayout(context, attrs, defStyleAttr) {

    enum class MenuItem(val label: String, val iconRes: Int) {
        HOME("Início", R.drawable.ic_nav_home),
        DRIVES("Explorar", R.drawable.ic_folder),
        MY_COURSES("Meus Cursos", R.drawable.ic_nav_courses),
        CONTINUE("Continuar", R.drawable.ic_nav_continue),
        DOWNLOADS("Downloads", R.drawable.ic_nav_downloads),
        SETTINGS("Ajustes", R.drawable.ic_nav_settings)
    }

    var onMenuItemSelected: ((MenuItem) -> Unit)? = null
    /** Sair (logout): o menu esconde o cabeçalho, onde vivia o Sair. */
    var onLogoutSelected: (() -> Unit)? = null
    /**
     * Fracção de expansão 0..1 a cada frame da animação (0 =
     * recolhido 56dp, 1 = expandido 240dp). O anfitrião traduz o
     * conteúdo por (240−56)dp × fracção — desliza, nunca refluí.
     */
    var onExpandFractionChanged: ((Float) -> Unit)? = null

    private var selectedItem: MenuItem = MenuItem.HOME
    private val rowViews = HashMap<MenuItem, View>()
    private val rowLabels = HashMap<MenuItem, TextView>()
    private val actionLabels = mutableListOf<TextView>()
    private val allRows = mutableListOf<LinearLayout>()
    private var logoText: TextView? = null
    private var versionText: TextView? = null

    private var expandFraction = 0f
    private var expandTarget = 0f
    private var expandAnimator: ValueAnimator? = null
    private var focusObserver: ViewTreeObserver? = null
    private val globalFocusListener =
        ViewTreeObserver.OnGlobalFocusChangeListener { _, newFocus ->
            // O foco dentro do menu expande; fora (ou nenhum) recolhe.
            setExpanded(newFocus != null && isDescendantOfMenu(newFocus))
        }

    init {
        orientation = VERTICAL
        setBackgroundColor(ContextCompat.getColor(context, R.color.tile_bg))
        setPadding(dp(8f), dp(20f), dp(8f), dp(16f))
        buildRows()
        applyFraction(0f)
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        if (focusObserver == null) {
            focusObserver = viewTreeObserver
            focusObserver?.addOnGlobalFocusChangeListener(globalFocusListener)
        }
    }

    override fun onDetachedFromWindow() {
        expandAnimator?.cancel()
        val observer = focusObserver
        if (observer != null && observer.isAlive) {
            observer.removeOnGlobalFocusChangeListener(globalFocusListener)
        }
        focusObserver = null
        super.onDetachedFromWindow()
    }

    private fun isDescendantOfMenu(v: View): Boolean {
        var cur: View? = v
        while (cur != null) {
            if (cur === this) return true
            cur = cur.parent as? View
        }
        return false
    }

    /** Expande/recolhe com a animação única (~200ms). */
    private fun setExpanded(expanded: Boolean) {
        val target = if (expanded) 1f else 0f
        if (target == expandTarget) return
        expandTarget = target
        expandAnimator?.cancel()
        if (!isAttachedToWindow) {
            applyFraction(target)
            return
        }
        expandAnimator = ValueAnimator.ofFloat(expandFraction, target).apply {
            duration = 200L
            interpolator = DecelerateInterpolator()
            addUpdateListener { applyFraction(it.animatedValue as Float) }
            start()
        }
    }

    /**
     * Aplica a fracção: largura da barra (56→240dp), alfa/visibilidade
     * dos rótulos e os paddings horizontais.
     */
    private fun applyFraction(f: Float) {
        expandFraction = f
        val widthDp = WIDTH_COLLAPSED_DP + (WIDTH_EXPANDED_DP - WIDTH_COLLAPSED_DP) * f
        val lp = layoutParams
        if (lp != null) {
            lp.width = dp(widthDp)
            layoutParams = lp
        }
        val padH = dp(8f + 4f * f)
        setPadding(padH, dp(20f), padH, dp(16f))
        for (row in allRows) {
            row.setPadding(padH, 0, padH, 0)
        }
        val labelsVisible = f > 0.01f
        for ((_, label) in rowLabels) {
            label.visibility = if (labelsVisible) View.VISIBLE else View.GONE
            label.alpha = f
        }
        for (label in actionLabels) {
            label.visibility = if (labelsVisible) View.VISIBLE else View.GONE
            label.alpha = f
        }
        logoText?.let {
            it.visibility = if (labelsVisible) View.VISIBLE else View.GONE
            it.alpha = f
        }
        versionText?.let {
            it.visibility = if (labelsVisible) View.VISIBLE else View.GONE
            it.alpha = f
        }
        onExpandFractionChanged?.invoke(f)
    }

    private fun dp(value: Float): Int =
        TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, value, resources.displayMetrics
        ).toInt()

    /**
     * Cor com estados p/ ícone/rótulo da linha: focado =
     * md_on_primary (escuro, legível sobre a pílula lima da marca).
     */
    private fun focusableTintList(defaultColorRes: Int): ColorStateList {
        val focused = ContextCompat.getColor(context, R.color.md_on_primary)
        val normal = ContextCompat.getColor(context, defaultColorRes)
        return ColorStateList(
            arrayOf(
                intArrayOf(android.R.attr.state_focused),
                intArrayOf()
            ),
            intArrayOf(focused, normal)
        )
    }

    private fun buildRows() {
        // Logo: a identidade da app (a mesma imagem do launcher) +
        // nome. Sem arte nova — é o asset que já existe na árvore.
        val logoRow = LinearLayout(context).apply {
            orientation = HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 0, 0, dp(16f))
        }
        val logo = ImageView(context).apply {
            setImageResource(R.drawable.ic_launcher_foreground_img)
            layoutParams = LayoutParams(dp(40f), dp(40f))
        }
        val logoLabel = TextView(context).apply {
            text = context.getString(R.string.app_name)
            setTextColor(ContextCompat.getColor(context, R.color.md_primary))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
            setTypeface(null, android.graphics.Typeface.BOLD)
            setPadding(dp(10f), 0, 0, 0)
        }
        logoText = logoLabel
        logoRow.addView(logo)
        logoRow.addView(logoLabel)
        addView(logoRow)

        for (item in MenuItem.values()) {
            addView(buildRow(item))
        }

        // Espaço flexível + rodapé: Sair + versão.
        val spacer = View(context).apply {
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f)
        }
        addView(spacer)

        // Sair: o cabeçalho some com o menu ligado — o logout vive
        // aqui (linha de texto, sem ícone).
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
        }
        versionText = version
        addView(version)
    }

    /**
     * Uma linha do menu: ícone + rótulo. [item] null = linha de
     * acção (Sair): só o rótulo, sem ícone. O fundo é o selector
     * estilo Plex (seleccionado 16% / focado sólido); ícone e rótulo
     * herdam o estado de foco da linha (duplicateParentState).
     */
    private fun buildRow(item: MenuItem?, labelTag: String? = null): LinearLayout {
        val row = LinearLayout(context).apply {
            id = View.generateViewId()
            orientation = HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, dp(52f)).apply {
                bottomMargin = dp(4f)
            }
            setPadding(dp(8f), 0, dp(8f), 0)
            isClickable = true
            isFocusable = true
            isFocusableInTouchMode = true
            background = ContextCompat.getDrawable(context, R.drawable.side_menu_row_bg)
        }
        allRows.add(row)
        if (item != null) {
            val icon = ImageView(context).apply {
                layoutParams = LayoutParams(dp(28f), dp(28f))
                setImageResource(item.iconRes)
                imageTintList = focusableTintList(R.color.md_on_surface)
                setDuplicateParentStateEnabled(true)
            }
            row.addView(icon)
        }
        val label = TextView(context).apply {
            text = item?.label ?: ""
            setTextColor(focusableTintList(R.color.md_on_surface))
            setDuplicateParentStateEnabled(true)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
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
        } else {
            actionLabels.add(label)
        }
        FocusAnimator.attach(row, true, FocusAnimator.SCALE_TV_NONE)
        return row
    }

    /** Linhas do menu (p/ as cadeias de foco do anfitrião). */
    fun rows(): List<View> = rowViews.values.toList()

    /** Marca o item actual (tinta da marca 16% via estado seleccionado). */
    fun setSelected(item: MenuItem) {
        selectedItem = item
        for ((key, row) in rowViews) {
            row.isSelected = key == item
        }
    }

    /** Id da vista da linha seleccionada (p/ nextFocusLeft do conteúdo). */
    fun selectedRowId(): Int = rowViews[selectedItem]?.id ?: View.NO_ID

    companion object {
        const val WIDTH_EXPANDED_DP = 240f
        /** Repouso Plex: 56dp só ícones. */
        const val WIDTH_COLLAPSED_DP = 56f
        private const val TAG_LOGOUT_TEXT = "side_menu_logout_text"

        /**
         * Largura do menu DESCONTADA do viewport do conteúdo, em dp
         * (0 = sem menu: celular). Na TV é sempre a largura de
         * REPOUSO — a expansão desliza sobre o conteúdo sem o
         * refluir. (A Meggy desconta 0 com o menu desligado nos
         * Ajustes; a Vovó não tem esse interruptor — ver KDoc.)
         */
        fun currentWidthDp(context: Context): Float {
            if (!TvUtils.isTv(context)) return 0f
            return WIDTH_COLLAPSED_DP
        }
    }
}
