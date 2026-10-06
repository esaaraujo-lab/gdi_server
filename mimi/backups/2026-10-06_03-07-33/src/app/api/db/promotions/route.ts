import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Promotions API — CRUD backed by D1 (production) or in-memory (dev).
 *
 * GET    /api/db/promotions            → list all promotions
 * POST   /api/db/promotions            → upsert (INSERT OR REPLACE) a promotion
 * DELETE /api/db/promotions?id=xxx     → delete a promotion by id
 *
 * Promotions are manageable special offers (3 decantes R$100, Black Friday,
 * seasonal promos). They do NOT touch product prices/stock — only display.
 */

export interface Promotion {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  badgeText: string | null;
  eyebrow: string;
  productIds: string[];
  bundleQty: number;
  bundlePrice: number;
  originalPrice: number;
  discountText: string | null;
  imageUrl: string | null;
  ctaText: string;
  ctaSecondary: string | null;
  isActive: boolean;
  sortOrder: number;
  validFrom: string | null;
  validUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToPromotion(row: Record<string, unknown>): Promotion {
  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? ""),
    subtitle: row.subtitle ? String(row.subtitle) : null,
    description: row.description ? String(row.description) : null,
    badgeText: row.badge_text ? String(row.badge_text) : null,
    eyebrow: String(row.eyebrow ?? "Oferta Especial"),
    productIds: JSON.parse(String(row.product_ids || "[]")),
    bundleQty: Number(row.bundle_qty ?? 3),
    bundlePrice: Number(row.bundle_price ?? 100),
    originalPrice: Number(row.original_price ?? 119.97),
    discountText: row.discount_text ? String(row.discount_text) : null,
    imageUrl: row.image_url ? String(row.image_url) : null,
    ctaText: String(row.cta_text ?? "Montar Meu Kit"),
    ctaSecondary: row.cta_secondary ? String(row.cta_secondary) : null,
    isActive: Number(row.is_active ?? 1) > 0,
    sortOrder: Number(row.sort_order ?? 0),
    validFrom: row.valid_from ? String(row.valid_from) : null,
    validUntil: row.valid_until ? String(row.valid_until) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

// In-memory fallback for dev (when D1 not bound)
interface InMemoryPromotion extends Omit<Promotion, "productIds" | "isActive"> {
  product_ids: string;
  is_active: number;
  badge_text: string | null;
  bundle_qty: number;
  bundle_price: number;
  original_price: number;
  discount_text: string | null;
  image_url: string | null;
  cta_text: string;
  cta_secondary: string | null;
  valid_from: string | null;
  valid_until: string | null;
  sort_order: number;
  eyebrow: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  id: string;
  created_at: string;
  updated_at: string;
}

const memoryPromotions: InMemoryPromotion[] = [
  {
    id: "promo-default-3decantes",
    title: "Descubra sua fragrância favorita",
    subtitle: "Oferta Especial",
    description:
      "Experimente 3 fragrâncias diferentes em 5ml cada — a forma mais inteligente de explorar o universo olfativo antes de investir no frasco completo.",
    badge_text: "R$100",
    eyebrow: "Oferta Especial",
    product_ids: "[]",
    bundle_qty: 3,
    bundle_price: 100,
    original_price: 119.97,
    discount_text: "Economia R$19,97",
    image_url: null,
    cta_text: "Montar Meu Kit",
    cta_secondary: "Ver Todos os Decantes",
    is_active: 1,
    sort_order: 0,
    valid_from: null,
    valid_until: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export async function GET() {
  const d1 = getD1();
  if (d1) {
    try {
      const result = await d1
        .prepare(
          "SELECT * FROM promotions ORDER BY is_active DESC, sort_order ASC, created_at DESC"
        )
        .all();
      const promotions = (result.results || []).map((row) =>
        rowToPromotion(row as Record<string, unknown>)
      );
      return NextResponse.json({ success: true, promotions, source: "d1" });
    } catch (err) {
      return NextResponse.json({
        success: false,
        error: String(err),
        promotions: [],
      });
    }
  }

  // In-memory fallback (dev)
  const promotions = memoryPromotions
    .slice()
    .sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.sort_order - b.sort_order)
    .map((row) => rowToPromotion(row as unknown as Record<string, unknown>));
  return NextResponse.json({ success: true, promotions, source: "memory" });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = body.id || `promo_${Date.now()}`;
  const now = new Date().toISOString();

  const promo = {
    id,
    title: String(body.title ?? ""),
    subtitle: body.subtitle ? String(body.subtitle) : null,
    description: body.description ? String(body.description) : null,
    badge_text: body.badgeText ? String(body.badgeText) : null,
    eyebrow: String(body.eyebrow ?? "Oferta Especial"),
    product_ids: JSON.stringify(body.productIds ?? []),
    bundle_qty: Number(body.bundleQty ?? 3),
    bundle_price: Number(body.bundlePrice ?? 100),
    original_price: Number(body.originalPrice ?? 119.97),
    discount_text: body.discountText ? String(body.discountText) : null,
    image_url: body.imageUrl ? String(body.imageUrl) : null,
    cta_text: String(body.ctaText ?? "Montar Meu Kit"),
    cta_secondary: body.ctaSecondary ? String(body.ctaSecondary) : null,
    is_active: body.isActive ? 1 : 0,
    sort_order: Number(body.sortOrder ?? 0),
    valid_from: body.validFrom ? String(body.validFrom) : null,
    valid_until: body.validUntil ? String(body.validUntil) : null,
    updated_at: now,
  };

  const d1 = getD1();
  if (d1) {
    try {
      await d1
        .prepare(
          `INSERT OR REPLACE INTO promotions (
            id, title, subtitle, description, badge_text, eyebrow,
            product_ids, bundle_qty, bundle_price, original_price, discount_text,
            image_url, cta_text, cta_secondary,
            is_active, sort_order, valid_from, valid_until, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          promo.id,
          promo.title,
          promo.subtitle,
          promo.description,
          promo.badge_text,
          promo.eyebrow,
          promo.product_ids,
          promo.bundle_qty,
          promo.bundle_price,
          promo.original_price,
          promo.discount_text,
          promo.image_url,
          promo.cta_text,
          promo.cta_secondary,
          promo.is_active,
          promo.sort_order,
          promo.valid_from,
          promo.valid_until,
          now,
          promo.updated_at
        )
        .run();
      return NextResponse.json({ success: true, id, source: "d1" });
    } catch (err) {
      return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
    }
  }

  // In-memory fallback
  const idx = memoryPromotions.findIndex((p) => p.id === id);
  const newPromo: InMemoryPromotion = {
    ...promo,
    created_at: idx >= 0 ? memoryPromotions[idx].created_at : now,
  };
  if (idx >= 0) memoryPromotions[idx] = newPromo;
  else memoryPromotions.push(newPromo);
  return NextResponse.json({ success: true, id, source: "memory" });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { success: false, error: "Missing id" },
      { status: 400 }
    );
  }

  const d1 = getD1();
  if (d1) {
    try {
      await d1.prepare("DELETE FROM promotions WHERE id = ?").bind(id).run();
      return NextResponse.json({ success: true, id, source: "d1" });
    } catch (err) {
      return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
    }
  }

  const idx = memoryPromotions.findIndex((p) => p.id === id);
  if (idx >= 0) memoryPromotions.splice(idx, 1);
  return NextResponse.json({ success: true, id, source: "memory" });
}
