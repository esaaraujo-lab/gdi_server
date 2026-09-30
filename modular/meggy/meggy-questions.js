// ═══════════════════════════════════════════════════════════════
// meggy-questions.js — quiz flow + question bank helpers
//
// Module 4 of 7 (modular/meggy/).
// Sourced from gdi-meggy.js M9-ISA IIFE (lines 925-936, 1204-1422).
//
// Exposes:
//   • window.__gdiMeggy.questions = { questions, generateQuestions,
//     startQuizFromBank, runQuizSession, extractQuestionsFromText,
//     getAnsweredIds, markAnswered, saveQuestionsToDisciplineFolder,
//     loadQuestionsFromDisciplineFolder }
//   • window.__gdiPdfCursor  (legacy round-robin cursor)
//
// Guard: window.__gdiMeggyQuestions
// Depends on: utils (setLoading, setError, realLessonName, callIsa,
//   parseJsonArray, lsGet, esc), pdf-engine (extractPdfText),
//   cache (generateAll, cacheGet, cacheSave, addQBatch)
// ═══════════════════════════════════════════════════════════════
(function(){
  if(window.__gdiMeggyQuestions)return;

  window.__gdiMeggy = window.__gdiMeggy || {};

  // ── Late-bound namespace shortcuts ──
  // ★ H-35 (Task P12-6): null-guard window.__gdiMeggy.utils BEFORE setting
  //   the IIFE guard. Mirrors the meggy-flashcards.js pattern (Task 20-7
  //   #15 / EXEC-6). If utils failed to load (CDN outage, eval error, wrong
  //   script-tag order), `U` is undefined and `U.CONSTS` throws TypeError,
  //   crashing the entire IIFE AFTER the guard had been set — blocking
  //   retry on a later loader pass. Bail WITHOUT setting the guard when
  //   utils is missing so the loader gets another shot at calling this
  //   IIFE; once utils loads, the guard is set and the module inits
  //   normally. Strictly safer than the prior pattern in the normal case
  //   (one extra typeof check, behaviour identical when utils is loaded).
  const U = window.__gdiMeggy.utils;
  if(!U || !U.CONSTS){
    console.error('[Meggy] meggy-utils not loaded — aborting questions init (will retry on next loader pass)');
    return;
  }
  window.__gdiMeggyQuestions=true;
  const LQ = U.CONSTS.LQ;
  const ANSWERED_KEY = U.CONSTS.ANSWERED_KEY;

  // ★ H-33 (Task P12-6): prefer the centralized window.gdiEsc when available;
  //   fall back to U.esc (meggy-utils.js — same 5-entity set incl. &#39;)
  //   for module-load-order edge cases. Late-bound so a future stricter
  //   gdiEsc (e.g. DOMPurify-based) is picked up automatically. The helper
  //   text below uses `U.esc)` (closing paren) so the MultiEdit replace_all
  //   of `esc(` does not recurse into this definition.
  function esc(s){ return (window.gdiEsc || U.esc)(s); }

  // Extrai questões que já existem dentro do PDF (lista de exercícios)
  function extractQuestionsFromText(text){
    const questions=[];
    // padrão: "1." ou "1)" seguido de texto até "?"
    const re=/(\d+[\).]\s+)([^?]+\?)/gi;
    let m;
    while((m=re.exec(text))!==null&&questions.length<20){
      const q=m[2].trim();
      if(q.length>20&&q.length<500)questions.push(q);
    }
    return questions;
  }

  // ── Track answered questions (evita repetir) ──
  function getAnsweredIds(){try{return JSON.parse(localStorage.getItem(ANSWERED_KEY)||'[]')}catch(e){console.warn('[Meggy Q] getAnsweredIds JSON.parse failed:', e&&e.message||e); return []}}
  function markAnswered(id){const arr=getAnsweredIds();if(!arr.includes(id)){arr.push(id);if(arr.length>500)arr.shift();try{localStorage.setItem(ANSWERED_KEY,JSON.stringify(arr))}catch(e){console.warn('[Meggy Q] markAnswered localStorage.setItem failed:', e&&e.message||e)}}}

  // ═══════════════════════════════════════════════════════════════
  // ★ TASK 7 (Scanner Distribuído) — folder-first save/load helpers
  // for the question bank. Same pattern as meggy-summaries.js: try
  // the discipline folder FIRST (Section 9.2 of the spec), fall back
  // to the legacy centralized cache on any failure.
  //
  // The "discipline folder" is the parent folder of the lesson file
  // (e.g. "/11:/TJ SP Escrevente/Módulo 1/Português/" for a lesson at
  // "/11:/TJ SP Escrevente/Módulo 1/Português/Aula 1.pdf").
  //
  // Worker endpoints (Agent 1):
  //   POST /api/materials/save-in-folder
  //        body: { lessonPath:<disciplinePath>, materialType:'questoes',
  //                fileName:"<username>_<discipline>.json", content:<json> }
  //   GET  /api/materials/load-from-folder?lessonPath=<disciplinePath>
  //        &materialType=questoes&fileName=<username>_<discipline>.json
  // ═══════════════════════════════════════════════════════════════

  // Best-effort: derive the discipline folder path from the current URL.
  // Returns "" when not on a lesson page or when the URL is too shallow.
  function _deriveDisciplinePath(){
    try{
      const p = window.location.pathname || '';
      if(!/^\/\d+:\//.test(p)) return '';
      const seg = p.split('/').filter(Boolean);
      if(seg.length < 3) return ''; // need at least driveIdx:/courseName/discipline/
      // Drop the last segment (the lesson file); the rest is the discipline path.
      return '/' + seg.slice(0, -1).join('/') + '/';
    }catch(e){ console.warn('[Meggy Q] _deriveDisciplinePath failed:', e&&e.message||e); return ''; }
  }

  // Best-effort: course name = segment 1 after driveIdx (e.g. "TJ SP Escrevente").
  function _deriveCourseName(){
    try{
      const seg = (window.location.pathname || '').split('/').filter(Boolean);
      if(seg.length >= 2) return decodeURIComponent(seg[1]);
    }catch(e){console.warn('[Meggy Q] _deriveCourseName failed:', e&&e.message||e)}
    return '';
  }

  // Best-effort: discipline name = second-to-last segment (the folder
  // containing the lesson file, e.g. "Português").
  // ★ FIX-MEGGY #17 (Agent 13 Bug 13-2): align segment-count requirement with
  //   _deriveDisciplinePath (>= 3) — previously required >= 4, which meant
  //   _deriveDisciplinePath() returned a non-empty path on shallow URLs
  //   (driveIdx:/course/lesson.pdf) while _deriveDisciplineName() returned ''
  //   for the same URL — callers got inconsistent results.
  function _deriveDisciplineName(){
    try{
      const seg = (window.location.pathname || '').split('/').filter(Boolean);
      if(seg.length >= 3) return decodeURIComponent(seg[seg.length - 2]);
    }catch(e){console.warn('[Meggy Q] _deriveDisciplineName failed:', e&&e.message||e)}
    return '';
  }

  // Best-effort: current username (mirror of meggy-summaries.js helper).
  function _currentUsername(){
    try{
      const u = window.__gdiUser || window.gdiUser;
      if(u && (u.name || u.username || u.email)){
        return String(u.name || u.username || u.email).split('@')[0];
      }
      const raw = window.localStorage && window.localStorage.getItem('gdi-user');
      if(raw){
        const j = JSON.parse(raw);
        if(j && (j.name || j.username || j.email)){
          return String(j.name || j.username || j.email).split('@')[0];
        }
      }
    }catch(e){console.warn('[Meggy Q] _currentUsername failed:', e&&e.message||e)}
    return 'meggy';
  }

  // Sanitize a string into a safe Drive file-name fragment.
  function _safeFileFragment(s){
    return String(s||'').replace(/[/\\?%*:|"<>]/g, '_').trim().slice(0, 120) || 'aula';
  }

  // Save question bank JSON to the discipline folder via new worker endpoint.
  // `questions` is an array of question objects (will be JSON-stringified
  // together with courseName, disciplineName, and a generatedAt timestamp).
  // Returns {ok:true, mode:'folder', file:"..."} or {ok:false, reason:"..."}.
  async function saveQuestionsToDisciplineFolder(disciplinePath, courseName, disciplineName, questions, username){
    if(!disciplinePath || !Array.isArray(questions)) return {ok:false, reason:'invalid'};
    try{
      const content = JSON.stringify({
        courseName: String(courseName||''),
        disciplineName: String(disciplineName||''),
        questions: questions,
        generatedAt: Date.now()
      });
      const r = await fetch('/api/materials/save-in-folder', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          // ★ overload: discipline's parent folder — the worker treats
          // this path as the folder where the material should land.
          lessonPath: disciplinePath,
          materialType: 'questoes',
          fileName: `${_safeFileFragment(username||_currentUsername())}_${_safeFileFragment(disciplineName||'disciplina')}.json`,
          content
        })
      });
      if(!r.ok) return {ok:false, reason:'http_'+r.status};
      const d = await r.json();
      if(d && d.ok) return {ok:true, mode:'folder', file:d.file||null};
      return {ok:false, reason:(d && d.error) || 'unknown'};
    }catch(e){
      return {ok:false, reason:'network', error:e && e.message || String(e)};
    }
  }

  // Load question bank JSON from the discipline folder via new worker endpoint.
  // Returns {ok:true, questions:[...]} or {ok:false, reason:"not_found"|...}.
  async function loadQuestionsFromDisciplineFolder(disciplinePath, courseName, disciplineName, username){
    if(!disciplinePath) return {ok:false, reason:'invalid'};
    try{
      const fileName = `${_safeFileFragment(username||_currentUsername())}_${_safeFileFragment(disciplineName||'disciplina')}.json`;
      const url = '/api/materials/load-from-folder'
        + '?lessonPath=' + encodeURIComponent(disciplinePath)
        + '&materialType=' + encodeURIComponent('questoes')
        + '&fileName=' + encodeURIComponent(fileName);
      const r = await fetch(url, {cache:'no-store'});
      if(!r.ok){
        return {ok:false, reason: r.status===404 ? 'not_found' : ('http_'+r.status)};
      }
      const d = await r.json();
      if(d && d.ok){
        // Worker may return either {content:"<json string>"} or {questions:[...]}.
        let qs = [];
        if(Array.isArray(d.questions)) qs = d.questions;
        else if(typeof d.content === 'string'){
          try{
            const parsed = JSON.parse(d.content);
            qs = Array.isArray(parsed.questions) ? parsed.questions : (Array.isArray(parsed) ? parsed : []);
          }catch(e){ console.warn('[Meggy Q] loadQuestionsFromDisciplineFolder content JSON.parse failed:', e&&e.message||e); qs = []; }
        }else if(Array.isArray(d.content)) qs = d.content;
        return {ok:true, questions: qs, file:d.file||null};
      }
      return {ok:false, reason:(d && d.reason) || (d && d.error) || 'unknown'};
    }catch(e){
      // ★ Fix 17 (Task 20-8): log so failures aren't completely silent —
      //   the caller (questions() folder-first load) treats this as
      //   best-effort and falls back to the legacy cache, so without a
      //   console.warn here a misconfigured discipline folder or a network
      //   blip would be invisible in dev tools.
      console.warn('[Meggy] loadQuestionsFromDisciplineFolder failed:', e && e.message || e);
      return {ok:false, reason:'network', error:e && e.message || String(e)};
    }
  }

  // Normalize a raw question object (as stored in the JSON bank) into the
  // shape used by the local question bank (LS key LQ). Returns null if invalid.
  function _normalizeQuestion(q, lesson, source){
    if(!q || !q.statement) return null;
    if(q.type === 'tf' || (!q.options && q.correct !== undefined)){
      return {
        subject: lesson,
        type: 'tf',
        statement: String(q.statement),
        options: ['Certo','Errado'],
        correct: Math.max(0, Math.min(1, Number(q.correct)||0)),
        explanation: String(q.explanation||''),
        legalText: String(q.legalText||q.fundamentacao||''),
        fundamentacao: String(q.fundamentacao||''),
        source: source || 'ISA-folder'
      };
    }
    if(Array.isArray(q.options)){
      return {
        subject: lesson,
        type: 'mc',
        statement: String(q.statement),
        options: q.options.map(String),
        correct: Math.max(0, Math.min((q.options.length||4)-1, Number(q.correct)||0)),
        explanation: String(q.explanation||''),
        legalText: String(q.legalText||q.fundamentacao||''),
        fundamentacao: String(q.fundamentacao||''),
        source: source || 'ISA-folder'
      };
    }
    return null;
  }

  // ── Questions flow: gera tudo em cadeia + abre quiz ──
  // ★ Fix 14 (Task 20-8): spinner-aware loading helper. The previous code
  //   called U.setLoading(bodyEl, text) which renders only text — during the
  //   5-15s AI generation window the user saw a static message and assumed
  //   the page was frozen. This helper renders the same Ferreto-themed
  //   spinner used elsewhere (e.g. renderResumos) alongside the status text.
  function _setLoadingWithSpinner(bodyEl, text){
    try {
      bodyEl.innerHTML = '<div class="gdi-empty-state" style="padding:40px 20px;text-align:center;">'
        + '<div class="gdi-spinner" style="margin:0 auto 12px;width:32px;height:32px;'
          + 'border:3px solid var(--ferreto-surface-3,rgba(255,255,255,.08));'
          + 'border-top-color:var(--ferreto-primary,#ff8b9f);'
          + 'border-radius:50%;animation:gdi-scan-spin 1s linear infinite;"></div>'
        + '<p style="color:var(--ferreto-text-muted,#8b949e);font-size:13px;margin:0;">'
          + esc(text) + '</p>'
        + '</div>';
    } catch(e) {
      console.warn('[Meggy Q] _setLoadingWithSpinner HTML construction failed:', e&&e.message||e);
      // Fall back to the text-only loader if our HTML construction fails.
      try { U.setLoading(bodyEl, text); } catch(e2){console.warn('[Meggy Q] _setLoadingWithSpinner fallback setLoading failed:', e2&&e2.message||e2)}
    }
  }

  async function questions(items,bodyEl,lessonName){
    if(!items||!items.length){U.setError(bodyEl,'Nenhum PDF disponível.');return;}
    const lesson=U.realLessonName(lessonName||items[0].name);
    bodyEl.__items=items;bodyEl.__lesson=lesson;
    _setLoadingWithSpinner(bodyEl,'Meggy está lendo todos os materiais e criando resumo + pílulas + questões…');

    // ★ TASK 7 (Scanner Distribuído — Section 9.2): folder-first load.
    //   Before any regeneration, try to load a shared question bank from
    //   the discipline folder. If another student already generated
    //   questions for this discipline, populate the local bank with them
    //   so the student can start the quiz immediately. Best-effort —
    //   any failure (endpoint missing, network, drive read-only) is
    //   silent and the flow continues with the legacy cache + generation.
    try{
      const disciplinePath = _deriveDisciplinePath();
      if(disciplinePath){
        const folderRes = await loadQuestionsFromDisciplineFolder(
          disciplinePath,
          _deriveCourseName(),
          _deriveDisciplineName() || lesson,
          _currentUsername()
        );
        if(folderRes.ok && Array.isArray(folderRes.questions) && folderRes.questions.length){
          const _batchFolder = folderRes.questions
            .map(q => _normalizeQuestion(q, lesson, 'ISA-folder'))
            .filter(Boolean);
          if(_batchFolder.length){
            window.__gdiMeggy.cache.addQBatch(_batchFolder);
            console.info('[Meggy] folder-first load: '+_batchFolder.length+' questions loaded from discipline folder');
          }
        }
      }
    }catch(e){console.warn('[Meggy Q] folder-first load failed (best-effort, non-blocking):', e&&e.message||e)}

    try{
      await window.__gdiMeggy.cache.generateAll(items,lesson,'questions',(p)=>{
        if(p.phase==='extract')_setLoadingWithSpinner(bodyEl,'Extraindo texto: '+(p.pdf||'material')+'…');
        else if(p.phase==='ocr-init')_setLoadingWithSpinner(bodyEl,'PDF escaneado detectado — iniciando OCR (pode levar alguns minutos)…');
        else if(p.phase==='ocr-page')_setLoadingWithSpinner(bodyEl,'OCR em andamento — página '+p.page+' de '+p.total+(p.progress?(' ('+Math.round(p.progress*100)+'%)'):'')+'…');
        else if(p.phase==='ocr-done')_setLoadingWithSpinner(bodyEl,'OCR concluído ('+p.chars+' caracteres). Gerando questões…');
      });
    }catch(e){U.setError(bodyEl,e.message);return;}
    // carrega questões do cache se existirem (★ PATCH B: batch insert)
    // ★ FIX 20-14 #B (Agent 14): cacheGet now throws on network/server errors
    //   (Task 20-7 #2). Previously it returned null on ALL errors, so the old
    //   `const cached=await cacheGet()` was safe. Now we must wrap in try/catch
    //   so a transient cache outage doesn't reject the entire questions()
    //   call (which would surface as an unhandled rejection in the tab-click
    //   handler). On error, fall through with cached=null — the quiz still
    //   starts with whatever was loaded via addQBatch above.
    let cached=null;
    try{
      cached=await window.__gdiMeggy.cache.cacheGet();
    }catch(e){
      console.warn('[Meggy] questions() cacheGet failed (non-blocking):', e&&e.message||e);
    }
    if(cached&&cached.questions&&Array.isArray(cached.questions)&&cached.questions.length){
      const _batch=[];
      cached.questions.forEach(q=>{
        if(q&&q.statement){
          let cleanQ;
          if(q.type==='tf'||(!q.options&&q.correct!==undefined)){
            cleanQ={subject:lesson,type:'tf',statement:String(q.statement),options:['Certo','Errado'],correct:Math.max(0,Math.min(1,Number(q.correct)||0)),explanation:String(q.explanation||''),source:'ISA-PDF'};
          }else if(Array.isArray(q.options)){
            cleanQ={subject:lesson,type:'mc',statement:String(q.statement),options:q.options.map(String),correct:Math.max(0,Math.min((q.options.length||4)-1,Number(q.correct)||0)),explanation:String(q.explanation||''),source:'ISA-PDF'};
          }
          if(cleanQ)_batch.push(cleanQ);
        }
      });
      window.__gdiMeggy.cache.addQBatch(_batch);

      // ★ TASK 7: persist the freshly loaded/merged bank back to the
      //   discipline folder so other students can reuse it (fire-and-
      //   forget; failure is silent and does not break the quiz).
      try{
        const disciplinePath = _deriveDisciplinePath();
        if(disciplinePath && _batch.length){
          saveQuestionsToDisciplineFolder(
            disciplinePath,
            _deriveCourseName(),
            _deriveDisciplineName() || lesson,
            cached.questions,
            _currentUsername()
          ).catch(e=>console.warn('[Meggy] saveQuestionsToDisciplineFolder (cached bank) failed:', e && e.message || e));
        }
      }catch(e){console.warn('[Meggy Q] saveQuestionsToDisciplineFolder (cached bank) sync failed (best-effort):', e&&e.message||e)}
    }
    // ★ CYCLE-10 (Agent 10): bail if the user closed the M9 panel during the
    //   long generateAll() await (10-30s) — startQuizFromBank would otherwise
    //   render the quiz into a detached bodyEl (wasted work + the quiz button
    //   wiring would silently no-op). Mirrors the isConnected guard added to
    //   renderResumos() in meggy-summaries.js for the same async-after-await
    //   pattern.
    if(!bodyEl || !bodyEl.isConnected) return;
    startQuizFromBank(bodyEl,lesson);
  }

  // ── generateQuestions: gera mais questões de um PDF específico (para "Gerar mais 5") ──
  if(!window.__gdiPdfCursor)window.__gdiPdfCursor=0;
  // ★ Fix 13 (Task 20-8): track the lesson the cursor was advanced for.
  //   When the user switches to a different lesson (via the materials tab),
  //   reset the cursor to 0 so question generation restarts from the first
  //   PDF instead of resuming at a stale offset from the previous lesson.
  let _gdiPdfCursorLesson = null;

  // ★ H-24 (Task P12-6): differentiated callIsa wrapper. meggy-utils.js
  //   (FIX-MEGGY #19 + H-24) returns {ok:false, status, reason} on HTTP /
  //   network failures instead of throwing — only HTTP 200 with
  //   data.ok===false throws. Callers expected a thrown Error with .message
  //   (the original generateQuestions catch surfaces e.message to the UI).
  //   This helper normalizes both failure modes into a thrown Error with a
  //   PT-BR message tailored to the reason code, so the user sees actionable
  //   feedback instead of "Meggy indisponível: [object Object]".
  //   reason codes (mirrors meggy-utils.js callIsa switch):
  //     auth(401)    — session expired → caller redirects/reloads
  //     rate(429)    — rate limit → caller backs off
  //     server(5xx)  — server error → caller may retry
  //     network(0)   — fetch failed → caller checks connectivity
  //     http(other)  — other non-OK HTTP status
  function _callIsaChecked(prompt){
    return U.callIsa(prompt).then(function(resp){
      if(typeof resp === 'string') return resp; // success — plain text response
      // resp is {ok:false, status, reason} from callIsa's non-throw path.
      var r = resp && resp.reason;
      var msg;
      if(r === 'auth')         msg = 'Sessão expirada — recarregue a página e tente novamente.';
      else if(r === 'rate')    msg = 'Limite de requisições atingido — aguarde ~30s e tente novamente.';
      else if(r === 'server')  msg = 'Servidor Meggy indisponível (HTTP '+(resp&&resp.status||'?')+') — tente novamente.';
      else if(r === 'network') msg = 'Falha de rede — verifique sua conexão e tente novamente.';
      else                     msg = 'Meggy indisponível (HTTP '+(resp&&resp.status||'?')+').';
      var err = new Error(msg);
      err.reason = r;
      err.status = resp && resp.status;
      throw err;
    });
  }

  async function generateQuestions(items,bodyEl,lesson){
    if(!items||!items.length)return false;
    // ★ Fix 13: reset cursor on lesson change.
    if(_gdiPdfCursorLesson !== lesson){
      _gdiPdfCursorLesson = lesson;
      window.__gdiPdfCursor = 0;
    }
    const pdfIdx=window.__gdiPdfCursor%items.length;
    window.__gdiPdfCursor++;
    const pdfItem=items[pdfIdx];
    // ★ FIX 20-14 #A (Agent 14): use spinner-aware loader here too — Fix 14
    //   (Task 20-8) only covered questions() but NOT generateQuestions()
    //   (the "Gerar mais 5 questões" flow). Both flows have 5-15s AI
    //   generation windows where a static text message looks like a frozen
    //   page. Now consistent with questions().
    _setLoadingWithSpinner(bodyEl,'Extraindo texto do PDF: '+esc(pdfItem.name||'material')+'…');
    let text;
    const extractPdfText = window.__gdiMeggy.pdf.extractPdfText; // late-bind
    try{
      text=await extractPdfText(pdfItem.url);
    }catch(e){
      for(let i=1;i<items.length;i++){
        const next=items[(pdfIdx+i)%items.length];
        try{
          text=await extractPdfText(next.url);
          if(text&&text.trim().length>=50)break;
        }catch(e){console.warn('[Meggy Q] extractPdfText retry failed:', e&&e.message||e)}
      }
      if(!text||text.trim().length<50){U.setError(bodyEl,'Falha ao extrair texto.');return false;}
    }
    if(!text||text.trim().length<50){U.setError(bodyEl,'PDF sem texto extraível.');return false;}
    // ★ FIX 20-14 #A (cont.): spinner during AI generation.
    _setLoadingWithSpinner(bodyEl,'Meggy está criando questões…');
    let resp;
    try{
      // ★ H-24 (Task P12-6): use _callIsaChecked wrapper so HTTP/network
      //   failures (which callIsa now returns as {ok:false,status,reason}
      //   instead of throwing — see meggy-utils.js FIX-MEGGY #19 + H-24) are
      //   normalized into a thrown Error with a PT-BR message tailored to
      //   the reason code (auth/rate/server/network). The previous direct
      //   `await U.callIsa(...)` would silently return the {ok:false,...}
      //   object on 401/429/5xx, then `U.parseJsonArray(resp)` would fail
      //   with a confusing 'Resposta não é JSON array válido' message.
      resp=await _callIsaChecked('Baseado neste material, gere 5 questões de concurso público em JSON array. Misture:\n- 3 múltipla escolha: {"type":"mc","statement":"...","options":["a","b","c","d"],"correct":0,"explanation":"..."}\n- 2 certo/errado (CEBRASPE): {"type":"tf","statement":"...","correct":1,"explanation":"..."}\nSem comentários, só JSON:\n\n'+text.slice(0,15000));
    }catch(e){U.setError(bodyEl,'Meggy indisponível: '+e.message);return false;}
    let arr;
    try{arr=U.parseJsonArray(resp);}catch(e){U.setError(bodyEl,'Meggy retornou formato inválido: '+e.message);return false;}
    // ★ PATCH B: batch insert (1 read + 1 write)
    const _batchGen=[];
    const cleanArr=[];
    arr.forEach(q=>{
      if(!q||!q.statement)return;
      let cleanQ;
      if(q.type==='tf'||(!q.options&&q.correct!==undefined)){
        cleanQ={subject:lesson,type:'tf',statement:String(q.statement),options:['Certo','Errado'],correct:Math.max(0,Math.min(1,Number(q.correct)||0)),explanation:String(q.explanation||''),source:'ISA-PDF'};
      }else if(Array.isArray(q.options)){
        cleanQ={subject:lesson,type:'mc',statement:String(q.statement),options:q.options.map(String),correct:Math.max(0,Math.min((q.options.length||4)-1,Number(q.correct)||0)),explanation:String(q.explanation||''),source:'ISA-PDF'};
      }
      if(cleanQ){
        _batchGen.push(cleanQ);
        cleanArr.push({type:cleanQ.type,statement:cleanQ.statement,options:cleanQ.options,correct:cleanQ.correct,explanation:cleanQ.explanation});
      }
    });
    window.__gdiMeggy.cache.addQBatch(_batchGen);
    if(cleanArr.length){
      // ★ FIX 20-14 #B (cont.): same try/catch guard for cacheGet in
      //   generateQuestions(). The caller (#gdi-q-gen-more onclick) doesn't
      //   catch rejections, so an unhandled cacheGet throw would surface as a
      //   console error. Fall through with existing=null on error.
      let existing=null;
      try{
        existing=await window.__gdiMeggy.cache.cacheGet();
      }catch(e){
        console.warn('[Meggy] generateQuestions() cacheGet failed (non-blocking):', e&&e.message||e);
      }
      const merged=[...((existing&&existing.questions)||[]),...cleanArr];
      // ★ FIX 20-14 #B (cont.): pass existing.mindmap explicitly so cacheSave
      //   doesn't need to re-call cacheGet internally (which would throw the
      //   same network error and skip the save entirely, losing the merged
      //   bank to the Drive cache).
      window.__gdiMeggy.cache.cacheSave(existing?.summary||null,merged,lesson,existing?.mindmap);

      // ★ TASK 7 (Scanner Distribuído — Section 9.2): persist the merged
      //   bank to the discipline folder so other students can reuse it
      //   (fire-and-forget; failure is silent and does not break the
      //   quiz). Falls back gracefully if the endpoint is not yet
      //   deployed or the drive is read-only.
      try{
        const disciplinePath = _deriveDisciplinePath();
        if(disciplinePath){
          saveQuestionsToDisciplineFolder(
            disciplinePath,
            _deriveCourseName(),
            _deriveDisciplineName() || lesson,
            merged,
            _currentUsername()
          ).catch(e=>console.warn('[Meggy] saveQuestionsToDisciplineFolder (generated bank) failed:', e && e.message || e));
        }
      }catch(e){console.warn('[Meggy Q] saveQuestionsToDisciplineFolder (generated bank) sync failed (best-effort):', e&&e.message||e)}
    }
    // ★ FIX-MEGGY #16 (Agent 6): guard showToast — module loads before
    //   gdi-ui.js defines window.showToast on some pages, which would throw
    //   ReferenceError here.
    if(window.showToast) showToast(cleanArr.length+' questões geradas!');
    return cleanArr.length>0;
  }

  // ── Inicia quiz com questões do banco (não respondidas) ──
  function startQuizFromBank(bodyEl,lesson){
    // ★ CYCLE-10 (Agent 10): bail if the M9 panel was closed before this
    //   synchronous render started (covers both the questions() tail call
    //   and the recursive self-call after generateQuestions). Without this,
    //   the bodyEl.innerHTML writes below would target a detached node.
    if(!bodyEl || !bodyEl.isConnected) return;
    const all=U.lsGet(LQ,[]);
    const answered=getAnsweredIds();
    // ★ FIX-MEGGY #18 (Agent 11 PERF-6): O(N×M) answered.includes(q.id) in
    //   .filter() — build a Set once for O(1) lookup. With 500 answered IDs
    //   and 200 questions this was 100k comparisons; now ~700.
    const answeredSet = new Set(answered);
    // ★ CYCLE-10 (Agent 10): pre-index bank by subject (single O(N) pass).
    //   Previously this block ran `all.filter(q=>q.subject===lesson)` up to
    //   THREE times (once for `pending`, again for the reset branch, again
    //   for `lessonQIds` Set construction). Now we scan `all` once to build
    //   `lessonQs`, then derive both `pending` (filter on answeredSet) and
    //   `lessonQIds` (map to Set) from it. With N=200 questions this trims
    //   ~400 extra comparisons per call; semantics identical (same subject
    //   match, same Set membership test).
    const lessonQs = all.filter(q=>q.subject===lesson);
    // questões desta matéria que ainda não foram respondidas
    let pending = lessonQs.filter(q=>!answeredSet.has(q.id));
    // se não tem nenhuma não-respondida, pega todas desta matéria (reinicia ciclo)
    if(pending.length===0){
      pending = lessonQs;
      // limpa answered para esta matéria (reinicia)
      // ★ FIX-MEGGY #18 (cont.): build a Set of this lesson's question IDs
      //   so the .some() inner loop is O(1) per answered id.
      const lessonQIds = new Set(lessonQs.map(q=>q.id));
      const newAnswered=answered.filter(id=>!lessonQIds.has(id));
      try{localStorage.setItem(ANSWERED_KEY,JSON.stringify(newAnswered))}catch(e){console.warn('[Meggy Q] startQuizFromBank answered-reset localStorage.setItem failed:', e&&e.message||e)}
    }
    if(pending.length===0){
      bodyEl.innerHTML=`<div class="gdi-mat-isa-result" style="text-align:center;padding:30px;">
        <div style="font-size:48px;">📝</div>
        <h3 style="color:var(--ferreto-primary,#ff8b9f);font-family:var(--ferreto-font-display,'Poppins',sans-serif);">Nenhuma questão disponível ainda</h3>
        <p style="color:var(--ferreto-text-muted,#8b949e);font-size:13px;margin-top:8px;">Matéria: <b style="color:var(--ferreto-text,#e6edf3);">${esc(lesson)}</b></p>
        <button id="gdi-q-gen-more" class="gdi-btn gdi-btn-primary" style="margin-top:14px;"><i class="bi bi-stars"></i> Gerar 5 questões com Meggy</button>
      </div>`;
      bodyEl.querySelector('#gdi-q-gen-more').onclick=async()=>{
        const ok=await generateQuestions(bodyEl.__items||[],bodyEl,lesson);
        if(ok)startQuizFromBank(bodyEl,lesson);
      };
      return;
    }
    // pega até 5 questões
    // ★ Fix 15 (Task 20-8): Fisher-Yates shuffle the pending pool BEFORE
    //   slicing 5, so the user doesn't always see the same 5 questions in
    //   the same order on every restart (which previously happened whenever
    //   `pending.length` reset to the full lesson set — the first 5 by
    //   insertion order would always come up first). The shuffle is
    //   non-destructive (works on a .slice() copy) so the underlying bank
    //   order is preserved for other callers.
    const shuffled = pending.slice();
    for(let i = shuffled.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = tmp;
    }
    const batch=shuffled.slice(0,5);
    runQuizSession(bodyEl,lesson,batch);
  }

  // ── Roda uma sessão de quiz interativo ──
  function runQuizSession(bodyEl,lesson,queue){
    let idx=0,hits=0,misses=0;
    function draw(){
      if(idx>=queue.length){
        // fim do batch
        const total=queue.length;
        const pct=Math.round(hits/total*100);
        bodyEl.innerHTML=`<div class="gdi-mat-isa-result" style="max-width:760px;text-align:center;">
          <div style="font-size:48px;">${pct>=60?'🎉':'📚'}</div>
          <h3 style="color:var(--ferreto-primary,#ff8b9f);font-family:var(--ferreto-font-display,'Poppins',sans-serif);">Batch concluído!</h3>
          <p style="color:var(--ferreto-text,#e6edf3);font-size:16px;margin-top:8px;"><b style="color:${pct>=60?'#3fb950':'#ff8b8b'};">${hits}/${total}</b> · ${pct}% acerto</p>
          <p style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;">Matéria: ${esc(lesson)}</p>
          <div style="display:flex;gap:8px;justify-content:center;margin-top:18px;flex-wrap:wrap;">
            <button id="gdi-q-more" class="gdi-btn gdi-btn-primary"><i class="bi bi-stars"></i> Gerar mais 5 questões</button>
            <button id="gdi-q-next-batch" class="gdi-mode-btn"><i class="bi bi-arrow-right"></i> Próximo batch</button>
          </div>
        </div>`;
        // Gerar mais 5 questões
        bodyEl.querySelector('#gdi-q-more').onclick=async()=>{
          const ok=await generateQuestions(bodyEl.__items||[],bodyEl,lesson);
          if(ok)startQuizFromBank(bodyEl,lesson);
          else startQuizFromBank(bodyEl,lesson); // tenta de novo com o que tem
        };
        // Próximo batch (questões que ainda não foram respondidas)
        bodyEl.querySelector('#gdi-q-next-batch').onclick=()=>startQuizFromBank(bodyEl,lesson);
        return;
      }
      const q=queue[idx];
      const isTF=q.type==='tf';
      const optCount=isTF?2:(q.options?.length||4);
      bodyEl.innerHTML=`<div class="gdi-mat-isa-result" style="max-width:760px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-shrink:0;">
          <span aria-live="polite" aria-atomic="true" style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;">${esc(lesson)} · ${idx+1}/${queue.length}</span>
          <span aria-live="polite" aria-atomic="true" style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;">✓ ${hits} ✗ ${misses}</span>
        </div>
        <div class="gdi-course" style="margin-bottom:14px;">
          <b style="color:var(--ferreto-secondary,#5ddeda);font-size:11px;display:block;margin-bottom:8px;">${isTF?'CEBRASPE — Certo ou Errado':'Múltipla Escolha'}</b>
          <div style="color:var(--ferreto-text,#f0f6fc);font-size:14px;line-height:1.7;">${esc(q.statement)}</div>
        </div>
        <div id="gdi-q-opts" style="display:flex;flex-direction:column;gap:8px;"></div>
        <div id="gdi-q-feedback" style="margin-top:14px;"></div>
        <div style="display:flex;justify-content:flex-end;padding-top:14px;margin-top:10px;border-top:1px solid var(--ferreto-border,#21262d);">
          <button id="gdi-q-skip" title="Pular para próxima questão" aria-label="Pular para a próxima questão" style="width:48px;height:48px;border-radius:50%;border:0;cursor:pointer;background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;font-size:20px;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px -4px rgba(255,139,159,.5);transition:transform .15s;"><i class="bi bi-arrow-right"></i></button>
        </div>
      </div>`;
      // ★ seta fixa para pular questão (mesmo sem responder)
      const skipBtn=bodyEl.querySelector('#gdi-q-skip');
      if(skipBtn){
        skipBtn.onmouseenter=()=>{skipBtn.style.transform='scale(1.1)';};
        skipBtn.onmouseleave=()=>{skipBtn.style.transform='scale(1)';};
        skipBtn.onclick=()=>{
          // se ainda não respondeu, marca como errada (pulo = não sabe)
          const feedbackEl=bodyEl.querySelector('#gdi-q-feedback');
          if(feedbackEl&&!feedbackEl.innerHTML){
            misses++;
            markAnswered(q.id);
            if(window.__gdiGradeQ)window.__gdiGradeQ(q.id,false);
          }
          if(idx+1<queue.length){idx++;draw();}
          else{idx++;draw();}  // ★ Sprint 6: simplificado — ambos os ramos fazem o mesmo
        };
      }
      const optsEl=bodyEl.querySelector('#gdi-q-opts');
      const options=q.options||(isTF?['Certo','Errado']:['a','b','c','d']);
      options.forEach((opt,i)=>{
        const b=document.createElement('button');
        b.className='gdi-note';b.style.cursor='pointer';b.style.textAlign='left';
        const letter=isTF?'':String.fromCharCode(65+i)+') ';
        // ★ A11y (Task P12-6): aria-label so screen readers announce the
        //   option letter + content. TF options get "Certo"/"Errado"; MC
        //   options get "A"/"B"/"C"/"D" + the option text.
        b.setAttribute('aria-label', (isTF ? (i===0?'Opção Certo':'Opção Errado') : ('Opção '+String.fromCharCode(65+i))) + ': ' + opt);
        b.innerHTML=`<span style="display:flex;align-items:center;gap:10px;"><b style="color:var(--ferreto-primary,#ff8b9f);">${letter}</b> <span style="color:var(--ferreto-text,#e6edf3);">${esc(opt)}</span></span>`;
        b.onclick=()=>{
          const acertou=i===q.correct;
          if(acertou)hits++;else misses++;
          markAnswered(q.id);
          // grade no SRS
          if(window.__gdiGradeQ)window.__gdiGradeQ(q.id,acertou);
          optsEl.querySelectorAll('button').forEach((bb,bi)=>{
            bb.disabled=true;bb.style.cursor='default';bb.style.opacity='.7';
            if(bi===q.correct)bb.style.background='rgba(63,185,80,.18)';
            if(bi===i&&!acertou)bb.style.background='rgba(255,107,107,.18)';
          });
          const fb=bodyEl.querySelector('#gdi-q-feedback');
          fb.innerHTML=`<div class="gdi-course" style="border-left:3px solid ${acertou?'#3fb950':'#ff6b6b'};">
            <b style="color:${acertou?'#3fb950':'#ff6b6b'};">${acertou?'✓ Correto':'✗ Errado'}</b>
            ${q.explanation?`<div style="color:var(--ferreto-text,#e6edf3);font-size:13px;margin-top:6px;line-height:1.5;">${esc(q.explanation)}</div>`:''}
          </div>
          <button class="gdi-btn gdi-btn-primary" id="gdi-q-next" style="margin-top:12px;">${idx+1<queue.length?'Próxima →':'Ver resultado'}</button>`;
          fb.querySelector('#gdi-q-next').onclick=()=>{idx++;draw();};
        };
        optsEl.appendChild(b);
      });
    }
    draw();
  }

  // ── Namespace exports ──
  window.__gdiMeggy.questions = {
    questions,
    generateQuestions,
    startQuizFromBank,
    runQuizSession,
    extractQuestionsFromText,
    getAnsweredIds,
    markAnswered,
    // ★ TASK 7 (Scanner Distribuído — Section 9.2): folder-first helpers.
    // Additive — existing API surface unchanged.
    saveQuestionsToDisciplineFolder,
    loadQuestionsFromDisciplineFolder
  };

  // ── Aliases para compatibilidade ──
  // window.__gdiPdfCursor já foi definido acima (legacy round-robin cursor)

  console.log('[GDI Extras] meggy-questions ativo (Module 4/7)');
})();
