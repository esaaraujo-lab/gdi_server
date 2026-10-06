import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Serve imagem — GET /api/img/[id]
 *
 * Lê a imagem da tabela `images` no D1 (ou da memória em dev) e retorna
 * o binário com o Content-Type correto. Cache de 30 dias (immutable).
 */

declare global {
  // eslint-disable-next-line no-var
  var __memoryImages: Map<string, { data: string; contentType: string }> | undefined;
}

function getMemoryStore() {
  if (!globalThis.__memoryImages) {
    globalThis.__memoryImages = new Map();
  }
  return globalThis.__memoryImages;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "Missing image id" }, { status: 400 });
  }

  const d1 = getD1();
  if (d1) {
    try {
      const row = (await d1
        .prepare("SELECT data, content_type FROM images WHERE id = ?")
        .bind(id)
        .first()) as { data?: string; content_type?: string } | null;

      if (!row || !row.data) {
        return NextResponse.json({ error: "Image not found" }, { status: 404 });
      }

      const binary = atob(row.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      return new NextResponse(bytes, {
        status: 200,
        headers: {
          "Content-Type": row.content_type || "image/jpeg",
          "Cache-Control": "public, max-age=2592000, immutable",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  // In-memory fallback (dev)
  const store = getMemoryStore();
  const img = store.get(id);
  if (!img) {
    return NextResponse.json(
      { error: "Image not found in memory" },
      { status: 404 }
    );
  }

  const binary = atob(img.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": img.contentType,
      "Cache-Control": "public, max-age=2592000, immutable",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
