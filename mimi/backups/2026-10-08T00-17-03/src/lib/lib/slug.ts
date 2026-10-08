import type { Perfume } from "./perfumes";
import { INITIAL_PRODUCTS } from "./perfumes";

/**
 * Geração de slugs SEO-friendly para perfumes.
 *
 * Formato:
 * - Brand Collection: `brand-collection-{number}-{perfume-name}`
 *   Ex: bc-001 "Allure Homme Sport" → "brand-collection-001-allure-homme-sport"
 * - Afeer: `afeer-{number}-{perfume-name}`
 *   Ex: af-01 "Afeer Atheeri Abelhinha" → "afeer-01-atheeri-abelhinha"
 * - Decante: `decante-{number}-{perfume-name}`
 *   Ex: dec-01 "Decante Bareeq Al Dahab (5ml)" → "decante-01-bareeq-al-dahab"
 *
 * Sanitização:
 *  - Remove acentos (á→a, ç→c, etc.)
 *  - Lowercase
 *  - Hífens no lugar de espaços
 *  - Remove caracteres especiais (', (, ), ", etc.)
 *  - Remove prefixos redundantes ("Afeer", "Decante") para evitar duplicação
 *  - Remove sufixos redundantes ("(5ml)", "(10ml)")
 */

/** Sanitiza uma string para uso em URL slug. */
function sanitize(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[''""`]/g, "") // remove aspas
    .replace(/\(.*?\)/g, "") // remove parênteses e conteúdo (5ml)
    .replace(/[^a-z0-9\s-]/g, "") // remove especiais, mantém letras/números/espaços/hífens
    .trim()
    .replace(/\s+/g, "-") // espaços → hífens
    .replace(/-+/g, "-") // hífens múltiplos → único
    .replace(/^-|-$/g, ""); // remove hífens das bordas
}

/** Extrai o número do perfume a partir do código (ex: "#001" → "001", "AF-01" → "01"). */
function extractNumber(code: string): string {
  const match = code.match(/(\d+)/);
  return match ? match[1].padStart(2, "0") : "00";
}

/** Remove prefixos redundantes do nome (ex: "Afeer Atheeri" → "Atheeri"). */
function cleanName(name: string, category: Perfume["category"]): string {
  let cleaned = name;
  if (category === "AFEER" && cleaned.toLowerCase().startsWith("afeer ")) {
    cleaned = cleaned.slice(6);
  }
  if (category === "DECANTE" && cleaned.toLowerCase().startsWith("decante ")) {
    cleaned = cleaned.slice(8);
  }
  return cleaned;
}

/** Gera o slug SEO-friendly para um perfume. */
export function generateSlug(perfume: Perfume): string {
  const number = extractNumber(perfume.code);
  const name = cleanName(perfume.name, perfume.category);
  const sanitizedName = sanitize(name);

  const prefix =
    perfume.category === "BRAND"
      ? "brand-collection"
      : perfume.category === "AFEER"
      ? "afeer"
      : "decante";

  return `${prefix}-${number}-${sanitizedName}`;
}

/** Busca um perfume pelo slug (procura em INITIAL_PRODUCTS). */
export function findPerfumeBySlug(slug: string): Perfume | undefined {
  return INITIAL_PRODUCTS.find((p) => generateSlug(p) === slug);
}

/** Gera todos os slugs possíveis (para generateStaticParams). */
export function getAllSlugs(): string[] {
  return INITIAL_PRODUCTS.map((p) => generateSlug(p));
}

/** Gera a URL completa para um perfume (para links internos). */
export function getPerfumeUrl(perfume: Perfume): string {
  return `/perfume/${generateSlug(perfume)}`;
}
