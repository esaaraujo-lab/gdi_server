import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllSlugs, findPerfumeBySlug } from "@/lib/slug";
import { formatBRL } from "@/lib/pix";
import PerfumeDetailClient from "@/components/luxury/PerfumeDetailClient";

/**
 * /perfume/[slug] — dynamic product page with full SEO.
 *
 * - generateStaticParams: pre-render all known slugs at build time
 * - generateMetadata: dynamic title/description/OG/Twitter/robots
 * - PerfumePage: server component that finds the perfume, emits JSON-LD
 *   Product schema (rich results), and renders the interactive client.
 */

interface PageProps {
  params: Promise<{ slug: string }>;
}

/** Pre-render every known perfume slug at build time. */
export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

/** Dynamic metadata for SEO / social sharing. */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const perfume = findPerfumeBySlug(slug);
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
  const perfume = findPerfumeBySlug(slug);
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
