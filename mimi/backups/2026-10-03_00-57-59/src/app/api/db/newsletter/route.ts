import { NextRequest, NextResponse } from "next/server";
import { getD1, memoryNewsletter, type InMemoryNewsletter } from "@/lib/d1-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Newsletter API — email sign-ups for the "Clube Mimi Mimos" list.
 *
 * GET    /api/db/newsletter                → list all subscribers (newest first)
 * POST   /api/db/newsletter {email}         → upsert a subscriber
 * DELETE /api/db/newsletter?email=xxx       → remove one (or all if no email)
 *
 * Storage: Cloudflare D1 (env.DB) when running on Pages, in-memory fallback
 * for local `next dev`.
 *
 * Output shape mirrors the D1 `newsletter` table: email, subscribed_at.
 */

function rowToNewsletter(row: InMemoryNewsletter | Record<string, unknown>) {
  const r = row as Record<string, unknown>;
  return {
    email: r.email,
    subscribed_at: r.subscribed_at ?? r.created_at ?? new Date().toISOString(),
  };
}

export async function GET() {
  const d1 = getD1();
  if (d1) {
    try {
      const result = (await d1
        .prepare("SELECT * FROM newsletter ORDER BY created_at DESC")
        .all()) as { results?: Record<string, unknown>[] };
      const newsletter = (result.results || []).map((row) =>
        rowToNewsletter(row)
      );
      return NextResponse.json({ success: true, newsletter, source: "d1" });
    } catch (err) {
      return NextResponse.json({
        success: false,
        error: String(err),
        newsletter: [],
      });
    }
  }

  // In-memory fallback (dev)
  const sorted = memoryNewsletter
    .slice()
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const newsletter = sorted.map((row) => rowToNewsletter(row));
  return NextResponse.json({ success: true, newsletter, source: "memory" });
}

export async function POST(req: NextRequest) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "invalid JSON body" },
      { status: 400 }
    );
  }

  const email = (body.email || "").toLowerCase().trim();
  if (!email.includes("@")) {
    return NextResponse.json(
      { success: false, error: "Invalid email" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  const d1 = getD1();
  if (d1) {
    try {
      await d1
        .prepare(
          "INSERT OR REPLACE INTO newsletter (email, subscribed_at) VALUES (?, ?)"
        )
        .bind(email, now)
        .run();
      return NextResponse.json({ success: true, email, source: "d1" });
    } catch (err) {
      return NextResponse.json(
        { success: false, error: String(err) },
        { status: 500 }
      );
    }
  }

  // In-memory fallback (dev)
  const idx = memoryNewsletter.findIndex((n) => n.email === email);
  const newRow: InMemoryNewsletter = { email, created_at: now };
  if (idx >= 0) {
    memoryNewsletter[idx] = newRow;
  } else {
    memoryNewsletter.push(newRow);
  }
  return NextResponse.json({ success: true, email, source: "memory" });
}

export async function DELETE(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");

  const d1 = getD1();
  if (d1) {
    try {
      if (email) {
        await d1.prepare("DELETE FROM newsletter WHERE email = ?").bind(email).run();
      } else {
        await d1.prepare("DELETE FROM newsletter").run();
      }
      return NextResponse.json({ success: true, source: "d1" });
    } catch (err) {
      return NextResponse.json(
        { success: false, error: String(err) },
        { status: 500 }
      );
    }
  }

  // In-memory fallback (dev)
  if (email) {
    const idx = memoryNewsletter.findIndex((n) => n.email === email);
    if (idx >= 0) memoryNewsletter.splice(idx, 1);
  } else {
    memoryNewsletter.length = 0;
  }
  return NextResponse.json({ success: true, source: "memory" });
}
