"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore, useUI } from "@/lib/stores-combined";
import type { SortOption } from "@/lib/ui-store";
import type { ProductCategory } from "@/lib/perfumes";
import PerfumeCard from "./PerfumeCard";
import {
  Wind,
  ArrowDownWideNarrow,
  SlidersHorizontal,
  X,
  Gem,
  Moon,
  FlaskConical,
} from "lucide-react";
import { toast } from "sonner";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "featured", label: "Destaques" },
  { value: "price-asc", label: "Menor Preço" },
  { value: "price-desc", label: "Maior Preço" },
  { value: "rating-desc", label: "Melhor Avaliados" },
  { value: "name-asc", label: "A → Z" },
  { value: "newest", label: "Novidades" },
];

// Brand category sections shown in "all" view — preserves catalog order BRAND → AFEER → DECANTE.
type SectionId = ProductCategory;
interface BrandSectionMeta {
  id: SectionId;
  title: string;
  icon: typeof Gem;
  accent: string; // tailwind classes for the icon badge
  ring: string; // tailwind classes for divider gradient
}

const BRAND_SECTIONS: BrandSectionMeta[] = [
  {
    id: "BRAND",
    title: "Brand Collection 25ml",
    icon: Gem,
    accent: "bg-gold-500/20 border-gold-400/40 text-gold-300",
    ring: "from-transparent via-gold-500/40 to-transparent",
  },
  {
    id: "AFEER",
    title: "Miniaturas Árabes Afeer",
    icon: Moon,
    accent: "bg-indigo-500/20 border-indigo-400/40 text-indigo-300",
    ring: "from-transparent via-indigo-400/40 to-transparent",
  },
  {
    id: "DECANTE",
    title: "Decantes 5ml",
    icon: FlaskConical,
    accent: "bg-emerald-500/20 border-emerald-400/40 text-emerald-300",
    ring: "from-transparent via-emerald-400/40 to-transparent",
  },
];

const SECTION_EMOJI: Record<SectionId, string> = {
  BRAND: "💎",
  AFEER: "🌙",
  DECANTE: "🧪",
};

export default function CatalogGrid() {
  const products = useStore((s) => s.products);
  const activeCategory = useUI((s) => s.activeCategory);
  const activeNote = useUI((s) => s.activeNote);
  const search = useUI((s) => s.search);
  const sortBy = useUI((s) => s.sortBy);
  const seasonFilter = useUI((s) => s.seasonFilter);
  const occasionFilter = useUI((s) => s.occasionFilter);
  const priceRange = useUI((s) => s.priceRange);
  const advancedFiltersOpen = useUI((s) => s.advancedFiltersOpen);
  const setSortBy = useUI((s) => s.setSortBy);
  const setSeasonFilter = useUI((s) => s.setSeasonFilter);
  const setOccasionFilter = useUI((s) => s.setOccasionFilter);
  const setPriceRange = useUI((s) => s.setPriceRange);
  const setAdvancedFiltersOpen = useUI((s) => s.setAdvancedFiltersOpen);
  const resetFilters = useUI((s) => s.resetFilters);

  const [hydrated, setHydrated] = useState(false);
  // Marca hydratação uma única vez no client (necessário para skeleton loading)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setHydrated(true), []);

  const activeAdvCount =
    (seasonFilter !== "all" ? 1 : 0) +
    (occasionFilter !== "all" ? 1 : 0) +
    (priceRange !== "all" ? 1 : 0);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const result = products.filter((p) => {
      // Category filter: supports both collection types (BRAND/AFEER/DECANTE) and gender (FEMININO/MASCULINO)
      let matchCat = true;
      if (activeCategory === "BRAND") matchCat = p.category === "BRAND";
      else if (activeCategory === "AFEER") matchCat = p.category === "AFEER";
      else if (activeCategory === "DECANTE") matchCat = p.category === "DECANTE";
      else if (activeCategory === "FEMININO") matchCat = p.gender === "FEMININO";
      else if (activeCategory === "MASCULINO") matchCat = p.gender === "MASCULINO";
      else if (activeCategory === "UNISSEX") matchCat = p.gender === "UNISSEX" || p.gender === "ARABE";
      else if (activeCategory !== "all") matchCat = false;

      // Note/tag filter: matches against notes AND tags array
      const matchNote =
        !activeNote ||
        `${p.notesTopo} ${p.notesCoracao} ${p.notesFundo}`
          .toLowerCase()
          .includes(activeNote.toLowerCase()) ||
        (p.tags || []).some((t) =>
          t.toLowerCase().includes(activeNote.toLowerCase())
        );
      const matchSearch =
        !s ||
        p.name.toLowerCase().includes(s) ||
        p.code.toLowerCase().includes(s) ||
        p.inspiration.toLowerCase().includes(s) ||
        p.family.toLowerCase().includes(s) ||
        (p.tags || []).some((t) => t.toLowerCase().includes(s));
      // Advanced filters
      const seasonLower = (p.season || "").toLowerCase();
      const occasionLower = (p.occasion || "").toLowerCase();
      const matchSeason =
        seasonFilter === "all" ||
        (seasonFilter === "verao" &&
          (seasonLower.includes("verão") ||
            seasonLower.includes("primavera"))) ||
        (seasonFilter === "inverno" &&
          (seasonLower.includes("inverno") ||
            seasonLower.includes("outono"))) ||
        (seasonFilter === "dia-noite" &&
          (seasonLower.includes("dia-noite") ||
            seasonLower.includes("ano todo")));
      const matchOccasion =
        occasionFilter === "all" ||
        (occasionFilter === "casual" && occasionLower.includes("casual")) ||
        (occasionFilter === "festa" &&
          (occasionLower.includes("festa") ||
            occasionLower.includes("eventos"))) ||
        (occasionFilter === "luxo" &&
          (occasionLower.includes("luxo") ||
            occasionLower.includes("sofisticad"))) ||
        (occasionFilter === "trabalho" &&
          (occasionLower.includes("trabalho") ||
            occasionLower.includes("uso diário")));
      const matchPrice =
        priceRange === "all" ||
        (priceRange === "under70" && p.price < 70) ||
        (priceRange === "70-100" && p.price >= 70 && p.price <= 100) ||
        (priceRange === "over100" && p.price > 100);
      return (
        matchCat && matchNote && matchSearch && matchSeason && matchOccasion && matchPrice
      );
    });

    // Sort
    const sorted = [...result];
    switch (sortBy) {
      case "price-asc":
        sorted.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        sorted.sort((a, b) => b.price - a.price);
        break;
      case "rating-desc":
        sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case "name-asc":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "newest":
        // id ends with timestamp when admin-added; original ones keep order
        sorted.sort((a, b) => {
          const aNew = a.id.includes("-") && !a.id.startsWith("bc-0");
          const bNew = b.id.includes("-") && !b.id.startsWith("bc-0");
          if (aNew && !bNew) return -1;
          if (!aNew && bNew) return 1;
          return a.code.localeCompare(b.code);
        });
        break;
      default:
        // featured: rating desc then reviewCount desc
        sorted.sort(
          (a, b) =>
            (b.rating || 0) - (a.rating || 0) ||
            (b.reviewCount || 0) - (a.reviewCount || 0)
        );
    }
    return sorted;
  }, [
    products,
    activeCategory,
    activeNote,
    search,
    sortBy,
    seasonFilter,
    occasionFilter,
    priceRange,
  ]);

  // Brand-section grouping — only used when "all" category is selected.
  // Filters were already applied to `filtered` above; we further partition
  // them by ProductCategory so each section preserves its own sort order
  // while still rendering under a styled section header.
  const groupedSections = useMemo(() => {
    if (activeCategory !== "all") return [];
    return BRAND_SECTIONS.map((section) => ({
      ...section,
      items: filtered.filter((p) => p.category === section.id),
    })).filter((section) => section.items.length > 0);
  }, [filtered, activeCategory]);

  return (
    <section
      id="catalogSection"
      className="py-12 px-4 sm:px-8 max-w-7xl mx-auto scroll-mt-20"
    >
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h3 className="font-serif-luxury text-3xl font-bold text-white">
            Catálogo de Frascos 25ml
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            Clique em qualquer item para{" "}
            <strong className="text-gold-300">virar o Dossier Olfativo</strong>{" "}
            e ver a pirâmide de notas.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Sort dropdown */}
          <div className="relative flex items-center gap-2">
            <ArrowDownWideNarrow
              className="text-gold-400/70 absolute left-2.5"
              size={13}
            />
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as SortOption);
                toast.success(
                  `Ordenado por: ${
                    SORT_OPTIONS.find((o) => o.value === e.target.value)?.label
                  }`
                );
              }}
              className="appearance-none bg-obsidian-900/90 border border-gold-500/30 rounded-full pl-8 pr-8 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-gold-400 cursor-pointer"
              aria-label="Ordenar catálogo"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} className="bg-obsidian-900">
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Advanced filters toggle */}
          <button
            onClick={() => setAdvancedFiltersOpen(!advancedFiltersOpen)}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs transition-all ${
              advancedFiltersOpen || activeAdvCount > 0
                ? "bg-gold-500/20 border-gold-400 text-gold-200"
                : "bg-obsidian-900 border-gold-500/30 text-gray-300 hover:border-gold-500/60"
            }`}
            aria-label="Filtros avançados"
          >
            <SlidersHorizontal size={13} />
            <span className="hidden sm:inline">Filtros</span>
            {activeAdvCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-gold-500 text-obsidian-950 font-bold text-[9px] w-4 h-4 rounded-full flex items-center justify-center">
                {activeAdvCount}
              </span>
            )}
          </button>

          <div className="text-xs text-gray-400 text-right">
            <span className="text-gold-400 font-bold text-sm">
              {filtered.length}
            </span>{" "}
            {filtered.length === 1 ? "perfume" : "perfumes"}
          </div>
        </div>
      </div>

      {/* Advanced filters panel */}
      {advancedFiltersOpen && (
        <div className="glass-panel rounded-2xl p-4 mb-6 border border-gold-500/20 animate-[fadeIn_0.3s_ease-out]">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-xs font-bold text-gold-300 uppercase tracking-wider">
              Filtros Avançados
            </h4>
            {activeAdvCount > 0 && (
              <button
                onClick={() => {
                  setSeasonFilter("all");
                  setOccasionFilter("all");
                  setPriceRange("all");
                  toast.success("Filtros avançados limpos");
                }}
                className="text-[10px] text-red-400 hover:underline flex items-center gap-1"
              >
                <X size={10} /> Limpar avançados
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] text-gray-400 mb-1.5 uppercase tracking-wider">
                Estação / Clima
              </label>
              <select
                value={seasonFilter}
                onChange={(e) =>
                  setSeasonFilter(e.target.value as typeof seasonFilter)
                }
                className="w-full bg-obsidian-900 border border-gold-500/30 rounded-lg py-1.5 px-2 text-xs text-white focus:outline-none focus:border-gold-400"
              >
                <option value="all">Todas</option>
                <option value="verao">Primavera / Verão</option>
                <option value="inverno">Outono / Inverno</option>
                <option value="dia-noite">Dia-Noite / Ano todo</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 mb-1.5 uppercase tracking-wider">
                Ocasião
              </label>
              <select
                value={occasionFilter}
                onChange={(e) =>
                  setOccasionFilter(e.target.value as typeof occasionFilter)
                }
                className="w-full bg-obsidian-900 border border-gold-500/30 rounded-lg py-1.5 px-2 text-xs text-white focus:outline-none focus:border-gold-400"
              >
                <option value="all">Todas</option>
                <option value="casual">Casual / Uso diário</option>
                <option value="festa">Festa / Eventos</option>
                <option value="luxo">Luxo / Sofisticado</option>
                <option value="trabalho">Trabalho</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 mb-1.5 uppercase tracking-wider">
                Faixa de Preço
              </label>
              <select
                value={priceRange}
                onChange={(e) =>
                  setPriceRange(e.target.value as typeof priceRange)
                }
                className="w-full bg-obsidian-900 border border-gold-500/30 rounded-lg py-1.5 px-2 text-xs text-white focus:outline-none focus:border-gold-400"
              >
                <option value="all">Todos os preços</option>
                <option value="under70">Abaixo de R$ 70</option>
                <option value="70-100">R$ 70 — R$ 100</option>
                <option value="over100">Acima de R$ 100</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16 glass-panel rounded-2xl">
          <Wind className="text-4xl text-gold-500/30 mb-3 mx-auto" size={48} />
          <h4 className="text-lg font-bold text-white">
            Nenhum perfume encontrado
          </h4>
          <p className="text-xs text-gray-400 mt-1">
            Tente ajustar seus termos de busca ou filtros olfativos.
          </p>
          <button
            onClick={resetFilters}
            className="mt-4 btn-gold px-6 py-2 rounded-full text-xs"
          >
            Ver Todos os Perfumes
          </button>
        </div>
      ) : !hydrated ? (
        // Skeleton loading durante hydratação do localStorage
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="glass-panel rounded-2xl p-4 h-[460px] animate-pulse"
            >
              <div className="h-5 w-16 bg-gold-500/10 rounded-full mb-3" />
              <div className="w-full h-44 bg-obsidian-800 rounded-xl mb-3" />
              <div className="h-4 w-3/4 bg-obsidian-800 rounded mb-2" />
              <div className="h-3 w-1/2 bg-obsidian-800 rounded mb-4" />
              <div className="h-8 bg-obsidian-800 rounded-xl mt-auto" />
            </div>
          ))}
        </div>
      ) : groupedSections.length > 0 ? (
        // "All" category view — render each brand collection under a styled section header.
        <div className="space-y-12">
          {groupedSections.map((section) => {
            const SectionIcon = section.icon;
            return (
              <div key={section.id} className="scroll-mt-24">
                {/* Section header — colored badge + serif title + count + divider */}
                <div className="mb-5">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${section.accent}`}
                      aria-hidden
                    >
                      <SectionIcon size={18} />
                    </div>
                    <div className="min-w-0 flex-grow">
                      <h4 className="font-serif-luxury text-xl sm:text-2xl font-bold text-white flex items-center gap-2 flex-wrap">
                        <span aria-hidden>{SECTION_EMOJI[section.id]}</span>
                        <span>{section.title}</span>
                        <span className="text-[10px] font-sans uppercase tracking-widest text-gray-400 bg-obsidian-900 border border-gold-500/20 rounded-full px-2 py-0.5 ml-1">
                          {section.items.length}{" "}
                          {section.items.length === 1
                            ? "perfume"
                            : "perfumes"}
                        </span>
                      </h4>
                    </div>
                  </div>
                  {/* Horizontal divider with gradient accent matching the section color */}
                  <div className="mt-3 h-px relative">
                    <div
                      className={`absolute inset-0 bg-gradient-to-r ${section.ring}`}
                    />
                    <div className="absolute inset-0 bg-gold-500/10" />
                  </div>
                </div>

                {/* Section grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {section.items.map((p, i) => (
                    <div
                      key={p.id}
                      className="animate-[fadeUp_0.5s_ease-out_both]"
                      style={{ animationDelay: `${Math.min(i * 60, 600)}ms` }}
                    >
                      <PerfumeCard perfume={p} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filtered.map((p, i) => (
            <div
              key={p.id}
              className="animate-[fadeUp_0.5s_ease-out_both]"
              style={{ animationDelay: `${Math.min(i * 60, 600)}ms` }}
            >
              <PerfumeCard perfume={p} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
