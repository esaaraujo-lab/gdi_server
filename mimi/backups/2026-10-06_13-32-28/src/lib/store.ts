"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
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
  productsLoadedFromD1: boolean;
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
  syncLeadsFromD1: () => Promise<void>;
  syncPixConfigFromD1: () => Promise<void>;
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

/** Normaliza um perfume garantindo todos os campos. Sem hardcoded fallback. */
function normalizePerfume(p: Partial<Perfume> & { id: string }): Perfume {
  // Detecta schema antigo (category era "feminino"|"masculino"|"arabe"|"unissex")
  const oldCat = p.category as string | undefined;
  const isNewSchema =
    oldCat === "BRAND" || oldCat === "AFEER" || oldCat === "DECANTE";
  const category: ProductCategory = isNewSchema
    ? (oldCat as ProductCategory)
    : "BRAND";

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
    "UNISSEX";
  const tags = Array.isArray(p.tags) ? p.tags : [];
  const priceDefault =
    category === "AFEER"
      ? DEFAULT_PRICE_AFEER
      : category === "DECANTE"
      ? DEFAULT_PRICE_DECANTE
      : DEFAULT_PRICE_BRAND;

  return {
    id: p.id,
    code: p.code ?? "",
    name: p.name ?? "",
    inspiration: p.inspiration ?? "",
    category,
    gender,
    price: typeof p.price === "number" ? p.price : priceDefault,
    inStock: p.inStock ?? true,
    image: p.image ?? "",
    tags,
    notesTopo: p.notesTopo ?? "",
    notesCoracao: p.notesCoracao ?? "",
    notesFundo: p.notesFundo ?? "",
    description: p.description ?? "",
    family: p.family ?? "",
    intensity: p.intensity ?? "Eau de Parfum",
    fixation: p.fixation ?? "até 8h",
    rating: typeof p.rating === "number" ? p.rating : 5,
    reviewCount:
      typeof p.reviewCount === "number" ? p.reviewCount : 0,
    season: p.season ?? "",
    occasion: p.occasion ?? "",
    stockQty: p.stockQty ?? 10,
    images: p.images,
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

/** Merge persistido + estado atual — apenas dados do usuário (cart, favorites, recentlyViewed). */
function mergePersisted(
  persisted: unknown,
  currentState: StoreState
): StoreState {
  if (!persisted || typeof persisted !== "object") return currentState;
  const p = persisted as Partial<StoreState>;
  // ONLY load user-specific session data from localStorage:
  // - cart: user's shopping session
  // - favorites: user's wishlist
  // - recentlyViewed: browsing history
  //
  // Admin/global data (products, leads, pixConfig, globalDefaultPrice)
  // is NOT loaded from localStorage — always fetched fresh from D1.
  return {
    ...currentState,
    cart: Array.isArray(p.cart) ? p.cart : [],
    favorites: Array.isArray(p.favorites) ? p.favorites : [],
    recentlyViewed: Array.isArray(p.recentlyViewed) ? p.recentlyViewed : [],
  };
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      // Products start EMPTY — D1 is the ONLY source of truth.
      // Products are loaded from D1 on mount via syncProductsFromD1().
      // No hardcoded fallback — if D1 is down, the catalog shows a loading state.
      products: [],
      productsLoadedFromD1: false,
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
      applyGlobalPrice: (price) => {
        set((state) => ({
          globalDefaultPrice: price,
          products: state.products.map((p) => ({ ...p, price })),
        }));
        // Sync ALL products to D1 (fire-and-forget) — otherwise reload reverts
        get().products.forEach((p) => void upsertProductToD1(p));
      },
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
          // D1 is the ONLY source of truth — replace all products with D1 data.
          // No hardcoded fallback. If D1 returns products, use them.
          const d1Products = data.products.map(normalizePerfume);
          set({ products: d1Products, productsLoadedFromD1: true });
        } catch {
          // silent — keep empty array (will show loading skeleton)
        }
      },
      syncLeadsFromD1: async () => {
        try {
          const res = await fetch("/api/db/leads", { method: "GET" });
          if (!res.ok) return;
          const data = await res.json();
          if (!data?.success || !Array.isArray(data.leads)) return;
          set({
            leads: data.leads.map((l: Record<string, unknown>) => ({
              date: String(l.date ?? l.created_at ?? ""),
              name: String(l.name ?? ""),
              phone: String(l.phone ?? ""),
              product: String(l.product ?? ""),
            })),
          });
        } catch {
          // silent
        }
      },
      syncPixConfigFromD1: async () => {
        try {
          const res = await fetch("/api/db/pix-config", { method: "GET" });
          if (!res.ok) return;
          const data = await res.json();
          if (!data?.success || !data.config) return;
          const c = data.config;
          set({
            pixConfig: {
              key: String(c.key ?? ""),
              name: String(c.name ?? ""),
              city: String(c.city ?? ""),
              whatsappGroup: String(c.whatsapp_group ?? c.whatsappGroup ?? ""),
            },
          });
        } catch {
          // silent
        }
      },

      categories: [
        { id: "BRAND", name: "Brand Collection 25ml", subcategories: ["Feminino", "Masculino", "Unissex"] },
        { id: "AFEER", name: "Miniaturas Árabes Afeer", subcategories: ["Feminino", "Masculino", "Árabe"] },
        { id: "DECANTE", name: "Decantes 5ml", subcategories: ["Árabe", "Feminino", "Masculino"] },
      ],
      addCategory: (name) => {
        const id = "CAT" + Date.now();
        set((state) => ({
          categories: [...state.categories, { id, name, subcategories: [] }],
        }));
        void fetch("/api/db/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, name }),
        }).catch(() => {});
      },
      deleteCategory: (id) => {
        set((state) => ({
          categories: state.categories.filter((c) => c.id !== id),
        }));
        void fetch(`/api/db/categories?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
      },
      addSubcategory: (categoryId, name) => {
        set((state) => ({
          categories: state.categories.map((c) =>
            c.id === categoryId
              ? { ...c, subcategories: [...c.subcategories, name] }
              : c
          ),
        }));
        void fetch("/api/db/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "addSubcategory", categoryId, name }),
        }).catch(() => {});
      },

      addLead: (lead) => {
        set((state) => ({ leads: [...state.leads, lead] }));
        // Sync to D1 (fire-and-forget)
        void fetch("/api/db/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(lead),
        }).catch(() => {});
      },
      clearLeads: () => {
        set({ leads: [] });
        void fetch("/api/db/leads", { method: "DELETE" }).catch(() => {});
      },

      savePixConfig: (config) => {
        set({ pixConfig: config });
        // Sync to D1 (fire-and-forget)
        void fetch("/api/db/pix-config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
        }).catch(() => {});
      },
      setAdmin: (v) => set({ isAdmin: v }),
    }),
    {
      name: "mimi-mimos-storage",
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) =>
        mergePersisted(persisted, current as StoreState),
      partialize: (state) => ({
        // ONLY persist user-specific session data (per-browser):
        // - cart: user's shopping session
        // - favorites: user's wishlist
        // - recentlyViewed: user's browsing history
        //
        // Admin/global data (products, leads, pixConfig, globalDefaultPrice)
        // is NOT persisted — always fetched fresh from D1 (source of truth).
        // This prevents stale data across devices and after admin changes.
        cart: state.cart,
        favorites: state.favorites,
        recentlyViewed: state.recentlyViewed,
      }),
    }
  )
);

/** Convenience standalone function for sync (used in page.tsx effects). */
export function syncProductsFromD1(): Promise<void> {
  return useStore.getState().syncProductsFromD1();
}

/** Sync leads from D1 — used in admin mount to show all leads across devices. */
export function syncLeadsFromD1(): Promise<void> {
  return useStore.getState().syncLeadsFromD1();
}

/** Sync Pix config from D1 — ensures admin config is shared across devices. */
export function syncPixConfigFromD1(): Promise<void> {
  return useStore.getState().syncPixConfigFromD1();
}
