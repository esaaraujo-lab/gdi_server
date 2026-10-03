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
const CDN_IMG = "https://cdn.jsdelivr.net/gh/esaaraujo-lab/gdi_server@main/mimi/upload_images/";

/** Brand Collection / Afeer image (jpeg fallback when no .webp exists). */
function githubImg(code: string): string {
  return `${CDN_IMG}${code}.jpeg`;
}

/** Brand Collection / Afeer image (.webp preferred for better compression). */
function githubImgWebp(code: string): string {
  return `${CDN_IMG}${code}.webp`;
}

/** Decante image by gender (3 generic bottles, one per gender bucket). */
function githubDecanteByGender(gender: string): string {
  if (gender === "MASCULINO") return `${CDN_IMG}dec-masc-01.jpg`;
  if (gender === "FEMININO") return `${CDN_IMG}dec-fem-01.jpg`;
  return `${CDN_IMG}dec-uni.jpg`;
}

/** Optional gallery of extra angles for products with multiple images. */
function githubImgGallery(code: string): string[] {
  if (code === "bc-176") return [`${CDN_IMG}bc-176-2.webp`];
  if (code === "bc-203") return [`${CDN_IMG}bc-203.1.webp`];
  return [];
}

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
    fixation: extra?.fixation || "10h+",
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
    fixation: extra?.fixation || "8 a 10h",
    rating: extra?.rating ?? 4.6,
    reviewCount: extra?.reviewCount ?? 20 + (hashId(id) % 80),
    season: extra?.season || "Dia-Noite / O ano todo",
    occasion: extra?.occasion || "Experimentação, Viagens",
    stockQty: extra?.stockQty ?? 10,
    images: extra?.images,
  };
}

export const INITIAL_PRODUCTS: Perfume[] = [
  // ═══════════════════════════════════════════════════════════
  //  BRAND COLLECTION (25ml / R$ 69,99) — 26 produtos com imagem no GitHub
  // ═══════════════════════════════════════════════════════════
  brand("bc-005", "#005", "Gold 1 Million", "1 Million - Paco Rabanne", "MASCULINO", githubImgWebp("bc-005"),
    ["Canela", "Couro", "Âmbar"],
    "Menta piperita, Mandarina sangrenta, Toranja",
    "Rosa, Canela, Especiarias",
    "Couro, Âmbar, Notas amadeiradas, Patchouli",
    { family: "Amadeirado Especiado" }),
  brand("bc-007", "#007", "I Love J'adore", "J'adore - Dior", "FEMININO", `${CDN_IMG}bc-007.png`,
    ["Floral", "Frutado", "Jasmim"],
    "Pêra, Melão, Magnólia, Pêssego, Mandarina, Bergamota",
    "Jasmim, Lírio-do-vale, Tuberosa, Freesia, Rosa, Orquídea, Ameixa",
    "Almíscar, Baunilha, Cedro, Amora",
    { family: "Floral Frutado" }),
  brand("bc-021", "#021", "Coco Mademoiselle", "Coco Mademoiselle - Chanel", "FEMININO", githubImgWebp("bc-021"),
    ["Cítrico", "Rosa", "Patchouli"],
    "Laranja, Mandarina, Bergamota, Flor de Laranjeira",
    "Jasmim, Rosa turca, Ylang-Ylang, Mimosa",
    "Patchouli, Almíscar branco, Baunilha, Fava Tonka, Vetiver, Opoponax",
    { rating: 4.9, reviewCount: 203, family: "Âmbar Floral" }),
  brand("bc-027", "#027", "Hypnotic Poison Apple", "Hypnotic Poison - Dior", "FEMININO", githubImgWebp("bc-027"),
    ["Amêndoa", "Baunilha", "Coco"],
    "Coco, Ameixa, Damasco",
    "Tuberosa, Jasmim, Lírio-do-vale, Rosa, Pau-Brasil, Alcarávia",
    "Baunilha, Amêndoa, Sândalo, Almíscar",
    { family: "Âmbar Baunilha" }),
  brand("bc-034", "#034", "212 VIP Rosé", "212 VIP Rosé - Carolina Herrera", "FEMININO", githubImgWebp("bc-034"),
    ["Champagne", "Pêssego", "Sensual"],
    "Champanhe Rosé, Notas Frutadas",
    "Flor de Pêssego",
    "Almíscar branco, Notas amadeiradas, Âmbar",
    { family: "Floral Frutado", inStock: false }),
  brand("bc-060", "#060", "Cloud Pink", "Cloud - Ariana Grande", "FEMININO", githubImgWebp("bc-060"),
    ["Lavanda", "Pralinê", "Gourmand"],
    "Lavanda, Pêra, Bergamota",
    "Chantilly, Pralinê, Coco, Orquídea de Baunilha",
    "Almíscar, Notas amadeiradas",
    { family: "Floral Frutado Gourmand" }),
  brand("bc-093", "#093", "Dior Homme Intense", "Dior Homme Intense - Dior", "MASCULINO", githubImgWebp("bc-093"),
    ["Lavanda", "Íris", "Amadeirado"],
    "Lavanda",
    "Íris, Ambreta, Pêra",
    "Cedro da Virgínia, Vetiver",
    { family: "Amadeirado Floral Almiscarado" }),
  brand("bc-099", "#099", "La Nuit de L'Homme", "La Nuit de L'Homme - Yves Saint Laurent", "MASCULINO", githubImg("bc-099"),
    ["Cardamomo", "Lavanda", "Especiado"],
    "Cardamomo",
    "Lavanda, Cedro da Virgínia, Bergamota",
    "Vetiver, Alcarávia",
    { family: "Amadeirado Especiado" }),
  brand("bc-105", "#105", "Lady Diamond Million", "Lady Million - Paco Rabanne", "FEMININO", githubImgWebp("bc-105"),
    ["Mel", "Flor de Laranjeira", "Framboesa"],
    "Framboesa, Neroli, Limão de Amalfi",
    "Jasmim, Flor de Laranjeira africana, Gardênia",
    "Mel branco, Patchouli, Âmbar",
    { family: "Floral Frutado" }),
  brand("bc-116", "#116", "Invictus Victory", "Invictus - Paco Rabanne", "MASCULINO", githubImgWebp("bc-116"),
    ["Marinho", "Toranja", "Louro"],
    "Notas Marinhas, Toranja, Mandarina",
    "Folha de Louro, Jasmim",
    "Ambergris, Madeira Guaiac, Musgo de Carvalho",
    { family: "Amadeirado Aquático" }),
  brand("bc-126", "#126", "Good Girl Stiletto", "Good Girl - Carolina Herrera", "FEMININO", githubImgWebp("bc-126"),
    ["Tuberosa", "Cacau", "Fava Tonka"],
    "Amêndoa, Café, Bergamota, Limão",
    "Tuberosa, Jasmim Sambac, Flor de Laranjeira, Orris, Rosa Bulgária",
    "Fava Tonka, Cacau, Baunilha, Pralinê, Sândalo, Almíscar, Âmbar, Cedro",
    { rating: 4.8, reviewCount: 167, family: "Âmbar Floral" }),
  brand("bc-132", "#132", "Fantasy Bloom", "Fantasy - Britney Spears", "FEMININO", githubImg("bc-132"),
    ["Chocolate", "Lichia", "Gourmand"],
    "Kiwi, Lichia vermelha, Membrilo",
    "Chocolate branco, Cupcake, Orquídea, Jasmim",
    "Almíscar, Raíz de Orris, Notas amadeiradas",
    { family: "Floral Frutado Gourmand" }),
  brand("bc-136", "#136", "Scandal Honey", "Scandal - Jean Paul Gaultier", "FEMININO", githubImgWebp("bc-136"),
    ["Mel", "Gardênia", "Patchouli"],
    "Laranja sangrenta, Mandarina",
    "Mel, Gardênia, Jasmim, Flor de Laranjeira, Pêssego",
    "Cera de Abelha, Caramelo, Patchouli, Regaliz",
    { family: "Chypre Floral" }),
  brand("bc-151", "#151", "Royal Favourite", "Bad Boy - Carolina Herrera", "MASCULINO", githubImgWebp("bc-151"),
    ["Pimenta", "Cedro", "Cacau"],
    "Pimenta preta, Pimenta branca, Bergamota verde",
    "Cedro, Sálvia",
    "Fava Tonka, Cacau, Madeira de Âmbar",
    { family: "Âmbar Especiado" }),
  brand("bc-153", "#153", "Le Male Couture", "Le Male - Jean Paul Gaultier", "MASCULINO", githubImgWebp("bc-153"),
    ["Lavanda", "Baunilha", "Fougère"],
    "Lavanda, Menta, Cardamomo, Bergamota, Artemísia",
    "Canela, Flor de Laranjeira, Alcarávia",
    "Baunilha, Fava Tonka, Âmbar, Sândalo, Cedro",
    { family: "Âmbar Fougère" }),
  brand("bc-171", "#171", "Classique Couture", "Classique - Jean Paul Gaultier", "FEMININO", githubImgWebp("bc-171"),
    ["Flor de Laranjeira", "Rosa", "Âmbar"],
    "Flor de Laranjeira, Anis estrelado, Rosa, Mandarina, Pêra, Bergamota",
    "Ylang-Ylang, Gengibre, Orquídea, Íris, Tuberosa, Ameixa",
    "Baunilha, Âmbar, Almíscar, Canela, Sândalo",
    { family: "Âmbar Floral" }),
  brand("bc-176", "#176", "L'Eau d'Issey", "L'Eau d'Issey - Issey Miyake", "FEMININO", githubImgWebp("bc-176"),
    ["Lótus", "Aquático", "Frescor"],
    "Lótus, Freesia, Ciclame, Água de Rosas, Melão, Calone, Rosa",
    "Lírio, Lírio-do-vale, Peônia aquática, Cravo",
    "Exótico Wood, Tuberosa, Âmbar, Sândalo, Almíscar, Cedro",
    { family: "Floral Aquático", images: githubImgGallery("bc-176") }),
  brand("bc-203", "#203", "Libre Intense", "Libre Intense - Yves Saint Laurent", "MASCULINO", githubImgWebp("bc-203"),
    ["Lavanda", "Baunilha", "Fougère"],
    "Lavanda, Mandarina, Bergamota",
    "Lavanda, Flor de Laranjeira, Jasmim Sambac, Orquídea",
    "Baunilha de Madagascar, Tonka, Âmbar-cinzento, Vetiver",
    { family: "Âmbar Fougère", images: githubImgGallery("bc-203") }),
  brand("bc-216", "#216", "Flower Poppy", "FlowerbyKenzo - Kenzo", "FEMININO", githubImgWebp("bc-216"),
    ["Rosa", "Violeta", "Floral"],
    "Rosa Bulgária, Espinheiro-alvar, Groselha preta, Mandarina",
    "Violeta de Parma, Rosa, Opoponax, Jasmim",
    "Baunilha, Almíscar branco, Incenso",
    { family: "Âmbar Floral" }),
  brand("bc-269", "#269", "Chanel No. 5 Couture", "Chanel No. 5 - Chanel", "FEMININO", githubImgWebp("bc-269"),
    ["Aldeídico", "Floral", "Âmbar"],
    "Aldeídos, Neroli, Bergamota, Limão",
    "Jasmim, Rosa de Maio, Lírio-do-vale, Ylang-Ylang",
    "Sândalo, Vetiver, Baunilha, Almíscar, Âmbar",
    { family: "Aldeídico Floral" }),
  brand("bc-312", "#312", "Mon Guerlain Bloom", "Mon Guerlain - Guerlain", "FEMININO", githubImg("bc-312"),
    ["Lavanda", "Baunilha", "Íris"],
    "Lavanda Carla, Bergamota",
    "Jasmim Sambac, Íris, Rosa",
    "Baunilha do Taiti, Coumarina, Sândalo Australiano, Benzoin, Regaliz, Patchouli",
    { family: "Âmbar Amadeirado" }),
  brand("bc-329", "#329", "Fame Couture", "Fame - Paco Rabanne", "FEMININO", githubImgWebp("bc-329"),
    ["Manga", "Jasmim", "Gourmand"],
    "Manga, Bergamota",
    "Jasmim, Olíbano",
    "Baunilha, Sândalo",
    { family: "Floral Frutado Gourmand" }),
  brand("bc-342", "#342", "Coco Noir Couture", "Coco Noir - Chanel", "FEMININO", githubImg("bc-342"),
    ["Cítrico", "Rosa", "Amadeirado"],
    "Toranja, Bergamota, Laranja",
    "Rosa, Jasmim, Gerânio, Narciso",
    "Patchouli, Baunilha, Fava Tonka, Sândalo, Olíbano, Almíscar branco, Benzoin",
    { family: "Âmbar Amadeirado" }),
  brand("bc-394", "#394", "Baby Tous Bear", "Tous Baby - Tous", "FEMININO", `${CDN_IMG}bc-394.png`,
    ["Neroli", "Pêra", "Floral"],
    "Neroli, Mandarina, Bergamota",
    "Pêra, Maçã, Flor de Laranjeira, Rosa",
    "Almíscar, Petitgrain, Cedro",
    { family: "Floral Frutado" }),
  brand("bc-367", "#367", "Baccarat Rouge 540 Extrait", "Baccarat Rouge 540 - MFK", "UNISSEX", githubImgWebp("bc-367"),
    ["Açafrão", "Ambergris", "Cedro"],
    "Açafrão, Jasmim Sambac",
    "Amberwood, Ambergris",
    "Resina de Abeto, Cedro",
    { rating: 5.0, reviewCount: 189, family: "Amadeirado Ambarado" }),
  brand("bc-402", "#402", "Xerjoff Lira Couture", "Lira - Xerjoff Casamorati", "FEMININO", githubImgWebp("bc-402_bc-407"),
    ["Cítrico", "Baunilha", "Gourmand"],
    "Bergamota da Calábria, Laranja Sangue, Cedro",
    "Jasmim, Rosa, Lavanda",
    "Baunilha de Madagascar, Âmbar Doce, Almíscar Aveludado",
    { family: "Cítrico Gourmand" }),

  // ═══════════════════════════════════════════════════════════
  //  MINIATURAS ÁRABES AFEER (R$ 79,99 cada) — 5 produtos
  // ═══════════════════════════════════════════════════════════
  afeer("af-01", "AF-01", "Afeer Atheeri Abelhinha", "Afeer Atheeri / Mel & Baunilha Quente", githubImgWebp("af-atheeri-abelhinha"),
    ["Mel", "Baunilha", "Doce Árabe"],
    "Néctar de Mel, Flores Orientais",
    "Cera de Abelha, Canela Quente",
    "Baunilha de Madagascar, Oud Suave",
    { rating: 4.9, reviewCount: 87 }),
  afeer("af-02", "AF-02", "Afeer Asad Sultan", "Asad (Lattafa) / Sauvage Elixir", githubImgWebp("af-assad-elixir"),
    ["Pimenta", "Abacaxi", "Especiado"],
    "Pimenta Preta, Abacaxi, Tabaco",
    "Café, Íris, Patchouli",
    "Âmbar, Baunilha, Madeira Seca",
    { rating: 4.8, reviewCount: 94 }),
  afeer("af-03", "AF-03", "Afeer Yara Pink", "Yara Pink (Lattafa) / Marshmallow & Frutas", githubImgWebp("af-yara"),
    ["Marshmallow", "Orquídea", "Cremoso"],
    "Orquídea, Heliotrópio, Tangerina",
    "Acordo Gourmand, Frutas Tropicais",
    "Baunilha, Almíscar, Sândalo",
    { rating: 4.9, reviewCount: 112, gender: "FEMININO" as ProductGender }),
  afeer("af-04", "AF-04", "Afeer Royal Amber", "Royal Amber (Orientica) / Ambarado", `${CDN_IMG}af-04.png`,
    ["Melão", "Âmbar", "Abacaxi"],
    "Melão, Abacaxi, Notas Verdes",
    "Âmbar, Frutas Suculentas",
    "Almíscar, Notas Amadeiradas, Baunilha",
    { rating: 4.7, reviewCount: 67 }),
  afeer("af-07", "AF-07", "Afeer Fakhar Rose", "Fakhar Rose (Lattafa) / Floral Tuberosado", `${CDN_IMG}af-07.png`,
    ["Tuberosa", "Lichia", "Jasmim"],
    "Lichia, Frutas Vermelhas, Lírio",
    "Tuberosa, Jasmim, Peônia",
    "Baunilha, Almíscar Branco, Vetiver",
    { rating: 4.8, reviewCount: 73, gender: "FEMININO" as ProductGender }),

  // ═══════════════════════════════════════════════════════════
  //  DECANTE 5ML — PERFUMES ÁRABES EM ESTOQUE (R$ 39,99 / 3 por R$ 100,00)
  //  Imagens por gênero: MASCULINO → dec-masc-01.jpg, FEMININO → dec-fem-01.jpg, ARABE/UNISSEX → dec-uni.jpg
  // ═══════════════════════════════════════════════════════════

  // ── Solares / Frescos / Calor ──
  decante("dec-01", "DEC-01", "Decante Bareeq Al Dahab (5ml)", "Bareeq Al Dahab - Al Wataniah", githubDecanteByGender("ARABE"),
    ["Âmbar", "Luminoso", "Versátil"],
    "Notas Cítricas Luminosas, Bergamota",
    "Âmbar Radiante, Flores Brancas",
    "Almíscar, Madeira Nobre, Âmbar Doce",
    { rating: 4.9, reviewCount: 64, family: "Ambarado Luminoso",
      description: "Bareeq Al Dahab (Al Wataniah) — o novo substituto oficial: luminoso, ambarado e versátil. Perfeito para uso diário." }),
  decante("dec-02", "DEC-02", "Decante Asad Zanzibar (5ml)", "Asad Zanzibar - Lattafa", githubDecanteByGender("MASCULINO"),
    ["Coco", "Salgado", "Pimenta"],
    "Pimenta Preta, Notas Salgadas Marinhas",
    "Coco Cremoso, Notas Aquáticas Tropicais",
    "Almíscar, Madeira Branca, Âmbar",
    { rating: 4.8, reviewCount: 52, family: "Aquático Especiado",
      description: "Asad Zanzibar (Lattafa) — fresco, salgado, coco e pimenta. Perfeito para o calor e dias quentes." }),
  decante("dec-03", "DEC-03", "Decante Qaed Al Fursan (5ml)", "Qaed Al Fursan - Lattafa", githubDecanteByGender("MASCULINO"),
    ["Abacaxi", "Tropical", "Defumado"],
    "Abacaxi Tropical, Bergamota, Pimenta",
    "Frutas Tropicais, Notas Florais",
    "Notas Defumadas, Madeira, Almíscar",
    { rating: 4.9, reviewCount: 71, family: "Frutado Amadeirado",
      description: "Qaed Al Fursan (Lattafa) — abacaxi tropical com fundo levemente defumado. Imponente e marcante." }),

  // ── Noturnos / Frio / Encontros / Eventos ──
  decante("dec-04", "DEC-04", "Decante Royal Blend Nero (5ml)", "Royal Blend Nero - Maison Alhambra", githubDecanteByGender("MASCULINO"),
    ["Baunilha", "Licoroso", "Madeira"],
    "Bebida Licorosa, Especiarias Quentes",
    "Baunilha Licorosa, Café, Cacau",
    "Madeira Escura, Âmbar, Fava Tonka",
    { rating: 4.8, reviewCount: 48, family: "Oriental Gourmand",
      description: "Royal Blend Nero (Maison Alhambra) — baunilha licorosa, bebida e madeira. Ideal para noites memoráveis." }),
  decante("dec-05", "DEC-05", "Decante Khamrah (5ml)", "Khamrah - Lattafa", githubDecanteByGender("ARABE"),
    ["Canela", "Tâmara", "Pralinê"],
    "Canela, Noz-Moscada, Bergamota",
    "Tâmara, Pralinê, Tuberosa, Mahonial",
    "Baunilha, Fava Tonka, Benjoin, Oud, Âmbar",
    { rating: 5.0, reviewCount: 89, family: "Oriental Gourmand Amadeirado",
      description: "Khamrah (Lattafa) — doce licoroso de canela e tâmara. Um clássico árabe para climas frios." }),
  decante("dec-06", "DEC-06", "Decante Asad Marrom Bourbon (5ml)", "Asad Marrom Bourbon - Lattafa", githubDecanteByGender("MASCULINO"),
    ["Café", "Rum", "Especiarias"],
    "Café Espresso, Rum Envelhecido",
    "Especiarias Quentes, Noz-Moscada, Canela",
    "Baunilha, Cacau, Madeira de Carvalho",
    { rating: 4.7, reviewCount: 41, family: "Gourmand Especiado",
      description: "Asad Marrom Bourbon (Lattafa) — café, rum e especiarias. Gourmad intenso para noites sofisticadas." }),
  decante("dec-07", "DEC-07", "Decante Odyssey Dubai Chocolat (5ml)", "Odyssey Dubai Chocolat - Armaf", githubDecanteByGender("FEMININO"),
    ["Chocolate", "Avelã", "Gourmand"],
    "Chocolate Amargo, Avelã Torrada",
    "Cacau, Pralinê, Notas de Caramelo",
    "Baunilha, Sândalo, Almíscar",
    { rating: 4.8, reviewCount: 56, gender: "FEMININO" as ProductGender, family: "Gourmand Achocolatado",
      description: "Odyssey Dubai Chocolat (Armaf) — chocolate amargo e avelã. Irresistível sobremesa olfativa." }),

  // ── Imponentes / Couro / Oud / Incenso ──
  decante("dec-08", "DEC-08", "Decante Dukhan (5ml)", "Dukhan - Lattafa", githubDecanteByGender("MASCULINO"),
    ["Incenso", "Tabaco", "Oud"],
    "Incenso, Fumaça, Pimenta",
    "Tabaco Escuro, Couro, Notas Resinosas",
    "Oud, Âmbar, Almíscar, Madeira Queimada",
    { rating: 4.9, reviewCount: 37, family: "Amadeirado Defumado",
      description: "Dukhan (Lattafa) — incenso, tabaco escuro e Oud. Misterioso e imponente para presença marcante." }),
  decante("dec-09", "DEC-09", "Decante Watani Noir (5ml)", "Watani Noir - Al Wataniah", githubDecanteByGender("MASCULINO"),
    ["Couro", "Especiado", "Seco"],
    "Pimenta, Açafrão, Notas Secas",
    "Couro Seco, Violeta, Especiarias",
    "Oud, Âmbar, Madeira Escura, Almíscar",
    { rating: 4.7, reviewCount: 33, family: "Couro Amadeirado",
      description: "Watani Noir (Al Wataniah) — couro seco, sério e especiado. Virilidade discreta e elegante." }),
  decante("dec-10", "DEC-10", "Decante Badee Al Oud For Glory (5ml)", "Badee Al Oud For Glory - Lattafa", githubDecanteByGender("ARABE"),
    ["Oud", "Açafrão", "Medicinal"],
    "Açafrão Intenso, Pimenta, Notas Médicas",
    "Oud Medicinal, Rosa, Especiarias",
    "Oud Cru, Âmbar, Almíscar, Resina",
    { rating: 4.8, reviewCount: 44, family: "Oud Oriental",
      description: "Badee Al Oud For Glory (Lattafa) — oud medicinal carregado no açafrão. Para amantes de oud autêntico." }),
  decante("dec-11", "DEC-11", "Decante Oud Mystery Intense (5ml)", "Oud Mystery Intense - Al Wataniah", githubDecanteByGender("ARABE"),
    ["Oud", "Resinoso", "Animalic"],
    "Oud Cru, Notas Resinosas, Açafrão",
    "Âmbar Negro, Rosa Sombria, Incenso",
    "Oud Animalic, Almíscar, Madeira Úmida",
    { rating: 4.9, reviewCount: 39, family: "Oud Animalic",
      description: "Oud Mystery Intense (Al Wataniah) — oud cru, resinoso e animalic. Experiência olfativa intensa." }),
  decante("dec-12", "DEC-12", "Decante Al Noble Ameer (5ml)", "Al Noble Ameer - Lattafa", githubDecanteByGender("ARABE"),
    ["Oud", "Canforado", "Herbal"],
    "Oud de Gala, Camphor, Ervas Frescas",
    "Rosa, Especiarias, Notas Verdes",
    "Oud, Sândalo, Âmbar, Almíscar",
    { rating: 4.8, reviewCount: 35, family: "Oud Herbal",
      description: "Al Noble Ameer (Lattafa) — oud de gala, canforado e herbal. Sofisticação oriental para eventos." }),

  // ── Coleção Feminina — Florais e Frutados ──
  decante("dec-13", "DEC-13", "Decante Chants Tenderina (5ml)", "Chants Tenderina - Maison Alhambra", githubDecanteByGender("FEMININO"),
    ["Floral", "Frutal", "Radiante"],
    "Frutas Frescas, Bergamota, Pêssego",
    "Flor de Peônia, Jasmim, Rosa",
    "Almíscar Branco, Cedro, Âmbar Suave",
    { rating: 4.9, reviewCount: 62, gender: "FEMININO" as ProductGender, family: "Floral Frutal Radiante",
      description: "Chants Tenderina (Maison Alhambra) — floral frutal radiante, delicado e sofisticado. Estilo Chanel Chance." }),
  decante("dec-14", "DEC-14", "Decante Amirat Al Arab Prive Red (5ml)", "Amirat Al Arab Prive Red - Lattafa", githubDecanteByGender("FEMININO"),
    ["Frutas Vermelhas", "Almíscar", "Sensual"],
    "Frutas Vermelhas Cativantes, Groselha",
    "Rosa, Jasmim, Notas Frutadas",
    "Almíscar Branco, Âmbar, Baunilha",
    { rating: 4.7, reviewCount: 47, gender: "FEMININO" as ProductGender, family: "Frutado Muscado",
      description: "Amirat Al Arab Prive Red (Lattafa) — frutas vermelhas cativantes e almíscar. Sedução em vermelho." }),
  decante("dec-15", "DEC-15", "Decante Rose Mystery Intense (5ml)", "Rose Mystery Intense - Al Wataniah", githubDecanteByGender("FEMININO"),
    ["Rosa", "Baunilha Negra", "Sombria"],
    "Rosa Escura, Pimenta, Especiarias",
    "Rosa de Maio, Gerânio, Notas Sombrias",
    "Baunilha Negra, Âmbar, Almíscar",
    { rating: 4.8, reviewCount: 51, gender: "FEMININO" as ProductGender, family: "Floral Sombrio",
      description: "Rose Mystery Intense (Al Wataniah) — rosa sombria com baunilha negra. Mistério floral sofisticado." }),
  decante("dec-16", "DEC-16", "Decante Fakhar Rose Gold (5ml)", "Fakhar Rose Gold - Lattafa", githubDecanteByGender("FEMININO"),
    ["Rosa", "Adocicado", "Marcante"],
    "Rosa, Frutas Cítricas, Pêssego",
    "Rosa Damascena, Peônia, Flor de Laranjeira",
    "Baunilha, Âmbar, Almíscar Branco",
    { rating: 4.8, reviewCount: 58, gender: "FEMININO" as ProductGender, family: "Floral Adocicado",
      description: "Fakhar Rose Gold (Lattafa) — floral marcante e adocicado. Elegância dourada para o dia." }),
  decante("dec-17", "DEC-17", "Decante Tharwah Gold (5ml)", "Tharwah Gold - Lattafa", githubDecanteByGender("FEMININO"),
    ["Floral Branco", "Ambarado", "Elegante"],
    "Bergamota, Flor de Laranjeira, Magnólia",
    "Jasmim, Tuberosa, Lírio-do-Vale",
    "Âmbar, Almíscar, Sândalo, Baunilha",
    { rating: 4.7, reviewCount: 43, gender: "FEMININO" as ProductGender, family: "Floral Branco Ambarado",
      description: "Tharwah Gold (Lattafa) — floral branco elegante e ambarado. Sofisticação para ocasiões sociais." }),
  decante("dec-18", "DEC-18", "Decante Yara Tous (5ml)", "Yara Tous - Lattafa", githubDecanteByGender("FEMININO"),
    ["Manga", "Coco", "Baunilha Tropical"],
    "Manga Madura, Coco Cremoso, Frutas Tropicais",
    "Flor de Tiaré, Jasmim, Notas Gourmand",
    "Baunilha, Sândalo, Almíscar, Âmbar",
    { rating: 4.9, reviewCount: 67, gender: "FEMININO" as ProductGender, family: "Frutado Tropical",
      description: "Yara Tous (Lattafa) — manga, coco e baunilha tropical. Fuga olfativa para o paraíso." }),
];

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
