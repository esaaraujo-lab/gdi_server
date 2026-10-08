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
  stockQty: number; // quantidade real em estoque (0 = esgotado)
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
  /** Galeria de imagens adicionais (opcional). A `image` principal sempre
   *  aparece primeiro; as URLs em `images` são fotos extras (ex: bc-176-2.webp,
   *  bc-203.1.webp) exibidas em thumbnails abaixo da imagem principal. */
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

// Imagens Unsplash curadas para perfumes de luxo
const IMG = {
  dark: "https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=500&auto=format&fit=crop&q=80",
  gold: "https://images.unsplash.com/photo-1615397349754-cfa2066a298e?w=500&auto=format&fit=crop&q=80",
  red: "https://images.unsplash.com/photo-1588405748880-12d1d2a59f75?w=500&auto=format&fit=crop&q=80",
  ornate: "https://images.unsplash.com/photo-1547887537-6158d64c35b3?w=500&auto=format&fit=crop&q=80",
  honey: "https://images.unsplash.com/photo-1594035910387-fea47794261f?w=500&auto=format&fit=crop&q=80",
  perfume: "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=500&auto=format&fit=crop&q=80",
  decante: "https://images.unsplash.com/photo-1616949755610-8c9bbc08f138?w=500&auto=format&fit=crop&q=80",
};

// Base GitHub Raw URL para fotos reais dos perfumes Brand Collection
// Repositório: esaaraujo-lab/gdi_server — pasta /mimi/upload_images/
const GITHUB_IMG =
  "https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/upload_images/";

// Base GitHub Raw URL para fotos dos decantes/afeer (pasta /mimi/upload_images/)
const GITHUB_PERFUMES_IMG =
  "https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/upload_images/";

/** Constrói a URL GitHub Raw para um código de imagem bc-XXX. Ex: githubImg("bc-099") -> ".../bc-099.jpeg".
 *  Para arquivos com nome especial (ex: bc--394.jpeg com duplo traço), basta passar o código exato.
 */
function githubImg(code: string): string {
  return `${GITHUB_IMG}${code}.jpeg`;
}

/** Constrói a URL GitHub Raw em formato .webp (alta qualidade). Ex: githubImgWebp("bc-126") -> ".../bc-126.webp". */
function githubImgWebp(code: string): string {
  return `${GITHUB_IMG}${code}.webp`;
}

/**
 * Galeria de imagens adicionais para um produto.
 *
 * Alguns perfumes no GitHub têm múltiplas fotos (ângulos diferentes, embalagem,
 * etc.). Os padrões conhecidos são:
 *  - `{code}-2.webp` (ex: bc-176-2.webp)
 *  - `{code}.1.webp` (ex: bc-203.1.webp)
 *  - `{code}-3.webp` (potencial futuro)
 *
 * Como não podemos verificar a existência do arquivo em build-time (sem fetch
 * server-side na build do Next.js), hardcodeamos os produtos conhecidos com
 * múltiplas fotos. Para produtos sem galeria, retorna `[]` (array vazio) e o
 * UI mostra apenas a imagem principal.
 *
 * A lista principal (`image`) sempre aparece primeiro no UI; as URLs retornadas
 * aqui são extras.
 */
function githubImgGallery(code: string): string[] {
  switch (code) {
    case "bc-176": // L'Eau d'Issey (Issey Miyake)
      return [`${GITHUB_IMG}bc-176-2.webp`];
    case "bc-203": // Libre Intense (YSL)
      return [`${GITHUB_IMG}bc-203.1.webp`];
    default:
      return [];
  }
}

/** Constrói a URL GitHub Raw para imagens de decantes/afeer da pasta /mimi/perfumes/.
 *  Ex: githubDecanteByGender("ARABE") -> ".../mimi/perfumes/af-01.jpg"
 *  Isso faz com que atualizações no GitHub sejam refletidas automaticamente no site.
 */
function githubDecante(filename: string): string {
  return `${GITHUB_PERFUMES_IMG}${filename}.jpg`;
}

/** Constrói a URL GitHub Raw para a imagem padrão de decante baseada no gênero.
 *  - Unissex/Árabe: dec-uni.jpg
 *  - Masculino: dec-masc-01.jpg
 *  - Feminino: dec-fem-01.jpg
 */
function githubDecanteByGender(gender: string): string {
  if (gender === "MASCULINO") return `${GITHUB_PERFUMES_IMG}dec-masc-01.jpg`;
  if (gender === "FEMININO") return `${GITHUB_PERFUMES_IMG}dec-fem-01.jpg`;
  return `${GITHUB_PERFUMES_IMG}dec-uni.jpg`; // UNISSEX, ARABE, default
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
    stockQty: extra?.stockQty ?? 10,
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
    gender: "ARABE",
    price: DEFAULT_PRICE_AFEER,
    inStock: true,
    stockQty: extra?.stockQty ?? 8,
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
  return {
    id,
    code,
    name,
    inspiration,
    category: "DECANTE",
    gender: extra?.gender || "ARABE",
    price: DEFAULT_PRICE_DECANTE,
    inStock: true,
    stockQty: extra?.stockQty ?? 15,
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
  };
}

export const INITIAL_PRODUCTS: Perfume[] = [
  // ═══════════════════════════════════════════════════════════
  //  BRAND COLLECTION (25ml / R$ 69,99)
  // ═══════════════════════════════════════════════════════════
  brand("bc-005", "#005", "Gold 1 Million", "1 Million - Paco Rabanne", "MASCULINO", githubImgWebp("bc-005"),
    ["Canela", "Couro", "Âmbar"],
    "Mandarina Sanguínea, Hortelã Pimenta",
    "Canela, Absoluto de Rosa, Especiarias",
    "Couro, Âmbar Dourado, Patchouli Indiano",
    { description: "1 Million (Paco Rabanne) — couro dourado, canela e âmbar. Sedução masculina em frasco de ouro.", family: "Amadeirado Especiado Ambarado" }),
  brand("bc-007", "#007", "I Love J'adore", "J'adore - Dior", "FEMININO", githubImgWebp("bc-07"),
    ["Floral", "Jasmim", "Pêra"],
    "Pêra, Melão, Magnólia, Pêssego",
    "Jasmim, Lírio-do-Vale, Tuberosa, Rosa",
    "Almíscar, Baunilha, Cedro, Amora",
    { description: "J'adore (Dior) — buquê floral radiante com jasmim, rosa e lírio-do-vale. Feminilidade luminosa atemporal.", family: "Floral Branco Radiante" }),
  brand("bc-021", "#021", "Coco Mademoiselle", "Coco Mademoiselle - Chanel", "FEMININO", githubImgWebp("bc-021"),
    ["Cítrico", "Rosa", "Patchouli"],
    "Laranja, Mandarina, Bergamota",
    "Rosa Turca, Jasmim, Mimosa",
    "Patchouli, Almíscar Branco, Baunilha",
    { rating: 4.9, reviewCount: 203,
      description: "Coco Mademoiselle (Chanel) — patchouli, rosa e bergamota. Sofisticação juvenil de um ícone moderno." }),
  brand("bc-027", "#027", "Hypnotic Poison Apple", "Hypnotic Poison - Dior", "FEMININO", githubImgWebp("bc-027"),
    ["Amêndoa", "Baunilha", "Coco"],
    "Ameixa, Coco, Alperce",
    "Tuberosa, Jasmim, Lírio-do-Vale, Rosa",
    "Baunilha, Amêndoa, Sândalo, Pau-Brasil",
    { description: "Hypnotic Poison (Dior) — amêndoa, baunilha e sândalo. Bruxa sensual da noite, doçura hipnótica.", family: "Gourmand Amendoado" }),
  brand("bc-034", "#034", "212 VIP Rosé", "212 VIP Rosé - Carolina Herrera", "FEMININO", githubImgWebp("bc-034"),
    ["Champagne", "Pêssego", "Sensual"],
    "Champagne Rosé, Notas Frutadas",
    "Flor de Pêssego",
    "Ambróxido, Almíscar Branco, Notas Amadeiradas",
    { inStock: false,
      description: "212 VIP Rosé (Carolina Herrera) — champagne rosé, pêssego e ambróxido. Festas em rosa, juventude radiante." }),
  brand("bc-105", "#105", "Lady Diamond Million", "Lady Million - Paco Rabanne", "FEMININO", githubImgWebp("bc-105"),
    ["Mel", "Flor de Laranjeira", "Framboesa"],
    "Framboesa, Neroli, Limão de Amalfi",
    "Flor de Laranjeira, Jasmim, Gardênia",
    "Mel, Patchouli, Âmbar",
    { description: "Lady Million (Paco Rabanne) — mel, flor de laranjeira e framboesa. Diamante feminino, luxo dourado." }),
  brand("bc-126", "#126", "Good Girl Stiletto", "Good Girl - Carolina Herrera", "FEMININO", githubImgWebp("bc-126"),
    ["Tuberosa", "Cacau", "Fava Tonka"],
    "Amêndoa, Café, Bergamota, Limão",
    "Tuberosa, Jasmim Sambac, Orris, Rosa",
    "Fava Tonka, Cacau, Baunilha, Pralinê",
    { rating: 4.8, reviewCount: 167,
      description: "Good Girl (Carolina Herrera) — tuberosa, cacau e fava tonka. Poder feminino em salto alto, sedução noturna." }),
  brand("bc-136", "#136", "Scandal Honey", "Scandal - Jean Paul Gaultier", "FEMININO", githubImgWebp("bc-136"),
    ["Mel Gourmand", "Gardênia", "Patchouli"],
    "Laranja Sanguínea, Mandarina",
    "Mel, Gardênia, Flor de Laranjeira, Jasmim",
    "Cera de Abelha, Patchouli, Caramelo",
    { description: "Scandal (JPG) — mel, gardênia e patchouli. Escândalo feminino parisiense, doçura provocante." }),

  // ── Brand Collection — novas aquisições (fotos reais GitHub) ──
  brand("bc-099", "#099", "La Nuit de L'Homme", "La Nuit de L'Homme - Yves Saint Laurent", "MASCULINO", githubImg("bc-099"),
    ["Amadeirado", "Sensual", "Especiado"],
    "Bergamota, Pimenta Rosa, Cardamomo",
    "Lavanda, Cedro, Vetiver",
    "Cumarina, Almíscar, Madeira de Cedro",
    { rating: 4.9, reviewCount: 89, family: "Amadeirado Especiado",
      season: "Noite / Outono-Inverno", occasion: "Encontros, Eventos noturnos",
      description: "La Nuit de L'Homme (YSL) — aromática intensidade noturna. Cardamomo e lavanda em harmonia sensual." }),
  brand("bc-132", "#132", "Fantasy Bloom", "Fantasy - Britney Spears", "FEMININO", githubImg("bc-132"),
    ["Gourmand", "Floral", "Doce"],
    "Kiwi, Lichia, Tangerina",
    "Jasmim, Flor de Lótus, Chocolate Branco",
    "Almíscar, Madeira, Cupcake",
    { rating: 4.8, reviewCount: 67, family: "Gourmand Floral",
      season: "Dia / Primavera-Verão", occasion: "Casual, Festas, Uso diário",
      description: "Fantasy Bloom (inspirado em Britney Spears Fantasy) — doçura de chocolate branco e kiwi. Irresistível e jovem." }),
  brand("bc-151", "#151", "Royal Favourite", "The Favourite - Penhaligon's", "FEMININO", githubImgWebp("bc-151"),
    ["Floral", "Amadeirado", "Elegante"],
    "Bergamota, Neroli, Gerânio",
    "Rosa, Íris, Heliotrópio",
    "Âmbar, Sândalo, Almíscar",
    { rating: 4.9, reviewCount: 45, family: "Floral Amadeirado",
      season: "Dia-Noite / O ano todo", occasion: "Luxo, Eventos sociais, Casamentos",
      description: "Royal Favourite (inspirado em Penhaligon's The Favourite) — elegância britânica com rosa e íris. Sofisticação real." }),
  brand("bc-171", "#171", "Classique Couture", "Classique - Jean Paul Gaultier", "FEMININO", githubImgWebp("bc-171"),
    ["Floral", "Amadeirado", "Sensual"],
    "Rosa, Pera, Anis",
    "Ylang-Ylang, Gengibre, Flor de Laranjeira",
    "Almíscar, Madeira, Baunilha",
    { rating: 4.8, reviewCount: 78, family: "Floral Amadeirado",
      season: "Noite / Primavera-Outono", occasion: "Eventos, Encontros românticos",
      description: "Classique Couture (inspirado em JPG Classique) — flor de laranjeira e gengibre em corpo curvilíneo. Iconografia feminina." }),
  brand("bc-203", "#203", "Libre Intense", "Libre Intense - Yves Saint Laurent", "FEMININO", githubImgWebp("bc-203"),
    ["Floral", "Amadeirado", "Lavanda"],
    "Lavanda, Mandarin, Pera",
    "Flor de Laranjeira, Jasmim, Íris",
    "Baunilha, Âmbar, Almíscar",
    { rating: 4.9, reviewCount: 112, family: "Floral Amadeirado",
      season: "Noite / Outono-Inverno", occasion: "Eventos, Luxo, Uso noturno",
      description: "Libre Intense (YSL) — lavanda francesa e baunilha de Madagascar. Liberdade olfativa intensa.",
      images: githubImgGallery("bc-203") }),
  brand("bc-312", "#312", "Mon Guerlain Bloom", "Mon Guerlain - Guerlain", "FEMININO", githubImg("bc-312"),
    ["Lavanda", "Baunilha", "Gourmand"],
    "Bergamota, Lavanda de Provence",
    "Flor de Sambac, Íris",
    "Baunilha de Tahití, Almíscar, Coumarina",
    { rating: 4.9, reviewCount: 83, family: "Lavanda Amadeirada",
      season: "Dia-Noite / O ano todo", occasion: "Luxo, Uso diário, Eventos",
      description: "Mon Guerlain Bloom (Guerlain) — lavanda de Provence e baunilha de Tahití. Elegância francesa atemporal." }),
  brand("bc-329", "#329", "Fame Couture", "Fame - Lady Gaga", "UNISSEX", githubImgWebp("bc-329"),
    ["Incenso", "Oud", "Misterioso"],
    "Açafrão, Belladona",
    "Incenso, Jasmim, Aprum",
    "Oud, Almíscar, Couro",
    { rating: 4.7, reviewCount: 34, family: "Oriental Dark",
      season: "Noite / Outono-Inverno", occasion: "Eventos, Baladas, Uso noturno",
      description: "Fame Couture (inspirado em Lady Gaga Fame) — o primeiro perfume negro do mundo. Misterioso, ousado e dark." }),
  brand("bc-342", "#342", "Coco Noir Couture", "Coco Noir - Chanel", "FEMININO", githubImg("bc-342"),
    ["Floral", "Amadeirado", "Elegante"],
    "Bergamota, Laranja, Pera",
    "Rosa, Jasmim, Narciso, Flor de Laranjeira",
    "Sândalo, Patchouli, Almíscar, Baunilha",
    { rating: 4.9, reviewCount: 56, family: "Floral Amadeirado",
      season: "Noite / Outono-Inverno", occasion: "Eventos, Luxo, Ocasiões especiais",
      description: "Coco Noir Couture (Chanel) — a noite em estado puro. Rosa e jasmim em base amadeirada profunda." }),

  // ── Brand Collection — novas aquisições VLM (Task 42-A) ──
  brand("bc-060", "#060", "Cloud Pink", "Cloud - Ariana Grande", "FEMININO", githubImgWebp("bc-060"),
    ["Gourmand", "Doce", "Frutal"],
    "Pera, Bergamota, Pralina",
    "Flor de Laranjeira, Orquídea, Chocolate Branco",
    "Almíscar, Madeira, Creme de Marshmallow",
    { rating: 4.8, reviewCount: 72, family: "Gourmand Frutado",
      season: "Dia / Primavera-Verão", occasion: "Casual, Festas, Uso diário",
      description: "Cloud Pink (Ariana Grande) — doçura de marshmallow e pralina. Fluffy, viciante e jovem." }),
  brand("bc-093", "#093", "Dior Homme Intense", "Dior Homme - Dior", "MASCULINO", githubImgWebp("bc-093"),
    ["Floral", "Amadeirado", "Elegante"],
    "Lavanda, Sálvia, Bergamota",
    "Íris, Cacau, Ambrosia",
    "Cedro, Vetiver, Couro, Almíscar",
    { rating: 4.9, reviewCount: 95, family: "Floral Amadeirado",
      season: "Noite / Outono-Inverno", occasion: "Trabalho, Eventos, Luxo",
      description: "Dior Homme Intense (Dior) — íris e cacau em elegância masculina. Sofisticado e marcante." }),
  brand("bc-153", "#153", "Le Male Couture", "Le Male - Jean Paul Gaultier", "MASCULINO", githubImgWebp("bc-153"),
    ["Amadeirado", "Lavanda", "Sensual"],
    "Hortelã, Lavanda, Bergamota",
    "Flor de Laranjeira, Canela, Cominho",
    "Madeira de Cedro, Sândalo, Âmbar, Almíscar, Baunilha",
    { rating: 4.9, reviewCount: 87, family: "Amadeirado Lavanda",
      season: "Noite / O ano todo", occasion: "Encontros, Eventos, Baladas",
      description: "Le Male Couture (JPG Le Male) — lavanda e baunilha em torso masculino. Icônico e sensual." }),
  brand("bc-176", "#176", "L'Eau d'Issey", "L'Eau d'Issey - Issey Miyake", "UNISSEX", githubImgWebp("bc-176"),
    ["Aquático", "Floral", "Fresco"],
    "Notas Aquáticas, Fréésia, Mandarina, Rosa",
    "Lótus, Lírio-do-Vale, Peônia",
    "Almíscar, Sândalo, Madeira Flutuante",
    { rating: 4.7, reviewCount: 54, family: "Aquático Floral",
      season: "Verão / Primavera", occasion: "Casual, Trabalho, Uso diário",
      description: "L'Eau d'Issey (Issey Miyake) — água pura em frasco cônico. Frescor atemporal e zen.",
      images: githubImgGallery("bc-176") }),
  brand("bc-216", "#216", "Flower Poppy", "Flower - Kenzo", "FEMININO", githubImgWebp("bc-216"),
    ["Floral", "Pó", "Elegante"],
    "Brosimum, Cássia, Rosas Negras",
    "Íris, Violeta, Heliotrópio, Damasco",
    "Almíscar Branco, Incenso, Baunilha",
    { rating: 4.8, reviewCount: 63, family: "Floral Pó",
      season: "Primavera / Outono", occasion: "Casual, Luxo, Uso diário",
      description: "Flower Poppy (Kenzo Flower) — papoula solitária em frasco esguio. Poesia floral urbana." }),
  brand("bc-394", "#394", "Baby Tous Bear", "Baby Tous - TOUS", "UNISSEX", githubImg("bc--394"),
    ["Gourmand", "Frutado", "Delicado"],
    "Bergamota, Tangerina, Neroli",
    "Flor de Laranjeira, Frutas Tropicais",
    "Almíscar, Cedro, Âmbar",
    { rating: 4.6, reviewCount: 38, family: "Gourmand Floral",
      season: "Dia / Primavera-Verão", occasion: "Casual, Presentes, Uso diário",
      description: "Baby Tous Bear (TOUS) — ursos de pelúcia em frasco icônico. Doçura infantil em edição luxuosa." }),
  // ── Novos Brand Collection (Task 46) ──
  brand("bc-116", "#116", "Invictus Victory", "Invictus - Paco Rabanne", "MASCULINO", githubImgWebp("bc-116"),
    ["Marinho", "Amadeirado", "Energético"],
    "Grapefruit, Laranja, Pimenta Rosa",
    "Lavanda, Sálvia, Madeira",
    "Âmbar, Almíscar, Madeira de Cedro",
    { rating: 4.8, reviewCount: 91, family: "Amadeirado Aquático",
      season: "Dia / Primavera-Verão", occasion: "Esportivo, Casual, Trabalho",
      description: "Invictus Victory (Paco Rabanne) — frescor cítrico e madeira seca. Energia vitoriosa para o dia." }),
  brand("bc-269", "#269", "Chanel No. 5 Couture", "Chanel No. 5 - Chanel", "FEMININO", githubImgWebp("bc-269"),
    ["Floral", "Aldeídico", "Clássico"],
    "Neroli, Ylang-Ylang, Aldeídos",
    "Rosa, Jasmim, Lírio-do-Vale",
    "Sândalo, Vetiver, Almíscar, Baunilha",
    { rating: 5.0, reviewCount: 156, family: "Floral Aldeídico",
      season: "Noite / O ano todo", occasion: "Luxo, Eventos, Clássico atemporal",
      description: "Chanel No. 5 Couture — o perfume mais icônico do mundo. Aldeídos e rosa em elegância eterna." }),
  brand("bc-367", "#367", "Baccarat Rouge 540 Extrait", "Baccarat Rouge 540 - MFK", "UNISSEX", githubImgWebp("bc-367"),
    ["Oud", "Açafrão", "Amadeirado"],
    "Açafrão, Jasmim",
    "Madeira de Amendoeira, Âmbar",
    "Almíscar, Cedro, Fir Resina",
    { rating: 5.0, reviewCount: 203, family: "Oriental Amadeirado",
      season: "Noite / Outono-Inverno", occasion: "Luxo, Eventos, Ocasiões especiais",
      description: "Baccarat Rouge 540 Extrait (MFK) — açafrão e âmbar em luxo absoluto. O perfume mais desejado do mundo." }),
  brand("bc-402", "#402", "Xerjoff Lira Couture", "Lira - Xerjoff Casamorati", "FEMININO", githubImgWebp("bc-402_bc-407"),
    ["Gourmand", "Cítrico", "Floral"],
    "Bergamota, Lima, Romã",
    "Flor de Laranjeira, Jasmim, Rosa",
    "Baunilha, Sândalo, Almíscar, Caramelo",
    { rating: 5.0, reviewCount: 78, family: "Gourmand Floral",
      season: "Dia-Noite / O ano todo", occasion: "Luxo, Eventos, Presente especial",
      description: "Xerjoff Lira Couture (Casamorati) — lima siciliana e caramelo em frasco de luxo italiano. Doçura sofisticada." }),

  // ═══════════════════════════════════════════════════════════
  //  MINIATURAS ÁRABES AFEER (R$ 79,99 cada)
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
  afeer("af-04", "AF-04", "Afeer Royal Amber", "Royal Amber (Orientica) / Ambarado", githubImgWebp("af-assad"),
    ["Melão", "Âmbar", "Abacaxi"],
    "Melão, Abacaxi, Notas Verdes",
    "Âmbar, Frutas Suculentas",
    "Almíscar, Notas Amadeiradas, Baunilha",
    { rating: 4.7, reviewCount: 67 }),
  afeer("af-07", "AF-07", "Afeer Fakhar Rose", "Fakhar Rose (Lattafa) / Floral Tuberosado", githubImgWebp("af-yara"),
    ["Tuberosa", "Lichia", "Jasmim"],
    "Lichia, Frutas Vermelhas, Lírio",
    "Tuberosa, Jasmim, Peônia",
    "Baunilha, Almíscar Branco, Vetiver",
    { rating: 4.8, reviewCount: 73, gender: "FEMININO" as ProductGender }),

  // ═══════════════════════════════════════════════════════════
  //  DECANTE 5ML — PERFUMES ÁRABES EM ESTOQUE (R$ 39,99 / 3 por R$ 100,00)
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
