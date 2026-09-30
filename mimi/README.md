# Mimi Mimos — Haute Parfumerie (Cloudflare Worker)

Catálogo de perfumes importados e árabes: Brand Collection 25ml, Miniaturas Árabes Afeer e Decantes 5ml.

## Deploy no Cloudflare Workers

1. Acesse https://workers.cloudflare.com
2. Crie um novo Worker
3. Cole o conteúdo de `worker.js` no editor
4. Deploy

## Estrutura

- `worker.js` — Worker principal (HTML + API Pix + login admin + leads)
- `app.js` — Lógica frontend separada (opcional)
- `perfumes/` — Imagens dos produtos (34 fotos)
- `logo-bottle.png` — Logo do frasco
- `icon-192.png`, `icon-512.png` — Ícones PWA
- `manifest.json` — Manifest PWA

## APIs

- `POST /api/pix` — Gera BR Code Pix Copia e Cola + QR URL
- `POST /api/admin-login` — Autenticação admin (senha Base64)
- `POST /api/leads` — Captura leads "Avise-me"
- `GET /api/products` — Lista todos os produtos (JSON)
- `GET /api/health` — Health check

## Configuração

- Chave Pix: fabiana@araujo.eu.org
- WhatsApp: +55 11 95854-6078
- Senha Admin: F@b@180574 (hash Base64: RkBiQDE4MDU3NA==)
- Preços: Brand R$ 69,99 | Afeer R$ 79,99 | Decante R$ 39,99 (3 por R$ 100)

© 2026 Mimi Mimos Parfumerie
