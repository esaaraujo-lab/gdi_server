"use client";

import {
  Truck,
  ShieldCheck,
  Sparkles,
  Award,
  RefreshCw,
  HeadphonesIcon,
  CreditCard,
  Package,
} from "lucide-react";
import { useContentStore } from "@/lib/content-store";

/**
 * Trust Badges — faixa horizontal com selos de confiança.
 * Mostra garantias e diferenciais da loja:
 *  - Frete grátis (acima de R$ 100)
 *  - Pix seguro (OpenFinance)
 *  - Originais importados
 *  - Fixação garantida (até 8h)
 *  - Troca fácil
 *  - Suporte WhatsApp
 *
 * Visual: grid horizontal com ícones + texto curto, hover lift.
 */

const BADGES: Badge[] = [
  {
    icon: Truck,
    title: "Frete Grátis",
    desc: "Acima de R$ 100 + retirada na loja",
    color: "text-emerald-400",
    contentKey: "trustBadge1",
  },
  {
    icon: ShieldCheck,
    title: "Pix Seguro",
    desc: "Pagamento via OpenFinance",
    color: "text-gold-400",
    contentKey: "trustBadge2",
  },
  {
    icon: Award,
    title: "Originais Importados",
    desc: "Marcas e árabes genuínos",
    color: "text-purple-400",
    contentKey: "trustBadge3",
  },
  {
    icon: Sparkles,
    title: "Fixação Garantida",
    desc: "Até 8h de duração",
    color: "text-amber-400",
    contentKey: "trustBadge4",
  },
  {
    icon: RefreshCw,
    title: "Troca Fácil",
    desc: "7 dias para troca ou devolução",
    color: "text-rose-400",
    contentKey: "trustBadge5",
  },
  {
    icon: HeadphonesIcon,
    title: "Suporte WhatsApp",
    desc: "Atendimento humano e direto",
    color: "text-cyan-400",
    contentKey: "trustBadge6",
  },
];

interface Badge {
  icon: typeof Truck;
  title: string;
  desc: string;
  color: string;
  contentKey: string;
}

export default function TrustBadges() {
  const content = useContentStore();
  return (
    <section
      id="trustBadgesSection"
      className="py-8 px-4 sm:px-8 border-b border-gold-500/10 bg-obsidian-950 relative overflow-hidden"
    >
      {/* Aura decorativa */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-32 bg-gold-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="text-center mb-5">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold-500/10 border border-gold-500/30 text-[10px] uppercase tracking-[0.2em] text-gold-300 font-bold">
            <ShieldCheck size={11} /> Compre com Confiança
          </span>
          <h3 className="font-serif-luxury text-lg sm:text-xl font-bold text-white mt-2">
            {content.trustSectionTitle}
          </h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {BADGES.map((badge, i) => {
            const Icon = badge.icon;
            return (
              <div
                key={badge.title}
                className="group glass-panel rounded-xl p-3 border border-gold-500/15 hover:border-gold-500/40 transition-all text-center hover:-translate-y-1 duration-300 cursor-default"
                style={{
                  animation: `badgeFadeIn 0.5s ease-out ${i * 0.05}s both`,
                }}
              >
                <div
                  className={`w-9 h-9 rounded-full bg-obsidian-900/80 border border-gold-500/20 flex items-center justify-center mx-auto mb-2 ${badge.color} group-hover:scale-110 transition-transform`}
                >
                  <Icon size={16} />
                </div>
                <h4 className="text-[11px] font-bold text-white mb-0.5 leading-tight">
                  {content[`${badge.contentKey}Title` as keyof typeof content] || badge.title}
                </h4>
                <p className="text-[9px] text-gray-400 leading-tight">
                  {content[`${badge.contentKey}Desc` as keyof typeof content] || badge.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        @keyframes badgeFadeIn {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </section>
  );
}
