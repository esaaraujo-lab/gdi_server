"use client";

import { create } from "zustand";

/**
 * Gift Wrap store — reads gift wrap settings from D1.
 * Admin can enable/disable gift wrap and set the price via /api/db/gift-wrap.
 */

interface GiftWrapStoreState {
  enabled: boolean;
  price: number;
  loaded: boolean;
  set: (enabled: boolean, price: number) => void;
  syncGiftWrapFromD1: () => Promise<void>;
}

export const useGiftWrapStore = create<GiftWrapStoreState>((set) => ({
  enabled: false,
  price: 5.0,
  loaded: false,
  set: (enabled, price) => set({ enabled, price, loaded: true }),
  syncGiftWrapFromD1: async () => {
    try {
      const res = await fetch("/api/db/gift-wrap", { method: "GET" });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.success) {
        set({ enabled: data.enabled, price: data.price, loaded: true });
      }
    } catch {
      // silent
    }
  },
}));

export function syncGiftWrapFromD1(): Promise<void> {
  return useGiftWrapStore.getState().syncGiftWrapFromD1();
}
