import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { INITIAL_PRODUCTS } from "@/lib/perfumes";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * POST /api/db/seed — popula o banco D1 com todos os produtos do perfumes.ts
 * Rota única para inicializar o banco. Segura (não duplica dados por causa do INSERT OR REPLACE).
 */
export async function POST() {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) {
      return NextResponse.json({ success: false, error: "D1 not bound" });
    }

    let inserted = 0;
    let errors = 0;

    for (const p of INITIAL_PRODUCTS) {
      try {
        // Use INSERT OR IGNORE — only inserts if product doesn't exist yet
        // This preserves admin changes (price, stock, inStock) on re-seed
        await db.prepare(
          `INSERT OR IGNORE INTO products (id, code, name, inspiration, category, gender, price, in_stock, stock_qty, image, tags, notes_topo, notes_coracao, notes_fundo, description, family, intensity, fixation, rating, review_count, season, occasion, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        ).bind(
          p.id, p.code, p.name, p.inspiration || "", p.category, p.gender, p.price,
          p.inStock ? 1 : 0, p.stockQty ?? 10, p.image || "",
          JSON.stringify(p.tags || []), p.notesTopo || "", p.notesCoracao || "", p.notesFundo || "",
          p.description || "", p.family || "", p.intensity || "", p.fixation || "",
          p.rating || 5, p.reviewCount || 0, p.season || "", p.occasion || ""
        ).run();
        inserted++;
      } catch {
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Seed complete: ${inserted} products inserted, ${errors} errors`,
      total: INITIAL_PRODUCTS.length,
      inserted,
      errors,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
