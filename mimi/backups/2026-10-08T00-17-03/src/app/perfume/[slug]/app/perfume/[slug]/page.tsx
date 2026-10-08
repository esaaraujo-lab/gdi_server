import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  INITIAL_PRODUCTS,
  type Perfume,
} from "@/lib/perfumes";
import {
  generateSlug,
  findPerfumeBySlug,
  getAllSlugs,
} from "@/lib/slug";
import PerfumeDetailClient from "@/components/luxury/PerfumeDetailClient";

/**
 * Página de detalhe de perfume (SEO-friendly).
 *
 * URL: /perfume/[slug]
 *
 * Slug format:
 *  - Brand Collection: brand-collection-{number}-{perfume-name}
 *  - Afeer: afeer-{number}-{perfume-name}
 *  - Decante: decante-{number}-{perfume-name}
 *
 * Static generation (SSG): todas as 45 páginas são pré-renderizadas
 * no build via generateStaticParams. Isso significa que cada perfume
 * tem uma URL própria indexável pelo Google.
 *
 * SEO: metadata dinâmica + JSON-LD structured data (Product schema).
 *
 * Next.js 16+: `params` é uma Promise e deve ser aguardada com `await`.
 */

const SITE_URL = "https://mimi-mimos.pages.dev";

/** Static generation — pre-renderiza todas as páginas de perfume no build. */
export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

/** Metadata dinâmica por perfume — title, description, OG, Twitter. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const perfume = findPerfumeBySlug(slug);
  if (!perfume) {
    return {
      title: "Perfume não encontrado | Mimi Mimos",
      description: "Este perfume não está disponível no catálogo.",
    };
  }

  const title = `${perfume.name} — inspirado em ${perfume.inspiration} | Mimi Mimos`;
  const description = `${perfume.name}: ${perfume.description.slice(0, 140)}${
    perfume.description.length > 140 ? "..." : ""
  } Compre agora via Pix com frete grátis acima de R$ 100.`;
  const perfumeSlug = generateSlug(perfume);
  const url = `${SITE_URL}/perfume/${perfumeSlug}`;

  return {
    title,
    description,
    keywords: [
      perfume.name,
      perfume.inspiration,
      perfume.family,
      perfume.category === "BRAND"
        ? "Brand Collection 25ml"
        : perfume.category === "AFEER"
        ? "Miniatura Afeer"
        : "Decante 5ml",
      "perfume importado",
      "perfume árabe",
      "Mimi Mimos",
      ...perfume.tags,
    ],
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: "Mimi Mimos",
      images: [
        {
          url: perfume.image,
          width: 500,
          height: 500,
          alt: `${perfume.name} — inspirado em ${perfume.inspiration}`,
        },
      ],
      locale: "pt_BR",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [perfume.image],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
  };
}

/** Página de detalhe de perfume. */
export default async function PerfumePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const perfume = findPerfumeBySlug(slug);

  if (!perfume) {
    notFound();
  }

  // JSON-LD structured data — Product schema (melhora SEO no Google)
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: perfume.name,
    description: perfume.description,
    image: perfume.image,
    sku: perfume.code,
    brand: {
      "@type": "Brand",
      name:
        perfume.category === "BRAND"
          ? "Mimi Mimos Brand Collection"
          : perfume.category === "AFEER"
          ? "Afeer"
          : "Mimi Mimos Decantes",
    },
    category: perfume.family,
    offers: {
      "@type": "Offer",
      url: `${SITE_URL}/perfume/${generateSlug(perfume)}`,
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
      reviewCount: perfume.reviewCount,
      bestRating: "5",
      worstRating: "1",
    },
  };

  // Sanitize JSON-LD — escape </script> to prevent XSS injection
  const jsonLdString = JSON.stringify(jsonLd).replace(/</g, "\\u003c");

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString }}
      />
      <PerfumeDetailClient perfume={perfume} />
    </>
  );
}
