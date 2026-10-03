import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatBRL } from "@/lib/pix";
import PerfumeDetailClient from "@/components/luxury/PerfumeDetailClient";
import type { Perfume } from "@/lib/perfumes";

// Force dynamic rendering — pages always fetch fresh data from D1 at request
// time. No hardcoded products, no build-time caching.
export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * /perfume/[slug] — dynamic product page with full SEO.
 *
 * ALL data comes from D1 (Cloudflare database). No hardcoded products.
 * Admin changes (add/edit/delete) reflect immediately on these pages.
 *
 * Data flow:
 *  1. fetchProductFromD1(slug) → GET /api/db/products → find by slug match
 *  2. generateMetadata uses D1 data for SEO title/description/OG
 *  3. PerfumePage renders JSON-LD + PerfumeDetailClient with D1 data
 *  4. PerfumeDetailClient also merges from Zustand store (D1-synced)
 */

interface PageProps {
  params: Promise<{ slug: string }>;
}

/** Generate slug from a product (same logic as slug.ts, no hardcoded dependency). */
function generateSlugFromProduct(p: Record<string, unknown>): string {
  const code = String(p.code || "");
  const name = String(p.name || "");
  const category = String(p.category || "BRAND");
  const prefix =
    category === "BRAND" ? "brand-collection"
    : category === "AFEER" ? "afeer"
    : category === "DECANTE" ? "decante"
    : "perfume";
  const token = (code.match(/\d+/) || [""])[0];
  const nameSlug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return [prefix, token, nameSlug].filter(Boolean).join("-");
}

/**
 * Fetch product from D1 by slug. NO hardcoded fallback.
 * Returns undefined if product not found in D1.
 */
async function fetchProductFromD1(slug: string): Promise<Perfume | undefined> {
  try {
    const res = await fetch("https://mimi-mimos.pages.dev/api/db/products", {
      method: "GET",
    });
    if (!res.ok) return undefined;
    const data = await res.json();
    if (!data?.success || !Array.isArray(data.products)) return undefined;
    // Find the product whose generated slug matches the requested slug
    const product = data.products.find(
      (p: Record<string, unknown>) => generateSlugFromProduct(p) === slug
    );
    return product as Perfume | undefined;
  } catch {
    return undefined;
  }
}

/** Dynamic metadata for SEO / social sharing. */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const perfume = await fetchProductFromD1(slug);
  if (!perfume) {
    return {
      title: "Perfume não encontrado | Mimi Mimos",
      robots: { index: false, follow: false },
    };
  }
  const title = `${perfume.name} — Inspirado em ${perfume.inspiration} | Mimi Mimos`;
  const description =
    perfume.description ||
    `${perfume.name} — Brand Collection 25ml inspirado em ${perfume.inspiration}. ${perfume.family}. Preço: ${formatBRL(perfume.price)}.`;
  const url = `/perfume/${slug}`;

  return {
    title,
    description,
    keywords: [
      perfume.name,
      perfume.inspiration,
      perfume.family,
      "perfume importado",
      "Brand Collection",
      "25ml",
      "Mimi Mimos",
      ...(perfume.tags || []),
    ],
    authors: [{ name: "Mimi Mimos" }],
    alternates: { canonical: url },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large" },
    },
    openGraph: {
      type: "website",
      url,
      title,
      description,
      siteName: "Mimi Mimos",
      locale: "pt_BR",
      images: [
        {
          url: perfume.image,
          width: 1024,
          height: 1024,
          alt: `${perfume.name} — frasco de perfume`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [perfume.image],
    },
  };
}

/** Build JSON-LD Product schema for rich results. */
function buildProductJsonLd(
  perfume: NonNullable<ReturnType<typeof findPerfumeBySlug>>
) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: perfume.name,
    description:
      perfume.description ||
      `${perfume.name} — Brand Collection 25ml inspirado em ${perfume.inspiration}.`,
    image: [perfume.image, ...(perfume.images || [])].filter(Boolean),
    sku: perfume.code,
    mpn: perfume.code,
    brand: {
      "@type": "Brand",
      name: "Mimi Mimos",
    },
    category: perfume.family || "Perfume",
    offers: {
      "@type": "Offer",
      url: `/perfume/${perfume.id}`,
      priceCurrency: "BRL",
      price: perfume.price.toFixed(2),
      availability: perfume.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: {
        "@type": "Organization",
        name: "Mimi Mimos",
      },
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: perfume.rating.toFixed(1),
      reviewCount: String(perfume.reviewCount || 1),
      bestRating: "5",
      worstRating: "1",
    },
  };
}

export default async function PerfumePage({ params }: PageProps) {
  const { slug } = await params;
  const perfume = await fetchProductFromD1(slug);
  if (!perfume) {
    notFound();
  }

  const jsonLd = buildProductJsonLd(perfume);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PerfumeDetailClient perfume={perfume} />
    </>
  );
}
