import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Brands API — CRUD backed by D1 (production) or in-memory (dev).
 *
 * GET    /api/db/brands            → list all brands (with product counts)
 * POST   /api/db/brands            → upsert (INSERT OR REPLACE) a brand
 * DELETE /api/db/brands?id=xxx     → delete a brand by id
 *
 * POST   /api/db/brands?link=true   → link brand to product
 *   body: { brandId, productId }
 * POST   /api/db/brands?unlink=true → unlink brand from product
 *   body: { brandId, productId }
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

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// In-memory fallback for dev — shared with autoseed route via globalThis
interface InMemoryBrand {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  is_active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface InMemoryBrandProduct {
  id: string;
  brand_id: string;
  product_id: string;
  created_at: string;
}

const g = globalThis as unknown as {
  __memoryBrands?: InMemoryBrand[];
  __memoryBrandProducts?: InMemoryBrandProduct[];
};
if (!g.__memoryBrands) g.__memoryBrands = [];
if (!g.__memoryBrandProducts) g.__memoryBrandProducts = [];

const memoryBrands = g.__memoryBrands!;
const memoryBrandProducts = g.__memoryBrandProducts!;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const withProducts = searchParams.get("withProducts") === "true";

  const d1 = getD1();
  if (d1) {
    try {
      const result = await d1
        .prepare(
          `SELECT b.*, COUNT(bp.product_id) as product_count
           FROM brands b
           LEFT JOIN brand_products bp ON b.id = bp.brand_id
           GROUP BY b.id
           ORDER BY b.is_active DESC, b.sort_order ASC, b.name ASC`
        )
        .all();
      const brands: Brand[] = (result.results || []).map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: String(r.id),
          name: String(r.name),
          slug: String(r.slug),
          description: r.description ? String(r.description) : null,
          imageUrl: r.image_url ? String(r.image_url) : null,
          isActive: Number(r.is_active ?? 1) > 0,
          sortOrder: Number(r.sort_order ?? 0),
          productCount: Number(r.product_count ?? 0),
          createdAt: String(r.created_at ?? ""),
          updatedAt: String(r.updated_at ?? ""),
        };
      });

      // If withProducts=true, also return brand->product mappings
      if (withProducts) {
        const linksResult = await d1
          .prepare("SELECT brand_id, product_id FROM brand_products")
          .all();
        const links = (linksResult.results || []).map((row) => {
          const r = row as Record<string, unknown>;
          return { brandId: String(r.brand_id), productId: String(r.product_id) };
        });
        return NextResponse.json({ success: true, brands, links, source: "d1" });
      }

      return NextResponse.json({ success: true, brands, source: "d1" });
    } catch (err) {
      return NextResponse.json({
        success: false,
        error: String(err),
        brands: [],
      });
    }
  }

  // In-memory fallback (dev)
  const brands: Brand[] = memoryBrands
    .slice()
    .sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      description: b.description,
      imageUrl: b.image_url,
      isActive: b.is_active > 0,
      sortOrder: b.sort_order,
      productCount: memoryBrandProducts.filter((bp) => bp.brand_id === b.id).length,
      createdAt: b.created_at,
      updatedAt: b.updated_at,
    }));

  if (withProducts) {
    const links = memoryBrandProducts.map((bp) => ({ brandId: bp.brand_id, productId: bp.product_id }));
    return NextResponse.json({ success: true, brands, links, source: "memory" });
  }

  return NextResponse.json({ success: true, brands, source: "memory" });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const isLink = searchParams.get("link") === "true";
  const isUnlink = searchParams.get("unlink") === "true";

  // Link/unlink brand <-> product
  if (isLink || isUnlink) {
    const body = await req.json().catch(() => ({}));
    const brandId = String(body.brandId || "");
    const productId = String(body.productId || "");
    if (!brandId || !productId) {
      return NextResponse.json({ success: false, error: "brandId and productId required" }, { status: 400 });
    }

    const d1 = getD1();
    if (d1) {
      try {
        if (isLink) {
          await d1
            .prepare("INSERT OR IGNORE INTO brand_products (id, brand_id, product_id) VALUES (?, ?, ?)")
            .bind(`bp_${brandId}_${productId}`, brandId, productId)
            .run();
        } else {
          await d1.prepare("DELETE FROM brand_products WHERE brand_id = ? AND product_id = ?").bind(brandId, productId).run();
        }
        return NextResponse.json({ success: true, source: "d1" });
      } catch (err) {
        return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
      }
    }

    // In-memory
    if (isLink) {
      if (!memoryBrandProducts.find((bp) => bp.brand_id === brandId && bp.product_id === productId)) {
        memoryBrandProducts.push({ id: `bp_${brandId}_${productId}`, brand_id: brandId, product_id: productId, created_at: new Date().toISOString() });
      }
    } else {
      const idx = memoryBrandProducts.findIndex((bp) => bp.brand_id === brandId && bp.product_id === productId);
      if (idx >= 0) memoryBrandProducts.splice(idx, 1);
    }
    return NextResponse.json({ success: true, source: "memory" });
  }

  // Upsert brand
  const body = await req.json().catch(() => ({}));
  const id = body.id || `brand_${Date.now()}`;
  const now = new Date().toISOString();
  const name = String(body.name || "").trim();
  if (!name) {
    return NextResponse.json({ success: false, error: "name is required" }, { status: 400 });
  }

  const brand = {
    id,
    name,
    slug: body.slug ? String(body.slug) : slugify(name),
    description: body.description ? String(body.description) : null,
    image_url: body.imageUrl ? String(body.imageUrl) : null,
    is_active: body.isActive ? 1 : 0,
    sort_order: Number(body.sortOrder ?? 0),
    updated_at: now,
  };

  const d1 = getD1();
  if (d1) {
    try {
      await d1
        .prepare(
          `INSERT OR REPLACE INTO brands (id, name, slug, description, image_url, is_active, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          brand.id,
          brand.name,
          brand.slug,
          brand.description,
          brand.image_url,
          brand.is_active,
          brand.sort_order,
          now,
          brand.updated_at
        )
        .run();
      return NextResponse.json({ success: true, id, source: "d1" });
    } catch (err) {
      return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
    }
  }

  // In-memory
  const idx = memoryBrands.findIndex((b) => b.id === id);
  const newBrand: InMemoryBrand = {
    ...brand,
    created_at: idx >= 0 ? memoryBrands[idx].created_at : now,
  };
  if (idx >= 0) memoryBrands[idx] = newBrand;
  else memoryBrands.push(newBrand);
  return NextResponse.json({ success: true, id, source: "memory" });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
  }

  const d1 = getD1();
  if (d1) {
    try {
      await d1.prepare("DELETE FROM brand_products WHERE brand_id = ?").bind(id).run();
      await d1.prepare("DELETE FROM brands WHERE id = ?").bind(id).run();
      return NextResponse.json({ success: true, id, source: "d1" });
    } catch (err) {
      return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
    }
  }

  const idx = memoryBrands.findIndex((b) => b.id === id);
  if (idx >= 0) memoryBrands.splice(idx, 1);
  // Also remove links
  for (let i = memoryBrandProducts.length - 1; i >= 0; i--) {
    if (memoryBrandProducts[i].brand_id === id) memoryBrandProducts.splice(i, 1);
  }
  return NextResponse.json({ success: true, id, source: "memory" });
}
