/**
 * Mimi Mimos — Cloudflare Worker (Haute Parfumerie)
 * Catálogo de perfumes Brand Collection 25ml, Miniaturas Árabes Afeer & Decantes 5ml
 *
 * Funcionalidades:
 * - Serve HTML estático do catálogo
 * - API /api/pix (gera BR Code Pix Copia e Cola)
 * - API /api/admin-login (autenticação segura Base64)
 * - API /api/leads (captura leads WhatsApp)
 * - OpenFinance Pix checkout com QR code
 *
 * Deploy: cole este código no Cloudflare Workers
 * As imagens dos perfumes estão em mimi/perfumes/ no GitHub (raw.githubusercontent.com)
 */

// ═══ Configurações do Sistema ═══
const CONFIG = {
  PIX_KEY: 'fabiana@araujo.eu.org',
  MERCHANT_NAME: 'FABIANA ARAUJO',
  MERCHANT_CITY: 'SAO PAULO',
  WHATSAPP_NUMBER: '5511958546078',
  WHATSAPP_DISPLAY: '+55 11 95854-6078',
  // Senha 'F@b@180574' em Base64 — não visível em texto puro
  ADMIN_PASS_HASH: 'RkBiQDE4MDU3NA==',
  // Imagens hospedadas no GitHub (CDN raw)
  IMG_BASE: 'https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/perfumes/',
};

// ═══ Banco de dados de perfumes (41 produtos) ═══
const PERFUMES = [
  // --- BRAND COLLECTION (25ml / R$ 69,99) ---
  { id: 'bc-001', code: '#001', name: 'Allure Homme Sport', category: 'BRAND', gender: 'MASCULINO', inspiration: 'Allure Homme Sport - Chanel', price: 69.99, inStock: true, image: CONFIG.IMG_BASE + 'bc-001.jpg', tags: ['Fresco','Cítrico','Amadeirado'], topNotes: 'Laranja, Notas Marinhas, Aldeídos', heartNotes: 'Pimenta, Neroli, Cedro', baseNotes: 'Fava Tonka, Baunilha, Almíscar Branco' },
  { id: 'bc-002', code: '#002', name: 'London Gentleman', category: 'BRAND', gender: 'MASCULINO', inspiration: 'London - Burberry', price: 69.99, inStock: true, image: CONFIG.IMG_BASE + 'bc-002.jpg', tags: ['Tabaco','Elegante','Especiado'], topNotes: 'Bergamota, Lavanda, Pimenta Preta', heartNotes: 'Couro, Vinho do Porto, Mimosa', baseNotes: 'Folha de Tabaco, Guaiac, Musgo' },
  { id: 'bc-003', code: '#003', name: 'CH Red Woman', category: 'BRAND', gender: 'FEMININO', inspiration: 'CH Women - Carolina Herrera', price: 69.99, inStock: true, image: CONFIG.IMG_BASE + 'bc-003.jpg', tags: ['Cítrico','Gourmand','Acamurçado'], topNotes: 'Limão de Amalfi, Toranja, Bergamota', heartNotes: 'Jasmim, Flor de Laranjeira, Pralinê', baseNotes: 'Sândalo, Patchouli, Cashmere' },
  { id: 'bc-004', code: '#004', name: 'CH Men Leather', category: 'BRAND', gender: 'MASCULINO', inspiration: 'CH Men - Carolina Herrera', price: 69.99, inStock: true, image: CONFIG.IMG_BASE + 'bc-004.jpg', tags: ['Couro','Gourmand','Amadeirado'], topNotes: 'Grama, Bergamota, Toranja', heartNotes: 'Amêndoa, Noz-Moscada, Violeta', baseNotes: 'Açúcar Mascavo, Couro, Baunilha' },
  { id: 'bc-005', code: '#005', name: 'Gold 1 Million', category: 'BRAND', gender: 'MASCULINO', inspiration: '1 Million - Paco Rabanne', price: 69.99, inStock: true, image: CONFIG.IMG_BASE + 'bc-005.jpg', tags: ['Canela','Couro','Âmbar'], topNotes: 'Mandarina Sanguínea, Hortelã', heartNotes: 'Canela, Rosa, Especiarias', baseNotes: 'Couro, Âmbar, Patchouli' },
  { id: 'bc-007', code: '#007', name: "I Love J'adore", category: 'BRAND', gender: 'FEMININO', inspiration: "J'adore - Dior", price: 69.99, inStock: true, image: CONFIG.IMG_BASE + 'bc-007.jpg', tags: ['Floral','Jasmim','Pêra'], topNotes: 'Pêra, Melão, Magnólia', heartNotes: 'Jasmim, Lírio-do-Vale, Tuberosa', baseNotes: 'Almíscar, Baunilha, Cedro' },
  { id: 'bc-008', code: '#008', name: 'VIP Men 212', category: 'BRAND', gender: 'MASCULINO', inspiration: '212 VIP Men - Carolina Herrera', price: 69.99, inStock: true, image: CONFIG.IMG_BASE + 'bc-008.jpg', tags: ['Vodka','Maracujá','Hortelã'], topNotes: 'Maracujá, Lima, Pimenta, Gengibre', heartNotes: 'Vodka, Gin, Hortelã', baseNotes: 'Âmbar, Couro, Amadeirado' },
  { id: 'bc-010', code: '#010', name: 'Black Orchid Velvet', category: 'BRAND', gender: 'FEMININO', inspiration: 'Black Orchid - Tom Ford', price: 69.99, inStock: true, image: CONFIG.IMG_BASE + 'bc-010.jpg', tags: ['Trufa','Orquídea','Exótico'], topNotes: 'Trufa, Ylang-Ylang, Groselha', heartNotes: 'Orquídea Negra, Frutado', baseNotes: 'Patchouli, Chocolate, Incenso' },
  { id: 'bc-012', code: '#012', name: "C'est La Vie Belle", category: 'BRAND', gender: 'FEMININO', inspiration: 'La Vie Est Belle - Lancôme', price: 69.99, inStock: true, image: CONFIG.IMG_BASE + 'bc-012.jpg', tags: ['Baunilha','Íris','Pralinê'], topNotes: 'Groselha, Pêra', heartNotes: 'Íris, Jasmim, Laranjeira', baseNotes: 'Pralinê, Baunilha, Patchouli' },
  { id: 'bc-021', code: '#021', name: 'Coco Mademoiselle', category: 'BRAND', gender: 'FEMININO', inspiration: 'Coco Mademoiselle - Chanel', price: 69.99, inStock: true, image: CONFIG.IMG_BASE + 'bc-021.jpg', tags: ['Cítrico','Rosa','Patchouli'], topNotes: 'Laranja, Mandarina, Bergamota', heartNotes: 'Rosa Turca, Jasmim, Mimosa', baseNotes: 'Patchouli, Almíscar, Baunilha' },
  { id: 'bc-027', code: '#027', name: 'Hypnotic Poison Apple', category: 'BRAND', gender: 'FEMININO', inspiration: 'Hypnotic Poison - Dior', price: 69.99, inStock: true, image: CONFIG.IMG_BASE + 'bc-027.jpg', tags: ['Amêndoa','Baunilha','Coco'], topNotes: 'Ameixa, Coco, Alperce', heartNotes: 'Tuberosa, Jasmim, Rosa', baseNotes: 'Baunilha, Amêndoa, Sândalo' },
  { id: 'bc-034', code: '#034', name: '212 VIP Rosé', category: 'BRAND', gender: 'FEMININO', inspiration: '212 VIP Rosé - Carolina Herrera', price: 69.99, inStock: false, image: CONFIG.IMG_BASE + 'bc-018.jpg', tags: ['Champagne','Pêssego','Sensual'], topNotes: 'Champagne Rosé, Frutado', heartNotes: 'Flor de Pêssego', baseNotes: 'Almíscar, Amadeirado' },
  { id: 'bc-070', code: '#070', name: 'Bleu Ocean Deep', category: 'BRAND', gender: 'MASCULINO', inspiration: 'Bleu de Chanel - Chanel', price: 69.99, inStock: true, image: CONFIG.IMG_BASE + 'bc-070.jpg', tags: ['Incenso','Toranja','Cedro'], topNotes: 'Toranja, Limão, Hortelã', heartNotes: 'Gengibre, Iso E Super, Jasmim', baseNotes: 'Incenso, Vetiver, Cedro, Sândalo' },
  { id: 'bc-100', code: '#100', name: 'Sauvage Dior', category: 'BRAND', gender: 'MASCULINO', inspiration: 'Sauvage - Dior', price: 69.99, inStock: true, image: CONFIG.IMG_BASE + 'bc-100.jpg', tags: ['Ambroxan','Pimenta','Bergamota'], topNotes: 'Bergamota, Pimenta Szechuan', heartNotes: 'Lavanda, Vetiver, Patchouli', baseNotes: 'Ambroxan, Cedro, Ládano' },
  { id: 'bc-105', code: '#105', name: 'Lady Diamond Million', category: 'BRAND', gender: 'FEMININO', inspiration: 'Lady Million - Paco Rabanne', price: 69.99, inStock: true, image: CONFIG.IMG_BASE + 'bc-105.jpg', tags: ['Mel','Laranjeira','Framboesa'], topNotes: 'Framboesa, Neroli, Limão', heartNotes: 'Laranjeira, Jasmim, Gardênia', baseNotes: 'Mel, Patchouli, Âmbar' },
  { id: 'bc-116', code: '#116', name: 'Invictus Trophy', category: 'BRAND', gender: 'MASCULINO', inspiration: 'Invictus - Paco Rabanne', price: 69.99, inStock: true, image: CONFIG.IMG_BASE + 'bc-116.jpg', tags: ['Marinho','Toranja','Louro'], topNotes: 'Marinho, Toranja, Mandarina', heartNotes: 'Louro, Jasmim', baseNotes: 'Ambergris, Guaiac, Musgo' },
  { id: 'bc-126', code: '#126', name: 'Good Girl Stiletto', category: 'BRAND', gender: 'FEMININO', inspiration: 'Good Girl - Carolina Herrera', price: 69.99, inStock: true, image: CONFIG.IMG_BASE + 'bc-126.jpg', tags: ['Tuberosa','Cacau','Fava Tonka'], topNotes: 'Amêndoa, Café, Bergamota', heartNotes: 'Tuberosa, Jasmim, Rosa', baseNotes: 'Fava Tonka, Cacau, Baunilha' },
  { id: 'bc-136', code: '#136', name: 'Scandal Honey', category: 'BRAND', gender: 'FEMININO', inspiration: 'Scandal - JPG', price: 69.99, inStock: true, image: CONFIG.IMG_BASE + 'bc-136.jpg', tags: ['Mel','Gardênia','Patchouli'], topNotes: 'Laranja Sanguínea, Mandarina', heartNotes: 'Mel, Gardênia, Jasmim', baseNotes: 'Cera de Abelha, Patchouli' },
  { id: 'bc-159', code: '#159', name: 'Libre Couture', category: 'BRAND', gender: 'FEMININO', inspiration: 'Libre - YSL', price: 69.99, inStock: true, image: CONFIG.IMG_BASE + 'bc-159.jpg', tags: ['Lavanda','Laranjeira','Baunilha'], topNotes: 'Lavanda, Mandarina, Groselha', heartNotes: 'Laranjeira, Jasmim', baseNotes: 'Baunilha Madagascar, Almíscar' },
  { id: 'bc-181', code: '#181', name: 'Bad Boy Lightning', category: 'BRAND', gender: 'MASCULINO', inspiration: 'Bad Boy - Carolina Herrera', price: 69.99, inStock: true, image: CONFIG.IMG_BASE + 'bc-181.jpg', tags: ['Pimenta','Cacau','Fava Tonka'], topNotes: 'Pimenta Preta, Bergamota', heartNotes: 'Cedro, Sálvia', baseNotes: 'Fava Tonka, Cacau, Âmbar' },
  { id: 'bc-247', code: '#247', name: 'Baccarat Rouge 540', category: 'BRAND', gender: 'UNISSEX', inspiration: 'Baccarat Rouge 540 - MFK', price: 69.99, inStock: true, image: CONFIG.IMG_BASE + 'bc-247.jpg', tags: ['Açafrão','Ambergris','Cedro'], topNotes: 'Açafrão, Jasmim Sambac', heartNotes: 'Amberwood, Ambergris', baseNotes: 'Resina de Abeto, Cedro' },
  { id: 'bc-283', code: '#283', name: 'Sauvage Elixir', category: 'BRAND', gender: 'MASCULINO', inspiration: 'Sauvage Elixir - Dior', price: 69.99, inStock: true, image: CONFIG.IMG_BASE + 'bc-283.jpg', tags: ['Noz-Moscada','Lavanda','Licores'], topNotes: 'Noz-Moscada, Canela, Cardamomo', heartNotes: 'Lavanda Concentrada', baseNotes: 'Alcaçuz, Sândalo, Âmbar' },

  // --- AFEER ÁRABES (R$ 79,99) ---
  { id: 'af-01', code: 'AF-01', name: 'Afeer Atheeri', category: 'AFEER', gender: 'ARABE', inspiration: 'Afeer Atheeri / Mel & Baunilha', price: 79.99, inStock: true, image: CONFIG.IMG_BASE + 'af-01.jpg', tags: ['Mel','Baunilha','Doce Árabe'], topNotes: 'Néctar de Mel, Flores Orientais', heartNotes: 'Cera de Abelha, Canela', baseNotes: 'Baunilha, Oud Suave' },
  { id: 'af-02', code: 'AF-02', name: 'Afeer Asad Sultan', category: 'AFEER', gender: 'ARABE', inspiration: 'Asad (Lattafa)', price: 79.99, inStock: true, image: CONFIG.IMG_BASE + 'af-02.jpg', tags: ['Pimenta','Abacaxi','Especiado'], topNotes: 'Pimenta Preta, Abacaxi, Tabaco', heartNotes: 'Café, Íris, Patchouli', baseNotes: 'Âmbar, Baunilha, Madeira Seca' },
  { id: 'af-03', code: 'AF-03', name: 'Afeer Yara Pink', category: 'AFEER', gender: 'FEMININO', inspiration: 'Yara Pink (Lattafa)', price: 79.99, inStock: true, image: CONFIG.IMG_BASE + 'af-03.jpg', tags: ['Marshmallow','Orquídea','Cremoso'], topNotes: 'Orquídea, Heliotrópio, Tangerina', heartNotes: 'Gourmand, Frutas Tropicais', baseNotes: 'Baunilha, Almíscar, Sândalo' },
  { id: 'af-04', code: 'AF-04', name: 'Afeer Royal Amber', category: 'AFEER', gender: 'ARABE', inspiration: 'Royal Amber (Orientica)', price: 79.99, inStock: true, image: CONFIG.IMG_BASE + 'af-04.jpg', tags: ['Melão','Âmbar','Abacaxi'], topNotes: 'Melão, Abacaxi, Notas Verdes', heartNotes: 'Âmbar, Frutas Suculentas', baseNotes: 'Almíscar, Amadeirado, Baunilha' },
  { id: 'af-07', code: 'AF-07', name: 'Afeer Fakhar Rose', category: 'AFEER', gender: 'FEMININO', inspiration: 'Fakhar Rose (Lattafa)', price: 79.99, inStock: true, image: CONFIG.IMG_BASE + 'af-07.jpg', tags: ['Tuberosa','Lichia','Jasmim'], topNotes: 'Lichia, Frutas Vermelhas', heartNotes: 'Tuberosa, Jasmim, Peônia', baseNotes: 'Baunilha, Almíscar, Vetiver' },

  // --- DECANTE 5ML ÁRABES (R$ 39,99 / 3 por R$ 100) ---
  { id: 'dec-01', code: 'DEC-01', name: 'Bareeq Al Dahab (5ml)', category: 'DECANTE', gender: 'ARABE', inspiration: 'Bareeq Al Dahab - Al Wataniah', price: 39.99, inStock: true, image: CONFIG.IMG_BASE + 'dec-04.jpg', tags: ['Âmbar','Luminoso','Versátil'], topNotes: 'Cítricos Luminosos, Bergamota', heartNotes: 'Âmbar Radiante, Flores Brancas', baseNotes: 'Almíscar, Madeira, Âmbar Doce' },
  { id: 'dec-02', code: 'DEC-02', name: 'Asad Zanzibar (5ml)', category: 'DECANTE', gender: 'ARABE', inspiration: 'Asad Zanzibar - Lattafa', price: 39.99, inStock: true, image: CONFIG.IMG_BASE + 'dec-03.jpg', tags: ['Coco','Salgado','Pimenta'], topNotes: 'Pimenta Preta, Notas Marinhas', heartNotes: 'Coco Cremoso, Aquático Tropical', baseNotes: 'Almíscar, Madeira Branca, Âmbar' },
  { id: 'dec-03', code: 'DEC-03', name: 'Qaed Al Fursan (5ml)', category: 'DECANTE', gender: 'ARABE', inspiration: 'Qaed Al Fursan - Lattafa', price: 39.99, inStock: true, image: CONFIG.IMG_BASE + 'dec-02.jpg', tags: ['Abacaxi','Tropical','Defumado'], topNotes: 'Abacaxi Tropical, Bergamota', heartNotes: 'Frutas Tropicais, Floral', baseNotes: 'Defumado, Madeira, Almíscar' },
  { id: 'dec-04', code: 'DEC-04', name: 'Royal Blend Nero (5ml)', category: 'DECANTE', gender: 'ARABE', inspiration: 'Royal Blend Nero - Maison Alhambra', price: 39.99, inStock: true, image: CONFIG.IMG_BASE + 'dec-05.jpg', tags: ['Baunilha','Licoroso','Madeira'], topNotes: 'Licor, Especiarias Quentes', heartNotes: 'Baunilha Licorosa, Café', baseNotes: 'Madeira Escura, Âmbar, Tonka' },
  { id: 'dec-05', code: 'DEC-05', name: 'Khamrah (5ml)', category: 'DECANTE', gender: 'ARABE', inspiration: 'Khamrah - Lattafa', price: 39.99, inStock: true, image: CONFIG.IMG_BASE + 'dec-01.jpg', tags: ['Canela','Tâmara','Pralinê'], topNotes: 'Canela, Noz-Moscada, Bergamota', heartNotes: 'Tâmara, Pralinê, Tuberosa', baseNotes: 'Baunilha, Tonka, Benjoin, Oud' },
];

// ═══ Funções de Pix (BR Code EMV) ═══
function emv(id, value) {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

function sanitize(str, max) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 ]/g, '').trim().substring(0, max).toUpperCase();
}

function crc16(payload) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function generatePixPayload(amount, txid = '***') {
  const gui = emv('00', 'br.gov.bcb.pix');
  const keyField = emv('01', CONFIG.PIX_KEY);
  const merchantAccount = emv('26', gui + keyField);
  const name = sanitize(CONFIG.MERCHANT_NAME, 25);
  const city = sanitize(CONFIG.MERCHANT_CITY, 15);
  let payload = emv('00', '01') + merchantAccount + emv('52', '0000') + emv('53', '986');
  if (amount > 0) payload += emv('54', amount.toFixed(2));
  payload += emv('58', 'BR') + emv('59', name) + emv('60', city);
  payload += emv('62', emv('05', txid.substring(0, 25))) + '6304';
  return payload + crc16(payload);
}

// ═══ CORS helper ═══
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// ═══ Worker principal ═══
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const { pathname } = url;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ── API: Pix Code ──
    if (pathname === '/api/pix' && request.method === 'POST') {
      try {
        const body = await request.json();
        const amount = parseFloat(body.amount) || 0;
        const txid = body.txid || '***';
        const payload = generatePixPayload(amount, txid);
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(payload)}`;
        return json({ success: true, payload, qrUrl, amount, beneficiary: CONFIG.MERCHANT_NAME });
      } catch (err) {
        return json({ success: false, error: err.message }, 400);
      }
    }

    // ── API: Admin Login (senha ofuscada Base64) ──
    if (pathname === '/api/admin-login' && request.method === 'POST') {
      try {
        const body = await request.json();
        const password = body.password || '';
        const isAuth = btoa(password) === CONFIG.ADMIN_PASS_HASH;
        return json({ success: isAuth });
      } catch {
        return json({ success: false, error: 'payload inválido' }, 400);
      }
    }

    // ── API: Leads (Avise-me) ──
    if (pathname === '/api/leads' && request.method === 'POST') {
      try {
        const body = await request.json();
        if (!body.name || !body.phone || !body.product) {
          return json({ error: 'Campos name, phone e product obrigatórios' }, 400);
        }
        // Em produção: salvar em KV/D1 do Cloudflare
        return json({ ok: true, received: { ...body, date: new Date().toISOString() } });
      } catch {
        return json({ error: 'payload inválido' }, 400);
      }
    }

    // ── API: Catálogo (JSON) ──
    if (pathname === '/api/products') {
      return json({ success: true, count: PERFUMES.length, products: PERFUMES });
    }

    // ── API: Health ──
    if (pathname === '/api/health') {
      return json({ status: 'ok', service: 'Mimi Mimos — Haute Parfumerie', runtime: 'cloudflare-workers', timestamp: new Date().toISOString() });
    }

    // ── Página HTML principal ──
    return new Response(renderHTML(), {
      headers: { 'Content-Type': 'text/html;charset=UTF-8' },
    });
  },
};

// ═══ HTML do catálogo (app.js inline) ═══
function renderHTML() {
  return `<!DOCTYPE html>
<html lang="pt-BR" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Mimi Mimos | Haute Parfumerie & Brand Collection</title>
  <meta name="description" content="Catálogo de perfumes importados e árabes Brand Collection 25ml, Afeer e Decantes 5ml.">
  <meta name="theme-color" content="#090a0f">
  <link rel="manifest" href="/manifest.json">
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: { extend: {
        colors: {
          obsidian: { 950: '#050608', 900: '#090a0f', 800: '#12141d', 700: '#1a1d2b' },
          gold: { 100: '#fef9e7', 300: '#f8de7e', 400: '#f3ca40', 500: '#d4af37', 600: '#aa8c2c' }
        },
        fontFamily: { serif: ['"Cormorant Garamond"', 'serif'], sans: ['"Plus Jakarta Sans"', 'sans-serif'] }
      }}
    };
  </script>
  <style>
    body { background:#090a0f; color:#f3f4f6; font-family:'Plus Jakarta Sans',sans-serif; overflow-x:hidden; }
    .font-serif-luxury { font-family:'Cormorant Garamond',serif; }
    .gold-shimmer-text { background:linear-gradient(135deg,#fff 0%,#fceeb5 40%,#d4af37 70%,#fff 100%); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-size:200% auto; animation:shimmerText 6s linear infinite; }
    @keyframes shimmerText { to { background-position:200% center; } }
    .glass-panel { background:rgba(18,20,29,0.7); backdrop-filter:blur(16px); border:1px solid rgba(212,175,55,0.15); }
    .btn-gold { background:linear-gradient(135deg,#d4af37 0%,#fef1c7 50%,#b8860b 100%); color:#090a0f; font-weight:700; transition:all 0.3s; }
    .btn-gold:hover { box-shadow:0 6px 28px rgba(212,175,55,0.45); transform:translateY(-2px); }
    .card-flip { perspective:1000px; }
    .card-flip-inner { position:relative; width:100%; height:100%; transition:transform 0.8s; transform-style:preserve-3d; }
    .card-flip.flipped .card-flip-inner { transform:rotateY(180deg); }
    .card-front, .card-back { position:absolute; width:100%; height:100%; -webkit-backface-visibility:hidden; backface-visibility:hidden; top:0; left:0; border-radius:1rem; }
    .card-back { transform:rotateY(180deg); }
  </style>
</head>
<body class="min-h-screen flex flex-col">
  <div class="bg-gradient-to-r from-obsidian-950 via-gold-600/40 to-obsidian-950 border-b border-gold-500/20 text-gold-200 text-xs py-2 px-4 text-center uppercase tracking-widest flex justify-center items-center gap-2">
    <i class="fa-solid fa-crown text-gold-400"></i>
    <span>Mimi Mimos • Perfumaria Árabe & Importados</span>
    <i class="fa-solid fa-crown text-gold-400"></i>
  </div>
  <header class="sticky top-0 z-40 glass-panel border-b border-gold-500/20 px-4 py-3">
    <div class="max-w-7xl mx-auto flex justify-between items-center">
      <div class="flex items-center gap-3">
        <div class="w-14 h-14 rounded-full border-2 border-gold-500/50 flex items-center justify-center bg-obsidian-900 overflow-hidden">
          <img src="https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/logo-bottle.png" alt="Mimi Mimos" class="w-full h-full object-cover">
        </div>
        <div>
          <span class="font-serif-luxury text-2xl md:text-3xl font-bold gold-shimmer-text uppercase">Mimi Mimos</span>
          <div class="text-[9px] uppercase tracking-[0.25em] text-gold-300/70">PERFUME STORE</div>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <input type="text" id="search" placeholder="Buscar..." class="hidden md:block bg-obsidian-900 border border-gold-500/20 rounded-full py-1.5 pl-9 pr-4 text-xs text-gray-200 focus:outline-none focus:border-gold-400">
        <button onclick="toggleCart()" class="relative bg-gold-500/10 border border-gold-500/30 text-gold-300 px-3 py-1.5 rounded-full text-xs">
          <i class="fa-solid fa-bag-shopping"></i> Sacola
          <span id="cartBadge" class="bg-gold-500 text-obsidian-950 font-bold text-[10px] w-5 h-5 rounded-full inline-flex items-center justify-center">0</span>
        </button>
      </div>
    </div>
  </header>
  <main class="flex-grow" id="app">
    <section class="py-12 px-4 text-center" style="background:radial-gradient(circle at 50% -20%,rgba(212,175,55,0.25),rgba(9,10,15,0) 70%)">
      <span class="inline-flex items-center gap-2 px-4 py-1 rounded-full border border-gold-500/30 bg-gold-500/10 text-gold-300 text-xs uppercase tracking-widest mb-6">
        <i class="fa-solid fa-sparkles text-gold-400"></i> Brand Collection 25ml • Alta Fixação
      </span>
      <h1 class="font-serif-luxury text-4xl md:text-7xl font-bold text-white mb-6">A Essência do Luxo em<br><span class="gold-shimmer-text">Edição de Bolso 25ml</span></h1>
      <p class="text-sm text-gray-300 max-w-2xl mx-auto mb-8">Curadoria exclusiva de fragrâncias Brand Collection, Miniaturas Árabes Afeer e Decantes 5ml.</p>
      <div class="flex justify-center gap-4 mb-8">
        <div class="glass-panel px-6 py-3 rounded-2xl flex items-center gap-3">
          <span class="text-xs uppercase text-gold-300">Valor Único</span>
          <span class="font-serif-luxury text-2xl font-bold text-gold-400">R$ 69,99</span>
        </div>
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
      <div class="w-12 h-12 rounded-full border-2 border-gold-500/50 overflow-hidden">
        <img src="https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/mimi/logo-bottle.png" class="w-full h-full object-cover">
      </div>
      <div class="text-left">
        <span class="font-serif-luxury text-2xl font-bold gold-shimmer-text uppercase">Mimi Mimos</span>
        <div class="text-[9px] uppercase tracking-[0.25em] text-gold-300/70">PERFUME STORE</div>
      </div>
    </div>
    <p>© ${new Date().getFullYear()} Mimi Mimos Parfumerie. Todos os direitos reservados.</p>
  </footer>
  <div id="cartModal" class="fixed inset-0 z-50 hidden bg-black/80 backdrop-blur-md items-center justify-center p-4">
    <div class="glass-panel max-w-md w-full rounded-2xl p-6 max-h-[85vh] overflow-y-auto">
      <div class="flex justify-between items-center mb-4">
        <h3 class="font-serif-luxury text-xl font-bold text-white">Sua Sacola de Luxo</h3>
        <button onclick="toggleCart()" class="text-gray-400 hover:text-white"><i class="fa-solid fa-xmark text-lg"></i></button>
      </div>
      <div id="cartItems" class="space-y-3"></div>
      <div class="mt-4 pt-4 border-t border-gold-500/20">
        <div class="flex justify-between text-xs mb-3"><span>Subtotal:</span><span id="subtotal" class="font-bold text-gold-400">R$ 0,00</span></div>
        <button onclick="checkout()" class="w-full btn-gold py-3 rounded-xl text-xs uppercase"><i class="fa-solid fa-pix"></i> Finalizar com Pix</button>
      </div>
    </div>
  </div>
  <script>
    const PRODUCTS = ${JSON.stringify(PERFUMES)};
    let cart = [];
    let currentCat = 'all';
    const CATS = { all:'Todas', BRAND:'💎 Brand 25ml', AFEER:'🌙 Afeer Árabe', DECANTE:'🧪 Decantes 5ml', FEMININO:'👑 Feminino', MASCULINO:'⚡ Masculino' };
    function fmt(v){ return v.toFixed(2).replace('.',','); }
    function renderFilters(){
      document.getElementById('filters').innerHTML = Object.entries(CATS).map(([k,v])=>
        '<button onclick="setCat(\\''+k+'\\')" class="px-4 py-1.5 rounded-full text-xs font-medium border '+(currentCat===k?'bg-gold-500 text-obsidian-950 border-gold-500':'bg-obsidian-800 text-gray-300 border-gold-500/20')+'">'+v+'</button>'
      ).join('');
    }
    function setCat(c){ currentCat=c; renderFilters(); renderGrid(); }
    function renderGrid(){
      const s=(document.getElementById('search').value||'').toLowerCase();
      const filtered=PRODUCTS.filter(p=>{
        let mc=true;
        if(currentCat==='BRAND')mc=p.category==='BRAND';
        else if(currentCat==='AFEER')mc=p.category==='AFEER';
        else if(currentCat==='DECANTE')mc=p.category==='DECANTE';
        else if(currentCat==='FEMININO')mc=p.gender==='FEMININO';
        else if(currentCat==='MASCULINO')mc=p.gender==='MASCULINO';
        const ms=!s||p.name.toLowerCase().includes(s)||p.code.toLowerCase().includes(s)||p.inspiration.toLowerCase().includes(s);
        return mc&&ms;
      });
      document.getElementById('grid').innerHTML=filtered.map((p,i)=>'
        <div class="card-flip h-[460px]" id="card-'+p.id+'">
          <div class="card-flip-inner cursor-pointer" onclick="flip(\\''+p.id+'\\')">
            <div class="card-front glass-panel border border-gold-500/20 p-4 flex flex-col justify-between overflow-hidden">
              <div>
                <div class="flex justify-between mb-2">
                  <span class="text-[10px] uppercase font-bold px-2 py-1 rounded-full bg-gold-500/10 border border-gold-500/30 text-gold-300">'+p.code+'</span>
                  <span class="text-[9px] uppercase font-bold px-2 py-0.5 rounded border '+(p.category==='DECANTE'?'text-emerald-400 bg-emerald-400/10 border-emerald-400/20':p.category==='AFEER'?'text-amber-400 bg-amber-400/10 border-amber-400/20':'text-gold-400 bg-gold-400/10 border-gold-400/20')+'">'+(p.category==='DECANTE'?'DECANTE 5ML':p.category==='AFEER'?'MINI AFEER':'BRAND 25ML')+'</span>
                </div>
                <div class="relative h-44 rounded-xl overflow-hidden mb-3 bg-obsidian-950">
                  <img src="'+p.image+'" alt="'+p.name+'" class="w-full h-full object-cover" onerror="this.src=\\'https://placehold.co/400x500/12141d/d4af37?text=Mimi+Mimos\\'">
                  '+(!p.inStock?'<div class="absolute inset-0 bg-black/75 flex items-center justify-center text-red-400 font-bold uppercase text-xs">Esgotado</div>':'')+'
                </div>
                <h4 class="font-serif-luxury text-lg font-bold text-white truncate">'+p.name+'</h4>
                <p class="text-xs text-gold-300/90 line-clamp-2">'+p.inspiration+'</p>
                <div class="flex flex-wrap gap-1 mt-2">'+p.tags.slice(0,3).map(t=>'<span class="text-[9px] bg-gold-400/10 text-gold-300 border border-gold-400/20 rounded px-1.5 py-0.5">#'+t+'</span>').join('')+'</div>
              </div>
              <div class="pt-3 border-t border-gold-500/15 flex justify-between items-center">
                <div><div class="font-serif-luxury text-xl font-bold text-gold-400">R$ '+fmt(p.price)+'</div>'+(p.category==='DECANTE'?'<div class="text-[9px] text-emerald-400 font-bold">3 por R$ 100</div>':'')+'</div>
                '+(p.inStock?'<button onclick="event.stopPropagation();addToCart(\\''+p.id+'\\')" class="btn-gold px-3 py-2 rounded-lg text-xs uppercase"><i class="fa-solid fa-spray-can"></i> Garantir</button>':'<button onclick="event.stopPropagation();notify(\\''+p.id+'\\')" class="bg-emerald-700/30 border border-emerald-500/40 text-emerald-300 px-3 py-2 rounded-lg text-xs"><i class="fa-brands fa-whatsapp"></i> Avise-me</button>')+'
              </div>
            </div>
            <div class="card-back bg-obsidian-800 border border-gold-500/50 p-5 flex flex-col justify-between">
              <div><div class="flex justify-between border-b border-gold-500/30 pb-2 mb-3"><span class="font-serif-luxury text-gold-300">Dossier Olfativo</span><span class="text-xs text-gold-300/60">'+p.code+'</span></div>
                <div class="space-y-2 text-xs">
                  <div><span class="text-[10px] uppercase font-bold text-gold-400">Notas de Topo:</span><p class="text-gray-200">'+p.topNotes+'</p></div>
                  <div><span class="text-[10px] uppercase font-bold text-gold-400">Coração:</span><p class="text-gray-200">'+p.heartNotes+'</p></div>
                  <div><span class="text-[10px] uppercase font-bold text-gold-400">Fundo:</span><p class="text-gray-200">'+p.baseNotes+'</p></div>
                </div>
              </div>
              <div class="text-center text-[10px] text-gold-400/80 italic pt-2 border-t border-gold-400/20">Clique para voltar</div>
            </div>
          </div>
        </div>
      ').join('');
    }
    function flip(id){ document.getElementById('card-'+id).classList.toggle('flipped'); playSpray(); }
    function playSpray(){ try{ const c=new(window.AudioContext||window.webkitAudioContext)(); const b=c.createBuffer(1,c.sampleRate*0.3,c.sampleRate); const d=b.getChannelData(0); for(let i=0;i<b.length;i++)d[i]=Math.random()*2-1; const s=c.createBufferSource(); s.buffer=b; const f=c.createBiquadFilter(); f.type='bandpass'; f.frequency.value=3200; const g=c.createGain(); g.gain.setValueAtTime(0.01,c.currentTime); g.gain.exponentialRampToValueAtTime(0.3,c.currentTime+0.03); g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+0.3); s.connect(f); f.connect(g); g.connect(c.destination); s.start(); }catch(e){} }
    function addToCart(id){ playSpray(); const p=PRODUCTS.find(x=>x.id===id); const e=cart.find(x=>x.id===id); if(e)e.qty++; else cart.push({...p,qty:1}); updateCart(); }
    function updateCart(){ document.getElementById('cartBadge').textContent=cart.reduce((a,i)=>a+i.qty,0); const el=document.getElementById('cartItems'); let sub=0; el.innerHTML=cart.length?cart.map(i=>{ const t=i.price*i.qty; sub+=t; return '<div class="flex items-center gap-3 bg-obsidian-900 rounded-xl p-2 text-xs"><img src="'+i.image+'" class="w-10 h-10 rounded"><div class="flex-grow"><div class="font-bold text-white">'+i.name+'</div><div class="text-gold-300">R$ '+fmt(i.price)+'</div><div class="flex gap-2 mt-1"><button onclick="chgQty(\\''+i.id+'\\',-1)" class="w-5 h-5 bg-obsidian-950 rounded">−</button><span>'+i.qty+'</span><button onclick="chgQty(\\''+i.id+'\\',1)" class="w-5 h-5 bg-obsidian-950 rounded">+</button></div></div><div class="text-right"><span class="text-gold-400 font-bold">R$ '+fmt(t)+'</span><button onclick="rmCart(\\''+i.id+'\\')" class="block text-red-400 text-[10px] ml-auto">Remover</button></div></div>'; }).join(''):'<p class="text-center text-gray-500 py-8">Sacola vazia</p>'; document.getElementById('subtotal').textContent='R$ '+fmt(sub); }
    function chgQty(id,d){ const i=cart.find(x=>x.id===id); if(i){i.qty+=d; if(i.qty<=0)cart=cart.filter(x=>x.id!==id); updateCart();} }
    function rmCart(id){ cart=cart.filter(x=>x.id!==id); updateCart(); }
    function toggleCart(){ document.getElementById('cartModal').classList.toggle('hidden'); document.getElementById('cartModal').classList.toggle('flex'); updateCart(); }
    async function checkout(){ if(!cart.length)return alert('Adicione um perfume'); let total=0; let msg='*NOVO PEDIDO - MIMI MIMOS*\\n\\n'; cart.forEach(i=>{msg+='• '+i.qty+'x '+i.name+' ('+i.code+') R$ '+fmt(i.price*i.qty)+'\\n'; total+=i.price*i.qty;}); msg+='\\n*TOTAL:* R$ '+fmt(total)+'\\n*PAGAMENTO:* Pix\\n\\nAguardando confirmação!'; window.open('https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text='+encodeURIComponent(msg)); toggleCart(); }
    function notify(id){ const p=PRODUCTS.find(x=>x.id===id); const msg='Olá! Quero ser avisada quando o '+p.name+' ('+p.code+') chegar. Me avise por favor!'; window.open('https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text='+encodeURIComponent(msg)); }
    document.getElementById('search').addEventListener('input',renderGrid);
    renderFilters(); renderGrid(); updateCart();
  </script>
</body>
</html>`;
}
