"use client";

import { useStore, useUI } from "@/lib/stores-combined";
import { formatBRL } from "@/lib/pix";
import {
  Pin,
  X,
  Flame,
  Clock,
  Sparkles,
  ArrowRight,
  ShoppingBag,
  Eye,
  Crown,
  Star,
} from "lucide-react";
import { useState, useEffect } from "react";
import SkeletonImage from "./SkeletonImage";

/**
 * Pinned Product Banner — banner horizontal destacando um produto
 * que o admin fixou como "promoção do dia" / "novidade" / "imperdível".
 *
 * Persistência: D1 via /api/db/pinned (source of truth, shared across devices).
 * Admin define via AdminPanel (tab "Destaque").
 */

const DEFAULT_PINNED: { productId: string; badge: string } | null = null;

const BADGE_CONFIG: Record<
  string,
  { icon: typeof Flame; color: string; bg: string; border: string }
> = {
  Imperdível: {
    icon: Flame,
    color: "text-red-300",
    bg: "bg-red-500/15",
    border: "border-red-500/40",
  },
  Promoção: {
    icon: Sparkles,
    color: "text-emerald-300",
    bg: "bg-emerald-500/15",
    border: "border-emerald-500/40",
  },
  Novidade: {
    icon: Star,
    color: "text-gold-300",
    bg: "bg-gold-500/15",
    border: "border-gold-500/40",
  },
  "Últimas Unidades": {
    icon: Clock,
    color: "text-amber-300",
    bg: "bg-amber-500/15",
    border: "border-amber-500/40",
  },
};

const PINNED_LS_KEY = "mimi-pinned-product";

function loadPinnedFromLS(): { productId: string; badge: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PINNED_LS_KEY);
    if (!raw || raw === "false") return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.productId) return parsed;
    return null;
  } catch {
    return null;
  }
}

export default function PinnedProductBanner() {
  const products = useStore((s) => s.products);
  const openSlideIn = (p: typeof products[number]) =>
    window.dispatchEvent(new CustomEvent("openSlideIn", { detail: p }));
  const addToCart = useStore((s) => s.addToCart);

  // Start with localStorage (instant), then sync from D1
  const [pinned, setPinned] = useState<{
    productId: string;
    badge: string;
  } | null>(() => loadPinnedFromLS());
  const [dismissed, setDismissed] = useState(false);

  // Sync from D1 on mount — admin's pinned product is shared across devices
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/db/pinned", { method: "GET" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (data?.success && data.pinned && data.pinned.productId) {
          const d1Pinned = {
            productId: data.pinned.productId,
            badge: data.pinned.badge || "Imperdível",
          };
          setPinned(d1Pinned);
          // Also update localStorage for instant load next time
          localStorage.setItem(PINNED_LS_KEY, JSON.stringify(d1Pinned));
        }
      } catch {
        // silent — keep localStorage value
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Listen for pinned-updated events (same-tab admin save)
  useEffect(() => {
    const refresh = () => setPinned(loadPinnedFromLS());
    window.addEventListener("pinned-updated", refresh);
    return () => window.removeEventListener("pinned-updated", refresh);
  }, []);

  if (!pinned || dismissed) return null;

  const product = products.find((p) => p.id === pinned.productId);
  if (!product) return null;

  const badgeConfig = BADGE_CONFIG[pinned.badge] || BADGE_CONFIG["Imperdível"];
  const BadgeIcon = badgeConfig.icon;

  const handleAddToCart = () => {
    addToCart(product);
    // Toast é disparado pelo store
  };

  return (
    <section
      id="pinnedBanner"
      className="py-6 px-4 sm:px-8 border-b border-gold-500/10 bg-gradient-to-r from-obsidian-950 via-obsidian-900 to-obsidian-950 relative overflow-hidden"
    >
      {/* Aura decorativa */}
      <div className="absolute top-0 left-1/4 w-72 h-72 bg-gold-500/8 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute bottom-0 right-1/4 w-40 h-40 bg-amber-400/6 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="glass-panel-gold rounded-2xl border border-gold-500/40 overflow-hidden hover:border-gold-400/60 transition-all group">
          <div className="grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-4 items-center p-4">
            {/* Image */}
            <button
              onClick={() => openSlideIn(product)}
              className="relative w-full md:w-40 h-40 rounded-xl overflow-hidden bg-obsidian-950 border border-gold-500/15 shrink-0 p-2"
              aria-label={`Ver detalhes de ${product.name}`}
            >
              <SkeletonImage
                src={product.image}
                alt={product.name}
                className="w-full h-full group-hover:scale-105 transition-transform duration-500"
                fit="contain"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-obsidian-950/60 to-transparent pointer-events-none" />
              {/* Pin icon overlay */}
              <div className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-gold-500 text-obsidian-950 flex items-center justify-center shadow-md">
                <Pin size={11} className="fill-obsidian-950" />
              </div>
            </button>

            {/* Info */}
            <div className="flex flex-col gap-2 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Badge with icon */}
                <span
                  className={`inline-flex items-center gap-1 text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border backdrop-blur-sm ${badgeConfig.bg} ${badgeConfig.color} ${badgeConfig.border}`}
                >
                  <BadgeIcon size={10} className={product.inStock ? "" : "opacity-50"} />
                  {pinned.badge}
                </span>
                <span className="text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full bg-gold-500/10 border border-gold-500/30 text-gold-300">
                  {product.code}
                </span>
                {product.rating >= 4.9 && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full bg-gold-500/10 text-gold-300 border border-gold-400/30">
                    <Crown size={9} className="fill-gold-400 text-gold-400" />
                    Top
                  </span>
                )}
              </div>
              <button
                onClick={() => openSlideIn(product)}
                className="text-left group/name"
              >
                <h3 className="font-serif-luxury text-lg sm:text-xl font-bold text-white leading-snug group-hover/name:text-gold-200 transition-colors truncate">
                  {product.name}
                </h3>
              </button>
              <p className="text-[11px] text-gold-300/90 italic truncate">
                {product.inspiration}
              </p>
              <div className="flex items-center gap-2 text-[10px] text-gray-400">
                <span className="flex items-center gap-1">
                  <Star
                    size={10}
                    className="fill-gold-400 text-gold-400"
                  />
                  <strong className="text-gray-300">{product.rating.toFixed(1)}</strong>
                </span>
                <span>•</span>
                <span className="truncate">{product.family}</span>
                <span>•</span>
                <span className="truncate">{product.intensity}</span>
              </div>
            </div>

            {/* CTA + Price */}
            <div className="flex flex-row md:flex-col items-center md:items-end gap-2 md:gap-2 md:min-w-[140px]">
              <div className="text-left md:text-right shrink-0">
                <p className="text-[9px] text-gray-500 uppercase tracking-wider">
                  {product.category === "DECANTE"
                    ? "Decante 5ml"
                    : product.category === "AFEER"
                    ? "Miniatura Afeer"
                    : "Frasco 25ml"}
                </p>
                <p className="font-serif-luxury text-xl sm:text-2xl font-bold text-gold-400 tracking-tight leading-none">
                  {formatBRL(product.price)}
                </p>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => openSlideIn(product)}
                  className="w-9 h-9 rounded-xl bg-obsidian-900 border border-gold-500/30 text-gold-300 hover:bg-gold-500/15 hover:border-gold-400 transition-all flex items-center justify-center"
                  aria-label="Ver detalhes"
                  title="Ver detalhes"
                >
                  <Eye size={14} />
                </button>
                {product.inStock ? (
                  <button
                    onClick={handleAddToCart}
                    className="btn-gold py-2 px-3 sm:px-4 rounded-xl text-[10px] uppercase tracking-wider font-bold flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <ShoppingBag size={13} />
                    <span className="hidden sm:inline">Garantir</span>
                  </button>
                ) : (
                  <span className="text-[10px] text-red-400 border border-red-500/30 px-3 py-2 rounded-xl uppercase font-bold whitespace-nowrap">
                    Esgotado
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Decorative right arrow */}
          <button
            onClick={() => openSlideIn(product)}
            className="absolute top-1/2 right-2 -translate-y-1/2 hidden lg:block text-gold-400/40 hover:text-gold-300 transition-colors"
            aria-label="Ver mais"
          >
            <ArrowRight size={16} />
          </button>

          {/* Dismiss button */}
          <button
            onClick={() => setDismissed(true)}
            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-obsidian-950/60 backdrop-blur-md text-gray-500 hover:text-white flex items-center justify-center transition-colors"
            aria-label="Dispensar banner"
            title="Dispensar (não mostra mais nesta sessão)"
          >
            <X size={12} />
          </button>
        </div>
      </div>
    </section>
  );
}
