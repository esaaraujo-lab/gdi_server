"use client";

import { useEffect, useState } from "react";
import { Smartphone, X, Share, PlusSquare } from "lucide-react";
import { toast } from "sonner";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Banner de instalação PWA com instruções específicas para iOS e Android. */
export default function PwaInstallBanner() {
  const [visible, setVisible] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  // Detect iOS once via lazy initializer (client-only; server returns false).
  const [isIos] = useState(
    () =>
      typeof window !== "undefined" &&
      /iPad|iPhone|iPod/.test(navigator.userAgent)
  );

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone;

    if (isStandalone) return;

    const dismissed = sessionStorage.getItem("pwa-banner-dismissed");
    if (dismissed) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS não dispara beforeinstallprompt — mostra banner próprio
    if (isIos) {
      const t = setTimeout(() => setVisible(true), 2500);
      return () => {
        clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      };
    }

    return () =>
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, [isIos]);

  const dismiss = () => {
    setVisible(false);
    sessionStorage.setItem("pwa-banner-dismissed", "1");
  };

  const install = async () => {
    if (isIos) {
      setShowIosGuide(true);
      return;
    }
    if (!deferred) {
      toast.info(
        "Para instalar, use o menu do navegador e selecione 'Adicionar à tela inicial'."
      );
      return;
    }
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") {
      toast.success("App instalado com sucesso!");
      setVisible(false);
    }
    setDeferred(null);
  };

  if (!visible) return null;

  return (
    <>
      <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-40 glass-panel-gold rounded-2xl p-4 border border-gold-500/40 shadow-2xl flex items-center justify-between gap-3 animate-bounce safe-bottom">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold-500/20 border border-gold-500/40 flex items-center justify-center text-gold-400">
            <Smartphone size={20} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white">
              Instalar App Mimi Mimos
            </h4>
            <p className="text-[10px] text-gray-300">
              {isIos
                ? "Toque em instalar para ver o passo a passo no iOS"
                : "Acesse o catálogo como WebApp nativo!"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={install}
            className="btn-gold px-4 py-1.5 rounded-xl text-xs font-bold"
          >
            Instalar
          </button>
          <button
            onClick={dismiss}
            className="text-gray-400 hover:text-white"
            aria-label="Dispensar"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* iOS install guide modal */}
      {showIosGuide && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="glass-panel-gold max-w-sm w-full rounded-2xl p-6 relative border border-gold-500/40">
            <button
              onClick={() => setShowIosGuide(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-xl bg-gold-500/20 border border-gold-500/40 flex items-center justify-center mx-auto mb-2 text-gold-400">
                <Smartphone size={24} />
              </div>
              <h3 className="font-serif-luxury text-xl font-bold text-white">
                Instalar no iPhone (iOS)
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                Siga os passos abaixo para adicionar à tela de início.
              </p>
            </div>
            <ol className="space-y-3 text-xs text-gray-200">
              <li className="flex items-start gap-2">
                <span className="text-gold-400 font-bold">1.</span>
                <span className="flex items-center gap-1.5">
                  Toque no botão
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-obsidian-900 border border-gold-500/30 text-gold-400">
                    <Share size={13} />
                  </span>
                  Compartilhar na barra inferior do Safari.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gold-400 font-bold">2.</span>
                <span className="flex items-center gap-1.5">
                  Role e toque em
                  <span className="inline-flex items-center gap-1 text-gold-300 font-semibold">
                    <PlusSquare size={13} /> Adicionar à Tela de Início
                  </span>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gold-400 font-bold">3.</span>
                <span>
                  Confirme em <strong className="text-gold-300">Adicionar</strong>.
                  O app aparecerá com ícone dourado e visual nativo iOS.
                </span>
              </li>
            </ol>
            <button
              onClick={() => setShowIosGuide(false)}
              className="mt-5 w-full btn-gold py-2.5 rounded-xl text-xs uppercase font-bold"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  );
}
