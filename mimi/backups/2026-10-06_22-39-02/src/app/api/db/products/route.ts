import { NextRequest, NextResponse } from "next/server";
import {
  getD1,
  ensureMemoryProductsSeeded,
  memoryProducts,
  type InMemoryProduct,
} from "@/lib/d1-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Products API — full CRUD backed by D1 (production) or in-memory (dev).
 *
 * GET    /api/db/products            → list all products
 * POST   /api/db/products            → upsert (INSERT OR REPLACE) a product
 * DELETE /api/db/products?id=xxx     → delete a product by id
 */

function rowToProduct(row: InMemoryProduct | Record<string, unknown>) {
  const r = row as Record<string, unknown>;
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    inspiration: r.inspiration ?? "",
    category: r.category,
    gender: r.gender,
    price: r.price,
    // IMPORTANT: inStock must read from the explicit `in_stock` column (0/1),
    // NOT from stock_qty. The admin can toggle availability (in_stock) without
    // changing stock_qty, so using stock_qty as a fallback for inStock causes
    // a bug where toggled-off products still show as available.
    inStock: Number(r.in_stock ?? 1) > 0,
    stockQty: Number(r.stock_qty ?? 10),
    image: r.image ?? "",
    tags: JSON.parse((r.tags as string) || "[]"),
    notesTopo: r.notes_topo ?? "",
    notesCoracao: r.notes_coracao ?? "",
    notesFundo: r.notes_fundo ?? "",
    description: r.description ?? "",
    family: r.family ?? "",
    intensity: r.intensity ?? "Eau de Parfum",
    fixation: r.fixation ?? "até 8h",
    rating: Number(r.rating ?? 5),
    reviewCount: Number(r.review_count ?? 0),
    season: r.season ?? "",
    occasion: r.occasion ?? "",
  };
}

export async function GET() {
  const d1 = getD1();
  if (d1) {
    try {
      const result = await d1
        .prepare("SELECT * FROM products ORDER BY code ASC")
        .all();
      const products = (result.results || []).map((row) => rowToProduct(row as Record<string, unknown>));
      return NextResponse.json({ success: true, products, source: "d1" });
    } catch (err) {
      return NextResponse.json({
        success: false,
        error: String(err),
        products: [],
      });
    }
  }

  // In-memory fallback (dev)
  await ensureMemoryProductsSeeded();
  const products = memoryProducts
    .slice()
    .sort((a, b) => String(a.code).localeCompare(String(b.code)))
    .map((row) => rowToProduct(row));
  return NextResponse.json({ success: true, products, source: "memory" });
}

export async function POST(req: NextRequest) {
  let p: Record<string, unknown>;
  try {
    p = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "invalid JSON" }, { status: 400 });
  }

  const d1 = getD1();
  if (d1) {
    try {
      await d1
        .prepare(
          `INSERT OR REPLACE INTO products (id, code, name, inspiration, category, gender, price, in_stock, stock_qty, image, tags, notes_topo, notes_coracao, notes_fundo, description, family, intensity, fixation, rating, review_count, season, occasion, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        )
        .bind(
          p.id, p.code, p.name, p.inspiration || "", p.category, p.gender, p.price,
          p.inStock ? 1 : 0, p.stockQty ?? 10, p.image || "",
          JSON.stringify(p.tags || []), p.notesTopo || "", p.notesCoracao || "",
          p.notesFundo || "", p.description || "", p.family || "", p.intensity || "",
          p.fixation || "", p.rating || 5, p.reviewCount || 0, p.season || "", p.occasion || ""
        )
        .run();
      return NextResponse.json({ success: true, source: "d1" });
    } catch (err) {
      return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
    }
  }

  // In-memory fallback (dev)
  await ensureMemoryProductsSeeded();
  const idx = memoryProducts.findIndex((row) => row.id === p.id);
  const newRow: InMemoryProduct = {
    id: String(p.id),
    code: String(p.code ?? ""),
    name: String(p.name ?? ""),
    inspiration: String(p.inspiration ?? ""),
    category: String(p.category ?? "BRAND"),
    gender: String(p.gender ?? "UNISSEX"),
    price: Number(p.price ?? 0),
    in_stock: p.inStock ? 1 : 0,
    stock_qty: Number(p.stockQty ?? 10),
    image: String(p.image ?? ""),
    tags: JSON.stringify(p.tags || []),
    notes_topo: String(p.notesTopo ?? ""),
    notes_coracao: String(p.notesCoracao ?? ""),
    notes_fundo: String(p.notesFundo ?? ""),
    description: String(p.description ?? ""),
    family: String(p.family ?? ""),
    intensity: String(p.intensity ?? "Eau de Parfum"),
    fixation: String(p.fixation ?? "até 8h"),
    rating: Number(p.rating ?? 5),
    review_count: Number(p.reviewCount ?? 0),
    season: String(p.season ?? ""),
    occasion: String(p.occasion ?? ""),
    updated_at: new Date().toISOString(),
  };
  if (idx >= 0) {
    memoryProducts[idx] = newRow;
  } else {
    memoryProducts.push(newRow);
  }
  return NextResponse.json({ success: true, source: "memory" });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
  }

  const d1 = getD1();
  if (d1) {
    try {
      await d1.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
      return NextResponse.json({ success: true, source: "d1" });
    } catch (err) {
      return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
    }
  }

  // In-memory fallback (dev)
  await ensureMemoryProductsSeeded();
  const idx = memoryProducts.findIndex((row) => row.id === id);
  if (idx >= 0) memoryProducts.splice(idx, 1);
  return NextResponse.json({ success: true, id, source: "memory" });
}
