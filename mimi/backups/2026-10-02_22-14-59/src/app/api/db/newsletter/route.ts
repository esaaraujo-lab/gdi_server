import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) return NextResponse.json({ success: false, error: "D1 not bound", newsletter: [] });
    const result = await db.prepare("SELECT * FROM newsletter ORDER BY created_at DESC").all();
    return NextResponse.json({ success: true, newsletter: result.results || [] });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err), newsletter: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) return NextResponse.json({ success: false, error: "D1 not bound" });
    const { email } = await req.json();
    if (!email || !email.includes("@")) return NextResponse.json({ success: false, error: "Invalid email" }, { status: 400 });
    await db.prepare("INSERT OR REPLACE INTO newsletter (email, subscribed_at) VALUES (?, ?)").bind(email.toLowerCase().trim(), new Date().toISOString()).run();
    return NextResponse.json({ success: true, email: email.toLowerCase().trim() });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) return NextResponse.json({ success: false, error: "D1 not bound" });
    const email = req.nextUrl.searchParams.get("email");
    if (email) {
      await db.prepare("DELETE FROM newsletter WHERE email = ?").bind(email).run();
    } else {
      await db.prepare("DELETE FROM newsletter").run();
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
