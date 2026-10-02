import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) return NextResponse.json({ success: false, error: "D1 not bound", categories: [] });
    const result = await db.prepare("SELECT * FROM categories ORDER BY sort_order ASC").all();
    const categories = [];
    for (const cat of (result.results || [])) {
      const subs = await db.prepare("SELECT name FROM subcategories WHERE category_id = ? ORDER BY sort_order ASC").bind(cat.id).all();
      categories.push({
        id: cat.id, name: cat.name, subcategories: (subs.results || []).map((s: any) => s.name),
      });
    }
    return NextResponse.json({ success: true, categories });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err), categories: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) return NextResponse.json({ success: false, error: "D1 not bound" });
    const body = await req.json();
    if (body.action === "addSubcategory" && body.categoryId && body.name) {
      await db.prepare("INSERT OR IGNORE INTO subcategories (category_id, name) VALUES (?, ?)").bind(body.categoryId, body.name).run();
      return NextResponse.json({ success: true });
    }
    // Default: upsert category
    if (body.id && body.name) {
      await db.prepare("INSERT OR REPLACE INTO categories (id, name, sort_order) VALUES (?, ?, ?)").bind(body.id, body.name, body.sort_order || 0).run();
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ success: false, error: "Missing id or name" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { env } = getRequestContext();
    const db = (env as any).DB;
    if (!db) return NextResponse.json({ success: false, error: "D1 not bound" });
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
    await db.prepare("DELETE FROM subcategories WHERE category_id = ?").bind(id).run();
    await db.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
