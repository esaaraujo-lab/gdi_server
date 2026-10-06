import { NextRequest, NextResponse } from "next/server";
import {
  getD1,
  memoryCategories,
  memorySubcategories,
  generateId,
  type InMemoryCategory,
  type InMemorySubcategory,
} from "@/lib/d1-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Categories API — product categories and subcategories.
 *
 * GET    /api/db/categories                         → list categories with subcategory names
 * POST   /api/db/categories {action: "addSubcategory", categoryId, name} → add subcategory
 * POST   /api/db/categories {id, name, sort_order?}  → upsert category
 * DELETE /api/db/categories?id=xxx                   → delete category + its subcategories
 *
 * Storage: Cloudflare D1 (env.DB) when running on Pages, in-memory fallback
 * for local `next dev`.
 */

export async function GET() {
  const d1 = getD1();
  if (d1) {
    try {
      const catResult = (await d1
        .prepare("SELECT * FROM categories ORDER BY sort_order ASC")
        .all()) as { results?: InMemoryCategory[] };
      const categories: { id: string; name: string; subcategories: string[] }[] = [];
      for (const cat of catResult.results || []) {
        const subs = (await d1
          .prepare(
            "SELECT name FROM subcategories WHERE category_id = ? ORDER BY sort_order ASC"
          )
          .bind(cat.id)
          .all()) as { results?: { name: string }[] };
        categories.push({
          id: cat.id,
          name: cat.name,
          subcategories: (subs.results || []).map((s) => s.name),
        });
      }
      return NextResponse.json({ success: true, categories, source: "d1" });
    } catch (err) {
      return NextResponse.json({
        success: false,
        error: String(err),
        categories: [],
      });
    }
  }

  // In-memory fallback (dev)
  const sortedCats = memoryCategories
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);
  const categories = sortedCats.map((cat) => ({
    id: cat.id,
    name: cat.name,
    subcategories: memorySubcategories
      .filter((s) => s.category_id === cat.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => s.name),
  }));
  return NextResponse.json({ success: true, categories, source: "memory" });
}

export async function POST(req: NextRequest) {
  let body: {
    action?: string;
    categoryId?: string;
    name?: string;
    id?: string;
    sort_order?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "invalid JSON body" },
      { status: 400 }
    );
  }

  // Action: add subcategory
  if (body.action === "addSubcategory" && body.categoryId && body.name) {
    const d1 = getD1();
    if (d1) {
      try {
        await d1
          .prepare(
            "INSERT OR IGNORE INTO subcategories (category_id, name) VALUES (?, ?)"
          )
          .bind(body.categoryId, body.name)
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
    const exists = memorySubcategories.some(
      (s) => s.category_id === body.categoryId && s.name === body.name
    );
    if (!exists) {
      const sub: InMemorySubcategory = {
        id: generateId("sub"),
        category_id: body.categoryId,
        name: body.name,
        sort_order: memorySubcategories.filter(
          (s) => s.category_id === body.categoryId
        ).length,
      };
      memorySubcategories.push(sub);
    }
    return NextResponse.json({ success: true, source: "memory" });
  }

  // Default: upsert category
  if (!body.id || !body.name) {
    return NextResponse.json(
      { success: false, error: "Missing id or name" },
      { status: 400 }
    );
  }

  const sortOrder = Number(body.sort_order ?? 0);
  const d1 = getD1();
  if (d1) {
    try {
      await d1
        .prepare(
          "INSERT OR REPLACE INTO categories (id, name, sort_order) VALUES (?, ?, ?)"
        )
        .bind(body.id, body.name, sortOrder)
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
  const idx = memoryCategories.findIndex((c) => c.id === body.id);
  const newCat: InMemoryCategory = {
    id: String(body.id),
    name: String(body.name),
    sort_order: sortOrder,
    created_at: new Date().toISOString(),
  };
  if (idx >= 0) {
    memoryCategories[idx] = newCat;
  } else {
    memoryCategories.push(newCat);
  }
  return NextResponse.json({ success: true, source: "memory" });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { success: false, error: "Missing id" },
      { status: 400 }
    );
  }

  const d1 = getD1();
  if (d1) {
    try {
      await d1
        .prepare("DELETE FROM subcategories WHERE category_id = ?")
        .bind(id)
        .run();
      await d1.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
      return NextResponse.json({ success: true, id, source: "d1" });
    } catch (err) {
      return NextResponse.json(
        { success: false, error: String(err) },
        { status: 500 }
      );
    }
  }

  // In-memory fallback (dev)
  for (let i = memorySubcategories.length - 1; i >= 0; i--) {
    if (memorySubcategories[i].category_id === id) {
      memorySubcategories.splice(i, 1);
    }
  }
  const idx = memoryCategories.findIndex((c) => c.id === id);
  if (idx >= 0) memoryCategories.splice(idx, 1);
  return NextResponse.json({ success: true, id, source: "memory" });
}
