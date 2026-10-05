import { NextRequest, NextResponse } from "next/server";
import {
  getD1,
  memoryCustomers,
  generateId,
  type InMemoryCustomer,
} from "@/lib/d1-client";

export const runtime = "edge";

/**
 * Customers API — Task 51-A
 *
 * GET    /api/db/customers              → list all customers (newest last_visit first)
 * POST   /api/db/customers              → upsert by whatsapp number
 * DELETE /api/db/customers?id=xxx       → remove customer
 *
 * Storage: Cloudflare D1 (env.DB) when running on Pages, in-memory fallback
 * for local `next dev`.
 */

interface UpsertCustomerBody {
  name: string;
  whatsapp: string;
  email?: string;
  device_name?: string;
  device_type?: string;
  increment_orders?: number;
  add_spent?: number;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET() {
  const d1 = getD1();
  if (d1) {
    const r = (await d1
      .prepare("SELECT * FROM customers ORDER BY last_visit DESC")
      .all()) as { results?: InMemoryCustomer[]; success: boolean };
    return NextResponse.json({
      customers: r.results ?? [],
      count: (r.results ?? []).length,
      source: "d1",
    });
  }

  const sorted = memoryCustomers
    .slice()
    .sort((a, b) => b.last_visit.localeCompare(a.last_visit));
  return NextResponse.json({
    customers: sorted,
    count: sorted.length,
    source: "memory",
  });
}

// ---------------------------------------------------------------------------
// POST  (upsert by whatsapp number)
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  let body: UpsertCustomerBody;
  try {
    body = (await req.json()) as UpsertCustomerBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.name || !body.whatsapp) {
    return NextResponse.json(
      { error: "name and whatsapp are required" },
      { status: 400 }
    );
  }

  const whatsapp = normalizePhone(body.whatsapp);
  const now = new Date().toISOString();
  const incOrders = Math.max(0, Number(body.increment_orders ?? 1) || 0);
  const addSpent = Math.max(0, Number(body.add_spent ?? 0) || 0);

  const d1 = getD1();
  if (d1) {
    try {
      // Check if customer exists by whatsapp
      const existing = (await d1
        .prepare("SELECT * FROM customers WHERE whatsapp = ?")
        .bind(whatsapp)
        .first()) as InMemoryCustomer | null;

      if (existing) {
        const newTotalOrders = existing.total_orders + incOrders;
        const newTotalSpent = existing.total_spent + addSpent;
        await d1
          .prepare(
            `UPDATE customers SET
              name = COALESCE(?, name),
              email = COALESCE(?, email),
              device_name = COALESCE(?, device_name),
              device_type = COALESCE(?, device_type),
              total_orders = ?,
              total_spent = ?,
              last_visit = ?
            WHERE id = ?`
          )
          .bind(
            body.name,
            body.email ?? null,
            body.device_name ?? null,
            body.device_type ?? null,
            newTotalOrders,
            newTotalSpent,
            now,
            existing.id
          )
          .run();
        return NextResponse.json({
          success: true,
          id: existing.id,
          whatsapp,
          action: "updated",
          source: "d1",
        });
      }

      const id = generateId("cus");
      await d1
        .prepare(
          `INSERT INTO customers (
            id, name, whatsapp, email, device_name, device_type,
            total_orders, total_spent, first_visit, last_visit, created_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
        )
        .bind(
          id,
          body.name,
          whatsapp,
          body.email ?? null,
          body.device_name ?? null,
          body.device_type ?? null,
          incOrders,
          addSpent,
          now,
          now,
          now
        )
        .run();
      return NextResponse.json({
        success: true,
        id,
        whatsapp,
        action: "created",
        source: "d1",
      });
    } catch (err) {
      return NextResponse.json(
        { error: "D1 upsert failed", detail: String(err) },
        { status: 500 }
      );
    }
  }

  // In-memory fallback (dev)
  const existing = memoryCustomers.find((c) => c.whatsapp === whatsapp);
  if (existing) {
    existing.name = body.name;
    if (body.email) existing.email = body.email;
    if (body.device_name) existing.device_name = body.device_name;
    if (body.device_type) existing.device_type = body.device_type;
    existing.total_orders += incOrders;
    existing.total_spent += addSpent;
    existing.last_visit = now;
    return NextResponse.json({
      success: true,
      id: existing.id,
      whatsapp,
      action: "updated",
      source: "memory",
    });
  }

  const id = generateId("cus");
  const customer: InMemoryCustomer = {
    id,
    name: body.name,
    whatsapp,
    email: body.email ?? null,
    device_name: body.device_name ?? null,
    device_type: body.device_type ?? null,
    total_orders: incOrders,
    total_spent: addSpent,
    first_visit: now,
    last_visit: now,
    created_at: now,
  };
  memoryCustomers.push(customer);
  return NextResponse.json({
    success: true,
    id,
    whatsapp,
    action: "created",
    source: "memory",
  });
}

// ---------------------------------------------------------------------------
// DELETE  /api/db/customers?id=xxx
// ---------------------------------------------------------------------------

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id query param is required" }, { status: 400 });
  }

  const d1 = getD1();
  if (d1) {
    try {
      await d1.prepare("DELETE FROM customers WHERE id = ?").bind(id).run();
      return NextResponse.json({ success: true, id, source: "d1" });
    } catch (err) {
      return NextResponse.json(
        { error: "D1 delete failed", detail: String(err) },
        { status: 500 }
      );
    }
  }

  const idx = memoryCustomers.findIndex((c) => c.id === id);
  if (idx === -1) {
    return NextResponse.json({ error: "customer not found" }, { status: 404 });
  }
  memoryCustomers.splice(idx, 1);
  return NextResponse.json({ success: true, id, source: "memory" });
}
