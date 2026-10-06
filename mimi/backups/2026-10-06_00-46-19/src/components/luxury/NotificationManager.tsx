"use client";

import { useEffect, useState } from "react";
import { Bell, X, Check, BellRing } from "lucide-react";
import { toast } from "sonner";

/**
 * Sistema de Notificações Push para promoções.
 * Pede permissão do usuário e armazena inscrição.
 * No admin, quando uma promoção é criada, dispara notificação para todos inscritos.
 */
export default function NotificationManager() {
  const [permission, setPermission] = useState<NotificationPermission>(
    () =>
      typeof window !== "undefined" && "Notification" in window
        ? Notification.permission
        : "default"
  );
  const [showBanner, setShowBanner] = useState(false);
  const [subscribed, setSubscribed] = useState(
    () =>
      typeof window !== "undefined" &&
      localStorage.getItem("mimi-notif-subscribed") === "true"
  );

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const dismissed = sessionStorage.getItem("notif-dismissed");
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone;
    if (permission === "default" && !dismissed) {
      const t = setTimeout(() => setShowBanner(true), isStandalone ? 2000 : 5000);
      return () => clearTimeout(t);
    }
  }, [permission]);

  const requestPermission = async () => {
    if (!("Notification" in window)) {
      toast.error("Seu navegador não suporta notificações.");
      return;
    }
    const perm = await Notification.requestPermission();
    setPermission(perm);
    if (perm === "granted") {
      setSubscribed(true);
      localStorage.setItem("mimi-notif-subscribed", "true");
      // Envia notificação de boas-vindas
      new Notification("Mimi Mimos 🌟", {
        body: "Você será avisada de todas as promoções e lançamentos!",
        icon: "/icon-192.png",
        badge: "/favicon-32.png",
        tag: "mimi-welcome",
      });
      toast.success("Notificações ativadas! Você receberá promoções em primeira mão.");
      setShowBanner(false);
    } else {
      toast.error("Permissão negada. Você pode ativar depois nas configurações.");
    }
  };

  const dismiss = () => {
    setShowBanner(false);
    sessionStorage.setItem("notif-dismissed", "1");
  };

  // Escuta por promoções broadcastadas via BroadcastChannel (admin → clientes)
  useEffect(() => {
    if (typeof window === "undefined" || !subscribed) return;
    // Verifica promoções periodicamente (a cada 5 min) via API
    const checkPromos = async () => {
      try {
        const res = await fetch("/api/promotions");
        const data = await res.json();
        if (data.promotions && data.promotions.length > 0) {
          const lastSeen = localStorage.getItem("mimi-last-promo") || "";
          const latest = data.promotions[0];
          if (latest.id !== lastSeen) {
            localStorage.setItem("mimi-last-promo", latest.id);
            new Notification("🎉 Promoção Mimi Mimos!", {
              body: latest.message,
              icon: "/icon-192.png",
              badge: "/favicon-32.png",
              tag: latest.id,
              data: { url: "/" },
            });
          }
        }
      } catch {
        // silencioso
      }
    };
    // Verifica ao carregar e a cada 5 minutos
    checkPromos();
    const interval = setInterval(checkPromos, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [subscribed]);

  return (
    <>
      {/* Banner de inscrição */}
      {showBanner && permission === "default" && (
        <div className="fixed bottom-4 left-4 right-4 md:left-4 md:w-96 z-40 glass-panel-gold rounded-2xl p-4 border border-gold-500/40 shadow-2xl animate-[fadeUp_0.4s_ease-out]">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gold-500/20 border border-gold-500/40 flex items-center justify-center text-gold-400 shrink-0">
              <BellRing size={20} />
            </div>
            <div className="flex-grow">
              <h4 className="text-xs font-bold text-white">
                Receba Promoções Exclusivas
              </h4>
              <p className="text-[10px] text-gray-300 mt-0.5">
                Seja avisada de promoções (3 decantes por R$ 100, Black Friday,
                lançamentos) direto no seu celular.
              </p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={requestPermission}
                  className="btn-gold px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1"
                >
                  <Check size={11} /> Ativar
                </button>
                <button
                  onClick={dismiss}
                  className="text-[10px] text-gray-400 hover:text-white px-2"
                >
                  Agora não
                </button>
              </div>
            </div>
            <button
              onClick={dismiss}
              className="text-gray-400 hover:text-white shrink-0"
              aria-label="Fechar"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Botão flutuante de notificações (se já inscrito) */}
      {subscribed && permission === "granted" && (
        <button
          onClick={() => {
            new Notification("Mimi Mimos 🌟", {
              body: "Você está inscrita! Promoções chegarão automaticamente.",
              icon: "/icon-192.png",
            });
          }}
          className="fixed bottom-6 left-6 z-30 w-11 h-11 rounded-full bg-gold-500/20 border border-gold-500/40 flex items-center justify-center text-gold-300 hover:bg-gold-500/30 transition-all"
          aria-label="Notificações ativas"
          title="Notificações ativas — clique para testar"
        >
          <Bell size={18} className="text-gold-400" />
        </button>
      )}
    </>
  );
}
