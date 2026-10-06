import { NextRequest, NextResponse } from "next/server";
import {
  getD1,
  ensureMemoryProductsSeeded,
  memoryProducts,
} from "@/lib/d1-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Stock API — manages product stock quantities.
 *
 * GET   /api/db/stock?id=xxx   → stock for a single product
 * GET   /api/db/stock           → stock for all products
 * PATCH /api/db/stock?id=xxx&qty=N → set stock for a product
 */

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");

  const d1 = getD1();
  if (d1) {
    try {
      if (id) {
        const result = await d1
          .prepare("SELECT stock_qty, in_stock FROM products WHERE id = ?")
          .bind(id)
          .first();
        return NextResponse.json({ success: true, ...result, source: "d1" });
      }
      const result = await d1
        .prepare("SELECT id, stock_qty, in_stock FROM products ORDER BY code")
        .all();
      return NextResponse.json({ success: true, stock: result.results || [], source: "d1" });
    } catch (err) {
      return NextResponse.json({ success: false, error: String(err) });
    }
  }

  // In-memory fallback (dev)
  await ensureMemoryProductsSeeded();
  if (id) {
    const row = memoryProducts.find((r) => r.id === id);
    if (!row) return NextResponse.json({ success: false, error: "not found" }, { status: 404 });
    return NextResponse.json({
      success: true,
      stock_qty: row.stock_qty,
      in_stock: row.in_stock,
      source: "memory",
    });
  }
  return NextResponse.json({
    success: true,
    stock: memoryProducts.map((r) => ({ id: r.id, stock_qty: r.stock_qty, in_stock: r.in_stock })),
    source: "memory",
  });
}

export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const qty = parseInt(req.nextUrl.searchParams.get("qty") || "0", 10);
  if (!id) {
    return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
  }

  const d1 = getD1();
  if (d1) {
    try {
      await d1
        .prepare(
          "UPDATE products SET stock_qty = ?, in_stock = ?, updated_at = datetime('now') WHERE id = ?"
        )
        .bind(qty, qty > 0 ? 1 : 0, id)
        .run();
      return NextResponse.json({ success: true, id, qty, source: "d1" });
    } catch (err) {
      return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
    }
  }

  // In-memory fallback (dev)
  await ensureMemoryProductsSeeded();
  const row = memoryProducts.find((r) => r.id === id);
  if (!row) return NextResponse.json({ success: false, error: "not found" }, { status: 404 });
  row.stock_qty = qty;
  row.in_stock = qty > 0 ? 1 : 0;
  row.updated_at = new Date().toISOString();
  return NextResponse.json({ success: true, id, qty, source: "memory" });
}
