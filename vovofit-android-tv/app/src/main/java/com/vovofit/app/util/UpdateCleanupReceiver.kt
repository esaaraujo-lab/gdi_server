package com.vovofit.app.util

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * §9 (GOLDEN_RULES.md, 2026-11-15) — apaga o APK de atualização da
 * pasta pública Download depois de a instalação ser confirmada.
 *
 * O sistema envia MY_PACKAGE_REPLACED ao próprio app quando ele é
 * atualizado; o receiver corre já na versão nova e apaga o APK que a
 * versão antiga descarregou (só apaga se a versão instalada for >= à
 * do APK — ver UpdateChecker.deleteDownloadedApkIfInstalled).
 * Cinto e suspensórios: a mesma limpeza corre no arranque, em
 * checkForUpdateThrottled/checkForUpdate, porque a primeira atualização
 * que trouxer este receiver ainda não o tinha instalado.
 */
class UpdateCleanupReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        try {
            UpdateChecker.deleteDownloadedApkIfInstalled(context)
        } catch (_: Exception) {
            // Best-effort: nunca rebentar o arranque do app.
        }
    }
}
