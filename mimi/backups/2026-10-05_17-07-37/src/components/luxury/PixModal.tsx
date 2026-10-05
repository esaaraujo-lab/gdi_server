"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore, useUI } from "@/lib/stores-combined";
import { generatePixCode, qrCodeUrl, formatBRL } from "@/lib/pix";
import {
  QrCode as PixIcon,
  X,
  ShieldCheck,
  Timer,
  Copy,
  MessageCircle,
  Ticket,
  Truck,
  Gift,
} from "lucide-react";
import { toast } from "sonner";
import { getDeviceInfoBrowser } from "@/lib/device-info";

function PixTimer() {
  const [seconds, setSeconds] = useState(15 * 60);
  useEffect(() => {
    const id = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(id);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return seconds <= 0 ? (
    <strong className="text-white">Expirado</strong>
  ) : (
    <strong className="text-white">
      {m}:{s.toString().padStart(2, "0")}
    </strong>
  );
}

export default function PixModal() {
  const pixOpen = useUI((s) => s.pixOpen);
  const setPixOpen = useUI((s) => s.setPixOpen);
  const cart = useStore((s) => s.cart);
  const clearCart = useStore((s) => s.clearCart);
  const pixConfig = useStore((s) => s.pixConfig);
  const subtotal = useStore((s) => s.cartSubtotal());
  const decanteCount = useStore((s) => s.cartDecanteCount());

  const [copied, setCopied] = useState(false);
  const [couponData, setCouponData] = useState<{
    code: string | null;
    discount: number;
    freeShip: boolean;
    description: string;
  } | null>(null);
  const [shippingData, setShippingData] = useState<{
    name: string;
    price: number;
    originalPrice?: number;
  }>({ name: "Retirar na Loja", price: 0 });
  const [giftData, setGiftData] = useState<{
    enabled: boolean;
    price: number;
    message: string;
  } | null>(null);

  // Lê cupom + frete + gift wrap do localStorage quando o modal abre
  useEffect(() => {
    if (!pixOpen) return;
    try {
      const couponRaw = localStorage.getItem("mimi-coupon");
      if (couponRaw) {
        setCouponData(JSON.parse(couponRaw));
      } else {
        setCouponData(null);
      }
      const shipRaw = localStorage.getItem("mimi-shipping");
      if (shipRaw) {
        const ship = JSON.parse(shipRaw);
        setShippingData({
          name: ship.name || "Retirar na Loja",
          price: ship.price || 0,
          originalPrice: ship.originalPrice,
        });
      }
      const giftRaw = localStorage.getItem("mimi-gift-wrap");
      if (giftRaw) {
        setGiftData(JSON.parse(giftRaw));
      } else {
        setGiftData(null);
      }
    } catch {
      /* ignore */
    }
  }, [pixOpen]);

  const couponDiscount = couponData?.discount || 0;
  const shippingPrice = shippingData.price || 0;
  const giftWrapPrice = giftData?.enabled ? giftData.price : 0;
  const finalAmount = Math.max(
    0,
    subtotal - couponDiscount + shippingPrice + giftWrapPrice
  );

  const pixCode = useMemo(
    () => generatePixCode(finalAmount, pixConfig),
    [finalAmount, pixConfig]
  );
  const qrUrl = useMemo(() => qrCodeUrl(pixCode, 280), [pixCode]);

  if (!pixOpen) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pixCode);
      setCopied(true);
      toast.success("Código Pix Copiado com sucesso!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Selecione manualmente.");
    }
  };

  const confirmPaid = async () => {
    // Lê dados do cliente, frete e cupom do localStorage
    const customer = JSON.parse(
      localStorage.getItem("mimi-customer") || '{"name":"","phone":""}'
    ) as { name: string; phone: string; email?: string };
    const shipping = JSON.parse(
      localStorage.getItem("mimi-shipping") ||
        '{"option":0,"price":0,"name":"Retirar na Loja"}'
    ) as {
      option: number;
      price: number;
      name: string;
      address?: string;
      cep?: string;
    };
    const coupon = JSON.parse(
      localStorage.getItem("mimi-coupon") || '{"code":null,"discount":0}'
    ) as {
      code: string | null;
      discount: number;
      description?: string;
    };
    const giftRaw = localStorage.getItem("mimi-gift-wrap");
    const gift = giftRaw
      ? (JSON.parse(giftRaw) as {
          enabled: boolean;
          price: number;
          message: string;
        })
      : null;

    const shippingPrice = shipping.price || 0;
    const couponDiscount = coupon.discount || 0;
    const giftWrapPrice = gift?.enabled ? gift.price : 0;
    const giftEnabled = gift?.enabled ?? false;
    const giftMessage = gift?.enabled ? gift.message : "";
    const totalAmount = Math.max(
      0,
      subtotal - couponDiscount + shippingPrice + giftWrapPrice
    );

    // TxID gerado (MIMI{timestamp}) — usado tanto para o webhook simulado
    // quanto para o pedido no D1.
    const txid = `MIMI${Date.now()}`;

    // Items estruturados para o D1 (preserva nome + código + qty + preço).
    const orderItems = cart.map((i) => ({
      name: i.name,
      code: i.code,
      qty: i.qty,
      price: i.price,
    }));

    // Coleta dados do dispositivo do cliente (para marketing direto).
    const device = getDeviceInfoBrowser();
    const customerPhone = customer.phone || "";
    const customerEmail = customer.email || "";

    // 1) Persiste o pedido no D1 (POST /api/db/orders) — não bloqueia o fluxo
    //    de WhatsApp se falhar.
    let orderId: string | null = null;
    try {
      const orderRes = await fetch("/api/db/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txid,
          customer_name: customer.name,
          customer_whatsapp: customerPhone,
          customer_email: customerEmail || undefined,
          shipping_name: shipping.name,
          shipping_price: shippingPrice,
          shipping_address: shipping.address,
          shipping_cep: shipping.cep,
          coupon_code: coupon.code,
          coupon_discount: couponDiscount,
          gift_wrap: giftEnabled,
          gift_wrap_price: giftWrapPrice,
          gift_message: giftEnabled ? giftMessage : undefined,
          items: orderItems,
          subtotal,
          total: totalAmount,
          status: "pending",
          payment_method: "pix",
        }),
      });
      if (orderRes.ok) {
        const data = await orderRes.json();
        if (data?.success) orderId = data.id ?? null;
      }
    } catch {
      // Silencioso: D1 indisponível não bloqueia o checkout.
    }

    // 2) Cria/atualiza cliente no D1 (POST /api/db/customers) — upsert por
    //    número de WhatsApp. Incrementa total_orders e total_spent.
    if (customerPhone) {
      try {
        await fetch("/api/db/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: customer.name,
            whatsapp: customerPhone,
            email: customerEmail || undefined,
            device_name: device.deviceName,
            device_type: device.deviceType,
            increment_orders: 1,
            add_spent: totalAmount,
          }),
        });
      } catch {
        // Silencioso.
      }
    }

    // 3) Chama a API de confirmação de Pix (simula webhook OpenFinance) —
    //    mantém o fluxo original de notificações por WhatsApp.
    try {
      const res = await fetch("/api/pix-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txid,
          amount: totalAmount,
          customerName: customer.name,
          customerPhone: customerPhone,
          items: cart.map((i) => ({
            name: i.name,
            qty: i.qty,
            price: i.price,
          })),
          couponCode: coupon.code,
          couponDiscount,
          shippingName: shipping.name,
          shippingPrice,
        }),
      });
      const data = await res.json();

      if (data.success) {
        // Abre WhatsApp da loja com a notificação de pagamento confirmado
        window.open(data.notifications.store.whatsapp, "_blank");

        // Se tiver telefone do cliente, avisa ele também
        if (data.notifications.customer) {
          setTimeout(() => {
            window.open(data.notifications.customer.whatsapp, "_blank");
          }, 1500);
        }

        toast.success(
          "✅ Loja avisada! Aguarde a confirmação do pagamento no WhatsApp."
        );
      } else {
        // Fallback: envia pedido manual via WhatsApp
        fallbackWhatsAppOrder(customer, shipping, coupon, totalAmount);
      }
    } catch {
      // Fallback: envia pedido manual via WhatsApp
      fallbackWhatsAppOrder(customer, shipping, coupon, totalAmount);
    }

    setPixOpen(false);
    clearCart();
    localStorage.removeItem("mimi-customer");
    localStorage.removeItem("mimi-shipping");
    localStorage.removeItem("mimi-coupon");
    localStorage.removeItem("mimi-gift-wrap");
  };

  const fallbackWhatsAppOrder = (
    customer: { name: string; phone: string },
    shipping: { name: string; price: number },
    coupon: { code: string | null; discount: number; description?: string },
    total: number
  ) => {
    let msg = `*NOVO PEDIDO - MIMI MIMOS PERFUMARIA*\n\n`;
    msg += `👤 *Cliente:* ${customer.name}\n`;
    msg += `📱 *WhatsApp:* ${customer.phone}\n\n`;
    msg += `📦 *Itens:*\n`;
    cart.forEach((item) => {
      msg += `• ${item.qty}x ${item.name} (${item.code}) - ${formatBRL(
        item.price * item.qty
      )}\n`;
    });
    const decanteCount = cart
      .filter((i) => i.category === "DECANTE")
      .reduce((acc, i) => acc + i.qty, 0);
    if (decanteCount >= 3) {
      msg += `\n🎁 *PROMO:* ${Math.floor(decanteCount / 3)} combo(s) 3 por R$ 100\n`;
    }
    if (coupon?.code) {
      msg += `\n🎟️ *CUPOM:* ${coupon.code}${
        coupon.description ? ` — ${coupon.description}` : ""
      }\n`;
      msg += `💰 *Desconto:* - ${formatBRL(coupon.discount || 0)}\n`;
    }
    msg += `\n🚚 *Entrega:* ${shipping.name} (${
      shipping.price === 0 ? "Grátis" : formatBRL(shipping.price)
    })\n`;
    msg += `💰 *TOTAL:* ${formatBRL(total)}\n`;
    msg += `*PAGAMENTO:* Pix\n\n`;
    msg += `Aguardando confirmação!`;

    // Se for grupo do WhatsApp (chat.whatsapp.com), abre o grupo
    // Se for wa.me, extrai o número e envia mensagem
    if (pixConfig.whatsappGroup.includes("chat.whatsapp.com")) {
      window.open(pixConfig.whatsappGroup, "_blank");
    } else {
      const waMatch = pixConfig.whatsappGroup.match(/wa\.me\/(\d+)/);
      const phone = waMatch ? waMatch[1] : "5511970111433";
      window.open(
        `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`,
        "_blank"
      );
    }
    toast.success("Pedido enviado! Redirecionando para o WhatsApp da loja...");
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="glass-panel max-w-lg w-full rounded-2xl p-6 relative border border-gold-500/40 shadow-2xl max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-300">
        <button
          onClick={() => setPixOpen(false)}
          className="absolute top-4 right-4 text-gray-400 hover:text-white"
          aria-label="Fechar"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-3 border-b border-gold-500/20 pb-4 mb-5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <PixIcon size={20} />
          </div>
          <div>
            <h3 className="font-serif-luxury text-xl font-bold text-white">
              Pagamento Instantâneo Pix
            </h3>
            <p className="text-[11px] text-emerald-400 flex items-center gap-1">
              <ShieldCheck size={12} />
              <span>Processado via OpenFinance • Mimi Mimos</span>
            </p>
          </div>
        </div>

        {/* Order Summary */}
        <div className="bg-obsidian-900/80 rounded-xl p-3.5 border border-gold-500/10 mb-5 space-y-1.5 text-xs">
          <div className="font-bold text-gold-300 mb-1 flex items-center gap-1.5">
            <Truck size={12} /> Resumo do Pedido Mimi Mimos:
          </div>
          {cart.map((item) => (
            <div
              key={item.id}
              className="flex justify-between text-gray-300"
            >
              <span className="truncate pr-2">
                {item.qty}x {item.name} ({item.code})
              </span>
              <span className="shrink-0">
                {formatBRL(item.price * item.qty)}
              </span>
            </div>
          ))}
          {/* Decante promo line */}
          {decanteCount >= 3 && (
            <div className="flex justify-between text-emerald-300 text-[10px] italic">
              <span>🎁 Promo 3 decantes por R$ 100</span>
              <span>Aplicada</span>
            </div>
          )}
          {/* Subtotal */}
          <div className="flex justify-between text-gray-400 pt-1.5 border-t border-gold-500/10">
            <span>Subtotal produtos:</span>
            <span className="text-gold-300">{formatBRL(subtotal)}</span>
          </div>
          {/* Coupon discount */}
          {couponDiscount > 0 && couponData?.code && (
            <div className="flex justify-between text-emerald-300 font-medium">
              <span className="flex items-center gap-1">
                <Ticket size={11} /> Cupom {couponData.code}:
              </span>
              <span>- {formatBRL(couponDiscount)}</span>
            </div>
          )}
          {/* Shipping */}
          <div className="flex justify-between text-gray-400">
            <span className="flex items-center gap-1">
              <Truck size={11} /> Frete ({shippingData.name}):
            </span>
            <span
              className={
                shippingPrice === 0
                  ? "text-emerald-400 font-bold"
                  : "text-gold-300"
              }
            >
              {shippingPrice === 0
                ? "Grátis"
                : formatBRL(shippingPrice)}
            </span>
          </div>
          {giftWrapPrice > 0 && (
            <div className="flex justify-between text-purple-300">
              <span className="flex items-center gap-1">
                <Gift size={11} /> Embrulho presente:
              </span>
              <span className="font-bold">+ {formatBRL(giftWrapPrice)}</span>
            </div>
          )}
          {giftData?.enabled && giftData.message && (
            <div className="text-[10px] text-purple-200/80 italic border-l-2 border-purple-500/40 pl-2 my-1">
              "{giftData.message}"
            </div>
          )}
          {/* Total */}
          <div className="flex justify-between pt-2 border-t border-gold-500/20 font-bold text-white text-sm items-baseline">
            <span className="uppercase tracking-wider">Total a Pagar (Pix):</span>
            <div className="text-right">
              {couponDiscount > 0 && (
                <p className="text-[10px] text-emerald-300 font-medium">
                  Você economiza {formatBRL(couponDiscount)}
                </p>
              )}
              <span className="text-gold-400 font-serif-luxury text-lg">
                {formatBRL(finalAmount)}
              </span>
            </div>
          </div>
        </div>

        {/* QR Code */}
        <div className="text-center space-y-4">
          <div className="p-3 bg-white rounded-2xl w-48 h-48 mx-auto flex items-center justify-center border-4 border-gold-500/30 shadow-xl">
            <img
              src={qrUrl}
              alt="QR Code Pix"
              className="w-full h-full object-contain"
            />
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-gold-300">
            <Timer className="animate-pulse" size={14} />
            <span>
              Aguardando pagamento... Expira em: <PixTimer />
            </span>
          </div>

          {/* Pix Copia e Cola */}
          <div className="text-left space-y-1">
            <label className="text-[10px] uppercase text-gray-400 font-semibold tracking-wider">
              Código Pix Copia e Cola:
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={pixCode}
                onFocus={(e) => e.target.select()}
                className="w-full bg-obsidian-950 border border-gold-500/30 rounded-xl py-2 px-3 text-[11px] text-gray-300 truncate focus:outline-none"
              />
              <button
                onClick={copy}
                className="btn-gold px-4 py-2 rounded-xl text-xs whitespace-nowrap flex items-center gap-1.5"
              >
                <Copy size={12} />
                <span>{copied ? "Copiado!" : "Copiar"}</span>
              </button>
            </div>
          </div>

          {/* Confirm via WhatsApp */}
          <div className="pt-4 border-t border-gold-500/15 space-y-2">
            <button
              onClick={confirmPaid}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/20"
            >
              <MessageCircle size={18} />
              <span>Paguei o Pix — Avisar a Loja</span>
            </button>
            <p className="text-[10px] text-gray-400 text-center">
              Após pagar pelo seu banco, clique acima para enviar os dados do pedido.
              A loja confirmará o pagamento e responderá no WhatsApp. 💬
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
