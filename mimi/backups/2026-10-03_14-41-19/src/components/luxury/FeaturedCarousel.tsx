"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/stores-combined";
import { formatBRL } from "@/lib/pix";
import { playSoftChime } from "@/lib/audio";
import { Award, Star, ChevronRight, Crown, Sparkles, TrendingUp } from "lucide-react";

const IMG_FALLBACK =
  "https://placehold.co/400x500/12141d/d4af37?text=Mimi+Mimos+25ml";

/** Carrossel horizontal dos perfumes mais bem avaliados (Top 4). */
export default function FeaturedCarousel() {
  const products = useStore((s) => s.products);

  const featured = useMemo(
    () =>
      [...products]
        // Only show in-stock products in the Top 4 carousel
        .filter((p) => p.inStock)
        .sort(
          (a, b) =>
            (b.rating || 0) - (a.rating || 0) ||
            (b.reviewCount || 0) - (a.reviewCount || 0)
        )
        .slice(0, 4),
    [products]
  );

  if (featured.length === 0) return null;

  return (
    <section
      id="featuredSection"
      className="py-12 px-4 sm:px-8 border-b border-gold-500/10 bg-gradient-to-b from-obsidian-950 to-transparent relative overflow-hidden"
    >
      {/* Aura decorativa */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-72 bg-gold-500/8 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute top-20 right-10 w-32 h-32 bg-amber-400/6 rounded-full blur-2xl pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gold-500/30 to-amber-400/10 border border-gold-500/40 flex items-center justify-center text-gold-400 shadow-lg shadow-gold-500/20">
              <Award size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] uppercase tracking-[0.2em] text-gold-300/70 font-bold flex items-center gap-1">
                  <TrendingUp size={10} /> Top 4 Selecionados
                </span>
              </div>
              <h2 className="font-serif-luxury text-2xl md:text-3xl font-bold text-white leading-none">
                Curadoria Premium
              </h2>
              <p className="text-[11px] text-gold-300/70 uppercase tracking-widest mt-1">
                Os mais aclamados da temporada
              </p>
            </div>
          </div>
          <a
            href="#catalogSection"
            className="hidden sm:flex items-center gap-1.5 text-xs text-gold-300 hover:text-gold-200 transition-colors group border border-gold-500/30 hover:border-gold-400/60 rounded-full px-4 py-2 bg-gold-500/5 hover:bg-gold-500/15"
          >
            Ver catálogo completo
            <ChevronRight
              size={14}
              className="group-hover:translate-x-0.5 transition-transform"
            />
          </a>
        </div>

        <div className="flex gap-5 overflow-x-auto pb-5 -mx-4 px-4 snap-x snap-mandatory scrollbar-luxury">
          {featured.map((p, i) => (
            <button
              key={p.id}
              onClick={() => {
                playSoftChime();
                // Use SlideIn drawer (right-side panel) for better UX
                window.dispatchEvent(new CustomEvent("openSlideIn", { detail: p }));
              }}
              className="group relative shrink-0 w-[260px] sm:w-[280px] snap-start text-left"
              style={{
                animation: `featuredFadeUp 0.6s ease-out ${i * 0.08}s both`,
              }}
            >
              <div className="relative rounded-2xl overflow-hidden border border-gold-500/20 group-hover:border-gold-400/60 transition-all shadow-2xl bg-obsidian-900 group-hover:shadow-gold-500/20 group-hover:-translate-y-1.5 duration-300">
                {/* Rank badge with crown for #1 */}
                <div className="absolute top-3 left-3 z-20 flex items-center gap-1">
                  <div className="relative">
                    {i === 0 && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-gold-300">
                        <Crown size={14} className="fill-gold-400" />
                      </div>
                    )}
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center text-obsidian-950 font-serif-luxury font-bold text-sm shadow-lg ring-2 ring-gold-300/40">
                      {i + 1}
                    </div>
                  </div>
                </div>

                {/* "Mais vendido" tag for #1 */}
                {i === 0 && (
                  <div className="absolute top-3 right-3 z-20 bg-gradient-to-r from-emerald-500 to-emerald-400 text-emerald-950 text-[9px] uppercase tracking-wider font-bold px-2 py-1 rounded-full shadow-md flex items-center gap-1">
                    <Sparkles size={9} /> Bestseller
                  </div>
                )}

                {/* Image */}
                <div className="relative h-80 overflow-hidden bg-obsidian-950">
                  <img
                    src={p.image}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = IMG_FALLBACK;
                    }}
                    alt={p.name}
                    className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-700 ease-out"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-obsidian-950 via-obsidian-950/30 to-transparent" />
                  {/* Shine effect on hover */}
                  <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none" />
                </div>

                {/* Info overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-gold-500/20 border border-gold-500/40 text-gold-200 backdrop-blur-sm">
                      {p.code}
                    </span>
                    <span className="flex items-center gap-0.5 text-[10px] text-gold-300 font-bold backdrop-blur-sm bg-obsidian-950/40 px-1.5 py-0.5 rounded-full">
                      <Star size={9} className="fill-gold-400 text-gold-400" />
                      {p.rating?.toFixed(1)}
                    </span>
                  </div>
                  <h4 className="font-serif-luxury text-base font-bold text-white leading-snug line-clamp-1 mb-0.5">
                    {p.name}
                  </h4>
                  <p className="text-[10px] text-gold-300/90 line-clamp-1 mb-2">
                    {p.inspiration}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="font-serif-luxury text-lg font-bold text-gold-400 tracking-tight">
                      {formatBRL(p.price)}
                    </span>
                    <span className="text-[9px] uppercase tracking-wider text-gold-200/70 group-hover:text-gold-300 transition-colors flex items-center gap-0.5 bg-obsidian-950/40 backdrop-blur-sm px-2 py-1 rounded-full">
                      Ver detalhes
                      <ChevronRight
                        size={10}
                        className="group-hover:translate-x-0.5 transition-transform"
                      />
                    </span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Dica de scroll horizontal */}
        <p className="text-[10px] text-gray-500 text-center mt-2 sm:hidden">
          ← Arraste para ver mais →
        </p>
      </div>

      {/* Keyframes para stagger animation */}
      <style>{`
        @keyframes featuredFadeUp {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </section>
  );
}
