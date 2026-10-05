import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * WhatsApp Send — Unified API for automated WhatsApp messages.
 *
 * PRIMARY: Evolution API (self-hosted, open-source, no fees)
 * FALLBACK: WhatsApp Cloud API (Meta official, 1000 free msgs/month)
 *
 * CONFIGURATION (set in Cloudflare Pages → Settings → Environment Variables):
 *
 * --- Evolution API (primary) ---
 * EVOLUTION_API_URL    = https://your-evolution-vps.com
 * EVOLUTION_API_KEY    = your-evolution-api-key
 * EVOLUTION_INSTANCE   = mimi-mimos-instance
 *
 * --- Meta Cloud API (fallback) ---
 * WHATSAPP_META_TOKEN   = EAAxxxxxxxx...
 * WHATSAPP_PHONE_ID     = 123456789
 *
 * USAGE:
 * POST /api/whatsapp-send
 * Body: { to: "5511970111433", message: "✅ Pedido confirmado!" }
 *
 * If neither is configured, falls back to wa.me link (manual).
 */

interface SendBody {
  to: string;
  message: string;
}

interface SendResult {
  success: boolean;
  method: "evolution" | "meta" | "manual";
  error?: string;
  waLink?: string;
}

/**
 * Try Evolution API (primary) — self-hosted, no fees, unlimited messages.
 * Requires: EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE
 */
async function tryEvolution(body: SendBody): Promise<SendResult> {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE || "mimi-mimos";

  if (!apiUrl || !apiKey) {
    return { success: false, method: "evolution", error: "not configured" };
  }

  try {
    // Evolution API v1 — send text message
    const res = await fetch(`${apiUrl}/message/sendText/${instance}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: body.to,
        textMessage: { text: body.message },
      }),
    });

    if (res.ok) {
      return { success: true, method: "evolution" };
    }
    const errText = await res.text().catch(() => "unknown");
    return { success: false, method: "evolution", error: `HTTP ${res.status}: ${errText.slice(0, 100)}` };
  } catch (err) {
    return { success: false, method: "evolution", error: String(err).slice(0, 100) };
  }
}

/**
 * Try Meta WhatsApp Cloud API (fallback) — official, 1000 free msgs/month.
 * Requires: WHATSAPP_META_TOKEN, WHATSAPP_PHONE_ID
 */
async function tryMeta(body: SendBody): Promise<SendResult> {
  const token = process.env.WHATSAPP_META_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;

  if (!token || !phoneId) {
    return { success: false, method: "meta", error: "not configured" };
  }

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
          to: body.to,
          type: "text",
          text: { body: body.message },
        }),
      }
    );

    if (res.ok) {
      return { success: true, method: "meta" };
    }
    const errData = await res.json().catch(() => ({}));
    const errMsg = errData?.error?.message || `HTTP ${res.status}`;
    return { success: false, method: "meta", error: errMsg.slice(0, 100) };
  } catch (err) {
    return { success: false, method: "meta", error: String(err).slice(0, 100) };
  }
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

    const sendBody: SendBody = { to: normalizedPhone, message: body.message };

    // 1) Try Evolution API (primary — free, unlimited)
    const evolutionResult = await tryEvolution(sendBody);
    if (evolutionResult.success) {
      return NextResponse.json({
        success: true,
        method: "evolution",
        to: normalizedPhone,
      });
    }

    // 2) If Evolution fails, try Meta Cloud API (fallback — official)
    const metaResult = await tryMeta(sendBody);
    if (metaResult.success) {
      return NextResponse.json({
        success: true,
        method: "meta",
        to: normalizedPhone,
      });
    }

    // 3) If both fail, return wa.me link (manual fallback)
    const waLink = `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(body.message)}`;
    return NextResponse.json({
      success: false,
      method: "manual",
      to: normalizedPhone,
      waLink,
      errors: {
        evolution: evolutionResult.error,
        meta: metaResult.error,
      },
      message: "Nenhuma API configurada. Use o link wa.me abaixo para envio manual.",
    });
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }
}

export async function GET() {
  const hasEvolution = Boolean(
    process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY
  );
  const hasMeta = Boolean(
    process.env.WHATSAPP_META_TOKEN && process.env.WHATSAPP_PHONE_ID
  );

  return NextResponse.json({
    service: "Mimi Mimos — WhatsApp Send API",
    status:
      hasEvolution || hasMeta
        ? "READY"
        : "AWAITING CONFIGURATION",
    primary: {
      method: "Evolution API (self-hosted)",
      configured: hasEvolution,
      envVars: ["EVOLUTION_API_URL", "EVOLUTION_API_KEY", "EVOLUTION_INSTANCE"],
    },
    fallback: {
      method: "Meta WhatsApp Cloud API (official)",
      configured: hasMeta,
      envVars: ["WHATSAPP_META_TOKEN", "WHATSAPP_PHONE_ID"],
    },
    manual: {
      method: "wa.me link (manual click)",
      alwaysAvailable: true,
    },
    setupGuide: "https://mimi-mimos.pages.dev/api/whatsapp-send/guide",
  });
}
