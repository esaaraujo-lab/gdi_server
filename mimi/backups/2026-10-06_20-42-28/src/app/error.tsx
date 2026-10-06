"use client";

/**
 * Error Boundary — catches runtime errors and shows a friendly fallback.
 * Prevents white screen of death.
 */

import { useEffect } from "react";
import { RefreshCw, Home } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-obsidian-950 text-white p-8">
      <div className="glass-panel-gold rounded-2xl p-8 max-w-md text-center border border-gold-500/30">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gold-500/20 border border-gold-500/40 flex items-center justify-center">
          <RefreshCw size={28} className="text-gold-400" />
        </div>
        <h2 className="font-serif-luxury text-2xl font-bold text-gold-300 mb-2">
          Ops! Algo deu errado
        </h2>
        <p className="text-sm text-gray-400 mb-6">
          Encontramos um erro inesperado. Tente recarregar a página.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="btn-gold px-6 py-2.5 rounded-xl text-xs uppercase tracking-widest font-bold flex items-center gap-2"
          >
            <RefreshCw size={14} /> Recarregar
          </button>
          <a
            href="/"
            className="px-6 py-2.5 rounded-xl text-xs uppercase tracking-widest font-bold border border-gold-500/30 text-gold-300 hover:bg-gold-500/10 transition-all flex items-center gap-2"
          >
            <Home size={14} /> Início
          </a>
        </div>
        {error.digest && (
          <p className="text-[10px] text-gray-600 mt-4">
            Código do erro: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
