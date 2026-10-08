import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/** GET /api/db/reviews?productId=bc-001 — lista reviews de um produto (ou todas) */
export async function GET(req: NextRequest) {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) return NextResponse.json({ success: false, error: "D1 not bound", reviews: [] });

    const productId = req.nextUrl.searchParams.get("productId");
    if (productId) {
      const result = await db.prepare("SELECT * FROM reviews WHERE product_id = ? ORDER BY date DESC").bind(productId).all();
      return NextResponse.json({ success: true, reviews: result.results || [] });
    }
    const result = await db.prepare("SELECT * FROM reviews ORDER BY date DESC").all();
    return NextResponse.json({ success: true, reviews: result.results || [] });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err), reviews: [] }, { status: 200 });
  }
}

/** POST /api/db/reviews — adiciona nova review */
export async function POST(req: NextRequest) {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) return NextResponse.json({ success: false, error: "D1 not bound" });

    const body = await req.json();
    const id = `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await db.prepare("INSERT INTO reviews (id, product_id, author, rating, comment, date) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, body.productId, body.author || "Cliente anônimo", body.rating || 5, body.comment, new Date().toISOString())
      .run();
    return NextResponse.json({ success: true, id });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

/** DELETE /api/db/reviews?id=r-xxx — remove uma única review
 *  DELETE /api/db/reviews (sem id) — remove TODAS as reviews (admin wipe)
 */
export async function DELETE(req: NextRequest) {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) return NextResponse.json({ success: false, error: "D1 not bound" });

    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      // Admin "Limpar Tudo" — delete all reviews
      await db.prepare("DELETE FROM reviews").run();
      return NextResponse.json({ success: true, cleared: true });
    }
    await db.prepare("DELETE FROM reviews WHERE id = ?").bind(id).run();
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
