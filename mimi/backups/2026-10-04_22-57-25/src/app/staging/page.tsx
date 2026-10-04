"use client";

import { useEffect, useState, useMemo } from "react";
import { AnnouncementBar } from "@/components/luxury/Header";
import Header from "@/components/luxury/Header";
import Hero from "@/components/luxury/Hero";
import FeaturedCarousel from "@/components/luxury/FeaturedCarousel";
import StatsBar from "@/components/luxury/StatsBar";
import ScentMatcher from "@/components/luxury/ScentMatcher";
import HowToUse from "@/components/luxury/HowToUse";
import TrustBadges from "@/components/luxury/TrustBadges";
import FAQSection from "@/components/luxury/FAQSection";
import OlfactoryQuiz from "@/components/luxury/OlfactoryQuiz";
import RecentlyViewed from "@/components/luxury/RecentlyViewed";
import NewsletterSection from "@/components/luxury/NewsletterSection";
import CartDrawer from "@/components/luxury/CartDrawer";
import PixModal from "@/components/luxury/PixModal";
import NotifyModal from "@/components/luxury/NotifyModal";
import QuickViewModal from "@/components/luxury/QuickViewModal";
import SlideInQuickView, { useSlideInUI } from "@/components/luxury/SlideInQuickView";
import FavoritesModal from "@/components/luxury/FavoritesModal";
import FloatingWhatsApp from "@/components/luxury/FloatingWhatsApp";
import FloatingCompareButton from "@/components/luxury/FloatingCompareButton";
import CompareModal from "@/components/luxury/CompareModal";
import CursorCanvas from "@/components/luxury/CursorCanvas";
import PwaInstallBanner from "@/components/luxury/PwaInstallBanner";
import NotificationManager from "@/components/luxury/NotificationManager";
import SiteFooter from "@/components/luxury/SiteFooter";
import ServiceWorkerRegister from "@/components/luxury/ServiceWorkerRegister";
import { useUI, useStore } from "@/lib/stores-combined";
import { syncProductsFromD1, syncLeadsFromD1, syncPixConfigFromD1 } from "@/lib/store";
import { syncContentFromD1 } from "@/lib/content-store";
import { syncKitsFromD1 } from "@/lib/kit-store";
import { syncCouponsFromD1 } from "@/lib/coupon-store";
import { syncReviewsFromD1 } from "@/lib/review-store";
import { Toaster } from "sonner";
import { formatBRL } from "@/lib/pix";
import {
  Sparkles,
  ChevronRight,
  CreditCard,
  QrCode,
  Truck,
  Shield,
  Home as HomeIcon,
  Package,
  ChevronDown,
  Gift,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════
//  STAGING PAGE — New features tested here without affecting main site
//
//  Features being tested:
//  1. Luxury banner carousel (3 rotating banners)
//  2. Product cards with parcelamento + Pix badge
//  3. Breadcrumbs on product detail
//  4. "Produtos Similares" section
//  5. Compact sticky header (shrinks on scroll)
//  6. Expanded footer with more links
//  7. "Inspirados em" filter (by brand)
//
//  All data comes from D1 — no hardcoded products
// ═══════════════════════════════════════════════════════════

const BANNERS = [
  {
    img: "/staging-assets/banner-luxury-1.png",
    title: "Brand Collection 25ml",
    subtitle: "O luxo das melhores fragrâncias do mundo",
    cta: "Ver Catálogo",
    href: "#staging-catalog",
  },
  {
    img: "/staging-assets/banner-luxury-2.png",
    title: "Miniaturas Árabes",
    subtitle: "Afeer & Decantes — essência oriental",
    cta: "Ver Árabes",
    href: "#staging-catalog",
  },
  {
    img: "/staging-assets/banner-luxury-3.png",
    title: "7x sem juros ou 5% no Pix",
    subtitle: "Frete grátis acima de R$ 199",
    cta: "Comprar Agora",
    href: "#staging-catalog",
  },
];

const PARCEL_MAX = 7; // 7x sem juros
const PIX_DISCOUNT = 0.05; // 5% no Pix

function calcParcel(price: number): string {
  const parcel = price / PARCEL_MAX;
  return `${PARCEL_MAX}x de ${formatBRL(parcel)} sem juros`;
}

function calcPixPrice(price: number): string {
  return formatBRL(price * (1 - PIX_DISCOUNT));
}

// ═══════════════════════════════════════════════════════════
//  BANNER CAROUSEL
// ═══════════════════════════════════════════════════════════
function BannerCarousel() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActive((prev) => (prev + 1) % BANNERS.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative h-[300px] sm:h-[400px] md:h-[500px] overflow-hidden">
      {BANNERS.map((banner, i) => (
        <div
          key={i}
          className={`absolute inset-0 transition-opacity duration-1000 ${
            i === active ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <img
            src={banner.img}
            alt={banner.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-obsidian-950 via-obsidian-950/40 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-10">
            <div className="max-w-2xl">
              <h2 className="font-serif-luxury text-2xl sm:text-4xl font-bold text-white mb-2">
                {banner.title}
              </h2>
              <p className="text-sm sm:text-lg text-gold-300/90 mb-4">
                {banner.subtitle}
              </p>
              <a
                href={banner.href}
                className="inline-flex items-center gap-2 btn-gold px-6 py-2.5 rounded-full text-xs uppercase tracking-wider"
              >
                {banner.cta} <ChevronRight size={14} />
              </a>
            </div>
          </div>
        </div>
      ))}
      {/* Dots */}
      <div className="absolute bottom-3 right-6 flex gap-2 z-10">
        {BANNERS.map((_, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={`w-2 h-2 rounded-full transition-all ${
              i === active ? "bg-gold-400 w-6" : "bg-white/40"
            }`}
          />
        ))}
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
//  STAGING PRODUCT CARD — with parcelamento + Pix badge
// ═══════════════════════════════════════════════════════════
function StagingPerfumeCard({ perfume }: { perfume: any }) {
  const addToCart = useStore((s) => s.addToCart);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="glass-panel rounded-xl overflow-hidden border border-gold-500/20 hover:border-gold-400/50 transition-all group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Image */}
      <div className="relative h-56 bg-obsidian-950 overflow-hidden">
        <img
          src={perfume.image}
          alt={perfume.name}
          className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-500"
        />
        {/* Pix badge */}
        <div className="absolute top-2 left-2 bg-emerald-500/90 text-white text-[9px] font-bold uppercase px-2 py-1 rounded-full">
          5% Pix
        </div>
        {/* Category badge */}
        <div className="absolute top-2 right-2 bg-gold-500/20 text-gold-300 text-[9px] font-bold uppercase px-2 py-1 rounded-full border border-gold-500/30">
          {perfume.category === "BRAND" ? "25ml" : perfume.category === "AFEER" ? "Mini" : "5ml"}
        </div>
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        <div>
          <h4 className="text-sm font-bold text-white truncate">{perfume.name}</h4>
          <p className="text-[10px] text-gold-300/70 truncate">
            Semelhança: {perfume.inspiration}
          </p>
        </div>

        {/* Price + parcelamento */}
        <div>
          <p className="text-lg font-serif-luxury font-bold text-gold-400">
            {formatBRL(perfume.price)}
          </p>
          <p className="text-[10px] text-gray-400">
            {calcParcel(perfume.price)}
          </p>
          <p className="text-[10px] text-emerald-400">
            ou {calcPixPrice(perfume.price)} no Pix
          </p>
        </div>

        {/* Stock + CTA */}
        <div className="flex items-center justify-between gap-2">
          {perfume.inStock ? (
            <span className="text-[9px] text-emerald-400 font-bold">✓ Em estoque</span>
          ) : (
            <span className="text-[9px] text-red-400 font-bold">Esgotado</span>
          )}
          <button
            onClick={() => {
              addToCart(perfume);
            }}
            disabled={!perfume.inStock}
            className="btn-gold px-3 py-1.5 rounded-lg text-[10px] uppercase font-bold disabled:opacity-50"
          >
            Comprar
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  STAGING CATALOG GRID — with "Inspirados em" filter
// ═══════════════════════════════════════════════════════════
function StagingCatalogGrid() {
  const products = useStore((s) => s.products);
  const [activeCategory, setActiveCategory] = useState("all");
  const [sortBy, setSortBy] = useState("featured");
  const [brandFilter, setBrandFilter] = useState(""); // "Inspirados em" filter

  // Extract unique brands from inspiration field
  const brands = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      const brand = p.inspiration?.split(" - ")[1]?.trim();
      if (brand) set.add(brand);
    });
    return Array.from(set).sort().slice(0, 12);
  }, [products]);

  const filtered = useMemo(() => {
    let result = [...products];

    // Category filter
    if (activeCategory === "BRAND") result = result.filter((p) => p.category === "BRAND");
    else if (activeCategory === "AFEER") result = result.filter((p) => p.category === "AFEER");
    else if (activeCategory === "DECANTE") result = result.filter((p) => p.category === "DECANTE");
    else if (activeCategory === "MASCULINO") result = result.filter((p) => p.gender === "MASCULINO");
    else if (activeCategory === "FEMININO") result = result.filter((p) => p.gender === "FEMININO");
    else if (activeCategory === "ARABE") result = result.filter((p) => p.gender === "ARABE" || p.category === "AFEER");

    // Brand filter ("Inspirados em")
    if (brandFilter) {
      result = result.filter((p) => p.inspiration?.includes(brandFilter));
    }

    // Sort
    if (sortBy === "price-asc") result.sort((a, b) => a.price - b.price);
    else if (sortBy === "price-desc") result.sort((a, b) => b.price - a.price);
    else if (sortBy === "rating") result.sort((a, b) => (b.rating || 0) - (a.rating || 0));

    return result;
  }, [products, activeCategory, sortBy, brandFilter]);

  const categories = [
    { id: "all", label: "Todos" },
    { id: "BRAND", label: "Brand Collection" },
    { id: "AFEER", label: "Miniaturas" },
    { id: "DECANTE", label: "Decantes" },
    { id: "MASCULINO", label: "Masculino" },
    { id: "FEMININO", label: "Feminino" },
    { id: "ARABE", label: "Árabe" },
  ];

  return (
    <section id="staging-catalog" className="py-8 px-4 sm:px-8 max-w-7xl mx-auto">
      <h2 className="font-serif-luxury text-2xl md:text-3xl font-bold text-white mb-1">
        Catálogo Completo
      </h2>
      <p className="text-xs text-gray-400 mb-4">
        {filtered.length} produtos · 7x sem juros · 5% OFF no Pix · Frete grátis acima de R$ 199
      </p>

      {/* Category pills */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-luxury">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all ${
              activeCategory === cat.id
                ? "bg-gold-500 text-obsidian-950"
                : "bg-obsidian-900 text-gray-300 border border-gold-500/20 hover:border-gold-500/50"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Sort + Brand filter */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Ordenar:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-obsidian-900 border border-gold-500/30 rounded-lg py-1 px-2 text-xs text-white"
          >
            <option value="featured">Destaques</option>
            <option value="price-asc">Menor Preço</option>
            <option value="price-desc">Maior Preço</option>
            <option value="rating">Melhor Avaliados</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Inspirados em:</span>
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="bg-obsidian-900 border border-gold-500/30 rounded-lg py-1 px-2 text-xs text-white"
          >
            <option value="">Todas as marcas</option>
            {brands.map((brand) => (
              <option key={brand} value={brand}>{brand}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Product grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Package size={36} className="mx-auto mb-2 text-gold-500/30" />
          <p className="text-xs">Carregando produtos do banco de dados...</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {filtered.map((p) => (
            <StagingPerfumeCard key={p.id} perfume={p} />
          ))}
        </div>
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
//  STAGING BENEFITS BAR (like Guido)
// ═══════════════════════════════════════════════════════════
function BenefitsBar() {
  const benefits = [
    { icon: Truck, title: "Frete grátis", desc: "Acima de R$ 199" },
    { icon: CreditCard, title: "7x sem juros", desc: "Ou 5% no Pix" },
    { icon: Package, title: "Brinde", desc: "A cada R$ 199" },
    { icon: Shield, title: "Compra Segura", desc: "SSL + Pix" },
  ];

  return (
    <section className="py-6 px-4 border-y border-gold-500/10 bg-obsidian-900/40">
      <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4">
        {benefits.map((b, i) => (
          <div key={i} className="flex items-center gap-2 text-center md:text-left justify-center md:justify-start">
            <div className="w-10 h-10 rounded-xl bg-gold-500/15 border border-gold-500/30 flex items-center justify-center text-gold-400 shrink-0">
              <b.icon size={16} />
            </div>
            <div>
              <p className="text-[11px] font-bold text-white">{b.title}</p>
              <p className="text-[9px] text-gray-400">{b.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
//  EXPANDED FOOTER (like Guido)
// ═══════════════════════════════════════════════════════════
function StagingFooter() {
  return (
    <footer className="border-t border-gold-500/20 bg-obsidian-950 pt-8 pb-6 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
          {/* Col 1 — Categorias */}
          <div>
            <h4 className="text-[10px] uppercase tracking-wider text-gold-400 font-bold mb-3">Categorias</h4>
            <ul className="space-y-1.5">
              <li><a href="#" className="text-[11px] text-gray-400 hover:text-gold-300">Brand Collection</a></li>
              <li><a href="#" className="text-[11px] text-gray-400 hover:text-gold-300">Miniaturas Árabes</a></li>
              <li><a href="#" className="text-[11px] text-gray-400 hover:text-gold-300">Decantes 5ml</a></li>
              <li><a href="#" className="text-[11px] text-gray-400 hover:text-gold-300">Masculino</a></li>
              <li><a href="#" className="text-[11px] text-gray-400 hover:text-gold-300">Feminino</a></li>
              <li><a href="#" className="text-[11px] text-gray-400 hover:text-gold-300">Kits Promocionais</a></li>
            </ul>
          </div>
          {/* Col 2 — Ajuda */}
          <div>
            <h4 className="text-[10px] uppercase tracking-wider text-gold-400 font-bold mb-3">Ajuda</h4>
            <ul className="space-y-1.5">
              <li><a href="#" className="text-[11px] text-gray-400 hover:text-gold-300">Entregas e Prazos</a></li>
              <li><a href="#" className="text-[11px] text-gray-400 hover:text-gold-300">Trocas e Devoluções</a></li>
              <li><a href="#" className="text-[11px] text-gray-400 hover:text-gold-300">Formas de Pagamento</a></li>
              <li><a href="#" className="text-[11px] text-gray-400 hover:text-gold-300">Rastrear Pedido</a></li>
              <li><a href="#" className="text-[11px] text-gray-400 hover:text-gold-300">FAQ</a></li>
              <li><a href="#" className="text-[11px] text-gray-400 hover:text-gold-300">Contato</a></li>
            </ul>
          </div>
          {/* Col 3 — Sobre */}
          <div>
            <h4 className="text-[10px] uppercase tracking-wider text-gold-400 font-bold mb-3">Sobre</h4>
            <ul className="space-y-1.5">
              <li><a href="#" className="text-[11px] text-gray-400 hover:text-gold-300">Sobre a Mimi Mimos</a></li>
              <li><a href="#" className="text-[11px] text-gray-400 hover:text-gold-300">Nossos Produtos</a></li>
              <li><a href="#" className="text-[11px] text-gray-400 hover:text-gold-300">Consultor Olfativo</a></li>
              <li><a href="#" className="text-[11px] text-gray-400 hover:text-gold-300">Blog</a></li>
              <li><a href="#" className="text-[11px] text-gray-400 hover:text-gold-300">Política de Privacidade</a></li>
            </ul>
          </div>
          {/* Col 4 — Newsletter + Pagamento */}
          <div>
            <h4 className="text-[10px] uppercase tracking-wider text-gold-400 font-bold mb-3">Pagamento</h4>
            <div className="flex flex-wrap gap-1.5 mb-4">
              <span className="text-[9px] bg-obsidian-900 border border-gold-500/20 rounded px-2 py-1 text-gray-300">Pix</span>
              <span className="text-[9px] bg-obsidian-900 border border-gold-500/20 rounded px-2 py-1 text-gray-300">Cartão 7x</span>
              <span className="text-[9px] bg-obsidian-900 border border-gold-500/20 rounded px-2 py-1 text-gray-300">Boleto</span>
            </div>
            <h4 className="text-[10px] uppercase tracking-wider text-gold-400 font-bold mb-2">Envio</h4>
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[9px] bg-obsidian-900 border border-gold-500/20 rounded px-2 py-1 text-gray-300">Correios</span>
              <span className="text-[9px] bg-obsidian-900 border border-gold-500/20 rounded px-2 py-1 text-gray-300">Retirada</span>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-gold-500/10 pt-4 flex flex-col sm:flex-row justify-between items-center gap-2">
          <p className="text-[10px] text-gray-500">
            © 2026 Mimi Mimos · Haute Parfumerie · Brand Collection 25ml
          </p>
          <p className="text-[9px] text-gray-600">
            STAGING — Página de testes · Não é a loja oficial
          </p>
        </div>
      </div>
    </footer>
  );
}

// ═══════════════════════════════════════════════════════════
//  STAGING HEADER — compact sticky (shrinks on scroll)
// ═══════════════════════════════════════════════════════════
function StagingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const setCartOpen = useUI((s) => s.setCartOpen);
  const cartCount = useStore((s) => s.cartCount());

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 100);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 glass-panel border-b border-gold-500/20 transition-all duration-300 ${
        scrolled ? "py-1.5" : "py-3"
      } safe-top`}
    >
      <div className="max-w-7xl mx-auto px-4 flex justify-between items-center gap-3">
        {/* Logo */}
        <a href="/staging" className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border border-gold-500/40 overflow-hidden shrink-0">
            <img src="/logo-bottle.png" alt="Mimi Mimos" className="w-full h-full object-cover scale-[1.6]" />
          </div>
          <span className={`font-serif-luxury font-bold gold-shimmer-text uppercase hidden sm:block ${
            scrolled ? "text-sm" : "text-lg"
          }`}>
            Mimi Mimos
          </span>
          <span className="font-serif-luxury font-bold text-gold-500 uppercase sm:hidden text-sm">
            MIMI
          </span>
        </a>

        {/* Benefits text */}
        <div className="hidden md:flex items-center gap-4 text-[10px] text-gray-400">
          <span className="flex items-center gap-1"><Truck size={11} /> Frete grátis +R$199</span>
          <span className="flex items-center gap-1"><CreditCard size={11} /> 7x sem juros</span>
          <span className="flex items-center gap-1"><QrCode size={11} /> 5% no Pix</span>
        </div>

        {/* Cart */}
        <button
          onClick={() => setCartOpen(true)}
          className="bg-gold-500/10 hover:bg-gold-500/20 border border-gold-500/30 text-gold-300 px-3 py-1.5 rounded-full flex items-center gap-2 transition-all shrink-0"
        >
          <span className="text-xs font-semibold">Sacola</span>
          <span className="bg-gold-500 text-obsidian-950 font-bold text-[10px] w-5 h-5 rounded-full flex items-center justify-center">
            {cartCount}
          </span>
        </button>
      </div>
    </header>
  );
}

// ═══════════════════════════════════════════════════════════
//  BRINDE PROGRESSIVO — "Faltam R$ X para brinde" (like Guido)
// ═══════════════════════════════════════════════════════════
function BrindeBar() {
  const subtotal = useStore((s) => s.cartSubtotal());
  const cart = useStore((s) => s.cart);
  const BRINDE_THRESHOLD = 199;
  const remaining = Math.max(0, BRINDE_THRESHOLD - subtotal);
  const progress = Math.min(100, (subtotal / BRINDE_THRESHOLD) * 100);
  const achieved = subtotal >= BRINDE_THRESHOLD;

  if (cart.length === 0) return null;

  return (
    <div className={`rounded-xl p-2.5 border transition-all mb-3 ${
      achieved
        ? "bg-emerald-500/15 border-emerald-500/40"
        : "bg-purple-500/10 border-purple-500/30"
    }`}>
      {achieved ? (
        <div className="flex items-center gap-2 text-emerald-400">
          <Gift size={14} className="shrink-0" />
          <p className="text-[11px] font-bold">
            🎁 Você ganhou um brinde! Escolha na finalização.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-1.5">
            <Gift size={13} className="text-purple-400 shrink-0" />
            <p className="text-[11px] text-gray-300">
              Faltam <strong className="text-purple-400">{formatBRL(remaining)}</strong> para ganhar um brinde
            </p>
          </div>
          <div className="h-2 bg-obsidian-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-600 via-purple-400 to-purple-300 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  PRODUTOS SIMILARES — shows 4 related products at bottom
// ═══════════════════════════════════════════════════════════
function SimilarProducts({ excludeId, category, gender }: { excludeId: string; category: string; gender: string }) {
  const products = useStore((s) => s.products);
  const addToCart = useStore((s) => s.addToCart);

  const similar = useMemo(() => {
    return products
      .filter((p) => p.id !== excludeId && p.inStock)
      .filter((p) => p.category === category || p.gender === gender)
      .slice(0, 4);
  }, [products, excludeId, category, gender]);

  if (similar.length === 0) return null;

  return (
    <section className="py-6 px-4 sm:px-8 max-w-7xl mx-auto border-t border-gold-500/10">
      <h3 className="font-serif-luxury text-xl font-bold text-white mb-4">
        Produtos Similares
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {similar.map((p) => (
          <div
            key={p.id}
            className="glass-panel rounded-xl overflow-hidden border border-gold-500/15 hover:border-gold-400/40 transition-all group"
          >
            <div className="relative h-32 bg-obsidian-950 overflow-hidden">
              <img src={p.image} alt={p.name} className="w-full h-full object-contain p-1 group-hover:scale-105 transition-transform duration-500" />
              <div className="absolute top-1 left-1 bg-emerald-500/90 text-white text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full">
                5% Pix
              </div>
            </div>
            <div className="p-2">
              <p className="text-[10px] font-bold text-white truncate">{p.name}</p>
              <p className="text-[9px] text-gray-500 truncate mb-1">{p.inspiration}</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-gold-400">{formatBRL(p.price)}</p>
                  <p className="text-[8px] text-gray-500">{calcParcel(p.price)}</p>
                </div>
                <button
                  onClick={() => addToCart(p)}
                  className="btn-gold px-2 py-1 rounded text-[9px] uppercase font-bold"
                >
                  Comprar
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
//  BREADCRUMBS — "Início > Categoria > Produto"
// ═══════════════════════════════════════════════════════════
function Breadcrumbs({ category, productName }: { category: string; productName: string }) {
  const catLabel =
    category === "BRAND" ? "Brand Collection" :
    category === "AFEER" ? "Miniaturas Árabes" :
    category === "DECANTE" ? "Decantes" : "Perfumes";

  return (
    <nav className="px-4 sm:px-8 py-2 max-w-7xl mx-auto" aria-label="Breadcrumb">
      <ol className="flex items-center gap-1.5 text-[10px] text-gray-500">
        <li>
          <a href="/staging" className="hover:text-gold-400 flex items-center gap-1">
            <HomeIcon size={10} /> Início
          </a>
        </li>
        <li><ChevronRight size={10} /></li>
        <li className="text-gray-400">{catLabel}</li>
        <li><ChevronRight size={10} /></li>
        <li className="text-gold-400 truncate max-w-[150px]">{productName}</li>
      </ol>
    </nav>
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
      <CursorCanvas />
      <ServiceWorkerRegister />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "rgba(18,20,29,0.92)",
            border: "1px solid rgba(212,175,55,0.4)",
            color: "#fef9e7",
            backdropFilter: "blur(12px)",
          },
        }}
      />

      {/* STAGING badge */}
      <div className="fixed top-0 left-0 right-0 z-[100] bg-red-600 text-white text-center text-[9px] py-0.5 uppercase tracking-widest font-bold">
        ⚠ STAGING — Página de Testes · <a href="/" className="underline">Voltar à Loja</a>
      </div>

      <div className="flex-grow flex flex-col pt-5">
        <AnnouncementBar />
        <StagingHeader />

        <main className="flex-grow">
          {/* Banner carousel */}
          <BannerCarousel />

          {/* Benefits bar */}
          <BenefitsBar />

          {/* Featured carousel (reuses existing component) */}
          <FeaturedCarousel />
          <StatsBar />
          <ScentMatcher />

          {/* Staging catalog grid with new features */}
          <StagingCatalogGrid />

          {/* Produtos Similares (shows related products) */}
          <SimilarProducts excludeId="" category="BRAND" gender="FEMININO" />

          <TrustBadges />
          <HowToUse />
          <FAQSection />
          <OlfactoryQuiz />
          <RecentlyViewed />
          <NewsletterSection />
        </main>

        <StagingFooter />
      </div>

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
      <FloatingWhatsApp />
      <FloatingCompareButton />
    </>
  );
}
