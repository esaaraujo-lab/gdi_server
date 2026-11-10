# 🔒 Regras Rígidas de Versionamento e Backup

> **MAISON de MiMi** — Política obrigatória de Git, commits e recuperação de desastre.
> **LEIA ANTES DE QUALQUER ALTERAÇÃO NO CÓDIGO.**
> Repositório oficial: https://github.com/esaaraujo-lab/mimi
> Produção: https://fabiana.eu.org

---

## ⭐ REGRAS DE OURO — OBRIGATÓRIAS EM TODA INTERAÇÃO

### Regra 1 — SEMPRE carregar as ferramentas no início
**SEMPRE** executar `source scripts/start-tools.sh` como PRIMEIRO comando de cada interação. Este script carrega:
1. **Harness2** (Google Research) — recursive agent harnessing
2. **ECC** (affaan-m/ecc) — 315 skills, 98 commands, 9 hooks para melhoria de código
3. **FreeLLMAPI** (tashfeenahmed) — 34 free LLM providers, 7.4B tokens/mês

Sem estas ferramentas ativas, os subagentes não têm acesso às skills do ECC nem às lições do Harness2.

### Regra 2 — SEMPRE backup e commit no GitHub
**Toda alteração de código deve ser commitada ao GitHub ANTES de testar em produção.**
Se o sandbox for resetado, o GitHub tem a última versão. O GitHub é a **fonte única de verdade** para código-fonte.

### Regra 3 — Em caso de exceção (erro, conflito, reset): backup primeiro
Se algo der errado (build fail, rebase conflict, sandbox reset):
1. **PRIMEIRO**: commit do estado atual (mesmo que quebrado) com `git add -A && git commit -m "wip: backup antes de fix"`
2. **DEPOIS**: push para GitHub: `git push origin main`
3. **SÓ DEPOIS**: investigar e corrigir
NUNCA investigar/corrigir antes de garantir que o backup está no GitHub.

### Regra 4 — NUNCA reverter layout ou funcionalidade existente
**NUNCA** use `git checkout --theirs .` cegamente em rebases — isso reverte TODAS as mudanças locais. Em vez disso, resolver conflitos arquivo por arquivo, mantendo a versão LOCAL (mais recente) para arquivos de layout.

Arquivos críticos que NUNCA devem ser revertidos sem verificação:
- `src/components/luxury/AdminShell.tsx` — layout profissional do admin (sidebar/drawer/FAB)
- `src/components/luxury/AdminPanel.tsx` — deve usar AdminShell (não tabs horizontais)
- `src/app/layout.tsx` — GlobalFloatingWhatsApp + JSON-LD
- `src/app/page.tsx` — TrustBadges + RocketHero dinâmico (content store)
- `src/components/luxury/FloatingWhatsApp.tsx` — auto-hide mobile + safe-area
- `src/components/luxury/TrustBadges.tsx` — 6 badges editáveis com toggle
- `src/lib/content-store.ts` — 60+ campos editáveis via admin

### Regra 5 — Se algo foi perdido: baixar do GitHub
Se qualquer arquivo crítico foi perdido ou corrompido:
```bash
git show origin/main:<arquivo> > <arquivo>
```
NUNCA recriar do zero sem antes verificar o GitHub.

### Regra 6 — Checklist pré-deploy (obrigatório)
Antes de fazer deploy para Cloudflare Pages:
- [ ] `git status` limpo (working tree clean) ou commit feito
- [ ] `git push origin main` bem-sucedido
- [ ] `npx eslint <arquivos alterados>` — 0 errors
- [ ] `npx @cloudflare/next-on-pages` — build completa sem erros
- [ ] Bundle size < 25 MiB (`du -sh --exclude="nop-build-log.json" .vercel/output/static/_worker.js/`)
- [ ] Migrations aplicadas ao D1 (se houver)
- [ ] Verificar endpoints em produção após deploy

### Regra 7 — Recuperação de desastre
Se o sandbox for resetado completamente:
```bash
# 1. Clonar projeto do GitHub
git clone https://github.com/esaaraujo-lab/mimi.git /home/z/my-project
cd /home/z/my-project && bun install

# 2. Restaurar ferramentas
source scripts/start-tools.sh

# 3. Aplicar migrations ao D1
npx wrangler d1 execute mimi_db --remote --file=migrations/0001_init.sql
# ... (todas as migrations em ordem)

# 4. Build e deploy
npx @cloudflare/next-on-pages
npx wrangler pages deploy .vercel/output/static --project-name=mimi-mimos
```

### Regra 8 — SEMPRE salvar backup no repo privado no início E final das alterações
Antes de começar qualquer trabalho:
1. `git add -A && git commit -m "wip: backup início" && git push origin main`
Após terminar qualquer trabalho:
1. `git add -A && git commit -m "feat/fix: descrição" && git push origin main`
O repo GitHub é o backup persistente. Tokens são salvos no Cloudflare (não no código).

### Regra 9 — SEMPRE compatível com tema claro E escuro + mobile friendly + filtro socioeconômico por dispositivo
**TODA** alteração de UI deve:
1. **Suportar tema claro E escuro** — usar CSS variables (`var(--background)`, `var(--foreground)`) ou classes Tailwind com `dark:` variants. NUNCA hardcodar `bg-obsidian-950` sem alternativa para tema claro. O catálogo digital, flipbook, e todos os componentes luxury devem funcionar em ambos os temas.
2. **Ser mobile friendly** — touch targets ≥ 44px, layouts responsivos (`sm:`, `md:`, `lg:`), sem overflow horizontal, scroll suave em mobile.
3. **Filtrar por nível socioeconômico/cultural baseado no dispositivo** — detectar device (Apple/Retina = alto padrão, Android mid-range = médio, feature phone = essencial) e adaptar:
   - Apple/iPhone XR+ → mostrar perfumes de nicho, oud árabe, coleções premium
   - Android mid-range → mostrar brand collection, decantes (acessível)
   - Feature phone → mostrar decantes e kits (preço baixo)
   - Se disponível (Google data), personalizar por histórico de compras

**Implementação do filtro socioeconômico:**
```typescript
function getDeviceTier(): "premium" | "mid" | "essential" {
  const ua = navigator.userAgent;
  const isApple = /iPhone|iPad|iPod|Macintosh/i.test(ua);
  const dpr = window.devicePixelRatio || 1;
  const screenWidth = window.screen.width || window.innerWidth;
  if (isApple && (screenWidth >= 414 || dpr >= 2)) return "premium";
  if (isApple || (dpr >= 2 && screenWidth >= 375)) return "mid";
  if (screenWidth < 375) return "essential";
  return "mid";
}
```

Arquivos críticos para tema claro/escuro:
- `src/app/globals.css` — CSS variables (`:root` + `.dark` + `.force-light`)
- `src/app/page.tsx` — COLORS_DARK + COLORS_LIGHT + ThemeContext
- `src/app/catalogo/CatalogoClient.tsx` — deve ter variantes light/dark
- `src/components/luxury/CatalogFlipbook.tsx` — flipbook deve adaptar fundo
- `src/components/luxury/CatalogPage.tsx` — páginas do flipbook adaptam cores

### Regra 10 — SEMPRE usar jsdelivr via GitHub para conteúdo pesado (marcas, perfumes, artigos, fragrâncias)
**TODO** conteúdo de dados pesado (catálogos de marcas, perfumes, artigos, alertas, bairros, famílias olfativas) deve ser hospedado no GitHub (repo público `esaaraujo-lab/gdi_server`, pasta `mimi/slug/`) e acessado via **jsdelivr CDN** — NUNCA embutido no bundle do Cloudflare Pages (limite 25 MiB).

**Arquivos JSON no GitHub gdi_server/mimi/slug/:**
- `perfumes.json` — 27+ perfumes (nicho, árabes, body splashes) com notas olfativas, preços, ganchos
- `marcas.json` — 26+ marcas com história completa, keywords SEO, imagens
- `alertas.json` — 5+ artigos anti-falsificação (perfumes chineses, intoxicação, Anvisa)
- `bairros.json` — 10+ cidades, 100+ bairros para SEO local
- `artigos.json` — guias de perfumaria (famílias olfativas, técnicas de aplicação)
- `familias.json` — 10 famílias olfativas com descrições e keywords

**URL padrão jsdelivr CDN:**
```
https://cdn.jsdelivr.net/gh/esaaraujo-lab/gdi_server@main/mimi/slug/{arquivo}.json
```

**Implementação obrigatória:**
1. **Client Components** fazem `fetch()` do CDN no `useEffect` (NÃO no server-side)
2. **Cache em memória** no client (`let _cached = null`) para evitar re-fetch
3. **Server Components** (page.tsx) fazem APENAS: metadata + layout + `<ClientComponent />` + `<ServerFooter />`
4. **NUNCA** importar dados JSON diretamente no bundle do worker (`import data from "./data.json"`)
5. **NUNCA** usar `cache: "no-store"` em fetch dentro do Cloudflare Workers (não implementado — causa erro)

**Estrutura de cada rota:**
```typescript
// page.tsx (server) — minimal, apenas metadata + layout
import ClientComponent from "./ClientComponent";
export default async function Page() {
  return (<><ClientComponent /><ServerFooter /></>);
}

// ClientComponent.tsx (client) — faz fetch do CDN
"use client";
const CDN = "https://cdn.jsdelivr.net/gh/esaaraujo-lab/gdi_server@main/mimi/slug/X.json";
let _cached = null;
export default function Client() {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (_cached) { setData(_cached); return; }
    fetch(CDN).then(r => r.json()).then(d => { _cached = d; setData(d); });
  }, []);
  // render...
}
```

**Vantagens:**
- Reduz bundle do CF Pages (25 MiB limite)
- Mega estrutura de conteúdo sem limite de tamanho
- SEO para IAs e buscadores (conteúdo sempre atualizado)
- Cache global via jsdelivr CDN (rápido em todo o mundo)
- Atualização sem redeploy (basta subir novo JSON no GitHub)

**Repos GitHub:**
- Código-fonte: `esaaraujo-lab/mimi` (privado)
- Dados JSON: `esaaraujo-lab/gdi_server` (público, pasta `mimi/slug/`)
- Regras de Ouro: `esaaraujo-lab/gdi_server` (pasta `mimi/`, arquivo `REGRAS-BACKUP.md`)

### Regra 11 — Equipe de agentes autônoma (CEO/MASTER + sub-agentes watchdog)
**SEMPRE** manter um sistema de agentes autônomo com:

1. **AGENTE MASTER (CEO)** — coordena, audita e decide. Analisa propostas, decide o que deve ser feito, e lança agentes para construir mudanças/correções. Não para até a plataforma estar completa.
2. **SUB-AGENTE WATCHDOG** — assume o controle se o MASTER der timeout. Acorda o MASTER ou outros agentes em timeout. Todos os sub-agentes têm essa função.
3. **EQUIPE COMPLETA DE AGENTES**:
   - **Desenvolvimento** — código, build, deploy, debug
   - **Marketing** — SEO, copywriting, ganchos de conversão, redes sociais
   - **Pagamento** — checkout, Pix, webhook, confirmação
   - **Logística** — frete, Correios, JadLog, Braspress, rastreio
   - **Envio** — etiquetas, tracking, notificação cliente
   - **SEO** — sitemap, robots, JSON-LD, ping buscadores, ping IAs
   - **QA/Testes** — Agent Browser, verificação após deploy
   - **Anti-falsificação** — alertas, rastreabilidade, lotes
4. **SEMPRE testar após deploy** — o MASTER dispara o agente de QA que verifica todas as rotas via Agent Browser. Se achar erro, o MASTER lança o agente de desenvolvimento para corrigir.
5. **MASTER busca skills/LLMs no GitHub** quando necessário — se um agente precisa de uma skill que não existe, o MASTER busca no GitHub, instala, e adiciona à Regra 1.
6. **Retornoalimentação** — o MASTER analisa resultados dos agentes e retroalimenta com memória persistente (armazenada no GitHub como JSON).

**Implementação:**
```typescript
// MASTER agent — dispara sub-agentes, audita, decide
async function masterAgent() {
  while (!platformComplete) {
    const issues = await audit();
    if (issues.length > 0) {
      for (const issue of issues) {
        const agent = selectAgent(issue.type);
        await launchAgent(agent, issue);
      }
    }
    await sleep(60000); // 1 min
  }
}

// Watchdog — acorda MASTER se der timeout
async function watchdog() {
  while (true) {
    if (masterTimeout > 5 * 60 * 1000) { // 5 min
      await wakeMaster();
    }
    await sleep(60000);
  }
}
```

### Regra 12 — Skills e LLMs auto-curáveis (registro na Regra 1)
**TODA** skill, LLM ou agente adicionado ao sistema deve ser registrado na Regra 1 (carregar ferramentas). Isso garante:

1. **Sistema autônomo e independente** — sem limite de tempo, se auto-curando se necessário
2. **Retroalimentação com memória persistente** — armazenada no GitHub como JSON (`gdi_server/mimi/skills/`)
3. **Controle de toda a equipe** — desenvolvimento, marketing, vendas, envio, checkout
4. **Skills ilimitadas** — buscar quantas skills forem necessárias e mesclar para melhor resultado
5. **Skills de SEO são essenciais** — sempre incluir skills de SEO na equipe

**Registro de skills:**
```json
// gdi_server/mimi/skills/registry.json
{
  "skills": [
    {
      "name": "seo-optimizer",
      "type": "seo",
      "installed": "2025-11-09",
      "source": "github.com/skill-creator/seo-optimizer",
      "function": "Otimiza sitemap, JSON-LD, meta tags, ping buscadores"
    },
    {
      "name": "prompt-reformer",
      "type": "utility",
      "installed": "2025-11-09",
      "source": "internal",
      "function": "Reformula prompts para tornar mais fácil para IA entender"
    }
  ]
}
```

**Quando uma nova skill é necessária:**
1. MASTER identifica a necessidade
2. MASTER busca no GitHub (ou cria se não existir)
3. MASTER instala a skill
4. MASTER adiciona à Regra 1 (carregar ferramentas)
5. MASTER registra no `registry.json` no GitHub

### Regra 13 — Skill de reformulação de prompts
**SEMPRE** ter uma skill que reformula prompts para torná-los mais fáceis para a IA e agentes entenderem. Esta skill:

1. **Estrutura o prompt** — divide em objetivos, contexto, restrições, formato de saída
2. **Remove ambiguidade** — clarifica termos vagos
3. **Adiciona contexto** — inclui informações relevantes do projeto
4. **Define formato de saída** — JSON, Markdown, código, etc.
5. **Adiciona exemplos** — quando relevante

**Implementação:**
```typescript
function reformulatePrompt(rawPrompt: string, context: ProjectContext): string {
  return `
## Objetivo
${extractObjective(rawPrompt)}

## Contexto do Projeto
- Projeto: ${context.name}
- Estado atual: ${context.state}
- Regras de Ouro: ${context.rules}

## Restrições
${extractConstraints(rawPrompt)}

## Formato de Saída Esperado
${determineOutputFormat(rawPrompt)}

## Prompt Original (reformulado)
${rawPrompt}
`;
}
```

**Arquivos pesados por slug/classe/categoria:**
- Cada marca = 1 arquivo JSON no GitHub (`gdi_server/mimi/slug/marcas/{slug}.json`)
- Cada perfume = 1 arquivo JSON (`gdi_server/mimi/slug/perfumes/{slug}.json`)
- Cada família olfativa = 1 arquivo JSON (`gdi_server/mimi/slug/familias/{slug}.json`)
- Cada artigo = 1 arquivo JSON (`gdi_server/mimi/slug/artigos/{slug}.json`)

**Vantagem:** arquivos pequenos e específicos, carregados por demanda via jsdelivr CDN, sem sobrecarregar o bundle do CF Pages.

---

## Detalhes das ferramentas

### Harness2
- Local: `/home/z/harness2/`
- Ativar: `source /home/z/harness2/.venv/bin/activate`
- Demo: `h2-demo`
- Lições: `h2-lessons`

### ECC
- Local: `/home/z/ecc/`
- Skills: 315 disponíveis
- Lista: `ecc-skills`
- Skills relevantes: `code-review`, `build-fix`, `agent-self-evaluation`, `agent-security-hardening`
- Para usar: ler `/home/z/ecc/skills/<skill>/SKILL.md`

### FreeLLMAPI
- Local: `/home/z/freellmapi/`
- CLI: `freellmapi <command>`
- Comandos: `setup-claude`, `list-providers`, `add-key`
- Chaves gratuitas (sem humano):
  - Google Gemini: https://aistudio.google.com/apikey
  - Groq: https://console.groq.com/keys
  - Cloudflare Workers AI: https://dash.cloudflare.com
  - Cohere: https://dashboard.cohere.com/api-keys

---

## 2. Antes de qualquer mudança

Sempre execute esta sequência antes de tocar no código:

```bash
# 1. Verificar estado atual (trabalho não commitado?)
git status

# 2. Sincronizar com remoto (rebase para histórico linear)
git pull origin main --rebase

# 3. Se houver conflito, resolver mantendo a versão MAIS RECENTE
#    (a nossa local, NÃO a do remote — exceto se a do remote for claramente mais nova)
git mergetool   # ou edite manualmente
git rebase --continue
```

**Conflitos**: priorize a versão local (nossa) quando houver dúvida, pois normalmente reflete o trabalho mais recente feito no sandbox. Documente a decisão no commit message.

---

## 3. Após qualquer mudança

```bash
# 1. Stagear tudo (arquivos novos, modificados e removidos)
git add -A

# 2. Commitar com mensagem semântica
git commit -m "feat: adiciona autocomplete de perfumes no admin"

# 3. Enviar para o GitHub
git push origin main

# 4. VERIFICAR que o push foi bem-sucedido
git status   # deve mostrar: "Your branch is up to date with 'origin/main'"
```

**NÃO aceitar push "rejected"**: se `git push` retornar `! [rejected]`, significa que o remote está à frente. Resolver com:

```bash
git pull origin main --rebase
git push origin main
```

**NUNCA** usar `git push --force` em `main` sem confirmação explícita (ver seção 5).

---

## 4. Estrutura de commits (Conventional Commits)

| Prefixo   | Uso                                                    | Exemplo                                              |
| --------- | ------------------------------------------------------ | ---------------------------------------------------- |
| `feat:`   | Nova funcionalidade visível ao usuário ou sistema      | `feat: adiciona rota /api/admin/autocomplete-perfume` |
| `fix:`    | Correção de bug                                        | `fix: escape de & no sitemap.xml`                   |
| `docs:`   | Documentação (README, MANUAIS, ROADMAP)                | `docs: atualiza MANUAL-TECNICO com migrations 006/007` |
| `refactor:` | Refatoração sem mudança de comportamento            | `refactor: extrai Hero do page.tsx`                 |
| `chore:`  | Manutenção, deps, configs, lint                       | `chore: bump next 16.0.3 → 16.0.4`                  |
| `style:`  | Formatação, espaços, ponto-e-vírgula (sem lógica)     | `style: prettier em src/lib/`                        |
| `test:`   | Adição/ajuste de testes                                | `test: snapshot do PerfumeCard`                      |
| `perf:`   | Melhoria de performance                                | `perf: lazy-load do FeaturedCarousel`               |

### Regras de mensagem
- **Máximo 72 caracteres** no título (subject line)
- **Verbo no imperativo** ("adiciona", "corrige", "remove")
- **Corpo do commit** (opcional, separado por linha em branco): explique **por que**, não **o quê**
- **Referencie a Task** quando aplicável: `feat: autocomplete perfumes (Task 96)`

---

## 5. Proibido (regras inquebráveis)

- ❌ **Resetar/alterar arquivos sem commit prévio** — usar `git stash` ou commit WIP antes de qualquer operação destrutiva
- ❌ **Forçar push (`git push --force` ou `-f`)** em `main` sem confirmação explícita por escrito
- ❌ **Deletar arquivos sem backup no commit anterior** — o arquivo deve existir em pelo menos um commit no histórico antes de ser removido
- ❌ **Editar código sem verificar se já foi commitado** — sempre `git status` antes de editar
- ❌ **Usar `git checkout .`** (descarta mudanças não commitadas) — usar `git stash` se precisar trocar de contexto
- ❌ **Usar `git reset --hard` sem ter feito push antes** — perda permanente de trabalho
- ❌ **Commitar segredos** (API keys, senhas, tokens) — usar `wrangler.toml` ou `wrangler secret put`
- ❌ **Fazer `ALTER TABLE` ou `DROP TABLE` no D1 sem migration versionada** em `migrations/`
- ❌ **Deploy para produção sem `git status` limpo** (ver seção 6)

---

## 6. Checklist pré-deploy

Antes de rodar `npx wrangler pages deploy`, confirmar CADA item:

- [ ] Código commitado ao GitHub (`git log origin/main..HEAD` deve retornar vazio)
- [ ] `git status` limpo (working tree clean)
- [ ] Build local passou (`npx @cloudflare/next-on-pages` sem erros)
- [ ] Lint passou (`bun run lint` ou `npx next lint`)
- [ ] Migrations aplicadas ao D1 (se houver) — ver seção 7
- [ ] Smoke test em `/staging` (se a feature tiver impacto visual)
- [ ] Sitemap regenerado (se novos produtos/rotas)
- [ ] `wrangler.toml` sem segredos hardcoded (vars não-sensíveis OK)

---

## 7. Recuperação de desastre

### Cenário: sandbox foi resetado / perdido

```bash
# 1. Clonar o repositório oficial
cd /home/z
git clone https://github.com/esaaraujo-lab/mimi.git my-project
cd my-project

# 2. Reinstalar dependências
bun install   # ou: npm install / pnpm install

# 3. Reinstalar Harness2 (framework Google Research para agent harnessing)
#    Ver HARNESS2-GUIDE.md para instruções detalhadas
source /home/z/my-project/scripts/harness2.sh
h2-demo   # valida instalação

# 4. Configurar secrets do Cloudflare (NÃO committar no wrangler.toml)
npx wrangler secret put CLOUDFLARE_API_TOKEN
npx wrangler d1 execute mimi_db --remote --command "SELECT COUNT(*) FROM products"

# 5. Aplicar migrations pendentes (na ordem)
ls migrations/   # listar disponíveis
npx wrangler d1 execute mimi_db --remote --file=migrations/0001_init.sql
npx wrangler d1 execute mimi_db --remote --file=migrations/001_expansion.sql
npx wrangler d1 execute mimi_db --remote --file=migrations/002_promotions.sql
npx wrangler d1 execute mimi_db --remote --file=migrations/003_brands.sql
npx wrangler d1 execute mimi_db --remote --file=migrations/004_pinned_products.sql
npx wrangler d1 execute mimi_db --remote --file=migrations/005_size_column.sql
npx wrangler d1 execute mimi_db --remote --file=migrations/006_orders_customers.sql
npx wrangler d1 execute mimi_db --remote --file=migrations/007_add_indexes.sql

# 6. Re-seed de produtos (INSERT OR IGNORE — não sobrescreve dados do admin)
bun run seed   # ou: npx tsx scripts/seed-d1.mjs

# 7. Rebuild e deploy
npx @cloudflare/next-on-pages
npx wrangler pages deploy .vercel/output/static --project-name=mimi-mimos
```

### Cenário: deploy quebrou produção

```bash
# 1. Identificar último commit estável
git log --oneline -20

# 2. Reverter para commit estável (preserva histórico)
git revert <commit-instavel>
git push origin main

# 3. Re-deploy
npx @cloudflare/next-on-pages
npx wrangler pages deploy .vercel/output/static --project-name=mimi-mimos

# 4. NÃO usar `git reset --hard` — preferir revert para manter histórico limpo
```

### Cenário: dados do D1 corrompidos

```bash
# 1. Exportar dados atuais (mesmo corrompidos, para análise)
npx wrangler d1 export mimi_db --remote --output=backup-d1-$(date +%Y%m%d).sql

# 2. Restaurar de backup anterior (se existir)
npx wrangler d1 execute mimi_db --remote --file=backup-d1-20260101.sql

# 3. Sempre ANTES de restaurar: exportar o estado atual
```

---

## 8. Frequência de backup

| Frequência              | Quando                                                         |
| ----------------------- | -------------------------------------------------------------- |
| **Mínimo obrigatório**  | A cada mudança de feature completa (1+ arquivo modificado)      |
| **Ideal**               | A cada 30 minutos durante desenvolvimento ativo               |
| **Obrigatório**         | Antes de fechar a sessão / pausar o trabalho                   |
| **Obrigatório**         | Antes de qualquer migration D1                                 |
| **Obrigatório**         | Antes de qualquer deploy para produção                         |
| **Obrigatório**         | Antes de operações destrutivas (`DROP`, `DELETE FROM`, `reset`) |

### Script de backup rápido

```bash
# Commit WIP + push em um comando
git add -A && git commit -m "chore: backup WIP $(date -u +%Y-%m-%dT%H:%M)" && git push origin main
```

Alias sugerido no `~/.bashrc`:

```bash
alias gwip='git add -A && git commit -m "chore: backup WIP $(date -u +%Y-%m-%dT%H:%M)" && git push origin main'
alias gsync='git pull origin main --rebase && git status'
```

---

## 9. Branches e fluxo

- **`main`**: branch de produção. SEMPRE deployável. Builds saem daqui.
- **Não usar branches feature longas** — preferir commits incrementais direto em `main` (projeto small-team).
- Se precisar de branch experimental: `feat/<nome-curto>`, lifetime máximo 24h, depois merge ou descarte.

---

## 10. Responsabilidade

- **Quem edita, commita** — não existe "deixar para commitar depois".
- **Quem deploya, verifica** — checklist da seção 6 é pessoal.
- **Quem quebra, conserta** — mas sempre com `git revert`, nunca `git reset --hard`.

---

**Versão deste documento**: 1.0
**Última atualização**: criação inicial
**Próxima revisão**: após migration 008 ou nova feature de deploy

---

## 🚨 REGRA FIXA — NUNCA REVERTER LAYOUT/FUNCIONALIDADE (adicionada 2026-11-06)

### Regra de Ouro do Layout
**NUNCA desfaça a última alteração de layout ou funcionalidade.** Antes de qualquer mudança:

1. **Verifique o estado atual**: `grep -c "AdminShell" src/components/luxury/AdminPanel.tsx` — se for ≥2, o layout profissional está ativo
2. **Se algo foi perdido**: baixe a última versão do GitHub: `git show origin/main:src/components/luxury/AdminPanel.tsx > src/components/luxury/AdminPanel.tsx`
3. **NUNCA use `git checkout --theirs .`** cegamente em rebases — isso reverte TODAS as mudanças locais. Em vez disso, resolva conflitos arquivo por arquivo, mantendo a versão MAIS RECENTE (local) quando houver conflito de layout.

### Checklist pré-mudança (obrigatório)
- [ ] `git pull origin main --rebase` — sincronizar com remoto
- [ ] Se houver conflito, resolver mantendo a versão LOCAL (mais recente) para arquivos de layout
- [ ] Verificar: `grep -c "AdminShell" src/components/luxury/AdminPanel.tsx` ≥ 2
- [ ] Verificar: `grep -c "FloatingWhatsApp\|GlobalFloatingWhatsApp" src/app/layout.tsx` ≥ 1
- [ ] Verificar: `grep -c "TrustBadges" src/app/page.tsx` ≥ 2
- [ ] Se qualquer um falhar: `git show origin/main:<arquivo> > <arquivo>` para restaurar

### Arquivos críticos (NUNCA reverter sem verificação):
- `src/components/luxury/AdminShell.tsx` — layout profissional do admin
- `src/components/luxury/AdminPanel.tsx` — usa AdminShell (não tabs horizontais)
- `src/app/layout.tsx` — GlobalFloatingWhatsApp + JSON-LD consolidado
- `src/app/page.tsx` — TrustBadges + RocketHero dinâmico (content store)
- `src/components/luxury/FloatingWhatsApp.tsx` — auto-hide mobile + safe-area
- `src/components/luxury/TrustBadges.tsx` — 6 badges editáveis com toggle
- `src/lib/content-store.ts` — 60+ campos editáveis via admin

---

## 🚀 REGRA FIXA — SEMPRE RODAR HARNESS2 + ECC + FREELLMAPI (adicionada 2026-11-06)

### Ferramentas obrigatórias no início de cada sessão
**SEMPRE** executar `source scripts/start-tools.sh` no início de cada interação. Este script inicia:

1. **Harness2** (Google Research) — recursive agent harnessing
   - Demo local (sem custo de API) para validar instalação
   - Lições aprendidas persistidas em `runs/`
   - Local: `/home/z/harness2/`

2. **ECC** (affaan-m) — agent harness operating system
   - 315 skills, 98 commands, 9 hooks disponíveis
   - Skills relevantes: `code-review`, `build-fix`, `agent-self-evaluation`, `agent-security-hardening`
   - Local: `/home/z/ecc/`

3. **FreeLLMAPI** (tashfeenahmed) — free LLM API aggregator
   - 34 free LLM providers, 7.4B tokens/mês, 635 endpoints
   - CLI: `freellmapi setup-claude`, `freellmapi list-providers`
   - Local: `/home/z/freellmapi/`
   - Para chaves gratuitas:
     - Google Gemini: https://aistudio.google.com/apikey
     - Groq: https://console.groq.com/keys
     - Cloudflare Workers AI: https://dash.cloudflare.com
     - Cohere: https://dashboard.cohere.com/api-keys

### Comandos disponíveis após `source scripts/start-tools.sh`:
- `h2-demo [k]` — roda demo do Harness2
- `h2-lessons [path]` — mostra lições aprendidas
- `ecc-skills` — lista skills do ECC
- `freellmapi <command>` — CLI do FreeLLMAPI

### Como usar ECC skills no projeto
As skills do ECC podem ser referenciadas em subagentes. Por exemplo:
- `code-review` — revisão de código automática
- `build-fix` — correção de erros de build
- `agent-self-evaluation` — auto-avaliação de qualidade
- `agent-security-hardening` — hardening de segurança

Para usar: ler o skill em `/home/z/ecc/skills/<skill-name>/SKILL.md` e aplicar as diretrizes.

### Como configurar FreeLLMAPI (sem humano)
1. Registrar chaves gratuitas nos provedores (links acima)
2. Adicionar chaves: `freellmapi add-key --provider google --key AIza...`
3. Configurar Claude Code: `freellmapi setup-claude`
4. O FreeLLMAPI roteia automaticamente entre providers, respeitando rate limits
5. Endpoint local: `http://localhost:3001/v1/chat/completions` (OpenAI-compatible)

---

## 🔴 AÇÃO URGENTE — Token GitHub perdido após git filter-repo (2026-11-06)

### O que aconteceu
O comando `git filter-repo` (usado para remover o token CF do histórico) também removeu o remote `origin` e as credenciais GitHub embutidas na URL.

### Estado atual
- ✅ Token CF `[REDACTED_CF_TOKEN]` removido de TODOS os 931 commits do histórico
- ✅ Account ID `f85e486c...` removido de TODOS os commits
- ✅ Código atual limpo (usa `${CLOUDFLARE_API_TOKEN}` e `${CLOUDFLARE_ACCOUNT_ID}`)
- ❌ Remote `origin` reconfigurado mas SEM credenciais GitHub
- ❌ Não é possível fazer `git push` sem o token GitHub

### O que o operador deve fazer
1. **Gerar um novo Personal Access Token no GitHub**:
   https://github.com/settings/tokens/new
   - Scopes: `repo` (full control of private repos)
   - Expiration: 90 days (recomendado)

2. **Reconfigurar o remote com o token**:
   ```bash
   cd /home/z/my-project
   git remote set-url origin https://SEU_TOKEN@github.com/esaaraujo-lab/mimi.git
   git push origin main --force
   ```
   (O `--force` é necessário porque o histórico foi reescrito)

3. **Rotacionar o token Cloudflare** (que foi exposto no GitHub):
   https://dash.cloudflare.com/profile/api-tokens
   - Deletar o token antigo `[REDACTED_CF_TOKEN]`
   - Criar um novo token com permissões D1 + Pages
   - Configurar como env var `CLOUDFLARE_API_TOKEN` no sandbox

4. **Configurar env vars no Cloudflare Pages** (Settings → Environment Variables):
   - `CLOUDFLARE_API_TOKEN` = novo token CF
   - `CLOUDFLARE_ACCOUNT_ID` = account ID CF
   - `ADMIN_SALT` = salt do admin (já em wrangler.toml)
   - `ADMIN_PASS_HASH` = hash do admin (já em wrangler.toml)
   - `ADMIN_SESSION_SECRET` = string aleatória 16+ chars
   - `CUSTOMER_SALT` = string aleatória 16+ chars
   - `PIX_WEBHOOK_SECRET` = secret compartilhado com PSP
   - `CF_API_TOKEN` = novo token CF (para /api/ai/fill-product)
   - `CF_ACCOUNT_ID` = account ID CF
