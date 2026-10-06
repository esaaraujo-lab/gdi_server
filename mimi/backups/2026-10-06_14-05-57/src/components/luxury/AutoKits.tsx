"use client";

import { useMemo, useState, useEffect } from "react";
import { useStore, useUI } from "@/lib/stores-combined";
import { formatBRL } from "@/lib/pix";
import { toast } from "sonner";
import { Gift, ShoppingBag, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import SkeletonImage from "./SkeletonImage";
import type { Perfume, ProductGender } from "@/lib/perfumes";

/**
 * AutoKits — gera kits promocionais automaticamente baseados em layering.
 *
 * Lógica de layering:
 *  - Cada kit tem 3 perfumes BRAND do mesmo gênero
 *  - Ordenados por intensidade (mais denso → menos denso):
 *    Extrait de Parfum > Eau de Parfum > Eau de Toilette
 *  - Preço do kit: R$195 (abaixo de R$199 para forçar brinde)
 *  - Economia: soma dos preços individuais - R$195
 *
 * Os kits são gerados dinamicamente dos produtos do D1 — nada hardcoded.
 * Aparece em carrossel minimalista com transições suaves.
 */

// Intensity rank for layering (higher = more dense/concentrated)
const INTENSITY_RANK: Record<string, number> = {
  "Extrait de Parfum": 4,
  "Eau de Parfum": 3,
  "Parfum": 4,
  "Eau de Toilette": 2,
  "Eau de Cologne": 1,
};

function getIntensityRank(intensity: string): number {
  if (!intensity) return 2;
  // Try exact match
  if (INTENSITY_RANK[intensity] !== undefined) return INTENSITY_RANK[intensity];
  // Try partial match
  const lower = intensity.toLowerCase();
  if (lower.includes("extrait") || lower.includes("parfum")) return 4;
  if (lower.includes("eau de parfum") || lower.includes("edp")) return 3;
  if (lower.includes("eau de toilette") || lower.includes("edt")) return 2;
  if (lower.includes("eau de cologne") || lower.includes("edc")) return 1;
  return 2;
}

const KIT_PRICE = 195; // Below R$199 to force brinde urgency
const BRINDE_THRESHOLD = 199;

interface AutoKit {
  id: string;
  gender: ProductGender;
  products: Perfume[];
  totalPrice: number; // sum of individual prices
  kitPrice: number; // R$195
  savings: number;
  label: string;
}

function generateKits(products: Perfume[]): AutoKit[] {
  const brandProducts = products.filter(
    (p) => p.category === "BRAND" && p.inStock && p.stockQty > 0
  );

  if (brandProducts.length < 3) return [];

  // Group by gender
  const byGender: Record<ProductGender, Perfume[]> = {
    FEMININO: [],
    MASCULINO: [],
    UNISSEX: [],
    ARABE: [],
  };

  for (const p of brandProducts) {
    if (byGender[p.gender]) byGender[p.gender].push(p);
  }

  const kits: AutoKit[] = [];

  for (const [genderStr, genderProducts] of Object.entries(byGender)) {
    const gender = genderStr as ProductGender;
    if (genderProducts.length < 3) continue;

    // Sort by intensity rank (more dense first for layering)
    const sorted = [...genderProducts].sort(
      (a, b) => getIntensityRank(b.intensity) - getIntensityRank(a.intensity)
    );

    // Take top 3 (most dense → less dense for layering)
    const kitProducts = sorted.slice(0, 3);
    const totalPrice = kitProducts.reduce((sum, p) => sum + p.price, 0);
    const savings = totalPrice - KIT_PRICE;

    const genderLabels: Record<ProductGender, string> = {
      FEMININO: "Feminino",
      MASCULINO: "Masculino",
      UNISSEX: "Unissex",
      ARABE: "Árabe",
    };

    kits.push({
      id: `autokit_${gender.toLowerCase()}`,
      gender,
      products: kitProducts,
      totalPrice,
      kitPrice: KIT_PRICE,
      savings,
      label: `Kit ${genderLabels[gender]}`,
    });
  }

  return kits;
}

export default function AutoKits() {
  const products = useStore((s) => s.products);
  const addToCart = useStore((s) => s.addToCart);
  const setCartOpen = useUI((s) => s.setCartOpen);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const kits = useMemo(() => generateKits(products), [products]);

  // Auto-rotate every 5 seconds (minimalist transition)
  useEffect(() => {
    if (kits.length <= 1 || isPaused) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % kits.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [kits.length, isPaused]);

  if (kits.length === 0) return null;

  const currentKit = kits[currentIndex % kits.length];
  if (!currentKit) return null;

  const remainingToBrinde = Math.max(0, BRINDE_THRESHOLD - currentKit.kitPrice);

  const handleAddKit = () => {
    currentKit.products.forEach((p) => addToCart(p));
    toast.success(`Kit ${currentKit.label} adicionado à sacola! Faltam só R$ ${remainingToBrinde.toFixed(2)} para o brinde grátis!`);
    setCartOpen(true);
  };

  const goPrev = () => {
    setIsPaused(true);
    setCurrentIndex((prev) => (prev - 1 + kits.length) % kits.length);
    setTimeout(() => setIsPaused(false), 10000);
  };

  const goNext = () => {
    setIsPaused(true);
    setCurrentIndex((prev) => (prev + 1) % kits.length);
    setTimeout(() => setIsPaused(false), 10000);
  };

  return (
    <section
      id="autoKitsSection"
      className="py-12 px-4 sm:px-8 max-w-7xl mx-auto"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center gap-2 mb-2 px-3 py-1 rounded-full bg-gold-500/15 border border-gold-500/30">
          <Gift size={12} className="text-gold-300" />
          <span className="text-[10px] uppercase tracking-[0.2em] text-gold-200 font-bold">
            Kits Promocionais
          </span>
        </div>
        <h2 className="font-serif-luxury text-2xl sm:text-3xl font-bold text-white">
          Combos com Desconto
        </h2>
        <p className="text-xs text-gray-400 mt-1 max-w-xl mx-auto">
          Aproveite nossos kits selecionados com preços especiais. Quanto mais
          completa a fragrância, maior a economia.
        </p>
      </div>

      {/* Carousel — minimalist with smooth transition */}
      <div className="relative max-w-2xl mx-auto">
        {/* Kit card */}
        <div
          key={currentKit.id}
          className="glass-panel-gold rounded-2xl border border-gold-500/30 overflow-hidden transition-opacity duration-700 ease-in-out"
          style={{ animation: "autoKitFadeIn 0.7s ease-out" }}
        >
          {/* Products thumbnails */}
          <div className="p-4">
            <div className="flex items-center justify-center gap-2 mb-3">
              {currentKit.products.map((p, i) => (
                <div key={p.id} className="flex items-center gap-2">
                  <div className="relative">
                    <SkeletonImage
                      src={p.image}
                      alt={p.name}
                      className="w-16 h-16 sm:w-20 sm:h-20 object-contain rounded-xl bg-obsidian-950 p-1 border border-gold-500/20"
                      fit="contain"
                    />
                    {/* Layering order badge */}
                    <div className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-gold-500 text-obsidian-950 text-[9px] font-bold flex items-center justify-center">
                      {i + 1}
                    </div>
                  </div>
                  {i < currentKit.products.length - 1 && (
                    <ChevronRight size={16} className="text-gold-500/40 shrink-0" />
                  )}
                </div>
              ))}
            </div>

            {/* Product names */}
            <div className="text-center mb-3">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                {currentKit.label} · Layering
              </p>
              <p className="text-sm text-white font-medium line-clamp-1">
                {currentKit.products.map((p) => p.name).join(" + ")}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">
                Do mais denso ao mais leve — combinação perfeita
              </p>
            </div>

            {/* Price + savings */}
            <div className="flex items-center justify-center gap-4 mb-3 text-center">
              <div>
                <p className="text-[9px] text-gray-500 uppercase tracking-wider">Preço do kit</p>
                <p className="text-xl font-serif-luxury font-bold text-gold-400">
                  {formatBRL(currentKit.kitPrice)}
                </p>
              </div>
              <div className="w-px h-10 bg-gold-500/20" />
              <div>
                <p className="text-[9px] text-gray-500 uppercase tracking-wider">Você economiza</p>
                <p className="text-sm font-bold text-emerald-400">
                  {formatBRL(currentKit.savings)}
                </p>
              </div>
            </div>

            {/* Urgency: brinde reminder */}
            <div className="text-center mb-3">
              <p className="text-[10px] text-amber-300 font-medium">
                ⚡ Faltam só {formatBRL(remainingToBrinde)} para o brinde grátis!
              </p>
            </div>

            {/* One-click buy */}
            <button
              onClick={handleAddKit}
              className="w-full btn-gold py-3 rounded-xl text-xs uppercase tracking-widest font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
            >
              <ShoppingBag size={14} />
              Adicionar Kit à Sacola
            </button>
          </div>
        </div>

        {/* Navigation arrows (minimalist) */}
        {kits.length > 1 && (
          <>
            <button
              onClick={goPrev}
              className="absolute top-1/2 -left-2 sm:-left-4 -translate-y-1/2 w-8 h-8 rounded-full bg-obsidian-950/80 border border-gold-500/30 flex items-center justify-center text-gold-400 hover:bg-gold-500 hover:text-obsidian-950 transition-all"
              aria-label="Kit anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={goNext}
              className="absolute top-1/2 -right-2 sm:-right-4 -translate-y-1/2 w-8 h-8 rounded-full bg-obsidian-950/80 border border-gold-500/30 flex items-center justify-center text-gold-400 hover:bg-gold-500 hover:text-obsidian-950 transition-all"
              aria-label="Próximo kit"
            >
              <ChevronRight size={16} />
            </button>
          </>
        )}

        {/* Dots indicator */}
        {kits.length > 1 && (
          <div className="flex items-center justify-center gap-1.5 mt-4">
            {kits.map((kit, i) => (
              <button
                key={kit.id}
                onClick={() => {
                  setCurrentIndex(i);
                  setIsPaused(true);
                  setTimeout(() => setIsPaused(false), 10000);
                }}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentIndex
                    ? "w-6 bg-gold-500"
                    : "w-1.5 bg-gold-500/30 hover:bg-gold-500/50"
                }`}
                aria-label={`Kit ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes autoKitFadeIn {
            0% { opacity: 0; transform: translateY(8px); }
            100% { opacity: 1; transform: translateY(0); }
          }
        `
      }} />
    </section>
  );
}
