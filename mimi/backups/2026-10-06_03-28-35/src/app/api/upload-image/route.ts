import { NextRequest, NextResponse } from "next/server";
import { getD1, generateId } from "@/lib/d1-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Upload de imagem — POST /api/upload-image
 *
 * Aceita multipart/form-data com campo "file" (imagem).
 * Faz o upload para:
 *  1. Cloudflare D1 (tabela `images`) em produção
 *  2. Em memória (fallback de dev)
 *
 * Retorna: { success, url, id, source }
 *  - url: URL relativa para servir a imagem (/api/img/{id})
 *  - id: identificador da imagem
 */

const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
];

// In-memory fallback (dev) — uses global to share with /api/img/[id] route
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

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Nenhum arquivo enviado. Use o campo 'file'." },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          success: false,
          error: `Tipo não suportado: ${file.type}. Use: ${ALLOWED_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: `Arquivo muito grande: ${(file.size / 1024 / 1024).toFixed(1)}MB. Máximo: 2MB.`,
        },
        { status: 400 }
      );
    }

    // Converter para base64
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    // Gerar ID único
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const id = generateId("img") + "." + ext;

    const d1 = getD1();
    if (d1) {
      try {
        // Criar tabela se não existir
        try {
          await d1
            .prepare(
              "CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, data TEXT, content_type TEXT, size INTEGER, created_at TEXT DEFAULT (datetime('now')))"
            )
            .run();
        } catch {
          // Tabela já existe — OK
        }

        await d1
          .prepare(
            "INSERT INTO images (id, data, content_type, size) VALUES (?, ?, ?, ?)"
          )
          .bind(id, base64, file.type, file.size)
          .run();

        return NextResponse.json({
          success: true,
          url: `/api/img/${id}`,
          id,
          source: "d1",
        });
      } catch (err) {
        return NextResponse.json(
          { success: false, error: `D1 insert failed: ${String(err)}` },
          { status: 500 }
        );
      }
    }

    // In-memory fallback (dev)
    getMemoryStore().set(id, { data: base64, contentType: file.type });
    return NextResponse.json({
      success: true,
      url: `/api/img/${id}`,
      id,
      source: "memory",
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
