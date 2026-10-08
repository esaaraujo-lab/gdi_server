import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/** GET /api/db/newsletter — lista todas as inscrições de newsletter */
export async function GET() {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) {
      return NextResponse.json({ success: false, error: "D1 not bound", subscriptions: [] });
    }
    const result = await db
      .prepare("SELECT email, subscribed_at AS subscribedAt, created_at AS createdAt FROM newsletter ORDER BY subscribed_at DESC")
      .all();
    return NextResponse.json({ success: true, subscriptions: result.results || [] });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err), subscriptions: [] },
      { status: 200 }
    );
  }
}

/** POST /api/db/newsletter — adiciona (ou re-confirma) inscrição {email} */
export async function POST(req: NextRequest) {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) {
      return NextResponse.json({ success: false, error: "D1 not bound" });
    }
    const body = await req.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ success: false, error: "Invalid email" }, { status: 400 });
    }
    const now = new Date().toISOString();
    await db
      .prepare(
        "INSERT OR REPLACE INTO newsletter (email, subscribed_at, created_at) VALUES (?, ?, datetime('now'))"
      )
      .bind(email, now)
      .run();
    return NextResponse.json({ success: true, email });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

/** DELETE /api/db/newsletter?email=X — remove inscrição (unsubscribe) */
export async function DELETE(req: NextRequest) {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) {
      return NextResponse.json({ success: false, error: "D1 not bound" });
    }
    const email = req.nextUrl.searchParams.get("email");
    if (!email) {
      return NextResponse.json({ success: false, error: "Missing email" }, { status: 400 });
    }
    await db.prepare("DELETE FROM newsletter WHERE email = ?").bind(email.trim().toLowerCase()).run();
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
