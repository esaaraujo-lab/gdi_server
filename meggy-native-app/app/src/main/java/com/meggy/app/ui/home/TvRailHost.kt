package com.meggy.app.ui.home

import android.app.Activity
import android.content.Intent
import android.view.View
import android.view.ViewGroup
import com.meggy.app.ui.detail.DetailActivity
import com.meggy.app.ui.downloads.DownloadsActivity
import com.meggy.app.ui.login.LoginActivity
import com.meggy.app.ui.settings.SettingsActivity
import com.meggy.app.util.PlaylistManager
import com.meggy.app.util.SessionManager
import com.meggy.app.util.TvUtils

/**
 * 2.7.58 — anfitrião do rail lateral persistente da TV (decisão do
 * Elton 2026-11-25 19:19): o [SideMenuView] estilo Plex fica presente
 * em TODAS as páginas da TV (Detalhe, Explorar, Busca, Minha Lista,
 * Ajustes e as telas novas), excepto no player (vídeo em tela cheia).
 *
 * Este helper liga, num só sítio, o comportamento que a Home já tinha
 * (2.7.56): barra recolhida a 56dp, conteúdo com margem fixa de 56dp
 * (nunca refluí), expansão ao foco com o conteúdo a DESLIZAR por
 * baixo (translationX), e a navegação padrão dos itens. A Home NÃO
 * usa este helper (a montagem dela é a original, intocada); as outras
 * telas chamam [attach] no onCreate, só na TV.
 *
 * Menu da TV (decisões 19:19–19:25): Início, Drives, MEUS CURSOS,
 * CONTINUAR, Downloads, Ajustes + Sair. Sem Meggy nem Simulados (a TV
 * é só vídeo). CONTINUAR abre o curso em curso pelo caminho NORMAL —
 * o detalhe do curso (o mesmo destino conceptual do cartão Continuar
 * da Home), NUNCA o player directo (correcção do Elton 19:25).
 */
object TvRailHost {

    /**
     * Liga o rail de uma tela. [menu] é o SideMenuView do
     * layout-television da tela; [content] é o contentor do conteúdo
     * (recebe a margem de 56dp e o deslize); [selected] é o item que
     * representa a tela actual; [firstContentId] é o id da 1.ª vista
     * de conteúdo (alvo do RIGHT das linhas do menu). Sem TV ou com o
     * menu desligado nos Ajustes, esconde o rail e sai.
     */
    fun attach(
        activity: Activity,
        menu: SideMenuView?,
        content: View?,
        selected: SideMenuView.MenuItem,
        firstContentId: Int
    ) {
        if (menu == null) return
        if (!TvUtils.isTv(activity)) {
            menu.visibility = View.GONE
            return
        }
        val sm = SessionManager.get(activity)
        val enabled = sm.tvSideMenuEnabled
        menu.visibility = if (enabled) View.VISIBLE else View.GONE
        if (content != null) {
            val lp = content.layoutParams as? ViewGroup.MarginLayoutParams
            if (lp != null) {
                val target = if (enabled) {
                    (SideMenuView.WIDTH_COLLAPSED_DP * activity.resources.displayMetrics.density).toInt()
                } else 0
                if (lp.marginStart != target) {
                    lp.marginStart = target
                    content.layoutParams = lp
                }
            }
        }
        if (!enabled) return
        menu.setSelected(selected)
        menu.onMenuItemSelected = { item -> navigate(activity, item) }
        menu.onLogoutSelected = { logout(activity) }
        val slidePx = (SideMenuView.WIDTH_EXPANDED_DP - SideMenuView.WIDTH_COLLAPSED_DP) *
            activity.resources.displayMetrics.density
        menu.onExpandFractionChanged = { f -> content?.translationX = slidePx * f }
        if (firstContentId != View.NO_ID) {
            menu.rows().forEach { row -> row.nextFocusRightId = firstContentId }
        }
    }

    /** Navegação padrão dos itens do menu TV (a mesma em todas as telas). */
    fun navigate(activity: Activity, item: SideMenuView.MenuItem) {
        when (item) {
            SideMenuView.MenuItem.HOME -> {
                if (activity is HomeActivity) {
                    activity.findViewById<View>(com.meggy.app.R.id.homeScroll)?.scrollTo(0, 0)
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
     * maior progresso (o mesmo cálculo do destaque da Home) — de onde
     * o aluno continua pelo caminho normal. Sem aula em curso, abre a
     * Home (escolha registada: o item nunca fica morto).
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
     * Home (2.7.54, `HomeActivity.disciplineFolderOf`, que é privada):
     * pasta-de-aula (começa por "aula", contém " - parte " ou é
     * "NNN - aula") sobe para a pasta-mãe; nunca acima do 1.º nível
     * dentro do drive ("/N:/<raiz>").
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
