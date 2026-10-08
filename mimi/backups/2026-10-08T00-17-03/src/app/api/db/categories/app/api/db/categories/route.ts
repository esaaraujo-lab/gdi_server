import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Categories & subcategories persistence.
 *
 * D1 schema (NOTE: `categories` table is NOT in the initial migration file
 * `migrations/0001_init.sql`. It must be created manually on the D1 instance:
 *
 *   CREATE TABLE IF NOT EXISTS categories (
 *     id TEXT PRIMARY KEY,
 *     name TEXT NOT NULL,
 *     sort_order INTEGER NOT NULL DEFAULT 0,
 *     created_at TEXT DEFAULT (datetime('now'))
 *   );
 *
 *   CREATE TABLE IF NOT EXISTS subcategories (
 *     id INTEGER PRIMARY KEY AUTOINCREMENT,
 *     category_id TEXT NOT NULL,
 *     name TEXT NOT NULL,
 *     sort_order INTEGER NOT NULL DEFAULT 0,
 *     UNIQUE (category_id, name),
 *     FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
 *   );
 *
 * If the table does not exist, every endpoint below returns
 * `{ success: false, error: "categories table not found" }` with HTTP 200,
 * so the client's localStorage fallback keeps the UI working.
 */

function isTableMissingError(err: unknown): boolean {
  const msg = String(err ?? "").toLowerCase();
  return msg.includes("no such table") || msg.includes("does not exist");
}

/** GET /api/db/categories — list all categories with subcategories (JSON-merged) */
export async function GET() {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) {
      return NextResponse.json({ success: false, error: "D1 not bound", categories: [] });
    }
    const cats = await db
      .prepare("SELECT id, name, sort_order FROM categories ORDER BY sort_order ASC, id ASC")
      .all();
    const subs = await db
      .prepare("SELECT category_id, name FROM subcategories ORDER BY sort_order ASC, id ASC")
      .all();
    const subByCat = new Map<string, string[]>();
    for (const s of subs.results || []) {
      const cid = String((s as any).category_id || "");
      if (!subByCat.has(cid)) subByCat.set(cid, []);
      subByCat.get(cid)!.push(String((s as any).name || ""));
    }
    const categories = (cats.results || []).map((row: any) => ({
      id: String(row.id || ""),
      name: String(row.name || ""),
      subcategories: subByCat.get(String(row.id)) || [],
    }));
    return NextResponse.json({ success: true, categories });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err), categories: [] },
      { status: 200 }
    );
  }
}

/** POST /api/db/categories — upsert a category OR add subcategory to an existing category.
 *
 * Body shapes (one of):
 *   { action: "upsertCategory", id, name }                — create/replace a category
 *   { action: "addSubcategory", categoryId, name }       — add subcategory to a category
 *
 * For backwards compatibility, a missing `action` defaults to `upsertCategory`.
 */
export async function POST(req: NextRequest) {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) {
      return NextResponse.json({ success: false, error: "D1 not bound" });
    }

    const body = await req.json();
    const action = typeof body?.action === "string" ? body.action : "upsertCategory";

    if (action === "addSubcategory") {
      const categoryId = typeof body?.categoryId === "string" ? body.categoryId : "";
      const name = typeof body?.name === "string" ? body.name.trim() : "";
      if (!categoryId || !name) {
        return NextResponse.json(
          { success: false, error: "Missing categoryId or name" },
          { status: 400 }
        );
      }
      await db
        .prepare(
          "INSERT OR IGNORE INTO subcategories (category_id, name) VALUES (?, ?)"
        )
        .bind(categoryId, name)
        .run();
      return NextResponse.json({ success: true, categoryId, name });
    }

    // Default: upsert a category
    const id = typeof body?.id === "string" ? body.id : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!id || !name) {
      return NextResponse.json(
        { success: false, error: "Missing id or name" },
        { status: 400 }
      );
    }
    await db
      .prepare(
        "INSERT OR REPLACE INTO categories (id, name, sort_order) VALUES (?, ?, COALESCE((SELECT sort_order FROM categories WHERE id = ?), 0))"
      )
      .bind(id, name, id)
      .run();
    return NextResponse.json({ success: true, id, name });
  } catch (err) {
    if (isTableMissingError(err)) {
      return NextResponse.json(
        { success: false, error: "categories table not found (run migration)" },
        { status: 200 }
      );
    }
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}

/** DELETE /api/db/categories?id=XXX — remove a category (cascade deletes its subcategories)
 *  DELETE /api/db/categories?categoryId=XXX&subcategory=NAME — remove a single subcategory.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) {
      return NextResponse.json({ success: false, error: "D1 not bound" });
    }

    const id = req.nextUrl.searchParams.get("id");
    const categoryId = req.nextUrl.searchParams.get("categoryId");
    const subcategory = req.nextUrl.searchParams.get("subcategory");

    if (categoryId && subcategory) {
      await db
        .prepare(
          "DELETE FROM subcategories WHERE category_id = ? AND name = ?"
        )
        .bind(categoryId, subcategory)
        .run();
      return NextResponse.json({ success: true, categoryId, subcategory });
    }

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing id" },
        { status: 400 }
      );
    }
    await db.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
    // Cascade delete subcategories (in case foreign-key cascade isn't enabled).
    await db
      .prepare("DELETE FROM subcategories WHERE category_id = ?")
      .bind(id)
      .run();
    return NextResponse.json({ success: true, id });
  } catch (err) {
    if (isTableMissingError(err)) {
      return NextResponse.json(
        { success: false, error: "categories table not found (run migration)" },
        { status: 200 }
      );
    }
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
