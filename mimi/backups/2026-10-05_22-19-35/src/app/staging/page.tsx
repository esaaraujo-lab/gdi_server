"use client";

// ═══════════════════════════════════════════════════════════
//  STAGING PAGE — Pixel-Perfect Rocket.site Replica
//  Dark luxury aesthetic (#080808 + gold #d4af37).
//  All products come from D1 via Zustand. Cart drawer, PixModal,
//  SlideInQuickView, FavoritesModal, CompareModal, etc. all shared
//  with the production store pages.
// ═══════════════════════════════════════════════════════════

import { useEffect, useState, useMemo } from "react";
import CartDrawer from "@/components/luxury/CartDrawer";
import PixModal from "@/components/luxury/PixModal";
import NotifyModal from "@/components/luxury/NotifyModal";
import QuickViewModal from "@/components/luxury/QuickViewModal";
import SlideInQuickView, { useSlideInUI } from "@/components/luxury/SlideInQuickView";
import FavoritesModal from "@/components/luxury/FavoritesModal";
import FloatingCompareButton from "@/components/luxury/FloatingCompareButton";
import CompareModal from "@/components/luxury/CompareModal";
import CursorCanvas from "@/components/luxury/CursorCanvas";
import PwaInstallBanner from "@/components/luxury/PwaInstallBanner";
import NotificationManager from "@/components/luxury/NotificationManager";
import ServiceWorkerRegister from "@/components/luxury/ServiceWorkerRegister";
import { useUI, useStore } from "@/lib/stores-combined";
import { syncProductsFromD1, syncLeadsFromD1, syncPixConfigFromD1 } from "@/lib/store";
import { syncContentFromD1 } from "@/lib/content-store";
import { syncKitsFromD1 } from "@/lib/kit-store";
import { syncCouponsFromD1 } from "@/lib/coupon-store";
import { syncReviewsFromD1 } from "@/lib/review-store";
import { Toaster } from "sonner";
import { formatBRL } from "@/lib/pix";
import type { Perfume, ProductCategory, ProductGender } from "@/lib/perfumes";

// ═══════════════════════════════════════════════════════════
//  CONSTANTS — exact Rocket.site palette
// ═══════════════════════════════════════════════════════════
const COLORS = {
  background: "#080808",
  card: "#0e0d0c",
  muted: "#1a1816",
  foreground: "#fafafa",
  mutedForeground: "#71717a",
  primary: "#d4af37",
  primaryForeground: "#080808",
  border: "rgba(184,150,90,0.12)",
  accent: "#b89655",
  cardBorder: "rgba(34,30,24,0.8)",
} as const;

const HERO_IMAGE =
  "https://img.rocket.new/generatedImages/rocket_gen_img_11d3ecb24-1785663578087.png";
const HERO_IMAGE_FALLBACK =
  "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=1920&auto=format&fit=crop&q=80";

const KIT_IMAGE =
  "https://img.rocket.new/generatedImages/rocket_gen_img_1c1c329d9-1771901388179.png";
const KIT_IMAGE_FALLBACK =
  "https://images.unsplash.com/photo-1616949755610-8c9bbc08f138?w=1200&auto=format&fit=crop&q=80";

const WHATSAPP_URL = "https://wa.me/5511958546078";

// Cart SVG icon (exact path from Rocket.site)
const CartIcon = ({ size = 14 }: { size?: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    width={size}
    height={size}
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
    />
  </svg>
);

const WhatsAppIcon = ({ size = 28, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const InstagramIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
  </svg>
);

// ═══════════════════════════════════════════════════════════
//  HELPERS — D1 data → Rocket labels
// ═══════════════════════════════════════════════════════════
type CategoryBadgeConfig = {
  text: string;
  color: string;
  borderColor: string;
};

function categoryBadge(cat: ProductCategory): CategoryBadgeConfig {
  switch (cat) {
    case "BRAND":
      return { text: "Brand 25ml", color: COLORS.primary, borderColor: "rgba(212,175,55,0.3)" };
    case "AFEER":
      return { text: "Afeer", color: "#d8b4fe", borderColor: "rgba(168,85,247,0.3)" };
    case "DECANTE":
      return { text: "Decante 5ml", color: "#5eead4", borderColor: "rgba(20,184,166,0.3)" };
  }
}

type GenderConfig = { label: string; color: string };

function genderConfig(gender: ProductGender): GenderConfig {
  switch (gender) {
    case "MASCULINO":
      return { label: "Masculin", color: "#93c5fd" }; // blue-300
    case "FEMININO":
      return { label: "Féminin", color: "#fda4af" }; // rose-300
    case "UNISSEX":
      return { label: "Unisexe", color: COLORS.mutedForeground };
    case "ARABE":
      return { label: "Arabe", color: "#d8b4fe" }; // purple-300
  }
}

function sizeLabel(cat: ProductCategory): string {
  if (cat === "BRAND") return "25ml";
  if (cat === "AFEER") return "Miniatura";
  return "5ml";
}

function priceLabel(price: number): string {
  // Rocket.site shows "R$69,99" with comma decimal — match formatBRL output
  return formatBRL(price);
}

// ═══════════════════════════════════════════════════════════
//  ANNOUNCEMENT BAR — fixed top, marquee scroll
// ═══════════════════════════════════════════════════════════
function MarqueeBar() {
  // Single message repeated for seamless marquee loop
  const items = [
    "Frete grátis acima de R$200",
    "Decantes 3×R$100",
    "Perfumes importados e árabes",
    "Pagamento via Pix",
  ];

  return (
    <div
      className="fixed top-4 left-0 right-0 z-50 h-8 flex items-center justify-center overflow-hidden"
      style={{ background: "rgba(8,8,8,0.95)", borderBottom: "1px solid rgba(184,150,90,0.12)" }}
    >
      <div className="flex items-center gap-0 whitespace-nowrap">
        <div className="animate-marquee flex items-center gap-0">
          {[...items, ...items, ...items, ...items].map((text, i) => (
            <span key={i} className="flex items-center">
              <span
                className="text-xs tracking-[0.18em] uppercase mx-4"
                style={{ color: COLORS.mutedForeground }}
              >
                {text}
              </span>
              <span
                className="text-xs tracking-[0.18em] uppercase mx-4"
                style={{ color: COLORS.primary, opacity: 0.6 }}
              >
                ·
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  HEADER — fixed transparent → dark on scroll
// ═══════════════════════════════════════════════════════════
function RocketHeader() {
  const setCartOpen = useUI((s) => s.setCartOpen);
  const cartCount = useStore((s) => s.cartCount());
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 80);
    handler();
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <header
      className="fixed top-12 left-0 right-0 z-40 transition-all duration-700 py-5"
      style={{
        background: scrolled ? "rgba(8,8,8,0.92)" : "transparent",
        borderBottom: scrolled ? "1px solid rgba(184,150,90,0.12)" : "1px solid transparent",
        backdropFilter: scrolled ? "blur(12px)" : "none",
      }}
    >
      <div className="max-w-7xl mx-auto px-6 sm:px-8 flex items-center justify-between">
        {/* Logo */}
        <a href="/staging" className="flex flex-col leading-none group">
          <span
            className="font-serif-luxury font-bold text-xl tracking-[-0.02em] transition-colors duration-500"
            style={{ color: COLORS.foreground }}
          >
            Mimi Mimos
          </span>
          <span
            className="label-luxury mt-0.5 opacity-70 group-hover:opacity-100 transition-opacity duration-500"
          >
            Haute Parfumerie
          </span>
        </a>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-10">
          {[
            { href: "/staging", label: "Maison" },
            { href: "#colecao", label: "Collection" },
            { href: "/checkout", label: "Panier" },
          ].map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="relative text-xs font-semibold tracking-[0.18em] uppercase transition-colors duration-300 group"
              style={{ color: COLORS.mutedForeground }}
              onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.foreground)}
              onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.mutedForeground)}
            >
              {item.label}
              <span
                className="absolute -bottom-0.5 left-0 w-0 h-px transition-all duration-500 group-hover:w-full"
                style={{ background: COLORS.primary }}
              />
            </a>
          ))}
        </nav>

        {/* Cart + hamburger */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="relative flex items-center gap-2.5 group"
            aria-label="Carrinho"
          >
            <div
              className="w-9 h-9 rounded-full border flex items-center justify-center group-hover:border-primary/50 transition-all duration-400"
              style={{ borderColor: COLORS.border }}
            >
              <CartIcon size={16} />
              <span className="sr-only" style={{ color: COLORS.mutedForeground }} />
            </div>
            {cartCount > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
                style={{ background: COLORS.primary, color: COLORS.primaryForeground }}
              >
                {cartCount}
              </span>
            )}
          </button>

          {/* Hamburger (mobile only — visual placeholder) */}
          <button
            type="button"
            className="md:hidden flex flex-col justify-center items-end gap-[5px] p-2 w-10 h-10"
            aria-label="Abrir menu"
          >
            <span
              className="h-px transition-all duration-400 w-6"
              style={{ background: COLORS.foreground }}
            />
            <span
              className="h-px transition-all duration-400 w-4"
              style={{ background: COLORS.foreground }}
            />
            <span
              className="h-px transition-all duration-400 w-6"
              style={{ background: COLORS.foreground }}
            />
          </button>
        </div>
      </div>
    </header>
  );
}

// ═══════════════════════════════════════════════════════════
//  HERO — full-screen, blobs, vertical text, clamp() title
// ═══════════════════════════════════════════════════════════
function RocketHero() {
  const products = useStore((s) => s.products);

  // D1-driven stats
  const totalCount = products.length;
  const decantes = products.filter((p) => p.category === "DECANTE");
  const minDecantePrice =
    decantes.length > 0 ? Math.min(...decantes.map((p) => p.price)) : 39.99;
  const minPriceDisplay = `R$${Math.floor(minDecantePrice)}`;

  const displayCount = totalCount > 0 ? `${totalCount}+` : "19+";

  const scrollToCatalog = () =>
    document.getElementById("colecao")?.scrollIntoView({ behavior: "smooth" });

  return (
    <section className="relative min-h-screen flex items-end overflow-hidden pt-16">
      {/* Background image with two overlays */}
      <div className="absolute inset-0 scale-110">
        <div className="relative" style={{ width: "100%", height: "100%" }}>
          <img
            alt="Dark luxury perfume bottles on obsidian surface with dramatic low-key lighting and deep shadows"
            decoding="async"
            className="object-cover object-center bg-gray-200"
            style={{
              position: "absolute",
              height: "100%",
              width: "100%",
              inset: 0,
              objectFit: "cover",
              color: "transparent",
            }}
            src={HERO_IMAGE}
            onError={(e) => {
              const t = e.target as HTMLImageElement;
              if (t.src !== HERO_IMAGE_FALLBACK) t.src = HERO_IMAGE_FALLBACK;
            }}
          />
        </div>
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, rgba(8,8,8,0.92) 0%, rgba(8,8,8,0.6) 50%, rgba(8,8,8,0.3) 100%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, rgba(8,8,8,1) 0%, rgba(8,8,8,0.4) 40%, transparent 70%)",
          }}
        />
      </div>

      {/* Animated blobs */}
      <div className="absolute top-1/3 left-1/3 w-[600px] h-[600px] blob-gold animate-blob opacity-50 pointer-events-none" />
      <div
        className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] blob-amber animate-blob pointer-events-none"
        style={{ animationDelay: "-6s" }}
      />

      {/* Grain overlay */}
      <div className="grain-overlay" />

      {/* Vertical text — only on xl+ */}
      <div className="absolute right-8 top-1/2 -translate-y-1/2 hidden xl:flex flex-col items-center gap-4 opacity-50">
        <div className="w-px h-16 bg-gradient-to-b from-transparent to-primary/40" />
        <span
          className="label-luxury opacity-80 tracking-[0.4em]"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          Haute Parfumerie — 2026
        </span>
        <div className="w-px h-16 bg-gradient-to-t from-transparent to-primary/40" />
      </div>

      {/* Hero content */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-8 pb-20 md:pb-28">
        <div className="max-w-3xl">
          {/* Eyebrow */}
          <div className="flex items-center gap-4 mb-8">
            <div className="w-8 h-px" style={{ background: COLORS.primary }} />
            <span className="label-luxury tracking-[0.35em]">Maison de Parfum</span>
          </div>

          {/* Title */}
          <h1 className="font-serif-luxury font-bold leading-none tracking-tight mb-2">
            <span
              className="block"
              style={{
                fontSize: "clamp(3.5rem, 10vw, 9rem)",
                letterSpacing: "-0.04em",
                lineHeight: 0.88,
                color: COLORS.foreground,
              }}
            >
              Mimi
            </span>
            <span
              className="block text-gradient-gold italic font-light"
              style={{
                fontSize: "clamp(3.5rem, 10vw, 9rem)",
                letterSpacing: "-0.04em",
                lineHeight: 0.88,
              }}
            >
              Mimos.
            </span>
          </h1>

          {/* Divider */}
          <div className="divider-gold my-8 max-w-xs" />

          {/* Description */}
          <p
            className="text-base md:text-lg leading-relaxed max-w-md mb-10"
            style={{ color: COLORS.mutedForeground, fontWeight: 300 }}
          >
            Fragrâncias importadas e árabes de alto padrão — curadas para quem valoriza a
            experiência olfativa acima de tudo.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <button
              type="button"
              onClick={scrollToCatalog}
              className="group inline-flex items-center gap-3 px-8 py-4 font-semibold text-xs tracking-[0.15em] uppercase transition-all duration-500"
              style={{
                background: COLORS.primary,
                color: COLORS.primaryForeground,
                borderRadius: "2px",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.accent)}
              onMouseLeave={(e) => (e.currentTarget.style.background = COLORS.primary)}
            >
              Explorar Coleção
              <span className="w-4 h-px bg-current transition-all duration-300 group-hover:w-6" />
            </button>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 px-8 py-4 border font-semibold text-xs tracking-[0.15em] uppercase transition-all duration-500"
              style={{
                borderColor: COLORS.border,
                color: COLORS.foreground,
                borderRadius: "2px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(212,175,55,0.5)";
                e.currentTarget.style.color = COLORS.primary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = COLORS.border;
                e.currentTarget.style.color = COLORS.foreground;
              }}
            >
              Consultoria Pessoal
            </a>
          </div>

          {/* Stats */}
          <div
            className="flex items-center gap-8 mt-14 pt-8 border-t"
            style={{ borderColor: "rgba(184,150,90,0.18)" }}
          >
            {[
              { value: displayCount, label: "Fragrâncias" },
              { value: minPriceDisplay, label: "A partir de" },
              { value: "3×R$100", label: "Decantes" },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col gap-1">
                <span
                  className="font-serif-luxury font-bold"
                  style={{
                    color: COLORS.primary,
                    fontSize: "clamp(1.4rem, 3vw, 2rem)",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {stat.value}
                </span>
                <span className="label-luxury opacity-50 text-[0.6rem]">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-30">
        <div className="w-px h-14 bg-gradient-to-b from-primary/60 to-transparent" />
        <span className="label-luxury text-[0.55rem] tracking-[0.4em]">Scroll</span>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
//  KIT SECTION — 5-col grid, R$100 badge, bullet list
// ═══════════════════════════════════════════════════════════
function KitSection() {
  const products = useStore((s) => s.products);
  const decantes = useMemo(
    () => products.filter((p) => p.category === "DECANTE"),
    [products],
  );
  const heroImg = decantes[0]?.image || KIT_IMAGE;

  const scrollToCatalog = () =>
    document.getElementById("colecao")?.scrollIntoView({ behavior: "smooth" });

  return (
    <section className="py-8 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        <div
          className="grid md:grid-cols-5 overflow-hidden"
          style={{ borderRadius: "4px", border: "1px solid rgba(184,150,90,0.15)" }}
        >
          {/* Image column */}
          <div className="md:col-span-3 relative h-72 md:h-[480px] overflow-hidden">
            <div className="relative" style={{ width: "100%", height: "100%" }}>
              <img
                alt="Collection of small 5ml perfume decant vials arranged on dark marble in moody atmospheric dim light with deep shadows"
                loading="lazy"
                decoding="async"
                className="object-cover transition-transform duration-[2s] ease-out hover:scale-105"
                style={{
                  position: "absolute",
                  height: "100%",
                  width: "100%",
                  inset: 0,
                  objectFit: "cover",
                  color: "transparent",
                }}
                src={heroImg}
                onError={(e) => {
                  const t = e.target as HTMLImageElement;
                  if (t.src !== KIT_IMAGE_FALLBACK) t.src = KIT_IMAGE_FALLBACK;
                }}
              />
            </div>
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to right, transparent 50%, rgba(8,8,8,0.9) 100%)",
              }}
            />
            <div
              className="absolute inset-0 md:hidden"
              style={{
                background:
                  "linear-gradient(to top, rgba(8,8,8,0.95) 0%, transparent 60%)",
              }}
            />

            {/* Badge top-left */}
            <div className="absolute top-6 left-6 flex flex-col items-start">
              <div
                className="px-4 py-3"
                style={{
                  background: COLORS.primary,
                  color: COLORS.primaryForeground,
                  borderRadius: "2px",
                }}
              >
                <div className="font-serif-luxury font-bold text-3xl leading-none">R$100</div>
                <div className="text-xs font-semibold tracking-[0.15em] uppercase mt-1 opacity-80">
                  3 decantes
                </div>
              </div>
              <div
                className="mt-2 px-3 py-1 border text-xs tracking-widest uppercase"
                style={{
                  background: "rgba(8,8,8,0.8)",
                  borderColor: COLORS.border,
                  color: COLORS.mutedForeground,
                  borderRadius: "2px",
                }}
              >
                Economia R$19,97
              </div>
            </div>
          </div>

          {/* Text column */}
          <div
            className="md:col-span-2 flex flex-col justify-center p-8 md:p-12"
            style={{ background: "rgba(15,13,11,0.98)" }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-6 h-px" style={{ background: COLORS.primary }} />
              <span className="label-luxury tracking-[0.3em]">Oferta Especial</span>
            </div>

            <h2
              className="font-serif-luxury font-bold leading-tight mb-4"
              style={{
                color: COLORS.foreground,
                fontSize: "clamp(1.8rem, 3.5vw, 3rem)",
                letterSpacing: "-0.025em",
              }}
            >
              Descubra sua <span className="italic font-light text-gradient-gold">fragrância</span>{" "}
              favorita
            </h2>

            <p
              className="text-sm leading-relaxed mb-8"
              style={{ color: COLORS.mutedForeground, fontWeight: 300 }}
            >
              Experimente 3 fragrâncias diferentes em 5ml cada — a forma mais inteligente de
              explorar o universo olfativo antes de investir no frasco completo.
            </p>

            <ul className="space-y-3 mb-10">
              {[
                "Escolha qualquer 3 decantes da coleção",
                "Desconto aplicado automaticamente",
                "Ideal para presentear com elegância",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 text-sm"
                  style={{ color: COLORS.mutedForeground }}
                >
                  <span
                    className="w-1 h-1 rounded-full flex-shrink-0 mt-2"
                    style={{ background: COLORS.primary }}
                  />
                  {item}
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={scrollToCatalog}
                className="group inline-flex items-center justify-center gap-3 px-6 py-3.5 font-semibold text-xs tracking-[0.15em] uppercase transition-all duration-400"
                style={{
                  background: COLORS.primary,
                  color: COLORS.primaryForeground,
                  borderRadius: "2px",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.accent)}
                onMouseLeave={(e) => (e.currentTarget.style.background = COLORS.primary)}
              >
                Montar Meu Kit
                <span className="w-4 h-px bg-current transition-all duration-300 group-hover:w-6" />
              </button>
              <button
                type="button"
                onClick={scrollToCatalog}
                className="inline-flex items-center justify-center px-6 py-3.5 border font-semibold text-xs tracking-[0.15em] uppercase transition-all duration-400"
                style={{
                  borderColor: COLORS.border,
                  color: COLORS.mutedForeground,
                  borderRadius: "2px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "rgba(212,175,55,0.4)";
                  e.currentTarget.style.color = COLORS.foreground;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = COLORS.border;
                  e.currentTarget.style.color = COLORS.mutedForeground;
                }}
              >
                Ver Todos os Decantes
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
//  PRODUCT CARD — aspect-[3/4], product-scrim, hover button
// ═══════════════════════════════════════════════════════════
function RocketProductCard({ perfume }: { perfume: Perfume }) {
  const addToCart = useStore((s) => s.addToCart);
  const setCartOpen = useUI((s) => s.setCartOpen);

  const openQuickView = () => {
    window.dispatchEvent(new CustomEvent("openSlideIn", { detail: perfume }));
  };

  const cat = categoryBadge(perfume.category);
  const gen = genderConfig(perfume.gender);
  const isDecante = perfume.category === "DECANTE";
  const size = sizeLabel(perfume.category);
  const price = priceLabel(perfume.price);

  // Image with fallback placeholder
  const placeholder = `https://placehold.co/400x500/0e0d0c/d4af37?text=${encodeURIComponent(
    perfume.name.slice(0, 20),
  )}`;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    addToCart(perfume);
  };

  const handleCardClick = () => {
    openQuickView();
  };

  return (
    <div
      className="group relative flex flex-col bg-card overflow-hidden hover-lift cursor-pointer"
      style={{
        borderRadius: "3px",
        border: `1px solid ${COLORS.cardBorder}`,
        background: COLORS.card,
      }}
      onClick={handleCardClick}
    >
      {/* Image container */}
      <div className="relative aspect-[3/4] overflow-hidden bg-muted" style={{ background: COLORS.muted }}>
        <div className="relative" style={{ width: "100%", height: "100%" }}>
          <img
            alt={perfume.name}
            loading="lazy"
            decoding="async"
            className="object-cover transition-transform duration-[1.2s] ease-out group-hover:scale-[1.08]"
            style={{
              position: "absolute",
              height: "100%",
              width: "100%",
              inset: 0,
              objectFit: "cover",
              color: "transparent",
            }}
            src={perfume.image || placeholder}
            onError={(e) => {
              const t = e.target as HTMLImageElement;
              if (t.src !== placeholder) t.src = placeholder;
            }}
          />
        </div>

        {/* Scrim overlay */}
        <div className="absolute inset-0 product-scrim" />

        {/* Top-left: category badge */}
        <div className="absolute top-3 left-3">
          <span
            className="inline-flex items-center px-2 py-0.5 text-[0.6rem] font-bold tracking-[0.15em] uppercase border bg-background/60 backdrop-blur-sm"
            style={{
              color: cat.color,
              borderColor: cat.borderColor,
              borderRadius: "2px",
            }}
          >
            {cat.text}
          </span>
        </div>

        {/* Top-right: 3×R$100 badge (Decante only) */}
        {isDecante && (
          <div className="absolute top-3 right-3">
            <span
              className="inline-flex items-center px-2 py-0.5 text-[0.6rem] font-bold tracking-[0.12em] uppercase"
              style={{
                background: COLORS.primary,
                color: COLORS.primaryForeground,
                borderRadius: "2px",
              }}
            >
              3×R$100
            </span>
          </div>
        )}

        {/* Bottom-left: gender label */}
        <div className="absolute bottom-3 left-3">
          <span
            className="text-[0.6rem] font-semibold tracking-[0.2em] uppercase"
            style={{ color: gen.color }}
          >
            {gen.label}
          </span>
        </div>

        {/* Hover: Add to cart button (slides up) */}
        <div className="absolute bottom-0 left-0 right-0 transition-all duration-500 opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0">
          <button
            type="button"
            onClick={handleAddToCart}
            className="w-full py-3 text-xs font-bold tracking-[0.15em] uppercase transition-all duration-300"
            style={{
              background: COLORS.primary,
              color: COLORS.primaryForeground,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.accent)}
            onMouseLeave={(e) => (e.currentTarget.style.background = COLORS.primary)}
            aria-label={`Adicionar ${perfume.name} ao carrinho`}
          >
            Adicionar ao Carrinho
          </button>
        </div>
      </div>

      {/* Info section */}
      <div className="flex flex-col p-4 gap-2">
        <h3
          className="font-serif-luxury font-semibold text-sm leading-tight line-clamp-2 italic"
          style={{ color: COLORS.foreground }}
        >
          {perfume.category === "BRAND" ? `Inspiração ${perfume.name}` : perfume.name}
        </h3>

        <p
          className="text-xs line-clamp-1 tracking-wide"
          style={{ color: COLORS.mutedForeground, fontWeight: 300 }}
        >
          {perfume.family || perfume.tags.join(", ")}
        </p>

        <div className="flex items-center justify-between mt-1">
          <div className="flex items-baseline gap-1.5">
            <span
              className="font-serif-luxury font-bold text-base"
              style={{ color: COLORS.primary }}
            >
              {price}
            </span>
            <span className="text-xs" style={{ color: COLORS.mutedForeground }}>
              {size}
            </span>
          </div>

          {/* Mobile-only cart button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              addToCart(perfume);
              setCartOpen(true);
            }}
            className="md:hidden flex items-center justify-center w-9 h-9 transition-all duration-300 border"
            style={{
              borderColor: COLORS.border,
              color: COLORS.mutedForeground,
              borderRadius: "2px",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(212,175,55,0.5)";
              e.currentTarget.style.color = COLORS.primary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = COLORS.border;
              e.currentTarget.style.color = COLORS.mutedForeground;
            }}
            aria-label={`Adicionar ${perfume.name} ao carrinho`}
          >
            <CartIcon size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  CATALOG — pill filters + responsive grid
// ═══════════════════════════════════════════════════════════
type CatalogFilter =
  | "all"
  | "BRAND"
  | "AFEER"
  | "DECANTE"
  | "FEMININO"
  | "MASCULINO";

function Catalog() {
  const products = useStore((s) => s.products);
  const [activeCategory, setActiveCategory] = useState<CatalogFilter>("all");

  const categories = useMemo(() => {
    const pills: { id: CatalogFilter; label: string; count: number }[] = [
      { id: "all", label: "Todos", count: products.length },
      {
        id: "BRAND",
        label: "Brand Collection",
        count: products.filter((p) => p.category === "BRAND").length,
      },
      {
        id: "AFEER",
        label: "Afeer",
        count: products.filter((p) => p.category === "AFEER").length,
      },
      {
        id: "DECANTE",
        label: "Decante",
        count: products.filter((p) => p.category === "DECANTE").length,
      },
      {
        id: "FEMININO",
        label: "Feminino",
        count: products.filter((p) => p.gender === "FEMININO").length,
      },
      {
        id: "MASCULINO",
        label: "Masculino",
        count: products.filter((p) => p.gender === "MASCULINO").length,
      },
    ];
    return pills.filter((p) => p.count > 0 || p.id === "all");
  }, [products]);

  const filtered = useMemo(() => {
    if (activeCategory === "all") return products;
    if (["BRAND", "AFEER", "DECANTE"].includes(activeCategory))
      return products.filter((p) => p.category === activeCategory);
    if (["FEMININO", "MASCULINO"].includes(activeCategory))
      return products.filter((p) => p.gender === activeCategory);
    return products;
  }, [products, activeCategory]);

  return (
    <section id="colecao" className="py-24 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-14">
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-6 h-px" style={{ background: COLORS.primary }} />
              <span className="label-luxury tracking-[0.3em]">Nossa Coleção</span>
            </div>
            <h2
              className="font-serif-luxury font-bold"
              style={{
                color: COLORS.foreground,
                fontSize: "clamp(2rem, 5vw, 4rem)",
                letterSpacing: "-0.025em",
                lineHeight: 1.0,
              }}
            >
              Todas as{" "}
              <span className="italic font-light" style={{ color: COLORS.mutedForeground }}>
                Fragrâncias.
              </span>
            </h2>
          </div>
          <p
            className="text-sm max-w-xs leading-relaxed"
            style={{ color: COLORS.mutedForeground, fontWeight: 300 }}
          >
            Perfumes importados e árabes cuidadosamente selecionados para todos os gostos e
            ocasiões.
          </p>
        </div>

        {/* Pill filters */}
        <div className="mb-10">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`category-pill flex-shrink-0 ${activeCategory === cat.id ? "active" : ""}`}
              >
                {cat.label}
                <span
                  className="ml-1.5 text-xs"
                  style={{ opacity: activeCategory === cat.id ? 0.7 : 0.4 }}
                >
                  ({cat.count})
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="divider-gold mb-10" />

        {/* Grid */}
        {products.length === 0 ? (
          <div className="text-center py-20" style={{ color: COLORS.mutedForeground }}>
            <p className="text-[0.6rem] tracking-[0.3em] uppercase opacity-60">
              Carregando produtos do banco de dados...
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20" style={{ color: COLORS.mutedForeground }}>
            <p className="text-[0.6rem] tracking-[0.3em] uppercase opacity-60">
              Nenhum produto encontrado.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5">
            {filtered.map((p) => (
              <RocketProductCard key={p.id} perfume={p} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
//  NEWSLETTER — Acesso Exclusivo
// ═══════════════════════════════════════════════════════════
function Newsletter() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSent(true);
    setEmail("");
    setTimeout(() => setSent(false), 4000);
  };

  return (
    <section className="py-24 px-4 sm:px-6 relative overflow-hidden">
      <div
        className="absolute inset-0 blob-warm opacity-60 pointer-events-none"
        style={{ top: "20%", left: "30%", width: "600px", height: "400px" }}
      />
      <div className="max-w-7xl mx-auto relative z-10">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          {/* Left: text */}
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-6 h-px" style={{ background: COLORS.primary }} />
              <span className="label-luxury tracking-[0.3em]">Acesso Exclusivo</span>
            </div>

            <h2
              className="font-serif-luxury font-bold leading-tight mb-6"
              style={{
                color: COLORS.foreground,
                fontSize: "clamp(2rem, 4vw, 3.5rem)",
                letterSpacing: "-0.025em",
                lineHeight: 1.0,
              }}
            >
              Seja o primeiro a{" "}
              <span className="italic font-light text-gradient-gold">descobrir.</span>
            </h2>

            <p
              className="leading-relaxed mb-8"
              style={{ color: COLORS.mutedForeground, fontWeight: 300, fontSize: "0.95rem" }}
            >
              Cadastre-se e receba em primeira mão os lançamentos exclusivos, promoções especiais
              e novidades da Mimi Mimos — antes de qualquer outra pessoa.
            </p>

            <div className="flex flex-col gap-3">
              {[
                "Lançamentos exclusivos antes de todos",
                "Promoções e ofertas especiais",
                "Sem spam — cancele quando quiser",
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3 text-sm"
                  style={{ color: COLORS.mutedForeground }}
                >
                  <div
                    className="w-1 h-1 rounded-full flex-shrink-0"
                    style={{ background: COLORS.primary }}
                  />
                  {item}
                </div>
              ))}
            </div>
          </div>

          {/* Right: form */}
          <div>
            <form className="flex flex-col gap-4" onSubmit={submit}>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com.br"
                  required
                  className="w-full px-5 py-4 text-sm focus:outline-none transition-colors duration-300"
                  style={{
                    background: COLORS.muted,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.foreground,
                    borderRadius: "2px",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(212,175,55,0.5)")}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(212,175,55,0.5)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
                />
              </div>

              <button
                type="submit"
                disabled={sent}
                className="group inline-flex items-center justify-center gap-3 px-6 py-4 font-semibold text-xs tracking-[0.15em] uppercase transition-all duration-400 disabled:opacity-60"
                style={{
                  background: COLORS.primary,
                  color: COLORS.primaryForeground,
                  borderRadius: "2px",
                }}
                onMouseEnter={(e) => {
                  if (!sent) e.currentTarget.style.background = COLORS.accent;
                }}
                onMouseLeave={(e) => {
                  if (!sent) e.currentTarget.style.background = COLORS.primary;
                }}
              >
                {sent ? "Inscrito com sucesso!" : "Quero Acesso Exclusivo"}
                {!sent && (
                  <span className="w-4 h-px bg-current transition-all duration-300 group-hover:w-6" />
                )}
              </button>

              <p
                className="text-xs opacity-50 tracking-wide"
                style={{ color: COLORS.mutedForeground }}
              >
                Seus dados estão seguros. Política de privacidade respeitada.
              </p>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
//  FOOTER — 3 columns + bottom bar
// ═══════════════════════════════════════════════════════════
function RocketFooter() {
  const setCartOpen = useUI((s) => s.setCartOpen);

  const socialLinkClass =
    "w-9 h-9 border flex items-center justify-center transition-all duration-300";

  return (
    <footer
      className="relative overflow-hidden"
      style={{ borderTop: "1px solid rgba(34,30,24,0.8)" }}
    >
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] blob-gold opacity-20 pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 sm:px-8 relative z-10">
        <div
          className="grid md:grid-cols-3 gap-12 py-16 border-b"
          style={{ borderColor: "rgba(184,150,90,0.18)" }}
        >
          {/* Brand column */}
          <div className="flex flex-col gap-5">
            <div>
              <div
                className="font-serif-luxury font-bold text-xl tracking-tight"
                style={{ color: COLORS.foreground }}
              >
                Mimi Mimos
              </div>
              <div className="label-luxury mt-1 opacity-50 tracking-[0.3em]">Haute Parfumerie</div>
            </div>
            <p
              className="text-sm leading-relaxed"
              style={{ color: COLORS.mutedForeground, fontWeight: 300 }}
            >
              Fragrâncias importadas e árabes de alto padrão, curadas para quem valoriza a
              experiência olfativa.
            </p>
            <div className="flex items-center gap-3 mt-2">
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={socialLinkClass}
                style={{
                  borderColor: COLORS.border,
                  color: COLORS.mutedForeground,
                  borderRadius: "2px",
                }}
                aria-label="WhatsApp"
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = COLORS.foreground;
                  e.currentTarget.style.borderColor = "rgba(212,175,55,0.4)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = COLORS.mutedForeground;
                  e.currentTarget.style.borderColor = COLORS.border;
                }}
              >
                <WhatsAppIcon size={14} />
              </a>
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className={socialLinkClass}
                style={{
                  borderColor: COLORS.border,
                  color: COLORS.mutedForeground,
                  borderRadius: "2px",
                }}
                aria-label="Instagram"
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = COLORS.foreground;
                  e.currentTarget.style.borderColor = "rgba(212,175,55,0.4)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = COLORS.mutedForeground;
                  e.currentTarget.style.borderColor = COLORS.border;
                }}
              >
                <InstagramIcon size={14} />
              </a>
            </div>
          </div>

          {/* Navigation column */}
          <div className="flex flex-col gap-4">
            <div className="label-luxury tracking-[0.3em] mb-2">Navigation</div>
            {[
              { href: "/staging", label: "Maison" },
              { href: "#colecao", label: "Collection" },
              { href: "/checkout", label: "Panier" },
              { href: "/admin", label: "Admin" },
            ].map((item) =>
              item.label === "Panier" ? (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setCartOpen(true)}
                  className="text-sm tracking-wide w-fit transition-colors duration-300"
                  style={{ color: COLORS.mutedForeground, fontWeight: 300 }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.foreground)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.mutedForeground)}
                >
                  {item.label}
                </button>
              ) : (
                <a
                  key={item.label}
                  href={item.href}
                  className="text-sm tracking-wide w-fit transition-colors duration-300"
                  style={{ color: COLORS.mutedForeground, fontWeight: 300 }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.foreground)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.mutedForeground)}
                >
                  {item.label}
                </a>
              ),
            )}
          </div>

          {/* Contact column */}
          <div className="flex flex-col gap-4">
            <div className="label-luxury tracking-[0.3em] mb-2">Contato</div>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm tracking-wide w-fit transition-colors duration-300"
              style={{ color: COLORS.mutedForeground, fontWeight: 300 }}
              onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.foreground)}
              onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.mutedForeground)}
            >
              +55 11 95854-6078
            </a>
            <div
              className="text-sm tracking-wide"
              style={{ color: COLORS.mutedForeground, fontWeight: 300 }}
            >
              Chave Pix:
              <br />
              <span className="font-mono text-xs" style={{ color: "rgba(250,250,250,0.7)" }}>
                fabiana@araujo.eu.org
              </span>
            </div>
          </div>
        </div>

        <div className="py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p
            className="text-xs opacity-50 tracking-widest uppercase"
            style={{ color: COLORS.mutedForeground }}
          >
            © 2026 Mimi Mimos — Haute Parfumerie
          </p>
          <p
            className="text-xs opacity-40 tracking-widest uppercase"
            style={{ color: COLORS.mutedForeground }}
          >
            Todos os direitos reservados
          </p>
        </div>
      </div>
    </footer>
  );
}

// ═══════════════════════════════════════════════════════════
//  FLOATING WHATSAPP — bottom-right green circle
// ═══════════════════════════════════════════════════════════
function FloatingWhatsAppRocket() {
  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="whatsapp-float"
      aria-label="Falar pelo WhatsApp"
    >
      <WhatsAppIcon size={28} color="white" />
    </a>
  );
}

// ═══════════════════════════════════════════════════════════
//  MAIN STAGING PAGE
// ═══════════════════════════════════════════════════════════
export default function StagingPage() {
  const openSlideIn = useSlideInUI((s) => s.openSlideInQuickView);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) openSlideIn(detail);
    };
    window.addEventListener("openSlideIn", handler);
    return () => window.removeEventListener("openSlideIn", handler);
  }, [openSlideIn]);

  // D1 sync calls — all 7
  useEffect(() => {
    void syncProductsFromD1();
    void syncContentFromD1();
    void syncKitsFromD1();
    void syncCouponsFromD1();
    void syncReviewsFromD1();
    void syncLeadsFromD1();
    void syncPixConfigFromD1();
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ROCKET_STYLES }} />
      <CursorCanvas />
      <ServiceWorkerRegister />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "rgba(8,8,8,0.92)",
            border: "1px solid rgba(212,175,55,0.4)",
            color: "#fef9e7",
            backdropFilter: "blur(12px)",
          },
        }}
      />

      {/* STAGING badge — keep at very top (above the marquee bar) */}
      <div
        className="fixed top-0 left-0 right-0 z-[100] text-center text-[9px] py-0.5 uppercase tracking-widest font-bold"
        style={{ background: "#dc2626", color: "#ffffff" }}
      >
        ⚠ STAGING — Página de Testes ·{" "}
        <a href="/" className="underline">
          Voltar à Loja
        </a>
      </div>

      <MarqueeBar />
      <RocketHeader />

      <main style={{ background: COLORS.background }}>
        <RocketHero />
        <KitSection />
        <Catalog />
        <Newsletter />
      </main>

      <RocketFooter />
      <FloatingWhatsAppRocket />

      {/* Modals & Drawers (shared with main site) */}
      <CartDrawer />
      <PixModal />
      <NotifyModal />
      <QuickViewModal />
      <SlideInQuickView />
      <FavoritesModal />
      <CompareModal />
      <PwaInstallBanner />
      <NotificationManager />
      <FloatingCompareButton />
    </>
  );
}

// ═══════════════════════════════════════════════════════════
//  ROCKET-SITE CSS — injected via <style> tag
//  Every class used by the Rocket.site reference
// ═══════════════════════════════════════════════════════════
const ROCKET_STYLES = `
@keyframes marquee {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
.animate-marquee { animation: marquee 30s linear infinite; }

@keyframes blob {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(30px, -50px) scale(1.1); }
  66% { transform: translate(-20px, 20px) scale(0.9); }
}
.animate-blob { animation: blob 8s ease-in-out infinite; }

.blob-gold {
  background: radial-gradient(circle, rgba(212, 175, 55, 0.15), transparent 70%);
}
.blob-amber {
  background: radial-gradient(circle, rgba(184, 150, 90, 0.1), transparent 70%);
}
.blob-warm {
  background: radial-gradient(circle, rgba(8, 8, 8, 0.8), transparent);
}

.text-gradient-gold {
  background: linear-gradient(135deg, #d4af37, #fceeb5, #d4af37);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  color: transparent;
}

.product-scrim {
  background: linear-gradient(to top, rgba(8, 8, 8, 1) 0%, rgba(8, 8, 8, 0.4) 40%, transparent 70%);
}

.hover-lift {
  transition: transform 0.4s ease, box-shadow 0.4s ease;
}
.hover-lift:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(212, 175, 55, 0.08);
}

.divider-gold {
  height: 1px;
  background: linear-gradient(to right, transparent, rgba(212, 175, 55, 0.3), transparent);
}

.category-pill {
  padding: 0.5rem 1.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.5);
  background: transparent;
  border: 1px solid rgba(184, 150, 90, 0.15);
  border-radius: 999px;
  transition: all 0.3s ease;
  cursor: pointer;
  white-space: nowrap;
}
.category-pill.active {
  color: #d4af37;
  border-color: rgba(212, 175, 55, 0.4);
  background: rgba(212, 175, 55, 0.08);
}
.category-pill:hover {
  color: rgba(255, 255, 255, 0.8);
  border-color: rgba(184, 150, 90, 0.3);
}

.label-luxury {
  font-size: 0.6rem;
  font-weight: 600;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.4);
}

.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}

.grain-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.03;
  z-index: 1;
  background-image: url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
}

.whatsapp-float {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  z-index: 50;
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 9999px;
  background: #25D366;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 20px rgba(37, 211, 102, 0.3);
  transition: transform 0.3s ease;
}
.whatsapp-float:hover {
  transform: scale(1.1);
}

/* Tailwind v4 utilities used by the design that we extend */
.bg-background { background-color: #080808; }
.bg-card { background-color: #0e0d0c; }
.bg-muted { background-color: #1a1816; }
.text-foreground { color: #fafafa; }
.text-muted-foreground { color: #71717a; }
.text-primary { color: #d4af37; }
.bg-primary { background-color: #d4af37; }
.text-primary-foreground { color: #080808; }
.bg-accent { background-color: #b89655; }
.border-border { border-color: rgba(184, 150, 90, 0.12); }
.bg-background\/60 { background-color: rgba(8, 8, 8, 0.6); }
.bg-background\/80 { background-color: rgba(8, 8, 8, 0.8); }
.border-primary\/30 { border-color: rgba(212, 175, 55, 0.3); }
.border-primary\/40 { border-color: rgba(212, 175, 55, 0.4); }
.border-primary\/50 { border-color: rgba(212, 175, 55, 0.5); }
.border-border\/40 { border-color: rgba(184, 150, 90, 0.06); }
.to-primary\/40 { --tw-gradient-to: rgba(212, 175, 55, 0.4); }
.to-primary\/60 { --tw-gradient-to: rgba(212, 175, 55, 0.6); }
.from-transparent { --tw-gradient-from: transparent; }
.bg-gradient-to-b {
  background-image: linear-gradient(to bottom, var(--tw-gradient-stops));
}
.bg-gradient-to-t {
  background-image: linear-gradient(to top, var(--tw-gradient-stops));
}
.bg-gradient-to-b.from-transparent.to-primary\/40 {
  background-image: linear-gradient(to bottom, transparent, rgba(212, 175, 55, 0.4));
}
.bg-gradient-to-t.from-transparent.to-primary\/60 {
  background-image: linear-gradient(to top, transparent, rgba(212, 175, 55, 0.6));
}

/* line-clamp polyfill (Tailwind v4 ships it, but pinning in case) */
.line-clamp-1 {
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
}
.line-clamp-2 {
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
`;
