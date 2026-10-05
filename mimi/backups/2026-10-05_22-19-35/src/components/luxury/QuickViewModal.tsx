"use client";

import { useEffect, useState } from "react";
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
  RotateCw,
  Share2,
} from "lucide-react";
import ProductReviews from "./ProductReviews";
import SkeletonImage from "./SkeletonImage";
import { useReviewStore } from "@/lib/review-store";

export default function QuickViewModal() {
  const open = useUI((s) => s.quickViewOpen);
  const setOpen = useUI((s) => s.setQuickViewOpen);
  const product = useUI((s) => s.quickViewProduct);
  const addToCart = useStore((s) => s.addToCart);
  const openNotify = useUI((s) => s.openNotify);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const isFav = useStore((s) =>
    product ? s.favorites.includes(product.id) : false
  );
  const pushRecentlyViewed = useStore((s) => s.pushRecentlyViewed);

  // Reviews (real customer reviews)
  const userReviewCount = useReviewStore((s) =>
    product ? s.getReviewCount(product.id) : 0
  );
  const userAvgRating = useReviewStore((s) =>
    product ? s.getAverageRating(product.id) : 0
  );
  // Display rating: usa média real de reviews se houver, senão o rating do produto
  const displayRating =
    userReviewCount > 0 ? userAvgRating : product?.rating || 0;
  const displayReviewCount = (product?.reviewCount || 0) + userReviewCount;

  const openQuickView = useUI((s) => s.openQuickView);

  useEffect(() => {
    if (open && product) {
      playSoftChime();
      pushRecentlyViewed(product.id);
    }
  }, [open, product, pushRecentlyViewed]);

  // Ouve evento custom do Instagram Shopping
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        openQuickView(detail);
      }
    };
    window.addEventListener("openQuickView", handler);
    return () => window.removeEventListener("openQuickView", handler);
  }, [openQuickView]);

  if (!open || !product) return null;

  const handleAdd = () => {
    playAtomizerSpraySound();
    addToCart(product);
    toast.success(`Frasco de ${product.name} adicionado à sacola!`);
    setOpen(false);
  };

  const handleShareWhatsApp = () => {
    const msg = `🛍️ *${product.name}* (${product.code})\n✨ Inspiração: ${product.inspiration}\n💰 ${formatBRL(product.price)}\n\nVeja mais na Mimi Mimos!`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
    toast.success("Abrindo WhatsApp para compartilhar...");
  };

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="glass-panel max-w-3xl w-full rounded-2xl relative border border-gold-500/40 shadow-2xl max-h-[90vh] overflow-y-auto">
        <button
          onClick={() => setOpen(false)}
          className="absolute top-4 right-4 z-10 text-gray-400 hover:text-white bg-obsidian-950/60 rounded-full p-1.5"
          aria-label="Fechar"
        >
          <X size={18} />
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
          {/* Image side */}
          <div className="relative bg-obsidian-950 rounded-l-2xl h-80 md:h-96 overflow-hidden p-4">
            <SkeletonImage
              src={product.image}
              alt={product.name}
              className="w-full h-full"
              fit="contain"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-obsidian-950 via-transparent to-transparent opacity-70" />
            <span className="absolute top-3 left-3 text-[10px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-full bg-gold-500/20 border border-gold-500/40 text-gold-200 backdrop-blur-md">
              {product.code}
            </span>
            <button
              onClick={() => {
                toggleFavorite(product.id);
                toast.success(
                  isFav ? "Removido dos favoritos" : "Adicionado aos favoritos ♥"
                );
              }}
              className="absolute top-3 right-3 w-9 h-9 rounded-full bg-obsidian-950/70 border border-gold-500/30 flex items-center justify-center backdrop-blur-md hover:scale-110 transition-transform"
              aria-label="Favoritar"
            >
              <Heart
                size={16}
                className={
                  isFav ? "text-red-500 fill-red-500" : "text-gold-300"
                }
              />
            </button>
          </div>

          {/* Info side */}
          <div className="p-6 flex flex-col">
            <span className="text-[10px] uppercase tracking-widest text-gold-400/80 font-semibold">
              {product.family}
            </span>
            <h3 className="font-serif-luxury text-2xl md:text-3xl font-bold text-white mt-1 leading-tight">
              {product.name}
            </h3>
            <p className="text-sm text-gold-300 mt-1.5 font-medium">
              Inspirado em: {product.inspiration}
            </p>

            {/* Rating */}
            <div className="flex items-center gap-2 mt-3">
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

            <p className="text-xs text-gray-300 leading-relaxed mt-3 italic">
              “{product.description}”
            </p>

            {/* Meta tags */}
            <div className="grid grid-cols-2 gap-2 mt-4">
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

            {/* Notes pyramid compact */}
            <div className="mt-4 space-y-2 text-xs">
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

            {/* Customer reviews section */}
            <ProductReviews product={product} />

            {/* Price + CTA */}
            <div className="mt-auto pt-4 border-t border-gold-500/20">
              <div className="flex items-baseline justify-between mb-3">
                <span className="text-[10px] text-gray-400 uppercase tracking-wider">
                  Frasco 25ml
                </span>
                <span className="font-serif-luxury text-2xl font-bold text-gold-400">
                  {formatBRL(product.price)}
                </span>
              </div>
              {product.inStock ? (
                <div className="flex gap-2">
                  <button
                    onClick={handleAdd}
                    className="flex-1 btn-gold py-3 rounded-xl text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                  >
                    <SprayCan size={15} />
                    <span>Adicionar à Sacola de Luxo</span>
                  </button>
                  <button
                    onClick={handleShareWhatsApp}
                    aria-label="Compartilhar no WhatsApp"
                    title="Compartilhar no WhatsApp"
                    className="shrink-0 w-12 h-12 rounded-xl bg-emerald-600/20 hover:bg-emerald-500/40 border border-emerald-500/40 text-emerald-300 hover:text-emerald-200 flex items-center justify-center transition-all"
                  >
                    <Share2 size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      openNotify(product);
                      setOpen(false);
                    }}
                    className="flex-1 bg-emerald-700/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-emerald-300 font-semibold py-3 rounded-xl text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
                  >
                    <MessageCircleWarning size={15} />
                    <span>Avise-me no WhatsApp</span>
                  </button>
                  <button
                    onClick={handleShareWhatsApp}
                    aria-label="Compartilhar no WhatsApp"
                    title="Compartilhar no WhatsApp"
                    className="shrink-0 w-12 h-12 rounded-xl bg-emerald-600/20 hover:bg-emerald-500/40 border border-emerald-500/40 text-emerald-300 hover:text-emerald-200 flex items-center justify-center transition-all"
                  >
                    <Share2 size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
