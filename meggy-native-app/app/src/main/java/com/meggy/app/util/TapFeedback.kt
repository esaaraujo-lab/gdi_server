package com.meggy.app.util

import android.os.SystemClock
import android.view.MotionEvent
import android.view.View

/**
 * Frente H — Feedback instantâneo ao toque + guarda contra duplo toque.
 *
 * DOIS problemas no caminho do toque (ver NOTES.md):
 *
 *  1. SEM FEEDBACK: os cards/linhas de vídeo só reagiam ao FOCO
 *     (FocusAnimator, 180 ms, pensado para o D-pad da TV). No celular
 *     não havia estado premido nenhum: os cards MaterialCardView
 *     (lesson/rail/drive) têm ripple no foreground, mas a lista PLANA
 *     (item_flat_lesson) e as linhas (item_lesson_child/header,
 *     item_search_result, item_mylist_card) não tinham ripple nenhum —
 *     e o selector `tile_focus_border` só reage a `state_focused`.
 *     [attachPress] dá o premido imediato: escala 0.97× em 90 ms no
 *     ACTION_DOWN (o ripple do foreground, quando existe, desenha
 *     logo no toque) e repõe no UP/CANCEL.
 *
 *  2. DUPLO TOQUE: todos os cards/linhas trazem
 *     `android:focusableInTouchMode="true"` (preciso para o D-pad na
 *     TV). No celular, em touch mode, o 1º toque é consumido a dar
 *     foco ao card — o clique só chega bem no 2º toque. [attachPress]
 *     desliga o focusableInTouchMode SÓ no celular (na TV é no-op e
 *     o foco D-pad da Frente A fica intacto); a view continua
 *     `focusable` (teclado/D-pad externo no celular continua a
 *     funcionar).
 *
 *  3. SEM RESPOSTA: antes de navegar, o Detail/Home/Browse corriam
 *     o CrossFolderPlaylist (1 listFolder ao pai + 1 por cada
 *     pasta-irmã, em lotes de 6) — dezenas de round-trips de rede em
 *     silêncio, sem feedback nenhum. Esse trabalho foi diferido para
 *     o PlayerActivity (ver enrichPlaylistInBackground); aqui fica só
 *     a guarda [tryNavigate]: um toque = uma navegação; toques
 *     repetidos no mesmo vídeo dentro de 1,5 s são ignorados, sem
 *     abrir o player duas vezes.
 */
object TapFeedback {

    /** Janela anti-duplo-toque (toques no mesmo vídeo). */
    private const val NAV_WINDOW_MS = 1500L

    /** Escala do estado premido (estilo Netflix/Prime: encolhe ~3%). */
    private const val PRESS_SCALE = 0.97f
    private const val PRESS_MS = 90L
    private const val RELEASE_MS = 140L

    /** Escala de foco no celular (FocusAnimator.SCALE_PHONE = 1.06). */
    private const val FOCUS_SCALE_PHONE = 1.06f

    private var lastNavKey: String? = null
    private var lastNavAtMs: Long = 0L

    /**
     * Guarda de navegação: retorna true só para o 1º toque numa chave
     * dentro da janela. A chave é o URL de playback (único por vídeo).
     * Sincronizado: dois toques na mesma frame não passam os dois.
     */
    @Synchronized
    fun tryNavigate(key: String, windowMs: Long = NAV_WINDOW_MS): Boolean {
        val now = SystemClock.uptimeMillis()
        if (key == lastNavKey && now - lastNavAtMs < windowMs) return false
        lastNavKey = key
        lastNavAtMs = now
        return true
    }

    /**
     * Feedback premido imediato num card/linha. No-op na TV (o foco
     * D-pad já dá o feedback). No celular desliga o
     * focusableInTouchMode (1º toque = clique) e anima a escala no
     * ACTION_DOWN. O listener NUNCA consome o toque (retorna false):
     * o clique continua a disparar normalmente.
     */
    fun attachPress(view: View, isTv: Boolean) {
        if (isTv) return
        view.isFocusableInTouchMode = false
        view.setOnTouchListener { v, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    v.animate().cancel()
                    v.animate().scaleX(PRESS_SCALE).scaleY(PRESS_SCALE)
                        .setDuration(PRESS_MS).start()
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    v.animate().cancel()
                    val target = if (v.hasFocus()) FOCUS_SCALE_PHONE else 1f
                    v.animate().scaleX(target).scaleY(target)
                        .setDuration(RELEASE_MS).start()
                }
            }
            false
        }
    }
}
