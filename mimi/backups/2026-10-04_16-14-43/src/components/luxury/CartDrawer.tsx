"use client";

import { useState } from "react";
import { useStore, useUI } from "@/lib/stores-combined";
import { useCouponStore } from "@/lib/coupon-store";
import { formatBRL } from "@/lib/pix";
import {
  ShoppingBag,
  X,
  Truck,
  QrCode as PixIcon,
  Sparkles,
  MapPin,
  Store,
  Package,
  Loader2,
  Ticket,
  Check,
  Tag,
  Gift,
  PartyPopper,
} from "lucide-react";
import { toast } from "sonner";

interface ShippingOption {
  code: number;
  name: string;
  price: number;
  days: number;
  error?: string;
}

export default function CartDrawer() {
  const cartOpen = useUI((s) => s.cartOpen);
  const setCartOpen = useUI((s) => s.setCartOpen);
  const setPixOpen = useUI((s) => s.setPixOpen);
  const cart = useStore((s) => s.cart);
  const changeQty = useStore((s) => s.changeQty);
  const removeFromCart = useStore((s) => s.removeFromCart);
  const subtotal = useStore((s) => s.cartSubtotal());
  const decanteCount = useStore((s) => s.cartDecanteCount());
  const hasPromo = useStore((s) => s.cartHasDecantePromo());

  // Estado do checkout (dados do cliente + frete)
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [cep, setCep] = useState("");
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [selectedShipping, setSelectedShipping] = useState<number>(0); // 0 = retirada
  const [calculating, setCalculating] = useState(false);

  // Gift wrap state
  const [giftWrap, setGiftWrap] = useState(false);
  const [giftMessage, setGiftMessage] = useState("");
  const GIFT_WRAP_PRICE = 5;

  // Cupom state
  const [couponInput, setCouponInput] = useState("");
  const applyCoupon = useCouponStore((s) => s.applyCoupon);
  const removeCoupon = useCouponStore((s) => s.removeCoupon);
  const activeCoupon = useCouponStore((s) => s.getActiveCoupon());

  const shippingPrice =
    selectedShipping === 0
      ? 0
      : shippingOptions.find((o) => o.code === selectedShipping)?.price || 0;

  // Calcula desconto do cupom aplicado
  const couponDiscount = useCouponStore((s) => {
    if (!s.appliedCoupon) return 0;
    return s.calculateDiscount(subtotal, decanteCount).discount;
  });
  const couponFreeShip = useCouponStore((s) => {
    if (!s.appliedCoupon) return false;
    return s.calculateDiscount(subtotal, decanteCount).freeShip;
  });

  const effectiveShippingPrice = couponFreeShip ? 0 : shippingPrice;
  const giftWrapPrice = giftWrap ? GIFT_WRAP_PRICE : 0;
  const total = subtotal - couponDiscount + effectiveShippingPrice + giftWrapPrice;

  const handleApplyCoupon = () => {
    if (!couponInput.trim()) {
      toast.error("Digite um código de cupom.");
      return;
    }
    const result = applyCoupon(couponInput, subtotal);
    if (result.success) {
      toast.success(result.message);
      setCouponInput("");
    } else {
      toast.error(result.message);
    }
  };

  const calcShipping = async () => {
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length !== 8) {
      toast.error("CEP inválido. Digite 8 dígitos.");
      return;
    }
    setCalculating(true);
    try {
      const res = await fetch(`/api/shipping?cep=${cleanCep}`);
      const data = await res.json();
      if (data.options) {
        setShippingOptions(data.options);
        toast.success(`${data.options.length} opções de frete encontradas!`);
      } else {
        toast.error(data.error || "Erro ao calcular frete");
      }
    } catch {
      toast.error("Erro ao conectar com os Correios. Tente novamente.");
    } finally {
      setCalculating(false);
    }
  };

  const proceed = () => {
    if (cart.length === 0) {
      toast.error("Adicione ao menos um perfume para prosseguir.");
      return;
    }
    if (!customerName.trim()) {
      toast.error("Digite seu nome para continuar.");
      return;
    }
    if (!customerPhone.trim()) {
      toast.error("Digite seu WhatsApp para continuarmos o pedido.");
      return;
    }
    // Salva dados do cliente no localStorage para o PixModal usar
    localStorage.setItem(
      "mimi-customer",
      JSON.stringify({ name: customerName, phone: customerPhone })
    );
    localStorage.setItem(
      "mimi-shipping",
      JSON.stringify({
        option: selectedShipping,
        price: effectiveShippingPrice,
        originalPrice: shippingPrice,
        freeShipViaCoupon: couponFreeShip,
        name:
          selectedShipping === 0
            ? "Retirar na Loja"
            : shippingOptions.find((o) => o.code === selectedShipping)?.name ||
              "Envio",
      })
    );
    // Salva cupom aplicado para o PixModal usar no cálculo do total
    localStorage.setItem(
      "mimi-coupon",
      JSON.stringify({
        code: activeCoupon?.code || null,
        discount: couponDiscount,
        freeShip: couponFreeShip,
        description:
          activeCoupon?.description ||
          (couponDiscount > 0 ? "Desconto aplicado" : ""),
        type: activeCoupon?.type || null,
      })
    );
    // Salva gift wrap para o PixModal usar no cálculo do total
    localStorage.setItem(
      "mimi-gift-wrap",
      JSON.stringify({
        enabled: giftWrap,
        price: giftWrapPrice,
        message: giftMessage.trim(),
      })
    );
    setCartOpen(false);
    setPixOpen(true);
  };

  return (
    <div
      className={`fixed inset-0 z-50 transition-opacity duration-300 ${
        cartOpen
          ? "opacity-100 pointer-events-auto"
          : "opacity-0 pointer-events-none"
      }`}
      aria-hidden={!cartOpen}
    >
      <div
        onClick={() => setCartOpen(false)}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />
      <div
        className={`absolute top-0 right-0 h-full w-full max-w-md bg-obsidian-900 border-l border-gold-500/20 shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out ${
          cartOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="p-5 border-b border-gold-500/20 flex justify-between items-center bg-obsidian-950 safe-top">
          <div className="flex items-center gap-3">
            <ShoppingBag className="text-gold-400" size={20} />
            <h3 className="font-serif-luxury text-xl font-bold text-white">
              Sua Sacola de Luxo
            </h3>
          </div>
          <button
            onClick={() => setCartOpen(false)}
            className="text-gray-400 hover:text-white p-2"
            aria-label="Fechar sacola"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-grow overflow-y-auto p-5 space-y-4">
          {/* Free Shipping Progress Bar */}
          {cart.length > 0 && (() => {
            const FREE_SHIPPING_THRESHOLD = 199;
            const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
            const progress = Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD) * 100);
            const achieved = subtotal >= FREE_SHIPPING_THRESHOLD;

            return (
              <div className={`rounded-xl p-3 border transition-all ${
                achieved
                  ? "bg-emerald-500/15 border-emerald-500/40"
                  : "bg-gold-500/10 border-gold-500/30"
              }`}>
                {achieved ? (
                  <div className="flex items-center gap-2 text-emerald-400">
                    <PartyPopper size={16} className="shrink-0" />
                    <p className="text-xs font-bold">
                      🎉 Frete grátis liberado! Você economiza no envio.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <Truck size={14} className="text-gold-400 shrink-0" />
                      <p className="text-[11px] text-gray-300">
                        Faltam <strong className="text-gold-400">{formatBRL(remaining)}</strong> para frete grátis
                      </p>
                    </div>
                    <div className="h-2.5 bg-obsidian-900 rounded-full overflow-hidden relative">
                      <div
                        className="h-full bg-gradient-to-r from-gold-600 via-gold-400 to-gold-300 rounded-full transition-all duration-500 ease-out relative"
                        style={{ width: `${progress}%` }}
                      >
                        {/* Shimmer effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse" />
                      </div>
                    </div>
                    <p className="text-[9px] text-gray-500 mt-1.5">
                      {formatBRL(subtotal)} de {formatBRL(FREE_SHIPPING_THRESHOLD)}
                    </p>
                  </>
                )}
              </div>
            );
          })()}

          {cart.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <ShoppingBag className="mx-auto mb-2 text-gold-500/30" size={36} />
              <p className="text-xs">Sua sacola de luxo está vazia.</p>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.id}
                className="glass-panel p-3 rounded-xl flex items-center gap-3 border border-gold-500/10"
              >
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-12 h-12 object-contain rounded-lg bg-obsidian-950 p-1"
                />
                <div className="flex-grow min-w-0">
                  <h5 className="text-xs font-bold text-white truncate">
                    {item.name}
                  </h5>
                  <p className="text-[10px] text-gold-300">
                    {formatBRL(item.price)}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      onClick={() => changeQty(item.id, -1)}
                      className="w-5 h-5 bg-obsidian-950 rounded flex items-center justify-center text-xs text-gray-300 hover:text-gold-300"
                      aria-label="Diminuir"
                    >
                      −
                    </button>
                    <span className="text-xs text-white font-bold">
                      {item.qty}
                    </span>
                    <button
                      onClick={() => changeQty(item.id, 1)}
                      className="w-5 h-5 bg-obsidian-950 rounded flex items-center justify-center text-xs text-gray-300 hover:text-gold-300"
                      aria-label="Aumentar"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-serif-luxury font-bold text-gold-400">
                    {formatBRL(item.price * item.qty)}
                  </span>
                  <button
                    onClick={() => {
                      removeFromCart(item.id);
                      toast.success("Item removido da sacola.");
                    }}
                    className="block text-[10px] text-red-400 mt-1 hover:underline ml-auto"
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-5 border-t border-gold-500/20 bg-obsidian-950 space-y-3 safe-bottom max-h-[60vh] overflow-y-auto">
          {/* Decante promo alert */}
          {decanteCount > 0 && (
            <div
              className={`rounded-xl p-3 border text-[11px] flex items-start gap-2 ${
                hasPromo
                  ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-200"
              }`}
            >
              <Sparkles size={14} className="shrink-0 mt-0.5" />
              <span>
                {hasPromo ? (
                  <>
                    🎉 <strong>Promo ativa!</strong> {decanteCount} decantes —{" "}
                    {Math.floor(decanteCount / 3)} combo(s) de 3 por R$ 100!
                  </>
                ) : (
                  <>
                    💡 Adicione mais {3 - (decanteCount % 3)} decante(s) para o
                    combo <strong>3 por R$ 100</strong>!
                  </>
                )}
              </span>
            </div>
          )}

          {/* Dados do cliente (nome + WhatsApp) */}
          {cart.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-gold-300/70 font-bold">
                Seus Dados
              </p>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Seu nome completo"
                className="w-full bg-obsidian-900 border border-gold-500/30 rounded-lg py-2 px-3 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-gold-400"
              />
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="WhatsApp com DDD: (11) 99999-9999"
                className="w-full bg-obsidian-900 border border-gold-500/30 rounded-lg py-2 px-3 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-gold-400"
              />
            </div>
          )}

          {/* Gift wrap option */}
          {cart.length > 0 && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setGiftWrap(!giftWrap)}
                className={`w-full flex items-center gap-3 p-2.5 rounded-lg border transition-all text-left ${
                  giftWrap
                    ? "bg-purple-500/15 border-purple-500/40"
                    : "bg-obsidian-900 border-gold-500/20 hover:border-gold-500/40"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${
                    giftWrap
                      ? "bg-purple-500/20 border-purple-500/40 text-purple-300"
                      : "bg-obsidian-950 border-gold-500/20 text-gold-400/70"
                  }`}
                >
                  <Gift size={14} />
                </div>
                <div className="flex-grow min-w-0">
                  <p className="text-[11px] font-bold text-white">
                    Embrulho para presente
                  </p>
                  <p className="text-[9px] text-gray-400 leading-tight">
                    Caixa luxo + cartão com mensagem personalizada
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-gold-300 font-bold">+ R$ 5,00</p>
                  <p className="text-[8px] uppercase tracking-wider text-gray-500">
                    {giftWrap ? "Ativo" : "Adicionar"}
                  </p>
                </div>
              </button>
              {giftWrap && (
                <textarea
                  value={giftMessage}
                  onChange={(e) => setGiftMessage(e.target.value)}
                  placeholder="Mensagem para o cartão (opcional, máx 120 caracteres)..."
                  maxLength={120}
                  rows={2}
                  className="w-full bg-obsidian-900 border border-purple-500/30 rounded-lg py-2 px-3 text-[11px] text-white placeholder-gray-500 focus:outline-none focus:border-purple-400 resize-none"
                />
              )}
            </div>
          )}

          {/* Calculadora de frete */}
          {cart.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-gold-300/70 font-bold flex items-center gap-1">
                <MapPin size={11} /> Entrega ou Retirada
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={cep}
                  onChange={(e) =>
                    setCep(e.target.value.replace(/\D/g, "").slice(0, 8))
                  }
                  placeholder="CEP: 01310-100"
                  className="flex-grow bg-obsidian-900 border border-gold-500/30 rounded-lg py-2 px-3 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-gold-400"
                />
                <button
                  onClick={calcShipping}
                  disabled={calculating || cep.length !== 8}
                  className="btn-gold px-3 py-2 rounded-lg text-[10px] font-bold flex items-center gap-1 disabled:opacity-50 whitespace-nowrap"
                >
                  {calculating ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Truck size={12} />
                  )}
                  Calcular
                </button>
              </div>

              {/* Opções de frete */}
              {(shippingOptions.length > 0 || true) && (
                <div className="space-y-1.5">
                  {/* Retirar na loja — sempre disponível */}
                  <label
                    className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all ${
                      selectedShipping === 0
                        ? "bg-emerald-500/15 border-emerald-500/40"
                        : "bg-obsidian-900 border-gold-500/20 hover:border-gold-500/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="shipping"
                      checked={selectedShipping === 0}
                      onChange={() => setSelectedShipping(0)}
                      className="accent-emerald-500"
                    />
                    <Store size={14} className="text-emerald-400 shrink-0" />
                    <div className="flex-grow">
                      <p className="text-[11px] font-bold text-white">
                        Retirar na Loja
                      </p>
                      <p className="text-[9px] text-gray-400">
                        Sem custo — combine o horário
                      </p>
                    </div>
                    <span className="text-xs font-bold text-emerald-400">
                      Grátis
                    </span>
                  </label>

                  {/* Opções dos Correios */}
                  {shippingOptions
                    .filter((o) => o.code !== 0)
                    .map((opt) => (
                      <label
                        key={opt.code}
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all ${
                          selectedShipping === opt.code
                            ? "bg-gold-500/15 border-gold-500/40"
                            : "bg-obsidian-900 border-gold-500/20 hover:border-gold-500/40"
                        }`}
                      >
                        <input
                          type="radio"
                          name="shipping"
                          checked={selectedShipping === opt.code}
                          onChange={() => setSelectedShipping(opt.code)}
                          className="accent-gold-500"
                        />
                        <Package size={14} className="text-gold-400 shrink-0" />
                        <div className="flex-grow">
                          <p className="text-[11px] font-bold text-white">
                            {opt.name}
                          </p>
                          <p className="text-[9px] text-gray-400">
                            {opt.error
                              ? opt.error
                              : `${opt.days} dia(s) útil(eis)`}
                          </p>
                        </div>
                        <span className="text-xs font-bold text-gold-400">
                          {opt.price > 0 ? formatBRL(opt.price) : "—"}
                        </span>
                      </label>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Cupom de desconto */}
          {cart.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-gold-300/70 font-bold flex items-center gap-1">
                <Ticket size={11} /> Cupom de Desconto
              </p>
              {activeCoupon ? (
                <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300 shrink-0">
                      <Check size={14} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-emerald-200 truncate">
                        {activeCoupon.code}
                      </p>
                      <p className="text-[9px] text-emerald-300/80 truncate">
                        {activeCoupon.description}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      removeCoupon();
                      toast.info("Cupom removido.");
                    }}
                    className="text-[10px] text-red-300 hover:text-red-200 underline whitespace-nowrap shrink-0"
                  >
                    Remover
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <div className="relative flex-grow">
                    <Tag
                      size={12}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gold-400/60"
                    />
                    <input
                      type="text"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      placeholder="Ex: BEMVINDO10"
                      className="w-full bg-obsidian-900 border border-gold-500/30 rounded-lg py-2 pl-7 pr-3 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-gold-400 uppercase tracking-wider"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleApplyCoupon();
                        }
                      }}
                    />
                  </div>
                  <button
                    onClick={handleApplyCoupon}
                    className="btn-gold px-3 py-2 rounded-lg text-[10px] font-bold whitespace-nowrap flex items-center gap-1"
                  >
                    <Ticket size={12} /> Aplicar
                  </button>
                </div>
              )}
              {/* Sugestões de cupons disponíveis */}
              {!activeCoupon && (
                <p className="text-[9px] text-gray-500 leading-relaxed">
                  💡 Experimente: <button
                    onClick={() => setCouponInput("BEMVINDO10")}
                    className="text-gold-400 hover:underline font-medium"
                  >BEMVINDO10</button>{" "}
                  (10% OFF),{" "}
                  <button
                    onClick={() => setCouponInput("FRETEGRATIS")}
                    className="text-gold-400 hover:underline font-medium"
                  >FRETEGRATIS</button>{" "}
                  (frete grátis)
                </p>
              )}
            </div>
          )}

          {/* Totais */}
          <div className="space-y-1.5 pt-2 border-t border-gold-500/15">
            <div className="flex justify-between text-xs text-gray-400">
              <span>Subtotal produtos:</span>
              <span className="text-gold-300">{formatBRL(subtotal)}</span>
            </div>
            {couponDiscount > 0 && (
              <div className="flex justify-between text-[11px] text-emerald-300">
                <span className="flex items-center gap-1">
                  <Ticket size={10} /> Cupom {activeCoupon?.code}:
                </span>
                <span className="font-bold">- {formatBRL(couponDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between text-[11px] text-gray-400">
              <span>Frete:</span>
              <span
                className={
                  effectiveShippingPrice === 0
                    ? "text-emerald-400 font-bold"
                    : "text-gold-300"
                }
              >
                {couponFreeShip && shippingPrice > 0 ? (
                  <span className="flex items-center gap-1">
                    <span className="line-through text-gray-500 text-[10px]">{formatBRL(shippingPrice)}</span>
                    <span>Grátis</span>
                  </span>
                ) : effectiveShippingPrice === 0 ? (
                  "Grátis"
                ) : (
                  formatBRL(effectiveShippingPrice)
                )}
              </span>
            </div>
            {giftWrap && (
              <div className="flex justify-between text-[11px] text-purple-300">
                <span className="flex items-center gap-1">
                  <Gift size={10} /> Embrulho presente:
                </span>
                <span className="font-bold">+ {formatBRL(GIFT_WRAP_PRICE)}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline pt-1.5 border-t border-gold-500/20">
              <span className="text-xs text-gray-300 font-bold uppercase tracking-wider">
                Total:
              </span>
              <div className="text-right">
                {couponDiscount > 0 && (
                  <p className="text-[10px] text-emerald-300 font-medium">
                    Você economiza {formatBRL(couponDiscount)}
                  </p>
                )}
                <span className="text-lg font-serif-luxury font-bold text-gold-400">
                  {formatBRL(total)}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={proceed}
            className="w-full btn-gold py-3.5 rounded-xl text-xs uppercase tracking-widest flex items-center justify-center gap-2"
          >
            <PixIcon size={16} />
            <span>Finalizar com Pix</span>
          </button>
        </div>
      </div>
    </div>
  );
}
