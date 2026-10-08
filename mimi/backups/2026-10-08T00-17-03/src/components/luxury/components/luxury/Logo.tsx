"use client";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showSubtitle?: boolean;
  subtitle?: string;
  className?: string;
}

const SIZES = {
  sm: { badge: "w-8 h-8", title: "text-sm md:text-lg", subtitle: "text-[8px]" },
  md: { badge: "w-10 h-10 md:w-16 md:h-16", title: "text-lg md:text-3xl", subtitle: "text-[9px]" },
  lg: { badge: "w-24 h-24", title: "text-3xl md:text-4xl", subtitle: "text-[11px]" },
  xl: { badge: "w-28 h-28", title: "text-4xl md:text-5xl", subtitle: "text-xs" },
};

/** Logo reutilizável: frasco de perfume (imagem processada) + texto MIMI MIMOS. */
export default function Logo({
  size = "md",
  showSubtitle = true,
  subtitle = "PERFUME STORE",
  className = "",
}: LogoProps) {
  const s = SIZES[size];
  return (
    <div className={`flex items-center gap-3 group ${className}`}>
      <div
        className={`${s.badge} rounded-full border-2 border-gold-500/50 flex items-center justify-center bg-obsidian-900/80 group-hover:border-gold-400 group-hover:shadow-lg group-hover:shadow-gold-500/30 transition-all overflow-hidden shrink-0`}
      >
        <img
          src="/logo-bottle.png"
          alt="Mimi Mimos — frasco de perfume"
          className="w-full h-full object-cover scale-[1.6]"
        />
      </div>
      <div className="flex flex-col">
        <span
          className={`font-serif-luxury ${s.title} font-bold tracking-wider gold-shimmer-text uppercase leading-none`}
        >
          <span className="md:hidden">MIMI</span>
          <span className="hidden md:inline">Mimi Mimos</span>
        </span>
        {showSubtitle && (
          <span
            className={`${s.subtitle} uppercase tracking-[0.25em] text-gold-300/70 mt-1 hidden md:block`}
          >
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}
