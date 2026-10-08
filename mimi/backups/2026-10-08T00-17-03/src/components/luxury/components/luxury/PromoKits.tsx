"use client";

import { useEffect, useState } from "react";
import { useStore, useUI } from "@/lib/stores-combined";
import { useKitStore, type Kit } from "@/lib/kit-store";
import { formatBRL } from "@/lib/pix";
import { toast } from "sonner";
import { playAtomizerSpraySound } from "@/lib/audio";
import SkeletonImage from "./SkeletonImage";
import {
  Gift,
  X,
  ShoppingBag,
  Share2,
  Star,
  Sparkles,
  Droplets,
  Heart as HeartIcon,
  TreePine,
  Clock,
  Tag,
  Eye,
} from "lucide-react";
import type { Perfume } from "@/lib/perfumes";

/**
 * PromoKits — exibe os kits promocionais ativos como cards especiais
 * entre o PinnedProductBanner e o FeaturedCarousel na home.
 *
 * - Cada kit card: nome, 2-3 thumbnails, preço com strikethrough da soma
 *   individual, badge de economia e botão "Ver Kit".
 * - Botão "Ver Kit" abre modal com todos os perfumes do kit, com descrições,
 *   notas e imagens completas.
 * - Modal oferece: "Adicionar Kit à Sacola" (adiciona todos os perfumes) e
 *   "Compartilhar Kit" (WhatsApp).
 */
export default function PromoKits() {
  const products = useStore((s) => s.products);
  const addToCart = useStore((s) => s.addToCart);
  const setCartOpen = useUI((s) => s.setCartOpen);
  const kits = useKitStore((s) => s.kits);
  const syncKitsFromD1 = useKitStore((s) => s.syncKitsFromD1);

  const [selectedKit, setSelectedKit] = useState<Kit | null>(null);

  // D1 SYNC — fetch kits on mount
  useEffect(() => {
    void syncKitsFromD1().catch((err) =>
      console.warn("[D1 sync] kits mount failed:", err)
    );
  }, [syncKitsFromD1]);

  // Fecha o modal com a tecla ESC
  useEffect(() => {
    if (!selectedKit) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedKit(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedKit]);

  const activeKits = kits.filter((k) => k.active);

  if (activeKits.length === 0) return null;

  const resolveProducts = (kit: Kit): Perfume[] =>
    kit.productIds
      .map((id) => products.find((p) => p.id === id))
      .filter((p): p is Perfume => Boolean(p));

  const handleAddKitToCart = (kit: Kit) => {
    const kitProducts = resolveProducts(kit);
    if (kitProducts.length === 0) {
      toast.error("Produtos do kit não encontrados.");
      return;
    }
    try {
      playAtomizerSpraySound();
    } catch {
      /* audio opcional */
    }
    kitProducts.forEach((p) => addToCart(p));
    toast.success(
      `Kit "${kit.name}" adicionado à sacola! (${kitProducts.length} perfumes)`
    );
    setSelectedKit(null);
    setCartOpen(true);
  };

  const handleShareWhatsApp = (kit: Kit) => {
    const kitProducts = resolveProducts(kit);
    const individualSum = kitProducts.reduce((acc, p) => acc + p.price, 0);
    const savings = Math.max(0, individualSum - kit.price);
    const lines = [
      `🎁 *${kit.name}* — Mimi Mimos`,
      kit.description ? `\n${kit.description}` : "",
      "",
      ...kitProducts.map(
        (p, i) => `${i + 1}. *${p.name}* — ${formatBRL(p.price)}`
      ),
      "",
      `💰 Preço do kit: ${formatBRL(kit.price)}`,
      savings > 0 ? `🔥 Você economiza: ${formatBRL(savings)}` : "",
      "",
      "Compre agora: https://mimimimos.com.br",
    ].filter(Boolean);
    const text = encodeURIComponent(lines.join("\n"));
    const url = `https://wa.me/?text=${text}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <section
      id="promo-kits"
      className="relative py-12 sm:py-16 px-4 sm:px-6"
      aria-label="Kits Promocionais"
    >
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold-500/15 border border-gold-500/30 text-gold-300 text-[10px] uppercase tracking-[0.2em] mb-3">
            <Gift size={11} /> Kits Exclusivos
          </div>
          <h2 className="font-serif-luxury text-3xl sm:text-4xl font-bold text-white">
            Combine &{" "}
            <span className="bg-gradient-to-r from-gold-300 to-gold-500 bg-clip-text text-transparent">
              Economize
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-gray-400 mt-2 max-w-xl mx-auto">
            Bundles curados de 2-3 perfumes com preço especial. Presenteie ou
            descubra novas combinações.
          </p>
        </div>

        {/* Kit cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {activeKits.map((kit) => {
            const kitProducts = resolveProducts(kit);
            const individualSum = kitProducts.reduce(
              (acc, p) => acc + p.price,
              0
            );
            const savings = Math.max(0, individualSum - kit.price);
            const discountPct =
              individualSum > 0
                ? Math.round((savings / individualSum) * 100)
                : 0;
            return (
              <article
                key={kit.id}
                className="glass-panel rounded-2xl overflow-hidden border border-gold-500/30 hover:border-gold-400/60 transition-all group flex flex-col"
              >
                {/* Thumbnails lado a lado */}
                <div className="relative bg-obsidian-950 p-4 flex items-center justify-center gap-2 min-h-[160px]">
                  {kitProducts.length === 0 ? (
                    <div className="w-16 h-16 rounded-xl bg-obsidian-900 flex items-center justify-center text-gray-600">
                      <Gift size={28} />
                    </div>
                  ) : (
                    kitProducts.map((p, i) => (
                      <div
                        key={p.id}
                        className="relative shrink-0"
                        style={{
                          width: `${100 / Math.max(kitProducts.length, 2)}%`,
                          maxWidth: "120px",
                        }}
                      >
                        <SkeletonImage
                          src={p.image}
                          alt={p.name}
                          className="w-full aspect-square object-cover rounded-xl border border-gold-500/20 group-hover:border-gold-400/50 transition-all"
                        />
                        {kitProducts.length > 1 && (
                          <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-gold-500 text-obsidian-950 text-[10px] font-bold flex items-center justify-center border-2 border-obsidian-950">
                            {i + 1}
                          </span>
                        )}
                      </div>
                    ))
                  )}

                  {/* Badge de economia */}
                  {kit.badge && (
                    <span className="absolute top-2 right-2 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full shadow-lg flex items-center gap-1">
                      <Tag size={9} /> {kit.badge}
                    </span>
                  )}
                  {discountPct > 0 && (
                    <span className="absolute bottom-2 left-2 bg-red-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      -{discountPct}%
                    </span>
                  )}
                </div>

                {/* Conteúdo */}
                <div className="p-4 flex-grow flex flex-col">
                  <h3 className="font-serif-luxury text-lg font-bold text-white leading-tight">
                    {kit.name}
                  </h3>
                  {kit.description && (
                    <p className="text-[11px] text-gray-400 mt-1 line-clamp-2">
                      {kit.description}
                    </p>
                  )}

                  {/* Lista de produtos */}
                  <ul className="mt-2 space-y-1">
                    {kitProducts.map((p) => (
                      <li
                        key={p.id}
                        className="text-[10px] text-gray-300 flex items-center gap-1.5"
                      >
                        <Sparkles size={9} className="text-gold-400 shrink-0" />
                        <span className="truncate">{p.name}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Preços */}
                  <div className="mt-3 mb-3">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-2xl font-serif-luxury font-bold text-gold-400">
                        {formatBRL(kit.price)}
                      </span>
                      {individualSum > kit.price && (
                        <span className="text-xs text-gray-500 line-through">
                          {formatBRL(individualSum)}
                        </span>
                      )}
                    </div>
                    {savings > 0 && (
                      <p className="text-[10px] text-emerald-400 mt-0.5 font-bold uppercase tracking-wider">
                        Você economiza {formatBRL(savings)}
                      </p>
                    )}
                  </div>

                  {/* CTA */}
                  <button
                    onClick={() => setSelectedKit(kit)}
                    className="btn-gold w-full py-2.5 rounded-xl text-xs uppercase font-bold flex items-center justify-center gap-2 mt-auto"
                  >
                    <Eye size={13} /> Ver Kit
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {/* KIT DETAIL MODAL */}
      {selectedKit && (
        <KitDetailModal
          kit={selectedKit}
          products={resolveProducts(selectedKit)}
          onClose={() => setSelectedKit(null)}
          onAddToCart={() => handleAddKitToCart(selectedKit)}
          onShare={() => handleShareWhatsApp(selectedKit)}
        />
      )}
    </section>
  );
}

// ============================================================================
// KIT DETAIL MODAL — mostra todos os perfumes do kit com desc/notas/imagens
// ============================================================================

function KitDetailModal({
  kit,
  products,
  onClose,
  onAddToCart,
  onShare,
}: {
  kit: Kit;
  products: Perfume[];
  onClose: () => void;
  onAddToCart: () => void;
  onShare: () => void;
}) {
  const individualSum = products.reduce((acc, p) => acc + p.price, 0);
  const savings = Math.max(0, individualSum - kit.price);

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Detalhes do Kit ${kit.name}`}
    >
      <div
        className="glass-panel max-w-3xl w-full rounded-2xl relative border border-gold-500/40 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 text-gray-400 hover:text-white bg-obsidian-950/60 rounded-full p-1.5"
          aria-label="Fechar"
        >
          <X size={18} />
        </button>

        {/* Header do Kit */}
        <div className="bg-gradient-to-br from-obsidian-900 to-obsidian-950 p-5 sm:p-6 border-b border-gold-500/30">
          <div className="flex items-center gap-2 mb-2">
            <Gift className="text-gold-400" size={16} />
            <span className="text-[10px] uppercase tracking-[0.2em] text-gold-300 font-bold">
              Kit Promocional
            </span>
            {kit.badge && (
              <span className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full">
                {kit.badge}
              </span>
            )}
          </div>
          <h2 className="font-serif-luxury text-2xl sm:text-3xl font-bold text-white">
            {kit.name}
          </h2>
          {kit.description && (
            <p className="text-xs sm:text-sm text-gray-400 mt-1.5">
              {kit.description}
            </p>
          )}

          {/* Preço + economia */}
          <div className="mt-4 flex items-baseline gap-3 flex-wrap">
            <span className="text-3xl font-serif-luxury font-bold text-gold-400">
              {formatBRL(kit.price)}
            </span>
            {individualSum > kit.price && (
              <span className="text-sm text-gray-500 line-through">
                {formatBRL(individualSum)}
              </span>
            )}
            {savings > 0 && (
              <span className="text-xs text-emerald-400 font-bold uppercase tracking-wider">
                Economize {formatBRL(savings)}
              </span>
            )}
          </div>

          {/* CTAs */}
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <button
              onClick={onAddToCart}
              className="btn-gold flex-1 py-3 rounded-xl text-xs uppercase font-bold flex items-center justify-center gap-2"
            >
              <ShoppingBag size={14} /> Adicionar Kit à Sacola
            </button>
            <button
              onClick={onShare}
              className="px-4 py-3 rounded-xl text-xs uppercase font-bold border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 transition-all flex items-center justify-center gap-2"
            >
              <Share2 size={14} /> Compartilhar Kit
            </button>
          </div>
        </div>

        {/* Lista de perfumes com detalhes */}
        <div className="p-5 sm:p-6 space-y-4">
          <h3 className="font-serif-luxury text-lg font-bold text-white flex items-center gap-2">
            <Sparkles size={14} className="text-gold-400" />
            {products.length} Perfume{products.length !== 1 ? "s" : ""} no Kit
          </h3>

          {products.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-6">
              Os produtos deste kit não estão mais disponíveis.
            </p>
          ) : (
            products.map((p, idx) => (
              <article
                key={p.id}
                className="bg-obsidian-900/60 border border-gold-500/15 rounded-xl p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-[100px_1fr] gap-3 sm:gap-4"
              >
                {/* Image + index */}
                <div className="relative">
                  <SkeletonImage
                    src={p.image}
                    alt={p.name}
                    className="w-full aspect-square object-cover rounded-lg border border-gold-500/20"
                  />
                  <span className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-gold-500 text-obsidian-950 text-xs font-bold flex items-center justify-center border-2 border-obsidian-950">
                    {idx + 1}
                  </span>
                </div>

                {/* Detalhes do perfume */}
                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <h4 className="font-serif-luxury text-base font-bold text-white truncate">
                        {p.name}
                      </h4>
                      <p className="text-[10px] text-gold-300 uppercase tracking-wider">
                        {p.code} • {p.category}
                      </p>
                    </div>
                    <span className="text-xs font-bold text-gold-400 shrink-0">
                      {formatBRL(p.price)}
                    </span>
                  </div>

                  {/* Inspiration + family */}
                  {p.inspiration && (
                    <p className="text-[10px] text-gray-500 mt-1 italic">
                      Inspiração: {p.inspiration}
                    </p>
                  )}

                  {/* Rating */}
                  {p.rating > 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          size={10}
                          className={
                            i < Math.round(p.rating)
                              ? "text-gold-400 fill-gold-400"
                              : "text-gray-700"
                          }
                        />
                      ))}
                      <span className="text-[9px] text-gray-500 ml-1">
                        ({p.reviewCount || 0} avaliações)
                      </span>
                    </div>
                  )}

                  {/* Descrição completa */}
                  {p.description && (
                    <p className="text-[11px] text-gray-300 mt-2 leading-relaxed">
                      {p.description}
                    </p>
                  )}

                  {/* Notas olfativas */}
                  <div className="mt-2 space-y-1">
                    {p.notesTopo && (
                      <div className="flex items-start gap-1.5 text-[10px]">
                        <Droplets
                          size={10}
                          className="text-emerald-400 mt-0.5 shrink-0"
                        />
                        <span className="text-gray-500">Topo:</span>
                        <span className="text-gray-300">{p.notesTopo}</span>
                      </div>
                    )}
                    {p.notesCoracao && (
                      <div className="flex items-start gap-1.5 text-[10px]">
                        <HeartIcon
                          size={10}
                          className="text-rose-400 mt-0.5 shrink-0"
                        />
                        <span className="text-gray-500">Coração:</span>
                        <span className="text-gray-300">{p.notesCoracao}</span>
                      </div>
                    )}
                    {p.notesFundo && (
                      <div className="flex items-start gap-1.5 text-[10px]">
                        <TreePine
                          size={10}
                          className="text-amber-500 mt-0.5 shrink-0"
                        />
                        <span className="text-gray-500">Fundo:</span>
                        <span className="text-gray-300">{p.notesFundo}</span>
                      </div>
                    )}
                  </div>

                  {/* Family + intensity + fixation */}
                  <div className="mt-2 flex flex-wrap gap-2 text-[9px]">
                    {p.family && (
                      <span className="bg-gold-500/10 border border-gold-500/20 text-gold-300 rounded-full px-2 py-0.5 uppercase tracking-wider">
                        {p.family}
                      </span>
                    )}
                    {p.intensity && (
                      <span className="bg-obsidian-950/60 border border-gold-500/15 text-gray-400 rounded-full px-2 py-0.5 uppercase tracking-wider flex items-center gap-1">
                        <Sparkles size={8} /> {p.intensity}
                      </span>
                    )}
                    {p.fixation && (
                      <span className="bg-obsidian-950/60 border border-gold-500/15 text-gray-400 rounded-full px-2 py-0.5 uppercase tracking-wider flex items-center gap-1">
                        <Clock size={8} /> {p.fixation}
                      </span>
                    )}
                  </div>

                  {/* Tags */}
                  {p.tags && p.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {p.tags.map((t) => (
                        <span
                          key={t}
                          className="text-[9px] text-gray-500 border border-gray-500/20 rounded px-1.5 py-0.5"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            ))
          )}
        </div>

        {/* Footer com CTAs novamente (conveniência) */}
        <div className="sticky bottom-0 bg-obsidian-950/90 backdrop-blur border-t border-gold-500/20 p-4 flex gap-2">
          <button
            onClick={onAddToCart}
            className="btn-gold flex-1 py-3 rounded-xl text-xs uppercase font-bold flex items-center justify-center gap-2"
          >
            <ShoppingBag size={14} /> Adicionar Kit à Sacola
          </button>
          <button
            onClick={onShare}
            className="px-4 py-3 rounded-xl text-xs uppercase font-bold border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 transition-all flex items-center justify-center gap-2"
          >
            <Share2 size={14} /> WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
