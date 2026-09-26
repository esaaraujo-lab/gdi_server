# STUDY: gdi-study.js — Modularization Plan

**File:** `/home/z/my-project/student_gdi/modular/gdi-study.js`
**Total lines:** 5126
**Task ID:** v86-STUDY-STUDY-JS
**Agent:** Explore
**Date:** 2025-09-27

> This is a **STUDY ONLY** document — no source files were modified.
> Goal: prepare a clean modularization plan that preserves 100% of the
> current behavior and all `window.*` public APIs.

---

## 1. Top-Level Structure

### 1.1 IIFE boundaries (6 top-level IIFEs + 1 nested)

| # | Module name | Start | End | Lines | Purpose |
|---|---|---|---|---|---|
| 1 | **M23 — Estudo Ativo** | 21 | 735 | 715 | Banco de questões, simulado, cronograma, revisões (calendar) |
| 2 | **M22 — Área do Aluno** (the big one) | 739 | 3805 | 3067 | Full-screen panel: sidebar + tabs dispatch + home dashboard + drives browser + add-course modal + course detail + onboarding + nav-button inject + URL auto-open + flashcards/marathon/subjects/trails API stubs (tabs removed but functions preserved) |
| 2a | ↳ nested IIFE: `tryOpenFromURL` | 3746 | 3803 | 58 | URL `?central=…` auto-opener (nested inside M22) |
| 3 | **M24 — Estudo Avançado** | 3812 | 4231 | 420 | Provas anteriores (PDF→plano), Redação (correção por banca), Mapa de Fracos (radar) |
| 4 | **BlackTie — Tema Visual** | 4241 | 4416 | 175 | CSS injection (Ferreto tokens + fonts + component theming); guard `window.__gdiFerretoExtras` |
| 5 | **M-PLAYER-GUARD** | 4428 | 4564 | 135 | Video stall watchdog (retry + overlay + play hint) |
| 6 | **M-COURSE-SCANNER** | 4580 | 5115 | 535 | Background course scanner + auto-scan + orphan cleanup + `syncCoursesFromDrive` |

### 1.2 Module registration pattern

The file uses **two patterns**:

1. **`window.GDI_MODULES.push({name, init})`** — modules that need a post-navbar init hook
   - Line 3722: `{name:'central-nav', init: scheduleNavInject}`
   - Line 4558: `{name:'player-guard', init: () => attach(document.querySelector('.gdi-player-wrap video'))}`

2. **`window.X = function…`** — direct global exports (no central registry)

There is **no** `window.GDI_MODULES.push({name, init})` for the file as a whole; each IIFE self-bootstraps via top-level `setTimeout`/`Bus.onGlobal` calls inside its own scope.

### 1.3 Window exports (full inventory, with line numbers)

| Line | Export | Owner IIFE |
|---|---|---|
| 102 | `window.renderQuestoes` | M23 |
| 431 | `window.renderSimulado` | M23 |
| 581 | `window.renderCronograma` | M23 |
| 674 | `window.renderRevisoes` | M23 |
| 732 | `window.__gdiGradeQ` | M23 |
| 760 | `window.gdiAddCourseFromButton` | M22 |
| 794 | `window.gdiAddCourseFromDrive` | M22 |
| 1083 | `window.collectCourses` | M22 |
| 1305 | `window.__gdiOpenCentral` | M22 |
| 1415 | `window.__gdiCurrentTab` (write-only runtime flag) | M22 |
| 1639 | `window.__gdiSyncInProgress` (write-only runtime flag) | M22 |
| 2129 | `window.renderCursos` | M22 |
| 2130 | `window.gdiRefreshCentralPanel` | M22 |
| 3182 | `window.renderFlash` | M22 (legacy API stub) |
| 3271 | `window.renderMarathon` | M22 (legacy API stub) |
| 3416 | `window.renderSubjects` | M22 (legacy API stub) |
| 3545 | `window.renderTrails` | M22 (legacy API stub) |
| 3834 | `window.renderProvas` | M24 |
| 3977 | `window.renderRedacao` | M24 |
| 4142 | `window.renderRadar` | M24 |
| 4224 | `window._qFilterSubject` (write-only runtime flag, used by M24→M23) | M24 |
| 4242 | `window.__gdiFerretoExtras` (guard) | BlackTie |
| 4961 | `window.gdiSyncCoursesFromDrive` | M-COURSE-SCANNER |
| 5038 | `window.gdiCourseScanner` (object with 9 methods + 4 constants) | M-COURSE-SCANNER |
| 5056 | `window.gdiCleanupOrphanCourses` | M-COURSE-SCANNER |

### 1.4 Module-scope constants

| IIFE | Line | Constants |
|---|---|---|
| M23 | 22 | `LQ, LS_SRS, LS_SIM, LS_CRON, LS_ERR` (localStorage keys) |
| M23 | 23-28 | `esc, lsGet, lsSet, today, fmtDate, uid` (utility helpers) |
| M23 | 42 | `BOX_INTERVALS = [1,3,7,21,60]` (Leitner SRS) |
| M23 | 99-101 | `_qFilterSubject, _qShown, QPAGE=20` (pagination state) |
| M22 | 740 | `LS_CARDS, LS_GOAL, LS_WATCH, LS_MAR, LS_MARINTRO, LS_HIDDEN` |
| M22 | 741-752 | `log, dec, norm, low, stripExt, lsGet, lsSet, esc, fmtMin, dayKey, dateBr` (utility helpers) |
| M22 | 968 | `rescue, rescueAt` (mutable userstate cache) |
| M22 | 1096 | `GW` (generic-word regex for `isGeneric`) |
| M22 | 1112-1113 | `vCache (Map), VCACHE_MAX=1000, VCACHE_TTL=5min` |
| M22 | 1135 | `bestInCache (Map)` |
| M22 | 1168 | `playing, mark` (mutable media state) |
| M22 | 1184-1185 | `todayMin, goalMin` (helpers) |
| M22 | 1207-1208 | `marOn, marIntro` (helpers) |
| M22 | 1249-1253 | `cards, saveCards, dueCards, FC, panel, tab` (mutable state) |
| M22 | 1317 | `TAB_GROUPS` (sidebar config — const) |
| M22 | 3706 | `_navRaf` (coalescing id) |
| M24 | 3813-3831 | `esc, lsGet, lsSet, uid, inp` (utility helpers + CSS string) |
| Player-Guard | 4429-4430 | `STALL_MS=15000, FIRST_PLAY_HINT_MS=3500` |
| Scanner | 4584-4588 | `LS_SCAN_PREFIX, LS_LESSONS_PREFIX, SCAN_PAUSE_MS=500, SCAN_BATCH=1, SCAN_MAX_DEPTH=3` |
| Scanner | 4613 | `VIDEO_EXT` (regex) |
| Scanner | 4894 | `_autoScanRunning` (mutable flag) |

---

## 2. Function Inventory

Functions are grouped by IIFE. "Lines" = body span (end-start). "Exported?" = assigned to `window.*`.

### IIFE #1 — M23 Estudo Ativo (lines 21-735)

| Line | Function | Lines | Exported? | Summary | Internal deps | External deps |
|---|---|---|---|---|---|---|
| 30 | `fisherYates(arr)` | 1 | no | Fisher-Yates shuffle (replaces biased `sort(Math.random-.5)`) | — | — |
| 33 | `questions()` | 1 | no | Returns `lsGet(LQ,[])` | lsGet | — |
| 34 | `saveQ(q)` | 1 | no | Saves questions array | lsSet | — |
| 35 | `addQ(obj)` | 1 | no | Pushes a new question with `uid()` | questions, saveQ, uid | — |
| 36 | `delQ(id)` | 1 | no | Deletes by id | questions, saveQ | — |
| 37 | `getQ(id)` | 1 | no | Finds by id | questions | — |
| 40 | `qSrs()` | 1 | no | Returns SRS map | lsGet | — |
| 41 | `saveQSrs(s)` | 1 | no | Saves SRS map | lsSet | — |
| 43 | `gradeQ(id, acertou)` | 10 | no | Leitner box bump + due-date; pushes to error notebook on miss | qSrs, saveQSrs, lsGet, lsSet | — |
| 53 | `dueQ()` | 1 | no | Returns questions due now | questions, qSrs | — |
| 54 | `errQ()` | 1 | no | Returns questions in error notebook | questions, lsGet | — |
| 57 | `simus()` | 1 | no | Returns simulados history | lsGet | — |
| 58 | `saveSim(s)` | 1 | no | Saves simulados history | lsSet | — |
| 61 | `currentLesson()` | 4 | no | Reads `.gdi-file-header-name` textContent | — | DOM |
| 67 | `gerarViaISA(tema, n)` | 28 | no | POST `/api/ai` for N MC questions; parses JSON array | uid | `window.__gdiParseJsonArray`, fetch |
| 102 | `renderQuestoes(box)` | 150 | **window** | Renders questions tab with pagination (PAGE_SIZE=20) | questions, dueQ, errQ, qSrs, delQ, fmtDate, openGen, startSession, openAddForm, openImport, lsGet/Set | `window.showToast`, `GDI_ROOT()` |
| 137 | `drawSubjects()` (nested in renderQuestoes) | 22 | no | Subject filter pills | questions, _qFilterSubject | — |
| 160 | `drawList()` (nested in renderQuestoes) | 55 | no | Renders question list with pagination | questions, qSrs, _qFilterSubject, _qShown, QPAGE, delQ, fmtDate | — |
| 168 | `rowHtmlFor(q)` (nested in drawList) | 12 | no | HTML for one question row | qSrs, esc, fmtDate | — |
| 253 | `startSession(box, queue, titulo)` | 75 | no | Resolve a question queue (review/error) | saveSim, simus, uid, gradeQ, esc, lsGet/Set | `window.renderQuestoes`, `window.showToast` |
| 257 | `draw()` (nested in startSession) | 70 | no | Renders one question + handles answer | saveSim, simus, uid, gradeQ, esc, lsGet/Set | showToast |
| 330 | `openGen(parent, after)` | 36 | no | Modal: "Gerar questões com Meggy" | currentLesson, esc, gerarViaISA, addQ | `GDI_ROOT()`, showToast |
| 369 | `openAddForm(parent, after)` | 34 | no | Modal: manual question add | addQ, esc | `GDI_ROOT()`, showToast |
| 405 | `openImport(parent, after)` | 24 | no | Modal: import JSON questions | addQ, esc | `GDI_ROOT()`, showToast |
| 431 | `renderSimulado(box)` | 72 | **window** | Renders simulado tab (config + history) | questions, simus, collectCourses, esc, fmtDate, fisherYates, startSimulado | `window.gdiIsaPdf.fetchSharedQuestions`, showToast |
| 505 | `startSimulado(box, queue, mins)` | 73 | no | Runs a timed simulado with `setInterval` | gradeQ, saveSim, simus, uid, esc, lsGet/Set | `window.renderSimulado`, showToast |
| 508 | `draw()` (nested in startSimulado) | 35 | no | Renders one simulado question | esc | — |
| 545 | `finish()` (nested in startSimulado) | 28 | no | Computes score + saves | gradeQ, saveSim, simus, uid, lsGet/Set | `window.renderSimulado` |
| 581 | `renderCronograma(box)` | 89 | **window** | Renders cronograma tab (form + plan + pagination) | lsGet/Set, fmtDate, esc | `window.GDIUser.dump`, `window.playlistVideos`, showToast |
| 628 | `renderFuturas()` (nested in renderCronograma) | 25 | no | Renders future tasks list with pager | fmtDate, esc | — |
| 674 | `renderRevisoes(box)` | 45 | **window** | Renders review calendar | qSrs, questions, lsGet, esc | `window.GDIUser.dump` |

**M23 totals:** 27 functions, 715 lines, 5 window exports.

### IIFE #2 — M22 Área do Aluno (lines 739-3805)

| Line | Function | Lines | Exported? | Summary | Internal deps | External deps |
|---|---|---|---|---|---|---|
| 760 | `gdiAddCourseFromButton(btn)` | 32 | **window** | "✓ Adicionar" button handler — calls `gdiAddCourseFromDrive` | — | `window.gdiAddCourseFromDrive`, `window.showToast` |
| 794 | `gdiAddCourseFromDrive(path, name, pdfs)` | 167 | **window** | Persist course to localStorage + Drive + trigger battalion + scanner | lsGet/Set | `window.GDIStorage.saveCourse`, fetch, `window.gdiIsaPdf.startBattalion`, `window.gdiCourseScanner.startScan`, `window.gdiRefreshCentralPanel`, `window.renderCursos`, showToast |
| 968 | (state) `rescue, rescueAt` | — | no | userstate rescue cache | — | — |
| 969 | `ensureState()` | 7 | no | Fetch `/userstate` (60s cache) | rescue, rescueAt | fetch |
| 976 | `stateD()` | 4 | no | Returns `GDIUser.dump()` or rescue | rescue | `window.GDIUser` |
| 980 | `watchedLow(d)` | 5 | no | Set of lowercased watched paths | low | — |
| 985 | `courseKeyOf(p)` | 6 | no | Extract course key from path | norm | — |
| 991 | `courseName(ck)` | 6 | no | Pretty name from course key | dec | — |
| 997 | `driveNameOf(ck)` | 4 | no | Drive name from course key | — | `window.drive_names` |
| 1002 | `collectCourses()` | 81 | **window** | Build course list from manual courses + scanner data | stateD, lsGet, low, isHidden | `window.gdiCourseScanner.getScanProgress/countWatched` |
| 1085 | `hideCourse(ck)` | 5 | no | Hide course from list | lsGet/Set, low | — |
| 1090 | `unhideCourse(ck)` | 3 | no | Unhide course | lsGet/Set, low | — |
| 1093 | `listHiddenCourses()` | 3 | no | Returns hidden courses | lsGet | — |
| 1097 | `isGeneric(n)` | 5 | no | Detects generic lesson names ("Aula 1", "Vídeo 2", …) | stripExt, GW | — |
| 1102 | `realName(p)` | 9 | no | Picks non-generic name from path | norm, stripExt, isGeneric | — |
| 1114 | `vCacheGet(p)` | 6 | no | LRU+TTL cache get | vCache, VCACHE_TTL | — |
| 1120 | `vCacheSet(p, v)` | 4 | no | LRU+TTL cache set | vCache, VCACHE_MAX | — |
| 1124 | `exists(p)` | 9 | no | POST-checks if a path exists (cached) | vCacheGet, vCacheSet | fetch |
| 1133 | `ghost(p)` | 1 | no | Detects "X - X" ghost path | norm | — |
| 1136 | `bestIn(courseKey)` | 29 | no | Returns best "continue" path for a course (cached 60s) | bestInCache, stateD, low, ghost, exists, vCacheGet | — |
| 1166 | `Bus.onGlobal('watched:changed', …)` | 1 | — | Clears bestInCache | bestInCache | Bus |
| 1169-1171 | `document.addEventListener('play'/'pause'/'ended', …)` | 3 | — | Tracks video play time for `flushWatch` | playing, mark, flushWatch | — |
| 1172 | `flushWatch()` | 6 | no | Persists accumulated watch seconds to `LS_WATCH` | mark, playing, lsGet/Set, dayKey | — |
| 1179 | `setInterval(flushWatch, 30s)` | 5 | — | Gated by home-card/panel visibility | flushWatch, panel | — |
| 1186 | `updateGoalChip()` | 14 | no | Updates daily goal chip | todayMin, goalMin, fmtMin | DOM |
| 1202 | `setInterval(updateGoalChip, 20s)` | 4 | — | Gated by home-card/panel visibility | updateGoalChip, panel | — |
| 1207-1208 | `marOn, marIntro` | 2 | no | Marathon mode helpers | lsGet | — |
| 1209 | `marCourseKey()` | 7 | no | Course key for current playlist item | norm | `window.playlistVideos`, `window.currentIndex` |
| 1216 | `Bus.onGlobal('media:ready', …)` | 33 | — | Marathon: auto-play next unwatched on `ended`; skip intro on play | marOn, marIntro, marCourseKey, watchedLow, stateD, stripExt | Bus, `window.GDIUser.isWatched/getIntro`, `window.playlistVideos`, `window.switchVideo`, showToast |
| 1249-1253 | (state) `cards, saveCards, dueCards, FC, panel, tab` | — | no | Flashcards state + panel/tab state | — | — |
| 1258 | `showOnboarding()` | 23 | no | First-time-user welcome overlay (localStorage gated) | — | DOM |
| 1283 | `openPanel(t)` | 14 | no | Opens panel; renders after state ready | panel, ensureState, renderPanel, showOnboarding | `GDI_ROOT()` |
| 1297 | `closePanel()` | 7 | no | Closes panel + clears simulado timer | panel, FC | DOM |
| 1305 | `window.__gdiOpenCentral = openPanel` | — | **window** | Public alias for openPanel | — | — |
| 1341 | `renderSidebarHTML(dueCount)` | 15 | no | Returns sidebar HTML (uses TAB_GROUPS) | TAB_GROUPS, esc | — |
| 1359 | `renderHeaderHTML(streak, t, g, dueCount)` | 24 | no | Returns header HTML | fmtMin, esc | — |
| 1386 | `updateHeaderStats()` | 17 | no | Updates header streak/time/cards numbers | todayMin, goalMin, lsGet, fmtMin, panel | DOM |
| 1406 | `renderBody(currentTab)` | 32 | no | Dispatches to tab renderer | showAddCourseModal, renderHome, renderDrives, renderQuestoes, renderSimulado, renderCronograma, renderStats, renderAchievements | `window.renderResumos/Provas/Redacao/Radar` |
| 1439 | `renderPanel()` | 72 | no | Builds panel DOM (1st time) or updates stats | todayMin, goalMin, lsGet, renderHeaderHTML, renderSidebarHTML, updateHeaderStats, renderBody, panel, tab | DOM |
| 1513 | `renderDrives(box)` | 31 | no | Renders drives grid | esc | `window.drive_names`, `window.gdiCourseIdentity`, browseDriveInPanel, escHtml |
| 1546 | `browseDriveInPanel(box, path, title)` | 79 | no | Recursive drive browser inside panel | esc | `window.gdiGetPw`, `window.gdiListAllFiles`, `window.drive_names`, escHtml |
| 1628 | `renderHome(box)` | 236 | no | Home dashboard (hero + quick actions + course tiles with scan progress) | todayMin, goalMin, lsGet, collectCourses, cleanCourseName, driveNameOf, realName, esc, bestIn, renderBody, panel, tab | `window.gdiSyncCoursesFromDrive`, `window.__gdiCurrentTab`, `window.gdiCourseIdentity`, `window.gdiCourseScanner.startScan/clearScanState`, escHtml |
| 1866 | `renderAchievements(box)` | 31 | no | Renders achievements tab | esc | `window.gdiAchievements.getUnlocked/defs`, escHtml |
| 1899 | `cleanCourseName(ck)` | 12 | no | Pretty-print course name | courseName, driveNameOf | — |
| 1914 | `renderCursos(box)` | 213 | **window** | (Removed tab) Renders course list w/ search + pagination + restore hidden | collectCourses, listHiddenCourses, cleanCourseName, driveNameOf, lsGet, esc, showAddCourseModal, showHiddenCoursesModal, bestIn, realName, hideCourse, renderCourseCard | `window.gdiModal`, showToast, escHtml |
| 2008 | `renderCourseCard(grid, c, box, target)` (nested) | 105 | no | Renders one course tile | bestIn, realName, esc, cleanCourseName, driveNameOf, hideCourse, renderCursos, openCourseDetail | `window.gdiModal`, showToast, escHtml |
| 2130 | `gdiRefreshCentralPanel()` | 9 | **window** | Re-renders body of current tab (skips addmateria) | panel, tab, renderBody | — |
| 2142 | `showAddCourseModal(box)` | 511 | no | Big modal: Drive browser + Manual form | esc, lsGet/Set, renderCursos, doAddCourseFromDrive, showToast | `window.gdiListAllFiles`, `window.gdiGetPw`, `window.drive_names`, `window.gdiIsaPdf.startBattalion/extractPdfText`, `window.gdiAddCourseFromButton`, escHtml |
| 2222 | `setMode(m)` (nested) | 30 | no | Toggle drive/manual mode | — | — |
| 2262-2281 | `normPath, pathSegments, getDriveName, isFolder, getFolderPath, getFileName` (nested) | 20 | no | Path helpers | — | `window.drive_names` |
| 2283 | `renderBreadcrumb()` (nested) | 14 | no | Breadcrumb HTML | esc, getDriveName, pathSegments | — |
| 2299 | `normalizeNavPath(p)` (nested) | 5 | no | Normalize /0: → /0:/ | — | — |
| 2304 | `navigate(path)` (nested) | 134 | no | Drive navigation: lists folders, files, breadcrumb | esc, getFileName, getFolderPath, isFolder, renderBreadcrumb, normalizeNavPath, doAddCourseFromDrive | `window.gdiGetPw`, `window.gdiListAllFiles`, fetch |
| 2441 | `doAddCourseFromDrive(coursePath, courseName, pdfCount)` (nested) | 57 | no | Persist course + trigger battalion | lsGet/Set, renderCursos | fetch, `window.gdiIsaPdf.startBattalion`, showToast |
| 2527 | `close()` (nested) | 14 | no | Modal close handler (restores home tab if addmateria was active) | — | DOM |
| 2550 | `selectCurrentHandler(e)` (nested) | 8 | no | Capture-phase click handler for "Selecionar esta pasta" | — | `window.gdiAddCourseFromButton` |
| 2656 | `showHiddenCoursesModal(box)` | 51 | no | Modal listing hidden courses for restore | listHiddenCourses, cleanCourseName, driveNameOf, unhideCourse, lsSet, renderCursos | `window.gdiModal`, showToast, escHtml |
| 2709 | `openCourseDetail(box, c)` | 332 | no | Course detail view with disciplines grouping + scan button | cleanCourseName, driveNameOf, stateD, low, realName, collectCourses, bestIn, esc, lsGet, dateBr | `window.gdiCourseScanner.getScanProgress/getCourseLessons/clearScanState/startScan`, `window.gdiModal`, showToast, escHtml |
| 3042 | `renderStats(box)` | 75 | no | Stats tab: streak, heatmap, hours per course | stateD, ensureState, dayKey, dateBr, fmtMin, todayMin, lsGet, courseKeyOf, courseName, esc | escHtml |
| 3121 | `renderFlash(box)` | 60 | **window** (legacy) | Flashcards tab (REMOVED from sidebar, kept as API) | cards, dueCards, realName, norm, saveCards, studyFlash, esc | `window.gdiVideoKey`, escHtml, showToast |
| 3141 | `drawList()` (nested) | 27 | no | Renders flashcard list | cards, esc, saveCards | showToast |
| 3184 | `studyFlash(box)` | 67 | no | Flashcard study session with flip/grade | dueCards, renderFlash, FC, cards, saveCards | `window.gdiGradeCard`, escHtml, showToast |
| 3254 | `renderMarathon(box)` | 16 | **window** (legacy) | Marathon tab (REMOVED, kept as API) | marOn, marIntro, lsSet | showToast |
| 3275 | `renderSubjects(box)` | 67 | **window** (legacy) | Subjects tab (REMOVED, kept as API) | lsGet, esc, editSubject | `window.gdiSubjects.get/delete`, `window.gdiModal`, escHtml, showToast |
| 3292 | `drawList()` (nested) | 47 | no | Subject list | esc | — |
| 3343 | `editSubject(id, box, afterSave)` | 71 | no | Modal: create/edit subject | esc | `window.gdiSubjects.get/save`, escHtml, showToast |
| 3420 | `renderTrails(box)` | 61 | **window** (legacy) | Trails tab (REMOVED, kept as API) | esc, editTrail | `window.gdiTrails.get/delete`, `window.gdiModal`, escHtml, showToast |
| 3437 | `drawList()` (nested) | 41 | no | Trail list | esc | — |
| 3482 | `editTrail(id, box, afterSave)` | 61 | no | Modal: create/edit trail | esc | `window.gdiTrails.get/save`, escHtml, showToast |
| 3684 | `injectNavButton()` | 20 | no | Injects "Área do Aluno" button in navbar | openPanel | DOM |
| 3706 | (state) `_navRaf` | — | no | rAF coalescing id | — | — |
| 3707 | `scheduleNavInject()` | 7 | no | rAF-coalesced injectNavButton | injectNavButton | — |
| 3715 | `setTimeout(scheduleNavInject, 300)` | 1 | — | Initial nav inject | scheduleNavInject | — |
| 3717 | `Bus.onGlobal('page:change', scheduleNavInject)` | 1 | — | Re-inject on page change | scheduleNavInject | Bus |
| 3719 | `Bus.onGlobal('rows:appended', scheduleNavInject)` | 1 | — | Re-inject on rows appended | scheduleNavInject | Bus |
| 3722 | `GDI_MODULES.push({name:'central-nav', init: scheduleNavInject})` | 1 | — | Loader hook | scheduleNavInject | — |
| 3725 | `document.addEventListener('keydown', …)` | 15 | — | Esc closes panel, `c` toggles, space/1/2/3 for flashcards | panel, FC, closePanel, openPanel | — |
| 3746-3803 | (nested IIFE) `tryOpenFromURL()` | 58 | no | Opens panel from `?central=…` URL or `window.MODEL.autoOpenCentral` | openPanel | `window.GDIUser.ready`, `window.MODEL` |
| 3795-3802 | `Bus.onGlobal('page:change'/'user:ready', …)` | 8 | — | Re-try tryOpenFromURL | tryOpenFromURL | Bus |

**M22 totals:** ~55 functions (incl. nested), 3067 lines, 10 window exports, 1 GDI_MODULES registration.

### IIFE #3 — M24 Estudo Avançado (lines 3812-4231)

| Line | Function | Lines | Exported? | Summary | Internal deps | External deps |
|---|---|---|---|---|---|---|
| 3818 | `callMeggy(prompt)` | 7 | no | POST `/api/ai` | — | fetch |
| 3826 | `renderMd(txt)` | 4 | no | Renders Markdown (uses `marked` + `gdiSanitize`) | esc | `window.marked`, `window.gdiSanitize` |
| 3834 | `renderProvas(box)` | 73 | **window** | Provas tab: upload PDF + plan list (paginated) | lsGet, esc, analyzeProva, showPlan | — |
| 3838 | `renderList()` (nested) | 40 | no | Renders plan list + pager | lsGet, esc, showPlan | — |
| 3908 | `analyzeProva(box, file)` | 53 | no | Extracts PDF text → calls Meggy → saves plan | esc, callMeggy, lsGet/Set, showPlan, uid | `window.pdfjsLib` (dynamic load), showToast |
| 3962 | `showPlan(box, plan)` | 13 | no | Renders one plan (Markdown) | renderMd, esc | `window.renderProvas` |
| 3977 | `renderRedacao(box)` | 162 | **window** | Redação tab: banca/tipo selectors + textarea + OCR dropzone + corrections history | esc, lsGet, renderMd, callMeggy, uid | `window.gdiIsaPdf.extractPdfText/saveEssayMD`, fetch, showToast |
| 4142 | `renderRadar(box)` | 86 | **window** | Mapa de Fracos: tiles per subject with acc% + weak subjects banner | lsGet, esc, collectCourses | `window.gdiTrails`, `window._qFilterSubject` (write-only) |

**M24 totals:** 7 functions, 420 lines, 3 window exports.

### IIFE #4 — BlackTie Tema Visual (lines 4241-4416)

No functions — pure CSS injection (fonts, tokens, component theming). One side-effecting block:
- Injects `<link>` for Google Fonts (Poppins/Rubik/Inter) — line 4246
- Injects `<style id="gdi-ferreto-tokens">` with `:root`/`[data-bs-theme="dark"]`/`[data-bs-theme="light"]` — line 4258
- Injects `<style id="gdi-ferreto-extras-style">` with component theming — line 4286
- Sets `data-bs-theme` on `<html>` from `localStorage.gdi-theme` — line 4404
- Adds `shown.bs.modal` listener for "serrilhada" fix — line 4409

Guard: `window.__gdiFerretoExtras` (idempotent).

**BlackTie totals:** 0 functions, 175 lines, 0 exports.

### IIFE #5 — M-PLAYER-GUARD (lines 4428-4564)

| Line | Function | Lines | Exported? | Summary | Internal deps | External deps |
|---|---|---|---|---|---|---|
| 4452 | `attach(v)` | 99 | no | Attaches stall-detection listeners to `<video>` | STALL_MS, FIRST_PLAY_HINT_MS | DOM |
| 4457-4530 | (nested) `clearTimer, clearOverlay, arm, check, showOverlay, showHint, hideHint, armHint` | ~75 | no | Watchdog internals | st, STALL_MS | — |
| 4554 | `Bus.onGlobal('media:ready', …)` | 3 | — | Attaches to new video elements | attach | Bus |
| 4558 | `GDI_MODULES.push({name:'player-guard', init: …})` | 6 | — | Loader hook | attach | — |

**Player-Guard totals:** 1 function (with 8 nested helpers), 135 lines, 1 GDI_MODULES registration.

### IIFE #6 — M-COURSE-SCANNER (lines 4580-5115)

| Line | Function | Lines | Exported? | Summary | Internal deps | External deps |
|---|---|---|---|---|---|---|
| 4591 | `getScanState(courseKey)` | 3 | via `gdiCourseScanner` | LS read | LS_SCAN_PREFIX | — |
| 4594 | `setScanState(courseKey, state)` | 3 | via `gdiCourseScanner` | LS write | LS_SCAN_PREFIX | — |
| 4597 | `clearScanState(courseKey)` | 3 | via `gdiCourseScanner` | LS remove | LS_SCAN_PREFIX | — |
| 4602 | `getLessons(courseKey)` | 6 | via `gdiCourseScanner` | LS read | LS_LESSONS_PREFIX | — |
| 4608 | `setLessons(courseKey, data)` | 3 | via `gdiCourseScanner` | LS write | LS_LESSONS_PREFIX | — |
| 4617 | `scanFolder(folderPath, depth)` | 38 | no | Scans ONE folder via worker bridge | SCAN_MAX_DEPTH, VIDEO_EXT | `window.gdiGetPw`, `window.gdiListAllFiles` |
| 4658 | `depthOf(folderPath, rootPath)` | 7 | no | Computes folder depth | — | — |
| 4673 | `scanCourse(courseKey, onProgress)` | 113 | via `gdiCourseScanner` | Main scan loop (POST `/api/courses/scan-progress` until done) | getScanState, setScanState, getLessons, setLessons | fetch, `window.GDIStorage.saveMaterial` |
| 4788 | `getScanProgress(courseKey)` | 16 | via `gdiCourseScanner` | Returns progress info for tile display | getScanState, getLessons | — |
| 4806 | `getCourseLessons(courseKey)` | 3 | via `gdiCourseScanner` | Alias for `getLessons` | getLessons | — |
| 4812 | `countWatched(courseKey)` | 15 | via `gdiCourseScanner` | Counts watched lessons by path prefix | — | `window.GDIUser.dump` |
| 4830 | `startScan(courseKey, onProgress)` | 34 | via `gdiCourseScanner` | Non-blocking wrapper; resets stuck scans (>5min) | getScanState, clearScanState, scanCourse, getLessons | — |
| 4871 | `resumeInterruptedScans()` | 15 | via `gdiCourseScanner` | On page load: clears stuck 'scanning' state + restarts | getScanState, clearScanState, startScan | — |
| 4894 | (state) `_autoScanRunning` | — | no | Mutex flag for autoScanPending | — | — |
| 4904 | `syncCoursesFromDrive()` | 57 | **window** (`gdiSyncCoursesFromDrive`) | Fetch `/api/courses/list` → merge into LS with dedup | mergeDriveCourses (nested) | fetch |
| 4907 | `mergeDriveCourses()` (nested) | 32 | no | RMW + dedup pass | — | — |
| 4963 | `autoScanPending()` | 35 | via `gdiCourseScanner` | Scans first course without 'done'/'scanning' state | getScanProgress, startScan | `window.__gdiCurrentTab`, renderHome |
| 5009 | `cleanupOrphanCourses()` | 27 | **window** (`gdiCleanupOrphanCourses`) + via `gdiCourseScanner` | Removes drive-root paths and entries w/o name | — | — |
| 5038 | `window.gdiCourseScanner = {...}` | 16 | **window** (object export) | Exposes 9 methods + 4 constants + version | — | — |
| 5059 | `setTimeout(resumeInterruptedScans, 3s)` | 3 | — | On load | resumeInterruptedScans | — |
| 5064 | `setTimeout(cleanupOrphanCourses, 2s)` | 3 | — | On load | cleanupOrphanCourses | — |
| 5074-5112 | `Bus.onGlobal('user:ready'/'page:change', …)` + fallback setTimeout | 39 | — | Sync courses → auto-scan | syncCoursesFromDrive, autoScanPending | Bus |

**Scanner totals:** 14 functions, 535 lines, 1 object export + 2 standalone exports.

---

## 3. Logical Groupings (Clusters)

### Cluster A — Questões/Simulado/Cronograma/Revisões (M23)
- **Functions:** fisherYates, questions, saveQ, addQ, delQ, getQ, qSrs, saveQSrs, gradeQ, dueQ, errQ, simus, saveSim, currentLesson, gerarViaISA, renderQuestoes + nested (drawSubjects, drawList, rowHtmlFor), startSession + nested (draw), openGen, openAddForm, openImport, renderSimulado, startSimulado + nested (draw, finish), renderCronograma + nested (renderFuturas), renderRevisoes
- **Total lines:** 715
- **Internal deps:** all functions are self-contained inside the IIFE
- **External deps:** `window.showToast`, `GDI_ROOT()`, `window.__gdiParseJsonArray`, `window.gdiIsaPdf.fetchSharedQuestions`, `window.GDIUser.dump`, `window.playlistVideos`, `window.__gdiGradeQ` (exposed for M9-ISA quiz), localStorage
- **Shared state:** `_qFilterSubject` (also written by M24's renderRadar via `window._qFilterSubject` — see Risks)

### Cluster B — Courses & Modal (subset of M22)
- **Functions:** gdiAddCourseFromButton, gdiAddCourseFromDrive, ensureState, stateD, watchedLow, courseKeyOf, courseName, driveNameOf, collectCourses, hideCourse, unhideCourse, listHiddenCourses, isGeneric, realName, vCacheGet, vCacheSet, exists, ghost, bestIn, cleanCourseName, renderCursos + nested (applyFilter, renderCourseCard + applyTarget), gdiRefreshCentralPanel, showAddCourseModal + nested (setMode, normPath, pathSegments, getDriveName, isFolder, getFolderPath, getFileName, renderBreadcrumb, normalizeNavPath, navigate, doAddCourseFromDrive, close, selectCurrentHandler), showHiddenCoursesModal, openCourseDetail, renderStats, renderAchievements
- **Total lines:** ~1300 (gdiAddCourseFromDrive alone is 167, showAddCourseModal is 511, openCourseDetail is 332, renderCursos is 213)
- **Internal deps:** courses helpers (collectCourses, courseName, driveNameOf, realName, bestIn, cleanCourseName) used by all renderers
- **External deps:** `window.GDIStorage.saveCourse/saveMaterial`, `window.gdiCourseScanner.*`, `window.gdiIsaPdf.startBattalion/extractPdfText`, `window.gdiListAllFiles`, `window.gdiGetPw`, `window.drive_names`, `window.gdiCourseIdentity`, `window.gdiModal`, `window.GDIUser.dump/isWatched/getIntro`, `window.gdiAchievements`, `window.showToast`, `window.__gdiCurrentTab`, renderHome (panel-side — circular dep), Bus (for watched:changed)
- **Shared state:** `rescue/rescueAt`, `vCache` (Map), `bestInCache` (Map), `playing/mark`

### Cluster C — Panel Shell & Home & Drives (subset of M22)
- **Functions:** openPanel, closePanel, showOnboarding, renderSidebarHTML, renderHeaderHTML, updateHeaderStats, renderBody, renderPanel, renderDrives, browseDriveInPanel, renderHome, injectNavButton, scheduleNavInject, tryOpenFromURL
- **Total lines:** ~700
- **Internal deps:** panel/tab/FC state, TAB_GROUPS, renderBody dispatches to renderHome/renderDrives/renderQuestoes/renderSimulado/renderCronograma/renderStats/renderAchievements/showAddCourseModal (cross-cluster!)
- **External deps:** `GDI_ROOT()`, `window.__gdiCurrentTab`, `window.gdiSyncCoursesFromDrive`, `window.gdiCourseIdentity`, `window.gdiCourseScanner`, `window.drive_names`, `window.gdiListAllFiles`, `window.gdiGetPw`, `window.GDIUser.ready`, `window.MODEL.autoOpenCentral`, `window.renderResumos/Provas/Redacao/Radar` (from M24 + external `gdi-resumos` module), Bus, escHtml
- **Shared state:** `panel` (DOM ref), `tab` (string), `FC` (flashcard session state for keyboard handler), `_navRaf` (rAF coalescing)
- **Cross-cluster deps:** needs `collectCourses/cleanCourseName/driveNameOf/realName/bestIn/esc/lsGet` from Cluster B; needs `showAddCourseModal` from Cluster B; needs `renderQuestoes/Simulado/Cronograma` from Cluster A; needs `renderProvas/Redacao/Radar` from Cluster D

### Cluster D — Provas/Redação/Radar (M24)
- **Functions:** callMeggy, renderMd, renderProvas + nested (renderList), analyzeProva, showPlan, renderRedacao, renderRadar
- **Total lines:** 420
- **Internal deps:** callMeggy/renderMd used by all 3 renderers
- **External deps:** `window.pdfjsLib`, `window.marked`, `window.gdiSanitize`, `window.gdiIsaPdf.extractPdfText/saveEssayMD`, `window.gdiTrails`, `window.collectCourses` (from Cluster B), `window._qFilterSubject` (write-only — used to communicate with Cluster A's renderQuestoes), fetch, showToast
- **Shared state:** none (stateless IIFE)

### Cluster E — Legacy Tab Stubs (subset of M22)
- **Functions:** renderFlash + nested (drawList), studyFlash, renderMarathon, renderSubjects + nested (drawList), editSubject, renderTrails + nested (drawList), editTrail
- **Total lines:** ~480
- **Internal deps:** uses `cards/saveCards/dueCards/FC` (flashcards state) and `marOn/marIntro` (marathon state) — these live in Cluster B/C
- **External deps:** `window.gdiSubjects.*`, `window.gdiTrails.*`, `window.gdiGradeCard`, `window.gdiModal`, `window.gdiVideoKey`, escHtml, showToast
- **Shared state:** `FC` (also used by Cluster C's keydown handler for space/1/2/3 keys)
- **Note:** Tabs are REMOVED from sidebar (per user request) but functions preserved as `window.*` for backward-compat API consumers. **Candidates for deletion** in a follow-up cleanup — but not in this study.

### Cluster F — Scanner (M-COURSE-SCANNER)
- **Functions:** getScanState, setScanState, clearScanState, getLessons, setLessons, scanFolder, depthOf, scanCourse, getScanProgress, getCourseLessons, countWatched, startScan, resumeInterruptedScans, syncCoursesFromDrive + nested (mergeDriveCourses), autoScanPending, cleanupOrphanCourses
- **Total lines:** 535
- **Internal deps:** scanCourse uses getScanState/setScanState/getLessons/setLessons
- **External deps:** `window.gdiGetPw`, `window.gdiListAllFiles`, `window.GDIStorage.saveMaterial`, `window.GDIUser.dump`, `window.__gdiCurrentTab`, renderHome (cross-cluster — for auto-scan callback re-render), fetch, Bus
- **Shared state:** `_autoScanRunning` mutex
- **Exports:** `window.gdiCourseScanner` (object), `window.gdiSyncCoursesFromDrive`, `window.gdiCleanupOrphanCourses`

### Cluster G — Theme (BlackTie)
- **Functions:** none
- **Total lines:** 175
- **Internal deps:** none
- **External deps:** DOM only
- **Guard:** `window.__gdiFerretoExtras`

### Cluster H — Player Guard
- **Functions:** attach (+ 8 nested helpers)
- **Total lines:** 135
- **Internal deps:** none
- **External deps:** Bus (media:ready), DOM
- **GDI_MODULES:** `player-guard`

---

## 4. Shared State (cross-module)

| State variable | Current owner IIFE | Type | Used by | Migration target |
|---|---|---|---|---|
| `panel` | M22 | DOM ref (\| null) | openPanel, closePanel, renderPanel, renderBody, updateHeaderStats, gdiRefreshCentralPanel, keydown handler, intervals (flushWatch, updateGoalChip), tryOpenFromURL (via openPanel), autoScanPending (via renderHome) | **study-panel.js** (module-scope) — other modules access via `window.__gdiStudy.getPanel()` |
| `tab` | M22 | string | openPanel, renderBody, gdiRefreshCentralPanel, renderHome, keydown handler, TAB_GROUPS dispatch | **study-panel.js** (module-scope) — other modules read via `window.__gdiStudy.getTab()` |
| `FC` | M22 | `{active, flip, grade}` | renderFlash, studyFlash, keydown handler (space/1/2/3) | **study-panel.js** (lives with keydown) — study-tabs-legacy.js accesses via `window.__gdiStudy.FC` |
| `rescue, rescueAt` | M22 | userstate cache | ensureState, stateD | **study-courses.js** (only used by course helpers) |
| `vCache` (Map) | M22 | path-exists cache | vCacheGet, vCacheSet, exists, bestIn | **study-courses.js** (only used by course helpers) |
| `bestInCache` (Map) | M22 | best "continue" path cache | bestIn, watched:changed handler | **study-courses.js** |
| `playing, mark` | M22 | media play/pause state | play/pause/ended listeners, flushWatch | **study-courses.js** OR **study-panel.js** (the listeners are global; pick the module that owns `flushWatch` — recommend **study-panel.js** since flushWatch is gated by `panel` visibility) |
| `_qFilterSubject` | M23 | string \| null | renderQuestoes (read), renderRadar (write via `window._qFilterSubject`) | **Already broken cross-module** — see Risks §8 |
| `_navRaf` | M22 | number | scheduleNavInject | **study-nav.js** (if separate) or **study-panel.js** |
| `_autoScanRunning` | Scanner | boolean | autoScanPending | **study-scanner.js** |
| `window.__gdiCurrentTab` | M22 (write) / Scanner (read) | runtime flag | renderBody (write), renderHome (read for recursive render), autoScanPending (read), gdiSyncCoursesFromDrive re-render (read) | Keep as `window.__gdiCurrentTab` (it's already on window) |
| `window.__gdiSyncInProgress` | M22 (write) | boolean flag | renderHome | Keep as `window.__gdiSyncInProgress` |
| `window.__gdiAutoOpenDone` | M22 (write) | boolean flag | tryOpenFromURL | Keep as `window.__gdiAutoOpenDone` |

### Recommended shared-state pattern

Create a single namespace object early in load order:

```js
// study-state.js (loaded FIRST, ~30 lines)
window.__gdiStudy = window.__gdiStudy || {
  _panel: null,
  _tab: 'home',
  FC: {active:false, flip:null, grade:null},
  getPanel() { return this._panel; },
  setPanel(p) { this._panel = p; },
  getTab() { return this._tab; },
  setTab(t) { this._tab = t; },
  // helpers also shared:
  esc, lsGet, lsSet, dayKey, dateBr, fmtMin, norm, low, dec, stripExt, todayMin, goalMin,
  collectCourses, courseName, driveNameOf, cleanCourseName, realName, bestIn,
  ensureState, stateD, hideCourse, unhideCourse, listHiddenCourses, watchedLow, courseKeyOf, isGeneric,
  showToast  // optional shortcut
};
```

Modules then read/write via `window.__gdiStudy.panel` etc. **OR** (simpler) each module imports its dependencies through `window.__gdiStudy.X` at call-time (not at module-load-time, to avoid ordering issues).

**Decision for plan below:** Use a hybrid — module-scope `const` for module-private state, `window.__gdiStudy` for cross-module helpers/state. This minimizes the diff vs. the current source.

---

## 5. Event Listeners

### `Bus.onGlobal(...)` registrations

| Line | Event | Handler | Owner IIFE | Notes |
|---|---|---|---|---|
| 1166 | `watched:changed` | `() => bestInCache.clear()` | M22 | Courses cluster (clears bestIn cache when user toggles watched) |
| 1216 | `media:ready` | `({type,el}) => …` (marathon: auto-play next + skip intro) | M22 | Panel cluster (uses marOn, watchedLow, stateD) |
| 3717 | `page:change` | `scheduleNavInject` | M22 | Nav cluster |
| 3719 | `rows:appended` | `scheduleNavInject` | M22 | Nav cluster |
| 3796 | `page:change` | `() => setTimeout(tryOpenFromURL, 500)` | M22 (nested IIFE) | Nav cluster |
| 3799 | `user:ready` | `() => setTimeout(tryOpenFromURL, 300)` | M22 (nested IIFE) | Nav cluster |
| 4554 | `media:ready` | `(d) => attach(d.el)` (player-guard) | Player-Guard | Independent |
| 5075 | `user:ready` | `() => setTimeout(syncCoursesFromDrive→autoScanPending, 5000)` | Scanner | Courses sync |
| 5092 | `page:change` | `() => setTimeout(autoScanPending, 3000)` | Scanner | Auto-scan retry |

### `document.addEventListener(...)` registrations

| Line | Event | Options | Handler | Owner IIFE |
|---|---|---|---|---|
| 1169 | `play` | capture:true | track `playing=true, mark=Date.now()` | M22 (flushWatch) |
| 1170 | `pause` | capture:true | `playing=false; flushWatch()` | M22 (flushWatch) |
| 1171 | `ended` | capture:true | `playing=false; flushWatch()` | M22 (flushWatch) |
| 3725 | `keydown` | bubble | Esc/c/space/1/2/3 handler | M22 (panel + flashcards) |
| 4409 | `shown.bs.modal` | capture:true | `dlg.style.transform='translateZ(0)'` (serrilhada fix) | BlackTie |

### `setInterval` / `setTimeout`

| Line | Type | Delay | Handler | Owner |
|---|---|---|---|---|
| 1179 | setInterval | 30000 | `flushWatch` (gated by panel visibility) | M22 |
| 1202 | setInterval | 20000 | `updateGoalChip` (gated by panel visibility) | M22 |
| 3715 | setTimeout | 300 | `scheduleNavInject` (initial) | M22 |
| 3790 | setTimeout | 1000 | `tryOpenFromURL` (initial) | M22 (nested) |
| 5059 | setTimeout | 3000 | `resumeInterruptedScans` | Scanner |
| 5064 | setTimeout | 2000 | `cleanupOrphanCourses` | Scanner |
| 5076/5099 | setTimeout (inside Bus handlers) | 5000 | `syncCoursesFromDrive → autoScanPending` | Scanner |

---

## 6. External Dependencies (cross-file globals)

### Globals from OTHER files (not defined in gdi-study.js)

| Global | Source file | Used by IIFE | Purpose |
|---|---|---|---|
| `window.GDIUser` | gdi-core.js | M22, M23, Scanner | `.dump()`, `.loaded()`, `.isWatched()`, `.getIntro()`, `.ready()` |
| `window.GDIStorage` | storage.js | M22, Scanner | `.saveCourse()`, `.saveMaterial()` |
| `window.Bus` | app.min.js | M22, Player-Guard, Scanner | `.onGlobal(event, handler)` |
| `window.GDI_MODULES` | app.min.js | M22, Player-Guard | `.push({name, init})` |
| `window.GDI_ROOT` | app.min.js | M23, M22 | Returns root DOM for modals |
| `window.gdiListAllFiles` | gdi-worker-bridge.js | M22, Scanner | Worker-bridged Drive listing |
| `window.gdiGetPw` | gdi-worker-bridge.js | M22, Scanner | Password for protected folders |
| `window.gdiCourseIdentity` | gdi-core.js | M22 | Returns `{icon, color}` for a course |
| `window.gdiIsaPdf` | gdi-pdf.js | M22, M24 | `.startBattalion`, `.extractPdfText`, `.saveEssayMD`, `.fetchSharedQuestions` |
| `window.gdiAchievements` | gdi-core.js | M22 | `.getUnlocked()`, `.defs()` |
| `window.gdiSubjects` | (external) | M22 (legacy) | `.get()`, `.save()`, `.delete()` |
| `window.gdiTrails` | (external) | M22 (legacy), M24 | `.get()` |
| `window.gdiGradeCard` | gdi-core.js | M22 (legacy) | Flashcard grading |
| `window.gdiModal` | gdi-ui.js | M22 | Promise-based confirm modal |
| `window.gdiVideoKey` | gdi-core.js | M22 (legacy) | Current video path |
| `window.escHtml` | app.min.js | M22, M23, M24 | HTML-escape (used as primary, with inline fallback) |
| `window.showToast` | app.min.js | all | Toast notifications |
| `window.drive_names` | app.min.js | M22, M24 | Array of drive display names |
| `window.playlistVideos` | app.min.js | M22, M23 | Current playlist |
| `window.currentIndex` | app.min.js | M22 | Current playlist index |
| `window.switchVideo` | app.min.js | M22 | Switch to playlist item |
| `window.realLessonName` | gdi-meggy.js (M9) | (not used here — referenced in comments only) | — |
| `window.__gdiParseJsonArray` | gdi-meggy.js | M23 | Robust JSON array parser |
| `window.marked` | CDN | M24 | Markdown renderer |
| `window.gdiSanitize` | (external) | M24 | HTML sanitizer |
| `window.pdfjsLib` | CDN (lazy-loaded) | M24 | PDF.js for prova text extraction |
| `window.MODEL` | app.min.js | M22 (nested) | `MODEL.autoOpenCentral` SPA flag |

### Key CSS classes referenced

- **Layout:** `.gdi-central`, `.gdi-central-box`, `.gdi-central-head`, `.gdi-central-main`, `.gdi-central-sidebar`, `.gdi-central-body`, `.gdi-central-tab`, `.gdi-tab-badge`, `.gdi-central-stat`
- **Cards:** `.gdi-course`, `.gdi-course-stats`, `.gdi-course-stat`, `.gdi-course-stat-num`, `.gdi-course-stat-label`, `.gdi-btn-continue`, `.gdi-btn-done`, `.gdi-btn-scan-now`, `.gdi-scan-bar-wrap`, `.gdi-scan-progress`, `.gdi-scan-status`
- **Dashboard:** `.gdi-dashboard-hero`, `.gdi-dashboard-grid`, `.gdi-dashboard-card` (+ `-icon/-num/-label/-meta`), `.gdi-quick-actions`, `.gdi-quick-action`
- **Heatmap:** `.heat`, `.l1`–`.l4`
- **Modals:** `.gdi-modal-overlay`, `.gdi-central-box`, `.gdi-amc-tab`, `.gdi-amc-folder-card`, `.gdi-amc-bc-item`, `.gdi-amc-icon-btn`, `.gdi-amc-color-btn`
- **Notes/Questions:** `.gdi-note`, `.gdi-note-del`, `.gdi-notes-empty`, `.gdi-empty-state` (+ `-icon`)
- **Buttons:** `.gdi-btn`, `.gdi-btn-primary`, `.gdi-btn-ghost`, `.gdi-mode-btn`
- **Flashcards (legacy):** `.gdi-fc-card`, `.gdi-fc-card-inner`, `.gdi-fc-card-face`, `.gdi-fc-card-front`, `.gdi-fc-card-back`, `.gdi-fc-card-label`, `.gdi-fc-card-text`, `.gdi-fc-card-hint`, `.gdi-fc-card-del`, `.gdi-fc-flipped`, `.gdi-fc-card-large`, `.gdi-fc-grid-m22`
- **AI/loading:** `.gdi-ai-loading`, `.gdi-ai-typing`, `.gdi-ai-err`, `.gdi-isa-summary-body`, `.gdi-mat-isa-spin`, `.gdi-spinner`
- **Player guard:** `.gdi-stall-overlay`, `.gdi-stall-card` (+ `-ico/-title/-sub/-actions`), `.gdi-play-hint`
- **External theming:** `.gdi-debug-wrap`, `.gdi-mat-head`, `.gdi-mat-tab`, `.gdi-mat-body`, `#gdi-pom-fab`, `#gdi-pom-panel`, `#gdi-sleep-btn`, `#gdi-skip-intro`, `#gdi-home-card`, `#gdi-playlist-count`, `#gdi-player-nav`, `#gdi-note-marks`, `#gdi-debug-log`, `#gdi-notes-list`, `#gdi-note-input`, `#gdi-note-save`, `#gdi-progress-line`, `.gdi-modprog`, `.gdi-fc-panel`, `.gdi-fc-root`, `.gdi-continue-card`

---

## 7. Recommended Split

**Target:** 8 files under `modular/study/`, each 135–1100 lines. Total distributed: ~5126 lines (no behavior change).

### Load order (critical)

```
1. study-theme.js          (CSS first — prevents FOUC)
2. study-scanner.js        (defines window.gdiCourseScanner + gdiSyncCoursesFromDrive — needed by courses)
3. study-courses.js        (defines window.collectCourses, gdiAddCourseFromDrive, renderCursos, gdiRefreshCentralPanel, helpers)
4. study-questions.js      (defines window.renderQuestoes/Simulado/Cronograma/Revisoes — needed by panel body dispatch)
5. study-advanced.js       (defines window.renderProvas/Redacao/Radar — needed by panel body dispatch)
6. study-tabs-legacy.js    (defines window.renderFlash/Marathon/Subjects/Trails — API preservation, no internal callers)
7. study-player-guard.js   (independent — listens for media:ready)
8. study-panel.js          (LAST — defines window.__gdiOpenCentral, openPanel, renderPanel, renderBody, renderHome, renderDrives, injectNavButton, tryOpenFromURL, keydown handler)
```

The order matters because **study-panel.js's renderBody dispatches to renderQuestoes/renderSimulado/renderCronograma/renderProvas/renderRedacao/renderRadar** which must already be on `window.*`. **study-courses.js's collectCourses** is called by **study-panel.js's renderHome** — also already on `window.*`.

### File breakdown

#### 1. `study-theme.js` — 175 lines (verbatim copy of IIFE #4)
- **Contains:** BlackTie CSS injection (fonts, tokens, component theming, `shown.bs.modal` serrilhada fix)
- **Exports:** `window.__gdiFerretoExtras` (guard only)
- **Imports:** none
- **Load order:** 1st (prevents FOUC)
- **Risk:** None — already idempotent and stateless.

#### 2. `study-scanner.js` — 535 lines (verbatim copy of IIFE #6)
- **Contains:** M-COURSE-SCANNER (getScanState, setScanState, clearScanState, getLessons, setLessons, scanFolder, depthOf, scanCourse, getScanProgress, getCourseLessons, countWatched, startScan, resumeInterruptedScans, syncCoursesFromDrive, autoScanPending, cleanupOrphanCourses)
- **Exports:** `window.gdiCourseScanner` (object), `window.gdiSyncCoursesFromDrive`, `window.gdiCleanupOrphanCourses`
- **Imports:** `window.gdiGetPw`, `window.gdiListAllFiles`, `window.GDIStorage.saveMaterial`, `window.GDIUser.dump`, `window.__gdiCurrentTab` (read), Bus (user:ready, page:change), fetch
- **Cross-cluster:** calls `renderHome(body)` from autoScanPending callback (line 4987). After split, this must become `window.__gdiStudy.renderHome(body)` (or check `typeof window.__gdiStudy.renderHome === 'function'`).
- **Load order:** 2nd (defines `gdiCourseScanner` needed by study-courses's collectCourses and study-panel's renderHome)
- **Risk:** Low — already self-contained.

#### 3. `study-courses.js` — ~1100 lines (carved out of M22)
- **Contains:**
  - Constants: `LS_HIDDEN`, `LS_WATCH`, `LS_GOAL`, `LS_MAR`, `LS_MARINTRO`, `LS_CARDS`, `GW`, `VCACHE_MAX`, `VCACHE_TTL`
  - Utility: `log, dec, norm, low, stripExt, lsGet, lsSet, esc, fmtMin, dayKey, dateBr`
  - Course helpers: `courseKeyOf, courseName, driveNameOf, cleanCourseName, isGeneric, realName, hideCourse, unhideCourse, listHiddenCourses, watchedLow`
  - State/cache: `rescue, rescueAt, vCache (Map), bestInCache (Map), playing, mark`
  - Core: `ensureState, stateD, vCacheGet, vCacheSet, exists, ghost, bestIn, collectCourses, flushWatch, todayMin, goalMin, updateGoalChip, marOn, marIntro, marCourseKey`
  - Renderers: `renderCursos (+ applyFilter, renderCourseCard, applyTarget)`, `showAddCourseModal (+ setMode, normPath, pathSegments, getDriveName, isFolder, getFolderPath, getFileName, renderBreadcrumb, normalizeNavPath, navigate, doAddCourseFromDrive, close, selectCurrentHandler)`, `showHiddenCoursesModal`, `openCourseDetail`, `renderStats`, `renderAchievements`
  - Exports: `gdiAddCourseFromButton, gdiAddCourseFromDrive, collectCourses, renderCursos, gdiRefreshCentralPanel`
  - Event listeners (move with the functions they reference):
    - `Bus.onGlobal('watched:changed', () => bestInCache.clear())` (line 1166)
    - `document.addEventListener('play'/'pause'/'ended', …, true)` (lines 1169-1171) — they call `flushWatch`
    - `setInterval(flushWatch, 30000)` (line 1179) — gated by `panel` visibility → needs `window.__gdiStudy.getPanel()`
    - `setInterval(updateGoalChip, 20000)` (line 1202) — same gating
    - `Bus.onGlobal('media:ready', marathon handler)` (line 1216) — uses marOn, watchedLow, stateD
- **Exports (window):** `gdiAddCourseFromButton`, `gdiAddCourseFromDrive`, `collectCourses`, `renderCursos`, `gdiRefreshCentralPanel`
- **Exports (window.__gdiStudy):** `esc, lsGet, lsSet, dayKey, dateBr, fmtMin, norm, low, dec, stripExt, todayMin, goalMin, collectCourses, courseName, driveNameOf, cleanCourseName, realName, bestIn, ensureState, stateD, hideCourse, unhideCourse, listHiddenCourses, watchedLow, courseKeyOf, isGeneric, flushWatch, updateGoalChip, marOn, marIntro`
- **Imports:** `window.GDIStorage`, `window.gdiCourseScanner`, `window.gdiIsaPdf`, `window.gdiListAllFiles`, `window.gdiGetPw`, `window.drive_names`, `window.gdiCourseIdentity`, `window.gdiModal`, `window.GDIUser`, `window.gdiAchievements`, `window.showToast`, `window.escHtml`, `window.playlistVideos`, `window.currentIndex`, `window.switchVideo`, `window.__gdiCurrentTab` (read), `window.__gdiStudy.getPanel` (read, for intervals), Bus
- **Cross-cluster calls (require window.__gdiStudy access):**
  - `gdiRefreshCentralPanel` → calls `renderBody(tab)` (panel-side) → must use `window.__gdiStudy.renderBody(tab)`
  - `gdiAddCourseFromDrive` → calls `gdiRefreshCentralPanel()` or `renderCursos(box)` — both available (own module + window)
  - `openCourseDetail` → calls `renderCursos(box)` (own module) and `bestIn` (own module) ✓
  - `showAddCourseModal` → calls `renderCursos(box)` (own module) ✓
  - `renderStats` → uses `courseKeyOf, courseName, dayKey, dateBr, fmtMin, todayMin, lsGet, esc, stateD, ensureState` (all own module) ✓
- **Load order:** 3rd
- **Risk:** MEDIUM — lots of cross-cluster helpers must be exposed via `window.__gdiStudy`.

#### 4. `study-questions.js` — 715 lines (verbatim copy of IIFE #1)
- **Contains:** M23 Estudo Ativo (questões, simulado, cronograma, revisões) — unchanged
- **Exports (window):** `renderQuestoes`, `renderSimulado`, `renderCronograma`, `renderRevisoes`, `__gdiGradeQ`
- **Imports:** `window.showToast`, `GDI_ROOT()`, `window.__gdiParseJsonArray`, `window.gdiIsaPdf.fetchSharedQuestions`, `window.GDIUser.dump`, `window.playlistVideos`, `window.collectCourses` (for renderSimulado's course filter dropdown), localStorage
- **Cross-cluster:** `renderSimulado` calls `collectCourses()` (currently a closure call — after split, must use `window.collectCourses()`)
- **Load order:** 4th
- **Risk:** LOW — minimal cross-cluster deps.

#### 5. `study-advanced.js` — 420 lines (verbatim copy of IIFE #3)
- **Contains:** M24 (callMeggy, renderMd, renderProvas, analyzeProva, showPlan, renderRedacao, renderRadar)
- **Exports (window):** `renderProvas`, `renderRedacao`, `renderRadar`
- **Imports:** `window.pdfjsLib` (lazy-load), `window.marked`, `window.gdiSanitize`, `window.gdiIsaPdf.extractPdfText/saveEssayMD`, `window.gdiTrails`, `window.collectCourses`, fetch, showToast
- **Cross-cluster:** `renderRadar` writes `window._qFilterSubject` (intended to communicate with M23's `renderQuestoes`, but **already broken** — see Risks). `renderRadar` reads `collectCourses()` (must be `window.collectCourses()`).
- **Load order:** 5th
- **Risk:** LOW.

#### 6. `study-tabs-legacy.js` — ~480 lines (carved out of M22)
- **Contains:** `renderFlash (+ drawList)`, `studyFlash`, `renderMarathon`, `renderSubjects (+ drawList)`, `editSubject`, `renderTrails (+ drawList)`, `editTrail`
- **Exports (window):** `renderFlash`, `renderMarathon`, `renderSubjects`, `renderTrails`
- **Imports:** `window.__gdiStudy.FC` (for studyFlash flip/grade state), `window.__gdiStudy.cards/saveCards/dueCards` (flashcards data helpers — must be in __gdiStudy), `window.__gdiStudy.marOn/marIntro` (marathon helpers), `window.gdiSubjects`, `window.gdiTrails`, `window.gdiGradeCard`, `window.gdiModal`, `window.gdiVideoKey`, `window.showToast`, `window.escHtml`, `window.norm` (for currentAula)
- **Note:** These tabs are REMOVED from sidebar. They exist solely for backward-compat API. **Strong candidate for deletion in a follow-up cleanup**, but kept verbatim here for safety.
- **Load order:** 6th
- **Risk:** LOW (no internal callers; only external API consumers).

#### 7. `study-player-guard.js` — 135 lines (verbatim copy of IIFE #5)
- **Contains:** `attach()` + 8 nested helpers, `Bus.onGlobal('media:ready')`, `GDI_MODULES.push({name:'player-guard', init})`, CSS injection (`#gdi-stall-style`)
- **Exports:** `GDI_MODULES` entry only
- **Imports:** Bus, DOM
- **Load order:** 7th
- **Risk:** NONE — fully independent.

#### 8. `study-panel.js` — ~700 lines (the M22 shell remainder)
- **Contains:**
  - State: `panel, tab` (via `window.__gdiStudy._panel/_tab` or local refs synced to `__gdiStudy`)
  - Constants: `TAB_GROUPS`
  - Functions: `showOnboarding, openPanel, closePanel, renderSidebarHTML, renderHeaderHTML, updateHeaderStats, renderBody, renderPanel, renderDrives, browseDriveInPanel, renderHome, injectNavButton, scheduleNavInject, tryOpenFromURL (nested IIFE unwound)`
  - Event listeners:
    - `document.addEventListener('keydown', …)` (Esc/c/space/1/2/3) — references panel, FC, closePanel, openPanel
    - `setTimeout(scheduleNavInject, 300)` (initial)
    - `Bus.onGlobal('page:change', scheduleNavInject)`
    - `Bus.onGlobal('rows:appended', scheduleNavInject)`
    - `GDI_MODULES.push({name:'central-nav', init: scheduleNavInject})`
    - `setTimeout(tryOpenFromURL, 1000)` (initial)
    - `Bus.onGlobal('page:change', () => setTimeout(tryOpenFromURL, 500))`
    - `Bus.onGlobal('user:ready', () => setTimeout(tryOpenFromURL, 300))`
- **Exports (window):** `__gdiOpenCentral` (alias for openPanel), `__gdiCurrentTab` (write), `__gdiSyncInProgress` (write), `__gdiAutoOpenDone` (write)
- **Exports (window.__gdiStudy):** `getPanel, setPanel, getTab, setTab, FC, openPanel, closePanel, renderBody, renderHome, renderDrives, browseDriveInPanel`
- **Imports:** `window.__gdiStudy.{esc, lsGet, lsSet, dayKey, dateBr, fmtMin, todayMin, goalMin, collectCourses, courseName, driveNameOf, cleanCourseName, realName, bestIn, ensureState, stateD}` (from study-courses.js), `window.__gdiStudy.FC` (shared with study-tabs-legacy.js), `GDI_ROOT()`, `window.gdiSyncCoursesFromDrive`, `window.__gdiCurrentTab`, `window.gdiCourseIdentity`, `window.gdiCourseScanner`, `window.drive_names`, `window.gdiListAllFiles`, `window.gdiGetPw`, `window.GDIUser.ready`, `window.MODEL.autoOpenCentral`, `window.renderQuestoes/Simulado/Cronograma/Resumos/Provas/Redacao/Radar` (all from other study modules), Bus, escHtml, showToast
- **Load order:** 8th (LAST)
- **Risk:** HIGHEST — receives all the cross-cluster wiring.

### Summary table

| File | Lines | IIFE source | Load order | Risk |
|---|---|---|---|---|
| study-theme.js | 175 | #4 verbatim | 1 | NONE |
| study-scanner.js | 535 | #6 verbatim | 2 | LOW |
| study-courses.js | ~1100 | #2 carve-out (courses half) | 3 | MEDIUM |
| study-questions.js | 715 | #1 verbatim | 4 | LOW |
| study-advanced.js | 420 | #3 verbatim | 5 | LOW |
| study-tabs-legacy.js | ~480 | #2 carve-out (legacy tabs) | 6 | LOW |
| study-player-guard.js | 135 | #5 verbatim | 7 | NONE |
| study-panel.js | ~700 | #2 carve-out (shell) | 8 | HIGH |
| **TOTAL** | **~4260** (the remainder is comments/whitespace/header) | | | |

---

## 8. Risks & Gotchas

### R1 (HIGH) — `_qFilterSubject` cross-module communication is ALREADY BROKEN
- **Location:** M23 line 99 (`let _qFilterSubject=null` — closure-private) vs M24 line 4224 (`window._qFilterSubject=subj` — writes to window).
- **Symptom:** Clicking a tile in `renderRadar` is supposed to switch to Questões tab and filter by subject. The radar correctly sets `window._qFilterSubject`, but `renderQuestoes` reads its own closure-scoped `_qFilterSubject`, NOT `window._qFilterSubject`. The two never connect.
- **Modularization impact:** Modularization **will not fix** this — it's a pre-existing bug. But it MUST be flagged because:
  - If we put M23 in `study-questions.js` and M24 in `study-advanced.js`, the bug remains.
  - **Fix opportunity (recommended):** During modularization, change M23's `_qFilterSubject` to read from `window._qFilterSubject` (or move it to `window.__gdiStudy._qFilterSubject` as the single source of truth). This is a 1-line behavior fix that aligns with the modularization.
- **Decision for implementer:** Apply the 1-line fix during modularization (read `window._qFilterSubject ?? null` instead of closure `_qFilterSubject`). Document it in the worklog.

### R2 (HIGH) — `panel`, `tab`, `FC` are mutable closure state shared across 10+ functions
- **Current:** All live in M22 closure; mutated by openPanel/closePanel/renderBody/renderPanel/renderHome/etc.
- **After split:** Multiple modules need to read/write these. Options:
  - **(A)** Keep in study-panel.js, expose via `window.__gdiStudy.getPanel()/setPanel()/getTab()/setTab()` — adds 4 getter/setter calls per access (~20 call sites)
  - **(B)** Move to a top-level `study-state.js` (~30 lines) loaded FIRST, with `const state = { panel: null, tab: 'home', FC: {…} }; window.__gdiStudy = state;` — cleaner but adds a 9th file
  - **(C)** Keep `panel` and `tab` as `window.__gdiStudy.panel` and `window.__gdiStudy.tab` (direct property access, no getters) — simplest, but loses encapsulation
- **Recommendation:** Option **(C)** — least code change. Direct `window.__gdiStudy.panel = …` is fine; there's no invariant to enforce.
- **Migration:** Replace `panel` → `window.__gdiStudy.panel`, `tab` → `window.__gdiStudy.tab`, `FC` → `window.__gdiStudy.FC` in study-panel.js, study-courses.js (intervals only), study-tabs-legacy.js (FC only).

### R3 (HIGH) — `renderHome` recursive self-reference
- **Location:** Line 1647 inside `renderHome`, within a `Promise.then(() => { if(b && typeof renderHome === 'function') renderHome(b); })`.
- **Current:** Works because `renderHome` is a function declaration in the same closure (hoisted; late-bound in the arrow function).
- **After split:** If `renderHome` is exported to `window.__gdiStudy.renderHome = function(box) { … }`, the recursive call should reference `window.__gdiStudy.renderHome(b)` (or `this.renderHome(b)` if `this` is bound). The current `typeof renderHome === 'function'` check would need to become `typeof window.__gdiStudy.renderHome === 'function'`.
- **Recommendation:** Use `window.__gdiStudy.renderHome` explicitly. Add a local alias `const renderHome = window.__gdiStudy.renderHome = function(box) { … }` at the top of study-panel.js so internal calls still work via the local name.

### R4 (MEDIUM) — `gdiRefreshCentralPanel` calls `renderBody(tab)` cross-module
- **Current:** Line 2137 — `renderBody(tab)` is a closure call.
- **After split:** `gdiRefreshCentralPanel` lives in study-courses.js, `renderBody` lives in study-panel.js. Must change to `window.__gdiStudy.renderBody(window.__gdiStudy.tab)`.

### R5 (MEDIUM) — `showAddCourseModal` called by `renderBody` cross-module
- **Current:** Line 1421 — `renderBody` calls `showAddCourseModal(body)` when `currentTab === 'addmateria'`.
- **After split:** `renderBody` is in study-panel.js, `showAddCourseModal` is in study-courses.js. Must change to `window.__gdiStudy.showAddCourseModal(body)` (export it from study-courses.js).

### R6 (MEDIUM) — `Bus.onGlobal('media:ready', …)` registered by TWO different IIFEs
- **Current:**
  - Line 1216 (M22 — marathon auto-play/skip-intro)
  - Line 4554 (Player-Guard — stall watchdog)
- **After split:** Both stay registered; no conflict (Bus supports multiple handlers per event). Just ensure both handlers are re-registered in their respective new files.

### R7 (MEDIUM) — `Bus.onGlobal('page:change', …)` registered by THREE different IIFEs
- **Current:**
  - Line 3717 (M22 — `scheduleNavInject`)
  - Line 3796 (M22 nested IIFE — `tryOpenFromURL` retry)
  - Line 5092 (Scanner — `autoScanPending` retry)
- **After split:** All three handlers survive. No conflict.

### R8 (MEDIUM) — `tryOpenFromURL` is a nested IIFE inside M22
- **Current:** Lines 3746-3803 — nested IIFE that captures `openPanel` from outer M22 scope.
- **After split:** Unwind into study-panel.js top-level (no need for the wrapper IIFE). `openPanel` is in the same file (study-panel.js), so direct call works.

### R9 (LOW) — `setInterval` references `panel` visibility
- **Current:** Lines 1179, 1202 — `if(document.getElementById('gdi-home-card') || (panel && panel.style.display==='flex'))`
- **After split:** Intervals stay in study-courses.js (with `flushWatch`/`updateGoalChip`). Replace `panel` → `window.__gdiStudy.panel`.

### R10 (LOW) — `renderRadar` writes `window._qFilterSubject` but renderQuestoes reads closure
- Already covered in R1. Listed separately for visibility.

### R11 (LOW) — `autoScanPending` calls `renderHome(body)` cross-module
- **Current:** Line 4987 — `if(body && window.__gdiCurrentTab === 'home' && typeof renderHome === 'function') renderHome(body);`
- **After split:** `autoScanPending` is in study-scanner.js, `renderHome` is in study-panel.js. Change `typeof renderHome === 'function'` → `typeof window.__gdiStudy.renderHome === 'function'` and call → `window.__gdiStudy.renderHome(body)`.

### R12 (LOW) — CSS for `.gdi-central-style` is registered inside M22 (line 3547)
- **Current:** The big CSS block (`#gdi-central`, `.gdi-central-box`, etc.) is injected by M22 at IIFE-eval time.
- **After split:** Move this CSS injection to study-panel.js (top-level, runs at load). It's idempotent (guarded by `if(!document.getElementById('gdi-central-style'))`).
- **Alternative:** Move to study-theme.js (merge with BlackTie CSS). Cleaner separation (all CSS in one file).

### R13 (LOW) — `escHtml` vs local `esc` ambiguity
- **Current:** M22 has `const esc = s => window.escHtml ? window.escHtml(s) : fallback`. Inside `showAddCourseModal`, `esc` is redefined locally to the same thing. Inconsistent.
- **After split:** Standardize on `window.__gdiStudy.esc` everywhere. No behavior change.

### R14 (LOW) — `study-courses.js` would be ~1100 lines (above the 1000 target)
- **Cause:** `showAddCourseModal` (511 lines), `openCourseDetail` (332 lines), `renderCursos` (213 lines) are all large.
- **Option:** Split study-courses.js further into `study-courses-list.js` (collectCourses, renderCursos, renderCourseCard, openCourseDetail, showHiddenCoursesModal — ~600 lines) + `study-courses-add.js` (gdiAddCourseFromButton, gdiAddCourseFromDrive, showAddCourseModal + nested helpers — ~700 lines). But this fragments shared helpers (collectCourses, courseName, driveNameOf, realName, bestIn) across two files, requiring all of them on `window.__gdiStudy`.
- **Recommendation:** Keep as single `study-courses.js` (~1100 lines). The 1000-line target is a soft guideline; 1100 is acceptable. Avoid over-splitting.

### R15 (LOW) — `study-panel.js` `renderHome` references `window.gdiSyncCoursesFromDrive` + `window.__gdiSyncInProgress` + `window.__gdiCurrentTab` + `window.gdiCourseIdentity` + `window.gdiCourseScanner` + `window.__gdiStudy.collectCourses/cleanCourseName/driveNameOf/realName/bestIn/esc/lsGet`
- All already on `window.*` (or will be on `__gdiStudy`). No new exports needed beyond `__gdiStudy.collectCourses` etc. listed in §4.

---

## 9. Implementation Plan (suggested order of operations)

1. **Backup:** `cp gdi-study.js gdi-study.js.v86-pre-modularization-bak`
2. **Create `modular/study/` directory.**
3. **Create `modular/study/study-theme.js`** — verbatim copy of IIFE #4 (lines 4241-4416). Test load.
4. **Create `modular/study/study-scanner.js`** — verbatim copy of IIFE #6 (lines 4580-5115) + change `renderHome(body)` → `window.__gdiStudy.renderHome(body)` at line 4987.
5. **Create `modular/study/study-questions.js`** — verbatim copy of IIFE #1 (lines 21-735) + change `collectCourses()` calls → `window.collectCourses()` (already on window) + apply R1 fix (read `window._qFilterSubject ?? null`).
6. **Create `modular/study/study-advanced.js`** — verbatim copy of IIFE #3 (lines 3812-4231) + change `collectCourses()` → `window.collectCourses()`.
7. **Create `modular/study/study-tabs-legacy.js`** — extract `renderFlash/studyFlash/renderMarathon/renderSubjects/editSubject/renderTrails/editTrail` from M22 + replace `FC`/`cards`/`saveCards`/`dueCards`/`marOn`/`marIntro`/`norm` with `window.__gdiStudy.*` accessors.
8. **Create `modular/study/study-player-guard.js`** — verbatim copy of IIFE #5 (lines 4428-4564).
9. **Create `modular/study/study-courses.js`** — extract courses half of M22. Expose helpers via `window.__gdiStudy.*`. Move `Bus.onGlobal('watched:changed')`, play/pause/ended listeners, both `setInterval`s, `Bus.onGlobal('media:ready' marathon)` to this file.
10. **Create `modular/study/study-panel.js`** — extract panel shell half of M22. Define `window.__gdiStudy = { panel: null, tab: 'home', FC: {…}, renderHome, renderBody, openPanel, closePanel, renderDrives, browseDriveInPanel, showOnboarding }` (or assign to existing `window.__gdiStudy`). Move `keydown` listener, `Bus.onGlobal('page:change'/'rows:appended')`, `GDI_MODULES.push('central-nav')`, `tryOpenFromURL` + its listeners, `setTimeout`s.
11. **Update `gdi-extras-loader.js`** (or wherever gdi-study.js is currently loaded) to load the 8 new files in the order specified in §7.
12. **Delete or empty `gdi-study.js`** (keep as a stub that loads the 8 files via `<script>` tags if the loader doesn't handle it).
13. **Browser test:** login → open Área do Aluno → test all 12 tabs → add a course → escanear → check home dashboard → check keydown shortcuts (c, Esc, space, 1/2/3 in flashcards).
14. **Backup the modularized version** to the private repo.

---

## 10. Verification Checklist (post-modularization)

- [ ] `node --check` on all 8 new files → PASS
- [ ] Browser console shows:
  - `[GDI Extras] M23 Estudo Ativo (questões/simulado/cronograma/revisões) ativo`
  - `[GDI M22] Área do Aluno ativa (v3.1 — URL ?central=1 abre direto + atalho tecla C)`
  - `[GDI Extras] M24 Estudo Avançado (provas/redação/radar) ativo`
  - `[GDI Extras] BlackTie tema aplicado`
  - `[GDI Player-Guard] monitorando vídeo` (only on video pages)
  - `[GDI Course Scanner] v1.1 — lightweight background scanner ativo…`
- [ ] All `window.*` exports from §1.3 still defined (run `Object.keys(window).filter(k => k.startsWith('gdi') || k.startsWith('render') || k.startsWith('__gdi'))` in console)
- [ ] `window.gdiCourseScanner` has all 9 methods + 4 constants + version
- [ ] Área do Aluno opens with `c` key, `?central=1` URL, and navbar button
- [ ] All 12 sidebar tabs render without "módulo não carregou" empty state
- [ ] Add course modal works (drive browser + manual)
- [ ] Course tile "Escanear agora" button works
- [ ] Questões tab: generate, add, import, resolve, paginate
- [ ] Simulado tab: start, finish, history
- [ ] Cronograma tab: generate, paginate
- [ ] Provas tab: upload PDF, generate plan, view saved
- [ ] Redação tab: type, correct, view saved
- [ ] Radar tab: click tile → switches to Questões (with R1 fix applied, filter is applied)
- [ ] Stats tab: heatmap + chips render
- [ ] Achievements tab: grid renders
- [ ] Player-guard: stall overlay appears after 15s no progress (test with network throttle)
- [ ] No console errors on page load

---

**End of study.**
