import { NextResponse } from "next/server";
import {
  getD1,
  ensureMemoryProductsSeeded,
  ensureMemoryKitsSeeded,
  ensureMemoryCouponsSeeded,
  memoryProducts,
  memoryKits,
  memoryCoupons,
} from "@/lib/d1-client";
import { INITIAL_PRODUCTS } from "@/seed/products";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * POST /api/db/seed — popula o banco (D1 ou memória) com defaults.
 *
 * - D1 path: INSERT OR IGNORE — NÃO sobrescreve produtos que já existem
 *   (preserva mudanças do admin em futuros deploys).
 * - Memory path: lazily seeds products/kits/coupons from defaults if empty.
 *
 * Returns: {success, message, total, inserted, errors, source}
 */

export async function POST() {
  const d1 = getD1();
  if (d1) {
    let inserted = 0;
    let errors = 0;

    for (const p of INITIAL_PRODUCTS) {
      try {
        await d1
          .prepare(
            `INSERT OR IGNORE INTO products (id, code, name, inspiration, category, gender, price, in_stock, stock_qty, image, tags, notes_topo, notes_coracao, notes_fundo, description, family, intensity, fixation, rating, review_count, season, occasion, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
          )
          .bind(
            p.id,
            p.code,
            p.name,
            p.inspiration || "",
            p.category,
            p.gender,
            p.price,
            p.inStock ? 1 : 0,
            p.stockQty ?? 10,
            p.image || "",
            JSON.stringify(p.tags || []),
            p.notesTopo || "",
            p.notesCoracao || "",
            p.notesFundo || "",
            p.description || "",
            p.family || "",
            p.intensity || "",
            p.fixation || "",
            p.rating || 5,
            p.reviewCount || 0,
            p.season || "",
            p.occasion || ""
          )
          .run();
        inserted++;
      } catch {
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Seed complete: ${inserted} products processed, ${errors} errors`,
      total: INITIAL_PRODUCTS.length,
      inserted,
      errors,
      source: "d1",
    });
  }

  // In-memory fallback (dev): lazily seed all default stores
  try {
    await ensureMemoryProductsSeeded();
    await ensureMemoryKitsSeeded();
    await ensureMemoryCouponsSeeded();
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: String(err),
        source: "memory",
      },
      { status: 500 }
    );
  }

  const productCount = memoryProducts.length;
  const kitCount = memoryKits.length;
  const couponCount = memoryCoupons.length;
  const message =
    `Memory seed complete: ${productCount} products, ${kitCount} kits, ` +
    `${couponCount} coupons loaded from defaults.`;

  return NextResponse.json({
    success: true,
    message,
    total: INITIAL_PRODUCTS.length,
    inserted: productCount,
    errors: 0,
    source: "memory",
  });
}
