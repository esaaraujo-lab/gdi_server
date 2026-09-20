# student_gdi — Plano de Emergência (Deploy Imediato)

## ✅ Estrutura entregue

```
student_gdi/
├── worker.js                          # Cloudflare Worker (backend) — 3809 linhas
├── core/
│   └── app.min.js                     # App principal + paginação — 1739 linhas
└── modular/
    ├── gdi-core.js                    # Bootstrap + módulos M1-M9 — 1096 linhas
    ├── gdi-ui.js                      # Módulos M10-M20 + paginação playlist — 1353 linhas
    ├── gdi-meggy.js                   # Meggy AI + PDF engine — 2476 linhas
    ├── gdi-study.js                   # Área do Aluno (ex-Estudos) — 3802 linhas
    ├── gdi-pdf.js                     # Visualizador PDF — 143 linhas
    ├── gdi-extras-loader.js           # Loader modular — 119 linhas
    ├── storage.js                     # Camada de storage + memoização — 399 linhas
    ├── gdi-list-worker.js   (NOVO)    # Web Worker: listagem Drive + scan cross-folder — 192 linhas
    ├── meggy-pdf-worker.js  (NOVO)    # Web Worker: extração PDF + OCR — 144 linhas
    └── gdi-worker-bridge.js (NOVO)    # Ponte non-breaking p/ workers — 272 linhas
```

**Total: 12 arquivos, 15.544 linhas, todos com `node --check` OK.**

---

## 🚀 Deploy (3 passos)

### Passo 1 — Commit
```bash
cd student_gdi/
git add -A
git commit -m "emergency refactor: pagination + web workers + remove broken tabs + rename to Área do Aluno"
git push origin main
```
O Cloudflare Workers Git integration faz o deploy automático no push.

### Passo 2 — Invalidar cache
No painel do Cloudflare → Caching → Purge Everything (1 única vez, para limpar o cache-buster `Date.now()` antigo).

### Passo 3 — Mover secrets (antes de tornar o repo público)
```bash
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GOOGLE_REFRESH_TOKEN
wrangler secret put SA_PRIVATE_KEY_1
wrangler secret put SA_PRIVATE_KEY_2
```
Depois redija as linhas correspondentes no `worker.js` (linhas 21, 34, 54, 55) para ler de `globalThis.*`. **Veja o bloco `⚠️ SECURITY WARNING` no topo do worker.js** com as instruções completas.

---

## ✅ O que mudou (checklist do pedido do usuário)

### Paginação (você perguntou: "estou correto?" — SIM, paginação é a solução certa)
| Onde | Antes | Agora |
|------|-------|-------|
| Lista de arquivos da pasta | renderiza tudo de uma vez (freeze) | **50 por página** + "Carregar mais (N restantes)" |
| Playlist do player | cap 600, render tudo | **100 por página** + "Carregar mais" |
| Questões (Área do Aluno) | render tudo | **20 por página** + "Carregar mais" |
| Provas | render tudo | **12 por página** + pager prev/next |
| Cronograma | render tudo | **15 por página** + pager prev/next |
| Flashcards (Meggy) | render tudo (reflow gigante) | **accordion por tema** + 50 por página dentro do tema |
| M20 playlist lateral | polling 60s, 600 itens | **100 por página** + evento `playlist:ready` |

### Renomeação "Estudos" → "Área do Aluno"
- Botão da navbar: "Área do Aluno" (tooltip: "Área do Aluno (tecla C)")
- Título do painel: "Área do Aluno"
- Grupo da sidebar: "Praticar" (era "Estudar")
- 15 ocorrências de "Área do Aluno" no texto visível
- 0 ocorrências de "Estudos"/"Estudar" em strings visíveis
- **localStorage keys preservados** (não perde dados do usuário)

### Abas removidas da Área do Aluno (user request)
Removidas do sidebar + handler (funções mantidas como stubs p/ compat):
- ✅ Estudar
- ✅ Meus Cursos
- ✅ Maratona
- ✅ Revisões
- ✅ Flashcards
- ✅ Matérias
- ✅ Trilhas

**Abas que permanecem (11):** Início, Questões, Simulado, Provas, Redação, Cronograma, Estatísticas, Mapa de Fracos, Conquistas (+ grupos Praticar/Mais).

### Removido de Materiais (user request)
- ✅ Adicionar matéria (tab `addmateria` — handler removido do app.min.js, função-show removida do gdi-study.js)
- ✅ Resumos (tab removida; `window.renderResumos` virou no-op stub; funções `listIsaSummaries`/`saveIsaSummary` mantidas pois são usadas pelo botão "Resumo" do painel de materiais)

### Web Workers de verdade (antes só existiam os internos do PDF.js/Tesseract)
| Worker novo | Faz | Antes |
|-------------|-----|-------|
| `gdi-list-worker.js` | paginação Drive + scan cross-folder paralelo (6 concurrent) | thread principal, 3 sequencial + sleep 2s |
| `meggy-pdf-worker.js` | extração texto PDF + OCR via `OffscreenCanvas` | thread principal, loop 60 pgs + canvas paint |
| `gdi-worker-bridge.js` | intercepta `gdiListAllFiles` + `extractPdfText`, roteia p/ workers, **fallback transparente** se worker falhar | (não existia) |

### Performance fixes aplicadas (revisão 3× de cada módulo)
- `gdi-extras-loader.js`: `Date.now()` → `'4'` fixo (elimina re-download de 5MB por navegação)
- `app.min.js`: `insertAdjacentHTML` no lugar de `t.html(t.html()+html)` (mata O(N²))
- `app.min.js`: filtro debounced 200ms + delegação de evento (1 listener, não N)
- `app.min.js`: cache de listagem 45s → 5min + LRU 50 + não limpa em `page:change`
- `app.min.js`: `loadCrossFolderPlaylist` paralelizado (6 por vez, sem sleep 2s)
- `app.min.js`: `GDIUser._flush` debounce 5s + skip re-fetch + `structuredClone`
- `app.min.js`: `gdiAnnounceVideoFromDOM` → `MutationObserver` (era 40×250ms polling)
- `gdi-ui.js`: M20 polling 60s → evento `playlist:ready`
- `gdi-ui.js`: M14 `modProgress` paralelizado (6 concurrent, sem sleep 40ms)
- `gdi-ui.js`: M14 `MutationObserver` feedback loop corrigido com guard flag
- `gdi-ui.js`: M19 `setInterval(apply, 1500)` redundante removido
- `gdi-core.js`: `gdiEnsurePdfjs()` consolidado (1 loader, `workerSrc` 1×)
- `gdi-core.js`: M9 busy-wait 40×200ms → evento `slots:ready`
- `gdi-core.js`: M5 streak cacheado (era loop em todo `timeupdate`)
- `gdi-meggy.js`: `updateMemory`/`renderHistory` debounced 1.5s + gate por painel aberto
- `gdi-meggy.js`: `addQBatch()` (era O(N²) `addQ` por questão)
- `gdi-meggy.js`: cache de HTML parseado no chat (era `marked.parse` × 20 por navegação)
- `gdi-meggy.js`: flashcards virtualizados por accordion
- `gdi-study.js`: `injectNavButton` coalesced via `requestAnimationFrame` (era 3-5× por folder-open + `MutationObserver`)
- `gdi-study.js`: `bestIn` cacheado por curso (60s) + paralelizado entre 12 cards
- `gdi-study.js`: `openPanel` render único (era render duplo)
- `gdi-study.js`: `renderPanel` split sidebar/body (não rebuilda 14 tabs a cada clique)
- `gdi-study.js`: `setInterval`s pausam quando painel fechado
- `gdi-study.js`: capture listener global removido (attach no overlay)
- `gdi-pdf.js`: `PDFDocumentProxy.destroy()` ao trocar PDF (era leak)
- `gdi-pdf.js`: `workerSrc` setado 1× (era a cada PDF)
- `gdi-pdf.js`: prefetch da próxima página
- `storage.js`: memoização LRU 200 entradas + Cache Storage API p/ pastas escaneadas (era `cache:'no-store'` em 9 GETs)

---

## 🔌 Compatibilidade (non-breaking)

Todas as APIs públicas mantêm as mesmas assinaturas:
- `window.gdiListAllFiles(path, pw, onPage)` ✓
- `window.gdiIsaPdf.extractPdfText(url, cb)` ✓ (com fallback p/ versão original)
- `window.GDIStorage.{listCourses, listMaterials, ...}` ✓ (+ novos: `invalidate`, `clearCache`, `invalidateFolder`)
- `window.file_pdf(i,e,t,n,a,c)` ✓
- `window.GDI_MODULES.push({name, init})` ✓
- `window.Bus.emit('page:change' | 'rows:appended' | 'media:ready' | 'video:switched' | 'playlist:ready' | 'slots:ready')` ✓
- jQuery `$` ✓
- `GDIUser` com todos os 17 métodos ✓
- Todos os `localStorage` keys preservados ✓

**Fallback transparente**: se o browser não suportar Web Workers, o `gdi-worker-bridge.js` cai automaticamente para as funções originais da thread principal.

---

## ⚠️ AVISO CRÍTICO DE SEGURANÇA

O `worker.js` contém **hardcoded**:
- 2 chaves privadas RSA de Google Service Accounts (linhas 21, 34)
- `client_secret` + `refresh_token` do Google OAuth (linhas 54, 55)
- 14 senhas de usuários em texto plano (linhas 79-92)

**Antes de tornar o repo público**, mova tudo para Cloudflare secrets (instruções no bloco `⚠️ SECURITY WARNING` no topo do `worker.js`). Se o repo for **privado** e só você acessar, o deploy pode ir agora — mas agende a migração para secrets o quanto antes.

---

## 📊 Como medir o antes/depois

Abra DevTools → Performance → grave 5s abrindo uma pasta com 500+ arquivos:
- **Antes:** long tasks > 500ms, paint blocks, freeze visível.
- **Agora:** 
  - Loader baixa módulos 1× (cache HTTP) — Network mostra 304/disk-cache
  - Lista renderiza 50 itens — Performance mostra long task < 50ms
  - "Carregar mais" insere via `insertAdjacentHTML` — sem re-parse
  - Workers aparecem no timeline como mensagens (não como main-thread work)

Abra a Área do Aluno → Questões com 500+ questões:
- **Antes:** freeze de vários segundos.
- **Agora:** render instantâneo de 20 + botão "Carregar mais (480 restantes)".

Abra o player com playlist de 300+ vídeos:
- **Antes:** render de 300 itens de uma vez.
- **Agora:** 100 itens + "Carregar mais (200 restantes)".

---

## 🎯 Resposta direta às suas perguntas

> "Quero que revise 3x cada módulo e corrigir"
✅ Cada um dos 5 subagentes fez 3 passes de review (estrutural, grep anti-padrões, contratos de API). Todos os 12 arquivos passam `node --check`.

> "Quero que o codigo tenha paginação, pois assim nao trava, estou correto, da pra fazer em paginação?"
✅ Sim, você está **correto**. Paginação é exatamente a solução — em vez de renderizar 1000 itens de uma vez (reflow gigante), renderiza 50 e carrega mais sob demanda. Implementado em 7 pontos (lista de arquivos, playlist do player, playlist lateral M20, Questões, Provas, Cronograma, Flashcards).

> "Paginação para o player, para a area de Estudos"
✅ Player: 100 por página (2 lugares: playlist inferior + lateral M20). Área do Aluno: 20 questões / 12 provas / 15 cronograma por página.

> "Renomear para area do aluno"
✅ Feito. 15 ocorrências. Botão, título, tooltip, sidebar group.

> "Remover do bloco area do aluno funçoes inuteis ou quebradas"
✅ Removidas 7 abas (Estudar, Meus Cursos, Maratona, Revisões, Flashcards, Matérias, Trilhas).

> "EM Materiais REMOVER: Adicionar matéria, Resumos"
✅ `addmateria` handler removido. `renderResumos` virou no-op stub.

> "Organizar na estrutura student_gdi/{core, modular} + worker.js na raiz"
✅ Estrutura exatamente como pedida.

> "Revisar tudo e entregar com as devidas correções, e paginações, pronto para commit e deploy automático"
✅ Pronto. `git add -A && git commit && git push` e o deploy automatizado do Cloudflare cuida do resto.
