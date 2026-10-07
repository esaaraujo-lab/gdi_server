import type { Perfume } from "./perfumes";

/**
 * Slug utilities — generate SEO-friendly URLs for perfumes.
 *
 * Format examples:
 *  - brand-collection-005-gold-1-million
 *  - afeer-01-atheeri-abelhinha
 *  - decante-01-qaed-al-fursan
 *
 * Slug is built from the perfume code (normalized to digits/letters) + name,
 * with accents stripped and special chars removed.
 *
 * NOTE: This file does NOT import INITIAL_PRODUCTS. Slugs are generated
 * purely from product fields (code, name, category). Product data is fetched
 * from D1 at runtime — no hardcoded dependency.
 */

/** Strip accents (á → a, ã → a, ç → c, etc.) and lowercase. */
function stripAccents(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Sanitize a string for use in a slug:
 *  - lowercase
 *  - strip accents
 *  - replace any non [a-z0-9] sequence with a single hyphen
 *  - trim leading/trailing hyphens
 */
function sanitizeSlug(input: string): string {
  return stripAccents(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Extract the numeric/alpha portion from a perfume code like "#005" or "AF-01". */
function codeToSlugToken(code: string): string {
  // "#005" → "005" | "AF-01" → "01" | "DEC-14" → "14"
  const match = code.match(/([A-Za-z]*)[-#]?(\d+)/);
  if (!match) return sanitizeSlugToken(code);
  // ignore prefix (we already know the collection from category)
  return match[2];
}

/** Sanitize a token (single slug segment) — preserve alphanumerics only. */
function sanitizeSlugToken(input: string): string {
  return stripAccents(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Map ProductCategory to slug prefix. */
function categoryPrefix(category: Perfume["category"]): string {
  switch (category) {
    case "BRAND":
      return "brand-collection";
    case "AFEER":
      return "afeer";
    case "DECANTE":
      return "decante";
    default:
      return "perfume";
  }
}

/**
 * Build a SEO-friendly slug for a perfume.
 *
 * @example
 * generateSlug({ code: "#005", name: "Gold 1 Million", category: "BRAND" })
 * // → "brand-collection-005-gold-1-million"
 */
export function generateSlug(perfume: Pick<Perfume, "code" | "name" | "category">): string {
  const prefix = categoryPrefix(perfume.category);
  const token = codeToSlugToken(perfume.code);
  const name = sanitizeSlug(perfume.name);
  // Build "prefix-token-name" (e.g. brand-collection-005-gold-1-million)
  return [prefix, token, name].filter(Boolean).join("-");
}

/** Return the canonical URL path for a perfume (`/perfume/{slug}`). */
export function getPerfumeUrl(perfume: Pick<Perfume, "code" | "name" | "category" | "id">): string {
  return `/perfume/${generateSlug(perfume)}`;
}

// NOTE: findPerfumeBySlug() and getAllSlugs() have been REMOVED.
// They previously read from INITIAL_PRODUCTS (hardcoded). Now, product lookup
// by slug is done via D1 fetch in /perfume/[slug]/page.tsx (fetchProductFromD1).

/**
 * Generic slugify — converts any string to a URL-safe slug.
 * Used by brands API and other places that need slug generation.
 *
 * @example slugify("Aerin") → "aerin"
 * @example slugify("Dior Homme") → "dior-homme"
 */
export function slugify(input: string): string {
  return stripAccents(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
