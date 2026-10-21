# Meggy — Mapa de Features para App Windows Nativo

**Task ID:** WINDOWS-APP-FEATURES
**Plataforma analisada:** Meggy (https://educa.eu.org) — fork do GDI Index / Parveen Badhoo
**Versão do código-fonte:** GDI-JS 2.5.9 · `APP_VERSION = '1.0.197'` · `BUILD_DATE = '2026-10-19 03:00 UTC'`
**Stack alvo (referência):** Tauri 2.0 (Rust) — conforme botão "Apps" em `study-panel.js:560-580`
**Arquivos-fonte consultados (somente leitura — nenhuma alteração de código):**
- `/home/z/my-project/worklog_worker_map.md` (905 linhas — worker.js completo)
- `/home/z/my-project/worklog_frontend_map.md` (1 305 linhas — 30 arquivos frontend)
- `/home/z/my-project/student_gdi/modular/study/study-panel.js` (1 878 linhas — TAB_GROUPS + renderBody)
- `/home/z/my-project/student_gdi/modular/gdi-meggy.js` (3 229 linhas — `window.*` AI exports)

> **Restrição atendida:** apenas documentação. Nenhum arquivo de código foi modificado.

---

## 0. Resumo executivo

A plataforma Meggy é uma **SPA educacional** servida por um Cloudflare Worker monolítico
(`worker.js` — 8 677 linhas, ~70 endpoints `/api/*`) que proxya e cacheia **12 Google
Drives** (`authConfig.roots`) e expõe uma camada de IA (racer entre Zhipu/GLM, NVIDIA
NIM, OpenAI-compat, OpenRouter, Groq e CF Workers AI), cache ISA distribuído em Drive
dotfiles, banco D1 (Cloudflare) para busca de lessons/summaries/flashcards, e batalhão
de geração de materiais em background.

O frontend (32 239 linhas em 30 arquivos ativos) organiza-se em **14 abas** (`TAB_GROUPS`
em `study-panel.js:371-394`) distribuídas em 4 grupos, com ~110 funções públicas em
`window.*`/`window.__gdiStudy.*`/`window.__gdiMeggy.*`.

Para um app Windows nativo (Tauri 2.0 / Rust), **~90% das features podem ser
reimplementadas de forma 100% nativa** chamando os mesmos endpoints HTTP. Apenas 4
features precisam de webview pontual (PDF render, impressão, OCR com libs JS, e o
Service Worker de cache de mídia).

---

## 1. Lista completa de features (categorizada)

### 1.1 Autenticação (login, sessão, logout)

| # | Feature | Detalhe técnico | Endpoint / fonte |
|---|---|---|---|
| 1.1.1 | Login por formulário (usuário + senha) | Validação contra `users_list` (hardcoded) + `.gdi_users.json` dinâmico no Drive. Senha via SHA-256(password+salt). | `POST /login` |
| 1.1.2 | Signup | Cria usuário dinâmico em `.gdi_users.json` no Drive root[0]. | `POST /signup` |
| 1.1.3 | Login Google OAuth | Botão "Entrar com Google" → redirect OAuth → callback. | `GET /google_callback` |
| 1.1.4 | Logout | Limpa cookie `session`. | `GET /logout` |
| 1.1.5 | Sessão por cookie cifrado | Cookie `session` = `encrypt(username)\|encrypt(session_time)` (AES-CBC + base64, IV prefixado). Lido por `gdiSessionUser(request)`. | — |
| 1.1.6 | Persistência de senha de drive (M1) | XOR + base64 em `localStorage` (fraco — substituir por Windows Credential Manager no Tauri). | `gdi-core.js` M1 `gdiSetPw`/`gdiGetPw` |
| 1.1.7 | Reset de sessão automático | Redirecionamentos para `/login` em sessão inválida (`isLoginRedirect`). | worker.js inline |
| 1.1.8 | User state (GDIUser) | JSON por usuário em `AULAS - ESTADO DOS ALUNOS/<username>.json` no Drive root[0]. Contém watched/resume/notes/history/intro/srs. | `GET /userstate` · `POST /userstate/save` |
| 1.1.9 | Painel Admin (professor) | Lista alunos (paginado 200/pg até 10pg, cap 20 exibidos), stats (assistidas/andamento/horas/dias/streak), últimas atividades, agrupamento por curso. | `GET /admin` (apenas `ADMIN_USERS`) |

**Funciona offline?** Não — login requer validação server-side. Manter cache local
da última sessão válida para reabrir o app sem internet (modo leitura).

---

### 1.2 Navegação (drives, pastas, arquivos)

| # | Feature | Detalhe técnico | Endpoint / fonte |
|---|---|---|---|
| 1.2.1 | Listagem dos 12 drives raiz | Cards com ícone/cor por disciplina via `gdiCourseIdentity(courseKey, courseName)`. Renderizado por `renderDrives()` em `study-panel.js:722`. | `authConfig.roots` (12 entradas) |
| 1.2.2 | Navegação recursiva em pastas | `browseDriveInPanel(box, path, title)` (`study-panel.js:760`) — recursivo, com spinner e breadcrumb. | `POST <path>` (folder listing paginado) |
| 1.2.3 | Listagem pesada via Web Worker | `gdi-list-worker.js` (272 linhas) — paginação de até 50 páginas, retry em 429/503 (3 retries, 1s delay), `AbortController` 30s por página, throttle 200ms para progress. Teto 600 itens por pasta. | worker ↔ bridge |
| 1.2.4 | Varredura cross-folder de playlist | `gdiScanCrossFolder()` — varre até 300 subpastas em batches de 6 paralelos. | `gdi-worker-bridge.js` |
| 1.2.5 | Busca dentro de um drive | Busca textual via Drive API. | `POST /<n>:search` |
| 1.2.6 | Resolver ID → Path | Para resultados de busca (clicar leva ao arquivo). | `POST /<n>:id2path` · `GET /<n>:findpath` |
| 1.2.7 | Fallback por ID cifrado | Listagem alternativa quando path não resolvível. | `POST /<n>:fallback` |
| 1.2.8 | Quota do Drive | Exibe espaço usado/disponível. | `GET /<n>:quota` |
| 1.2.9 | Download de arquivo (signed URL) | URL `/download.aspx?file=<enc>&expiry=<enc>&mac=<hmac>` com expiração de `authConfig.file_link_expiry` dias (HMAC SHA-256). Suporta Range requests para streaming de mídia. | `GET /download.aspx` |
| 1.2.10 | Copiar arquivo no Drive | Copia arquivo entre pastas. | `POST /copy` |
| 1.2.11 | Filtro de itens ocultos | `isHiddenName`/`isHiddenPath` — filtra nomes começando com `.`, em `HIDDEN_EXACT_NAMES`, ou extensões `HIDDEN_EXTENSIONS`. | worker.js inline |
| 1.2.12 | Short URL | Gera short id de 6 chars a partir de path; redirect via `/f/<shortId>`. | `POST /api/shorturl/register` · `GET /f/<shortId>` |
| 1.2.13 | Senha por pasta | `gdiGetPw(path)` / `gdiSetPw(p, v)` — algumas pastas exigem senha (passada como query param na listagem). | `gdi-core.js` M1 |
| 1.2.14 | Deep-link via hash URL | `tryOpenFromURL()` em `study-panel.js` abre painel via URL hash `#tab=...`. | `study-panel.js` nested IIFE |

**Funciona offline?** Não — toda navegação exige Drive API. Em cache local
(`gdi-folders-v1` em Cache Storage API) pode-se sobreviver a quedas curtas.

---

### 1.3 Player (vídeo, áudio, resume, playlist, speed, sleep timer)

| # | Feature | Detalhe técnico | Endpoint / fonte |
|---|---|---|---|
| 1.3.1 | Player de vídeo universal | Compatível com plyr/videojs/dplayer/jwplayer/shaka/native — opera direto no `<video>`. | `gdi-player-enhancer.js` |
| 1.3.2 | Memória de velocidade por curso | `localStorage['gdi-video-speed-<courseKey>']` — aplicada automaticamente ao abrir vídeo daquele curso. | `gdi-player-enhancer.js` |
| 1.3.3 | Atalhos de teclado | J/K/L (back/play/fwd), ←→ (seek 5s), ↑↓ (volume), 0-9 (seek %), M (mute), F (fullscreen). | `gdi-player-enhancer.js` |
| 1.3.4 | Resume (continuar de onde parou) | `GDIUser.getResume(videoKey)` — posição persistida em `<username>.json`. Toast visual ao reabrir aula. | `app.min.js` + `userstate` |
| 1.3.5 | Playlist da aula atual | `window.playlistVideos` + `window.currentIndex` (Object.defineProperty). Teto 600 itens. | `app.min.js` + `gdi-ui.js` M20 |
| 1.3.6 | Skip-intro (M7) | Lembra início da aula (intro skipada) em `__gdiLastIntro`. | `gdi-core.js` M7 |
| 1.3.7 | Sleep mode / descanso (M11) | Botão para dormir o player; restore automático em `video:switched`/`page:change`. | `gdi-ui.js` M11 |
| 1.3.8 | Pomodoro (M12) | FAB + painel — 25min foco / 5min descanso, com fases. | `gdi-ui.js` M12 |
| 1.3.9 | Modos de foco (M10) | Split / foco-vídeo / foco-material / fullscreen sem barras pretas. | `gdi-ui.js` M10 |
| 1.3.10 | Anotações no player (M5) | UI de marks/notas em timestamps do vídeo. | `gdi-core.js` M5 |
| 1.3.11 | Cronômetro + export de notas (M6) | Cronômetro de sessão; notas exportáveis em PDF/txt/json. | `gdi-core.js` M6 |
| 1.3.12 | Player-guard (watchdog) | Se `<video>` parar de progredir 15s, reload silencioso (1×); se persistir, overlay "Recarregar"/"Continuar aguardando". Hint "Toque para iniciar" se não começar em 3.5s. | `study-player-guard.js` |
| 1.3.13 | Continue-card em cascata (M13) | Card "Continuar de onde parou" para múltiplos cursos. | `gdi-ui.js` M13 |
| 1.3.14 | Progresso por módulo (M14) | Linha de progresso + chips por módulo do curso. | `gdi-ui.js` M14 |
| 1.3.15 | Limpeza de título da aba (M19) | Remove sufixos/prefixos poluentes do título do vídeo. | `gdi-ui.js` M19 |
| 1.3.16 | Range requests de mídia (streaming) | Suporte a HTTP Range via `/download.aspx` — necessário para seek em vídeos longos. | worker.js `download()` |
| 1.3.17 | Service Worker (cache de mídia) | `GDI_SW` template (115 linhas, worker.js:2131-2246) — `fillMediaCache`, `rangeFromCache`, LRU eviction. | `GET /sw.js` ou `/gdi-sw.js` |
| 1.3.18 | Áudio (mp3/m4a) | Tratado pela mesma stack de player (via `<audio>` ou `<video>` sem capa). | — |

**Funciona offline?** Parcialmente — vídeos baixados previamente podem ser reproduzidos
se o Tauri mantiver cache local de mídia (substituto do Service Worker). Recomenda-se
implementar **download offline** explícito (igual ao app Android citado em `study-panel.js:548`).

---

### 1.4 AI (chat, coach, resumos, questões, flashcards, redação, OCR)

| # | Feature | Detalhe técnico | Endpoint / fonte |
|---|---|---|---|
| 1.4.1 | Meggy Chat (widget flutuante) | FAB + painel fora do body (sobrevive a trocas de página). UI completa em `meggy-widget.js` (983 linhas). | `POST /api/ai/stream` (SSE) |
| 1.4.2 | AI no navegador (fallback offline) | Chrome Prompt API / Gemini Nano via `ai.languageModel` — tentado antes de `/api/ai/stream`. | `meggy-widget.js` |
| 1.4.3 | AI status check | Verifica saúde dos backends antes de abrir chat. | `GET /api/ai/status` |
| 1.4.4 | Memória de conversa | `localStorage['gdi-meggy-memory-v1']` + histórico em `sessionStorage['gdi-ai-chat']`. | `meggy-widget.js` |
| 1.4.5 | Quick actions | Botões "💬 Resumir", "❓ Questões", "💡 Explicar" preenchem prompt e disparam send. | `meggy-widget.js` |
| 1.4.6 | Rate limit | 30 msgs/hora por usuário (`__MEGGY_RATE` map). UI mostra contador. | worker.js `handleAi` |
| 1.4.7 | AI unificada (racer) | `callUnifiedAi` — Promise.any entre Zhipu/GLM, NVIDIA NIM, OpenAI-compat, OpenRouter, Groq, CF Workers AI. Timeout 30s. | `POST /api/ai` |
| 1.4.8 | AI streaming (SSE) | Fallback para `/api/ai/stream` (só NVIDIA GLM, mantém conexão viva). Lê linhas `data: `. | `POST /api/ai/stream` |
| 1.4.9 | AI OCR (visão) | OCR de PDFs escaneados via CF Workers AI vision model. | `POST /api/ai/ocr` |
| 1.4.10 | AI models list | Lista backends AI disponíveis. | `GET /api/ai/models` |
| 1.4.11 | AI discover | Descobre modelos NVIDIA NIM disponíveis. | `GET /api/ai/discover` |
| 1.4.12 | AI stats | Contadores de uso AI. | `GET /api/ai/stats` |
| 1.4.13 | AI test | Testa backend específico (rate-limited). | `GET /api/ai/test?provider=&model=` |
| 1.4.14 | Meggy Coach | IA analisa dados do aluno (SRS, fraquezas, minutos/dia) e recomenda próximos passos. Rate limit próprio (`__MEGGY_COACH_RATE`). Cache 5min. | `POST /api/ai/coach` |
| 1.4.15 | ISA Cache (resumo+questões+mindmap+flashcards) | Cache em localStorage (`gdi-isa-summaries-v1`) + Drive (`.meggy.ai` dotfiles) + KV/D1. Mescla por chave via `Object.assign`. | `GET/POST/HEAD /api/ai/summaries` · `GET/POST /api/ai/cache` · `GET /api/ai/cache/list` |
| 1.4.16 | Geração em cadeia (generateAll) | Summary → questions → flashcards → mindmap em paralelo (Promise.allSettled). Cache chain em `_chainCache` (cap 100). Dedupe in-flight via `_inflight` map. | `meggy-cache.js` |
| 1.4.17 | Resumo de aula (summary) | Markdown com `##` títulos, bullets, **Pegadinhas de Prova**. Botões Copiar / Ouvir (TTS) / Baixar PDF / Regerar. | `meggy-summaries.js` |
| 1.4.18 | Mindmap (pílulas) | Pílulas de conhecimento geradas a partir do material. | `meggy-summaries.js` |
| 1.4.19 | Questões geradas por IA | 5 questões de múltipla escolha em JSON (statement, options, correct, explanation). | `POST /api/ai` (meggy-questions.js) |
| 1.4.20 | Auto-criar flashcards das questões | Cada questão vira flashcard (frente=pergunta, verso=resposta+explicação). | `meggy-cache.js autoCreateFlashcards` |
| 1.4.21 | Extrair questões de PDF (lista de exercícios) | Regex `/(\d+[\).]\s+)([^?]+\?)/gi` em texto extraído. Cap 20 questões. | `meggy-questions.js extractQuestionsFromText` |
| 1.4.22 | Batalhão (background gen) | Gera resumo+pílulas+questões para TODOS os PDFs de um curso em background via `event.waitUntil`. Responde imediatamente. | `POST /api/ai/battalion` · `GET /api/ai/battalion/status?courseKey=` |
| 1.4.23 | Shared summaries (pool comunitário) | Resumos compartilhados entre todos os usuários (pasta compartilhada `shared_summaries.json`). | `GET/POST /api/ai/shared-summaries` |
| 1.4.24 | Shared flashcards | Flashcards compartilhados por todos os alunos da mesma matéria. | `GET/POST /api/ai/shared-flashcards` |
| 1.4.25 | Correção de redação | IA corrige redação com prompt específico por banca/tipo. Devolve score + markdown. | `POST /api/ai/redacao` |
| 1.4.26 | Salvar redação corrigida | Salva como `.md` na pasta `REDAÇÕES CORRIGIDAS` do usuário no Drive. | `POST /api/ai/essay/save` |
| 1.4.27 | Listar/deletar resumos salvos | UI em aba "Resumos" agrupada por matéria, lendo localStorage + Drive. | `meggy-summaries.js renderResumos` |
| 1.4.28 | Regerar resumo | Invalida cache e re-gera resumo+questões+flashcards. | `meggy-cache.js regenerate` |
| 1.4.29 | TTS do resumo | Botão "Ouvir" usa Web Speech API para narrar o resumo. | `meggy-summaries.js` |
| 1.4.30 | Track questões respondidas | `localStorage['gdi-answered-questions-v1']` (cap 500) evita repetir questões. | `meggy-questions.js` |
| 1.4.31 | Salvar resumo no Drive | `GDIStorage.saveMaterial(courseKey, lessonName, 'resumos', summary)` — sobrevive a logout/outros dispositivos. | `storage.js saveMaterial` |
| 1.4.32 | Salvar questões em pasta de disciplina | Scanner Distribuído: salva questões na subpasta da disciplina. | `POST /api/materials/save-in-folder` |
| 1.4.33 | Sugerir resumo ao trocar de aula | `__gdiMeggySuggest('Quer um resumo desta aula? 🐩', cb)` ao receber `video:switched`. | `meggy-widget.js` |

**Funciona offline?** Parcialmente — cache ISA (resumos/questões/flashcards) fica em
localStorage e pode ser consultado offline. **Geração nova de IA requer internet.**
O fallback `ai.languageModel` (Chrome built-in AI) só funciona em Chrome/Edge 127+ com
hardware suficiente — no Tauri 2.0 com WebView2 Edge, é viável.

---

### 1.5 Área do Aluno (14 abas — `TAB_GROUPS` em `study-panel.js:371-394`)

**KNOWN_TABS** (linha 1780): `['home','drives','questoes','simulado','addmateria','resumos','provas','redacao','cronograma','stats','radar','achievements','apps']`
(+ `plano` adicionado em v1.0.139 — totaliza **14 abas**)

#### Grupo 1 — Sem label (top)

| # | Aba | Função render | Detalhe |
|---|---|---|---|
| 1.5.1 | 🏠 **Início** (home) | `renderHome(body)` | Dashboard com continue-card, drives exploráveis, achievements, onboarding. Chama `collectCourses()` + `syncCoursesFromDrive()`. |
| 1.5.2 | 📅 **Plano** (plano) | `window.__gdiStudy.plan.renderAll(body)` | Plano de estudo adaptativo: meta (concurso/vestibular/OAB), data da prova, horas/dia → geração semanal server-side. |
| 1.5.3 | ☁️ **Explorar Drives** (drives) | `renderDrives(body)` | Grid dos 12 drives como cards navegáveis (ícone/cor por disciplina). |

#### Grupo 2 — Praticar

| # | Aba | Função render | Detalhe |
|---|---|---|---|
| 1.5.4 | 📝 **Questões** (questoes) | `window.__gdiStudy.questions.renderQuestoes(body)` | Banco de questões em localStorage `gdi-questions-v1`, SRS tipo Leitner (5 boxes, intervalos `[1,3,7,21,60]` dias). Gera novas via `/api/ai`. |
| 1.5.5 | ⏱️ **Simulado** (simulado) | `window.__gdiStudy.questions.renderSimulado(body)` | Modo cronometrado de questões; usa o mesmo banco. Limpa timer ao trocar de aba (`body.__simTimer`). |

#### Grupo 3 — Materiais

| # | Aba | Função render | Detalhe |
|---|---|---|---|
| 1.5.6 | 📚 **Adicionar matéria** (addmateria) | `showAddCourseModal(body)` (via `window.__gdiStudy.courses`) | Modal para adicionar curso do Drive ao painel do aluno. |
| 1.5.7 | 📋 **Resumos** (resumos) | `window.renderResumos(body)` | Lista resumos salvos (localStorage + Drive via `GDIStorage.listMaterials`). Botões Ver/PDF/Deletar. |
| 1.5.8 | 📄 **Provas** (provas) | `window.renderProvas(body)` | Provas anteriores com planos de estudo. Paginação 12/page. `analyzeProva` via `/api/ai`. |
| 1.5.9 | ✍️ **Redação** (redacao) | `window.renderRedacao(body)` | Upload de redação (FormData) → correção por IA. Salva em `REDAÇÕES CORRIGIDAS`. |

#### Grupo 4 — Planejar

| # | Aba | Função render | Detalhe |
|---|---|---|---|
| 1.5.10 | 📅 **Cronograma** (cronograma) | `window.__gdiStudy.questions.renderCronograma(body)` | Cronograma de revisões baseado no SRS (datas dos próximos cards a revisar). |
| 1.5.11 | 📊 **Estatísticas** (stats) | `renderStats(body)` | Dashboard: minutos/dia, streak, heatmap (GitHub-style), matérias mais estudadas. Via `/api/analytics/summary`. |
| 1.5.12 | 🎯 **Mapa de Fracos** (radar) | `window.renderRadar(body)` | Radar de matérias com base no caderno de erros. Cross-module via `window._qFilterSubject`. |
| 1.5.13 | 🏆 **Conquistas** (achievements) | `renderAchievements(body)` | Gamificação via `gdiAchievements` (badges, trilhas). |
| 1.5.14 | 📱 **Apps** (apps) | `renderApps(body)` | Cards de download: Android (APK v2.7.2), Windows/Linux (Tauri 2.0 — .msi v1.3.1 / .AppImage), Roku (ZIP v1.0.2), BiBi Fit (Android TV). |

**Header comum a todas as abas:**
- Stats: streak 🔥, tempo estudado hoje / meta, cards para revisar.
- Input `gdi-goal-set` (minutos/dia, min 10 max 480).
- Botão "🐩 Meggy" (abre AI widget se disponível).
- Botão ✕ (fecha painel).

**Funciona offline?** Parcialmente — todas as abas podem renderizar com dados em cache
(localStorage + Cache Storage API). Geração de novas questões/resumos requer internet.

---

### 1.6 Scanner (scan-progress, scan-and-save, distributed)

| # | Feature | Detalhe técnico | Endpoint / fonte |
|---|---|---|---|
| 1.6.1 | Scanner incremental em background | `study-scanner.js` (1 001 linhas). Estado em `localStorage['gdi-course-scan-<courseKey>']` + `['gdi-course-lessons-<courseKey>']`. LRU eviction quando quota estoura. | `study-scanner.js` |
| 1.6.2 | Resume scans interrompidos | `resumeInterruptedScans()` — retoma de onde parou ao reabrir a Área do Aluno. | `study-scanner.js` |
| 1.6.3 | Parâmetros de scan | `SCAN_PAUSE_MS=500`, `SCAN_BATCH=1`, `SCAN_MAX_DEPTH=3` — leve para não saturar Drive API. | `study-scanner.js` |
| 1.6.4 | Scanner distribuído (server-side) | Backfill via dotfiles `.gdi-lessons.json` / `.gdi-scan-state.json` em cada pasta do Drive. Mirror em `.meggy.ai/mirror/<courseHash>/`. | `POST /api/courses/scan-progress` · `POST /api/courses/scan-and-save` · `GET /api/courses/distributed-status?coursePath=` |
| 1.6.5 | Rescan forçado | Re-escaneia um curso completo. | `POST /api/courses/rescan` |
| 1.6.6 | Validar course path | Verifica se path existe no Drive. | `GET /api/courses/validate?coursePath=` |
| 1.6.7 | Debug de scan | Estado interno do scan para diagnóstico. | `GET /api/courses/scan-debug?coursePath=` |
| 1.6.8 | Anti-scan-duplicado | `_inflightScans` Set previne scans concorrentes do mesmo curso. | `study-scanner.js` |
| 1.6.9 | Contador de subrequests | `counter.value` respeita limite de 50 subrequests do CF Worker — retorna partial result para continuar no próximo batch. | `gdiScanDistributed` (worker.js:3996) |
| 1.6.10 | Dotfile atomic upsert | `gdiWriteFolderDotfile(gd, folderId, fileName, jsonStr)` — busca fileId existente; se existe, atualiza; senão, cria. Mutex via `withGeneralCoursesLock`. | worker.js L3857 |
| 1.6.11 | Limpeza de cursos órfãos | `cleanupOrphanCourses` — remove cursos que sumiram do histórico. | `study-scanner.js` |

**Funciona offline?** Não — todo scan exige Drive API. Pode-se exibir cache local do
último scan bem-sucedido em modo offline.

---

### 1.7 D1 (busca de lessons, summaries, flashcards)

| # | Feature | Detalhe técnico | Endpoint / fonte |
|---|---|---|---|
| 1.7.1 | Status do D1 | Verifica binding `MEGGY_D1` disponível. | `GET /api/d1/status` |
| 1.7.2 | Schema auto-create | `d1EnsureSchema()` cria tabelas `lessons`, `summaries`, `flashcards`, `backfill_progress` se não existirem (idempotente). | worker.js L1097 |
| 1.7.3 | Buscar lessons (texto) | Full-text search na tabela `lessons`. | `GET /api/d1/lessons/search?q=` |
| 1.7.4 | Listar lessons por curso | Filtra por `courseKey`. | `GET /api/d1/lessons/by-course?courseKey=` |
| 1.7.5 | Buscar summaries | Full-text search em resumos salvos. | `GET /api/d1/summaries/search?q=` |
| 1.7.6 | Buscar flashcards | Full-text search em flashcards compartilhados. | `GET /api/d1/flashcards/search?q=` |
| 1.7.7 | Backfill manual | Reprocessa todos os cursos e popula D1. | `POST /api/d1/backfill` |
| 1.7.8 | Backfill de lessons | Apenas tabela `lessons`. | `POST /api/d1/backfill-lessons` |
| 1.7.9 | Cron backfill manual | Trigger manual do job de 6h. | `POST /api/d1/cron-backfill` |
| 1.7.10 | Progresso do cron | Estado atual do backfill (current course, %, ETA). | `GET /api/d1/cron-progress` |
| 1.7.11 | Cron automático | `scheduled(event, env, ctx)` roda `handleCronBackfill` a cada 6h via `[triggers] crons` no `wrangler.toml`. | worker.js (entrypoints) |

**Funciona offline?** Não — D1 é server-side. Em cache local pode-se espelhar resultados
da última busca para consulta offline.

---

### 1.8 Materiais (save, load, meta, exists)

| # | Feature | Detalhe técnico | Endpoint / fonte |
|---|---|---|---|
| 1.8.1 | Salvar material centralizado | Salva JSON como arquivo na pasta do usuário (não in-folder). | `POST /api/materials/save` |
| 1.8.2 | Listar materiais | Lista por kind (resumos/lessons/etc.) e course. | `GET /api/materials/list?kind=&course=` |
| 1.8.3 | Verificar existência | Evita duplicar material. | `GET /api/materials/exists?fileName=&kind=` |
| 1.8.4 | Salvar em pasta (dotfile in-folder) | Salva `.meggy.<kind>.json` dentro da pasta da aula no Drive. | `POST /api/materials/save-in-folder` |
| 1.8.5 | Carregar de pasta (dotfile) | Lê `.meggy.<kind>.json` da pasta da aula. | `GET /api/materials/load-from-folder?lessonPath=&materialType=` |
| 1.8.6 | Verificar existência em pasta | Checa se dotfile já existe antes de gerar. | `GET /api/materials/check-exists?lessonPath=&materialType=&fileName=` |
| 1.8.7 | Metadados de material | Get/Save/Delete de meta (autor, data, versão). | `GET/POST/DELETE /api/materials/meta?lessonPath=&materialType=` |
| 1.8.8 | Helper `materialFileName` | Gera nome padronizado: `<courseKey>.<kind>.<hash>.md`. | `storage.js` |
| 1.8.9 | Helper `materialExists` / `listMaterials` / `saveMaterial` | Wrappers do storage.js com memoização LRU 200 + dedupe in-flight + Cache Storage API. | `storage.js` (`window.GDIStorage.*`) |
| 1.8.10 | Resolver lesson parent folder | `_resolveLessonParentFolder` — encontra pasta pai de um lesson path. | worker.js |
| 1.8.11 | Ler/escrever meta file | `_readMetaFile` / `_writeMetaFile` — operações de metadados em dotfile. | worker.js |

**Funciona offline?** Não — todas as operações de material exigem Drive API.

---

### 1.9 Outros (shorturl, analytics, study-plan, brain, PWA, etc.)

| # | Feature | Detalhe técnico | Endpoint / fonte |
|---|---|---|---|
| 1.9.1 | Short URL | Gera short id de 6 chars a partir de path; redirect via `/f/<shortId>`. | `POST /api/shorturl/register` · `GET /f/<shortId>` |
| 1.9.2 | Analytics summary | Cálculo matemático (sem IA) de minutos/dia, streak, dias ativos. | `GET /api/analytics/summary` |
| 1.9.3 | Study plan — carregar | Carrega plano salvo do usuário. | `GET /api/study-plan/load` |
| 1.9.4 | Study plan — gerar | IA gera plano semanal baseado em cursos + fraquezas + SRS + meta/dataDaProva. | `POST /api/study-plan/generate` |
| 1.9.5 | Study plan — salvar | Persiste plano gerado no Drive do usuário. | `POST /api/study-plan/save` |
| 1.9.6 | Brain (anotações persistentes) | "Brain" do usuário — arquivo `brain.json` na pasta do Drive. | `GET /api/brain/list?q=` · `POST /api/brain/save` |
| 1.9.7 | Notificações in-app | Badges/lembretes ao abrir Área do Aluno (flashcards vencidos, streak em risco, meta não atingida, sem atividade na semana). | `study-notifications.js checkAndShow` |
| 1.9.8 | Busca nas notas | Itera `GDIUser.dump().notes` por keyword. | `study-notifications.js searchNotes` |
| 1.9.9 | Gamificação (achievements + trails) | `gdiAchievements` + `gdiTrails` — badges e trilhas de estudo. | `gdi-core.js` |
| 1.9.10 | Tema visual (BlackTie / Ferreto) | Tokens CSS `--ferreto-*` dark/light, fontes Google (Poppins/Rubik/Inter). Persistido em `localStorage['gdi-theme']`. | `study-theme.js` |
| 1.9.11 | SRS algorithm (SM-2) | `gdiGradeCard(card, quality)` — algoritmo SM-2 clássico. Intervalos `[1,3,7,21,60]` dias. | `gdi-core.js` |
| 1.9.12 | SRS Leitner (5 boxes) | Banco de questões usa Leitner paralelo ao SM-2 dos flashcards. | `study-questions.js` |
| 1.9.13 | PWA best-effort (M16) | Sem service worker real — apenas meta tags. | `gdi-ui.js` M16 |
| 1.9.14 | Service Worker (cache de mídia) | `GDI_SW` template — caches media files, LRU eviction, range requests. | `GET /sw.js` |
| 1.9.15 | User state save | Persiste estado do player/anotações/SRS no Drive do usuário. | `POST /userstate/save` |
| 1.9.16 | User state get | Carrega estado salvo ao fazer login. | `GET /userstate` |
| 1.9.17 | PDF viewer (com M9 panel) | Não usa canvas/pdf.js nativo — delega para painel M9 (Meggy) à direita. Modo "foco no material" oculta painel esquerdo. | `gdi-pdf.js file_pdf/file_markdown` |
| 1.9.18 | Sanitize HTML (DOMPurify) | `gdiSanitize(html)` — lazy-load DOMPurify para sanitizar Markdown renderizado. | `gdi-core.js` |
| 1.9.19 | Modal customizado | `gdiModal(opts)` retorna `Promise<boolean>`. Ferreto-styled. | `gdi-core.js` |
| 1.9.20 | Toast notifications | `showToast(msg)` — feedback visual de ações. | `app.min.js` |
| 1.9.21 | Cache versioning | `window.CACHE_VERSION = '180'` no loader; worker injeta `?v=14` cache-buster em `app.min.js`. | `gdi-extras-loader.js` |

**Funciona offline?** Quase tudo offline-friendly (analytics, brain, study plan, notas,
achievements, tema, SRS são cálculos client-side ou cache local).

---

## 2. APIs necessárias (endpoints que o app Windows vai chamar)

> Total: **70+ endpoints** (métodos únicos). OPTIONS preflight implícito em todos os POST/GET.

### 2.1 Páginas / HTML (provavelmente **NÃO** usados no app nativo — substituir por UI Rust)

| Método | Path | Uso |
|---|---|---|
| GET | `/` | Home da SPA |
| GET | `/?driveid=<id>` | Deep-link por ID |
| GET | `/login` | Página login |
| GET | `/fallback` | Página estática |
| GET | `/<n>:/` | Browse drive root |
| GET | `/<n>:/<path>` | Browse pasta |
| GET | `/<n>:/<file>` | Download/stream arquivo |
| GET | `/admin` | Painel professor |
| GET | `/sw.js` | Service Worker (cache mídia) |

### 2.2 Autenticação

| Método | Path | Uso |
|---|---|---|
| POST | `/login` | Login form (usuário+senha) |
| POST | `/signup` | Signup form |
| GET | `/google_callback` | OAuth callback |
| GET | `/logout` | Limpa sessão |
| GET | `/userstate` | Carrega estado do usuário |
| POST | `/userstate/save` | Salva estado do usuário |

### 2.3 Drive (navegação, busca, download)

| Método | Path | Uso |
|---|---|---|
| POST | `/<path>` | Listar pasta (paginação) |
| POST | `/<n>:search` | Busca em drive |
| POST | `/<n>:id2path` | Resolver ID → path |
| GET | `/<n>:findpath?id=` | Find path by ID |
| POST | `/<n>:fallback` | Fallback listing |
| GET | `/<n>:quota` | Quota do Drive |
| GET | `/download.aspx?file=&expiry=&mac=` | Download signed URL (Range support) |
| POST | `/copy` | Copiar arquivo Drive |

### 2.4 AI (chat, ISA, OCR, coach, redação, batalhão)

| Método | Path | Uso |
|---|---|---|
| POST | `/api/ai` | AI unificada (racer) |
| POST | `/api/ai/stream` | AI streaming SSE |
| POST | `/api/ai/ocr` | OCR de PDF |
| GET | `/api/ai/models` | Lista backends |
| GET | `/api/ai/discover` | Descobre modelos NVIDIA |
| GET | `/api/ai/stats` | Contadores AI |
| GET | `/api/ai/status` | Saúde backends |
| GET | `/api/ai/test?provider=&model=` | Testa backend |
| GET / POST / HEAD | `/api/ai/summaries` | Cache ISA summaries |
| GET / POST | `/api/ai/cache` | Cache ISA (alt) |
| GET | `/api/ai/cache/list` | Lista chaves cache |
| GET / POST | `/api/ai/shared-summaries` | Pool comunitário resumos |
| GET / POST | `/api/ai/shared-flashcards` | Pool comunitário flashcards |
| POST | `/api/ai/redacao` | Correção de redação |
| POST | `/api/ai/essay/save` | Salvar redação corrigida |
| POST | `/api/ai/battalion` | Disparar batalhão |
| GET | `/api/ai/battalion/status?courseKey=` | Status batalhão |
| POST | `/api/ai/coach` | Meggy Coach (recomendações) |

### 2.5 Courses (CRUD, scan, progress)

| Método | Path | Uso |
|---|---|---|
| POST | `/api/courses/add` | Adicionar curso |
| POST | `/api/courses/remove` | Remover curso |
| GET | `/api/courses/list` | Listar cursos |
| POST | `/api/courses/scan-progress` | Scanner distribuído |
| POST | `/api/courses/scan-and-save` | Scan + persistência |
| GET | `/api/courses/distributed-status?coursePath=` | Status distribuído |
| POST | `/api/courses/rescan` | Re-scan forçado |
| GET | `/api/courses/validate?coursePath=` | Validar path |
| GET | `/api/courses/scan-debug?coursePath=` | Debug scan |
| POST / GET | `/api/courses/user-progress` | Progresso do usuário |
| POST / GET | `/api/courses/shared-progress` | Progresso compartilhado |

### 2.6 Materials (centralizado + dotfile in-folder)

| Método | Path | Uso |
|---|---|---|
| GET | `/api/materials/list?kind=&course=` | Listar materiais |
| POST | `/api/materials/save` | Salvar material |
| GET | `/api/materials/exists?fileName=&kind=` | Verificar existência |
| POST | `/api/materials/save-in-folder` | Salvar dotfile in-folder |
| GET | `/api/materials/load-from-folder?lessonPath=&materialType=` | Carregar dotfile |
| GET | `/api/materials/check-exists?lessonPath=&materialType=&fileName=` | Verificar dotfile |
| GET / POST / DELETE | `/api/materials/meta?lessonPath=&materialType=` | Metadados |

### 2.7 D1 (busca global)

| Método | Path | Uso |
|---|---|---|
| GET | `/api/d1/status` | Status D1 |
| GET | `/api/d1/lessons/search?q=` | Buscar lessons |
| GET | `/api/d1/lessons/by-course?courseKey=` | Lessons por curso |
| GET | `/api/d1/summaries/search?q=` | Buscar summaries |
| GET | `/api/d1/flashcards/search?q=` | Buscar flashcards |
| POST | `/api/d1/backfill` | Backfill completo |
| POST | `/api/d1/backfill-lessons` | Backfill lessons |
| POST | `/api/d1/cron-backfill` | Trigger cron manual |
| GET | `/api/d1/cron-progress` | Progresso cron |

### 2.8 Misc (analytics, study-plan, brain, shorturl)

| Método | Path | Uso |
|---|---|---|
| GET | `/api/analytics/summary` | Analytics matemático |
| GET | `/api/study-plan/load` | Carregar plano |
| POST | `/api/study-plan/generate` | Gerar plano (IA) |
| POST | `/api/study-plan/save` | Salvar plano |
| GET | `/api/brain/list?q=` | Listar brain |
| POST | `/api/brain/save` | Salvar brain |
| POST | `/api/shorturl/register` | Gerar short URL |
| GET | `/f/<shortId>` | Redirect short URL |

---

## 3. Features offline (podem funcionar sem internet)

> **Estratégia:** o Tauri 2.0 deve manter um **cache local SQLite/JSON** espelhando
> o `userstate` + `gdi-isa-summaries-v1` + `gdi-questions-v1` + `gdi-course-scan-*`
> do browser. Em modo offline, o app lê esse cache e marca visualmente "Modo Offline".

### 3.1 100% offline (sem rede)

| Feature | Origem dos dados |
|---|---|
| Reproduzir vídeos baixados (download explícito) | Cache local Tauri (substituto do Service Worker) |
| Visualizar resumos salvos | `localStorage['gdi-isa-summaries-v1']` → espelhar em SQLite |
| Estudar flashcards (sessão SRS) | `localStorage['gdi-cards']` + algoritmo SM-2 (`gdiGradeCard`) |
| Resolver questões do banco local | `localStorage['gdi-questions-v1']` |
| Cronômetro / Pomodoro | Client-side puro |
| Anotações no player (M5) | `GDIUser.notes` em userstate (cached) |
| Modos de foco / sleep mode | Client-side puro |
| Mapa de Fracos (radar) | Calculado do caderno de erros local |
| Estatísticas básicas (streak, minutos) | Calculado do userstate local |
| Gamificação (achievements) | `gdiAchievements` client-side |
| Tema visual | `localStorage['gdi-theme']` |
| Atalhos de teclado do player | Client-side puro |
| Busca nas próprias notas | `GDIUser.dump().notes` local |
| Notificações in-app (flashcards vencidos) | Calculado do SRS local |
| **Meggy Chat (fallback)** | Chrome Prompt API / Gemini Nano via WebView2 (Edge 127+) — `ai.languageModel` |

### 3.2 Cache-and-fail-gracefully (offline mostra última versão cached)

| Feature | Estratégia |
|---|---|
| Listagem de drives / pastas | Cache Storage API `gdi-folders-v1` (LRU 50 / 5min) |
| Listagem de cursos | localStorage de cursos sincronizados |
| Continuar de onde parou (resume) | userstate cached |
| Status do batalhão | Última resposta cached |
| Lessons/summaries/flashcards search | Último resultado cached por query |

### 3.3 Requer internet obrigatoriamente

- Login / signup / OAuth (validação server-side)
- Nova geração de IA (resumo/questões/flashcards/coach/redação)
- Scanner de curso (Drive API)
- Download de novos vídeos (signed URLs precisam de HMAC server-side)
- Operações de material (save/load/exists no Drive)
- D1 search (server-side)
- Cron backfill

---

## 4. Features que PRECISAM de webview (Tauri WebView2)

> **Recomendação geral:** Tauri 2.0 já usa WebView2 (Chromium/Edge) por padrão no
> Windows — pode-se tirar proveito disso para as features abaixo sem recorrer a
> webview "extra". Apenas as que dependem de APIs JS sem equivalente Rust devem
> ficar explicitamente delegadas.

### 4.1 Renderização de PDF (visualizador)

- **Motivo:** `gdi-pdf.js` (118 linhas) + `meggy-pdf-engine.js` (510 linhas) usam
  `pdfjs-dist@3.11.174` + `Tesseract.js@5` (CDN jsDelivr) para extrair texto/renderizar.
- **Solução no Tauri:** usar `pdf.js` carregado dentro da WebView2 OU migrar para
  crate Rust `pdfium-render` / `lopdf` para extração nativa. **Para visualização**,
  webview é mais simples.
- **Hard caps do código atual:** 30 páginas, 50K chars, 60s timeout. Replicar no app.

### 4.2 OCR de PDFs escaneados

- **Motivo:** Tesseract.js (DESATIVADO em v1.0.152 — bloqueia thread 5+ min) +
  fallback CF Workers AI vision (`/api/ai/ocr`). Worker `meggy-pdf-worker.js`
  (OffscreenCanvas) faz OCR sem bloquear.
- **Solução no Tauri:** chamar `/api/ai/ocr` (server-side) como via primária — não
  precisa de webview. Se quiser OCR local: crate `tesseract-rs` ou `rusty-tesseract`
  (binding ao binário C++).

### 4.3 Impressão de resumos (downloadAsPdf)

- **Motivo:** `meggy-cache.js downloadAsPdf` usa `window.print()` — abre dialog do
  browser. **Não gera PDF real**, só imprime HTML.
- **Solução no Tauri:** usar `window.print()` da WebView2 OU migrar para crate
  `printpdf` / `wkhtmltopdf` para gerar PDF real do markdown (melhor UX).

### 4.4 Service Worker (cache de mídia)

- **Motivo:** `GDI_SW` (115 linhas) implementa `fillMediaCache`, `rangeFromCache`,
  LRU eviction via Service Worker API. Não existe fora de browser.
- **Solução no Tauri:** substituir por **HTTP cache layer nativo** em Rust
  (reqwest + cache LRU em disco). Implementar download offline explícito + range
  requests via `reqwest::Range`. **Não usar webview para isso.**

### 4.5 AI Chat fallback (Gemini Nano / Chrome Prompt API)

- **Motivo:** `meggy-widget.js` tenta `ai.languageModel` (Chrome built-in AI) antes
  de `/api/ai/stream`. Funciona apenas em Chrome/Edge 127+ com hardware suficiente.
- **Solução no Tauri:** WebView2 (Edge) suporta essa API — usar dentro da webview
  para o chat. OU integrar modelo local via `llm` crate (GGUF, llama.cpp bindings).

### 4.6 Markdown rendering (gdiSanitize + marked)

- **Motivo:** `gdiSanitize(html)` lazy-loads DOMPurify; `marked` renderiza Markdown.
  Ambos são libs JS.
- **Solução no Tauri:** usar `pulldown-cmark` (Rust) para renderizar Markdown → HTML
  seguro. Ou manter `marked` + `DOMPurify` rodando dentro da WebView2 (mais simples).
  **Recomendado:** WebView2 para preservar compat visual com a versão web.

### 4.7 Player de vídeo (HTML5 video)

- **Motivo:** todo o stack de player (plyr/videojs/dplayer/jwplayer/shaka/native)
  opera sobre `<video>` HTML5 + Media Source Extensions.
- **Solução no Tauri:** duas opções:
  1. **WebView2 + `<video>`** (mais simples, reutiliza CSS/JS atual) — recomendado.
  2. **Player Rust nativo** com `mpv`/`gst` — mais trabalho, melhor performance offline.
- Atalhos de teclado, sleep timer, pomodoro, anotações — todos funcionam em ambos.

### 4.8 Resumo: o que fica "na webview" vs "no Rust"

| Camada | Recomendação |
|---|---|
| **UI / tema / layout** | Rust + framework (eg. `egui`, `tauri-controls`, `slint`) OU HTML/CSS dentro da WebView2 (reaproveita o design Ferreto atual) |
| **Player de vídeo** | WebView2 + `<video>` (reutilizar `gdi-player-enhancer.js`) |
| **PDF viewer** | WebView2 + `pdf.js` |
| **OCR** | Server-side `/api/ai/ocr` (não precisa de webview) |
| **Markdown rendering** | WebView2 + `marked` + `DOMPurify` (preserva look atual) |
| **HTTP client (tudo `/api/*`)** | Rust `reqwest` (mais robusto, com timeouts e retry) |
| **Cache local** | Rust SQLite (`rusqlite`) — substitui localStorage |
| **Auth / cookies** | Rust (gerenciar cookie `session` no `reqwest::Client`) |
| **AI Chat widget** | WebView2 (precisa de `ai.languageModel` ou SSE reader) |
| **Service Worker / cache de mídia** | Rust (reqwest + cache LRU em disco) |
| **Download offline de vídeos** | Rust (stream + salvar em `%LOCALAPPDATA%/Meggy/cache/`) |
| **Auto-update** | Tauri built-in (`tauri-plugin-updater`) |
| **Atalhos globais** | Tauri `tauri-plugin-global-shortcut` |
| **Multi-janela** | Tauri nativo (já referenciado em `study-panel.js:577`) |
| **TTS (text-to-speech)** | Rust `tts` crate (cross-platform) ou WebView2 SpeechSynthesis |

---

## 5. Considerações de segurança para o app nativo

> ⚠️ **Crítico** — o `worker.js` contém **secrets hardcoded** (chaves privadas de Service
> Account Google, `client_secret`, `refresh_token`, hashes de senhas, fallbacks de
> `crypto_base_key`/`hmac_base_key`). O cabeçalho do worker já documenta migração para
> `wrangler secret put`. O app Windows **NÃO deve incluir esses secrets** — apenas
> chamar os endpoints.

| Risco | Mitigação no app Windows |
|---|---|
| Senhas de drive em localStorage (XOR fraco) | Migrar para **Windows Credential Manager** via Tauri plugin |
| Cookie `session` em texto (AES-CBC sem HMAC) | Armazenar no **Keychain** do Windows; nunca em arquivo plaintext |
| Cache Storage API não limpa em logout | Implementar clear de cache local Rust no logout |
| Caches module-level vazam entre usuários | Reinicializar estado Rust no `auth:change → 'out'` |
| `checkintegrity` usa string compare (timing attack) | Server-side — sem ação no app |
| Token de acesso Drive em module-scoped `authConfig.accessToken` | Server-side — sem ação no app |
| CORS permissivo (`*`) | App nativo não usa CORS — ganho de segurança |

---

## 6. Próximas ações sugeridas (sem alterar código)

1. **Spike Tauri 2.0** — protótipo com janela única carregando `https://educa.eu.org`
   em WebView2 + injecting Rust bridge para atalhos globais, auto-update e download
   offline. Validar 14 abas + player.
2. **Migrar camada HTTP para Rust** — substituir `fetch()` por `reqwest` com timeouts
   (30s padrão, 10s para `scan-progress`), retry em 429/503 (3×, 1s delay) e cache LRU.
3. **Implementar download offline** — botão "Baixar aula" no contexto do vídeo →
   stream via Range requests → salvar em `%LOCALAPPDATA%/Meggy/cache/<courseKey>/<fileId>.mp4`.
4. **Persistência SQLite local** — espelhar `userstate` + `gdi-isa-summaries-v1` +
   `gdi-questions-v1` + `gdi-cards` em SQLite para consulta offline instantânea.
5. **Login offline-aware** — manter última sessão válida em Keychain; reabrir app sem
   internet = modo leitura (sem writes, banner "Modo Offline").
6. **AI Chat com modelo local** — avaliar `llm` crate (GGUF/Llama.cpp) como fallback
   além do `ai.languageModel` da WebView2.
7. **Service Worker → Rust HTTP cache** — substituir `GDI_SW` por middleware reqwest
   com cache LRU em disco (cap configurável, default 2GB).
8. **Multi-janela** — já referenciado em `study-panel.js:577` ("Multi-janela + atalhos
   globais"). Usar `tauri::WindowBuilder` para abrir Área do Aluno + Player em janelas
   separadas (igual Discord/Spotify).
9. **Auto-update** — `tauri-plugin-updater` apontando para GitHub Releases do repo
   `esaaraujo-lab/student_gdi` (já usado para .msi v1.3.1).
10. **Testes de regressão** — criar bateria de testes para os endpoints críticos:
    `/login`, `/api/ai`, `/api/courses/scan-progress`, `/api/courses/rescan`,
    `/api/materials/meta`, `/api/d1/cron-backfill`.

---

## 7. Apêndice — Mapeamento de abas → módulos frontend

| Aba | Render function | Arquivo do módulo | Linhas |
|---|---|---|---|
| home | `renderHome` | `study-panel.js` | 877+ |
| plano | `window.__gdiStudy.plan.renderAll` | `study-plan.js` | 269 |
| drives | `renderDrives` + `browseDriveInPanel` | `study-panel.js` | 722-770 |
| questoes | `window.__gdiStudy.questions.renderQuestoes` | `study-questions.js` | 941 |
| simulado | `window.__gdiStudy.questions.renderSimulado` | `study-questions.js` | — |
| addmateria | `showAddCourseModal` | `study-courses.js` | 2 229 |
| resumos | `window.renderResumos` | `meggy-summaries.js` | 805 |
| provas | `window.renderProvas` | `study-advanced.js` | 545 |
| redacao | `window.renderRedacao` | `study-advanced.js` | — |
| cronograma | `window.__gdiStudy.questions.renderCronograma` | `study-questions.js` | — |
| stats | `renderStats` + insights | `study-panel.js` + `study-insights.js` | 443 |
| radar | `window.renderRadar` | `study-advanced.js` | — |
| achievements | `renderAchievements` | `study-panel.js` | — |
| apps | `renderApps` | `study-panel.js` | 531-643 |

---

## 8. Apêndice — APIs `window.*` críticas que o app deve reproduzir

### 8.1 `window.gdiIsaPdf` (15+ métodos — montado em `meggy-summaries.js:2377`)

```js
window.gdiIsaPdf = {
  summary, questions, mindmap, flashcards, regenerate,
  extractPdfText, saveIsaSummary, listIsaSummaries, delIsaSummary,
  downloadAsPdf, fetchSharedQuestions, fetchSharedSummaries,
  saveSharedSummary, saveEssayMD, startBattalion, getBattalionStatus,
  showResumoIA
}
```

### 8.2 `window.__gdiStudy` (namespaces por módulo)

```js
window.__gdiStudy = {
  state: { panel, tab, currentTab, FC },
  panel: { openPanel, closePanel, renderPanel, renderBody, renderHome,
           renderDrives, renderAchievements, renderStats, showOnboarding,
           injectNavButton, scheduleNavInject },
  scanner: { startScan, getScanState, setScanState, setLessons, getLessons,
             autoScanPending, scanCourseLessons, cleanupOrphanCourses,
             scanCourse, getScanProgress, getCourseLessons, countWatched,
             clearScanState, resumeInterruptedScans, getDistributedStatus,
             rescanCourse, validateCoursePath },
  courses: { collectCourses, gdiAddCourseFromDrive, syncCoursesFromDrive,
             renderCursos, gdiRefreshCentralPanel, showAddCourseModal,
             showHiddenCoursesModal, openCourseDetail, bestIn, realName,
             cleanCourseName, courseName, driveNameOf, hideCourse, unhideCourse,
             stateD, ensureState, low, norm, dec, esc, lsGet, lsSet },
  questions: { renderQuestoes, renderSimulado, renderCronograma, renderRevisoes },
  advanced: { renderProvas, renderRedacao, renderRadar, analyzeProva },
  insights: { fetchAnalytics, fetchCoach, renderDashboard, renderCoach, renderHeatmap },
  plan: { renderAll, renderSetup, renderPlan, generatePlan, savePlan, fetchPlan },
  notifications: { checkAndShow, init, searchNotes, renderSearchUI },
  legacy: { renderFlash, studyFlash, renderMarathon, renderSubjects,
            editSubject, renderTrails, editTrail },  // STUBS — abas removidas
  playerGuard: { STALL_MS, FIRST_PLAY_HINT_MS, attach },
  theme: { installed, sanitizeThemeValue, sanitizeHexColor }
}
```

### 8.3 `window.__gdiMeggy` (namespaces por módulo)

```js
window.__gdiMeggy = {
  utils: { esc, lsGet, lsSet, uid, parseJsonArray, renderMd,
           setLoading, setError, lessonKey, realLessonName,
           callIsa, callIsaKeyed, CONSTS },
  pdf: { gdiEnsurePdfjs, ensurePdfjs, ensureTesseract, ocrPdfPage,
         getFileType, extractTextFile, extractPdfText, ocrPageWithAI,
         getCfAI, setAiOcrConfig, useAiOcr, aiOcrConfig },
  cache: { generateAll, regenerate, cacheGet, cacheGetRobust, cacheSave,
           cacheGetMeta, cacheSaveMeta, invalidateCacheMeta,
           loadMaterialFromFolder, materialExistsInFolder,
           materialAuthorFromFileName, deriveCourseHash,
           addQ, addQBatch, saveIsaSummary, listIsaSummaries, delIsaSummary,
           downloadAsPdf, copySummary, autoCreateFlashcards },
  questions: { questions, generateQuestions, startQuizFromBank, runQuizSession,
               extractQuestionsFromText, getAnsweredIds, markAnswered,
               saveQuestionsToDisciplineFolder, loadQuestionsFromDisciplineFolder },
  flashcards: { flashcards, renderThemeCardsPaginated, runFlashcardSession,
                extractDisciplineTheme, normPath, stripExt,
                getSubjects, saveSubject, deleteSubject },
  summaries: { summary, mindmap, renderSummaryCard, _summaryModal,
               renderResumos, fetchSharedQuestions, saveEssayMD,
               startBattalion, getBattalionStatus, saveSharedSummary,
               fetchSharedSummaries, saveSummaryToLessonFolder,
               loadSummaryFromLessonFolder },
  widget: { open, close, toggle, send, renderHistory, updateStatus,
            addMsg, hideWidget, showWidget, checkServerStatus,
            serverLabel, __gdiMeggySuggest }
}
```

### 8.4 Helpers globais

```js
window.GDIStorage   // storage.js — fetch wrapper /api/* com memo LRU 200
window.GDIUser      // app.min.js — estado do usuário (watched/resume/notes/srs)
window.gdiListAllFiles(path, pw)  // bridge → gdi-list-worker.js
window.gdiGetPw / gdiSetPw        // M1 — senhas de drive (XOR fraco)
window.gdiCourseIdentity(key, name)  // ícone/cor por disciplina
window.gdiGradeCard(card, quality)   // SM-2 SRS algorithm
window.gdiSrsIntervals = [1,3,7,21,60]  // SRS Leitner
window.gdiAchievements / gdiTrails    // gamification
window.gdiModal(opts) → Promise<boolean>
window.gdiSanitize(html)              // DOMPurify lazy-load
window.gdiEnsurePdfjs() → Promise<pdfjsLib>
window.drive_names                    // array com 12 nomes de drives
window.playlistVideos / window.currentIndex  // playlist da aula atual
window.__gdiCurrentTab                // tab ativa (para callbacks de scan)
window.__gdiMeggySuggest(text, cb)    // sugerir ação ao trocar aula
window.showToast(msg)                 // feedback visual
window.Bus                            // event bus (page:change, auth:change, etc.)
```

---

**Fim do documento.** Nenhuma alteração de código foi feita — apenas mapeamento e
documentação para orientar o desenvolvimento do app Windows nativo (Tauri 2.0).
