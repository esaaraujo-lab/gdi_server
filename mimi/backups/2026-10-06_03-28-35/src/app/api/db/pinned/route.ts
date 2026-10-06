import { NextRequest, NextResponse } from "next/server";
import {
  getD1,
  memoryPinned,
  setMemoryPinned,
  type InMemoryPinned,
} from "@/lib/d1-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Pinned API — featured product shown on the homepage.
 *
 * GET    /api/db/pinned                 → { pinned: {productId, badge} | null }
 * POST   /api/db/pinned {productId, badge} → upsert pinned product
 * DELETE /api/db/pinned                  → clear pinned
 *
 * Storage: Cloudflare D1 (env.DB) when running on Pages, in-memory fallback
 * for local `next dev`.
 */

function rowToPinned(row: Record<string, unknown>) {
  return {
    id: row.id ?? 1,
    productId: row.product_id,
    badge: row.badge ?? "Imperdível",
    updatedAt: row.updated_at ?? new Date().toISOString(),
  };
}

export async function GET() {
  const d1 = getD1();
  if (d1) {
    try {
      const row = (await d1
        .prepare("SELECT * FROM pinned WHERE id = 1")
        .first()) as Record<string, unknown> | null;
      return NextResponse.json({
        success: true,
        pinned: row ? rowToPinned(row) : null,
        source: "d1",
      });
    } catch (err) {
      return NextResponse.json({
        success: false,
        error: String(err),
        pinned: null,
      });
    }
  }

  // In-memory fallback (dev)
  const pinned = memoryPinned
    ? {
        id: 1,
        productId: memoryPinned.product_id,
        badge: memoryPinned.badge || "Imperdível",
        updatedAt: memoryPinned.updated_at,
      }
    : null;
  return NextResponse.json({ success: true, pinned, source: "memory" });
}

export async function POST(req: NextRequest) {
  let body: { productId?: string; badge?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body.productId) {
    return NextResponse.json(
      { success: false, error: "Missing productId" },
      { status: 400 }
    );
  }

  const badge = body.badge || "Imperdível";
  const updatedAt = new Date().toISOString();

  const d1 = getD1();
  if (d1) {
    try {
      await d1
        .prepare(
          "INSERT OR REPLACE INTO pinned (id, product_id, badge, updated_at) VALUES (1, ?, ?, datetime('now'))"
        )
        .bind(body.productId, badge)
        .run();
      return NextResponse.json({
        success: true,
        pinned: { id: 1, productId: body.productId, badge },
        source: "d1",
      });
    } catch (err) {
      return NextResponse.json(
        { success: false, error: String(err) },
        { status: 500 }
      );
    }
  }

  // In-memory fallback (dev)
  const newRow: InMemoryPinned = {
    product_id: body.productId,
    badge,
    updated_at: updatedAt,
  };
  setMemoryPinned(newRow);
  return NextResponse.json({
    success: true,
    pinned: {
      id: 1,
      productId: body.productId,
      badge,
      updatedAt,
    },
    source: "memory",
  });
}

export async function DELETE() {
  const d1 = getD1();
  if (d1) {
    try {
      await d1.prepare("DELETE FROM pinned WHERE id = 1").run();
      return NextResponse.json({ success: true, source: "d1" });
    } catch (err) {
      return NextResponse.json(
        { success: false, error: String(err) },
        { status: 500 }
      );
    }
  }

  // In-memory fallback (dev)
  setMemoryPinned(null);
  return NextResponse.json({ success: true, source: "memory" });
}
