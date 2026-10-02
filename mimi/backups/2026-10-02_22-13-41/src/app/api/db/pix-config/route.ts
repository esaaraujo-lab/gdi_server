import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) return NextResponse.json({ success: false, error: "D1 not bound", config: null });
    const result = await db.prepare("SELECT * FROM pix_config WHERE id = 1").first();
    return NextResponse.json({ success: true, config: result || null });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err), config: null });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) return NextResponse.json({ success: false, error: "D1 not bound" });
    const { key, name, city, whatsappGroup } = await req.json();
    await db.prepare("INSERT OR REPLACE INTO pix_config (id, key, name, city, whatsapp_group) VALUES (1, ?, ?, ?, ?)").bind(key, name, city, whatsappGroup).run();
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
