"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  INITIAL_PRODUCTS,
  DEFAULT_PRICE_BRAND,
  DEFAULT_PRICE_AFEER,
  DEFAULT_PRICE_DECANTE,
  type Perfume,
  type ProductCategory,
} from "./perfumes";

export interface PixConfig {
  key: string;
  name: string;
  city: string;
  whatsappGroup: string;
}

export interface Lead {
  date: string;
  name: string;
  phone: string;
  product: string;
}

export interface CartItem extends Perfume {
  qty: number;
}

interface StoreState {
  products: Perfume[];
  cart: CartItem[];
  leads: Lead[];
  favorites: string[];
  recentlyViewed: string[];
  globalDefaultPrice: number;
  pixConfig: PixConfig;
  isAdmin: boolean;
  // cart actions
  addToCart: (product: Perfume) => void;
  changeQty: (id: string, delta: number) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  cartCount: () => number;
  cartSubtotal: () => number;
  cartDecanteCount: () => number;
  cartHasDecantePromo: () => boolean;
  // favorites
  toggleFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;
  // recently viewed
  pushRecentlyViewed: (id: string) => void;
  // product/admin actions
  updateProductPrice: (id: string, price: number) => void;
  updateProduct: (id: string, updates: Partial<Perfume>) => void;
  toggleStock: (id: string) => void;
  deleteProduct: (id: string) => void;
  addProduct: (p: Perfume) => void;
  applyGlobalPrice: (price: number) => void;
  setStockQty: (id: string, qty: number) => void;
  setProducts: (products: Perfume[]) => void;
  syncProductsFromD1: () => Promise<void>;
  // categories
  categories: { id: string; name: string; subcategories: string[] }[];
  addCategory: (name: string) => void;
  deleteCategory: (id: string) => void;
  addSubcategory: (categoryId: string, name: string) => void;
  // leads
  addLead: (lead: Lead) => void;
  clearLeads: () => void;
  // pix config
  savePixConfig: (config: PixConfig) => void;
  // admin
  setAdmin: (v: boolean) => void;
}

/** Normaliza um perfume garantindo todos os campos (migração de schema antigo). */
function normalizePerfume(p: Partial<Perfume> & { id: string }): Perfume {
  const ref =
    INITIAL_PRODUCTS.find((init) => init.id === p.id) || ({} as Perfume);
  // Detecta schema antigo (category era "feminino"|"masculino"|"arabe"|"unissex")
  const oldCat = p.category as string | undefined;
  const isNewSchema =
    oldCat === "BRAND" || oldCat === "AFEER" || oldCat === "DECANTE";
  const category: ProductCategory = isNewSchema
    ? (oldCat as ProductCategory)
    : ref.category ?? "BRAND";

  // Mapeia campos antigos para novos se necessário
  const gender =
    p.gender ??
    (oldCat === "feminino"
      ? "FEMININO"
      : oldCat === "masculino"
      ? "MASCULINO"
      : oldCat === "arabe"
      ? "ARABE"
      : "UNISSEX") ??
    ref.gender ??
    "UNISSEX";
  const tags = p.tags ?? ref.tags ?? [];
  const priceDefault =
    category === "AFEER"
      ? DEFAULT_PRICE_AFEER
      : category === "DECANTE"
      ? DEFAULT_PRICE_DECANTE
      : DEFAULT_PRICE_BRAND;

  return {
    id: p.id,
    code: p.code ?? ref.code ?? "",
    name: p.name ?? ref.name ?? "",
    inspiration: p.inspiration ?? ref.inspiration ?? "",
    category,
    gender,
    price: typeof p.price === "number" ? p.price : ref.price ?? priceDefault,
    inStock: p.inStock ?? ref.inStock ?? true,
    image: p.image ?? ref.image ?? "",
    tags,
    notesTopo: p.notesTopo ?? ref.notesTopo ?? "",
    notesCoracao: p.notesCoracao ?? ref.notesCoracao ?? "",
    notesFundo: p.notesFundo ?? ref.notesFundo ?? "",
    description: p.description ?? ref.description ?? "",
    family: p.family ?? ref.family ?? "",
    intensity: p.intensity ?? ref.intensity ?? "Eau de Parfum",
    fixation: p.fixation ?? ref.fixation ?? "8 a 10h",
    rating: typeof p.rating === "number" ? p.rating : ref.rating ?? 5,
    reviewCount:
      typeof p.reviewCount === "number" ? p.reviewCount : ref.reviewCount ?? 0,
    season: p.season ?? ref.season ?? "",
    occasion: p.occasion ?? ref.occasion ?? "",
    stockQty: p.stockQty ?? ref.stockQty ?? 10,
    images: p.images ?? ref.images,
  };
}

/** Fire-and-forget upsert of a product to D1 via /api/db/products. */
function upsertProductToD1(p: Perfume): void {
  void fetch("/api/db/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(p),
  }).catch(() => {});
}

/** Merge persistido + estado atual, normalizando produtos para o schema novo. */
function mergePersisted(
  persisted: unknown,
  currentState: StoreState
): StoreState {
  if (!persisted || typeof persisted !== "object") return currentState;
  const p = persisted as Partial<StoreState>;
  // Products are NOT loaded from localStorage — D1 is the source of truth
  // Only load user-specific data (favorites, recentlyViewed, etc.) from localStorage
  return {
    ...currentState,
    ...p,
    // Always keep INITIAL_PRODUCTS as initial state — D1 sync will update
    products: currentState.products,
    favorites: Array.isArray(p.favorites) ? p.favorites : [],
    recentlyViewed: Array.isArray(p.recentlyViewed) ? p.recentlyViewed : [],
    leads: Array.isArray(p.leads) ? p.leads : [],
  };
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      products: INITIAL_PRODUCTS,
      cart: [],
      leads: [],
      favorites: [],
      recentlyViewed: [],
      globalDefaultPrice: DEFAULT_PRICE_BRAND,
      pixConfig: {
        key: "29659422890",
        name: "FABIANA ARAUJO",
        city: "SAO PAULO",
        whatsappGroup: "https://chat.whatsapp.com/I8eqZA7fxMRFCZFTEVS30G",
      },
      isAdmin: false,

      addToCart: (product) =>
        set((state) => {
          const existing = state.cart.find((i) => i.id === product.id);
          if (existing) {
            return {
              cart: state.cart.map((i) =>
                i.id === product.id ? { ...i, qty: i.qty + 1 } : i
              ),
            };
          }
          return { cart: [...state.cart, { ...product, qty: 1 }] };
        }),
      changeQty: (id, delta) =>
        set((state) => {
          const item = state.cart.find((i) => i.id === id);
          if (!item) return {};
          const newQty = item.qty + delta;
          if (newQty <= 0) {
            return { cart: state.cart.filter((i) => i.id !== id) };
          }
          return {
            cart: state.cart.map((i) => (i.id === id ? { ...i, qty: newQty } : i)),
          };
        }),
      removeFromCart: (id) =>
        set((state) => ({ cart: state.cart.filter((i) => i.id !== id) })),
      clearCart: () => set({ cart: [] }),
      cartCount: () => get().cart.reduce((acc, i) => acc + i.qty, 0),
      cartSubtotal: () => {
        // Decante promo: 3 decantes por R$ 100,00
        let total = 0;
        let decanteCount = 0;
        get().cart.forEach((item) => {
          if (item.category === "DECANTE") {
            decanteCount += item.qty;
          } else {
            total += item.price * item.qty;
          }
        });
        if (decanteCount > 0) {
          const combos = Math.floor(decanteCount / 3);
          const remainder = decanteCount % 3;
          total += combos * 100.0 + remainder * DEFAULT_PRICE_DECANTE;
        }
        return total;
      },
      cartDecanteCount: () =>
        get().cart
          .filter((i) => i.category === "DECANTE")
          .reduce((acc, i) => acc + i.qty, 0),
      cartHasDecantePromo: () => {
        const count = get()
          .cart.filter((i) => i.category === "DECANTE")
          .reduce((acc, i) => acc + i.qty, 0);
        return count >= 3;
      },

      toggleFavorite: (id) =>
        set((state) => ({
          favorites: state.favorites.includes(id)
            ? state.favorites.filter((f) => f !== id)
            : [...state.favorites, id],
        })),
      isFavorite: (id) => get().favorites.includes(id),

      pushRecentlyViewed: (id) =>
        set((state) => ({
          recentlyViewed: [
            id,
            ...state.recentlyViewed.filter((r) => r !== id),
          ].slice(0, 8),
        })),

      updateProductPrice: (id, price) => {
        set((state) => ({
          products: state.products.map((p) =>
            p.id === id ? { ...p, price } : p
          ),
        }));
        // Sync to D1 (fire-and-forget)
        const updated = get().products.find((p) => p.id === id);
        if (updated) void upsertProductToD1(updated);
      },
      updateProduct: (id, updates) => {
        set((state) => ({
          products: state.products.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        }));
        // Sync full product to D1 (fire-and-forget)
        const updated = get().products.find((p) => p.id === id);
        if (updated) void upsertProductToD1(updated);
      },
      toggleStock: (id) => {
        set((state) => ({
          products: state.products.map((p) =>
            p.id === id ? { ...p, inStock: !p.inStock } : p
          ),
        }));
        const updated = get().products.find((p) => p.id === id);
        if (updated) {
          void upsertProductToD1(updated);
        }
      },
      deleteProduct: (id) => {
        set((state) => ({ products: state.products.filter((p) => p.id !== id) }));
        void fetch(`/api/db/products?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
      },
      addProduct: (p) => {
        set((state) => ({ products: [p, ...state.products] }));
        void upsertProductToD1(p);
      },
      applyGlobalPrice: (price) =>
        set((state) => ({
          globalDefaultPrice: price,
          products: state.products.map((p) => ({ ...p, price })),
        })),
      setStockQty: (id, qty) => {
        set((state) => ({
          products: state.products.map((p) =>
            p.id === id ? { ...p, stockQty: qty, inStock: qty > 0 } : p
          ),
        }));
        // Sync to D1 via BOTH endpoints (fire-and-forget):
        // 1. PATCH stock (dedicated stock endpoint)
        void fetch(`/api/db/stock?id=${encodeURIComponent(id)}&qty=${qty}`, { method: "PATCH" }).catch(() => {});
        // 2. POST full product (so products API store stays in sync in dev
        //    where each route module has its own memory instance)
        const updated = get().products.find((p) => p.id === id);
        if (updated) void upsertProductToD1(updated);
      },
      setProducts: (products) => set({ products }),
      syncProductsFromD1: async () => {
        try {
          const res = await fetch("/api/db/products", { method: "GET" });
          if (!res.ok) return;
          const data = await res.json();
          if (!data?.success || !Array.isArray(data.products)) return;
          if (data.products.length > 0) {
            const normalized = data.products.map(normalizePerfume);
            set({ products: normalized });
          }
        } catch {
          // silent
        }
      },

      categories: [
        { id: "BRAND", name: "Brand Collection 25ml", subcategories: ["Feminino", "Masculino", "Unissex"] },
        { id: "AFEER", name: "Miniaturas Árabes Afeer", subcategories: ["Feminino", "Masculino", "Árabe"] },
        { id: "DECANTE", name: "Decantes 5ml", subcategories: ["Árabe", "Feminino", "Masculino"] },
      ],
      addCategory: (name) =>
        set((state) => ({
          categories: [...state.categories, { id: "CAT" + Date.now(), name, subcategories: [] }],
        })),
      deleteCategory: (id) =>
        set((state) => ({
          categories: state.categories.filter((c) => c.id !== id),
        })),
      addSubcategory: (categoryId, name) =>
        set((state) => ({
          categories: state.categories.map((c) =>
            c.id === categoryId
              ? { ...c, subcategories: [...c.subcategories, name] }
              : c
          ),
        })),

      addLead: (lead) =>
        set((state) => ({ leads: [...state.leads, lead] })),
      clearLeads: () => set({ leads: [] }),

      savePixConfig: (config) => set({ pixConfig: config }),
      setAdmin: (v) => set({ isAdmin: v }),
    }),
    {
      name: "mimi-mimos-storage",
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) =>
        mergePersisted(persisted, current as StoreState),
      partialize: (state) => ({
        // DO NOT persist products — D1 is the source of truth for products
        // Products are always loaded from D1 (or INITIAL_PRODUCTS as fallback)
        // Persisting them in localStorage causes stale data on next visit
        leads: state.leads,
        favorites: state.favorites,
        recentlyViewed: state.recentlyViewed,
        globalDefaultPrice: state.globalDefaultPrice,
        pixConfig: state.pixConfig,
      }),
    }
  )
);

/** Convenience standalone function for sync (used in page.tsx effects). */
export function syncProductsFromD1(): Promise<void> {
  return useStore.getState().syncProductsFromD1();
}
