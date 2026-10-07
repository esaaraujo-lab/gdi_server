import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Marquee API — stores marquee bar items in D1 settings table.
 * Key: "marquee_items" (JSON array of strings)
 *
 * GET  /api/db/marquee → { items: string[] }
 * POST /api/db/marquee → upsert (body: { items: string[] })
 */

const SETTING_KEY = "marquee_items";

const DEFAULT_ITEMS = [
  "Frete grátis acima de R$200",
  "Decantes: Kit 3 = R$100",
  "Perfumes importados e árabes",
  "Pagamento via Pix",
];

// In-memory fallback for dev
let memoryItems: string[] | null = null;

export async function GET() {
  const d1 = getD1();
  if (d1) {
    try {
      const result = await d1
        .prepare("SELECT value FROM settings WHERE key = ?")
        .bind(SETTING_KEY)
        .first<{ value: string }>();
      if (result?.value) {
        const items = JSON.parse(result.value);
        if (Array.isArray(items)) {
          return NextResponse.json({ success: true, items, source: "d1" });
        }
      }
      // Seed default if not found
      await d1
        .prepare("INSERT OR IGNORE INTO settings (key, value, type, updated_at) VALUES (?, ?, ?, ?)")
        .bind(SETTING_KEY, JSON.stringify(DEFAULT_ITEMS), "json", new Date().toISOString())
        .run();
      return NextResponse.json({ success: true, items: DEFAULT_ITEMS, source: "d1-default" });
    } catch (err) {
      return NextResponse.json({ success: false, error: String(err), items: DEFAULT_ITEMS });
    }
  }

  // In-memory fallback
  const items = memoryItems || DEFAULT_ITEMS;
  return NextResponse.json({ success: true, items, source: "memory" });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const items = body.items;
  if (!Array.isArray(items)) {
    return NextResponse.json({ success: false, error: "items must be an array of strings" }, { status: 400 });
  }
  // Validate all items are strings
  const validItems = items.filter((i: unknown) => typeof i === "string").map((i: string) => i.trim()).filter(Boolean);
  const value = JSON.stringify(validItems);

  const d1 = getD1();
  if (d1) {
    try {
      await d1
        .prepare(
          "INSERT OR REPLACE INTO settings (key, value, type, updated_at) VALUES (?, ?, ?, ?)"
        )
        .bind(SETTING_KEY, value, "json", new Date().toISOString())
        .run();
      return NextResponse.json({ success: true, items: validItems, source: "d1" });
    } catch (err) {
      return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
    }
  }

  // In-memory
  memoryItems = validItems;
  return NextResponse.json({ success: true, items: validItems, source: "memory" });
}
