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
  // D1 sync state
  d1Synced: boolean;
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
  updateStockQty: (id: string, qty: number) => void;
  deleteProduct: (id: string) => void;
  addProduct: (p: Perfume) => void;
  applyGlobalPrice: (price: number) => void;
  // categories
  categories: { id: string; name: string; subcategories: string[] }[];
  addCategory: (name: string) => void;
  deleteCategory: (id: string) => void;
  addSubcategory: (categoryId: string, name: string) => void;
  /** D1 SYNC — fetch categories (with subcategories) from D1 and merge into store */
  syncCategoriesFromD1: () => Promise<void>;
  // leads
  addLead: (lead: Lead) => void;
  clearLeads: () => void;
  // pix config
  savePixConfig: (config: PixConfig) => void;
  // admin
  setAdmin: (v: boolean) => void;
  // D1 sync — fetches all data from D1 and merges into the store
  syncFromD1: () => Promise<void>;
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
    // Derive inStock from stockQty if possible — stockQty is the source of truth
    stockQty: typeof p.stockQty === "number" ? p.stockQty : ref.stockQty ?? 10,
    inStock: typeof p.stockQty === "number"
      ? p.stockQty > 0
      : (p.inStock ?? ref.inStock ?? true),
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
    // Gallery images: D1 doesn't have a column for this yet — fall back to the
    // INITIAL_PRODUCTS reference (where the gallery is hardcodeada).
    // If neither has images, the field is `undefined` (no gallery shown).
    images:
      Array.isArray(p.images) && p.images.length > 0
        ? p.images
        : Array.isArray(ref.images) && ref.images.length > 0
        ? ref.images
        : undefined,
  };
}

/** Merge persistido + estado atual, normalizando produtos para o schema novo. */
function mergePersisted(
  persisted: unknown,
  currentState: StoreState
): StoreState {
  if (!persisted || typeof persisted !== "object") return currentState;
  const p = persisted as Partial<StoreState>;
  const mergedProducts = Array.isArray(p.products)
    ? p.products.map(normalizePerfume)
    : currentState.products;
  return {
    ...currentState,
    ...p,
    products: mergedProducts,
    favorites: Array.isArray(p.favorites) ? p.favorites : [],
    recentlyViewed: Array.isArray(p.recentlyViewed) ? p.recentlyViewed : [],
    leads: Array.isArray(p.leads) ? p.leads : [],
    d1Synced: false, // always start false; syncFromD1 will set to true
  };
}

/** D1 SYNC — helper: fire-and-forget fetch with error swallowing. */
function d1SyncFetch(url: string, options?: RequestInit, label = "D1 sync") {
  if (typeof window === "undefined") return; // server-side safety
  void fetch(url, options)
    .then((res) => {
      if (!res.ok) console.warn(`[${label}] HTTP ${res.status}`);
      return res.json().catch(() => null);
    })
    .catch((err) => console.warn(`[${label}] failed:`, err));
}

/** D1 SYNC — merge D1 products with INITIAL_PRODUCTS + current state. */
function mergeD1Products(
  d1Products: Perfume[],
  currentProducts: Perfume[]
): Perfume[] {
  const d1ById = new Map<string, Perfume>();
  for (const p of d1Products) {
    if (p && p.id) d1ById.set(p.id, normalizePerfume(p as Perfume));
  }
  const currentById = new Map<string, Perfume>();
  for (const p of currentProducts) currentById.set(p.id, p);

  const seen = new Set<string>();
  const merged: Perfume[] = [];

  // Pass 1: preserve INITIAL_PRODUCTS catalog order, prefer D1 version, else current
  for (const init of INITIAL_PRODUCTS) {
    const d1Version = d1ById.get(init.id);
    const currentVersion = currentById.get(init.id);
    const finalVersion = d1Version ?? currentVersion ?? init;
    merged.push(finalVersion);
    seen.add(init.id);
  }

  // Pass 2: D1-only products (added by admin via D1) not in INITIAL_PRODUCTS
  for (const [id, d1Version] of d1ById.entries()) {
    if (!seen.has(id)) {
      merged.push(d1Version);
      seen.add(id);
    }
  }

  // Pass 3: local-only products (current state) not in INITIAL_PRODUCTS or D1 — keep as cache
  for (const [id, currentVersion] of currentById.entries()) {
    if (!seen.has(id)) {
      merged.push(currentVersion);
      seen.add(id);
    }
  }

  return merged;
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
      d1Synced: false,

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
        // D1 SYNC — upsert full product so price persists cross-device
        const updated = get().products.find((p) => p.id === id);
        if (updated) {
          d1SyncFetch("/api/db/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updated),
          }, "D1 sync updateProductPrice");
        }
      },
      updateProduct: (id, updates) => {
        set((state) => ({
          products: state.products.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        }));
        // D1 SYNC — upsert full updated product (fire-and-forget)
        const updated = get().products.find((p) => p.id === id);
        if (updated) {
          d1SyncFetch("/api/db/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updated),
          }, "D1 sync updateProduct");
        }
      },
      toggleStock: (id) => {
        set((state) => ({
          products: state.products.map((p) =>
            p.id === id ? { ...p, inStock: !p.inStock } : p
          ),
        }));
        // D1 SYNC — upsert full product to preserve stockQty while toggling inStock
        const updated = get().products.find((p) => p.id === id);
        if (updated) {
          d1SyncFetch("/api/db/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updated),
          }, "D1 sync toggleStock");
        }
      },
      updateStockQty: (id, qty) => {
        const safeQty = Math.max(0, qty);
        set((state) => ({
          products: state.products.map((p) =>
            p.id === id
              ? { ...p, stockQty: safeQty, inStock: safeQty > 0 }
              : p
          ),
        }));
        // D1 SYNC — PATCH stock endpoint (lightweight, only qty + in_stock)
        d1SyncFetch(
          `/api/db/stock?id=${encodeURIComponent(id)}&qty=${safeQty}`,
          { method: "PATCH" },
          "D1 sync updateStockQty"
        );
      },
      deleteProduct: (id) => {
        set((state) => ({ products: state.products.filter((p) => p.id !== id) }));
        // D1 SYNC — DELETE product from D1 (fire-and-forget)
        d1SyncFetch(
          `/api/db/products?id=${encodeURIComponent(id)}`,
          { method: "DELETE" },
          "D1 sync deleteProduct"
        );
      },
      addProduct: (p) => {
        set((state) => ({ products: [p, ...state.products] }));
        // D1 SYNC — upsert new product to D1 (fire-and-forget)
        d1SyncFetch("/api/db/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(p),
        }, "D1 sync addProduct");
      },
      applyGlobalPrice: (price) => {
        set((state) => ({
          globalDefaultPrice: price,
          products: state.products.map((p) => ({ ...p, price })),
        }));
        // D1 SYNC — upsert every product to D1 (fire-and-forget, parallel)
        for (const p of get().products) {
          d1SyncFetch("/api/db/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(p),
          }, "D1 sync applyGlobalPrice");
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
        // D1 SYNC — upsert category (fire-and-forget)
        d1SyncFetch("/api/db/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "upsertCategory", id, name }),
        }, "D1 sync addCategory");
      },
      deleteCategory: (id) => {
        set((state) => ({
          categories: state.categories.filter((c) => c.id !== id),
        }));
        // D1 SYNC — delete category + cascade subcategories (fire-and-forget)
        d1SyncFetch(
          `/api/db/categories?id=${encodeURIComponent(id)}`,
          { method: "DELETE" },
          "D1 sync deleteCategory"
        );
      },
      addSubcategory: (categoryId, name) => {
        set((state) => ({
          categories: state.categories.map((c) =>
            c.id === categoryId
              ? { ...c, subcategories: [...c.subcategories, name] }
              : c
          ),
        }));
        // D1 SYNC — add subcategory to D1 (fire-and-forget)
        d1SyncFetch("/api/db/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "addSubcategory", categoryId, name }),
        }, "D1 sync addSubcategory");
      },

      addLead: (lead) => {
        set((state) => ({ leads: [...state.leads, lead] }));
        // D1 SYNC — persist lead to D1 (fire-and-forget)
        d1SyncFetch("/api/db/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: lead.date || new Date().toISOString(),
            name: lead.name,
            phone: lead.phone,
            product: lead.product,
          }),
        }, "D1 sync addLead");
      },
      clearLeads: () => {
        set({ leads: [] });
        // D1 SYNC — clear all leads from D1 (fire-and-forget)
        d1SyncFetch("/api/db/leads", { method: "DELETE" }, "D1 sync clearLeads");
      },

      savePixConfig: (config) => {
        set({ pixConfig: config });
        // D1 SYNC — persist pix config to D1 (fire-and-forget)
        d1SyncFetch("/api/db/pix-config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: config.key,
            name: config.name,
            city: config.city,
            whatsappGroup: config.whatsappGroup,
          }),
        }, "D1 sync savePixConfig");
      },
      setAdmin: (v) => set({ isAdmin: v }),

      // D1 SYNC — fetches all data from D1 and updates the store
      // Call this on app mount. Falls back gracefully to localStorage on failure.
      syncFromD1: async () => {
        // 1. Products
        try {
          const res = await fetch("/api/db/products");
          const data = await res.json();
          if (data?.success && Array.isArray(data.products) && data.products.length > 0) {
            const merged = mergeD1Products(data.products as Perfume[], get().products);
            set({ products: merged });
          }
          // If D1 empty/fails: keep localStorage cache (current state)
        } catch (err) {
          console.warn("[D1 sync] products failed:", err);
        }

        // 2. Leads
        try {
          const res = await fetch("/api/db/leads");
          const data = await res.json();
          if (data?.success && Array.isArray(data.leads) && data.leads.length > 0) {
            set({ leads: data.leads as Lead[] });
          }
        } catch (err) {
          console.warn("[D1 sync] leads failed:", err);
        }

        // 3. Pix config
        try {
          const res = await fetch("/api/db/pix-config");
          const data = await res.json();
          if (data?.success && data.config) {
            const c = data.config;
            set({
              pixConfig: {
                key: c.key || "",
                name: c.name || "",
                city: c.city || "",
                whatsappGroup: c.whatsapp_group || c.whatsappGroup || "",
              },
            });
          }
        } catch (err) {
          console.warn("[D1 sync] pix-config failed:", err);
        }

        // 4. Categories (with subcategories)
        try {
          await get().syncCategoriesFromD1();
        } catch (err) {
          console.warn("[D1 sync] categories failed:", err);
        }

        set({ d1Synced: true });
      },

      // D1 SYNC — fetch categories (with subcategories) from D1 and merge into store.
      // Merge strategy: D1 categories are appended if not already in local state
      // (preserves the hardcoded BRAND/AFEER/DECANTE defaults — D1 row ids may collide).
      // If D1 has no rows or the table doesn't exist, local state is kept unchanged.
      syncCategoriesFromD1: async () => {
        if (typeof window === "undefined") return;
        try {
          const res = await fetch("/api/db/categories", { cache: "no-store" });
          if (!res.ok) return;
          const data = await res.json();
          if (!data?.success || !Array.isArray(data.categories)) return;
          if (data.categories.length === 0) return;
          // Build merge: start with D1 categories; keep any local-only categories.
          const d1Ids = new Set(data.categories.map((c: any) => c.id));
          const localOnly = get().categories.filter((c) => !d1Ids.has(c.id));
          const merged = [
            ...data.categories.map((c: any) => ({
              id: String(c.id || ""),
              name: String(c.name || ""),
              subcategories: Array.isArray(c.subcategories)
                ? c.subcategories.map(String)
                : [],
            })),
            ...localOnly,
          ];
          set({ categories: merged });
        } catch (err) {
          console.warn("[D1 sync] categories sync failed:", err);
        }
      },
    }),
    {
      name: "mimi-mimos-storage",
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) =>
        mergePersisted(persisted, current as StoreState),
      partialize: (state) => ({
        products: state.products,
        leads: state.leads,
        favorites: state.favorites,
        recentlyViewed: state.recentlyViewed,
        globalDefaultPrice: state.globalDefaultPrice,
        pixConfig: state.pixConfig,
      }),
    }
  )
);
