"use client";

import { useState } from "react";
import { useStore, useUI } from "@/lib/stores-combined";
import { X, MessageCircle, Mail } from "lucide-react";
import { toast } from "sonner";

export default function NotifyModal() {
  const notifyOpen = useUI((s) => s.notifyOpen);
  const setNotifyOpen = useUI((s) => s.setNotifyOpen);
  const product = useUI((s) => s.notifyProduct);
  const addLead = useStore((s) => s.addLead);
  const pixConfig = useStore((s) => s.pixConfig);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  if (!notifyOpen || !product) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // Save lead locally (store) + D1 sync (via store's addLead)
    addLead({
      date: new Date().toLocaleString("pt-BR"),
      name,
      phone,
      product: `${product.name} (${product.code})`,
    });
    // Also save to D1 leads with email
    void fetch("/api/db/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: new Date().toLocaleString("pt-BR"),
        name,
        phone,
        product: `${product.name} (${product.code}) — Email: ${email}`,
      }),
    }).catch(() => {});
    // Also save email to newsletter table (opt-in)
    if (email) {
      void fetch("/api/db/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      }).catch(() => {});
    }

    setNotifyOpen(false);
    setName("");
    setPhone("");
    setEmail("");
    toast.success(
      "Cadastro realizado! Redirecionando para o Grupo VIP no WhatsApp..."
    );
    setTimeout(() => {
      window.open(pixConfig.whatsappGroup, "_blank");
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="glass-panel-gold max-w-md w-full rounded-2xl p-6 relative border border-gold-500/40 shadow-2xl max-h-[90vh] overflow-y-auto">
        <button
          onClick={() => setNotifyOpen(false)}
          className="absolute top-4 right-4 text-gray-400 hover:text-white"
          aria-label="Fechar"
        >
          <X size={20} />
        </button>

        <div className="text-center mb-5">
          <div className="w-12 h-12 rounded-full bg-gold-500/20 border border-gold-500/40 flex items-center justify-center mx-auto mb-3 text-gold-400">
            <MessageCircle size={24} />
          </div>
          <h3 className="font-serif-luxury text-2xl font-bold text-white">
            Avise-me quando chegar!
          </h3>
          <p className="text-xs text-gold-300 mt-1 font-semibold">
            {product.name} ({product.inspiration})
          </p>
          <p className="text-xs text-gray-300 mt-2">
            Cadastre seus dados abaixo. Você será notificado prioritariamente
            no WhatsApp e por email no reabastecimento!
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-[11px] text-gray-400 mb-1 uppercase tracking-wider">
              Seu Nome
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Maria Silva"
              className="w-full bg-obsidian-900 border border-gold-500/30 rounded-xl py-2.5 px-3 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-gold-400"
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-400 mb-1 uppercase tracking-wider">
              WhatsApp com DDD
            </label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 99999-9999"
              className="w-full bg-obsidian-900 border border-gold-500/30 rounded-xl py-2.5 px-3 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-gold-400"
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-400 mb-1 uppercase tracking-wider flex items-center gap-1">
              <Mail size={11} /> Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="w-full bg-obsidian-900 border border-gold-500/30 rounded-xl py-2.5 px-3 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-gold-400"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-900/30"
          >
            <MessageCircle size={16} />
            <span>Cadastrar & Entrar no Grupo VIP</span>
          </button>
        </form>
      </div>
    </div>
  );
}
