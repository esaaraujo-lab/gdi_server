"use client";

import { create } from "zustand";

/**
 * Brands store — manageable perfume brands from D1.
 * Syncs from /api/db/brands?withProducts=true to include brand-product links.
 */

export interface Brand {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BrandProductLink {
  brandId: string;
  productId: string;
}

interface BrandStoreState {
  brands: Brand[];
  links: BrandProductLink[];
  loaded: boolean;
  setBrands: (brands: Brand[], links?: BrandProductLink[]) => void;
  syncBrandsFromD1: () => Promise<void>;
  /** Returns brands filtered by isActive (use selector in component to avoid infinite loops). */
  activeBrands: Brand[];
}

export const useBrandStore = create<BrandStoreState>((set, get) => ({
  brands: [],
  links: [],
  loaded: false,
  activeBrands: [],
  setBrands: (brands, links = []) => {
    // Pre-compute active brands to avoid getServerSnapshot infinite loops
    const activeBrands = brands
      .filter((b) => b.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR"));
    set({ brands, links, activeBrands, loaded: true });
  },
  syncBrandsFromD1: async () => {
    try {
      const res = await fetch("/api/db/brands?withProducts=true", { method: "GET" });
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.success || !Array.isArray(data.brands)) return;
      // Use setBrands to also update activeBrands cache
      get().setBrands(data.brands, Array.isArray(data.links) ? data.links : []);
    } catch {
      // silent
    }
  },
}));

/**
 * Sync helper (call from page useEffect).
 */
export function syncBrandsFromD1(): Promise<void> {
  return useBrandStore.getState().syncBrandsFromD1();
}
