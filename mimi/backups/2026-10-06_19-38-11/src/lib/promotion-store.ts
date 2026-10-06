"use client";

import { create } from "zustand";

/**
 * Promotions store — manageable special offers (3 decantes R$100, Black Friday,
 * seasonal promos). Syncs from D1 via /api/db/promotions.
 *
 * Promotions do NOT touch product prices or stock. They only control the
 * display of special offer sections (KitSection on staging, PromoKits on main).
 */

export interface Promotion {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  badgeText: string | null;
  eyebrow: string;
  productIds: string[]; // empty = all decantes
  bundleQty: number;
  bundlePrice: number;
  originalPrice: number;
  discountText: string | null;
  imageUrl: string | null;
  ctaText: string;
  ctaSecondary: string | null;
  isActive: boolean;
  sortOrder: number;
  validFrom: string | null;
  validUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PromotionStoreState {
  promotions: Promotion[];
  loaded: boolean;
  setPromotions: (promotions: Promotion[]) => void;
  syncPromotionsFromD1: () => Promise<void>;
  /** Returns active promotions sorted by sort_order. */
  getActivePromotions: () => Promotion[];
  /** Returns the first active promotion (for KitSection display). */
  getPrimaryPromotion: () => Promotion | null;
}

export const usePromotionStore = create<PromotionStoreState>((set, get) => ({
  promotions: [],
  loaded: false,
  setPromotions: (promotions) => set({ promotions, loaded: true }),
  syncPromotionsFromD1: async () => {
    try {
      const res = await fetch("/api/db/promotions", { method: "GET" });
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.success || !Array.isArray(data.promotions)) return;
      set({ promotions: data.promotions, loaded: true });
    } catch {
      // silent — keep empty array
    }
  },
  getActivePromotions: () => {
    const now = new Date().toISOString();
    return get()
      .promotions.filter((p) => {
        if (!p.isActive) return false;
        if (p.validFrom && now < p.validFrom) return false;
        if (p.validUntil && now > p.validUntil) return false;
        return true;
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },
  getPrimaryPromotion: () => {
    const active = get().getActivePromotions();
    return active.length > 0 ? active[0] : null;
  },
}));

/**
 * Sync helper (call from page useEffect).
 */
export function syncPromotionsFromD1(): Promise<void> {
  return usePromotionStore.getState().syncPromotionsFromD1();
}
