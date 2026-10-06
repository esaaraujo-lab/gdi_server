import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Gift Wrap API — stores gift wrap settings in D1 settings table.
 * Keys: "gift_wrap_enabled" (0/1), "gift_wrap_price" (number)
 *
 * GET  /api/db/gift-wrap → { enabled: boolean, price: number }
 * POST /api/db/gift-wrap → upsert (body: { enabled: boolean, price: number })
 */

const KEY_ENABLED = "gift_wrap_enabled";
const KEY_PRICE = "gift_wrap_price";
const DEFAULT_ENABLED = false;
const DEFAULT_PRICE = 5.0;

// In-memory fallback
let memoryEnabled = DEFAULT_ENABLED;
let memoryPrice = DEFAULT_PRICE;

export async function GET() {
  const d1 = getD1();
  if (d1) {
    try {
      const enabledResult = await d1
        .prepare("SELECT value FROM settings WHERE key = ?")
        .bind(KEY_ENABLED)
        .first<{ value: string }>();
      const priceResult = await d1
        .prepare("SELECT value FROM settings WHERE key = ?")
        .bind(KEY_PRICE)
        .first<{ value: string }>();

      const enabled = enabledResult?.value ? enabledResult.value === "1" : DEFAULT_ENABLED;
      const price = priceResult?.value ? parseFloat(priceResult.value) : DEFAULT_PRICE;

      return NextResponse.json({ success: true, enabled, price, source: "d1" });
    } catch (err) {
      return NextResponse.json({ success: false, error: String(err), enabled: DEFAULT_ENABLED, price: DEFAULT_PRICE });
    }
  }

  return NextResponse.json({ success: true, enabled: memoryEnabled, price: memoryPrice, source: "memory" });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const enabled = body.enabled ? "1" : "0";
  const price = String(Number(body.price ?? DEFAULT_PRICE));
  const now = new Date().toISOString();

  const d1 = getD1();
  if (d1) {
    try {
      await d1
        .prepare("INSERT OR REPLACE INTO settings (key, value, type, updated_at) VALUES (?, ?, ?, ?)")
        .bind(KEY_ENABLED, enabled, "boolean", now)
        .run();
      await d1
        .prepare("INSERT OR REPLACE INTO settings (key, value, type, updated_at) VALUES (?, ?, ?, ?)")
        .bind(KEY_PRICE, price, "number", now)
        .run();
      return NextResponse.json({ success: true, enabled: enabled === "1", price: Number(price), source: "d1" });
    } catch (err) {
      return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
    }
  }

  memoryEnabled = enabled === "1";
  memoryPrice = Number(price);
  return NextResponse.json({ success: true, enabled: memoryEnabled, price: memoryPrice, source: "memory" });
}
