import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/** GET /api/db/content — get all content */
export async function GET() {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) return NextResponse.json({ success: false, error: "D1 not bound", content: {} });

    const result = await db.prepare("SELECT key, value FROM content").all();
    const content: Record<string, string> = {};
    (result.results || []).forEach((row: any) => {
      content[row.key] = row.value;
    });
    return NextResponse.json({ success: true, content });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err), content: {} }, { status: 200 });
  }
}

/** POST /api/db/content — save content field {key, value} */
export async function POST(req: NextRequest) {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) return NextResponse.json({ success: false, error: "D1 not bound" });

    const body = await req.json();
    const { key, value } = body;
    if (!key) return NextResponse.json({ success: false, error: "Missing key" }, { status: 400 });

    await db.prepare("INSERT OR REPLACE INTO content (key, value, updated_at) VALUES (?, ?, datetime('now'))")
      .bind(key, value).run();
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

/** DELETE /api/db/content — limpa TODAS as linhas de conteúdo do D1 (reset admin) */
export async function DELETE() {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) return NextResponse.json({ success: false, error: "D1 not bound" });

    await db.prepare("DELETE FROM content").run();
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
