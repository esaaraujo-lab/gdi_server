"use client";

import { create } from "zustand";

/**
 * Marquee store — stores marquee bar items from D1.
 * Admin can edit via /api/db/marquee POST.
 */

interface MarqueeStoreState {
  items: string[];
  loaded: boolean;
  setItems: (items: string[]) => void;
  syncMarqueeFromD1: () => Promise<void>;
}

const DEFAULT_ITEMS = [
  "Frete grátis acima de R$200",
  "Decantes: Kit 3 = R$100",
  "Perfumes importados e árabes",
  "Pagamento via Pix",
];

export const useMarqueeStore = create<MarqueeStoreState>((set) => ({
  items: DEFAULT_ITEMS,
  loaded: false,
  setItems: (items) => set({ items, loaded: true }),
  syncMarqueeFromD1: async () => {
    try {
      const res = await fetch("/api/db/marquee", { method: "GET" });
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.success || !Array.isArray(data.items)) return;
      set({ items: data.items, loaded: true });
    } catch {
      // silent — keep defaults
    }
  },
}));

export function syncMarqueeFromD1(): Promise<void> {
  return useMarqueeStore.getState().syncMarqueeFromD1();
}
