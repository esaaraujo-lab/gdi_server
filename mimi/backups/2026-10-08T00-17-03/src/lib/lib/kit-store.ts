"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Kits promocionais — bundles curados de 2-3 perfumes vendidos juntos por
 * um preço especial (mais baixo que a soma individual).
 *
 * Persistência: localStorage (Zustand persist) + Cloudflare D1 (tabela `kits`).
 * Source of truth = D1; localStorage é cache rápido para render inicial.
 */

export interface Kit {
  id: string;
  name: string; // ex: "Kit Noite Sofisticada"
  description: string; // ex: "Combinação perfeita para a noite"
  productIds: string[]; // 2-3 perfume IDs
  price: number; // preço do kit (geralmente menor que a soma)
  image: string; // primeira imagem do produto ou custom
  badge: string; // ex: "Economize R$ 30"
  active: boolean;
  createdAt: string;
}

interface KitStoreState {
  kits: Kit[];
  addKit: (kit: Omit<Kit, "id" | "createdAt" | "active"> & {
    id?: string;
    active?: boolean;
    createdAt?: string;
  }) => void;
  deleteKit: (id: string) => void;
  toggleKit: (id: string) => void;
  getActiveKits: () => Kit[];
  /** D1 SYNC — fetch kits from D1 and replace local cache (source of truth). */
  syncKitsFromD1: () => Promise<void>;
}

/** D1 SYNC helper — fire-and-forget fetch with error swallowing. */
function d1SyncFetch(url: string, options?: RequestInit, label = "D1 sync kit") {
  if (typeof window === "undefined") return; // server-side safety
  void fetch(url, options)
    .then((res) => {
      if (!res.ok) console.warn(`[${label}] HTTP ${res.status}`);
      return res.json().catch(() => null);
    })
    .catch((err) => console.warn(`[${label}] failed:`, err));
}

/** Gera um ID estável e curto baseado em timestamp + random hex. */
function generateKitId(): string {
  return `kit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useKitStore = create<KitStoreState>()(
  persist(
    (set, get) => ({
      kits: [],

      addKit: (input) => {
        const kit: Kit = {
          id: input.id || generateKitId(),
          name: input.name.trim(),
          description: input.description?.trim() || "",
          productIds: Array.isArray(input.productIds) ? input.productIds.slice(0, 3) : [],
          price: Number.isFinite(input.price) ? Number(input.price) : 0,
          image: input.image || "",
          badge: input.badge || "",
          active: input.active ?? true,
          createdAt: input.createdAt || new Date().toISOString(),
        };
        set((state) => ({
          kits: [
            ...state.kits.filter((k) => k.id !== kit.id),
            kit,
          ],
        }));
        // D1 SYNC — upsert kit (fire-and-forget)
        d1SyncFetch("/api/db/kits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(kit),
        }, "D1 sync addKit");
      },

      deleteKit: (id) => {
        set((state) => ({
          kits: state.kits.filter((k) => k.id !== id),
        }));
        // D1 SYNC — delete kit (fire-and-forget)
        d1SyncFetch(
          `/api/db/kits?id=${encodeURIComponent(id)}`,
          { method: "DELETE" },
          "D1 sync deleteKit"
        );
      },

      toggleKit: (id) => {
        const existing = get().kits.find((k) => k.id === id);
        if (!existing) return;
        const newActive = !existing.active;
        set((state) => ({
          kits: state.kits.map((k) =>
            k.id === id ? { ...k, active: newActive } : k
          ),
        }));
        // D1 SYNC — sync toggle by re-upserting with new active state
        const updated: Kit = { ...existing, active: newActive };
        d1SyncFetch("/api/db/kits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated),
        }, "D1 sync toggleKit");
      },

      getActiveKits: () => get().kits.filter((k) => k.active),

      // D1 SYNC — fetch kits from D1 and replace local cache
      syncKitsFromD1: async () => {
        try {
          const res = await fetch("/api/db/kits");
          const data = await res.json();
          if (!data?.success || !Array.isArray(data.kits)) return;
          const d1Kits: Kit[] = data.kits.map((k: any): Kit => ({
            id: String(k.id || ""),
            name: String(k.name || ""),
            description: String(k.description || ""),
            productIds: Array.isArray(k.productIds)
              ? k.productIds
              : (() => {
                  try {
                    const parsed = JSON.parse(k.productIds || "[]");
                    return Array.isArray(parsed) ? parsed : [];
                  } catch {
                    return [];
                  }
                })(),
            price: Number.isFinite(k.price) ? Number(k.price) : 0,
            image: String(k.image || ""),
            badge: String(k.badge || ""),
            active: k.active !== false && k.active !== 0,
            createdAt: String(k.createdAt || new Date().toISOString()),
          }));
          set({ kits: d1Kits });
        } catch (err) {
          console.warn("[D1 sync] kits sync failed:", err);
        }
      },
    }),
    {
      name: "mimi-kits",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ kits: state.kits }),
    }
  )
);
