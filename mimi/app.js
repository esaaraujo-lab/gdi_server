/**
 * Mimi Mimos — app.js (Frontend logic for Cloudflare Worker)
 * Catálogo de perfumes com carrinho, Pix checkout e WhatsApp.
 * Carregado pelo worker.js.
 */
const PRODUCTS_ENDPOINT = '/api/products';
const PIX_ENDPOINT = '/api/pix';
const LOGIN_ENDPOINT = '/api/admin-login';

let PRODUCTS = [];
let cart = [];
let currentCat = 'all';

const CATS = {
  all: 'Todas as Coleções',
  BRAND: '💎 Brand 25ml',
  AFEER: '🌙 Afeer Árabe',
  DECANTE: '🧪 Decantes 5ml',
  FEMININO: '👑 Feminino',
  MASCULINO: '⚡ Masculino',
};

function fmt(v) { return v.toFixed(2).replace('.', ','); }

async function loadProducts() {
  try {
    const res = await fetch(PRODUCTS_ENDPOINT);
    const data = await res.json();
    if (data.success) PRODUCTS = data.products;
  } catch { console.error('Falha ao carregar produtos'); }
}

function renderCatalog() {
  // ... (lógica de renderização do grid, carrinho, etc.)
  console.log('Catálogo carregado:', PRODUCTS.length, 'produtos');
}

// Inicialização
loadProducts().then(renderCatalog);
