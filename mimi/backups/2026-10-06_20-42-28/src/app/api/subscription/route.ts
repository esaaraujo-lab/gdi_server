import { NextRequest, NextResponse } from "next/server";
import { generatePixRecurringCode, qrCodeUrl, formatBRL, getNextBillingDate } from "@/lib/pix";
import type { PixConfig } from "@/lib/store";

export const runtime = "edge";

/**
 * API de Assinatura Mensal com Pix Recorrente via OpenFinance.
 *
 * POST /api/subscription
 * body: {
 *   planId: "monthly" | "quarterly" | "annual",
 *   amount: number,
 *   customerName: string,
 *   customerPhone: string,
 *   config?: Partial<PixConfig>
 * }
 *
 * Retorna:
 * - Pix Copia e Cola recorrente (Point of Initiation Method = 12)
 * - QR Code
 * - Próxima data de cobrança
 * - ID da assinatura
 *
 * Como funciona a recorrência:
 * 1. Cliente paga o primeiro Pix (autorização via OpenFinance)
 * 2. O banco do cliente autoriza cobranças automáticas mensais
 * 3. A loja recebe o valor todo mês no dia programado
 * 4. Cliente pode cancelar a qualquer momento no app do banco
 */

interface SubscriptionPlan {
  id: string;
  name: string;
  amount: number;
  period: string;
  billingDay: number;
}

const PLANS: Record<string, SubscriptionPlan> = {
  monthly: { id: "monthly", name: "Mensal", amount: 69.99, period: "mensal", billingDay: 1 },
  quarterly: { id: "quarterly", name: "Trimestral", amount: 189.99, period: "trimestral", billingDay: 1 },
  annual: { id: "annual", name: "Anual VIP", amount: 599.99, period: "anual", billingDay: 1 },
};

// Armazena assinaturas criadas (em produção: Cloudflare KV ou D1)
const subscriptions: Array<{
  id: string;
  planId: string;
  planName: string;
  amount: number;
  customerName: string;
  customerPhone: string;
  status: "pending" | "active" | "cancelled";
  createdAt: string;
  nextBillingDate: string;
  billingDay: number;
}> = [];

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      planId?: string;
      amount?: number;
      customerName?: string;
      customerPhone?: string;
      config?: Partial<PixConfig>;
    };

    const planId = body.planId || "monthly";
    const plan = PLANS[planId];
    if (!plan) {
      return NextResponse.json({ error: "Plano inválido" }, { status: 400 });
    }

    const amount = body.amount || plan.amount;
    const customerName = body.customerName || "Cliente";
    const customerPhone = body.customerPhone || "";

    const config: PixConfig = {
      key: body.config?.key || process.env.PIX_KEY || "fabiana@araujo.eu.org",
      name: body.config?.name || process.env.MERCHANT_NAME || "FABIANA ARAUJO",
      city: body.config?.city || process.env.MERCHANT_CITY || "SAO PAULO",
      whatsappGroup: body.config?.whatsappGroup || "https://chat.whatsapp.com/",
    };

    // Gera ID único da assinatura
    const subscriptionId = `MIMI${Date.now().toString(36).toUpperCase()}`;

    // Gera Pix Recorrente
    const pixCode = generatePixRecurringCode(amount, config, subscriptionId, plan.billingDay);
    const qrUrl = qrCodeUrl(pixCode, 280);
    const nextBilling = getNextBillingDate(plan.billingDay);

    // Registra a assinatura
    const subscription = {
      id: subscriptionId,
      planId: plan.id,
      planName: plan.name,
      amount,
      customerName,
      customerPhone,
      status: "pending" as const,
      createdAt: new Date().toISOString(),
      nextBillingDate: nextBilling,
      billingDay: plan.billingDay,
    };
    subscriptions.push(subscription);

    // Mensagem para a loja
    const storeMsg = `*NOVA ASSINATURA - CLUBE MIMI MIMOS VIP*

💎 *Plano:* ${plan.name}
💰 *Valor:* ${formatBRL(amount)} ${plan.period}
👤 *Cliente:* ${customerName}
📱 *WhatsApp:* ${customerPhone}
🔑 *ID Assinatura:* ${subscriptionId}
📅 *Próxima cobrança:* ${nextBilling}
🔄 *Recorrência:* ${plan.period} automática via Pix

*PAGAMENTO:* Pix Recorrente (OpenFinance)
*STATUS:* Aguardando autorização`;

    const storeWa = `https://wa.me/${process.env.WHATSAPP_NUMBER || "5511958546078"}?text=${encodeURIComponent(storeMsg)}`;

    // Mensagem para o cliente
    const customerMsg = `*CLUBE MIMI MIMOS VIP — ASSINATURA ATIVADA!*

Olá ${customerName}! Sua assinatura foi criada:

💎 *Plano:* ${plan.name}
💰 *Valor:* ${formatBRL(amount)} ${plan.period}
📅 *Próxima cobrança:* ${nextBilling}
🔄 *Recorrência:* Automática via Pix

*Como funciona a cobrança automática:*
1. Pague o QR Code abaixo para autorizar
2. O banco debitará automaticamente todo mês
3. Cancele quando quiser no app do banco

ID da assinatura: ${subscriptionId}`;

    const customerWa = customerPhone
      ? `https://wa.me/${customerPhone.replace(/\D/g, "")}?text=${encodeURIComponent(customerMsg)}`
      : null;

    return NextResponse.json({
      success: true,
      subscription,
      pix: {
        code: pixCode,
        qrUrl,
        amount,
        recurring: true,
        billingDay: plan.billingDay,
        nextBillingDate: nextBilling,
      },
      notifications: {
        store: { whatsapp: storeWa, message: storeMsg },
        customer: customerWa ? { whatsapp: customerWa, message: customerMsg } : null,
      },
    });
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({
    plans: Object.values(PLANS),
    activeSubscriptions: subscriptions.filter((s) => s.status === "active").length,
    totalSubscriptions: subscriptions.length,
  });
}
