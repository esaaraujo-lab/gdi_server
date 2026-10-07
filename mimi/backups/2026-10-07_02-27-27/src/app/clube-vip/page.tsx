"use client";

import { useState } from "react";
import { Crown, Sparkles, Gift, Check, Loader2 } from "lucide-react";
import { formatBRL } from "@/lib/pix";
import { toast } from "sonner";

const PLANS = [
  {
    id: "mensal",
    name: "Mensal",
    price: 69.99,
    period: "mês",
    description: "1 perfume Brand Collection 25ml por mês",
    features: [
      "1 perfume 25ml por mês",
      "Frete grátis em todo Brasil",
      "Acesso antecipado a lançamentos",
      "Cupom exclusivo de 10% OFF",
    ],
    badge: "",
    highlighted: false,
  },
  {
    id: "trimestral",
    name: "Trimestral",
    price: 189.99,
    period: "trimestre",
    description: "3 perfumes + 1 decante grátis por trimestre",
    features: [
      "3 perfumes 25ml por trimestre",
      "1 decante 5ml grátis (brinde)",
      "Frete grátis em todo Brasil",
      "Acesso antecipado a lançamentos",
      "Cupom exclusivo de 15% OFF",
    ],
    badge: "Mais Popular",
    highlighted: true,
  },
  {
    id: "anual",
    name: "Anual",
    price: 599.99,
    period: "ano",
    description: "12 perfumes + kit exclusivo de presentes",
    features: [
      "12 perfumes 25ml por ano",
      "Kit exclusivo com 3 decantes grátis",
      "Embrulho de presente gratuito",
      "Frete grátis em todo Brasil",
      "Acesso VIP a eventos exclusivos",
      "Cupom exclusivo de 20% OFF",
    ],
    badge: "Melhor Valor",
    highlighted: false,
  },
];

export default function ClubeVIPPage() {
  const [loading, setLoading] = useState<string | null>(null);

  const handleSubscribe = async (planId: string) => {
    setLoading(planId);
    try {
      const res = await fetch("/api/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: planId,
          customerName: "",
          customerPhone: "",
        }),
      });
      const data = await res.json();
      if (data?.success) {
        toast.success("Assinatura solicitada! Você será redirecionado para o WhatsApp.");
        if (data.storeWa) {
          window.open(data.storeWa, "_blank");
        }
      } else {
        toast.error("Erro ao solicitar assinatura. Tente novamente.");
      }
    } catch {
      toast.error("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-obsidian-950 text-white py-16 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center gap-2 mb-4 px-4 py-1.5 rounded-full bg-gold-500/15 border border-gold-500/30">
            <Crown size={16} className="text-gold-400" />
            <span className="text-xs uppercase tracking-[0.2em] text-gold-200 font-bold">
              Clube Mimi Mimos VIP
            </span>
          </div>
          <h1 className="font-serif-luxury text-4xl md:text-5xl font-bold text-white mb-4">
            Receba perfumes premium todo mês
          </h1>
          <p className="text-sm text-gray-400 max-w-xl mx-auto">
            Assine o Clube Mimi Mimos e receba fragrâncias importadas e árabes
            selecionadas pela nossa curadoria, direto na sua porta. Cancele quando quiser.
          </p>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-2xl p-6 transition-all ${
                plan.highlighted
                  ? "bg-gradient-to-b from-gold-500/15 to-obsidian-900 border-2 border-gold-500/50 shadow-2xl shadow-gold-500/20"
                  : "bg-obsidian-900/60 border border-gold-500/15"
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-gold-500 to-amber-400 text-obsidian-950 text-[9px] uppercase tracking-wider font-bold px-3 py-1 rounded-full shadow-lg">
                  {plan.badge}
                </div>
              )}
              <h3 className="font-serif-luxury text-xl font-bold text-white mb-1">
                {plan.name}
              </h3>
              <p className="text-[11px] text-gray-400 mb-4">{plan.description}</p>
              <div className="mb-6">
                <span className="font-serif-luxury text-3xl font-bold text-gold-400">
                  {formatBRL(plan.price)}
                </span>
                <span className="text-xs text-gray-500 ml-1">/ {plan.period}</span>
              </div>
              <ul className="space-y-2 mb-6">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-xs text-gray-300">
                    <Check size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handleSubscribe(plan.id)}
                disabled={loading === plan.id}
                className={`w-full py-3 rounded-xl text-xs uppercase tracking-widest font-bold transition-all ${
                  plan.highlighted
                    ? "btn-gold hover:scale-[1.02]"
                    : "border border-gold-500/30 text-gold-300 hover:bg-gold-500/10"
                } disabled:opacity-50 flex items-center justify-center gap-2`}
              >
                {loading === plan.id ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <>
                    <Sparkles size={14} />
                    Assinar {plan.name}
                  </>
                )}
              </button>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto space-y-4">
          <h2 className="font-serif-luxury text-2xl font-bold text-white text-center mb-6">
            Perguntas Frequentes
          </h2>
          {[
            {
              q: "Como funciona o pagamento?",
              a: "Pagamento via Pix recorrente (OpenFinance). Você autoriza uma vez e o valor é debitado automaticamente todo mês.",
            },
            {
              q: "Posso cancelar quando quiser?",
              a: "Sim! Cancele a qualquer momento sem taxa. Sem fidelidade.",
            },
            {
              q: "Quando recebo meu perfume?",
              a: "Após o pagamento confirmado, seu perfume é enviado em até 3 dias úteis. Frete grátis para todo Brasil.",
            },
            {
              q: "Posso escolher o perfume?",
              a: "Sim! A cada ciclo você recebe uma curadoria de 3 opções e escolhe sua preferida.",
            },
          ].map((item) => (
            <div key={item.q} className="bg-obsidian-900/60 rounded-xl p-4 border border-gold-500/10">
              <p className="text-sm font-bold text-gold-300 mb-1">{item.q}</p>
              <p className="text-xs text-gray-400">{item.a}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center mt-12">
          <Gift size={32} className="mx-auto text-gold-400 mb-3" />
          <p className="text-sm text-gray-400 mb-4">
            Junte-se a dezenas de clientes que já recebem seus perfumes premium todo mês
          </p>
          <a
            href="/"
            className="inline-flex items-center gap-2 text-xs uppercase tracking-widest font-bold text-gold-300 hover:text-gold-200 transition-colors border border-gold-500/30 hover:border-gold-400/60 rounded-full px-6 py-2.5"
          >
            Voltar à Loja
          </a>
        </div>
      </div>
    </div>
  );
}
