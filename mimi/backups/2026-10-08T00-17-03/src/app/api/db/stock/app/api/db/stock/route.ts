import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/** GET /api/db/stock?id=bc-001 — get stock for product (or all) */
/** PATCH /api/db/stock?id=bc-001&qty=5 — update stock qty */
export async function GET(req: NextRequest) {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) return NextResponse.json({ success: false, error: "D1 not bound" });

    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const result = await db.prepare("SELECT stock_qty, in_stock FROM products WHERE id = ?").bind(id).first();
      return NextResponse.json({ success: true, ...result });
    }
    const result = await db.prepare("SELECT id, stock_qty, in_stock FROM products ORDER BY code").all();
    return NextResponse.json({ success: true, stock: result.results || [] });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 200 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) return NextResponse.json({ success: false, error: "D1 not bound" });

    const id = req.nextUrl.searchParams.get("id");
    const qty = parseInt(req.nextUrl.searchParams.get("qty") || "0");
    if (!id) return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });

    await db.prepare("UPDATE products SET stock_qty = ?, in_stock = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(qty, qty > 0 ? 1 : 0, id).run();
    return NextResponse.json({ success: true, id, qty });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
