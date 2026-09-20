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
    if (ent && now - ent.t < ttlMs) return ent.p;          // hit
    if (ent && ent.p) return ent.p;                        // in-flight dedupe
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
    }catch(_){}
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
    }catch(_){}
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
    }catch(_){}
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
    }catch(_){return false;}
  }

  async function saveMemory(fileName, markdown){
    try{
      await fetch('/api/brain/save',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({fileName,markdown})});
      invalidate('memory');
    }catch(_){}
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
    }catch(_){}
  }

  async function saveSharedFlashcard(card){
    try{
      await fetch('/api/ai/shared-flashcards',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(card)});
      invalidate('sharedFc:'+card.subject);
    }catch(_){}
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
      const r=await fetch('/api/courses/scan-progress',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({coursePath})
      });
      if(!r.ok)return null;
      const d=await r.json();
      if(d&&d.ok) await folderCachePut(cacheKey, d);
      return d&&d.ok?d:null;
    }catch(_){return null;}
  }

  async function saveUserProgress(coursePath, progress, totalLessons){
    try{
      await fetch('/api/courses/user-progress',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({coursePath, progress:progress||[], totalLessons:totalLessons||0})
      });
      invalidate('userProg:'+coursePath);
    }catch(_){}
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
    }catch(_){return false;}
  }

  function buildSharedProgressMarkdown(opts){
    const {coursePath, courseName, lessons, scannedBy, scannedAt, startedBy} = opts;
    const lines = [];
    lines.push('# Curso: '+(courseName||coursePath));
    lines.push('');
    lines.push('> Memória compartilhada da Meggy — este curso já foi escaneado.');
    lines.push('> Outros alunos que iniciarem o mesmo curso verão esta lista e não dispararão novo scan.');
    lines.push('');
    lines.push('**Path:** `'+coursePath+'`');
    lines.push('**Total de aulas:** '+(lessons?lessons.length:0));
    lines.push('**Scanned by:** '+(scannedBy||'—'));
    lines.push('**Scanned at:** '+(scannedAt?new Date(scannedAt).toISOString():'—'));
    lines.push('');
    if(startedBy&&startedBy.length){
      lines.push('## Alunos que iniciaram este curso');
      for(const u of startedBy)lines.push('- @'+u.username+' — iniciado em '+new Date(u.startedAt).toISOString());
      lines.push('');
    }
    if(lessons&&lessons.length){
      lines.push('## Lista de aulas');
      for(let i=0;i<lessons.length;i++){
        const l=lessons[i];
        lines.push((i+1)+'. ['+l.type.toUpperCase()+'] '+l.name);
        lines.push('   - Path: `'+l.path+'`');
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
