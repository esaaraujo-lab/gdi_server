// ═══════════════════════════════════════════════════════════════
// meggy-cache.js — generateAll + cacheGet/Save + addQ(Batch) +
//                  saveIsaSummary/listIsa/delIsa + downloadAsPdf +
//                  copySummary + autoCreateFlashcards + regenerate
//
// Module 3 of 7 (modular/meggy/).
// Sourced from gdi-meggy.js M9-ISA IIFE (lines 591-842, 904-1170, 2025-2047).
//
// CRITICAL: _chainCache, _inflight, _qWriteChain, _chainCacheMax stay HERE.
// generateAll + regenerate must stay together (regenerate awaits _inflight[key]
// and deletes _chainCache[key] — v1.0.84 BUG 5/8 fix).
//
// Exposes:
//   • window.__gdiMeggy.cache = { generateAll, regenerate, cacheGet, cacheSave,
//     addQ, addQBatch, saveIsaSummary, listIsaSummaries, delIsaSummary,
//     downloadAsPdf, copySummary, autoCreateFlashcards, _chainCache, _inflight,
//     _qWriteChain }
//
// Guard: window.__gdiMeggyCache
// Depends on: utils (lessonKey, lsGet, lsSet, uid, renderMd, esc, callIsaKeyed,
//   parseJsonArray, realLessonName), pdf-engine (extractPdfText),
//   questions (extractQuestionsFromText) [late-bind], summaries (saveSharedSummary,
//   summary) [late-bind]
// ═══════════════════════════════════════════════════════════════
(function(){
  if(window.__gdiMeggyCache)return;
  window.__gdiMeggyCache=true;

  window.__gdiMeggy = window.__gdiMeggy || {};

  // ── Late-bound namespace shortcuts (resolved at call-time via property lookup) ──
  // U is stable; U.func() resolves the function fresh on every call.
  const U = window.__gdiMeggy.utils;
  const LS_SUM = U.CONSTS.LS_SUM;
  const LQ = U.CONSTS.LQ;

  // ── Question bank integration (replicates M23 addQ on LS) ──
  function addQ(obj){
    const q=U.lsGet(LQ,[]);
    q.push({id:U.uid(),createdAt:Date.now(),hits:0,misses:0,...obj});
    U.lsSet(LQ,q);
  }

  // ═══ PATCH B: Inserção em batch de questões (elimina O(N²) no localStorage) ═══
  // Lê LS 1×, faz push de todos os itens únicos, grava 1×.
  // Retorna o número de itens efetivamente adicionados (após dedupe por statement).
  // ★ v80-FIX-MEGGY BUG 1: serialize writes with a per-key promise chain to
  //    avoid read-modify-write races when called concurrently from generateAll
  //    (parallel PDF processing). Last-write-wins was losing question batches.
  let _qWriteChain = Promise.resolve();
  function addQBatch(newItems){
    if(!newItems || !newItems.length) return 0;
    _qWriteChain = _qWriteChain.then(() => {
      const all = U.lsGet(LQ, []);
      const seen = new Set(all.map(x => x.statement));
      let added = 0;
      for(const item of newItems){
        if(!item || !item.statement || seen.has(item.statement)) continue;
        all.push(Object.assign({id:'q'+Date.now()+'_'+Math.random().toString(36).slice(2,7), createdAt:Date.now(), hits:0, misses:0}, item));
        seen.add(item.statement);
        added++;
      }
      if(added) U.lsSet(LQ, all);
      return added;
    });
    return _qWriteChain;
  }

  // ★ FIX-05-MEGGY-CACHE: helper para filtrar o banco local por curso.
  //    Antes as questões só tinham `subject` (nome da aula) — impossível
  //    agregar por curso. Agora generateAll etiqueta cada questão com
  //    `course` (nome do curso derivado da URL), e esta função permite
  //    à Central de Estudos listar todas as questões de um curso.
  //    Compatível com questões legadas (sem `course`): retorna-as quando
  //    courseName for vazio.
  function questionsByCourse(courseName){
    const all = U.lsGet(LQ, []);
    if(!courseName) return all;
    const needle = String(courseName).toLowerCase();
    return all.filter(q => q && q.course && String(q.course).toLowerCase() === needle);
  }

  // ── Summaries storage ──
  // ★ FIX: agora salva também o path do curso e a matéria — para o botão
  // "Resumo" no painel de materiais (M9) agrupar corretamente.
  // ★ FIX 3 (Task 13): também persiste no Drive via storage.js saveMaterial(),
  //    na subpasta 'resumos' da pasta do usuário. Assim o resumo sobrevive a
  //    limpeza do localStorage e fica acessível de outros dispositivos.
  function saveIsaSummary(lesson, summary, coursePath, subject){
    const arr=U.lsGet(LS_SUM,[]);
    // extrai course e subject do path se não vierem explícitos
    // path típico: /7:/Sou + Carreiras Policiais 5.0/Bloco I - Direito Constitucional/01 - Aula.mp4
    let derivedCourse=coursePath||'';
    let derivedSubject=subject||'';
    if(!derivedCourse){
      // tenta derivar do lessonKey atual (URL do navegador)
      const p=window.location.pathname||'';
      const seg=p.split('/').filter(Boolean);
      if(seg.length>=2){
        // /7:/Curso/Materia/Aula → curso = seg[1], materia = seg[2] (se houver)
        derivedCourse='/'+seg.slice(0,2).join('/')+'/';
        if(seg.length>=3)derivedSubject=decodeURIComponent(seg[2]);
      }
    }
    arr.unshift({
      id:U.uid(),
      lesson:String(lesson||'Aula').slice(0,200),
      summary:String(summary||''),
      path:derivedCourse,
      subject:derivedSubject||'Geral',
      date:Date.now()
    });
    U.lsSet(LS_SUM,arr.slice(0,200));

    // ★ FIX 3 (Task 13): também salva no Drive (pasta do usuário / resumos / <hash>.md)
    // via storage.js. O servidor cria a subpasta 'resumos' on-demand.
    // Não-await — não bloqueia a UI; falha silenciosa (já temos o localStorage).
    try{
      if(window.GDIStorage && typeof window.GDIStorage.saveMaterial==='function' && derivedCourse && summary){
        window.GDIStorage.saveMaterial(derivedCourse, String(lesson||'Aula').slice(0,200), 'resumos', String(summary)).catch(()=>{});
      }
    }catch(_){}
  }
  function listIsaSummaries(){return U.lsGet(LS_SUM,[]);}
  function delIsaSummary(id){U.lsSet(LS_SUM,U.lsGet(LS_SUM,[]).filter(x=>x.id!==id));}

  // ── Download summary as PDF (via print dialog) ──
  function downloadAsPdf(lesson, markdownText){
    const html=U.renderMd(markdownText);
    const w=window.open('','_blank');
    if(!w){showToast('Permita pop-ups para baixar o PDF');return;}
    w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
    <title>${U.esc(lesson)} — Resumo Meggy</title>
    <style>
      @page{margin:2cm;size:A4;}
      *{box-sizing:border-box;}
      body{font-family:'Georgia','Times New Roman',serif;color:#1a1a1a;line-height:1.7;max-width:210mm;margin:0 auto;padding:20px;}
      h1{font-family:'Helvetica',sans-serif;font-size:22px;color:#c026d3;border-bottom:2px solid #ff8b9f;padding-bottom:8px;margin-bottom:6px;}
      .meta{font-family:'Helvetica',sans-serif;font-size:11px;color:#666;margin-bottom:24px;}
      h2{font-family:'Helvetica',sans-serif;font-size:17px;color:#1a1a1a;margin-top:24px;border-left:3px solid #ff8b9f;padding-left:10px;}
      h3{font-family:'Helvetica',sans-serif;font-size:14px;color:#333;margin-top:18px;}
      p{margin:8px 0;text-align:justify;}
      ul,ol{margin:8px 0;padding-left:24px;}
      li{margin:4px 0;}
      code{background:#f4f4f4;padding:2px 6px;border-radius:3px;font-family:'Courier New',monospace;font-size:12px;}
      pre{background:#f4f4f4;padding:12px;border-radius:6px;overflow-x:auto;font-size:11px;}
      blockquote{border-left:3px solid #ff8b9f;margin:12px 0;padding:4px 16px;color:#555;font-style:italic;}
      strong{color:#1a1a1a;}
      @media print{body{padding:0;}}
    </style></head><body>
    <h1>${U.esc(lesson)}</h1>
    <div class="meta">Resumo gerado pela Meggy 🐩 · ${new Date().toLocaleDateString('pt-BR')}</div>
    ${html}
    <script>window.onload=function(){setTimeout(function(){window.print();},300);};</script>
    </body></html>`);
    w.document.close();
  }

  // ── Copy summary to clipboard ──
  async function copySummary(text){
    try{
      await navigator.clipboard.writeText(text);
      showToast('Resumo copiado para a área de transferência');
    }catch(_){
      const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();
      try{document.execCommand('copy');showToast('Resumo copiado');}catch(_){showToast('Não foi possível copiar');}
      ta.remove();
    }
  }

  // ── Auto-criar flashcards das questões geradas ──
  // Cada questão vira um flashcard: frente = enunciado, verso = resposta certa + explicação
  // ★FIX: usa gdi-cards-v1 (mesma chave da Central de Estudos) em vez de gdi-fc-v1
  // ★FIX v2: agora salva urlPath (path real da aula) para permitir agrupar por
  // disciplina (pasta pai) e tema (nome da aula) na biblioteca de flashcards.
  function autoCreateFlashcards(questions,lesson,urlPath){
    const cards=U.lsGet('gdi-cards-v1',[]);
    let n=0;
    const path=urlPath||U.lessonKey()||lesson;
    questions.forEach(q=>{
      if(!q||!q.statement||!Array.isArray(q.options))return;
      const correctLetter=String.fromCharCode(65,q.correct||0);
      const correctText=q.options[q.correct||0]||'';
      const back=correctLetter+') '+correctText+(q.explanation?'\n\n💡 '+q.explanation:'');
      // evita duplicatas (mesma frente)
      const exists=cards.some(c=>c.f===q.statement);
      if(!exists){
        cards.push({id:U.uid(),f:q.statement,b:back,due:Date.now()+86400000,box:0,src:'ISA:'+lesson,path:path,lesson:lesson,createdAt:Date.now()});
        n++;
      }
    });
    if(n)U.lsSet('gdi-cards-v1',cards);
    return n;
  }

  // ── Drive cache (GET/POST /api/ai/cache) ──
  // ★ Sprint 4: agora tenta primeiro os endpoints granulares opcionais
  //   /api/ai/summaries, /api/ai/flashcards, /api/ai/questions
  //   Se falhar (worker antigo), cai para o cache unificado /api/ai/cache.
  //   Isso permite migração gradual: worker novo = 4 arquivos; worker antigo = 1.
  const GRANULAR_AVAILABLE = (function(){
    // detecta uma vez se endpoints granulares existem (HEAD request)
    let _checked=null;
    return async function(){
      if(_checked!==null)return _checked;
      try{
        const r=await fetch('/api/ai/summaries?probe=1',{method:'HEAD'});
        _checked=r.ok;
      }catch(_){_checked=false;}
      return _checked;
    };
  })();

  async function cacheGet(keyOverride){
    // ★ v87-FIX-MEGGY-MODULES BUG 4: accept optional keyOverride so we can
    //    probe multiple cache keys (lesson URL, PDF-matched key, etc.) to
    //    find the Battalion's persistent memory, which is saved under
    //    `courseKey/pdfName` keys that never match U.lessonKey() (URL).
    const _key = keyOverride || U.lessonKey();
    try{
      // ★ tenta endpoint granular primeiro (summaries)
      const granular=await GRANULAR_AVAILABLE();
      if(granular){
        const r=await fetch('/api/ai/summaries?key='+encodeURIComponent(_key),{cache:'no-store'});
        const d=await r.json();
        if(d&&d.ok&&d.cached)return d.cached;
        return null;
      }
      // fallback: cache unificado antigo
      const r=await fetch('/api/ai/cache?key='+encodeURIComponent(_key),{cache:'no-store'});
      const d=await r.json();
      return (d&&d.ok&&d.cached)?d.cached:null;
    }catch(_){return null;}
  }

  // ═══ NEW (indice.json + lesson folder approach — Task MIGRATE-02-MEGGY-INDICE)
  //    Helpers for the new persistence model:
  //      • lessonFolderPath() — derives the lesson folder (parent of the
  //        current lesson URL). Mirrors gdi-core.js M9 `fPath`.
  //      • indiceGet(lessonKey) — GET /api/ai/indice?lesson=<key>
  //      • indiceSet(entry)     — POST /api/ai/indice
  //      • readLessonFile(lessonPath, fileName) — list lesson folder + fetch
  //        the file content via downloadUrl (or .content field if present).
  //    Replaces the old isa_cache.json + .meggy.ai/resumos/ model. Now each
  //    lesson stores resumo_meggy.md / questoes_meggy.json / mapa_meggy.md
  //    directly in ITS OWN folder, and a lightweight indice.json in .meggy.ai/
  //    tracks WHERE each file is saved.
  function lessonFolderPath(){
    const p = window.location.pathname || '';
    if(!p) return '/';
    const idx = p.lastIndexOf('/');
    if(idx <= 0) return p.endsWith('/') ? p : (p + '/');
    return p.slice(0, idx + 1);
  }

  async function indiceGet(lessonKey){
    try{
      const r = await fetch('/api/ai/indice?lesson=' + encodeURIComponent(lessonKey), {cache:'no-store'});
      if(!r.ok) return null;
      const d = await r.json();
      if(d && d.ok && d.entry) return d.entry;
      return null;
    }catch(_){ return null; }
  }

  async function indiceSet(entry){
    try{
      await fetch('/api/ai/indice', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(entry)
      });
    }catch(_){ /* não bloqueia o fluxo se o indice falhar */ }
  }

  async function readLessonFile(lessonPath, fileName){
    if(!lessonPath || !fileName) return '';
    try{
      if(window.GDIStorage && typeof window.GDIStorage.listLessonMaterials === 'function'){
        const items = await window.GDIStorage.listLessonMaterials(lessonPath);
        const match = (items || []).find(it => it && it.name === fileName);
        if(!match) return '';
        if(match.content) return String(match.content);
        if(match.downloadUrl){
          const r = await fetch(match.downloadUrl, {cache:'no-store'});
          if(r.ok) return await r.text();
        }
      }
    }catch(_){ /* best-effort */ }
    return '';
  }

  // ★ v87-FIX-MEGGY-MODULES BUG 4: robust cache lookup that probes multiple
  //    key variants so Meggy can reuse the Battalion's persistent memory.
  //    Battalion saves with key `courseKey + '/' + pdfName` (e.g.,
  //    /7:/Course/Aula1.pdf), but Meggy's cacheGet() looks up by
  //    U.lessonKey() = window.location.pathname (e.g., /7:/Course/Aula1.mp4).
  //    These NEVER match → Meggy always re-extracts PDFs and ignores the
  //    Battalion's work. This helper tries:
  //      (1) primary lesson URL key (cacheGet())
  //      (2) URL with video extension (.mp4/.webm/…) swapped to .pdf
  //      (3) Battalion's .meggy.ai/resumos/ Drive folder via
  //          window.GDIStorage.listMaterials, matched by lesson name
  //    Returns the first hit (or null). Logs misses so we can debug.
  // ★ MIGRATE-02-MEGGY-INDICE: cacheGetRobust() now consults indice.json
  //    (a lightweight index in .meggy.ai/) to find WHERE the lesson's resumo /
  //    questoes / mapa files live, then reads them directly from the lesson
  //    folder. Replaces the old 4-step probe (isa_cache primary key → PDF-
  //    extension variant → Battalion resumos/ Drive folder → shared pool).
  //    If indice has no entry for this lesson → returns null (will trigger
  //    generation). If indice has an entry but files are unreadable → also
  //    returns null (defensive — corrupt indice entry shouldn't block gen).
  async function cacheGetRobust(){
    const lessonKey = U.lessonKey();
    const lessonPath = lessonFolderPath();

    // (1) Check indice.json via GET /api/ai/indice?lesson=<lessonKey>
    const entry = await indiceGet(lessonKey);
    if(!entry){
      console.info('[Meggy] indice miss for lessonKey:', lessonKey, '— will trigger generation.');
      return null;
    }

    // (2) indice hit — read resumo MD (+ questoes JSON + mapa MD) from the
    //     lesson folder. Each file's path is stored in the indice entry; we
    //     only need the basename to find it via listLessonMaterials.
    const resumoName  = (entry.resumo   || (lessonPath + 'resumo_meggy.md')).split('/').pop();
    const questoesName= (entry.questoes || (lessonPath + 'questoes_meggy.json')).split('/').pop();
    const mapaName    = (entry.mapa     || (lessonPath + 'mapa_meggy.md')).split('/').pop();

    const summary   = await readLessonFile(lessonPath, resumoName);
    const mindmap   = await readLessonFile(lessonPath, mapaName) || null;
    let questions = [];
    const qRaw = await readLessonFile(lessonPath, questoesName);
    if(qRaw){
      try{ const parsed = JSON.parse(qRaw); if(Array.isArray(parsed)) questions = parsed; }
      catch(_){ questions = []; }
    }

    if(!summary && !mindmap && !questions.length){
      console.info('[Meggy] indice entry exists for', lessonKey, 'but no files readable — will trigger generation.');
      return null;
    }

    console.info('[Meggy] cache hit via indice.json (lesson folder):', lessonPath,
      '{ resumo:' + (!!summary) + ', questoes:' + questions.length + ', mapa:' + (!!mindmap) + ' }');
    return { summary: summary || null, questions, mindmap };
  }

  // ★ MIGRATE-02-MEGGY-INDICE: cacheSave() now writes resumo_meggy.md /
  //    questoes_meggy.json / mapa_meggy.md directly into the LESSON FOLDER
  //    (where the video lives) and updates indice.json so the next student
  //    (or this student on another device) can find them. Replaces the old
  //    POST /api/ai/cache (isa_cache.json) + .meggy.ai/resumos/ writes.
  //    Still updates _chainCache (in-memory) for fast same-session access.
  async function cacheSave(summary, questions, lessonName, mindmap){
    try{
      const lessonKey = U.lessonKey();
      const lessonPath = lessonFolderPath();

      // ★FIX (preserved): se mindmap não foi passado, preserva o que já está
      //    no _chainCache (antes consultava o Drive via cacheGet; agora o
      //    _chainCache é a fonte de verdade in-session — mais rápido e não
      //    depende do legado /api/ai/cache).
      let mindmapToSave = mindmap;
      if(mindmapToSave === undefined){
        mindmapToSave = (_chainCache[lessonKey] && _chainCache[lessonKey].mindmap) || null;
      }

      // (1) Save resumo_meggy.md / questoes_meggy.json / mapa_meggy.md to the
      //     lesson folder via GDIStorage.saveMaterialToLesson (non-blocking
      //     per file — partial failure doesn't abort the others).
      if(window.GDIStorage && typeof window.GDIStorage.saveMaterialToLesson === 'function'){
        if(summary){
          try{ await window.GDIStorage.saveMaterialToLesson(lessonPath, 'resumo_meggy.md', String(summary)); }
          catch(_){ /* não bloqueia */ }
        }
        if(Array.isArray(questions) && questions.length){
          try{ await window.GDIStorage.saveMaterialToLesson(lessonPath, 'questoes_meggy.json', JSON.stringify(questions, null, 2)); }
          catch(_){ /* não bloqueia */ }
        }
        if(mindmapToSave){
          try{ await window.GDIStorage.saveMaterialToLesson(lessonPath, 'mapa_meggy.md', String(mindmapToSave)); }
          catch(_){ /* não bloqueia */ }
        }
      }

      // (2) Update indice.json via POST /api/ai/indice — records WHERE each
      //     file lives so cacheGetRobust can find them next time.
      await indiceSet({
        lesson:     lessonKey,
        lessonName: String(lessonName || '').slice(0, 200),
        resumo:     lessonPath + 'resumo_meggy.md',
        questoes:   lessonPath + 'questoes_meggy.json',
        mapa:       lessonPath + 'mapa_meggy.md',
        date:       Date.now()
      });

      // (3) Update _chainCache (in-memory) for fast same-session access.
      //    Conservative: only overwrite fields when the caller passes a
      //    NON-EMPTY value — avoids wiping a good in-memory summary when
      //    the caller passed null (e.g. transient network blip).
      if(!_chainCache[lessonKey]) _chainCache[lessonKey] = {};
      if(summary)                                       _chainCache[lessonKey].summary   = summary;
      if(Array.isArray(questions) && questions.length)  _chainCache[lessonKey].questions = questions;
      if(mindmapToSave)                                 _chainCache[lessonKey].mindmap   = mindmapToSave;
    }catch(_){ /* não bloqueia o fluxo se o cache falhar */ }
  }

  // ── GERAÇÃO EM CADEIA: resumo + pílulas + questões ──
  // Qualquer aba clicada (Resumo/Questões/Pílulas) dispara a geração
  // dos 3 em cadeia se ainda não existirem. Cada um é salvo no Drive.
  // As questões ciclam entre TODOS os PDFs, gerando até 20 por material.

  // Cache em memória para evitar regenerar na mesma sessão
  let _chainCache={};
  // ★ Sprint 6: LRU no _chainCache (limita a 5 aulas em memória)
  const _chainCacheMax=5;
  // ★ v80-FIX-MEGGY BUG 5: per-key in-flight promise map. Concurrent calls
  //    to generateAll (e.g. user clicks Resumo then Questões fast) share the
  //    same in-flight promise — avoids duplicate PDF extraction + API calls.
  const _inflight={};
  function _chainCacheEvict(){
    const keys=Object.keys(_chainCache);
    if(keys.length>_chainCacheMax){
      // remove o mais antigo (primeiro inserido — aproximação LRU)
      delete _chainCache[keys[0]];
    }
  }

  // Gera TODOS os materiais EM PARALELO TOTAL (não em cascata)
  // Cada tarefa usa uma chave NVIDIA diferente (se houver múltiplas)
  // ★ v80-FIX-MEGGY BUG 5: hoist `key` and wrap entire body in an async IIFE
  //    stored in _inflight[key]. Concurrent calls share the same promise —
  //    prevents duplicate PDF extraction + API calls when user clicks
  //    Resumo/Questões/Pílulas fast in succession.
  async function generateAll(items,lesson,trigger,progressCb){
    const key=U.lessonKey();
    if(_inflight[key]) return _inflight[key];
    _inflight[key] = (async () => {
      try {
    // ★ FIX 3 (Task 13): deriva coursePath e subject da URL atual para passar
    //    explicitamente ao saveIsaSummary (que agora também persiste no Drive).
    //    Antes, saveIsaSummary derivava sozinho — mas sempre que generateAll
    //    era chamado a partir de uma página de aula, a URL já tinha o formato
    //    /<drive>:/<curso>/<materia>/<aula>, então derivar 1× aqui é mais eficiente
    //    e garante consistência entre os 2 call-sites (cache hit e geração nova).
    const _p=window.location.pathname||'';
    const _seg=_p.split('/').filter(Boolean);
    let _coursePath='',_subject='',_courseName='';
    if(_seg.length>=2){
      _coursePath='/'+_seg.slice(0,2).join('/')+'/';
      try{ _courseName=decodeURIComponent(_seg[1]); }catch(_){ _courseName=_seg[1]; }
      if(_seg.length>=3){
        try{ _subject=decodeURIComponent(_seg[2]); }catch(_){ _subject=_seg[2]; }
      }
    }
    // ★ FIX-05-MEGGY-CACHE: _courseName é usado para etiquetar questões com
    //    `course` (filtro por curso na Central de Estudos). Antes as questões
    //    só tinham `subject:lesson` — impossível filtrar por curso.
    // se já tem tudo no cache em memória, pula
    if(_chainCache[key]&&_chainCache[key].summary&&_chainCache[key].mindmap&&_chainCache[key].questionsGenerated){
      return _chainCache[key];
    }

    // verifica cache PRIMEIRO (antes de extrair PDF)
    // ★ MIGRATE-02-MEGGY-INDICE: cacheGetRobust() now consults indice.json
    //    (a lightweight index in .meggy.ai/) to find the lesson folder's
    //    resumo_meggy.md / questoes_meggy.json / mapa_meggy.md, then reads
    //    them directly. Replaces the old isa_cache.json + .meggy.ai/resumos/
    //    + shared-pool probes.
    const cached=await cacheGetRobust();
    if(!_chainCache[key]){_chainCache[key]={};_chainCacheEvict();}
    if(cached){
      _chainCache[key].summary=cached.summary||null;
      _chainCache[key].mindmap=cached.mindmap||null;
      _chainCache[key].cachedQuestions=cached.questions||[];
    }

    // ★ Se já tem resumo + pílulas + questões no Drive, carrega e NÃO regenera
    if(_chainCache[key].summary&&_chainCache[key].mindmap&&cached&&cached.questions&&cached.questions.length){
      _chainCache[key].questionsGenerated=true;
      _chainCache[key].questions=cached.questions;
      // ★ PATCH B: carrega questões no banco local em batch (1 read + 1 write)
      // ★ FIX-05-MEGGY-CACHE: etiqueta com `course` (filtro por curso).
      const _batch=[];
      cached.questions.forEach(q=>{
        if(q&&q.statement){
          let cleanQ;
          if(q.type==='tf'||(!q.options&&q.correct!==undefined)){
            cleanQ={course:_courseName,subject:lesson,type:'tf',statement:String(q.statement),options:['Certo','Errado'],correct:Math.max(0,Math.min(1,Number(q.correct)||0)),explanation:String(q.explanation||''),source:'ISA-PDF'};
          }else if(Array.isArray(q.options)){
            cleanQ={course:_courseName,subject:lesson,type:'mc',statement:String(q.statement),options:q.options.map(String),correct:Math.max(0,Math.min(3,Number(q.correct)||0)),explanation:String(q.explanation||''),source:'ISA-PDF'};
          }
          if(cleanQ)_batch.push(cleanQ);
        }
      });
      addQBatch(_batch);
      // flashcards do cache
      if(cached.questions.length)autoCreateFlashcards(cached.questions,lesson,U.lessonKey());
      saveIsaSummary(lesson,_chainCache[key].summary,_coursePath,_subject);
            return _chainCache[key];
    }

    // ★ FIX-05-MEGGY-CACHE (KEY FIX): PARTIAL cache hit — summary + questions
    //    exist but mindmap is missing. Under the indice.json approach this
    //    happens when the lesson folder has resumo_meggy.md + questoes_meggy.json
    //    but mapa_meggy.md was not yet written (e.g. previous generation was
    //    interrupted). Without this handler, the next run would fall through
    //    to PDF extraction and RE-GENERATE the questions
    //    (wasting LLM calls), even though student A already shared them.
    //    Here we preload the shared/cached questions into the local bank and
    //    mark questionsGenerated so the AI question task is skipped — only
    //    the pílulas task runs (which needs PDF text, so extraction still
    //    happens, but only for the mindmap, not for re-asking the LLM).
    if(_chainCache[key].summary && !_chainCache[key].mindmap &&
       _chainCache[key].cachedQuestions && _chainCache[key].cachedQuestions.length &&
       !_chainCache[key].questionsGenerated){
      _chainCache[key].questionsGenerated = true;
      _chainCache[key]._allCleanQ = [];
      const _batchPreload = [];
      _chainCache[key].cachedQuestions.forEach(q=>{
        if(q&&q.statement){
          let cleanQ;
          if(q.type==='tf'||(!q.options&&q.correct!==undefined)){
            cleanQ={type:'tf',statement:String(q.statement),options:['Certo','Errado'],correct:Math.max(0,Math.min(1,Number(q.correct)||0)),explanation:String(q.explanation||''),legalText:String(q.legalText||q.fundamentacao||''),fundamentacao:String(q.fundamentacao||'')};
          }else if(Array.isArray(q.options)){
            cleanQ={type:'mc',statement:String(q.statement),options:q.options.map(String),correct:Math.max(0,Math.min(3,Number(q.correct)||0)),explanation:String(q.explanation||''),legalText:String(q.legalText||q.fundamentacao||''),fundamentacao:String(q.fundamentacao||'')};
          }
          if(cleanQ){
            // _allCleanQ keeps the cache-shape (no course/subject) for the
            // final POST to /api/ai/cache + saveSharedSummary.
            _chainCache[key]._allCleanQ.push(cleanQ);
            // local-bank copy carries course+subject tags for filtering.
            _batchPreload.push(Object.assign({course:_courseName,subject:lesson,source:(cached&&cached._shared)?'ISA-shared':'ISA-PDF'},cleanQ));
          }
        }
      });
      addQBatch(_batchPreload);
      if(_chainCache[key].cachedQuestions.length){
        autoCreateFlashcards(_chainCache[key].cachedQuestions, lesson, U.lessonKey());
      }
      _chainCache[key].questions = _chainCache[key]._allCleanQ;
      console.info('[Meggy] partial cache hit (summary+questions, no mindmap) — preloaded '+_batchPreload.length+' questions, will generate only pílulas.');
    }

    // só extrai PDF se precisa gerar algo
    let allText='';
    const pdfTexts=[];
    const pdfErrors=[]; // ★ coleta erros por PDF para diagnóstico
    // ★ v87-FIX-MEGGY-MODULES BUG 6 (defense in depth): when multiple PDFs
    //    are passed in, prefer the one(s) whose filename matches the current
    //    lesson (realLessonName). This is the SECOND layer of defense after
    //    the gdi-core.js M9 panel filter — if items slip through here (e.g.
    //    from regenerate() or another caller), we still keep only the
    //    lesson-matching PDFs so Meggy doesn't mix content from 5 lessons.
    let itemsToRead = items;
    if(items && items.length > 1){
      let lessonName = '';
      try{ lessonName = (typeof U.realLessonName === 'function') ? (U.realLessonName('') || '') : ''; }catch(_){ lessonName=''; }
      if(lessonName){
        const _base = lessonName.toLowerCase().replace(/\.[a-z0-9]+$/i,'').trim();
        if(_base){
          const _matches = items.filter(it => it && it.name && it.name.toLowerCase().replace(/\.[a-z0-9]+$/i,'').includes(_base));
          if(_matches.length > 0){
            console.info('[Meggy] BUG6 layer-2 filter: keeping '+_matches.length+' of '+items.length+' PDFs matching lesson "'+lessonName+'"');
            itemsToRead = _matches;
          }
        }
      }
    }
    // ★ Sprint 6: paraleliza extração (era sequencial, demorava 4x mais)
    if(progressCb)progressCb({phase:'extract-start',total:itemsToRead.length});
    const extractPdfText = window.__gdiMeggy.pdf.extractPdfText; // late-bind
    const results=await Promise.allSettled(itemsToRead.map(async item=>{
      try{
        if(progressCb)progressCb({phase:'extract',pdf:item.name});
        const txt=await extractPdfText(item.url,(p)=>{
          if(progressCb)progressCb(Object.assign({pdf:item.name},p));
        });
        return {name:item.name,text:txt};
      }catch(e){
        throw {name:item.name,error:e.message||String(e),url:item.url};
      }
    }));
    results.forEach(r=>{
      if(r.status==='fulfilled'){
        const {name,text}=r.value;
        if(text&&text.trim().length>50){
          allText+=(allText?'\n\n---\n\n':'')+text;
          pdfTexts.push({name,text});
        }
      }else{
        const err=r.reason||{};
        pdfErrors.push({name:err.name||'PDF',error:err.error||'erro',url:err.url||''});
        console.warn('[Meggy] PDF falhou:',err.name,err.error);
      }
    });
    if(!allText||allText.trim().length<50){
      // ★ Mensagem detalhada com os erros de cada PDF
      let detail='Não foi possível extrair texto dos PDFs.';
      if(pdfErrors.length){
        detail+=' Erros por arquivo:\n';
        pdfErrors.forEach(e=>{
          detail+='• '+e.name+': '+e.error+'\n';
        });
        // sugestões baseadas no tipo de erro
        const hasHttp=pdfErrors.some(e=>/HTTP/.test(e.error));
        const hasScanned=pdfErrors.some(e=>/escaneado|sem texto/i.test(e.error));
        const hasPdfjs=pdfErrors.some(e=>/pdf\.js/.test(e.error));
        detail+='\nSugestões:\n';
        if(hasHttp)detail+='• Verifique se o PDF está acessível (sem proteção de link) e se você está logado.\n';
        if(hasScanned)detail+='• Alguns PDFs são escaneados (só imagens) — a Meggy não faz OCR ainda.\n';
        if(hasPdfjs)detail+='• O PDF pode estar corrompido ou criptografado.\n';
        if(!hasHttp&&!hasScanned&&!hasPdfjs)detail+='• Tente abrir o PDF no navegador para confirmar que carrega normalmente.\n';
      }
      throw new Error(detail);
    }
    _chainCache[key].allText=allText;
    _chainCache[key].pdfTexts=pdfTexts;

    // ★ PARALELISMO TOTAL: resumo + pílulas + questões de cada PDF — TODOS ao mesmo tempo
    // Cada tarefa recebe um keyHint diferente para distribuir entre as APIs NVIDIA

    const allTasks=[];

    // tarefa 1: resumo
    if(!_chainCache[key].summary){
      allTasks.push({
        // ★ Task FINAL / Fix 1d: prompt reformulado para resumo PROFUNDO e DETALHADO
        //   - mínimo 2000 caracteres (era ~500)
        //   - exige ## títulos + ### subtítulos + EXEMPLOS práticos + pegadinhas
        //   - seções ## Pegadinhas de Prova e ## Resumo Rápido ao final
        //   - usa até 40000 chars do material (era 20000)
        // ★ v87-FIX-MEGGY-MODULES BUG 5: raise summary prompt cap 40000 -> 150000.
        //    150K chars ≈ 37K tokens (PT ~4 chars/token), fits modern 128K-context LLMs.
        fn:()=>U.callIsaKeyed('Você é um professor especialista em concursos públicos. Leia TODO o material abaixo e crie um RESUMO PROFUNDO E DETALHADO em Markdown.\n\nREQUISITOS:\n- Mínimo 2000 caracteres (NÃO seja breve)\n- Estruture com ## títulos e ### subtítulos\n- Para CADA tópico: explique o conceito, dê EXEMPLOS práticos, e destaque pegadinhas de prova\n- Use **negrito** para palavras-chave e dispositivos legais\n- Use listas com marcadores para enumerações\n- Inclua uma seção ## Pegadinhas de Prova no final\n- Inclua uma seção ## Resumo Rápido com 5-10 bullets dos pontos mais importantes\n\nNÃO omita nenhum tema. Seja PROFUNDO, não conciso.\n\nMaterial:\n'+allText.slice(0,150000),0)
          .then(r=>{if(r&&r.trim()){_chainCache[key].summary=r;saveIsaSummary(lesson,r,_coursePath,_subject);}})
          .catch(e=>console.warn('[Meggy] resumo falhou',e.message))
      });
    }

    // tarefa 2: pílulas
    if(!_chainCache[key].mindmap){
      allTasks.push({

        // ★ v87-FIX-MEGGY-MODULES BUG 5: raise pílulas prompt cap 20000 -> 80000.
        fn:()=>U.callIsaKeyed('Crie "Pílulas" deste material — um resumo ultra-conciso em bullets. Apenas pontos-chave para revisão rápida. Máximo 15 bullets. Formato:\n# Pílulas\n- Ponto-chave 1\n- Ponto-chave 2\n...\n\nConteúdo:\n'+allText.slice(0,80000),0)
          .then(r=>{if(r&&r.trim())_chainCache[key].mindmap=r;})
          .catch(e=>console.warn('[Meggy] pílulas falhou',e.message))
      });
    }

    // tarefa 3+: questões de cada PDF (uma tarefa por PDF)
    if(!_chainCache[key].questionsGenerated){
      _chainCache[key].questionsGenerated=true;
      _chainCache[key]._allCleanQ=[];
      // ★ PATCH B: extrai questões existentes em batch (1 read + 1 write)
      const _batchExtract=[];
      const extractQuestionsFromText = window.__gdiMeggy.questions.extractQuestionsFromText; // late-bind
      for(const pdf of pdfTexts){
        const existing=extractQuestionsFromText(pdf.text);
        for(const q of existing){
          _batchExtract.push({course:_courseName,subject:lesson,type:'open',statement:q,options:[],correct:0,explanation:'Questão extraída do material.',source:'PDF-extract'});
        }
      }
      addQBatch(_batchExtract);
      // uma tarefa por PDF
      pdfTexts.forEach((pdf)=>{
        allTasks.push({

          // ★ v87-FIX-MEGGY-MODULES BUG 5: raise questions prompt cap 15000 -> 60000.
          fn:()=>U.callIsaKeyed('Você é um examinador de concurso público brasileiro experiente. Baseado neste material, gere 10 questões de concurso em JSON array. Misture:\n- 6 múltipla escolha: {"type":"mc","statement":"...","options":["a","b","c","d"],"correct":0,"legalText":"...","explanation":"...","fundamentacao":"..."}\n- 4 certo/errado (CEBRASPE): {"type":"tf","statement":"...","correct":1,"legalText":"...","explanation":"...","fundamentacao":"..."}\n\nCAMPOS:\n- statement: enunciado claro, contexto completo\n- legalText: o dispositivo legal/dispositivo normativo aplicável (ex: "art. 5º, CF"; "Súmula Vinculante 14"; "Lei 8.906/94, art. 7º")\n- explanation: explicação técnica do acerto/erro (regra violada ou aplicada)\n- fundamentacao: fundamentação didática completa, explicando por que a alternativa correta está correta E por que as outras estão erradas\n\nSem comentários, só JSON.\n\n'+pdf.text.slice(0,60000),0)
            .then(resp=>{
              if(!resp)return;
              try{
                const arr=U.parseJsonArray(resp);
                // ★ PATCH B: inserir questões em batch (1 read + 1 write)
                const _batchAI=[];
                arr.forEach(q=>{
                  if(!q||!q.statement)return;
                  let cleanQ;
                  if(q.type==='tf'||(!q.options&&q.correct!==undefined)){
                    cleanQ={type:'tf',statement:String(q.statement),options:['Certo','Errado'],correct:Math.max(0,Math.min(1,Number(q.correct)||0)),explanation:String(q.explanation||''),legalText:String(q.legalText||q.fundamentacao||''),fundamentacao:String(q.fundamentacao||'')};
                  }else if(Array.isArray(q.options)){
                    cleanQ={type:'mc',statement:String(q.statement),options:q.options.map(String),correct:Math.max(0,Math.min(3,Number(q.correct)||0)),explanation:String(q.explanation||''),legalText:String(q.legalText||q.fundamentacao||''),fundamentacao:String(q.fundamentacao||'')};
                  }
                  if(cleanQ){
                    _batchAI.push(Object.assign({course:_courseName,subject:lesson,source:'ISA-PDF'},cleanQ));
                    _chainCache[key]._allCleanQ.push(cleanQ);
                  }
                });
                addQBatch(_batchAI);
              }catch(e){console.warn('[Meggy] parse questões falhou',e.message);}
            })
            .catch(e=>console.warn('[Meggy] questões falharam',e.message))
        });
      });
    }

    // ★ EXECUTA TODAS AS TAREFAS AO MESMO TEMPO (paralelismo)
    // Se OpenRouter estiver configurado no worker, cada callIsa automaticamente
    // dispara 3 modelos free em paralelo (race) — primeiro a responder vence.
    // Isso significa que resumo+pílulas+questões(N PDFs) = 2+N tarefas × 3 modelos = race máximo.
    if(allTasks.length>0){
      await Promise.allSettled(allTasks.map(t=>t.fn()));
    }

    // finaliza: flashcards + salva no Drive
    _chainCache[key].questions=_chainCache[key]._allCleanQ||[];
    if(_chainCache[key].questions.length){
      autoCreateFlashcards(_chainCache[key].questions,lesson,U.lessonKey());
    }

    // ★ MIGRATE-02-MEGGY-INDICE: save step changed — now writes 3 files to
    //    the lesson folder (resumo_meggy.md / questoes_meggy.json / mapa_meggy.md)
    //    + updates indice.json, via cacheSave(). Replaces the old single
    //    POST /api/ai/cache (isa_cache.json). The pipeline (extract →
    //    generate summary/pílulas/questões in parallel) is unchanged.
    try{
      await cacheSave(
        _chainCache[key].summary   || null,
        _chainCache[key].questions || null,
        lesson,
        _chainCache[key].mindmap   || null
      );
    }catch(_){ /* não bloqueia o fluxo se o cache falhar */ }
    // compartilha no pool de resumos
    if(_chainCache[key].summary){
      // late-bind to summaries module
      if(window.__gdiMeggy.summaries && window.__gdiMeggy.summaries.saveSharedSummary){
        window.__gdiMeggy.summaries.saveSharedSummary(lesson,_chainCache[key].summary,_chainCache[key].questions||null);
      }
    }

    return _chainCache[key];
      } finally {
        delete _inflight[key];
      }
    })();
    return _inflight[key];
  }

  // ── Regenerate: força regeração de tudo (limpa cache em memória + Drive) ──
  async function regenerate(items,bodyEl,lessonName){
    if(!items||!items.length){U.setError(bodyEl,'Nenhum PDF disponível.');return;}
    const lesson=U.realLessonName(lessonName||items[0].name);
    const key=U.lessonKey();
    // ★ v80-FIX-MEGGY BUG 8: wait for any in-flight generateAll before
    //    clearing _chainCache. Otherwise the in-flight .then() writes its
    //    results into the NEW (empty) _chainCache, repopulating it and
    //    defeating the regenerate.
    if(_inflight && _inflight[key]){
      try { await _inflight[key]; } catch(_){}
    }
    // limpa cache em memória
    // ★ v1.0.84: only wipe current key, not all lessons (preserves in-flight generateAll for other lessons)
    if(key) delete _chainCache[key];
    // limpa cache do Drive (★FIX: também limpa mindmap, antes ficava preso)
    try{
      await fetch('/api/ai/cache',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({key,summary:null,questions:null,mindmap:null,lessonName:lesson})});
    }catch(_){}
    // regenera tudo em cadeia — late-bind to summaries module
    if(window.__gdiMeggy.summaries && window.__gdiMeggy.summaries.summary){
      await window.__gdiMeggy.summaries.summary(items,bodyEl,lessonName);
    }
  }

  // ── Namespace exports ──
  window.__gdiMeggy.cache = {
    generateAll, regenerate,
    cacheGet, cacheGetRobust, cacheSave,
    addQ, addQBatch, questionsByCourse,
    saveIsaSummary, listIsaSummaries, delIsaSummary,
    downloadAsPdf, copySummary,
    autoCreateFlashcards,
    // Expose shared state for diagnostics / future modules
    _chainCache, _inflight, _qWriteChain,
    // ★ MIGRATE-02-MEGGY-INDICE: expose indice.json + lesson-folder helpers
    // so meggy-summaries.js renderResumos can reuse them (single source of
    // truth for the indice API + lesson-folder file reads).
    lessonFolderPath, indiceGet, indiceSet, readLessonFile
  };

  // ── Aliases para compatibilidade (gdiIsaPdf.* assemblado em meggy-summaries.js) ──
  // Os métodos saveIsaSummary/listIsaSummaries/delIsaSummary/downloadAsPdf são
  // expostos no gdiIsaPdf por meggy-summaries.js via Object.assign.

  console.log('[GDI Extras] meggy-cache ativo (Module 3/7)');
})();
