# ⚠️ ANÁLISE DE IMPACTO E RISCOS — Estratégia B (Split-View Shell)

> **Data:** 2026-10-24
> **Base:** Plano de Ação `PLANO_ACAO_UNIFICACAO.md` + mapeamento real do código
> **Objetivo:** Listar todos os arquivos que serão alterados/criados/removidos, os riscos de quebra, e como mitigar cada um

---

## 📋 RESUMO EXECUTIVO

### Total de arquivos impactados: 31

| Categoria | Arquivos | Ação |
|-----------|----------|------|
| 🔒 **Backend (repositório PRIVADO)** | 1 | Alterar (worker.js) |
| 🌐 **Frontend core (repositório PÚBLICO)** | 4 | Alterar |
| 🆕 **Novos módulos ES (repositório PÚBLICO)** | 15 | Criar |
| 🗑️ **Arquivos legados (repositório PÚBLICO)** | 8 | Remover (após migração) |
| ⚙️ **Config (repositório PRIVADO)** | 1 | Alterar (wrangler.toml) |
| 📦 **Dependências (repositório PÚBLICO)** | 2 | Criar (package.json, vite.config.ts) |

### Risco geral: MÉDIO-ALTO (mitigável)

- **Risco de quebra de features existentes:** ALTO (overlay é bolt-on frágil)
- **Risco de perda de dados:** BAIXO (estado está em D1/localStorage, não no código)
- **Risco de regressão de UX:** MÉDIO (fluxos mudam)
- **Risco de conflito de merge:** BAIXO (repo privado + público separados)
- **Risco de downtime:** BAIXO (deploy incremental com feature flag)

---

## 1️⃣ MAPEAMENTO COMPLETO DOS ARQUIVOS

### 1.1 Arquitetura atual (como está hoje)

```
REPO PRIVADO (student_gdi):
├── worker.js              ← backend CF Workers (9.976 linhas) — serve HTML + /api/* + proxy drive
└── wrangler.toml          ← config CF (bindings D1/KV/AI + vars)

REPO PÚBLICO (gdi_server):
├── core/
│   └── app.min.js         ← GDIndex core (2.137 linhas) — UI drive, player, Bus, GDIStorage
├── modular/
│   ├── gdi-extras-loader.js  ← ENTRY POINT do frontend (carrega todos os módulos)
│   ├── gdi-core.js           ← utils base (1.620 linhas)
│   ├── gdi-ui.js             ← UI helpers (1.543 linhas)
│   ├── gdi-study.js          ← Área do Aluno monolítica (4.725 linhas)
│   ├── gdi-meggy.js          ← Meggy AI monolítica (2.750 linhas)
│   ├── gdi-pdf.js            ← PDF helpers
│   ├── gdi-list-worker.js    ← Web Worker (listagem de pastas)
│   ├── meggy-pdf-worker.js   ← Web Worker (PDF OCR)
│   ├── gdi-worker-bridge.js  ← Bridge para Web Workers
│   ├── gdi-player-enhancer.js ← Player enhancements
│   ├── gdi-ai-providers.js   ← AI providers config
│   ├── storage.js            ← GDIStorage (fetch /api/* com cache LRU)
│   ├── study/                ← SUBPASTA modularizada (12 arquivos)
│   │   ├── study-panel.js (122.601B)
│   │   ├── study-courses.js (130.011B)
│   │   ├── study-questions.js (62.150B)
│   │   ├── study-scanner.js (47.736B)
│   │   ├── study-tabs-legacy.js (42.830B)
│   │   ├── study-advanced.js (39.165B)
│   │   ├── study-insights.js (24.660B)
│   │   ├── study-plan.js (13.846B)
│   │   ├── study-notifications.js (9.958B)
│   │   ├── study-player-guard.js (10.765B)
│   │   └── study-theme.js (17.514B)
│   └── meggy/                ← SUBPASTA modularizada (6 arquivos)
│       ├── meggy-cache.js (65.370B)
│       ├── meggy-summaries.js (48.019B)
│       ├── meggy-flashcards.js (55.603B)
│       ├── meggy-questions.js (33.673B)
│       ├── meggy-pdf-engine.js (23.937B)
│       └── meggy-widget.js (nao encontrado localmente)
└── docs/                  ← documentação (já pushado)
```

### 1.2 Como o worker.js serve o frontend

```
1. Usuário acessa / → worker.js serve HTML (função html() linha 387)
2. HTML carrega:
   a. /app.min.js?v=17 → worker.js faz proxy de raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/core/app.min.js
   b. /gdi-extras.js?v=150 → worker.js faz proxy de gdi-extras-loader.js
3. gdi-extras-loader.js carrega os módulos da lista MODULES:
   - gdi-core.js (síncrono, primeiro)
   - gdi-worker-bridge.js, gdi-pdf.js, gdi-ui.js, gdi-meggy.js, gdi-study.js (async, paralelo)
4. Os módulos注册 em window.__gdiStudy, window.__gdiMeggy, etc.
5. Bus (definido no app.min.js) conecta tudo
```

---

## 2️⃣ ARQUIVOS QUE SERÃO ALTERADOS

### 2.1 Backend (repositório PRIVADO — `student_gdi`)

#### 🔴 `worker.js` (9.976 linhas) — **ALTERAR**

**O que muda:**

| Seção | Linhas | Mudança | Risco |
|-------|--------|---------|-------|
| `html()` function | 387-450 | **REESCREVER** — novo shell HTML com `<div id="root">` para React + sidebar + header + main pane | 🔴 ALTO |
| `CUSTOM_EXTRAS_SOURCES` | 275-281 | **ALTERAR** — adicionar novo entry point `/modular/shell.js` (Vite bundle) | 🟡 MÉDIO |
| `CUSTOM_APP_SOURCES` | 263-273 | **MANTER** — app.min.js ainda é necessário (player core, Bus, GDIStorage) | ✅ BAIXO |
| `/modular/` ALLOWED whitelist | 3460 | **ADICIONAR** — novos arquivos: `shell.js`, `shell.css`, `vendor.js`, `view-*.js` | 🟡 MÉDIO |
| `/api/courses/*` handlers | ~3.000-4.000 | **MANTER** — backend não muda (só frontend) | ✅ BAIXO |
| `/api/ai/*` handlers | ~4.500-5.000 | **MANTER** — backend não muda | ✅ BAIXO |
| `/admin` handler | 3.729 | **MANTER** — admin panel não muda nesta fase | ✅ BAIXO |
| `authConfig`, `uiConfig` | 78-227 | **PODE ADICIONAR** — `uiConfig.shell_enabled: true` (feature flag) | 🟢 SEGURO |

**Linhas aproximadas alteradas:** ~80 linhas (html function) + ~10 linhas (whitelist) = **~90 linhas**

**Commit:** DEVE ir para o repositório PRIVADO (`student_gdi`) — contém secrets e config sensível.

#### ⚙️ `wrangler.toml` (1.800 bytes) — **ALTERAR**

**O que muda:**
- Adicionar `MODULAR_REPO = "esaaraujo-lab/gdi_server"` se não estiver (já está, linha 239 do worker.js)
- Adicionar var `SHELL_VERSION = "1"` para cache-busting do novo shell

**Commit:** DEVE ir para o repositório PRIVADO.

### 2.2 Frontend core (repositório PÚBLICO — `gdi_server`)

#### 🟡 `core/app.min.js` (2.137 linhas) — **ALTERAR LEVEMENTE**

**O que muda:**
- **NÃO reescrever** — manter como widget interno
- Adicionar export do `Bus`, `GDIStorage`, `GDIUser` para window (já estão, mas garantir)
- Adicionar `window.__gdiShellReady = true` quando app.min.js terminar init
- Possivelmente remover a navegação de pasta padrão (será substituída pelo shell)

**Risco:** 🟡 MÉDIO — app.min.js é 95% GDIndex original, mexer pode quebrar player.

**Mitigação:** Não alterar funções core (`render`, `list`, `file_video`, etc.). Só adicionar hooks de integração com o shell.

**Linhas alteradas:** ~30-50 linhas (apenas hooks, sem reescrever).

#### 🔴 `modular/gdi-extras-loader.js` (17.785 bytes) — **ALTERAR**

**O que muda:**
- Adicionar carregamento do `shell.js` (Vite bundle) como **primeiro módulo**
- Manter carregamento dos módulos legados (gdi-study, gdi-meggy) durante a migração
- Feature flag: `window.UI.shell_enabled` → se true, carrega shell.js; senão, comportamento atual

**Risco:** 🔴 ALTO — é o entry point do frontend. Se quebrar, tela branca.

**Mitigação:** Testar em ambiente de staging antes de production. Manter fallback para o comportamento legado.

**Linhas alteradas:** ~50-80 linhas.

#### 🟡 `modular/gdi-study.js` (4.725 linhas) — **ALTERAR INCREMENTALMENTE**

**O que muda (Fase 2):**
- **Substituir os 5 `location.href`** (linhas 1583, 1847, 1853, 2748, 2760) por chamadas ao shell router
- Migrar `renderCursos()`, `openCourseDetail()` para exportar como módulos ES para o shell
- Manter funções legadas como fallback durante a migração

**Risco:** 🟡 MÉDIO — são os fluxos críticos de navegação.

**Mitigação:** Substituir um `location.href` por vez, testar, avançar. Feature flag por fluxo.

**Linhas alteradas:** ~200-300 linhas (5 pontos de redirect + 2 funções migradas).

#### 🟡 `modular/gdi-meggy.js` (2.750 linhas) — **ALTERAR (Fase 4)**

**O que muda:**
- Migrar `meggy.widget` (overlay full-screen) para drawer lateral
- Migrar `meggy.summaries._summaryModal` (se existir)
- Manter funções de IA (chat, resumos, flashcards) intactas — só muda a UI

**Risco:** 🟡 MÉDIO — Meggy AI é muito usada.

**Mitigação:** Migração por feature (chat primeiro, depois resumos, depois flashcards).

**Linhas alteradas:** ~150-200 linhas (widget → drawer).

### 2.3 Frontend modular subpastas — **MANTER INTACTAS**

Os 18 arquivos em `modular/study/` e `modular/meggy/` **NÃO serão alterados** nesta fase. Eles já estão modularizados e serão consumidos pelo novo shell como módulos ES.

| Arquivo | Status | Ação |
|---------|--------|------|
| `study/study-panel.js` (122KB) | ✅ Mantém | Consumido pelo shell |
| `study/study-courses.js` (130KB) | ✅ Mantém | Consumido pelo shell |
| `study/study-questions.js` (62KB) | ✅ Mantém | Consumido pelo shell |
| `study/study-scanner.js` (47KB) | ✅ Mantém | Consumido pelo shell |
| `study/study-advanced.js` (39KB) | ✅ Mantém | Consumido pelo shell |
| `study/study-tabs-legacy.js` (42KB) | ⚠️ Avaliar | Pode ser removido (legacy stubs) |
| `study/study-insights.js` (24KB) | ✅ Mantém | Consumido pelo shell |
| `study/study-plan.js` (13KB) | ✅ Mantém | Consumido pelo shell |
| `study/study-notifications.js` (9KB) | ✅ Mantém | Consumido pelo shell |
| `study/study-player-guard.js` (10KB) | ✅ Mantém | Consumido pelo shell |
| `study/study-theme.js` (17KB) | ✅ Mantém | Consumido pelo shell |
| `meggy/meggy-cache.js` (65KB) | ✅ Mantém | Consumido pelo shell |
| `meggy/meggy-summaries.js` (48KB) | ✅ Mantém | Consumido pelo shell |
| `meggy/meggy-flashcards.js` (55KB) | ✅ Mantém | Consumido pelo shell |
| `meggy/meggy-questions.js` (33KB) | ✅ Mantém | Consumido pelo shell |
| `meggy/meggy-pdf-engine.js` (23KB) | ✅ Mantém | Consumido pelo shell |

---

## 3️⃣ ARQUIVOS QUE SERÃO CRIADOS (repositório PÚBLICO)

### 3.1 Novo shell + módulos ES (Fases 0-1)

```
gdi_server/modular/
├── shell/                          ← NOVA PASTA
│   ├── shell.js                    ← AppShell root (React ou vanilla)
│   ├── shell.css                   ← Estilos do shell (header, sidebar, main pane, drawer)
│   ├── ShellRouter.js              ← Router client-side (history.pushState)
│   ├── Header.js                   ← Header component (logo, busca, user menu)
│   ├── Sidebar.js                  ← Sidebar component (nav items)
│   ├── MainPane.js                 ← Container de views dinâmicas
│   └── MeggyAIDrawer.js            ← Drawer lateral direito (Fase 4)
├── views/                          ← NOVA PASTA (views do main pane)
│   ├── HomeView.js                 ← Home (atalhos, continue assistindo)
│   ├── CoursesView.js              ← Grid de cursos (Fase 2)
│   ├── CourseDetailView.js         ← Detalhe do curso (Fase 2)
│   ├── FolderBrowserView.js        ← Navegador de pastas (widget GDI)
│   ├── PlayerView.js               ← Player de vídeo (Fase 3)
│   ├── QuestionsView.js            ← Questões (Fase 5)
│   ├── FlashcardsView.js           ← Flashcards (Fase 5)
│   ├── ProgressView.js             ← Progresso (Fase 5)
│   └── SettingsView.js             ← Config (Fase 5)
├── store/                          ← NOVA PASTA (state management)
│   ├── useShellStore.js            ← Zustand store (current view, current course, drawer)
│   └── useCourseStore.js           ← Zustand store (cursos, aulas)
└── package.json                    ← NOVO (deps: vite, react, zustand, tanstack-query)
└── vite.config.ts                  ← NOVO (build config)
```

**Total de novos arquivos:** ~15 arquivos JavaScript/CSS + 2 config = **17 arquivos**

**Commit:** Todos vão para o repositório PÚBLICO (`gdi_server`) sob `modular/shell/` e `modular/views/`.

### 3.2 Dependências novas (package.json)

```json
{
  "name": "meggy-shell",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zustand": "^5.0.0",
    "@tanstack/react-query": "^5.0.0",
    "history": "^5.0.0"
  },
  "devDependencies": {
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.6.0"
  }
}
```

---

## 4️⃣ ARQUIVOS QUE SERÃO REMOVIDOS (após migração completa)

### 4.1 Após Fase 6 (limpeza)

| Arquivo | Quando | Por quê |
|---------|--------|---------|
| `modular/gdi-study.js` (monolito 4.725 linhas) | Fase 6 | Substituído por `views/*.js` + `study/*.js` |
| `modular/gdi-meggy.js` (monolito 2.750 linhas) | Fase 6 | Substituído por `meggy/*.js` + `MeggyAIDrawer.js` |
| `modular/gdi-ui.js` (1.543 linhas) | Fase 6 | Absorvido pelo shell + views |
| `study/study-tabs-legacy.js` (42KB) | Fase 6 | Stubs legados (já identificado como dead code) |

**⚠️ NÃO remover durante a migração** — manter como fallback até 100% do tráfego validado no novo shell.

---

## 5️⃣ MATRIZ DE RISCOS

### 5.1 Riscos por categoria

#### 🔴 RISCOS ALTOS (quebra de features existentes)

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|-------|--------------|---------|-----------|
| R1 | **Tela branca** se gdi-extras-loader.js quebrar | Média | Crítico | Feature flag `shell_enabled` — se false, comportamento legado |
| R2 | **Player de vídeo para de funcionar** ao mudar app.min.js | Baixa | Crítico | Não mexer em funções core do player — só adicionar hooks |
| R3 | **Meggy AI drawer quebra** chat/resumos/flashcards | Média | Alto | Migrar um feature por vez (chat → resumos → flashcards) |
| R4 | **Navegação de pastas quebra** (GDI widget no main pane) | Média | Alto | Manter `gdiListAllFiles` intacto — só muda o container |
| R5 | **Resume tracking para de salvar** posição do vídeo | Baixa | Alto | Manter `GDIUser` state + `attachResumeTracking` intactos |
| R6 | **Login/logout quebra** (cookie de sessão) | Baixa | Crítico | Não mexer em `gdi_session` cookie — só no frontend |

#### 🟡 RISCOS MÉDIOS (regressão de UX)

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|-------|--------------|---------|-----------|
| R7 | **Mobile quebra** (sidebar muito larga) | Alta | Médio | Sidebar colapsa em mobile (< 768px) via CSS media query |
| R8 | **Meggy AI drawer cobre conteúdo** em telas pequenas | Alta | Médio | Drawer vira modal bottom-sheet em mobile |
| R9 | **URLs quebradas** (bookmarks antigos `/0:/CURSO/`) | Média | Médio | Redirect 301 do worker.js: `/N:/X/` → `/cursos/X` |
| R10 | **Cache do navegador serve versão antiga** | Alta | Médio | Bump `?v=` em todos os scripts (v150 → v200) |
| R11 | **Performance piora** (bundle maior com React) | Média | Médio | Code-splitting Vite + lazy loading de views |
| R12 | **SEO piora** (SPA sem SSR) | Baixa | Baixo | Manter meta tags no HTML do worker.js |

#### 🟢 RISCOS BAIXOS

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|-------|--------------|---------|-----------|
| R13 | **Perda de dados do usuário** (cursos, progresso) | Muito baixa | Crítico | Estado em D1 + localStorage — não no código. Backup já feito. |
| R14 | **Conflito de merge** entre público e privado | Baixa | Baixo | Repos separados — worker.js só no privado, frontend só no público |
| R15 | **Downtime durante deploy** | Baixa | Médio | Deploy incremental + feature flag + rollback rápido |
| R16 | **Custo Cloudflare aumenta** | Baixa | Baixo | Sem mudança no backend — só frontend |

### 5.2 Riscos por fase do plano

| Fase | Riscos principais | Mitigação específica |
|------|-------------------|---------------------|
| **Fase 0** (Preparação) | R1 (tela branca) | Feature flag OFF por padrão |
| **Fase 1** (App Shell) | R1, R10 | Staging environment + cache busting |
| **Fase 2** (Cursos) | R4, R7, R9 | Manter location.href antigo como fallback |
| **Fase 3** (Player) | R2, R5 | Não mexer em player core — só container |
| **Fase 4** (Meggy AI) | R3, R8 | Migração por feature (chat primeiro) |
| **Fase 5** (Outros) | R11 | Lazy loading de views |
| **Fase 6** (Limpeza) | R1 | Só remover legado após 7 dias estável |

---

## 6️⃣ ESTRATÉGIA DE COMMIT (PÚBLICO vs PRIVADO)

### 6.1 Regra de ouro

| Tipo de arquivo | Repo | Por quê |
|----------------|------|--------|
| `worker.js` | 🔒 **PRIVADO** (`student_gdi`) | Contém secrets (Google SA keys, OAuth, etc.) — já bloqueado pelo GitHub se pushar para público |
| `wrangler.toml` | 🔒 **PRIVADO** (`student_gdi`) | Contém bindings + vars de ambiente |
| `core/app.min.js` | 🌐 **PÚBLICO** (`gdi_server`) | Código frontend, sem secrets |
| `modular/*.js` | 🌐 **PÚBLICO** (`gdi_server`) | Código frontend, sem secrets |
| `modular/shell/*` (novos) | 🌐 **PÚBLICO** (`gdi_server`) | Código frontend, sem secrets |
| `modular/views/*` (novos) | 🌐 **PÚBLICO** (`gdi_server`) | Código frontend, sem secrets |
| `package.json`, `vite.config.ts` | 🌐 **PÚBLICO** (`gdi_server`) | Config de build, sem secrets |

### 6.2 Fluxo de commit por fase

#### Fase 0 — Preparação
```
PÚBLICO (gdi_server):
  + modular/package.json
  + modular/vite.config.ts
  + modular/shell/.gitkeep

PRIVADO (student_gdi):
  (sem mudanças)
```

#### Fase 1 — App Shell
```
PÚBLICO (gdi_server):
  + modular/shell/shell.js
  + modular/shell/shell.css
  + modular/shell/ShellRouter.js
  + modular/shell/Header.js
  + modular/shell/Sidebar.js
  + modular/shell/MainPane.js
  + modular/shell/store/useShellStore.js
  M modular/gdi-extras-loader.js  (adiciona carregamento do shell.js)
  M core/app.min.js  (adiciona window.__gdiShellReady hook)

PRIVADO (student_gdi):
  M worker.js  (função html() reescrita + whitelist + feature flag)
  M wrangler.toml  (SHELL_VERSION var)
```

#### Fase 2 — Migração Cursos
```
PÚBLICO (gdi_server):
  + modular/views/HomeView.js
  + modular/views/CoursesView.js
  + modular/views/CourseDetailView.js
  + modular/views/FolderBrowserView.js
  + modular/shell/store/useCourseStore.js
  M modular/gdi-study.js  (substituir 5 location.href por router.push)

PRIVADO (student_gdi):
  (sem mudanças)
```

#### Fase 3 — Migração Player
```
PÚBLICO (gdi_server):
  + modular/views/PlayerView.js
  M modular/gdi-study.js  (remover player overlay, integrar ao main pane)

PRIVADO (student_gdi):
  (sem mudanças)
```

#### Fase 4 — Migração Meggy AI
```
PÚBLICO (gdi_server):
  + modular/shell/MeggyAIDrawer.js
  M modular/gdi-meggy.js  (widget → drawer)

PRIVADO (student_gdi):
  (sem mudanças)
```

#### Fase 5 — Outros Módulos
```
PÚBLICO (gdi_server):
  + modular/views/QuestionsView.js
  + modular/views/FlashcardsView.js
  + modular/views/ProgressView.js
  + modular/views/SettingsView.js

PRIVADO (student_gdi):
  (sem mudanças)
```

#### Fase 6 — Limpeza
```
PÚBLICO (gdi_server):
  - modular/gdi-study.js  (remover monolito)
  - modular/gdi-meggy.js  (remover monolito)
  - modular/gdi-ui.js  (absorvido pelo shell)
  - modular/study/study-tabs-legacy.js  (dead code)
  M modular/gdi-extras-loader.js  (remover carregamento de legados)

PRIVADO (student_gdi):
  M worker.js  (remover fallbacks de legados, otimizar)
```

### 6.3 Sequência de deploy (para evitar downtime)

```
1. Push PÚBLICO (gdi_server) primeiro — novos arquivos + mudanças em gdi-extras-loader.js
   → Feature flag shell_enabled = false (legado ainda funciona)
2. Push PRIVADO (student_gdi) — worker.js com nova função html() + feature flag
   → Feature flag ainda = false (legado ainda funciona)
3. wrangler deploy (privado) — publica novo worker
   → Tudo ainda funciona em modo legado
4. Testar em staging com shell_enabled = true (via query param ?shell=1)
5. Ativar shell_enabled = true em produção (via wrangler.toml var)
6. Monitorar 7 dias
7. Fase 6: remover legados
```

---

## 7️⃣ ESTRATÉGIA DE MITIGAÇÃO DETALHADA

### 7.1 Feature Flag (mitiga R1, R3, R4, R6)

```javascript
// worker.js (linha ~227, em uiConfig)
uiConfig.shell_enabled = false;  // ★ default: OFF (legado)

// Para ativar em produção:
// wrangler.toml: [vars] SHELL_ENABLED = "true"
// ou query param: ?shell=1 (para teste individual)

// gdi-extras-loader.js
if (window.UI.shell_enabled || new URLSearchParams(location.search).get('shell')) {
  await loadScript('/modular/shell/shell.js?v=' + CACHE_VERSION);
} else {
  // comportamento legado
  await loadScript('/modular/gdi-study.js?v=' + CACHE_VERSION);
  await loadScript('/modular/gdi-meggy.js?v=' + CACHE_VERSION);
}
```

**Benefício:** Pode reverter instantaneamente mudando a var. Sem redeploy.

### 7.2 Backup + Rollback (mitiga R1, R15)

```bash
# Backup já feito (checkpoint-20261024)
# Antes de cada fase:
git tag pre-fase-N  # em ambos os repos

# Rollback rápido:
# 1. Reverter worker.js para versão anterior (repo privado)
git checkout pre-fase-N -- student_gdi/worker.js
# 2. wrangler deploy
# 3. Reverter frontend (repo público) — CDN cache invalida em 5 min
```

### 7.3 Migração Incremental (mitiga R2, R3, R4, R5)

**NUNCA** migrar tudo de uma vez. Cada fase migra UM fluxo:

```
Fase 2: só fluxo Cursos → Detalhe → Aula
  (Meggy AI, Questões, Flashcards ainda usam overlay legado)

Fase 3: só Player
  (Meggy AI ainda overlay)

Fase 4: só Meggy AI
  (tudo resto já migrado)

Fase 5: Questões, Flashcards, Progresso, Config
```

**Benefício:** Se quebrar, isola o problema em um fluxo só.

### 7.4 Teste em Staging (mitiga R1, R7, R8, R11)

```bash
# Criar worker de staging (subdomínio diferente)
wrangler deploy --name meggy-staging --env staging

# Testar com:
# https://meggy-staging.educa.workers.dev/?shell=1

# Testes automáticos (Playwright):
# 1. Login
# 2. Clicar em Curso → não recarrega página
# 3. Clicar em Aula → player abre no main pane
# 4. Abrir Meggy AI drawer
# 5. Mobile: sidebar colapsa
```

### 7.5 Redirect 301 (mitiga R9)

```javascript
// worker.js — adicionar no handleRequest
const OLD_DRIVE_PATH = /^\/(\d+):\/(.+)$/;
const match = path.match(OLD_DRIVE_PATH);
if (match && uiConfig.shell_enabled) {
  const driveIdx = match[1];
  const coursePath = match[2];
  // Redirect para nova URL do shell
  return Response.redirect(`https://educa.eu.org/cursos/${encodeURIComponent(coursePath)}`, 301);
}
```

**Benefício:** Bookmarks antigos continuam funcionando.

### 7.6 Cache Busting (mitiga R10)

```javascript
// Sempre bumpar ?v= ao mudar arquivos
const CACHE_VERSION = '200';  // era 150

// Em todos os <script src>:
<script src="/gdi-extras.js?v=200" defer></script>
<script src="/modular/shell/shell.js?v=200" defer></script>
```

**Benefício:** Garante que usuários peguem a versão nova.

### 7.7 Monitoramento (mitiga todos)

Após cada deploy, monitorar:
- **Cloudflare Analytics:** taxa de erro 5xx, tempo de resposta
- **Console do navegador:** erros JavaScript (via Sentry ou similar)
- **Feedback de usuários:** canal de suporte
- **Métricas de uso:** pageviews, tempo na página

Se erro 5xx > 1% ou erros JS > 5%, **reverter imediatamente**.

---

## 8️⃣ CHECKLIST PRÉ-DEPLOY (por fase)

Antes de cada deploy, confirmar:

- [ ] Backup tag criada (`git tag pre-fase-N`)
- [ ] Feature flag `shell_enabled = false` em produção
- [ ] Testes em staging passaram (`?shell=1`)
- [ ] Cache version bumped (`?v=N+1`)
- [ ] Redirect 301 configurado (se URLs mudaram)
- [ ] Rollback plan documentado
- [ ] Monitoramento ativo

---

## 9️⃣ RESUMO FINAL

### Arquivos por repo

| Repo | Alterados | Criados | Removidos | Total |
|------|-----------|---------|-----------|-------|
| 🔒 **PRIVADO** (`student_gdi`) | 2 (worker.js, wrangler.toml) | 0 | 0 | 2 |
| 🌐 **PÚBLICO** (`gdi_server`) | 4 (app.min.js, gdi-extras-loader.js, gdi-study.js, gdi-meggy.js) | 17 (shell + views + store + config) | 4 (legados na Fase 6) | 25 |
| **TOTAL** | **6** | **17** | **4** | **27** |

### Risco geral: MÉDIO-ALTO, totalmente mitigável

- Feature flag permite reverter instantaneamente
- Migração incremental isola problemas
- Backup + rollback plan garantem recuperação
- Testes em staging antes de produção
- Redirect 301 preserva bookmarks

### Tempo estimado com mitigações

| Plano original | Com mitigações | Diferença |
|---------------|----------------|-----------|
| 14-19 dias | 18-24 dias | +4-5 dias (testes + staging + feature flags) |

**Vale a pena?** SIM — as mitigações reduzem o risco de "quebrar tudo" para "quebrar isoladamente, com revert rápido".

---

## 📎 APÊNDICE — COMANDOS DE DEPLOY

### Deploy backend (privado)
```bash
cd /home/z/my-project/student_gdi
git add worker.js wrangler.toml
git commit -m "feat(shell): fase N — worker.js html() reescrita + feature flag"
git push origin main
wrangler deploy
```

### Deploy frontend (público)
```bash
cd /home/z/my-project/gdi_server  # (ou via API GitHub)
git add modular/shell/ modular/views/ core/app.min.js modular/gdi-extras-loader.js
git commit -m "feat(shell): fase N — AppShell + views + hooks"
git push origin main
# CDN jsdelivr cache invalida em ~5 min
```

### Ativar feature flag (produção)
```bash
# Em wrangler.toml:
[vars]
SHELL_ENABLED = "true"

# Ou via wrangler secret (mais seguro):
wrangler secret put SHELL_ENABLED
# digitar: true

# Deploy:
wrangler deploy
```

### Reverter (rollback)
```bash
# 1. Desativar feature flag
wrangler secret put SHELL_ENABLED
# digitar: false
wrangler deploy

# 2. (Opcional) Reverter código
git checkout pre-fase-N -- student_gdi/worker.js
wrangler deploy
```

---

**Fim da análise.** Próxima ação: confirmar se quer prosseguir com a Estratégia B + mitigações, e começar Fase 0.

---

*Análise criada em 2026-10-24 com base em mapeamento real dos arquivos (`worker.js`, `modular/`, `core/`) + 16 riscos identificados + 7 estratégias de mitigação.*
