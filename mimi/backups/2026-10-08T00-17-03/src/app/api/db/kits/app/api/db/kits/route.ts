import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Helper — parse `product_ids` column (stored as JSON text) into array.
 * Falls back to [] on parse failure.
 */
function parseProductIds(raw: any): string[] {
  if (Array.isArray(raw)) return raw.filter((x) => typeof x === "string");
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** GET /api/db/kits — lista todos os kits, ordenados por created_at DESC */
export async function GET() {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) {
      return NextResponse.json({ success: false, error: "D1 not bound", kits: [] });
    }
    const result = await db
      .prepare(
        `SELECT id, name, description, product_ids AS productIds, price, image, badge, active, created_at AS createdAt
         FROM kits ORDER BY created_at DESC`
      )
      .all();
    const kits = (result.results || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description || "",
      productIds: parseProductIds(row.productIds),
      price: typeof row.price === "number" ? row.price : Number(row.price) || 0,
      image: row.image || "",
      badge: row.badge || "",
      active: row.active === 1,
      createdAt: row.createdAt,
    }));
    return NextResponse.json({ success: true, kits });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err), kits: [] },
      { status: 200 }
    );
  }
}

/** POST /api/db/kits — cria ou atualiza kit (INSERT OR REPLACE por id) */
export async function POST(req: NextRequest) {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) {
      return NextResponse.json({ success: false, error: "D1 not bound" });
    }
    const body = await req.json();
    const id = typeof body?.id === "string" ? body.id : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const description = typeof body?.description === "string" ? body.description : "";
    const productIds = Array.isArray(body?.productIds)
      ? body.productIds.filter((x: any) => typeof x === "string").slice(0, 3)
      : [];
    const price = Number.isFinite(body?.price) ? Number(body.price) : 0;
    const image = typeof body?.image === "string" ? body.image : "";
    const badge = typeof body?.badge === "string" ? body.badge : "";
    const active = body?.active === false || body?.active === 0 ? 0 : 1;

    if (!id || !name) {
      return NextResponse.json(
        { success: false, error: "Missing id or name" },
        { status: 400 }
      );
    }
    await db
      .prepare(
        `INSERT OR REPLACE INTO kits (id, name, description, product_ids, price, image, badge, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
      .bind(
        id,
        name,
        description,
        JSON.stringify(productIds),
        price,
        image,
        badge,
        active
      )
      .run();
    return NextResponse.json({ success: true, id });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

/** DELETE /api/db/kits?id=xxx — remove um kit pelo id */
export async function DELETE(req: NextRequest) {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) {
      return NextResponse.json({ success: false, error: "D1 not bound" });
    }
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing id" },
        { status: 400 }
      );
    }
    await db.prepare("DELETE FROM kits WHERE id = ?").bind(id).run();
    return NextResponse.json({ success: true, id });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
