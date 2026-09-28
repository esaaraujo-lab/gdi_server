# MANUAL TÉCNICO — GDI Index (Educa/Meggy)

**Versão atual:** 1.0.60 · **CACHE_VERSION:** 55 · **Build:** 2026-09-23 03:20

Manual técnico de referência para desenvolvedores. Documenta toda a arquitetura, endpoints, funções, módulos e fluxos do GDI Index — plataforma de estudos construída sobre o Google Drive Index (GDI-JS 2.5.9).

---

## 📑 Índice

1. [Visão Geral da Arquitetura](#1-visão-geral-da-arquitetura)
2. [Estrutura de Arquivos](#2-estrutura-de-arquivos)
3. [Backend — Cloudflare Worker (worker.js)](#3-backend--cloudflare-worker-workerjs)
4. [Frontend — app.min.js (Core)](#4-frontend--appminjs-core)
5. [Módulos Modulares](#5-módulos-modulares)
6. [Sistema de Scanner Incremental](#6-sistema-de-scanner-incremental)
7. [Meggy AI](#7-meggy-ai)
8. [Área do Aluno](#8-área-do-aluno)
9. [Camada de Storage](#9-camada-de-storage)
10. [Sistema de Eventos (Bus)](#10-sistema-de-eventos-bus)
11. [Configuração e Secrets](#11-configuração-e-secrets)
12. [Pipeline de Deploy](#12-pipeline-de-deploy)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Visão Geral da Arquitetura

O GDI Index é uma plataforma de estudos que transforma Google Drives compartilhados em uma experiência de aprendizado completa, com:

- **Backend**: Cloudflare Worker (Service Worker format) que faz proxy do Google Drive API
- **Frontend**: SPA (Single Page Application) com jQuery + Bootstrap 5.3.3
- **IA**: Meggy — poodle tutora integrada (LLM via NVIDIA NIM / Zhipu GLM / CF Workers AI / OpenAI)
- **Módulos**: 10 arquivos JS modulares carregados via jsdelivr CDN do repo público GitHub
- **Storage**: Google Drive (pastas `.meggy.ai/` compartilhadas) + localStorage do browser + Cloudflare KV

### Arquitetura de 2 Repos

```
┌─────────────────────────────────────────────────────┐
│  Repo PRIVADO (esaaraujo-lab/student_gdi)           │
│  ├── worker.js (Cloudflare Worker — com secrets)    │
│  └── DEPLOY.md                                      │
│      ↓ wrangler deploy                              │
│      ↓ Cloudflare auto-deploy                       │
└─────────────────────────────────────────────────────┘
              ↓ serve HTML + proxy Drive API
┌─────────────────────────────────────────────────────┐
│  Repo PÚBLICO (esaaraujo-lab/gdi_server)            │
│  ├── core/app.min.js                                │
│  ├── modular/gdi-core.js                            │
│  ├── modular/gdi-pdf.js                             │
│  ├── modular/gdi-ui.js                              │
│  ├── modular/gdi-meggy.js                           │
│  ├── modular/gdi-study.js                           │
│  ├── modular/gdi-worker-bridge.js                   │
│  ├── modular/gdi-extras-loader.js                   │
│  ├── modular/gdi-list-worker.js                     │
│  ├── modular/meggy-pdf-worker.js                    │
│  ├── modular/storage.js                             │
│  ├── MANUAL_TECNICO.md  ← este arquivo              │
│  └── README.md         ← manual de usuário          │
│      ↓ git push                                      │
│      ↓ jsdelivr CDN (cache 1 ano, ?v=CACHE_VERSION) │
└─────────────────────────────────────────────────────┘
              ↓ browser carrega módulos
         [Usuário final]
```

### Fluxo de uma requisição

```
Browser → Cloudflare Worker → Google Drive API → Worker → Browser
                ↓
         (autenticação via cookie session)
                ↓
         (HTML SPA shell + módulos via CDN)
```

---

## 2. Estrutura de Arquivos

### 2.1 Repo Privado (`student_gdi`)

| Arquivo | Linhas | Descrição |
|---|---|---|
| `worker.js` | 4.479 | Cloudflare Worker — backend completo (auth, Drive API, AI, scanner, cursos) |
| `DEPLOY.md` | — | Instruções de deploy |
| `README.md` | — | Plano de emergência (legado) |

### 2.2 Repo Público (`gdi_server`)

| Arquivo | Linhas | Descrição |
|---|---|---|
| `core/app.min.js` | 1.750 | App principal — routing, file dispatch, video player, GDIUser, Bus |
| `modular/gdi-core.js` | 1.218 | Bootstrap + módulos M1-M9 (materiais, modal, toast, DOMPurify) |
| `modular/gdi-pdf.js` | 105 | Visualizador de PDF/Material (v55 — delega para M9) |
| `modular/gdi-ui.js` | 1.436 | Módulos M10-M20 (focus modes, pomodoro, PWA, progress) |
| `modular/gdi-meggy.js` | 2.831 | Meggy AI — chat, resumos, questões, flashcards, batalhão |
| `modular/gdi-study.js` | 4.791 | Área do Aluno — cursos, scanner, questões, simulado, cronograma |
| `modular/gdi-worker-bridge.js` | 342 | Ponte para Web Workers (listagem + PDF) |
| `modular/gdi-extras-loader.js` | 182 | Loader modular — carrega 6 módulos + 2 workers |
| `modular/gdi-list-worker.js` | 198 | Web Worker — listagem de pastas do Drive |
| `modular/meggy-pdf-worker.js` | 144 | Web Worker — extração de texto/OCR de PDFs |
| `modular/storage.js` | 399 | Camada de storage com memoização LRU |
| `MANUAL_TECNICO.md` | — | Este manual |
| `README.md` | — | Manual de usuário (PT + EN) |

**Total: ~17.900 linhas de código**

---

## 3. Backend — Cloudflare Worker (worker.js)

### 3.1 Visão Geral

O worker.js é um Service Worker Cloudflare que:
1. Serve a HTML shell da SPA
2. Faz proxy autenticado do Google Drive API
3. Gerencia autenticação (login/signup/session cookies)
4. Implementa 60+ endpoints de API
5. Integra com 5 provedores de LLM (NVIDIA, Zhipu, CF AI, OpenAI, OpenRouter)
6. Gerencia o scanner incremental de cursos
7. Persiste estado em Drive (`.meggy.ai/`) + KV

### 3.2 Endpoints HTTP

#### Estáticos / Shell

| Método | Path | Auth | Descrição |
|---|---|---|---|
| GET | `/` | sim | Homepage (drive picker) ou redirect via `?driveid=` |
| GET | `/login` | não | Página de login/signup |
| POST | `/login` | não | Autentica usuário → seta cookie session |
| POST | `/signup` | não | Registra novo usuário em `.gdi_users.json` |
| GET | `/logout` | não | Limpa cookie → redirect `/login` |
| GET | `/fallback` | sim | SPA shell (quando path não resolve por id) |
| GET | `/download.aspx` | sim | Stream de arquivo do Drive (valida MAC + expiry) |
| GET | `/app.min.js` | não | Proxy do app.min.js (4 fontes fallback) |
| GET | `/gdi-extras.js` | não | Proxy do gdi-extras-loader.js |
| GET | `/modular/<file>.js` | não | Serve módulos JS (whitelist de 10 arquivos) |
| GET | `/admin` | sim + admin | Painel do professor (stats de alunos) |

#### Drive Commands — `/<n>:<command>`

| Método | Path | Descrição |
|---|---|---|
| GET | `/<n>:search` | Página de busca |
| POST | `/<n>:search` | Body `{q, page_token}` → resultados paginados |
| POST | `/<n>:id2path` | Body `{id}` → resolve path do arquivo |
| POST | `/<n>:fallback` | Body `{id, type}` → metadata ou listagem |
| GET | `/<n>:quota` | Storage quota do Google Drive |

#### Drive Paths — `/<n>:/<path>`

| Método | Path | Descrição |
|---|---|---|
| POST | `/<n>:/<path>/` | Listar pasta (paginado) |
| GET | `/<n>:/<path>/` | Página de listagem (SPA) |
| GET | `/<n>:/<path>?a=view` | Página de visualização de arquivo |
| GET | `/<n>:/<path>/<file>` | Download direto |

#### User State

| Método | Path | Descrição |
|---|---|---|
| GET | `/userstate` | Estado do usuário (watched/resume/notes) |
| POST | `/userstate/save` | Salvar estado (até 512KB) |

#### AI — `/api/ai*`

| Método | Path | Descrição |
|---|---|---|
| POST | `/api/ai` | Chat com Meggy (rate limit 30 msg/h) |
| GET | `/api/ai/status` | Status do provedor de AI |
| GET | `/api/ai/models` | Lista modelos NVIDIA disponíveis |
| GET | `/api/ai/stats` | Estatísticas de uso das chaves NVIDIA |
| GET | `/api/ai/cache?key=` | Ler cache ISA de uma aula |
| POST | `/api/ai/cache` | Salvar cache ISA (summary/questions/mindmap) |
| GET | `/api/ai/shared-summaries?lesson=` | Resumos compartilhados entre alunos |
| POST | `/api/ai/shared-summaries` | Compartilhar resumo |
| GET | `/api/ai/shared-flashcards?subject=` | Flashcards compartilhados |
| POST | `/api/ai/shared-flashcards` | Compartilhar flashcard |
| POST | `/api/ai/redacao` | Corrigir redação (texto ou imagem OCR) |
| POST | `/api/ai/essay/save` | Salvar redação corrigida em `.md` |
| POST | `/api/ai/battalion` | Disparar batalhão de IA em background |
| GET | `/api/ai/battalion/status?courseKey=` | Status do batalhão |

#### Courses — `/api/courses*`

| Método | Path | Descrição |
|---|---|---|
| POST | `/api/courses/add` | Adicionar curso ao catálogo compartilhado |
| GET | `/api/courses/list` | Listar cursos do usuário |
| POST | `/api/courses/scan-progress` | Scan incremental com cursor (BFS) |
| GET | `/api/courses/scan-debug?coursePath=` | Debug do scan |
| POST | `/api/courses/user-progress` | Salvar progresso (KV + Drive) |
| GET | `/api/courses/user-progress?coursePath=` | Ler progresso |
| POST | `/api/courses/shared-progress` | Salvar progresso compartilhado (`.md`) |
| GET | `/api/courses/shared-progress?coursePath=` | Ler progresso compartilhado |

#### Materials — `/api/materials*`

| Método | Path | Descrição |
|---|---|---|
| GET | `/api/materials/list?kind=&course=` | Listar materiais (resumos/cards/pilulas/questoes/simulados) |
| POST | `/api/materials/save` | Salvar material no Drive |
| GET | `/api/materials/exists?fileName=&kind=` | Verificar se material existe |

#### Brain — `/api/brain*`

| Método | Path | Descrição |
|---|---|---|
| GET | `/api/brain/list?q=` | Listar arquivos da "memória" da Meggy |
| POST | `/api/brain/save` | Salvar nota na memória |

#### Short URLs

| Método | Path | Descrição |
|---|---|---|
| GET | `/f/<id>` | Redirect para path completo |
| POST | `/api/shorturl/register` | Registrar path curto (30 dias TTL) |

### 3.3 Autenticação

- **Cookie**: `session=<encUser>|<encPassOrKvKey>|<encSessionTime>` (AES-CBC encrypted)
- **Login**: verifica contra `authConfig.users_list` (plaintext fallback) ou `.gdi_users.json` (SHA-256+salt)
- **Session**: cookie HttpOnly, Secure, SameSite=Lax, Max-Age=7 dias
- **`gdiSessionUser(request)`**: decrypta cookie → retorna username (usado por todos os handlers)
- **Admin**: `ADMIN_USERS = ['elton@araujo.eu.org']` — único que acessa `/admin`

### 3.4 Google Drive API

- **Credenciais**: OAuth2 refresh_token (padrão) ou Service Account JWT
- **`gds[]` array**: 12 instâncias de `googleDrive` (uma por drive root)
- **`googleDrive` class**: cache de paths, files, folders, passwords, children
- **`requestOptions()`**: adiciona `Authorization: Bearer <token>` + `supportsAllDrives=true`

### 3.5 Estrutura de Pastas no Drive

```
drive 0 root (RETA FINAL TRTs)/
├── AULAS - ESTADO DOS ALUNOS/              ← USERSTATE_FOLDER
│   ├── .gdi_users.json                      ← registro de usuários (signup)
│   ├── <username>.json                      ← estado do usuário
│   ├── isa_cache.json                       ← cache AI por usuário (200 entradas LRU)
│   ├── isa_shared_summaries.json            ← resumos compartilhados (500 LRU)
│   ├── isa_shared_flashcards.json           ← flashcards compartilhados (1000 LRU)
│   └── .meggy.ai/                           ← memória Meggy por usuário
│       ├── resumos/    *.md
│       ├── cards/      *.json
│       ├── pilulas/    *.md
│       ├── questoes/   *.json
│       ├── simulados/  *.json
│       ├── brain/      *.md
│       ├── progress/   course-<hash>.md
│       └── redacoes/   *.md
└── .meggy.ai/                               ← COMPARTILHADO entre todos
    └── courses/
        ├── general_courses.json              ← catálogo de cursos (1000 LRU)
        └── <courseHash>/                     ← pasta por curso
            ├── lessons.json                  ← scan final (scanComplete:true)
            ├── scan-state.json               ← cursor do scan (scanComplete:false)
            └── user-<username>.json          ← progresso por aluno
```

### 3.6 KV Cache (Cloudflare)

| Key | TTL | Uso |
|---|---|---|
| `progress:<user>:<courseHash>` | 90 dias | Progresso por curso |
| `shorturl:<id>` | 30 dias | URLs curtas |
| `<username>_session` | — | Single-session (se habilitado) |
| `<username>_ip` | — | IP-lock (se habilitado) |

---

## 4. Frontend — app.min.js (Core)

### 4.1 Responsabilidades

- **Routing**: `render(path)` → `list()` (pasta) ou `file()` (arquivo) ou `fallback()`
- **File dispatch**: `dispatchFileView(file)` → `file_video` / `file_pdf` / `file_markdown` / `file_audio` / `file_image` / `file_code` / `file_workspace` / `file_others`
- **Video player**: layout `.gdi-study-grid` (vídeo esquerda + materiais direita)
- **Playlist**: `playlistVideos[]` + `currentIndex` + auto-advance
- **GDIUser**: singleton de estado do usuário (watched, resume, history, notes, marks)
- **Bus**: sistema de eventos (on/onGlobal/emit/reset)
- **Cache**: `_listCache` LRU (50 entradas, 5min TTL)

### 4.2 Globais Importantes

| Símbolo | Tipo | Descrição |
|---|---|---|
| `FILE_TYPES` | Object | Mapa de categoria → extensões (video, audio, image, code, archive, document, markdown) |
| `GDOC_TYPES` | Object | MIME types do Google Workspace → formatos de exportação |
| `Os` | Object | Detecção de dispositivo (isMobile, isIOS, isAndroid, isTouch) |
| `Bus` | Object | Event bus (on, onGlobal, emit, reset) |
| `GDIUser` | Object | Estado do usuário (watched, resume, history, notes, marks) |
| `player_config` | Object | Config do player (plyr/videojs/dplayer/jwplayer/native) |
| `window.UI` | Object | Config do servidor (disable_player, poster, etc.) |
| `window.drive_names` | Array | Nomes dos 12 drives |
| `playlistVideos` | Array | Playlist atual (read-only) |
| `currentIndex` | Number | Índice do vídeo atual |

### 4.3 GDIUser Schema (v4)

```js
{
  version: 4,
  watched: { "/path/to/video.mp4": true, ... },
  resume: { "/path/to/video.mp4": { position: 120.5, duration: 600, updatedAt: 169... }, ... },
  history: [{ path: "/path", name: "Aula 01", at: 169... }],
  notes: { "/path/to/lesson": [{ id, time, text, color, createdAt }] },
  marks: { "/path/to/lesson": [{ id, time, label }] },
  last: { path: "/last/path", name: "Aula X" },
  updated: 169...
}
```

### 4.4 Layout .gdi-study-grid

```
┌──────────────────────────────────────────────────┐
│ .gdi-study-bar (breadcrumb + #gdi-slot-modes)    │
├──────────────────────┬───────────────────────────┤
│ .gdi-study-left      │ .gdi-study-right          │
│  ├─ .gdi-study-head  │  (#gdi-slot-right)        │
│  ├─ .gdi-player-wrap │  M9 materials panel       │
│  │   (video OR pdf)  │  (abas: PDFs, MDs, Meggy) │
│  ├─ #gdi-player-nav  │                           │
│  └─ #gdi-slot-left   │                           │
└──────────────────────┴───────────────────────────┘
```

Modos de foco (M10):
- `split` — grid 58fr/42fr (padrão)
- `fv` — foco na aula (esconde right, grid 1fr)
- `fm` — foco no material (esconde left, grid 1fr)

---

## 5. Módulos Modulares

### 5.1 gdi-extras-loader.js — Loader

```js
const CACHE_VERSION = '55';  // bump para forçar reload CDN
const PUBLIC_REPO = 'esaaraujo-lab/gdi_server';
const BASE_URL = 'https://cdn.jsdelivr.net/gh/' + PUBLIC_REPO + '@main/modular/';

const MODULES = [
  'gdi-core.js',
  'gdi-worker-bridge.js',
  'gdi-pdf.js',
  'gdi-ui.js',
  'gdi-meggy.js',
  'gdi-study.js'
];

const WORKERS = ['gdi-list-worker.js', 'meggy-pdf-worker.js'];
```

- Carrega módulos em paralelo via `<script>` tags
- `?v=CACHE_VERSION` como cache-buster
- Guard anti-duplicate-bootstrap
- `Bus.emit('modules:ready')` ao completar

### 5.2 gdi-core.js — Bootstrap + M1-M9

| Módulo | Função |
|---|---|
| M1 | Password migration (legado) |
| M2 | Auth helpers |
| M3 | Video speed control |
| M4 | Keyboard shortcuts |
| M5 | 90% auto-watch (marca como assistido) |
| M6 | Notes, marks, review, export, double-tap |
| M7 | Skip intro |
| M9 | Materials panel (PDFs/MDs/TXTs/HTMLs por aula) |

#### M9 Materials Panel — Funções

| Função | Descrição |
|---|---|
| `classify(name)` | Classifica por conteúdo: Transcrição/Resumo/Ebook/Mapa Mental/Minissimulado/Exercícios/Markdown/Texto/HTML/Material |
| `isMaterial(x)` | Detecta PDF + MD + TXT + HTML (com fallback de extensão do nome) |
| `materialType(x)` | Retorna 'pdf'/'md'/'txt'/'html' |
| `renderMdLocal(txt)` | marked.parse + gdiSanitize (XSS-safe) |
| `build()` | Constrói painel: lista pasta, cria abas, auto-seleciona via `__gdiAutoSelectMaterial` |
| `show(idx)` | Renderiza material: MD→text viewer, PDF→iframe/pdf.js, mobile→pdf.js canvas |

### 5.3 gdi-pdf.js — Visualizador de Material (v55)

```js
function file_material(i, e, t, n, a, c, iconCls) {
  // Renderiza .gdi-study com data-material-page="1"
  // Left: placeholder (escondido em modo fm)
  // Right: #gdi-slot-right (M9 panel)
  // Seta window.__gdiAutoSelectMaterial = filename
  // Aplica gdi-fm (foco no material)
}

window.file_pdf = (i,e,t,n,a,c) => file_material(i,e,t,n,a,c, 'bi-file-earmark-pdf-fill');
window.file_markdown = (i,e,t,n,a,c) => file_material(i,e,t,n,a,c, /* icon por extensão */);
window.gdiPdfCleanup = async function(){}; // no-op (compat)
```

**v55**: removido canvas nativo do pdf.js (não tinha scrollbar). PDFs agora visualizados via iframe do M9 panel.

### 5.4 gdi-ui.js — M10-M20

| Módulo | Função |
|---|---|
| M10 | Focus modes (split/fv/fm) + botão Assistido |
| M11 | Modo descanso (sleep — audio only, screen off) |
| M13 | Resume card (continue de onde parou) |
| M14 | Progress bar |
| M16 | PWA offline (service worker — desativado) |
| M18 | Debug panel |
| M19 | Title cleanup |
| M20 | Playlist UI (freeze fix) |

#### M10 — Focus Modes

```js
// Para página de vídeo: 4 botões (Dividido, Foco na aula, Foco no material, Assistido)
// Para página de material (data-material-page=1): só "Foco no material" (sem Dividido/Foco-na-aula/Assistido)
// Material page sempre começa em modo fm
```

### 5.5 gdi-worker-bridge.js — Worker Bridge

- Pool de Web Workers sob demanda
- `window.gdiListAllFiles(path, pw)` — usa worker (não trava main thread)
- `window.gdiEnsurePdfjs()` — carrega pdf.js (idempotente)
- Fallback para main thread se worker falhar
- Blob URL technique para cross-origin workers

### 5.6 storage.js — Storage Layer

```js
window.GDIStorage = {
  saveCourse(coursePath, courseName, pdfCount),
  saveMaterial(coursePath, lessonName, kind, content),
  listMaterials(kind, courseFilter),
  scanCourseProgress(coursePath),
  // ... etc
};
```

- Memoização LRU (1000 entradas, 5min TTL)
- Cache Storage API para assets
- Drive-backed (`.meggy.ai/` folder)

---

## 6. Sistema de Scanner Incremental

### 6.1 Problema

Cloudflare Workers tem limite **hard de 50 subrequests (fetch calls) por invocação**. Cursos grandes (ex: PRF com 650+ subpastas) excedem esse limite.

### 6.2 Solução — Scan Incremental com Cursor (v1.0.58+)

**Estratégia**: BFS (Breadth-First Search) com cursor salvo no Drive.

```
Cliente chama POST /api/courses/scan-progress
         ↓
Servidor carrega cursor do Drive (scan-state.json)
         ↓ (contém: lessons parciais + queue de pastas pendentes)
Processa ~40 pastas (abaixo do limite CF de 50 subrequests)
         ↓
Ainda há pastas pendentes?
    ├── SIM → salva cursor no Drive, retorna status=partial
    │        ↓
    │   Cliente chama scan-progress de novo (500ms delay)
    │        ↓
    │   (volta ao início — servidor carrega cursor, continua)
    │
    └── NÃO → salva lessons.json definitivo (scanComplete=true),
              remove scan-state.json, retorna status=done
```

### 6.3 Funções do Scanner

| Função | Local | Descrição |
|---|---|---|
| `parseCoursePath(coursePath)` | worker.js | Regex `/^\/(\d+):\/?(.*)$/` → `{driveIndex, subPath}` |
| `courseHashFromPath(coursePath)` | worker.js | FNV-1a 64-bit hash → 16 hex chars |
| `gdiScanCourseLessonsIncremental(gd, startFolderId, startPath, existingLessons, existingPending, depth)` | worker.js | BFS com queue, SCAN_MAX_SUBREQ=40, MAX_DEPTH=10 |
| `gdiSaveScanCursor(gd0, courseHash, stateJson)` | worker.js | Salva cursor em `.meggy.ai/courses/<hash>/scan-state.json` |
| `gdiReadScanCursor(gd0, courseHash)` | worker.js | Lê cursor do Drive |
| `gdiDeleteScanCursor(gd0, courseHash)` | worker.js | Remove cursor (scan completo) |
| `gdiSaveCourseLessons(gd0, courseHash, lessonsJson)` | worker.js | Salva lessons.json final (scanComplete=true) |
| `gdiReadCourseLessons(gd0, courseHash)` | worker.js | Lê lessons.json (cache) |
| `handleCourseScanProgress(request)` | worker.js | Orquestra: cache check → cursor load → scan → save → response |
| `scanCourse(courseKey, onProgress)` | gdi-study.js | Loop de batches (max 30) até status=done |
| `getScanProgress(courseKey)` | gdi-study.js | Estado atual do scan |
| `getCourseLessons(courseKey)` | gdi-study.js | Lessons cacheadas |
| `startScan(courseKey, onProgress)` | gdi-study.js | Fire-and-forget + stuck detection (5min) |
| `resumeInterruptedScans()` | gdi-study.js | Resume scans interrompidos no page load |
| `autoScanPending()` | gdi-study.js | Auto-scan primeiro curso sem estado 'done' |
| `cleanupOrphanCourses()` | gdi-study.js | Remove cursos órfãos (drive roots, sem nome) |

### 6.4 Validações de Cache (v1.0.59-v60)

- **Cache `lessons.json`**: valida que pelo menos 1 lesson tem path começando com `coursePath`. Se inválido, ignora e re-escaneia.
- **Cursor `scan-state.json`**: valida que TODAS as lessons tem path correto. Se alguma inválida, descarta cursor e recomeça.
- **Drive-root guard**: se courseKey é `/0:/` (raiz do drive), aborta com mensagem clara.

### 6.5 Tipos de Arquivo Detectados

| Tipo | Extensões | mimeType |
|---|---|---|
| video | mp4, webm, mkv, mov, avi, m4v, ts, m3u8 | `video/*` |
| audio | mp3, m4a, aac, ogg, wav, flac, m4b | `audio/*` |
| pdf | pdf | `application/pdf` |
| doc | doc, docx, ppt, pptx, odt, odp, txt, md, rtf | — |
| ebook | epub, mobi, azw, azw3 | — |
| image | jpg, jpeg, png, gif, webp, bmp | `image/*` |

---

## 7. Meggy AI

### 7.1 Visão Geral

Meggy é uma poodle tutora de estudos integrada à plataforma. Tem 2 blocos:

- **M9-ISA** (gdi-meggy.js bloco 1): geração de resumos, questões, pílulas, flashcards
- **M-AI widget** (gdi-meggy.js bloco 2): chat flutuante (FAB) com memória

### 7.2 API — `window.gdiIsaPdf`

| Método | Descrição |
|---|---|
| `summary(items, bodyEl, lessonName)` | Gera resumo (transcription-first) |
| `questions(items, bodyEl, lessonName)` | Gera questões |
| `mindmap(items, bodyEl, lessonName)` | Gera pílulas (15 bullets) |
| `flashcards(items, bodyEl, lessonName)` | Biblioteca de flashcards |
| `regenerate(items, bodyEl, lessonName)` | Limpa cache + regenera |
| `extractPdfText(url, progressCb)` | Extrai texto de PDF (pdf.js + OCR) |
| `saveIsaSummary(lesson, summary, coursePath, subject)` | Salva resumo no Drive |
| `listIsaSummaries()` | Lista resumos salvos |
| `delIsaSummary(id)` | Deleta resumo |
| `downloadAsPdf(lesson, markdownText)` | Download como PDF (print) |
| `fetchSharedQuestions(subjectFilter)` | Questões de outros alunos |
| `fetchSharedSummaries(lessonFilter)` | Resumos de outros alunos |
| `saveSharedSummary(lessonName, summary, questions)` | Compartilha resumo |
| `saveEssayMD(markdown, banca, tipo, score)` | Salva redação |
| `startBattalion(courseKey, coursePath, lessonName, pdfList)` | Dispara batalhão em background |
| `getBattalionStatus(courseKey)` | Status do batalhão |

### 7.3 Estratégia Transcription-First (v1.0.54)

```
PASSO 1: Busca arquivos com "transcri" no nome PRIMEIRO
         ↓ extrai via extractTextFile (fetch direto, rápido — 1-2s)
PASSO 2A: Se achou transcrição (text > 50 chars)
         → USA SÓ ELA (allText = transcrição)
         → PULA extração de PDFs inteiramente
         → Gera resumo em ~3-5s
PASSO 2B: Se NÃO achou transcrição (ou falhou)
         → Faz fallback: extrai PDFs/materiais em paralelo
         → Usa esses textos para gerar o resumo
```

### 7.4 Provedores de LLM (worker.js)

| Provider | Env Vars | Endpoint | Modelo Default |
|---|---|---|---|
| NVIDIA NIM | `NVIDIA_API_KEY[_2..10]` | `integrate.api.nvidia.com/v1/chat/completions` | `z-ai/glm-5.3` |
| Zhipu (Meggy) | `ZHIPU_API_KEY` ou `AI_API_KEY` | `open.bigmodel.cn/api/paas/v4/chat/completions` | `glm-4-flash` |
| CF Workers AI | binding `AI` | (in-process) | `@cf/meta/llama-3.1-8b-instruct` |
| OpenAI | `OPENAI_API_KEY` | `api.openai.com/v1/chat/completions` | `gpt-4o-mini` |
| OpenRouter (race) | `OPENROUTER_API_KEY` | `openrouter.ai/api/v1/chat/completions` | 15 modelos free em paralelo |

**NVIDIA multi-key round-robin**: até 10 chaves, incrementa `globalThis.__NVIDIA_KEY_IDX` por call. Header `X-Key-Hint` override (1-indexed).

### 7.5 Batalhão (Background Pipeline)

Disparado ao adicionar curso. Para cada PDF:
1. `battalionGenSummary` — resumo profundo + detecção de leis desatualizadas
2. `battalionGenPills` — 15 pílulas de revisão
3. `battalionGenQuestions` — 10 questões JSON (pula se `cache.outdated`)

Salva em: ISA cache + `.meggy.ai/{resumos,pilulas,questoes,cards,simulados,brain}/`

### 7.6 Chat Widget (M-AI)

- **FAB**: `#gdi-ai-fab` — botão flutuante bottom-right com SVG do poodle
- **Panel**: `#gdi-ai-panel` — 380×540px, backdrop-blur
- **Header**: avatar SVG + nome "Meggy" + tag "— a poodle tutora"
- **Memória**: `gdi-meggy-memory-v1` localStorage — interações, tópicos, pontos fracos, últimas aulas
- **Rate limit**: 30 msgs/hora por usuário
- **Abuse detection**: 10 regex patterns (prompt injection, senha, etc.)
- **System prompt**: Meggy poodle brasileira, 7 regras de segurança, Markdown, emojis

---

## 8. Área do Aluno

### 8.1 M22 — Painel Principal

URL: `?central=1` abre direto · Tecla: `C` toggle

#### Tabs (sidebar)

| Grupo | Tab | Função |
|---|---|---|
| — | home | Dashboard (saudação, stats, continue) |
| Praticar | questoes | Banco de questões + SRS |
| Praticar | simulado | Simulado cronometrado |
| Materiais | addmateria | Adicionar curso (Navegar Drive / Manual) |
| Materiais | resumos | Resumos salvos (Meggy) |
| Materiais | provas | Análise de provas (upload PDF) |
| Materiais | redacao | Correção de redação |
| Planejar | cronograma | Plano de estudos |
| Planejar | stats | Estatísticas + heat calendar |
| Planejar | radar | Mapa de fracos |
| Planejar | achievements | Conquistas |

### 8.2 Adicionar Curso — `window.gdiAddCourseFromDrive(coursePath, courseName, pdfCount)`

Fluxo de 7 passos:
1. Salva em `gdi-manual-courses-v1` (localStorage)
2. POST `/api/courses/add` (persiste no Drive compartilhado)
3. Toast feedback
4. Re-renderiza lista
5. Fecha modal
6. Dispara batalhão IA em background
7. Dispara scanner em background

### 8.3 M23 — Estudo Ativo

#### Question Bank

- **localStorage**: `gdi-questions-v1` (array de questões)
- **SRS**: Leitner 5 boxes — intervalos `[1, 3, 7, 21, 60]` dias
- `gradeQ(id, acertou)` → acertou: box++ (max 4); errou: box=0
- **Caderno de erros**: `gdi-caderno-erros-v1` (IDs das erradas)

#### Simulado

- Selecionar curso + N questões (5-50) + tempo (5-180 min)
- Pool = questões locais + shared (`fetchSharedQuestions`)
- Fisher-Yates shuffle
- Timer com deadline
- Salva em `gdi-simulados-v1`

#### Cronograma

- Data da prova + questões por dia
- Distribui aulas de `GDIUser.history` ou `playlistVideos`
- Revisões agendadas em +1, +7, +30 dias
- Salva em `gdi-cronograma-v1`

### 8.4 M24 — Estudo Avançado

#### Provas

- Upload de PDF da prova
- Extrai texto (pdf.js, 60 páginas max)
- Meggy analisa: 5 temas mais cobrados + plano de 100h
- Salva em `gdi-exam-plans-v1`

#### Redação

- 4 bancas: Concurso Público / ENEM / Vestibulares Medicina / Outros
- 6 tipos: Dissertativa / Estudo de caso / Discursiva / Narrativa / Carta / Artigo
- Upload imagem (OCR) ou PDF ou texto colado
- Meggy corrige: 7 seções (nota, critérios, parágrafos, pontos fortes/fracos, sugestões, reescrita)
- Salva em `gdi-essay-corrections-v1` + Drive

#### Radar (Mapa de Fracos)

- Lê `gdi-questions-v1` + `gdi-q-srs-v1`
- Por disciplina: total, correct, wrong, accuracy
- Weak subjects: `<60%` accuracy
- Tiles coloridos: <40% vermelho, 40-60% amarelo, 60-80% verde, >80% verde escuro

### 8.5 Scanner — `window.gdiCourseScanner`

```js
window.gdiCourseScanner = {
  startScan,              // (courseKey, onProgress) → fire-and-forget
  scanCourse,             // (courseKey, onProgress) → Promise<state>
  getScanProgress,        // (courseKey) → {status, lessonsFound, percent, error}
  getCourseLessons,       // (courseKey) → {lessons, scanned, totalLessons}
  countWatched,           // (courseKey) → number
  clearScanState,         // (courseKey) → void
  resumeInterruptedScans, // () → void
  autoScanPending,        // () → void
  cleanupOrphanCourses,   // () → number
  version: '1.1'
};
```

---

## 9. Camada de Storage

### 9.1 localStorage Keys

#### gdi-meggy.js

| Key | Tipo | Descrição |
|---|---|---|
| `gdi-isa-summaries-v1` | array | Resumos salvos (cap 200) |
| `gdi-questions-v1` | array | Banco de questões |
| `gdi-subjects-v1` | array | Disciplinas manuais |
| `gdi-cards-v1` | array | Flashcards |
| `gdi-answered-questions-v1` | array | IDs respondidas (cap 500) |
| `gdi-meggy-memory-v1` | object | Memória da Meggy |
| `gdi-cards-studied-count` | string | Counter de achievements |
| `gdi-ai-chat` (session) | array | Últimas 20 msgs do chat |
| `gdi-meggy-open` (session) | string | Estado do painel |
| `gdi-ai-seen` (session) | string | Badge de primeira vez |

#### gdi-study.js

| Key | Tipo | Descrição |
|---|---|---|
| `gdi-q-srs-v1` | object | SRS das questões |
| `gdi-simulados-v1` | array | Histórico de simulados |
| `gdi-cronograma-v1` | object | Plano de estudos |
| `gdi-caderno-erros-v1` | array | Questões erradas |
| `gdi-simulados-count` | string | Counter de achievements |
| `gdi-goal-min` | number | Meta diária (10-480 min) |
| `gdi-watch-v1` | object | Tempo por dia |
| `gdi-marathon` | boolean | Modo maratona |
| `gdi-marathon-intro` | boolean | Skip intro |
| `gdi-hidden-courses-v1` | array | Cursos ocultos |
| `gdi-manual-courses-v1` | array | Cursos adicionados |
| `gdi-exam-plans-v1` | array | Planos de prova |
| `gdi-essay-corrections-v1` | array | Correções de redação |
| `gdi-course-scan-<key>` | object | Estado do scanner por curso |
| `gdi-course-lessons-<key>` | object | Lessons cacheadas por curso |
| `gdi-theme` | string | 'dark' / 'light' |
| `gdi-study-mode` | string | 'split' / 'fv' / 'fm' |

### 9.2 Drive Storage

- **`.meggy.ai/courses/general_courses.json`** — catálogo compartilhado
- **`.meggy.ai/courses/<hash>/lessons.json`** — scan final
- **`.meggy.ai/courses/<hash>/scan-state.json`** — cursor do scan
- **`.meggy.ai/courses/<hash>/user-<username>.json`** — progresso por aluno
- **`AULAS - ESTADO DOS ALUNOS/<username>.json`** — estado do usuário
- **`AULAS - ESTADO DOS ALUNOS/.meggy.ai/{resumos,cards,pilulas,questoes,simulados,brain,progress,redacoes}/`** — materiais por usuário

### 9.3 KV Cache

- `progress:<user>:<hash>` (90 dias) — progresso por curso
- `shorturl:<id>` (30 dias) — URLs curtas

---

## 10. Sistema de Eventos (Bus)

```js
Bus.on(event, fn)      // page-scoped listener (limpo em page:change)
Bus.onGlobal(event, fn) // global listener (persiste)
Bus.emit(event, ...args)
Bus.reset()             // limpa page-scoped listeners
```

### Eventos Principais

| Evento | Emitido por | Ouvintes |
|---|---|---|
| `page:change` | render() | Meggy widget (debounced memory), central panel, nav inject, auto-scan |
| `slots:ready` | file_video, file_material | M9 (materials), M10 (focus modes) |
| `media:ready` | video player | Player-Guard, Marathon mode |
| `video:switched` | playlist nav | M9 rebuild, resume tracking |
| `video:ended` | video element | auto-advance, markWatched |
| `watched:changed` | GDIUser.markWatched | bestInCache invalidate, UI update |
| `user:ready` | GDIUser.init | auto-scan, URL central open |
| `rows:appended` | list render | nav button inject |
| `modules:ready` | gdi-extras-loader | module init |

---

## 11. Configuração e Secrets

### 11.1 authConfig (worker.js)

```js
const authConfig = {
  siteName: "",
  client_id: "746239575955-...",        // Google OAuth
  client_secret: "...",
  refresh_token: "...",
  service_account: false,
  files_list_page_size: 100,
  search_result_list_page_size: 100,
  enable_login: true,
  enable_signup: true,
  login_days: 7,
  cors_domain: "*",
  users_list: [                          // 14 usuários (plaintext fallback)
    { username: "elton@araujo.eu.org", password: "F@b@180574" },
    { username: "joao", password: "joao" },
    // ...
  ],
  roots: [                               // 12 drives
    { id: "18pNVx52TY5...", name: "RETA FINAL TRTs", type: "root" },
    { id: "1lZo5wBhqC4...", name: "CURSOS - PLATAFORMAS COMPLETAS" },
    // ... 10 mais
  ]
};
```

### 11.2 Environment Variables (Cloudflare)

| Var | Uso |
|---|---|
| `CRYPTO_BASE_KEY` | AES-CBC session key |
| `HMAC_BASE_KEY` | HMAC download MAC |
| `NVIDIA_API_KEY[_2..10]` | Multi-key NVIDIA NIM |
| `ZHIPU_API_KEY` / `AI_API_KEY` | Meggy/Zhipu GLM |
| `OPENAI_API_KEY` | OpenAI fallback |
| `OPENROUTER_API_KEY` | OpenRouter race |
| `ENV` (KV binding) | KV namespace |
| `AI` (binding) | CF Workers AI |

### 11.3 Versionamento

```js
const CDN_VERSION = '2.5.9';      // fork base (GDI-JS)
const APP_VERSION = '1.0.60';     // build atual (footer)
const BUILD_DATE = '2026-09-23 03:20';
const CACHE_VERSION = '55';       // cache-buster módulos CDN
```

---

## 12. Pipeline de Deploy

### 12.1 Scripts de Automação

```bash
# Deploy completo (sync + commit + purge + verify)
./gdi-release.sh "v1.0.XX: descrição"

# Só commit para GitHub
./gdi-deploy.sh "mensagem"

# Só purge CDN
./gdi-purge-cdn.sh

# Verificar versão
./gdi-verify.sh
```

### 12.2 Fluxo

1. Editar arquivos em `student_gdi/`
2. `./gdi-release.sh "v1.0.XX: descrição"`
3. Script faz:
   - Sync `student_gdi/` → `DEPLOY_FINAL/`
   - Commit para repo público (10 arquivos) via GitHub API
   - Commit para repo privado (worker.js) via GitHub API
   - Purge jsdelivr CDN (9 módulos)
   - Aguarda Cloudflare auto-deploy (~1-3 min)
   - Verifica versão no rodapé

### 12.3 Token GitHub

- Fine-grained PAT com `Contents: Read and Write`
- Salvo em `~/.config/gdi-deploy.json` (perms 600)
- Nunca commitado

---

## 13. Troubleshooting

### 13.1 Scanner HTTP 500

**Causa**: "Too many subrequests" — Cloudflare limite 50 fetches/invocação.
**Solução**: v1.0.58+ usa scan incremental com cursor. Cada batch processa ~40 pastas.

### 13.2 Scanner HTTP 400

**Causa**: coursePath é raiz do drive (`/0:/`).
**Solução**: v1.0.49+ tem guard que aborta com mensagem clara. Re-adicionar curso navegando até a pasta correta.

### 13.3 Paths errados nas lessons

**Causa**: Cursor antigo (v1.0.58) com paths sem o nome do curso.
**Solução**: v1.0.60 valida paths do cursor — se inválidos, descarta e recomeça.

### 13.4 Meggy "Invalid PDF structure"

**Causa**: Meggy tentava abrir MD/TXT/HTML como PDF.
**Solução**: v1.0.51+ despacha por tipo (PDF → extractPdfText, texto → extractTextFile).

### 13.5 MD em branco/fonte branca

**Causa**: M9 só filtrava PDFs. MDs não apareciam.
**Solução**: v1.0.49+ `isMaterial()` inclui MD/TXT/HTML. v1.0.53+ labels por conteúdo (Transcrição/Resumo/Ebook).

### 13.6 Avatar Meggy texto literal

**Causa**: Template literal usava `' + MEGGY_AVATAR + '` (aspas simples) em vez de `${MEGGY_AVATAR}`.
**Solução**: v1.0.56+ usa interpolação correta.

### 13.7 CDN cache antigo

**Causa**: jsdelivr cacheia por URL. `?v=CACHE_VERSION` não muda se version não bumpa.
**Solução**: Bump CACHE_VERSION + purge via `./gdi-purge-cdn.sh`.

### 13.8 Worker não atualiza

**Causa**: Cloudflare auto-deploy pode levar 1-3 min.
**Solução**: `./gdi-verify.sh` aguarda e confirma versão.

---

## Apêndice — Histórico de Versões (v1.0.49-v1.0.60)

| Versão | Task | Descrição |
|---|---|---|
| 1.0.49 | MD-PDF | M9 inclui MD/TXT/HTML, file_pdf study-grid, file_markdown |
| 1.0.50 | MD-PDF-FIX | isMobile scope fix, CACHE_VERSION 44→45 |
| 1.0.51 | MD-EXTRACT | Meggy despacha por tipo (PDF vs texto) |
| 1.0.52 | M9-CRASH | Guard x.link undefined, filter linkless files |
| 1.0.53 | TRANSC | Labels por conteúdo (Transcrição/Resumo/Ebook) |
| 1.0.54 | TRANSC-FIRST | Meggy prioriza transcrição (PASSO 1/2A/2B) |
| 1.0.55 | MATERIAL-PAGE | Remove canvas nativo, file_material helper |
| 1.0.56 | SCAN-500+AVATAR | Scanner try-catch, MEGGY_AVATAR fix |
| 1.0.57 | SCAN-SUBREQ | Contador subrequests (40 max), depth 8 |
| 1.0.58 | SCAN-CURSOR | Scan incremental BFS com cursor no Drive |
| 1.0.59 | SCAN-PATH | Passa parsed.subPath como startPath |
| 1.0.60 | SCAN-CURSOR-VALIDATE | Valida paths do cursor, descarta inválidos |

---

**Manual gerado em:** 2026-09-25
**Cobertura:** 17.900 linhas de código revisadas
**Repos:** público `esaaraujo-lab/gdi_server` · privado `esaaraujo-lab/student_gdi`
