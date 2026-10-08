"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Content Store — textos editáveis da interface.
 *
 * Permite que o admin altere textos de banners, títulos, descrições,
 * fixação, etc. sem precisar editar código.
 *
 * Persistência híbrida:
 * - localStorage (chave: mimi-content) — cache local para render rápida.
 * - Cloudflare D1 (tabela `content`) — source of truth, sincronizada entre dispositivos.
 *
 * `updateField` grava em localStorage (via persist middleware) E dispara
 * `POST /api/db/content` fire-and-forget para o D1.
 * `syncContentFromD1()` busca tudo do D1 no mount da aplicação.
 */

export interface ContentState {
  // Hero
  heroBadge: string;
  heroTitleLine1: string;
  heroTitleLine2: string;
  heroDescription: string;
  heroPriceLabel: string;
  heroCtaText: string;

  // Seasonal Banner
  seasonalTitle: string;
  seasonalDesc: string;
  seasonalCtaText: string;

  // Trust Badges
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

  // FAQ section
  faqTitle: string;
  faqDescription: string;

  // Newsletter
  newsletterTitle: string;
  newsletterDescription: string;
  newsletterBadge: string;

  // Fixação info
  fixationText: string;
  fixationDesc: string;

  // Cart texts
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

  // PixModal texts
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

  // Conversion — announcement bar + urgency timer
  // Stored as strings (D1 `content` table is TEXT); parsed via helpers below.
  announcementText: string;
  urgencyTimerEnabled: string; // "true" | "false"
  urgencyTimerHours: string; // numeric string e.g. "12"

  // Actions
  updateField: (key: keyof ContentState, value: string) => void;
  resetAll: () => void;
}

const DEFAULT_CONTENT: Omit<ContentState, "updateField" | "resetAll"> = {
  // Hero
  heroBadge: "Frascos de Bolso 25ml • Alta Fixação",
  heroTitleLine1: "A Essência do Luxo em",
  heroTitleLine2: "Edição de Bolso 25ml",
  heroDescription:
    "Explore nossa curadoria exclusiva de fragrâncias Brand Collection. Perfumes importados e árabes com frascos idênticos aos de tamanho convencional, formulados com até 25% de essência concentrada.",
  heroPriceLabel: "Valor Único Promocional",
  heroCtaText: "Explorar Catálogo",

  // Seasonal Banner
  seasonalTitle: "Promoção Combo Decantes",
  seasonalDesc: "3 decantes árabes por apenas R$ 100 (economize R$ 19,97)",
  seasonalCtaText: "VER DECANTES",

  // Trust Badges
  trustSectionTitle: "Por que escolher a Mimi Mimos?",
  trustBadge1Title: "Frete Grátis",
  trustBadge1Desc: "Acima de R$ 100 + retirada na loja",
  trustBadge2Title: "Pix Seguro",
  trustBadge2Desc: "Pagamento via OpenFinance",
  trustBadge3Title: "Originais Importados",
  trustBadge3Desc: "Marcas e árabes genuínos",
  trustBadge4Title: "Fixação Garantida",
  trustBadge4Desc: "Até 8h de duração",
  trustBadge5Title: "Troca Fácil",
  trustBadge5Desc: "7 dias para troca ou devolução",
  trustBadge6Title: "Suporte WhatsApp",
  trustBadge6Desc: "Atendimento humano e direto",

  // FAQ
  faqTitle: "Tire suas dúvidas",
  faqDescription:
    "As perguntas mais comuns sobre pedidos, entrega, pagamento e produtos. Não encontrou? Fale com a gente no WhatsApp.",

  // Newsletter
  newsletterTitle: "Receba Novidades & Cupons Exclusivos",
  newsletterDescription:
    "Inscreva-se para receber promoções exclusivas (Black Friday, Dia das Mães, Natal), avisos de reposição de estoque e cupons especiais para inscritos. Sem spam — só luxo. 💛",
  newsletterBadge: "Clube Mimi Mimos",

  // Fixação
  fixationText: "Fixação até 8h",
  fixationDesc: "Essência concentrada EDP — clique para dicas",

  // Cart texts
  cartTitle: "Sua Sacola de Luxo",
  cartEmpty: "Sua sacola de luxo está vazia.",
  cartCtaText: "Finalizar com Pix",
  cartCustomerDataLabel: "Seus Dados",
  cartShippingLabel: "Entrega ou Retirada",
  cartCouponLabel: "Cupom de Desconto",
  cartGiftWrapTitle: "Embrulho para presente",
  cartGiftWrapDesc: "Caixa luxo + cartão com mensagem personalizada",
  cartSubtotalLabel: "Subtotal produtos:",
  cartShippingLabel2: "Frete:",
  cartTotalLabel: "Total:",
  cartYouSaveLabel: "Você economiza",

  // PixModal texts
  pixTitle: "Pagamento Instantâneo Pix",
  pixSubtitle: "Processado via OpenFinance • Mimi Mimos",
  pixSummaryLabel: "Resumo do Pedido Mimi Mimos:",
  pixTotalLabel: "Total a Pagar (Pix):",
  pixCtaText: "Confirmar e Enviar Pedido no WhatsApp",
  pixCtaDesc: "Após copiar ou pagar pelo seu banco, clique acima para enviar os dados de entrega no WhatsApp da loja.",
  pixCopyLabel: "Código Pix Copia e Cola:",
  pixCopyBtn: "Copiar",
  pixCopiedBtn: "Copiado!",
  pixWaitingText: "Aguardando pagamento... Expira em:",

  // Conversion — announcement bar + urgency timer
  announcementText: "Frete grátis acima de R$ 100 • Pix com desconto",
  urgencyTimerEnabled: "false",
  urgencyTimerHours: "12",
};

/**
 * Keys that represent actual content (not store actions).
 * Used to filter D1 payloads so we never overwrite Zustand methods.
 */
const CONTENT_KEYS = new Set<string>(Object.keys(DEFAULT_CONTENT));

export const useContentStore = create<ContentState>()(
  persist(
    (set) => ({
      ...DEFAULT_CONTENT,
      updateField: (key, value) => {
        // 1. Save to localStorage (via persist middleware) — synchronous, drives UI.
        set({ [key]: value } as ContentState);
        // 2. Fire-and-forget POST to D1 — do not block UI, do not throw on failure.
        if (typeof window !== "undefined") {
          fetch("/api/db/content", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key, value }),
          }).catch((err) => {
            console.warn("[content-store] D1 save failed (localStorage cached):", err);
          });
        }
      },
      resetAll: () => {
        set(DEFAULT_CONTENT);
        // D1 SYNC — clear all content rows from D1 (fire-and-forget)
        if (typeof window !== "undefined") {
          fetch("/api/db/content", { method: "DELETE" }).catch((err) => {
            console.warn("[content-store] D1 reset failed (localStorage reset only):", err);
          });
        }
      },
    }),
    {
      name: "mimi-content",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

/**
 * syncContentFromD1 — fetches all content rows from D1 and updates the store.
 *
 * D1 is the source of truth; localStorage (handled by the persist middleware)
 * is just a cache for fast rendering. Call this once on app mount.
 *
 * On failure (network down, D1 not bound, malformed payload), the function
 * silently no-ops so the localStorage cache keeps the UI working.
 */
export async function syncContentFromD1(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const res = await fetch("/api/db/content", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    if (!data?.success || !data.content || typeof data.content !== "object") return;

    const updates: Record<string, string> = {};
    for (const [key, value] of Object.entries(data.content)) {
      if (CONTENT_KEYS.has(key) && typeof value === "string") {
        updates[key] = value;
      }
    }
    if (Object.keys(updates).length > 0) {
      // setState merges with existing state; persist middleware re-caches to localStorage.
      useContentStore.setState(updates as Partial<ContentState>, false);
    }
  } catch (err) {
    console.warn("[content-store] D1 sync failed (using localStorage cache):", err);
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers for the urgency timer config (stored as strings in D1).            */
/* -------------------------------------------------------------------------- */

/** Returns true iff urgencyTimerEnabled === "true". Defensive against garbage. */
export function isUrgencyTimerEnabled(state: ContentState): boolean {
  return String(state.urgencyTimerEnabled).toLowerCase() === "true";
}

/** Returns the configured hours for the urgency timer (default 12 on parse error). */
export function getUrgencyTimerHours(state: ContentState): number {
  const parsed = Number(state.urgencyTimerHours);
  if (!Number.isFinite(parsed) || parsed <= 0) return 12;
  return Math.min(Math.max(parsed, 1), 168); // clamp 1h–7d
}
