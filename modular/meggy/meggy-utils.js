// ═══════════════════════════════════════════════════════════════
// meggy-utils.js — foundational helpers + constants + M9-ISA CSS
//
// Module 1 of 7 (modular/meggy/).
// Sourced from gdi-meggy.js M9-ISA IIFE (lines 32-99, 102-141, 521-589, 712-743).
//
// Exposes:
//   • window.__gdiMeggy.utils = { esc, lsGet, lsSet, uid, parseJsonArray,
//     renderMd, setLoading, setError, lessonKey, realLessonName, callIsa,
//     callIsaKeyed, CONSTS }
//   • window.__gdiParseJsonArray  (alias for gdi-study.js compat)
//   • window.realLessonName       (alias — fixes the cross-IIFE bug from v1.0.84)
//
// Guard: window.__gdiMeggyUtils
// Depends on: nothing (lowest layer)
// ═══════════════════════════════════════════════════════════════
(function(){
  // ★ H-35 (P12-9): null-guard at IIFE top for window.__gdiMeggy.utils.
  //    If a prior invocation already installed `window.__gdiMeggy.utils`
  //    (or the namespace itself is in an inconsistent state — e.g. another
  //    meggy-* module threw mid-init), bail out instead of overwriting with
  //    a partial utils object. The legacy `window.__gdiMeggyUtils` boolean
  //    guard below stays for backwards compat (older loaders check it).
  window.__gdiMeggy = window.__gdiMeggy || {};
  if(window.__gdiMeggy && window.__gdiMeggy.utils){
    // Already initialized — re-running this IIFE would clobber the existing
    // utils (and any per-call state added by other modules). Bail.
    console.log('[GDI Extras] meggy-utils já inicializado — skip');
    return;
  }
  if(window.__gdiMeggyUtils)return;
  window.__gdiMeggyUtils=true;

  // ── Constants ──
  const LS_SUM='gdi-isa-summaries-v1';
  const LQ='gdi-questions-v1';
  const LS_SUBJECTS='gdi-subjects-v1';
  const ANSWERED_KEY='gdi-answered-questions-v1';
  const MEMORY_KEY='gdi-meggy-memory-v1';
  const STORE='gdi-ai-chat';
  const MEGGY_NAME='Meggy';
  // ★ v1.0.81: Novo SVG da Meggy (viewBox 0 0 512 512). Mantém width/height 100% p/ scaling.
  const MEGGY_AVATAR='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%"><path fill="#f5f5f5" d="M256 32c124 0 224 100 224 224S380 480 256 480 32 380 32 256 132 32 256 32z"/><path fill="#e8e8e8" d="M180 180c-20 40-20 100 0 140 40 80 112 80 152 0 20-40 20-100 0-140-40-80-112-80-152 0z"/><circle cx="200" cy="240" r="24" fill="#1a1a1a"/><circle cx="312" cy="240" r="24" fill="#1a1a1a"/><path fill="#5a3a2a" d="M256 300c-20 0-36 12-36 28s16 28 36 28 36-12 36-28-16-28-36-28z"/><path fill="#fff" d="M210 230c4-4 8-6 12-6 4 0 8 2 12 6-4 4-8 6-12 6-4 0-8-2-12-6z"/><path fill="#fff" d="M322 230c4-4 8-6 12-6 4 0 8 2 12 6-4 4-8 6-12 6-4 0-8-2-12-6z"/></svg>';
  const MEGGY_TAG='— a poodle tutora';
  const ISA_SYS='Você é a Meggy — uma poodle tutora de estudos brasileira, ' +
    'amigável, calorosa e didática (mascote do projeto, sempre acompanhada do emoji 🐩). ' +
    'Acompanha alunos em uma plataforma de videoaulas (Google Drive Index). Responda em ' +
    'português, de forma clara e objetiva. Ajude com dúvidas das aulas, resumos, ' +
    'explicações e organização dos estudos. Se não souber, diga. Seja motivadora e ' +
    'acolhedora. Use Markdown quando ajudar.';

  // ── Helpers ──
  // ★ FIX 20-6 #4 (Agent 16): esc() must also escape single quotes (&#39;).
  //    The previous 4-entity chain (& < > ") was sufficient for double-quoted
  //    attribute contexts but NOT for single-quoted ones. Several consumers
  //    embed esc() output inside single-quoted HTML attributes, e.g.:
  //      study-questions.js: `<button data-s="${esc(s)}">`  ← double-quoted, OK
  //      study-questions.js: `data-qid="${esc(q.id)}"`      ← double-quoted, OK
  //      study-tabs-legacy.js (legacy): `data-id='${esc(x)}'` ← single-quoted, LEAKS
  //    A subject name like "O'Brien" or "Direito das ONG's" inserted via
  //    esc() into a single-quoted attribute would break out of the attribute
  //    and could inject markup. The HTML5 spec (8.1.2.3) and OWASP both
  //    recommend escaping ' to &#x27; (or &#39;). We use &#39; for max
  //    compatibility with older browsers. The entity is also valid in text
  //    content (renders as '), so existing text-context callers are unaffected.
  const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  // ★ H-21/H-22 (P12-9): silent catches → console.warn so localStorage
  //    quota / Safari private-mode failures surface in devtools instead of
  //    silently degrading (e.g. user can't tell why their summaries vanished).
  const lsGet=(k,d)=>{try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){console.warn('[meggy-utils] lsGet failed for',k,':',e&&e.message||e);return d}};
  const lsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){console.warn('[meggy-utils] lsSet failed for',k,':',e&&e.message||e)}};
  const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);

  // ── Robust JSON array parser ──
  // LLMs frequentemente retornam texto antes/depois do JSON, cercam o
  // array em ```json ... ```, ou incluem erros de sintaxe (vírgulas
  // finais, aspas não escapadas). Esta função tenta todas as estratégias
  // e só lança erro se TODAS falharem (inclui os primeiros 500 chars
  // da resposta bruta na mensagem para diagnóstico).
  function parseJsonArray(raw){
    if(raw==null)throw new Error('Resposta vazia');
    let txt=String(raw);
    // 1) strip markdown fences ```json ... ``` (e ``` ... ```)
    txt=txt.replace(/```(?:json|JSON)?\s*/g,'').replace(/```\s*/g,'');
    // 2) extrair do PRIMEIRO [ ao ÚLTIMO ]
    const first=txt.indexOf('[');
    const last=txt.lastIndexOf(']');
    if(first>=0&&last>first){
      txt=txt.slice(first,last+1);
    }
    // 3) tenta JSON.parse direto
    try{
      const arr=JSON.parse(txt);
      if(Array.isArray(arr))return arr;
    }catch(e){/* expected — fall through to strategy 4. Don't spam console for the common parse-fail path. */}
    // 4) tenta consertar problemas comuns: vírgulas finais e aspas
    //    não-escapadas dentro de strings (heurística simples)
    try{
      const fixed=txt
        .replace(/,(\s*[}\]])/g,'$1')          // vírgula final antes de } ou ]
        .replace(/[\u201C\u201D]/g,'"')          // aspas curvas → retas
        .replace(/[\u2018\u2019]/g,"'")          // apóstrofos curvos → retos
        .replace(/\t/g,' ');
      const arr=JSON.parse(fixed);
      if(Array.isArray(arr))return arr;
    }catch(e){/* expected — fall through to strategy 5. Don't spam console. */}
    // 5) tenta parsing item-a-item: encontra cada {...} no texto e
    //    monta o array (LLM às vezes retorna uma lista de objetos sem
    //    os colchetes externos, ou com comentários no meio)
    try{
      const items=[];
      const re=/\{[\s\S]*?\}(?=\s*[,}\]\n]|\s*$)/g;
      let m;
      while((m=re.exec(txt))!==null){
        let frag=m[0];
        // remove vírgula final dentro do objeto
        frag=frag.replace(/,(\s*})/g,'$1');
        try{
          const obj=JSON.parse(frag);
          if(obj&&typeof obj==='object'&&!Array.isArray(obj))items.push(obj);
        }catch(e){/* per-fragment parse fail is expected (LLM garbage); skip silently. */}
      }
      if(items.length)return items;
    }catch(e){console.warn('[meggy-utils] parseJsonArray item-by-item strategy failed:',e&&e.message||e);}
    // 6) falhou tudo — inclui mensagem curta (sem o conteúdo bruto,
    //    que pode incluir dados do usuário/AI — FIX-MEGGY #21 EDGE-16).
    const err=new Error('Resposta não é JSON array válido (falhou em todas as estratégias de parsing).');
    err.raw=String(raw);
    throw err;
  }

  // ── Render Markdown (uses marked if available, fallback to <br>) ──
  // ★ XSS-safe: NUNCA retorna HTML não sanitizado — fallback sempre escapa
  function renderMd(txt){
    if(window.marked){
      try{
        const html=marked.parse(txt);
        // ★ FIX: se gdiSanitize não carregou (CDL caiu, etc.), NÃO retorna HTML cru
        if(window.gdiSanitize){try{return window.gdiSanitize(html);}catch(e){console.warn('[meggy-utils] gdiSanitize failed, falling back to esc(<br>):',e&&e.message||e);}}
        return esc(txt).replace(/\n/g,'<br>');
      }catch(e){console.warn('[meggy-utils] marked.parse failed, falling back to plain esc:',e&&e.message||e);}
    }
    return esc(txt).replace(/\n/g,'<br>');
  }

  // ── UI helpers ──
  function setLoading(bodyEl,msg){
    // ★ suporta \n e mensagens longas (OCR etc) — wrap e max-width
    const html=esc(msg).replace(/\n/g,'<br>');
    bodyEl.innerHTML=`<div class="gdi-mat-isa-loading" style="max-width:560px;margin:0 auto;padding:30px 20px;">
      <div class="gdi-mat-isa-spin"></div>
      <div style="text-align:center;font-size:13px;line-height:1.6;color:var(--ferreto-text,#e6edf3);">${html}</div>
      <div style="margin-top:14px;font-size:11px;color:var(--ferreto-text-muted,#8b949e);font-style:italic;">
        <i class="bi bi-info-circle"></i> Não feche esta aba — a geração continua em segundo plano.
      </div>
    </div>`;
  }
  function setError(bodyEl,msg){
    // ★ preserva quebras de linha para mensagens multi-linha (ex: erros de PDF)
    const html=esc(msg).replace(/\n/g,'<br>');
    bodyEl.innerHTML=`<div class="gdi-mat-isa-err" style="align-items:stretch;text-align:left;max-width:680px;margin:0 auto;padding:24px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--ferreto-border,#21262d);">
        <i class="bi bi-exclamation-triangle" style="font-size:28px;color:#ff8b8b;flex:none;"></i>
        <b style="color:#ff8b8b;font-size:15px;font-family:var(--ferreto-font-display,'Poppins',sans-serif);">Erro</b>
      </div>
      <div style="color:var(--ferreto-text,#e6edf3);font-size:13px;line-height:1.7;white-space:normal;">${html}</div>
      <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--ferreto-border,#21262d);display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
        <button id="gdi-err-retry" class="gdi-btn gdi-btn-primary" style="font-size:12px;"><i class="bi bi-arrow-clockwise"></i> Tentar novamente</button>
        <button id="gdi-err-close" class="gdi-mode-btn" style="font-size:12px;">Fechar</button>
      </div>
    </div>`;
    const retryBtn=bodyEl.querySelector('#gdi-err-retry');
    if(retryBtn)retryBtn.onclick=()=>{
      // volta para a aba de materiais (re-renderiza o M9)
      const matTabs=document.querySelector('#gdi-mat-tabs');
      const matBody=document.querySelector('#gdi-mat-body');
      if(matTabs&&matTabs.__items&&matBody){
        // re-dispara o click na aba Resumo Meggy
        const tab=matTabs.querySelector('[data-mat="isa-summary"]');
        if(tab)tab.click();
      }
    };
    const closeBtn=bodyEl.querySelector('#gdi-err-close');
    if(closeBtn)closeBtn.onclick=()=>{
      // volta para o primeiro PDF
      const matTabs=document.querySelector('#gdi-mat-tabs');
      if(matTabs){
        const firstTab=matTabs.querySelector('[data-mat="0"]');
        if(firstTab)firstTab.click();
      }
    };
  }

  // ── Lesson key (cache key = URL pathname, estável entre visitas) ──
  // ★ FIX-MEGGY #20 (Agent 19 EDGE-7): strip trailing slashes so that
  //   /7:/Course/Lesson/ and /7:/Course/Lesson collapse to the same key
  //   (otherwise cache misses when the URL has a trailing slash — common
  //   when Drive Index redirects).
  function lessonKey(){
    const k = window.location.pathname.split('?')[0].replace(/\/+$/,'');
    return k || '/';
  }

  // ── Real lesson name from playlist (não "video.mp4") ──
  // A playlist tem .name que pode incluir o label da pasta (ex: "Aula 02 - ...").
  // Se não houver playlist, cai pro file header, depois pro base passado.
  function realLessonName(fallback){
    try{
      if(window.playlistVideos&&typeof window.currentIndex==='number'&&window.currentIndex>=0){
        const v=window.playlistVideos[window.currentIndex];
        if(v&&v.name&&v.name!=='video.mp4'&&v.name.length>3)return v.name;
        // tenta origName também
        if(v&&v.origName&&v.origName!=='video.mp4'&&v.origName.length>3)return v.origName;
      }
    }catch(e){console.warn('[meggy-utils] realLessonName playlist lookup failed:',e&&e.message||e);}
    const h=document.querySelector('.gdi-file-header-name');
    if(h&&h.textContent&&h.textContent.trim().length>3)return h.textContent.trim();
    return fallback||'Aula';
  }

  // ── ISA call (POST /api/ai) ──
  // ★ H-24 (P12-9): differentiate 401/429/5xx from generic non-OK. Returning
  //    null on every !r.ok made it impossible for callers to:
  //      • show "Sessão expirada" on 401 (and redirect to /login)
  //      • throttle on 429 (Retry-After header)
  //      • distinguish "service down" (500) from "session expired" (401)
  //    Now returns `{ok:false, status, reason}` so callers can branch. Callers
  //    that previously checked `result === null` still work (falsy), but
  //    callers that want more context can read `result.status` and `result.reason`.
  //    The `data.ok===false` path (HTTP 200 with `{ok:false,error}` body) still
  //    throws as before.
  async function callIsa(prompt){
    let r;
    try{
      r=await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({message:prompt,messages:[]})});
    }catch(networkErr){
      // Network failure / CORS / DNS — caller can retry or show offline toast.
      console.warn('[meggy-utils] callIsa network error:',networkErr&&networkErr.message||networkErr);
      return {ok:false,status:0,reason:'network'};
    }
    // ★ FIX-MEGGY #19 (Agent 6): check r.ok before parsing — without this, a
    //   404/500 response with HTML body throws a confusing SyntaxError on
    //   r.json() instead of a clear error message.
    if(!r.ok){
      // H-24: differentiate the three caller-actionable statuses.
      let reason='http';
      if(r.status===401)reason='auth';        // session expired → caller redirects
      else if(r.status===429)reason='rate';   // rate limit → caller backs off
      else if(r.status>=500)reason='server';  // server error → caller may retry
      console.warn('[meggy-utils] callIsa non-OK:',r.status,'(',reason,')');
      return {ok:false,status:r.status,reason:reason};
    }
    const data=await r.json();
    if(!data.ok)throw new Error(data.error||'Meggy indisponível');
    return data.response||'';
  }
  // callIsa para tarefas paralelas — SEM header customizado (evita CORS)
  // O worker já faz round-robin entre as chaves NVIDIA automaticamente.
  // Requisições paralelas naturalmente usam chaves diferentes.
  async function callIsaKeyed(prompt,keyHint){
    return callIsa(prompt);
  }

  // ── CSS — M9-ISA styles only (flashcard styles in meggy-flashcards.js) ──
  if(!document.getElementById('gdi-m9isa-style')){
    const s=document.createElement('style');s.id='gdi-m9isa-style';s.textContent=`
.gdi-mat-tab.gdi-mat-isa{background:linear-gradient(135deg,rgba(255,139,159,.12),rgba(93,222,218,.08));border-color:rgba(255,139,159,.3);color:var(--ferreto-primary,#ff8b9f);}
.gdi-mat-tab.gdi-mat-isa:hover{background:linear-gradient(135deg,rgba(255,139,159,.22),rgba(93,222,218,.14));color:var(--ferreto-primary,#ff8b9f);}
.gdi-mat-tab.gdi-mat-isa.active{background:linear-gradient(135deg,#ff8b9f,#c026d3);border-color:transparent;color:#fff;}
.gdi-mat-isa-loading{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:30px;text-align:center;color:var(--ferreto-text-muted,#8b949e);font-size:14px;}
.gdi-mat-isa-spin{width:30px;height:30px;border:3px solid var(--ferreto-surface-3,rgba(255,255,255,.12));border-top-color:var(--ferreto-primary,#ff8b9f);border-radius:50%;animation:gdi-mat-isa-spin 1s linear infinite;}
@keyframes gdi-mat-isa-spin{to{transform:rotate(360deg);}}
/* ★FIX barra de rolagem dupla: antes havia overflow-y:auto aqui E dentro
   do .gdi-isa-summary-body, gerando duas scrollbars aninhadas. Agora só
   este contêiner rola — os filhos apenas preenchem naturalmente. */
.gdi-mat-isa-result{height:100%;overflow-y:auto;overflow-x:hidden;padding:14px 18px;background:var(--ferreto-surface,#161b22);color:var(--ferreto-text,#e6edf3);font-size:14px;line-height:1.6;}
.gdi-mat-isa-result h1,.gdi-mat-isa-result h2,.gdi-mat-isa-result h3,.gdi-mat-isa-result h4{color:var(--ferreto-text,#f0f6fc);font-family:var(--ferreto-font-display,'Poppins',sans-serif);margin:14px 0 6px;}
.gdi-mat-isa-result h1{font-size:20px;} .gdi-mat-isa-result h2{font-size:17px;} .gdi-mat-isa-result h3{font-size:15px;} .gdi-mat-isa-result h4{font-size:13px;}
.gdi-mat-isa-result p{margin:0 0 8px;}
.gdi-mat-isa-result ul,.gdi-mat-isa-result ol{margin:0 0 10px;padding-left:22px;}
.gdi-mat-isa-result li{margin:3px 0;}
.gdi-mat-isa-result code{background:rgba(0,0,0,.3);padding:1px 5px;border-radius:4px;font-size:12px;}
.gdi-mat-isa-result pre{background:rgba(0,0,0,.3);padding:8px;border-radius:8px;overflow-x:auto;margin:6px 0;}
.gdi-mat-isa-result strong{color:var(--ferreto-secondary,#5ddeda);}
.gdi-mat-isa-result blockquote{border-left:3px solid var(--ferreto-primary,#ff8b9f);margin:6px 0;padding:2px 10px;color:var(--ferreto-text-muted,#8b949e);}
.gdi-isa-summary-body h1,.gdi-isa-summary-body h2,.gdi-isa-summary-body h3,.gdi-isa-summary-body h4{color:var(--ferreto-text,#f0f6fc);font-family:var(--ferreto-font-display,'Poppins',sans-serif);margin:18px 0 8px;line-height:1.3;}
.gdi-isa-summary-body h1{font-size:20px;border-bottom:2px solid var(--ferreto-primary,#ff8b9f);padding-bottom:6px;}
.gdi-isa-summary-body h2{font-size:17px;color:var(--ferreto-primary,#ff8b9f);border-left:3px solid var(--ferreto-primary,#ff8b9f);padding-left:10px;}
.gdi-isa-summary-body h3{font-size:15px;color:var(--ferreto-secondary,#5ddeda);}
.gdi-isa-summary-body h4{font-size:13px;color:var(--ferreto-text-muted,#8b949e);text-transform:uppercase;letter-spacing:.05em;}
.gdi-isa-summary-body p{margin:0 0 10px;text-align:justify;}
.gdi-isa-summary-body ul,.gdi-isa-summary-body ol{margin:0 0 12px;padding-left:24px;}
.gdi-isa-summary-body li{margin:4px 0;}
.gdi-isa-summary-body code{background:rgba(0,0,0,.3);padding:2px 6px;border-radius:4px;font-size:12px;font-family:ui-monospace,monospace;}
.gdi-isa-summary-body pre{background:rgba(0,0,0,.3);padding:12px;border-radius:8px;overflow-x:auto;margin:8px 0;}
.gdi-isa-summary-body strong{color:var(--ferreto-secondary,#5ddeda);font-weight:600;}
.gdi-isa-summary-body blockquote{border-left:3px solid var(--ferreto-primary,#ff8b9f);margin:10px 0;padding:4px 14px;color:var(--ferreto-text-muted,#8b949e);font-style:italic;background:rgba(255,139,159,.06);border-radius:0 8px 8px 0;}
.gdi-isa-summary-body table{border-collapse:collapse;width:100%;margin:10px 0;}
.gdi-isa-summary-body th,.gdi-isa-summary-body td{border:1px solid var(--ferreto-border,#21262d);padding:8px 10px;text-align:left;font-size:13px;}
.gdi-isa-summary-body th{background:var(--ferreto-surface-3,rgba(255,255,255,.08));font-weight:600;}
.gdi-mat-isa-err{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:30px;text-align:center;}
.gdi-mat-isa-err i{font-size:36px;color:#ff8b8b;}
.gdi-mat-isa-err div{color:var(--ferreto-text,#e6edf3);font-size:14px;max-width:420px;}
`;
    document.head.appendChild(s);
  }

  // ── Namespace exports ──
  window.__gdiMeggy.utils = {
    esc, lsGet, lsSet, uid,
    parseJsonArray, renderMd,
    setLoading, setError,
    lessonKey, realLessonName,
    callIsa, callIsaKeyed,
    CONSTS: {
      LS_SUM, LQ, LS_SUBJECTS, ANSWERED_KEY, MEMORY_KEY, STORE,
      MEGGY_NAME, MEGGY_AVATAR, MEGGY_TAG, ISA_SYS
    }
  };

  // ★ H-33 (P12-9): export esc() as window.gdiEsc so other modules can use
  //    the canonical 5-entity escaper (& < > " '). Previously esc() was only
  //    reachable via window.__gdiMeggy.utils.esc — too long for new consumers
  //    to discover, and several modules (study-advanced.js, study-questions.js)
  //    ship divergent 4-entity escapers (missing the &#39; entity, leaking on
  //    single-quoted attributes). The canonical name `window.gdiEsc` is the
  //    migration target per CQ-6.1 (Agent 13 roadmap).
  //    Idempotent: don't overwrite if another module already installed a
  //    (presumably equivalent) escaper.
  if(!window.gdiEsc){
    window.gdiEsc=esc;
  }

  // ── Aliases para compatibilidade (código externo espera estas globais) ──
  // __gdiParseJsonArray — chamado por gdi-study.js:75-76
  window.__gdiParseJsonArray = function(){ return parseJsonArray.apply(this, arguments); };
  // realLessonName — exposto no window para o M-AI widget encontrar (v1.0.84 cross-IIFE fix permanente)
  window.realLessonName = function(){ return realLessonName.apply(this, arguments); };

  console.log('[GDI Extras] meggy-utils ativo (Module 1/7)');
})();
