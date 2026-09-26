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
//                clearScanState, resumeInterruptedScans
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
  function getScanState(courseKey){
    try{const v=localStorage.getItem(LS_SCAN_PREFIX+courseKey);return v?JSON.parse(v):null}catch(_){return null}
  }
  function setScanState(courseKey, state){
    try{localStorage.setItem(LS_SCAN_PREFIX+courseKey, JSON.stringify(state))}catch(_){}
  }
  function clearScanState(courseKey){
    try{localStorage.removeItem(LS_SCAN_PREFIX+courseKey)}catch(_){}
  }

  // ── Lessons cache (per course) ──
  function getLessons(courseKey){
    try{
      const v=localStorage.getItem(LS_LESSONS_PREFIX+courseKey);
      return v?JSON.parse(v):{lessons:[],scanned:false,totalFolders:0,totalLessons:0};
    }catch(_){return {lessons:[],scanned:false,totalFolders:0,totalLessons:0}}
  }
  function setLessons(courseKey, data){
    try{localStorage.setItem(LS_LESSONS_PREFIX+courseKey, JSON.stringify(data))}catch(_){}
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
      totalFolders: 1,
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

    try {
      // ★ v1.0.78: SCAN INCREMENTAL — loop de batches até status=done
      let allLessons = [];
      let maxBatches = 30;
      let batchNum = 0;
      let isDone = false;
      // ★ v80-FIX BUG 1: `d` is referenced outside the while loop (at
      // `d?.totalFolders` below), so it MUST be declared OUTSIDE the block.
      // Previously `const d = await r.json();` was block-scoped inside the
      // while → ReferenceError on the lessonsData object → caught → state
      // became 'error' even though lessons were saved successfully.
      let d;

      while(!isDone && batchNum < maxBatches){
        batchNum++;
        const r = await fetch('/api/courses/scan-progress', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({coursePath: courseKey})
        });
        if(!r.ok) throw new Error('HTTP '+r.status);
        d = await r.json();
        if(!d || !d.ok) throw new Error(d && d.error || 'scan falhou');

        allLessons = d.lessons || [];
        isDone = d.status !== 'partial';

        state.status = 'scanning';
        // ★ v80-FIX BUG 3: totalFolders was hardcoded to 1 and never
        // updated → progress (scannedFolders/totalFolders) was always 100%.
        // Now totalFolders grows as we discover pending folders each batch.
        state.pendingFolders = d.pendingFolders || 0;
        state.totalFolders = (state.scannedFolders || 0) + (d.pendingFolders || 0);
        // Keep scannedFolders ≤ totalFolders so percent stays in [0,100].
        if(state.scannedFolders > state.totalFolders){
          state.scannedFolders = state.totalFolders;
        }
        state.lessonsFound = allLessons.length;
        state.batchNum = batchNum;
        setScanState(courseKey, state);

        const partialData = {lessons: allLessons, scanned: isDone, totalLessons: allLessons.length};
        setLessons(courseKey, partialData);
        if(onProgress) try{ onProgress(state, partialData); }catch(_){}

        if(d.cached){ isDone = true; break; }
        if(!isDone) await new Promise(r => setTimeout(r, 500));
      }

      const lessons = allLessons;
      const lessonsData = {
        lessons: lessons,
        scanned: true,
        // ★ v80-FIX BUG 1: safe access — `d` may be undefined if the while
        // loop body never ran (e.g. maxBatches===0), so use (d && d.totalFolders).
        totalFolders: (d && d.totalFolders) || state.totalFolders || 1,
        totalLessons: lessons.length
      };
      setLessons(courseKey, lessonsData);

      // Atualiza estado
      state.status = 'done';
      state.completedAt = Date.now();
      // ★ v80-FIX BUG 3 (final): finalize scannedFolders to equal totalFolders
      // so progress shows 100% only when actually done.
      if(state.totalFolders && state.scannedFolders < state.totalFolders){
        state.scannedFolders = state.totalFolders;
      }
      setScanState(courseKey, state);

      // Salva no Drive (não-bloqueante)
      try {
        if(window.GDIStorage && window.GDIStorage.saveMaterial) {
          window.GDIStorage.saveMaterial(courseKey, courseKey, 'lessons', JSON.stringify(lessonsData)).catch(()=>{});
        }
      } catch(_){}

      if(onProgress) try{ onProgress(state, lessonsData); }catch(_){}
      return state;
    } catch(e) {
      console.error('[Scanner] erro:', e.message);
      state.status = 'error';
      state.error = e.message;
      setScanState(courseKey, state);
      if(onProgress) try{ onProgress(state, getLessons(courseKey)); }catch(_){}
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
  async function syncCoursesFromDrive(){
    const LS_MANUAL = 'gdi-manual-courses-v1';
    let d;  // populated by fetch below; referenced by mergeDriveCourses closure
    const mergeDriveCourses = function(){
      const local = JSON.parse(localStorage.getItem(LS_MANUAL) || '[]');
      if(!Array.isArray(local)) throw new Error('localStorage not an array');
      const localPaths = new Set(local.map(c => c && c.path));
      let added = 0;
      for(const dc of d.courses){
        if(dc && dc.coursePath && !localPaths.has(dc.coursePath)){
          local.push({
            id:'mc-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),
            name:dc.courseName||'Curso', icon:'📁', color:'#5ddeda', goal:60, notes:'',
            createdAt:dc.addedAt||Date.now(), manual:true, path:dc.coursePath,
            courseKey:dc.coursePath, pdfCount:dc.pdfCount||0
          });
          localPaths.add(dc.coursePath);
          added++;
        }
      }
      // Dedup pass — resilient against concurrent writes that may have
      // inserted the same course between our read and our write.
      const seen = new Set();
      const deduped = [];
      for(const c of local){
        if(!c) continue;
        const k = c.key || c.id || c.path;
        if(k){
          if(seen.has(k)) continue;
          seen.add(k);
        }
        deduped.push(c);
      }
      localStorage.setItem(LS_MANUAL, JSON.stringify(deduped));
      return added;
    };
    try{
      const r = await fetch('/api/courses/list');
      if(!r.ok) return;
      d = await r.json();
      if(!d || !d.ok || !Array.isArray(d.courses)) return;
      let added;
      try {
        added = mergeDriveCourses();
      } catch(e) {
        console.warn('[syncCoursesFromDrive] race detectada, re-lendo:', e && e.message);
        try {
          added = mergeDriveCourses();
        } catch(_){
          return;
        }
      }
      if(added > 0){
        console.log('[GDI M22] syncCoursesFromDrive: ' + added + ' cursos recuperados do Drive');
      }
    }catch(_){}
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
        return original - cleaned.length;
      }
      return 0;
    }catch(_){ return 0; }
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
    LS_SCAN_PREFIX: LS_SCAN_PREFIX,
    LS_LESSONS_PREFIX: LS_LESSONS_PREFIX,
    SCAN_PAUSE_MS: SCAN_PAUSE_MS,
    SCAN_MAX_DEPTH: SCAN_MAX_DEPTH,
    version: '1.1'
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
    LS_SCAN_PREFIX,
    LS_LESSONS_PREFIX,
    SCAN_PAUSE_MS,
    SCAN_MAX_DEPTH,
    version: '1.1'
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
            syncCoursesFromDrive().catch(()=>{}).finally(()=>{
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
    Bus.onGlobal('page:change', function(){
      setTimeout(function(){
        try{ autoScanPending(); }catch(_){}
      }, 3000);
    });
  }else{
    // Fallback if Bus not available at IIFE init time
    setTimeout(function(){
      try{
        if(typeof syncCoursesFromDrive === 'function'){
          syncCoursesFromDrive().catch(()=>{}).finally(()=>{
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

  console.log('[GDI Course Scanner] v1.1 — lightweight background scanner ativo (pause='+SCAN_PAUSE_MS+'ms, maxDepth='+SCAN_MAX_DEPTH+') + auto-scan + orphan cleanup — modular');
})();
