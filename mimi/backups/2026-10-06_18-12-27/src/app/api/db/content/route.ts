import { NextRequest, NextResponse } from "next/server";
import { getD1, memoryContent } from "@/lib/d1-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Content API — key/value store for editable site copy.
 *
 * GET    /api/db/content                → returns all content as {key: value}
 * POST   /api/db/content {key, value}   → upserts a key
 * DELETE /api/db/content                 → clears all content
 *
 * Storage: Cloudflare D1 (env.DB) when running on Pages, in-memory fallback
 * for local `next dev`.
 */

export async function GET() {
  const d1 = getD1();
  if (d1) {
    try {
      const result = (await d1
        .prepare("SELECT key, value FROM content")
        .all()) as { results?: { key: string; value: string }[] };
      const content: Record<string, string> = {};
      (result.results || []).forEach((row) => {
        content[row.key] = row.value;
      });
      return NextResponse.json({ success: true, content, source: "d1" });
    } catch (err) {
      return NextResponse.json({
        success: false,
        error: String(err),
        content: {},
      });
    }
  }

  // In-memory fallback (dev)
  return NextResponse.json({
    success: true,
    content: { ...memoryContent },
    source: "memory",
  });
}

export async function POST(req: NextRequest) {
  let body: { key?: string; value?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body.key) {
    return NextResponse.json(
      { success: false, error: "Missing key" },
      { status: 400 }
    );
  }

  const d1 = getD1();
  if (d1) {
    try {
      await d1
        .prepare(
          "INSERT OR REPLACE INTO content (key, value, updated_at) VALUES (?, ?, datetime('now'))"
        )
        .bind(body.key, body.value ?? "")
        .run();
      return NextResponse.json({ success: true, source: "d1" });
    } catch (err) {
      return NextResponse.json(
        { success: false, error: String(err) },
        { status: 500 }
      );
    }
  }

  // In-memory fallback (dev)
  memoryContent[body.key] = body.value ?? "";
  return NextResponse.json({ success: true, source: "memory" });
}

export async function DELETE() {
  const d1 = getD1();
  if (d1) {
    try {
      await d1.prepare("DELETE FROM content").run();
      return NextResponse.json({ success: true, source: "d1" });
    } catch (err) {
      return NextResponse.json(
        { success: false, error: String(err) },
        { status: 500 }
      );
    }
  }

  // In-memory fallback (dev)
  for (const k of Object.keys(memoryContent)) {
    delete memoryContent[k];
  }
  return NextResponse.json({ success: true, source: "memory" });
}
