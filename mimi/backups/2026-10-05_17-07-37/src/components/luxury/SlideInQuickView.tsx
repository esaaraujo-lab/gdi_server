"use client";

import { useStore, useUI } from "@/lib/stores-combined";
import { formatBRL } from "@/lib/pix";
import { playAtomizerSpraySound, playSoftChime } from "@/lib/audio";
import { toast } from "sonner";
import {
  X,
  Heart,
  SprayCan,
  MessageCircleWarning,
  Star,
  Cloud,
  Heart as HeartIcon,
  TreePine,
  Calendar,
  Sparkles,
  Package,
  Clock,
  Droplets,
  MessageCircle,
  ExternalLink,
} from "lucide-react";
import { useEffect } from "react";
import type { Perfume } from "@/lib/perfumes";
import { useReviewStore } from "@/lib/review-store";
import { useCompareStore } from "@/lib/compare-store";
import { getPerfumeUrl } from "@/lib/slug";
import SkeletonImage from "./SkeletonImage";
import ProductReviews from "./ProductReviews";

/**
 * SlideInQuickView — painel lateral deslizante da direita (drawer).
 *
 * Diferente do QuickViewModal (overlay central), este é um drawer que
 * ocupa a lateral direita da tela — melhor para mobile onde o overlay
 * central compete com o conteúdo.
 *
 * Características:
 *  - Slide-in da direita com transição ease-out
 *  - Largura fixa (max-w-md) — não cobre conteúdo principal
 *  - Backdrop dimmed (não bloqueia cliques fora)
 *  - Mesma estrutura do QuickViewModal: imagem + info + reviews + CTA
 *
 * Abertura: useUI.setSlideInQuickViewOpen(true) + useUI.setSlideInProduct(p)
 */

interface UIStateSlideIn {
  slideInQuickViewOpen: boolean;
  slideInProduct: Perfume | null;
  setSlideInQuickViewOpen: (v: boolean) => void;
  setSlideInProduct: (p: Perfume) => void;
  openSlideInQuickView: (p: Perfume) => void;
}

// Estende o useUI com novos campos — mas para simplicidade, criamos store próprio
// para não mexer no ui-store existente.
import { create } from "zustand";

export const useSlideInUI = create<UIStateSlideIn>((set) => ({
  slideInQuickViewOpen: false,
  slideInProduct: null,
  setSlideInQuickViewOpen: (v) => set({ slideInQuickViewOpen: v }),
  setSlideInProduct: (p) => set({ slideInProduct: p }),
  openSlideInQuickView: (p) =>
    set({ slideInProduct: p, slideInQuickViewOpen: true }),
}));

export default function SlideInQuickView() {
  const open = useSlideInUI((s) => s.slideInQuickViewOpen);
  const setOpen = useSlideInUI((s) => s.setSlideInQuickViewOpen);
  const product = useSlideInUI((s) => s.slideInProduct);
  const addToCart = useStore((s) => s.addToCart);
  const openNotify = useUI((s) => s.openNotify);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const isFav = useStore((s) =>
    product ? s.favorites.includes(product.id) : false
  );
  const pushRecentlyViewed = useStore((s) => s.pushRecentlyViewed);
  const addToCompare = useCompareStore((s) => s.addToCompare);
  const isInCompare = useCompareStore((s) =>
    product ? s.isInCompare(product.id) : false
  );

  // Reviews
  const userReviewCount = useReviewStore((s) =>
    product ? s.getReviewCount(product.id) : 0
  );
  const userAvgRating = useReviewStore((s) =>
    product ? s.getAverageRating(product.id) : 0
  );
  const displayRating = userReviewCount > 0 ? userAvgRating : product?.rating || 0;
  const displayReviewCount = (product?.reviewCount || 0) + userReviewCount;

  // Track if mounted (component only mounts once via parent's lazy init pattern)
  // The parent `if (!mounted || !product) return null;` becomes effectively
  // `if (!product) return null;` since the drawer slides in/out via CSS transitions.
  // To satisfy react-hooks rule, we use a derived state pattern.

  // Use the open prop directly — mount the panel always, but only slide in when open.
  // The transition handles the slide-in/out, no need for setMounted.

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  // Track recently viewed when panel opens
  useEffect(() => {
    if (open && product) {
      pushRecentlyViewed(product.id);
    }
  }, [open, product, pushRecentlyViewed]);

  if (!product) return null;

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    playAtomizerSpraySound();
    addToCart(product);
    toast.success(`Frasco de ${product.name} adicionado à sacola!`);
  };

  const handleCompare = (e: React.MouseEvent) => {
    e.stopPropagation();
    const result = addToCompare(product.id);
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.info(result.message);
    }
  };

  const handleFav = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(product.id);
    toast.success(
      isFav ? "Removido dos favoritos" : "Adicionado aos favoritos ♥"
    );
  };

  return (
    <div
      className={`fixed inset-0 z-[68] transition-all duration-300 ${
        open
          ? "opacity-100 pointer-events-auto"
          : "opacity-0 pointer-events-none"
      }`}
    >
      {/* Backdrop — dimmed but doesn't block clicks on the rest */}
      <div
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
      />

      {/* Drawer panel — slides in from right */}
      <aside
        className={`absolute top-0 right-0 h-full w-full max-w-md bg-obsidian-950 border-l border-gold-500/30 shadow-2xl flex flex-col transition-transform duration-300 ease-out safe-top safe-bottom ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header com fechar */}
        <div className="flex items-center justify-between gap-2 border-b border-gold-500/20 p-4 shrink-0 bg-obsidian-950">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gold-500/15 border border-gold-500/30 flex items-center justify-center text-gold-400 shrink-0">
              <Package size={14} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-gold-300/70 font-bold">
                Visualização Rápida
              </p>
              <p className="text-[11px] text-gray-400 truncate">
                {product.code} • {product.category}
              </p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Conteúdo scrollável */}
        <div className="flex-grow overflow-y-auto">
          {/* Image hero */}
          <div className="relative h-72 sm:h-80 overflow-hidden bg-obsidian-950 p-4">
            <SkeletonImage
              src={product.image}
              alt={product.name}
              className="w-full h-full"
              fit="contain"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-obsidian-950 via-transparent to-transparent pointer-events-none" />

            {/* Code badge */}
            <span className="absolute top-3 left-3 text-[10px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-full bg-gold-500/20 border border-gold-500/40 text-gold-200 backdrop-blur-md">
              {product.code}
            </span>

            {/* Favorite */}
            <button
              onClick={handleFav}
              className={`absolute top-3 right-3 w-9 h-9 rounded-full backdrop-blur-md border flex items-center justify-center transition-all ${
                isFav
                  ? "bg-red-500/20 border-red-400/60"
                  : "bg-obsidian-950/70 border-gold-500/30"
              }`}
              aria-label="Favoritar"
            >
              <Heart
                size={16}
                className={
                  isFav ? "text-red-500 fill-red-500" : "text-gold-300"
                }
              />
            </button>

            {/* Compare */}
            <button
              onClick={handleCompare}
              className={`absolute bottom-3 right-3 px-2.5 py-1.5 rounded-full backdrop-blur-md border text-[10px] uppercase tracking-wider font-bold flex items-center gap-1 transition-all ${
                isInCompare
                  ? "bg-emerald-500/20 border-emerald-400/60 text-emerald-300"
                  : "bg-obsidian-950/70 border-gold-500/30 text-gold-300"
              }`}
            >
              {isInCompare ? (
                <>
                  <Sparkles size={10} /> Na comparação
                </>
              ) : (
                <>
                  <Package size={10} /> Comparar
                </>
              )}
            </button>
          </div>

          {/* Info */}
          <div className="p-4 space-y-3">
            {/* Nome + inspiração */}
            <div>
              <h3 className="font-serif-luxury text-2xl font-bold text-white leading-tight">
                {product.name}
              </h3>
              <p className="text-sm text-gold-300 mt-0.5 font-medium">
                Inspirado em: {product.inspiration}
              </p>
            </div>

            {/* Rating */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={13}
                    className={
                      i < Math.round(displayRating)
                        ? "text-gold-400 fill-gold-400"
                        : "text-gray-700"
                    }
                  />
                ))}
              </div>
              <span className="text-xs text-gold-300 font-bold">
                {displayRating.toFixed(1)}
              </span>
              <span className="text-[10px] text-gray-500">
                ({displayReviewCount} avaliações
                {userReviewCount > 0 && (
                  <span className="text-emerald-400 ml-1">
                    · {userReviewCount} reais
                  </span>
                )})
              </span>
            </div>

            {/* Descrição */}
            <p className="text-xs text-gray-300 leading-relaxed italic">
              "{product.description}"
            </p>

            {/* Meta tags — grid 2x2 */}
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2 text-[11px] text-gray-300 bg-obsidian-900/60 rounded-lg px-2.5 py-1.5 border border-gold-500/10">
                <Droplets size={12} className="text-gold-400" />
                <span>{product.intensity}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-gray-300 bg-obsidian-900/60 rounded-lg px-2.5 py-1.5 border border-gold-500/10">
                <Clock size={12} className="text-gold-400" />
                <span>Fixação {product.fixation}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-gray-300 bg-obsidian-900/60 rounded-lg px-2.5 py-1.5 border border-gold-500/10">
                <Calendar size={12} className="text-gold-400" />
                <span className="truncate">{product.season}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-gray-300 bg-obsidian-900/60 rounded-lg px-2.5 py-1.5 border border-gold-500/10">
                <Sparkles size={12} className="text-gold-400" />
                <span className="truncate">{product.occasion}</span>
              </div>
            </div>

            {/* Notas olfativas */}
            <div className="space-y-1.5 text-xs bg-obsidian-900/60 rounded-xl p-3 border border-gold-500/10">
              <div>
                <span className="text-[10px] uppercase font-bold text-gold-400 tracking-wider flex items-center gap-1">
                  <Cloud size={11} /> Topo:
                </span>
                <p className="text-gray-200 mt-0.5">{product.notesTopo}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-gold-400 tracking-wider flex items-center gap-1">
                  <HeartIcon size={11} /> Coração:
                </span>
                <p className="text-gray-200 mt-0.5">{product.notesCoracao}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-gold-400 tracking-wider flex items-center gap-1">
                  <TreePine size={11} /> Fundo:
                </span>
                <p className="text-gray-200 mt-0.5">{product.notesFundo}</p>
              </div>
            </div>

            {/* Tags */}
            {(product.tags || []).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {(product.tags || []).slice(0, 6).map((t) => (
                  <span
                    key={t}
                    className="text-[10px] bg-gold-400/10 text-gold-300 border border-gold-400/20 rounded px-1.5 py-0.5"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}

            {/* Reviews section */}
            <ProductReviews product={product} />
          </div>
        </div>

        {/* Footer fixo com preço + CTA */}
        <div className="border-t border-gold-500/20 p-4 bg-obsidian-950 shrink-0 safe-bottom">
          <div className="flex items-baseline justify-between mb-3">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider">
              {product.category === "DECANTE"
                ? "Decante 5ml"
                : product.category === "AFEER"
                ? "Miniatura Afeer"
                : "Frasco 25ml"}
            </span>
            <span className="font-serif-luxury text-2xl font-bold text-gold-400">
              {formatBRL(product.price)}
            </span>
          </div>
          {product.inStock ? (
            <button
              onClick={handleAdd}
              className="w-full btn-gold py-3 rounded-xl text-xs uppercase tracking-widest flex items-center justify-center gap-2 font-bold"
            >
              <SprayCan size={15} />
              <span>Adicionar à Sacola de Luxo</span>
            </button>
          ) : (
            <button
              onClick={() => {
                const msg = `Olá, equipe Mimi Mimos! 💛\n\nGostaria de *encomendar* o seguinte perfume:\n\n*${product.name}*\nCódigo: ${product.code}\nInspirado em: ${product.inspiration}\nPreço: ${formatBRL(product.price)}\n\nPoderiam me informar disponibilidade e prazo de entrega?`;
                window.open(`https://wa.me/5511970111433?text=${encodeURIComponent(msg)}`, "_blank");
              }}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-900/30"
            >
              <MessageCircleWarning size={15} />
              <span>Encomendar no WhatsApp</span>
            </button>
          )}

          {/* Share on WhatsApp */}
          <button
            onClick={() => {
              const productUrl = `${window.location.origin}${getPerfumeUrl(product)}`;
              const msg = `💖 *${product.name}*\n\n✨ Inspirado em: ${product.inspiration}\n💰 Preço: ${formatBRL(product.price)}\n⭐ Avaliação: ${displayRating.toFixed(1)} estrelas\n\nVeja os detalhes completos em:\n${productUrl}`;
              window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
              toast.success("Abrindo WhatsApp para compartilhar...");
            }}
            className="w-full mt-2 py-2.5 rounded-xl text-[10px] uppercase tracking-wider font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all flex items-center justify-center gap-1.5"
          >
            <MessageCircle size={13} />
            Compartilhar no WhatsApp
          </button>

          {/* Link para página de detalhe (SEO-friendly URL) */}
          <a
            href={getPerfumeUrl(product)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="w-full mt-2 text-[10px] uppercase tracking-wider text-gold-300/70 hover:text-gold-200 transition-colors flex items-center justify-center gap-1.5 py-1.5 border-t border-gold-500/10"
            aria-label={`Ver página completa de ${product.name}`}
          >
            <ExternalLink size={11} />
            Ver página completa
          </a>
        </div>
      </aside>
    </div>
  );
}
