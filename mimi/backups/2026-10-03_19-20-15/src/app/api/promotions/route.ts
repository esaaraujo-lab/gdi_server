import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

/**
 * API de Promoções.
 * GET /api/promotions — lista promoções ativas (cliente consulta periodicamente)
 * POST /api/promotions — admin cria nova promoção (dispara notificação para todos)
 *
 * Em produção: armazenar em KV do Cloudflare.
 * Aqui: armazenamento em memória (volátil por função serverless).
 */

// Promoções padrão (sempre ativas)
const DEFAULT_PROMOS = [
  {
    id: "promo-3decantes",
    type: "combo",
    title: "3 Decantes por R$ 100",
    message: "🎁 Combo especial: leve 3 decantes árabes por apenas R$ 100!",
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "promo-miniaturas",
    type: "combo",
    title: "Miniaturas Afeer em destaque",
    message: "🌙 Miniaturas árabes Afeer a partir de R$ 79,99 — irresistíveis!",
    active: true,
    createdAt: new Date().toISOString(),
  },
];

// Promoções dinâmicas (admin cria via POST)
const dynamicPromos: Array<{
  id: string;
  type: string;
  title: string;
  message: string;
  active: boolean;
  createdAt: string;
}> = [];

export async function GET() {
  const all = [...dynamicPromos.filter((p) => p.active), ...DEFAULT_PROMOS];
  return NextResponse.json({ promotions: all, count: all.length });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      title?: string;
      message?: string;
      type?: string;
    };
    if (!body.title || !body.message) {
      return NextResponse.json(
        { error: "title e message são obrigatórios" },
        { status: 400 }
      );
    }
    const promo = {
      id: `promo-${Date.now()}`,
      type: body.type || "custom",
      title: body.title,
      message: body.message,
      active: true,
      createdAt: new Date().toISOString(),
    };
    dynamicPromos.unshift(promo);
    if (dynamicPromos.length > 10) dynamicPromos.pop();
    return NextResponse.json({ success: true, promotion: promo });
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }
}

export async function DELETE() {
  dynamicPromos.length = 0;
  return NextResponse.json({ success: true, cleared: true });
}
