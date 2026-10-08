"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Cupons de desconto disponíveis na loja.
 * Tipos:
 *  - "percent": desconto percentual (ex: 10% off)
 *  - "fixed": desconto fixo em R$ (ex: R$ 10 off)
 *  - "freeship": frete grátis (qualquer valor)
 *  - "decante3x100": combo 3 decantes por R$ 90 (em vez de R$ 100)
 */
export type CouponType = "percent" | "fixed" | "freeship" | "decante3x100";

export interface Coupon {
  code: string; // código em maiúsculas
  type: CouponType;
  value: number; // percentual (10) ou valor fixo (10)
  description: string;
  minSubtotal?: number; // valor mínimo para ativar
  expiresAt?: string; // ISO date opcional
  active: boolean;
}

/** Cupons padrão — admin pode adicionar mais via painel. */
export const DEFAULT_COUPONS: Coupon[] = [
  {
    code: "BEMVINDO10",
    type: "percent",
    value: 10,
    description: "10% OFF na primeira compra — boas-vindas!",
    minSubtotal: 0,
    active: true,
  },
  {
    code: "MIMI15",
    type: "percent",
    value: 15,
    description: "15% OFF em pedidos acima de R$ 150",
    minSubtotal: 150,
    active: true,
  },
  {
    code: "FRETEGRATIS",
    type: "freeship",
    value: 0,
    description: "Frete grátis em qualquer pedido",
    minSubtotal: 0,
    active: true,
  },
  {
    code: "DECANTE90",
    type: "decante3x100",
    value: 90, // 3 decantes por R$ 90 (em vez de R$ 100)
    description: "Combo 3 decantes por R$ 90 (em vez de R$ 100)",
    minSubtotal: 0,
    active: true,
  },
  {
    code: "BLACKFRIDAY20",
    type: "percent",
    value: 20,
    description: "20% OFF — só na Black Friday!",
    minSubtotal: 100,
    active: true,
  },
];

interface CouponStoreState {
  coupons: Coupon[];
  appliedCoupon: string | null; // código aplicado no carrinho atual
  addCoupon: (coupon: Omit<Coupon, "active"> & { active?: boolean }) => void;
  toggleCoupon: (code: string) => void;
  deleteCoupon: (code: string) => void;
  applyCoupon: (code: string, subtotal: number) => { success: boolean; message: string };
  removeCoupon: () => void;
  getActiveCoupon: () => Coupon | null;
  /** Calcula desconto dado um subtotal e contagem de decantes no carrinho. */
  calculateDiscount: (subtotal: number, decanteCount: number) => {
    discount: number;
    freeShip: boolean;
    newDecantePrice?: number;
    description: string;
  };
  /** D1 SYNC — fetch coupons from D1 and merge into store */
  syncCouponsFromD1: () => Promise<void>;
}

/** D1 SYNC — helper: fire-and-forget fetch with error swallowing. */
function d1SyncFetch(url: string, options?: RequestInit, label = "D1 sync coupon") {
  if (typeof window === "undefined") return; // server-side safety
  void fetch(url, options)
    .then((res) => {
      if (!res.ok) console.warn(`[${label}] HTTP ${res.status}`);
      return res.json().catch(() => null);
    })
    .catch((err) => console.warn(`[${label}] failed:`, err));
}

export const useCouponStore = create<CouponStoreState>()(
  persist(
    (set, get) => ({
      coupons: DEFAULT_COUPONS,
      appliedCoupon: null,

      addCoupon: (coupon) => {
        const code = coupon.code.trim().toUpperCase();
        const finalCoupon: Coupon = {
          ...coupon,
          code,
          active: coupon.active ?? true,
        };
        set((state) => ({
          coupons: [
            ...state.coupons.filter((c) => c.code !== code),
            finalCoupon,
          ],
        }));
        // D1 SYNC — upsert coupon to D1 (fire-and-forget)
        d1SyncFetch("/api/db/coupons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(finalCoupon),
        }, "D1 sync addCoupon");
      },

      toggleCoupon: (code) => {
        const normalized = code.trim().toUpperCase();
        const existing = get().coupons.find((c) => c.code === normalized);
        if (!existing) return; // nothing to toggle
        const newActive = !existing.active;
        set((state) => ({
          coupons: state.coupons.map((c) =>
            c.code === normalized ? { ...c, active: newActive } : c
          ),
        }));
        // D1 SYNC — toggle active state in D1 (fire-and-forget)
        d1SyncFetch(
          `/api/db/coupons?code=${encodeURIComponent(normalized)}&active=${newActive}`,
          { method: "PATCH" },
          "D1 sync toggleCoupon"
        );
      },

      deleteCoupon: (code) => {
        const normalized = code.trim().toUpperCase();
        set((state) => ({
          coupons: state.coupons.filter((c) => c.code !== normalized),
          appliedCoupon:
            get().appliedCoupon === normalized ? null : get().appliedCoupon,
        }));
        // D1 SYNC — delete coupon from D1 (fire-and-forget)
        d1SyncFetch(
          `/api/db/coupons?code=${encodeURIComponent(normalized)}`,
          { method: "DELETE" },
          "D1 sync deleteCoupon"
        );
      },

      applyCoupon: (code, subtotal) => {
        const normalized = code.trim().toUpperCase();
        const coupon = get().coupons.find(
          (c) => c.code === normalized && c.active
        );
        if (!coupon) {
          return {
            success: false,
            message: "Código de cupom inválido ou expirado.",
          };
        }
        // Verifica validade
        if (coupon.expiresAt) {
          const exp = new Date(coupon.expiresAt);
          if (exp.getTime() < Date.now()) {
            return {
              success: false,
              message: "Este cupom expirou.",
            };
          }
        }
        // Verifica valor mínimo
        if (coupon.minSubtotal && subtotal < coupon.minSubtotal) {
          return {
            success: false,
            message: `Pedido mínimo de R$ ${coupon.minSubtotal.toFixed(2).replace(
              ".",
              ","
            )} para este cupom.`,
          };
        }
        set({ appliedCoupon: coupon.code });
        return {
          success: true,
          message: `Cupom "${coupon.code}" aplicado! ${coupon.description}`,
        };
      },

      removeCoupon: () => set({ appliedCoupon: null }),

      getActiveCoupon: () => {
        const code = get().appliedCoupon;
        if (!code) return null;
        return get().coupons.find((c) => c.code === code) || null;
      },

      calculateDiscount: (subtotal, decanteCount) => {
        const coupon = get().getActiveCoupon();
        if (!coupon) {
          return {
            discount: 0,
            freeShip: false,
            description: "",
          };
        }
        switch (coupon.type) {
          case "percent":
            return {
              discount: (subtotal * coupon.value) / 100,
              freeShip: false,
              description: `${coupon.value}% OFF`,
            };
          case "fixed":
            return {
              discount: Math.min(coupon.value, subtotal),
              freeShip: false,
              description: `R$ ${coupon.value.toFixed(2).replace(".", ",")} OFF`,
            };
          case "freeship":
            return {
              discount: 0,
              freeShip: true,
              description: "Frete grátis",
            };
          case "decante3x100": {
            // 3 decantes por R$ 90 em vez de R$ 100 — economiza R$ 10 por combo
            const combos = Math.floor(decanteCount / 3);
            return {
              discount: combos * 10, // R$ 10 de desconto por combo
              freeShip: false,
              newDecantePrice: coupon.value,
              description: `3 decantes por R$ ${coupon.value.toFixed(2).replace(".", ",")}`,
            };
          }
          default:
            return {
              discount: 0,
              freeShip: false,
              description: "",
            };
        }
      },

      // D1 SYNC — fetch coupons from D1 and merge into store
      syncCouponsFromD1: async () => {
        try {
          const res = await fetch("/api/db/coupons");
          const data = await res.json();
          if (!data?.success || !Array.isArray(data.coupons)) return;
          const d1Coupons: Coupon[] = data.coupons.map((c: any): Coupon => ({
            code: String(c.code || "").toUpperCase(),
            type: c.type,
            value: typeof c.value === "number" ? c.value : 0,
            description: c.description || "",
            minSubtotal: typeof c.minSubtotal === "number" ? c.minSubtotal : 0,
            expiresAt: c.expiresAt ?? undefined,
            active: c.active !== false && c.active !== 0,
          }));
          if (d1Coupons.length > 0) {
            // Merge by code: D1 wins, but preserve any local-only coupons not in D1
            const d1Codes = new Set(d1Coupons.map((c) => c.code));
            set((state) => ({
              coupons: [
                ...d1Coupons,
                ...state.coupons.filter((c) => !d1Codes.has(c.code)),
              ],
            }));
          }
        } catch (err) {
          console.warn("[D1 sync] coupons sync failed:", err);
        }
      },
    }),
    {
      name: "mimi-coupons",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        coupons: state.coupons,
        // appliedCoupon NÃO é persistido — sempre começa sem cupom aplicado
      }),
    }
  )
);
