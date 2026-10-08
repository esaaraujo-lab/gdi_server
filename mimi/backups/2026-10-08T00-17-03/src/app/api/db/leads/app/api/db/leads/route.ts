import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/** GET /api/db/leads — lista todos os leads (avisos "Avise-me") ordenados por data DESC */
export async function GET() {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) {
      return NextResponse.json({ success: false, error: "D1 not bound", leads: [] });
    }
    const result = await db
      .prepare(
        "SELECT id, date, name, phone, product, created_at AS createdAt FROM leads ORDER BY date DESC"
      )
      .all();
    return NextResponse.json({ success: true, leads: result.results || [] });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err), leads: [] },
      { status: 200 }
    );
  }
}

/** POST /api/db/leads — adiciona lead {date, name, phone, product} */
export async function POST(req: NextRequest) {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) {
      return NextResponse.json({ success: false, error: "D1 not bound" });
    }
    const body = await req.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
    const product = typeof body?.product === "string" ? body.product.trim() : "";
    const date = typeof body?.date === "string" && body.date ? body.date : new Date().toISOString();
    if (!name || !phone) {
      return NextResponse.json(
        { success: false, error: "Campos name e phone são obrigatórios" },
        { status: 400 }
      );
    }
    await db
      .prepare(
        "INSERT INTO leads (date, name, phone, product) VALUES (?, ?, ?, ?)"
      )
      .bind(date, name, phone, product)
      .run();
    return NextResponse.json({ success: true, date, name, phone, product });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

/** DELETE /api/db/leads — limpa todos os leads (reset administrativo) */
export async function DELETE() {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) {
      return NextResponse.json({ success: false, error: "D1 not bound" });
    }
    await db.prepare("DELETE FROM leads").run();
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
