"use client";

import { useState } from "react";
import { Users, X, Copy, Check, Gift, Share2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Sistema de Indicação: indique amigas e ganhe desconto.
 * Gera um link único com código de indicação.
 * Quando a amiga compra usando o código, ambas ganham desconto.
 */
export default function ReferralSystem() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Gera código de indicação único baseado no dispositivo (simula usuário logado)
  const [referralCode] = useState(() => {
    if (typeof window === "undefined") return "MIMI";
    const stored = localStorage.getItem("mimi-referral-code");
    if (stored) return stored;
    const code = "MIMI" + Math.random().toString(36).substring(2, 8).toUpperCase();
    localStorage.setItem("mimi-referral-code", code);
    return code;
  });

  const referralLink = `https://mimimimos.com?ref=${referralCode}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast.success("Link copiado! Compartilhe com suas amigas 💕");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Selecione manualmente.");
    }
  };

  const shareWhatsApp = () => {
    const msg = `Olá! Descobri a Mimi Mimos — perfumaria árabes e importados incríveis! Use meu código ${referralCode} e ganhe desconto na primeira compra 💎✨ ${referralLink}`;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(msg)}`,
      "_blank"
    );
  };

  return (
    <>
      {/* Botão para abrir */}
      <section className="py-4 px-4 max-w-7xl mx-auto">
        <button
          onClick={() => setOpen(true)}
          className="w-full glass-panel rounded-2xl p-5 border border-gold-500/20 hover:border-gold-400/50 transition-all group flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform shrink-0">
              <Users size={22} />
            </div>
            <div className="text-left">
              <h3 className="font-serif-luxury text-lg font-bold text-white">
                Indique Amigas, Ganhe Desconto
              </h3>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Cada amiga que compra = R$ 10 OFF para você e para ela
              </p>
            </div>
          </div>
          <Gift className="text-gold-400 group-hover:scale-110 transition-transform shrink-0" />
        </button>
      </section>

      {/* Modal de Indicação */}
      {open && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="glass-panel-gold max-w-md w-full rounded-2xl p-6 relative border border-gold-500/40 shadow-2xl">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
              aria-label="Fechar"
            >
              <X size={20} />
            </button>

            <div className="text-center mb-5">
              <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-3 text-emerald-400">
                <Users size={28} />
              </div>
              <h3 className="font-serif-luxury text-2xl font-bold text-white">
                Programa de Indicação
              </h3>
              <p className="text-xs text-gray-300 mt-1 leading-relaxed">
                Indique suas amigas para a Mimi Mimos. Quando ela fizer a
                primeira compra usando seu código,{" "}
                <strong className="text-gold-300">
                  ambas ganham R$ 10 de desconto
                </strong>
                !
              </p>
            </div>

            {/* Como funciona */}
            <div className="space-y-2 mb-5">
              {[
                { step: "1", text: "Compartilhe seu link com amigas" },
                { step: "2", text: "Ela compra usando seu código" },
                { step: "3", text: "Ambas ganham R$ 10 OFF na próxima compra" },
              ].map((s) => (
                <div
                  key={s.step}
                  className="flex items-center gap-3 p-2 rounded-lg bg-obsidian-800/40 border border-gold-500/10"
                >
                  <div className="w-7 h-7 rounded-full bg-gold-500/20 border border-gold-500/40 flex items-center justify-center text-gold-400 font-bold text-xs shrink-0">
                    {s.step}
                  </div>
                  <span className="text-xs text-gray-200">{s.text}</span>
                  <Check size={14} className="text-emerald-400 ml-auto shrink-0" />
                </div>
              ))}
            </div>

            {/* Código de indicação */}
            <div className="mb-4">
              <label className="block text-[10px] uppercase tracking-wider text-gold-300/70 font-bold mb-1.5">
                Seu Código de Indicação
              </label>
              <div className="flex items-center gap-2 p-3 rounded-xl bg-obsidian-900 border border-gold-500/30">
                <span className="font-serif-luxury text-lg font-bold text-gold-400 flex-grow">
                  {referralCode}
                </span>
                <button
                  onClick={copyLink}
                  className="btn-gold px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 whitespace-nowrap"
                >
                  {copied ? (
                    <>
                      <Check size={11} /> Copiado!
                    </>
                  ) : (
                    <>
                      <Copy size={11} /> Copiar Link
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Botão compartilhar no WhatsApp */}
            <button
              onClick={shareWhatsApp}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
            >
              <Share2 size={15} />
              Compartilhar no WhatsApp
            </button>

            <p className="text-[9px] text-gray-500 text-center mt-3">
              Sem limite de indicações! Indique quantas amigas quiser e acumule
              descontos.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
