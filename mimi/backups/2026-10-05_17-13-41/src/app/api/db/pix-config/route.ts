import { NextRequest, NextResponse } from "next/server";
import { getD1, memoryPixConfig } from "@/lib/d1-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Pix Config API — store-wide Pix payment configuration (key, receiver
 * name, city, optional WhatsApp group link).
 *
 * GET    /api/db/pix-config                → {config: {...} | null}
 * POST   /api/db/pix-config {key, name, city, whatsappGroup} → upsert
 *
 * Storage: Cloudflare D1 (env.DB) when running on Pages, in-memory fallback
 * for local `next dev`.
 *
 * Output shape mirrors the D1 `pix_config` table: id, key, name, city,
 * whatsapp_group.
 */

function rowToConfig(row: Record<string, unknown>) {
  return {
    id: row.id ?? 1,
    key: row.key ?? "",
    name: row.name ?? "",
    city: row.city ?? "",
    whatsapp_group: row.whatsapp_group ?? row.whatsappGroup ?? "",
  };
}

export async function GET() {
  const d1 = getD1();
  if (d1) {
    try {
      const row = (await d1
        .prepare("SELECT * FROM pix_config WHERE id = 1")
        .first()) as Record<string, unknown> | null;
      return NextResponse.json({
        success: true,
        config: row ? rowToConfig(row) : null,
        source: "d1",
      });
    } catch (err) {
      return NextResponse.json({
        success: false,
        error: String(err),
        config: null,
      });
    }
  }

  // In-memory fallback (dev)
  const hasConfig =
    Object.prototype.hasOwnProperty.call(memoryPixConfig, "key") &&
    !!memoryPixConfig.key;
  if (!hasConfig) {
    return NextResponse.json({
      success: true,
      config: null,
      source: "memory",
    });
  }
  return NextResponse.json({
    success: true,
    config: rowToConfig({
      id: 1,
      key: memoryPixConfig.key,
      name: memoryPixConfig.name ?? "",
      city: memoryPixConfig.city ?? "",
      whatsapp_group: memoryPixConfig.whatsappGroup ??
        memoryPixConfig.whatsapp_group ??
        "",
    }),
    source: "memory",
  });
}

export async function POST(req: NextRequest) {
  let body: {
    key?: string;
    name?: string;
    city?: string;
    whatsappGroup?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "invalid JSON body" },
      { status: 400 }
    );
  }

  const d1 = getD1();
  if (d1) {
    try {
      await d1
        .prepare(
          "INSERT OR REPLACE INTO pix_config (id, key, name, city, whatsapp_group) VALUES (1, ?, ?, ?, ?)"
        )
        .bind(
          body.key ?? "",
          body.name ?? "",
          body.city ?? "",
          body.whatsappGroup ?? ""
        )
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
  memoryPixConfig.key = body.key ?? "";
  memoryPixConfig.name = body.name ?? "";
  memoryPixConfig.city = body.city ?? "";
  memoryPixConfig.whatsappGroup = body.whatsappGroup ?? "";
  return NextResponse.json({ success: true, source: "memory" });
}
