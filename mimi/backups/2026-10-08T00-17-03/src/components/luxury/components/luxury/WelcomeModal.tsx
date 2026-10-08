"use client";

import { useState, useEffect } from "react";
import { X, Smartphone, Mail, Sparkles, Gift, Bell, Check } from "lucide-react";
import { toast } from "sonner";

/**
 * WelcomeModal — modal de boas-vindas que aparece 5s após o primeiro acesso.
 * 
 * Combina 2 conversões em um único modal elegante:
 * 1. Instalar App (PWA) — botão "Adicionar à Tela Inicial"
 * 2. Cadastrar Newsletter — email + botão "Receber Cupons"
 * 
 * Comportamento:
 * - Aparece após 5s no site (apenas 1x por sessão via sessionStorage)
 * - Não aparece se já inscrito (verifica localStorage)
 * - Pode fechar com X ou ESC — não incomoda mais nesta sessão
 * - Posicionamento: centro da tela, backdrop blur (padrão e-commerce)
 * 
 * PWA Notifications:
 * - Ao clicar em "Instalar App", pedimos permissão de notificações push
 * - Se concedida, exibimos uma notification de boas-vindas e registramos
 *   o dispositivo na tabela `newsletter` do D1 (via /api/db/newsletter) para
 *   que o admin saiba quantos usuários ativaram push. Usamos um email
 *   sintético `push-{deviceId}@push.mimimimos.local` para identificar essas
 *   inscrições push (a tabela newsletter usa email como PK).
 */

const WELCOME_SHOWN_KEY = "mimi-welcome-shown";
const NEWSLETTER_KEY = "mimi-newsletter";
const PUSH_DEVICE_KEY = "mimi-push-device-id";

/** Generates / retrieves a stable per-device ID for push subscription dedup. */
function getPushDeviceId(): string {
  if (typeof window === "undefined") return "server";
  try {
    let id = window.localStorage.getItem(PUSH_DEVICE_KEY);
    if (!id) {
      // RFC4122 v4-ish — sufficient for client-side dedup, not cryptographic.
      id =
        "push-" +
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 10);
      window.localStorage.setItem(PUSH_DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "push-fallback-" + Date.now().toString(36);
  }
}

export default function WelcomeModal() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check if already shown this session
    const shown = sessionStorage.getItem(WELCOME_SHOWN_KEY);
    if (shown) return;

    // Check if already subscribed to newsletter
    try {
      const news = JSON.parse(localStorage.getItem(NEWSLETTER_KEY) || "{}");
      if (news.emails && news.emails.length > 0) return;
    } catch {
      /* ignore */
    }

    // Show after 5s
    const timer = setTimeout(() => {
      setOpen(true);
      sessionStorage.setItem(WELCOME_SHOWN_KEY, "true");
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      toast.error("Digite um email válido.");
      return;
    }
    setLoading(true);

    // Save to localStorage
    try {
      const news = JSON.parse(localStorage.getItem(NEWSLETTER_KEY) || "{}");
      const emails = news.emails || [];
      const lowerEmail = email.toLowerCase().trim();
      if (!emails.includes(lowerEmail)) {
        emails.push(lowerEmail);
        localStorage.setItem(
          NEWSLETTER_KEY,
          JSON.stringify({ emails, subscribedAt: news.subscribedAt || [] })
        );
        const subscribedAt = news.subscribedAt || [];
        subscribedAt.push(new Date().toISOString());
        localStorage.setItem(
          NEWSLETTER_KEY,
          JSON.stringify({ emails, subscribedAt })
        );
      }
    } catch {
      /* ignore */
    }

    // Save to D1
    void fetch("/api/db/newsletter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.toLowerCase().trim() }),
    }).catch(() => {});

    setSubscribed(true);
    setLoading(false);
    toast.success("Inscrição confirmada! Bem-vinda ao Clube Mimi 💛");

    // Auto-close after 2.5s
    setTimeout(() => setOpen(false), 2500);
  };

  const handleInstall = async () => {
    // Trigger PWA install prompt if available.
    window.dispatchEvent(new Event("pwa-install-requested"));
    const deferredPrompt = (window as any).deferredPrompt as
      | { prompt: () => Promise<void>; userChoice?: Promise<{ outcome: "accepted" | "dismissed" }> }
      | undefined;

    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        // Wait for the user's choice (accepted / dismissed) before asking for notifications.
        if (deferredPrompt.userChoice) {
          await deferredPrompt.userChoice;
        }
      } catch {
        /* swallow — notification flow runs regardless */
      }
    } else {
      // No beforeinstallprompt available (iOS Safari, etc.) — give install hint.
      toast.info(
        "Para instalar: toque no menu do navegador (⋮) e selecione 'Adicionar à tela inicial'."
      );
    }

    // After install prompt: request notification permission for push alerts.
    // Even if the user dismissed the install itself, we still ask — this maximises
    // the push subscriber base for promo/restock alerts.
    try {
      if ("Notification" in window && Notification.permission === "default") {
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
          // Fire the welcome notification immediately.
          try {
            new Notification("Bem-vinda ao Clube Mimi Mimos! 💛", {
              body: "Receba alertas de promoções e reposições.",
              icon: "/icon-192.png",
              badge: "/icon-192.png",
              tag: "mimi-welcome",
            });
          } catch {
            /* some browsers throw if SW is not yet active — silent */
          }

          // Persist subscription to D1 via the newsletter endpoint (same table).
          // Uses a synthetic email so push subscribers don't collide with real
          // newsletter signups. `push-…@push.mimimimos.local` passes the email
          // regex and is easily filterable in the admin dashboard.
          const deviceId = getPushDeviceId();
          void fetch("/api/db/newsletter", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: `${deviceId}@push.mimimimos.local`,
            }),
          }).catch(() => {});

          toast.success("Notificações ativadas! Você receberá alertas do Clube Mimi 💛");
        } else if (permission === "denied") {
          toast.info("Sem problema! Você pode ativar notificações depois nas configurações.");
        }
      } else if ("Notification" in window && Notification.permission === "granted") {
        // Already granted — re-fire welcome + ensure subscription is persisted.
        try {
          new Notification("Bem-vinda ao Clube Mimi Mimos! 💛", {
            body: "Receba alertas de promoções e reposições.",
            icon: "/icon-192.png",
            tag: "mimi-welcome",
          });
        } catch {
          /* ignore */
        }
        const deviceId = getPushDeviceId();
        void fetch("/api/db/newsletter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: `${deviceId}@push.mimimimos.local` }),
        }).catch(() => {});
      }
    } catch {
      /* Notifications API not supported — silent */
    }

    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300"
      onClick={() => setOpen(false)}
    >
      <div
        className="glass-panel-gold max-w-md w-full rounded-3xl p-6 sm:p-8 relative border border-gold-500/40 shadow-2xl max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-400"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setOpen(false)}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-obsidian-950/60 text-gray-400 hover:text-white flex items-center justify-center transition-colors z-10"
          aria-label="Fechar"
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div className="text-center mb-5">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-gold-500/30 to-amber-400/10 border border-gold-500/40 flex items-center justify-center mx-auto mb-3 text-gold-300">
            <Sparkles size={28} />
          </div>
          <h3 className="font-serif-luxury text-2xl font-bold text-white">
            Bem-vinda à Mimi Mimos
          </h3>
          <p className="text-[11px] text-gray-400 mt-1">
            Sua parfumerie de bolso. Receba cupons exclusivos e instale nosso app.
          </p>
        </div>

        {/* Benefits pills */}
        <div className="flex flex-wrap justify-center gap-1.5 mb-5">
          <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wider text-gold-200 bg-gold-500/10 border border-gold-500/30 rounded-full px-2.5 py-1">
            <Gift size={10} /> Cupom boas-vindas
          </span>
          <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wider text-emerald-200 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2.5 py-1">
            <Bell size={10} /> Alertas de estoque
          </span>
          <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wider text-sky-200 bg-sky-500/10 border border-sky-500/30 rounded-full px-2.5 py-1">
            <Smartphone size={10} /> App installável
          </span>
        </div>

        {/* Newsletter signup */}
        {!subscribed ? (
          <form onSubmit={handleSubscribe} className="space-y-2 mb-4">
            <div className="relative">
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
                className="w-full bg-obsidian-950 border border-gold-500/30 rounded-xl py-3 pl-9 pr-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gold-400 disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full btn-gold py-3 rounded-xl text-xs uppercase tracking-wider font-bold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? (
                <>
                  <span className="w-3 h-3 border-2 border-obsidian-950 border-t-transparent rounded-full animate-spin" />
                  Inscrevendo...
                </>
              ) : (
                <>
                  <Mail size={13} /> Receber Cupons Exclusivos
                </>
              )}
            </button>
          </form>
        ) : (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 mb-4 text-center animate-in fade-in zoom-in-95 duration-300">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto mb-2 text-emerald-300">
              <Check size={20} />
            </div>
            <p className="text-sm font-bold text-emerald-200">Inscrição Confirmada!</p>
            <p className="text-[10px] text-emerald-300/80 mt-0.5">
              Seu cupom de boas-vindas chegará em breve 💛
            </p>
          </div>
        )}

        {/* Divider */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-grow h-px bg-gold-500/15" />
          <span className="text-[9px] uppercase tracking-widest text-gray-600">ou</span>
          <div className="flex-grow h-px bg-gold-500/15" />
        </div>

        {/* PWA Install */}
        <button
          onClick={handleInstall}
          className="w-full bg-obsidian-900 hover:bg-obsidian-800 border border-gold-500/30 hover:border-gold-500/50 text-gold-300 py-2.5 rounded-xl text-xs uppercase tracking-wider font-bold flex items-center justify-center gap-2 transition-all"
        >
          <Smartphone size={14} />
          Instalar App Mimi Mimos
        </button>
        <p className="text-[9px] text-gray-600 text-center mt-1.5">
          Acesso rápido direto da tela inicial do seu celular
        </p>
      </div>
    </div>
  );
}
