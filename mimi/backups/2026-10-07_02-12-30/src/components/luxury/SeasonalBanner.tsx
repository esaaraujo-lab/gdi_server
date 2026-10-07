"use client";

import { useUI } from "@/lib/stores-combined";
import { Gift, Heart, Sparkles, Crown, Calendar, Check } from "lucide-react";

interface Season {
  title: string;
  desc: string;
  icon: typeof Gift;
  color: string;
  badge: string;
  cta: string;
  filter?: string;
}

function getSeason(month: number, day: number): Season {
  if (month === 10 && day >= 20)
    return { title: "Black Friday Mimi Mimos", desc: "Até 30% OFF em Brand Collection + Miniatura grátis a cada R$ 200", icon: Sparkles, color: "from-red-900/40 via-gold-600/30 to-red-900/40", badge: "BLACK FRIDAY", cta: "Aproveitar Ofertas" };
  if (month === 11)
    return { title: "Natal Mimi Mimos 🎄", desc: "Kit presente: 3 decantes + embalagem natalina por R$ 120", icon: Gift, color: "from-emerald-900/40 via-red-800/30 to-emerald-900/40", badge: "NATAL", cta: "Montar Kit Presente" };
  if (month === 4)
    return { title: "Dia das Mães 💐", desc: "Miniaturas femininas em destaque + embalagem presente grátis", icon: Heart, color: "from-pink-900/40 via-rose-700/30 to-pink-900/40", badge: "DIA DAS MÃES", cta: "Presentear Mãe", filter: "FEMININO" };
  if (month === 5)
    return { title: "Dia dos Namorados 💕", desc: "Combo Casal: 2 perfumes (1 feminino + 1 masculino) por R$ 129", icon: Heart, color: "from-rose-900/40 via-pink-700/30 to-rose-900/40", badge: "NAMORADOS", cta: "Ver Combo Casal" };
  if (month === 2 || (month === 3 && day <= 15))
    return { title: "Páscoa Mimi Mimos 🐰", desc: "Miniatura grátis a cada Brand Collection comprado", icon: Gift, color: "from-amber-900/40 via-yellow-700/30 to-amber-900/40", badge: "PÁSCOA", cta: "Aproveitar" };
  return { title: "Promoção Combo Decantes", desc: "3 decantes árabes por apenas R$ 100 (economize R$ 19,97)", icon: Crown, color: "from-gold-800/40 via-gold-600/30 to-gold-800/40", badge: "COMBO", cta: "Ver Decantes", filter: "DECANTE" };
}

export default function SeasonalBanner() {
  const now = new Date();
  const month = now.getMonth();
  const day = now.getDate();
  const season = getSeason(month, day);
  const setActiveCategory = useUI((s) => s.setActiveCategory);
  const setCartOpen = useUI((s) => s.setCartOpen);

  const handleCta = () => {
    if (season.filter) {
      setActiveCategory(season.filter);
    }
    setTimeout(() => {
      document.getElementById("catalogSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  return (
    <section className="py-6 px-4 sm:px-8 max-w-7xl mx-auto">
      {/* Banner sazonal */}
      <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-r ${season.color} border border-gold-500/30 p-6 sm:p-8 mb-4`}>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gold-500/20 border border-gold-500/40 flex items-center justify-center text-gold-300 shrink-0">
              <season.icon size={28} />
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-widest font-bold text-gold-300 bg-gold-500/15 border border-gold-500/30 px-2 py-0.5 rounded-full">
                {season.badge}
              </span>
              <h3 className="font-serif-luxury text-xl sm:text-2xl font-bold text-white mt-1">
                {season.title}
              </h3>
              <p className="text-xs text-gray-200 mt-0.5 max-w-md">
                {season.desc}
              </p>
            </div>
          </div>
          <button
            onClick={handleCta}
            className="btn-gold px-6 py-2.5 rounded-full text-xs uppercase tracking-widest whitespace-nowrap shrink-0"
          >
            {season.cta}
          </button>
        </div>
        <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-gold-500/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Banner de Assinatura Anual */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-gold-600/30 via-gold-500/20 to-gold-600/30 border border-gold-500/40 p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gold-500/30 border-2 border-gold-400/50 flex items-center justify-center text-gold-300 shrink-0">
              <Crown size={28} />
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-widest font-bold text-gold-300 bg-gold-500/20 border border-gold-500/40 px-2 py-0.5 rounded-full flex items-center gap-1 w-fit">
                <Calendar size={10} /> ASSINATURA VIP
              </span>
              <h3 className="font-serif-luxury text-xl sm:text-2xl font-bold text-white mt-1">
                Clube Mimi Mimos — 12 Miniaturas/Ano
              </h3>
              <p className="text-xs text-gray-200 mt-0.5 max-w-md">
                Receba 1 miniatura árabe todo mês. Plano anual:{" "}
                <strong className="text-gold-300">
                  R$ 599,99/ano (R$ 59,99/mês)
                </strong>{" "}
                — pagamento único via Pix, à vista.
              </p>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-[10px] text-emerald-300 flex items-center gap-1">
                  <Check size={10} /> Economize R$ 159,89/ano
                </span>
                <span className="text-[10px] text-emerald-300 flex items-center gap-1">
                  <Check size={10} /> 12 miniaturas premium
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              // Adiciona produto de assinatura ao carrinho e abre checkout Pix
              setCartOpen(true);
            }}
            className="btn-gold px-6 py-2.5 rounded-full text-xs uppercase tracking-widest whitespace-nowrap shrink-0"
          >
            Assinar por R$ 599,99
          </button>
        </div>
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-gold-400/15 rounded-full blur-3xl pointer-events-none" />
      </div>
    </section>
  );
}
