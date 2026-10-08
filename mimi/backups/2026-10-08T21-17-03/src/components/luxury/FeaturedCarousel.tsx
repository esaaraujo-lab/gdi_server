"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/stores-combined";
import { formatBRL } from "@/lib/pix";
import { playSoftChime } from "@/lib/audio";
import { Award, Star, ChevronLeft, ChevronRight, Crown, Sparkles, TrendingUp } from "lucide-react";

const IMG_FALLBACK = (name: string) =>
  `https://placehold.co/400x500/12141d/d4af37?text=${encodeURIComponent(name.slice(0, 30))}`;

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
      className="py-16 px-4 sm:px-8 border-y border-gold-500/15 relative overflow-hidden"
      style={{ background: "linear-gradient(to bottom, rgba(14,13,12,0.6), rgba(8,8,8,0.3) 50%, rgba(14,13,12,0.6))" }}
    >
      {/* Aura decorativa */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-gold-500/6 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute top-20 right-10 w-40 h-40 bg-amber-400/5 rounded-full blur-2xl pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-gold-500/30 to-amber-400/10 border border-gold-500/40 flex items-center justify-center text-gold-400 shadow-lg shadow-gold-500/20">
              <Award size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs uppercase tracking-[0.2em] text-gold-300 font-bold flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gold-500/15 border border-gold-500/30">
                  <TrendingUp size={12} /> Top 4 Selecionados
                </span>
              </div>
              <h2 className="font-serif-luxury text-3xl md:text-4xl font-bold text-white leading-none">
                Curadoria Premium
              </h2>
              <p className="text-xs text-gold-300 uppercase tracking-widest mt-1.5">
                Os mais aclamados da temporada
              </p>
            </div>
          </div>
          <a
            href="#colecao"
            className="hidden sm:flex items-center gap-1.5 text-xs text-gold-300 hover:text-gold-200 transition-colors group border border-gold-500/30 hover:border-gold-400/60 rounded-full px-4 py-2 bg-gold-500/5 hover:bg-gold-500/15"
          >
            Ver catálogo completo
            <ChevronRight
              size={14}
              className="group-hover:translate-x-0.5 transition-transform"
            />
          </a>
        </div>

        {/* Carousel with navigation arrows */}
        <div className="relative">
          {/* Left arrow */}
          <button
            onClick={() => {
              const container = document.querySelector("#featuredSection .scroll-container") as HTMLElement;
              if (container) container.scrollBy({ left: -300, behavior: "smooth" });
            }}
            className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-obsidian-950/80 border border-gold-500/30 items-center justify-center text-gold-400 hover:bg-gold-500 hover:text-obsidian-950 transition-all -translate-x-1/2"
            aria-label="Anterior"
          >
            <ChevronLeft size={18} />
          </button>

        <div className="flex gap-5 overflow-x-auto pb-5 -mx-4 px-4 snap-x snap-mandatory scrollbar-luxury scroll-container">
          {featured.map((p, i) => (
            <button
              key={p.id}
              onClick={() => {
                playSoftChime();
                window.dispatchEvent(new CustomEvent("openSlideIn", { detail: p }));
              }}
              className="group relative shrink-0 w-[280px] sm:w-[320px] snap-start text-left"
              style={{
                animation: `featuredFadeUp 0.6s ease-out ${i * 0.08}s both`,
              }}
            >
              <div className="relative rounded-2xl overflow-hidden border border-gold-500/20 group-hover:border-gold-400/60 transition-all shadow-2xl bg-obsidian-900 group-hover:shadow-gold-500/20 group-hover:-translate-y-1.5 duration-300">
                {/* Rank badge */}
                <div className="absolute top-3 left-3 z-20 flex items-center gap-1">
                  <div className="relative">
                    {i === 0 && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-gold-300">
                        <Crown size={16} className="fill-gold-400" />
                      </div>
                    )}
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center text-obsidian-950 font-serif-luxury font-bold text-base shadow-lg ring-2 ring-gold-300/40">
                      {i + 1}
                    </div>
                  </div>
                </div>

                {/* Bestseller tag for #1 */}
                {i === 0 && (
                  <div className="absolute top-3 right-3 z-20 bg-gradient-to-r from-emerald-500 to-emerald-400 text-emerald-950 text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full shadow-md flex items-center gap-1">
                    <Sparkles size={10} /> Bestseller
                  </div>
                )}

                {/* Image — taller for better visual impact */}
                <div className="relative h-96 overflow-hidden bg-obsidian-950">
                  <img
                    src={p.image}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = IMG_FALLBACK(p.name);
                    }}
                    alt={p.name}
                    className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-700 ease-out"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-obsidian-950 via-obsidian-950/30 to-transparent" />
                  <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none" />
                </div>

                {/* Info overlay — improved contrast */}
                <div className="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-obsidian-950 via-obsidian-950/80 to-transparent">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full bg-gold-500/30 border border-gold-500/50 text-gold-100 backdrop-blur-sm">
                      {p.code}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-gold-200 font-bold backdrop-blur-sm bg-obsidian-950/60 px-2 py-1 rounded-full">
                      <Star size={10} className="fill-gold-400 text-gold-400" />
                      {p.rating?.toFixed(1)}
                    </span>
                  </div>
                  <h4 className="font-serif-luxury text-lg font-bold text-white leading-snug line-clamp-1 mb-1">
                    {p.name}
                  </h4>
                  <p className="text-[11px] text-gray-300 line-clamp-1 mb-3">
                    {p.inspiration}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="font-serif-luxury text-xl font-bold text-gold-400 tracking-tight">
                      {formatBRL(p.price)}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-gold-200 font-bold group-hover:text-gold-100 transition-colors flex items-center gap-1 bg-obsidian-950/60 backdrop-blur-sm px-3 py-1.5 rounded-full border border-gold-500/30">
                      Ver detalhes
                      <ChevronRight
                        size={12}
                        className="group-hover:translate-x-0.5 transition-transform"
                      />
                    </span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

          {/* Right arrow */}
          <button
            onClick={() => {
              const container = document.querySelector("#featuredSection .scroll-container") as HTMLElement;
              if (container) container.scrollBy({ left: 300, behavior: "smooth" });
            }}
            className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-obsidian-950/80 border border-gold-500/30 items-center justify-center text-gold-400 hover:bg-gold-500 hover:text-obsidian-950 transition-all translate-x-1/2"
            aria-label="Próximo"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Mobile scroll hint */}
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
