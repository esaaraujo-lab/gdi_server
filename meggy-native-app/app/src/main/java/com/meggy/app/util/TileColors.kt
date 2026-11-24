package com.meggy.app.util

/**
 * Ronda 27 — cores fixas da área do nome dos Tiles de pasta
 * (navegação dos drives; celular e TV).
 *
 * Os Tiles partilham todos a mesma imagem de capa — sem cor, a
 * grelha parece um fundo único. A área do nome de cada Tile leva
 * uma cor FIXA da paleta abaixo, em vez do fundo igual em todos.
 *
 * Regras (Elton 2026-11-24 11:09, extensão 11:10 — vale também na TV):
 * - a imagem fica; a cor vai SÓ na área do nome do Tile;
 * - contraste forte: texto branco sobre estas cores dá 8,0–9,9:1
 *   (medido; o rosa da app #FF8B9F daria só 2,2:1 e NÃO entra);
 * - vizinhos sempre diferentes (esquerda/direita e cima/baixo);
 * - determinística por pasta: a mesma pasta tem sempre a mesma cor
 *   ao rolar e ao reabrir — nada de aleatório a cada render;
 * - paleta pequena e fixa (5 cores chegam p/ 3 colunas: com 2
 *   vizinhos bloqueados sobram sempre ≥3 livres).
 *
 * A atribuição é uma função pura da lista ORDENADA + spanCount:
 * base = hash(chave) % 5; se a cor bater com o vizinho da esquerda
 * (i-1, mesma linha) ou de cima (i-span), soma-se +1 (mod 5) até
 * diferir. N ≥ 4 garante sempre solução. A chave é o caminho da
 * pasta (FileAdapter) ou o folderPath do grupo (LessonGridAdapter).
 *
 * NÃO usar aqui: RailAdapter (tela inicial — Destaques, herói e
 * "Continue assistindo" ficam como estão, por ordem do Elton).
 */
object TileColors {

    /** Paleta fixa (5 cores escuras/saturadas; texto branco ≥ 8,0:1). */
    val PALETTE: IntArray = intArrayOf(
        0xFF7A2E45.toInt(), // vinho (família do rosa da app)
        0xFF4B3A6B.toInt(), // violeta
        0xFF1F4E5F.toInt(), // petróleo
        0xFF2E4F38.toInt(), // musgo
        0xFF6B4A1F.toInt()  // âmbar escuro
    )

    /**
     * Atribui uma cor por chave, garantindo que nenhum Tile repete a
     * cor do vizinho da esquerda nem do de cima. Determinística:
     * mesmas chaves na mesma ordem + mesmo span = mesmas cores.
     */
    fun assign(keys: List<String>, span: Int): List<Int> {
        val spanCount = if (span < 1) 1 else span
        val out = IntArray(keys.size)
        for (i in keys.indices) {
            var idx = Math.floorMod(hash(keys[i]), PALETTE.size)
            var guard = 0
            while (guard <= PALETTE.size) {
                val left = if (i % spanCount != 0) out[i - 1] else null
                val above = if (i >= spanCount) out[i - spanCount] else null
                val color = PALETTE[idx]
                if ((left == null || color != left) && (above == null || color != above)) break
                idx = (idx + 1) % PALETTE.size
                guard++
            }
            out[i] = PALETTE[idx]
        }
        return out.toList()
    }

    /** Mesmo hash de Models.colorFromString (estável entre execuções). */
    private fun hash(str: String): Int {
        var h = 0
        for (c in str) h = c.code + ((h shl 5) - h)
        return h
    }
}
