"use client";

import { useState, useMemo } from "react";
import type { Perfume } from "@/lib/perfumes";
import { getPerfumeUrl } from "@/lib/slug";
import { useStore, useUI } from "@/lib/stores-combined";
import { useReviewStore } from "@/lib/review-store";
import { useCompareStore } from "@/lib/compare-store";
import { formatBRL } from "@/lib/pix";
import { playAtomizerSpraySound, playSoftChime } from "@/lib/audio";
import { toast } from "sonner";
import SkeletonImage from "./SkeletonImage";
import {
  RotateCw,
  RotateCcw,
  Cloud,
  Heart,
  TreePine,
  SprayCan,
  MessageCircleWarning,
  Package,
  Wind,
  Heart as HeartIcon,
  Star,
  Eye,
  Award,
  GitCompareArrows,
  Check,
  Flame,
  Share2,
} from "lucide-react";

export default function PerfumeCard({ perfume }: { perfume: Perfume }) {
  const [flipped, setFlipped] = useState(false);
  const addToCart = useStore((s) => s.addToCart);
  const openNotify = useUI((s) => s.openNotify);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const isFav = useStore((s) => s.favorites.includes(perfume.id));

  // Compare
  const addToCompare = useCompareStore((s) => s.addToCompare);
  const isInCompare = useCompareStore((s) => s.isInCompare(perfume.id));
  const setCompareModalOpen = useCompareStore((s) => s.setModalOpen);

  // Real customer reviews
  const userReviewCount = useReviewStore((s) => s.getReviewCount(perfume.id));
  const userAvgRating = useReviewStore((s) => s.getAverageRating(perfume.id));
  const totalReviewCount = (perfume.reviewCount || 0) + userReviewCount;
  const displayRating = userReviewCount > 0 ? userAvgRating : perfume.rating;
  const isTopRated = displayRating >= 4.9 && totalReviewCount >= 30;

  // Stock urgency — deterministic pseudo-random based on ID (avoid hydration mismatch)
  // ~30% of in-stock products show "low stock" badge
  const lowStockCount = useMemo(() => {
    if (!perfume.inStock) return 0;
    const hash = perfume.id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const n = (hash % 7) + 1; // 1-7
    if (hash % 3 === 0) return n; // ~33% of products
    return 0;
  }, [perfume.id, perfume.inStock]);

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    playAtomizerSpraySound();
    addToCart(perfume);
    toast.success(`Frasco de ${perfume.name} adicionado à sacola!`);
  };

  const handleCompare = (e: React.MouseEvent) => {
    e.stopPropagation();
    const result = addToCompare(perfume.id);
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.info(result.message);
    }
  };

  const handleNotify = (e: React.MouseEvent) => {
    e.stopPropagation();
    openNotify(perfume);
  };

  const handleFav = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(perfume.id);
    toast.success(
      isFav ? "Removido dos favoritos" : "Adicionado aos favoritos ♥"
    );
  };

  const handleQuickView = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Use SlideIn drawer (right-side panel) for better UX
    window.dispatchEvent(new CustomEvent("openSlideIn", { detail: perfume }));
  };

  const handleShareWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = typeof window !== "undefined"
      ? `${window.location.origin}${getPerfumeUrl(perfume)}`
      : `https://mimi-mimos.pages.dev${getPerfumeUrl(perfume)}`;
    const msg = `🛍️ *${perfume.name}* (${perfume.code})\n✨ Inspiração: ${perfume.inspiration}\n💰 ${formatBRL(perfume.price)}\n\nVeja mais em: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
    toast.success("Abrindo WhatsApp para compartilhar...");
  };

  const flip = (e: React.MouseEvent) => {
    e.stopPropagation();
    playSoftChime();
    setFlipped((f) => !f);
  };

  return (
    <div
      className={`card-flip-container h-[560px] w-full cursor-pointer group magnify-cursor transition-transform duration-300 hover:-translate-y-1 ${
        flipped ? "flipped" : ""
      }`}
      onClick={() => {
        playSoftChime();
        setFlipped((f) => !f);
      }}
    >
      <div className="card-flip-inner shadow-2xl group-hover:shadow-gold-500/20 transition-shadow duration-300">
        {/* CARD FRONT */}
        <div className="card-front glass-panel border border-gold-500/20 p-4 flex flex-col justify-between overflow-hidden group-hover:border-gold-400/50 transition-all">
          {/* Header Info */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-full bg-gold-500/10 border border-gold-500/30 text-gold-300">
                {perfume.code}
              </span>
              <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded border ${
                perfume.category === "DECANTE"
                  ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
                  : perfume.category === "AFEER"
                  ? "text-amber-400 bg-amber-400/10 border-amber-400/20"
                  : "text-gold-400 bg-gold-400/10 border-gold-400/20"
              }`}>
                {perfume.category === "DECANTE"
                  ? "DECANTE 5ML"
                  : perfume.category === "AFEER"
                  ? "MINI AFEER"
                  : "BRAND 25ML"}
              </span>
            </div>

            <div className="relative w-full h-60 rounded-xl overflow-hidden mb-3 bg-obsidian-950 p-2">
              <SkeletonImage
                src={perfume.image}
                alt={perfume.name}
                className="w-full h-full group-hover:scale-105 transition-transform duration-700 ease-out"
                fit="contain"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-obsidian-950 via-transparent to-transparent opacity-80 pointer-events-none" />
              {/* Stock urgency badge — "Últimas X unidades" (top-center, takes priority) */}
              {lowStockCount > 0 && perfume.inStock && lowStockCount <= 5 && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-red-500/90 text-white text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-lg shadow-red-500/30 border border-red-300/50">
                  <Flame size={9} /> Últimas {lowStockCount} un.
                </div>
              )}
              {/* Top Avaliado badge (top-center, only when no urgency badge) */}
              {isTopRated && perfume.inStock && !(lowStockCount > 0 && lowStockCount <= 5) && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-gradient-to-r from-gold-500 to-amber-400 text-obsidian-950 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-lg shadow-gold-500/40 border border-gold-300">
                  <Award size={10} /> Top Avaliado
                </div>
              )}
              {!perfume.inStock && (
                <div className="absolute inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center font-serif-luxury text-xs font-bold text-red-400 uppercase tracking-widest border border-red-500/30">
                  Esgotado
                </div>
              )}
              <button
                onClick={flip}
                className="absolute bottom-2 right-2 text-[10px] bg-obsidian-950/85 backdrop-blur-md text-gold-300 px-2.5 py-1 rounded-full border border-gold-500/30 hover:bg-gold-500 hover:text-obsidian-950 transition-all flex items-center gap-1"
              >
                <RotateCw size={11} /> Dossier
              </button>
              {/* Favorite heart (top-left corner) */}
              <button
                onClick={handleFav}
                className={`absolute top-2 left-2 w-8 h-8 rounded-full backdrop-blur-md border flex items-center justify-center transition-all ${
                  isFav
                    ? "bg-red-500/20 border-red-400/60 hover:scale-110"
                    : "bg-obsidian-950/70 border-gold-500/20 hover:scale-110"
                }`}
                aria-label="Favoritar"
              >
                <Heart
                  size={13}
                  className={
                    isFav
                      ? "text-red-500 fill-red-500"
                      : "text-gold-300 hover:text-gold-400"
                  }
                />
              </button>
              {/* Quick view (top-right corner) */}
              <button
                onClick={handleQuickView}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-obsidian-950/70 backdrop-blur-md border border-gold-500/20 flex items-center justify-center text-gold-300 hover:text-gold-400 hover:scale-110 transition-all"
                aria-label="Visualização rápida"
              >
                <Eye size={13} />
              </button>
              {/* Compare (bottom-left corner) */}
              <button
                onClick={handleCompare}
                className={`absolute bottom-2 left-2 w-8 h-8 rounded-full backdrop-blur-md border flex items-center justify-center transition-all ${
                  isInCompare
                    ? "bg-emerald-500/20 border-emerald-400/60 text-emerald-300 hover:scale-110"
                    : "bg-obsidian-950/70 border-gold-500/20 text-gold-300 hover:text-gold-400 hover:scale-110"
                }`}
                aria-label={isInCompare ? "Ver comparação" : "Adicionar à comparação"}
                title={isInCompare ? "Ver comparação" : "Comparar"}
              >
                {isInCompare ? (
                  <Check
                    size={13}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCompareModalOpen(true);
                    }}
                  />
                ) : (
                  <GitCompareArrows size={13} />
                )}
              </button>
            </div>

            <h4 className="font-serif-luxury text-lg font-bold text-white leading-snug line-clamp-1">
              {perfume.name}
            </h4>
            <p className="text-xs text-gold-300/90 font-medium line-clamp-2 leading-snug min-h-[2rem]">
              {perfume.inspiration}
            </p>

            {/* Rating row */}
            <div className="flex items-center gap-1.5 mt-1.5">
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={10}
                    className={
                      i < Math.round(displayRating)
                        ? "text-gold-400 fill-gold-400"
                        : "text-gray-700"
                    }
                  />
                ))}
              </div>
              <span className="text-[10px] text-gray-300 font-semibold">
                {displayRating.toFixed(1)}
              </span>
              <span className="text-[10px] text-gray-500">
                ({totalReviewCount}
                {userReviewCount > 0 && (
                  <span className="text-emerald-400"> · {userReviewCount} reais</span>
                )})
              </span>
            </div>

            <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-300/90">
              <Package size={11} className="text-gold-500/70" />
              <span className="tracking-wide">
                {perfume.intensity} • {perfume.fixation}
              </span>
            </div>

            {/* Tags */}
            {perfume.tags && perfume.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {perfume.tags.slice(0, 3).map((t) => (
                  <span
                    key={t}
                    className="text-[9px] bg-gold-400/10 text-gold-300 border border-gold-400/20 rounded px-1.5 py-0.5"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Price and Action CTA */}
          <div className="pt-3 border-t border-gold-500/15">
            <div className="flex justify-between items-baseline mb-3">
              <span className="text-[10px] text-gray-400 uppercase tracking-[0.15em] font-medium">
                {perfume.category === "DECANTE"
                  ? "Decante 5ml"
                  : perfume.category === "AFEER"
                  ? "Miniatura Afeer"
                  : "Frasco 25ml"}
              </span>
              <div className="text-right">
                <span className="font-serif-luxury text-xl font-bold text-gold-400 tracking-tight block leading-none">
                  {formatBRL(perfume.price)}
                </span>
                {perfume.category === "DECANTE" && (
                  <span className="text-[9px] text-emerald-400 font-bold">
                    3 por R$ 100
                  </span>
                )}
              </div>
            </div>

            {perfume.inStock ? (
              <div className="flex gap-2">
                <button
                  onClick={handleAdd}
                  className="flex-1 btn-gold py-2.5 rounded-xl text-[11px] uppercase tracking-wider flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <SprayCan size={13} className="shrink-0" />
                  <span>Garantir</span>
                </button>
                <button
                  onClick={handleShareWhatsApp}
                  aria-label="Compartilhar no WhatsApp"
                  title="Compartilhar no WhatsApp"
                  className="shrink-0 w-10 h-10 rounded-xl bg-emerald-600/20 hover:bg-emerald-500/40 border border-emerald-500/40 text-emerald-300 hover:text-emerald-200 flex items-center justify-center transition-all"
                >
                  <Share2 size={14} />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={handleNotify}
                  className="flex-1 bg-emerald-700/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-emerald-300 font-semibold py-2.5 rounded-xl text-[11px] uppercase tracking-wider flex items-center justify-center gap-1.5 whitespace-nowrap transition-all"
                >
                  <MessageCircleWarning size={13} className="shrink-0" />
                  <span>Avise-me</span>
                </button>
                <button
                  onClick={handleShareWhatsApp}
                  aria-label="Compartilhar no WhatsApp"
                  title="Compartilhar no WhatsApp"
                  className="shrink-0 w-10 h-10 rounded-xl bg-emerald-600/20 hover:bg-emerald-500/40 border border-emerald-500/40 text-emerald-300 hover:text-emerald-200 flex items-center justify-center transition-all"
                >
                  <Share2 size={14} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* CARD BACK (DOSSIER OLFATIVO) */}
        <div className="card-back glass-panel-gold border border-gold-500/50 p-5 flex flex-col justify-between overflow-hidden">
          <div>
            <div className="flex justify-between items-center mb-3 border-b border-gold-500/30 pb-2">
              <span className="font-serif-luxury text-lg font-bold text-gold-300">
                Pirâmide Olfativa
              </span>
              <button
                onClick={flip}
                className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
              >
                <RotateCcw size={12} /> Voltar
              </button>
            </div>

            <p className="text-[11px] text-gray-300/90 leading-relaxed mb-3 italic line-clamp-3">
              “{perfume.description}”
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-gold-400 tracking-wider flex items-center gap-1">
                  <Cloud size={12} /> Notas de Topo:
                </span>
                <p className="text-gray-200 mt-0.5 leading-relaxed">
                  {perfume.notesTopo}
                </p>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-gold-400 tracking-wider flex items-center gap-1">
                  <Heart size={12} /> Notas de Coração:
                </span>
                <p className="text-gray-200 mt-0.5 leading-relaxed">
                  {perfume.notesCoracao}
                </p>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-gold-400 tracking-wider flex items-center gap-1">
                  <TreePine size={12} /> Notas de Fundo:
                </span>
                <p className="text-gray-200 mt-0.5 leading-relaxed">
                  {perfume.notesFundo}
                </p>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-gold-500/20">
            {perfume.inStock ? (
              <button
                onClick={handleAdd}
                className="w-full btn-gold py-2 rounded-xl text-xs uppercase font-bold flex items-center justify-center gap-2"
              >
                <SprayCan size={13} /> Adicionar à Sacola
              </button>
            ) : (
              <button
                onClick={handleNotify}
                className="w-full bg-emerald-600 text-white py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2"
              >
                <Wind size={13} /> Entrar na Fila no WhatsApp
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
