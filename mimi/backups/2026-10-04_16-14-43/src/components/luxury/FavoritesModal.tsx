"use client";

import { useState } from "react";
import { useStore, useUI } from "@/lib/stores-combined";
import { formatBRL } from "@/lib/pix";
import { playAtomizerSpraySound } from "@/lib/audio";
import { toast } from "sonner";
import SkeletonImage from "./SkeletonImage";
import {
  X,
  Heart,
  Trash2,
  SprayCan,
  MessageCircleWarning,
  Share2,
  Copy,
  Link as LinkIcon,
  Check,
  MessageCircle,
  Mail,
} from "lucide-react";

export default function FavoritesModal() {
  const open = useUI((s) => s.favoritesOpen);
  const setOpen = useUI((s) => s.setFavoritesOpen);
  const favorites = useStore((s) => s.favorites);
  const products = useStore((s) => s.products);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const addToCart = useStore((s) => s.addToCart);
  const openNotify = useUI((s) => s.openNotify);

  const [showShareBox, setShowShareBox] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const favProducts = products.filter((p) => favorites.includes(p.id));

  // Gera URL compartilhável com os IDs dos favoritos
  // Ex: https://mimi-mimos.pages.dev/?wishlist=bc-001,bc-012,dec-05
  const shareUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/?wishlist=${favorites.join(",")}`;

  const copyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link da wishlist copiado!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Selecione manualmente.");
    }
  };

  const shareWhatsApp = () => {
    const msg = `💖 Minha Wishlist Mimi Mimos — ${favProducts.length} perfume(s) que amei!${favProducts
      .slice(0, 5)
      .map((p) => `\n• ${p.name} (${p.code}) — ${formatBRL(p.price)}`)
      .join("")}\n\nVeja completa em: ${shareUrl}`;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(msg)}`,
      "_blank"
    );
    toast.success("Abrindo WhatsApp para compartilhar...");
  };

  const shareEmail = () => {
    const subject = `Minha Wishlist Mimi Mimos 💖`;
    const body = `Olá! Compartilho minha lista de perfumes favoritos da Mimi Mimos:\n\n${favProducts
      .map((p) => `• ${p.name} (${p.code}) — inspirado em ${p.inspiration} — ${formatBRL(p.price)}`)
      .join("\n")}\n\nVeja todos em: ${shareUrl}\n\n💖 Mimi Mimos — Haute Parfumerie`;
    window.location.href = `mailto:?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="glass-panel-gold max-w-2xl w-full rounded-2xl p-6 relative border border-gold-500/40 shadow-2xl max-h-[85vh] overflow-y-auto animate-in zoom-in-95 duration-300">
        <button
          onClick={() => setOpen(false)}
          className="absolute top-4 right-4 text-gray-400 hover:text-white"
          aria-label="Fechar"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-3 mb-5 border-b border-gold-500/20 pb-4">
          <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400">
            <Heart size={20} className="fill-red-500" />
          </div>
          <div className="flex-grow">
            <h3 className="font-serif-luxury text-xl font-bold text-white">
              Seus Favoritos
            </h3>
            <p className="text-[11px] text-gold-300">
              {favProducts.length}{" "}
              {favProducts.length === 1 ? "perfume salvo" : "perfumes salvos"} ♥
            </p>
          </div>
          {favProducts.length > 0 && (
            <button
              onClick={() => setShowShareBox(!showShareBox)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] uppercase tracking-wider font-bold transition-all border ${
                showShareBox
                  ? "bg-gold-500 text-obsidian-950 border-gold-400"
                  : "bg-gold-500/10 text-gold-300 border-gold-500/30 hover:bg-gold-500/20"
              }`}
              aria-label="Compartilhar wishlist"
            >
              <Share2 size={12} />
              <span className="hidden sm:inline">Compartilhar</span>
            </button>
          )}
        </div>

        {/* Share box — URL compartilhável */}
        {showShareBox && favProducts.length > 0 && (
          <div className="bg-gold-500/5 border border-gold-500/25 rounded-xl p-4 mb-4 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-start gap-2 mb-3">
              <LinkIcon size={14} className="text-gold-400 mt-0.5 shrink-0" />
              <div className="flex-grow">
                <p className="text-[11px] font-bold text-gold-200 mb-0.5">
                  Link da sua Wishlist
                </p>
                <p className="text-[10px] text-gray-400 leading-relaxed">
                  Compartilhe com amigos e familiares — eles verão exatamente
                  quais perfumes você ama. Quem abrir pode comprar direto!
                </p>
              </div>
            </div>
            {/* URL com botão copiar */}
            <div className="flex items-center gap-2 mb-3">
              <input
                type="text"
                readOnly
                value={shareUrl}
                onFocus={(e) => e.target.select()}
                className="flex-grow bg-obsidian-950 border border-gold-500/30 rounded-lg py-2 px-3 text-[10px] text-gray-300 truncate focus:outline-none focus:border-gold-400"
              />
              <button
                onClick={copyShareUrl}
                className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap flex items-center gap-1.5 transition-all ${
                  copied
                    ? "bg-emerald-500 text-white"
                    : "btn-gold"
                }`}
              >
                {copied ? (
                  <>
                    <Check size={11} /> Copiado!
                  </>
                ) : (
                  <>
                    <Copy size={11} /> Copiar
                  </>
                )}
              </button>
            </div>
            {/* Botões de compartilhamento rápido */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={shareWhatsApp}
                className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white py-2 px-3 rounded-lg text-[10px] uppercase font-bold tracking-wider transition-all"
              >
                <MessageCircle size={13} />
                WhatsApp
              </button>
              <button
                onClick={shareEmail}
                className="flex items-center justify-center gap-1.5 bg-obsidian-900 hover:bg-obsidian-800 border border-gold-500/30 text-gold-300 py-2 px-3 rounded-lg text-[10px] uppercase font-bold tracking-wider transition-all"
              >
                <Mail size={13} />
                Email
              </button>
            </div>
            <p className="text-[9px] text-gray-500 text-center mt-2">
              💡 O link expira quando você limpa os favoritos neste dispositivo.
            </p>
          </div>
        )}

        {favProducts.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Heart className="mx-auto mb-3 text-gold-500/20" size={42} />
            <p className="text-xs">Você ainda não favoritou nenhum perfume.</p>
            <p className="text-[11px] text-gray-600 mt-1">
              Toque no coração nos cards para salvar aqui.
            </p>
            <button
              onClick={() => setOpen(false)}
              className="mt-4 btn-gold px-6 py-2 rounded-full text-xs"
            >
              Explorar Catálogo
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {favProducts.map((p) => (
              <div
                key={p.id}
                className="glass-panel p-3 rounded-xl flex items-center gap-3 border border-gold-500/10 hover:border-gold-500/30 transition-colors group"
              >
                <SkeletonImage
                  src={p.image}
                  alt={p.name}
                  className="w-14 h-14 rounded-lg bg-obsidian-950 shrink-0 border border-gold-500/10 p-1"
                  fit="contain"
                />
                <div className="flex-grow min-w-0">
                  <h5 className="text-xs font-bold text-white truncate">
                    {p.name}
                  </h5>
                  <p className="text-[10px] text-gold-300 truncate">
                    {p.inspiration}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {p.code} • {p.intensity}
                  </p>
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                  <span className="text-xs font-serif-luxury font-bold text-gold-400">
                    {formatBRL(p.price)}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {p.inStock ? (
                      <button
                        onClick={() => {
                          playAtomizerSpraySound();
                          addToCart(p);
                          toast.success(`${p.name} adicionado à sacola!`);
                        }}
                        className="btn-gold px-2.5 py-1 rounded-lg text-[10px] flex items-center gap-1"
                        aria-label="Adicionar à sacola"
                      >
                        <SprayCan size={11} />
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setOpen(false);
                          openNotify(p);
                        }}
                        className="bg-emerald-700/30 border border-emerald-500/40 text-emerald-300 px-2.5 py-1 rounded-lg text-[10px]"
                        aria-label="Avise-me"
                      >
                        <MessageCircleWarning size={11} />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        toggleFavorite(p.id);
                        toast.success("Removido dos favoritos.");
                      }}
                      className="text-red-400 hover:text-red-300 p-1 opacity-60 group-hover:opacity-100 transition-opacity"
                      aria-label="Remover dos favoritos"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {/* CTA: adicionar todos à sacola */}
            <div className="pt-3 border-t border-gold-500/15 mt-4">
              <button
                onClick={() => {
                  favProducts.forEach((p) => {
                    if (p.inStock) addToCart(p);
                  });
                  playAtomizerSpraySound();
                  toast.success(
                    `${favProducts.filter((p) => p.inStock).length} perfumes adicionados à sacola!`
                  );
                  setOpen(false);
                }}
                className="w-full btn-gold py-2.5 rounded-xl text-xs uppercase tracking-wider font-bold flex items-center justify-center gap-2"
              >
                <SprayCan size={13} />
                Adicionar Todos à Sacola ({favProducts.filter((p) => p.inStock).length})
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
