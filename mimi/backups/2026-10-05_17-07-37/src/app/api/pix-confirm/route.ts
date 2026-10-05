import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

/**
 * API de Confirmação de Pagamento Pix — Semi-manual (Fase 1) + Webhook ready (Fase 2).
 *
 * FASE 1 (atual): Cliente paga → clica "Já fiz o Pix" → WhatsApp abre com dados
 * FASE 2 (futuro): Banco envia webhook → confirmação automática
 *
 * POST /api/pix-confirm
 * Body: { txid, amount, customerName, customerPhone, items, couponCode, couponDiscount, shippingName, shippingPrice }
 *
 * Retorna: { success, order, notifications: { store: { whatsapp, message }, customer: { whatsapp, message } } }
 */

interface PixConfirmBody {
  txid?: string;
  amount?: number;
  customerName?: string;
  customerPhone?: string;
  items?: Array<{ name: string; qty: number; price: number }>;
  couponCode?: string | null;
  couponDiscount?: number;
  shippingName?: string;
  shippingPrice?: number;
  giftWrap?: boolean;
  giftMessage?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PixConfirmBody;

    if (!body.txid || !body.amount) {
      return NextResponse.json(
        { error: "txid e amount são obrigatórios" },
        { status: 400 }
      );
    }

    const order = {
      txid: body.txid,
      amount: body.amount,
      customerName: body.customerName || "Cliente",
      customerPhone: body.customerPhone || "",
      items: body.items || [],
      couponCode: body.couponCode || null,
      couponDiscount: body.couponDiscount || 0,
      shippingName: body.shippingName || "Retirada na loja",
      shippingPrice: body.shippingPrice || 0,
      giftWrap: body.giftWrap || false,
      giftMessage: body.giftMessage || null,
      status: "pending_confirmation" as const,
      createdAt: new Date().toISOString(),
    };

    // Formata lista de itens
    const itemsList = (order.items || [])
      .map((i) => `• ${i.qty}x ${i.name} — R$ ${(i.price * i.qty).toFixed(2).replace(".", ",")}`)
      .join("\n");

    // Calcula desconto e frete
    const discountLine = order.couponDiscount > 0
      ? `\n🎫 *Cupom ${order.couponCode}:* -R$ ${order.couponDiscount.toFixed(2).replace(".", ",")}`
      : "";

    const shippingLine = order.shippingPrice > 0
      ? `\n🚚 *Frete (${order.shippingName}):* R$ ${order.shippingPrice.toFixed(2).replace(".", ",")}`
      : `\n🚚 *Entrega:* Retirada na loja (grátis)`;

    const giftLine = order.giftWrap
      ? `\n🎁 *Embrulho:* Sim (+R$ 5,00)${order.giftMessage ? ` — "${order.giftMessage}"` : ""}`
      : "";

    // Mensagem para a loja — completa com todos os dados
    const storeMsg = `🛍️ *NOVO PEDIDO — MIMI MIMOS*

👤 *Cliente:* ${order.customerName}
📱 *WhatsApp:* ${order.customerPhone}
🔑 *ID do pedido:* ${order.txid}

📦 *Itens:*
${itemsList}
${discountLine}${shippingLine}${giftLine}

💰 *Total:* R$ ${order.amount.toFixed(2).replace(".", ",")}
💳 *Pagamento:* Pix (aguardando confirmação)
🕐 *Data:* ${new Date(order.createdAt).toLocaleString("pt-BR")}

✅ _Confirme o pagamento no seu app do banco e responda o cliente_`;

    // Mensagem para o cliente
    const customerMsg = `✅ *PEDIDO RECEBIDO — MIMI MIMOS!*

Olá ${order.customerName}! Recebemos seu pedido. 🎉

📦 *Itens:*
${itemsList}
${shippingLine}

💰 *Total:* R$ ${order.amount.toFixed(2).replace(".", ",")}
🔑 *ID:* ${order.txid}

Estamos confirmando seu pagamento Pix. Assim que confirmar, avisaremos por aqui! 💎

_Obrigada pela preferência!_`;

    // URLs do WhatsApp
    const storePhone = "5511970111433";
    const customerPhone = order.customerPhone.replace(/\D/g, "");
    const storeWaUrl = `https://wa.me/${storePhone}?text=${encodeURIComponent(storeMsg)}`;
    const customerWaUrl = customerPhone
      ? `https://wa.me/${customerPhone}?text=${encodeURIComponent(customerMsg)}`
      : null;

    return NextResponse.json({
      success: true,
      order,
      notifications: {
        store: {
          whatsapp: storeWaUrl,
          message: storeMsg,
        },
        customer: customerWaUrl
          ? {
              whatsapp: customerWaUrl,
              message: customerMsg,
            }
          : null,
      },
    });
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({
    service: "Mimi Mimos — Pix Confirm (Fase 1: semi-manual)",
    description: "Cliente paga Pix → clica 'Já fiz o Pix' → WhatsApp abre com dados do pedido",
    phase: 1,
    webhookReady: false,
    webhookUrl: "https://mimi-mimos.pages.dev/api/pix-webhook",
    nextStep: "Cadastrar webhook no Banco do Brasil / Bradesco (app PF) para Fase 2",
  });
}
