"use client";

import { useStore } from "@/lib/stores-combined";
import { useCompareStore } from "@/lib/compare-store";
import { useReviewStore } from "@/lib/review-store";
import { formatBRL } from "@/lib/pix";
import type { Perfume } from "@/lib/perfumes";
import SkeletonImage from "./SkeletonImage";
import {
  X,
  GitCompareArrows,
  Trash2,
  ShoppingBag,
  Star,
  Crown,
  Cloud,
  Heart as HeartIcon,
  TreePine,
  Package,
  Clock,
  Calendar,
  Sparkles,
  Award,
  Droplets,
} from "lucide-react";
import { toast } from "sonner";

/**
 * Modal de Comparação de Perfumes.
 * Mostra até 3 perfumes lado a lado com todas as características principais:
 * - Imagem, código, nome, inspiração, preço
 * - Rating, family, intensidade, fixação, estação, ocasião
 * - Notas olfativas (topo/coração/fundo)
 * - Tags
 * - Botão "Adicionar à sacola" por produto
 * Highlight visual: o perfume com melhor rating ganha um crown dourado.
 */

// Critérios de destaque — para cada característica, identifica-se o "melhor"
function getBestValue<T>(
  perfumes: { id: string; value: T }[],
  isBetter: (a: T, b: T) => boolean
): Set<string> {
  if (perfumes.length === 0) return new Set();
  let best = perfumes[0];
  for (const p of perfumes) {
    if (isBetter(p.value, best.value)) best = p;
  }
  // Todos com o mesmo valor "best" também são destacados
  const result = new Set<string>();
  for (const p of perfumes) {
    if (!isBetter(best.value, p.value) && !isBetter(p.value, best.value)) {
      result.add(p.id);
    }
  }
  return result;
}

type LucideIcon = typeof Star;

interface RowProps {
  label: string;
  icon: LucideIcon;
  children: React.ReactNode[];
  comparedIds: string[];
  highlightIds?: Set<string>;
}

/** Linha de comparação — extraída como componente estável (fora do render). */
function Row({ label, icon: Icon, children, comparedIds, highlightIds }: RowProps) {
  return (
    <div
      className="grid border-b border-gold-500/10 last:border-b-0"
      style={{ gridTemplateColumns: `120px repeat(${children.length}, 1fr)` }}
    >
      <div className="p-3 text-[10px] uppercase tracking-wider text-gold-300/70 font-bold bg-obsidian-950/40 border-r border-gold-500/10 flex items-center gap-1.5 sticky left-0">
        <Icon size={11} />
        {label}
      </div>
      {children.map((child, i) => {
        const productId = comparedIds[i] || `idx-${i}`;
        const isHighlight = highlightIds?.has(productId);
        return (
          <div
            key={productId}
            className={`p-3 text-xs text-gray-200 border-r border-gold-500/10 last:border-r-0 ${
              isHighlight ? "bg-emerald-500/5" : ""
            }`}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}

function renderStars(rating: number, isBest: boolean) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={13}
          className={
            s <= Math.round(rating)
              ? isBest
                ? "fill-gold-300 text-gold-300"
                : "fill-gold-400 text-gold-400"
              : "text-gray-700"
          }
        />
      ))}
    </div>
  );
}

function parseFixation(fix: string): number {
  const matches = fix.match(/\d+/g);
  if (!matches || matches.length === 0) return 0;
  return Math.max(...matches.map(Number));
}

export default function CompareModal() {
  const products = useStore((s) => s.products);
  const addToCart = useStore((s) => s.addToCart);
  const ids = useCompareStore((s) => s.ids);
  const modalOpen = useCompareStore((s) => s.modalOpen);
  const setModalOpen = useCompareStore((s) => s.setModalOpen);
  const removeFromCompare = useCompareStore((s) => s.removeFromCompare);
  const clearCompare = useCompareStore((s) => s.clearCompare);

  const getAvgRating = useReviewStore((s) => s.getAverageRating);
  const getReviewCount = useReviewStore((s) => s.getReviewCount);

  if (!modalOpen) return null;

  // Busca os produtos selecionados
  const comparedProducts: Perfume[] = ids
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is Perfume => Boolean(p));

  if (comparedProducts.length === 0) {
    return null;
  }

  // Calcula highlights (melhor em cada categoria)
  const bestRating = getBestValue(
    comparedProducts.map((p) => ({
      id: p.id,
      value: getAvgRating(p.id) || p.rating || 0,
    })),
    (a, b) => a > b
  );
  const bestPrice = getBestValue(
    comparedProducts.map((p) => ({ id: p.id, value: p.price })),
    (a, b) => a < b
  );
  const bestFixation = getBestValue(
    comparedProducts.map((p) => ({
      id: p.id,
      value: parseFixation(p.fixation),
    })),
    (a, b) => a > b
  );

  const comparedIds = comparedProducts.map((p) => p.id);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="glass-panel max-w-6xl w-full rounded-2xl p-3 sm:p-5 relative border border-gold-500/40 shadow-2xl max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-gold-500/20 pb-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-gold-500/30 to-amber-400/10 border border-gold-500/40 flex items-center justify-center text-gold-300 shrink-0">
              <GitCompareArrows size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="font-serif-luxury text-lg sm:text-2xl font-bold text-white truncate">
                Comparação de Perfumes
              </h3>
              <p className="text-[10px] sm:text-[11px] text-gray-400">
                {comparedProducts.length} perfume(s) lado a lado. Linhas
                destacadas em verde indicam o melhor da categoria.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {comparedProducts.length > 0 && (
              <button
                onClick={() => {
                  if (confirm("Limpar todos os perfumes da comparação?")) {
                    clearCompare();
                    toast.info("Comparação limpa.");
                  }
                }}
                className="text-[10px] uppercase tracking-wider text-red-400 hover:text-red-300 px-2 py-1.5 rounded-lg border border-red-500/30 hover:bg-red-500/10 transition-all hidden sm:flex items-center gap-1"
              >
                <Trash2 size={11} /> Limpar
              </button>
            )}
            <button
              onClick={() => setModalOpen(false)}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Fechar comparação"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Tabela scrollable horizontalmente em mobile */}
        <div className="overflow-x-auto overflow-y-auto flex-grow -mx-3 sm:-mx-5 px-3 sm:px-5 pb-2">
          <div className="min-w-[700px]">
            {/* Linha 1: Imagem + botão remover */}
            <div
              className="grid border-b border-gold-500/20"
              style={{
                gridTemplateColumns: `120px repeat(${comparedProducts.length}, 1fr)`,
              }}
            >
              <div className="p-3 bg-obsidian-950/40 border-r border-gold-500/10 sticky left-0">
                <span className="text-[10px] uppercase tracking-wider text-gold-300/70 font-bold flex items-center gap-1">
                  <Package size={11} /> Produto
                </span>
              </div>
              {comparedProducts.map((p) => (
                <div
                  key={p.id}
                  className="p-3 border-r border-gold-500/10 last:border-r-0 text-center relative group"
                >
                  <button
                    onClick={() => {
                      removeFromCompare(p.id);
                      toast.info(`${p.name} removido da comparação.`);
                    }}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100"
                    aria-label="Remover da comparação"
                  >
                    <X size={11} />
                  </button>
                  <SkeletonImage
                    src={p.image}
                    alt={p.name}
                    className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-xl bg-obsidian-950 mx-auto border border-gold-500/15 mb-2"
                  />
                  <p className="text-[10px] text-gold-300 font-bold uppercase tracking-wider">
                    {p.code}
                  </p>
                  <p className="text-[11px] sm:text-xs font-bold text-white leading-tight mt-0.5 line-clamp-2">
                    {p.name}
                  </p>
                </div>
              ))}
            </div>

            {/* Linha 2: Inspiração */}
            <Row label="Inspirado em" icon={Crown} comparedIds={comparedIds}>
              {comparedProducts.map((p) => (
                <p
                  key={p.id}
                  className="text-[10px] text-gold-300/80 italic leading-tight"
                >
                  {p.inspiration}
                </p>
              ))}
            </Row>

            {/* Linha 3: Preço */}
            <Row
              label="Preço"
              icon={ShoppingBag}
              comparedIds={comparedIds}
              highlightIds={bestPrice}
            >
              {comparedProducts.map((p) => (
                <div key={p.id} className="flex flex-col">
                  <span className="font-serif-luxury text-base sm:text-lg font-bold text-gold-400">
                    {formatBRL(p.price)}
                  </span>
                  {bestPrice.has(p.id) && comparedProducts.length > 1 && (
                    <span className="text-[9px] text-emerald-300 font-bold uppercase tracking-wider mt-0.5">
                      🏆 Melhor preço
                    </span>
                  )}
                </div>
              ))}
            </Row>

            {/* Linha 4: Avaliação */}
            <Row
              label="Avaliação"
              icon={Star}
              comparedIds={comparedIds}
              highlightIds={bestRating}
            >
              {comparedProducts.map((p) => {
                const rating = getAvgRating(p.id) || p.rating || 0;
                const reviewCount = (p.reviewCount || 0) + getReviewCount(p.id);
                return (
                  <div key={p.id} className="flex flex-col gap-1">
                    {renderStars(rating, bestRating.has(p.id))}
                    <span className="text-[10px] text-gray-300 font-semibold">
                      {rating.toFixed(1)}{" "}
                      <span className="text-gray-500">
                        ({reviewCount} avaliações)
                      </span>
                    </span>
                    {bestRating.has(p.id) &&
                      comparedProducts.length > 1 &&
                      rating >= 4.9 && (
                        <span className="text-[9px] text-emerald-300 font-bold uppercase tracking-wider inline-flex items-center gap-0.5">
                          <Award size={9} /> Top Avaliado
                        </span>
                      )}
                  </div>
                );
              })}
            </Row>

            {/* Linha 5: Família Olfativa */}
            <Row label="Família" icon={Sparkles} comparedIds={comparedIds}>
              {comparedProducts.map((p) => (
                <p
                  key={p.id}
                  className="text-[10px] sm:text-[11px] text-gold-300 font-medium"
                >
                  {p.family}
                </p>
              ))}
            </Row>

            {/* Linha 6: Gênero */}
            <Row label="Gênero" icon={Crown} comparedIds={comparedIds}>
              {comparedProducts.map((p) => (
                <span
                  key={p.id}
                  className="text-[10px] sm:text-[11px] text-gray-200 font-medium"
                >
                  {p.gender === "FEMININO"
                    ? "👑 Feminino"
                    : p.gender === "MASCULINO"
                    ? "⚡ Masculino"
                    : p.gender === "ARABE"
                    ? "🌙 Árabe"
                    : "✨ Unissex"}
                </span>
              ))}
            </Row>

            {/* Linha 7: Categoria */}
            <Row label="Coleção" icon={Package} comparedIds={comparedIds}>
              {comparedProducts.map((p) => (
                <span
                  key={p.id}
                  className="text-[10px] sm:text-[11px] text-gold-300 font-bold uppercase tracking-wider"
                >
                  {p.category === "BRAND"
                    ? "Brand 25ml"
                    : p.category === "AFEER"
                    ? "Afeer Mini"
                    : "Decante 5ml"}
                </span>
              ))}
            </Row>

            {/* Linha 8: Intensidade */}
            <Row label="Intensidade" icon={Droplets} comparedIds={comparedIds}>
              {comparedProducts.map((p) => (
                <span
                  key={p.id}
                  className="text-[10px] sm:text-[11px] text-gray-200"
                >
                  {p.intensity}
                </span>
              ))}
            </Row>

            {/* Linha 9: Fixação */}
            <Row
              label="Fixação"
              icon={Clock}
              comparedIds={comparedIds}
              highlightIds={bestFixation}
            >
              {comparedProducts.map((p) => (
                <div key={p.id} className="flex flex-col">
                  <span className="text-[10px] sm:text-[11px] text-gray-200">
                    {p.fixation}
                  </span>
                  {bestFixation.has(p.id) && comparedProducts.length > 1 && (
                    <span className="text-[9px] text-emerald-300 font-bold uppercase tracking-wider mt-0.5">
                      ⏱️ Mais duradouro
                    </span>
                  )}
                </div>
              ))}
            </Row>

            {/* Linha 10: Estação */}
            <Row label="Estação" icon={Calendar} comparedIds={comparedIds}>
              {comparedProducts.map((p) => (
                <span
                  key={p.id}
                  className="text-[10px] sm:text-[11px] text-gray-300 leading-tight"
                >
                  {p.season}
                </span>
              ))}
            </Row>

            {/* Linha 11: Ocasião */}
            <Row label="Ocasião" icon={Sparkles} comparedIds={comparedIds}>
              {comparedProducts.map((p) => (
                <span
                  key={p.id}
                  className="text-[10px] sm:text-[11px] text-gray-300 leading-tight"
                >
                  {p.occasion}
                </span>
              ))}
            </Row>

            {/* Linha 12: Notas de Topo */}
            <Row label="Notas Topo" icon={Cloud} comparedIds={comparedIds}>
              {comparedProducts.map((p) => (
                <p
                  key={p.id}
                  className="text-[10px] sm:text-[11px] text-gray-200 leading-tight"
                >
                  {p.notesTopo}
                </p>
              ))}
            </Row>

            {/* Linha 13: Notas de Coração */}
            <Row label="Notas Coração" icon={HeartIcon} comparedIds={comparedIds}>
              {comparedProducts.map((p) => (
                <p
                  key={p.id}
                  className="text-[10px] sm:text-[11px] text-gray-200 leading-tight"
                >
                  {p.notesCoracao}
                </p>
              ))}
            </Row>

            {/* Linha 14: Notas de Fundo */}
            <Row label="Notas Fundo" icon={TreePine} comparedIds={comparedIds}>
              {comparedProducts.map((p) => (
                <p
                  key={p.id}
                  className="text-[10px] sm:text-[11px] text-gray-200 leading-tight"
                >
                  {p.notesFundo}
                </p>
              ))}
            </Row>

            {/* Linha 15: Tags */}
            <Row label="Tags" icon={Sparkles} comparedIds={comparedIds}>
              {comparedProducts.map((p) => (
                <div key={p.id} className="flex flex-wrap gap-1">
                  {(p.tags || []).slice(0, 5).map((t) => (
                    <span
                      key={t}
                      className="text-[9px] bg-gold-400/10 text-gold-300 border border-gold-400/20 rounded px-1.5 py-0.5"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              ))}
            </Row>

            {/* Linha 16: Descrição */}
            <Row label="Descrição" icon={Package} comparedIds={comparedIds}>
              {comparedProducts.map((p) => (
                <p
                  key={p.id}
                  className="text-[10px] sm:text-[11px] text-gray-300 leading-relaxed line-clamp-3 italic"
                >
                  {p.description}
                </p>
              ))}
            </Row>

            {/* Linha 17: CTA — Adicionar à sacola */}
            <div
              className="grid"
              style={{
                gridTemplateColumns: `120px repeat(${comparedProducts.length}, 1fr)`,
              }}
            >
              <div className="p-3 bg-obsidian-950/40 border-r border-gold-500/10 sticky left-0 flex items-center">
                <span className="text-[10px] uppercase tracking-wider text-gold-300/70 font-bold flex items-center gap-1">
                  <ShoppingBag size={11} /> Comprar
                </span>
              </div>
              {comparedProducts.map((p) => (
                <div
                  key={p.id}
                  className="p-3 border-r border-gold-500/10 last:border-r-0"
                >
                  {p.inStock ? (
                    <button
                      onClick={() => {
                        addToCart(p);
                        toast.success(`${p.name} adicionado à sacola!`);
                      }}
                      className="w-full btn-gold py-2 rounded-lg text-[10px] uppercase tracking-wider font-bold flex items-center justify-center gap-1.5"
                    >
                      <ShoppingBag size={12} />
                      <span>Adicionar</span>
                    </button>
                  ) : (
                    <span className="w-full block text-center text-[10px] text-red-400 py-2 border border-red-500/30 rounded-lg uppercase tracking-wider font-bold">
                      Esgotado
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer com dica */}
        <div className="border-t border-gold-500/15 pt-3 mt-2">
          <p className="text-[10px] text-gray-500 text-center">
            💡 Linhas destacadas em{" "}
            <span className="text-emerald-300">verde</span> indicam o melhor
            valor da categoria. Compare até 3 perfumes para decidir qual levar.
          </p>
        </div>
      </div>
    </div>
  );
}
