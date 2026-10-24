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
    try { const c = await caches.open(FOLDER_CACHE); const r = await c.match(key); return r ? await r.json() : null; }
    catch(_) { return null; }
  }
  async function folderCachePut(key, data){
    try { const c = await caches.open(FOLDER_CACHE); await c.put(key, new Response(JSON.stringify(data))); }
    catch(_) {}
  }
  async function folderCacheDelete(key){
    try { const c = await caches.open(FOLDER_CACHE); await c.delete(key); }
    catch(_) {}
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
    }catch(_){}
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
        if(!r.ok)return null;
        const d=await r.json();
        return d&&d.ok?d.cached:null;
      }catch(_){return null;}
    });
  }

  async function isaCacheSet(lessonKey, data){
    try{
      await fetch('/api/ai/cache',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({key:lessonKey,...data})});
      invalidate('isa:'+lessonKey);
    }catch(e){
      // ★ FIX CYCLE-9 Item 14: surface save failures (before: silent empty catch)
      console.warn('[GDI Storage] isaCacheSet failed for', lessonKey, '—', e && e.message || e);
    }
  }

  async function isaCacheList(){
    return memo('isaList', 30_000, async () => {
      try{
        const r=await fetch('/api/ai/cache/list');
        if(!r.ok)return [];
        const d=await r.json();
        return d&&d.ok&&Array.isArray(d.entries)?d.entries:[];
      }catch(_){return [];}
    });
  }

  async function saveMaterial(coursePath, pdfName, kind, content){
    try{
      await fetch('/api/materials/save',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({coursePath,pdfName,kind,content})});
      invalidate('matList:'+kind);
    }catch(e){
      // ★ FIX Task 20-9 Item 10: surface save failures (before: silent empty catch)
      console.warn('[GDI Storage] saveMaterial failed —', e && e.message || e);
    }
  }

  async function materialExists(coursePath, pdfName, kind){
    const fileName = materialFileName(coursePath, pdfName, kind);
    return memo('matExists:'+kind+':'+fileName, 60_000, async () => {
      try{
        const r=await fetch('/api/materials/exists?fileName='+encodeURIComponent(fileName)+'&kind='+kind);
        if(!r.ok)return false;
        const d=await r.json();
        return !!(d&&d.ok&&d.exists);
      }catch(_){return false;}
    });
  }

  async function listMaterials(kind, courseFilter){
    const key = 'matList:'+kind+':'+(courseFilter||'');
    return memo(key, 30_000, async () => {
      try{
        let url='/api/materials/list?kind='+kind;
        if(courseFilter)url+='&course='+encodeURIComponent(courseFilter);
        const r=await fetch(url);
        if(!r.ok)return [];
        const d=await r.json();
        return d&&d.ok&&Array.isArray(d.items)?d.items:[];
      }catch(_){return [];}
    });
  }

  async function saveCourse(coursePath, courseName, pdfCount){
    try{
      await fetch('/api/courses/add',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({coursePath,courseName,pdfCount:pdfCount||0,addedAt:Date.now()})});
      invalidate('courses');
    }catch(e){
      // ★ FIX Task 20-9 Item 10: surface save failures (before: silent empty catch)
      console.warn('[GDI Storage] saveCourse failed —', e && e.message || e);
    }
  }

  async function listCourses(){
    return memo('courses', 30_000, async () => {
      try{
        const r=await fetch('/api/courses/list');
        if(!r.ok)return [];
        const d=await r.json();
        return d&&d.ok&&Array.isArray(d.courses)?d.courses:[];
      }catch(_){return [];}
    });
  }

  async function battalionStatus(courseKey){
    return memo('batt:'+courseKey, 15_000, async () => {
      try{
        const r=await fetch('/api/ai/battalion/status?courseKey='+encodeURIComponent(courseKey));
        if(!r.ok)return {processed:false};
        return await r.json();
      }catch(_){return {processed:false};}
    });
  }

  async function startBattalion(courseKey, coursePath, lessonName, pdfList){
    try{
      const r=await fetch('/api/ai/battalion',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({courseKey,coursePath,lessonName,pdfs:pdfList||[]})});
      const d=await r.json();
      invalidate('batt:'+courseKey);
      return !!(d&&d.ok);
    }catch(e){
      // ★ FIX CYCLE-9 Item 14: surface save failures (before: silent empty catch)
      console.warn('[GDI Storage] startBattalion failed for', courseKey, '—', e && e.message || e);
      return false;
    }
  }

  async function saveMemory(fileName, markdown){
    try{
      await fetch('/api/brain/save',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({fileName,markdown})});
      invalidate('memory');
    }catch(e){
      // ★ FIX Task 20-9 Item 10: surface save failures (before: silent empty catch)
      console.warn('[GDI Storage] saveMemory failed —', e && e.message || e);
    }
  }

  async function listMemory(filter){
    const key = 'memory:'+(filter||'');
    return memo(key, 30_000, async () => {
      try{
        let url='/api/brain/list';
        if(filter)url+='?q='+encodeURIComponent(filter);
        const r=await fetch(url);
        if(!r.ok)return [];
        const d=await r.json();
        return d&&d.ok&&Array.isArray(d.items)?d.items:[];
      }catch(_){return [];}
    });
  }

  async function saveEssay(markdown, banca, tipo, score){
    try{
      await fetch('/api/ai/essay/save',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({markdown,banca,tipo,score})});
    }catch(e){
      // ★ FIX Task 20-9 Item 10: surface save failures (before: silent empty catch)
      console.warn('[GDI Storage] saveEssay failed —', e && e.message || e);
    }
  }

  async function saveSharedFlashcard(card){
    try{
      await fetch('/api/ai/shared-flashcards',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(card)});
      invalidate('sharedFc:'+card.subject);
    }catch(e){
      // ★ FIX Task 20-9 Item 10: surface save failures (before: silent empty catch)
      console.warn('[GDI Storage] saveSharedFlashcard failed —', e && e.message || e);
    }
  }

  async function listSharedFlashcards(subject){
    const key = 'sharedFc:'+(subject||'');
    return memo(key, 60_000, async () => {
      try{
        let url='/api/ai/shared-flashcards';
        if(subject)url+='?subject='+encodeURIComponent(subject);
        const r=await fetch(url);
        if(!r.ok)return [];
        const d=await r.json();
        return d&&d.ok&&Array.isArray(d.items)?d.items:[];
      }catch(_){return [];}
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
      // ★ FIX Task 20-9 Item 10: log para diagnóstico (antes o catch era vazio).
      console.warn('[GDI Storage] scanCourseProgress failed for', coursePath, '—', e && e.message || e);
      return null;
    }
  }

  async function saveUserProgress(coursePath, progress, totalLessons){
    try{
      await fetch('/api/courses/user-progress',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({coursePath, progress:progress||[], totalLessons:totalLessons||0})
      });
      invalidate('userProg:'+coursePath);
    }catch(e){
      // ★ FIX Task 20-9 Item 10: surface save failures (before: silent empty catch)
      console.warn('[GDI Storage] saveUserProgress failed for', coursePath, '—', e && e.message || e);
    }
  }

  async function getUserProgress(coursePath){
    return memo('userProg:'+coursePath, 15_000, async () => {
      try{
        const r=await fetch('/api/courses/user-progress?coursePath='+encodeURIComponent(coursePath));
        if(!r.ok)return null;
        const d=await r.json();
        return d&&d.ok?d.progress:null;
      }catch(_){return null;}
    });
  }

  async function getSharedProgress(coursePath){
    return memo('sharedProg:'+coursePath, 60_000, async () => {
      try{
        const r=await fetch('/api/courses/shared-progress?coursePath='+encodeURIComponent(coursePath));
        if(!r.ok)return null;
        const d=await r.json();
        return d&&d.ok?{markdown:d.markdown, hash:d.hash, fileName:d.fileName, modified:d.modified}:null;
      }catch(_){return null;}
    });
  }

  async function saveSharedProgress(coursePath, markdown){
    try{
      const r=await fetch('/api/courses/shared-progress',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({coursePath, markdown})
      });
      if(!r.ok)return false;
      const d=await r.json();
      invalidate('sharedProg:'+coursePath);
      return !!(d&&d.ok);
    }catch(e){
      // ★ FIX Task 20-9 Item 10: surface save failures (before: silent empty catch)
      console.warn('[GDI Storage] saveSharedProgress failed for', coursePath, '—', e && e.message || e);
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
      } catch(_) { return ''; }
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
    }catch(_){}
    return t + (t.includes('?')?'&':'?') + 'a=view';
  };

  console.log('[GDI Storage] Drive v1 carregado (com memoização)');
})();
