"use client";

import { useStore } from "@/lib/stores-combined";
import { formatBRL } from "@/lib/pix";
import { Sparkles, Clock, Gem, QrCode, Droplets, ArrowDown } from "lucide-react";

interface Feature {
  icon: typeof Droplets;
  title: string;
  desc: string;
  scrollTo?: string;
}

const features: Feature[] = [
  {
    icon: Droplets,
    title: "25ml Brand Collection",
    desc: "Frasco de vidro importado",
  },
  {
    icon: Clock,
    title: "Fixação 8h a 12h",
    desc: "Essência concentrada EDP — clique para dicas",
    scrollTo: "howToUseSection",
  },
  {
    icon: Gem,
    title: "Importados & Árabes",
    desc: "Principais grifes mundiais",
  },
  {
    icon: QrCode,
    title: "Pix Instantâneo",
    desc: "Pagamento com desconto",
  },
];

export default function Hero() {
  const globalDefaultPrice = useStore((s) => s.globalDefaultPrice);
  const products = useStore((s) => s.products);
  const productCount = products.length;
  const avgRating = productCount > 0
    ? (products.reduce((acc, p) => acc + (p.rating || 0), 0) / productCount).toFixed(1)
    : "4.8";

  return (
    <section
      id="heroSection"
      className="relative pt-12 pb-16 px-4 sm:px-8 golden-aura overflow-hidden border-b border-gold-500/10"
    >
      <div className="absolute top-10 left-1/2 -translate-x-1/2 w-96 h-96 bg-gold-500/10 rounded-full blur-3xl pointer-events-none animate-pulse-glow" />
      <div className="absolute top-32 right-10 w-40 h-40 bg-gold-400/8 rounded-full blur-3xl pointer-events-none animate-float-drift hidden md:block" />
      <div className="absolute bottom-0 left-10 w-32 h-32 bg-gold-300/6 rounded-full blur-3xl pointer-events-none animate-float-drift hidden md:block" />

      <div className="max-w-5xl mx-auto text-center relative z-10 flex flex-col items-center">
        <span className="inline-flex items-center gap-2 px-4 py-1 rounded-full border border-gold-500/30 bg-gold-500/10 text-gold-300 text-xs font-medium uppercase tracking-widest mb-6 animate-in fade-in slide-in-from-top-4 duration-700">
          <Sparkles className="text-gold-400" size={14} />
          Frascos de Bolso 25ml • Alta Fixação
        </span>

        <h1 className="font-serif-luxury text-4xl sm:text-6xl md:text-7xl font-bold tracking-tight text-white mb-6 leading-tight animate-in fade-in slide-in-from-bottom-4 duration-700">
          A Essência do Luxo em <br />
          <span className="gold-shimmer-text">Edição de Bolso 25ml</span>
        </h1>

        <p className="text-sm sm:text-base text-gray-300 max-w-2xl font-light mb-8 leading-relaxed animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
          Explore nossa curadoria exclusiva de fragrâncias{" "}
          <strong className="text-gold-300 font-medium">Brand Collection</strong>.
          Perfumes importados e árabes com frascos idênticos aos de tamanho
          convencional, formulados com até 25% de essência concentrada.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
          <div className="glass-panel-gold px-6 py-3 rounded-2xl flex items-center gap-3 hover:scale-105 transition-transform duration-300">
            <span className="text-xs uppercase text-gold-300 tracking-wider">
              Valor Único Promocional
            </span>
            <div className="h-4 w-px bg-gold-500/30" />
            <span className="font-serif-luxury text-2xl font-bold text-gold-400">
              {formatBRL(globalDefaultPrice)}
            </span>
          </div>

          <a
            href="#catalogSection"
            className="btn-gold px-8 py-3.5 rounded-full text-xs uppercase tracking-widest flex items-center gap-3 hover:scale-105 transition-transform duration-300 shadow-lg shadow-gold-500/30"
          >
            <span>Explorar Catálogo</span>
            <ArrowDown size={14} />
          </a>
        </div>

        {/* Feature Highlights — clickable if scrollTo is set */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-4xl text-left pt-6 border-t border-gold-500/10">
          {features.map((f) => {
            const Component = f.icon;
            const isClickable = !!f.scrollTo;
            return (
              <button
                key={f.title}
                onClick={() => {
                  if (f.scrollTo) {
                    document.getElementById(f.scrollTo)?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }
                }}
                disabled={!isClickable}
                className={`flex items-center gap-3 p-3 rounded-xl bg-obsidian-800/40 border border-gold-500/10 transition-colors text-left ${
                  isClickable
                    ? "hover:border-gold-500/40 hover:bg-gold-500/5 cursor-pointer"
                    : "cursor-default"
                }`}
              >
                <Component className="text-gold-400 text-xl shrink-0" size={22} />
                <div>
                  <h4 className="text-xs font-semibold text-gray-200">{f.title}</h4>
                  <p className="text-[10px] text-gray-400">{f.desc}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Stats counter */}
        <div className="grid grid-cols-3 gap-4 w-full max-w-3xl mt-8 pt-6 border-t border-gold-500/10">
          {[
            { value: `+${productCount}`, label: "Fragrâncias em Curadoria" },
            { value: `${avgRating}★`, label: "Avaliação Média" },
            { value: "+1.5k", label: "Clientes Encantados" },
          ].map((s) => (
            <div key={s.label} className="text-center px-2">
              <div className="font-serif-luxury text-2xl md:text-4xl font-bold gold-shimmer-text">
                {s.value}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-gray-400 mt-1">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
