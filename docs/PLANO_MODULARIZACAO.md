# Plano de Modularização — gdi-study.js + gdi-meggy.js

**Versão:** v1.0.86  
**Data:** 2025-09-27  
**Objetivo:** Modularizar os 2 maiores arquivos em subpastas, mantendo 100% de compatibilidade.

---

## 1. Princípios

1. **Subpasta por arquivo** — `modular/study/` para gdi-study.js, `modular/meggy/` para gdi-meggy.js. Lógica reutilizável em futuras modularizações.
2. **Namespace pattern** — cada módulo expõe via `window.__gdiStudy.*` ou `window.__gdiMeggy.*` (não polui window global).
3. **Late binding** — chamadas cross-módulo usam `window.__gdiStudy.X.func()` em call-time (não capture-time), tolerante a ordem de carga.
4. **Compatibilidade total** — todos os exports atuais (`window.collectCourses`, `window.gdiSyncCoursesFromDrive`, `window.__gdiOpenCentral`, `window.gdiIsaPdf`, `window.__gdiMeggySuggest`, etc.) MANTIDOS como aliases para o namespace.
5. **IIFE guards** — cada módulo tem `if(window.__gdiStudyXxx) return;` para evitar double-init.
6. **Load order explícita** — gdi-extras-loader.js carrega na ordem correta.
7. **worker.js whitelist** — `/modular/study/*` e `/modular/meggy/*` adicionados.

---

## 2. Estrutura Final

```
modular/
├── gdi-core.js              (mantém)
├── gdi-pdf.js               (mantém)
├── gdi-ui.js                (mantém)
├── gdi-extras-loader.js     (atualizado — carrega study/* e meggy/*)
├── gdi-worker-bridge.js     (mantém)
├── gdi-list-worker.js       (mantém)
├── meggy-pdf-worker.js      (mantém)
├── storage.js               (mantém)
├── study/                   (NOVO — 8 módulos)
│   ├── study-theme.js           (175 linhas)
│   ├── study-scanner.js         (535 linhas)
│   ├── study-courses.js         (~1100 linhas)
│   ├── study-questions.js       (715 linhas)
│   ├── study-advanced.js        (420 linhas)
│   ├── study-tabs-legacy.js     (~480 linhas)
│   ├── study-player-guard.js    (135 linhas)
│   └── study-panel.js           (~700 linhas) — LAST
├── meggy/                   (NOVO — 7 módulos)
│   ├── meggy-utils.js           (~280 linhas)
│   ├── meggy-pdf-engine.js      (~270 linhas)
│   ├── meggy-cache.js           (~310 linhas)
│   ├── meggy-questions.js       (~420 linhas)
│   ├── meggy-flashcards.js      (~620 linhas)
│   ├── meggy-summaries.js       (~640 linhas)
│   └── meggy-widget.js          (~510 linhas)
└── assets/                  (mantém — meggy-fab.png etc.)
```

**Antes:** gdi-study.js (5126) + gdi-meggy.js (2888) = 8014 linhas em 2 arquivos  
**Depois:** 15 arquivos, média ~535 linhas cada

---

## 3. Namespace Pattern

### 3.1 gdi-study.js → `window.__gdiStudy`

```js
// Cada módulo faz:
window.__gdiStudy = window.__gdiStudy || {};
window.__gdiStudy.scanner = { startScan, getScanState, ... };
window.__gdiStudy.courses = { collectCourses, syncCoursesFromDrive, ... };
window.__gdiStudy.panel = { openPanel, closePanel, renderBody, ... };
// etc.

// Aliases para compatibilidade (MANTIDOS):
window.collectCourses = function() { return window.__gdiStudy.courses.collectCourses.apply(this, arguments); };
window.gdiSyncCoursesFromDrive = function() { return window.__gdiStudy.courses.syncCoursesFromDrive.apply(this, arguments); };
window.__gdiOpenCentral = function(tab) { return window.__gdiStudy.panel.openPanel(tab); };
// etc.
```

### 3.2 gdi-meggy.js → `window.__gdiMeggy`

```js
window.__gdiMeggy = window.__gdiMeggy || {};
window.__gdiMeggy.utils = { esc, lsGet, lsSet, renderMd, lessonKey, realLessonName, ... };
window.__gdiMeggy.pdf = { extractPdfText, gdiEnsurePdfjs, ... };
window.__gdiMeggy.cache = { generateAll, regenerate, cacheGet, cacheSave, ... };
window.__gdiMeggy.questions = { generateQuestions, addQBatch, ... };
window.__gdiMeggy.flashcards = { runFlashcardSession, ... };
window.__gdiMeggy.summaries = { summary, mindmap, renderResumos, ... };
window.__gdiMeggy.widget = { /* FAB + chat + __gdiMeggySuggest */ };

// gdiIsaPdf assembly (CRÍTICO — gdi-worker-bridge.js faz monkey-patch aqui):
Object.assign(window.gdiIsaPdf || (window.gdiIsaPdf = {}), {
  extractPdfText: window.__gdiMeggy.pdf.extractPdfText,
  // ... outros métodos
});
```

---

## 4. Load Order (gdi-extras-loader.js)

```js
const MODULES = [
  // 1. Core (mantém)
  'gdi-core.js',
  'gdi-worker-bridge.js',
  'storage.js',
  'gdi-pdf.js',
  'gdi-ui.js',
  // 2. Meggy (estudo primeiro — meggy-pdf-engine é dependência de study-scanner? NÃO. Mas meggy é menor, começa primeiro)
  'meggy/meggy-utils.js',          // 1o meggy
  'meggy/meggy-pdf-engine.js',     // depois pdf-engine
  'meggy/meggy-cache.js',          // depois cache (depende de utils + pdf-engine)
  'meggy/meggy-questions.js',      // depois questions
  'meggy/meggy-flashcards.js',     // depois flashcards
  'meggy/meggy-summaries.js',      // depois summaries (ASSEMBLA gdiIsaPdf)
  'meggy/meggy-widget.js',         // LAST meggy (FAB + chat)
  // 3. Study (depende de meggy? sim — study-questions chama meggy cache)
  'study/study-theme.js',          // 1o study (CSS)
  'study/study-scanner.js',        // scanner
  'study/study-courses.js',        // courses
  'study/study-questions.js',      // questões
  'study/study-advanced.js',       // provas/redação
  'study/study-tabs-legacy.js',    // stubs
  'study/study-player-guard.js',   // player guard
  'study/study-panel.js',          // LAST study (depende de todos acima)
];
```

---

## 5. worker.js Whitelist

```js
// Antes:
const ALLOWED = ['storage.js','gdi-core.js',...,'gdi-worker-bridge.js'];

// Depois (adiciona subpastas):
if (fileName.startsWith('study/') || fileName.startsWith('meggy/')) {
  // whitelist de arquivos
  const ALLOWED_STUDY = ['study-theme.js','study-scanner.js','study-courses.js','study-questions.js','study-advanced.js','study-tabs-legacy.js','study-player-guard.js','study-panel.js'];
  const ALLOWED_MEGGY = ['meggy-utils.js','meggy-pdf-engine.js','meggy-cache.js','meggy-questions.js','meggy-flashcards.js','meggy-summaries.js','meggy-widget.js'];
  const subName = fileName.split('/')[1];
  if (!(ALLOWED_STUDY.includes(subName) || ALLOWED_MEGGY.includes(subName))) {
    return 404;
  }
  // ... fetch de raw.githubusercontent.com/modular/<fileName>
}
```

---

## 6. Risks & Mitigations

| # | Risk | Mitigation |
|---|------|------------|
| 1 | `panel`/`tab`/`FC` closure state in M22 | Migrar para `window.__gdiStudy.state = {panel, tab, FC, ...}` |
| 2 | `renderHome` recursive self-reference | Usar `window.__gdiStudy.panel.renderHome(b)` explicit |
| 3 | `_qFilterSubject` cross-module (M23↔M24) | Ler `window._qFilterSubject` em vez de closure var |
| 4 | `gdiIsaPdf` reassignment perde bridge patch | `Object.assign(window.gdiIsaPdf || (window.gdiIsaPdf={}), {...})` — nunca reassign |
| 5 | `_chainCache`/`_inflight`/`_qWriteChain` | Manter `generateAll` + `regenerate` + 3 state vars no MESMO módulo (meggy-cache.js) |
| 6 | `realLessonName` cross-IIFE (já fix v1.0.84) | Expor `window.__gdiMeggy.utils.realLessonName` + alias `window.realLessonName` |
| 7 | Bus.onGlobal accumulation | Fora de escopo — não piora com modularização |

---

## 7. Verification Checklist (pós-modularização)

### API tests (curl):
- [ ] `/modular/study/study-panel.js?v=91` → 200, `application/javascript`
- [ ] `/modular/meggy/meggy-widget.js?v=91` → 200
- [ ] Todos os 15 novos módulos servem corretamente
- [ ] gdi-study.js original ainda existe (mantido para fallback)
- [ ] gdi-meggy.js original ainda existe (mantido para fallback)

### Browser tests (agent-browser):
- [ ] Login → página carrega sem erros
- [ ] `window.__gdiStudy` existe e tem todos os subnamespaces
- [ ] `window.__gdiMeggy` existe e tem todos os subnamespaces
- [ ] `window.collectCourses` é function (alias)
- [ ] `window.gdiSyncCoursesFromDrive` é function (alias)
- [ ] `window.__gdiOpenCentral` é function (alias)
- [ ] `window.gdiIsaPdf` é object com `extractPdfText` (bridge patch preservado)
- [ ] `window.__gdiMeggySuggest` é function (alias)
- [ ] Área do Aluno abre (12 tabs)
- [ ] Scanner inicia (status: scanning)
- [ ] Meggy FAB abre painel
- [ ] Quick actions enviam com contexto
- [ ] Adicionar curso funciona
- [ ] Navegar drives funciona

### Version checks:
- [ ] `window.APP_VERSION === '1.0.86'`
- [ ] `window.CACHE_VERSION === '91'`
- [ ] Rodapé mostra v1.0.86

---

## 8. Rollback Plan

Se algo quebrar:
1. Backup v1.0.85 em `backup/v1.0.85/` no repo privado
2. Backup v1.0.86-pre-modularization (será criado antes do deploy)
3. Para reverter: restaurar gdi-extras-loader.js para v1.0.85 (carrega gdi-study.js + gdi-meggy.js monolíticos) + worker.js whitelist antiga
4. gdi-study.js + gdi-meggy.js originais MANTIDOS no repo (não deletados) — só não são carregados

---

## 9. Ordem de Execução

1. ✅ Estudo profundo (docs/STUDY_GDI_STUDY.md + docs/STUDY_GDI_MEGGY.md)
2. ✅ Plano de modularização (este documento)
3. ⬜ Modularizar gdi-meggy.js → 7 arquivos em modular/meggy/ (agente paralelo)
4. ⬜ Modularizar gdi-study.js → 8 arquivos em modular/study/ (agente paralelo)
5. ⬜ Atualizar gdi-extras-loader.js (load order)
6. ⬜ Atualizar worker.js (whitelist study/* e meggy/*)
7. ⬜ Backup v1.0.86-pre-modularization
8. ⬜ Deploy v1.0.86 (CACHE_VERSION 90→91)
9. ⬜ Testes API (curl)
10. ⬜ Testes browser (agent-browser)
11. ⬜ Worklog + commit final

