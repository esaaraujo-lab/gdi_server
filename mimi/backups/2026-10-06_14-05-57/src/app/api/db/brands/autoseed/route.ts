import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// In-memory brands (shared with brands route via module scope)
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

// Share memory with brands route by using globalThis
const g = globalThis as unknown as {
  __memoryBrands?: InMemoryBrand[];
  __memoryBrandProducts?: InMemoryBrandProduct[];
};
if (!g.__memoryBrands) g.__memoryBrands = [];
if (!g.__memoryBrandProducts) g.__memoryBrandProducts = [];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * POST /api/db/brands/autoseed
 */
export async function POST() {
  const d1 = getD1();

  let products: { id: string; inspiration: string }[] = [];

  if (d1) {
    try {
      const result = await d1
        .prepare("SELECT id, inspiration FROM products WHERE inspiration IS NOT NULL AND inspiration != ''")
        .all();
      products = (result.results || []) as { id: string; inspiration: string }[];
    } catch (err) {
      return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
    }
  } else {
    try {
      const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
      const res = await fetch(`${base}/api/db/products`);
      if (!res.ok) return NextResponse.json({ success: false, error: "Failed to fetch products" });
      const data = await res.json();
      if (data?.success && Array.isArray(data.products)) {
        products = data.products
          .filter((p: { inspiration?: string }) => p.inspiration)
          .map((p: { id: string; inspiration: string }) => ({ id: p.id, inspiration: p.inspiration }));
      }
    } catch {
      return NextResponse.json({ success: false, error: "Failed to fetch products from API" });
    }
  }

  if (products.length === 0) {
    return NextResponse.json({ success: false, error: "No products found with inspiration field" });
  }

  const brandMap = new Map<string, string[]>();

  for (const p of products) {
    const inspiration = p.inspiration || "";
    let brandName: string | null = null;

    const match = inspiration.match(/\(([^()]+)\)\s*$/);
    if (match && match[1]) {
      brandName = match[1].trim();
    } else {
      const trimmed = inspiration.trim();
      if (trimmed.length > 0 && trimmed.length <= 50) {
        brandName = trimmed;
      }
    }

    if (brandName) {
      if (!brandMap.has(brandName)) brandMap.set(brandName, []);
      brandMap.get(brandName)!.push(p.id);
    }
  }

  if (brandMap.size === 0) {
    return NextResponse.json({ success: false, error: "No brands could be extracted" });
  }

  let created = 0;
  let linked = 0;
  const now = new Date().toISOString();

  // Collect created brands for response
  const createdBrands: { id: string; name: string; slug: string; isActive: boolean; sortOrder: number; productCount: number }[] = [];
  const createdLinks: { brandId: string; productId: string }[] = [];

  for (const [brandName, productIds] of brandMap) {
    const brandId = `brand_${slugify(brandName).slice(0, 30)}`;

    if (d1) {
      try {
        await d1
          .prepare("INSERT OR IGNORE INTO brands (id, name, slug, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?)")
          .bind(brandId, brandName, slugify(brandName), created, now, now)
          .run();
        created++;
        for (const productId of productIds) {
          await d1
            .prepare("INSERT OR IGNORE INTO brand_products (id, brand_id, product_id) VALUES (?, ?, ?)")
            .bind(`bp_${brandId}_${productId}`, brandId, productId)
            .run();
          linked++;
          createdLinks.push({ brandId, productId });
        }
        createdBrands.push({ id: brandId, name: brandName, slug: slugify(brandName), isActive: true, sortOrder: created, productCount: productIds.length });
      } catch {}
    } else {
      // In-memory: return data for the store to use
      created++;
      for (const productId of productIds) {
        linked++;
        createdLinks.push({ brandId, productId });
      }
      createdBrands.push({ id: brandId, name: brandName, slug: slugify(brandName), isActive: true, sortOrder: created, productCount: productIds.length });
    }
  }

  return NextResponse.json({
    success: true, created, linked, totalBrands: brandMap.size,
    brands: createdBrands, links: createdLinks,
    source: d1 ? "d1" : "memory",
  });
}
