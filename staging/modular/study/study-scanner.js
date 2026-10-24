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
    // ★ v1.0.131: limpa pending do localStorage (scan resumido via cliente)
    try{localStorage.removeItem('gdi-scan-pending-'+courseKey)}catch(_){}
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
      // ★ v1.0.131: guarda pending do último poll no localStorage para resumir o scan
      // sem depender do .gdi-course.json no Drive (que falha em shared drives read-only).
      const LS_PENDING_PREFIX = 'gdi-scan-pending-';
      while(pollCount < MAX_POLLS){
        // ★ v1.0.131: lê pending do localStorage e envia no body
        const savedPending = (() => {
          try { return JSON.parse(localStorage.getItem(LS_PENDING_PREFIX + courseKey) || 'null'); }
          catch(_) { return null; }
        })();

        const r = await fetch('/api/courses/scan-progress', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({coursePath: courseKey, pending: savedPending || undefined})
        });
        if(!r.ok) throw new Error('HTTP '+r.status);
        const d = await r.json().catch(()=>null);
        if(!d || !d.ok) throw new Error((d && d.error) || 'scan falhou');
        lastD = d;

        // ★ v1.0.137: ACUMULA lessons entre polls (servidor retorna apenas do batch atual).
        // Antes: allLessons = d.lessons || [] — sobrescrevia, perdendo aulas de polls anteriores.
        // Agora: merge deduplicando por path.
        const newLessons = d.lessons || [];
        if(pollCount === 0){
          allLessons = newLessons.slice();
        }else{
          const existingPaths = new Set(allLessons.map(l => (l.path||l.name||'')));
          for(const lesson of newLessons){
            const key = lesson.path || lesson.name || '';
            if(key && !existingPaths.has(key)){
              allLessons.push(lesson);
              existingPaths.add(key);
            }else if(!key){
              allLessons.push(lesson);
            }
          }
        }

        // ★ v1.0.131: guarda pending retornado pelo servidor no localStorage.
        // Próximo poll vai enviar esse pending no body para o servidor resumir.
        try{
          if(Array.isArray(d.pending) && d.pending.length > 0){
            localStorage.setItem(LS_PENDING_PREFIX + courseKey, JSON.stringify(d.pending));
          }else{
            localStorage.removeItem(LS_PENDING_PREFIX + courseKey);
          }
        }catch(_){}

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
          // ★ v1.0.131: limpa pending do localStorage (scan completou)
          try{localStorage.removeItem(LS_PENDING_PREFIX + courseKey);}catch(_){}
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
            cached: isCached,
            // ★ CYCLE2-5 Fix #1: propagate worker's `truncated` flag (set on the cache-hit
            //   path when the distributed read hit READ_HARD_LIMIT=14 or MAX_FOLDERS=500
            //   and didn't process all folders — see worker.js line ~4449). Without this,
            //   the UI would think all lessons are present even though some folders weren't
            //   read, silently hiding lessons for large courses (>14 folders).
            truncated: !!d.truncated
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

          // ★ v1.0.115 FIX BUG (matemagicando not scanned): auto-rescan when a scan
          // completes with 0 lessons. This is a CLIENT-SIDE safety net complementing
          // the worker.js fix (which now refuses to cache scanComplete:true on empty
          // results). For users with a STALE cache from BEFORE v1.0.115, the worker
          // still has the old `scanComplete:true, lessons:[]` dotfile on Drive — the
          // worker fix bypasses it (falls through to fresh scan), but if the fresh
          // scan ALSO returns 0 (e.g., the very first batch found only empty module
          // folders), we trigger a rescan to force a full rebuild. The rescan clears
          // the stale dotfiles on Drive, so the NEXT scanCourse() starts from scratch.
          // One-shot per course per session (guarded by _autoRescanned set) to avoid
          // infinite loops on genuinely-empty folders.
          if(allLessons.length === 0 && !state._autoRescanned){
            state._autoRescanned = true;
            setScanState(courseKey, state);
            try{
              console.warn('[GDI Scanner] scan done with 0 lessons — auto-rescanning:', courseKey);
              const ok = await rescanCourse(courseKey);
              if(ok){
                // Re-run the scan ONCE after rescan clears the dotfiles.
                // Use a short delay so the worker's rescan write propagates.
                setTimeout(()=>{ try{ scanCourse(courseKey, onProgress); }catch(_){} }, 1500);
              }
            }catch(_){}
          }
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
  // ★ v1.0.116: syncCoursesFromDrive agora faz REPLACE (não mais merge).
  // O Drive é a source of truth — o arquivo per-user (<username>.courses.json)
  // contém a lista autoritativa de cursos do usuário. localStorage agora é só
  // um cache write-through: a cada sync, substituímos o localStorage pelo que
  // veio do Drive. Cursos que existiam só no localStorage (adicionados antes
  // do v1.0.116 e nunca sincronizados) são migrados pra o Drive via
  // POST /api/courses/add antes do REPLACE.
  async function syncCoursesFromDrive(){
    const LS_MANUAL = 'gdi-manual-courses-v1';
    let d;
    const _normPath = function(p){
      p = String(p||'').replace(/\/+$/,'');
      return p || '/';
    };

    // ★ v1.0.116 MIGRATION: antes de REPLACE, migramos cursos que existem SÓ no
    // localStorage (nunca foram pro Drive). Marcados com um Set de paths que o
    // Drive já retornou — qualquer curso local cujo path NÃO está no Set é
    // migrado via POST /api/courses/add. Isso garante que cursos adicionados
    // em versões anteriores (quando add não sincronizava com o Drive) não sejam
    // perdidos no primeiro REPLACE.
    const migrateLocalOnlyCourses = async function(drivePaths){
      const local = JSON.parse(localStorage.getItem(LS_MANUAL) || '[]');
      if(!Array.isArray(local)) return 0;
      const driveSet = new Set(drivePaths.map(_normPath));
      let migrated = 0;
      for(const c of local){
        if(!c || !c.path) continue;
        const lp = _normPath(c.path);
        if(!driveSet.has(lp)){
          // curso existe só no localStorage — migrar pro Drive
          try{
            const r = await fetch('/api/courses/add', {
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body: JSON.stringify({
                coursePath: lp,
                courseName: c.name || '',
                pdfCount: c.pdfCount || 0,
                icon: c.icon || '',
                color: c.color || ''
              })
            });
            if(r.ok){
              migrated++;
              driveSet.add(lp);  // não migrar de novo
            }
          }catch(_){}
        }
      }
      return migrated;
    };

    // ★ v1.0.116: REPLACE localStorage com a lista do Drive (source of truth).
    const replaceLocalWithDrive = function(){
      const driveCourses = (d && Array.isArray(d.courses)) ? d.courses : [];
      const mapped = driveCourses.map(dc => ({
        id:'mc-'+Date.now()+'-'+Math.random().toString(36).slice(2,9),
        name: dc.courseName || 'Curso',
        icon: dc.icon || '📁',
        color: dc.color || '#5ddeda',
        goal: 60, notes:'',
        createdAt: dc.addedAt || Date.now(),
        manual: true,
        path: _normPath(dc.coursePath),
        courseKey: _normPath(dc.coursePath),
        pdfCount: dc.pdfCount || 0
      }));
      localStorage.setItem(LS_MANUAL, JSON.stringify(mapped));
      return mapped.length;
    };

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

      // ★ v1.0.116: migra cursos que existem só no localStorage (one-time).
      const drivePaths = d.courses.map(c => _normPath(c && c.coursePath));
      let migrated = 0;
      try{
        migrated = await migrateLocalOnlyCourses(drivePaths);
        if(migrated > 0){
          console.log('[GDI v1.0.116] migrados '+migrated+' cursos do localStorage pro Drive');
          // re-fetch para incluir os migrados
          const r2 = await fetch('/api/courses/list', fetchOpts);
          if(r2.ok){
            const d2 = await r2.json();
            if(d2 && d2.ok && Array.isArray(d2.courses)) d = d2;
          }
        }
      }catch(e){ console.warn('[syncCoursesFromDrive] migration error:', e && e.message); }

      // ★ v1.0.116: REPLACE localStorage com a lista do Drive.
      let count = 0;
      try {
        count = replaceLocalWithDrive();
      } catch(e) {
        const isQuota = e && (e.name === 'QuotaExceededError' ||
          /quota/i.test(e.message || '') ||
          (typeof DOMException !== 'undefined' && e instanceof DOMException && e.name === 'QuotaExceededError'));
        if(isQuota){
          console.warn('[syncCoursesFromDrive] QuotaExceededError — aborting REPLACE:', e && e.message);
          return 0;
        }
        console.warn('[syncCoursesFromDrive] race detectada, re-lendo:', e && e.message);
        try { count = replaceLocalWithDrive(); } catch(_){ return; }
      }
      if(count > 0 || migrated > 0){
        console.log('[GDI v1.0.116] syncCoursesFromDrive: '+count+' cursos carregados do Drive (Drive = source of truth)');
        try{
          if(typeof Bus !== 'undefined' && Bus && typeof Bus.emit === 'function'){
            Bus.emit('courses:changed', {source:'syncCoursesFromDrive', count, migrated});
          }
        }catch(_){}
      }
    }catch(e){
      if(e && (e.name === 'AbortError' || /aborted/i.test(e.message||''))){
        console.warn('[syncCoursesFromDrive] timeout após', SYNC_COURSES_TIMEOUT_MS+'ms — abortado');
      }else{
        console.warn('[syncCoursesFromDrive] error:', e && e.message);
      }
    }finally{
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
          // ★ CYCLE2-5 Fix #2: normalize paths before comparison (matches _normPath in
          //   syncCoursesFromDrive above AND low/norm in study-courses.js hideCourse).
          //   Without this, a hidden entry with a trailing slash or different case
          //   (legacy data from before normalization was added) would be pruned even
          //   though the course is still in manual — causing the course to reappear on
          //   the next sync (defeating the user's "hide" action). Normalization strips
          //   query string + trailing slashes + lowercases (same as low() in
          //   study-courses.js line 44).
          const _normHidden = p => String(p||'').split('?')[0].replace(/\/+$/,'').toLowerCase();
          const manualPaths = new Set(cleaned.map(m => m && _normHidden(m.path || m.courseKey)).filter(Boolean));
          const prunedHidden = hidden.filter(h => manualPaths.has(_normHidden(h)));
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
