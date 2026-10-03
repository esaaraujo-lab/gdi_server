"use client";

import { useEffect, useState } from "react";
import { useStore, useUI } from "@/lib/stores-combined";
import { useReviewStore } from "@/lib/review-store";
import { useCompareStore } from "@/lib/compare-store";
import { formatBRL } from "@/lib/pix";
import { playAtomizerSpraySound } from "@/lib/audio";
import { getPerfumeUrl } from "@/lib/slug";
import { toast } from "sonner";
import {
  Heart,
  SprayCan,
  MessageCircleWarning,
  Star,
  Cloud,
  Heart as HeartIcon,
  TreePine,
  Calendar,
  Sparkles,
  Clock,
  Droplets,
  Package,
  GitCompareArrows,
  Share2,
  Link as LinkIcon,
  Check,
  Truck,
  ShieldCheck,
  Gift,
  ChevronRight,
  Home,
} from "lucide-react";
import SkeletonImage from "./SkeletonImage";
import ProductReviews from "./ProductReviews";
import type { Perfume } from "@/lib/perfumes";

/**
 * PerfumeDetailClient — full-page perfume detail.
 *
 * Rendered by `/perfume/[slug]/page.tsx` (server component).
 *
 * Layout:
 *  - Breadcrumb (Início › Catálogo › {Name})
 *  - 2-column grid: image (left) + info (right)
 *    - Image: aspect-square md:aspect-[4/5] with object-contain (NOT object-cover)
 *    - Multi-image gallery (uses images[] field if present)
 *  - Badges: code, category, gender (♀/♂/✦), stock status
 *  - Rating with stars + review count
 *  - Description in italic with border-left
 *  - Meta tags 2x2 (intensity, fixation, season, occasion)
 *  - Family olfativa
 *  - Olfactory pyramid (topo/coração/fundo)
 *  - Tags
 *  - Price + CTAs:
 *    - In stock: "Adicionar à Sacola de Luxo" (btn-gold)
 *    - Out of stock: "Encomendar no WhatsApp" (emerald, opens wa.me with formatted message)
 *  - "Compartilhar" button (emerald, opens wa.me/?text with product URL)
 *  - "Copiar Link" button (copies URL to clipboard)
 *  - Compare + Favoritar buttons
 *  - Trust badges mini (frete grátis, pix seguro, embrulho)
 *  - ProductReviews component
 *  - "Voltar ao Catálogo" link
 */
export default function PerfumeDetailClient({ perfume }: { perfume: Perfume }) {
  const addToCart = useStore((s) => s.addToCart);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const isFav = useStore((s) => s.favorites.includes(perfume.id));
  const pushRecentlyViewed = useStore((s) => s.pushRecentlyViewed);
  const openNotify = useUI((s) => s.openNotify);

  const addToCompare = useCompareStore((s) => s.addToCompare);
  const isInCompare = useCompareStore((s) => s.isInCompare(perfume.id));

  const userReviewCount = useReviewStore((s) => s.getReviewCount(perfume.id));
  const userAvgRating = useReviewStore((s) => s.getAverageRating(perfume.id));
  const displayRating = userReviewCount > 0 ? userAvgRating : perfume.rating;
  const displayReviewCount = (perfume.reviewCount || 0) + userReviewCount;

  // Gallery state — first image is the main, then any extra angles from `images[]`
  const gallery: string[] = [perfume.image, ...(perfume.images || [])].filter(
    Boolean
  );
  const [activeImage, setActiveImage] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    pushRecentlyViewed(perfume.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [perfume.id, pushRecentlyViewed]);

  const handleAdd = () => {
    playAtomizerSpraySound();
    addToCart(perfume);
    toast.success(`Frasco de ${perfume.name} adicionado à sacola!`);
  };

  const handleFav = () => {
    toggleFavorite(perfume.id);
    toast.success(
      isFav ? "Removido dos favoritos" : "Adicionado aos favoritos ♥"
    );
  };

  const handleCompare = () => {
    const result = addToCompare(perfume.id);
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.info(result.message);
    }
  };

  const buildShareMessage = (): string => {
    const productUrl = `${typeof window !== "undefined" ? window.location.origin : ""}${getPerfumeUrl(perfume)}`;
    return `💖 *${perfume.name}*\n\n✨ Inspirado em: ${perfume.inspiration}\n💰 Preço: ${formatBRL(perfume.price)}\n⭐ Avaliação: ${displayRating.toFixed(1)} estrelas\n\nVeja os detalhes em:\n${productUrl}`;
  };

  const handleShareWhatsApp = () => {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(buildShareMessage())}`,
      "_blank"
    );
    toast.success("Abrindo WhatsApp para compartilhar...");
  };

  const handleCopyLink = async () => {
    try {
      const url =
        typeof window !== "undefined"
          ? `${window.location.origin}${getPerfumeUrl(perfume)}`
          : getPerfumeUrl(perfume);
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copiado para a área de transferência!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  };

  const handleOrderWhatsApp = () => {
    const msg = `Olá, equipe Mimi Mimos! 💛\n\nGostaria de *encomendar* o seguinte perfume:\n\n*${perfume.name}*\nCódigo: ${perfume.code}\nInspirado em: ${perfume.inspiration}\nPreço: ${formatBRL(perfume.price)}\n\nPoderiam me informar disponibilidade e prazo de entrega?`;
    window.open(
      `https://wa.me/5511958546078?text=${encodeURIComponent(msg)}`,
      "_blank"
    );
  };

  const genderIcon =
    perfume.gender === "FEMININO"
      ? "♀"
      : perfume.gender === "MASCULINO"
      ? "♂"
      : "✦";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-gray-500 mb-6 flex-wrap"
      >
        <a
          href="/"
          className="flex items-center gap-1 hover:text-gold-300 transition-colors"
        >
          <Home size={11} /> Início
        </a>
        <ChevronRight size={11} className="text-gray-600" />
        <a
          href="/#catalogSection"
          className="hover:text-gold-300 transition-colors"
        >
          Catálogo
        </a>
        <ChevronRight size={11} className="text-gray-600" />
        <span className="text-gold-300 font-semibold truncate max-w-[200px]">
          {perfume.name}
        </span>
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 items-start">
        {/* LEFT — image gallery */}
        <div className="space-y-3">
          <div className="relative aspect-square md:aspect-[4/5] rounded-2xl overflow-hidden bg-obsidian-950 border border-gold-500/20 p-4">
            {/* IMPORTANT: object-contain to show full image centered (not crop) */}
            <SkeletonImage
              src={gallery[activeImage] || perfume.image}
              alt={`${perfume.name} — imagem ${activeImage + 1}`}
              className="w-full h-full"
              fit="contain"
            />

            {/* Code badge */}
            <span className="absolute top-3 left-3 text-[10px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-full bg-gold-500/20 border border-gold-500/40 text-gold-200 backdrop-blur-md">
              {perfume.code}
            </span>

            {/* Stock status badge */}
            {perfume.inStock ? (
              <span className="absolute top-3 right-3 text-[10px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 backdrop-blur-md flex items-center gap-1">
                <Check size={10} /> Em estoque
              </span>
            ) : (
              <span className="absolute top-3 right-3 text-[10px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-full bg-red-500/20 border border-red-400/40 text-red-200 backdrop-blur-md">
                Esgotado
              </span>
            )}

            {/* Favorite */}
            <button
              onClick={handleFav}
              className={`absolute bottom-3 right-3 w-9 h-9 rounded-full backdrop-blur-md border flex items-center justify-center transition-all ${
                isFav
                  ? "bg-red-500/20 border-red-400/60"
                  : "bg-obsidian-950/70 border-gold-500/30"
              }`}
              aria-label={isFav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
            >
              <Heart
                size={16}
                className={isFav ? "text-red-500 fill-red-500" : "text-gold-300"}
              />
            </button>
          </div>

          {/* Thumbnails (gallery) */}
          {gallery.length > 1 && (
            <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1">
              {gallery.map((img, i) => (
                <button
                  key={`${img}-${i}`}
                  onClick={() => setActiveImage(i)}
                  className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden bg-obsidian-950 border transition-all shrink-0 ${
                    i === activeImage
                      ? "border-gold-400 shadow-md shadow-gold-500/20"
                      : "border-gold-500/20 hover:border-gold-400/50"
                  }`}
                  aria-label={`Ver imagem ${i + 1}`}
                >
                  <SkeletonImage
                    src={img}
                    alt={`${perfume.name} — ângulo ${i + 1}`}
                    className="w-full h-full"
                    fit="contain"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT — info */}
        <div className="space-y-5">
          {/* Badges row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-full bg-gold-500/10 border border-gold-500/30 text-gold-300">
              {perfume.category}
            </span>
            <span className="text-[10px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-full bg-obsidian-900/60 border border-gold-500/20 text-gray-300">
              {genderIcon} {perfume.gender}
            </span>
            {perfume.family && (
              <span className="text-[10px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-full bg-obsidian-900/60 border border-gold-500/20 text-gray-300">
                {perfume.family}
              </span>
            )}
          </div>

          {/* Name */}
          <div>
            <h1 className="font-serif-luxury text-3xl sm:text-4xl font-bold text-white leading-tight">
              {perfume.name}
            </h1>
            <p className="text-sm text-gold-300 mt-1 font-medium">
              Inspirado em: {perfume.inspiration}
            </p>
          </div>

          {/* Rating */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  size={16}
                  className={
                    i < Math.round(displayRating)
                      ? "text-gold-400 fill-gold-400"
                      : "text-gray-700"
                  }
                />
              ))}
            </div>
            <span className="text-sm text-gold-300 font-bold">
              {displayRating.toFixed(1)}
            </span>
            <span className="text-[11px] text-gray-500">
              ({displayReviewCount}{" "}
              {displayReviewCount === 1 ? "avaliação" : "avaliações"})
            </span>
          </div>

          {/* Description */}
          {perfume.description && (
            <blockquote className="text-sm text-gray-300 leading-relaxed italic border-l-2 border-gold-500/40 pl-4 py-1">
              "{perfume.description}"
            </blockquote>
          )}

          {/* Meta tags 2x2 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 text-xs text-gray-300 bg-obsidian-900/60 rounded-lg px-3 py-2 border border-gold-500/10">
              <Droplets size={14} className="text-gold-400 shrink-0" />
              <span>{perfume.intensity}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-300 bg-obsidian-900/60 rounded-lg px-3 py-2 border border-gold-500/10">
              <Clock size={14} className="text-gold-400 shrink-0" />
              <span>Fixação {perfume.fixation}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-300 bg-obsidian-900/60 rounded-lg px-3 py-2 border border-gold-500/10">
              <Calendar size={14} className="text-gold-400 shrink-0" />
              <span className="truncate">{perfume.season}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-300 bg-obsidian-900/60 rounded-lg px-3 py-2 border border-gold-500/10">
              <Sparkles size={14} className="text-gold-400 shrink-0" />
              <span className="truncate">{perfume.occasion}</span>
            </div>
          </div>

          {/* Family olfativa */}
          {perfume.family && (
            <div className="text-xs text-gray-300 bg-obsidian-900/40 rounded-lg px-3 py-2 border border-gold-500/10">
              <span className="text-[10px] uppercase font-bold text-gold-400 tracking-wider mr-2">
                Família olfativa:
              </span>
              <span className="text-gray-200">{perfume.family}</span>
            </div>
          )}

          {/* Olfactory pyramid */}
          <div className="space-y-2 text-xs bg-obsidian-900/60 rounded-xl p-4 border border-gold-500/10">
            <h3 className="text-[10px] uppercase font-bold text-gold-400 tracking-wider mb-1">
              Pirâmide olfativa
            </h3>
            <div>
              <span className="text-[10px] uppercase font-bold text-gold-400 tracking-wider flex items-center gap-1">
                <Cloud size={12} /> Topo
              </span>
              <p className="text-gray-200 mt-0.5">{perfume.notesTopo}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-gold-400 tracking-wider flex items-center gap-1">
                <HeartIcon size={12} /> Coração
              </span>
              <p className="text-gray-200 mt-0.5">{perfume.notesCoracao}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-gold-400 tracking-wider flex items-center gap-1">
                <TreePine size={12} /> Fundo
              </span>
              <p className="text-gray-200 mt-0.5">{perfume.notesFundo}</p>
            </div>
          </div>

          {/* Tags */}
          {(perfume.tags || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(perfume.tags || []).slice(0, 8).map((t) => (
                <span
                  key={t}
                  className="text-[10px] bg-gold-400/10 text-gold-300 border border-gold-400/20 rounded px-2 py-0.5"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}

          {/* Price + CTA */}
          <div className="bg-obsidian-900/60 border border-gold-500/20 rounded-2xl p-4 space-y-3">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                  {perfume.category === "DECANTE"
                    ? "Decante 5ml"
                    : perfume.category === "AFEER"
                    ? "Miniatura Afeer"
                    : "Frasco 25ml"}
                </p>
                <p className="font-serif-luxury text-3xl font-bold text-gold-400 tracking-tight">
                  {formatBRL(perfume.price)}
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  ou 12x de {formatBRL(perfume.price / 12)} no cartão
                </p>
              </div>
              {perfume.stockQty > 0 && perfume.stockQty <= 5 && (
                <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300">
                  Últimas {perfume.stockQty} unidades
                </span>
              )}
            </div>

            {/* Primary CTA */}
            {perfume.inStock ? (
              <button
                onClick={handleAdd}
                className="w-full btn-gold py-3.5 rounded-xl text-xs uppercase tracking-widest flex items-center justify-center gap-2 font-bold"
              >
                <SprayCan size={16} />
                Adicionar à Sacola de Luxo
              </button>
            ) : (
              <button
                onClick={handleOrderWhatsApp}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-900/30"
              >
                <MessageCircleWarning size={16} />
                Encomendar no WhatsApp
              </button>
            )}

            {/* Secondary actions */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleShareWhatsApp}
                className="bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/40 text-emerald-300 font-bold py-2.5 rounded-xl text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all"
              >
                <Share2 size={13} />
                Compartilhar
              </button>
              <button
                onClick={handleCopyLink}
                className="bg-obsidian-900/60 hover:bg-obsidian-900 border border-gold-500/30 text-gold-300 font-bold py-2.5 rounded-xl text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all"
              >
                {copied ? (
                  <>
                    <Check size={13} /> Copiado!
                  </>
                ) : (
                  <>
                    <LinkIcon size={13} /> Copiar Link
                  </>
                )}
              </button>
            </div>

            {/* Tertiary actions */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleCompare}
                className={`text-[10px] uppercase tracking-wider font-bold py-2 rounded-lg border transition-all flex items-center justify-center gap-1.5 ${
                  isInCompare
                    ? "bg-emerald-500/15 border-emerald-400/50 text-emerald-300"
                    : "bg-obsidian-900/40 border-gold-500/20 text-gray-300 hover:text-gold-300 hover:border-gold-400/50"
                }`}
              >
                <GitCompareArrows size={12} />
                {isInCompare ? "Na comparação" : "Comparar"}
              </button>
              <button
                onClick={handleFav}
                className={`text-[10px] uppercase tracking-wider font-bold py-2 rounded-lg border transition-all flex items-center justify-center gap-1.5 ${
                  isFav
                    ? "bg-red-500/15 border-red-400/50 text-red-300"
                    : "bg-obsidian-900/40 border-gold-500/20 text-gray-300 hover:text-gold-300 hover:border-gold-400/50"
                }`}
              >
                <Heart size={12} className={isFav ? "fill-red-500" : ""} />
                {isFav ? "Favoritado" : "Favoritar"}
              </button>
            </div>

            {!perfume.inStock && (
              <button
                onClick={() => openNotify(perfume)}
                className="w-full text-[10px] uppercase tracking-wider text-gold-300/70 hover:text-gold-200 py-1.5 transition-colors"
              >
                🔔 Avise-me quando chegar
              </button>
            )}
          </div>

          {/* Trust badges mini */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-obsidian-900/40 border border-gold-500/10 rounded-lg p-2">
              <Truck size={16} className="mx-auto text-gold-400 mb-1" />
              <p className="text-[9px] text-gray-400 uppercase tracking-wider">
                Frete grátis
              </p>
            </div>
            <div className="bg-obsidian-900/40 border border-gold-500/10 rounded-lg p-2">
              <ShieldCheck size={16} className="mx-auto text-gold-400 mb-1" />
              <p className="text-[9px] text-gray-400 uppercase tracking-wider">
                Pix seguro
              </p>
            </div>
            <div className="bg-obsidian-900/40 border border-gold-500/10 rounded-lg p-2">
              <Gift size={16} className="mx-auto text-gold-400 mb-1" />
              <p className="text-[9px] text-gray-400 uppercase tracking-wider">
                Embrulho
              </p>
            </div>
          </div>

          {/* Product reviews */}
          <ProductReviews product={perfume} />

          {/* Back to catalog */}
          <a
            href="/#catalogSection"
            className="block text-center text-[10px] uppercase tracking-widest text-gold-300/70 hover:text-gold-200 transition-colors py-3 border-t border-gold-500/10"
          >
            ← Voltar ao Catálogo
          </a>
        </div>
      </div>

      {/* Related: hidden for now; could add ProductCarousel here */}
      <div className="sr-only">
        <Package aria-hidden />
      </div>
    </div>
  );
}
