import { NextRequest, NextResponse } from "next/server";
import {
  getD1,
  memoryLeads,
  generateId,
  type InMemoryLead,
} from "@/lib/d1-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Leads API — "notify me when available" sign-ups.
 *
 * GET    /api/db/leads                → list all leads (newest first)
 * POST   /api/db/leads                 → create a new lead
 * DELETE /api/db/leads                 → clear all leads
 *
 * Storage: Cloudflare D1 (env.DB) when running on Pages, in-memory fallback
 * for local `next dev`.
 *
 * Output shape mirrors the D1 `leads` table: date, name, phone, product.
 */

function rowToLead(row: InMemoryLead | Record<string, unknown>) {
  const r = row as Record<string, unknown>;
  return {
    date: r.date ?? r.created_at ?? new Date().toLocaleString("pt-BR"),
    name: r.name,
    phone: r.phone,
    product: r.product,
  };
}

export async function GET() {
  const d1 = getD1();
  if (d1) {
    try {
      const result = (await d1
        .prepare("SELECT * FROM leads ORDER BY created_at DESC")
        .all()) as { results?: Record<string, unknown>[] };
      const leads = (result.results || []).map((row) => rowToLead(row));
      return NextResponse.json({ success: true, leads, source: "d1" });
    } catch (err) {
      return NextResponse.json({
        success: false,
        error: String(err),
        leads: [],
      });
    }
  }

  // In-memory fallback (dev)
  const sorted = memoryLeads
    .slice()
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const leads = sorted.map((row) => rowToLead(row));
  return NextResponse.json({ success: true, leads, source: "memory" });
}

export async function POST(req: NextRequest) {
  let body: { date?: string; name?: string; phone?: string; product?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "invalid JSON body" },
      { status: 400 }
    );
  }

  const date = body.date || new Date().toLocaleString("pt-BR");
  const name = body.name || "";
  const phone = body.phone || "";
  const product = body.product || "";
  const createdAt = new Date().toISOString();

  const d1 = getD1();
  if (d1) {
    try {
      await d1
        .prepare("INSERT INTO leads (date, name, phone, product) VALUES (?, ?, ?, ?)")
        .bind(date, name, phone, product)
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
  const lead: InMemoryLead = {
    id: generateId("lead"),
    date,
    name,
    phone,
    product,
    created_at: createdAt,
  };
  memoryLeads.push(lead);
  return NextResponse.json({ success: true, source: "memory" });
}

export async function DELETE() {
  const d1 = getD1();
  if (d1) {
    try {
      await d1.prepare("DELETE FROM leads").run();
      return NextResponse.json({ success: true, source: "d1" });
    } catch (err) {
      return NextResponse.json(
        { success: false, error: String(err) },
        { status: 500 }
      );
    }
  }

  // In-memory fallback (dev)
  memoryLeads.length = 0;
  return NextResponse.json({ success: true, source: "memory" });
}
