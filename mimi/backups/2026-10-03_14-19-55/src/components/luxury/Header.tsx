"use client";

import SearchWithSuggestions from "./SearchWithSuggestions";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";
import { useStore, useUI } from "@/lib/stores-combined";
import { Sparkles, ShoppingBag, Crown, Heart } from "lucide-react";

export default function Header() {
  const cartCount = useStore((s) => s.cartCount());
  const favoritesCount = useStore((s) => s.favorites.length);
  const setCartOpen = useUI((s) => s.setCartOpen);
  const setFavoritesOpen = useUI((s) => s.setFavoritesOpen);

  return (
    <header className="sticky top-0 z-40 glass-panel border-b border-gold-500/20 px-4 lg:px-12 py-3 transition-all duration-300 safe-top">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        {/* Logo — frasco + texto MIMI MIMOS (scrolla para o topo) */}
        <button
          type="button"
          onClick={() =>
            window.scrollTo({ top: 0, behavior: "smooth" })
          }
          aria-label="Mimi Mimos — voltar ao topo"
          className="shrink-0"
        >
          <Logo size="md" subtitle="PERFUME STORE" />
        </button>

        {/* Search Bar with suggestions (Desktop) */}
        <div className="hidden md:block">
          <SearchWithSuggestions />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Scent Matcher quick toggle */}
          <a
            href="#scentMatcherSection"
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border border-gold-500/30 text-xs text-gold-300 hover:bg-gold-500/10 transition-all"
          >
            <Sparkles className="text-gold-400" size={14} />
            <span>Scent Matcher</span>
          </a>

          {/* Theme Toggle (dark/light/auto) */}
          <ThemeToggle />

          {/* Admin access is now via /admin URL — button removed from public header */}

          {/* Favorites Button */}
          <button
            onClick={() => setFavoritesOpen(true)}
            aria-label="Ver favoritos"
            title="Seus favoritos"
            className="relative w-9 h-9 rounded-full border border-gold-500/20 flex items-center justify-center text-gray-400 hover:text-red-400 hover:border-red-400/50 transition-all"
          >
            <Heart size={14} />
            {favoritesCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white font-bold text-[9px] w-4 h-4 rounded-full flex items-center justify-center">
                {favoritesCount}
              </span>
            )}
          </button>

          {/* Cart Button */}
          <button
            onClick={() => setCartOpen(true)}
            aria-label="Abrir sacola"
            className="relative bg-gold-500/10 hover:bg-gold-500/20 border border-gold-500/30 text-gold-300 px-3.5 py-1.5 rounded-full flex items-center gap-2 transition-all"
          >
            <ShoppingBag className="text-gold-400" size={14} />
            <span className="text-xs font-semibold hidden xs:inline">Sacola</span>
            <span className="bg-gold-500 text-obsidian-950 font-bold text-[10px] w-5 h-5 rounded-full flex items-center justify-center ml-0.5">
              {cartCount}
            </span>
          </button>
        </div>
      </div>

      {/* Mobile Search Input with suggestions */}
      <div className="mt-2.5 md:hidden">
        <SearchWithSuggestions mobile />
      </div>
    </header>
  );
}

export function AnnouncementBar() {
  return (
    <div className="lux-announcement border-b border-gold-500/20 text-gold-200 text-xs py-2 px-4 text-center tracking-widest uppercase flex justify-center items-center gap-2">
      <Crown className="text-gold-400" size={12} />
      <span>
        Mimi Mimos • Perfumaria Árabe & Importados (Brand Collection 25ml)
      </span>
      <Crown className="text-gold-400" size={12} />
    </div>
  );
}
