import { NextRequest, NextResponse } from "next/server";
import { getD1, memoryReviews, type InMemoryReview } from "@/lib/d1-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Reviews API — customer reviews for products.
 *
 * GET    /api/db/reviews                 → list all reviews (newest first)
 * GET    /api/db/reviews?productId=xxx   → filter by product
 * POST   /api/db/reviews                 → create a new review
 * DELETE /api/db/reviews                 → clear all (no id) or single (id=xxx)
 *
 * Storage: Cloudflare D1 (env.DB) when running on Pages, in-memory fallback
 * for local `next dev`.
 *
 * Output shape mirrors the D1 `reviews` table: id, product_id, author,
 * rating, comment, date.
 */

function rowToReview(row: InMemoryReview | Record<string, unknown>) {
  const r = row as Record<string, unknown>;
  return {
    id: r.id,
    productId: r.productId ?? r.product_id,
    author: r.author,
    rating: Number(r.rating ?? 0),
    comment: r.comment,
    date: r.date ?? r.created_at ?? new Date().toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const productId = req.nextUrl.searchParams.get("productId");

  const d1 = getD1();
  if (d1) {
    try {
      let result: { results?: Record<string, unknown>[] };
      if (productId) {
        result = (await d1
          .prepare("SELECT * FROM reviews WHERE product_id = ? ORDER BY date DESC")
          .bind(productId)
          .all()) as { results?: Record<string, unknown>[] };
      } else {
        result = (await d1
          .prepare("SELECT * FROM reviews ORDER BY date DESC")
          .all()) as { results?: Record<string, unknown>[] };
      }
      const reviews = (result.results || []).map((row) => rowToReview(row));
      return NextResponse.json({ success: true, reviews, source: "d1" });
    } catch (err) {
      return NextResponse.json({
        success: false,
        error: String(err),
        reviews: [],
      });
    }
  }

  // In-memory fallback (dev)
  const filtered = productId
    ? memoryReviews.filter((r) => r.product_id === productId)
    : memoryReviews;
  const sorted = filtered
    .slice()
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const reviews = sorted.map((row) => rowToReview(row));
  return NextResponse.json({ success: true, reviews, source: "memory" });
}

export async function POST(req: NextRequest) {
  let body: {
    productId?: string;
    author?: string;
    rating?: number;
    comment?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "invalid JSON body" },
      { status: 400 }
    );
  }

  const id = `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const productId = body.productId ?? "";
  const author = body.author || "Cliente";
  const rating = Math.max(1, Math.min(5, Number(body.rating ?? 5)));
  const comment = body.comment ?? "";
  const date = new Date().toISOString();

  const d1 = getD1();
  if (d1) {
    try {
      await d1
        .prepare(
          "INSERT INTO reviews (id, product_id, author, rating, comment, date) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(id, productId, author, rating, comment, date)
        .run();
      return NextResponse.json({ success: true, id, source: "d1" });
    } catch (err) {
      return NextResponse.json(
        { success: false, error: String(err) },
        { status: 500 }
      );
    }
  }

  // In-memory fallback (dev)
  const review: InMemoryReview = {
    id,
    product_id: productId,
    author,
    rating,
    comment,
    created_at: date,
    approved: 0,
  };
  memoryReviews.push(review);
  return NextResponse.json({ success: true, id, source: "memory" });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");

  const d1 = getD1();
  if (d1) {
    try {
      if (id) {
        await d1.prepare("DELETE FROM reviews WHERE id = ?").bind(id).run();
      } else {
        await d1.prepare("DELETE FROM reviews").run();
      }
      return NextResponse.json({ success: true, source: "d1" });
    } catch (err) {
      return NextResponse.json(
        { success: false, error: String(err) },
        { status: 500 }
      );
    }
  }

  // In-memory fallback (dev)
  if (id) {
    const idx = memoryReviews.findIndex((r) => r.id === id);
    if (idx >= 0) memoryReviews.splice(idx, 1);
  } else {
    memoryReviews.length = 0;
  }
  return NextResponse.json({ success: true, source: "memory" });
}
