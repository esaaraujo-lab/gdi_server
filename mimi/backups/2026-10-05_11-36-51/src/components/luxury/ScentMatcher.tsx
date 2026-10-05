"use client";

import { useMemo } from "react";
import { useStore, useUI } from "@/lib/stores-combined";
import { CATEGORY_LABELS, NOTE_FILTERS } from "@/lib/perfumes";
import { Compass, RotateCcw } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = ["all", "BRAND", "AFEER", "DECANTE", "FEMININO", "MASCULINO", "UNISSEX"];

export default function ScentMatcher() {
  const activeCategory = useUI((s) => s.activeCategory);
  const activeNote = useUI((s) => s.activeNote);
  const setActiveCategory = useUI((s) => s.setActiveCategory);
  const setActiveNote = useUI((s) => s.setActiveNote);
  const resetFilters = useUI((s) => s.resetFilters);
  const products = useStore((s) => s.products);

  // Gera tags dinamicamente dos produtos (top 12 mais frequentes)
  const productTags = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((p) => {
      p.tags?.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1));
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14)
      .map(([t]) => t);
  }, [products]);

  // Combina tags de produtos + NOTE_FILTERS (sem duplicar)
  const allTags = useMemo(() => {
    const set = new Set([...productTags, ...NOTE_FILTERS]);
    return Array.from(set).slice(0, 16);
  }, [productTags]);

  return (
    <section
      id="scentMatcherSection"
      className="py-8 px-4 sm:px-8 border-b border-gold-500/10 bg-obsidian-900/60 scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h2 className="font-serif-luxury text-2xl md:text-3xl font-bold text-white flex items-center gap-2">
              <Compass className="text-gold-400" size={22} />
              <span>Scent Matcher</span>
              <span className="text-xs font-sans font-normal text-gold-300/70 border border-gold-500/20 px-2 py-0.5 rounded-full">
                Filtro Olfativo
              </span>
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Selecione uma coleção ou nota aromática para destacar seus
              perfumes perfeitos.
            </p>
          </div>

          <button
            onClick={() => {
              resetFilters();
              toast.success("Filtros limpos");
            }}
            className="text-xs text-gold-400 hover:underline flex items-center gap-1.5 self-end md:self-auto"
          >
            <RotateCcw size={12} />
            <span>Limpar Filtros</span>
          </button>
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap gap-2 mb-4">
          {CATEGORIES.map((cat) => {
            const active = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  active
                    ? "bg-gold-500 text-obsidian-950 border-gold-500/40"
                    : "bg-obsidian-800 text-gray-300 border-gold-500/20 hover:border-gold-500/50"
                }`}
              >
                {CATEGORY_LABELS[cat] || cat}
              </button>
            );
          })}
        </div>

        {/* Key Olfactory Notes Tag Cloud */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gold-500/10">
          <span className="text-[11px] uppercase tracking-wider text-gray-400 mr-2 flex items-center gap-1">
            <span className="text-gold-400">●</span> Notas & Tags:
          </span>

          {allTags.map((note) => {
            const active = activeNote === note;
            return (
              <button
                key={note}
                onClick={() => {
                  setActiveNote(active ? null : note);
                  toast.success(
                    active
                      ? `Filtro de nota removido`
                      : `Filtrando por nota: ${note}`
                  );
                }}
                className={`text-[11px] px-3 py-1 rounded-full border transition-all ${
                  active
                    ? "bg-gold-500/30 text-gold-200 border-gold-400"
                    : "bg-obsidian-800/80 border-gold-500/15 text-gray-300 hover:text-gold-300 hover:border-gold-400"
                }`}
              >
                {note}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
