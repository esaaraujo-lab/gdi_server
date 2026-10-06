import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * POST /api/db/seed — Reports D1 database status.
 *
 * NOTE: This route NO LONGER seeds from any hardcoded file.
 * D1 is the ONLY source of truth. Products are managed via the admin panel.
 *
 * If D1 is empty (fresh database), use scripts/export-d1-products.mjs
 * to export current products as backup, or add products manually via admin.
 *
 * Returns: {success, message, total, source}
 */

export async function POST() {
  const d1 = getD1();
  if (!d1) {
    return NextResponse.json({
      success: false,
      error: "D1 not bound — this route requires Cloudflare D1",
      source: "none",
    });
  }

  try {
    // Count products in D1
    const result = (await d1.prepare("SELECT COUNT(*) as count FROM products").first()) as
      | { count?: number }
      | null;
    const count = result?.count ?? 0;

    if (count > 0) {
      return NextResponse.json({
        success: true,
        message: `D1 already has ${count} products. No seeding needed — D1 is the source of truth.`,
        total: count,
        inserted: 0,
        errors: 0,
        source: "d1",
      });
    }

    return NextResponse.json({
      success: false,
      error: "D1 is empty. Add products via the admin panel (/admin). No hardcoded seed data exists.",
      total: 0,
      source: "d1",
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err), source: "d1" },
      { status: 500 }
    );
  }
}
