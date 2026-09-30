// ═══════════════════════════════════════════════════════════════
// storage.js — Camada de Abstração de Armazenamento — REFACTORED
//
// VERSÃO: DRIVE (Google Drive API)
//
// Mudanças não-breaking (mesmo window.GDIStorage API):
//  1. Camada de memoização in-memory (LRU 200 entradas) para GETs.
//  2. Removido {cache:'no-store'} dos GETs — deixa o HTTP cache agir.
//  3. Invalidação exposta via GDIStorage.invalidate(key) e .clearCache().
//  4. Cache Storage API (caches.open) para scan-course-progress.
// ═══════════════════════════════════════════════════════════════

(function(){
  'use strict';

  const STORAGE_VERSION = 'drive-v1';
  const MEGGY_FOLDER = '.meggy.ai';

  // ═════ Memoização in-memory + dedupe de in-flight ═════
  const _mem = new Map();              // key -> { t, p }
  const _MEM_MAX = 200;

  function memo(key, ttlMs, fn){
    const ent = _mem.get(key);
    const now = Date.now();
    // ★ FIX Agent 5 R19 / BUG R19: o check `if (ent && ent.p) return ent.p`
    // devolvia a Promise RESOLVIDA mesmo DEPOIS do TTL expirar — porque `ent.p`
    // (a Promise já resolvida) permanece truthy. Resultado: o cache NUNCA
    // expirava sem `invalidate(keyPrefix)` explícito, e `listCourses()` /
    // `listMaterials()` / `getUserProgress()` retornavam dados stale por toda
    // a sessão da página. Agora, só retornamos `ent.p` se a entrada ainda
    // está dentro do TTL. Caso contrário, deletamos a entrada expirada antes
    // de re-buscar, para que a próxima chamada (dedupe in-flight) funcione.
    if (ent && now - ent.t < ttlMs) {
      // ★ FIX Task 20-9 Item 8: LRU — move entry to end (MRU position) on hit.
      // Map preserves insertion order, so delete+set recoloca a entrada no fim;
      // a eviction abaixo remove o primeiro (LRU). Antes era FIFO puro.
      _mem.delete(key);
      _mem.set(key, ent);
      return ent.p;          // TTL hit (ainda válido)
    }
    if (ent && ent.p) { _mem.delete(key); }                // expirou — limpa antes de re-fetch
    const p = fn().catch(err => { _mem.delete(key); throw err; });
    _mem.set(key, { t: now, p });
    if (_mem.size > _MEM_MAX) _mem.delete(_mem.keys().next().value);
    return p;
  }

  function invalidate(keyPrefix){
    if (!keyPrefix) { _mem.clear(); return; }
    for (const k of _mem.keys()) if (k.indexOf(keyPrefix) === 0) _mem.delete(k);
  }

  // ═══ Cache Storage API (sobrevive a reloads) para pastas escaneadas ═══
  const FOLDER_CACHE = 'gdi-folders-v1';
  async function folderCacheGet(key){
    // ★ H-18 (P12-7): was `catch(_) { return null; }` — silent JSON-parse
    // failure meant a corrupted cache entry (truncated write, partial
    // JSON, encoding mismatch) was indistinguishable from a cache miss.
    // Now we log the parse error so corruption is surfaced in dev tools.
    try { const c = await caches.open(FOLDER_CACHE); const r = await c.match(key); return r ? await r.json() : null; }
    catch(e) { console.warn('[GDI Storage] folderCacheGet JSON parse failed for', key, '—', e && e.message || e); return null; }
  }
  async function folderCachePut(key, data){
    // ★ H-21 (P12-7): was `catch(_) {}` — silent failure hid Cache Storage
    // quota exhaustion and browser-mode (private browsing) rejections.
    try { const c = await caches.open(FOLDER_CACHE); await c.put(key, new Response(JSON.stringify(data))); }
    catch(e) { console.warn('[GDI Storage] folderCachePut failed for', key, '—', e && e.message || e); }
  }
  async function folderCacheDelete(key){
    // ★ H-21 (P12-7): was `catch(_) {}`.
    try { const c = await caches.open(FOLDER_CACHE); await c.delete(key); }
    catch(e) { console.warn('[GDI Storage] folderCacheDelete failed for', key, '—', e && e.message || e); }
  }

  // ═══ H-23 (P12-7): error classification helper ═══
  // Read helpers previously returned null/[] on ANY error, leaving callers
  // unable to distinguish 'no data' (404) from 'auth expired' (401/403) from
  // 'transient network' (fetch throw) from 'server error' (5xx). To avoid
  // breaking the existing API (callers expect null/[]), we keep the return
  // shape but add this classifier and surface the reason via console.warn.
  // Future callers that need structured differentiation can use the new
  // `GDIStorage.classifyError(err, resp)` and `GDIStorage.withReason(p)`.
  // Reasons:
  //   'network'   — fetch threw (DNS, offline, CORS, AbortController)
  //   'auth'      — 401 / 403 (token expired or forbidden)
  //   'not_found' — 404 (legitimate 'no data' — NOT an error per se)
  //   'rate_limit'— 429 (should be retried by caller; see fetchSaveWithRetry)
  //   'server'    — 5xx (transient; 502/503/504 typically upstream)
  //   'client'    — other 4xx (400/409/422 — caller-side bug)
  //   'unknown'   — error without enough context to classify
  function _classifyError(err, resp){
    if (resp && typeof resp.status === 'number') {
      if (resp.status === 401 || resp.status === 403) return 'auth';
      if (resp.status === 404) return 'not_found';
      if (resp.status === 429) return 'rate_limit';
      if (resp.status >= 500 && resp.status < 600) return 'server';
      if (resp.status >= 400 && resp.status < 500) return 'client';
    }
    if (err) {
      const msg = String(err && (err.message || err) || '').toLowerCase();
      if (err.name === 'AbortError') return 'network';
      if (msg.indexOf('failed to fetch') >= 0) return 'network';
      if (msg.indexOf('networkerror') >= 0) return 'network';
      if (msg.indexOf('load failed') >= 0) return 'network';
      if (msg.indexOf('timeout') >= 0) return 'network';
      if (/\b429\b/.test(msg)) return 'rate_limit';
      if (/\b503\b|\b502\b|\b504\b|\b500\b/.test(msg)) return 'server';
      if (/\b401\b|\b403\b/.test(msg)) return 'auth';
      if (/\b404\b/.test(msg)) return 'not_found';
    }
    return 'unknown';
  }

  // ═══ H-25 (P12-7): retry helper for save/write functions ═══
  // Wraps `fetch(url, opts)` and retries ONCE (2s delay) when the response
  // status is 429 (rate limit) or 503 (service unavailable), or when the
  // fetch itself throws a network error. Other statuses (2xx, 4xx except
  // 429, 5xx except 503) are returned as-is so the caller's existing
  // error-handling continues to apply. The 2s delay matches the bridge's
  // H-25 retry delay for consistency. Used by all save/write helpers
  // below (isaCacheSet, saveMaterial, saveCourse, startBattalion, saveMemory,
  // saveEssay, saveSharedFlashcard, saveUserProgress, saveSharedProgress).
  // `scanCourseProgress` is a read (POST + GET semantics) and uses
  // `fetchWithTimeout` instead; it already has its own retry-worthy behavior
  // via the `memo()` cache.
  async function fetchSaveWithRetry(url, opts, retries){
    retries = (retries == null) ? 1 : retries;  // default: 1 retry (2 attempts total)
    let lastErr = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const r = await fetch(url, opts);
        if ((r.status === 429 || r.status === 503) && attempt < retries) {
          console.warn('[GDI Storage] save transient HTTP ' + r.status + ', retrying in 2s:', url);
          await new Promise(res => setTimeout(res, 2000));
          continue;
        }
        return r;
      } catch(e) {
        lastErr = e;
        if (attempt < retries) {
          console.warn('[GDI Storage] save fetch failed (' + _classifyError(e) + '), retrying in 2s:', url, '—', e && e.message || e);
          await new Promise(res => setTimeout(res, 2000));
          continue;
        }
        throw e;
      }
    }
    // Unreachable in practice (loop returns or throws), but kept for safety.
    if (lastErr) throw lastErr;
    throw new Error('fetchSaveWithRetry: exhausted retries without response');
  }

  // ★ FIX Task 20-9 Item 9: a task original referenciava `fetchIndice`, que NÃO
  // existe neste arquivo (provavelmente confusão com outro módulo). O espírito
  // do fix é: nenhum fetch tem timeout explícito, então um Drive API / Cloudflare
  // Worker que fique pendente (sem responder 200 nem erro) segura a Promise
  // indefinidamente, travando o caller (e o `memo()` in-flight) para sempre.
  // Helper `fetchWithTimeout` aplica um AbortController com timeout default 10s;
  // usado nos fetches mais pesados (scanCourseProgress, listAllFilesInternal-
  // equivalents) para garantir fail-fast. Os fetches leves (GET de cache KV)
  // continuam sem timeout pois já têm try/catch returning null/[].
  async function fetchWithTimeout(url, opts, timeoutMs){
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs || 10000);
    try {
      return await fetch(url, { ...(opts || {}), signal: ctrl.signal });
    } finally {
      clearTimeout(to);
    }
  }

  // ═══ Helpers de URL curta ═════
  function shortUrlId(path){
    let hash=0;
    for(let i=0;i<path.length;i++) hash=((hash<<5)-hash+path.charCodeAt(i))|0;
    return 'f'+Math.abs(hash).toString(36).padStart(6,'0').slice(0,8);
  }

  async function getShortUrl(fullPath){
    try{
      const r=await fetch('/api/shorturl/register',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({path:fullPath})
      });
      if(r.ok){const d=await r.json();if(d&&d.ok&&d.shortUrl)return d.shortUrl;}
    }catch(e){
      // ★ H-21 (P12-7): was `catch(_){}` — silent failure hid network/500 errors.
      console.warn('[GDI Storage] getShortUrl failed for', fullPath, '—', e && e.message || e);
    }
    return fullPath;
  }

  function shortLessonKey(path){
    const p=(path||window.location.pathname||'').split('?')[0];
    let hash=0;
    for(let i=0;i<p.length;i++) hash=((hash<<5)-hash+p.charCodeAt(i))|0;
    return 'L'+Math.abs(hash).toString(36);
  }

  function materialFileName(coursePath, pdfName, kind){
    let hash=0;
    const str=coursePath+'/'+pdfName;
    for(let i=0;i<str.length;i++) hash=((hash<<5)-hash+str.charCodeAt(i))|0;
    const raw='m'+Math.abs(hash).toString(36);
    if(kind==='questoes'||kind==='flashcards'||kind==='simulados')return raw+'.json';
    return raw+'.md';
  }

  // ═══ API de Storage (Drive) — com cache ═════

  async function isaCacheGet(lessonKey){
    return memo('isa:'+lessonKey, 60_000, async () => {
      try{
        const r=await fetch('/api/ai/cache?key='+encodeURIComponent(lessonKey));
        if(!r.ok){
          // ★ H-23 (P12-7): classify the error reason for diagnostics.
          console.warn('[GDI Storage] isaCacheGet non-OK ('+_classifyError(null,r)+') for', lessonKey, '— HTTP', r.status);
          return null;
        }
        const d=await r.json();
        return d&&d.ok?d.cached:null;
      }catch(e){
        // ★ H-21/H-23 (P12-7): was `catch(_){return null;}` — silent + undifferentiated.
        console.warn('[GDI Storage] isaCacheGet failed ('+_classifyError(e)+') for', lessonKey, '—', e && e.message || e);
        return null;
      }
    });
  }

  async function isaCacheSet(lessonKey, data){
    try{
      // ★ H-25 (P12-7): was `fetch(...)` — added 429/503 retry via fetchSaveWithRetry.
      await fetchSaveWithRetry('/api/ai/cache',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({key:lessonKey,...data})});
      invalidate('isa:'+lessonKey);
    }catch(e){
      // ★ FIX CYCLE-9 Item 14: surface save failures (before: silent empty catch)
      console.warn('[GDI Storage] isaCacheSet failed ('+_classifyError(e)+') for', lessonKey, '—', e && e.message || e);
    }
  }

  async function isaCacheList(){
    return memo('isaList', 30_000, async () => {
      try{
        const r=await fetch('/api/ai/cache/list');
        if(!r.ok){
          // ★ H-23 (P12-7): classify the error reason for diagnostics.
          console.warn('[GDI Storage] isaCacheList non-OK ('+_classifyError(null,r)+') — HTTP', r.status);
          return [];
        }
        const d=await r.json();
        return d&&d.ok&&Array.isArray(d.entries)?d.entries:[];
      }catch(e){
        // ★ H-21/H-23 (P12-7): was `catch(_){return [];}` — silent + undifferentiated.
        console.warn('[GDI Storage] isaCacheList failed ('+_classifyError(e)+') —', e && e.message || e);
        return [];
      }
    });
  }

  async function saveMaterial(coursePath, pdfName, kind, content){
    try{
      // ★ H-25 (P12-7): 429/503 retry via fetchSaveWithRetry.
      await fetchSaveWithRetry('/api/materials/save',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({coursePath,pdfName,kind,content})});
      invalidate('matList:'+kind);
    }catch(e){
      // ★ FIX Task 20-9 Item 10 + H-23 (P12-7): surface + classify save failures.
      console.warn('[GDI Storage] saveMaterial failed ('+_classifyError(e)+') —', e && e.message || e);
    }
  }

  async function materialExists(coursePath, pdfName, kind){
    const fileName = materialFileName(coursePath, pdfName, kind);
    return memo('matExists:'+kind+':'+fileName, 60_000, async () => {
      try{
        const r=await fetch('/api/materials/exists?fileName='+encodeURIComponent(fileName)+'&kind='+kind);
        if(!r.ok){
          // ★ H-23 (P12-7): classify the error reason for diagnostics.
          console.warn('[GDI Storage] materialExists non-OK ('+_classifyError(null,r)+') for', fileName, '— HTTP', r.status);
          return false;
        }
        const d=await r.json();
        return !!(d&&d.ok&&d.exists);
      }catch(e){
        // ★ H-21/H-23 (P12-7): was `catch(_){return false;}` — silent + undifferentiated.
        console.warn('[GDI Storage] materialExists failed ('+_classifyError(e)+') for', fileName, '—', e && e.message || e);
        return false;
      }
    });
  }

  async function listMaterials(kind, courseFilter){
    const key = 'matList:'+kind+':'+(courseFilter||'');
    return memo(key, 30_000, async () => {
      try{
        let url='/api/materials/list?kind='+kind;
        if(courseFilter)url+='&course='+encodeURIComponent(courseFilter);
        const r=await fetch(url);
        if(!r.ok){
          // ★ H-23 (P12-7): classify the error reason for diagnostics.
          console.warn('[GDI Storage] listMaterials non-OK ('+_classifyError(null,r)+') for', kind, '— HTTP', r.status);
          return [];
        }
        const d=await r.json();
        return d&&d.ok&&Array.isArray(d.items)?d.items:[];
      }catch(e){
        // ★ H-21/H-23 (P12-7): was `catch(_){return [];}` — silent + undifferentiated.
        console.warn('[GDI Storage] listMaterials failed ('+_classifyError(e)+') for', kind, '—', e && e.message || e);
        return [];
      }
    });
  }

  async function saveCourse(coursePath, courseName, pdfCount){
    try{
      // ★ H-25 (P12-7): 429/503 retry via fetchSaveWithRetry.
      await fetchSaveWithRetry('/api/courses/add',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({coursePath,courseName,pdfCount:pdfCount||0,addedAt:Date.now()})});
      invalidate('courses');
    }catch(e){
      // ★ FIX Task 20-9 Item 10 + H-23 (P12-7): surface + classify save failures.
      console.warn('[GDI Storage] saveCourse failed ('+_classifyError(e)+') —', e && e.message || e);
    }
  }

  async function listCourses(){
    return memo('courses', 30_000, async () => {
      try{
        const r=await fetch('/api/courses/list');
        if(!r.ok){
          // ★ H-23 (P12-7): classify the error reason for diagnostics.
          console.warn('[GDI Storage] listCourses non-OK ('+_classifyError(null,r)+') — HTTP', r.status);
          return [];
        }
        const d=await r.json();
        return d&&d.ok&&Array.isArray(d.courses)?d.courses:[];
      }catch(e){
        // ★ H-21/H-23 (P12-7): was `catch(_){return [];}` — silent + undifferentiated.
        console.warn('[GDI Storage] listCourses failed ('+_classifyError(e)+') —', e && e.message || e);
        return [];
      }
    });
  }

  async function battalionStatus(courseKey){
    return memo('batt:'+courseKey, 15_000, async () => {
      try{
        const r=await fetch('/api/ai/battalion/status?courseKey='+encodeURIComponent(courseKey));
        if(!r.ok){
          // ★ H-23 (P12-7): classify the error reason for diagnostics.
          console.warn('[GDI Storage] battalionStatus non-OK ('+_classifyError(null,r)+') for', courseKey, '— HTTP', r.status);
          return {processed:false};
        }
        return await r.json();
      }catch(e){
        // ★ H-21/H-23 (P12-7): was `catch(_){return {processed:false};}` — silent + undifferentiated.
        console.warn('[GDI Storage] battalionStatus failed ('+_classifyError(e)+') for', courseKey, '—', e && e.message || e);
        return {processed:false};
      }
    });
  }

  async function startBattalion(courseKey, coursePath, lessonName, pdfList){
    try{
      // ★ H-25 (P12-7): 429/503 retry via fetchSaveWithRetry.
      const r=await fetchSaveWithRetry('/api/ai/battalion',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({courseKey,coursePath,lessonName,pdfs:pdfList||[]})});
      const d=await r.json();
      invalidate('batt:'+courseKey);
      return !!(d&&d.ok);
    }catch(e){
      // ★ FIX CYCLE-9 Item 14 + H-23 (P12-7): surface + classify save failures.
      console.warn('[GDI Storage] startBattalion failed ('+_classifyError(e)+') for', courseKey, '—', e && e.message || e);
      return false;
    }
  }

  async function saveMemory(fileName, markdown){
    try{
      // ★ H-25 (P12-7): 429/503 retry via fetchSaveWithRetry.
      await fetchSaveWithRetry('/api/brain/save',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({fileName,markdown})});
      invalidate('memory');
    }catch(e){
      // ★ FIX Task 20-9 Item 10 + H-23 (P12-7): surface + classify save failures.
      console.warn('[GDI Storage] saveMemory failed ('+_classifyError(e)+') for', fileName, '—', e && e.message || e);
    }
  }

  async function listMemory(filter){
    const key = 'memory:'+(filter||'');
    return memo(key, 30_000, async () => {
      try{
        let url='/api/brain/list';
        if(filter)url+='?q='+encodeURIComponent(filter);
        const r=await fetch(url);
        if(!r.ok){
          // ★ H-23 (P12-7): classify the error reason for diagnostics.
          console.warn('[GDI Storage] listMemory non-OK ('+_classifyError(null,r)+') — HTTP', r.status);
          return [];
        }
        const d=await r.json();
        return d&&d.ok&&Array.isArray(d.items)?d.items:[];
      }catch(e){
        // ★ H-21/H-23 (P12-7): was `catch(_){return [];}` — silent + undifferentiated.
        console.warn('[GDI Storage] listMemory failed ('+_classifyError(e)+') —', e && e.message || e);
        return [];
      }
    });
  }

  async function saveEssay(markdown, banca, tipo, score){
    try{
      // ★ H-25 (P12-7): 429/503 retry via fetchSaveWithRetry.
      await fetchSaveWithRetry('/api/ai/essay/save',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({markdown,banca,tipo,score})});
    }catch(e){
      // ★ FIX Task 20-9 Item 10 + H-23 (P12-7): surface + classify save failures.
      console.warn('[GDI Storage] saveEssay failed ('+_classifyError(e)+') —', e && e.message || e);
    }
  }

  async function saveSharedFlashcard(card){
    try{
      // ★ H-25 (P12-7): 429/503 retry via fetchSaveWithRetry.
      await fetchSaveWithRetry('/api/ai/shared-flashcards',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(card)});
      invalidate('sharedFc:'+card.subject);
    }catch(e){
      // ★ FIX Task 20-9 Item 10 + H-23 (P12-7): surface + classify save failures.
      console.warn('[GDI Storage] saveSharedFlashcard failed ('+_classifyError(e)+') —', e && e.message || e);
    }
  }

  async function listSharedFlashcards(subject){
    const key = 'sharedFc:'+(subject||'');
    return memo(key, 60_000, async () => {
      try{
        let url='/api/ai/shared-flashcards';
        if(subject)url+='?subject='+encodeURIComponent(subject);
        const r=await fetch(url);
        if(!r.ok){
          // ★ H-23 (P12-7): classify the error reason for diagnostics.
          console.warn('[GDI Storage] listSharedFlashcards non-OK ('+_classifyError(null,r)+') — HTTP', r.status);
          return [];
        }
        const d=await r.json();
        return d&&d.ok&&Array.isArray(d.items)?d.items:[];
      }catch(e){
        // ★ H-21/H-23 (P12-7): was `catch(_){return [];}` — silent + undifferentiated.
        console.warn('[GDI Storage] listSharedFlashcards failed ('+_classifyError(e)+') —', e && e.message || e);
        return [];
      }
    });
  }

  // ═══ PROGRESS — scan + user KV + shared Drive ═════

  async function scanCourseProgress(coursePath){
    // Cache Storage API (sobrevive a reload). Invalidado pelo caller via invalidate().
    const cacheKey = 'gdi-folder:' + coursePath;
    const hit = await folderCacheGet(cacheKey);
    if (hit) return hit;
    try{
      // ★ FIX Task 20-9 Item 9: 10s AbortController timeout — este POST pode
      // varrer centenas de pastas no Drive; sem timeout, um Worker que caia em
      // loop (ou Drive API pendurado) segura a Promise indefinidamente.
      const r = await fetchWithTimeout('/api/courses/scan-progress',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({coursePath})
      }, 10000);
      if(!r.ok)return null;
      const d=await r.json();
      if(d&&d.ok) await folderCachePut(cacheKey, d);
      return d&&d.ok?d:null;
    }catch(e){
      // ★ FIX Task 20-9 Item 10 + H-23 (P12-7): log para diagnóstico (antes o catch era vazio) + classify reason.
      console.warn('[GDI Storage] scanCourseProgress failed ('+_classifyError(e)+') for', coursePath, '—', e && e.message || e);
      return null;
    }
  }

  async function saveUserProgress(coursePath, progress, totalLessons){
    try{
      // ★ H-25 (P12-7): 429/503 retry via fetchSaveWithRetry.
      await fetchSaveWithRetry('/api/courses/user-progress',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({coursePath, progress:progress||[], totalLessons:totalLessons||0})
      });
      invalidate('userProg:'+coursePath);
    }catch(e){
      // ★ FIX Task 20-9 Item 10 + H-23 (P12-7): surface + classify save failures.
      console.warn('[GDI Storage] saveUserProgress failed ('+_classifyError(e)+') for', coursePath, '—', e && e.message || e);
    }
  }

  async function getUserProgress(coursePath){
    return memo('userProg:'+coursePath, 15_000, async () => {
      try{
        const r=await fetch('/api/courses/user-progress?coursePath='+encodeURIComponent(coursePath));
        if(!r.ok){
          // ★ H-23 (P12-7): classify the error reason for diagnostics.
          console.warn('[GDI Storage] getUserProgress non-OK ('+_classifyError(null,r)+') for', coursePath, '— HTTP', r.status);
          return null;
        }
        const d=await r.json();
        return d&&d.ok?d.progress:null;
      }catch(e){
        // ★ H-21/H-23 (P12-7): was `catch(_){return null;}` — silent + undifferentiated.
        console.warn('[GDI Storage] getUserProgress failed ('+_classifyError(e)+') for', coursePath, '—', e && e.message || e);
        return null;
      }
    });
  }

  async function getSharedProgress(coursePath){
    return memo('sharedProg:'+coursePath, 60_000, async () => {
      try{
        const r=await fetch('/api/courses/shared-progress?coursePath='+encodeURIComponent(coursePath));
        if(!r.ok){
          // ★ H-23 (P12-7): classify the error reason for diagnostics.
          console.warn('[GDI Storage] getSharedProgress non-OK ('+_classifyError(null,r)+') for', coursePath, '— HTTP', r.status);
          return null;
        }
        const d=await r.json();
        return d&&d.ok?{markdown:d.markdown, hash:d.hash, fileName:d.fileName, modified:d.modified}:null;
      }catch(e){
        // ★ H-21/H-23 (P12-7): was `catch(_){return null;}` — silent + undifferentiated.
        console.warn('[GDI Storage] getSharedProgress failed ('+_classifyError(e)+') for', coursePath, '—', e && e.message || e);
        return null;
      }
    });
  }

  async function saveSharedProgress(coursePath, markdown){
    try{
      // ★ H-25 (P12-7): 429/503 retry via fetchSaveWithRetry.
      const r=await fetchSaveWithRetry('/api/courses/shared-progress',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({coursePath, markdown})
      });
      if(!r.ok)return false;
      const d=await r.json();
      invalidate('sharedProg:'+coursePath);
      return !!(d&&d.ok);
    }catch(e){
      // ★ FIX Task 20-9 Item 10 + H-23 (P12-7): surface + classify save failures.
      console.warn('[GDI Storage] saveSharedProgress failed ('+_classifyError(e)+') for', coursePath, '—', e && e.message || e);
      return false;
    }
  }

  function buildSharedProgressMarkdown(opts){
    const {coursePath, courseName, lessons, scannedBy, scannedAt, startedBy} = opts;
    // ★ FIX Agent 19 EDGE-5: `new Date(scannedAt).toISOString()` e
    // `new Date(u.startedAt).toISOString()` lançam `RangeError: Invalid time
    // value` quando o input é um valor truthy mas inválido (string 'NaN',
    // ISO parcial, etc.) — e no caso de `u.startedAt` SEM null check, lança
    // também para undefined/null. A função é chamada de `saveSharedProgress`
    // (lado worker) que escreve o markdown no Drive; se lançar, o save falha
    // silenciosamente e o markdown nunca é escrito. Helper `safeIso` engole
    // o erro e retorna '' para que a linha seja renderizada como '—' pelo
    // caller (que já tem ternário `scannedAt ? safeIso(scannedAt) : '—'`).
    function safeIso(v){
      try {
        if (v === undefined || v === null || v === '') return '';
        const d = new Date(v);
        if (isNaN(d.getTime())) return '';
        return d.toISOString();
      } catch(e) {
        // ★ H-21 (P12-7): was `catch(_) { return ''; }` — silent swallow of
        // unexpected RangeError. safeIso is INTENTIONALLY a safe wrapper
        // (returning '' is the correct behavior), but we now log the swallow
        // so unexpected inputs are surfaced in dev tools. The empty-string
        // return is preserved for backward compatibility.
        console.warn('[GDI Storage] safeIso swallow:', v, '—', e && e.message || e);
        return '';
      }
    }
    const lines = [];
    lines.push('# Curso: '+(courseName||coursePath));
    lines.push('');
    lines.push('> Memória compartilhada da Meggy — este curso já foi escaneado.');
    lines.push('> Outros alunos que iniciarem o mesmo curso verão esta lista e não dispararão novo scan.');
    lines.push('');
    lines.push('**Path:** `'+coursePath+'`');
    lines.push('**Total de aulas:** '+(lessons?lessons.length:0));
    lines.push('**Scanned by:** '+(scannedBy||'—'));
    const scannedAtIso = safeIso(scannedAt);
    lines.push('**Scanned at:** '+(scannedAtIso ? scannedAtIso : '—'));
    lines.push('');
    if(startedBy&&startedBy.length){
      lines.push('## Alunos que iniciaram este curso');
      for(const u of startedBy){
        const iso = safeIso(u.startedAt);
        lines.push('- @'+(u.username||'—')+' — iniciado em '+(iso ? iso : '—'));
      }
      lines.push('');
    }
    if(lessons&&lessons.length){
      lines.push('## Lista de aulas');
      for(let i=0;i<lessons.length;i++){
        const l=lessons[i];
        // ★ FIX Agent 19 EDGE-6: `l.type.toUpperCase()` lança TypeError se
        // `l.type` for undefined (scan legado antes do campo `type` existir,
        // ou lessons.json editado à mão no Drive). Guard `String(l.type||'video')`
        // preserva o comportamento default para lessons sem tipo sem crashar.
        lines.push((i+1)+'. ['+String(l.type||'video').toUpperCase()+'] '+String(l.name||''));
        lines.push('   - Path: `'+(l.path||'')+'`');
      }
      lines.push('');
    }
    lines.push('---');
    lines.push('_Gerado automaticamente por Meggy (gdi_extras). Atualize apenas se a estrutura do curso mudar._');
    return lines.join('\n');
  }

  // ═══ Expõe API global ═════
  window.GDIStorage = {
    version: STORAGE_VERSION,
    // ★ H-23 (P12-7): expose classifyError for callers that want structured
    // reason differentiation. The read helpers themselves still return null/[]
    // (backward compat), but the reason is now logged via console.warn and
    // can be obtained programmatically via this helper if a caller captures
    // the response/error itself.
    classifyError: _classifyError,
    // URL helpers
    shortUrlId,
    getShortUrl,
    shortLessonKey,
    materialFileName,
    // ISA cache
    isaCacheGet,
    isaCacheSet,
    isaCacheList,
    // Materials
    saveMaterial,
    materialExists,
    listMaterials,
    // Courses
    saveCourse,
    listCourses,
    // Course progress
    scanCourseProgress,
    saveUserProgress,
    getUserProgress,
    getSharedProgress,
    saveSharedProgress,
    buildSharedProgressMarkdown,
    // Battalion
    battalionStatus,
    startBattalion,
    // Memory (brain)
    saveMemory,
    listMemory,
    // Essay
    saveEssay,
    // Shared flashcards
    saveSharedFlashcard,
    listSharedFlashcards,
    // Cache control (novo — não quebra nada)
    invalidate,           // (keyPrefix?) => void
    clearCache: () => invalidate(),
    invalidateFolder: (coursePath) => folderCacheDelete('gdi-folder:' + coursePath),
  };

  window.gdiShortNavigate = async function(target){
    const t = String(target||'');
    if(!t) return t;
    try{
      if(window.GDIStorage && typeof window.GDIStorage.getShortUrl==='function'){
        const short = await window.GDIStorage.getShortUrl(t);
        if(short && short.indexOf('/f/')===0){
          return short + (short.includes('?')?'&':'?') + 'a=view';
        }
      }
    }catch(e){
      // ★ H-21 (P12-7): was `catch(_){}` — silent failure hid network errors.
      console.warn('[GDI Storage] gdiShortNavigate failed for', target, '—', e && e.message || e);
    }
    return t + (t.includes('?')?'&':'?') + 'a=view';
  };

  // ═══ H-18 (P12-7): centralized lsGet with parse-error logging ═══
  // The codebase has 4+ local `lsGet` definitions (gdi-meggy.js, gdi-study.js,
  // meggy-utils.js, study-panel.js) all using the pattern
  //   `window.gdiLsGet || ((k,d)=>{try{...; return JSON.parse(v)}catch(_){return d}})`
  // The `window.gdiLsGet` indirection was originally intended to allow a
  // central override, but no module ever set it — so every caller fell back
  // to the local lambda that SILENTLY swallows JSON.parse errors (H-18).
  // By setting `window.gdiLsGet` here, in the loader's CORE_CHAIN (loaded
  // before meggy/* and study/*), we activate the indirection: all callers
  // now get parse-error logging for free. The return value on parse error
  // is still the caller-supplied default (backward compat) — only the
  // visibility into the corruption changes.
  //
  // This is non-breaking: callers' fallback `(k,d)=>{...}` only runs when
  // `window.gdiLsGet` is falsy, which it no longer is after this point.
  // If a caller's local lambda is somehow preferred (e.g. a future module
  // sets window.gdiLsGet AFTER us with a different implementation), the
  // later definition wins — standard JS override semantics.
  if (!window.gdiLsGet) {
    window.gdiLsGet = function(k, d){
      try {
        const v = localStorage.getItem(k);
        if (v == null) return d;
        return JSON.parse(v);
      } catch(e) {
        // ★ H-18 (P12-7): surface corrupted localStorage entries. Previously
        // these were silently dropped to the default value, hiding:
        //   - quota-exceeded partial writes (truncated JSON)
        //   - manual edits to localStorage that broke JSON structure
        //   - encoding issues from cross-tab writes
        // The default is still returned (backward compat) — only visibility
        // into the corruption changes.
        console.warn('[GDI Storage] lsGet JSON parse error for key', k, '— returning default. Error:', e && e.message || e);
        return d;
      }
    };
  }

  console.log('[GDI Storage] Drive v1 carregado (com memoização)');
})();
