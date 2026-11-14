package com.meggy.app.util

import com.meggy.app.data.DriveItem

/**
 * v2.7.11 — arte-padrão por drive/curso (substitui o monograma com
 * letras, que NUNCA mais é usado como thumb — nem no hero, nem nos
 * cards "Continue assistindo", nem no destaque da TV).
 *
 * O ícone é o emoji curado do drive (DriveItem.icon). O path
 * "/N:/..." dá o índice do drive (vale também para o drivePath do
 * destaque, "/0:/", "/10:/" ...). Sem índice válido, "📁".
 */
object ThumbArt {
    fun driveIconFor(folderPath: String): String {
        val idx = Regex("^/(\\d+):").find(folderPath.trim())
            ?.groupValues?.getOrNull(1)?.toIntOrNull()
        return if (idx != null) DriveItem.ALL.getOrNull(idx)?.icon ?: "\uD83D\uDCC1" else "\uD83D\uDCC1"
    }
}
