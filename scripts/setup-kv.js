// ═══════════════════════════════════════════════════════════════
// setup-kv.js — Setup automático para deploy no Cloudflare Workers
//
// O que este script faz (em runtime, antes do `wrangler deploy`):
//   1. Lista KV namespaces existentes na sua conta
//   2. Se não existe um com binding ENV, cria um novo
//   3. Substitui REPLACE_WITH_YOUR_KV_ID no wrangler.toml pelo ID real
//   4. Remove o bloco [limits] (não suportado no Free plan)
//   5. Detecta o repo correto a partir de MODULAR_REPO env var (override)
//      ou mantém o que está no wrangler.toml
//
// USO LOCAL:
//   node scripts/setup-kv.js
//
// USO NO CLOUDFLARE WORKERS BUILDS:
//   Configure em Workers Builds:
//     Build command:   npm install
//     Deploy command:  npm run deploy
//   (npm run deploy = node scripts/setup-kv.js && wrangler deploy)
//
// Variáveis necessárias (configure como Environment Variables no Workers Builds):
//   - CLOUDFLARE_API_TOKEN  (secret)
//   - CLOUDFLARE_ACCOUNT_ID (texto — você vê no log)
//
// Opcional (para forçar MODULAR_REPO diferente do wrangler.toml):
//   - MODULAR_REPO (texto, ex: "esaaraujo-lab/student_gdi")
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const WRANGLER_TOML = path.join(__dirname, '..', 'wrangler.toml');

async function main() {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;

  // 1. Lê wrangler.toml atual
  let toml = fs.readFileSync(WRANGLER_TOML, 'utf8');
  let modified = false;

  console.log('━'.repeat(60));
  console.log('📦 Cloudflare Workers Setup');
  console.log('━'.repeat(60));

  // ═══ 2. Remove bloco [limits] (não suportado no Free plan) ═══
  if (toml.includes('[limits]')) {
    console.log('→ Removendo bloco [limits] (não suportado no Free plan)...');
    // Remove o bloco [limits] e tudo até a próxima seção [ ou fim do arquivo
    toml = toml.replace(/\n*\[limits\][^\[]*/g, '\n');
    // Adiciona comentário explicativo
    if (!toml.includes('CPU limits are not supported')) {
      toml += '\n# [limits] removido automaticamente — não suportado no Free plan\n';
    }
    modified = true;
    console.log('✓ Bloco [limits] removido');
  }

  // ═══ 3. Atualiza MODULAR_REPO se env var estiver definida ═══
  const envRepo = process.env.MODULAR_REPO;
  if (envRepo) {
    const repoMatch = toml.match(/^MODULAR_REPO\s*=\s*"([^"]+)"/m);
    if (repoMatch && repoMatch[1] !== envRepo) {
      console.log(`→ Atualizando MODULAR_REPO: "${repoMatch[1]}" → "${envRepo}"`);
      toml = toml.replace(/^MODULAR_REPO\s*=\s*"[^"]+"/m, `MODULAR_REPO = "${envRepo}"`);
      modified = true;
      console.log('✓ MODULAR_REPO atualizado');
    } else if (!repoMatch) {
      // Se não tem MODULAR_REPO no wrangler.toml, adiciona no [vars]
      console.log(`→ Adicionando MODULAR_REPO = "${envRepo}" ao [vars]`);
      toml = toml.replace(/(\[vars\][^\[]*)/m, `$1MODULAR_REPO = "${envRepo}"\n`);
      modified = true;
    }
  }

  // ═══ 4. Cria/recupera KV namespace e substitui placeholder ═══
  if (toml.includes('REPLACE_WITH_YOUR_KV_ID')) {
    if (!account || !token) {
      console.error('❌ CLOUDFLARE_ACCOUNT_ID ou CLOUDFLARE_API_TOKEN não definidos');
      console.error('   Não foi possível criar o KV namespace automaticamente.');
      console.error('   Configure essas variáveis no Workers Builds (Environment Variables).');
      process.exit(1);
    }

    let kvId = null;
    try {
      console.log('→ Listando KV namespaces existentes...');
      const listRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${account}/storage/kv/namespaces`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (listRes.ok) {
        const list = await listRes.json();
        // Procura por namespace com título terminando em -ENV
        const existing = (list.result || []).find(ns => (ns.title || '').endsWith('-ENV'));
        if (existing) {
          kvId = existing.id;
          console.log(`✓ KV existente encontrado: ${existing.title} (${kvId})`);
        }
      }
    } catch (e) {
      console.warn('Erro ao listar KV:', e.message);
    }

    if (!kvId) {
      console.log('→ Criando novo KV namespace "student-gdi-ENV"...');
      try {
        const createRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${account}/storage/kv/namespaces`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title: 'student-gdi-ENV' })
          }
        );
        const createData = await createRes.json();
        if (createData.success && createData.result && createData.result.id) {
          kvId = createData.result.id;
          console.log(`✓ KV criado: ${kvId}`);
        } else {
          console.error('❌ Falha ao criar KV:', JSON.stringify(createData.errors));
          console.error('   Tente manualmente: npx wrangler kv:namespace create ENV');
          process.exit(1);
        }
      } catch (e) {
        console.error('❌ Erro ao criar KV:', e.message);
        process.exit(1);
      }
    }

    console.log('→ Substituindo REPLACE_WITH_YOUR_KV_ID no wrangler.toml...');
    toml = toml.replace(/REPLACE_WITH_YOUR_KV_ID/g, kvId);
    toml = toml.replace(/REPLACE_WITH_YOUR_KV_PREVIEW_ID/g, kvId);
    modified = true;
    console.log(`✓ wrangler.toml atualizado com KV ID: ${kvId}`);
  }

  // ═══ 5. Salva wrangler.toml se foi modificado ═══
  if (modified) {
    fs.writeFileSync(WRANGLER_TOML, toml);
    console.log('✓ wrangler.toml salvo');
  } else {
    console.log('✓ wrangler.toml já está OK — nada a fazer');
  }

  console.log('━'.repeat(60));
  console.log('✅ Pronto para deploy!');
  console.log('━'.repeat(60));
}

main().catch(err => {
  console.error('❌ Erro inesperado:', err);
  process.exit(1);
});
