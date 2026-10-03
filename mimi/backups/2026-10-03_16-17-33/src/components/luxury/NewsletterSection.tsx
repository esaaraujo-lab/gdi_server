"use client";

import { useState } from "react";
import { Mail, Send, Check, Sparkles, Gift, Bell } from "lucide-react";
import { toast } from "sonner";

/**
 * Newsletter Subscription — captura email do cliente para:
 * - Receber promoções exclusivas (Black Friday, Natal, Dia das Mães)
 * - Avisos de novidades e reposições de estoque
 * - Cupons exclusivos para inscritos
 *
 * Persistência: localStorage (lista de emails inscritos neste dispositivo).
 * Em produção, integrar com Mailchimp/Brevo/SendGrid via API route.
 */

interface NewsletterStore {
  emails: string[];
  subscribedAt: string[];
}

const NEWSLETTER_LS_KEY = "mimi-newsletter";

function loadNewsletter(): NewsletterStore {
  if (typeof window === "undefined") return { emails: [], subscribedAt: [] };
  try {
    const raw = localStorage.getItem(NEWSLETTER_LS_KEY);
    if (!raw) return { emails: [], subscribedAt: [] };
    const parsed = JSON.parse(raw);
    return {
      emails: Array.isArray(parsed.emails) ? parsed.emails : [],
      subscribedAt: Array.isArray(parsed.subscribedAt)
        ? parsed.subscribedAt
        : [],
    };
  } catch {
    return { emails: [], subscribedAt: [] };
  }
}

function saveNewsletter(data: NewsletterStore) {
  if (typeof window === "undefined") return;
  localStorage.setItem(NEWSLETTER_LS_KEY, JSON.stringify(data));
}

export default function NewsletterSection() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  const validateEmail = (e: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Digite seu email.");
      return;
    }
    if (!validateEmail(email)) {
      toast.error("Email inválido. Verifique o formato (ex: seu@email.com).");
      return;
    }
    setLoading(true);
    // Simula delay de API
    await new Promise((r) => setTimeout(r, 500));

    const store = loadNewsletter();
    if (store.emails.includes(email.toLowerCase())) {
      toast.info("Você já está inscrito! Fique de olho nos próximos emails. 💛");
      setSubscribed(true);
      setLoading(false);
      return;
    }
    store.emails.push(email.toLowerCase());
    store.subscribedAt.push(new Date().toISOString());
    saveNewsletter(store);
    // Sync to D1 (fire-and-forget) — admin can see all subscribers
    void fetch("/api/db/newsletter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.toLowerCase() }),
    }).catch(() => {});
    setSubscribed(true);
    setLoading(false);
    toast.success("Inscrição confirmada! Bem-vinda ao Clube Mimi 💛");
    setEmail("");
  };

  return (
    <section
      id="newsletterSection"
      className="py-12 px-4 sm:px-8 border-t border-gold-500/10 relative overflow-hidden"
    >
      {/* Aura decorativa */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-72 bg-gold-500/10 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute bottom-0 left-1/4 w-40 h-40 bg-emerald-400/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-3xl mx-auto relative z-10">
        <div className="glass-panel-gold rounded-3xl p-6 sm:p-10 border border-gold-500/40 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-5">
            <div className="inline-flex items-center justify-center gap-2 mb-3 px-3 py-1.5 rounded-full bg-gold-500/15 border border-gold-500/30">
              <Sparkles size={12} className="text-gold-300" />
              <span className="text-[10px] uppercase tracking-[0.2em] text-gold-200 font-bold">
                Clube Mimi Mimos
              </span>
            </div>
            <h3 className="font-serif-luxury text-2xl sm:text-3xl font-bold text-white mb-2">
              Receba Novidades & Cupons Exclusivos
            </h3>
            <p className="text-xs text-gray-400 max-w-xl mx-auto leading-relaxed">
              Inscreva-se para receber promoções exclusivas (Black Friday, Dia
              das Mães, Natal), avisos de reposição de estoque e cupons
              especiais para inscritos. Sem spam — só luxo. 💛
            </p>
          </div>

          {/* Benefits pills */}
          <div className="flex flex-wrap justify-center gap-2 mb-5">
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-gold-200 bg-gold-500/10 border border-gold-500/30 rounded-full px-2.5 py-1">
              <Gift size={10} /> Cupom de boas-vindas
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-200 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2.5 py-1">
              <Bell size={10} /> Avisos de estoque
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-pink-200 bg-pink-500/10 border border-pink-500/30 rounded-full px-2.5 py-1">
              <Sparkles size={10} /> Promoções exclusivas
            </span>
          </div>

          {/* Form */}
          {!subscribed ? (
            <form
              onSubmit={handleSubmit}
              className="flex flex-col sm:flex-row gap-2 max-w-md mx-auto"
            >
              <div className="relative flex-grow">
                <Mail
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gold-400/70"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  disabled={loading}
                  className="w-full bg-obsidian-950 border border-gold-500/30 rounded-xl py-3 pl-9 pr-3 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-gold-400 disabled:opacity-50"
                  aria-label="Email para newsletter"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="btn-gold px-5 py-3 rounded-xl text-xs uppercase tracking-wider font-bold whitespace-nowrap flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <span className="w-3 h-3 border-2 border-obsidian-950 border-t-transparent rounded-full animate-spin" />
                    Inscrevendo...
                  </>
                ) : (
                  <>
                    <Send size={12} />
                    Inscrever
                  </>
                )}
              </button>
            </form>
          ) : (
            <div className="text-center max-w-md mx-auto p-5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 animate-in fade-in zoom-in-95 duration-300">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto mb-3 text-emerald-300">
                <Check size={24} />
              </div>
              <p className="text-sm font-bold text-emerald-200 mb-1">
                Inscrição Confirmada! 💛
              </p>
              <p className="text-[11px] text-emerald-300/80 leading-relaxed">
                Bem-vinda ao Clube Mimi Mimos. Você receberá novidades,
                reposições e cupons exclusivos no seu email.
              </p>
              <button
                onClick={() => setSubscribed(false)}
                className="mt-3 text-[10px] text-gold-400 hover:text-gold-300 underline uppercase tracking-wider"
              >
                Inscrever outro email
              </button>
            </div>
          )}

          {/* Privacy note */}
          <p className="text-[9px] text-gray-600 text-center mt-3">
            🔒 Respeitamos sua privacidade. Sem spam — só conteúdo de luxo.
            Cancele quando quiser.
          </p>
        </div>
      </div>
    </section>
  );
}
