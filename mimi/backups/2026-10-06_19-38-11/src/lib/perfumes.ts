export type ProductCategory = "BRAND" | "AFEER" | "DECANTE";
export type ProductGender = "MASCULINO" | "FEMININO" | "ARABE" | "UNISSEX";

export interface Perfume {
  id: string;
  code: string; // ex: "#001", "AF-01", "DEC-01"
  name: string;
  inspiration: string;
  category: ProductCategory;
  gender: ProductGender;
  price: number;
  inStock: boolean;
  image: string;
  tags: string[];
  notesTopo: string;
  notesCoracao: string;
  notesFundo: string;
  // Rich fields (with defaults for backward compat)
  description: string;
  family: string;
  intensity: string;
  fixation: string;
  rating: number;
  reviewCount: number;
  season: string;
  occasion: string;
  // Inventory + gallery (added in task 52-A)
  stockQty: number;
  images?: string[];
}

export const DEFAULT_PRICE_BRAND = 69.99;
export const DEFAULT_PRICE_AFEER = 79.99;
export const DEFAULT_PRICE_DECANTE = 39.99;

export const CATEGORY_LABELS: Record<string, string> = {
  all: "Todas as Coleções",
  BRAND: "💎 Brand Collection 25ml",
  AFEER: "🌙 Miniaturas Árabes Afeer",
  DECANTE: "🧪 Decantes 5ml",
  FEMININO: "👑 Feminino",
  MASCULINO: "⚡ Masculino",
  UNISSEX: "✨ Unissex & Árabe",
};

export const CATEGORY_BADGE: Record<ProductCategory, string> = {
  BRAND: "BRAND 25ML",
  AFEER: "MINIATURA AFEER",
  DECANTE: "DECANTE 5ML",
};

// Imagens Unsplash curadas para perfumes de luxo (legado — usadas só como fallback)
const IMG = {
  dark: "https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=500&auto=format&fit=crop&q=80",
  gold: "https://images.unsplash.com/photo-1615397349754-cfa2066a298e?w=500&auto=format&fit=crop&q=80",
  red: "https://images.unsplash.com/photo-1588405748880-12d1d2a59f75?w=500&auto=format&fit=crop&q=80",
  ornate: "https://images.unsplash.com/photo-1547887537-6158d64c35b3?w=500&auto=format&fit=crop&q=80",
  honey: "https://images.unsplash.com/photo-1594035910387-fea47794261f?w=500&auto=format&fit=crop&q=80",
  perfume: "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=500&auto=format&fit=crop&q=80",
  decante: "https://images.unsplash.com/photo-1616949755610-8c9bbc08f138?w=500&auto=format&fit=crop&q=80",
};

// ═══════════════════════════════════════════════════════════
//  Image hosting strategy (dual approach):
//  1. jsDelivr CDN (primary) — hides GitHub URL, fast global CDN
//  2. Local /img/ fallback (if image copied to project)
//  3. Placeholder with perfume name (last resort — handled by SkeletonImage)
// ═══════════════════════════════════════════════════════════

/** Hash determinístico do ID (sem Math.random — evita hydration mismatch). */
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function brand(
  id: string,
  code: string,
  name: string,
  inspiration: string,
  gender: ProductGender,
  image: string,
  tags: string[],
  topNotes: string,
  heartNotes: string,
  baseNotes: string,
  extra?: Partial<Perfume>
): Perfume {
  return {
    id,
    code,
    name,
    inspiration,
    category: "BRAND",
    gender,
    price: DEFAULT_PRICE_BRAND,
    inStock: true,
    image,
    tags,
    notesTopo: topNotes,
    notesCoracao: heartNotes,
    notesFundo: baseNotes,
    description:
      extra?.description ||
      `${name} — inspirado em ${inspiration}. Fragrância Brand Collection 25ml com alta fixação.`,
    family: extra?.family || tags[0] || "Floral Amadeirado",
    intensity: extra?.intensity || "Eau de Parfum",
    fixation: extra?.fixation || "Até 8h",
    rating: extra?.rating ?? 4.7 + (hashId(id) % 4) / 10,
    reviewCount: extra?.reviewCount ?? 40 + (hashId(id) % 180),
    season: extra?.season || "Dia-Noite / O ano todo",
    occasion: extra?.occasion || "Casual, Eventos, Uso diário",
    stockQty: extra?.stockQty ?? 10,
    images: extra?.images,
  };
}

function afeer(
  id: string,
  code: string,
  name: string,
  inspiration: string,
  image: string,
  tags: string[],
  topNotes: string,
  heartNotes: string,
  baseNotes: string,
  extra?: Partial<Perfume>
): Perfume {
  return {
    id,
    code,
    name,
    inspiration,
    category: "AFEER",
    gender: extra?.gender || "ARABE",
    price: DEFAULT_PRICE_AFEER,
    inStock: true,
    image,
    tags,
    notesTopo: topNotes,
    notesCoracao: heartNotes,
    notesFundo: baseNotes,
    description:
      extra?.description ||
      `${name} — miniatura árabe Afeer inspirada em ${inspiration}. Compacta e potente.`,
    family: extra?.family || "Oriental Árabe",
    intensity: extra?.intensity || "Extrait de Parfum",
    fixation: extra?.fixation || "até 8h",
    rating: extra?.rating ?? 4.8 + (hashId(id) % 3) / 10,
    reviewCount: extra?.reviewCount ?? 30 + (hashId(id) % 120),
    season: extra?.season || "Noite / Outono-Inverno",
    occasion: extra?.occasion || "Eventos, Ocasiões especiais",
    stockQty: extra?.stockQty ?? 10,
    images: extra?.images,
  };
}

function decante(
  id: string,
  code: string,
  name: string,
  inspiration: string,
  image: string,
  tags: string[],
  topNotes: string,
  heartNotes: string,
  baseNotes: string,
  extra?: Partial<Perfume>
): Perfume {
  const gender = extra?.gender || "ARABE";
  return {
    id,
    code,
    name,
    inspiration,
    category: "DECANTE",
    gender,
    price: DEFAULT_PRICE_DECANTE,
    inStock: true,
    image,
    tags,
    notesTopo: topNotes,
    notesCoracao: heartNotes,
    notesFundo: baseNotes,
    description:
      extra?.description ||
      `Decante 5ml de ${inspiration}. Experimente o luxo antes do frasco completo. Promo: 3 por R$ 100!`,
    family: extra?.family || "Nicho",
    intensity: extra?.intensity || "Eau de Parfum",
    fixation: extra?.fixation || "até 8h",
    rating: extra?.rating ?? 4.6,
    reviewCount: extra?.reviewCount ?? 20 + (hashId(id) % 80),
    season: extra?.season || "Dia-Noite / O ano todo",
    occasion: extra?.occasion || "Experimentação, Viagens",
    stockQty: extra?.stockQty ?? 10,
    images: extra?.images,
  };
}

// Notas para filtro (gerado dinamicamente das tags + notas olfativas)
export const NOTE_FILTERS = [
  "Baunilha",
  "Oud",
  "Rosa",
  "Jasmim",
  "Âmbar",
  "Couro",
  "Cítrico",
  "Patchouli",
  "Sândalo",
  "Mel",
  "Canela",
  "Lavanda",
];

// Preço default para o hero (Brand Collection)
export const DEFAULT_PRICE = DEFAULT_PRICE_BRAND;
