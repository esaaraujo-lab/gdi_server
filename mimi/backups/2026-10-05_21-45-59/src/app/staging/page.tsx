"use client";

// ═══════════════════════════════════════════════════════════
//  STAGING PAGE — Rebuild with Rocket.site luxury design
//  Pure black canvas, gold gradient typography, animated blobs,
//  product-scrim cards, pill filters. All data comes from D1.
// ═══════════════════════════════════════════════════════════

import { useEffect, useState, useMemo } from "react";
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
import ServiceWorkerRegister from "@/components/luxury/ServiceWorkerRegister";
import { useUI, useStore } from "@/lib/stores-combined";
import { useCompareStore } from "@/lib/compare-store";
import { syncProductsFromD1, syncLeadsFromD1, syncPixConfigFromD1 } from "@/lib/store";
import { syncContentFromD1 } from "@/lib/content-store";
import { syncKitsFromD1 } from "@/lib/kit-store";
import { syncCouponsFromD1 } from "@/lib/coupon-store";
import { syncReviewsFromD1 } from "@/lib/review-store";
import { Toaster } from "sonner";
import { formatBRL } from "@/lib/pix";
import type { Perfume } from "@/lib/perfumes";
import {
  ChevronDown,
  Heart,
  GitCompareArrows,
  ArrowRight,
  Plus,
  Check,
} from "lucide-react";

const PARCEL_MAX = 7;
const PIX_DISCOUNT = 0.05;

function calcParcel(price: number): string {
  const parcel = price / PARCEL_MAX;
  return `${PARCEL_MAX}x de ${formatBRL(parcel)} sem juros`;
}

const MARQUEE_TEXT =
  "Frete grátis acima de R$200 · Decantes 3×R$100 · Perfumes importados e árabes · Pagamento via Pix ·";

// ═══════════════════════════════════════════════════════════
//  ANNOUNCEMENT BAR — fixed, marquee scroll
// ═══════════════════════════════════════════════════════════
function MarqueeBar() {
  return (
    <div className="fixed top-4 left-0 right-0 z-[60] border-b border-border bg-[rgba(8,8,8,0.95)] backdrop-blur-md">
      <div className="flex overflow-hidden whitespace-nowrap py-2">
        <div className="animate-marquee inline-flex shrink-0 items-center">
          <span className="px-4 text-[0.6rem] tracking-[0.3em] uppercase text-muted-foreground opacity-60">
            {MARQUEE_TEXT}
          </span>
          <span className="px-4 text-[0.6rem] tracking-[0.3em] uppercase text-muted-foreground opacity-60" aria-hidden>
            {MARQUEE_TEXT}
          </span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  HEADER — fixed, transparent → dark on scroll
// ═══════════════════════════════════════════════════════════
function RocketHeader() {
  const [scrolled, setScrolled] = useState(false);
  const setCartOpen = useUI((s) => s.setCartOpen);
  const cartCount = useStore((s) => s.cartCount());

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <header
      className={`fixed top-12 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-[rgba(8,8,8,0.9)] backdrop-blur-xl border-b border-border"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-4 flex items-center justify-between gap-6">
        <a href="/staging" className="font-serif-luxury text-base tracking-[0.2em] uppercase text-white shrink-0">
          Mimi Mimos
        </a>
        <nav className="hidden md:flex items-center gap-8">
          <a
            href="#colecao"
            className="group relative text-[0.65rem] tracking-[0.25em] uppercase text-muted-foreground hover:text-white transition-colors"
          >
            Maison Collection
            <span className="absolute -bottom-1 left-0 h-px w-0 bg-gold-500 transition-all duration-300 group-hover:w-full" />
          </a>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="group relative text-[0.65rem] tracking-[0.25em] uppercase text-muted-foreground hover:text-white transition-colors"
          >
            Panier
            <span className="absolute -bottom-1 left-0 h-px w-0 bg-gold-500 transition-all duration-300 group-hover:w-full" />
          </button>
          <a
            href="/admin"
            className="group relative text-[0.65rem] tracking-[0.25em] uppercase text-muted-foreground hover:text-white transition-colors"
          >
            Admin
            <span className="absolute -bottom-1 left-0 h-px w-0 bg-gold-500 transition-all duration-300 group-hover:w-full" />
          </a>
        </nav>
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="relative text-[0.65rem] tracking-[0.25em] uppercase text-white hover:text-gold-400 transition-colors flex items-center gap-2 shrink-0"
        >
          Panier
          <span className="inline-flex items-center justify-center rounded-full bg-gold-500 text-obsidian-950 text-[10px] font-bold w-5 h-5">
            {cartCount}
          </span>
        </button>
      </div>
    </header>
  );
}

// ═══════════════════════════════════════════════════════════
//  HERO — min-h-screen, animated blobs, vertical text
// ═══════════════════════════════════════════════════════════
function RocketHero() {
  const products = useStore((s) => s.products);
  const totalCount = products.length;
  const minPrice = products.length > 0 ? Math.min(...products.map((p) => p.price)) : 39;
  const displayCount = totalCount > 0 ? `${totalCount}+` : "19+";

  const scrollToCatalog = () =>
    document.getElementById("colecao")?.scrollIntoView({ behavior: "smooth" });
  const scrollToKit = () =>
    document.getElementById("kit")?.scrollIntoView({ behavior: "smooth" });

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#080808] pt-32 pb-16">
      {/* Animated blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="blob-gold animate-blob absolute rounded-full"
          style={{
            width: "65vw",
            height: "65vw",
            top: "-15%",
            left: "-15%",
            opacity: 0.5,
          }}
        />
        <div
          className="blob-amber animate-blob absolute rounded-full"
          style={{
            width: "50vw",
            height: "50vw",
            bottom: "-20%",
            right: "-10%",
            opacity: 0.2,
            animationDelay: "2s",
          }}
        />
        <div className="blob-warm absolute inset-0" style={{ opacity: 0.6 }} />
      </div>

      {/* Vertical text */}
      <div className="hidden md:block absolute right-8 top-1/2 -translate-y-1/2 z-10">
        <span
          className="text-[0.6rem] tracking-[0.4em] uppercase text-muted-foreground opacity-50"
          style={{ writingMode: "vertical-rl" }}
        >
          Haute Parfumerie — 2026
        </span>
      </div>

      {/* Hero content */}
      <div className="relative z-10 max-w-6xl mx-auto px-6 lg:px-12 text-center">
        <p className="text-[0.6rem] tracking-[0.3em] uppercase opacity-50 text-muted-foreground mb-6">
          Mimi Mimos · Maison de Parfums
        </p>
        <h1
          className="font-serif-luxury text-white"
          style={{
            fontSize: "clamp(3.5rem, 10vw, 9rem)",
            letterSpacing: "-0.04em",
            lineHeight: 0.88,
            fontWeight: 300,
          }}
        >
          Mimi Mimos
        </h1>
        <p
          className="text-gradient-gold font-serif-luxury mt-4"
          style={{ fontSize: "clamp(1.5rem, 4vw, 3rem)", fontWeight: 400, letterSpacing: "0.02em" }}
        >
          Haute Parfumerie
        </p>
        <p className="text-muted-foreground text-sm leading-relaxed max-w-xl mx-auto mt-8">
          Fragrâncias importadas e árabes de alto padrão — curadas para quem valoriza a experiência olfativa acima de tudo.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-10">
          <button
            type="button"
            onClick={scrollToCatalog}
            className="btn-gold inline-flex items-center justify-center gap-2 px-8 py-3 rounded-full text-[0.65rem] uppercase tracking-[0.25em]"
          >
            Explorar Coleção <ArrowRight size={14} />
          </button>
          <button
            type="button"
            onClick={scrollToKit}
            className="inline-flex items-center justify-center gap-2 px-8 py-3 rounded-full text-[0.65rem] uppercase tracking-[0.25em] border border-border text-white hover:bg-white/5 transition-colors"
          >
            Consultoria Pessoal
          </button>
        </div>

        {/* Stats */}
        <div className="mt-16 flex items-center justify-center gap-6 sm:gap-16 text-center">
          <div>
            <p className="font-serif-luxury text-2xl sm:text-3xl text-gold-400">{displayCount}</p>
            <p className="text-[0.55rem] tracking-[0.3em] uppercase opacity-50 text-muted-foreground mt-2">
              Fragrâncias
            </p>
          </div>
          <div className="w-px h-10 bg-border" />
          <div>
            <p className="font-serif-luxury text-2xl sm:text-3xl text-gold-400">R${minPrice}</p>
            <p className="text-[0.55rem] tracking-[0.3em] uppercase opacity-50 text-muted-foreground mt-2">
              A partir de
            </p>
          </div>
          <div className="w-px h-10 bg-border" />
          <div>
            <p className="font-serif-luxury text-2xl sm:text-3xl text-gold-400">3×R$100</p>
            <p className="text-[0.55rem] tracking-[0.3em] uppercase opacity-50 text-muted-foreground mt-2">
              Decantes
            </p>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
        <ChevronDown size={20} className="text-gold-500 opacity-50" />
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
//  KIT SECTION — 3 decantes R$100, Economia R$19,97
// ═══════════════════════════════════════════════════════════
function KitSection() {
  const products = useStore((s) => s.products);
  const decantes = useMemo(
    () => products.filter((p) => p.category === "DECANTE"),
    [products],
  );
  const heroImg = decantes[0]?.image || "/perfumes/bc-312.jpg";

  const scrollToCatalog = () =>
    document.getElementById("colecao")?.scrollIntoView({ behavior: "smooth" });

  return (
    <section
      id="kit"
      className="relative bg-[#080808] py-24 px-6 lg:px-12 border-t border-border"
    >
      <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <p className="text-[0.6rem] tracking-[0.3em] uppercase opacity-50 text-muted-foreground mb-6">
            O Kit Exclusivo
          </p>
          <h2
            className="font-serif-luxury text-white leading-none"
            style={{ fontSize: "clamp(2.5rem, 6vw, 5rem)", letterSpacing: "-0.02em", fontWeight: 300 }}
          >
            3 decantes
            <br />
            <span className="text-gradient-gold">R$100</span>
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed mt-6 max-w-md">
            Monte seu kit com 3 decantes de 5ml por R$100 e economize R$19,97. A maneira ideal de descobrir novas fragrâncias antes de investir no frasco completo.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 mt-8">
            <button
              type="button"
              onClick={scrollToCatalog}
              className="btn-gold inline-flex items-center justify-center gap-2 px-8 py-3 rounded-full text-[0.65rem] uppercase tracking-[0.25em]"
            >
              Montar Meu Kit <ArrowRight size={14} />
            </button>
            <button
              type="button"
              onClick={scrollToCatalog}
              className="inline-flex items-center justify-center gap-2 px-8 py-3 rounded-full text-[0.65rem] uppercase tracking-[0.25em] border border-border text-white hover:bg-white/5 transition-colors"
            >
              Ver Todos os Decantes
            </button>
          </div>
        </div>
        <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-border">
          <img
            src={heroImg}
            alt="Kit de decantes"
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "/perfumes/bc-312.jpg";
            }}
          />
          <div className="absolute inset-0 product-scrim pointer-events-none" />
          <div className="absolute bottom-6 left-6 right-6">
            <p className="text-[0.55rem] tracking-[0.3em] uppercase opacity-70 text-gold-300 mb-2">
              Promoção Exclusiva
            </p>
            <p className="font-serif-luxury text-white text-2xl">Economia R$19,97</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
//  PRODUCT CARD — aspect-[3/4], product-scrim overlay
// ═══════════════════════════════════════════════════════════
function RocketProductCard({ perfume }: { perfume: Perfume }) {
  const addToCart = useStore((s) => s.addToCart);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const isFav = useStore((s) => s.favorites.includes(perfume.id));
  const addToCompare = useCompareStore((s) => s.addToCompare);
  const isInCompare = useCompareStore((s) => s.isInCompare(perfume.id));

  const openQuickView = () => {
    window.dispatchEvent(new CustomEvent("openSlideIn", { detail: perfume }));
  };

  const categoryLabel =
    perfume.category === "BRAND"
      ? "Brand Collection"
      : perfume.category === "AFEER"
        ? "Afeer"
        : perfume.category === "DECANTE"
          ? "Decante"
          : "";
  const genderLabel =
    perfume.gender === "MASCULINO"
      ? "Masculino"
      : perfume.gender === "FEMININO"
        ? "Feminino"
        : perfume.gender === "ARABE"
          ? "Árabe"
          : "Unissex";
  const isDecante = perfume.category === "DECANTE";
  const placeholder = `https://placehold.co/400x500/080808/d4af37?text=${encodeURIComponent(perfume.name.slice(0, 20))}`;

  return (
    <article
      className="hover-lift group relative overflow-hidden rounded-2xl border border-border bg-[#0c0c0c] cursor-pointer"
      onClick={openQuickView}
    >
      <div className="relative aspect-[3/4] overflow-hidden">
        <img
          src={perfume.image || placeholder}
          alt={perfume.name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          onError={(e) => {
            (e.target as HTMLImageElement).src = placeholder;
          }}
        />
        <div className="absolute inset-0 product-scrim pointer-events-none" />

        {/* Top-left: category + decante badge */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
          <span className="bg-black/60 backdrop-blur-md border border-border text-[0.5rem] tracking-[0.2em] uppercase text-gold-300 px-2 py-1 rounded-full">
            {categoryLabel}
          </span>
          {isDecante && (
            <span className="bg-gold-500 text-obsidian-950 text-[0.5rem] tracking-[0.2em] uppercase font-bold px-2 py-1 rounded-full w-fit">
              3×R$100
            </span>
          )}
        </div>

        {/* Top-right: fav + compare */}
        <div className="absolute top-3 right-3 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(perfume.id);
            }}
            className={`w-7 h-7 rounded-full backdrop-blur-md border flex items-center justify-center transition ${
              isFav
                ? "bg-red-500/20 text-red-400 border-red-400/50"
                : "bg-black/60 text-white border-border hover:text-gold-300"
            }`}
            aria-label="Favoritar"
          >
            <Heart size={12} className={isFav ? "fill-red-500" : ""} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              addToCompare(perfume.id);
            }}
            className={`w-7 h-7 rounded-full backdrop-blur-md border flex items-center justify-center transition ${
              isInCompare
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/50"
                : "bg-black/60 text-white border-border hover:text-gold-300"
            }`}
            aria-label="Comparar"
          >
            <GitCompareArrows size={12} />
          </button>
        </div>

        {/* Bottom overlay content */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <span className="text-[0.5rem] tracking-[0.3em] uppercase opacity-60 text-gold-300">
            {genderLabel}
          </span>
          <h3 className="font-serif-luxury text-white text-base mt-1 leading-tight line-clamp-1">
            {perfume.name}
          </h3>
          {perfume.inspiration && (
            <p className="text-[0.65rem] text-muted-foreground mt-1 line-clamp-1">
              {perfume.inspiration}
            </p>
          )}
          {perfume.tags && perfume.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {perfume.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="text-[0.5rem] tracking-[0.15em] uppercase text-muted-foreground/70 border border-border rounded-full px-1.5 py-0.5"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-end justify-between mt-3 gap-2">
            <div className="min-w-0">
              <p className="font-serif-luxury text-gold-400 text-lg leading-none">
                {formatBRL(perfume.price)}
              </p>
              <p className="text-[0.55rem] text-muted-foreground mt-1 truncate">
                {calcParcel(perfume.price)}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                addToCart(perfume);
              }}
              disabled={!perfume.inStock}
              className="btn-gold inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[0.55rem] uppercase tracking-[0.2em] disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <Plus size={10} /> Carrinho
            </button>
          </div>
          {!perfume.inStock && (
            <p className="text-[0.5rem] tracking-[0.2em] uppercase text-red-400 mt-2">
              Esgotado
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

// ═══════════════════════════════════════════════════════════
//  CATALOG — pill filters + responsive grid
// ═══════════════════════════════════════════════════════════
function Catalog() {
  const products = useStore((s) => s.products);
  const [activeCategory, setActiveCategory] = useState("all");

  const categories = useMemo(() => {
    const pills = [
      { id: "all", label: "Todos", count: products.length },
      { id: "BRAND", label: "Brand Collection", count: products.filter((p) => p.category === "BRAND").length },
      { id: "AFEER", label: "Afeer", count: products.filter((p) => p.category === "AFEER").length },
      { id: "DECANTE", label: "Decante", count: products.filter((p) => p.category === "DECANTE").length },
      { id: "FEMININO", label: "Feminino", count: products.filter((p) => p.gender === "FEMININO").length },
      { id: "MASCULINO", label: "Masculino", count: products.filter((p) => p.gender === "MASCULINO").length },
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
    <section
      id="colecao"
      className="relative bg-[#080808] py-24 px-6 lg:px-12 border-t border-border"
    >
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-[0.6rem] tracking-[0.3em] uppercase opacity-50 text-muted-foreground mb-4">
            Coleção Completa
          </p>
          <h2
            className="font-serif-luxury text-white"
            style={{ fontSize: "clamp(2.5rem, 6vw, 5rem)", letterSpacing: "-0.02em", fontWeight: 300 }}
          >
            Nossa <span className="text-gradient-gold">Coleção</span>
          </h2>
        </div>

        {/* Pill filters */}
        <div className="flex flex-wrap justify-center gap-2 mb-12">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[0.6rem] tracking-[0.2em] uppercase border transition-all ${
                activeCategory === cat.id
                  ? "bg-gold-500 text-obsidian-950 border-gold-500 font-bold"
                  : "border-border text-muted-foreground hover:text-white hover:border-gold-500/40"
              }`}
            >
              {cat.label}
              <span className={activeCategory === cat.id ? "opacity-70" : "opacity-50"}>
                ({cat.count})
              </span>
            </button>
          ))}
        </div>

        {/* Grid */}
        {products.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-[0.6rem] tracking-[0.3em] uppercase opacity-60">
              Carregando produtos do banco de dados...
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-[0.6rem] tracking-[0.3em] uppercase opacity-60">
              Nenhum produto encontrado.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
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
    <section className="relative bg-[#080808] py-24 px-6 lg:px-12 border-t border-border">
      <div className="max-w-2xl mx-auto text-center">
        <p className="text-[0.6rem] tracking-[0.3em] uppercase opacity-50 text-muted-foreground mb-4">
          Newsletter
        </p>
        <h2
          className="font-serif-luxury text-white"
          style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", letterSpacing: "-0.02em", fontWeight: 300 }}
        >
          Acesso <span className="text-gradient-gold">Exclusivo</span>
        </h2>
        <p className="text-muted-foreground text-sm leading-relaxed mt-4">
          Seja o primeiro a descobrir novas fragrâncias, edições limitadas e ofertas exclusivas da Mimi Mimos.
        </p>
        <form onSubmit={submit} className="mt-8 flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            required
            className="flex-1 bg-[#0c0c0c] border border-border rounded-full px-5 py-3 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-gold-500/50 transition-colors"
          />
          <button
            type="submit"
            className="btn-gold inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full text-[0.6rem] uppercase tracking-[0.2em] whitespace-nowrap"
          >
            {sent ? (
              <>
                <Check size={14} /> Inscrito
              </>
            ) : (
              <>
                Quero Acesso Exclusivo <ArrowRight size={14} />
              </>
            )}
          </button>
        </form>
        <p className="text-[0.55rem] tracking-[0.2em] uppercase opacity-40 text-muted-foreground mt-4">
          Seus dados estão seguros
        </p>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
//  FOOTER — dark, contact + Pix
// ═══════════════════════════════════════════════════════════
function RocketFooter() {
  const setCartOpen = useUI((s) => s.setCartOpen);
  return (
    <footer className="bg-[#080808] border-t border-border pt-16 pb-8 px-6 lg:px-12">
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-3 gap-12 mb-12">
          <div>
            <h3 className="font-serif-luxury text-white text-xl mb-3 leading-tight">
              Mimi Mimos
              <br />
              <span className="text-gradient-gold">Haute Parfumerie</span>
            </h3>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-xs">
              Fragrâncias importadas e árabes de alto padrão, curadas para a experiência olfativa mais refinada.
            </p>
          </div>
          <div>
            <p className="text-[0.6rem] tracking-[0.3em] uppercase opacity-50 text-muted-foreground mb-4">
              Navegação
            </p>
            <ul className="space-y-2.5">
              <li>
                <a href="#colecao" className="text-sm text-white/80 hover:text-gold-400 transition-colors">
                  Maison Collection
                </a>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setCartOpen(true)}
                  className="text-sm text-white/80 hover:text-gold-400 transition-colors"
                >
                  Panier
                </button>
              </li>
              <li>
                <a href="/admin" className="text-sm text-white/80 hover:text-gold-400 transition-colors">
                  Admin
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-[0.6rem] tracking-[0.3em] uppercase opacity-50 text-muted-foreground mb-4">
              Contato
            </p>
            <ul className="space-y-2.5 text-sm text-white/80">
              <li>+55 11 95854-6078</li>
              <li>
                <span className="block text-[0.55rem] tracking-[0.2em] uppercase opacity-50 text-muted-foreground mb-1">
                  Chave Pix
                </span>
                <span className="text-gold-400">fabiana@araujo.eu.org</span>
              </li>
            </ul>
          </div>
        </div>
        <div className="divider-gold mb-6" />
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
          <p className="text-[0.55rem] tracking-[0.2em] uppercase opacity-40 text-muted-foreground">
            © 2026 Mimi Mimos — Haute Parfumerie
          </p>
          <p className="text-[0.55rem] tracking-[0.2em] uppercase opacity-30 text-muted-foreground">
            STAGING · Página de Testes
          </p>
        </div>
      </div>
    </footer>
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

      {/* STAGING badge — keep at very top */}
      <div className="fixed top-0 left-0 right-0 z-[100] bg-red-600 text-white text-center text-[9px] py-0.5 uppercase tracking-widest font-bold">
        ⚠ STAGING — Página de Testes ·{" "}
        <a href="/" className="underline">
          Voltar à Loja
        </a>
      </div>

      <MarqueeBar />
      <RocketHeader />

      <main className="bg-[#080808]">
        <RocketHero />
        <KitSection />
        <Catalog />
        <Newsletter />
      </main>

      <RocketFooter />

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

// ═══════════════════════════════════════════════════════════
//  ROCKET-SITE INSPIRED CSS — injected via <style> tag
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

.grain-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.03;
  z-index: 1;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' /></filter><rect width='100%25' height='100%25' filter='url(%23n)' /></svg>");
}
`;
