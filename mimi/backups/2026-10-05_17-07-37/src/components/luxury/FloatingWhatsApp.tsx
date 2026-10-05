"use client";

import { MessageCircle } from "lucide-react";

/** Botão flutuante de contato direto via WhatsApp. */
export default function FloatingWhatsApp() {
  const directHref = `https://wa.me/5511970111433?text=${encodeURIComponent(
    "Olá Mimi Mimos! Vim pelo catálogo online e gostaria de atendimento."
  )}`;

  return (
    <a
      href={directHref}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar no WhatsApp"
      className="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-500 shadow-2xl shadow-emerald-900/40 flex items-center justify-center text-white transition-all hover:scale-110 group safe-bottom"
    >
      <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-20 group-hover:opacity-40" />
      <MessageCircle size={26} className="relative" />
      <span className="absolute right-16 top-1/2 -translate-y-1/2 hidden md:block whitespace-nowrap bg-obsidian-950 border border-emerald-500/40 text-emerald-300 text-[11px] px-3 py-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        Fale conosco no WhatsApp
      </span>
    </a>
  );
}
