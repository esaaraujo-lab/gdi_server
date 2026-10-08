import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/** GET /api/db/coupons — lista todos os cupons, ordenados por created_at DESC */
export async function GET() {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) {
      return NextResponse.json({ success: false, error: "D1 not bound", coupons: [] });
    }
    const result = await db
      .prepare(
        `SELECT code, type, value, description, min_subtotal AS minSubtotal, expires_at AS expiresAt, active, created_at AS createdAt
         FROM coupons ORDER BY created_at DESC`
      )
      .all();
    const coupons = (result.results || []).map((row: any) => ({
      code: row.code,
      type: row.type,
      value: row.value,
      description: row.description,
      minSubtotal: row.minSubtotal ?? 0,
      expiresAt: row.expiresAt ?? null,
      active: row.active === 1,
      createdAt: row.createdAt,
    }));
    return NextResponse.json({ success: true, coupons });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err), coupons: [] },
      { status: 200 }
    );
  }
}

/** POST /api/db/coupons — cria ou atualiza cupom (INSERT OR REPLACE por code) */
export async function POST(req: NextRequest) {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) {
      return NextResponse.json({ success: false, error: "D1 not bound" });
    }
    const body = await req.json();
    const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
    const type = typeof body?.type === "string" ? body.type : "percent";
    const value = Number.isFinite(body?.value) ? Number(body.value) : 0;
    const description = typeof body?.description === "string" ? body.description : "";
    const minSubtotal = Number.isFinite(body?.minSubtotal) ? Number(body.minSubtotal) : 0;
    const expiresAt =
      typeof body?.expiresAt === "string" && body.expiresAt ? body.expiresAt : null;
    const active = body?.active === false || body?.active === 0 ? 0 : 1;

    if (!code) {
      return NextResponse.json({ success: false, error: "Missing code" }, { status: 400 });
    }
    await db
      .prepare(
        `INSERT OR REPLACE INTO coupons (code, type, value, description, min_subtotal, expires_at, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
      .bind(code, type, value, description, minSubtotal, expiresAt, active)
      .run();
    return NextResponse.json({ success: true, code });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

/** PATCH /api/db/coupons?code=X — alterna o estado `active` (toggle) do cupom */
export async function PATCH(req: NextRequest) {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) {
      return NextResponse.json({ success: false, error: "D1 not bound" });
    }
    const code = req.nextUrl.searchParams.get("code");
    if (!code) {
      return NextResponse.json({ success: false, error: "Missing code" }, { status: 400 });
    }
    // Toggle: se está ativo (1) -> desativa (0), senão ativa (1).
    await db
      .prepare("UPDATE coupons SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE code = ?")
      .bind(code.trim().toUpperCase())
      .run();
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

/** DELETE /api/db/coupons?code=X — remove um cupom pelo código */
export async function DELETE(req: NextRequest) {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) {
      return NextResponse.json({ success: false, error: "D1 not bound" });
    }
    const code = req.nextUrl.searchParams.get("code");
    if (!code) {
      return NextResponse.json({ success: false, error: "Missing code" }, { status: 400 });
    }
    await db.prepare("DELETE FROM coupons WHERE code = ?").bind(code.trim().toUpperCase()).run();
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
