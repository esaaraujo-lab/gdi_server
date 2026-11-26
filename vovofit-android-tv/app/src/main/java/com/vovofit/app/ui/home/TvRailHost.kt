package com.vovofit.app.ui.home

import android.app.Activity
import android.content.Intent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import com.vovofit.app.R
import com.vovofit.app.ui.detail.DetailActivity
import com.vovofit.app.ui.downloads.DownloadsActivity
import com.vovofit.app.ui.login.LoginActivity
import com.vovofit.app.ui.settings.SettingsActivity
import com.vovofit.app.util.PlaylistManager
import com.vovofit.app.util.SessionManager
import com.vovofit.app.util.TvUtils

/**
 * 1.0.40 — anfitrião do rail lateral persistente da TV (porte do
 * TvRailHost da Meggy 2.7.58, adaptado à estrutura da Vovó):
 * o [SideMenuView] estilo Plex fica presente em TODAS as páginas da
 * TV (Home, Detalhe, Explorar, Busca, Minha Lista, Ajustes e as
 * telas novas), excepto no player (vídeo em tela cheia — lá o rail
 * nem é montado).
 *
 * DIVERGÊNCIA vs Meggy (registada no relatório da ronda): na Meggy o
 * rail é declarado no layout-television de cada tela; a Vovó só tem
 * layout-television para Home/Detalhe/Player/Splash — as outras
 * telas reusam o layout do celular. Para um comportamento uniforme
 * sem duplicar layouts, aqui o rail é INJECTADO por código: a raiz
 * actual da activity é embrulhada num FrameLayout com o conteúdo
 * deslocado 56dp (margem fixa — nunca refluí) e o menu por cima; a
 * expansão desliza o conteúdo por translationX, como na Meggy. A
 * vista raiz continua a ser o mesmo objecto (o ViewBinding de cada
 * tela não é afectado).
 *
 * Menu da TV (decisões do Elton 2026-11-25 19:19–19:25, aplicadas à
 * Vovó): Início, Explorar, MEUS CURSOS, CONTINUAR, Downloads,
 * Ajustes + Sair. Sem assistente nem simulados na TV (a TV é só
 * vídeo; a assistente fitness é só do celular). CONTINUAR abre o
 * curso em curso pelo caminho NORMAL — o detalhe do curso — NUNCA o
 * player directo (correcção do Elton 19:25).
 */
object TvRailHost {

    /**
     * Monta o rail numa tela da TV. [selected] é o item que
     * representa a tela actual; [firstContent] é a 1.ª vista de
     * conteúdo focável (alvo do RIGHT das linhas do menu). Fora da
     * TV não faz nada. Idempotente: uma segunda chamada na mesma
     * activity não volta a embrulhar.
     */
    fun attach(
        activity: Activity,
        selected: SideMenuView.MenuItem,
        firstContent: View?
    ) {
        if (!TvUtils.isTv(activity)) return
        val content = activity.findViewById<ViewGroup>(android.R.id.content) ?: return
        val root = content.getChildAt(0) ?: return
        if (root.getTag(R.id.tv_rail_host_attached) == true) return

        val density = activity.resources.displayMetrics.density
        val collapsedPx = (SideMenuView.WIDTH_COLLAPSED_DP * density).toInt()

        val wrapper = FrameLayout(activity)
        content.removeView(root)
        val rootLp = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )
        rootLp.marginStart = collapsedPx
        wrapper.addView(root, rootLp)

        val menu = SideMenuView(activity)
        val menuLp = FrameLayout.LayoutParams(
            collapsedPx,
            ViewGroup.LayoutParams.MATCH_PARENT
        )
        wrapper.addView(menu, menuLp)
        content.addView(
            wrapper,
            ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )
        root.setTag(R.id.tv_rail_host_attached, true)

        menu.setSelected(selected)
        menu.onMenuItemSelected = { item -> navigate(activity, item) }
        menu.onLogoutSelected = { logout(activity) }
        val slidePx = (SideMenuView.WIDTH_EXPANDED_DP - SideMenuView.WIDTH_COLLAPSED_DP) * density
        menu.onExpandFractionChanged = { f -> root.translationX = slidePx * f }
        val target = firstContent
        if (target != null) {
            if (target.id == View.NO_ID) target.id = View.generateViewId()
            menu.rows().forEach { row -> row.nextFocusRightId = target.id }
        }
    }

    /** Navegação padrão dos itens do menu TV (a mesma em todas as telas). */
    fun navigate(activity: Activity, item: SideMenuView.MenuItem) {
        when (item) {
            SideMenuView.MenuItem.HOME -> {
                if (activity is HomeActivity) {
                    activity.findViewById<View>(R.id.homeScroll)?.scrollTo(0, 0)
                } else {
                    activity.startActivity(Intent(activity, HomeActivity::class.java))
                }
            }
            SideMenuView.MenuItem.DRIVES -> {
                val intent = Intent(activity, HomeActivity::class.java)
                intent.putExtra(HomeActivity.EXTRA_SCROLL_TO_DRIVES, true)
                activity.startActivity(intent)
            }
            SideMenuView.MenuItem.MY_COURSES -> {
                if (activity !is MyCoursesActivity) {
                    activity.startActivity(Intent(activity, MyCoursesActivity::class.java))
                }
            }
            SideMenuView.MenuItem.CONTINUE -> openContinueCourse(activity)
            SideMenuView.MenuItem.DOWNLOADS -> {
                if (activity !is DownloadsActivity) {
                    activity.startActivity(Intent(activity, DownloadsActivity::class.java))
                }
            }
            SideMenuView.MenuItem.SETTINGS -> {
                if (activity !is SettingsActivity) {
                    activity.startActivity(Intent(activity, SettingsActivity::class.java))
                }
            }
        }
    }

    /**
     * CONTINUAR (correcção do Elton 19:25 — SEM directo): abre o
     * DETALHE do curso em curso — a disciplina da aula com resume de
     * maior progresso (o mesmo cálculo do destaque da Home) — de
     * onde a aluna continua pelo caminho normal. Sem aula em curso,
     * abre a Home (o item nunca fica morto).
     */
    fun openContinueCourse(activity: Activity) {
        val sm = SessionManager.get(activity)
        val best = sm.getRecents()
            .filter { sm.hasResume(it.folderPath, it.videoName) }
            .maxByOrNull { sm.getResumeProgress(it.folderPath, it.videoName) }
        if (best == null) {
            if (activity !is HomeActivity) {
                activity.startActivity(Intent(activity, HomeActivity::class.java))
            }
            return
        }
        val discipline = disciplineFolderOf(best.folderPath)
        val name = discipline.trimEnd('/').substringAfterLast('/')
        val intent = Intent(activity, DetailActivity::class.java)
        intent.putExtra("drivePath", discipline)
        intent.putExtra("folderName", name)
        activity.startActivity(intent)
    }

    /**
     * A pasta da disciplina de um caminho de aula — a MESMA regra da
     * Home da Meggy (2.7.54): pasta-de-aula (começa por "aula",
     * contém " - parte " ou é "NNN - aula") sobe para a pasta-mãe;
     * nunca acima do 1.º nível dentro do drive ("/N:/<raiz>").
     */
    fun disciplineFolderOf(folderPath: String): String {
        val clean = folderPath.trimEnd('/')
        val name = clean.substringAfterLast('/').lowercase()
        val isLessonFolder = name.startsWith("aula") ||
            name.contains(" - parte ") ||
            Regex("^\\d+\\s*[-–.]\\s*aula\\b").containsMatchIn(name)
        if (!isLessonFolder) return folderPath
        val parent = clean.substringBeforeLast('/', "")
        return if (parent.count { it == '/' } >= 2) parent else folderPath
    }

    /** Sair — o mesmo logout completo da Home (fullLogout + login). */
    fun logout(activity: Activity) {
        SessionManager.get(activity).fullLogout()
        PlaylistManager.clear()
        val intent = Intent(activity, LoginActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        activity.startActivity(intent)
        activity.finish()
    }
}
