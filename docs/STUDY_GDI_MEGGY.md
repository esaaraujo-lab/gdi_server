# Deep Study: `gdi-meggy.js` (2888 lines)

**Task ID:** `v86-STUDY-MEGGY-JS`
**Agent:** Explore
**File:** `/home/z/my-project/student_gdi/modular/gdi-meggy.js`
**Date:** 2025-09-27
**Purpose:** Prepare a modularization plan (4-6 modules, 300-800 lines each).
**Scope:** STUDY ONLY — no files modified.

---

## TL;DR

- The file is **2 IIFEs**, cleanly separated by concern:
  1. **M9-ISA IIFE** (lines 32–2372, ~2340 lines) — PDF extraction, summary/question/mindmap generation chain, flashcards library, battalion triggers, Resumos tab.
  2. **M-AI Widget IIFE** (lines 2383–2888, ~505 lines) — Floating chat widget, browser-AI detection, memory bank, `__gdiMeggySuggest` banner.
- **53 functions** total (49 in M9-ISA + 21 in M-AI, including nested `draw`/`renderPage`/`saveNewCard` helpers).
- **8 window exports** from the file (full inventory in §1.3).
- **The two IIFEs are essentially decoupled**: M-AI does NOT call any M9-ISA closure-private function. `realLessonName` (the only candidate) was already broken-by-scope and fixed in v1.0.84 with an inline extraction. This makes modularization **far easier than feared**.
- Recommended split: **6 files** under `modular/meggy/` (300–600 lines each). See §7.

---

## 1. Top-Level Structure

### 1.1 IIFE boundaries

| IIFE | Guard | Lines | Span | Size |
|---|---|---|---|---|
| M9-ISA (PDF engine + summaries + questions + flashcards + battalion) | `if(window.__gdiM9Isa)return;window.__gdiM9Isa=true;` | 32–2372 | 2341 lines | ~85% of file |
| M-AI Widget (FAB + chat + memory + suggest) | `if(window.__gdiAiWidget)return;window.__gdiAiWidget=true;` | 2383–2888 | 506 lines | ~15% of file |

Both IIFEs follow the same registration pattern: guard flag on `window.__gdi*` (prevents double-init if the file is loaded twice), then immediate setup, no `window.GDI_MODULES.push({...})` style registration. Each IIFE self-installs on load.

### 1.2 Module-scope constants (per IIFE)

#### M9-ISA IIFE (lines 32–2372)

| Constant | Line | Type | Purpose |
|---|---|---|---|
| `LS_SUM='gdi-isa-summaries-v1'` | 34 | string (LS key) | localStorage key for saved summaries |
| `LQ='gdi-questions-v1'` | 35 | string (LS key) | localStorage key for question bank (shared with M23) |
| `esc` | 36 | fn | HTML escape helper |
| `lsGet`/`lsSet` | 37–38 | fn | localStorage JSON helpers |
| `uid` | 39 | fn | `Date.now().toString(36)+Math.random().toString(36).slice(2,7)` |
| `tesseractPromise=null` | 283 | Promise\|null | memoized Tesseract loader |
| `_qWriteChain = Promise.resolve()` | 604 | Promise | per-key serialization queue for question-bank writes (v80-FIX BUG 1) |
| `LS_SUBJECTS='gdi-subjects-v1'` | 890 | string (LS key) | manual subjects (matérias) |
| `_chainCache={}` | 910 | object | in-memory cache of generated summary/mindmap/questions per `lessonKey()` |
| `_chainCacheMax=5` | 912 | number | LRU cap |
| `_inflight={}` | 916 | object | per-key in-flight promise map (v80-FIX BUG 5) |
| `ANSWERED_KEY='gdi-answered-questions-v1'` | 1205 | string (LS key) | questions already answered (avoid repeats) |
| `window.__gdiPdfCursor=0` | 1244 | number | cursor for `generateQuestions` round-robin between PDFs |

#### M-AI Widget IIFE (lines 2383–2888)

| Constant | Line | Type | Purpose |
|---|---|---|---|
| `MEGGY_NAME='Meggy'` | 2386 | string | display name |
| `MEGGY_AVATAR='<svg…>'` | 2388 | string | inline SVG avatar (unused now that PNG is loaded) |
| `MEGGY_TAG='— a poodle tutora'` | 2389 | string | tagline |
| `ISA_SYS` | 2390–2395 | string | system prompt for the AI (poodle persona) |
| `STORE='gdi-ai-chat'` | 2468 | string (SS key) | sessionStorage key for chat history |
| `messages=[]` | 2469 | array | chat history (mutated by addMsg/renderHistory) — **shared across all functions in this IIFE** |
| `_browserAIState='unknown'` | 2491 | string | 'unknown'\|'ready'\|'download'\|'no' |
| `_browserSession=null` | 2492 | object\|null | Gemini Nano session |
| `_providerLabel='verificando…'` | 2493 | string | current provider label |
| `MEMORY_KEY='gdi-meggy-memory-v1'` | 2675 | string (LS key) | Meggy's student profile |
| `busy=false` | 2722 | boolean | send() lock |
| `_serverEnabled=null` | 2826 | bool\|null | /api/ai/status result |
| `_serverProvider=null` | 2827 | string\|null | provider name (nvidia-nim/zhipu-ai/cf-workers-ai/openai) |

### 1.3 Window exports

| Export | Line | IIFE | Type | Description |
|---|---|---|---|---|
| `window.__gdiParseJsonArray` | 99 | M9-ISA | fn | Robust JSON-array parser (called by gdi-study.js:76) |
| `window.gdiEnsurePdfjs` | 242 | M9-ISA | fn | Idempotent pdf.js loader (also defined in gdi-core.js:235 as fallback) |
| `window._pdfjsPromise` | 244 | M9-ISA | Promise | Memoization slot for above |
| `window.gdiSubjects` | 902 | M9-ISA | `{get,save,delete,LS}` | Manual subjects (matérias) CRUD (called by gdi-study.js:3276,3280,3293,3334,3346,3404) |
| `window.__gdiPdfCursor` | 1244 | M9-ISA | number | Round-robin cursor for generateQuestions |
| `window.gdiIsaPdf` | 2133 | M9-ISA | object | Public API: 16 methods |
| `window.renderResumos` | 2190 | M9-ISA | async fn | "Resumos" tab renderer (called by gdi-study.js:1427) |
| `window.__gdiMeggySuggest` | 2868 | M-AI | fn(text, action) | Floating suggestion banner (**NOT called anywhere in the codebase** — only exported; documented in README.md:126 and MANUAL_TECNICO.md:316) |

**`window.gdiIsaPdf` exports 16 methods:**
`summary, questions, mindmap, flashcards, regenerate, extractPdfText, saveIsaSummary, listIsaSummaries, delIsaSummary, downloadAsPdf, fetchSharedQuestions, fetchSharedSummaries, saveSharedSummary, saveEssayMD, startBattalion, getBattalionStatus`.

---

## 2. Function Inventory

### 2.1 M9-ISA IIFE functions (lines 32–2372)

| # | Name | Lines | ~LoC | Exported? | What it does | Key dependencies |
|---|---|---|---|---|---|---|
| 1 | `parseJsonArray(raw)` | 47–97 | 50 | via `__gdiParseJsonArray` | Robust JSON-array extraction from LLM output (strips markdown fences, fixes trailing commas, item-by-item fallback) | — |
| 2 | `ensurePdfjs()` | 276–278 | 3 | no (delegates to window.gdiEnsurePdfjs) | Returns memoized pdf.js Promise | `window.gdiEnsurePdfjs` |
| 3 | `ensureTesseract()` | 284–299 | 16 | no | Lazily loads Tesseract.js v5 from CDN | `window.Tesseract` |
| 4 | `ocrPdfPage(pdfjs,doc,pageNum,progressCb)` | 307–343 | 37 | no | Renders one PDF page to canvas + runs Tesseract `por+eng` | `ensureTesseract` |
| 5 | `getFileType(name)` | 348–354 | 7 | no | Returns 'md'/'txt'/'html'/'pdf' by extension | — |
| 6 | `extractTextFile(url)` | 355–365 | 11 | no | Fetches text content for md/txt/html files | — |
| 7 | `extractPdfText(url, progressCb)` | 377–518 | 142 | via `gdiIsaPdf.extractPdfText` | Extracts text from PDF (pdf.js + OCR fallback for scanned PDFs, try/finally doc.destroy) | `ensurePdfjs`, `ocrPdfPage` |
| 8 | `callIsa(prompt)` | 521–527 | 7 | no | POST /api/ai, returns response text | — |
| 9 | `renderMd(txt)` | 531–541 | 11 | no | Markdown→HTML (uses marked + gdiSanitize; XSS-safe fallback to esc) | `window.marked`, `window.gdiSanitize`, `esc` |
| 10 | `setLoading(bodyEl,msg)` | 544–554 | 11 | no | Renders spinner + message in bodyEl | `esc` |
| 11 | `setError(bodyEl,msg)` | 555–589 | 35 | no | Renders error box with Retry/Close buttons; retry clicks "Resumo Meggy" tab, close clicks first PDF tab | `esc` |
| 12 | `addQ(obj)` | 592–596 | 5 | no | Single-question insert into LS (legacy) | `lsGet`/`lsSet`, `LQ`, `uid` |
| 13 | `addQBatch(newItems)` | 605–621 | 17 | no | Batch insert with dedupe by statement; serializes via `_qWriteChain` | `lsGet`/`lsSet`, `LQ`, `_qWriteChain` |
| 14 | `saveIsaSummary(lesson, summary, coursePath, subject)` | 629–663 | 35 | via `gdiIsaPdf.saveIsaSummary` | Saves summary to LS + Drive (GDIStorage.saveMaterial) | `lsGet`/`lsSet`, `LS_SUM`, `uid`, `window.GDIStorage` |
| 15 | `listIsaSummaries()` | 664 | 1 | via `gdiIsaPdf.listIsaSummaries` | Returns LS summaries array | `lsGet`, `LS_SUM` |
| 16 | `delIsaSummary(id)` | 665 | 1 | via `gdiIsaPdf.delIsaSummary` | Deletes summary by id | `lsGet`/`lsSet`, `LS_SUM` |
| 17 | `downloadAsPdf(lesson, markdownText)` | 668–697 | 30 | via `gdiIsaPdf.downloadAsPdf` | Opens print-window with styled HTML | `renderMd`, `esc`, `showToast` |
| 18 | `copySummary(text)` | 700–709 | 10 | no | Copies to clipboard (with execCommand fallback) | `showToast` |
| 19 | `lessonKey()` | 712 | 1 | no | Returns `window.location.pathname.split('?')[0]` (cache key) | — |
| 20 | `realLessonName(fallback)` | 717–729 | 13 | **NO** (closure-private!) | Returns real lesson name from playlist or `.gdi-file-header-name` | `window.playlistVideos`, `window.currentIndex` |
| 21 | `GRANULAR_AVAILABLE` (IIFE) | 736–747 | 12 | no | Probes /api/ai/summaries?probe=1 to detect granular endpoints | — |
| 22 | `cacheGet()` | 749–764 | 16 | no | GET cache from granular or unified endpoint | `GRANULAR_AVAILABLE`, `lessonKey` |
| 23 | `cacheSave(summary,questions,lessonName,mindmap)` | 765–780 | 16 | no | POST cache to granular or unified endpoint; preserves existing mindmap if undefined | `GRANULAR_AVAILABLE`, `lessonKey`, `cacheGet` |
| 24 | `renderSummaryCard(bodyEl, lesson, markdownText, fromCache)` | 783–817 | 35 | no | Renders summary card with Regerar/PDF/Copiar buttons | `renderMd`, `esc`, `downloadAsPdf`, `copySummary`, `showToast`, `window.gdiIsaPdf.regenerate` |
| 25 | `autoCreateFlashcards(questions, lesson, urlPath)` | 824–842 | 19 | no | For each question, creates a flashcard in `gdi-cards-v1` (dedupe by `f`) | `lsGet`/`lsSet`, `uid`, `lessonKey` |
| 26 | `extractDisciplineTheme(card)` | 847–885 | 39 | no | Returns `{discipline, theme}` from card path/subject/lesson | `normPath`, `stripExt` |
| 27 | `normPath(p)` | 886 | 1 | no | `decodeURIComponent` with fallback | — |
| 28 | `stripExt(s)` | 887 | 1 | no | Removes file extension | — |
| 29 | `getSubjects()` | 891 | 1 | via `window.gdiSubjects.get` | Returns subjects from LS | `lsGet`, `LS_SUBJECTS` |
| 30 | `saveSubject(subj)` | 892–897 | 6 | via `window.gdiSubjects.save` | Insert/update subject by id | `lsGet`/`lsSet`, `LS_SUBJECTS` |
| 31 | `deleteSubject(id)` | 898–900 | 3 | via `window.gdiSubjects.delete` | Delete subject by id | `lsGet`/`lsSet`, `LS_SUBJECTS` |
| 32 | `_chainCacheEvict()` | 917–923 | 7 | no | LRU eviction when `_chainCache` exceeds 5 entries | `_chainCache`, `_chainCacheMax` |
| 33 | `extractQuestionsFromText(text)` | 926–936 | 11 | no | Regex-extracts questions (numbered lists ending in '?') | — |
| 34 | `callIsaKeyed(prompt, keyHint)` | 941–943 | 3 | no | Stub — just calls `callIsa(prompt)` (was intended for round-robin NVIDIA keys) | `callIsa` |
| 35 | **`generateAll(items, lesson, trigger, progressCb)`** | 951–1170 | 220 | no | **HEART OF THE SYSTEM**: parallel generation of summary + mindmap + questions for all PDFs; uses `_inflight` for dedup, `_chainCache` for memoization | `lessonKey`, `_inflight`, `_chainCache`, `_chainCacheEvict`, `cacheGet`, `extractPdfText`, `callIsaKeyed`, `parseJsonArray`, `addQBatch`, `autoCreateFlashcards`, `saveIsaSummary`, `saveSharedSummary`, `extractQuestionsFromText` |
| 36 | `summary(items, bodyEl, lessonName)` | 1173–1202 | 30 | via `gdiIsaPdf.summary` | Flow: generateAll → renderSummaryCard + "Gerado em cadeia" badge | `realLessonName`, `setLoading`, `generateAll`, `renderSummaryCard`, `showToast`, `setError` |
| 37 | `getAnsweredIds()` | 1206 | 1 | no | Reads answered-question IDs from LS | `ANSWERED_KEY` |
| 38 | `markAnswered(id)` | 1207 | 1 | no | Appends id to answered list (cap 500) | `getAnsweredIds`, `ANSWERED_KEY` |
| 39 | `questions(items, bodyEl, lessonName)` | 1210–1241 | 32 | via `gdiIsaPdf.questions` | Flow: generateAll → load cached questions → startQuizFromBank | `realLessonName`, `setLoading`, `generateAll`, `cacheGet`, `addQBatch`, `startQuizFromBank`, `setError` |
| 40 | `generateQuestions(items, bodyEl, lesson)` | 1245–1296 | 52 | no | Generates 5 more questions from next PDF (round-robin via `__gdiPdfCursor`) | `extractPdfText`, `callIsa`, `parseJsonArray`, `addQBatch`, `cacheGet`, `cacheSave`, `showToast`, `setError` |
| 41 | `startQuizFromBank(bodyEl, lesson)` | 1299–1327 | 29 | no | Loads 5 unanswered questions for the lesson; "Gerar 5 questões" button fallback | `lsGet`, `getAnsweredIds`, `markAnswered`, `runQuizSession`, `generateQuestions` |
| 42 | `runQuizSession(bodyEl, lesson, queue)` | 1330–1422 | 93 | no | Interactive quiz (one question at a time; MC/TF; skip; results) | `esc`, `markAnswered`, `window.__gdiGradeQ`, `generateQuestions`, `startQuizFromBank` |
| 43 | `mindmap(items, bodyEl, lessonName)` | 1425–1464 | 40 | via `gdiIsaPdf.mindmap` | Flow: generateAll → render "Pílulas" markdown + PDF download | `realLessonName`, `setLoading`, `generateAll`, `renderMd`, `downloadAsPdf`, `showToast`, `setError` |
| 44 | `flashcards(items, bodyEl, lessonName)` | 1471–1786 | 316 | via `gdiIsaPdf.flashcards` | Renders flashcard library (discipline→theme accordion, lazy paginated cards, manual add form, study sessions) | `realLessonName`, `lessonKey`, `lsGet`/`lsSet`, `extractDisciplineTheme`, `renderThemeCardsPaginated`, `runFlashcardSession`, `uid`, `showToast`, `window.gdiSubjects`, `window.gdiIsaPdf.summary`, `setLoading`, `setError` |
| 45 | `saveNewCard(keepForm)` (nested in flashcards) | 1731–1778 | 48 | no | Reads form, saves new flashcard to LS, re-renders | `lsGet`/`lsSet`, `uid`, `showToast`, `flashcards` (recursive) |
| 46 | `renderThemeCardsPaginated(body, cards, items, bodyEl, lessonName)` | 1791–1857 | 67 | no | Renders 50 cards/page with "Carregar mais" button | `esc`, `lsGet`/`lsSet`, `showToast`, `flashcards` (recursive) |
| 47 | `runFlashcardSession(bodyEl, lesson, queue, items, lessonName)` | 1861–2023 | 163 | no | Flip-card study session (SRS grading via `gdiGradeCard`, keyboard shortcuts, cleanup on page:change) | `esc`, `lsGet`/`lsSet`, `window.gdiGradeCard`, `window.gdiSrsIntervals`, `window.gdiAchievements`, `Bus.onGlobal('page:change',...)`, `flashcards` (back button) |
| 48 | `regenerate(items, bodyEl, lessonName)` | 2026–2047 | 22 | via `gdiIsaPdf.regenerate` | Awaits in-flight generateAll → deletes only current key from `_chainCache` → POST null to /api/ai/cache → calls `summary` | `realLessonName`, `lessonKey`, `_inflight`, `_chainCache`, `summary` |
| 49 | `fetchSharedQuestions(subjectFilter)` | 2051–2073 | 23 | via `gdiIsaPdf.fetchSharedQuestions` | GET /api/ai/shared-flashcards?kind=question | — |
| 50 | `saveEssayMD(markdown, banca, tipo, score)` | 2077–2090 | 14 | via `gdiIsaPdf.saveEssayMD` | POST /api/ai/essay/save | — |
| 51 | `startBattalion(courseKey, coursePath, lessonName, pdfList)` | 2094–2101 | 8 | via `gdiIsaPdf.startBattalion` | POST /api/ai/battalion (triggers background AI generation in worker) | — |
| 52 | `getBattalionStatus(courseKey)` | 2103–2109 | 7 | via `gdiIsaPdf.getBattalionStatus` | GET /api/ai/battalion/status | — |
| 53 | `saveSharedSummary(lessonName, summary, questions)` | 2112–2117 | 6 | via `gdiIsaPdf.saveSharedSummary` | POST /api/ai/shared-summaries (pool shared with other students) | — |
| 54 | `fetchSharedSummaries(lessonFilter)` | 2119–2126 | 8 | via `gdiIsaPdf.fetchSharedSummaries` | GET /api/ai/shared-summaries | — |
| 55 | `_summaryModal(lesson, markdownText)` | 2142–2179 | 38 | no | Modal overlay showing rendered Markdown + PDF/Close buttons (with proper esc handler cleanup) | `renderMd`, `esc`, `downloadAsPdf` |
| 56 | `window.renderResumos(bodyEl)` (async) | 2190–2369 | 180 | via `window.renderResumos` | Resumos tab: merges localStorage + Drive summaries, dedupe by lesson, group by subject, lazy-load Drive content on click | `window.gdiIsaPdf.listIsaSummaries`/`downloadAsPdf`/`delIsaSummary`, `window.GDIStorage.listMaterials`, `window.gdiModal`, `_summaryModal`, `showToast`, `esc`, `renderMd` |

### 2.2 M-AI Widget IIFE functions (lines 2383–2888)

| # | Name | Lines | ~LoC | Exported? | What it does | Key dependencies |
|---|---|---|---|---|---|---|
| 57 | `renderMd(txt)` (local re-implementation) | 2474–2484 | 11 | no | Same logic as M9-ISA's renderMd but duplicated | `window.marked`, `window.gdiSanitize`, `esc` (local) |
| 58 | `esc(s)` (local re-implementation) | 2485 | 1 | no | HTML escape (same as M9-ISA's `esc` but duplicated) | — |
| 59 | `save()` | 2472 | 1 | no | Persists `messages` (capped 20) to sessionStorage | `messages`, `STORE` |
| 60 | `detectBrowserAI()` | 2495–2506 | 12 | no | Probes `window.ai.languageModel` / `window.LanguageModel` capabilities | — |
| 61 | `getBrowserSession()` | 2508–2520 | 13 | no | Creates a Gemini Nano session with `ISA_SYS` systemPrompt | `ISA_SYS`, `_browserSession` |
| 62 | `callBrowserAI(history)` | 2522–2531 | 10 | no | Prompts the browser session with last user message | `getBrowserSession` |
| 63 | `updateStatus()` | 2533–2542 | 10 | no | Updates panel header dot/label based on `_browserAIState` + `serverLabel()` | `_browserAIState`, `_providerLabel`, `serverLabel` |
| 64 | `addMsg(role, text)` | 2619–2632 | 14 | no | Pushes message (cap 50), saves, appends DOM bubble | `messages`, `save`, `esc`, `renderMd`, `body` |
| 65 | `renderHistory()` | 2636–2662 | 27 | no | Rebuilds chat DOM from `messages` (PATCH C: caches `m._html` per message) | `messages`, `esc`, `renderMd`, `body` |
| 66 | `showTyping()` | 2665–2669 | 5 | no | Appends 3-dot typing indicator | `body` |
| 67 | `hideTyping()` | 2670 | 1 | no | Removes typing indicator | `typingEl` |
| 68 | `_meggyLsGet(k,d)` / `_meggyLsSet(k,v)` | 2676–2677 | 2 | no | Meggy-scoped LS helpers | — |
| 69 | `loadMemory()` | 2678–2680 | 3 | no | Returns `{interactions, topics, weaknesses, preferences, lastLessons}` | `_meggyLsGet`, `MEMORY_KEY` |
| 70 | `saveMemory(mem)` | 2681 | 1 | no | Persists memory | `_meggyLsSet`, `MEMORY_KEY` |
| 71 | `updateMemory(topic, context)` | 2682–2711 | 30 | no | Increments interactions, tracks topics/lastLessons, computes weaknesses from `gdi-questions-v1` + `gdi-q-srs-v1` | `loadMemory`, `saveMemory`, `_meggyLsGet` |
| 72 | `buildMemoryContext()` | 2712–2720 | 9 | no | Builds a natural-language context string from memory | `loadMemory` |
| 73 | **`send()`** (async) | 2723–2777 | 55 | no | Sends user message: tries browser AI first, falls back to /api/ai, updates memory | `input`, `busy`, `sendBtn`, `addMsg`, `showTyping`/`hideTyping`, `messages`, `buildMemoryContext`, `callBrowserAI`, `_browserAIState`, `updateStatus`, `updateMemory` |
| 74 | `toggle()` | 2779–2783 | 5 | no | Opens/closes panel; persists state in sessionStorage | `panel`, `badge`, `renderHistory`, `updateStatus` |
| 75 | `hideWidget()` / `showWidget()` | 2823–2824 | 2 | no | Toggles `display` on fab+panel | `fab`, `panel` |
| 76 | `checkServerStatus()` | 2828–2830 | 3 | no | GET /api/ai/status | `_serverEnabled`, `_serverProvider` |
| 77 | `serverLabel()` | 2831–2837 | 7 | no | Returns `{name, label}` based on `_serverProvider` | `_serverProvider` |
| 78 | `window.__gdiMeggySuggest(text, action)` | 2868–2887 | 20 | via `window.__gdiMeggySuggest` | Floating suggestion banner; auto-hides after 8s | `GDI_ROOT` |

---

## 3. Logical Groupings (Clusters)

### Cluster A: PDF Engine & OCR (M9-ISA)
- **Functions:** `ensurePdfjs`, `ensureTesseract`, `ocrPdfPage`, `getFileType`, `extractTextFile`, `extractPdfText`
- **Lines:** ~240 (276–518)
- **Internal deps:** only `ensureTesseract`↔`ocrPdfPage`
- **External deps:** `window.gdiEnsurePdfjs` (defined here), `window.Tesseract`, `window.pdfjsLib`

### Cluster B: Utils & Helpers (M9-ISA, foundational)
- **Functions:** `esc`, `lsGet`, `lsSet`, `uid`, `parseJsonArray`, `renderMd`, `setLoading`, `setError`, `lessonKey`, `realLessonName`, `callIsa`, `callIsaKeyed`
- **Lines:** ~260 (36–39, 47–97, 521–541, 712–729, 941–943)
- **External deps:** `window.marked`, `window.gdiSanitize`, `showToast`, `window.playlistVideos`, `window.currentIndex`
- **Note:** `realLessonName` is closure-private — M-AI widget CANNOT use it (already broken, fixed in v1.0.84 with inline extraction)

### Cluster C: Cache + Chain State (M9-ISA)
- **Functions:** `_chainCacheEvict`, `GRANULAR_AVAILABLE`, `cacheGet`, `cacheSave`, `generateAll`
- **Shared state:** `_chainCache`, `_inflight`, `_chainCacheMax`
- **Lines:** ~280 (736–780, 910–923, 951–1170)
- **Internal deps:** calls into Cluster A (`extractPdfText`), Cluster D (`saveIsaSummary`, `autoCreateFlashcards`), Cluster E (`addQBatch`, `extractQuestionsFromText`), Cluster F (`saveSharedSummary`, `callIsa`/`callIsaKeyed`)

### Cluster D: Summaries & Mindmap (M9-ISA)
- **Functions:** `saveIsaSummary`, `listIsaSummaries`, `delIsaSummary`, `downloadAsPdf`, `copySummary`, `renderSummaryCard`, `summary`, `mindmap`, `regenerate`
- **Lines:** ~200 (624–717, 783–817, 1173–1202, 1424–1464, 2025–2047)
- **Internal deps:** `generateAll` (Cluster C), `realLessonName`, `renderMd`, `setLoading`, `setError`

### Cluster E: Question Bank & Quiz (M9-ISA)
- **Functions:** `addQ`, `addQBatch`, `extractQuestionsFromText`, `getAnsweredIds`, `markAnswered`, `questions`, `generateQuestions`, `startQuizFromBank`, `runQuizSession`
- **Shared state:** `_qWriteChain`, `ANSWERED_KEY`, `window.__gdiPdfCursor`
- **Lines:** ~290 (591–621, 925–936, 1204–1422, 1243–1296)
- **Internal deps:** `generateAll` (Cluster C), `cacheGet`/`cacheSave` (Cluster C), `extractPdfText` (Cluster A), `callIsa`, `parseJsonArray`, `setLoading`, `setError`, `realLessonName`
- **External deps:** `window.__gdiGradeQ` (SRS grading)

### Cluster F: Flashcards (M9-ISA)
- **Functions:** `autoCreateFlashcards`, `extractDisciplineTheme`, `normPath`, `stripExt`, `getSubjects`, `saveSubject`, `deleteSubject`, `flashcards`, `saveNewCard` (nested), `renderThemeCardsPaginated`, `runFlashcardSession`
- **Lines:** ~530 (819–902, 1466–2023)
- **Internal deps:** `realLessonName`, `lessonKey`, `setLoading`, `setError`
- **External deps:** `window.gdiGradeCard`, `window.gdiSrsIntervals`, `window.gdiAchievements`, `Bus.onGlobal`

### Cluster G: External Services & Public API (M9-ISA)
- **Functions:** `fetchSharedQuestions`, `saveEssayMD`, `startBattalion`, `getBattalionStatus`, `saveSharedSummary`, `fetchSharedSummaries`
- **Lines:** ~90 (2049–2133)
- **Internal deps:** none (just fetch wrappers)
- **Exports the `window.gdiIsaPdf` object** (16 methods from Clusters C/D/E/F/G)

### Cluster H: Resumos Tab (M9-ISA)
- **Functions:** `_summaryModal`, `window.renderResumos`
- **Lines:** ~220 (2142–2369)
- **Internal deps:** `renderMd`, `esc`, `downloadAsPdf` (Cluster D)
- **External deps:** `window.gdiIsaPdf.listIsaSummaries`/`downloadAsPdf`/`delIsaSummary`, `window.GDIStorage.listMaterials`, `window.gdiModal`, `showToast`

### Cluster I: M-AI Widget (FAB + chat + memory)
- **Functions:** all 22 functions in the M-AI IIFE (57–78 above) EXCEPT `__gdiMeggySuggest`
- **Lines:** ~480 (2383–2863)
- **Internal deps:** self-contained — uses its own `renderMd`/`esc` re-implementations, does NOT call any M9-ISA closure-private function
- **External deps:** `Bus`, `GDI_ROOT`, `window.CACHE_VERSION`, `window.marked`, `window.gdiSanitize`, `sessionStorage`/`localStorage`

### Cluster J: Suggest Banner (M-AI)
- **Functions:** `window.__gdiMeggySuggest`
- **Lines:** ~20 (2865–2887)
- **Internal deps:** `GDI_ROOT`
- **Note:** exported but never called anywhere in the codebase (searched gdi-study.js, gdi-core.js, app.min.js, worker.js)

---

## 4. Shared State

### 4.1 Module-level `let`/`const` variables

| Variable | Owner IIFE | Lines | Coordination needed? |
|---|---|---|---|
| `tesseractPromise` | M9-ISA | 283 | No (only used by `ensureTesseract`/`ocrPdfPage`) |
| `_qWriteChain` | M9-ISA | 604 | **YES** — serialized writes to `gdi-questions-v1`; must stay in same module as `addQBatch` |
| `_chainCache`, `_inflight`, `_chainCacheMax` | M9-ISA | 910, 916, 912 | **YES** — `_inflight` is read by `regenerate` (line 2034) which is in Cluster D, not Cluster C. After split, either (a) keep `regenerate` with `generateAll`, or (b) expose `_inflight` via `window.__gdiMeggyState` |
| `_browserAIState`, `_browserSession`, `_providerLabel`, `messages`, `busy`, `_serverEnabled`, `_serverProvider` | M-AI | 2491–2493, 2469, 2722, 2826–2827 | No (all within M-AI widget, which stays as one module) |
| `typingEl` (declared at line 2664) | M-AI | 2664 | No |
| `_memDebounce` (declared at line 2793) | M-AI | 2793 | No |

### 4.2 Cross-IIFE sharing analysis

**Direct closure sharing: NONE.** Each IIFE is self-contained. The M-AI widget:
- Re-implements its own `renderMd` (line 2474) and `esc` (line 2485) — does NOT use M9-ISA's
- References `realLessonName` only via `typeof window.realLessonName === 'function'` (line 2594) which is always false (since `realLessonName` is closure-private and not exported). Falls into the v1.0.84 inline extraction branch.
- Does NOT call any other M9-ISA function directly.

**Indirect communication via window:**
- The M-AI widget's quick actions (Resumir/Questões/Explicar) just inject a canned prompt into the chat input and call `send()` — they do NOT invoke `window.gdiIsaPdf.summary()` etc.
- The M-AI widget reads `gdi-questions-v1` and `gdi-q-srs-v1` (via `_meggyLsGet`) to compute weaknesses, but does NOT call any `gdiIsaPdf.*` method.

### 4.3 Post-split state coordination

For the rare cases where state must cross module boundaries:

**Option A (recommended): shared state namespace**
```js
window.__gdiMeggyState = window.__gdiMeggyState || {
  _chainCache: {},
  _inflight: {},
  _qWriteChain: Promise.resolve(),
  _chainCacheMax: 5
};
```
Each module reads/writes `window.__gdiMeggyState._chainCache[key]` etc. Keep `regenerate` in the same module as `generateAll` (or expose `_inflight` getter).

**Option B (cleaner): keep shared-state owners together**
Put `generateAll` and `regenerate` in the same module (`meggy-cache.js`), since `regenerate` awaits `_inflight[key]` and deletes `_chainCache[key]`. This eliminates the need to expose `_inflight` across modules.

---

## 5. Event Listeners

### 5.1 `Bus.onGlobal(...)` subscriptions

| Event | Handler | Line | IIFE | Notes |
|---|---|---|---|---|
| `page:change` | `_pageCleanup` (removes keydown listener on session end) | 2010–2012 | M9-ISA | Registered inside `runFlashcardSession` per session. **LEAK RISK**: Bus has no `offGlobal`, so handlers accumulate on every session start. Mitigated by the closure no-op pattern once `__fcKeyCleanup` is nulled. |
| `page:change` | debounced 1.5s + 30s throttle → `renderHistory`/`updateStatus`/`updateMemory` | 2794–2810 | M-AI | Registered ONCE at module init (single handler, no accumulation) |

### 5.2 `document.addEventListener(...)`

| Event | Handler | Line | IIFE | Cleanup |
|---|---|---|---|---|
| `keydown` (flashcard session shortcuts: 1/2/3/4 + Space) | `keyHandler` | 1987 | M9-ISA | `bodyEl.__fcKeyCleanup` removes it on session end OR `page:change` (via Bus listener). **GOTCHA**: if user starts a new session before old one ends, the old `keyHandler` is replaced via the `else` branch (lines 1993–1998) — no leak, but stale closure could fire briefly. |
| `keydown` (esc closes summary modal) | `escHandler` | 2178 | M9-ISA | Removed by `close()` (line 2171). v80-FIX BUG 6 ensured `close()` is reachable from X/backdrop/Esc. |

### 5.3 `addEventListener` on elements

| Element | Event | Line | IIFE |
|---|---|---|---|
| `fab` | click → `toggle` | 2784 | M-AI |
| `fab` | click (once) → sets `gdi-ai-seen` in SS | 2861 | M-AI |
| `#gdi-ai-close` | click → close panel | 2785 | M-AI |
| `sendBtn` | click → `send` | 2786 | M-AI |
| `input` | keydown Enter → `send` | 2787 | M-AI |
| `.gdi-ai-quick` (×3) | click → inject prompt + `send` | 2587–2617 | M-AI |
| Various `flashcards()` elements | click (theme/disc expand, study buttons, add form) | 1636–1785 | M9-ISA |
| `#gdi-fc-add-b` | keydown Enter → saveNewCard(true) | 1785 | M9-ISA |
| `renderThemeCardsPaginated` cards | click → flip; delete btn → remove | 1828–1845 | M9-ISA |
| `runQuizSession` buttons | click (answer, skip) | 1376–1419 | M9-ISA |
| `runFlashcardSession` buttons | click (grade 1/2/3/4, skip) | 1970–1975 | M9-ISA |

### 5.4 `setInterval`/`setTimeout`

| ID | Type | Delay | Purpose | Line | IIFE |
|---|---|---|---|---|---|
| 1 | setTimeout | 300ms | `window.print()` in `downloadAsPdf` popup | 694 | M9-ISA (inside HTML string) |
| 2 | setTimeout | 300ms | Re-render flashcards after summary gen | 1523 | M9-ISA |
| 3 | setTimeout | 1500ms | Re-render flashcards after error | 1527 | M9-ISA |
| 4 | setTimeout | 50ms | Focus add-f input | 1728 | M9-ISA |
| 5 | setTimeout | 100ms | Restore subject/theme + focus add-f after re-render | 1763 | M9-ISA |
| 6 | setTimeout | 100ms | Focus #gdi-fc-good after flip | 1943 | M9-ISA |
| 7 | setTimeout | 5000ms | Remove errEl in send() | 2757, 2766 | M-AI |
| 8 | setTimeout | 100ms | Focus input after toggle open | 2782 | M-AI |
| 9 | setTimeout (debounce `_memDebounce`) | 1500ms | Update memory after page:change | 2801 | M-AI |
| 10 | setTimeout | 500ms | Auto-open panel if `gdi-meggy-open==='1'` | 2814 | M-AI |
| 11 | setTimeout | 8000ms | Show FAB badge if never opened | 2859 | M-AI |
| 12 | setTimeout | 8000ms | Auto-hide suggest banner | 2886 | M-AI |

**No `setInterval` is registered in this file** (good — no accumulating intervals).

---

## 6. External Dependencies

### 6.1 Globals from OTHER files used by gdi-meggy.js

| Global | Source | Used in | Purpose |
|---|---|---|---|
| `Bus` (specifically `Bus.onGlobal`) | gdi-core.js | line 2010 (M9-ISA), 2794 (M-AI) | Event bus |
| `showToast` | gdi-core.js | many places | Toast notifications |
| `GDI_ROOT()` | gdi-core.js | line 2545, 2875 | Returns root element (outside body) for widget |
| `window.marked` | marked.js (CDN) | `renderMd` (both IIFEs) | Markdown parser |
| `window.gdiSanitize` | gdi-sanitize.js (or similar) | `renderMd` (both IIFEs) | HTML sanitizer |
| `window.GDIStorage` | gdi-storage.js | lines 659, 2201 | Drive material save/list |
| `window.gdiModal` | gdi-modal.js (or gdi-core) | line 2361 | Confirm dialog |
| `window.playlistVideos`, `window.currentIndex` | app.min.js | line 719 | Playlist state (for `realLessonName`) |
| `window.gdiGradeCard` | gdi-core.js (SRS) | line 1950 | SM-2 flashcard grading |
| `window.gdiSrsIntervals` | gdi-core.js (SRS) | lines 1921, 1924 | SRS interval table |
| `window.gdiAchievements` | gdi-core.js | line 1964 | Achievement checks |
| `window.__gdiGradeQ` | gdi-study.js or gdi-core.js | lines 1386, 1404 | Quiz question grading |
| `window.CACHE_VERSION` | gdi-core.js | lines 2550, 2557 | Cache-buster for Meggy PNG |
| `window.ai.languageModel` / `window.LanguageModel` | Chrome 127+ | `detectBrowserAI`, `getBrowserSession` | Browser-side Gemini Nano |

### 6.2 Functions from gdi-meggy.js called by OTHER files

| Export | Called by | Line in caller | Purpose |
|---|---|---|---|
| `window.gdiIsaPdf.summary(items, bodyEl, base)` | gdi-core.js | 1100 | M9 materials "Resumo Meggy" tab |
| `window.gdiIsaPdf.questions(items, bodyEl, base)` | gdi-core.js | 1104 | M9 materials "Questões" tab |
| `window.gdiIsaPdf.mindmap(items, bodyEl, base)` | gdi-core.js | 1108 | M9 materials "Pílulas" tab |
| `window.gdiIsaPdf.flashcards(items, bodyEl, base)` | gdi-core.js | 1112 | M9 materials "Flashcards" tab |
| `window.gdiIsaPdf.fetchSharedQuestions(courseFilter)` | gdi-study.js | 475–476 | Enrich Simulado question bank |
| `window.gdiIsaPdf.startBattalion(courseKey, coursePath, lessonName, pdfList)` | gdi-study.js | 885–886, 2485–2486, 2605–2620 | Trigger AI battalion on course add (3 call sites) |
| `window.gdiIsaPdf.extractPdfText(url)` | gdi-study.js | 2606, 2613, 4048, 4050 | Extract PDF text in Simulado/Redação flows |
| `window.gdiIsaPdf.saveEssayMD(md, banca, tipo, score)` | gdi-study.js | 4113–4114 | Save corrected essay to Drive |
| `window.renderResumos(body)` | gdi-study.js | 1427 | Resumos tab content |
| `window.gdiSubjects.get/save/delete/LS` | gdi-study.js | 3276, 3280, 3293, 3334, 3346, 3404 | Manual subjects CRUD |
| `window.__gdiParseJsonArray` | gdi-study.js | 75–76 | Robust JSON parsing |
| `window.gdiEnsurePdfjs()` | gdi-core.js | 1015 (and own fallback at 235) | Idempotent pdf.js loader |
| `window.__gdiMeggySuggest(text, action)` | **NOWHERE** (only README/manual reference) | — | Suggestion banner — **dead public API** (still exported, never called) |

**Important:** `gdi-worker-bridge.js` (lines 249–309) does a monkey-patch dance:
1. Captures `window.gdiIsaPdf.extractPdfText` reference
2. Replaces it with a wrapper that first tries the meggy-pdf-worker (Web Worker), then falls back to the original
3. Uses `window.gdiIsaPdf._origExtractPatched` flag to avoid double-patching
4. Polls for up to 60 tries (1s each) waiting for `gdiIsaPdf` to appear

This means: **`window.gdiIsaPdf.extractPdfText` must remain a reassignable function property** after modularization (do NOT freeze the object).

---

## 7. Recommended Split

**6 files under `modular/meggy/`**, each with its own IIFE guard and a shared-state namespace. Total ~2900 lines (current 2888 + headers/guards overhead).

Load order: `meggy-utils.js` → `meggy-pdf-engine.js` → `meggy-cache.js` → (`meggy-questions.js` \|\| `meggy-flashcards.js`) → `meggy-summaries.js` → `meggy-widget.js`. Order matters because each module reads `window.__gdiMeggy.*` helpers from earlier modules.

### 7.1 `modular/meggy/meggy-utils.js` (~280 lines)

**Contains:**
- M9-ISA IIFE guard (`window.__gdiM9Isa`)
- Constants: `LS_SUM`, `LQ`, `esc`, `lsGet`, `lsSet`, `uid`
- Functions: `parseJsonArray`, `renderMd`, `setLoading`, `setError`, `lessonKey`, `realLessonName`, `callIsa`, `callIsaKeyed`
- CSS block for `.gdi-mat-isa-*` styles (lines 102–140, shared by summary/questions/mindmap/flashcards UIs)
- **NEW:** Exposes `window.__gdiMeggy = window.__gdiMeggy || {}` namespace, populates `__gdiMeggy.utils = {esc, lsGet, lsSet, uid, renderMd, setLoading, setError, lessonKey, realLessonName, callIsa, callIsaKeyed, parseJsonArray}`

**Exports:**
- `window.__gdiParseJsonArray` (preserved for backward compat with gdi-study.js:76)
- `window.__gdiMeggy.utils.*`
- `window.realLessonName` (NEW — expose it so M-AI widget's `typeof window.realLessonName === 'function'` check at line 2594 returns true and the inline extraction fallback becomes the secondary path. Optional but cleaner.)

**Imports:** none (lowest layer)

### 7.2 `modular/meggy/meggy-pdf-engine.js` (~270 lines)

**Contains:**
- `window.gdiEnsurePdfjs` (with the `if(!window.gdiEnsurePdfjs)` guard — preserves gdi-core.js's fallback)
- `ensurePdfjs` (local wrapper)
- `ensureTesseract`
- `tesseractPromise` (module-level state)
- `ocrPdfPage`
- `getFileType`
- `extractTextFile`
- `extractPdfText` (the 142-line core extraction function)

**Exports:** `window.__gdiMeggy.pdf = {ensurePdfjs, extractPdfText, getFileType, extractTextFile}`. Also keeps `window.gdiEnsurePdfjs` as before (gdi-core.js also defines it as fallback).

**Imports:** `window.__gdiMeggy.utils` (none strictly required, since `extractPdfText` doesn't use utils)

### 7.3 `modular/meggy/meggy-cache.js` (~310 lines)

**Contains:**
- Shared state: `_chainCache`, `_inflight`, `_chainCacheMax`, `_qWriteChain` (moved here for centralized coordination)
- `GRANULAR_AVAILABLE`
- `cacheGet`, `cacheSave`
- `addQ`, `addQBatch`
- `extractQuestionsFromText`
- `saveIsaSummary`, `listIsaSummaries`, `delIsaSummary`
- `downloadAsPdf`, `copySummary`
- `autoCreateFlashcards` (small helper, can stay here OR move to flashcards — keep here since it's called by `generateAll`)
- **`generateAll`** (the 220-line heart)
- `regenerate` (must stay with `generateAll` because it reads `_inflight[key]` and deletes `_chainCache[key]`)

**Exports:** `window.__gdiMeggy.cache = {generateAll, regenerate, cacheGet, cacheSave, saveIsaSummary, listIsaSummaries, delIsaSummary, downloadAsPdf, copySummary, addQ, addQBatch, _chainCache, _inflight, _qWriteChain}`

**Imports:** `window.__gdiMeggy.utils.{lessonKey, realLessonName, callIsa, callIsaKeyed, parseJsonArray}`, `window.__gdiMeggy.pdf.extractPdfText`, `window.__gdiMeggy.flashcards.autoCreateFlashcards` (forward ref — see load order), `window.__gdiMeggy.questions.extractQuestionsFromText` (forward ref)

**Note on forward refs:** Since JS modules load top-down, either:
- (a) Load order ensures `meggy-questions.js` and `meggy-flashcards.js` BEFORE `meggy-cache.js`, then move `generateAll`/`regenerate` to load last
- (b) Use late-binding: `generateAll` calls `window.__gdiMeggy.questions.addQBatch(...)` instead of the closure-private `addQBatch(...)`. This is safer and decouples load order.

**Recommendation: option (b) — late-bind via `window.__gdiMeggy.*` everywhere.** Allows any load order; tiny perf cost (one property lookup per call, negligible).

### 7.4 `modular/meggy/meggy-questions.js` (~420 lines)

**Contains:**
- `ANSWERED_KEY` constant
- `getAnsweredIds`, `markAnswered`
- `questions` flow (calls `generateAll` → `startQuizFromBank`)
- `generateQuestions` (round-robin PDF cursor)
- `window.__gdiPdfCursor` (kept on window for backward compat)
- `startQuizFromBank`
- `runQuizSession` (with nested `draw()`)

**Exports:** `window.__gdiMeggy.questions = {questions, generateQuestions, startQuizFromBank, runQuizSession, addQ, addQBatch, extractQuestionsFromText, getAnsweredIds, markAnswered}`. Also keeps `window.__gdiPdfCursor` (legacy).

**Imports:** `window.__gdiMeggy.utils.{setLoading, setError, realLessonName, callIsa, parseJsonArray}`, `window.__gdiMeggy.pdf.extractPdfText`, `window.__gdiMeggy.cache.{generateAll, cacheGet, cacheSave, addQBatch}`

### 7.5 `modular/meggy/meggy-flashcards.js` (~620 lines)

**Contains:**
- `LS_SUBJECTS` constant
- `getSubjects`, `saveSubject`, `deleteSubject`
- `extractDisciplineTheme`, `normPath`, `stripExt`
- `autoCreateFlashcards`
- `flashcards` (316 lines, the big library renderer)
- `saveNewCard` (nested in `flashcards`)
- `renderThemeCardsPaginated` (with nested `renderPage()`)
- `runFlashcardSession` (with nested `draw()`)
- CSS block for `.gdi-fc-*` styles (lines 142–234)

**Exports:** `window.gdiSubjects = {get, save, delete, LS}` (preserved for gdi-study.js callers), `window.__gdiMeggy.flashcards = {flashcards, autoCreateFlashcards, runFlashcardSession, renderThemeCardsPaginated}`

**Imports:** `window.__gdiMeggy.utils.{esc, lsGet, lsSet, uid, renderMd, setLoading, setError, realLessonName, lessonKey, showToast}`, `window.gdiIsaPdf.summary` (via window, for "Gerar com a Meggy" button), `window.gdiGradeCard`, `window.gdiSrsIntervals`, `window.gdiAchievements`, `Bus`

### 7.6 `modular/meggy/meggy-summaries.js` (~640 lines)

**Contains:**
- `renderSummaryCard`
- `summary` flow
- `mindmap` flow
- `fetchSharedQuestions`, `saveEssayMD`, `startBattalion`, `getBattalionStatus`, `saveSharedSummary`, `fetchSharedSummaries`
- `_summaryModal`
- `window.renderResumos` (180-line tab renderer)
- **The `window.gdiIsaPdf` public API object assembly** (line 2133 equivalent) — assigns all 16 methods from this module + earlier modules into the public object

**Exports:** `window.gdiIsaPdf = {summary, questions, mindmap, flashcards, regenerate, extractPdfText, saveIsaSummary, listIsaSummaries, delIsaSummary, downloadAsPdf, fetchSharedQuestions, fetchSharedSummaries, saveSharedSummary, saveEssayMD, startBattalion, getBattalionStatus}` (assembled from `window.__gdiMeggy.*` references), `window.renderResumos`

**Imports:** `window.__gdiMeggy.utils.*`, `window.__gdiMeggy.cache.{generateAll, regenerate, cacheGet, cacheSave, saveIsaSummary, listIsaSummaries, delIsaSummary, downloadAsPdf, copySummary}`, `window.__gdiMeggy.questions.questions`, `window.__gdiMeggy.flashcards.flashcards`, `window.GDIStorage`, `window.gdiModal`, `showToast`, `esc`, `renderMd`

### 7.7 `modular/meggy/meggy-widget.js` (~510 lines)

**Contains:** the ENTIRE current M-AI IIFE verbatim:
- M-AI IIFE guard (`window.__gdiAiWidget`)
- Constants: `MEGGY_NAME`, `MEGGY_AVATAR`, `MEGGY_TAG`, `ISA_SYS`, `STORE`
- Module-level state: `messages`, `_browserAIState`, `_browserSession`, `_providerLabel`, `MEMORY_KEY`, `busy`, `_serverEnabled`, `_serverProvider`, `typingEl`, `_memDebounce`
- Local helpers: `renderMd`, `esc`, `_meggyLsGet`, `_meggyLsSet`
- Functions: `save`, `detectBrowserAI`, `getBrowserSession`, `callBrowserAI`, `updateStatus`, `addMsg`, `renderHistory`, `showTyping`, `hideTyping`, `loadMemory`, `saveMemory`, `updateMemory`, `buildMemoryContext`, `send`, `toggle`, `hideWidget`, `showWidget`, `checkServerStatus`, `serverLabel`
- DOM construction (fab, panel)
- Event wiring (Bus.onGlobal page:change, fab/close/send/keydown listeners, quick actions)
- Init: `Promise.all([detectBrowserAI(), checkServerStatus()]).then(...)`
- `window.__gdiMeggySuggest`
- CSS block for `#gdi-ai-*` styles (lines 2398–2465)

**Exports:** `window.__gdiMeggySuggest` (preserved — even though unused, keep for backward compat and future use)

**Imports:** `Bus`, `GDI_ROOT()`, `window.CACHE_VERSION`, `window.marked`, `window.gdiSanitize`. Does NOT need `window.__gdiMeggy.*` from M9-ISA modules — fully decoupled.

### 7.8 Summary table

| Module | Lines | Functions | Exports | Loads after |
|---|---|---|---|---|
| `meggy-utils.js` | ~280 | 12 | `window.__gdiMeggy.utils.*`, `window.__gdiParseJsonArray`, `window.realLessonName` | (first) |
| `meggy-pdf-engine.js` | ~270 | 7 | `window.__gdiMeggy.pdf.*`, `window.gdiEnsurePdfjs` | utils |
| `meggy-cache.js` | ~310 | 14 | `window.__gdiMeggy.cache.*` | utils, pdf-engine |
| `meggy-questions.js` | ~420 | 9 | `window.__gdiMeggy.questions.*`, `window.__gdiPdfCursor` | utils, pdf-engine, cache |
| `meggy-flashcards.js` | ~620 | 11 | `window.gdiSubjects`, `window.__gdiMeggy.flashcards.*` | utils, pdf-engine |
| `meggy-summaries.js` | ~640 | 9 + assembles `window.gdiIsaPdf`, `window.renderResumos` | all earlier (late-bind) | all M9-ISA modules |
| `meggy-widget.js` | ~510 | 22 | `window.__gdiMeggySuggest` | independent (can load anytime) |

**Total: ~3050 lines (2888 original + ~160 in guards/headers/namespace boilerplate).**

---

## 8. Risks & Gotchas

### 8.1 Closures across IIFE boundaries
**Already broken in v1.0.84 — confirmed safe.** The M-AI widget's only reference to M9-ISA's `realLessonName` (line 2594) was always-false because `realLessonName` was closure-private. The v1.0.84 fix (inline extraction from `document.title`/URL) means M-AI no longer needs M9-ISA's `realLessonName`. After split, optionally expose `realLessonName` on `window` from `meggy-utils.js` so the existing check at line 2594 finally returns true (minor improvement, not required).

### 8.2 `_chainCache`, `_inflight`, `_qWriteChain` coordination
- `_qWriteChain` is ONLY read/written by `addQBatch` — keep them in the same module (meggy-cache.js). No cross-module coordination needed.
- `_inflight` is read by `generateAll` (sets it) AND `regenerate` (awaits it). **Keep `generateAll` and `regenerate` in the same module** (meggy-cache.js). If they end up in different modules, expose `_inflight` via `window.__gdiMeggy.cache._inflight` and have `regenerate` read it from there.
- `_chainCache` is read/written by `generateAll` and deleted (by key) by `regenerate`. Same module = safe. v1.0.84 already fixed the bug where `_chainCache={}` wiped all lessons; the modularization must preserve the `delete _chainCache[key]` semantics.

### 8.3 `realLessonName` scope (already addressed in v1.0.84)
- Current state: `realLessonName` is closure-private in M9-ISA IIFE. M-AI widget's `typeof window.realLessonName === 'function'` is always false.
- After split: exposing `realLessonName` on `window` from `meggy-utils.js` would make the check pass, returning the playlist-aware name. The v1.0.84 inline fallback becomes the secondary branch. **Optional improvement**, low risk.

### 8.4 PDF.js worker lifecycle
- `window.gdiEnsurePdfjs` is defined BOTH in gdi-meggy.js (line 242) AND in gdi-core.js (line 235, as `window.gdiEnsurePdfjs = window.gdiEnsurePdfjs || function(){...}`). The gdi-core.js definition wins if it loads first; gdi-meggy.js's `if(!window.gdiEnsurePdfjs)` guard preserves whichever loaded first.
- After split: `meggy-pdf-engine.js` keeps the `if(!window.gdiEnsurePdfjs)` guard so the gdi-core.js fallback still works. The two implementations are functionally equivalent — both load pdfjs-dist@3.11.174 from jsdelivr and set workerSrc once. No risk.
- `window._pdfjsPromise` is the memoization slot — shared between gdi-core.js and gdi-meggy.js. After split, keep using `window._pdfjsPromise` (do not move to module-local).

### 8.5 `gdiIsaPdf.extractPdfText` monkey-patch by gdi-worker-bridge.js
- `gdi-worker-bridge.js` (lines 249–309) does a runtime monkey-patch on `window.gdiIsaPdf.extractPdfText` to wrap it with a Web Worker offloader.
- It captures `_origExtractPdfText = window.gdiIsaPdf.extractPdfText` BEFORE patching, then on each call tries the worker first and falls back to `_origExtractPdfText`.
- It uses `window.gdiIsaPdf._extractPatched = true` flag to avoid double-patching, and polls 60×1s waiting for `gdiIsaPdf` to appear.
- **Risk after split:** If `meggy-summaries.js` (which assembles `window.gdiIsaPdf`) loads AFTER `gdi-worker-bridge.js`, the bridge's polling will eventually pick it up (60s window). If `meggy-summaries.js` re-assigns `window.gdiIsaPdf` after the bridge has already patched it, the patch is lost.
- **Mitigation:** assemble `window.gdiIsaPdf` exactly once (in `meggy-summaries.js`), at module-init time, with `if(!window.gdiIsaPdf)` guard. Do NOT reassign it elsewhere.
- **Worse case:** if the bridge patches `extractPdfText`, then `meggy-summaries.js` overwrites `window.gdiIsaPdf = {...}` with a fresh object containing the un-patched `extractPdfText`. The bridge's `_extractPatched` flag is on the OLD object — the new object has no such flag. The bridge's 60×1s poll would re-patch the new object. As long as the bridge keeps polling (which it does for 60s), this self-heals. After 60s, no further patching — if `meggy-summaries.js` reassigns after that, the patch is permanently lost.
- **Recommendation:** `meggy-summaries.js` MUST use `if(!window.gdiIsaPdf) window.gdiIsaPdf = {...};` and NEVER reassign. Better: assemble it once with `Object.assign(window.gdiIsaPdf || (window.gdiIsaPdf = {}), {...})` so the bridge's patch (which assigned `_origExtractPdfText` and `_extractPatched` on the existing object) is preserved.

### 8.6 Event listener accumulation
- `Bus.onGlobal('page:change', _pageCleanup)` is registered INSIDE `runFlashcardSession` (line 2010) — once per session start. Bus has no `offGlobal`. The closure no-ops after `__fcKeyCleanup` is nulled (lines 2004–2009), so handlers don't fire uselessly, but they DO accumulate in Bus's internal listener array. For a long session with many flashcard study starts, this could grow.
- **Risk after split:** unchanged — the same code moves to `meggy-flashcards.js`. No new risk introduced.
- **Recommendation for future:** add `Bus.offGlobal(event, handler)` to gdi-core.js. Out of scope for this study.

### 8.7 `__gdiMeggySuggest` is a dead export
- Defined at line 2868, exported on `window.__gdiMeggySuggest`.
- Searched the entire codebase (`/home/z/my-project`): no caller found.
- Only referenced in `README.md:126` and `MANUAL_TECNICO.md:316` as a feature description.
- **Action:** preserve the export for backward-compat (in case external scripts or future code calls it). Move it to `meggy-widget.js` (it's already in the M-AI IIFE).

### 8.8 Quick action lesson context
- The v1.0.84 fix at line 2590–2609 inlines the lesson-name extraction. After split, this code stays in `meggy-widget.js` unchanged. Optionally, expose `realLessonName` on `window` (from `meggy-utils.js`) and simplify the quick-action handler to `lessonName = window.realLessonName('')` with the inline extraction as fallback. Low priority.

### 8.9 Two `renderMd` and two `esc` implementations
- M9-ISA IIFE defines `renderMd` (line 531) and `esc` (line 36).
- M-AI IIFE RE-DEFINES them (lines 2474 and 2485) with identical logic (minor: M-AI's `esc` doesn't escape quotes; M9-ISA's does).
- After split: `meggy-utils.js` exposes the canonical versions. `meggy-widget.js` can either (a) keep its own copies (zero risk, slight duplication), or (b) use `window.__gdiMeggy.utils.renderMd` (cleaner).
- **Recommendation:** option (a) for the first modularization pass — minimize behavior change. Refactor to (b) in a follow-up.

### 8.10 Load order tolerance
- If `meggy-widget.js` loads BEFORE `meggy-utils.js`, no problem (it doesn't depend on it).
- If `meggy-summaries.js` loads BEFORE `meggy-cache.js`, the `window.gdiIsaPdf` object would be missing `generateAll`/`regenerate` references. Late-binding (`window.__gdiMeggy.cache.generateAll` accessed at call-time, not at module-init time) fixes this.
- **Critical:** the `gdiIsaPdf` object assembly in `meggy-summaries.js` MUST use function references that resolve at call-time. Two patterns work:
  - (a) Wrap each method: `summary: (...args) => window.__gdiMeggy.summaries.summary(...args)` (always late-bind)
  - (b) Assemble the object AFTER all modules loaded (e.g., on `DOMContentLoaded`)
- **Recommendation:** pattern (a) — wrap each method in an arrow function that re-resolves from `window.__gdiMeggy.*` at call time. Cost: one extra property lookup per call. Benefit: load-order-independent.

---

## 9. Migration Strategy (suggested, out of study scope)

1. **Phase 1:** Create `modular/meggy/` directory. Copy `gdi-meggy.js` to `gdi-meggy.js.v86-bak`.
2. **Phase 2:** Extract `meggy-widget.js` first (it's the most decoupled — entire M-AI IIFE moves verbatim). Test that FAB + chat still works.
3. **Phase 3:** Extract `meggy-utils.js` (constants + helpers + CSS). Test that other modules still find `__gdiParseJsonArray`.
4. **Phase 4:** Extract `meggy-pdf-engine.js`. Test that `extractPdfText` still works (and `gdi-worker-bridge.js` monkey-patch still finds `window.gdiIsaPdf.extractPdfText`).
5. **Phase 5:** Extract `meggy-cache.js` (with `generateAll` + `regenerate` + shared state). Test that the summary/questions/mindmap flows still chain correctly.
6. **Phase 6:** Extract `meggy-questions.js` and `meggy-flashcards.js` (can be done in parallel). Test quiz session + flashcard library + SRS grading.
7. **Phase 7:** Extract `meggy-summaries.js` (with `window.gdiIsaPdf` assembly + `renderResumos`). Test Resumos tab + battalion triggers from gdi-study.js.
8. **Phase 8:** Delete original `gdi-meggy.js`. Update `gdi-loader.js` (or wherever script tags are listed) to load the 6 new files in order.
9. **Phase 9:** Run end-to-end browser test (login → add course → escanear → Meggy FAB → quick actions → flashcards → quiz → Resumos tab).

**Estimated effort:** 4-6 hours of careful refactoring + 2 hours of testing.

---

## 10. Final Verification

- File length confirmed: 2888 lines (per `wc -l`).
- IIFE count confirmed: 2 (per grep `^\(function\(\)\s*\{`).
- Function count confirmed: 78 total (per grep `^\s*(async\s+)?function\s+`).
- Window exports confirmed: 8 (per grep `window\.[a-zA-Z_]+[ ]*=`).
- External callers of `gdiIsaPdf.*` confirmed: gdi-core.js (4 sites), gdi-study.js (8 sites), gdi-worker-bridge.js (1 monkey-patch site).
- `__gdiMeggySuggest` confirmed unused (no caller in `/home/z/my-project` outside the definition file).
- `Bus.onGlobal` confirmed: 2 sites (M9-ISA line 2010 inside `runFlashcardSession`, M-AI line 2794 at module init).
- `setInterval` confirmed: 0 in this file (good).
- `setTimeout` confirmed: 12 sites (all listed in §5.4).

---

**End of study.**
