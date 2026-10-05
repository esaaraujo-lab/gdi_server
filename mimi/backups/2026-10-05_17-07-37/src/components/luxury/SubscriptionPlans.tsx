"use client";

import { useState } from "react";
import { formatBRL } from "@/lib/pix";
import { useStore } from "@/lib/stores-combined";
import { Crown, Check, Calendar, Sparkles, Gift, Zap, X, ShieldCheck, Clock, RotateCcw } from "lucide-react";
import { toast } from "sonner";

const PLANS = [
  {
    id: "monthly",
    name: "Mensal",
    price: 69.99,
    period: "/mês",
    monthlyPrice: 69.99,
    description: "1 miniatura árabe todo mês com cobrança automática Pix",
    features: [
      "1 miniatura premium por mês",
      "Cobrança automática via Pix Recorrente",
      "Frete grátis",
      "Cancele quando quiser no app do banco",
    ],
    badge: null as string | null,
    color: "from-gold-600/20 to-gold-500/10",
    recurring: true,
  },
  {
    id: "quarterly",
    name: "Trimestral",
    price: 189.99,
    period: "/trimestre",
    monthlyPrice: 63.33,
    description: "3 miniaturas a cada 3 meses (economize R$ 20)",
    features: [
      "3 miniaturas premium por trimestre",
      "Cobrança automática via Pix Recorrente",
      "Frete grátis",
      "Brinde surpresa a cada ciclo",
      "Economize R$ 20",
    ],
    badge: "POPULAR",
    color: "from-gold-500/30 to-gold-400/15",
    recurring: true,
  },
  {
    id: "annual",
    name: "Anual VIP",
    price: 599.99,
    period: "/ano",
    monthlyPrice: 49.99,
    description: "12 miniaturas — pagamento único via Pix (R$ 49,99/mês)",
    features: [
      "12 miniaturas premium (1 por mês)",
      "Pagamento único — sem recorrência",
      "Frete grátis o ano todo",
      "Brindes exclusivos VIP",
      "Acesso prioritário a lançamentos",
      "Desconto de 15% na loja inteira",
      "Economize R$ 239,89",
    ],
    badge: "MELHOR VALOR",
    color: "from-gold-400/30 to-gold-300/15",
    recurring: false,
  },
];

export default function SubscriptionPlans() {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pixModal, setPixModal] = useState<{
    open: boolean;
    qrUrl: string;
    code: string;
    amount: number;
    planName: string;
    recurring: boolean;
    nextBilling: string;
  } | null>(null);
  const pixConfig = useStore((s) => s.pixConfig);

  const handleSubscribe = async (planId: string) => {
    const plan = PLANS.find((p) => p.id === planId);
    if (!plan) return;

    setSelectedPlan(planId);
    setLoading(true);
    toast.success(`Plano ${plan.name} selecionado! Gerando cobrança Pix...`);

    try {
      const res = await fetch("/api/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          amount: plan.price,
          config: pixConfig,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setPixModal({
          open: true,
          qrUrl: data.pix.qrUrl,
          code: data.pix.code,
          amount: data.pix.amount,
          planName: plan.name,
          recurring: data.pix.recurring,
          nextBilling: data.pix.nextBillingDate,
        });
        toast.success("Pix gerado! Escaneie o QR Code para ativar a assinatura.");
      } else {
        throw new Error(data.error || "Erro ao gerar Pix");
      }
    } catch {
      toast.error("Erro ao gerar cobrança. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const copyCode = async () => {
    if (!pixModal) return;
    try {
      await navigator.clipboard.writeText(pixModal.code);
      toast.success("Código Pix copiado!");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  return (
    <>
      <section
        id="subscriptionSection"
        className="py-12 px-4 sm:px-8 max-w-7xl mx-auto border-t border-gold-500/10 scroll-mt-20"
      >
        <div className="text-center mb-8">
          <span className="inline-flex items-center gap-2 px-4 py-1 rounded-full border border-gold-400/40 bg-gold-500/20 text-gold-200 text-xs font-bold uppercase tracking-widest mb-3">
            <Crown className="text-gold-300" size={14} />
            Clube Mimi Mimos VIP
          </span>
          <h3 className="font-serif-luxury text-3xl font-bold text-white mb-2">
            Assinatura com Pix Automático
          </h3>
          <p className="text-xs text-gray-400 max-w-2xl mx-auto">
            Receba miniaturas árabes premium todo mês. Cobrança automática via Pix
            Recorrente (OpenFinance). Cancele quando quiser. Sem fidelidade.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative overflow-hidden rounded-3xl bg-gradient-to-b ${plan.color} border ${
                plan.badge ? "border-gold-400/50" : "border-gold-500/20"
              } p-6 flex flex-col transition-all hover:-translate-y-1 ${
                selectedPlan === plan.id ? "ring-2 ring-gold-400" : ""
              }`}
            >
              {plan.badge && (
                <div className="absolute top-4 right-4">
                  <span className="text-[9px] uppercase tracking-widest font-bold bg-gold-500 text-obsidian-950 px-2 py-1 rounded-full">
                    {plan.badge}
                  </span>
                </div>
              )}

              <div className="mb-4">
                <h4 className="font-serif-luxury text-xl font-bold text-white">
                  {plan.name}
                </h4>
                <p className="text-[11px] text-gray-300 mt-1">{plan.description}</p>
              </div>

              <div className="mb-4">
                <span className="font-serif-luxury text-3xl font-bold text-gold-400">
                  {formatBRL(plan.price)}
                </span>
                <span className="text-xs text-gray-400">{plan.period}</span>
                {plan.recurring && (
                  <div className="mt-1 flex items-center gap-1">
                    <RotateCcw size={11} className="text-emerald-400" />
                    <span className="text-[10px] text-emerald-300">
                      Cobrança automática mensal
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-2 mb-6 flex-grow">
                {plan.features.map((f, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Check size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                    <span className="text-[11px] text-gray-200">{f}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => handleSubscribe(plan.id)}
                disabled={loading && selectedPlan === plan.id}
                className={`w-full py-3 rounded-xl text-xs uppercase tracking-widest font-bold transition-all flex items-center justify-center gap-2 ${
                  plan.badge
                    ? "btn-gold"
                    : "bg-gold-500/10 hover:bg-gold-500/20 border border-gold-500/30 text-gold-300"
                } ${loading && selectedPlan === plan.id ? "opacity-60" : ""}`}
              >
                {loading && selectedPlan === plan.id ? (
                  <>
                    <Clock size={14} className="animate-spin" />
                    Gerando Pix...
                  </>
                ) : plan.recurring ? (
                  <>
                    <Zap size={14} />
                    Assinar com Pix Recorrente
                  </>
                ) : (
                  <>
                    <ShieldCheck size={14} />
                    Assinar com Pix Único
                  </>
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Como funciona */}
        <div className="mt-8 glass-panel rounded-2xl p-6 border border-gold-500/15">
          <h4 className="font-serif-luxury text-lg font-bold text-white mb-4 text-center">
            Como Funciona o Pix Recorrente
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {[
              { icon: Calendar, t: "1. Escolha o Plano", d: "Mensal ou trimestral com recorrência" },
              { icon: Zap, t: "2. Pague o 1º Pix", d: "Escaneie o QR Code para autorizar" },
              { icon: RotateCcw, t: "3. Cobrança Automática", d: "Debitado todo mês sem você fazer nada" },
              { icon: Sparkles, t: "4. Cancele Quando Quiser", d: "No app do seu banco, sem multa" },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <div className="w-10 h-10 rounded-xl bg-gold-500/15 border border-gold-500/30 flex items-center justify-center mx-auto mb-2 text-gold-400">
                  <s.icon size={18} />
                </div>
                <p className="text-[11px] font-bold text-white">{s.t}</p>
                <p className="text-[10px] text-gray-400">{s.d}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-gold-500/10 text-center">
            <p className="text-[10px] text-gray-500 flex items-center justify-center gap-2">
              <ShieldCheck size={12} className="text-emerald-400" />
              O Pix Recorrente usa o protocolo OpenFinance do Banco Central.
              Seu banco debita automaticamente após sua autorização.
              Você pode cancelar a qualquer momento no app do banco.
            </p>
          </div>
        </div>
      </section>

      {/* Modal de Pagamento da Assinatura */}
      {pixModal?.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="glass-panel max-w-lg w-full rounded-2xl p-6 relative border border-gold-500/40 shadow-2xl max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setPixModal(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3 border-b border-gold-500/20 pb-4 mb-5">
              <div className="w-10 h-10 rounded-xl bg-gold-500/15 border border-gold-500/30 flex items-center justify-center text-gold-400">
                <Crown size={20} />
              </div>
              <div>
                <h3 className="font-serif-luxury text-xl font-bold text-white">
                  Assinatura {pixModal.planName}
                </h3>
                <p className="text-[11px] text-gold-300 flex items-center gap-1">
                  <ShieldCheck size={12} />
                  {pixModal.recurring
                    ? "Pix Recorrente — OpenFinance"
                    : "Pagamento único via Pix"}
                </p>
              </div>
            </div>

            {/* Resumo */}
            <div className="bg-obsidian-900/80 rounded-xl p-3.5 border border-gold-500/10 mb-5 text-xs space-y-2">
              <div className="flex justify-between text-gray-300">
                <span>Plano:</span>
                <span className="font-bold text-white">{pixModal.planName}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Valor:</span>
                <span className="font-bold text-gold-400">{formatBRL(pixModal.amount)}</span>
              </div>
              {pixModal.recurring && (
                <>
                  <div className="flex justify-between text-gray-300">
                    <span>Próxima cobrança:</span>
                    <span className="font-bold text-emerald-400">{pixModal.nextBilling}</span>
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t border-gold-500/20">
                    <RotateCcw size={12} className="text-emerald-400" />
                    <span className="text-[10px] text-emerald-300">
                      Após o pagamento, o banco debitará automaticamente todo mês.
                      Cancele no app do banco quando quiser.
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* QR Code */}
            <div className="text-center space-y-4">
              <div className="p-3 bg-white rounded-2xl w-48 h-48 mx-auto flex items-center justify-center border-4 border-gold-500/30 shadow-xl">
                <img src={pixModal.qrUrl} alt="QR Code Pix Assinatura" className="w-full h-full object-contain" />
              </div>

              {/* Pix Copia e Cola */}
              <div className="text-left space-y-1">
                <label className="text-[10px] uppercase text-gray-400 font-semibold tracking-wider">
                  Código Pix Copia e Cola:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={pixModal.code}
                    onFocus={(e) => e.target.select()}
                    className="w-full bg-obsidian-950 border border-gold-500/30 rounded-xl py-2 px-3 text-[11px] text-gray-300 truncate focus:outline-none"
                  />
                  <button
                    onClick={copyCode}
                    className="btn-gold px-4 py-2 rounded-xl text-xs whitespace-nowrap flex items-center gap-1.5"
                  >
                    Copiar
                  </button>
                </div>
              </div>

              {/* Aviso de recorrência */}
              {pixModal.recurring && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-left">
                  <div className="flex items-start gap-2">
                    <ShieldCheck size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[11px] font-bold text-emerald-300">
                        Autorização de Cobrança Automática
                      </p>
                      <p className="text-[10px] text-gray-300 mt-0.5">
                        Ao pagar este Pix, você autoriza o banco a debitar
                        automaticamente o valor mensal. Você receberá uma
                        notificação antes de cada cobrança e pode cancelar
                        a qualquer momento no app do seu banco.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  window.open(
                    `https://wa.me/5511970111433?text=${encodeURIComponent(
                      `*ASSINATURA ${pixModal.planName} - CLUBE MIMI MIMOS*\n\n` +
                        `Valor: ${formatBRL(pixModal.amount)}\n` +
                        (pixModal.recurring ? `Recorrência: Mensal automática\nPróxima cobrança: ${pixModal.nextBilling}\n` : "") +
                        `Status: Pagamento realizado via Pix`
                    )}`,
                    "_blank"
                  );
                  setPixModal(null);
                  toast.success("Assinatura confirmada! Loja avisada via WhatsApp.");
                }}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
              >
                <Check size={16} />
                Confirmar Pagamento e Ativar Assinatura
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
