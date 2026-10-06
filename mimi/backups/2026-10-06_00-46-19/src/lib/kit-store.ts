"use client";

import { create } from "zustand";
// persist middleware removed — D1 is the source of truth for kits.

/**
 * Kit Store — kits promocionais (2-3 perfumes por preço fechado).
 *
 * Persistido em localStorage + sincronizado com D1 via /api/db/kits.
 *
 * Cada kit:
 *  - id (string única, ex: "kit-1")
 *  - name, description
 *  - productIds[] (2-3 IDs de perfumes do catálogo)
 *  - price (preço do kit, geralmente menor que soma dos itens)
 *  - image (URL ou vazio)
 *  - badge (ex: "Economize R$ 30", "Mais Vendido")
 *  - active (bool)
 *  - createdAt (ISO date)
 */

export interface Kit {
  id: string;
  name: string;
  description: string;
  productIds: string[];
  price: number;
  image: string;
  badge: string;
  active: boolean;
  createdAt: string;
}

/** Kits padrão (seed) — admin pode editar/excluir/criar mais. */
export const DEFAULT_KITS: Kit[] = [
  {
    id: "kit-1",
    name: "Kit Casal Luxo",
    description:
      "Perfeito para presente: 1 feminino + 1 masculino com embrulho grátis.",
    productIds: ["bc-021", "bc-116"],
    price: 129.9,
    image: "",
    badge: "Economize R$ 10",
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "kit-2",
    name: "Kit Decantes Árabes",
    description: "3 decantes 5ml árabes por R$ 90 (em vez de R$ 119,97).",
    productIds: ["dec-05", "dec-08", "dec-14"],
    price: 90,
    image: "",
    badge: "Combo 3x100 promo",
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "kit-3",
    name: "Kit Minhas Favoritas",
    description: "Top 3 Brand Collection mais vendidos com 15% OFF.",
    productIds: ["bc-005", "bc-126", "bc-312"],
    price: 179.9,
    image: "",
    badge: "15% OFF",
    active: true,
    createdAt: new Date().toISOString(),
  },
];

interface KitStoreState {
  kits: Kit[];
  addKit: (kit: Omit<Kit, "id" | "createdAt"> & { id?: string }) => void;
  deleteKit: (id: string) => void;
  toggleKit: (id: string) => void;
  getActiveKits: () => Kit[];
  syncKitsFromD1: () => Promise<void>;
}

export const useKitStore = create<KitStoreState>()(
  (set, get) => ({
      kits: DEFAULT_KITS,

      addKit: (kit) => {
        const newKit: Kit = {
          id: kit.id || `kit-${Date.now()}`,
          name: kit.name,
          description: kit.description || "",
          productIds: Array.isArray(kit.productIds) ? kit.productIds : [],
          price: Number(kit.price) || 0,
          image: kit.image || "",
          badge: kit.badge || "",
          active: kit.active ?? true,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ kits: [newKit, ...state.kits] }));
        // Fire-and-forget D1 sync
        void fetch("/api/db/kits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newKit),
        }).catch(() => {});
      },

      deleteKit: (id) => {
        set((state) => ({ kits: state.kits.filter((k) => k.id !== id) }));
        void fetch(`/api/db/kits?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        }).catch(() => {});
      },

      toggleKit: (id) => {
        set((state) => ({
          kits: state.kits.map((k) =>
            k.id === id ? { ...k, active: !k.active } : k
          ),
        }));
        // Sync updated kit
        const updated = get().kits.find((k) => k.id === id);
        if (updated) {
          void fetch("/api/db/kits", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updated),
          }).catch(() => {});
        }
      },

      getActiveKits: () => get().kits.filter((k) => k.active),

      syncKitsFromD1: async () => {
        try {
          const res = await fetch("/api/db/kits", { method: "GET" });
          if (!res.ok) return;
          const data = await res.json();
          if (!data?.success || !Array.isArray(data.kits)) return;
          // Only set if we got at least one kit from D1 (otherwise keep defaults)
          if (data.kits.length > 0) {
            set({ kits: data.kits as Kit[] });
          }
        } catch {
          // silent
        }
      },
    })
);

/** Convenience standalone function for sync (used in page.tsx effects). */
export function syncKitsFromD1(): Promise<void> {
  return useKitStore.getState().syncKitsFromD1();
}
