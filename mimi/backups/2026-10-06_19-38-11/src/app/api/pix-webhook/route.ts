import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * FASE 2 — Webhook de Confirmação Automática de Pix
 *
 * Esta rota NÃO está ativa ainda. Quando ativada:
 * 1. Banco do Brasil ou Bradesco envia POST aqui quando Pix é pago
 * 2. Sistema confirma o pedido no D1 automaticamente
 * 3. Dispara notificação WhatsApp para loja + cliente
 *
 * PARA ATIVAR:
 * 1. Acessar app do Banco do Brasil (ou Bradesco) → Pix → Webhooks
 * 2. Cadastrar URL: https://mimi-mimos.pages.dev/api/pix-webhook
 * 3. Definir chave Pix para receber notificações
 * 4. O banco enviará POST com formato padrão Bacen (pix.dev/api/v2/webhook)
 *
 * FORMATO ESPERADO (padrão Bacen):
 * {
 *   "pix": [{
 *     "txid": "MM_1234567890",
 *     "valor": "69.99",
 *     "horario": "2025-01-15T10:30:00.000Z",
 *     "pagador": { "nome": "João Silva", "cpf": "12345678901" },
 *     "status": "CONCLUIDA"
 *   }]
 * }
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validação básica — formato padrão Bacen
    const pixData = body?.pix?.[0];
    if (!pixData?.txid) {
      return NextResponse.json(
        { error: "Formato inválido — esperado { pix: [{ txid, valor, ... }] }" },
        { status: 400 }
      );
    }

    const txid = pixData.txid;
    const amount = parseFloat(pixData.valor || "0");
    const payerName = pixData.pagador?.nome || "Não informado";
    const payerCpf = pixData.pagador?.cpf || "";
    const status = pixData.status || "CONCLUIDA";

    // Só processa se o Pix foi concluído
    if (status !== "CONCLUIDA") {
      return NextResponse.json({
        success: true,
        message: `Pix ${txid} com status ${status} — ignorado`,
      });
    }

    // Atualiza o pedido no D1 (marca como confirmado)
    const d1 = getD1();
    if (d1) {
      try {
        await d1
          .prepare(
            `UPDATE orders SET status = 'confirmed', confirmed_at = datetime('now')
             WHERE txid = ?`
          )
          .bind(txid)
          .run();

        // Busca o pedido atualizado para enviar notificação
        const order = (await d1
          .prepare("SELECT * FROM orders WHERE txid = ?")
          .bind(txid)
          .first()) as Record<string, unknown> | null;

        if (order) {
          const customerName = String(order.customer_name || "");
          const customerPhone = String(order.customer_whatsapp || "");
          const total = Number(order.total || 0);

          // Mensagem para a loja
          const storeMsg = `✅ *PIX CONFIRMADO AUTOMATICAMENTE!*

👤 *Cliente:* ${customerName}
📱 *WhatsApp:* ${customerPhone}
🔑 *ID:* ${txid}
💰 *Valor:* R$ ${total.toFixed(2).replace(".", ",")}
🏦 *Pagador:* ${payerName}${payerCpf ? ` (CPF: ${payerCpf})` : ""}
⚡ *Status:* ${status}
🕐 *Confirmado em:* ${new Date().toLocaleString("pt-BR")}

_Pagamento confirmado via webhook do banco_`;

          const storePhone = process.env.WHATSAPP_NUMBER || "5511958546078";
          const storeWaUrl = `https://wa.me/${storePhone}?text=${encodeURIComponent(storeMsg)}`;

          // Mensagem para o cliente
          const rawCustomerPhone = customerPhone.replace(/\D/g, "");
          const cleanPhone = rawCustomerPhone.startsWith("55") ? rawCustomerPhone : `55${rawCustomerPhone}`;
          let customerWaUrl: string | null = null;
          if (cleanPhone) {
            const customerMsg = `✅ *PAGAMENTO CONFIRMADO — MIMI MIMOS!*

Olá ${customerName}! Seu pagamento de R$ ${total.toFixed(2).replace(".", ",")} foi confirmado! 🎉

Seu pedido está sendo preparado. Em breve entraremos em contato para a entrega. 💎

Obrigada pela preferência!`;

            customerWaUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(customerMsg)}`;
          }

          // TODO: Enviar WhatsApp automaticamente (requer API do WhatsApp Business)
          // Por enquanto, retorna as URLs para confirmação manual
          return NextResponse.json({
            success: true,
            message: "Pix confirmado automaticamente via webhook",
            txid,
            amount,
            payer: payerName,
            order: {
              id: order.id,
              customer: customerName,
              total,
            },
            notifications: {
              store: { whatsapp: storeWaUrl },
              customer: customerWaUrl ? { whatsapp: customerWaUrl } : null,
            },
            note: "Para envio automático de WhatsApp, integrar com 360dialog ou Evolution API",
          });
        }
      } catch (err) {
        return NextResponse.json(
          { error: "D1 update failed", detail: String(err) },
          { status: 500 }
        );
      }
    }

    // Se D1 não estiver disponível (dev), apenas confirma recebimento
    return NextResponse.json({
      success: true,
      message: "Webhook recebido (D1 não disponível — modo dev)",
      txid,
      amount,
      payer: payerName,
    });
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({
    service: "Mimi Mimos — Pix Webhook (Fase 2)",
    status: "READY — aguardando cadastro no banco",
    banks: ["Banco do Brasil", "Bradesco"],
    webhookUrl: "https://mimi-mimos.pages.dev/api/pix-webhook",
    instructions: [
      "1. Acesse o app do Banco do Brasil → Pix → Webhooks",
      "2. Cadastre a URL acima como webhook de recebimento",
      "3. Defina a chave Pix que receberá os pagamentos",
      "4. O banco enviará POST automático quando um Pix for pago",
      "5. O sistema confirmará o pedido no D1 e notificará via WhatsApp",
    ],
    note: "Esta rota está pronta mas inativa. Ative cadastrando no banco.",
  });
}
