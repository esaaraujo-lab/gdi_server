"use client";

import { useState, useEffect } from "react";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showSubtitle?: boolean;
  subtitle?: string;
  className?: string;
}

const SIZES = {
  sm: { badge: "w-10 h-10", title: "text-lg", subtitle: "text-[8px]" },
  md: { badge: "w-14 h-14 md:w-16 md:h-16", title: "text-xl md:text-3xl", subtitle: "text-[8px] md:text-[9px]" },
  lg: { badge: "w-20 h-20 md:w-24 md:h-24", title: "text-2xl md:text-4xl", subtitle: "text-[10px] md:text-[11px]" },
  xl: { badge: "w-24 h-24 md:w-28 md:h-28", title: "text-3xl md:text-5xl", subtitle: "text-[11px] md:text-xs" },
};

/**
 * Logo reutilizável: frasco de perfume (imagem processada) + texto MIMI MIMOS.
 *
 * Comportamento adaptativo em mobile:
 *  - Desktop (sm+): mostra "Mimi Mimos" completo
 *  - Mobile (< sm): alterna elegantemente entre "MIMI" e "Mimos" a cada 3s
 *    com transição fade, garantindo que o cliente sempre veja o nome da loja
 *    mesmo em telas muito estreitas.
 */
export default function Logo({
  size = "md",
  showSubtitle = true,
  subtitle = "PERFUME STORE",
  className = "",
}: LogoProps) {
  const s = SIZES[size];
  const [mobileWord, setMobileWord] = useState<"MIMI" | "Mimos">("MIMI");

  // Alternate between "MIMI" and "Mimos" on mobile every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setMobileWord((prev) => (prev === "MIMI" ? "Mimos" : "MIMI"));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`flex items-center gap-2 sm:gap-3 group ${className}`}>
      <div
        className={`${s.badge} rounded-full border-2 border-gold-500/50 flex items-center justify-center bg-obsidian-900/80 group-hover:border-gold-400 group-hover:shadow-lg group-hover:shadow-gold-500/30 transition-all overflow-hidden shrink-0`}
      >
        <img
          src="/logo-bottle.png"
          alt="Mimi Mimos — frasco de perfume"
          className="w-full h-full object-cover scale-[1.6]"
        />
      </div>
      <div className="flex flex-col min-w-0">
        {/* Desktop: full "Mimi Mimos" */}
        <span
          className={`hidden sm:block font-serif-luxury ${s.title} font-bold tracking-wider gold-shimmer-text uppercase leading-none`}
        >
          Mimi Mimos
        </span>
        {/* Mobile: alternating "MIMI" / "Mimos" with elegant fade transition */}
        <span
          className="sm:hidden relative h-[1.2em] overflow-hidden font-serif-luxury font-bold tracking-wider gold-shimmer-text uppercase leading-none"
          style={{ fontSize: "var(--mobile-logo-size, 1.25rem)" }}
        >
          <span
            key={mobileWord}
            className="inline-block animate-[logoFadeIn_0.6s_ease-out_forwards]"
          >
            {mobileWord}
          </span>
        </span>
        {showSubtitle && (
          <span
            className={`${s.subtitle} uppercase tracking-[0.2em] sm:tracking-[0.25em] text-gold-500 font-semibold mt-1`}
          >
            {subtitle}
          </span>
        )}
      </div>

      <style jsx>{`
        @keyframes logoFadeIn {
          0% {
            opacity: 0;
            transform: translateY(8px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
