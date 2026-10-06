import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

/**
 * Recebe leads do formulário "Avise-me" no WhatsApp.
 * Em produção real, integraria com KV/D1 do Cloudflare.
 * Aqui apenas valida e ecoa para o cliente confirmar.
 *
 * POST /api/leads  body: { name, phone, product }
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      name?: string;
      phone?: string;
      product?: string;
    };
    if (!body.name || !body.phone || !body.product) {
      return NextResponse.json(
        { error: "Campos name, phone e product são obrigatórios" },
        { status: 400 }
      );
    }
    return NextResponse.json({
      ok: true,
      received: {
        ...body,
        date: new Date().toISOString(),
      },
    });
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }
}
