import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * WhatsApp Send — Meta Cloud API (official, 1000 free msgs/month).
 *
 * CONFIGURATION (set in Cloudflare Pages → Settings → Environment Variables):
 * WHATSAPP_META_TOKEN  = EAAxxxxxxxx... (permanent access token from Meta Business)
 * WHATSAPP_PHONE_ID    = 123456789     (phone number ID from Meta Business)
 *
 * USAGE:
 * POST /api/whatsapp-send
 * Body: { to: "5511970111433", message: "✅ Pedido confirmado!" }
 *
 * If not configured, falls back to wa.me link (manual).
 */

interface SendBody {
  to: string;
  message: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SendBody;

    if (!body.to || !body.message) {
      return NextResponse.json(
        { error: "to e message são obrigatórios" },
        { status: 400 }
      );
    }

    // Normalize phone: remove non-digits, add 55 if missing
    const rawPhone = body.to.replace(/\D/g, "");
    const normalizedPhone = rawPhone.startsWith("55")
      ? rawPhone
      : `55${rawPhone}`;

    const token = process.env.WHATSAPP_META_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;

    // If Meta not configured, return wa.me link (manual)
    if (!token || !phoneId) {
      const waLink = `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(body.message)}`;
      return NextResponse.json({
        success: false,
        method: "manual",
        to: normalizedPhone,
        waLink,
        error: "Meta Cloud API não configurada. Cadastre WHATSAPP_META_TOKEN e WHATSAPP_PHONE_ID no Cloudflare.",
      });
    }

    // Send via Meta WhatsApp Cloud API
    try {
      const res = await fetch(
        `https://graph.facebook.com/v18.0/${phoneId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: normalizedPhone,
            type: "text",
            text: { body: body.message },
          }),
        }
      );

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return NextResponse.json({
          success: true,
          method: "meta",
          to: normalizedPhone,
          messageId: data?.messages?.[0]?.id || null,
        });
      }

      const errData = await res.json().catch(() => ({}));
      const errMsg = errData?.error?.message || `HTTP ${res.status}`;
      // Fallback to wa.me if Meta fails
      const waLink = `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(body.message)}`;
      return NextResponse.json({
        success: false,
        method: "manual",
        to: normalizedPhone,
        waLink,
        error: `Meta API error: ${errMsg}`,
      });
    } catch (err) {
      // Fallback to wa.me on network error
      const waLink = `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(body.message)}`;
      return NextResponse.json({
        success: false,
        method: "manual",
        to: normalizedPhone,
        waLink,
        error: `Network error: ${String(err).slice(0, 80)}`,
      });
    }
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }
}

export async function GET() {
  const hasMeta = Boolean(
    process.env.WHATSAPP_META_TOKEN && process.env.WHATSAPP_PHONE_ID
  );

  return NextResponse.json({
    service: "Mimi Mimos — WhatsApp Send API",
    method: "Meta WhatsApp Cloud API (official)",
    status: hasMeta ? "READY" : "AWAITING CONFIGURATION",
    configured: hasMeta,
    envVars: ["WHATSAPP_META_TOKEN", "WHATSAPP_PHONE_ID"],
    freeTier: "1000 conversas/mês grátis",
    setupSteps: [
      "1. Acesse https://business.facebook.com",
      "2. Crie conta Meta Business (CPF)",
      "3. Adicione WhatsApp Business (número dedicado)",
      "4. Gere token de acesso permanente",
      "5. Copie o Phone Number ID",
      "6. Cadastre WHATSAPP_META_TOKEN e WHATSAPP_PHONE_ID no Cloudflare",
      "7. Faça novo deploy para aplicar",
    ],
  });
}
