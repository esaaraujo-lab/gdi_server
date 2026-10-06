"use client";

import { create } from "zustand";
import type { Perfume } from "./perfumes";

export type SortOption =
  | "featured"
  | "price-asc"
  | "price-desc"
  | "rating-desc"
  | "name-asc"
  | "newest";

export type SeasonFilter = "all" | "verao" | "inverno" | "dia-noite";
export type OccasionFilter = "all" | "casual" | "festa" | "luxo" | "trabalho";
export type PriceRange = "all" | "under70" | "70-100" | "over100";

interface UIState {
  cartOpen: boolean;
  pixOpen: boolean;
  notifyOpen: boolean;
  adminAuthOpen: boolean;
  adminPanelOpen: boolean;
  notifyProduct: Perfume | null;
  quickViewProduct: Perfume | null;
  quickViewOpen: boolean;
  favoritesOpen: boolean;
  mobileMenuOpen: boolean;
  activeCategory: string;
  activeBrand: string | null;
  activeNote: string | null;
  search: string;
  sortBy: SortOption;
  seasonFilter: SeasonFilter;
  occasionFilter: OccasionFilter;
  priceRange: PriceRange;
  advancedFiltersOpen: boolean;
  setCartOpen: (v: boolean) => void;
  setPixOpen: (v: boolean) => void;
  setNotifyOpen: (v: boolean) => void;
  setAdminAuthOpen: (v: boolean) => void;
  setAdminPanelOpen: (v: boolean) => void;
  openNotify: (p: Perfume) => void;
  openQuickView: (p: Perfume) => void;
  setQuickViewOpen: (v: boolean) => void;
  setFavoritesOpen: (v: boolean) => void;
  setMobileMenuOpen: (v: boolean) => void;
  setActiveCategory: (c: string) => void;
  setActiveBrand: (b: string | null) => void;
  setActiveNote: (n: string | null) => void;
  setSearch: (s: string) => void;
  setSortBy: (s: SortOption) => void;
  setSeasonFilter: (s: SeasonFilter) => void;
  setOccasionFilter: (o: OccasionFilter) => void;
  setPriceRange: (p: PriceRange) => void;
  setAdvancedFiltersOpen: (v: boolean) => void;
  resetFilters: () => void;
}

export const useUI = create<UIState>((set) => ({
  cartOpen: false,
  pixOpen: false,
  notifyOpen: false,
  adminAuthOpen: false,
  adminPanelOpen: false,
  notifyProduct: null,
  quickViewProduct: null,
  quickViewOpen: false,
  favoritesOpen: false,
  mobileMenuOpen: false,
  activeCategory: "all",
  activeBrand: null,
  activeNote: null,
  search: "",
  sortBy: "featured",
  seasonFilter: "all",
  occasionFilter: "all",
  priceRange: "all",
  advancedFiltersOpen: false,
  setCartOpen: (v) => set({ cartOpen: v }),
  setPixOpen: (v) => set({ pixOpen: v }),
  setNotifyOpen: (v) => set({ notifyOpen: v }),
  setAdminAuthOpen: (v) => set({ adminAuthOpen: v }),
  setAdminPanelOpen: (v) => set({ adminPanelOpen: v }),
  openNotify: (p) => set({ notifyProduct: p, notifyOpen: true }),
  openQuickView: (p) => set({ quickViewProduct: p, quickViewOpen: true }),
  setQuickViewOpen: (v) => set({ quickViewOpen: v }),
  setFavoritesOpen: (v) => set({ favoritesOpen: v }),
  setMobileMenuOpen: (v) => set({ mobileMenuOpen: v }),
  setActiveCategory: (c) => set({ activeCategory: c }),
  setActiveBrand: (b) => set({ activeBrand: b }),
  setActiveNote: (n) => set({ activeNote: n }),
  setSearch: (s) => set({ search: s }),
  setSortBy: (s) => set({ sortBy: s }),
  setSeasonFilter: (s) => set({ seasonFilter: s }),
  setOccasionFilter: (o) => set({ occasionFilter: o }),
  setPriceRange: (p) => set({ priceRange: p }),
  setAdvancedFiltersOpen: (v) => set({ advancedFiltersOpen: v }),
  resetFilters: () =>
    set({
      activeCategory: "all",
      activeBrand: null,
      activeNote: null,
      search: "",
      sortBy: "featured",
      seasonFilter: "all",
      occasionFilter: "all",
      priceRange: "all",
    }),
}));
