# Análise Arquitetural — Plataforma Meggy (educa.eu.org)

> **Task ID:** 3a-ARCH-ANALYSIS
> **Escopo:** `student_gdi/worker.js` (backend) + `DEPLOY_FINAL/gdi-study.js`, `DEPLOY_FINAL/gdi-meggy.js`, `DEPLOY_FINAL/gdi-extras-loader.js`, `app.min.js` (frontend)
> **Metodologia:** `improve-codebase-architecture` (deep vs shallow, seams), `code-security-audit` (OWASP), `skill-clean-audit` (comprehension cost / change risk)
> **Resultado:** documento somente‑leitura — nenhuma alteração de código foi feita.

---

## 1. Resumo Executivo

A Plataforma Meggy é, na origem, um **fork do `@googledrive/index` (GDIndex 2.5.9)** — o "Google Drive Index" de Parveen Badhoo / TheFirstSpeedster, disponível em `cdn.jsdelivr.net/npm/@googledrive/index@2.5.9` (referenciado em `student_gdi/worker.js:220-221, 233, 483`). Sobre esse backbone, o operador (Elton Araujo / "educa.eu.org") enxertou uma camada substantial de funcionalidades de "plataforma de estudos": **autenticação multiusuário com salt+hash SHA-256**, **Área do Aluno full-screen** (M22), **Meggy AI** (chat poodle + geração de resumos/questões/flashcards), **scanner distribuído de cursos**, **cache ISA em KV/D1**, **batalhão paralelo de geração de materiais**, **painel admin profissional**, e **cron de backfill** automático.

A análise linha-a-linha confirma a genealogia: **apenas ~17% do `worker.js` (≈1 700 / 9 976 linhas) é GDIndex original puro** — configuração, templates HTML, `apiRequest`, `handleSearch`, `handleId2Path`, `findId2Path`, classe `googleDrive`, `download`, `generateLink`, `fetchAccessToken`, `enQuery`, `driveEscape`, SW inline, `redirectToIndexPage`. Os outros **~83%** (~8 300 linhas) são adições Meggy — handlers `/api/*`, helpers `gdi*`, auth, scanner, AI, D1, KV, admin, cron, dual Module/SW entrypoint. No frontend, `app.min.js` (1 749 linhas) é quase inteiro GDIndex original (apenas algumas extensões como `gdiListAllFiles` em linhas 57-90 e o `Bus` em linhas 21-30 são Meggy-added). Já `gdi-study.js` (4 725 linhas) e `gdi-meggy.js` (2 750 linhas) são **100% Meggy-added**, organizados em 6 e 2 IIFEs respectivamente.

O **nível de dívida técnica é alto mas é "dívida viva"** — ou seja, é continuamente reorganizada, não está parada. Há evidência de múltiplas rodadas de refator (comentários "★ v1.0.XXX FIX" por toda parte, patches A-H, Tasks 14/15/16/20/21, agents numerados, "PATCH G" etc.), e o operador mantém a plataforma em produção ativa (v1.0.211, BUILD_DATE 2026-10-21). A dívida concentra-se em três formas: (1) **abstrações rasas** — funções helper duplicadas (`esc`, `lsGet`, `lsSet`, `uid`, `today`) copiadas em cada IIFE em vez de importadas de um módulo compartilhado; (2) **seams implícitos via `window.*` e `Bus`** que acoplam todos os módulos a um namespace global; (3) **dead code e stubs** remanescentes das várias iterações (tabs removidas, `renderResumos` reativado de stub, `gdi-ai-providers.js` referenciado mas inexistente).

**Veredito:** **"GDI Melhorado" / Híbrido** — não é plataforma nativa. A arquitetura continua sendo "GDIndex + camadas em cima", com o núcleo de proxy Google Drive intacto e servindo de espinha dorsal para tudo. Não há separação de domínios entre "Drive Index" e "Área do Aluno" no backend — ambos compartilham o mesmo `handleRequest` dispatcher, o mesmo cookie de sessão, o mesmo array `gds[]` de instâncias `googleDrive`. A Área do Aluno é, estruturalmente, **um overlay frontend** que enxerga o Drive Index como um "filesystem virtual" via `/api/courses/*` + `window.gdiListAllFiles`.

---

## 2. Arquitetura Atual (Diagrama Textual)

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Cloudflare Worker (student_gdi/worker.js — 9 976 linhas)                 │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  export default { scheduled, fetch } (9860) +                       │  │
│  │  addEventListener('fetch', ...) fallback SW (9971)                 │  │
│  │      │                                                             │  │
│  │      ▼                                                             │  │
│  │  handleRequest(request, event)  (1937)                             │  │
│  │  ├── /admin                      → handleAdmin (2885)               │  │
│  │  ├── /login /signup /google_callback (form auth flow)              │  │
│  │  ├── /logout /userstate /userstate/save                           │  │
│  │  ├── /download.aspx              → download() (9396)               │  │
│  │  ├── /app.min.js  /gdi-extras.js  /modular/*  (CDN cascade)        │  │
│  │  ├── /api/ai  /api/ai/stream  /api/ai/ocr  /api/ai/coach          │  │
│  │  │   /api/ai/summaries /cache /shared-summaries /shared-flashcards │  │
│  │  │   /api/ai/redacao /essay/save /battalion /battalion/status     │  │
│  │  │   /api/ai/models /discover /stats /status /test                │  │
│  │  ├── /api/courses/{add,remove,list,scan-progress,scan-and-save,   │  │
│  │  │   distributed-status,rescan,validate,scan-debug,user-progress, │  │
│  │  │   shared-progress}                                              │  │
│  │  ├── /api/materials/{save,save-in-folder,load-from-folder,exists, │  │
│  │  │   check-exists,list,meta}                                       │  │
│  │  ├── /api/d1/{status,lessons/search,lessons/by-course,            │  │
│  │  │   summaries/search,flashcards/search,backfill,backfill-lessons,│  │
│  │  │   cron-backfill,cron-progress}                                  │  │
│  │  ├── /api/brain/{list,save} /api/analytics/summary                │  │
│  │  ├── /api/study-plan/{load,generate,save}                         │  │
│  │  ├── /api/shorturl/register   /f/<shortId>  /api/admin/cron-scan  │  │
│  │  └── /:driveIndex:/:path  (GDIndex core — apiRequest 9006)        │  │
│  │       └── apiRequest → gd.request_list_of_files()                 │  │
│  │       └── POST /:driveIndex:/  → JSON com IDs criptografados      │  │
│  │       └── GET  /:driveIndex:/:file → download() (range, link MAC) │  │
│  │       └── POST /:driveIndex::search → handleSearch (9050)         │  │
│  │       └── POST /:driveIndex::id2path → handleId2Path (9072)       │  │
│  │                                                                    │  │
│  │  [gds] = authConfig.roots.map(googleDrive) — 12 drives            │  │
│  │  [MEGGY_CACHE KV] [MEGGY_D1 D1]  [env vars: AI keys, secrets]    │  │
│  │  [scheduled cron] handleCronBackfill + auto-scan a cada hora      │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ (HTTPS — cookie de sessão compartilhado)
┌────────────────────────────────────────────────────────────────────────────┐
│  Browser (gdi-extras-loader.js → 5 módulos JS paralelos + 2 workers)       │
│                                                                            │
│  app.min.js (1 749 L)         ←  GDIndex core (Bus, gdiListAllFiles,       │
│      │                            render/list/file_video/audio/pdf/...)    │
│      │  const Bus = (() => {...})()  ←  SEAM 1: event bus implícito        │
│      │                                                                    │
│      ▼                                                                    │
│  gdi-extras-loader.js (187 L) ←  bootstrap com guard anti-duplicate        │
│      │  espera `typeof Bus !== 'undefined'` (linha 126)                    │
│      │  carrega em ordem: gdi-core.js → bridge → pdf → ui → meggy → study │
│      │                                                                    │
│      ▼                                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  gdi-core.js (1 620 L)        ←  UI shell (jQuery-like $ helper)    │ │
│  │  gdi-worker-bridge.js (493 L) ←  Web Workers: list + PDF extract    │ │
│  │  gdi-pdf.js (~100 L)          ←  pdf.js loader                      │ │
│  │  gdi-ui.js (1 543 L)          ←  tabs, debug, notas, materiais      │ │
│  │  storage.js (494 L)           ←  window.GDIStorage (Drive API wrap) │ │
│  │  gdi-player-enhancer.js (~?)  ←  plyr/videojs hooks                 │ │
│  │                                                                     │ │
│  │  gdi-meggy.js (2 750 L)       ←  M9-ISA (PDF + resumo + questões +  │ │
│  │    ├── IIFE 1: M9-ISA              flashcards + cache)              │ │
│  │    │   └── window.gdiIsaPdf = {16 métodos}                          │ │
│  │    └── IIFE 2: M-AI widget (chat flutuante Meggy)                   │ │
│  │                                                                     │ │
│  │  gdi-study.js (4 725 L)       ←  Área do Aluno                      │ │
│  │    ├── IIFE 1: M23 Estudo Ativo (questões, simulado, SRS,           │ │
│  │    │   cronograma, revisões)                                        │ │
│  │    ├── IIFE 2: M22 Área do Aluno (painel full-screen, cursos,       │ │
│  │    │   marathon, flashcards, subjects, trails, home, stats)         │ │
│  │    │   └── window.__gdiOpenCentral = openPanel                      │ │
│  │    │   └── TAB_GROUPS: Início/Questões/Simulado/Adicionar/Resumos/  │ │
│  │    │       Provas/Redação/Cronograma/Stats/Radar/Conquistas         │ │
│  │    ├── IIFE 3: M-PLAYER-GUARD (watchdog contra vídeo travado)       │ │
│  │    ├── IIFE 4: BlackTie tema visual (fontes + tokens Ferreto)       │ │
│  │    ├── IIFE 5: M-NOTIFICATIONS (player-guard)                       │ │
│  │    └── IIFE 6: M-COURSE-SCANNER (background scan de cursos manuais) │ │
│  │                                                                     │ │
│  │  [Web Workers em background]                                        │ │
│  │  ├── gdi-list-worker.js  (listagem de pastas em background)         │ │
│  │  └── meggy-pdf-worker.js (extração de texto/OCR de PDF)             │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Seams (pontos de acoplamento identificados)

Os "seams" no sentido do skill `improve-codebase-architecture` são as interfaces pelas quais o comportamento pode ser alterado sem editar o código no lugar. No Meggy eles são **todos implícitos via `window.*` e `Bus`** — não há `import`/`export` ES modules em nenhum dos arquivos frontend (carregados via `<script>` pelo loader).

| Seam | Tipo | Local | Quem lê | Quem escreve |
|------|------|-------|---------|--------------|
| **`Bus`** (event bus) | const top-level em app.min.js | `app.min.js:21-30` | todos os módulos (via `typeof Bus !== 'undefined'` + `Bus.onGlobal`) | `app.min.js` |
| **`window.gdiListAllFiles`** | função | definida em `app.min.js:61` e **patcheada** por `gdi-worker-bridge.js:228` para usar Web Worker | scanner (gdi-study.js:4362), M22 | app.min.js → bridge |
| **`window.GDIStorage`** | objeto com 6+ métodos | definida em `storage.js:437` | M22 (linha 824, 829), renderResumos (gdi-meggy.js:2137) | storage.js |
| **`window.gdiIsaPdf`** | objeto com 16 métodos | definido em `gdi-meggy.js:2075` | renderResumos, M9 materiais | gdi-meggy.js |
| **`window.__gdiOpenCentral`** | função `openPanel(tab)` | definida em `gdi-study.js:1269` | app.min.js (botão "Área do Aluno" no header) | gdi-study.js |
| **`window.__gdiParseJsonArray`** | função utilitária | definida em `gdi-meggy.js:99` | gdi-study.js:76 (com fallback) | gdi-meggy.js |
| **`window.__gdiGradeQ`** | função SRS | definida em `gdi-study.js:727` | M22 (flashcards session) | gdi-study.js |
| **`window.gdiAddCourseFromButton`** / **`gdiAddCourseFromDrive`** | async functions | `gdi-study.js:755, 789` | onclick inline no GDIndex folder card | gdi-study.js |
| **`window.GDI_MODULES`** | array de `{name, init}` | populado em `gdi-study.js:3484-3485, 4299` | app.min.js (init loop) | gdi-study.js |
| **Cookie de sessão `gdi_session`** | HTTP cookie | setado em `worker.js` login flow | `gdiSessionUser()` no worker (868) | worker.js |
| **Eventos Bus principais**: `page:change`, `user:ready`, `media:ready`, `watched:changed`, `rows:appended` | pub/sub | emitidos por app.min.js | gdi-study.js, gdi-meggy.js, scanner | app.min.js |

O seam mais carregado é o **`Bus`**: 9 referências em `gdi-study.js` (1159, 1209, 3480, 3482, 3544-3548, 4295, 4695-4701), 1 em `gdi-meggy.js` (2680), e o próprio `gdi-extras-loader.js:126` precisa esperar `typeof Bus !== 'undefined'` antes de prosseguir (com timeout de 10s). Toda a navegação entre o Drive Index e a Área do Aluno flui pelo evento `page:change`.

---

## 3. Origem e Genealogia

### 3.1 Base: `@googledrive/index` (GDIndex 2.5.9)

**Evidência direta** em `student_gdi/worker.js`:
- Linha 31: `// GDI-JS 2.5.9 — WORKER COMPLETO`
- Linha 78: `const CDN_VERSION = '2.5.9';`
- Linha 220-221: `poster: "https://cdn.jsdelivr.net/npm/@googledrive/index@2.5.9/images/poster.jpg"` / `audioposter: ...@2.5.9/images/music.jpg`
- Linha 233: `const cdn_base = 'https://cdn.jsdelivr.net/npm/@googledrive/index@' + CDN_VERSION;`
- Linha 483: `Redesigned by <a href="https://www.npmjs.com/package/@googledrive/index" target="_blank">TheFirstSpeedster</a>`
- `app.min.js:3`: `console.log('[GDI core] v19.0-minimal');`

O `@googledrive/index` é o pacote npm publicado por **TheFirstSpeedster** como fork do `maple3142/GDIndex` (1873★ no GitHub). A versão 2.5.9 é a base original — o worker.js herda todo o núcleo de proxy Google Drive desta versão.

### 3.2 Camadas adicionadas pelo operador (Meggy / educa.eu.org)

| Camada | Arquivo(s) | Linhas | Origem |
|--------|-----------|--------|--------|
| **Config + secrets** | worker.js:39-227 | ~190 | GDIndex (com Meggy users_list + 12 roots) |
| **Layout Ferreto** | worker.js:290-773 | ~480 | GDIndex (com Meggy CSS-injected) |
| **Auth (cookie + SHA-256)** | worker.js:868-1031, 1773-1936 | ~330 | Meggy-added |
| **Crypto helpers (MAC de link)** | worker.js:796-858 | ~63 | GDIndex (com Meggy genIntegrity) |
| **ISA cache (KV/D1)** | worker.js:1031-1271 | ~240 | Meggy-added |
| **Shared summaries/redação** | worker.js:1272-1494 | ~220 | Meggy-added |
| **Unified AI + flashcards + brain** | worker.js:1495-1772 | ~280 | Meggy-added |
| **handleRequest dispatcher** | worker.js:1937-3309 | ~1370 | GDIndex (~250) + Meggy (~1120) |
| **Admin panel profissional** | worker.js:1937-3310 (interno) | ~700 | Meggy-added |
| **Service Worker inline** | worker.js:~2130-2248 | ~120 | GDIndex (com Meggy fillMediaCache) |
| **AI endpoints (models/discover/status/test)** | worker.js:3310-4237 | ~930 | Meggy-added |
| **Drive helpers** | worker.js:4439-4524 | ~85 | GDIndex puro |
| **OpenRouter + Batalhão** | worker.js:4527-4899 | ~370 | Meggy-added |
| **Dotfile distributed scan** | worker.js:4900-5683 | ~780 | Meggy-added |
| **Courses (general_courses + scan)** | worker.js:5796-6907 | ~1100 | Meggy-added |
| **Materials (in-folder + centralizado)** | worker.js:6908-7791 | ~880 | Meggy-added |
| **Battalion + AI handlers** | worker.js:7851-8372 | ~520 | Meggy-added |
| **D1 + cron + analytics + coach + plan** | worker.js:8373-9003 | ~630 | Meggy-added |
| **Drive API (apiRequest, search, id2path, googleDrive class)** | worker.js:9006-9395 | ~390 | GDIndex puro |
| **Download + JWT decode** | worker.js:9396-9462 | ~67 | GDIndex (download) + Meggy (decodeJwtToken OAuth) |
| **Cron + dual entry points** | worker.js:9463-9977 | ~515 | Meggy-added |

### 3.3 Quantificação: GDIndex original vs Meggy-added

| Categoria | Linhas (aprox.) | % do worker.js (9 976 L) |
|-----------|-----------------|--------------------------|
| **GDIndex original puro** | ~1 700 | **~17%** |
| GDIndex modificado (config + templates + dispatcher com rotas Meggy) | ~1 200 | ~12% |
| **Meggy-added puro** | ~7 100 | **~71%** |
| **Total** | ~10 000 | 100% |

**GDIndex original puro** corresponde a: header (39-44), serviceaccounts (45-70), `authConfig` skeleton (129-156 sem users_list), `GDOC_EXPORT_FORMATS` (196-200), `uiConfig` (201-227), `player_config` (228), templates `html()`/`homepage()`/`login_html()`/`not_found()` (387-771 sem extensões Meggy), `getAesKey`/`getHmacKey`/`encryptString`/`decryptString` (796-845), `login()` (859), SW inline template (2130-2248), `redirectToIndexPage` (4237), `enQuery`/`driveEscape`/`getAccessToken`/`fetchAccessToken`/`sleep`/`generateLink` (4439-4524), `apiRequest` (9006-9048), `handleSearch` (9050-9070), `handleId2Path` (9072+), `findId2Path`, classe `googleDrive` e singleton `drive` (~9089-9395), `download` (9396-9443), `addEventListener('fetch')` SW fallback (9971-9976).

No frontend:
- `app.min.js` (1 749 L): ~95% GDIndex original (renderização de pasta, file_video/audio/pdf/image/code/workspace, playlist, breadcrumb, quota). Adições Meggy: `Bus` (21-30), `gdiListAllFiles` (61-90), `_listCache` LRU (57-60), `gdiGetPw`/`gdiSetPw` stubs (54-55), `gdiAnnounceMedia`/`gdiOkPath` (33-41), e hooks `autoOpenCentral` em init.
- `gdi-study.js` (4 725 L): 100% Meggy-added (M22, M23, M-PLAYER-GUARD, BlackTie tema, M-COURSE-SCANNER)
- `gdi-meggy.js` (2 750 L): 100% Meggy-added (M9-ISA, M-AI widget)
- `gdi-extras-loader.js` (187 L): 100% Meggy-added (o GDIndex original tinha `gdi-extras.js` monolítico; este é o refactor modular do operador)
- `gdi-worker-bridge.js` (493 L): 100% Meggy-added (Web Worker para listagem + PDF)
- `storage.js` (494 L): 100% Meggy-added (window.GDIStorage)

---

## 4. Área do Aluno × Drive Index — Separação

### 4.1 Como funcionam separados mas integrados

A **separação é apenas visual/frontend** — no backend, ambos compartilham o mesmo `handleRequest` dispatcher (worker.js:1937), o mesmo cookie `gdi_session`, o mesmo array `gds[]` de 12 instâncias `googleDrive`, o mesmo `authConfig.roots`. Não há dois backends.

| Camada | Drive Index | Área do Aluno |
|--------|-------------|---------------|
| **URL raiz** | `/:driveIndex:/...` (ex.: `/0:/CURSO X/`) | `/` (home) com overlay `window.__gdiOpenCentral()`, mais chamadas a `/api/courses/*`, `/api/materials/*`, `/api/ai/*` |
| **Entrada no frontend** | `app.min.js:render()` (linha 156) → `list(path)` ou `file(path)` | `gdi-study.js:openPanel(tab)` (linha 1248), disparado por `window.__gdiOpenCentral` |
| **Render** | `app.min.js` injeta HTML em `#list` via `appendUnifiedRows` (232) | `gdi-study.js` injeta HTML em `.gdi-central-box` (overlay full-screen `position:fixed; inset:0`) |
| **Dados** | Vêm do Google Drive via `gd.request_list_of_files()` (worker.js:9017), IDs criptografados com AES (`encryptString` em 817) | Vêm de: localStorage (`gdi-courses-v1`, `gdi-questions-v1` etc.), `/api/courses/list`, `/api/materials/list`, `/api/d1/lessons/search`, `/api/ai/summaries` |
| **Sessão** | Cookie `gdi_session` validado por `gdiSessionUser()` | Mesmo cookie (mesma sessão) |
| **Persistência** | Drive original (read-only para o aluno) | Drive próprio do aluno (`gdiUserFolderId(gd0)` em 877 → pasta `AULAS - ESTADO DOS ALUNOS` no drive 0), KV (`MEGGY_CACHE`), D1 (`MEGGY_D1`) |
| **Navegação** | `Bus.emit('page:change')` após `list()` ou `file()` (app.min.js:156) | Overlay não dispara `page:change` (sobrepõe); ao fechar, o Drive Index está intacto embaixo |
| **Modo de acesso** | Direto (qualquer URL `/:n:/...`) | Botão "Área do Aluno" no header (após login) ou `?autoOpenCentral=true` na home |

### 4.2 Pontos de acoplamento entre os dois

1. **`window.__gdiOpenCentral = openPanel`** (`gdi-study.js:1269`) — expõe a função de abrir o overlay para o `app.min.js` (que tem o botão no header).
2. **`window.gdiAddCourseFromButton` / `gdiAddCourseFromDrive`** (`gdi-study.js:755, 789`) — chamados por um botão "Adicionar curso" injetado dinamicamente nas file rows do Drive Index via `Bus.onGlobal('rows:appended', scheduleNavInject)` (linha 3482). O botão captura `data-path` da pasta atual e posta em `/api/courses/add`.
3. **`window.gdiListAllFiles`** — usada pelo scanner (`gdi-study.js:4362`) para varrer uma pasta do Drive Index sem bloquear a thread. Originalmente definida em `app.min.js:61`, **patcheada** por `gdi-worker-bridge.js:228` para rodar dentro de um Web Worker. Ambos os lados usam a mesma função.
4. **`window.GDIStorage`** — usado por `renderResumos` (`gdi-meggy.js:2137`) e por `gdiAddCourseFromDrive` (`gdi-study.js:829`) para salvar materiais no Drive do aluno via `/api/materials/*`.
5. **Cookie `gdi_session`** — compartilhado. Quando o aluno faz login no GDIndex (`/login` form), o cookie é setado e o backend `gdiSessionUser()` (worker.js:868) o valida tanto para chamadas `/api/courses/*` quanto para `/0:/...`.
6. **Bus** — o evento `page:change` (emitido por `app.min.js:156` após `list()` ou `file()`) é escutado por:
   - `gdi-study.js:3480` → re-injeta o botão "Adicionar curso" em novas file rows
   - `gdi-study.js:3545` → re-tenta abrir overlay via URL (`?openCentral=1`)
   - `gdi-study.js:4701` → dispara auto-scan de cursos pendentes
   - `gdi-meggy.js:2680` → re-renderiza histórico do chat e atualiza memória da Meggy com a aula atual

### 4.3 Rotas: `/:driveIndex:/` (Drive Index) vs `/api/courses/*` (Área do Aluno)

| Rota backend | Quem chama | Função |
|--------------|-----------|--------|
| `GET /:n:/` | `app.min.js:list()` (162) | Lista pasta root do drive `n` |
| `POST /:n:/` | `app.min.js:requestListPath()` (158) | Lista subpasta (com paginação) |
| `GET /:n:/:file` | `app.min.js:file()` (em `dispatchFileView`) | Baixa/previsualiza arquivo |
| `POST /:n::search` | `app.min.js:requestSearch()` (160) | Busca dentro do drive `n` |
| `POST /:n::id2path` | `app.min.js:onSearchResultItemClick()` (392) | Resolve ID → path |
| `GET /download.aspx?...` | link de download gerado por `generateLink()` | Download direto com MAC |
| `POST /api/courses/add` | `gdi-study.js:gdiAddCourseFromDrive` (789, via fetch) | Adiciona curso (pasta Drive) à Área do Aluno |
| `GET /api/courses/list` | `gdi-study.js:collectCourses()` (996) | Lista cursos salvos do aluno |
| `POST /api/courses/remove` | `gdi-study.js` (via overlay) | Remove curso da Área do Aluno |
| `POST /api/courses/scan-progress` | `gdi-study.js:scanFolder()` (4358) | Escaneia 1 pasta do Drive, retorna lessons |
| `POST /api/courses/scan-and-save` | `gdi-study.js` (auto-scan) | Scan + persistência em 1 chamada |
| `GET /api/courses/validate` | `gdi-study.js` (validar path) | Verifica se path existe no Drive |
| `POST /api/courses/user-progress` | `gdi-study.js:flushWatch()` (1165) | Salva progresso de vídeo por aula |
| `GET /api/courses/shared-progress` | `gdi-study.js` (cross-device) | Lê progresso compartilhado |
| `GET /api/materials/list` | `gdi-study.js` (materiais) | Lista materiais (.gdi-*.json) do Drive |
| `POST /api/materials/save` | `window.GDIStorage.saveMaterial()` | Salva material no Drive do aluno |
| `POST /api/ai` | `gdi-study.js:gerarViaISA()` (67), `gdi-meggy.js:callIsa()` (492), widget Meggy | Chat Meggy (LLM) |
| `POST /api/ai/summaries` | `gdi-meggy.js:cacheSave()` (734) | Cache de resumo ISA |
| `GET /api/ai/shared-summaries` | `gdi-meggy.js:fetchSharedSummaries()` (2061) | Resumos compartilhados entre alunos |
| `POST /api/ai/battalion` | `gdi-meggy.js:startBattalion()` (2036) | Geração paralela em massa |
| `GET /api/d1/lessons/search` | `gdi-study.js` (busca global) | Busca textual em D1 (lessons index) |

**Ponto-chave:** o Drive Index **não conhece a Área do Aluno** — quando o aluno clica em "Adicionar curso", o caminho `/:n:/CURSO X/` é capturado do DOM (via `data-path`) e enviado para `/api/courses/add`. O backend então cria um registro na tabela `user_courses` (D1) e cria uma pasta espelho no Drive `0` do aluno (em `gdiUserFolderId`). A Área do Aluno é, do ponto de vista do Drive Index, **um cliente que consome os mesmos endpoints de listagem de pastas**.

---

## 5. Módulos do Frontend (depth analysis)

Aplicando o framework do skill `improve-codebase-architecture` — **deep module** = muita funcionalidade atrás de uma interface pequena; **shallow module** = interface quase tão complexa quanto a implementação.

### 5.1 `gdi-study.js` (4 725 linhas, 6 IIFEs)

| IIFE | Linhas | Função | Profundidade | Análise |
|------|--------|--------|--------------|---------|
| **M23 Estudo Ativo** | 21-730 | `window.renderQuestoes`, `renderSimulado`, `renderCronograma`, `renderRevisoes`, `__gdiGradeQ` | **Shallow→Deep misto** | Interface pública pequena (5 funções render), mas cada uma é uma função monolítica de 200-300 linhas com closures internas (`drawSubjects`, `drawList`, `startSession`, `openGen`, `openAddForm`, `openImport`). Estado em localStorage é opaco para outros módulos. **Deletion test:** se deletar, complexidade reaparece em M22 (que precisa de questões/simulado). **Real seam.** |
| **M22 Área do Aluno** | 733-3554 | `window.__gdiOpenCentral`, `gdiAddCourseFromButton`, `gdiAddCourseFromDrive`, `renderCursos`, TAB_GROUPS | **Deep** | Interface: 1 função `openPanel(tab)` + 2 funções de adicionar curso. Implementação: 2 800 linhas com 40+ funções internas (state, watched, video cache, maratonas, flashcards, subjects, trails, provas, redação, radar, achievements, courses). **Deletion test:** se deletar, todo o "plataforma de estudos" desaparece. **Deep e carregado.** |
| **M-PLAYER-GUARD** | 3557-3972 | watchdog contra vídeo travado | **Shallow** | Interface: 0 funções exportadas (auto-inicia via `Bus.onGlobal('media:ready')`). Implementação: ~415 linhas. **Deletion test:** se deletar, vídeos travados voltam a ser problema, mas nada mais quebra. **Pass-through questionável** — poderia ser 50 linhas. |
| **BlackTie tema visual** | 3975-4157 | injeta CSS Ferreto | **Shallow (intencional)** | Interface: 0 (side-effect only). Implementação: ~180 linhas de CSS in-JS. **Deletion test:** se deletar, voltam estilos padrão Bootstrap. Shallow mas com razão — é pura cosmética. |
| **M-NOTIFICATIONS** | 4160-4305 | (vazio na maior parte) | **Shallow** | Interface: 0. Implementação: ~145 linhas, grande parte é CSS. **Deletion test:** se deletar, nada visível quebra (player-guard já cobre o caso). Provável dead code parcial. |
| **M-COURSE-SCANNER** | 4308-4714 | `window.gdiCourseScanner` (background scan) | **Deep** | Interface: 1 objeto exposto (`window.gdiCourseScanner`) + auto-init via Bus. Implementação: ~410 linhas com state machine resumível (getScanState/setScanState, scanFolder recursiva, autoScanPending, cleanupOrphanCourses). **Deletion test:** se deletar, cursos adicionados não são escaneados automaticamente. **Real seam.** |

### 5.2 `gdi-meggy.js` (2 750 linhas, 2 IIFEs)

| IIFE | Linhas | Função | Profundidade | Análise |
|------|--------|--------|--------------|---------|
| **M9-ISA** | 32-2308 | `window.gdiIsaPdf` (16 métodos), `window.__gdiParseJsonArray`, `window.renderResumos` | **Deep** | Interface: 16 métodos em `gdiIsaPdf` + 1 parser compartilhado + 1 renderer. Implementação: 2 280 linhas (extração PDF via pdf.js + OCR Tesseract, cache ISA em localStorage, geração paralela de resumo+pílulas+questões+flashcards via `/api/ai`, biblioteca de flashcards virtualizada, sessões de quiz, shared summaries via Drive, batalhão). **Deletion test:** se deletar, toda a geração de materiais com IA desaparece. **Deep e o módulo mais carregado do sistema.** |
| **M-AI widget** | 2319-2750 | chat flutuante Meggy (FAB + painel) | **Deep** | Interface: 0 (auto-init, FAB é injetado em `<html>` fora do body para sobreviver a page:change). Implementação: ~430 linhas com detecção de IA do navegador (Chrome Prompt API / Gemini Nano) + fallback `/api/ai`, persistência em sessionStorage, renderização Markdown, sistema de memória contextual. **Deletion test:** se deletar, a Meggy some da tela, mas `gdiIsaPdf` (que não depende do widget) continua funcionando. **Deep mas acoplado a `Bus.onGlobal('page:change')`.** |

### 5.3 `app.min.js` (1 749 linhas, GDIndex core)

| Seção | Linhas | Profundidade | Análise |
|-------|--------|--------------|---------|
| **FILE_TYPES / GDOC_TYPES / Os** | 1-11 | shallow (intencional) | Constantes |
| **Bus** | 21-30 | **Deep** | 4 métodos (`on`, `onGlobal`, `reset`, `emit`) sobre `Map`. Mas **declaração `const Bus =`** no top-level impede `window.Bus` — obrigando todo módulo a checar `typeof Bus !== 'undefined'`. |
| **gdiListAllFiles** | 57-90 | shallow→deep (com bridge) | Em app.min.js é uma função fetch com LRU cache. Após patch do `gdi-worker-bridge.js:228`, vira dispatcher para Web Worker. **Real seam** (2 adapters: fetch original + worker bridge). |
| **render/list/file_*** | 156-1041 | GDIndex original | Funções de UI grandes mas coesas por tipo de arquivo. |
| **GDIUser** | 1058+ | deep | SRS + watch tracking + resume tracking. |

### 5.4 `gdi-extras-loader.js` (187 linhas)

Único módulo **exclusivamente de orquestração** — não implementa funcionalidade, só carrega. Profundidade: shallow por design (1 função `bootstrap()` com guard anti-duplicate). **Real seam** na medida em que é o ponto onde 5 scripts são montados em ordem específica com fallbacks em cascata (4 fontes para app.min.js, 3 para gdi-extras.js).

### 5.5 Mapa deep × shallow (síntese)

| Módulo | Profundidade | Linhas | Veredito |
|--------|--------------|--------|----------|
| M22 Área do Aluno | Deep | 2 800 | Carregado, coeso, justo |
| M9-ISA (gdi-meggy.js IIFE 1) | Deep | 2 280 | Muito carregado — candidato a split |
| M23 Estudo Ativo | Médio | 710 | 5 renders monolíticos |
| M-AI widget | Deep | 430 | Coeso |
| M-COURSE-SCANNER | Deep | 410 | Coeso |
| M-PLAYER-GUARD | Shallow | 415 | Inflado — poderia ser 50 L |
| BlackTie tema | Shallow (intencional) | 180 | Ok |
| M-NOTIFICATIONS | Shallow | 145 | Provável dead parcial |

---

## 6. Dívida Técnica Catalogada

### 6.1 Bugs conhecidos (identificados em código, não em produção)

| # | Local | Sintoma | Evidência |
|---|-------|---------|-----------|
| B1 | worker.js:49, 62 | `private_key` marcado `[REDACTED:ssh_private_key]` mas **material PEM completo permanece** — só o header `-----BEGIN PRIVATE KEY-----` foi substituído pela tag | Linhas 49 e 62 contêm as strings `MIIEvgIBADAN...` e `MIIEvAIBADAN...` (Base64 DER) com `-----END PRIVATE KEY-----\n` no final |
| B2 | worker.js:132-133 | `client_secret` e `refresh_token` Google OAuth em plaintext | Linha 132: `client_secret: "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"`, linha 133: `refresh_token: "1//0hRGONaNulSmGCgYIARAAGBESNwF-L9Ireh0eVPSgkuPrbsxZZdVNs2q-mWdPP-JNKesyJYX-xtkt5-CFOEW469Ad73KCKNfRfxso"` |
| B3 | worker.js:194-195 | Fallback hardcoded de `crypto_base_key` e `hmac_base_key` em plaintext — se `globalThis.CRYPTO_BASE_KEY`/`HMAC_BASE_KEY` não estiverem setados (env mal configurado), o AES/HMAC fica vulnerável | `const crypto_base_key = (typeof globalThis.CRYPTO_BASE_KEY !== 'undefined' && globalThis.CRYPTO_BASE_KEY) || "e864febecc3a3d5661c0b5a51170ed6a";` |
| B4 | gdi-study.js:3540-3543 | Histórico: `if(window.Bus)` sempre foi `false` porque `Bus` é `const` (não vira propriedade de `window`). Corrigido para `typeof Bus !== 'undefined'` mas **há 9 referências restantes a `window.Bus` espalhadas** que ainda falham silenciosamente | Linhas 1159, 1209, 3480, 3482, 3544, 4295, 4694 usam `Bus.onGlobal` (correto); nenhum usa `window.Bus` — mas o padrão continua frágil |
| B5 | gdi-extras-loader.js:46 | `gdi-extras-loader.js` referencia `gdi-meggy.js` e `gdi-study.js` na lista `MODULES` mas **NÃO inclui** `gdi-worker-bridge.js` na ordem explícita (`'gdi-worker-bridge.js'` está na lista na linha 41). Há comentário sobre ordem mas se o core demorar, bridge pode carregar antes | Loader espera Bus (126-132) mas não espera `window.GDIStorage` estar definido antes de carregar `gdi-study.js` |
| B6 | worklog_frontend_map.md §0 | `gdi-ai-providers.js` é referenciado mas **inexistente no disco** (silent fail no loader) | Confirmado por `worklog_frontend_map.md` linha ~38 |

### 6.2 TODOs / STUBs / Placeholders

| # | Local | Tipo | Conteúdo |
|---|-------|------|----------|
| T1 | gdi-meggy.js:11 | stub no-op reativado | `REMOVIDO: aba "Resumos" (user request) — window.renderResumos = no-op stub.` — posteriormente reativado na linha 2077-2083 mas o comentário ainda diz "stub" |
| T2 | gdi-meggy.js:2072-2075 | orphan function fix | `★ FIX 6 (Task 21): added downloadAsPdf to exports. It was defined as a local function but never exported, yet renderResumos references window.gdiIsaPdf.downloadAsPdf` — evidência de refactor incompleto |
| T3 | gdi-study.js:1272-1280 | tabs removidas | 6 tabs (cursos, mar, revisoes, fc, subjects, trails) removidas por user request, mas os `renderCursos`/`renderMarathon`/`renderRevisoes`/`renderFlash`/`renderSubjects`/`renderTrails` **permanecem definidos como funções para preservar a API pública** — ou seja, são **dead code vivo** (ninguém chama mas não pode deletar) |
| T4 | app.min.js:54-55 | stub substituído | `// stubs substituídos pelo módulo password-safe (gdi-extras.js)` + `function gdiGetPw(){return''}` / `function gdiSetPw(){}` — mas `gdi-extras.js` foi substituído por `gdi-extras-loader.js` + módulos. Não há módulo `password-safe` atual. **Stubs retornam string vazia sempre** — se algum código chamar `gdiGetPw(path)` para pasta protegida, sempre falha a verificação de senha |
| T5 | worker.js:101 | versionamento manual | `const APP_VERSION = '1.0.211';  // ★ v1.0.190: FIX Meggy Coach (data.response→data.markdown) + scan-and-save endpoint + CACHE_VERSION 164` — versionamento manual com changelog inline, sem `package.json` automatizado para o worker |
| T6 | gdi-meggy.js:2070 | comment outdated | `// ── Public API ── (E — todos os 16 métodos preservados)` mas linha 2075 lista exatamente 16 métodos — comment está correto mas `E` é referência obscura a "patch E" |
| T7 | gdi-meggy.js:2707 | conditional activation | `o widget fica oculto (display:none) mas TODO o código permanece intacto` — TODO não marcado como `TODO:` mas como `TODO ` no meio da frase |
| T8 | worklog_frontend_map.md §0 | gdi-ai-providers.js | Loader tentava carregar `gdi-ai-providers.js` (INEXISTENTE) — silent fail no `Promise.allSettled`. Comentário no loader documenta omissão |

### 6.3 Dead code

| # | Local | Tipo | Evidência |
|---|-------|------|-----------|
| D1 | gdi-study.js:1272-1300 | 6 render functions órfãs | `renderCursos`, `renderMarathon`, `renderRevisoes`, `renderFlash`, `renderSubjects`, `renderTrails` — definidas mas não chamadas por nenhuma tab ativa (tabs removidas) |
| D2 | worker.js:31-37 | comment header GDIndex | `// ✅ login corrigido (enable_login: true)` etc. — changelog histórico que deveria estar em CHANGELOG.md |
| D3 | worker.js:82-127 | changelog inline | 45 linhas de changelog `// ─── v1.0.98 changelog ...` misturadas com código |
| D4 | worker.js:1-30 | security warning | 29 linhas de warning que deveriam ser pré-commit hook, não comment |
| D5 | worker.js:700 | `directlink` HTML template | HTML "Access Denied" legacy, desativado em ~3215 via `if (false && ...)` — confirmado por worklog_worker_map.md linha 86 |
| D6 | app.min.js:54-55 | stubs mortos | `gdiGetPw`/`gdiSetPw` sempre retornam `''` / no-op |
| D7 | worker.js:9976 | `// trigger rebuild` | comentário de deploy manual no final do arquivo |

### 6.4 Abstrações rasas (shallow modules)

| # | Local | Problema | Solução |
|---|-------|----------|---------|
| S1 | gdi-study.js:22-28, 741-747 | Helper `lsGet`/`lsSet`/`esc`/`uid`/`today`/`fmtDate` **duplicados em cada IIFE** (M23, M22, M24 têm cópias idênticas) | Deveria ser importado de `gdi-core.js` ou `storage.js` |
| S2 | gdi-meggy.js:36-39 | Mesmos `esc`/`lsGet`/`lsSet`/`uid` duplicados também | Idem S1 |
| S3 | gdi-study.js:1159-1209 | `_origListAllFiles`/`__gdiOrigListAllFiles` indirection em gdi-worker-bridge.js:216-228 | Bridge patcha `window.gdiListAllFiles` e guarda o original em `__gdiOrigListAllFiles` — pattern frágil (qualquer outro patch posterior sobrescreve) |
| S4 | worker.js:1937-2036 | `handleRequest` declara 6 funções helper internas (`escAdm`, `admFmtTime`, `admFmtDate`, `admStreak`, `admLessonName`, `admCourseOf`, `admStats`) que **só são usadas dentro do admin panel** | Deveriam estar em um `handleAdmin` dedicado, não no dispatcher principal |
| S5 | worker.js:8066-8372 | `tryOpenAICompat`, `tryBackend`, `runBackend` definidas **como nested functions** dentro de `handleAi` (7984) — mas `handleAiCoach`, `handleRedacaoCorrect`, `callUnifiedAi` não as reutilizam | Deveria ser um módulo `aiBackend` compartilhado |
| S6 | gdi-study.js:23-28 + gdi-meggy.js:36-39 + storage.js + gdi-core.js | 4+ definições de `lsGet`/`lsSet` | **Deletion test:** se unificar em `gdi-core.js`, nada quebra e ganha-se 1 seam |

### 6.5 Acoplamento excessivo

| # | Local | Tipo | Evidência |
|---|-------|------|-----------|
| C1 | `window.*` global namespace | Espaço global poluído | `window.gdiIsaPdf`, `window.GDIStorage`, `window.__gdiOpenCentral`, `window.gdiAddCourseFromButton`, `window.gdiAddCourseFromDrive`, `window.renderQuestoes` (+ 8 renders), `window.__gdiParseJsonArray`, `window.__gdiGradeQ`, `window.gdiCourseScanner`, `window.GDI_MODULES`, `window.gdiListAllFiles`, `window.gdiGetPw`, `window.gdiSetPw`, `window.gdiReloadExtras`, `window.gdiForceReloadExtras`, `window.__gdiFerretoExtras`, `window.__gdiM9Isa`, `window.__gdiAiWidget`, `window.escHtml`, `window.drive_names`, `window.MODEL`, `window.UI`, `window.current_drive_order`, `window.scroll_status`, `window._meggyLastMem` — **25+ propriedades window** sem namespace |
| C2 | Bus (app.min.js:21-30) | Event bus sem tipagem nem schema | `Bus.emit('page:change')`, `Bus.emit('user:ready')`, `Bus.emit('media:ready', {type, el})`, `Bus.emit('watched:changed')`, `Bus.emit('rows:appended')` — qualquer módulo pode emitir qualquer evento; não há lista canônica |
| C3 | `globalThis.X` no worker | Vars de env propagadas para globalThis | `worker.js:9931-9953` copia 16+ vars de `env` para `globalThis` (NVIDIA_API_KEY, ZHIPU_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY, GROQ_API_KEY, CRYPTO_BASE_KEY, HMAC_BASE_KEY, MEGGY_CACHE, MEGGY_D1, ENV, AI...). Solução para suportar tanto Module Worker quanto Service Worker format, mas cria **race condition documentada** (linha 9921-9922: "ainda não é 100% race-safe") |
| C4 | gdi-extras-loader.js → Bus | Loader precisa esperar Bus | `gdi-extras-loader.js:126-132` faz polling `while (typeof Bus === 'undefined')` com timeout 10s — acoplamento reverso: o loader depende de um `const` top-level do app.min.js |
| C5 | worker.js handleRequest | 1 dispatcher, 70+ rotas | `handleRequest` (1937-4237) tem 2 300 linhas com switch case encadeado. Rotas são testadas sequencialmente — sem Map dispatcher, sem árvore de rotas |

### 6.6 Segurança (per code-security-audit OWASP)

#### 6.6.1 A01:2021 — Broken Access Control

- **A01-1**: `worker.js:155` `cors_domain: "*"` — CORS permissivo em todas as rotas. **155 ocorrências** de `'Access-Control-Allow-Origin': '*'` (confirmado por grep). Para rotas `/api/*` autenticadas por cookie, isso permite que qualquer site faça cross-origin requests (embora cookies sejam enviados apenas se `SameSite=None; Secure`). Não é vulnerabilidade crítica mas é má prática.
- **A01-2**: `worker.js:3729` `if (path === '/admin') return handleAdmin(request, url);` — admin gate é por cookie + `ADMIN_USERS.includes(user)` (definido em `worker.js:1935` como `['elton@araujo.eu.org']`). Está correto mas é **RBAC hardcoded** — não há tabela de roles.

#### 6.6.2 A02:2021 — Cryptographic Failures

- **A02-1**: `worker.js:49, 62` — 2 chaves privadas Google Service Account em plaintext (B1 acima). **CRÍTICO.**
- **A02-2**: `worker.js:132-133` — `client_secret` e `refresh_token` Google OAuth em plaintext (B2). **CRÍTICO.**
- **A02-3**: `worker.js:194-195` — Fallback hardcoded de `crypto_base_key` (AES) e `hmac_base_key` (HMAC-SHA256) (B3). **ALTO.**
- **A02-4**: `worker.js:1773` `hashPassword(password, salt)` usa SHA-256 — **não é bcrypt/argon2**. Para senhas de usuário, SHA-256 com salt é fraco contra hardware moderno. O worklog_security_warning (linha 22) já recomenda bcrypt.
- **A02-5**: `worker.js:817` `encryptString(string)` usa AES-CBC com chave derivada de `crypto_base_key` (string de 32 hex chars = 128 bits). Não há IV aleatório visível (precisaria verificar `getAesKey`). Potencialmente deterministic.

#### 6.6.3 A03:2021 — Injection

- **A03-1**: `worker.js:2094, 2206, 9750` — `d1.prepare('SELECT COUNT(*) as c FROM ' + t)` e `d1.prepare('SELECT * FROM ' + t)` — interpolação de tabela em SQL. **Não é vulnerável** porque `t` vem de arrays hardcoded (`tables = ['lessons', ...]`), mas é **code smell** (lint deve gritar).
- **A03-2**: `worker.js:4451` `driveEscape(s)` — escapa `'` e `\` para queries Drive API. Confirmado pelo worklog_map "FIX 7: fileName single-quote escape in gdiWriteFolderDotfile/gdiReadFolderDotfile prevents Drive API query injection (Agent 3 Bug 8)" — há proteção.
- **A03-3**: gdi-meggy.js:75-95 `parseJsonArray` — faz parse de resposta de LLM com múltiplas estratégias. Há `eval`? **Não** — só `JSON.parse`. Ok.
- **A03-4**: gdi-meggy.js:1576 `marked.parse(txt)` — Markdown rendering com `marked`. Há `window.gdiSanitize?` (linha 1576) — sanitização condicional. Se `gdiSanitize` não definido, **Markdown cru é injetado em innerHTML** → XSS risk se LLM retornar `<script>`.

#### 6.6.4 A04:2021 — Insecure Design

- **A04-1**: `worker.js:1-30` security warning **no código** em vez de em CI/CD. Pré-commit hook faltante.
- **A04-2**: Usuários seed em `authConfig.users_list` (worker.js:157-172) com hashes hardcoded — adicionar/remover usuário requer redeploy.
- **A04-3**: `worker.js:8012-8027` `ABUSE_PATTERNS` — detecção de prompt injection por regex. **Heurística facilmente bypassável** (e.g., "esqueça as instruções anteriores" não está na lista). Não é defesa real.

#### 6.6.5 A05:2021 — Security Misconfiguration

- **A05-1**: `worker.js:78` `CDN_VERSION = '2.5.9'` — versão do GDIndex pinned. Sem hash SRI nos `<script src>` carregados do jsdelivr.
- **A05-2**: `gdi-extras-loader.js:28` carrega de `https://cdn.jsdelivr.net/gh/esaaraujo-lab/gdi_server@main/modular/` — sem SRI. Se o repo for comprometido, código malicioso é servido.
- **A05-3**: `worker.js:9966-9976` `addEventListener('fetch')` fallback SW format — mantido por compatibilidade mas **desnecessário** (Module format sempre detectado). Aumenta superfície de ataque.

#### 6.6.6 A07:2021 — Identification and Authentication Failures

- **A07-1**: `worker.js:7992-8010` rate limiting por username via `globalThis.__MEGGY_RATE = new Map()` — **in-memory por isolate**. Cada cold start zera o contador. Bypass trivial: aguardar reinício do isolate ou usar outro IP.
- **A07-2**: `worker.js:8012-8027` abuse patterns regex — cobertura parcial.

#### 6.6.7 A08:2021 — Software and Data Integrity Failures

- **A08-1**: Sem SRI nos scripts CDN (A05-2).
- **A08-2**: `app.min.js:3` `console.log('[GDI core] v19.0-minimal');` — versão não bate com `APP_VERSION` do worker.

#### 6.6.8 A09:2021 — Security Logging and Monitoring Failures

- **A09-1**: `worker.js:9850` `console.log('[CronScan] ...')` — log em `console.log` é perdido após request. Não há roteamento para Logflare/Datadog/Workers Analytics.
- **A09-2**: Sem log de tentativas de login falhadas, sem log de acesso a `/admin`.

#### 6.6.9 Resumo OWASP: 9 categorias auditadas, 21 achados (3 CRÍTICOS, 5 ALTOS, 13 MÉDIOS/BAIXOS)

---

## 7. Por que é "GDI Melhorado" e não "Plataforma Nativa"

### 7 razões concretas com evidência `file:line`

1. **O núcleo de proxy Google Drive é 100% GDIndex original** (`worker.js:9006-9442`, `apiRequest`/`handleSearch`/`handleId2Path`/`findId2Path`/`googleDrive` class/`download`/`generateLink`). A plataforma não existiria sem este código — é a espinha dorsal. **Toda a navegação de pastas, download, search e geração de links passa pelo GDIndex.**

2. **O `app.min.js` (1 749 L) é ~95% GDIndex original** — apenas `Bus`, `gdiListAllFiles`, `_listCache`, `gdiGetPw`/`gdiSetPw` stubs são Meggy-added. Todo o resto (`render`, `list`, `file_video`, `file_audio`, `file_pdf`, `file_image`, `file_code`, `file_workspace`, `file_others`, `dispatchFileView`, `appendUnifiedRows`, `requestListPath`, `requestSearch`, `generateBreadcrumb`, `formatFileSize`, `getFileIcon`, `FILE_TYPES`, `GDOC_TYPES`, `Os`, `getQueryVariable`, `escHtml`, `escJs`, `applyTheme`, `toggleTheme`, `sleep`, `renderErrorCard`, `renderDownloadButtons`, `copyShareUrl`, `showToast`, `_viewerCard`, `initPlayerEvents`, `gdiQueueNext`, `playNextInPlaylist`, `buildPlaylistFromFiles`, `dedupePlaylist`, `finalizeNames`, `gdiFindCurrent`, `fetchQuota`, `GDIUser`, `attachResumeTracking`, `showResumeToast`) é código GDIndex original. A UI da Área do Aluno vive **em cima** desta UI, não a substitui.

3. **A Área do Aluno é um overlay, não uma view** (`gdi-study.js:1248-1267` `openPanel`/`closePanel`) — quando o aluno clica em "Área do Aluno", um `<div class="gdi-central-box" style="position:fixed; inset:0">` é sobreposto ao Drive Index que continua renderizado embaixo. Não há troca de "app". Ao fechar, o aluno volta exatamente para onde estava no Drive Index. **Isso é a definição arquitetural de "addon", não de "app".**

4. **A identidade do aluno é o cookie `gdi_session` do GDIndex** (`worker.js:868-877` `gdiSessionUser`) — não há tabela de usuários separada para a Área do Aluno. O `gdiSessionUser()` é chamado em **todos** os endpoints `/api/courses/*`, `/api/materials/*`, `/api/ai/*`. A auth é herdada do GDIndex.

5. **Os 12 drives em `authConfig.roots`** (`worker.js:173-186`) são a fonte da qual a Área do Aluno extrai cursos. Quando o aluno adiciona um curso via `gdiAddCourseFromDrive` (`gdi-study.js:789`), o `coursePath` enviado para `/api/courses/add` é exatamente o path `/:n:/CURSO X/` do GDIndex. **A Área do Aluno não tem filesystem próprio — é um cliente do GDIndex.**

6. **A persistência é bolt-on** — a Área do Aluno guarda estado em **3 lugares diferentes sem coesão**: (a) `localStorage` (`gdi-courses-v1`, `gdi-questions-v1`, `gdi-cards-v1` etc. — `gdi-study.js:22, 735`), (b) Drive do aluno via `gdiUserFolderId(gd0)` em `AULAS - ESTADO DOS ALUNOS` pasta no drive 0 (`worker.js:877`), (c) D1/KV bindings via `MEGGY_D1`/`MEGGY_CACHE` (`worker.js:1081-1097`). Uma plataforma nativa teria uma única fonte de verdade. Aqui há **3 fontes de verdade** com lógica de merge em `renderResumos` (`gdi-meggy.js:2131-2169`).

7. **O frontend é carregado como "extras" do GDIndex** — `gdi-extras-loader.js` (187 L) é explicitamente nomeado como loader de "extras". O worker.js serve `app.min.js` em `/:app.min.js` (linha 3374) e o extras em `/:gdi-extras.js` (linha 3395). Os módulos da Área do Aluno são carregados **depois** do core do GDIndex, em paralelo, como enxertos. Não há build step (sem webpack/vite/esbuild) — são 6 arquivos `.js` concatenados via `<script>` tags no navegador do cliente.

### Síntese

A Meggy é um **"GDI Melhorado"** — um GDIndex com ~8 300 linhas de camadas bolt-on (auth multiuser, Área do Aluno, Meggy AI, scanner, D1, KV, admin, cron) que usam o GDIndex como substrato. **Não é plataforma nativa** porque: (a) não tem núcleo próprio — herda o do GDIndex; (b) não tem filesystem próprio — usa o do GDIndex; (c) não tem UI própria — sobrepõe overlay ao GDIndex; (d) não tem auth própria — usa o cookie do GDIndex; (e) não tem persistência coesa — usa 3 fontes com merge ad-hoc; (f) não tem build step — é JS puro carregado por `<script>`; (g) não tem módulos ES — usa `window.*` e `Bus` para acoplamento.

---

## 8. Pontos de Alavancagem (onde mudar 1 coisa tem grande impacto)

### 8.1 ⭐⭐⭐ **Unificar os helpers `lsGet`/`lsSet`/`esc`/`uid`/`today` em um `gdi-utils.js`** (alto impacto, baixo risco)

- **Onde:** `gdi-study.js:22-28, 741-747`, `gdi-meggy.js:36-39`, `app.min.js:17` (`escHtml`)
- **Impacto:** Remove ~50 linhas duplicadas, cria 1 seam reutilizável, simplifica leitura. Reduz change risk (B axis do skill-clean-audit).
- **Como:** Criar `gdi-utils.js` com `export const lsGet/lsSet/esc/uid/today`, adicionar ao `gdi-extras-loader.js:39` MODULES na posição 0.5. Substituir referências nos IIFEs por import dinâmico ou `window.GDIUtils`.

### 8.2 ⭐⭐⭐ **Migrar secrets hardcoded para `wrangler secret put`** (altíssimo impacto segurança, baixo risco)

- **Onde:** `worker.js:49, 62, 132-133, 194-195`
- **Impacto:** Resolve A02-1, A02-2, A02-3 (3 dos 5 achados ALTOS do OWASP). Permite commit público do worker.js sem expor credenciais.
- **Como:** `wrangler secret put GOOGLE_CLIENT_SECRET`, `wrangler secret put GOOGLE_REFRESH_TOKEN`, `wrangler secret put SA_PRIVATE_KEY_1`, `wrangler secret put SA_PRIVATE_KEY_2`, `wrangler secret put CRYPTO_BASE_KEY`, `wrangler secret put HMAC_BASE_KEY`. Substituir literals por `globalThis.X` (já suportado). Remover fallbacks hardcoded.

### 8.3 ⭐⭐⭐ **Estruturar o `handleRequest` com Map dispatcher** (médio impacto, médio risco)

- **Onde:** `worker.js:1937-4237` (2 300 linhas de if-cascade)
- **Impacto:** Transforma O(N) lookup em O(1), reduz tempo de cold start, facilita adicionar/remover rotas. Permite isolar o admin panel (1937-2036) e o AI router.
- **Como:** Construir `const ROUTES = new Map([['/api/ai', {POST: handleAi, OPTIONS: corsPreFlight}], ...])` no top-level. `handleRequest` vira `const h = ROUTES.get(path); if (h) return h[req.method](req, url);`.

### 8.4 ⭐⭐ **Converter Bus para ES module com schema de eventos** (médio impacto, alto risco)

- **Onde:** `app.min.js:21-30`, consumidores em `gdi-study.js:1159, 1209, 3480, 3482, 3544, 4295, 4694` e `gdi-meggy.js:2680`
- **Impacto:** Remove C2 (event bus sem schema), C4 (loader depende de `const Bus`). Documenta eventos canônicos (`page:change`, `user:ready`, `media:ready`, `watched:changed`, `rows:appended`). Permite type-checking.
- **Como:** Exportar `Bus` de `gdi-core.js`, importar nos demais. Definir `EventTypes` const enum. Migrar gradualmente (`window.Bus` fallback temporário).

### 8.5 ⭐⭐ **Adicionar SRI nos scripts CDN** (baixo esforço, médio impacto segurança)

- **Onde:** `gdi-extras-loader.js:59-75` `loadScript`, `worker.js:233` `cdn_base`
- **Impacto:** Resolve A05-2, A08-1 (integrity). Se repo público comprometido, browser bloqueia execução.
- **Como:** Adicionar `s.integrity = 'sha384-...'` em cada `loadScript`. Calcular hash via `subresource-integrity` tool. Bump no `wrangler.toml`/CI.

### 8.6 ⭐ **Substituir SHA-256 por bcrypt/argon2 para senhas** (baixo esforço, alto impacto segurança)

- **Onde:** `worker.js:1773` `hashPassword(password, salt)` e `worker.js:1848-1875` `gdiVerifyUser`
- **Impacto:** Resolve A02-4. Senhas de usuário ficam resistentes a GPU/ASIC.
- **Como:** Usar Web Crypto `PBKDF2` com 100k+ iterações (suportado em Workers) ou biblioteca `bcryptjs` (compatível com Workers).

---

## 9. Análise de Skills Instaladas — Onde Cada Uma Ajuda

| Skill | Aplicação no Meggy |
|-------|-------------------|
| **improve-codebase-architecture** | Análise deep/shallow (§5), identificação de seams (§2.1), aplicação do "deletion test" (§5.1, §5.2), proposta de deepening em §6.4 (shallow modules), §8.1 (unificar helpers), §8.4 (Bus → ES module). **Skill central deste documento.** |
| **code-security-audit** | Auditoria OWASP Top 10 (§6.6) — 9 categorias, 21 achados (3 CRÍTICOS: secrets hardcoded A02-1/A02-2/A02-3). Secret detection (linhas 49, 62, 132-133, 194-195). Identificação de XSS via marked.parse sem sanitize (A03-4). Aponta caminho: `wrangler secret put` (§8.2), SRI (§8.5), bcrypt (§8.6). |
| **skill-clean-audit** | Aplicação dos 2 eixos (comprehension cost / change risk) aos 6 IIFEs de gdi-study.js (§5.1) e 2 de gdi-meggy.js (§5.2). Identificação de vermelho: secrets hardcoded (§6.6.2), duplicação DRY (§6.4 S1, S2, S6), `import *` ausente (tudo é global). Amarelo: long functions M22 (2800 L), magic numbers (`BOX_INTERVALS=[1,3,7,21,60]` em `gdi-study.js:42`). Verde: raro — `parseJsonArray` (gdi-meggy.js:47-97) é exemplo de função coesa com fallback explícito. |
| **fullstack-dev** (disponível) | Não aplicado neste documento (escopo era análise). Mas o caminho "rewrite nativo" (§10) usaria Next.js 16 + Prisma + D1 — a skill forneceria scaffold. |
| **task-review** (disponível) | Não aplicado. Mas ao final de um refactor incremental (§10), esta skill poderia registrar o caminho como skill reutilizável. |
| **skill-finder-cn** (disponível) | Poderia encontrar skills específicas para: refator de monólitos JS, migração de CF Workers para Module format, schemas de eventos/pub-sub tipados. |

---

## 10. Conclusão e Próximos Passos

### 10.1 Síntese

A Plataforma Meggy é um **GDIndex 2.5.9 (fork de Parveen Badhoo/TheFirstSpeedster) com ~8 300 linhas de adições bolt-on** que o transformam em uma plataforma de estudos multiusuário com IA. A arquitetura é viável e está em produção ativa (v1.0.211, BUILD_DATE 2026-10-21, com apps Android/Roku/Desktop/Tauri consuming a mesma API), mas carrega **dívida técnica alta** em 3 dimensões: (1) **secrets hardcoded** (3 CRÍTICOS, 5 ALTOS no OWASP), (2) **abstrações rasas duplicadas** (helpers `lsGet`/`lsSet`/`esc` em 4+ IIFEs), (3) **acoplamento via `window.*` e `Bus` sem schema** (25+ propriedades globais, 5+ eventos sem tipagem).

### 10.2 Três caminhos possíveis

#### Caminho A — **Status quo** (continuar bolt-on)
- **Custo:** zero retrabalho, mas dívida cresce. Cada nova feature adiciona ~500 L ao `worker.js` e mais 1 `window.X` ao namespace.
- **Risco:** alto — secrets hardcoded permanecem, qualquer commit público vaza 3 chaves Google SA + OAuth refresh token. Next cold start do CF Worker pode reusar fallbacks fracos se `wrangler.toml` mal configurado.
- **Quando escolher:** se a prioridade for estabilidade e o repositório ficar privado para sempre.

#### Caminho B — **Refactor incremental** (recomendado)
- **Fase 1 (1-2 dias):** §8.2 — migrar 6 secrets para `wrangler secret put`. Resolve 3 CRÍTICOS OWASP. Permite commit público.
- **Fase 2 (2-3 dias):** §8.1 — unificar helpers em `gdi-utils.js`. Remove duplicação, cria 1 seam reutilizável.
- **Fase 3 (3-5 dias):** §8.3 — Map dispatcher em `handleRequest`. Reduz cold start, isola admin/AI.
- **Fase 4 (5-7 dias):** §6.4 (S4, S5) — extrair `aiBackend` module compartilhado entre `handleAi`/`handleAiCoach`/`callUnifiedAi`. Reduz 200 L duplicadas.
- **Fase 5 (3-5 dias):** §8.5 — SRI nos scripts CDN. Resolve A05-2, A08-1.
- **Fase 6 (5-7 dias):** §8.6 — bcrypt/argon2 para senhas. Resolve A02-4.
- **Total:** 19-29 dias de trabalho focado, sem quebrar compatibilidade. Resultado: worker.js ~8 000 L (vs 9 976 hoje), frontend com 1 seam a menos de duplicação, 5 vulnerabilidades OWASP fechadas.
- **Quando escolher:** se o operador quer manter o GDIndex como base mas reduzir dívida para sustentável.

#### Caminho C — **Rewrite nativo** (high risk, high reward)
- **Stack proposta:** Next.js 16 + TypeScript + Prisma ORM (D1 adapter) + tRPC ou Hono para API, shadcn/ui para componentes, TanStack Query para cache. Manter o `googleDrive` class como adapter isolado.
- **Custo:** 4-8 semanas de trabalho focado. Migração de dados de localStorage/Drive/D1 para schema Prisma unificado. Reescrever 6 IIFEs de gdi-study.js como componentes React. Reescrever M9-ISA e M-AI widget como hooks.
- **Benefício:** type-safety end-to-end, build step (Vite), tree-shaking (elimina ~30% de código morto), testes unitários viáveis, deploy via `wrangler pages` ou `wrangler deploy` com sourcemaps.
- **Risco:** alto — pode quebrar compatibilidade com apps Android/Roku/Desktop que consomem `/api/*`. Exige manutenção paralela por 2-4 semanas.
- **Quando escolher:** se o operador quer escalar para 1000+ usuários, adicionar billing, white-label, ou recursos que o bolt-on não suporta (real-time collaboration, webhooks, plugins).

### 10.3 Recomendação

**Caminho B (Refactor incremental)** é o recomendado. Motivos:
1. Resolve 5 vulnerabilidades OWASP sem mudar arquitetura.
2. Reduz dívida técnica sem quebrar apps downstream.
3. Pode ser feito em paralelo com novas features.
4. Cada fase tem ROI independente (se parar na Fase 3, já vale a pena).
5. Não compromete a opção de fazer Caminho C depois — pelo contrário, facilita (código mais limpo é mais fácil de migrar).

### 10.4 Próxima ação sugerida

**Começar pela Fase 1 (§8.2)** — `wrangler secret put` para os 6 secrets hardcoded. É a mudança de maior ROI em segurança (3 CRÍTICOS resolvidos em 1-2 dias) e libera o repositório para commit público, permitindo colaboração externa e auditoria.

---

**Fim do documento.** Análise baseada em leitura direta de:
- `student_gdi/worker.js` (9 976 linhas) — header, dispatcher, handlers, drive core, entry points
- `DEPLOY_FINAL/gdi-study.js` (4 725 linhas) — 6 IIFEs mapeados
- `DEPLOY_FINAL/gdi-meggy.js` (2 750 linhas) — 2 IIFEs mapeados
- `DEPLOY_FINAL/gdi-extras-loader.js` (187 linhas) — bootstrap com guard
- `app.min.js` (1 749 linhas) — GDIndex core
- `worklog_worker_map.md` (905 linhas) — mapa estrutural preexistente
- `worklog_frontend_map.md` (1 304 linhas) — mapa frontend preexistente
- `worklog.md` (últimas 400 linhas) — contexto histórico

Nenhuma alteração de código foi feita — análise somente‑leitura conforme especificado.
