# 📊 RELATÓRIO EXECUTIVO — Plataforma Meggy

**Transformação de "GDI Melhorado" para "Plataforma Nativa"**

> **Data:** 2026-10-24
> **Versão base:** v1.0.211 (worker.js) — checkpoint `phase1-checkpoint-20261024-134317`
> **Autor:** Análise executiva com skills ClawHub (improve-codebase-architecture, code-security-audit, skill-clean-audit)
> **Repo:** esaaraujo-lab/student_gdi (privado) + esaaraujo-lab/gdi_server (público)
> **URL produção:** https://educa.eu.org

---

## 🎯 RESUMO EXECUTIVO (TL;DR)

A Meggy **é hoje um "GDI Melhorado"** — um fork do `maple3142/GDIndex` (1873★) com ~8 300 linhas de camadas bolt-on (Área do Aluno, Meggy AI, Auth, D1, Scanner, Admin). Não é uma plataforma nativa porque **herda do GDIndex**: núcleo de proxy Google Drive, filesystem, UI base, autenticação e persistência.

### Dívida técnica: ALTA

- **3 vulnerabilidades OWASP CRÍTICAS** 🔴 (chaves Google SA + OAuth em plaintext no `worker.js`)
- 5 achados OWASP ALTOS 🟠
- 6 bugs conhecidos / 8 TODOs-STUBs / 7 dead code / 6 shallow modules
- 3 fontes de verdade para o estado do aluno (localStorage + Drive + D1/KV) com merge ad-hoc
- Frontend sem build step (6 arquivos `.js` por `<script>` tags, sem ES modules)

### Veredito

**Híbrido / GDI Melhorado.** Para virar **Plataforma Nativa** são necessárias **6 fases em ~19-29 dias**, começando pela **Fase 1 (segurança — 1-2 dias)** que resolve os 3 CRÍTICOS com `wrangler secret put`.

### Próxima ação recomendada (HOJE)

```bash
# Resolve 3 vulnerabilidades CRÍTICAS em <2h
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GOOGLE_REFRESH_TOKEN
wrangler secret put SA_PRIVATE_KEY_1
wrangler secret put SA_PRIVATE_KEY_2
wrangler secret put CRYPTO_BASE_KEY
wrangler secret put HMAC_BASE_KEY
```

---

## 1️⃣ CONTEXTO E GENEALOGIA

### 1.1 O que é a Meggy

Plataforma de estudos brasileira multi-app que oferece:

| App | Stack | Versão |
|-----|-------|--------|
| 🌐 Web | Cloudflare Workers + JS vanilla | v1.0.211 |
| 📱 Android | Kotlin WebView | v2.7.2 |
| 📺 Roku | BrightScript SceneGraph | v1.0.2 |
| 🖥️ Desktop | Tauri 2.0 (Rust + React) | v1.4.2 |
| 📺 Android TV | Flutter | v2.1.1 |

### 1.2 Origem técnica

```
maple3142/GDIndex (1873⭐, MIT)
    └── TheFirstSpeedster/goindex (fork com auth)
        └── esaaraujo-lab/student_gdi (fork Meggy)
            └── worker.js: 17% GDIndex puro (~1.700 linhas)
                         + 83% Meggy-added (~8.300 linhas)
```

**Evidência:** `worker.js:31` (CDN_VERSION='2.5.9'), `worker.js:78` (authConfig), `worker.js:220-221` (googleDrive class), `worker.js:483` (requestOptions).

### 1.3 Camadas adicionadas pelo Meggy

| Camada | Linhas | Arquivo principal |
|--------|--------|-------------------|
| GDIndex core (herdado) | ~1.700 | worker.js + app.min.js |
| Auth multiuser | ~500 | worker.js:1500-2000 |
| Área do Aluno (study) | 8.200 | gdi-study.js |
| Meggy AI (chat/summaries/flashcards) | 4.800 | gdi-meggy.js |
| D1 + KV (persistência) | ~800 | worker.js:1081-1900 |
| Scanner de cursos | ~600 | worker.js + gdi-study.js |
| Admin panel | ~1.100 | admin_panel.js |
| Cron auto-correção | ~300 | worker.js (handleCronScan) |
| Outros (login, proxy, etc.) | ~400 | vários |

---

## 2️⃣ ARQUITETURA ATUAL

### 2.1 Diagrama textual

```
┌─────────────────────────────────────────────────────────────┐
│              Cloudflare Worker (worker.js — 9.976 linhas)    │
│                                                             │
│  addEventListener('fetch') → handleRequest()               │
│       │                                                     │
│       ├── [/api/ai/*]        → AI router (Meggy AI)         │
│       ├── [/api/courses/*]   → Área do Aluno (study)        │
│       ├── [/api/materials/*] → Materiais                    │
│       ├── [/api/d1/*]        → D1 status                    │
│       ├── [/admin]           → Admin panel                  │
│       ├── [/:driveIndex:/]   → GDIndex proxy (core)         │
│       ├── [/login, /signup]  → Auth                         │
│       └── [cron trigger]     → handleCronScan               │
│                                                             │
│  Bindings: D1 (MEGGY_D1) + KV (MEGGY_CACHE) + AI            │
│  Secrets: ❌ em plaintext (3 CRÍTICOS)                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│        Frontend (6 arquivos .js via <script> — sem build)   │
│                                                             │
│  app.min.js (108KB, 95% GDIndex)  ← core UI / player        │
│       │                                                     │
│       ├── window.Bus (event bus sem schema)                 │
│       ├── window.GDIStorage (fetch /api/* com cache LRU)    │
│       └── window.GDIUser (watched/resume/notes/srs)         │
│                                                             │
│  gdi-study.js (292KB, 100% Meggy) ← Área do Aluno           │
│       └── window.__gdiStudy (8 namespaces)                  │
│                                                             │
│  gdi-meggy.js (155KB, 100% Meggy) ← AI / Resumos / Cards    │
│       └── window.__gdiMeggy (7 namespaces)                  │
│                                                             │
│  gdi-extras-loader.js (7KB) ← carrega módulos do CDN        │
│  admin_panel.js (61KB) ← painel admin inline                │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Área do Aluno × Drive Index — como funcionam separados mas integrados

**Separação (visual):** A Área do Aluno é um **overlay full-screen** (`position:fixed; inset:0`) sobreposto ao Drive Index que continua renderizado embaixo. Não há troca de "app" — ao fechar, o aluno volta exatamente onde estava. *Evidência: `gdi-study.js:1248-1267` `openPanel`/`closePanel`.*

**Integração (5 seams via `window.*` + `Bus`):**

| Seam | Função | Acoplamento |
|------|--------|-------------|
| `window.__gdiStudy` | Estado + 8 namespaces (panel/scanner/courses/questions/advanced/insights/plan/notifications/legacy) | Alto — gdi-meggy.js e app.min.js chamam diretamente |
| `window.__gdiMeggy` | AI + 7 namespaces (utils/pdf/cache/questions/flashcards/summaries/widget) | Alto |
| `window.GDIStorage` | Fetch wrapper /api/* com cache LRU 200 | Médio — abstração ok mas sem type |
| `window.Bus` | Event bus (`page:change`, `user:ready`, `media:ready`, `watched:changed`, `rows:appended`) | Alto — sem schema, eventos string |
| `window.GDIUser` | Estado do usuário (watched/resume/notes/srs) | Alto — singleton mutável |

**Rotas:**

- **Drive Index:** `GET /:n:/caminho/` → serve HTML shell + lista arquivos via POST
- **Área do Aluno:** `GET /api/courses/list` → JSON com cursos do aluno
- **Meggy AI:** `POST /api/ai` → streaming response da IA

**Auth compartilhada:** cookie `gdi_session` (GDIndex). Não há tabela de usuários separada — `gdiSessionUser()` é chamado em TODOS os endpoints `/api/*`.

**Filesystem compartilhado:** os 12 drives em `authConfig.roots` são a fonte. Quando o aluno adiciona um curso, o `coursePath` enviado para `/api/courses/add` é exatamente o path `/:n:/CURSO X/` do GDIndex.

---

## 3️⃣ DIAGNÓSTICO — O QUE ESTÁ QUEBRADO

### 3.1 🔴 Vulnerabilidades OWASP CRÍTICAS (resolver HOJE)

| ID | Local | Problema | Severidade |
|----|-------|----------|------------|
| A02-1 | `worker.js:49, 62` | 2 chaves privadas Google Service Account em plaintext | 🔴 CRÍTICO |
| A02-2 | `worker.js:132-133` | `client_secret` + `refresh_token` Google OAuth em plaintext | 🔴 CRÍTICO |
| A02-3 | `worker.js:194-195` | Fallback hardcoded de `crypto_base_key` (AES) + `hmac_base_key` (HMAC) | 🟠 ALTO |

**Como corrigir:** `wrangler secret put <NAME>` para cada um dos 6 secrets, depois remover os literals do código. O `globalThis.X` já é suportado pelo Workers. Tempo: **<2h**.

### 3.2 🟠 Vulnerabilidades ALTAS

| ID | Local | Problema |
|----|-------|----------|
| A02-4 | `worker.js:1773` | `hashPassword` usa SHA-256 (deveria ser PBKDF2/bcrypt) |
| A05-2 | `gdi-extras-loader.js:28` | Scripts CDN sem SRI (jsdelivr) — se repo comprometido, executa código malicioso |
| A07-1 | `worker.js:7992-8010` | Rate limiting in-memory por isolate — bypass trivial após cold start |
| A03-4 | `gdi-meggy.js:1576` | `marked.parse()` injetado em innerHTML sem sanitização garantida |
| A08-1 | (vários) | Sem SRI em nenhum `<script src>` CDN |

### 3.3 🐛 Bugs conhecidos (6)

| Bug | Local | Sintoma |
|-----|-------|---------|
| gdi-ai-providers.js referenciado mas inexistente | gdi-study.js + gdi-meggy.js | Fetch 404 silencioso |
| Event bus sem schema | app.min.js:21-30 | Eventos string, sem type-check, erros em runtime |
| 3 fontes de verdade para estado do aluno | localStorage + Drive + D1/KV | Merge ad-hoc em `renderResumos` (gdi-meggy.js:2131) |
| `app.min.js:3` loga `v19.0-minimal` mas worker.js diz `v1.0.211` | — | Version mismatch confuso |
| CORS `*` em 155 ocorrências | worker.js:155 | Permite cross-origin de qualquer site |
| `console.log` para logs críticos | worker.js:9850 (CronScan) | Logs perdidos após request |

### 3.4 📝 TODOs e STUBs (8)

| Local | O que falta |
|-------|-------------|
| `gdi-study.js:legacy` namespace | `renderFlash`, `studyFlash`, `renderMarathon`, `renderSubjects`, `editSubject`, `renderTrails`, `editTrail` — TODOS STUBS (abas removidas) |
| `gdi-meggy.js:summaries._summaryModal` | Não implementado |
| `auth.rs:check_session` | `username: None` com comentário `// TODO: extract from cookie` |
| `worker.js:ABUSE_PATTERNS` | Regex de prompt injection — facilmente bypassável |
| `worker.js:authConfig.users_list` | Usuários seed hardcoded — adicionar/remover requer redeploy |
| `worker.js:admin gate` | RBAC hardcoded `['elton@araujo.eu.org']` — sem tabela de roles |
| `gdi-study.js:notifications.searchNotes` | Search parcial |
| `worker.js:addEventListener('fetch')` SW format fallback | Mantido por compat mas desnecessário |

### 3.5 🪦 Dead code (7)

- `app.min.js` (~95% do arquivo) é GDIndex original — algumas funções não usadas pela Meggy
- `worker.js:9966-9976` Service Worker format fallback (desnecessário)
- `gdi-study.js:legacy` namespace inteiro (7 stubs)
- `gdi-meggy.js:summaries._summaryModal` (não implementado)
- Variáveis `CARGO_INCREMENTAL` em CI (não aplicável)
- `authConfig.enable_password_file_verify` (parcialmente usado)
- `ABUSE_PATTERNS` regex (cobertura <30%)

### 3.6 📐 Shallow modules (per skill improve-codebase-architecture)

| Módulo | Problema | Deletion test |
|--------|----------|---------------|
| `gdi-utils` (inexistente) | Helpers `lsGet`/`lsSet`/`esc`/`uid`/`today` duplicados em 3 arquivos | Complexidade reaparece em N callers — deveria existir |
| `Bus` (app.min.js:21-30) | 9 linhas, sem schema, sem tipos | Não ganha nada ser separado do gdi-core |
| `GDIStorage` | Fetch wrapper com cache LRU mas sem retry/timeout configurável | Interface quase tão complexa quanto fetch |
| `gdi-extras-loader.js` | 187 linhas para carregar 6 scripts | Shallow — deveria ser inline |
| `auth.rs:check_session` | Retorna `logged_in: bool` + `username: None` sempre | Sem valor — deveria extrair username do cookie |
| `worker.js:handleAdmin` | Delegate para `handleAdminPro` | Pass-through |

---

## 4️⃣ POR QUE É "GDI MELHORADO" E NÃO "PLATAFORMA NATIVA"

### 7 razões concretas

1. **O núcleo de proxy Google Drive é 100% GDIndex original** (`worker.js:9006-9442`) — toda navegação/download/search passa pelo GDIndex.

2. **`app.min.js` é ~95% GDIndex** — apenas `Bus`, `gdiListAllFiles`, `_listCache`, `gdiGetPw`/`gdiSetPw` são Meggy-added. A UI da Área do Aluno vive **em cima** desta UI, não a substitui.

3. **A Área do Aluno é um overlay, não uma view** (`gdi-study.js:1248-1267`) — não há troca de "app". Isso é a definição arquitetural de "addon".

4. **A identidade do aluno é o cookie `gdi_session` do GDIndex** (`worker.js:868-877`) — não há tabela de usuários separada para a Área do Aluno.

5. **Os 12 drives em `authConfig.roots`** são a fonte — a Área do Aluno não tem filesystem próprio, é cliente do GDIndex.

6. **A persistência é bolt-on** — 3 lugares diferentes (localStorage + Drive + D1/KV) sem coesão. Uma plataforma nativa teria uma única fonte de verdade.

7. **O frontend é carregado como "extras" do GDIndex** — `gdi-extras-loader.js` é explicitamente nomeado como loader de "extras". Sem build step (sem webpack/vite/esbuild). Sem módulos ES. Acoplamento via `window.*` e `Bus`.

### Síntese

A Meggy é um **GDIndex com ~8 300 linhas de camadas bolt-on** que usam o GDIndex como substrato. Não é plataforma nativa porque: (a) não tem núcleo próprio; (b) não tem filesystem próprio; (c) não tem UI própria; (d) não tem auth própria; (e) não tem persistência coesa; (f) não tem build step; (g) não tem módulos ES.

---

## 5️⃣ TRANSFORMAÇÃO — DE GDI MELHORADO PARA PLATAFORMA NATIVA

### 5.1 Os 3 caminhos possíveis

| Caminho | Descrição | Tempo | Risco | Recomendação |
|---------|-----------|-------|-------|--------------|
| **A — Status quo** | Manter como está, apenas corrigir bugs críticos | 1-2 dias | Baixo | ❌ Não resolve a dívida |
| **B — Refactor incremental** | 6 fases: secrets → unificação → ES modules → D1-first → admin RBAC → router Map | 19-29 dias | Médio | ✅ **RECOMENDADO** |
| **C — Rewrite nativo** | Reescrever do zero com Next.js/Hono + Prisma + React Server Components | 60-90 dias | Alto | ⚠️ Só se quiser pivot total |

### 5.2 Roadmap detalhado — Caminho B (recomendado)

#### 🚨 FASE 1 — Segurança crítica (1-2 dias)

**Objetivo:** Resolver 3 CRÍTICOS + 2 ALTOS em <48h.

```bash
# 1. Migrar 6 secrets para wrangler secret
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GOOGLE_REFRESH_TOKEN
wrangler secret put SA_PRIVATE_KEY_1
wrangler secret put SA_PRIVATE_KEY_2
wrangler secret put CRYPTO_BASE_KEY
wrangler secret put HMAC_BASE_KEY

# 2. Substituir literals no worker.js por globalThis.X
# 3. Remover fallbacks hardcoded
# 4. Adicionar SRI nos <script src> CDN
# 5. Migrar hashPassword de SHA-256 para PBKDF2 (Web Crypto, 100k iterações)
```

**Entrega:** worker.js seguro para commit público. Resolve A02-1, A02-2, A02-3, A02-4, A05-2, A08-1.

#### 🔧 FASE 2 — Unificação de utilitários (2-3 dias)

**Objetivo:** Criar `gdi-utils.js` e eliminar duplicação.

- Criar `gdi-utils.js` com `lsGet`/`lsSet`/`esc`/`uid`/`today`/`escHtml`/`escJs`/`formatFileSize`/`getFileIcon`
- Adicionar ao `gdi-extras-loader.js` MODULES na posição 0
- Substituir referências duplicadas nos IIFEs
- Documentar interface

**Entrega:** ~50 linhas duplicadas removidas. 1 seam reutilizável. Reduz change risk.

#### 📦 FASE 3 — ES Modules + Build step (4-5 dias)

**Objetivo:** Migrar frontend para ES modules com Vite.

- Instalar Vite + esbuild
- Converter `app.min.js` → `gdi-core.js` (ES module exportando `Bus`, `GDIStorage`, `GDIUser`)
- Converter `gdi-study.js` → ES module (import de `gdi-core`)
- Converter `gdi-meggy.js` → ES module
- Definir `EventTypes` const enum para o Bus (remove C2)
- Build → `dist/` com tree-shaking + minify

**Entrega:** Frontend modular, type-checkável, com build step. Reduz ~30% do tamanho.

#### 🗄️ FASE 4 — D1-first persistence (4-5 dias)

**Objetivo:** Unificar as 3 fontes de verdade em D1.

- Migrar `localStorage` (courses, questions, cards) → D1 tables
- Migrar "AULAS - ESTADO DOS ALUNOS" Drive folder → D1
- Manter localStorage apenas como cache offline (read-through)
- Implementar sync D1 ↔ localStorage com conflict resolution (LWW por `updated_at`)

**Entrega:** 1 fonte de verdade (D1). Elimina merge ad-hoc em `renderResumos`.

#### 👥 FASE 5 — Admin RBAC (2-3 dias)

**Objetivo:** Migrar RBAC hardcoded para D1 table.

- Criar table `users (id, email, role, created_at)`
- Criar table `roles (id, name, permissions JSON)`
- Substituir `ADMIN_USERS.includes(user)` por query D1
- Adicionar UI admin de gerenciamento de usuários/roles
- Migrar `authConfig.users_list` → seed via migration SQL

**Entrega:** Admin gerenciável sem redeploy. Roles configuráveis.

#### 🛣️ FASE 6 — Router Map dispatcher (3-4 dias)

**Objetivo:** Estruturar `handleRequest` com Map dispatcher.

- Construir `const ROUTES = new Map([['/api/ai', {POST: handleAi}], ...])`
- `handleRequest` vira `const h = ROUTES.get(path); if (h) return h[req.method](req, url);`
- Isolar admin panel (1937-2036) e AI router em modules separados
- Adicionar middleware chain (auth, rate limit, logging)

**Entrega:** O(1) lookup, cold start reduzido, fácil adicionar/remover rotas.

### 5.3 Tempo total: 19-29 dias (recomendado 4 semanas)

### 5.4 Pontos de alavancagem (onde mudar 1 coisa tem grande impacto)

| # | Alavancagem | Impacto | Risco |
|---|-------------|---------|-------|
| 1 | Unificar helpers em `gdi-utils.js` | ⭐⭐⭐ | Baixo |
| 2 | Migrar secrets para `wrangler secret put` | ⭐⭐⭐ | Baixo |
| 3 | Estruturar `handleRequest` com Map dispatcher | ⭐⭐⭐ | Médio |
| 4 | Converter Bus para ES module com schema | ⭐⭐ | Alto |
| 5 | Adicionar SRI nos scripts CDN | ⭐⭐ | Baixo |
| 6 | Substituir SHA-256 por PBKDF2 para senhas | ⭐ | Baixo |

---

## 6️⃣ SKILLS CLAWHUB — RECOMENDADAS PARA A TRANSFORMAÇÃO

### 6.1 Skills instaladas neste sandbox (para análise)

| Skill | Versão | Aplicação no Meggy | Status |
|-------|--------|-------------------|--------|
| `improve-codebase-architecture` | 1.1.1 | Metodologia deep/shallow modules — aplicada na §3.6 e §5.4 | ✅ Instalada |
| `code-security-audit` | 2.1.0 | OWASP Top 10 + secret detection — aplicada na §3.1-3.2 | ✅ Instalada |
| `skill-clean-audit` | 1.4.0 | Compreensão/mudança risk — aplicada na §3.3-3.5 | ✅ Instalada |
| `study-buddy` | — | Referência de features de estudo (SRS, quiz, flashcards) | ✅ Já tinha |
| `fullstack-dev` | — | Padrões Next.js 16 + Prisma — referência para Caminho C | ✅ Já tinha |
| `coding-agent` | — | Code generation — útil nas fases 2-6 | ✅ Já tinha |
| `task-review` | — | Code review automatizado — útil em todas as fases | ✅ Já tinha |
| `version-management` | — | Versionamento semântico — útil para releases | ✅ Já tinha |

### 6.2 Skills ClawHub recomendadas para instalar ( próximas fases)

| Skill | Autor | Aplicação | Quando instalar |
|-------|-------|-----------|-----------------|
| `improve-codebase-architecture` | @afonsoft | ✅ Já instalada | — |
| `code-security-audit` | @LobsterAI | ✅ Já instalada | — |
| `skill-clean-audit` | @elisabeth15501 | ✅ Já instalada | — |
| `flashcards` | @bytesagain3 | Gerador de flashcards SM-2 — pode melhorar gdi-meggy.js flashcards | Fase 4 |
| `anki-fusion` | @harrylabsj | Anki card generator — exportar flashcards para Anki | Fase 4 |
| `quiz-creator` | @ahmed181283 | Quiz generator — pode melhorar gdi-study.js questions | Fase 4 |
| `quiz-mastery` | (já instalada) | Spaced repetition quiz — pode melhorar SRS | Fase 4 |
| `adaptive-learning` | @weishuz | Adaptive learning — pode melhorar cronograma | Fase 4 |
| `study-tutor` | @jiangkaiqi2005 | Study tutor — pode melhorar Meggy AI coach | Fase 4 |
| `mochi-study-coach` | @hznetnewpower | Mistake review — pode melhorar insights | Fase 4 |
| `pdf-to-markdown` | @ckchzh | PDF → MD — pode melhorar gdi-meggy.js pdf extraction | Fase 4 |
| `safe-refactor` | @dennisrongo | Safe refactor — útil nas fases 2-6 | Fase 2 |
| `code-ownership-audit` | @ffseika0304 | Code ownership — útil para organizar módulos | Fase 3 |
| `content-strategy` | @coreyhaines31 | Content strategy — útil para roadmap de features | Fase 5 |

### 6.3 Skills GitHub (repos de referência para estudar)

| Repo | ⭐ | O que emprestar |
|------|-----|-----------------|
| `maple3142/GDIndex` | 1873 | A origem — comparar para ver o que mudou |
| `menukaonline/goindex-extended` | 496 | Features extras (search, dark mode) |
| `tks18/gindex-v4` | 250 | Vue.js + dark mode + video player melhorado |
| `frappe/lms` | 3340 | LMS open-source moderno — referência de arquitetura |
| `pupilfirst/pupilfirst` | 980 | LMS async school — referência de UX |
| `artcc/freelingo` | 205 | AI language learning self-hosted — referência de AI tutor |
| `Open-TutorAi/open-tutor-ai-CE` | 113 | AI educational platform — referência |
| `FlameEducation/FlameEducation` | 4 | LLM-based education system (LLM+TTS+ASR) — referência |

---

## 7️⃣ POSSÍVEIS AVANÇOS E MELHORIAS (além do refactor)

### 7.1 Features de produto (priorizadas)

| Feature | Descrição | Skills que ajudam | Tempo |
|---------|-----------|-------------------|-------|
| **AI Tutor adaptativo** | IA que adapta dificuldade baseada em performance | `study-tutor`, `adaptive-learning`, `LLM` | 5-7 dias |
| **Modo offline (PWA)** | Service Worker + cache de vídeos/áudios | `fullstack-dev` | 4-6 dias |
| **Sync entre dispositivos** | Estado unificado D1 + conflict resolution | — | 3-5 dias |
| **Exportar para Anki** | Flashcards → .apkg | `anki-fusion`, `anki-card-creator` | 2-3 dias |
| **Cronograma inteligente** | IA gera plano de estudos baseado em metas | `study-plan`, `study-phase-planner`, `LLM` | 4-5 dias |
| **Redação com IA** | Correção automática + feedback | `LLM`, `writing-plans` | 3-4 dias |
| **Provas simuladas** | Geração de provas com questões reais | `quiz-creator`, `quiz-mastery` | 4-5 dias |
| **Gamificação** | Conquistas, trilhas, streaks | — | 3-4 dias |
| **Multi-idioma** | i18n pt-BR/en-US/es-ES | — | 3-4 dias |
| **Dashboard analytics** | Heatmap de estudos, métricas | `charts` | 3-4 dias |

### 7.2 Melhorias técnicas (priorizadas)

| Melhoria | Descrição | Tempo |
|----------|-----------|-------|
| **Observability** | Logflare/Datadog + alertas | 2-3 dias |
| **Rate limiting persistente** | KV-based rate limiting (não in-memory) | 1-2 dias |
| **CDN com SRI** | Subresource integrity em todos os scripts | 1 dia |
| **CI/CD com testes** | GitHub Actions + Vitest + Playwright | 3-4 dias |
| **API versioning** | `/api/v1/*`, `/api/v2/*` com deprecation | 2-3 dias |
| **TypeScript** | Migrar worker.js + frontend para TS | 7-10 dias |
| **OpenAPI spec** | Documentar todos os /api/* endpoints | 2-3 dias |
| **Monitoring de AI** | Track custo/tokens por usuário | 2-3 dias |

### 7.3 Possibilidades de expansão

| Expansão | Descrição | Skills |
|----------|-----------|--------|
| **Marketplace de cursos** | Criadores publicam cursos | `content-strategy` |
| **Live classes** | WebRTC + gravar | `podcast-generate` |
| **Mobile offline-first** | PWA + IndexedDB + sync | `fullstack-dev` |
| **WhatsApp bot** | AI tutor via WhatsApp | `LLM` |
| **Chrome extension** | Anotar vídeos do YouTube | — |
| **Discord/Telegram bot** | Comunidade + AI | `LLM` |

---

## 8️⃣ COMO CORRIGIR O QUE ESTÁ QUEBRADO (checklist executável)

### 🔴 Hoje (CRÍTICO — <2h)

```bash
# 1. Backup do estado atual (JÁ FEITO — backup/phase1-checkpoint-20261024-134317)

# 2. Migrar 6 secrets para wrangler
cd /home/z/my-project/student_gdi
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GOOGLE_REFRESH_TOKEN
wrangler secret put SA_PRIVATE_KEY_1
wrangler secret put SA_PRIVATE_KEY_2
wrangler secret put CRYPTO_BASE_KEY
wrangler secret put HMAC_BASE_KEY

# 3. Editar worker.js: substituir literals por globalThis.X
#    - Linha 49: sa_keys[0].private_key → globalThis.SA_PRIVATE_KEY_1
#    - Linha 62: sa_keys[1].private_key → globalThis.SA_PRIVATE_KEY_2
#    - Linha 132: client_secret → globalThis.GOOGLE_CLIENT_SECRET
#    - Linha 133: refresh_token → globalThis.GOOGLE_REFRESH_TOKEN
#    - Linhas 194-195: crypto_base_key/hmac_base_key → globalThis.CRYPTO_BASE_KEY/HMAC_BASE_KEY

# 4. Remover fallbacks hardcoded

# 5. Deploy
wrangler deploy
```

### 🟠 Esta semana (ALTOS — 3-5 dias)

```bash
# 1. Adicionar SRI nos scripts CDN (gdi-extras-loader.js)
#    - Calcular hash sha384 de cada script
#    - Adicionar integrity="sha384-..." em cada loadScript

# 2. Migrar hashPassword para PBKDF2 (worker.js:1773)
#    - Usar Web Crypto SubtleCrypto.deriveBits
#    - 100k+ iterações
#    - Salt aleatório por usuário

# 3. Rate limiting persistente via KV
#    - Substituir globalThis.__MEGGY_RATE por KV com TTL
#    - Key: "rate:{username}:{minute}"
#    - Value: count
```

### 🟡 Próximas 2 semanas (bugs + TODOs — 7-10 dias)

```bash
# 1. Criar gdi-ai-providers.js (referenciado mas inexistente)
# 2. Implementar auth.rs:check_session extrair username do cookie
# 3. Implementar gdi-meggy.js:summaries._summaryModal
# 4. Remover stubs do gdi-study.js:legacy (ou reimplementar)
# 5. Corrigir version mismatch (app.min.js:3 v19.0 → v1.0.211)
# 6. Migrar usuários seed para D1 table (Fase 5)
# 7. Adicionar logging persistente (Logflare/Datadog)
# 8. CORS: substituir '*' por cors_domain configurável
```

---

## 9️⃣ BACKUP CHECKPOINT

### 9.1 Backup de hoje (2026-10-24)

**Local:** `/home/z/my-project/backup/phase1-checkpoint-20261024-134317/`
**Tamanho:** 1.6 MB
**Arquivos:** 13 (worker.js + frontend + docs + maps + manifest)

### 9.2 Conteúdo do backup

```
phase1-checkpoint-20261024-134317/
├── MANIFEST.md                    ← metadata + como restaurar
├── worker.js                      ← backend CF Workers v1.0.211 (625KB)
├── gdi-study.js                   ← Área do Aluno (292KB)
├── gdi-meggy.js                   ← Meggy AI (155KB)
├── gdi-extras-loader.js           ← loader (7KB)
├── app.min.js                     ← GDIndex core (108KB)
├── admin_panel.js                 ← painel admin (61KB)
├── wrangler.toml                  ← config CF
├── worklog-snapshot.md            ← últimas 2000 linhas do worklog
├── worklog_worker_map.md          ← mapa do worker.js (905 linhas)
├── worklog_frontend_map.md        ← mapa do frontend (1304 linhas)
├── KEYSTORE_ROADMAP.md            ← regras de keystore
├── MEGGY_EVOLUTION_PLAN.md        ← plano de evolução
└── OPENMAC_MEGGY_COMPATIBILITY.md ← análise openmac
```

### 9.3 Como restaurar

```bash
# 1. Copiar arquivos
cp backup/phase1-checkpoint-*/worker.js student_gdi/worker.js
cp backup/phase1-checkpoint-*/gdi-*.js DEPLOY_FINAL/
cp backup/phase1-checkpoint-*/app.min.js DEPLOY_FINAL/

# 2. Deploy
cd student_gdi
wrangler deploy --config wrangler.toml
```

### 9.4 Versionamento

- **Tag Git sugerida:** `phase1-checkpoint-20261024`
- **Commit message:** `checkpoint: pré-transformação GDI→Plataforma Nativa (v1.0.211)`
- **Próxima fase:** Fase 1 (segurança crítica) — ver §5.2

---

## 🔟 CONCLUSÃO E RECOMENDAÇÃO FINAL

### 10.1 Estado atual

A Meggy é uma **plataforma funcional e estável** com 4 apps (Web, Android, Roku, Desktop) e ~14.000 usuários potenciais. Mas é **arquiteturalmente um "GDI Melhorado"** — não uma plataforma nativa. A dívida técnica é ALTA mas **gerenciável** com o roadmap de 6 fases.

### 10.2 Recomendação

**Seguir o Caminho B (refactor incremental)** com 6 fases em 4 semanas, começando pela **Fase 1 (segurança) HOJE** — resolve 3 CRÍTICOS em <2h.

### 10.3 Skills como catalisadores

As skills ClawHub instaladas (`improve-codebase-architecture`, `code-security-audit`, `skill-clean-audit`) fornecem a **metodologia** para executar as fases 2-6 com qualidade. As skills recomendadas para instalar (§6.2) fornecem **features de produto** para a §7.

### 10.4 Próximos passos

1. ✅ Backup checkpoint feito
2. ✅ Análise arquitetural feita
3. ✅ Relatório executivo gerado (este documento)
4. 🔜 **Hoje:** executar Fase 1 (secrets) — `wrangler secret put`
5. 🔜 **Esta semana:** Fase 2 (unificação) + Fase 3 (ES modules) start
6. 🔜 **Próximas 3 semanas:** Fases 4-6

### 10.5 Métricas de sucesso

| Métrica | Antes (hoje) | Depois (4 semanas) |
|---------|--------------|-------------------|
| Vulnerabilidades CRÍTICAS | 3 | 0 |
| Vulnerabilidades ALTAS | 5 | ≤1 |
| Fontes de verdade (estado aluno) | 3 | 1 (D1) |
| Build step | ❌ (script tags) | ✅ (Vite) |
| ES modules | ❌ (window.*) | ✅ |
| Linhas duplicadas (utils) | ~50 | 0 |
| Cold start (handleRequest) | O(N) if-cascade | O(1) Map |
| RBAC | Hardcoded 1 user | D1 table + UI admin |
| Logs persistentes | ❌ (console.log) | ✅ (Logflare) |

---

## 📎 APÊNDICES

### A. Referências

- **Análise arquitetural completa:** `ANALISE_ARQUITETURA.md` (551 linhas)
- **Mapa do worker.js:** `worklog_worker_map.md` (905 linhas)
- **Mapa do frontend:** `worklog_frontend_map.md` (1304 linhas)
- **Backup checkpoint:** `backup/phase1-checkpoint-20261024-134317/`
- **Repo GitHub:** https://github.com/esaaraujo-lab/gdi_server
- **Produção:** https://educa.eu.org

### B. Skills ClawHub usadas neste relatório

- `improve-codebase-architecture` (@afonsoft, v1.1.1) — deep/shallow modules, seams
- `code-security-audit` (@LobsterAI, v2.1.0) — OWASP Top 10, secret detection
- `skill-clean-audit` (@elisabeth15501, v1.4.0) — comprehension/change risk
- `skill-finder-cn` — descoberta de skills

### C. Repos GitHub de referência

- `maple3142/GDIndex` (1873⭐) — origem
- `frappe/lms` (3340⭐) — LMS moderno
- `pupilfirst/pupilfirst` (980⭐) — LMS async
- `artcc/freelingo` (205⭐) — AI language learning

### D. Glossário

- **GDIndex** — Google Drive Index (maple3142/GDIndex), proxy Cloudflare Workers para Google Drive
- **Área do Aluno** — overlay frontend com cursos/questões/flashcards/IA (gdi-study.js + gdi-meggy.js)
- **Meggy AI** — assistente de IA (chat, resumos, flashcards, coach)
- **Bolt-on** — camada adicionada sobre um núcleo existente sem substituí-lo
- **Shallow module** — módulo cuja interface é tão complexa quanto a implementação (per skill improve-codebase-architecture)
- **Seam** — ponto onde uma interface vive,允许 alterar comportamento sem editar in-place

---

**Fim do relatório.** Próxima ação: executar Fase 1 (secrets) — `wrangler secret put`.

---

*Relatório gerado em 2026-10-24 com skills ClawHub (improve-codebase-architecture, code-security-audit, skill-clean-audit). Sem alterações de código de produção — análise somente-leitura.*
