"use client";

import { useMemo, useState } from "react";
import { useKitStore, type Kit } from "@/lib/kit-store";
import { useStore } from "@/lib/stores-combined";
import { formatBRL } from "@/lib/pix";
import { toast } from "sonner";
import {
  Package,
  X,
  Gift,
  Share2,
  ShoppingBag,
  ChevronRight,
  Sparkles,
  Crown,
} from "lucide-react";
import SkeletonImage from "./SkeletonImage";

/**
 * PromoKits — mostra kits promocionais ativos na homepage.
 *
 * Cada kit card mostra:
 *  - 2-3 thumbnails dos produtos inclusos
 *  - Nome, preço, badge de economia
 *  - Botão "Ver Kit" → abre modal com todos os detalhes
 *  - Botão "Adicionar Kit à Sacola" (adiciona todos os perfumes do kit)
 *  - Botão "Compartilhar Kit" (abre WhatsApp com mensagem formatada)
 */

export default function PromoKits() {
  const kits = useKitStore((s) => s.kits);
  const products = useStore((s) => s.products);
  const addToCart = useStore((s) => s.addToCart);
  const [selectedKit, setSelectedKit] = useState<Kit | null>(null);

  const activeKits = useMemo(() => kits.filter((k) => k.active), [kits]);

  if (activeKits.length === 0) return null;

  return (
    <section
      id="promoKitsSection"
      className="py-10 px-4 sm:px-8 max-w-7xl mx-auto"
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

      {/* Kits grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {activeKits.map((kit) => (
          <KitCard
            key={kit.id}
            kit={kit}
            products={products}
            onViewDetails={() => setSelectedKit(kit)}
            onAddToCart={() => {
              const kitProducts = kit.productIds
                .map((id) => products.find((p) => p.id === id))
                .filter(Boolean) as NonNullable<
                ReturnType<typeof products.find>
              >[];
              if (kitProducts.length === 0) {
                toast.error("Kit sem produtos disponíveis.");
                return;
              }
              kitProducts.forEach((p) => addToCart(p));
              toast.success(
                `Kit "${kit.name}" adicionado à sacola! (${kitProducts.length} itens)`
              );
            }}
            onShare={() => {
              const msg = `🎁 *Kit: ${kit.name}*\n\n${kit.description}\n\n💰 Preço: ${formatBRL(
                kit.price
              )}\n✨ Inclui: ${kit.productIds.length} perfumes\n\nVeja em: ${
                typeof window !== "undefined" ? window.location.origin : ""
              }/#promoKitsSection`;
              window.open(
                `https://wa.me/?text=${encodeURIComponent(msg)}`,
                "_blank"
              );
              toast.success("Abrindo WhatsApp para compartilhar o kit...");
            }}
          />
        ))}
      </div>

      {/* Kit Detail Modal */}
      {selectedKit && (
        <KitDetailModal
          kit={selectedKit}
          products={products}
          onClose={() => setSelectedKit(null)}
          onAddToCart={() => {
            const kitProducts = selectedKit.productIds
              .map((id) => products.find((p) => p.id === id))
              .filter(Boolean) as NonNullable<ReturnType<typeof products.find>>;
            kitProducts.forEach((p) => addToCart(p));
            toast.success(
              `Kit "${selectedKit.name}" adicionado à sacola! (${kitProducts.length} itens)`
            );
            setSelectedKit(null);
          }}
          onShare={() => {
            const msg = `🎁 *Kit: ${selectedKit.name}*\n\n${selectedKit.description}\n\n💰 Preço: ${formatBRL(
              selectedKit.price
            )}\n✨ Inclui: ${selectedKit.productIds.length} perfumes`;
            window.open(
              `https://wa.me/?text=${encodeURIComponent(msg)}`,
              "_blank"
            );
          }}
        />
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KitCard
// ─────────────────────────────────────────────────────────────────────────────

interface KitCardProps {
  kit: Kit;
  products: ReturnType<typeof useStore.getState>["products"];
  onViewDetails: () => void;
  onAddToCart: () => void;
  onShare: () => void;
}

function KitCard({ kit, products, onViewDetails, onAddToCart, onShare }: KitCardProps) {
  const kitProducts = kit.productIds
    .map((id) => products.find((p) => p.id === id))
    .filter(Boolean) as NonNullable<ReturnType<typeof products.find>>[];

  // Calculate savings vs buying individually
  const individualTotal = kitProducts.reduce((sum, p) => sum + p.price, 0);
  const savings = individualTotal - kit.price;

  return (
    <div className="glass-panel rounded-2xl border border-gold-500/20 overflow-hidden hover:border-gold-400/50 transition-all group flex flex-col">
      {/* Thumbnails (2-3 products) */}
      <div className="relative h-32 bg-obsidian-950 overflow-hidden flex">
        {kitProducts.slice(0, 3).map((p, i) => (
          <div
            key={p.id}
            className="relative flex-grow h-full overflow-hidden border-r border-gold-500/10 last:border-r-0"
            style={{ maxWidth: `${100 / Math.min(kitProducts.length, 3)}%` }}
          >
            <SkeletonImage
              src={p.image}
              alt={p.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            {/* Label badge for each */}
            <span className="absolute top-1 left-1 text-[8px] uppercase font-bold px-1.5 py-0.5 rounded-full bg-obsidian-950/80 text-gold-300 border border-gold-500/30">
              {p.code}
            </span>
            {i === 0 && (
              <span className="absolute bottom-1 right-1 text-[8px] uppercase font-bold px-1.5 py-0.5 rounded-full bg-gold-500 text-obsidian-950">
                Kit
              </span>
            )}
          </div>
        ))}
        {kitProducts.length === 0 && (
          <div className="w-full h-full flex items-center justify-center text-gold-500/40">
            <Package size={32} />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-4 flex-grow flex flex-col">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-serif-luxury text-base font-bold text-white leading-tight">
            {kit.name}
          </h3>
          {kit.badge && (
            <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 shrink-0">
              {kit.badge}
            </span>
          )}
        </div>
        <p className="text-[11px] text-gray-400 leading-relaxed line-clamp-2 mb-3 flex-grow">
          {kit.description}
        </p>

        {/* Price + savings */}
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <p className="text-[9px] text-gray-500 uppercase tracking-wider">
              Preço do kit
            </p>
            <p className="font-serif-luxury text-xl font-bold text-gold-400">
              {formatBRL(kit.price)}
            </p>
          </div>
          {savings > 0 && (
            <div className="text-right">
              <p className="text-[9px] text-gray-500 uppercase tracking-wider">
                Você economiza
              </p>
              <p className="text-sm font-bold text-emerald-400">
                {formatBRL(savings)}
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-1.5">
          <button
            onClick={onAddToCart}
            className="w-full btn-gold py-2.5 rounded-lg text-[10px] uppercase tracking-wider font-bold flex items-center justify-center gap-1.5"
          >
            <ShoppingBag size={12} />
            Adicionar Kit à Sacola
          </button>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={onViewDetails}
              className="bg-obsidian-900/60 hover:bg-obsidian-900 border border-gold-500/30 text-gold-300 font-bold py-2 rounded-lg text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 transition-all"
            >
              <Package size={11} /> Ver Kit
            </button>
            <button
              onClick={onShare}
              className="bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/40 text-emerald-300 font-bold py-2 rounded-lg text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 transition-all"
            >
              <Share2 size={11} /> Compartilhar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KitDetailModal
// ─────────────────────────────────────────────────────────────────────────────

interface KitDetailModalProps {
  kit: Kit;
  products: ReturnType<typeof useStore.getState>["products"];
  onClose: () => void;
  onAddToCart: () => void;
  onShare: () => void;
}

function KitDetailModal({
  kit,
  products,
  onClose,
  onAddToCart,
  onShare,
}: KitDetailModalProps) {
  const kitProducts = kit.productIds
    .map((id) => products.find((p) => p.id === id))
    .filter(Boolean) as NonNullable<ReturnType<typeof products.find>>[];

  const individualTotal = kitProducts.reduce((sum, p) => sum + p.price, 0);
  const savings = individualTotal - kit.price;

  return (
    <div
      className="fixed inset-0 z-[72] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="glass-panel-gold max-w-2xl w-full rounded-2xl relative border border-gold-500/40 shadow-2xl max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 text-gray-400 hover:text-white bg-obsidian-950/60 rounded-full p-1.5 transition-colors"
          aria-label="Fechar"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="p-5 border-b border-gold-500/20">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} className="text-gold-400" />
            <span className="text-[10px] uppercase tracking-widest font-bold text-gold-300">
              Kit Promocional
            </span>
            {kit.badge && (
              <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300">
                {kit.badge}
              </span>
            )}
          </div>
          <h3 className="font-serif-luxury text-2xl font-bold text-white">
            {kit.name}
          </h3>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">
            {kit.description}
          </p>
        </div>

        {/* Products list */}
        <div className="p-5 space-y-3">
          <h4 className="text-[10px] uppercase tracking-widest font-bold text-gold-300 flex items-center gap-1.5">
            <Crown size={12} className="text-gold-400" />
            Perfumes inclusos ({kitProducts.length})
          </h4>
          {kitProducts.length === 0 ? (
            <p className="text-xs text-gray-500 italic py-4 text-center">
              Nenhum produto disponível neste kit.
            </p>
          ) : (
            kitProducts.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 bg-obsidian-900/60 rounded-xl p-3 border border-gold-500/15"
              >
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-obsidian-950 shrink-0">
                  <SkeletonImage
                    src={p.image}
                    alt={p.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-grow min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] uppercase font-bold text-gold-300 bg-gold-500/10 border border-gold-500/30 rounded px-1.5 py-0.5">
                      {p.code}
                    </span>
                    <h5 className="text-xs font-bold text-white truncate">
                      {p.name}
                    </h5>
                  </div>
                  <p className="text-[10px] text-gray-400 truncate mt-0.5">
                    Inspirado em: {p.inspiration}
                  </p>
                  <p className="text-[10px] text-gray-500 italic line-clamp-2 mt-1">
                    {p.description}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[9px] text-gray-500 uppercase">individual</p>
                  <p className="text-sm font-bold text-gray-300">
                    {formatBRL(p.price)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer with totals + actions */}
        <div className="sticky bottom-0 bg-obsidian-950/95 backdrop-blur-md border-t border-gold-500/20 p-4 space-y-2 safe-bottom">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">
              Total individual:{" "}
              <span className="line-through text-gray-500">
                {formatBRL(individualTotal)}
              </span>
            </span>
            {savings > 0 && (
              <span className="text-emerald-400 font-bold">
                Economize {formatBRL(savings)}
              </span>
            )}
          </div>
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">
              Preço do kit
            </span>
            <span className="font-serif-luxury text-2xl font-bold text-gold-400">
              {formatBRL(kit.price)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onAddToCart}
              className="btn-gold py-3 rounded-xl text-xs uppercase tracking-wider font-bold flex items-center justify-center gap-1.5"
            >
              <ShoppingBag size={14} /> Adicionar à Sacola
            </button>
            <button
              onClick={onShare}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all"
            >
              <Share2 size={14} /> Compartilhar
            </button>
          </div>
          <button
            onClick={onClose}
            className="w-full text-[10px] uppercase tracking-wider text-gray-500 hover:text-gold-300 transition-colors py-1 flex items-center justify-center gap-1"
          >
            <ChevronRight size={11} className="rotate-180" /> Voltar para kits
          </button>
        </div>
      </div>
    </div>
  );
}
