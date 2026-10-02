import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) return NextResponse.json({ success: false, error: "D1 not bound", pinned: null });
    const result = await db.prepare("SELECT * FROM pinned WHERE id = 1").first();
    return NextResponse.json({ success: true, pinned: result || null });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err), pinned: null });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) return NextResponse.json({ success: false, error: "D1 not bound" });
    const { productId, badge } = await req.json();
    await db.prepare("INSERT OR REPLACE INTO pinned (id, product_id, badge, updated_at) VALUES (1, ?, ?, datetime('now'))").bind(productId, badge || "Imperdível").run();
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
    await db.prepare("DELETE FROM pinned WHERE id = 1").run();
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
