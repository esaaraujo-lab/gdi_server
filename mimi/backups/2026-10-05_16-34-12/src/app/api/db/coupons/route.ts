import { NextRequest, NextResponse } from "next/server";
import {
  getD1,
  memoryCoupons,
  ensureMemoryCouponsSeeded,
  type InMemoryCoupon,
} from "@/lib/d1-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Coupons API — discount codes (percent, fixed, freeship, decante3x100).
 *
 * GET    /api/db/coupons                 → list all coupons
 * POST   /api/db/coupons                 → upsert a coupon
 * PATCH  /api/db/coupons?code=XXX        → toggle active flag
 * DELETE /api/db/coupons?code=XXX        → delete a coupon
 *
 * Storage: Cloudflare D1 (env.DB) when running on Pages, in-memory fallback
 * for local `next dev`.
 */

function rowToCoupon(row: InMemoryCoupon | Record<string, unknown>) {
  const r = row as Record<string, unknown>;
  return {
    code: r.code,
    type: r.type,
    value: Number(r.value ?? 0),
    description: r.description ?? "",
    minSubtotal: Number(r.min_subtotal ?? 0),
    expiresAt: r.expires_at ?? null,
    active: Number(r.active ?? 0) === 1,
  };
}

export async function GET() {
  const d1 = getD1();
  if (d1) {
    try {
      const result = (await d1
        .prepare("SELECT * FROM coupons ORDER BY code ASC")
        .all()) as { results?: InMemoryCoupon[] };
      const coupons = (result.results || []).map((row) => rowToCoupon(row));
      return NextResponse.json({ success: true, coupons, source: "d1" });
    } catch (err) {
      return NextResponse.json({
        success: false,
        error: String(err),
        coupons: [],
      });
    }
  }

  // In-memory fallback (dev)
  await ensureMemoryCouponsSeeded();
  const coupons = memoryCoupons
    .slice()
    .sort((a, b) => String(a.code).localeCompare(String(b.code)))
    .map((row) => rowToCoupon(row));
  return NextResponse.json({ success: true, coupons, source: "memory" });
}

export async function POST(req: NextRequest) {
  let c: Record<string, unknown>;
  try {
    c = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "invalid JSON body" },
      { status: 400 }
    );
  }

  if (!c.code) {
    return NextResponse.json(
      { success: false, error: "Missing code" },
      { status: 400 }
    );
  }

  const code = String(c.code).toUpperCase();
  const d1 = getD1();
  if (d1) {
    try {
      await d1
        .prepare(
          "INSERT OR REPLACE INTO coupons (code, type, value, description, min_subtotal, expires_at, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))"
        )
        .bind(
          code,
          c.type ?? "percent",
          Number(c.value ?? 0),
          c.description ?? "",
          Number(c.minSubtotal ?? 0),
          c.expiresAt ?? null,
          c.active ? 1 : 0
        )
        .run();
      return NextResponse.json({ success: true, code, source: "d1" });
    } catch (err) {
      return NextResponse.json(
        { success: false, error: String(err) },
        { status: 500 }
      );
    }
  }

  // In-memory fallback (dev)
  await ensureMemoryCouponsSeeded();
  const idx = memoryCoupons.findIndex((row) => row.code === code);
  const newRow: InMemoryCoupon = {
    code,
    type: String(c.type ?? "percent"),
    value: Number(c.value ?? 0),
    description: String(c.description ?? ""),
    min_subtotal: Number(c.minSubtotal ?? 0),
    expires_at: (c.expiresAt as string | null) ?? null,
    active: c.active ? 1 : 0,
    created_at: new Date().toISOString(),
  };
  if (idx >= 0) {
    memoryCoupons[idx] = newRow;
  } else {
    memoryCoupons.push(newRow);
  }
  return NextResponse.json({ success: true, code, source: "memory" });
}

export async function PATCH(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json(
      { success: false, error: "Missing code" },
      { status: 400 }
    );
  }
  const normalized = code.toUpperCase();

  const d1 = getD1();
  if (d1) {
    try {
      await d1
        .prepare(
          "UPDATE coupons SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE code = ?"
        )
        .bind(normalized)
        .run();
      return NextResponse.json({ success: true, code: normalized, source: "d1" });
    } catch (err) {
      return NextResponse.json(
        { success: false, error: String(err) },
        { status: 500 }
      );
    }
  }

  // In-memory fallback (dev)
  await ensureMemoryCouponsSeeded();
  const row = memoryCoupons.find((c) => c.code === normalized);
  if (!row) {
    return NextResponse.json(
      { success: false, error: "coupon not found" },
      { status: 404 }
    );
  }
  row.active = row.active === 1 ? 0 : 1;
  return NextResponse.json({
    success: true,
    code: normalized,
    active: row.active === 1,
    source: "memory",
  });
}

export async function DELETE(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json(
      { success: false, error: "Missing code" },
      { status: 400 }
    );
  }
  const normalized = code.toUpperCase();

  const d1 = getD1();
  if (d1) {
    try {
      await d1.prepare("DELETE FROM coupons WHERE code = ?").bind(normalized).run();
      return NextResponse.json({ success: true, code: normalized, source: "d1" });
    } catch (err) {
      return NextResponse.json(
        { success: false, error: String(err) },
        { status: 500 }
      );
    }
  }

  // In-memory fallback (dev)
  await ensureMemoryCouponsSeeded();
  const idx = memoryCoupons.findIndex((c) => c.code === normalized);
  if (idx >= 0) memoryCoupons.splice(idx, 1);
  return NextResponse.json({ success: true, code: normalized, source: "memory" });
}
