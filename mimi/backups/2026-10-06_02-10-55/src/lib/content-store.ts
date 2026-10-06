"use client";

import { create } from "zustand";
// persist middleware removed — D1 is the source of truth for content.
// Content is always fetched fresh from D1 on mount via syncContentFromD1().

/**
 * Content Store — 53+ fields editáveis via painel admin.
 *
 * Todos os campos têm um default. O admin pode editar via AdminPanel (tab
 * "Conteúdo"). Quando um campo muda, é gravado em localStorage (instantâneo
 * para o usuário) E enviado fire-and-forget para /api/db/content (D1) para
 * sincronizar entre dispositivos.
 *
 * syncContentFromD1() é chamado no mount da homepage para puxar os valores
 * mais recentes do D1 (single source of truth na produção).
 */

// 53+ fields (alphabetical-ish by section)
export interface ContentFields {
  // Hero
  heroBadge: string;
  heroTitleLine1: string;
  heroTitleLine2: string;
  heroDescription: string;
  heroPriceLabel: string;
  heroCtaText: string;

  // Seasonal banner
  seasonalTitle: string;
  seasonalDesc: string;
  seasonalCtaText: string;

  // Trust section
  trustSectionTitle: string;
  trustBadge1Title: string;
  trustBadge1Desc: string;
  trustBadge2Title: string;
  trustBadge2Desc: string;
  trustBadge3Title: string;
  trustBadge3Desc: string;
  trustBadge4Title: string;
  trustBadge4Desc: string;
  trustBadge5Title: string;
  trustBadge5Desc: string;
  trustBadge6Title: string;
  trustBadge6Desc: string;

  // FAQ
  faqTitle: string;
  faqDescription: string;

  // Newsletter
  newsletterTitle: string;
  newsletterDescription: string;
  newsletterBadge: string;

  // Fixation section
  fixationText: string;
  fixationDesc: string;

  // Cart drawer
  cartTitle: string;
  cartEmpty: string;
  cartCtaText: string;
  cartCustomerDataLabel: string;
  cartShippingLabel: string;
  cartCouponLabel: string;
  cartGiftWrapTitle: string;
  cartGiftWrapDesc: string;
  cartSubtotalLabel: string;
  cartShippingLabel2: string;
  cartTotalLabel: string;
  cartYouSaveLabel: string;

  // Pix modal
  pixTitle: string;
  pixSubtitle: string;
  pixSummaryLabel: string;
  pixTotalLabel: string;
  pixCtaText: string;
  pixCtaDesc: string;
  pixCopyLabel: string;
  pixCopyBtn: string;
  pixCopiedBtn: string;
  pixWaitingText: string;

  // Announcement bar + urgency
  announcementText: string;
  urgencyTimerEnabled: boolean;
  urgencyTimerHours: number;
}

export const DEFAULT_CONTENT: ContentFields = {
  heroBadge: "Brand Collection 25ml",
  heroTitleLine1: "Mimi Mimos",
  heroTitleLine2: "Haute Parfumerie",
  heroDescription:
    "Catálogo exclusivo de perfumes importados e árabes Brand Collection 25ml. O luxo das melhores fragrâncias do mundo na palma da sua mão.",
  heroPriceLabel: "a partir de",
  heroCtaText: "Ver Catálogo",

  seasonalTitle: "Promoção Combo Decantes",
  seasonalDesc: "3 decantes árabes por apenas R$ 100 (economize R$ 19,97)",
  seasonalCtaText: "Ver Decantes",

  trustSectionTitle: "Por que comprar na Mimi Mimos?",
  trustBadge1Title: "Frete Grátis",
  trustBadge1Desc: "Em pedidos acima de R$ 199 para todo o Brasil",
  trustBadge2Title: "Pix Seguro",
  trustBadge2Desc: "Pagamento via QR Code com confirmação imediata",
  trustBadge3Title: "Embrulho Presente",
  trustBadge3Desc: "Embalagem luxuosa gratuita em pedidos selecionados",
  trustBadge4Title: "Produtos Autênticos",
  trustBadge4Desc: "Importados direto da fábrica com nota fiscal",
  trustBadge5Title: "Troca Garantida",
  trustBadge5Desc: "7 dias para troca ou devolução sem custos",
  trustBadge6Title: "Atendimento WhatsApp",
  trustBadge6Desc: "Suporte humano de segunda a sábado, 9h às 19h",

  faqTitle: "Perguntas Frequentes",
  faqDescription:
    "Tudo o que você precisa saber antes de comprar na Mimi Mimos",

  newsletterTitle: "Receba Novidades & Cupons Exclusivos",
  newsletterDescription:
    "Inscreva-se para receber promoções exclusivas (Black Friday, Dia das Mães, Natal), avisos de reposição de estoque e cupons especiais para inscritos. Sem spam — só luxo. 💛",
  newsletterBadge: "Clube Mimi Mimos",

  fixationText: "Alta Fixação",
  fixationDesc:
    "Nossos perfumes são formulados em Extrait de Parfum (20-30% de óleos essenciais), garantindo fixação de 8h a 12h na pele.",

  cartTitle: "Sua Sacola de Luxo",
  cartEmpty: "Sua sacola está vazia",
  cartCtaText: "Finalizar Compra",
  cartCustomerDataLabel: "Seus dados",
  cartShippingLabel: "Calcular frete",
  cartCouponLabel: "Cupom de desconto",
  cartGiftWrapTitle: "Embrulho para presente",
  cartGiftWrapDesc: "Embalagem luxuosa com cartão personalizado (+R$ 5,00)",
  cartSubtotalLabel: "Subtotal",
  cartShippingLabel2: "Frete",
  cartTotalLabel: "Total",
  cartYouSaveLabel: "Você economiza",

  pixTitle: "Pague com Pix",
  pixSubtitle: "Escaneie o QR Code ou use o Copia e Cola abaixo",
  pixSummaryLabel: "Resumo do pedido",
  pixTotalLabel: "Total a pagar",
  pixCtaText: "Já fiz o Pix",
  pixCtaDesc: "Toque para confirmar e avisar a loja via WhatsApp",
  pixCopyLabel: "Pix Copia e Cola",
  pixCopyBtn: "Copiar",
  pixCopiedBtn: "Copiado!",
  pixWaitingText: "Aguardando confirmação do pagamento...",

  announcementText:
    "Mimi Mimos • Perfumaria Árabe & Importados (Brand Collection 25ml)",
  urgencyTimerEnabled: false,
  urgencyTimerHours: 6,
};

interface ContentStoreState extends ContentFields {
  /** Update a single field — saves to localStorage + POSTs to D1 (fire-and-forget). */
  updateField: <K extends keyof ContentFields>(key: K, value: ContentFields[K]) => void;
  /** Bulk replace fields (used by syncContentFromD1). */
  setFields: (fields: Partial<ContentFields>) => void;
  /** Pull content from D1 — GET /api/db/content. */
  syncContentFromD1: () => Promise<void>;
  /** Reset to defaults — clears localStorage + DELETE /api/db/content. */
  resetAll: () => Promise<void>;
}

export const useContentStore = create<ContentStoreState>()(
  (set, get) => ({
      ...DEFAULT_CONTENT,

      updateField: (key, value) => {
        set({ [key]: value } as Partial<ContentFields>);
        // Fire-and-forget D1 sync
        void fetch("/api/db/content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, value: String(value) }),
        }).catch(() => {});
      },

      setFields: (fields) => set(fields),

      syncContentFromD1: async () => {
        try {
          const res = await fetch("/api/db/content", { method: "GET" });
          if (!res.ok) return;
          const data = await res.json();
          if (!data?.success || !data?.content) return;
          const content = data.content as Record<string, string>;
          // Map D1 rows → ContentFields (only known keys, parse booleans/numbers)
          const updates: Partial<ContentFields> = {};
          const defaults = DEFAULT_CONTENT;
          (Object.keys(defaults) as (keyof ContentFields)[]).forEach((key) => {
            const raw = content[key];
            if (raw === undefined) return;
            const currentDefault = defaults[key];
            if (typeof currentDefault === "boolean") {
              (updates as Record<string, unknown>)[key] = raw === "true" || raw === "1";
            } else if (typeof currentDefault === "number") {
              const n = Number(raw);
              if (!Number.isNaN(n)) (updates as Record<string, unknown>)[key] = n;
            } else {
              (updates as Record<string, unknown>)[key] = raw;
            }
          });
          if (Object.keys(updates).length > 0) {
            set(updates);
          }
        } catch {
          // silent
        }
      },

      resetAll: async () => {
        set({ ...DEFAULT_CONTENT });
        void fetch("/api/db/content", { method: "DELETE" }).catch(() => {});
      },
    })
);

/** Convenience standalone function for sync (used in page.tsx effects). */
export function syncContentFromD1(): Promise<void> {
  return useContentStore.getState().syncContentFromD1();
}
