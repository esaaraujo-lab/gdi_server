"use client";

import { useState } from "react";
import {
  HelpCircle,
  ChevronDown,
  Truck,
  CreditCard,
  RefreshCw,
  Package,
  Clock,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";

/**
 * FAQ — seção de Perguntas Frequentes.
 * Accordion expansível com perguntas comuns sobre:
 *  - Pedidos e entregas
 *  - Pagamento (Pix)
 *  - Produtos (fixação, autenticidade)
 *  - Troca/devolução
 *  - Atendimento
 *
 * Visual: lista vertical, cada item expande/collapse com chevron animado.
 */

interface FAQItem {
  id: string;
  category: string;
  icon: typeof Truck;
  question: string;
  answer: string;
}

const FAQ_ITEMS: FAQItem[] = [
  {
    id: "entrega",
    category: "Entrega",
    icon: Truck,
    question: "Quanto tempo leva para chegar meu pedido?",
    answer:
      "Enviamos em até 24h úteis após confirmação do Pix. PAC: 3-5 dias úteis. SEDEX: 1 dia útil. Retirada na loja: liberado em 1h. Você pode combinar horário de retirada via WhatsApp.",
  },
  {
    id: "frete-gratis",
    category: "Frete",
    icon: Package,
    question: "Vocês oferecem frete grátis?",
    answer:
      "Sim! Acima de R$ 100 o frete é grátis em todo o Brasil (PAC). Também oferecemos retirada na loja sem custo — combine o horário conosco via WhatsApp após o pedido.",
  },
  {
    id: "pix",
    category: "Pagamento",
    icon: CreditCard,
    question: "Como funciona o pagamento via Pix?",
    answer:
      "Após finalizar o pedido, geramos um QR Code Pix + código Copia e Cola. Pague pelo seu banco em segundos. Após confirmar, você recebe um aviso no WhatsApp e a loja também é notificada automaticamente.",
  },
  {
    id: "fixacao",
    category: "Produtos",
    icon: Clock,
    question: "A fixação dos perfumes 25ml é igual aos originais?",
    answer:
      "Sim! Nossos Brand Collection 25ml têm até 25% de essência concentrada (vs 8-15% dos perfumes convencionais). Fixação de até 8h garantida. Os frascos são idênticos aos originais de tamanho convencional.",
  },
  {
    id: "autenticidade",
    category: "Produtos",
    icon: ShieldCheck,
    question: "Os perfumes são originais ou réplicas?",
    answer:
      "São perfumes autorais inspirados nas fragrâncias famosas (Brand Collection 25ml), miniaturas árabes originais (Afeer) e decantes 5ml dos perfumes de nicho. Essência concentrada de alta qualidade, frascos premium — não são réplicas piratas, são perfumes autorais equivalentes.",
  },
  {
    id: "troca",
    category: "Troca",
    icon: RefreshCw,
    question: "Posso trocar ou devolver se não gostar?",
    answer:
      "Sim! Você tem 7 dias corridos após receber para solicitar troca ou devolução. O perfume deve estar com pelo menos 80% do conteúdo. Entre em contato via WhatsApp para iniciarmos o processo.",
  },
  {
    id: "decante-promo",
    category: "Promoções",
    icon: Package,
    question: "Como funciona a promo 3 decantes por R$ 100?",
    answer:
      "Adicione 3 decantes 5ml ao carrinho e o sistema aplica o desconto automaticamente — você paga R$ 100 em vez de R$ 119,97 (economia de R$ 19,97). Pode misturar qualquer decante (Árabe, feminino, masculino, unissex).",
  },
  {
    id: "atendimento",
    category: "Atendimento",
    icon: MessageCircle,
    question: "Como falo com a loja se tiver dúvidas?",
    answer:
      "Atendemos via WhatsApp (botão flutuante verde no canto inferior direito). Horário: seg-sáb 9h às 19h. Respondermos em até 30min durante o horário comercial. Para pedidos urgentes, marque na mensagem que priorizamos.",
  },
];

export default function FAQSection() {
  const [openId, setOpenId] = useState<string | null>(FAQ_ITEMS[0].id);

  const toggle = (id: string) => {
    setOpenId((current) => (current === id ? null : id));
  };

  return (
    <section
      id="faqSection"
      className="py-12 px-4 sm:px-8 border-t border-gold-500/10 max-w-4xl mx-auto"
    >
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold-500/10 border border-gold-500/30 text-[10px] uppercase tracking-[0.2em] text-gold-300 font-bold mb-3">
          <HelpCircle size={11} /> Perguntas Frequentes
        </div>
        <h3 className="font-serif-luxury text-2xl sm:text-3xl font-bold text-white">
          Tire suas dúvidas
        </h3>
        <p className="text-xs text-gray-400 mt-1.5 max-w-xl mx-auto">
          As perguntas mais comuns sobre pedidos, entrega, pagamento e
          produtos. Não encontrou? Fale com a gente no WhatsApp.
        </p>
      </div>

      <div className="space-y-2.5">
        {FAQ_ITEMS.map((item, i) => {
          const isOpen = openId === item.id;
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              className={`glass-panel rounded-xl border transition-all overflow-hidden ${
                isOpen
                  ? "border-gold-400/40 shadow-lg shadow-gold-500/10"
                  : "border-gold-500/15 hover:border-gold-500/30"
              }`}
              style={{
                animation: `faqFadeIn 0.4s ease-out ${i * 0.04}s both`,
              }}
            >
              <button
                onClick={() => toggle(item.id)}
                className="w-full flex items-center gap-3 p-3.5 text-left group"
                aria-expanded={isOpen}
              >
                <div
                  className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 transition-all ${
                    isOpen
                      ? "bg-gold-500/15 border-gold-500/40 text-gold-300"
                      : "bg-obsidian-900/60 border-gold-500/20 text-gold-400/70 group-hover:text-gold-300"
                  }`}
                >
                  <Icon size={14} />
                </div>
                <div className="flex-grow min-w-0">
                  <span className="text-[10px] uppercase tracking-wider text-gold-300/70 font-bold block">
                    {item.category}
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-white leading-snug">
                    {item.question}
                  </span>
                </div>
                <ChevronDown
                  size={18}
                  className={`shrink-0 text-gold-300 transition-transform duration-300 ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                }`}
              >
                <p className="text-xs text-gray-300 leading-relaxed px-3.5 pb-3.5 pl-14">
                  {item.answer}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* CTA WhatsApp */}
      <div className="text-center mt-6 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
        <p className="text-xs text-gray-300 mb-2">
          Ainda tem dúvidas? Fale conosco direto no WhatsApp.
        </p>
        <a
          href="https://wa.me/5511958546078?text=Ol%C3%A1!%20Tenho%20uma%20d%C3%BAvida%20sobre%20a%20Mimi%20Mimos"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider transition-all hover:scale-105"
        >
          <MessageCircle size={13} />
          Falar no WhatsApp
        </a>
      </div>

      <style>{`
        @keyframes faqFadeIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </section>
  );
}
