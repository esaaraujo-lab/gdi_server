# SETUP — Passo a passo detalhado

## Pré-requisitos

- Conta no GitHub
- Conta no Cloudflare (free tier é suficiente)
- Node.js 18+ instalado
- 1 Google Drive compartilhado com pastas de cursos

## Passo 1 — Fork do repositório

1. Acesse https://github.com/esaaraujo-lab/gdi_extras
2. Clique em "Fork" no topo direito
3. Selecione sua conta como destino
4. Clone o fork:
   ```bash
   git clone https://github.com/<SEU_USER>/gdi_extras
   cd gdi_extras
   ```

## Passo 2 — Instalar Wrangler

```bash
npm install
npx wrangler --version  # deve mostrar 3.78+
```

## Passo 3 — Login no Cloudflare

```bash
npx wrangler login
```

Isso abre o navegador para você autorizar o Wrangler a acessar sua conta Cloudflare.

## Passo 4 — Configurar o wrangler.toml

Abra `wrangler.toml` e edite:

```toml
name = "student-gdi"           # ★ nome do worker (escolha um único)

[vars]
MODULAR_REPO = "<SEU_USER>/gdi_extras"   # ★ owner/repo do seu fork
SITE_NAME = "Meggy — Meu GDI"
```

## Passo 5 — Criar KV namespace

```bash
npx wrangler kv:namespace create ENV
```

Saída esperada:
```
{ "result": { "id": "abc123..." }, "success": true }
```

Copie o `id` e cole no `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "ENV"
id = "abc123..."               # ★ substitua pelo ID retornado
preview_id = "abc123..."       # mesmo ID para dev
```

## Passo 6 — Configurar secrets

Gere 2 chaves aleatórias:

```bash
# 32 chars hex para AES
openssl rand -hex 16

# 64 chars hex para HMAC
openssl rand -hex 32
```

Salve cada uma como secret:

```bash
npx wrangler secret put CRYPTO_BASE_KEY
# cole: <sua chave AES de 32 chars>

npx wrangler secret put HMAC_BASE_KEY
# cole: <sua chave HMAC de 64 chars>
```

## Passo 7 — Deploy manual

```bash
npx wrangler deploy
```

Saída:
```
Published student-gdi (1.23 sec)
  https://student-gdi.<seu-subdominio>.workers.dev
```

Abra a URL no navegador. Deve aparecer a home page do GDI.

## Passo 8 — Conectar Google Drive

1. Acesse [Google Cloud Console](https://console.cloud.google.com/)
2. Crie um projeto → ative **Google Drive API**
3. Crie credenciais OAuth 2.0 (tipo "Web application")
4. Authorized redirect URIs: `https://student-gdi.<seu-subdominio>.workers.dev/google_callback`
5. Copie Client ID e Client Secret

Configure no `worker.js`:
```js
const client_id = 'xxx.apps.googleusercontent.com';
const client_secret = 'GOCSPX-xxx';
```

OU prefira secrets (mais seguro):
```bash
npx wrangler secret put GD_CLIENT_ID
npx wrangler secret put GD_CLIENT_SECRET
npx wrangler secret put GD_REFRESH_TOKEN
```

E no topo do `worker.js`:
```js
const client_id = typeof GD_CLIENT_ID !== 'undefined' ? GD_CLIENT_ID : 'xxx';
const client_secret = typeof GD_CLIENT_SECRET !== 'undefined' ? GD_CLIENT_SECRET : 'xxx';
```

## Passo 9 — Criar usuários

Para criar usuários de login (KV mode):

```bash
# Crie um arquivo users.json local
echo '{"elton@araujo.eu.org":"senha123"}' > users.json

# Use o endpoint /signup (se habilitado) ou crie manualmente no KV
npx wrangler kv:key put --binding=ENV "user:elton@araujo.eu.org" "senha123"
```

## Passo 10 — Auto-deploy no push (opcional, recomendado)

### Opção A — Workers Builds (mais simples)

1. Acesse https://dash.cloudflare.com → Workers & Pages → Workers Builds
2. Clique "Create application" → "Connect to Git"
3. Selecione seu repo `gdi_extras`
4. Configure:
   - Branch: `main`
   - Build command: `npm ci`
   - Deploy command: `npx wrangler deploy`
5. Em "Variables" (Settings → Variables), adicise:
   - `CRYPTO_BASE_KEY` (secret)
   - `HMAC_BASE_KEY` (secret)
   - `MODULAR_REPO` (texto: `<SEU_USER>/gdi_extras`)

A cada push na `main`, Cloudflare re-deploya automaticamente.

### Opção B — GitHub Actions (controle total)

1. No GitHub: Settings → Secrets and variables → Actions
2. Adicise:
   - `CLOUDFLARE_API_TOKEN` (crie em https://dash.cloudflare.com/profile/api-tokens → "Create Token" → "Edit Workers" template)
   - `CLOUDFLARE_ACCOUNT_ID` (Account ID em Workers Overview)
   - `CRYPTO_BASE_KEY` (32 chars hex)
   - `HMAC_BASE_KEY` (64 chars hex)
3. Faça push na main → Action roda automaticamente
4. Veja logs em Actions tab

## Passo 11 — Verificar

Abra `https://student-gdi.<seu-subdominio>.workers.dev/` no navegador.

Deve aparecer:
- Home page com botão "Área do Aluno" na navbar
- Botão "Fazer login" (se auth habilitado)
- Tiles dos drives configurados

Clique em "Área do Aluno" → painel abre com sidebar (Início, Cursos, etc).

## Troubleshooting

### "Cannot find module 'wrangler'"
Rode `npm install` no diretório do projeto.

### "KV namespace not found"
Você esqueceu de criar o KV ou colar o ID no wrangler.toml.

### "Module not found: /modular/storage.js"
Verifique que `MODULAR_REPO` em `wrangler.toml` aponta para o SEU fork. O worker busca de `https://raw.githubusercontent.com/<MODULAR_REPO>/main/modular/<file>.js`.

### "Refresh token inválido"
Faça OAuth novamente em `/google_callback`. Veja `docs/AUTH.md`.

### "Botão Área do Aluno não aparece na home"
Verifique no DevTools → Network que `/gdi-extras.js` retorna 200 (não 404 ou 502). Se 502, o worker não conseguiu buscar o loader do GitHub.

### "URL grande continua mesmo após push"
Verifique:
1. `wrangler.toml` aponta para o SEU repo (não upstream)
2. O `gdi-extras-loader.js` no GitHub tem `BASE_URL = '/modular/'`
3. Os arquivos em `/modular/` no GitHub têm os patches (especialmente `storage.js` com `gdiShortNavigate`)

## Backup e rollback

```bash
# Listar deploys anteriores
npx wrangler deployments list

# Rollback para versão anterior
npx wrangler rollback

# Ver logs em tempo real
npx wrangler tail
```

## Atualizar do upstream

```bash
git remote add upstream https://github.com/esaaraujo-lab/gdi_extras
git fetch upstream
git merge upstream/main --no-ff
# resolva conflitos se houver
git push origin main
```

Após push, Cloudflare re-deploya automaticamente.
