"use client";

import { useStore } from "@/lib/stores-combined";
import { formatBRL } from "@/lib/pix";
import { ArrowRight, Clock } from "lucide-react";
import SkeletonImage from "./SkeletonImage";

export default function RecentlyViewed() {
  const recentlyViewed = useStore((s) => s.recentlyViewed);
  const products = useStore((s) => s.products);

  // Remove o produto atual se já estiver no catálogo, mostra até 4 vistos recentemente
  const recent = recentlyViewed
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .slice(0, 4);

  if (recent.length === 0) return null;

  return (
    <section
      id="recentlyViewedSection"
      className="py-10 px-4 sm:px-8 max-w-7xl mx-auto border-t border-gold-500/10"
    >
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gold-500/15 border border-gold-500/30 flex items-center justify-center text-gold-400 shrink-0">
            <Clock size={14} />
          </div>
          <h3 className="font-serif-luxury text-xl sm:text-2xl font-bold text-white truncate">
            Vistos Recentemente
          </h3>
          <span className="hidden sm:inline-flex text-[10px] uppercase tracking-wider text-gold-300/60 border border-gold-500/20 px-2 py-0.5 rounded-full shrink-0">
            Sua jornada olfativa
          </span>
        </div>
        <span className="text-[10px] text-gray-500 shrink-0">
          {recent.length} de 4
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {recent.map((p, i) => (
          <button
            key={p.id}
            onClick={() =>
              window.dispatchEvent(new CustomEvent("openSlideIn", { detail: p }))
            }
            className="glass-panel rounded-xl p-3 border border-gold-500/10 hover:border-gold-400/40 transition-all text-left group hover:-translate-y-1 duration-300"
            style={{
              animation: `recentFadeUp 0.5s ease-out ${i * 0.08}s both`,
            }}
          >
            <div className="relative w-full h-32 rounded-lg overflow-hidden mb-2 bg-obsidian-950 p-2">
              <SkeletonImage
                src={p.image}
                alt={p.name}
                className="w-full h-full group-hover:scale-105 transition-transform duration-500"
                fit="contain"
              />
              <span className="absolute top-1 left-1 text-[9px] uppercase tracking-wider bg-obsidian-950/80 backdrop-blur-sm text-gold-200 px-1.5 py-0.5 rounded-full border border-gold-500/20">
                {p.code}
              </span>
              {/* Arrow icon on hover (top-right) */}
              <div className="absolute top-1 right-1 w-6 h-6 rounded-full bg-obsidian-950/80 backdrop-blur-sm text-gold-300 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity border border-gold-500/20">
                <ArrowRight size={10} />
              </div>
            </div>
            <h4 className="text-[11px] font-bold text-white truncate group-hover:text-gold-200 transition-colors">
              {p.name}
            </h4>
            <p className="text-[10px] text-gold-300 truncate">
              {p.inspiration}
            </p>
            <span className="text-xs font-serif-luxury font-bold text-gold-400 mt-1 block">
              {formatBRL(p.price)}
            </span>
          </button>
        ))}
      </div>

      <style>{`
        @keyframes recentFadeUp {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </section>
  );
}
