import { NextRequest, NextResponse } from "next/server";
import {
  getD1,
  memoryKits,
  ensureMemoryKitsSeeded,
  type InMemoryKit,
} from "@/lib/d1-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Kits API — promotional bundles (2-3 perfumes for a fixed price).
 *
 * GET    /api/db/kits                 → list all kits (newest first)
 * POST   /api/db/kits                  → upsert a kit
 * DELETE /api/db/kits?id=xxx           → delete a kit by id
 *
 * Storage: Cloudflare D1 (env.DB) when running on Pages, in-memory fallback
 * for local `next dev`.
 */

function rowToKit(row: InMemoryKit | Record<string, unknown>) {
  const r = row as Record<string, unknown>;
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? "",
    productIds: JSON.parse((r.product_ids as string) || "[]"),
    price: Number(r.price ?? 0),
    image: r.image ?? "",
    badge: r.badge ?? "",
    active: Number(r.active ?? 0) === 1,
    createdAt: r.created_at ?? new Date().toISOString(),
  };
}

export async function GET() {
  const d1 = getD1();
  if (d1) {
    try {
      const result = (await d1
        .prepare("SELECT * FROM kits ORDER BY created_at DESC")
        .all()) as { results?: InMemoryKit[] };
      const kits = (result.results || []).map((row) => rowToKit(row));
      return NextResponse.json({ success: true, kits, source: "d1" });
    } catch (err) {
      return NextResponse.json({
        success: false,
        error: String(err),
        kits: [],
      });
    }
  }

  // In-memory fallback (dev)
  await ensureMemoryKitsSeeded();
  const kits = memoryKits
    .slice()
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map((row) => rowToKit(row));
  return NextResponse.json({ success: true, kits, source: "memory" });
}

export async function POST(req: NextRequest) {
  let k: Record<string, unknown>;
  try {
    k = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "invalid JSON body" },
      { status: 400 }
    );
  }

  if (!k.id || !k.name) {
    return NextResponse.json(
      { success: false, error: "Missing id or name" },
      { status: 400 }
    );
  }

  const productIds = Array.isArray(k.productIds) ? k.productIds : [];
  const d1 = getD1();
  if (d1) {
    try {
      await d1
        .prepare(
          "INSERT OR REPLACE INTO kits (id, name, description, product_ids, price, image, badge, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))"
        )
        .bind(
          k.id,
          k.name,
          k.description || "",
          JSON.stringify(productIds),
          k.price || 0,
          k.image || "",
          k.badge || "",
          k.active ? 1 : 0
        )
        .run();
      return NextResponse.json({ success: true, id: k.id, source: "d1" });
    } catch (err) {
      return NextResponse.json(
        { success: false, error: String(err) },
        { status: 500 }
      );
    }
  }

  // In-memory fallback (dev)
  await ensureMemoryKitsSeeded();
  const idx = memoryKits.findIndex((row) => row.id === k.id);
  const newRow: InMemoryKit = {
    id: String(k.id),
    name: String(k.name),
    description: String(k.description ?? ""),
    product_ids: JSON.stringify(productIds),
    price: Number(k.price ?? 0),
    image: String(k.image ?? ""),
    badge: String(k.badge ?? ""),
    active: k.active ? 1 : 0,
    created_at: new Date().toISOString(),
  };
  if (idx >= 0) {
    memoryKits[idx] = newRow;
  } else {
    memoryKits.push(newRow);
  }
  return NextResponse.json({ success: true, id: k.id, source: "memory" });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { success: false, error: "Missing id" },
      { status: 400 }
    );
  }

  const d1 = getD1();
  if (d1) {
    try {
      await d1.prepare("DELETE FROM kits WHERE id = ?").bind(id).run();
      return NextResponse.json({ success: true, id, source: "d1" });
    } catch (err) {
      return NextResponse.json(
        { success: false, error: String(err) },
        { status: 500 }
      );
    }
  }

  // In-memory fallback (dev)
  await ensureMemoryKitsSeeded();
  const idx = memoryKits.findIndex((row) => row.id === id);
  if (idx >= 0) memoryKits.splice(idx, 1);
  return NextResponse.json({ success: true, id, source: "memory" });
}
