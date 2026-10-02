import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) return NextResponse.json({ success: false, error: "D1 not bound", leads: [] });
    const result = await db.prepare("SELECT * FROM leads ORDER BY created_at DESC").all();
    return NextResponse.json({ success: true, leads: result.results || [] });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err), leads: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) return NextResponse.json({ success: false, error: "D1 not bound" });
    const body = await req.json();
    await db.prepare("INSERT INTO leads (date, name, phone, product) VALUES (?, ?, ?, ?)")
      .bind(body.date || new Date().toLocaleString("pt-BR"), body.name || "", body.phone || "", body.product || "").run();
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) return NextResponse.json({ success: false, error: "D1 not bound" });
    await db.prepare("DELETE FROM leads").run();
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
