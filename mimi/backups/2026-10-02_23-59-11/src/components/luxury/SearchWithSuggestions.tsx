"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore, useUI } from "@/lib/stores-combined";
import { Search, X, Star } from "lucide-react";
import { formatBRL } from "@/lib/pix";

const IMG_FALLBACK =
  "https://placehold.co/80x80/12141d/d4af37?text=25ml";

interface Props {
  mobile?: boolean;
}

/** Busca com autocomplete: mostra sugestões de produtos enquanto digita. */
export default function SearchWithSuggestions({ mobile = false }: Props) {
  const products = useStore((s) => s.products);
  const search = useUI((s) => s.search);
  const setSearch = useUI((s) => s.setSearch);
  const openQuickView = useUI((s) => s.openQuickView);
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // fecha sugestões ao clicar fora
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const suggestions = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return [];
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(s) ||
          p.code.toLowerCase().includes(s) ||
          p.inspiration.toLowerCase().includes(s) ||
          p.family.toLowerCase().includes(s)
      )
      .slice(0, 5);
  }, [search, products]);

  // sugestões de notas populares quando campo vazio
  const popularNotes = useMemo(() => {
    const notes = ["Oud", "Baunilha", "Rosa", "Âmbar", "Jasmim", "Sândalo"];
    return notes.slice(0, 6);
  }, []);

  const selectProduct = (id: string) => {
    const p = products.find((pr) => pr.id === id);
    if (p) {
      openQuickView(p);
      setFocused(false);
    }
  };

  const inputClass = mobile
    ? "w-full bg-obsidian-900/90 border border-gold-500/20 rounded-full py-2 pl-9 pr-9 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-gold-400"
    : "w-full bg-obsidian-900/90 border border-gold-500/20 rounded-full py-1.5 pl-9 pr-9 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-gold-400 transition-all";

  return (
    <div
      ref={containerRef}
      className={`relative ${mobile ? "w-full" : "w-72"}`}
    >
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onFocus={() => setFocused(true)}
        placeholder="Buscar nº (#001) ou perfume..."
        className={inputClass}
        aria-label="Buscar perfume"
      />
      <Search
        className={`absolute text-xs text-gold-500/60 ${
          mobile ? "left-3.5 top-3" : "left-3 top-2"
        }`}
        size={14}
      />
      {search && (
        <button
          onClick={() => setSearch("")}
          className={`absolute text-gray-500 hover:text-gold-300 ${
            mobile ? "right-3 top-2.5" : "right-3 top-1.5"
          }`}
          aria-label="Limpar busca"
        >
          <X size={14} />
        </button>
      )}

      {/* Suggestions dropdown */}
      {focused && (
        <div className="absolute top-full left-0 right-0 mt-2 glass-panel-gold rounded-2xl border border-gold-500/30 shadow-2xl overflow-hidden z-50 max-h-[70vh] overflow-y-auto animate-[fadeIn_0.2s_ease-out]">
          {search.trim() === "" ? (
            // Estado vazio: notas populares
            <div className="p-3">
              <p className="text-[10px] uppercase tracking-wider text-gold-300/70 mb-2">
                Notas populares
              </p>
              <div className="flex flex-wrap gap-1.5">
                {popularNotes.map((n) => (
                  <button
                    key={n}
                    onClick={() => setSearch(n)}
                    className="text-[11px] px-2.5 py-1 rounded-full bg-obsidian-900 border border-gold-500/20 text-gray-300 hover:text-gold-300 hover:border-gold-400 transition-all"
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ) : suggestions.length === 0 ? (
            <div className="p-4 text-center text-xs text-gray-500">
              Nenhum perfume encontrado para “{search}”
            </div>
          ) : (
            <div className="py-1.5">
              <p className="text-[10px] uppercase tracking-wider text-gold-300/70 px-3 py-1.5">
                {suggestions.length} resultado{suggestions.length > 1 ? "s" : ""}
              </p>
              {suggestions.map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectProduct(p.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gold-500/10 transition-colors text-left group"
                >
                  { }
                  <img
                    src={p.image}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = IMG_FALLBACK;
                    }}
                    alt={p.name}
                    className="w-10 h-10 object-cover rounded-lg bg-obsidian-950 shrink-0"
                  />
                  <div className="flex-grow min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-gold-400">
                        {p.code}
                      </span>
                      <span className="text-xs font-bold text-white truncate group-hover:text-gold-200">
                        {p.name}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 truncate">
                      {p.inspiration}
                    </p>
                  </div>
                  <div className="flex flex-col items-end shrink-0 gap-0.5">
                    <span className="text-xs font-serif-luxury font-bold text-gold-400">
                      {formatBRL(p.price)}
                    </span>
                    <span className="flex items-center gap-0.5 text-[9px] text-gold-300">
                      <Star size={9} className="fill-gold-400" />
                      {p.rating?.toFixed(1)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
