import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

export const dynamic = "force-dynamic";

/** GET /api/db/products — lista todos os produtos do D1 */
export async function GET() {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) {
      return NextResponse.json({ success: false, error: "D1 not bound", products: [] });
    }
    const stmt = db.prepare("SELECT * FROM products ORDER BY code ASC");
    const result = await stmt.all();
    const products = (result.results || []).map((row: any) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      inspiration: row.inspiration,
      category: row.category,
      gender: row.gender,
      price: row.price,
      inStock: row.in_stock === 1,
      stockQty: row.stock_qty,
      image: row.image,
      tags: JSON.parse(row.tags || "[]"),
      notesTopo: row.notes_topo,
      notesCoracao: row.notes_coracao,
      notesFundo: row.notes_fundo,
      description: row.description,
      family: row.family,
      intensity: row.intensity,
      fixation: row.fixation,
      rating: row.rating,
      reviewCount: row.review_count,
      season: row.season,
      occasion: row.occasion,
    }));
    return NextResponse.json({ success: true, products });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err), products: [] },
      { status: 200 }
    );
  }
}

/** DELETE /api/db/products?id=bc-001 — remove produto do D1 */
export async function DELETE(req: NextRequest) {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) {
      return NextResponse.json({ success: false, error: "D1 not bound" });
    }
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
    }
    await db.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
    return NextResponse.json({ success: true, id });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

/** POST /api/db/products — cria ou atualiza produto */
export async function POST(req: NextRequest) {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) {
      return NextResponse.json({ success: false, error: "D1 not bound" });
    }
    const p = await req.json();
    await db.prepare(
      `INSERT OR REPLACE INTO products (id, code, name, inspiration, category, gender, price, in_stock, stock_qty, image, tags, notes_topo, notes_coracao, notes_fundo, description, family, intensity, fixation, rating, review_count, season, occasion, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(
      p.id, p.code, p.name, p.inspiration || "", p.category, p.gender, p.price,
      p.inStock ? 1 : 0, p.stockQty ?? 10, p.image || "",
      JSON.stringify(p.tags || []), p.notesTopo || "", p.notesCoracao || "", p.notesFundo || "",
      p.description || "", p.family || "", p.intensity || "", p.fixation || "",
      p.rating || 5, p.reviewCount || 0, p.season || "", p.occasion || ""
    ).run();
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
