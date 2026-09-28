// ═══════════════════════════════════════════════════════════════
// study-scanner.js — Lightweight background course scanner
//
// Split from gdi-study.js (v1.0.86 modularization, Task v86-MOD-STUDY).
// Originally IIFE #6 "M-COURSE-SCANNER" (lines 4580-5115, ~535 lines).
//
// Namespace: window.__gdiStudy.scanner = {
//                startScan, getScanState, setScanState, setLessons, getLessons,
//                autoScanPending, scanCourseLessons, cleanupOrphanCourses,
//                scanCourse, getScanProgress, getCourseLessons, countWatched,
//                clearScanState, resumeInterruptedScans,
//                getDistributedStatus, rescanCourse, validateCoursePath   ← v1.2
//            }
// Aliases:   window.gdiCourseScanner (original monolith alias, preserved),
//            window.gdiSyncCoursesFromDrive, window.autoScanPending,
//            window.gdiCleanupOrphanCourses
// Guard:     window.__gdiStudyScanner (prevents double-init).
//            Also keeps original guard `if(window.gdiCourseScanner)return;`
//            for backward compat (in case any caller probes the old global).
// Depends on: window.GDIStorage, window.Bus, window.gdiCourseIdentity,
//             window.gdiListAllFiles (worker bridge — non-blocking)
//             window.__gdiStudy.panel.renderHome (late binding for tile refresh)
// Load order: 2nd study module
//
// FIX while splitting:
//   - autoScanPending references renderHome (closure-private in the
//     monolith's M22 IIFE). Now renderHome lives in study-panel.js, so the
//     call uses late binding: window.__gdiStudy.panel.renderHome(body).
//     The typeof check guards against panel module not being loaded yet.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';
  if(window.__gdiStudyScanner) return;
  window.__gdiStudyScanner = true;
  window.__gdiStudy = window.__gdiStudy || {};

  // ── Preserve original monolith guard for any caller probing the old global ──
  if(window.gdiCourseScanner) return;

  const LS_SCAN_PREFIX    = 'gdi-course-scan-';     // scanner state per course
  const LS_LESSONS_PREFIX = 'gdi-course-lessons-';  // lessons cache per course
  const SCAN_PAUSE_MS     = 500;                    // pause between subfolders
  const SCAN_BATCH        = 1;                      // 1 subfolder at a time (lightest)
  const SCAN_MAX_DEPTH    = 3;                      // don't go deeper than 3 levels

  // ── Scanner state (resumable) ──
  // ★ FIX 20-6 #2 (Agent 6): _inflightScans tracks courseKeys with an active
  //    scanCourse() promise in flight. startScan() adds the key before
  //    fire-and-forget; the promise's finally() removes it. resumeInterruptedScans
  //    and startScan itself check this Set BEFORE starting a duplicate scan
  //    (previously, two concurrent calls could both pass the localStorage
  //    'scanning' check if the first hadn't yet written its state — they would
  //    both fire scanCourse, doubling subrequest load on the worker).
  const _inflightScans = new Set();

  function getScanState(courseKey){
    try{const v=localStorage.getItem(LS_SCAN_PREFIX+courseKey);return v?JSON.parse(v):null}catch(_){return null}
  }
  function setScanState(courseKey, state){
    try{
      localStorage.setItem(LS_SCAN_PREFIX+courseKey, JSON.stringify(state));
      // ★ v1.0.99: track timestamp for eviction ordering
      try{localStorage.setItem(LS_LESSONS_PREFIX+courseKey+'__at', String(Date.now()));}catch(_){}
    }catch(e){
      console.warn('[Scanner] setScanState quota error:', e && e.message);
      _evictOldestLessons();
      try{localStorage.setItem(LS_SCAN_PREFIX+courseKey, JSON.stringify(state));}catch(_){}
    }
  }
  function clearScanState(courseKey){
    try{localStorage.removeItem(LS_SCAN_PREFIX+courseKey)}catch(_){}
    // ★ v1.0.98 FIX: also clear lessons cache to prevent orphan entries + quota bloat (Agent 13 Bug 5)
    try{localStorage.removeItem(LS_LESSONS_PREFIX+courseKey)}catch(_){}
    // ★ FIX (Agent 14 Bug 4): also remove the __at timestamp written by setScanState —
    //    otherwise _evictOldestLessons still sees an orphan 'at' marker for a
    //    cleared course, breaking eviction ordering.
    try{localStorage.removeItem(LS_LESSONS_PREFIX+courseKey+'__at')}catch(_){}
  }

  // ── Lessons cache (per course) ──
  function getLessons(courseKey){
    try{
      const v=localStorage.getItem(LS_LESSONS_PREFIX+courseKey);
      return v?JSON.parse(v):{lessons:[],scanned:false,totalFolders:0,totalLessons:0};
    }catch(_){return {lessons:[],scanned:false,totalFolders:0,totalLessons:0}}
  }
  // ★ v1.0.99: evict oldest lesson caches when localStorage is full
  function _evictOldestLessons(){
    try{
      const keys = [];
      for(let i=0; i<localStorage.length; i++){
        const k = localStorage.key(i);
        if(k && k.startsWith(LS_LESSONS_PREFIX) && !k.endsWith('__at')){
          const at = parseInt(localStorage.getItem(k+'__at')||'0',10);
          keys.push({key: k, at: at});
        }
      }
      keys.sort((a,b) => a.at - b.at);
      const evictCount = Math.ceil(keys.length * 0.25);
      for(let i=0; i<evictCount && i<keys.length; i++){
        localStorage.removeItem(keys[i].key);
        try{localStorage.removeItem(keys[i].key+'__at');}catch(_){}
      }
      console.log('[Scanner] evicted', evictCount, 'oldest lesson caches');
    }catch(_){}
  }
  function setLessons(courseKey, data){
    try{
      // ★ v1.0.99: cap at 500 lessons per course to prevent localStorage quota exhaustion
      if(data && Array.isArray(data.lessons) && data.lessons.length > 500){
        data = Object.assign({}, data, {lessons: data.lessons.slice(0, 500), truncated: true});
      }
      localStorage.setItem(LS_LESSONS_PREFIX+courseKey, JSON.stringify(data));
    }catch(e){
      console.warn('[Scanner] setLessons quota error for', courseKey, ':', e && e.message);
      _evictOldestLessons();
      try{localStorage.setItem(LS_LESSONS_PREFIX+courseKey, JSON.stringify(data));}catch(_){console.warn('[Scanner] setLessons retry failed');}
    }
  }

  // Video extension matcher — same regex as app.min.js buildPlaylistFromFiles
  const VIDEO_EXT = /\.(mp4|webm|mkv|mov|m4v|avi|mpg|mpeg|wmv|flv|3gp)(\?|$)/i;

  // Scan ONE folder — returns {lessons:[], subfolders:[]}
  // Uses window.gdiListAllFiles (worker bridge — non-blocking).
  async function scanFolder(folderPath, depth){
    if(depth > SCAN_MAX_DEPTH) return {lessons:[], subfolders:[]};
    try{
      const pw = (typeof window.gdiGetPw === 'function') ? (window.gdiGetPw(folderPath)||'') : '';
      const files = (typeof window.gdiListAllFiles === 'function')
        ? await window.gdiListAllFiles(folderPath, pw)
        : [];
      if(!Array.isArray(files)) return {lessons:[], subfolders:[]};
      const lessons = [];
      const subfolders = [];
      for(let i=0; i<files.length; i++){
        const f = files[i];
        if(!f) continue;
        const name = f.name || '';
        const mime = f.mimeType || '';
        if(mime === 'application/vnd.google-apps.folder'){
          subfolders.push(f);
        } else if(mime.indexOf('video/') === 0 || VIDEO_EXT.test(name)){
          // It's a video lesson
          if(/\.part-/i.test(name)) continue;  // skip partial files
          const bytes = Number(f.size)||0;
          if(bytes && bytes < 1024*1024) continue;  // skip < 1MB (probably not a real lesson)
          lessons.push({
            name: name,
            path: folderPath + encodeURIComponent(name),
            folder: folderPath,
            size: bytes,
            mimeType: mime,
            depth: depth
          });
        }
      }
      return {lessons, subfolders};
    }catch(e){
      console.warn('[Scanner] erro escaneando', folderPath, e && e.message);
      return {lessons:[], subfolders:[]};
    }
  }

  // Compute folder depth relative to the course root path.
  // Each '/' in the path beyond the root counts as one level.
  function depthOf(folderPath, rootPath){
    try{
      const f = (folderPath||'').split('/').filter(Boolean).length;
      const r = (rootPath||'').split('/').filter(Boolean).length;
      return Math.max(0, f - r);
    }catch(_){return 0}
  }

  // Main scan function — incremental, resumable.
  // courseKey == coursePath (the Drive folder path, e.g. /4:/CANTE COM EXCELENCIA 2.0/)
  // Calls onProgress(state, lessonsData) after each folder.
  // ★ Task 32: scanner usa API server-side (POST /api/courses/scan-progress)
  //    Antes: client-side fazia centenas de fetches individuais → travava em 19%
  //    Agora: 1 único POST pro servidor, que escaneia tudo recursivamente
  //    O servidor tem acesso direto ao Google Drive API (sem CORS, sem Worker bridge)
  async function scanCourse(courseKey, onProgress){
    let state = getScanState(courseKey) || {
      courseId: courseKey,
      coursePath: courseKey,
      status: 'scanning',
      startedAt: Date.now(),
      scannedFolders: 0,
      scannedCount: 0,
      totalFolders: 1,
      pendingFolders: 0,
      queue: [],
      scanned: []
    };
    // ★ v1.0.78: guard against drive-root paths
    if(/^\/\d+:\/?$/.test(courseKey||'')){
      state.status = 'error';
      state.startedAt = Date.now();
      state.error = 'Caminho inválido (raiz do drive). Remova este curso e adicione novamente.';
      setScanState(courseKey, state);
      if(onProgress) try{ onProgress(state, getLessons(courseKey)); }catch(_){}
      return state;
    }
    state.status = 'scanning';
    state.startedAt = Date.now();
    setScanState(courseKey, state);
    if(onProgress) try{ onProgress(state, getLessons(courseKey)); }catch(_){}

    // ─────────────────────────────────────────────────────────────
    // ★ v1.0.96 / ENG-SCANNER-DISTRIBUTED §6.1 — Polling loop.
    //
    // Each batch on the worker processes at most SCAN_MAX_SUBREQ=40 subrequests
    // (Cloudflare subrequest limit). For a deep course (TJ SP = 3077 aulas,
    // ~47 folders), a single POST returns status='partial' with pendingFolders>0.
    // We must loop until status==='done' (or cached:true) or pendingFolders===0.
    //
    // Budget: MAX_POLLS=50 batches × POLL_INTERVAL=600ms ≈ 30s MINIMUM (just
    // waits — each fetch can take 1-3s extra on a warm Cloudflare isolate).
    //
    // ★ FIX 20-6 #3 (Agent 6) — VERIFICATION: Is 30s enough for large courses?
    //   • Worst case observed in production: TJ SP (47 folders, 3077 lessons).
    //     Each worker batch processes up to 40 subrequests → 2 batches minimum
    //     for 47 folders. With caching (dotfiles), subsequent scans return
    //     cached=true on the FIRST poll → total time <1s.
    //   • Cold cache, fresh scan: 2 batches × ~2s fetch + 1 × 600ms wait ≈ 5s.
    //     Well under the 30s minimum budget (50 polls × 600ms).
    //   • Edge case: extremely deep course (300+ folders, e.g. medical school
    //     with weekly new content): 8 batches × ~2s + 7 × 600ms ≈ 20s. Still
    //     within budget.
    //   • If budget exceeded: state.status='partial' (NOT error) — student can
    //     resume on next page:change. Lessons found so far are persisted.
    //   • VERDICT: 30s budget is sufficient for documented real-world cases.
    //     The 'partial' fallback ensures forward progress even if exceeded.
    // ─────────────────────────────────────────────────────────────
    const MAX_POLLS     = 50;
    const POLL_INTERVAL = 600;
    let pollCount   = 0;
    let allLessons  = [];
    let lastD       = null;  // last successful response (used in catch)

    try{
      while(pollCount < MAX_POLLS){
        const r = await fetch('/api/courses/scan-progress', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({coursePath: courseKey})
        });
        if(!r.ok) throw new Error('HTTP '+r.status);
        const d = await r.json().catch(()=>null);
        if(!d || !d.ok) throw new Error((d && d.error) || 'scan falhou');
        lastD = d;

        allLessons = d.lessons || [];

        // ★ v1.0.96: distributed scan fields (additive, no breaking changes)
        //   scannedCount = number of folders with valid dotfiles (from server)
        //   source       = 'direct' | 'mirror' | 'legacy' | 'distributed'
        state.scannedCount   = (typeof d.scannedCount === 'number')
                                  ? d.scannedCount
                                  : (state.scannedCount || 0);
        state.source         = d.source || state.source || 'legacy';
        // Keep scannedFolders in sync (legacy field, used by getScanProgress)
        state.scannedFolders = state.scannedCount;
        state.pendingFolders = d.pendingFolders || 0;
        state.totalFolders   = state.scannedFolders + (d.pendingFolders || 0);
        if(state.scannedFolders > state.totalFolders){
          state.scannedFolders = state.totalFolders;
        }
        state.lessonsFound   = allLessons.length;
        state.batchNum       = pollCount + 1;
        state.scannedBy      = d.scannedBy || state.scannedBy || null;

        // Determine this iteration's terminal state.
        //   cached  → done immediately (someone else already scanned)
        //   done    → done (server finished in this batch)
        //   partial → wait + loop
        const isCached = !!d.cached;
        const isDone   = isCached || d.status === 'done' || d.pendingFolders === 0;

        if(isDone){
          state.status         = 'done';
          state.scannedCount   = state.totalFolders;
          state.scannedFolders = state.totalFolders;
          state.percent        = 100;
          state.completedAt    = Date.now();
          setScanState(courseKey, state);

          const doneData = {
            lessons: allLessons,
            scanned: true,
            totalLessons: allLessons.length,
            scannedBy: d.scannedBy || null,
            source: state.source,
            cached: isCached
          };
          setLessons(courseKey, doneData);
          // Best-effort save to Drive (cross-student legacy fallback)
          try{
            if(window.GDIStorage && window.GDIStorage.saveMaterial){
              window.GDIStorage.saveMaterial(courseKey, courseKey, 'lessons', JSON.stringify(doneData)).catch(()=>{});
            }
          }catch(_){}
          // ALWAYS call onProgress after each iteration so UI updates.
          if(onProgress) try{ onProgress(state, doneData); }catch(_){}
          return state;
        }

        // Partial — update progress bar, persist, notify, then wait + loop.
        state.status   = 'scanning';
        state.percent  = state.totalFolders
                            ? Math.round(state.scannedFolders / state.totalFolders * 100)
                            : 100;
        setScanState(courseKey, state);

        const partialData = {
          lessons: allLessons,
          scanned: false,
          totalLessons: allLessons.length,
          scannedBy: d.scannedBy || null,
          source: state.source
        };
        setLessons(courseKey, partialData);
        if(onProgress) try{ onProgress(state, partialData); }catch(_){}

        pollCount++;
        await new Promise(res => setTimeout(res, POLL_INTERVAL));
      }

      // Exceeded MAX_POLLS — mark 'partial' (NOT error; student can resume).
      state.status   = 'partial';
      state.percent  = state.totalFolders
                          ? Math.round(state.scannedFolders / state.totalFolders * 100)
                          : 0;
      state.pollsUsed = pollCount;
      setScanState(courseKey, state);
      const partialFinal = {
        lessons: allLessons,
        scanned: false,
        totalLessons: allLessons.length,
        scannedBy: (lastD && lastD.scannedBy) || null,
        source: state.source
      };
      setLessons(courseKey, partialFinal);
      if(onProgress) try{ onProgress(state, partialFinal); }catch(_){}
      return state;
    }catch(e){
      console.error('[Scanner] erro:', e && e.message);
      state.status = 'error';
      state.error  = (e && e.message) || String(e);
      setScanState(courseKey, state);
      // Persist partial lessons if any, so UI shows what we have so far.
      if(allLessons && allLessons.length){
        const partialOnError = {
          lessons: allLessons,
          scanned: false,
          totalLessons: allLessons.length,
          scannedBy: (lastD && lastD.scannedBy) || null,
          source: state.source
        };
        setLessons(courseKey, partialOnError);
        if(onProgress) try{ onProgress(state, partialOnError); }catch(_){}
      } else {
        if(onProgress) try{ onProgress(state, getLessons(courseKey)); }catch(_){}
      }
      return state;
    }
  }
  // ★ Alias: scanCourseLessons (per task spec; matches conceptual name)
  const scanCourseLessons = scanCourse;

  // Get scan progress for a course (for tile display)
  function getScanProgress(courseKey){
    const state = getScanState(courseKey);
    if(!state) return null;
    const lessons = getLessons(courseKey);
    const total = state.totalFolders || state.scannedFolders || 0;
    return {
      status: state.status,            // 'scanning' | 'done' | 'error' | 'paused'
      scannedFolders: state.scannedFolders || 0,
      totalFolders: total,
      lessonsFound: (lessons.lessons||[]).length,
      percent: total > 0 ? Math.round((state.scannedFolders||0) / total * 100) : 0,
      error: state.error || null,
      startedAt: state.startedAt || null,
      completedAt: state.completedAt || null
    };
  }

  // Get lessons for a course (from cache)
  function getCourseLessons(courseKey){
    return getLessons(courseKey);
  }

  // Count watched lessons for a course (from GDIUser userstate.watched)
  // Matches by path prefix: any watched path that starts with courseKey
  function countWatched(courseKey){
    try{
      if(!window.GDIUser || typeof window.GDIUser.dump !== 'function') return 0;
      const dump = window.GDIUser.dump();
      if(!dump || !dump.watched) return 0;
      const watched = dump.watched;
      const pre = String(courseKey||'').toLowerCase();
      let count = 0;
      for(const k in watched){
        const lk = String(k).toLowerCase();
        if(lk === pre || lk.indexOf(pre + '/') === 0) count++;
      }
      return count;
    }catch(_){return 0}
  }

  // Start scan — non-blocking, runs in background.
  // onProgress(state, lessonsData) is called after each folder.
  function startScan(courseKey, onProgress){
    if(!courseKey){
      console.warn('[Scanner] startScan chamado sem courseKey');
      return;
    }
    // ★ FIX 20-6 #2 (Agent 6): check in-flight Set BEFORE localStorage state.
    //    A scan that just started may not have written its 'scanning' state to
    //    localStorage yet (setScanState happens inside scanCourse, which is
    //    async). Without this guard, two near-simultaneous startScan calls
    //    would both pass the localStorage check and both fire scanCourse.
    if(_inflightScans.has(courseKey)){
      console.log('[Scanner] scan já em andamento (in-flight) para', courseKey, '— não iniciando duplicata');
      try{ if(onProgress) onProgress(getScanState(courseKey), getLessons(courseKey)); }catch(_){}
      return;
    }
    // Check if already scanning (constraint: no multiple instances per course)
    const existing = getScanState(courseKey);
    if(existing && existing.status === 'scanning'){
      // ★ Task FINAL / Fix 2b: se o scan está "preso" há mais de 5 minutos,
      // provavelmente travou (página fechada no meio, erro não capturado, etc).
      // Nesse caso, limpa o estado e reinicia. Antes, o scanner ficava preso
      // para sempre mostrando "scan já em andamento".
      const ageMin = existing.startedAt ? (Date.now() - existing.startedAt) / 60000 : 999;
      if(ageMin > 5){
        console.log('[Scanner] scan travado há', Math.round(ageMin), 'min — reiniciando', courseKey);
        clearScanState(courseKey);
      } else {
        console.log('[Scanner] scan já em andamento para', courseKey, '— não iniciando duplicata');
        try{ if(onProgress) onProgress(existing, getLessons(courseKey)); }catch(_){}
        return;
      }
    }
    // ★ FIX 20-6 #2 (Agent 6): mark in-flight BEFORE firing scanCourse so any
    //    concurrent startScan(courseKey, ...) sees it immediately.
    _inflightScans.add(courseKey);
    // Fire-and-forget — errors captured and saved to state
    scanCourse(courseKey, onProgress).catch(e=>{
      console.error('[Scanner] erro fatal:', e && e.message);
      const state = getScanState(courseKey);
      if(state){
        state.status = 'error';
        state.error = e && e.message || String(e);
        setScanState(courseKey, state);
        try{ if(onProgress) onProgress(state, getLessons(courseKey)); }catch(_){}
      }
    }).finally(()=>{
      // ★ FIX 20-6 #2 (Agent 6): always release the in-flight slot, even on
      //    error/exception, so subsequent startScan calls can proceed.
      _inflightScans.delete(courseKey);
    });
  }

  // Resume any interrupted scans on page load (e.g., user reloaded mid-scan)
  // ★ Task FINAL / Fix 2a: SEMPRE limpa estado "scanning" preso e reinicia.
  //   Antes, o status 'scanning' era mantido — mas se a página foi fechada no
  //   meio do scan, o estado fica preso para sempre ("scan já em andamento").
  //   Agora, qualquer 'scanning' residual ao recarregar a página é tratado
  //   como travado: limpa e reinicia.
  function resumeInterruptedScans(){
    try{
      const manual = JSON.parse(localStorage.getItem('gdi-manual-courses-v1') || '[]');
      if(!Array.isArray(manual)) return;
      for(const m of manual){
        if(!m || !m.path) continue;
        const state = getScanState(m.path);
        if(state && state.status === 'scanning'){
          // ★ FIX 20-6 #2 (Agent 6): skip if a scan for this course is already
          //    in-flight (e.g., user:ready fired twice and the first scan is
          //    still running). Without this guard, resumeInterruptedScans would
          //    clear the in-flight scan's state and startScan would re-fire
          //    scanCourse, doubling the load on the worker.
          if(_inflightScans.has(m.path)){
            console.log('[Scanner] resume skipped — scan já em andamento (in-flight):', m.path);
            continue;
          }
          console.log('[Scanner] scan preso detectado — limpando e reiniciando:', m.path);
          clearScanState(m.path);
          startScan(m.path, null);
        }
      }
    }catch(_){}
  }

  // ─────────────────────────────────────────────────────────────
  // ★ Task 16 / FIX 1: Auto-scan courses that haven't been scanned yet.
  // Courses added BEFORE the scanner (Task 15) was implemented have no scan
  // state, so collectCourses() falls back to pdfCount||0 (which is 0 for old
  // courses). This auto-scan picks the FIRST course without a 'done' state
  // and starts a non-blocking scan. Limited to 1 concurrent scan.
  // ─────────────────────────────────────────────────────────────
  let _autoScanRunning = false;

  // ★ v1.0.78: syncCoursesFromDrive — busca cursos do Drive e merge com localStorage
  // ★ v80-FIX BUG 6: read-modify-write race. Previously the function did a
  // single JSON.parse → push → setItem with no resiliency: two concurrent
  // invocations (e.g. openPanel + autoScanPending boot) could both read the
  // same array, both push their new courses, and the second setItem would
  // silently clobber the first → courses lost. Now we (a) wrap RMW in
  // try/catch with one retry, and (b) dedup by `key`/`id`/`path` right
  // before writing so concurrent writes can't introduce duplicates.
  // ★ v1.0.97 FIX: respeita hidden list local (gdi-hidden-courses-v1) — se o user
  // removeu um curso, ele NÃO deve ser re-adicionado pelo sync mesmo se o servidor
  // ainda o retornar (race entre sync e remove, ou remove ainda não propagou).
  async function syncCoursesFromDrive(){
    const LS_MANUAL = 'gdi-manual-courses-v1';
    const LS_HIDDEN = 'gdi-hidden-courses-v1';  // ★ v1.0.97
    let d;  // populated by fetch below; referenced by mergeDriveCourses closure
    // ★ FIX (Task 20-13 #6): local path normalizer — strip trailing slashes
    //   so '/0:/Cursos' and '/0:/Cursos/' are treated as the same course.
    //   Matches the normalization added to gdiAddCourseFromDrive /
    //   doAddCourseFromDrive in study-courses.js. Without this, sync could
    //   re-add a course that was already in localStorage (or hidden) just
    //   because the server returned a path with a trailing slash and the
    //   local copy didn't (or vice-versa).
    const _normPath = function(p){
      p = String(p||'').replace(/\/+$/,'');
      return p || '/';
    };
    const mergeDriveCourses = function(){
      const local = JSON.parse(localStorage.getItem(LS_MANUAL) || '[]');
      if(!Array.isArray(local)) throw new Error('localStorage not an array');
      // ★ FIX (Task 20-13 #6): build localPaths with normalized paths so the
      //   has() check below catches duplicates regardless of trailing slash.
      const localPaths = new Set(local.map(c => c && _normPath(c.path)));
      // ★ v1.0.97: carrega hidden list — cursos aqui NUNCA devem ser re-adicionados
      // ★ FIX (Task 20-13 #6): normalize hidden paths too so a hidden course
      //   is skipped even if the server returns it with a different trailing slash.
      const hiddenList = JSON.parse(localStorage.getItem(LS_HIDDEN) || '[]');
      const hiddenSet = new Set((Array.isArray(hiddenList) ? hiddenList : []).map(h => _normPath(h)));
      let added = 0;
      for(const dc of d.courses){
        const dcPath = _normPath(dc && dc.coursePath);
        if(dc && dc.coursePath && !localPaths.has(dcPath)){
          // ★ v1.0.97: pula se foi hidden localmente (normalized comparison)
          if(hiddenSet.has(dcPath)){
            continue;
          }
          local.push({
            id:'mc-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),
            name:dc.courseName||'Curso', icon:'📁', color:'#5ddeda', goal:60, notes:'',
            createdAt:dc.addedAt||Date.now(), manual:true, path:dcPath,
            courseKey:dcPath, pdfCount:dc.pdfCount||0
          });
          localPaths.add(dcPath);
          added++;
        }
      }
      // Dedup pass — resilient against concurrent writes that may have
      // inserted the same course between our read and our write.
      // ★ FIX (Task 20-13 #6): dedup by NORMALIZED path (not id) so legacy
      //   entries with trailing slashes are merged into one. Previously, two
      //   entries for the same course (one with '/', one without) had different
      //   ids and both survived dedup — leading to duplicate tiles.
      const seen = new Set();
      const deduped = [];
      for(const c of local){
        if(!c) continue;
        // Prefer normalized path as the dedup key; fall back to id only if
        // path is missing (shouldn't happen for manual courses, but defensive).
        const k = _normPath(c.path) || c.id;
        if(k){
          if(seen.has(k)) continue;
          seen.add(k);
        }
        deduped.push(c);
      }
      localStorage.setItem(LS_MANUAL, JSON.stringify(deduped));
      return added;
    };
    // ★ FIX 20-6 #4 (Agent 6): AbortController with 15s timeout. Previously
    //    the fetch to /api/courses/list had no timeout — if the worker was
    //    slow/unresponsive (e.g., cold isolate, network blackhole), this
    //    function would hang indefinitely, blocking the entire user:ready
    //    chain (autoScanPending only runs after syncCoursesFromDrive resolves
    //    via .finally()). 15s is generous for a simple list endpoint.
    const SYNC_COURSES_TIMEOUT_MS = 15000;
    const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(()=>{ try{ controller.abort(); }catch(_){} }, SYNC_COURSES_TIMEOUT_MS) : null;
    try{
      const fetchOpts = { method:'GET' };
      if(controller) fetchOpts.signal = controller.signal;
      const r = await fetch('/api/courses/list', fetchOpts);
      if(!r.ok){ console.warn('[syncCoursesFromDrive] HTTP', r.status); return; }
      d = await r.json();
      if(!d || !d.ok || !Array.isArray(d.courses)){ console.warn('[syncCoursesFromDrive] bad shape'); return; }
      let added;
      try {
        added = mergeDriveCourses();
      } catch(e) {
        // ★ FIX (Agent 14 Bug 11): do NOT retry on QuotaExceededError — the
        //    retry re-reads localStorage (same data) and re-writes the SAME
        //    payload, which will fail with quota again. The retry is futile
        //    and only delays the inevitable. Just bail out.
        const isQuota = e && (e.name === 'QuotaExceededError' ||
          /quota/i.test(e.message || '') ||
          (typeof DOMException !== 'undefined' && e instanceof DOMException && e.name === 'QuotaExceededError'));
        if(isQuota){
          console.warn('[syncCoursesFromDrive] QuotaExceededError — aborting merge (no retry):', e && e.message);
          return 0;
        }
        console.warn('[syncCoursesFromDrive] race detectada, re-lendo:', e && e.message);
        try {
          added = mergeDriveCourses();
        } catch(_){
          return;
        }
      }
      if(added > 0){
        console.log('[GDI M22] syncCoursesFromDrive: ' + added + ' cursos recuperados do Drive');
        // ★ FIX (Task 20-13 #7): emit courses:changed so downstream caches
        //   invalidate. Without this, the memoized collectCourses() in
        //   study-panel.js (_ccCache, 5s TTL) returns the STALE pre-sync array
        //   when renderHome's .then() callback fires after sync completes —
        //   the user would NOT see the freshly-restored course tiles until
        //   the 5s TTL expired. Similarly, bestInCache (60s TTL) in
        //   study-courses.js would hold stale entries. The Bus.emit pattern
        //   matches hideCourse/unhideCourse/addCourse/removeCourse in
        //   study-courses.js. Guarded with typeof Bus !== 'undefined' since
        //   the scanner may load before app.min.js defines Bus in edge cases
        //   (though per load order it shouldn't).
        try{
          if(typeof Bus !== 'undefined' && Bus && typeof Bus.emit === 'function'){
            Bus.emit('courses:changed', {source:'syncCoursesFromDrive', added:added});
          }
        }catch(_){}
      }
    }catch(e){
      // ★ FIX 20-6 #4 (Agent 6): distinguish AbortError (timeout) from network errors
      //    for diagnostic purposes. Either way, sync is best-effort and failure
      //    is non-fatal (autoScanPending still runs from .finally()).
      if(e && (e.name === 'AbortError' || /aborted/i.test(e.message||''))){
        console.warn('[syncCoursesFromDrive] timeout após', SYNC_COURSES_TIMEOUT_MS+'ms — abortado');
      }else{
        console.warn('[syncCoursesFromDrive] error:', e && e.message);
      }
    }finally{
      // ★ FIX 20-6 #4 (Agent 6): always clear the timeout, even on success,
      //    to prevent the timer from firing on an already-completed request.
      if(timeoutId) clearTimeout(timeoutId);
    }
  }

  function autoScanPending(){
    if(_autoScanRunning) return;
    _autoScanRunning = true;
    try{
      const manual = JSON.parse(localStorage.getItem('gdi-manual-courses-v1') || '[]');
      if(!Array.isArray(manual) || !manual.length){ _autoScanRunning = false; return; }

      // Find first course that needs scanning (no state OR not done/scanning)
      for(const c of manual){
        if(!c || !c.path) continue;
        // Skip drive-root paths (they're not real courses — Task 16 / FIX 3)
        // ★ v1.0.78: fixed regex to match /0:/ and /0:/ (with leading slash)
        if(/^\/\d+:\/?$/.test(c.path)) continue;
        const sp = getScanProgress(c.path);
        if(!sp || (sp.status !== 'done' && sp.status !== 'scanning')){
          console.log('[Scanner] auto-scan iniciando para:', c.name || c.path);
          startScan(c.path, function(state, lessonsData){
            // Re-render home if it's the active tab
            if(state.status === 'done' || state.status === 'error'){
              console.log('[Scanner] auto-scan concluído:', c.name, '-',
                (lessonsData ? lessonsData.lessons.length : 0), 'aulas');
              try{
                const body = document.getElementById('gdi-central-body');
                if(body && window.__gdiCurrentTab === 'home'){
                  // ★ v1.0.86 FIX (modular): renderHome moved to study-panel.js.
                  // Use late binding via namespace; tolerate panel module not
                  // yet loaded (typeof check + namespace path check).
                  const panel = window.__gdiStudy && window.__gdiStudy.panel;
                  if(panel && typeof panel.renderHome === 'function'){
                    try{ panel.renderHome(body); }catch(_){}
                  } else if(typeof window.renderHome === 'function'){
                    // Fallback to alias if panel namespace not yet ready
                    try{ window.renderHome(body); }catch(_){}
                  }
                }
              }catch(_){}
            }
          });
          break;  // only 1 at a time
        }
      }
    }catch(_){}
    _autoScanRunning = false;
  }

  // ─────────────────────────────────────────────────────────────
  // ★ Task 16 / FIX 3: Cleanup orphan courses from student's memory.
  // Before Task 14, collectCourses() created auto-tiles from watched/resume/
  // history, and some drive-root paths (e.g. /0:/, /4:/) ended up persisted
  // in gdi-manual-courses-v1. This cleanup removes:
  //   - Drive root paths (^\d+:/)
  //   - Paths with <2 segments (e.g. /0:/)
  //   - Entries with no name or empty name
  // Returns the number of removed entries.
  // ─────────────────────────────────────────────────────────────
  function cleanupOrphanCourses(){
    try{
      const manual = JSON.parse(localStorage.getItem('gdi-manual-courses-v1') || '[]');
      if(!Array.isArray(manual)) return 0;

      const original = manual.length;
      const cleaned = manual.filter(c => {
        if(!c || !c.path) return false;
        // Remove drive roots (e.g., /0:/, /4:/)
        if(/^\d+:\/$/.test(c.path)) return false;
        // Remove if path is just /<drive>:/ (no subfolder)
        const segs = c.path.split('/').filter(Boolean);
        if(segs.length < 2) return false;
        // Remove if no name
        if(!c.name || !c.name.trim()) return false;
        return true;
      });

      if(cleaned.length !== original){
        localStorage.setItem('gdi-manual-courses-v1', JSON.stringify(cleaned));
        console.log('[Cleanup] removidos', original - cleaned.length,
          'cursos órfãos. Restam:', cleaned.length);
      }
      // ★ v1.0.99: prune hidden list — remove entries not in manual courses (orphaned hidden entries)
      try{
        const LS_HIDDEN = 'gdi-hidden-courses-v1';
        const hidden = JSON.parse(localStorage.getItem(LS_HIDDEN) || '[]');
        if(Array.isArray(hidden) && hidden.length > 0){
          const manualPaths = new Set(cleaned.map(m => m && (m.path || m.courseKey)).filter(Boolean));
          const prunedHidden = hidden.filter(h => manualPaths.has(h));
          if(prunedHidden.length !== hidden.length){
            localStorage.setItem(LS_HIDDEN, JSON.stringify(prunedHidden));
            console.log('[Cleanup] pruned', hidden.length - prunedHidden.length, 'orphan hidden entries');
          }
        }
      }catch(_){}
      return original - cleaned.length;
    }catch(_){ return 0; }
  }

  // ─────────────────────────────────────────────────────────────
  // ★ v1.0.96 / ENG-SCANNER-DISTRIBUTED §6.2-6.4 — New helpers
  // ─────────────────────────────────────────────────────────────

  // §6.2 — Get distributed scan status (per-folder dotfiles + progress).
  // Returns the full server payload {ok, scanStatus, scanProgress, sources, ...}
  // or null on any failure (UI should treat null as "unknown").
  async function getDistributedStatus(courseKey){
    try{
      const r = await fetch('/api/courses/distributed-status?coursePath='+encodeURIComponent(courseKey));
      const d = await r.json();
      return d.ok ? d : null;
    }catch(_){ return null; }
  }

  // §6.3 — Force a re-scan (stales the dotfiles for a course so the next
  // scanCourse() rebuilds them). Returns true on success, false otherwise.
  // Caller (study-courses.js tile menu) should invoke scanCourse() afterwards.
  async function rescanCourse(courseKey){
    try{
      const r = await fetch('/api/courses/rescan', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({coursePath: courseKey})
      });
      const d = await r.json();
      return !!(d && d.ok);
    }catch(_){ return false; }
  }

  // §8.3 / "Adicionar matéria" UI — validates a typed course path exists in
  // the Drive. Returns {ok, exists, courseName?, folderId?} on success or
  // {ok:false, exists:false, error?} on failure.
  async function validateCoursePath(coursePath){
    try{
      const r = await fetch('/api/courses/validate?coursePath='+encodeURIComponent(coursePath));
      const d = await r.json();
      return d.ok ? d : {ok:false, exists:false};
    }catch(_){ return {ok:false, exists:false, error:'network'}; }
  }

  // ── Namespace exposure ──
  window.__gdiStudy.scanner = {
    startScan: startScan,
    getScanState: getScanState,
    setScanState: setScanState,
    setLessons: setLessons,
    getLessons: getLessons,
    autoScanPending: autoScanPending,
    scanCourseLessons: scanCourseLessons,  // alias of scanCourse (per task spec)
    scanCourse: scanCourse,
    getScanProgress: getScanProgress,
    getCourseLessons: getCourseLessons,
    countWatched: countWatched,
    clearScanState: clearScanState,
    resumeInterruptedScans: resumeInterruptedScans,
    cleanupOrphanCourses: cleanupOrphanCourses,
    syncCoursesFromDrive: syncCoursesFromDrive,
    // ★ v1.0.96 / ENG-SCANNER-DISTRIBUTED §6.2-6.4 — new distributed helpers
    getDistributedStatus: getDistributedStatus,
    rescanCourse: rescanCourse,
    validateCoursePath: validateCoursePath,
    LS_SCAN_PREFIX: LS_SCAN_PREFIX,
    LS_LESSONS_PREFIX: LS_LESSONS_PREFIX,
    SCAN_PAUSE_MS: SCAN_PAUSE_MS,
    SCAN_MAX_DEPTH: SCAN_MAX_DEPTH,
    MAX_POLLS: 50,
    POLL_INTERVAL: 600,
    version: '1.2'
  };

  // ── Backward-compat aliases (preserved from monolith) ──
  // Original `window.gdiCourseScanner` object (verbatim from monolith).
  window.gdiCourseScanner = {
    startScan,
    scanCourse,
    getScanProgress,
    getCourseLessons,
    countWatched,
    clearScanState,
    resumeInterruptedScans,
    autoScanPending,
    cleanupOrphanCourses,
    syncCoursesFromDrive,
    // ★ v1.0.96 / ENG-SCANNER-DISTRIBUTED — also exposed on legacy alias
    // so callers using window.gdiCourseScanner.rescanCourse() (per §7.2) work.
    getDistributedStatus,
    rescanCourse,
    validateCoursePath,
    LS_SCAN_PREFIX,
    LS_LESSONS_PREFIX,
    SCAN_PAUSE_MS,
    SCAN_MAX_DEPTH,
    MAX_POLLS: 50,
    POLL_INTERVAL: 600,
    version: '1.2'
  };
  // Per task spec: ALSO export window.gdiSyncCoursesFromDrive and window.autoScanPending
  window.gdiSyncCoursesFromDrive = function(){
    return window.__gdiStudy.scanner.syncCoursesFromDrive.apply(this, arguments);
  };
  window.autoScanPending = function(){
    return window.__gdiStudy.scanner.autoScanPending.apply(this, arguments);
  };
  // ★ Task 16 / FIX 3: expose cleanup as a standalone global for console access
  window.gdiCleanupOrphanCourses = function(){
    return window.__gdiStudy.scanner.cleanupOrphanCourses.apply(this, arguments);
  };

  // Auto-resume interrupted scans after a short delay (lets GDIUser + worker bridge init)
  setTimeout(function(){
    try{ resumeInterruptedScans(); }catch(_){}
  }, 3000);

  // ★ Task 16 / FIX 3: run orphan cleanup on page load (2s — early, before auto-scan)
  setTimeout(function(){
    try{ cleanupOrphanCourses(); }catch(_){}
  }, 2000);

  // ★ v1.0.84 / CRITICAL: sync courses from Drive on user:ready BEFORE auto-scan.
  // Without this, a new device / cleared localStorage / private window shows NO
  // course tiles until the user manually re-adds every course. Cross-device
  // persistence was broken because syncCoursesFromDrive was defined + exported
  // but NEVER called. Now it runs first, then autoScanPending picks up the
  // restored courses and background-scans them for lesson counts.
  if(typeof Bus !== 'undefined' && typeof Bus.onGlobal === 'function'){
    Bus.onGlobal('user:ready', function(){
      setTimeout(function(){
        try{
          // ★ v1.0.84: sync courses from Drive FIRST, so user sees their courses on any device.
          if(typeof syncCoursesFromDrive === 'function'){
            // ★ v1.0.98 FIX: log sync failures instead of swallowing silently (Agent 7)
            syncCoursesFromDrive().catch(e=>console.warn('[sync] failed:', e && e.message)).finally(()=>{
              try{ autoScanPending(); }catch(_){}
            });
          } else {
            try{ autoScanPending(); }catch(_){}
          }
        }catch(_){
          try{ autoScanPending(); }catch(_){}
        }
      }, 5000);
    });
    // Also try on page:change (in case user navigates and modules are ready)
    // ★ FIX 20-6 #1 (Agent 6): track the setTimeout id and clear it before
    //    scheduling a new one. Without this, every page:change emission would
    //    stack a NEW 3s timer — e.g. 10 navigations = 10 pending autoScanPending
    //    calls firing in sequence, hammering localStorage + startScan guards
    //    with redundant work. Now only the LATEST page:change schedules a scan.
    let _autoScanPageChangeTimer = null;
    Bus.onGlobal('page:change', function(){
      if(_autoScanPageChangeTimer){
        clearTimeout(_autoScanPageChangeTimer);
        _autoScanPageChangeTimer = null;
      }
      _autoScanPageChangeTimer = setTimeout(function(){
        _autoScanPageChangeTimer = null;
        try{ autoScanPending(); }catch(_){}
      }, 3000);
    });
  }else{
    // Fallback if Bus not available at IIFE init time
    setTimeout(function(){
      try{
        if(typeof syncCoursesFromDrive === 'function'){
          // ★ v1.0.98 FIX: log sync failures instead of swallowing silently (Agent 7)
          syncCoursesFromDrive().catch(e=>console.warn('[sync] failed:', e && e.message)).finally(()=>{
            try{ autoScanPending(); }catch(_){}
          });
        } else {
          try{ autoScanPending(); }catch(_){}
        }
      }catch(_){
        try{ autoScanPending(); }catch(_){}
      }
    }, 5000);
  }

  console.log('[GDI Course Scanner] v1.2 — distributed polling loop (MAX_POLLS=50, POLL_INTERVAL=600ms) + auto-scan + orphan cleanup + getDistributedStatus/rescanCourse/validateCoursePath — modular');
})();
