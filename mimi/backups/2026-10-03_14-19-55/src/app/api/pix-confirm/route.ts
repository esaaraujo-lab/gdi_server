import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

/**
 * API de Confirmação de Pagamento Pix via OpenFinance.
 *
 * POST /api/pix-confirm
 * Body: { txid, amount, customerName, customerPhone, items }
 *
 * Funcionamento:
 * 1. O cliente paga o Pix no app do banco
 * 2. O OpenFinance (sistema do banco) notifica este endpoint via webhook
 * 3. Esta rota confirma o pagamento e:
 *    a) Avisa a loja via WhatsApp (com nome + telefone do cliente)
 *    b) Avisa o cliente que o pagamento foi confirmado
 *
 * Na prática real: o PSP (Provedor de Serviço de Pagamento) como Mercado Pago,
 * Asaas, ou Sicoob envia um webhook para esta URL quando o Pix é pago.
 * Aqui simulamos a confirmação.
 */

interface PixConfirmBody {
  txid?: string;
  amount?: number;
  customerName?: string;
  customerPhone?: string;
  items?: Array<{ name: string; qty: number; price: number }>;
}

// Armazena pedidos confirmados (em produção: Cloudflare KV ou D1)
const confirmedOrders: Array<{
  txid: string;
  amount: number;
  customerName: string;
  customerPhone: string;
  items: PixConfirmBody["items"];
  status: "confirmed";
  confirmedAt: string;
}> = [];

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PixConfirmBody;

    if (!body.txid || !body.amount) {
      return NextResponse.json(
        { error: "txid e amount são obrigatórios" },
        { status: 400 }
      );
    }

    // Registra o pedido confirmado
    const order = {
      txid: body.txid,
      amount: body.amount,
      customerName: body.customerName || "Cliente",
      customerPhone: body.customerPhone || "",
      items: body.items || [],
      status: "confirmed" as const,
      confirmedAt: new Date().toISOString(),
    };
    confirmedOrders.push(order);

    // Constrói mensagem para a loja (via WhatsApp)
    const storeMsg = `✅ *PAGAMENTO PIX CONFIRMADO!*

👤 *Cliente:* ${order.customerName}
📱 *WhatsApp:* ${order.customerPhone}
🔑 *TxID:* ${order.txid}
💰 *Valor:* R$ ${order.amount.toFixed(2).replace(".", ",")}
🕐 *Pago em:* ${new Date(order.confirmedAt).toLocaleString("pt-BR")}

📦 *Itens do Pedido:*
${(order.items || [])
  .map((i) => `• ${i.qty}x ${i.name} — R$ ${(i.price * i.qty).toFixed(2)}`)
  .join("\n")}

✅ *Pagamento confirmado automaticamente via OpenFinance*

_Responda esta mensagem para combinar a entrega_`;

    // Constrói mensagem para o cliente
    const customerMsg = `✅ *PAGAMENTO CONFIRMADO — MIMI MIMOS!*

Olá ${order.customerName}! Recebemos seu pagamento de R$ ${order.amount
      .toFixed(2)
      .replace(".", ",")}.

Seu pedido está confirmado! 🎉

📦 Em breve entraremos em contato para combinar a entrega.

Obrigada pela preferência! 💎`;

    // URLs do WhatsApp
    const storePhone = "5511958546078"; // WhatsApp da loja
    const customerPhone = order.customerPhone.replace(/\D/g, "");
    const storeWaUrl = `https://wa.me/${storePhone}?text=${encodeURIComponent(
      storeMsg
    )}`;
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
    orders: confirmedOrders,
    count: confirmedOrders.length,
  });
}
