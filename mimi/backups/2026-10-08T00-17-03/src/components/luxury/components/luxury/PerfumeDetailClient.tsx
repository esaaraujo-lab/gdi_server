"use client";

import Link from "next/link";
import { useStore } from "@/lib/stores-combined";
import { useUI } from "@/lib/stores-combined";
import { formatBRL } from "@/lib/pix";
import { playAtomizerSpraySound } from "@/lib/audio";
import { toast } from "sonner";
import {
  ArrowLeft,
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
  Award,
  ChevronRight,
  ShoppingBag,
  Truck,
  ShieldCheck,
  Gift,
  Share2,
  MessageCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useReviewStore } from "@/lib/review-store";
import { useCompareStore } from "@/lib/compare-store";
import { getPerfumeUrl } from "@/lib/slug";
import SkeletonImage from "@/components/luxury/SkeletonImage";
import ProductReviews from "@/components/luxury/ProductReviews";
import type { Perfume } from "@/lib/perfumes";

/**
 * Página de detalhe de perfume (SEO-friendly).
 *
 * Renderizada em `/perfume/[slug]` — cada perfume tem uma URL própria
 * indexável pelo Google. Inclui:
 *  - Metadata dinâmica (title, description, OG image)
 *  - JSON-LD structured data (Product schema)
 *  - Layout completo: header + breadcrumb + produto + reviews + footer
 *  - Botão "Voltar ao catálogo"
 *  - Botão "Adicionar à sacola"
 *  - Botão "Comparar"
 *  - Botão "Favoritar"
 *  - Botão "Avise-me" se esgotado
 *
 * Recebe o perfume como prop (buscado server-side via generateStaticParams).
 */

interface PerfumeDetailClientProps {
  perfume: Perfume;
}

export default function PerfumeDetailClient({
  perfume,
}: PerfumeDetailClientProps) {
  const addToCart = useStore((s) => s.addToCart);
  const openNotify = useUI((s) => s.openNotify);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const isFav = useStore((s) => s.favorites.includes(perfume.id));
  const addToCompare = useCompareStore((s) => s.addToCompare);
  const isInCompare = useCompareStore((s) => s.isInCompare(perfume.id));

  // Reviews
  const userReviewCount = useReviewStore((s) => s.getReviewCount(perfume.id));
  const userAvgRating = useReviewStore((s) => s.getAverageRating(perfume.id));
  const displayRating = userReviewCount > 0 ? userAvgRating : perfume.rating;
  const displayReviewCount = (perfume.reviewCount || 0) + userReviewCount;

  // Image gallery — main image always first, followed by `perfume.images`
  // (additional angles from GitHub). When `images` is empty/undefined, the
  // gallery has a single entry and the thumbnail strip is hidden.
  const galleryImages = useMemo<string[]>(
    () => [perfume.image, ...(perfume.images ?? [])],
    [perfume.image, perfume.images]
  );
  const [activeImage, setActiveImage] = useState(0);

  // Reset the active thumbnail to the main image whenever the product changes
  // (e.g., when navigating between /perfume/[slug] pages without unmounting).
  // This is the official React "adjust state during render" pattern (instead
  // of an effect) to avoid cascading renders. Calling setState conditionally
  // during render is safe — React will re-render this same component without
  // committing the intermediate render.
  // Refs: https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [activeImageProductId, setActiveImageProductId] = useState(perfume.id);
  if (activeImageProductId !== perfume.id) {
    setActiveImageProductId(perfume.id);
    setActiveImage(0);
  }

  const handleAdd = () => {
    playAtomizerSpraySound();
    addToCart(perfume);
    toast.success(`${perfume.name} adicionado à sacola!`);
  };

  const handleCompare = () => {
    const result = addToCompare(perfume.id);
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.info(result.message);
    }
  };

  const handleFav = () => {
    toggleFavorite(perfume.id);
    toast.success(
      isFav ? "Removido dos favoritos" : "Adicionado aos favoritos ♥"
    );
  };

  const handleShareWhatsApp = () => {
    const productUrl = `${window.location.origin}${getPerfumeUrl(perfume)}`;
    const msg = `💖 *${perfume.name}*\n\n✨ Inspirado em: ${perfume.inspiration}\n💰 Preço: ${formatBRL(perfume.price)}\n⭐ Avaliação: ${displayRating.toFixed(1)} estrelas\n\nVeja os detalhes completos em:\n${productUrl}`;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(msg)}`,
      "_blank"
    );
    toast.success("Abrindo WhatsApp para compartilhar...");
  };

  const handleCopyLink = async () => {
    const productUrl = `${window.location.origin}${getPerfumeUrl(perfume)}`;
    try {
      await navigator.clipboard.writeText(productUrl);
      toast.success("Link do produto copiado!");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  };

  const categoryLabel =
    perfume.category === "BRAND"
      ? "Brand Collection 25ml"
      : perfume.category === "AFEER"
      ? "Miniatura Afeer"
      : "Decante 5ml";

  const genderLabel =
    perfume.gender === "FEMININO"
      ? "Feminino"
      : perfume.gender === "MASCULINO"
      ? "Masculino"
      : perfume.gender === "ARABE"
      ? "Árabe"
      : "Unissex";

  return (
    <main className="flex-grow bg-obsidian-950 min-h-screen">
      {/* Breadcrumb */}
      <nav className="max-w-6xl mx-auto px-4 sm:px-8 pt-6 pb-2">
        <ol className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-500">
          <li>
            <Link
              href="/"
              className="hover:text-gold-300 transition-colors flex items-center gap-1"
            >
              <ArrowLeft size={11} /> Início
            </Link>
          </li>
          <li>
            <ChevronRight size={10} className="text-gray-600" />
          </li>
          <li>
            <Link
              href="/#catalogSection"
              className="hover:text-gold-300 transition-colors"
            >
              Catálogo
            </Link>
          </li>
          <li>
            <ChevronRight size={10} className="text-gray-600" />
          </li>
          <li className="text-gold-300 truncate max-w-[200px] sm:max-w-none">
            {perfume.name}
          </li>
        </ol>
      </nav>

      {/* Product detail grid */}
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-10">
          {/* Image side — main image + thumbnail gallery (if multiple) */}
          <div className="space-y-3">
            <div className="relative bg-obsidian-900 rounded-2xl overflow-hidden border border-gold-500/15 aspect-square md:aspect-[4/5]">
              <SkeletonImage
                src={galleryImages[activeImage] ?? perfume.image}
                alt={`${perfume.name} — inspirado em ${perfume.inspiration}`}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-obsidian-950/60 via-transparent to-transparent pointer-events-none" />

              {/* Badges no topo da imagem */}
              <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                <span className="text-[10px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-full bg-gold-500/20 border border-gold-500/40 text-gold-200 backdrop-blur-md">
                  {perfume.code}
                </span>
                <span className="text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-obsidian-950/60 border border-gold-500/20 text-gold-300 backdrop-blur-md">
                  {categoryLabel}
                </span>
              </div>

              {/* Favorite (top-right) */}
              <button
                onClick={handleFav}
                className={`absolute top-3 right-3 w-10 h-10 rounded-full backdrop-blur-md border flex items-center justify-center transition-all ${
                  isFav
                    ? "bg-red-500/20 border-red-400/60"
                    : "bg-obsidian-950/70 border-gold-500/30"
                }`}
                aria-label="Favoritar"
              >
                <Heart
                  size={18}
                  className={
                    isFav ? "text-red-500 fill-red-500" : "text-gold-300"
                  }
                />
              </button>

              {/* Top Avaliado badge */}
              {displayRating >= 4.9 && displayReviewCount >= 30 && (
                <div className="absolute bottom-3 left-3 flex items-center gap-1 bg-gradient-to-r from-gold-500 to-amber-400 text-obsidian-950 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-lg shadow-gold-500/40 border border-gold-300">
                  <Award size={11} /> Top Avaliado
                </div>
              )}

              {/* Image counter (top-right corner, below favorite) */}
              {galleryImages.length > 1 && (
                <span className="absolute top-16 right-3 text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-obsidian-950/70 border border-gold-500/25 text-gold-200 backdrop-blur-md">
                  {activeImage + 1} / {galleryImages.length}
                </span>
              )}
            </div>

            {/* Thumbnail gallery — only when there are multiple images */}
            {galleryImages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {galleryImages.map((img, idx) => {
                  const isActive = idx === activeImage;
                  return (
                    <button
                      key={`${img}-${idx}`}
                      onClick={() => setActiveImage(idx)}
                      className={`relative shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden border transition-all duration-300 ${
                        isActive
                          ? "border-gold-400 ring-2 ring-gold-400/40 scale-[1.03]"
                          : "border-gold-500/20 opacity-60 hover:opacity-100 hover:border-gold-500/50"
                      }`}
                      aria-label={`Ver imagem ${idx + 1} de ${galleryImages.length}`}
                      aria-pressed={isActive}
                    >
                      <SkeletonImage
                        src={img}
                        alt={`${perfume.name} — foto ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Info side */}
          <div className="flex flex-col gap-4">
            {/* Categoria + gênero */}
            <div className="flex items-center gap-2 flex-wrap text-[10px] uppercase tracking-wider font-bold">
              <span className="px-2.5 py-1 rounded-full bg-gold-500/15 border border-gold-500/30 text-gold-300">
                {categoryLabel}
              </span>
              <span className="px-2.5 py-1 rounded-full bg-obsidian-900 border border-gold-500/15 text-gray-300">
                {genderLabel}
              </span>
              {perfume.inStock ? (
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Em estoque
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full bg-red-500/15 border border-red-500/30 text-red-300">
                  Esgotado
                </span>
              )}
            </div>

            {/* Nome + inspiração */}
            <div>
              <h1 className="font-serif-luxury text-3xl sm:text-4xl font-bold text-white leading-tight">
                {perfume.name}
              </h1>
              <p className="text-sm sm:text-base text-gold-300 mt-1.5 font-medium">
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
              <span className="text-xs text-gray-500">
                ({displayReviewCount} avaliações
                {userReviewCount > 0 && (
                  <span className="text-emerald-400 ml-1">
                    · {userReviewCount} reais
                  </span>
                )})
              </span>
            </div>

            {/* Descrição */}
            <p className="text-sm text-gray-300 leading-relaxed italic border-l-2 border-gold-500/30 pl-3">
              "{perfume.description}"
            </p>

            {/* Meta tags — grid 2x2 */}
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2 text-xs text-gray-300 bg-obsidian-900/60 rounded-lg px-3 py-2 border border-gold-500/10">
                <Droplets size={14} className="text-gold-400" />
                <div>
                  <p className="text-[9px] uppercase text-gray-500 tracking-wider">
                    Intensidade
                  </p>
                  <p className="font-bold text-white">{perfume.intensity}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-300 bg-obsidian-900/60 rounded-lg px-3 py-2 border border-gold-500/10">
                <Clock size={14} className="text-gold-400" />
                <div>
                  <p className="text-[9px] uppercase text-gray-500 tracking-wider">
                    Fixação
                  </p>
                  <p className="font-bold text-white">{perfume.fixation}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-300 bg-obsidian-900/60 rounded-lg px-3 py-2 border border-gold-500/10">
                <Calendar size={14} className="text-gold-400" />
                <div>
                  <p className="text-[9px] uppercase text-gray-500 tracking-wider">
                    Estação
                  </p>
                  <p className="font-bold text-white text-[11px]">{perfume.season}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-300 bg-obsidian-900/60 rounded-lg px-3 py-2 border border-gold-500/10">
                <Sparkles size={14} className="text-gold-400" />
                <div>
                  <p className="text-[9px] uppercase text-gray-500 tracking-wider">
                    Ocasião
                  </p>
                  <p className="font-bold text-white text-[11px]">{perfume.occasion}</p>
                </div>
              </div>
            </div>

            {/* Família olfativa */}
            <div className="bg-obsidian-900/60 rounded-lg p-3 border border-gold-500/10">
              <p className="text-[10px] uppercase text-gray-500 tracking-wider mb-1 font-bold">
                Família Olfativa
              </p>
              <p className="text-sm text-gold-300 font-bold">{perfume.family}</p>
            </div>

            {/* Pirâmide olfativa */}
            <div className="bg-obsidian-900/60 rounded-xl p-4 border border-gold-500/10 space-y-3">
              <p className="text-[10px] uppercase tracking-wider text-gold-300 font-bold flex items-center gap-1.5 mb-2">
                <Package size={12} /> Pirâmide Olfativa
              </p>
              <div>
                <span className="text-[10px] uppercase font-bold text-gold-400 tracking-wider flex items-center gap-1">
                  <Cloud size={11} /> Notas de Topo:
                </span>
                <p className="text-sm text-gray-200 mt-0.5">{perfume.notesTopo}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-gold-400 tracking-wider flex items-center gap-1">
                  <HeartIcon size={11} /> Notas de Coração:
                </span>
                <p className="text-sm text-gray-200 mt-0.5">{perfume.notesCoracao}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-gold-400 tracking-wider flex items-center gap-1">
                  <TreePine size={11} /> Notas de Fundo:
                </span>
                <p className="text-sm text-gray-200 mt-0.5">{perfume.notesFundo}</p>
              </div>
            </div>

            {/* Tags */}
            {(perfume.tags || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {(perfume.tags || []).map((t) => (
                  <span
                    key={t}
                    className="text-[10px] bg-gold-400/10 text-gold-300 border border-gold-400/20 rounded-full px-2.5 py-1 font-medium"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}

            {/* Preço + CTAs */}
            <div className="border-t border-gold-500/15 pt-4 space-y-3">
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                    {perfume.category === "DECANTE"
                      ? "Decante 5ml"
                      : perfume.category === "AFEER"
                      ? "Miniatura Afeer"
                      : "Frasco 25ml"}
                  </p>
                  <p className="font-serif-luxury text-3xl sm:text-4xl font-bold text-gold-400 tracking-tight">
                    {formatBRL(perfume.price)}
                  </p>
                  {perfume.category === "DECANTE" && (
                    <p className="text-[10px] text-emerald-400 font-bold mt-1">
                      🎁 Promo: 3 decantes por R$ 100
                    </p>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-2">
                {perfume.inStock ? (
                  <button
                    onClick={handleAdd}
                    className="col-span-2 btn-gold py-3.5 rounded-xl text-xs uppercase tracking-widest flex items-center justify-center gap-2 font-bold"
                  >
                    <SprayCan size={16} />
                    Adicionar à Sacola de Luxo
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      const msg = `Olá, equipe Mimi Mimos! 💛\n\nGostaria de *encomendar* o seguinte perfume:\n\n*${perfume.name}*\nCódigo: ${perfume.code}\nInspirado em: ${perfume.inspiration}\nPreço: ${formatBRL(perfume.price)}\n\nPoderiam me informar disponibilidade e prazo de entrega?`;
                      window.open(`https://wa.me/5511958546078?text=${encodeURIComponent(msg)}`, "_blank");
                    }}
                    className="col-span-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-900/30"
                  >
                    <MessageCircleWarning size={16} />
                    Encomendar no WhatsApp
                  </button>
                )}
                <button
                  onClick={handleCompare}
                  className={`py-2.5 rounded-xl text-[10px] uppercase tracking-wider font-bold border transition-all flex items-center justify-center gap-1.5 ${
                    isInCompare
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                      : "bg-obsidian-900 border-gold-500/30 text-gold-300 hover:border-gold-500/60"
                  }`}
                >
                  <Package size={13} />
                  {isInCompare ? "Na comparação" : "Comparar"}
                </button>
                <button
                  onClick={handleFav}
                  className={`py-2.5 rounded-xl text-[10px] uppercase tracking-wider font-bold border transition-all flex items-center justify-center gap-1.5 ${
                    isFav
                      ? "bg-red-500/15 border-red-500/40 text-red-300"
                      : "bg-obsidian-900 border-gold-500/30 text-gold-300 hover:border-gold-500/60"
                  }`}
                >
                  <Heart size={13} className={isFav ? "fill-red-500" : ""} />
                  {isFav ? "Favoritado" : "Favoritar"}
                </button>
              </div>

              {/* Share buttons — WhatsApp + Copy link */}
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button
                  onClick={handleShareWhatsApp}
                  className="py-2.5 rounded-xl text-[10px] uppercase tracking-wider font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all flex items-center justify-center gap-1.5"
                >
                  <MessageCircle size={13} />
                  Compartilhar
                </button>
                <button
                  onClick={handleCopyLink}
                  className="py-2.5 rounded-xl text-[10px] uppercase tracking-wider font-bold bg-obsidian-900 border border-gold-500/30 text-gold-300 hover:border-gold-500/60 transition-all flex items-center justify-center gap-1.5"
                >
                  <Share2 size={13} />
                  Copiar Link
                </button>
              </div>
            </div>

            {/* Trust badges mini */}
            <div className="grid grid-cols-3 gap-2 pt-2">
              <div className="text-center p-2 rounded-lg bg-obsidian-900/40 border border-gold-500/10">
                <Truck size={14} className="mx-auto text-emerald-400 mb-1" />
                <p className="text-[9px] text-gray-400">Frete grátis</p>
                <p className="text-[8px] text-gray-600">Acima de R$ 100</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-obsidian-900/40 border border-gold-500/10">
                <ShieldCheck size={14} className="mx-auto text-gold-400 mb-1" />
                <p className="text-[9px] text-gray-400">Pix seguro</p>
                <p className="text-[8px] text-gray-600">OpenFinance</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-obsidian-900/40 border border-gold-500/10">
                <Gift size={14} className="mx-auto text-purple-400 mb-1" />
                <p className="text-[9px] text-gray-400">Embrulho</p>
                <p className="text-[8px] text-gray-600">Presente</p>
              </div>
            </div>
          </div>
        </div>

        {/* Reviews section */}
        <div className="mt-10 max-w-4xl mx-auto">
          <ProductReviews product={perfume} />
        </div>

        {/* CTA — voltar ao catálogo */}
        <div className="mt-8 text-center">
          <Link
            href="/#catalogSection"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-gold-500/30 text-gold-300 hover:bg-gold-500/10 hover:border-gold-500/60 transition-all text-xs uppercase tracking-wider font-bold"
          >
            <ArrowLeft size={14} />
            Voltar ao Catálogo
          </Link>
        </div>
      </div>
    </main>
  );
}
