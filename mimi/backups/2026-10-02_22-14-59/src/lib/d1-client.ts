/**
 * D1 client helper — Task 51-A (Orders + Customers).
 *
 * Uses `getRequestContext` from `@cloudflare/next-on-pages` to access the
 * Cloudflare D1 binding (`env.DB`) when running on Cloudflare Pages.
 *
 * During local `next dev` there is no Cloudflare context, so we fall back to
 * an in-memory store so the admin UI keeps working end-to-end. Writes/reads
 * against memory are obviously ephemeral but they let the dev experience
 * stay functional without a real binding.
 */

import { getOptionalRequestContext } from "@cloudflare/next-on-pages";

/**
 * Minimal D1 binding surface used by this app. Defining it locally avoids a
 * hard dependency on `@cloudflare/workers-types` in dev (where it isn't
 * installed directly). The real Cloudflare D1 binding matches this shape.
 */
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  all(): Promise<{ results?: unknown[]; success: boolean; meta?: unknown }>;
  first<T = unknown>(): Promise<T | null>;
  run<T = unknown>(): Promise<{ success: boolean; meta?: T }>;
}

export interface D1Database {
  prepare(query: string): D1Statement;
}

// Augment the CloudflareEnv global so TS knows about our `DB` binding.
declare global {
  interface CloudflareEnv {
    DB?: D1Database;
  }
}

export interface D1Row {
  [column: string]: unknown;
}

export interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  meta?: Record<string, unknown>;
}

/**
 * Returns the live D1 binding if we are running on Cloudflare Pages,
 * or `null` if no context is available (local dev / next dev).
 */
export function getD1(): D1Database | null {
  try {
    const ctx = getOptionalRequestContext();
    return ctx?.env?.DB ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// In-memory fallback (dev only). Mirrors the same shape as the D1 tables.
// ---------------------------------------------------------------------------

export interface InMemoryOrder {
  id: string;
  txid: string | null;
  customer_name: string;
  customer_whatsapp: string;
  customer_email: string | null;
  shipping_name: string | null;
  shipping_price: number;
  shipping_address: string | null;
  shipping_cep: string | null;
  coupon_code: string | null;
  coupon_discount: number;
  gift_wrap: number;
  gift_wrap_price: number;
  gift_message: string | null;
  items_json: string | null;
  subtotal: number;
  total: number;
  status: string;
  payment_method: string;
  created_at: string;
  confirmed_at: string | null;
}

export interface InMemoryCustomer {
  id: string;
  name: string;
  whatsapp: string;
  email: string | null;
  device_name: string | null;
  device_type: string | null;
  total_orders: number;
  total_spent: number;
  first_visit: string;
  last_visit: string;
  created_at: string;
}

export const memoryOrders: InMemoryOrder[] = [];
export const memoryCustomers: InMemoryCustomer[] = [];

// ---------------------------------------------------------------------------
// In-memory stores for the other D1 tables (dev fallback).
// These mirror the D1 table shapes and are seeded lazily on first access.
// ---------------------------------------------------------------------------

// Products — mirrors the `products` table row shape (snake_case columns)
export interface InMemoryProduct {
  id: string;
  code: string;
  name: string;
  inspiration: string;
  category: string;
  gender: string;
  price: number;
  in_stock: number;
  stock_qty: number;
  image: string;
  tags: string; // JSON string
  notes_topo: string;
  notes_coracao: string;
  notes_fundo: string;
  description: string;
  family: string;
  intensity: string;
  fixation: string;
  rating: number;
  review_count: number;
  season: string;
  occasion: string;
  updated_at: string;
}

export const memoryProducts: InMemoryProduct[] = [];
let memoryProductsSeeded = false;

/**
 * Lazily seed the in-memory products store from INITIAL_PRODUCTS on first
 * access. This ensures the dev API returns the full catalog even without D1.
 */
export async function ensureMemoryProductsSeeded(): Promise<void> {
  if (memoryProductsSeeded) return;
  memoryProductsSeeded = true;
  try {
    const { INITIAL_PRODUCTS } = await import("./perfumes");
    for (const p of INITIAL_PRODUCTS) {
      memoryProducts.push({
        id: p.id,
        code: p.code,
        name: p.name,
        inspiration: p.inspiration || "",
        category: p.category,
        gender: p.gender,
        price: p.price,
        in_stock: (p.inStock ?? true) ? 1 : 0,
        stock_qty: p.stockQty ?? 10,
        image: p.image || "",
        tags: JSON.stringify(p.tags || []),
        notes_topo: p.notesTopo || "",
        notes_coracao: p.notesCoracao || "",
        notes_fundo: p.notesFundo || "",
        description: p.description || "",
        family: p.family || "",
        intensity: p.intensity || "Eau de Parfum",
        fixation: p.fixation || "8 a 10h",
        rating: p.rating ?? 5,
        review_count: p.reviewCount ?? 0,
        season: p.season || "",
        occasion: p.occasion || "",
        updated_at: new Date().toISOString(),
      });
    }
  } catch {
    // If import fails, leave empty
  }
}

// Generic in-memory stores (key-value style or array)
export const memoryContent: Record<string, string> = {};
export interface InMemoryKit {
  id: string;
  name: string;
  description: string;
  product_ids: string; // JSON
  price: number;
  image: string;
  badge: string;
  active: number;
  created_at: string;
}
export const memoryKits: InMemoryKit[] = [];
export interface InMemoryCoupon {
  code: string;
  type: string;
  value: number;
  description: string;
  min_subtotal: number;
  expires_at: string | null;
  active: number;
  created_at: string;
}
export const memoryCoupons: InMemoryCoupon[] = [];
export interface InMemoryReview {
  id: string;
  product_id: string;
  author: string;
  rating: number;
  comment: string;
  created_at: string;
  approved: number;
}
export const memoryReviews: InMemoryReview[] = [];
export interface InMemoryPinned {
  product_id: string;
  badge: string;
  updated_at: string;
}
export let memoryPinned: InMemoryPinned | null = null;
export function setMemoryPinned(v: InMemoryPinned | null) {
  memoryPinned = v;
}
export interface InMemoryLead {
  id: string;
  date: string;
  name: string;
  phone: string;
  product: string;
  created_at: string;
}
export const memoryLeads: InMemoryLead[] = [];
export interface InMemoryNewsletter {
  email: string;
  created_at: string;
}
export const memoryNewsletter: InMemoryNewsletter[] = [];
export interface InMemoryCategory {
  id: string;
  name: string;
  created_at: string;
}
export const memoryCategories: InMemoryCategory[] = [];
export interface InMemorySubcategory {
  id: string;
  category_id: string;
  name: string;
}
export const memorySubcategories: InMemorySubcategory[] = [];
export const memoryPixConfig: Record<string, string> = {};

/**
 * Generates a small unique ID. Uses crypto.randomUUID when available.
 */
export function generateId(prefix = "ord"): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

// ---------------------------------------------------------------------------
// Lazy seeders for the in-memory stores (dev only). Mirror the same defaults
// the client stores ship with so admin/dev behavior matches production.
// ---------------------------------------------------------------------------

let memoryKitsSeeded = false;
/**
 * Lazily seed the in-memory kits store from DEFAULT_KITS on first access.
 */
export async function ensureMemoryKitsSeeded(): Promise<void> {
  if (memoryKitsSeeded) return;
  memoryKitsSeeded = true;
  try {
    const { DEFAULT_KITS } = await import("./kit-store");
    for (const k of DEFAULT_KITS) {
      memoryKits.push({
        id: k.id,
        name: k.name,
        description: k.description || "",
        product_ids: JSON.stringify(k.productIds || []),
        price: Number(k.price) || 0,
        image: k.image || "",
        badge: k.badge || "",
        active: k.active ? 1 : 0,
        created_at: k.createdAt || new Date().toISOString(),
      });
    }
  } catch {
    // If import fails, leave empty
  }
}

let memoryCouponsSeeded = false;
/**
 * Lazily seed the in-memory coupons store from DEFAULT_COUPONS on first access.
 */
export async function ensureMemoryCouponsSeeded(): Promise<void> {
  if (memoryCouponsSeeded) return;
  memoryCouponsSeeded = true;
  try {
    const { DEFAULT_COUPONS } = await import("./coupon-store");
    for (const c of DEFAULT_COUPONS) {
      memoryCoupons.push({
        code: c.code,
        type: c.type,
        value: Number(c.value) || 0,
        description: c.description || "",
        min_subtotal: Number(c.minSubtotal) || 0,
        expires_at: c.expiresAt ?? null,
        active: c.active ? 1 : 0,
        created_at: new Date().toISOString(),
      });
    }
  } catch {
    // If import fails, leave empty
  }
}
