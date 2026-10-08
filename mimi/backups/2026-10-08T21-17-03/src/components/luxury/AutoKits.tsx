"use client";

import { useMemo, useState, useEffect } from "react";
import { useStore, useUI } from "@/lib/stores-combined";
import { formatBRL } from "@/lib/pix";
import { toast } from "sonner";
import { Gift, ShoppingBag, ChevronLeft, ChevronRight } from "lucide-react";
import SkeletonImage from "./SkeletonImage";
import type { Perfume, ProductGender } from "@/lib/perfumes";
import { BRINDE_THRESHOLD, BRAND_KIT_PRICE } from "@/lib/constants";

/**
 * AutoKits — gera múltiplos combos promocionais baseados em layering.
 *
 * Lógica:
 *  - Apenas perfumes BRAND com preço = R$69,99 (não mais caros nem mais baratos)
 *  - Agrupa por gênero (Feminino, Masculino, etc.)
 *  - Em cada gênero, gera múltiplas combinações de 3 perfumes
 *  - Ordenados por intensidade (mais denso → menos denso para layering)
 *  - Preço do kit: R$195 (abaixo de R$199 para forçar brinde)
 *
 * Exibição:
 *  - Desktop: mostra 2-3 combos lado a lado
 *  - Mobile: carrossel auto-rotativo com transição suave
 */

const TARGET_PRICE = 69.99;
const KIT_PRICE = BRAND_KIT_PRICE;
const COMBO_SIZE = 3;

// Intensity rank for layering (higher = more dense)
function getIntensityRank(intensity: string): number {
  if (!intensity) return 2;
  const lower = intensity.toLowerCase();
  if (lower.includes("extrait") || lower.includes("parfum")) return 4;
  if (lower.includes("eau de parfum") || lower.includes("edp")) return 3;
  if (lower.includes("eau de toilette") || lower.includes("edt")) return 2;
  if (lower.includes("eau de cologne") || lower.includes("edc")) return 1;
  return 2;
}

const GENDER_LABELS: Record<ProductGender, string> = {
  FEMININO: "Feminino",
  MASCULINO: "Masculino",
  UNISSEX: "Unissex",
  ARABE: "Árabe",
};

interface AutoKit {
  id: string;
  gender: ProductGender;
  products: Perfume[];
  totalPrice: number;
  kitPrice: number;
  savings: number;
  label: string;
  comboName: string;
}

/**
 * Generate all possible combinations of 3 products from a list.
 * Uses combinations (not permutations) — order doesn't matter for the set.
 */
function combinations<T>(arr: T[], size: number): T[][] {
  if (size > arr.length) return [];
  if (size === 0) return [[]];
  if (size === 1) return arr.map((x) => [x]);

  const result: T[][] = [];
  for (let i = 0; i <= arr.length - size; i++) {
    const head = arr[i];
    const tailCombinations = combinations(arr.slice(i + 1), size - 1);
    for (const tail of tailCombinations) {
      result.push([head, ...tail]);
    }
  }
  return result;
}

function generateKits(products: Perfume[]): AutoKit[] {
  // Only BRAND products at exactly R$69,99, in stock
  const eligible = products.filter(
    (p) =>
      p.category === "BRAND" &&
      p.inStock &&
      p.stockQty > 0 &&
      p.price === TARGET_PRICE
  );

  if (eligible.length < COMBO_SIZE) return [];

  // Group by gender
  const byGender = new Map<ProductGender, Perfume[]>();
  for (const p of eligible) {
    if (!byGender.has(p.gender)) byGender.set(p.gender, []);
    byGender.get(p.gender)!.push(p);
  }

  const kits: AutoKit[] = [];
  let comboCounter = 0;

  for (const [gender, genderProducts] of byGender) {
    if (genderProducts.length < COMBO_SIZE) continue;

    // Sort by intensity (most dense first for layering)
    const sorted = [...genderProducts].sort(
      (a, b) => getIntensityRank(b.intensity) - getIntensityRank(a.intensity)
    );

    // Generate all combinations of 3 (limit to max 4 per gender to avoid overload)
    const combos = combinations(sorted, COMBO_SIZE).slice(0, 4);

    for (const combo of combos) {
      // Sort within combo by intensity (most dense → least dense)
      combo.sort(
        (a, b) => getIntensityRank(b.intensity) - getIntensityRank(a.intensity)
      );

      const totalPrice = combo.reduce((sum, p) => sum + p.price, 0);
      const savings = totalPrice - KIT_PRICE;
      comboCounter++;

      // Generate a nice combo name from product names
      const shortNames = combo.map((p) => p.name.split(" ")[0]);
      const comboName = shortNames.join(" + ");

      kits.push({
        id: `autokit_${gender.toLowerCase()}_${comboCounter}`,
        gender,
        products: combo,
        totalPrice,
        kitPrice: KIT_PRICE,
        savings,
        label: GENDER_LABELS[gender] || gender,
        comboName,
      });
    }
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

  // Auto-rotate every 4 seconds (only on mobile, and if there are multiple kits)
  useEffect(() => {
    if (kits.length <= 1 || isPaused) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % kits.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [kits.length, isPaused]);

  if (kits.length === 0) return null;

  const remainingToBrinde = Math.max(0, BRINDE_THRESHOLD - KIT_PRICE);

  const handleAddKit = (kit: AutoKit) => {
    kit.products.forEach((p) => addToCart(p));
    toast.success(
      `Kit ${kit.label} adicionado à sacola! Faltam só R$ ${remainingToBrinde.toFixed(2)} para o brinde grátis!`
    );
    setCartOpen(true);
  };

  const goPrev = () => {
    setIsPaused(true);
    setCurrentIndex((prev) => (prev - 1 + kits.length) % kits.length);
    setTimeout(() => setIsPaused(false), 8000);
  };

  const goNext = () => {
    setIsPaused(true);
    setCurrentIndex((prev) => (prev + 1) % kits.length);
    setTimeout(() => setIsPaused(false), 8000);
  };

  // Determine how many kits to show on desktop
  const desktopVisibleCount = Math.min(kits.length, 3);
  const desktopKits: AutoKit[] = [];
  for (let i = 0; i < desktopVisibleCount; i++) {
    desktopKits.push(kits[(currentIndex + i) % kits.length]);
  }

  const currentMobileKit = kits[currentIndex % kits.length];

  return (
    <section
      id="autoKitsSection"
      className="py-16 px-4 sm:px-8 border-y border-gold-500/10 relative overflow-hidden"
      style={{ background: "linear-gradient(to bottom, rgba(14,13,12,0.4), rgba(8,8,8,0.2) 50%, rgba(14,13,12,0.4))" }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Decorative aura */}
      <div className="absolute top-0 left-1/4 w-80 h-80 bg-gold-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-60 h-60 bg-amber-400/4 rounded-full blur-2xl pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center gap-2 mb-3 px-4 py-1.5 rounded-full bg-gold-500/15 border border-gold-500/30">
            <Gift size={14} className="text-gold-300" />
            <span className="text-xs uppercase tracking-[0.2em] text-gold-200 font-bold">
              Kits Promocionais
            </span>
          </div>
          <h2 className="font-serif-luxury text-3xl md:text-4xl font-bold text-white mb-2">
            Combos com Desconto
          </h2>
          <p className="text-xs text-gray-400 max-w-xl mx-auto">
            Combinações perfeitas de fragrâncias selecionadas pelo nosso sistema de curadoria.
            Cada kit foi montado respeitando a técnica de layering — do mais intenso ao mais leve.
          </p>
        </div>

        {/* === DESKTOP: 2-3 cards lado a lado com transição suave === */}
        <div className="hidden md:grid grid-cols-3 gap-5">
          {desktopKits.map((kit, displayIndex) => (
            <KitCard
              key={`${kit.id}-${displayIndex}`}
              kit={kit}
              onAdd={() => handleAddKit(kit)}
              remaining={remainingToBrinde}
              isHighlighted={displayIndex === 0}
              style={{
                animation: `kitFadeIn 0.5s ease-out ${displayIndex * 0.1}s both`,
              }}
            />
          ))}
        </div>

        {/* === MOBILE: carrossel auto-rotativo === */}
        <div className="md:hidden">
          <KitCard
            key={currentMobileKit.id}
            kit={currentMobileKit}
            onAdd={() => handleAddKit(currentMobileKit)}
            remaining={remainingToBrinde}
            isHighlighted={true}
            style={{ animation: "kitFadeIn 0.4s ease-out both" }}
          />

          {/* Navigation */}
          {kits.length > 1 && (
            <>
              <div className="flex items-center justify-center gap-3 mt-5">
                <button
                  onClick={goPrev}
                  className="w-9 h-9 rounded-full bg-obsidian-950/80 border border-gold-500/30 flex items-center justify-center text-gold-400 hover:bg-gold-500 hover:text-obsidian-950 transition-all"
                  aria-label="Combo anterior"
                >
                  <ChevronLeft size={16} />
                </button>

                {/* Dots */}
                <div className="flex items-center gap-1.5">
                  {kits.map((kit, i) => (
                    <button
                      key={kit.id}
                      onClick={() => {
                        setCurrentIndex(i);
                        setIsPaused(true);
                        setTimeout(() => setIsPaused(false), 8000);
                      }}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        i === currentIndex
                          ? "w-5 bg-gold-500"
                          : "w-1.5 bg-gold-500/30"
                      }`}
                      aria-label={`Combo ${i + 1}`}
                    />
                  ))}
                </div>

                <button
                  onClick={goNext}
                  className="w-9 h-9 rounded-full bg-obsidian-950/80 border border-gold-500/30 flex items-center justify-center text-gold-400 hover:bg-gold-500 hover:text-obsidian-950 transition-all"
                  aria-label="Próximo combo"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Desktop navigation arrows */}
        {kits.length > 3 && (
          <div className="hidden md:flex items-center justify-center gap-3 mt-6">
            <button
              onClick={goPrev}
              className="w-9 h-9 rounded-full bg-obsidian-950/80 border border-gold-500/30 flex items-center justify-center text-gold-400 hover:bg-gold-500 hover:text-obsidian-950 transition-all"
              aria-label="Combos anteriores"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs text-gray-500">
              {currentIndex + 1}–{Math.min(currentIndex + 3, kits.length)} de {kits.length} combos
            </span>
            <button
              onClick={goNext}
              className="w-9 h-9 rounded-full bg-obsidian-950/80 border border-gold-500/30 flex items-center justify-center text-gold-400 hover:bg-gold-500 hover:text-obsidian-950 transition-all"
              aria-label="Próximos combos"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes kitFadeIn {
            0% { opacity: 0; transform: translateY(12px); }
            100% { opacity: 1; transform: translateY(0); }
          }
        `
      }} />
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
//  KIT CARD — reusable component
// ═══════════════════════════════════════════════════════════
function KitCard({
  kit,
  onAdd,
  remaining,
  isHighlighted,
  style,
}: {
  kit: AutoKit;
  onAdd: () => void;
  remaining: number;
  isHighlighted: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`relative rounded-2xl overflow-hidden transition-all duration-300 ${
        isHighlighted
          ? "border-2 border-gold-500/40 shadow-2xl shadow-gold-500/10"
          : "border border-gold-500/15"
      } bg-obsidian-900/80 hover:border-gold-400/60 hover:-translate-y-1`}
      style={style}
    >
      {/* Products thumbnails with layering order */}
      <div className="p-4 pb-2">
        <div className="flex items-center justify-center gap-1.5 mb-3">
          {kit.products.map((p, i) => (
            <div key={p.id} className="flex items-center gap-1">
              <div className="relative">
                <SkeletonImage
                  src={p.image}
                  alt={p.name}
                  className="w-14 h-14 sm:w-16 sm:h-16 object-contain rounded-xl bg-obsidian-950 p-1 border border-gold-500/15"
                  fit="contain"
                />
                {/* Layering order badge */}
                <div className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-gold-500 text-obsidian-950 text-[9px] font-bold flex items-center justify-center shadow-md">
                  {i + 1}
                </div>
              </div>
              {i < kit.products.length - 1 && (
                <ChevronRight size={14} className="text-gold-500/30 shrink-0" />
              )}
            </div>
          ))}
        </div>

        {/* Product names */}
        <div className="text-center mb-2">
          <p className="text-[10px] text-gold-400 uppercase tracking-wider mb-0.5 font-bold">
            {kit.label} · Layering
          </p>
          <p className="text-xs text-white font-medium line-clamp-1">
            {kit.comboName}
          </p>
          <p className="text-[9px] text-gray-500 mt-0.5">
            Do mais denso ao mais leve
          </p>
        </div>
      </div>

      {/* Price + savings */}
      <div className="px-4 pb-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[9px] text-gray-500 uppercase tracking-wider">Preço do kit</p>
            <p className="text-lg font-serif-luxury font-bold text-gold-400">
              {formatBRL(kit.kitPrice)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-gray-500 uppercase tracking-wider">Você economiza</p>
            <p className="text-sm font-bold text-emerald-400">
              {formatBRL(kit.savings)}
            </p>
          </div>
        </div>
      </div>

      {/* Urgency: brinde reminder */}
      <div className="px-4 pb-2">
        <p className="text-[10px] text-amber-300 font-medium text-center">
          ⚡ Faltam só {formatBRL(remaining)} para o brinde grátis!
        </p>
      </div>

      {/* One-click buy */}
      <div className="p-4 pt-2">
        <button
          onClick={onAdd}
          className="w-full bg-gold-500 hover:bg-gold-400 text-obsidian-950 py-2.5 rounded-xl text-xs uppercase tracking-widest font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
        >
          <ShoppingBag size={14} />
          Adicionar Kit à Sacola
        </button>
      </div>
    </div>
  );
}
