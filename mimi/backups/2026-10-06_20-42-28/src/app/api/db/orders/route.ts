import { NextRequest, NextResponse } from "next/server";
import {
  getD1,
  memoryOrders,
  generateId,
  type InMemoryOrder,
} from "@/lib/d1-client";

export const runtime = "edge";

/**
 * Orders API — Task 51-A
 *
 * GET    /api/db/orders              → list all orders (newest first)
 * GET    /api/db/orders?status=pending → filter by status
 * POST   /api/db/orders              → create new order
 * PATCH  /api/db/orders?id=xxx&status=confirmed → update status
 *
 * Storage: Cloudflare D1 (env.DB) when running on Pages, in-memory fallback
 * for local `next dev`.
 */

interface OrderItem {
  name: string;
  code?: string;
  qty: number;
  price: number;
}

interface CreateOrderBody {
  txid?: string;
  customer_name: string;
  customer_whatsapp: string;
  customer_email?: string;
  shipping_name?: string;
  shipping_price?: number;
  shipping_address?: string;
  shipping_cep?: string;
  coupon_code?: string;
  coupon_discount?: number;
  gift_wrap?: boolean;
  gift_wrap_price?: number;
  gift_message?: string;
  items?: OrderItem[];
  items_json?: string;
  subtotal: number;
  total: number;
  status?: string;
  payment_method?: string;
}

const VALID_STATUSES = [
  "pending",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
];

function normalizeStatus(s: unknown): string {
  if (typeof s !== "string") return "pending";
  return VALID_STATUSES.includes(s) ? s : "pending";
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  const d1 = getD1();
  if (d1) {
    if (status) {
      const r = (await d1
        .prepare("SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC")
        .bind(status)
        .all()) as { results?: InMemoryOrder[]; success: boolean };
      return NextResponse.json({ orders: r.results ?? [], count: (r.results ?? []).length, source: "d1" });
    }
    const r = (await d1
      .prepare("SELECT * FROM orders ORDER BY created_at DESC")
      .all()) as { results?: InMemoryOrder[]; success: boolean };
    return NextResponse.json({ orders: r.results ?? [], count: (r.results ?? []).length, source: "d1" });
  }

  // In-memory fallback (dev)
  const filtered = status
    ? memoryOrders.filter((o) => o.status === status)
    : memoryOrders;
  const sorted = filtered.slice().sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
  return NextResponse.json({
    orders: sorted,
    count: sorted.length,
    source: "memory",
  });
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  let body: CreateOrderBody;
  try {
    body = (await req.json()) as CreateOrderBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.customer_name || !body.customer_whatsapp) {
    return NextResponse.json(
      { error: "customer_name and customer_whatsapp are required" },
      { status: 400 }
    );
  }
  if (typeof body.subtotal !== "number" || typeof body.total !== "number") {
    return NextResponse.json(
      { error: "subtotal and total must be numbers" },
      { status: 400 }
    );
  }

  const itemsJson = body.items_json ?? JSON.stringify(body.items ?? []);
  const giftWrap = body.gift_wrap ? 1 : 0;
  const id = generateId("ord");
  const status = normalizeStatus(body.status);
  const now = new Date().toISOString();
  const txid = body.txid || null;

  const d1 = getD1();
  if (d1) {
    try {
      await d1
        .prepare(
          `INSERT INTO orders (
            id, txid, customer_name, customer_whatsapp, customer_email,
            shipping_name, shipping_price, shipping_address, shipping_cep,
            coupon_code, coupon_discount, gift_wrap, gift_wrap_price, gift_message,
            items_json, subtotal, total, status, payment_method, created_at, confirmed_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .bind(
          id,
          txid,
          body.customer_name,
          body.customer_whatsapp,
          body.customer_email ?? null,
          body.shipping_name ?? null,
          body.shipping_price ?? 0,
          body.shipping_address ?? null,
          body.shipping_cep ?? null,
          body.coupon_code ?? null,
          body.coupon_discount ?? 0,
          giftWrap,
          body.gift_wrap_price ?? 0,
          body.gift_message ?? null,
          itemsJson,
          body.subtotal,
          body.total,
          status,
          body.payment_method ?? "pix",
          now,
          null
        )
        .run();
      return NextResponse.json({
        success: true,
        id,
        txid,
        status,
        source: "d1",
      });
    } catch (err) {
      return NextResponse.json(
        { error: "D1 insert failed", detail: String(err) },
        { status: 500 }
      );
    }
  }

  // In-memory fallback (dev)
  const order: InMemoryOrder = {
    id,
    txid,
    customer_name: body.customer_name,
    customer_whatsapp: body.customer_whatsapp,
    customer_email: body.customer_email ?? null,
    shipping_name: body.shipping_name ?? null,
    shipping_price: body.shipping_price ?? 0,
    shipping_address: body.shipping_address ?? null,
    shipping_cep: body.shipping_cep ?? null,
    coupon_code: body.coupon_code ?? null,
    coupon_discount: body.coupon_discount ?? 0,
    gift_wrap: giftWrap,
    gift_wrap_price: body.gift_wrap_price ?? 0,
    gift_message: body.gift_message ?? null,
    items_json: itemsJson,
    subtotal: body.subtotal,
    total: body.total,
    status,
    payment_method: body.payment_method ?? "pix",
    created_at: now,
    confirmed_at: null,
  };
  memoryOrders.push(order);
  return NextResponse.json({ success: true, id, txid, status, source: "memory" });
}

// ---------------------------------------------------------------------------
// PATCH  /api/db/orders?id=xxx&status=confirmed
// ---------------------------------------------------------------------------

export async function PATCH(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const status = url.searchParams.get("status");

  if (!id || !status) {
    return NextResponse.json(
      { error: "id and status query params are required" },
      { status: 400 }
    );
  }
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  const confirmedAt = status === "confirmed" ? new Date().toISOString() : null;

  const d1 = getD1();
  if (d1) {
    try {
      if (status === "confirmed") {
        await d1
          .prepare(
            "UPDATE orders SET status = ?, confirmed_at = ? WHERE id = ?"
          )
          .bind(status, confirmedAt, id)
          .run();
      } else {
        await d1
          .prepare("UPDATE orders SET status = ? WHERE id = ?")
          .bind(status, id)
          .run();
      }
      return NextResponse.json({ success: true, id, status, source: "d1" });
    } catch (err) {
      return NextResponse.json(
        { error: "D1 update failed", detail: String(err) },
        { status: 500 }
      );
    }
  }

  // In-memory fallback (dev)
  const order = memoryOrders.find((o) => o.id === id);
  if (!order) {
    return NextResponse.json({ error: "order not found" }, { status: 404 });
  }
  order.status = status;
  if (status === "confirmed") order.confirmed_at = confirmedAt;
  return NextResponse.json({ success: true, id, status, source: "memory" });
}
