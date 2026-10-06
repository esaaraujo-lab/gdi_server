import { NextRequest, NextResponse } from "next/server";
import { generatePixCode, qrCodeUrl } from "@/lib/pix";
import type { PixConfig } from "@/lib/store";

export const runtime = "edge";

/**
 * Gera o BR Code (Pix Copia e Cola) e a URL do QR Code server-side.
 * Compatível com Cloudflare Workers (edge runtime).
 *
 * POST /api/pix-code
 * body: { amount: number, config: PixConfig }
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      amount?: number;
      config?: Partial<PixConfig>;
    };
    const amount = Number(body.amount);
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "amount inválido" }, { status: 400 });
    }
    const config: PixConfig = {
      key: body.config?.key || "mimimimos.vendas@pix.com.br",
      name: body.config?.name || "Mimi Mimos Perfumaria LTDA",
      city: body.config?.city || process.env.MERCHANT_CITY || "SAO PAULO",
      whatsappGroup: body.config?.whatsappGroup || "https://chat.whatsapp.com/",
    };
    const code = generatePixCode(amount, config);
    return NextResponse.json({
      code,
      qrUrl: qrCodeUrl(code, 280),
      amount,
      beneficiary: config.name,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({
    service: "Mimi Mimos — OpenFinance Pix",
    runtime: "edge",
    cloudflareWorkers: true,
    endpoints: {
      "POST /api/pix-code": "Gera BR Code + QR URL (body: { amount, config })",
    },
  });
}
