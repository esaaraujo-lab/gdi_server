"use client";

import { useStore, useUI } from "@/lib/stores-combined";
import {
  Package,
  Sparkles,
  TrendingUp,
  Award,
  Heart,
  Star,
  ShoppingBag,
  Crown,
} from "lucide-react";
import { useMemo } from "react";
import { formatBRL } from "@/lib/pix";

/**
 * Stats Bar — barra horizontal com métricas-chave do catálogo.
 * Mostra:
 *  - Total de perfumes disponíveis
 *  - Em estoque (vs esgotados)
 *  - Mais bem avaliado (Top 1)
 *  - Mais barato (para budget-conscious)
 *  - Favoritos do usuário (se houver)
 *
 * Visual: glass-panel-gold com 4-5 cards stat horizontal-scrollável em mobile.
 */

interface Stat {
  icon: typeof Package;
  label: string;
  value: string;
  sublabel?: string;
  color: "gold" | "emerald" | "rose" | "amber" | "purple";
  onClick?: () => void;
}

const COLOR_MAP: Record<Stat["color"], { text: string; bg: string; border: string }> = {
  gold: {
    text: "text-gold-400",
    bg: "bg-gold-500/15",
    border: "border-gold-500/40",
  },
  emerald: {
    text: "text-emerald-400",
    bg: "bg-emerald-500/15",
    border: "border-emerald-500/40",
  },
  rose: {
    text: "text-rose-400",
    bg: "bg-rose-500/15",
    border: "border-rose-500/40",
  },
  amber: {
    text: "text-amber-400",
    bg: "bg-amber-500/15",
    border: "border-amber-500/40",
  },
  purple: {
    text: "text-purple-400",
    bg: "bg-purple-500/15",
    border: "border-purple-500/40",
  },
};

export default function StatsBar() {
  const products = useStore((s) => s.products);
  const favorites = useStore((s) => s.favorites);
  const cartCount = useStore((s) => s.cartCount());
  const setCartOpen = useUI((s) => s.setCartOpen);

  const stats: Stat[] = useMemo(() => {
    const inStock = products.filter((p) => p.inStock).length;
    const bestRated = [...products].sort(
      (a, b) => (b.rating || 0) - (a.rating || 0)
    )[0];
    const cheapest = [...products]
      .filter((p) => p.inStock)
      .sort((a, b) => a.price - b.price)[0];

    return [
      {
        icon: Package,
        label: "Catálogo",
        value: `${products.length} perfumes`,
        sublabel: `${inStock} em estoque`,
        color: "gold",
      },
      {
        icon: Award,
        label: "Top Avaliado",
        value: bestRated ? bestRated.name.slice(0, 24) : "—",
        sublabel: bestRated ? `${bestRated.rating.toFixed(1)} ★ • ${bestRated.code}` : "",
        color: "purple",
        onClick: bestRated
          ? () =>
              window.dispatchEvent(
                new CustomEvent("openSlideIn", { detail: bestRated })
              )
          : undefined,
      },
      {
        icon: TrendingUp,
        label: "Mais Acessível",
        value: cheapest ? formatBRL(cheapest.price) : "—",
        sublabel: cheapest ? cheapest.name.slice(0, 24) : "",
        color: "emerald",
        onClick: cheapest
          ? () =>
              window.dispatchEvent(
                new CustomEvent("openSlideIn", { detail: cheapest })
              )
          : undefined,
      },
      {
        icon: Heart,
        label: "Favoritos",
        value: favorites.length > 0 ? `${favorites.length} salvos` : "Nenhum",
        sublabel:
          favorites.length > 0
            ? "Toque para ver"
            : "Clique ♥ nos cards",
        color: "rose",
      },
      {
        icon: ShoppingBag,
        label: "Sacola",
        value: cartCount > 0 ? `${cartCount} itens` : "Vazia",
        sublabel:
          cartCount > 0 ? "Finalizar pedido" : "Adicione perfumes",
        color: "amber",
        onClick: () => setCartOpen(true),
      },
    ];
  }, [products, favorites, cartCount, setCartOpen]);

  return (
    <section
      id="statsBar"
      className="py-4 px-4 sm:px-8 border-b border-gold-500/10 bg-obsidian-900/40"
    >
      <div className="max-w-7xl mx-auto">
        <div className="flex gap-2.5 overflow-x-auto scrollbar-luxury pb-1 -mx-2 px-2 sm:overflow-x-visible sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {stats.map((stat, i) => {
            const colors = COLOR_MAP[stat.color];
            const Icon = stat.icon;
            const clickable = Boolean(stat.onClick);
            return (
              <button
                key={stat.label}
                onClick={stat.onClick}
                disabled={!clickable}
                className={`shrink-0 w-[200px] sm:w-auto text-left p-3 rounded-xl border transition-all group ${
                  clickable
                    ? "hover:scale-[1.02] hover:border-gold-400/60 cursor-pointer"
                    : "cursor-default opacity-95"
                } ${colors.bg} ${colors.border} ${
                  !clickable ? "opacity-90" : ""
                }`}
                style={{
                  animation: `statFadeIn 0.4s ease-out ${i * 0.06}s both`,
                }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div
                    className={`w-7 h-7 rounded-lg ${colors.bg} border ${colors.border} flex items-center justify-center ${colors.text} shrink-0 group-hover:scale-110 transition-transform`}
                  >
                    <Icon size={13} />
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">
                    {stat.label}
                  </span>
                </div>
                <p
                  className={`text-xs font-bold ${colors.text} truncate leading-tight`}
                >
                  {stat.value}
                </p>
                {stat.sublabel && (
                  <p className="text-[10px] text-gray-500 truncate mt-0.5">
                    {stat.sublabel}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <style>{`
        @keyframes statFadeIn {
          from {
            opacity: 0;
            transform: translateY(8px);
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
