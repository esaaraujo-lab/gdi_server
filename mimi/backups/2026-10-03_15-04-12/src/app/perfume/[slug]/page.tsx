import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findPerfumeBySlug } from "@/lib/slug";
import { formatBRL } from "@/lib/pix";
import PerfumeDetailClient from "@/components/luxury/PerfumeDetailClient";
import type { Perfume } from "@/lib/perfumes";

// Force dynamic rendering so pages always fetch fresh data from D1 at request
// time (not cached build-time HTML). This ensures admin changes reflect immediately.
export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * /perfume/[slug] — dynamic product page with full SEO.
 *
 * Data flow:
 *  - generateMetadata + PerfumePage: at runtime, fetch the LATEST product
 *    data from D1 (so admin changes reflect in SEO metadata + JSON-LD).
 *    Falls back to INITIAL_PRODUCTS if D1 fetch fails.
 *  - PerfumeDetailClient (client component): also merges D1 data from the
 *    Zustand store on mount, so the interactive UI always shows latest data.
 *
 * Note: generateStaticParams removed — pages are now rendered on-demand
 * (force-dynamic) so they always show the latest D1 data.
 */

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Fetch the latest product data from D1 at runtime.
 * Falls back to INITIAL_PRODUCTS (hardcoded) if D1 is unreachable.
 */
async function fetchProductFromD1(slug: string): Promise<Perfume | undefined> {
  // First, find the product ID from the hardcoded list (slug → product mapping)
  const hardcoded = findPerfumeBySlug(slug);
  if (!hardcoded) return undefined;

  try {
    // Fetch all products from D1 and find the one matching this slug's ID
    const res = await fetch("https://mimi-mimos.pages.dev/api/db/products", {
      method: "GET",
      // Cache for 60 seconds to balance freshness vs performance
      next: { revalidate: 60 },
    });
    if (!res.ok) return hardcoded;
    const data = await res.json();
    if (!data?.success || !Array.isArray(data.products)) return hardcoded;
    const d1Product = data.products.find((p: Record<string, unknown>) => p.id === hardcoded.id);
    return d1Product ? (d1Product as Perfume) : hardcoded;
  } catch {
    return hardcoded;
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
