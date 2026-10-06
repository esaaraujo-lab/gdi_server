"use client";

import { useCompareStore } from "@/lib/compare-store";
import { GitCompareArrows, X } from "lucide-react";

/**
 * Botão flutuante que mostra a comparação ativa.
 * Aparece quando há pelo menos 1 perfume na lista de comparação.
 * Fica no canto inferior esquerdo (acima do FloatingWhatsApp).
 * Mostra badge com contagem.
 *
 * Pulse animation: usa CSS-only (keyframes aplicado quando compareCount muda
 * via o atributo key={compareCount} que força re-render e dispara animação).
 */
export default function FloatingCompareButton() {
  const ids = useCompareStore((s) => s.ids);
  const setModalOpen = useCompareStore((s) => s.setModalOpen);
  const clearCompare = useCompareStore((s) => s.clearCompare);
  const compareCount = ids.length;

  if (compareCount === 0) return null;

  return (
    <div className="fixed bottom-20 left-4 sm:left-6 z-[55] flex flex-col items-start gap-2">
      <div className="flex flex-col gap-1.5 mb-1 max-h-32 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
        {/* Botão principal: abrir modal — key={compareCount} força re-mount para disparar animação */}
        <button
          key={compareCount}
          onClick={() => setModalOpen(true)}
          className="relative flex items-center gap-2 bg-gradient-to-r from-gold-500 to-amber-400 text-obsidian-950 px-4 py-2.5 rounded-full shadow-2xl shadow-gold-500/40 hover:scale-105 transition-all font-bold text-xs uppercase tracking-wider border-2 border-gold-200 floating-compare-pulse"
          aria-label={`Ver comparação com ${compareCount} perfume(s)`}
        >
          <GitCompareArrows size={16} />
          <span>Comparar ({compareCount})</span>
          {/* Badge com contagem */}
          <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-obsidian-950">
            {compareCount}
          </span>
        </button>
        {/* Limpar comparação */}
        <button
          onClick={() => {
            if (confirm("Limpar todos os perfumes da comparação?")) {
              clearCompare();
            }
          }}
          className="text-[10px] uppercase tracking-wider text-gray-500 hover:text-red-400 flex items-center gap-1 ml-2"
        >
          <X size={10} /> Limpar
        </button>
      </div>
      <style jsx>{`
        @keyframes comparePulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(212, 175, 55, 0.6); }
          50% { transform: scale(1.05); box-shadow: 0 0 0 12px rgba(212, 175, 55, 0); }
        }
        .floating-compare-pulse {
          animation: comparePulse 0.7s ease-out;
        }
      `}</style>
    </div>
  );
}
