"use client";

import { useEffect, useState } from "react";
import {
  X,
  Sparkles,
  Mail,
  Send,
  Gift,
  Bell,
  Smartphone,
  Check,
} from "lucide-react";
import { toast } from "sonner";

/**
 * WelcomeModal — aparece 5s após a primeira visita.
 *
 * Combina 2 funcionalidades:
 *  - PWA install prompt (botão "Instalar App Mimi Mimos")
 *  - Newsletter signup (input email + "Receber Cupons Exclusivos")
 *
 * Guarda em sessionStorage para não reaparecer na mesma sessão.
 * Email é gravado em localStorage (NewsletterSection pattern) e POSTado
 * fire-and-forget para /api/db/newsletter.
 *
 * Fecha via X, ESC, ou clique no backdrop.
 */

const STORAGE_KEY = "mimi-welcome-shown";
const NEWSLETTER_LS_KEY = "mimi-newsletter";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface NewsletterStore {
  emails: string[];
  subscribedAt: string[];
}

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

const BENEFITS = [
  {
    icon: Gift,
    label: "Cupom de boas-vindas",
    color: "text-gold-300",
    bg: "bg-gold-500/10 border-gold-500/30",
  },
  {
    icon: Bell,
    label: "Alertas de estoque",
    color: "text-emerald-300",
    bg: "bg-emerald-500/10 border-emerald-500/30",
  },
  {
    icon: Smartphone,
    label: "App instalável",
    color: "text-pink-300",
    bg: "bg-pink-500/10 border-pink-500/30",
  },
];

export default function WelcomeModal() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );

  // Show modal after 5s (only on first visit in session)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(STORAGE_KEY)) return;

    const timer = setTimeout(() => {
      setOpen(true);
      sessionStorage.setItem(STORAGE_KEY, "1");
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  // Capture beforeinstallprompt event for PWA install
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () =>
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
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

  const close = () => setOpen(false);

  const validateEmail = (e: string): boolean =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

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
    const normalized = email.toLowerCase().trim();
    if (store.emails.includes(normalized)) {
      toast.info("Você já está inscrito! Fique de olho nos próximos emails. 💛");
      setSubscribed(true);
      setLoading(false);
      return;
    }
    store.emails.push(normalized);
    store.subscribedAt.push(new Date().toISOString());
    saveNewsletter(store);
    // Fire-and-forget D1 sync
    void fetch("/api/db/newsletter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalized }),
    }).catch(() => {});

    setSubscribed(true);
    setLoading(false);
    toast.success("Bem-vinda ao Clube Mimi Mimos! 💛");
    setEmail("");
  };

  const handleInstall = async () => {
    // Request notification permission (independent of PWA install)
    if (typeof window !== "undefined" && "Notification" in window) {
      try {
        await Notification.requestPermission();
      } catch {
        // silent
      }
    }

    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        toast.success("App instalado com sucesso! 🎉");
        setDeferred(null);
      }
    } else {
      toast.info(
        "Para instalar, use o menu do navegador e selecione 'Adicionar à tela inicial'."
      );
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[78] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-300"
      onClick={close}
    >
      <div
        className="glass-panel-gold max-w-md w-full rounded-3xl p-6 sm:p-8 relative border border-gold-500/40 shadow-2xl animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={close}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-obsidian-950/60 text-gray-400 hover:text-white flex items-center justify-center transition-colors"
          aria-label="Fechar"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="text-center mb-5">
          <div className="w-14 h-14 rounded-2xl bg-gold-500/20 border border-gold-500/40 flex items-center justify-center mx-auto mb-3 text-gold-300">
            <Sparkles size={26} />
          </div>
          <h2 className="font-serif-luxury text-2xl font-bold text-white">
            Bem-vinda à Mimi Mimos
          </h2>
          <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
            Receba cupons exclusivos, alertas de reposição e instale nosso app
            para uma experiência completa de luxo.
          </p>
        </div>

        {/* Benefits pills */}
        <div className="flex flex-wrap justify-center gap-2 mb-5">
          {BENEFITS.map((b) => {
            const Icon = b.icon;
            return (
              <span
                key={b.label}
                className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider ${b.color} ${b.bg} border rounded-full px-2.5 py-1`}
              >
                <Icon size={10} /> {b.label}
              </span>
            );
          })}
        </div>

        {/* Newsletter form OR success state */}
        {!subscribed ? (
          <form onSubmit={handleSubmit} className="mb-4">
            <label
              htmlFor="welcome-email"
              className="block text-[10px] uppercase tracking-wider text-gold-300 mb-1.5 font-bold"
            >
              Receba cupons exclusivos
            </label>
            <div className="flex flex-col gap-2">
              <div className="relative">
                <Mail
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gold-400/70"
                />
                <input
                  id="welcome-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  disabled={loading}
                  className="w-full bg-obsidian-950 border border-gold-500/30 rounded-xl py-3 pl-9 pr-3 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-gold-400 disabled:opacity-50"
                  aria-label="Email para receber cupons"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="btn-gold py-3 rounded-xl text-xs uppercase tracking-wider font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <span className="w-3 h-3 border-2 border-obsidian-950 border-t-transparent rounded-full animate-spin" />
                    Inscrevendo...
                  </>
                ) : (
                  <>
                    <Send size={12} />
                    Receber Cupons Exclusivos
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          <div className="mb-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center animate-in fade-in zoom-in-95 duration-300">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto mb-2 text-emerald-300">
              <Check size={20} />
            </div>
            <p className="text-sm font-bold text-emerald-200 mb-1">
              Inscrição confirmada! 💛
            </p>
            <p className="text-[10px] text-emerald-300/80 leading-relaxed">
              Use o cupom <strong className="text-emerald-200">BEMVINDO10</strong> na
              primeira compra (10% OFF).
            </p>
          </div>
        )}

        {/* Divider */}
        <div className="flex items-center gap-3 my-4">
          <div className="flex-grow h-px bg-gold-500/20" />
          <span className="text-[10px] uppercase tracking-wider text-gray-500">
            ou
          </span>
          <div className="flex-grow h-px bg-gold-500/20" />
        </div>

        {/* PWA install */}
        <button
          onClick={handleInstall}
          className="w-full bg-obsidian-950 border border-gold-500/30 hover:border-gold-400/60 hover:bg-obsidian-900 text-gold-300 font-bold py-3 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
        >
          <Smartphone size={14} />
          Instalar App Mimi Mimos
        </button>

        <p className="text-[9px] text-gray-600 text-center mt-4">
          🔒 Sem spam — só conteúdo de luxo. Cancele quando quiser.
        </p>
      </div>
    </div>
  );
}
