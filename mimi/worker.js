/**
 * Mimi Mimos — Cloudflare Worker (Haute Parfumerie)
 * AUTO-GERADO em 2026-09-30T13:53:07.039505
 * Catálogo: Brand Collection 25ml + Miniaturas Árabes Afeer + Decantes 5ml
 *
 * Deploy: cole no Cloudflare Workers
 * Imagens: raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/perfumes/
 */

const CONFIG = {
  PIX_KEY: 'fabiana@araujo.eu.org',
  MERCHANT_NAME: 'FABIANA ARAUJO',
  MERCHANT_CITY: 'SAO PAULO',
  WHATSAPP_NUMBER: '5511958546078',
  ADMIN_SALT: 'mimi_mimos_2026_luxury_parfumerie_salt_x9k',
  ADMIN_PASS_SHA256: '80d6e227beaa8e47b15965e737bc6d01f36578c7f482de31ff1675409f9ce4a1',
  IMG_BASE: 'https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/perfumes/',
};

const PERFUMES = [
  {
    "id": "bc-001",
    "code": "#001",
    "name": "Allure Homme Sport",
    "inspiration": "Allure Homme Sport - Chanel",
    "category": "BRAND",
    "gender": "MASCULINO",
    "price": 69.99,
    "inStock": true,
    "image": "https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=500&auto=format&fit=crop&q=80",
    "tags": [
      "Fresco",
      "Cítrico",
      "Amadeirado"
    ],
    "notesTopo": "Laranja, Notas Marinhas, Aldeídos",
    "notesCoracao": "Pimenta, Neroli, Cedro",
    "notesFundo": "Fava Tonka, Baunilha, Almíscar Branco"
  },
  {
    "id": "bc-002",
    "code": "#002",
    "name": "London Gentleman",
    "inspiration": "London - Burberry",
    "category": "BRAND",
    "gender": "MASCULINO",
    "price": 69.99,
    "inStock": true,
    "image": "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=500&auto=format&fit=crop&q=80",
    "tags": [
      "Tabaco",
      "Elegante",
      "Especiado"
    ],
    "notesTopo": "Bergamota, Lavanda, Pimenta Preta",
    "notesCoracao": "Couro, Vinho do Porto, Mimosa",
    "notesFundo": "Folha de Tabaco, Guaiac, Musgo"
  },
  {
    "id": "bc-003",
    "code": "#003",
    "name": "CH Red Woman",
    "inspiration": "CH Women - Carolina Herrera",
    "category": "BRAND",
    "gender": "FEMININO",
    "price": 69.99,
    "inStock": true,
    "image": "https://images.unsplash.com/photo-1588405748880-12d1d2a59f75?w=500&auto=format&fit=crop&q=80",
    "tags": [
      "Cítrico",
      "Gourmand",
      "Acamurçado"
    ],
    "notesTopo": "Limão de Amalfi, Toranja, Bergamota",
    "notesCoracao": "Jasmim, Flor de Laranjeira Africana, Pralinê",
    "notesFundo": "Sândalo, Patchouli, Cashmere, Camurça"
  },
  {
    "id": "bc-004",
    "code": "#004",
    "name": "CH Men Leather",
    "inspiration": "CH Men - Carolina Herrera",
    "category": "BRAND",
    "gender": "MASCULINO",
    "price": 69.99,
    "inStock": true,
    "image": "https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=500&auto=format&fit=crop&q=80",
    "tags": [
      "Couro",
      "Gourmand",
      "Amadeirado"
    ],
    "notesTopo": "Grama, Bergamota, Toranja",
    "notesCoracao": "Amêndoa, Noz-Moscada, Violeta, Açafrão",
    "notesFundo": "Açúcar Mascavo, Couro, Baunilha, Camurça"
  },
  {
    "id": "bc-005",
    "code": "#005",
    "name": "Gold 1 Million",
    "inspiration": "1 Million - Paco Rabanne",
    "category": "BRAND",
    "gender": "MASCULINO",
    "price": 69.99,
    "inStock": true,
    "image": "https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/perfumes/bc-005-real.jpg",
    "tags": [
      "Canela",
      "Couro",
      "Âmbar"
    ],
    "notesTopo": "Mandarina Sanguínea, Hortelã Pimenta",
    "notesCoracao": "Canela, Absoluto de Rosa, Especiarias",
    "notesFundo": "Couro, Âmbar Dourado, Patchouli Indiano"
  },
  {
    "id": "bc-007",
    "code": "#007",
    "name": "I Love J'adore",
    "inspiration": "J'adore - Dior",
    "category": "BRAND",
    "gender": "FEMININO",
    "price": 69.99,
    "inStock": true,
    "image": "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=500&auto=format&fit=crop&q=80",
    "tags": [
      "Floral",
      "Jasmim",
      "Pêra"
    ],
    "notesTopo": "Pêra, Melão, Magnólia, Pêssego",
    "notesCoracao": "Jasmim, Lírio-do-Vale, Tuberosa, Rosa",
    "notesFundo": "Almíscar, Baunilha, Cedro, Amora"
  },
  {
    "id": "bc-008",
    "code": "#008",
    "name": "VIP Men 212",
    "inspiration": "212 VIP Men - Carolina Herrera",
    "category": "BRAND",
    "gender": "MASCULINO",
    "price": 69.99,
    "inStock": true,
    "image": "https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=500&auto=format&fit=crop&q=80",
    "tags": [
      "Vodka",
      "Maracujá",
      "Hortelã"
    ],
    "notesTopo": "Maracujá, Lima, Pimenta, Gengibre",
    "notesCoracao": "Vodka, Gin, Hortelã, Especiarias",
    "notesFundo": "Âmbar, Couro, Notas Amadeiradas"
  },
  {
    "id": "bc-010",
    "code": "#010",
    "name": "Black Orchid Velvet",
    "inspiration": "Black Orchid - Tom Ford",
    "category": "BRAND",
    "gender": "FEMININO",
    "price": 69.99,
    "inStock": true,
    "image": "https://images.unsplash.com/photo-1547887537-6158d64c35b3?w=500&auto=format&fit=crop&q=80",
    "tags": [
      "Trufa Negra",
      "Orquídea",
      "Exótico"
    ],
    "notesTopo": "Trufa, Ylang-Ylang, Groselha Preta",
    "notesCoracao": "Orquídea Negra, Notas Frutadas, Especiarias",
    "notesFundo": "Patchouli, Chocolate Amargo, Incenso, Baunilha"
  },
  {
    "id": "bc-012",
    "code": "#012",
    "name": "C'est La Vie Belle",
    "inspiration": "La Vie Est Belle - Lancôme",
    "category": "BRAND",
    "gender": "FEMININO",
    "price": 69.99,
    "inStock": true,
    "image": "https://images.unsplash.com/photo-1588405748880-12d1d2a59f75?w=500&auto=format&fit=crop&q=80",
    "tags": [
      "Baunilha",
      "Íris",
      "Pralinê"
    ],
    "notesTopo": "Groselha Preta, Pêra",
    "notesCoracao": "Íris, Jasmim, Flor de Laranjeira",
    "notesFundo": "Pralinê, Baunilha, Patchouli, Fava Tonka"
  },
  {
    "id": "bc-021",
    "code": "#021",
    "name": "Coco Mademoiselle",
    "inspiration": "Coco Mademoiselle - Chanel",
    "category": "BRAND",
    "gender": "FEMININO",
    "price": 69.99,
    "inStock": true,
    "image": "https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/perfumes/bc-021-real.jpg",
    "tags": [
      "Cítrico",
      "Rosa",
      "Patchouli"
    ],
    "notesTopo": "Laranja, Mandarina, Bergamota",
    "notesCoracao": "Rosa Turca, Jasmim, Mimosa",
    "notesFundo": "Patchouli, Almíscar Branco, Baunilha"
  },
  {
    "id": "bc-027",
    "code": "#027",
    "name": "Hypnotic Poison Apple",
    "inspiration": "Hypnotic Poison - Dior",
    "category": "BRAND",
    "gender": "FEMININO",
    "price": 69.99,
    "inStock": true,
    "image": "https://images.unsplash.com/photo-1588405748880-12d1d2a59f75?w=500&auto=format&fit=crop&q=80",
    "tags": [
      "Amêndoa",
      "Baunilha",
      "Coco"
    ],
    "notesTopo": "Ameixa, Coco, Alperce",
    "notesCoracao": "Tuberosa, Jasmim, Lírio-do-Vale, Rosa",
    "notesFundo": "Baunilha, Amêndoa, Sândalo, Pau-Brasil"
  },
  {
    "id": "bc-034",
    "code": "#034",
    "name": "212 VIP Rosé",
    "inspiration": "212 VIP Rosé - Carolina Herrera",
    "category": "BRAND",
    "gender": "FEMININO",
    "price": 69.99,
    "inStock": true,
    "image": "https://images.unsplash.com/photo-1594035910387-fea47794261f?w=500&auto=format&fit=crop&q=80",
    "tags": [
      "Champagne",
      "Pêssego",
      "Sensual"
    ],
    "notesTopo": "Champagne Rosé, Notas Frutadas",
    "notesCoracao": "Flor de Pêssego",
    "notesFundo": "Ambróxido, Almíscar Branco, Notas Amadeiradas"
  },
  {
    "id": "bc-070",
    "code": "#070",
    "name": "Bleu Ocean Deep",
    "inspiration": "Bleu de Chanel - Chanel",
    "category": "BRAND",
    "gender": "MASCULINO",
    "price": 69.99,
    "inStock": true,
    "image": "https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/perfumes/bc-070-real.jpg",
    "tags": [
      "Incenso",
      "Toranja",
      "Cedro"
    ],
    "notesTopo": "Toranja, Limão Siciliano, Hortelã",
    "notesCoracao": "Gengibre, Iso E Super, Jasmim",
    "notesFundo": "Incenso, Vetiver, Cedro, Sândalo"
  },
  {
    "id": "bc-100",
    "code": "#100",
    "name": "Sauvage Dior",
    "inspiration": "Sauvage - Dior",
    "category": "BRAND",
    "gender": "MASCULINO",
    "price": 69.99,
    "inStock": true,
    "image": "https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=500&auto=format&fit=crop&q=80",
    "tags": [
      "Ambroxan",
      "Pimenta",
      "Bergamota"
    ],
    "notesTopo": "Bergamota da Calábria, Pimenta Szechuan",
    "notesCoracao": "Lavanda, Vetiver, Patchouli, Gerânio",
    "notesFundo": "Ambroxan, Cedro, Ládano"
  },
  {
    "id": "bc-105",
    "code": "#105",
    "name": "Lady Diamond Million",
    "inspiration": "Lady Million - Paco Rabanne",
    "category": "BRAND",
    "gender": "FEMININO",
    "price": 69.99,
    "inStock": true,
    "image": "https://images.unsplash.com/photo-1588405748880-12d1d2a59f75?w=500&auto=format&fit=crop&q=80",
    "tags": [
      "Mel",
      "Flor de Laranjeira",
      "Framboesa"
    ],
    "notesTopo": "Framboesa, Neroli, Limão de Amalfi",
    "notesCoracao": "Flor de Laranjeira, Jasmim, Gardênia",
    "notesFundo": "Mel, Patchouli, Âmbar"
  },
  {
    "id": "bc-116",
    "code": "#116",
    "name": "Invictus Trophy",
    "inspiration": "Invictus - Paco Rabanne",
    "category": "BRAND",
    "gender": "MASCULINO",
    "price": 69.99,
    "inStock": true,
    "image": "https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=500&auto=format&fit=crop&q=80",
    "tags": [
      "Marinho",
      "Toranja",
      "Louro"
    ],
    "notesTopo": "Notas Marinhas, Toranja, Mandarina",
    "notesCoracao": "Folha de Louro, Jasmim",
    "notesFundo": "Ambergris, Madeira Guaiac, Musgo de Carvalho"
  },
  {
    "id": "bc-126",
    "code": "#126",
    "name": "Good Girl Stiletto",
    "inspiration": "Good Girl - Carolina Herrera",
    "category": "BRAND",
    "gender": "FEMININO",
    "price": 69.99,
    "inStock": true,
    "image": "https://images.unsplash.com/photo-1594035910387-fea47794261f?w=500&auto=format&fit=crop&q=80",
    "tags": [
      "Tuberosa",
      "Cacau",
      "Fava Tonka"
    ],
    "notesTopo": "Amêndoa, Café, Bergamota, Limão",
    "notesCoracao": "Tuberosa, Jasmim Sambac, Orris, Rosa",
    "notesFundo": "Fava Tonka, Cacau, Baunilha, Pralinê"
  },
  {
    "id": "bc-136",
    "code": "#136",
    "name": "Scandal Honey",
    "inspiration": "Scandal - Jean Paul Gaultier",
    "category": "BRAND",
    "gender": "FEMININO",
    "price": 69.99,
    "inStock": true,
    "image": "https://images.unsplash.com/photo-1588405748880-12d1d2a59f75?w=500&auto=format&fit=crop&q=80",
    "tags": [
      "Mel Gourmand",
      "Gardênia",
      "Patchouli"
    ],
    "notesTopo": "Laranja Sanguínea, Mandarina",
    "notesCoracao": "Mel, Gardênia, Flor de Laranjeira, Jasmim",
    "notesFundo": "Cera de Abelha, Patchouli, Caramelo"
  },
  {
    "id": "bc-159",
    "code": "#159",
    "name": "Libre Couture",
    "inspiration": "Libre - Yves Saint Laurent",
    "category": "BRAND",
    "gender": "FEMININO",
    "price": 69.99,
    "inStock": true,
    "image": "https://images.unsplash.com/photo-1594035910387-fea47794261f?w=500&auto=format&fit=crop&q=80",
    "tags": [
      "Lavanda",
      "Flor de Laranjeira",
      "Baunilha"
    ],
    "notesTopo": "Lavanda, Mandarina, Groselha Preta",
    "notesCoracao": "Flor de Laranjeira, Jasmim, Lavanda",
    "notesFundo": "Baunilha de Madagascar, Almíscar, Cedro"
  },
  {
    "id": "bc-181",
    "code": "#181",
    "name": "Bad Boy Lightning",
    "inspiration": "Bad Boy - Carolina Herrera",
    "category": "BRAND",
    "gender": "MASCULINO",
    "price": 69.99,
    "inStock": true,
    "image": "https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=500&auto=format&fit=crop&q=80",
    "tags": [
      "Pimenta Preta",
      "Cacau",
      "Fava Tonka"
    ],
    "notesTopo": "Pimenta Preta, Bergamota, Pimenta Branca",
    "notesCoracao": "Cedro, Sálvia",
    "notesFundo": "Fava Tonka, Cacau, Madeira de Âmbar"
  },
  {
    "id": "bc-247",
    "code": "#247",
    "name": "Baccarat Rouge 540",
    "inspiration": "Baccarat Rouge 540 - MFK",
    "category": "BRAND",
    "gender": "UNISSEX",
    "price": 69.99,
    "inStock": true,
    "image": "https://images.unsplash.com/photo-1547887537-6158d64c35b3?w=500&auto=format&fit=crop&q=80",
    "tags": [
      "Açafrão",
      "Ambergris",
      "Cedro"
    ],
    "notesTopo": "Açafrão, Jasmim Sambac",
    "notesCoracao": "Amberwood, Ambergris",
    "notesFundo": "Resina de Abeto, Cedro"
  },
  {
    "id": "bc-283",
    "code": "#283",
    "name": "Sauvage Elixir Concentré",
    "inspiration": "Sauvage Elixir - Dior",
    "category": "BRAND",
    "gender": "MASCULINO",
    "price": 69.99,
    "inStock": true,
    "image": "https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=500&auto=format&fit=crop&q=80",
    "tags": [
      "Noz-Moscada",
      "Lavanda",
      "Licores"
    ],
    "notesTopo": "Noz-Moscada, Canela, Cardamomo, Toranja",
    "notesCoracao": "Lavanda Concentrada",
    "notesFundo": "Alcaçuz, Sândalo, Âmbar, Patchouli"
  },
  {
    "id": "af-01",
    "code": "AF-01",
    "name": "Afeer Atheeri Abelhinha",
    "inspiration": "Afeer Atheeri / Mel & Baunilha Quente",
    "category": "AFEER",
    "gender": "ARABE",
    "price": 79.99,
    "inStock": true,
    "image": "https://images.unsplash.com/photo-1547887537-6158d64c35b3?w=500&auto=format&fit=crop&q=80",
    "tags": [
      "Mel",
      "Baunilha",
      "Doce Árabe"
    ],
    "notesTopo": "Néctar de Mel, Flores Orientais",
    "notesCoracao": "Cera de Abelha, Canela Quente",
    "notesFundo": "Baunilha de Madagascar, Oud Suave"
  },
  {
    "id": "af-02",
    "code": "AF-02",
    "name": "Afeer Asad Sultan",
    "inspiration": "Asad (Lattafa) / Sauvage Elixir",
    "category": "AFEER",
    "gender": "ARABE",
    "price": 79.99,
    "inStock": true,
    "image": "https://images.unsplash.com/photo-1547887537-6158d64c35b3?w=500&auto=format&fit=crop&q=80",
    "tags": [
      "Pimenta",
      "Abacaxi",
      "Especiado"
    ],
    "notesTopo": "Pimenta Preta, Abacaxi, Tabaco",
    "notesCoracao": "Café, Íris, Patchouli",
    "notesFundo": "Âmbar, Baunilha, Madeira Seca"
  },
  {
    "id": "af-03",
    "code": "AF-03",
    "name": "Afeer Yara Pink",
    "inspiration": "Yara Pink (Lattafa) / Marshmallow & Frutas",
    "category": "AFEER",
    "gender": "ARABE",
    "price": 79.99,
    "inStock": true,
    "image": "https://images.unsplash.com/photo-1588405748880-12d1d2a59f75?w=500&auto=format&fit=crop&q=80",
    "tags": [
      "Marshmallow",
      "Orquídea",
      "Cremoso"
    ],
    "notesTopo": "Orquídea, Heliotrópio, Tangerina",
    "notesCoracao": "Acordo Gourmand, Frutas Tropicais",
    "notesFundo": "Baunilha, Almíscar, Sândalo"
  },
  {
    "id": "af-04",
    "code": "AF-04",
    "name": "Afeer Royal Amber",
    "inspiration": "Royal Amber (Orientica) / Ambarado",
    "category": "AFEER",
    "gender": "ARABE",
    "price": 79.99,
    "inStock": true,
    "image": "https://images.unsplash.com/photo-1615397349754-cfa2066a298e?w=500&auto=format&fit=crop&q=80",
    "tags": [
      "Melão",
      "Âmbar",
      "Abacaxi"
    ],
    "notesTopo": "Melão, Abacaxi, Notas Verdes",
    "notesCoracao": "Âmbar, Frutas Suculentas",
    "notesFundo": "Almíscar, Notas Amadeiradas, Baunilha"
  },
  {
    "id": "af-07",
    "code": "AF-07",
    "name": "Afeer Fakhar Rose",
    "inspiration": "Fakhar Rose (Lattafa) / Floral Tuberosado",
    "category": "AFEER",
    "gender": "ARABE",
    "price": 79.99,
    "inStock": true,
    "image": "https://images.unsplash.com/photo-1588405748880-12d1d2a59f75?w=500&auto=format&fit=crop&q=80",
    "tags": [
      "Tuberosa",
      "Lichia",
      "Jasmim"
    ],
    "notesTopo": "Lichia, Frutas Vermelhas, Lírio",
    "notesCoracao": "Tuberosa, Jasmim, Peônia",
    "notesFundo": "Baunilha, Almíscar Branco, Vetiver"
  },
  {
    "id": "dec-01",
    "code": "DEC-01",
    "name": "Decante Bareeq Al Dahab (5ml)",
    "inspiration": "Bareeq Al Dahab - Al Wataniah",
    "category": "DECANTE",
    "gender": "ARABE",
    "price": 39.99,
    "inStock": true,
    "image": "https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/perfumes/dec-uni-01.jpg",
    "tags": [
      "Âmbar",
      "Luminoso",
      "Versátil"
    ],
    "notesTopo": "Notas Cítricas Luminosas, Bergamota",
    "notesCoracao": "Âmbar Radiante, Flores Brancas",
    "notesFundo": "Almíscar, Madeira Nobre, Âmbar Doce"
  },
  {
    "id": "dec-02",
    "code": "DEC-02",
    "name": "Decante Asad Zanzibar (5ml)",
    "inspiration": "Asad Zanzibar - Lattafa",
    "category": "DECANTE",
    "gender": "ARABE",
    "price": 39.99,
    "inStock": true,
    "image": "https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/perfumes/dec-masc-02.jpg",
    "tags": [
      "Coco",
      "Salgado",
      "Pimenta"
    ],
    "notesTopo": "Pimenta Preta, Notas Salgadas Marinhas",
    "notesCoracao": "Coco Cremoso, Notas Aquáticas Tropicais",
    "notesFundo": "Almíscar, Madeira Branca, Âmbar"
  },
  {
    "id": "dec-03",
    "code": "DEC-03",
    "name": "Decante Qaed Al Fursan (5ml)",
    "inspiration": "Qaed Al Fursan - Lattafa",
    "category": "DECANTE",
    "gender": "ARABE",
    "price": 39.99,
    "inStock": true,
    "image": "https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/perfumes/dec-masc-01.jpg",
    "tags": [
      "Abacaxi",
      "Tropical",
      "Defumado"
    ],
    "notesTopo": "Abacaxi Tropical, Bergamota, Pimenta",
    "notesCoracao": "Frutas Tropicais, Notas Florais",
    "notesFundo": "Notas Defumadas, Madeira, Almíscar"
  },
  {
    "id": "dec-04",
    "code": "DEC-04",
    "name": "Decante Royal Blend Nero (5ml)",
    "inspiration": "Royal Blend Nero - Maison Alhambra",
    "category": "DECANTE",
    "gender": "ARABE",
    "price": 39.99,
    "inStock": true,
    "image": "https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/perfumes/dec-masc-01.jpg",
    "tags": [
      "Baunilha",
      "Licoroso",
      "Madeira"
    ],
    "notesTopo": "Bebida Licorosa, Especiarias Quentes",
    "notesCoracao": "Baunilha Licorosa, Café, Cacau",
    "notesFundo": "Madeira Escura, Âmbar, Fava Tonka"
  },
  {
    "id": "dec-05",
    "code": "DEC-05",
    "name": "Decante Khamrah (5ml)",
    "inspiration": "Khamrah - Lattafa",
    "category": "DECANTE",
    "gender": "ARABE",
    "price": 39.99,
    "inStock": true,
    "image": "https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/perfumes/dec-uni-02.jpg",
    "tags": [
      "Canela",
      "Tâmara",
      "Pralinê"
    ],
    "notesTopo": "Canela, Noz-Moscada, Bergamota",
    "notesCoracao": "Tâmara, Pralinê, Tuberosa, Mahonial",
    "notesFundo": "Baunilha, Fava Tonka, Benjoin, Oud, Âmbar"
  },
  {
    "id": "dec-06",
    "code": "DEC-06",
    "name": "Decante Asad Marrom Bourbon (5ml)",
    "inspiration": "Asad Marrom Bourbon - Lattafa",
    "category": "DECANTE",
    "gender": "ARABE",
    "price": 39.99,
    "inStock": true,
    "image": "https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/perfumes/dec-masc-03.jpg",
    "tags": [
      "Café",
      "Rum",
      "Especiarias"
    ],
    "notesTopo": "Café Espresso, Rum Envelhecido",
    "notesCoracao": "Especiarias Quentes, Noz-Moscada, Canela",
    "notesFundo": "Baunilha, Cacau, Madeira de Carvalho"
  },
  {
    "id": "dec-07",
    "code": "DEC-07",
    "name": "Decante Odyssey Dubai Chocolat (5ml)",
    "inspiration": "Odyssey Dubai Chocolat - Armaf",
    "category": "DECANTE",
    "gender": "FEMININO",
    "price": 39.99,
    "inStock": true,
    "image": "https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/perfumes/dec-fem-03.jpg",
    "tags": [
      "Chocolate",
      "Avelã",
      "Gourmand"
    ],
    "notesTopo": "Chocolate Amargo, Avelã Torrada",
    "notesCoracao": "Cacau, Pralinê, Notas de Caramelo",
    "notesFundo": "Baunilha, Sândalo, Almíscar"
  },
  {
    "id": "dec-08",
    "code": "DEC-08",
    "name": "Decante Dukhan (5ml)",
    "inspiration": "Dukhan - Lattafa",
    "category": "DECANTE",
    "gender": "ARABE",
    "price": 39.99,
    "inStock": true,
    "image": "https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/perfumes/dec-masc-01.jpg",
    "tags": [
      "Incenso",
      "Tabaco",
      "Oud"
    ],
    "notesTopo": "Incenso, Fumaça, Pimenta",
    "notesCoracao": "Tabaco Escuro, Couro, Notas Resinosas",
    "notesFundo": "Oud, Âmbar, Almíscar, Madeira Queimada"
  },
  {
    "id": "dec-09",
    "code": "DEC-09",
    "name": "Decante Watani Noir (5ml)",
    "inspiration": "Watani Noir - Al Wataniah",
    "category": "DECANTE",
    "gender": "ARABE",
    "price": 39.99,
    "inStock": true,
    "image": "https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/perfumes/dec-masc-01.jpg",
    "tags": [
      "Couro",
      "Especiado",
      "Seco"
    ],
    "notesTopo": "Pimenta, Açafrão, Notas Secas",
    "notesCoracao": "Couro Seco, Violeta, Especiarias",
    "notesFundo": "Oud, Âmbar, Madeira Escura, Almíscar"
  },
  {
    "id": "dec-10",
    "code": "DEC-10",
    "name": "Decante Badee Al Oud For Glory (5ml)",
    "inspiration": "Badee Al Oud For Glory - Lattafa",
    "category": "DECANTE",
    "gender": "ARABE",
    "price": 39.99,
    "inStock": true,
    "image": "https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/perfumes/dec-uni-03.jpg",
    "tags": [
      "Oud",
      "Açafrão",
      "Medicinal"
    ],
    "notesTopo": "Açafrão Intenso, Pimenta, Notas Médicas",
    "notesCoracao": "Oud Medicinal, Rosa, Especiarias",
    "notesFundo": "Oud Cru, Âmbar, Almíscar, Resina"
  },
  {
    "id": "dec-11",
    "code": "DEC-11",
    "name": "Decante Oud Mystery Intense (5ml)",
    "inspiration": "Oud Mystery Intense - Al Wataniah",
    "category": "DECANTE",
    "gender": "ARABE",
    "price": 39.99,
    "inStock": true,
    "image": "https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/perfumes/dec-uni-03.jpg",
    "tags": [
      "Oud",
      "Resinoso",
      "Animalic"
    ],
    "notesTopo": "Oud Cru, Notas Resinosas, Açafrão",
    "notesCoracao": "Âmbar Negro, Rosa Sombria, Incenso",
    "notesFundo": "Oud Animalic, Almíscar, Madeira Úmida"
  },
  {
    "id": "dec-12",
    "code": "DEC-12",
    "name": "Decante Al Noble Ameer (5ml)",
    "inspiration": "Al Noble Ameer - Lattafa",
    "category": "DECANTE",
    "gender": "ARABE",
    "price": 39.99,
    "inStock": true,
    "image": "https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/perfumes/dec-uni-01.jpg",
    "tags": [
      "Oud",
      "Canforado",
      "Herbal"
    ],
    "notesTopo": "Oud de Gala, Camphor, Ervas Frescas",
    "notesCoracao": "Rosa, Especiarias, Notas Verdes",
    "notesFundo": "Oud, Sândalo, Âmbar, Almíscar"
  },
  {
    "id": "dec-13",
    "code": "DEC-13",
    "name": "Decante Chants Tenderina (5ml)",
    "inspiration": "Chants Tenderina - Maison Alhambra",
    "category": "DECANTE",
    "gender": "FEMININO",
    "price": 39.99,
    "inStock": true,
    "image": "https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/perfumes/dec-fem-01.jpg",
    "tags": [
      "Floral",
      "Frutal",
      "Radiante"
    ],
    "notesTopo": "Frutas Frescas, Bergamota, Pêssego",
    "notesCoracao": "Flor de Peônia, Jasmim, Rosa",
    "notesFundo": "Almíscar Branco, Cedro, Âmbar Suave"
  },
  {
    "id": "dec-14",
    "code": "DEC-14",
    "name": "Decante Amirat Al Arab Prive Red (5ml)",
    "inspiration": "Amirat Al Arab Prive Red - Lattafa",
    "category": "DECANTE",
    "gender": "FEMININO",
    "price": 39.99,
    "inStock": true,
    "image": "https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/perfumes/dec-fem-03.jpg",
    "tags": [
      "Frutas Vermelhas",
      "Almíscar",
      "Sensual"
    ],
    "notesTopo": "Frutas Vermelhas Cativantes, Groselha",
    "notesCoracao": "Rosa, Jasmim, Notas Frutadas",
    "notesFundo": "Almíscar Branco, Âmbar, Baunilha"
  },
  {
    "id": "dec-15",
    "code": "DEC-15",
    "name": "Decante Rose Mystery Intense (5ml)",
    "inspiration": "Rose Mystery Intense - Al Wataniah",
    "category": "DECANTE",
    "gender": "FEMININO",
    "price": 39.99,
    "inStock": true,
    "image": "https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/perfumes/dec-fem-02.jpg",
    "tags": [
      "Rosa",
      "Baunilha Negra",
      "Sombria"
    ],
    "notesTopo": "Rosa Escura, Pimenta, Especiarias",
    "notesCoracao": "Rosa de Maio, Gerânio, Notas Sombrias",
    "notesFundo": "Baunilha Negra, Âmbar, Almíscar"
  },
  {
    "id": "dec-16",
    "code": "DEC-16",
    "name": "Decante Fakhar Rose Gold (5ml)",
    "inspiration": "Fakhar Rose Gold - Lattafa",
    "category": "DECANTE",
    "gender": "FEMININO",
    "price": 39.99,
    "inStock": true,
    "image": "https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/perfumes/dec-fem-04.jpg",
    "tags": [
      "Rosa",
      "Adocicado",
      "Marcante"
    ],
    "notesTopo": "Rosa, Frutas Cítricas, Pêssego",
    "notesCoracao": "Rosa Damascena, Peônia, Flor de Laranjeira",
    "notesFundo": "Baunilha, Âmbar, Almíscar Branco"
  },
  {
    "id": "dec-17",
    "code": "DEC-17",
    "name": "Decante Tharwah Gold (5ml)",
    "inspiration": "Tharwah Gold - Lattafa",
    "category": "DECANTE",
    "gender": "FEMININO",
    "price": 39.99,
    "inStock": true,
    "image": "https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/perfumes/dec-fem-06.jpg",
    "tags": [
      "Floral Branco",
      "Ambarado",
      "Elegante"
    ],
    "notesTopo": "Bergamota, Flor de Laranjeira, Magnólia",
    "notesCoracao": "Jasmim, Tuberosa, Lírio-do-Vale",
    "notesFundo": "Âmbar, Almíscar, Sândalo, Baunilha"
  },
  {
    "id": "dec-18",
    "code": "DEC-18",
    "name": "Decante Yara Tous (5ml)",
    "inspiration": "Yara Tous - Lattafa",
    "category": "DECANTE",
    "gender": "FEMININO",
    "price": 39.99,
    "inStock": true,
    "image": "https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/perfumes/dec-fem-05.jpg",
    "tags": [
      "Manga",
      "Coco",
      "Baunilha Tropical"
    ],
    "notesTopo": "Manga Madura, Coco Cremoso, Frutas Tropicais",
    "notesCoracao": "Flor de Tiaré, Jasmim, Notas Gourmand",
    "notesFundo": "Baunilha, Sândalo, Almíscar, Âmbar"
  }
];

// ═══ Pix BR Code (EMV) ═══
function emv(id, val) { const l = val.length.toString().padStart(2,'0'); return `${id}${l}${val}`; }
function sanitize(s, max) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9 ]/g,'').trim().substring(0,max).toUpperCase(); }
function crc16(p) {
  let c = 0xffff;
  for (let i=0; i<p.length; i++) { c ^= p.charCodeAt(i)<<8; for(let j=0;j<8;j++) c = c&0x8000? ((c<<1)^0x1021)&0xffff : (c<<1)&0xffff; }
  return c.toString(16).toUpperCase().padStart(4,'0');
}
function genPix(amount, txid='***') {
  const ma = emv('26', emv('00','br.gov.bcb.pix') + emv('01', CONFIG.PIX_KEY));
  let p = emv('00','01') + ma + emv('52','0000') + emv('53','986');
  if (amount>0) p += emv('54', amount.toFixed(2));
  p += emv('58','BR') + emv('59', sanitize(CONFIG.MERCHANT_NAME,25)) + emv('60', sanitize(CONFIG.MERCHANT_CITY,15));
  p += emv('62', emv('05', txid.substring(0,25))) + '6304';
  return p + crc16(p);
}

async function sha256(text) {
  const d = new TextEncoder().encode(text);
  const h = await crypto.subtle.digest('SHA-256', d);
  return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

const CORS = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'GET,POST,OPTIONS', 'Access-Control-Allow-Headers':'Content-Type' };
function json(d, s=200) { return new Response(JSON.stringify(d), { status:s, headers:{'Content-Type':'application/json',...CORS} }); }

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === 'OPTIONS') return new Response(null, {headers:CORS});

    if (path === '/api/pix' && request.method === 'POST') {
      try {
        const b = await request.json();
        const amount = parseFloat(b.amount)||0;
        const payload = genPix(amount, b.txid||'***');
        return json({ success:true, payload, qrUrl:`https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(payload)}`, amount, beneficiary: CONFIG.MERCHANT_NAME });
      } catch(e) { return json({success:false, error:e.message}, 400); }
    }

    if (path === '/api/admin-login' && request.method === 'POST') {
      try {
        const b = await request.json();
        const hash = await sha256(CONFIG.ADMIN_SALT + (b.password||''));
        await new Promise(r=>setTimeout(r,300));
        return json({ success: hash === CONFIG.ADMIN_PASS_SHA256, error: hash === CONFIG.ADMIN_PASS_SHA256 ? undefined : 'Credenciais inválidas' });
      } catch { return json({success:false, error:'payload inválido'}, 400); }
    }

    if (path === '/api/leads' && request.method === 'POST') {
      try {
        const b = await request.json();
        if (!b.name||!b.phone||!b.product) return json({error:'Campos obrigatórios'}, 400);
        return json({ ok:true, received:{...b, date:new Date().toISOString()} });
      } catch { return json({error:'payload inválido'}, 400); }
    }

    if (path === '/api/products') return json({ success:true, count: PERFUMES.length, products: PERFUMES });
    if (path === '/api/health') return json({ status:'ok', service:'Mimi Mimos', runtime:'cloudflare-workers', ts:new Date().toISOString() });

    return new Response(renderHTML(), { headers: {'Content-Type':'text/html;charset=UTF-8'} });
  }
};

function renderHTML() {
  return `<!DOCTYPE html>
<html lang="pt-BR" class="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<title>Mimi Mimos | Haute Parfumerie</title>
<meta name="theme-color" content="#090a0f">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<script src="https://cdn.tailwindcss.com"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="${CONFIG.IMG_BASE}../logo-bottle.png">
<script>
tailwind.config={darkMode:'class',theme:{extend:{colors:{obsidian:{950:'#050608',900:'#090a0f',800:'#12141d'},gold:{400:'#f3ca40',500:'#d4af37'}},fontFamily:{serif:['"Cormorant Garamond"','serif']}}}};
</script>
<style>
body{background:#090a0f;color:#f3f4f6;font-family:'Plus Jakarta Sans',sans-serif;overflow-x:hidden}
.font-serif-luxury{font-family:'Cormorant Garamond',serif}
.gold-shimmer-text{background:linear-gradient(135deg,#fff,#fceeb5 40%,#d4af37 70%,#fff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-size:200% auto;animation:sT 6s linear infinite}
@keyframes sT{to{background-position:200% center}}
.glass{background:rgba(18,20,29,0.7);backdrop-filter:blur(16px);border:1px solid rgba(212,175,55,0.15)}
.btn-gold{background:linear-gradient(135deg,#d4af37,#fef1c7 50%,#b8860b);color:#090a0f;font-weight:700;transition:all .3s}
.btn-gold:hover{box-shadow:0 6px 28px rgba(212,175,55,0.45);transform:translateY(-2px)}
.card-flip{perspective:1000px}
.card-flip-inner{position:relative;width:100%;height:100%;transition:transform .8s;transform-style:preserve-3d}
.card-flip.flipped .card-flip-inner{transform:rotateY(180deg)}
.card-front,.card-back{position:absolute;width:100%;height:100%;-webkit-backface-visibility:hidden;backface-visibility:hidden;border-radius:1rem}
.card-back{transform:rotateY(180deg)}
::-webkit-scrollbar{width:6px}::-webkit-scrollbar-thumb{background:#332a15;border-radius:3px}
</style>
</head>
<body class="min-h-screen flex flex-col">
<div class="bg-gradient-to-r from-obsidian-950 via-gold-500/40 to-obsidian-950 border-b border-gold-500/20 text-gold-200 text-xs py-2 px-4 text-center uppercase tracking-widest flex justify-center items-center gap-2">
<i class="fa-solid fa-crown text-gold-400"></i><span>Mimi Mimos • Perfumaria Árabe & Importados</span><i class="fa-solid fa-crown text-gold-400"></i>
</div>
<header class="sticky top-0 z-40 glass border-b border-gold-500/20 px-4 py-3">
<div class="max-w-7xl mx-auto flex justify-between items-center">
<button onclick="scrollTo({top:0,behavior:'smooth'})" class="flex items-center gap-3">
<div class="w-14 h-14 rounded-full border-2 border-gold-500/50 flex items-center justify-center bg-obsidian-900 overflow-hidden">
<img src="${CONFIG.IMG_BASE}../logo-bottle.png" alt="Mimi Mimos" class="w-full h-full object-cover">
</div>
<div><span class="font-serif-luxury text-2xl md:text-3xl font-bold gold-shimmer-text uppercase">Mimi Mimos</span><div class="text-[9px] uppercase tracking-[0.25em] text-gold-300/70">PERFUME STORE</div></div>
</button>
<div class="flex items-center gap-3">
<input type="text" id="search" placeholder="Buscar..." class="hidden md:block bg-obsidian-900 border border-gold-500/20 rounded-full py-1.5 pl-9 pr-4 text-xs text-gray-200 focus:outline-none focus:border-gold-400">
<button onclick="toggleCart()" class="relative bg-gold-500/10 border border-gold-500/30 text-gold-300 px-3 py-1.5 rounded-full text-xs">
<i class="fa-solid fa-bag-shopping"></i> Sacola <span id="cb" class="bg-gold-500 text-obsidian-950 font-bold text-[10px] w-5 h-5 rounded-full inline-flex items-center justify-center">0</span>
</button>
</div>
</div>
</header>
<main class="flex-grow">
<section class="py-12 px-4 text-center" style="background:radial-gradient(circle at 50% -20%,rgba(212,175,55,0.25),rgba(9,10,15,0) 70%)">
<span class="inline-flex items-center gap-2 px-4 py-1 rounded-full border border-gold-500/30 bg-gold-500/10 text-gold-300 text-xs uppercase tracking-widest mb-6">
<i class="fa-solid fa-sparkles text-gold-400"></i> Brand Collection 25ml • Alta Fixação
</span>
<h1 class="font-serif-luxury text-4xl md:text-7xl font-bold text-white mb-6">A Essência do Luxo em<br><span class="gold-shimmer-text">Edição de Bolso 25ml</span></h1>
<p class="text-sm text-gray-300 max-w-2xl mx-auto mb-8">Curadoria exclusiva: Brand Collection 25ml, Miniaturas Árabes Afeer e Decantes 5ml.</p>
<div class="flex justify-center gap-4 mb-8">
<div class="glass px-6 py-3 rounded-2xl flex items-center gap-3"><span class="text-xs uppercase text-gold-300">Valor Único</span><span class="font-serif-luxury text-2xl font-bold text-gold-400">R$ 69,99</span></div>
<a href="#catalog" class="btn-gold px-8 py-3 rounded-full text-xs uppercase tracking-widest">Explorar Catálogo <i class="fa-solid fa-arrow-down"></i></a>
</div>
</section>
<section id="catalog" class="py-8 px-4 max-w-7xl mx-auto">
<div class="flex gap-2 mb-6 flex-wrap" id="filters"></div>
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" id="grid"></div>
</section>
</main>
<footer class="bg-obsidian-950 border-t border-gold-500/15 py-8 px-4 text-center text-xs text-gray-500">
<div class="flex justify-center items-center gap-3 mb-2">
<div class="w-12 h-12 rounded-full border-2 border-gold-500/50 overflow-hidden"><img src="${CONFIG.IMG_BASE}../logo-bottle.png" class="w-full h-full object-cover"></div>
<div class="text-left"><span class="font-serif-luxury text-2xl font-bold gold-shimmer-text uppercase">Mimi Mimos</span><div class="text-[9px] uppercase tracking-[0.25em] text-gold-300/70">PERFUME STORE</div></div>
</div>
<p>© ${new Date().getFullYear()} Mimi Mimos Parfumerie. Todos os direitos reservados.</p>
</footer>
<div id="cartModal" class="fixed inset-0 z-50 hidden bg-black/80 backdrop-blur-md items-center justify-center p-4">
<div class="glass max-w-md w-full rounded-2xl p-6 max-h-[85vh] overflow-y-auto">
<div class="flex justify-between items-center mb-4"><h3 class="font-serif-luxury text-xl font-bold text-white">Sua Sacola de Luxo</h3><button onclick="toggleCart()" class="text-gray-400 hover:text-white"><i class="fa-solid fa-xmark text-lg"></i></button></div>
<div id="cartItems" class="space-y-3"></div>
<div class="mt-4 pt-4 border-t border-gold-500/20">
<div class="flex justify-between text-xs mb-3"><span>Subtotal:</span><span id="sub" class="font-bold text-gold-400">R$ 0,00</span></div>
<button onclick="checkout()" class="w-full btn-gold py-3 rounded-xl text-xs uppercase"><i class="fa-solid fa-pix"></i> Finalizar com Pix</button>
</div>
</div>
</div>
<script>
const P=${JSON.stringify(PERFUMES)};
let cart=[],cat='all';
const CATS={all:'Todas',BRAND:'💎 Brand 25ml',AFEER:'🌙 Afeer Árabe',DECANTE:'🧪 Decantes 5ml',FEMININO:'👑 Feminino',MASCULINO:'⚡ Masculino',UNISSEX:'✨ Unissex'};
function fmt(v){return v.toFixed(2).replace('.',',')}
function rf(){document.getElementById('filters').innerHTML=Object.entries(CATS).map(([k,v])=>'<button onclick="sc(\''+k+'\')" class="px-4 py-1.5 rounded-full text-xs font-medium border '+(cat===k?'bg-gold-500 text-obsidian-950 border-gold-500':'bg-obsidian-800 text-gray-300 border-gold-500/20')+'">'+v+'</button>').join('')}
function sc(c){cat=c;rf();rg()}
function rg(){
const s=(document.getElementById('search').value||'').toLowerCase();
const f=P.filter(p=>{
let mc=true;
if(cat==='BRAND')mc=p.category==='BRAND';else if(cat==='AFEER')mc=p.category==='AFEER';else if(cat==='DECANTE')mc=p.category==='DECANTE';
else if(cat==='FEMININO')mc=p.gender==='FEMININO';else if(cat==='MASCULINO')mc=p.gender==='MASCULINO';else if(cat==='UNISSEX')mc=p.gender==='UNISSEX'||p.gender==='ARABE';
const ms=!s||p.name.toLowerCase().includes(s)||p.code.toLowerCase().includes(s)||p.inspiration.toLowerCase().includes(s);
return mc&&ms;
});
document.getElementById('grid').innerHTML=f.map(p=>'<div class="card-flip h-[460px]" id="c-'+p.id+'"><div class="card-flip-inner cursor-pointer" onclick="flip(\''+p.id+'\')"><div class="card-front glass border border-gold-500/20 p-4 flex flex-col justify-between overflow-hidden"><div><div class="flex justify-between mb-2"><span class="text-[10px] uppercase font-bold px-2 py-1 rounded-full bg-gold-500/10 border border-gold-500/30 text-gold-300">'+p.code+'</span><span class="text-[9px] uppercase font-bold px-2 py-0.5 rounded border '+(p.category==='DECANTE'?'text-emerald-400 bg-emerald-400/10 border-emerald-400/20':p.category==='AFEER'?'text-amber-400 bg-amber-400/10 border-amber-400/20':'text-gold-400 bg-gold-400/10 border-gold-400/20')+'">'+(p.category==='DECANTE'?'DECANTE 5ML':p.category==='AFEER'?'MINI AFEER':'BRAND 25ML')+'</span></div><div class="relative h-44 rounded-xl overflow-hidden mb-3 bg-obsidian-950"><img src="'+p.image+'" alt="'+p.name+'" class="w-full h-full object-cover" onerror="this.src=\'https://placehold.co/400x500/12141d/d4af37?text=Mimi+Mimos\'">'+(!p.inStock?'<div class="absolute inset-0 bg-black/75 flex items-center justify-center text-red-400 font-bold uppercase text-xs">Esgotado</div>':'')+'</div><h4 class="font-serif-luxury text-lg font-bold text-white truncate">'+p.name+'</h4><p class="text-xs text-gold-300/90 line-clamp-2">'+p.inspiration+'</p><div class="flex flex-wrap gap-1 mt-2">'+p.tags.slice(0,3).map(t=>'<span class="text-[9px] bg-gold-400/10 text-gold-300 border border-gold-400/20 rounded px-1.5 py-0.5">#'+t+'</span>').join('')+'</div></div><div class="pt-3 border-t border-gold-500/15 flex justify-between items-center"><div><div class="font-serif-luxury text-xl font-bold text-gold-400">R$ '+fmt(p.price)+'</div>'+(p.category==='DECANTE'?'<div class="text-[9px] text-emerald-400 font-bold">3 por R$ 100</div>':'')+'</div>'+(p.inStock?'<button onclick="event.stopPropagation();ac(\''+p.id+'\')" class="btn-gold px-3 py-2 rounded-lg text-xs uppercase"><i class="fa-solid fa-spray-can"></i> Garantir</button>':'<button onclick="event.stopPropagation();nt(\''+p.id+'\')" class="bg-emerald-700/30 border border-emerald-500/40 text-emerald-300 px-3 py-2 rounded-lg text-xs"><i class="fa-brands fa-whatsapp"></i> Avise-me</button>')+'</div></div><div class="card-back bg-obsidian-800 border border-gold-500/50 p-5 flex flex-col justify-between"><div><div class="flex justify-between border-b border-gold-500/30 pb-2 mb-3"><span class="font-serif-luxury text-gold-300">Dossier Olfativo</span><span class="text-xs text-gold-300/60">'+p.code+'</span></div><div class="space-y-2 text-xs"><div><span class="text-[10px] uppercase font-bold text-gold-400">Topo:</span><p class="text-gray-200">'+p.topNotes+'</p></div><div><span class="text-[10px] uppercase font-bold text-gold-400">Coração:</span><p class="text-gray-200">'+p.heartNotes+'</p></div><div><span class="text-[10px] uppercase font-bold text-gold-400">Fundo:</span><p class="text-gray-200">'+p.baseNotes+'</p></div></div></div><div class="text-center text-[10px] text-gold-400/80 italic pt-2 border-t border-gold-400/20">Clique para voltar</div></div></div></div>').join('');
}
function flip(id){document.getElementById('c-'+id).classList.toggle('flipped');ps()}
function ps(){try{const c=new(window.AudioContext||window.webkitAudioContext)();const b=c.createBuffer(1,c.sampleRate*0.3,c.sampleRate);const d=b.getChannelData(0);for(let i=0;i<b.length;i++)d[i]=Math.random()*2-1;const s=c.createBufferSource();s.buffer=b;const f=c.createBiquadFilter();f.type='bandpass';f.frequency.value=3200;const g=c.createGain();g.gain.setValueAtTime(0.01,c.currentTime);g.gain.exponentialRampToValueAtTime(0.3,c.currentTime+0.03);g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+0.3);s.connect(f);f.connect(g);g.connect(c.destination);s.start()}catch(e){}}
function ac(id){ps();const p=P.find(x=>x.id===id);const e=cart.find(x=>x.id===id);if(e)e.qty++;else cart.push({...p,qty:1});uc()}
function uc(){document.getElementById('cb').textContent=cart.reduce((a,i)=>a+i.qty,0);const el=document.getElementById('cartItems');let s=0;el.innerHTML=cart.length?cart.map(i=>{const t=i.price*i.qty;s+=t;return '<div class="flex items-center gap-3 bg-obsidian-900 rounded-xl p-2 text-xs"><img src="'+i.image+'" class="w-10 h-10 rounded"><div class="flex-grow"><div class="font-bold text-white">'+i.name+'</div><div class="text-gold-300">R$ '+fmt(i.price)+'</div><div class="flex gap-2 mt-1"><button onclick="cq(\''+i.id+'\',-1)" class="w-5 h-5 bg-obsidian-950 rounded">−</button><span>'+i.qty+'</span><button onclick="cq(\''+i.id+'\',1)" class="w-5 h-5 bg-obsidian-950 rounded">+</button></div></div><div class="text-right"><span class="text-gold-400 font-bold">R$ '+fmt(t)+'</span><button onclick="rc(\''+i.id+'\')" class="block text-red-400 text-[10px] ml-auto">Remover</button></div></div>'}).join(''):'<p class="text-center text-gray-500 py-8">Sacola vazia</p>';document.getElementById('sub').textContent='R$ '+fmt(s)}
function cq(id,d){const i=cart.find(x=>x.id===id);if(i){i.qty+=d;if(i.qty<=0)cart=cart.filter(x=>x.id!==id);uc()}}
function rc(id){cart=cart.filter(x=>x.id!==id);uc()}
function toggleCart(){const m=document.getElementById('cartModal');m.classList.toggle('hidden');m.classList.toggle('flex');uc()}
function checkout(){if(!cart.length)return alert('Adicione um perfume');let t=0,m='*NOVO PEDIDO - MIMI MIMOS*\n\n';cart.forEach(i=>{m+='• '+i.qty+'x '+i.name+' ('+i.code+') R$ '+fmt(i.price*i.qty)+'\n';t+=i.price*i.qty});m+='\n*TOTAL:* R$ '+fmt(t)+'\n*PAGAMENTO:* Pix\n\nAguardando confirmação!';window.open('https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text='+encodeURIComponent(m));toggleCart()}
function nt(id){const p=P.find(x=>x.id===id);window.open('https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text='+encodeURIComponent('Olá! Quero ser avisada quando o '+p.name+' ('+p.code+') chegar.'))}
document.getElementById('search').addEventListener('input',rg);
rf();rg();uc();
</script>
</body>
</html>`;
}
