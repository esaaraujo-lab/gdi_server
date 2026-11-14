package com.meggy.app.util

import com.meggy.app.R
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
    /**
     * v2.7.11 onda 2 — capa GERADA por drive (c), fallback final da
     * hierarquia da capa: (a) cover_url do admin → (b) thumb do Drive
     * do 1º vídeo → (c) esta arte (res/drawable-nodpi/cover_<slug>.jpg,
     * 16:9, 1280x720, sem texto). Nunca monograma nem gradiente liso
     * como capa. Índice desconhecido → capa genérica de estudo
     * (plataformas_completas).
     */
    fun coverResForDriveIndex(index: Int): Int = when (index) {
        0 -> R.drawable.cover_reta_final_trts
        1 -> R.drawable.cover_plataformas_completas
        2 -> R.drawable.cover_vestibulares_plataformas
        3 -> R.drawable.cover_vestibulares_isoladas
        4 -> R.drawable.cover_musica_e_canto
        5 -> R.drawable.cover_carreiras_educacionais
        6 -> R.drawable.cover_clube_fit
        7 -> R.drawable.cover_hipopressivos
        8 -> R.drawable.cover_saude_e_medicina
        9 -> R.drawable.cover_tribunais
        10 -> R.drawable.cover_alfacon_2026
        11 -> R.drawable.cover_oab
        else -> R.drawable.cover_plataformas_completas
    }

    /** Capa gerada do drive de um path "/N:/..." (ou genérica). */
    fun coverResForPath(folderPath: String): Int {
        val idx = Regex("^/(\\d+):").find(folderPath.trim())
            ?.groupValues?.getOrNull(1)?.toIntOrNull()
        return coverResForDriveIndex(idx ?: -1)
    }

    /** Capa gerada de um DriveItem. */
    fun coverResForDrive(drive: DriveItem): Int = coverResForDriveIndex(drive.index)

    fun driveIconFor(folderPath: String): String {
        val idx = Regex("^/(\\d+):").find(folderPath.trim())
            ?.groupValues?.getOrNull(1)?.toIntOrNull()
        return if (idx != null) DriveItem.ALL.getOrNull(idx)?.icon ?: "\uD83D\uDCC1" else "\uD83D\uDCC1"
    }
}
