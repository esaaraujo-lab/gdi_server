# Cloudflare Pages — Deploy do Next.js

## Pré-requisitos
1. Conta no Cloudflare (gratuita)
2. Node.js 18+ instalado no seu computador
3. Cloudflare CLI (wrangler) instalado: `npm install -g wrangler`

## Passo 1: Obter API Token do Cloudflare

1. Acesse: https://dash.cloudflare.com/profile/api-tokens
2. Clique em **"Create Token"**
3. Escolha o template **"Edit Cloudflare Workers"** (ou crie customizado)
4. Permissões necessárias:
   - Account → Cloudflare Pages → Edit
   - Account → Workers Scripts → Edit
   - Zone → Workers Routes → Edit (se quiser domínio custom)
5. Copie o token (só aparece uma vez!)

## Passo 2: Autenticar o Wrangler
```bash
npx wrangler login
# OU com token:
export CLOUDFLARE_API_TOKEN=seu_token_aqui
```

## Passo 3: Build para Cloudflare Pages
```bash
# Instala dependências
npm install  # ou: bun install

# Faz o build do Next.js adaptado para Cloudflare
npm run pages:build
# OU: npx @cloudflare/next-on-pages
```

## Passo 4: Deploy
```bash
# Deploy para produção
npm run cf:deploy
# OU: npx wrangler pages deploy .vercel/output/static --project-name=mimi-mimos

# Preview (ambiente de teste)
npm run cf:preview
```

## Passo 5: Configurar domínio customizado
1. No dashboard do Cloudflare Pages, vá em "Custom domains"
2. Adicione: `mimimimos.com` (ou o domínio que tiver)
3. Configure os DNS conforme instruído

## Variáveis de Ambiente (wrangler.toml)
As variáveis já estão configuradas no arquivo `wrangler.toml`:
- `PIX_KEY`: Chave Pix (fabiana@araujo.eu.org)
- `WHATSAPP_NUMBER`: WhatsApp da loja
- `ADMIN_SALT`: Salt para hash da senha admin
- `ADMIN_PASS_HASH`: Hash SHA-256 da senha admin

Para alterar valores secrets:
```bash
npx wrangler pages secret put PIX_KEY --project-name=mimi-mimos
```

## Deploy via GitHub (Automático)
1. Faça push do projeto para o GitHub
2. No Cloudflare Pages, conecte o repositório
3. Build command: `npm run pages:build`
4. Output directory: `.vercel/output/static`
5. Toda vez que fizer push, o Cloudflare faz deploy automático!

## Comandos úteis
```bash
# Ver logs
npx wrangler pages deployment tail --project-name=mimi-mimos

# Listar deploys
npx wrangler pages deployment list --project-name=mimi-mimos

# Deletar projeto
npx wrangler pages project delete mimi-mimos
```
