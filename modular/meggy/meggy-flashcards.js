// ═══════════════════════════════════════════════════════════════
// meggy-flashcards.js — flashcard library + study sessions + subjects CRUD
//
// Module 5 of 7 (modular/meggy/).
// Sourced from gdi-meggy.js M9-ISA IIFE (lines 142-234 CSS, 844-902 helpers,
// 1466-2023 library + session).
//
// Exposes:
//   • window.__gdiMeggy.flashcards = { flashcards, renderThemeCardsPaginated,
//     runFlashcardSession, extractDisciplineTheme, normPath, stripExt,
//     getSubjects, saveSubject, deleteSubject }
//   • window.gdiSubjects = {get, save, delete, LS}  (preserved for gdi-study.js callers)
//
// Guard: window.__gdiMeggyFlashcards
// Depends on: utils (esc, lsGet, lsSet, uid, renderMd, setLoading, setError,
//   realLessonName, lessonKey), pdf-engine (none directly),
//   cache (autoCreateFlashcards via window.gdiIsaPdf.summary),
//   summaries (gdiIsaPdf.summary for "Gerar com a Meggy" button)
// External: window.gdiGradeCard, window.gdiSrsIntervals, window.gdiAchievements,
//   Bus, showToast
// ═══════════════════════════════════════════════════════════════
(function(){
  if(window.__gdiMeggyFlashcards)return;

  window.__gdiMeggy = window.__gdiMeggy || {};

  // ── Late-bound namespace shortcuts ──
  // ★ FIX-MEGGY (Task 20-7 #15 / H-35): null-guard window.__gdiMeggy.utils
  //   BEFORE setting the IIFE guard. Previously the guard was set on the
  //   line above unconditionally, then `const U = window.__gdiMeggy.utils`
  //   ran, then `U.CONSTS.LS_SUBJECTS` — if utils failed to load (CDN
  //   outage, eval error, wrong script-tag order), `U` was undefined and
  //   `U.CONSTS` threw TypeError. That crashed the entire IIFE AFTER the
  //   guard had been set, so the loader could never re-init the module on
  //   a later Bus.onGlobal('modules:ready') retry pass — a hard brick
  //   requiring page refresh.
  //   Fix: bail WITHOUT setting the guard when utils is missing. The loader
  //   gets another shot at calling this IIFE; if utils is still missing it
  //   bails again, harmlessly. Once utils loads, the guard is set and the
  //   module inits normally. Strictly safer than the prior pattern in the
  //   normal case (utils loaded → behaviour identical: one extra typeof
  //   check), and gracefully degrades in the edge case.
  const U = window.__gdiMeggy.utils;
  if(!U || !U.CONSTS){
    console.error('[Meggy] meggy-utils not loaded — aborting flashcards init (will retry on next loader pass)');
    return;
  }
  window.__gdiMeggyFlashcards=true;
  const LS_SUBJECTS = U.CONSTS.LS_SUBJECTS;
  // ★ v1.0.99: serialize gdi-cards-v1 writes to prevent RMW races
  let _cardsWriteChain = Promise.resolve();

  // ★ FIX-MEGGY (Task 20-7 #8): pre-indexed cache of gdi-cards-v1 grouped by
  //   discipline→theme. Avoids re-reading localStorage + re-running the O(N)
  //   grouping loop on every flashcards() render. The cache is invalidated
  //   (_cardsIndexCache = null) after every write chain completes
  //   (saveNewCard, deleteCard, gradeCard, addCardsBatch, manual addBtn).
  //   On the next flashcards() call, _getCardsIndex() rebuilds it from LS.
  //   NOTE: extractDisciplineTheme is defined further down in this IIFE, so
  //   _getCardsIndex() references it lazily (at call time, not at declaration).
  let _cardsIndexCache = null;
  function _invalidateCardsIndex(){ _cardsIndexCache = null; }
  function _getCardsIndex(){
    if(_cardsIndexCache) return _cardsIndexCache;
    const allCards = U.lsGet('gdi-cards-v1', []);
    const grouped = {};
    allCards.forEach(c => {
      const {discipline, theme} = extractDisciplineTheme(c);
      if(!grouped[discipline]) grouped[discipline] = {};
      if(!grouped[discipline][theme]) grouped[discipline][theme] = [];
      grouped[discipline][theme].push(c);
    });
    const disciplines = Object.keys(grouped).sort((a,b)=>a.localeCompare(b,'pt-BR'));
    const totalDue = allCards.filter(c=>(c.due||0)<=Date.now()).length;
    _cardsIndexCache = { allCards, grouped, disciplines, totalDue };
    return _cardsIndexCache;
  }

  // ★ FIX-MEGGY #3 (Agent 16 UIUX-2): register page:change cleanup ONCE at
  //   module init (was inside runFlashcardSession — leaked a listener per
  //   session). The handler iterates the set of active session bodyEls and
  //   invokes their __fcKeyCleanup if present, then drops them.
  const _activeFcSessions = new Set();
  function _fcPageCleanup(){
    _activeFcSessions.forEach(bodyEl => {
      if(bodyEl && bodyEl.__fcKeyCleanup){
        try{ bodyEl.__fcKeyCleanup(); }catch(_){}
        bodyEl.__fcKeyCleanup = null;
      }
    });
    _activeFcSessions.clear();
  }
  if(typeof Bus !== 'undefined' && typeof Bus.onGlobal === 'function'){
    Bus.onGlobal('page:change', _fcPageCleanup);
  }

  // ★ FIX-MEGGY (Task 20-7 #12): shared MutationObserver that watches for
  //   any active session bodyEl being disconnected from the DOM. The existing
  //   _fcPageCleanup only fires on page:change (navigation), NOT when the
  //   M9 panel is closed via the X button or ESC (which removes bodyEl from
  //   the DOM without emitting page:change). Without this, bodyEls of
  //   abandoned sessions stay in _activeFcSessions forever (memory leak +
  //   their __fcKeyCleanup keydown listeners stay attached to document).
  //   One observer is shared by all sessions for efficiency — its callback
  //   scans _activeFcSessions and evicts any bodyEl whose isConnected is
  //   false. Created lazily on first session start.
  let _fcCloseObserver = null;
  function _ensureFcCloseObserver(){
    if(_fcCloseObserver || typeof MutationObserver === 'undefined') return;
    _fcCloseObserver = new MutationObserver(function(){
      // Snapshot to avoid mutation during iteration
      const toClean = [];
      _activeFcSessions.forEach(bodyEl => {
        if(bodyEl && !bodyEl.isConnected) toClean.push(bodyEl);
      });
      toClean.forEach(bodyEl => {
        if(bodyEl.__fcKeyCleanup){
          try{ bodyEl.__fcKeyCleanup(); }catch(_){}
          bodyEl.__fcKeyCleanup = null;
        }
        _activeFcSessions.delete(bodyEl);
      });
    });
    // childList+subtree on document.body catches panel-close removals.
    _fcCloseObserver.observe(document.body, {childList:true, subtree:true});
  }

  // ── CSS — Flashcards library + session styles (separate from M9-ISA styles) ──
  if(!document.getElementById('gdi-m9isa-style-fc')){
    const s=document.createElement('style');s.id='gdi-m9isa-style-fc';s.textContent=`

/* ═══ BIBLIOTECA DE FLASHCARDS (M9) ═══ */
.gdi-fc-library{padding:14px 14px 24px;}
.gdi-fc-library-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:12px 16px;background:linear-gradient(135deg,rgba(255,139,159,.12),rgba(93,222,218,.06));border:1px solid var(--ferreto-border,#21262d);border-radius:14px;margin-bottom:14px;}
.gdi-fc-library-title{display:flex;align-items:center;gap:10px;min-width:0;}
.gdi-fc-library-title > i{font-size:24px;color:var(--ferreto-primary,#ff8b9f);flex:none;}
.gdi-fc-library-title b{color:var(--ferreto-text,#f0f6fc);font-family:var(--ferreto-font-display,'Poppins',sans-serif);font-size:15px;display:block;}
.gdi-fc-library-title span{color:var(--ferreto-text-muted,#8b949e);font-size:12px;}
.gdi-fc-library-actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center;}
.gdi-fc-add-form{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;padding:10px;background:var(--ferreto-surface-2,rgba(255,255,255,.03));border:1px solid var(--ferreto-border,#21262d);border-radius:10px;}
.gdi-fc-add-form input{flex:1;min-width:140px;background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:8px 10px;font-size:13px;font-family:inherit;}

/* Disciplina */
.gdi-fc-discipline{margin-bottom:10px;background:var(--ferreto-surface-2,rgba(255,255,255,.03));border:1px solid var(--ferreto-border,#21262d);border-radius:12px;overflow:hidden;}
.gdi-fc-disc-head{display:flex;align-items:center;gap:10px;padding:12px 14px;cursor:pointer;user-select:none;background:rgba(255,255,255,.025);transition:background .15s;}
.gdi-fc-disc-head:hover{background:rgba(255,255,255,.06);}
.gdi-fc-disc-head .gdi-fc-chevron{transition:transform .2s;color:var(--ferreto-text-muted,#8b949e);font-size:12px;flex:none;}
.gdi-fc-disc-head .gdi-fc-chevron.gdi-fc-rotated{transform:rotate(-90deg);}
.gdi-fc-disc-icon{color:var(--ferreto-primary,#ff8b9f);font-size:18px;flex:none;}
.gdi-fc-disc-name{color:var(--ferreto-text,#f0f6fc);font-family:var(--ferreto-font-display,'Poppins',sans-serif);font-size:14px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.gdi-fc-disc-meta{color:var(--ferreto-text-muted,#8b949e);font-size:11px;white-space:nowrap;}
.gdi-fc-due{color:#ffd43b !important;}
.gdi-fc-disc-body{padding:4px 8px 10px 8px;}

/* Tema */
.gdi-fc-theme{margin:6px 0 6px 26px;background:rgba(255,255,255,.02);border:1px solid var(--ferreto-border,#21262d);border-radius:10px;overflow:hidden;}
.gdi-fc-theme-head{display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;user-select:none;transition:background .15s;}
.gdi-fc-theme-head:hover{background:rgba(255,255,255,.05);}
.gdi-fc-theme-head .gdi-fc-chevron{transition:transform .2s;color:var(--ferreto-text-muted,#8b949e);font-size:11px;flex:none;}
.gdi-fc-theme-head .gdi-fc-chevron.gdi-fc-rotated{transform:rotate(-90deg);}
.gdi-fc-theme-icon{color:var(--ferreto-secondary,#5ddeda);font-size:14px;flex:none;}
.gdi-fc-theme-name{color:var(--ferreto-text,#e6edf3);font-size:13px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.gdi-fc-theme-meta{color:var(--ferreto-text-muted,#8b949e);font-size:11px;white-space:nowrap;}
.gdi-fc-theme-study{padding:4px 10px !important;font-size:11px !important;}
.gdi-fc-theme-body{padding:8px 10px 10px 10px;}

/* Grid de cards */
.gdi-fc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;}

/* Flip card 3D — versão SIMPLES E ROBUSTA
   Estratégia: opacity controla qual face aparece. backface-visibility
   fica apenas para suavizar a animação (sem ele, há flicker em alguns
   Androids), mas a regra de "qual face aparece" é 100% por opacity.
   Isso elimina qualquer conflito entre os dois mecanismos. */
.gdi-fc-card{position:relative;perspective:1500px;-webkit-perspective:1500px;height:170px;cursor:pointer;isolation:isolate;}
.gdi-fc-card-large{height:340px;max-width:560px;margin:0 auto;}
.gdi-fc-card-inner{position:absolute;inset:0;transform-style:preserve-3d;-webkit-transform-style:preserve-3d;-webkit-transition:-webkit-transform .55s cubic-bezier(.4,0,.2,1);transition:transform .55s cubic-bezier(.4,0,.2,1);will-change:transform;}
.gdi-fc-card.gdi-fc-flipped .gdi-fc-card-inner{transform:rotateY(180deg);-webkit-transform:rotateY(180deg);}
.gdi-fc-card-face{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:18px 16px;border-radius:12px;box-sizing:border-box;text-align:center;overflow:hidden;-webkit-transition:opacity .3s;transition:opacity .3s;will-change:transform;}
.gdi-fc-card-front{background:linear-gradient(135deg,rgba(255,139,159,.14),rgba(192,38,211,.08));border:1.5px solid rgba(255,139,159,.4);color:var(--ferreto-text,#f0f6fc);transform:translateZ(0);-webkit-transform:translateZ(0);opacity:1;}
.gdi-fc-card-back{background:linear-gradient(135deg,rgba(93,222,218,.14),rgba(63,185,80,.08));border:1.5px solid rgba(93,222,218,.4);color:var(--ferreto-text,#e6edf3);-webkit-transform:rotateY(180deg) translateZ(0);transform:rotateY(180deg) translateZ(0);opacity:0;pointer-events:none;}
.gdi-fc-card.gdi-fc-flipped .gdi-fc-card-front{opacity:0;pointer-events:none;}
.gdi-fc-card.gdi-fc-flipped .gdi-fc-card-back{opacity:1;pointer-events:auto;}
.gdi-fc-card-label{font-size:10px;font-weight:700;letter-spacing:.08em;color:var(--ferreto-primary,#ff8b9f);text-transform:uppercase;display:flex;align-items:center;gap:4px;}
.gdi-fc-card-back .gdi-fc-card-label{color:var(--ferreto-secondary,#5ddeda);}
.gdi-fc-card-text{font-size:13px;line-height:1.55;color:var(--ferreto-text,#e6edf3);overflow:hidden;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;max-height:110px;}
.gdi-fc-card-large .gdi-fc-card-text{font-size:16px;line-height:1.6;-webkit-line-clamp:10;max-height:240px;}
.gdi-fc-card-hint{font-size:10px;color:var(--ferreto-text-muted,#8b949e);display:flex;align-items:center;gap:4px;font-style:italic;}
.gdi-fc-card-del{position:absolute;top:6px;right:6px;width:24px;height:24px;border-radius:50%;background:rgba(255,107,107,.2);border:1px solid rgba(255,107,107,.4);color:#ff8b8b;cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center;z-index:2;transition:background .15s;}
.gdi-fc-card-del:hover{background:rgba(255,107,107,.4);}
.gdi-fc-card:hover .gdi-fc-card-del{opacity:1;}

/* Empty state */
.gdi-fc-empty{padding:40px 24px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:14px;}
.gdi-fc-empty-icon{font-size:64px;line-height:1;}
.gdi-fc-empty h3{color:var(--ferreto-primary,#ff8b9f);font-family:var(--ferreto-font-display,'Poppins',sans-serif);font-size:18px;margin:0;}
.gdi-fc-empty p{color:var(--ferreto-text-muted,#8b949e);font-size:13px;max-width:480px;margin:0;line-height:1.6;}
.gdi-fc-manual-wrap{margin-top:10px;display:flex;flex-direction:column;align-items:center;gap:8px;width:100%;max-width:420px;}
.gdi-fc-manual-wrap input, .gdi-fc-manual-form input{width:100%;box-sizing:border-box;background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:8px 10px;font-size:13px;font-family:inherit;}

/* Sessão de estudo (modo amplified) */
.gdi-fc-session{max-width:760px;height:100%;display:flex;flex-direction:column;}
.gdi-fc-session-head{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--ferreto-text-muted,#8b949e);padding:0 4px 10px;flex-shrink:0;}
.gdi-fc-session-stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:10px 0;}
.gdi-fc-session-grade{flex-shrink:0;padding:14px;border-top:1px solid var(--ferreto-border,#21262d);}
.gdi-fc-session-grade p{text-align:center;color:var(--ferreto-text-muted,#8b949e);font-size:13px;margin:0 0 10px;}
.gdi-fc-grade-btns{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;}
.gdi-fc-btn-no{background:rgba(255,107,107,.15)!important;border-color:rgba(255,107,107,.3)!important;color:#ff8b8b!important;font-size:13px!important;padding:10px 20px!important;}
.gdi-fc-btn-yes{font-size:13px!important;padding:10px 20px!important;}
.gdi-fc-session-foot{flex-shrink:0;display:flex;justify-content:flex-end;padding-top:10px;border-top:1px solid var(--ferreto-border,#21262d);}
.gdi-fc-skip-btn{width:48px;height:48px;border-radius:50%;border:0;cursor:pointer;background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;font-size:20px;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px -4px rgba(255,139,159,.5);transition:transform .15s;}
.gdi-fc-skip-btn:hover{transform:scale(1.08);}
/* ★ PATCH E: botão "Carregar mais" para paginação dentro de temas grandes */
.gdi-fc-load-more{margin:14px auto 4px;display:flex;align-items:center;gap:6px;padding:10px 18px;background:var(--ferreto-surface-3,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);color:var(--ferreto-text,#e6edf3);border-radius:10px;cursor:pointer;font-size:12px;font-family:inherit;transition:background .15s;}
.gdi-fc-load-more:hover{background:var(--ferreto-surface-3,rgba(255,255,255,.12));}

/* Responsivo */
@media(max-width:680px){
  .gdi-fc-grid{grid-template-columns:1fr;}
  .gdi-fc-card{height:200px;}
  .gdi-fc-library-head{flex-direction:column;align-items:stretch;}
  .gdi-fc-library-actions{justify-content:space-between;}
  .gdi-fc-theme{margin-left:14px;}
}
`;
    document.head.appendChild(s);
  }

  // ── Extrai disciplina + tema de um path ou lesson name ──
  // path: URL pathname como "/0:/Direito Constitucional/Aula 02.mp4"
  // Retorna {discipline, theme} — usado pela biblioteca de flashcards (M9)
  function extractDisciplineTheme(card){
    // ★ prioridade 1: subject/theme explícitos (matéria manual)
    if(card.subject&&card.theme)return{discipline:card.subject,theme:card.theme};
    if(card.subject)return{discipline:card.subject,theme:card.theme||'Geral'};
    let discipline='Geral',theme='Geral';
    const path=card.path||'';
    const lessonName=card.lesson||((card.src||'').replace(/^ISA:/,'').replace(/^manual:/,''))||'';
    // tenta extrair do path (URL)
    if(path&&path.charAt(0)==='/'){
      try{
        const segs=normPath(path).split('/').filter(Boolean);
        // segs[0]="0:" (drive id); segs[1..n-1]=pastas; segs[n]=arquivo
        if(segs.length>=3){
          discipline=segs[1];
          // tema = última pasta antes do arquivo (ou o próprio arquivo sem extensão)
          const themeSegs=segs.slice(2,-1);
          theme=themeSegs.length?themeSegs.join(' / '):stripExt(segs[segs.length-1]);
        }else if(segs.length===2){
          discipline=segs[1];
          theme='Geral';
        }
      }catch(_){}
    }
    // fallback: heurística no lessonName ("Disciplina - Tema" ou só "Tema")
    if(discipline==='Geral'&&lessonName&&lessonName.length>3){
      const parts=lessonName.split(/\s*[-–—|·]\s*/).filter(p=>p.trim());
      if(parts.length>=2){
        // disciplina = maior segmento (heurística); tema = resto
        const sorted=parts.map((p,i)=>({p:p.trim(),i,len:p.trim().length})).sort((a,b)=>b.len-a.len);
        discipline=sorted[0].p;
        theme=parts.filter((_,i)=>i!==sorted[0].i).join(' - ').trim()||'Geral';
      }else{
        theme=lessonName;
      }
    }else if(theme==='Geral'&&lessonName&&lessonName.length>3){
      theme=lessonName;
    }
    return{discipline,theme};
  }
  function normPath(p){try{return decodeURIComponent(String(p||''))}catch(_){return String(p||'')}}
  function stripExt(s){return String(s||'').replace(/\.[a-z0-9]{1,5}$/i,'').trim()};

  // ★ Sistema de Matérias manuais (substitui heurística quando aplicável)
  function getSubjects(){return U.lsGet(LS_SUBJECTS,[]);}
  function saveSubject(subj){
    const arr=getSubjects();
    const idx=arr.findIndex(s=>s.id===subj.id);
    if(idx>=0)arr[idx]=subj;else arr.push(subj);
    U.lsSet(LS_SUBJECTS,arr);
  }
  function deleteSubject(id){
    U.lsSet(LS_SUBJECTS,getSubjects().filter(s=>s.id!==id));
  }
  // expor para outros módulos
  window.gdiSubjects={get:getSubjects,save:saveSubject,delete:deleteSubject,LS:LS_SUBJECTS};

  // ── Flashcards flow (aba no M9 — BIBLIOTECA organizada por disciplina → tema) ──
  // ★ REFACTORED (PATCH E): virtualização por accordion. Todos os temas
  // começam colapsados. Clicar no header do tema → renderiza só os cards
  // daquele tema (com paginação 50/page se >50). Clicar de novo → colapsa
  // e limpa innerHTML (libera memória). Disciplinas também são colapsáveis.
  async function flashcards(items, bodyEl, lessonName){
    const lesson = U.realLessonName(lessonName || (items[0] && items[0].name) || 'Aula');
    const urlPath = U.lessonKey();
    // ★ FIX-MEGGY (Task 20-7 #8): use pre-indexed cache instead of re-reading
    //   localStorage + re-grouping O(N) on every render. Cache is invalidated
    //   after every write (see _invalidateCardsIndex calls in saveNewCard,
    //   deleteCard, gradeCard, addCardsBatch, manual addBtn chain).
    const { allCards, grouped, disciplines, totalDue } = _getCardsIndex();

    // ── Empty state ──
    if(!allCards.length){
      bodyEl.innerHTML = `
        <div class="gdi-mat-isa-result gdi-fc-library">
          <div class="gdi-fc-empty">
            <div class="gdi-fc-empty-icon">🃏</div>
            <h3>Nenhum flashcard ainda</h3>
            <p>Os flashcards são criados automaticamente quando a Meggy gera resumos, questões ou pílulas das aulas. Você também pode adicionar manualmente abaixo.</p>
            <button id="gdi-fc-gen-btn" class="gdi-btn gdi-btn-primary">
              <i class="bi bi-stars"></i> Gerar com a Meggy
            </button>
            <div class="gdi-fc-manual-wrap">
              <button id="gdi-fc-manual-toggle" class="gdi-mode-btn">
                <i class="bi bi-plus-lg"></i> Adicionar manualmente
              </button>
              <div id="gdi-fc-manual-form" style="display:none;">
                <input id="gdi-fc-manual-f" placeholder="Frente (pergunta)" />
                <input id="gdi-fc-manual-b" placeholder="Verso (resposta)" />
                <button id="gdi-fc-manual-add" class="gdi-btn gdi-btn-primary">
                  <i class="bi bi-check-lg"></i> Salvar flashcard
                </button>
              </div>
            </div>
          </div>
        </div>`;
      const genBtn = bodyEl.querySelector('#gdi-fc-gen-btn');
      if(genBtn) genBtn.onclick = async ()=>{
        if(window.gdiIsaPdf && window.gdiIsaPdf.summary){
          showToast('Meggy está preparando resumo + questões + pílulas + flashcards…');
          // Mostra loading no próprio bodyEl
          U.setLoading(bodyEl, 'Meggy está lendo os PDFs e criando flashcards automaticamente…');
          try{
            // Chama generateAll indiretamente via summary — os flashcards
            // são criados como side-effect (autoCreateFlashcards).
            await window.gdiIsaPdf.summary(items, bodyEl, lessonName);
            // Após gerar, volta para a biblioteca de flashcards
            setTimeout(()=>flashcards(items, bodyEl, lessonName), 300);
          }catch(e){
            U.setError(bodyEl, e.message);
            // Após erro, também volta para a biblioteca
            setTimeout(()=>flashcards(items, bodyEl, lessonName), 1500);
          }
        } else {
          showToast('Módulo Meggy indisponível');
        }
      };
      const toggleBtn = bodyEl.querySelector('#gdi-fc-manual-toggle');
      const formEl = bodyEl.querySelector('#gdi-fc-manual-form');
      if(toggleBtn) toggleBtn.onclick = ()=>{
        const open = formEl.style.display !== 'none';
        formEl.style.display = open ? 'none' : 'block';
        toggleBtn.innerHTML = open
          ? '<i class="bi bi-plus-lg"></i> Adicionar manualmente'
          : '<i class="bi bi-dash-lg"></i> Fechar formulário';
      };
      const addBtn = bodyEl.querySelector('#gdi-fc-manual-add');
      if(addBtn) addBtn.onclick = ()=>{
        // ★ FIX-MEGGY (Task 20-7 #9): cap f and b at 500 chars to prevent
        //   localStorage bloat (1000 cards × unbounded text could exceed quota).
        const f = String(bodyEl.querySelector('#gdi-fc-manual-f').value||'').trim().slice(0,500);
        const b = String(bodyEl.querySelector('#gdi-fc-manual-b').value||'').trim().slice(0,500);
        if(!f || !b){ showToast('Preencha frente e verso'); return; }
        // ★ v1.0.99: route through _cardsWriteChain + cap 1000
        _cardsWriteChain = _cardsWriteChain.then(() => {
          const cards = U.lsGet('gdi-cards-v1', []);
          cards.push({id:U.uid(), f, b, due:Date.now()+86400000, box:0, src:'manual:'+lesson, path:urlPath, lesson:lesson, createdAt:Date.now()});
          if(cards.length > 1000) cards.splice(0, cards.length - 1000);
          U.lsSet('gdi-cards-v1', cards);
          // ★ FIX-MEGGY (Task 20-7 #8): invalidate pre-indexed cache after write
          _invalidateCardsIndex();
        }).catch(e=>console.warn('[Meggy] addCard chain error:', e&&e.message));
        showToast('Flashcard adicionado!');
        flashcards(items, bodyEl, lessonName);
      };
      return;
    }

    // ── Library header ──
    bodyEl.innerHTML = `
      <div class="gdi-mat-isa-result gdi-fc-library">
        <div class="gdi-fc-library-head">
          <div class="gdi-fc-library-title">
            <i class="bi bi-card-text"></i>
            <div>
              <b>Biblioteca de Flashcards</b>
              <span>${allCards.length} cards em ${disciplines.length} disciplina${disciplines.length>1?'s':''} · ${totalDue} p/ revisar</span>
            </div>
          </div>
          <div class="gdi-fc-library-actions">
            ${totalDue ? `<button id="gdi-fc-study-due" class="gdi-btn gdi-btn-primary"><i class="bi bi-play-fill"></i> Revisar (${totalDue})</button>` : ''}
            <button id="gdi-fc-study-all" class="gdi-mode-btn"><i class="bi bi-collection"></i> Estudar todos</button>
            <button id="gdi-fc-add-toggle" class="gdi-mode-btn" title="Adicionar flashcard"><i class="bi bi-plus-lg"></i></button>
          </div>
        </div>
        <div id="gdi-fc-add-form" class="gdi-fc-add-form" style="display:none;flex-direction:column;gap:8px;">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <select id="gdi-fc-add-subject" style="background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:8px 10px;font-size:13px;font-family:inherit;flex:1;min-width:140px;">
              <option value="">Matéria (opcional)</option>
            </select>
            <input id="gdi-fc-add-theme" placeholder="Tema (opcional)" style="background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:8px 10px;font-size:13px;font-family:inherit;flex:1;min-width:140px;" />
          </div>
          <input id="gdi-fc-add-f" placeholder="Frente (pergunta)" style="background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:8px 10px;font-size:13px;font-family:inherit;width:100%;box-sizing:border-box;" />
          <input id="gdi-fc-add-b" placeholder="Verso (resposta)" style="background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:8px 10px;font-size:13px;font-family:inherit;width:100%;box-sizing:border-box;" />
          <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button id="gdi-fc-add-save" class="gdi-btn gdi-btn-primary" style="font-size:12px;"><i class="bi bi-check-lg"></i> Salvar</button>
            <button id="gdi-fc-add-save-next" class="gdi-mode-btn" style="font-size:12px;"><i class="bi bi-plus-lg"></i> Salvar e adicionar próximo</button>
          </div>
        </div>
        <div class="gdi-fc-disciplines"></div>
      </div>`;

    const discWrap = bodyEl.querySelector('.gdi-fc-disciplines');

    // ═══ PATCH E: Render disciplines → themes HEADERS ONLY (collapsed, no card HTML) ═══
    // Os cards só são renderizados quando o tema é expandido (lazy).
    disciplines.forEach((disc, di)=>{
      const themes = grouped[disc];
      const themeKeys = Object.keys(themes).sort((a,b)=>a.localeCompare(b,'pt-BR'));
      const discCount = themeKeys.reduce((s,t)=>s+themes[t].length, 0);
      const discDue = themeKeys.reduce((s,t)=>s+themes[t].filter(c=>(c.due||0)<=Date.now()).length, 0);

      const discEl = document.createElement('div');
      discEl.className = 'gdi-fc-discipline';
      discEl.innerHTML = `
        <div class="gdi-fc-disc-head" data-disc-idx="${di}">
          <i class="bi bi-chevron-down gdi-fc-chevron gdi-fc-rotated"></i>
          <i class="bi bi-folder-fill gdi-fc-disc-icon"></i>
          <b class="gdi-fc-disc-name">${U.esc(disc)}</b>
          <span class="gdi-fc-disc-meta">${discCount} cards · ${themeKeys.length} tema${themeKeys.length>1?'s':''}${discDue?` · <b class="gdi-fc-due">${discDue} p/ revisar</b>`:''}</span>
        </div>
        <div class="gdi-fc-disc-body" style="display:none;"></div>`;

      // renderiza apenas os HEADERS de cada tema (corpo vazio, preenchido sob demanda)
      const discBody = discEl.querySelector('.gdi-fc-disc-body');
      themeKeys.forEach((theme, ti)=>{
        const cardsT = themes[theme];
        const dueT = cardsT.filter(c=>(c.due||0)<=Date.now()).length;
        const themeEl = document.createElement('div');
        themeEl.className = 'gdi-fc-theme';
        themeEl.innerHTML = `
          <div class="gdi-fc-theme-head" data-disc-idx="${di}" data-theme-idx="${ti}">
            <i class="bi bi-chevron-down gdi-fc-chevron gdi-fc-rotated"></i>
            <i class="bi bi-bookmark-fill gdi-fc-theme-icon"></i>
            <b class="gdi-fc-theme-name">${U.esc(theme)}</b>
            <span class="gdi-fc-theme-meta">${cardsT.length} cards${dueT?` · <b class="gdi-fc-due">${dueT} p/ revisar</b>`:''}</span>
            <button class="gdi-mode-btn gdi-fc-theme-study" data-disc-idx="${di}" data-theme-idx="${ti}" title="Estudar este tema">
              <i class="bi bi-play-fill"></i>
            </button>
          </div>
          <div class="gdi-fc-theme-body" style="display:none;"></div>`;
        discBody.appendChild(themeEl);
      });

      discWrap.appendChild(discEl);
    });

    // ═══ PATCH E: Discipline expand/collapse (themes dentro já são collapsed) ═══
    discWrap.querySelectorAll('.gdi-fc-disc-head').forEach(h=>{
      h.onclick = (e)=>{
        e.stopPropagation();
        const body = h.nextElementSibling;
        const chevron = h.querySelector('.gdi-fc-chevron');
        const isOpen = body.style.display !== 'none';
        if(isOpen){
          body.style.display = 'none';
          chevron.classList.add('gdi-fc-rotated');
        }else{
          body.style.display = 'block';
          chevron.classList.remove('gdi-fc-rotated');
        }
      };
    });

    // ═══ PATCH E: Theme expand/collapse — LAZY render + free memory on collapse ═══
    discWrap.querySelectorAll('.gdi-fc-theme-head').forEach(h=>{
      h.onclick = (e)=>{
        if(e.target.closest('.gdi-fc-theme-study')) return;
        e.stopPropagation();
        const body = h.nextElementSibling;
        const chevron = h.querySelector('.gdi-fc-chevron');
        const isOpen = body.style.display !== 'none';
        if(isOpen){
          // colapsa + libera memória (limpa innerHTML)
          body.style.display = 'none';
          body.innerHTML = '';
          body.dataset.rendered = '';
          chevron.classList.add('gdi-fc-rotated');
        }else{
          body.style.display = 'block';
          chevron.classList.remove('gdi-fc-rotated');
          // lazy render: só monta os cards na primeira abertura
          if(body.dataset.rendered !== '1'){
            const di = +h.dataset.discIdx;
            const ti = +h.dataset.themeIdx;
            const disc = disciplines[di];
            const theme = Object.keys(grouped[disc]).sort((a,b)=>a.localeCompare(b,'pt-BR'))[ti];
            const cardsT = grouped[disc][theme];
            renderThemeCardsPaginated(body, cardsT, items, bodyEl, lessonName);
            body.dataset.rendered = '1';
          }
        }
      };
    });

    // ── Theme study (botão play) ──
    discWrap.querySelectorAll('.gdi-fc-theme-study').forEach(btn=>{
      btn.onclick = (e)=>{
        e.stopPropagation();
        const di = +btn.dataset.discIdx;
        const ti = +btn.dataset.themeIdx;
        const disc = disciplines[di];
        const theme = Object.keys(grouped[disc]).sort((a,b)=>a.localeCompare(b,'pt-BR'))[ti];
        const queue = grouped[disc][theme].filter(c=>(c.due||0)<=Date.now());
        const fullQueue = grouped[disc][theme];
        runFlashcardSession(bodyEl, `${disc} · ${theme}`, queue.length ? queue : fullQueue, items, lessonName);
      };
    });

    // ── Study all due / all cards ──
    const studyDue = bodyEl.querySelector('#gdi-fc-study-due');
    if(studyDue) studyDue.onclick = ()=>{
      const queue = allCards.filter(c=>(c.due||0)<=Date.now());
      if(queue.length) runFlashcardSession(bodyEl, 'Revisão geral', queue, items, lessonName);
      else showToast('Nenhum card vencido hoje');
    };
    const studyAll = bodyEl.querySelector('#gdi-fc-study-all');
    if(studyAll) studyAll.onclick = ()=>{
      runFlashcardSession(bodyEl, 'Todos os flashcards', allCards.slice(0, 30), items, lessonName);
    };

    // ── Add form toggle ──
    const addToggle = bodyEl.querySelector('#gdi-fc-add-toggle');
    const addForm = bodyEl.querySelector('#gdi-fc-add-form');
    // ★ popula select de matérias
    const subjectSel = bodyEl.querySelector('#gdi-fc-add-subject');
    if(subjectSel && window.gdiSubjects){
      const subs=window.gdiSubjects.get();
      subs.forEach(s=>{
        const opt=document.createElement('option');
        opt.value=s.name;
        opt.textContent=(s.icon||'')+s.name;
        subjectSel.appendChild(opt);
      });
    }
    if(addToggle) addToggle.onclick = ()=>{
      const open = addForm.style.display !== 'none';
      addForm.style.display = open ? 'none' : 'flex';
      if(!open){
        const fEl=bodyEl.querySelector('#gdi-fc-add-f');
        if(fEl)setTimeout(()=>fEl.focus(),50);
      }
    };
    function saveNewCard(keepForm){
      const fEl=bodyEl.querySelector('#gdi-fc-add-f');
      const bEl=bodyEl.querySelector('#gdi-fc-add-b');
      const subjEl=bodyEl.querySelector('#gdi-fc-add-subject');
      const themeEl=bodyEl.querySelector('#gdi-fc-add-theme');
      if(!fEl||!bEl){return;}
      // ★ FIX-MEGGY (Task 20-7 #9): cap f and b at 500 chars to prevent
      //   localStorage bloat and avoid QuotaExceededError on the 1000-card cap.
      const f=String(fEl.value||'').trim().slice(0,500);
      const b=String(bEl.value||'').trim().slice(0,500);
      if(!f||!b){ showToast('Preencha frente e verso'); return; }
      const subject=subjEl?subjEl.value.trim():'';
      const theme=themeEl?themeEl.value.trim():'';
      const cardData={
        id:U.uid(), f, b,
        due:Date.now()+86400000,
        box:0,
        src:'manual:'+lesson,
        path:urlPath,
        lesson:lesson,
        createdAt:Date.now()
      };
      if(subject)cardData.subject=subject;
      if(theme)cardData.theme=theme;
      // ★ v1.0.99: route through _cardsWriteChain + cap 1000
      _cardsWriteChain = _cardsWriteChain.then(() => {
        const cards = U.lsGet('gdi-cards-v1', []);
        cards.push(cardData);
        if(cards.length > 1000) cards.splice(0, cards.length - 1000);
        U.lsSet('gdi-cards-v1', cards);
        // ★ FIX-MEGGY (Task 20-7 #8): invalidate pre-indexed cache after write
        _invalidateCardsIndex();
      }).catch(e=>console.warn('[Meggy] saveNewCard chain error:', e&&e.message));
      showToast('Flashcard adicionado!');
      if(keepForm){
        fEl.value='';bEl.value='';
        fEl.focus();
        // re-renderiza a lista mantendo o formulário aberto
        flashcards(items, bodyEl, lessonName);
        // re-abre o form (flashcards re-renderizou fechado)
        setTimeout(()=>{
          const newForm=bodyEl.querySelector('#gdi-fc-add-form');
          const newToggle=bodyEl.querySelector('#gdi-fc-add-toggle');
          if(newForm)newForm.style.display='flex';
          // restaurar subject/theme selecionados
          const newSubj=bodyEl.querySelector('#gdi-fc-add-subject');
          const newTheme=bodyEl.querySelector('#gdi-fc-add-theme');
          if(newSubj&&subject)newSubj.value=subject;
          if(newTheme)newTheme.value=theme;
          const newF=bodyEl.querySelector('#gdi-fc-add-f');
          if(newF)newF.focus();
        },100);
      }else{
        flashcards(items, bodyEl, lessonName);
      }
    }
    const addSave = bodyEl.querySelector('#gdi-fc-add-save');
    if(addSave) addSave.onclick = ()=>saveNewCard(false);
    const addSaveNext = bodyEl.querySelector('#gdi-fc-add-save-next');
    if(addSaveNext) addSaveNext.onclick = ()=>saveNewCard(true);
    // ★ Enter no campo "verso" salva e adiciona próximo
    const addB=bodyEl.querySelector('#gdi-fc-add-b');
    if(addB)addB.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();saveNewCard(true);}});
  }

  // ═══ PATCH E: Renderizador paginado de cards de um tema ═══
  // Renderiza até PAGE_SIZE cards por vez. Se o tema tem mais, mostra botão
  // "Carregar mais". Re-vincula flip/delete a cada página.
  function renderThemeCardsPaginated(body, cards, items, bodyEl, lessonName){
    const PAGE_SIZE = 50;
    let visible = Math.min(PAGE_SIZE, cards.length);

    function renderPage(){
      const slice = cards.slice(0, visible);
      body.innerHTML = `
        <div class="gdi-fc-grid">
          ${slice.map(c=>`
            <div class="gdi-fc-card" data-card-id="${U.esc(c.id)}">
              <div class="gdi-fc-card-inner">
                <div class="gdi-fc-card-face gdi-fc-card-front">
                  <div class="gdi-fc-card-label"><i class="bi bi-question-circle"></i> PERGUNTA</div>
                  <div class="gdi-fc-card-text">${U.esc(String(c.f).slice(0,300))}</div>
                  <div class="gdi-fc-card-hint"><i class="bi bi-arrow-repeat"></i> clique para virar</div>
                </div>
                <div class="gdi-fc-card-face gdi-fc-card-back">
                  <div class="gdi-fc-card-label"><i class="bi bi-check-circle"></i> RESPOSTA</div>
                  <div class="gdi-fc-card-text">${U.esc(String(c.b).slice(0,400))}</div>
                  <div class="gdi-fc-card-hint"><i class="bi bi-arrow-repeat"></i> clique para voltar</div>
                </div>
              </div>
              <button class="gdi-fc-card-del" data-card-id="${U.esc(c.id)}" title="Excluir">
                <i class="bi bi-x-lg"></i>
              </button>
            </div>
          `).join('')}
        </div>
        ${cards.length > visible ? `
          <div style="text-align:center;">
            <button class="gdi-fc-load-more" type="button">
              <i class="bi bi-three-dots"></i> Carregar mais (${cards.length - visible} restantes)
            </button>
          </div>
        ` : ''}`;

      // re-vincula flip
      body.querySelectorAll('.gdi-fc-card').forEach(card=>{
        card.onclick = (e)=>{
          if(e.target.closest('.gdi-fc-card-del')) return;
          e.stopPropagation();
          card.classList.toggle('gdi-fc-flipped');
        };
      });
      // re-vincula delete
      body.querySelectorAll('.gdi-fc-card-del').forEach(btn=>{
        btn.onclick = (e)=>{
          e.stopPropagation();
          const id = btn.dataset.cardId;
          // ★ v1.0.99: route through _cardsWriteChain
          _cardsWriteChain = _cardsWriteChain.then(() => {
            const cards2 = U.lsGet('gdi-cards-v1', []);
            U.lsSet('gdi-cards-v1', cards2.filter(x=>x.id !== id));
            // ★ FIX-MEGGY (Task 20-7 #8): invalidate pre-indexed cache after delete
            _invalidateCardsIndex();
          }).catch(e=>console.warn('[Meggy] deleteCard chain error:', e&&e.message));
          showToast('Flashcard excluído');
          flashcards(items, bodyEl, lessonName);
        };
      });
      // botão carregar mais
      const moreBtn = body.querySelector('.gdi-fc-load-more');
      if(moreBtn){
        moreBtn.onclick = (e)=>{
          e.stopPropagation();
          visible = Math.min(visible + PAGE_SIZE, cards.length);
          renderPage();
        };
      }
    }
    renderPage();
  }

  // ── Sessão de estudo de flashcards (vira o card) ──
  // ★FIX v2: usa o mesmo design flip 3D da biblioteca — visual consistente.
  function runFlashcardSession(bodyEl,lesson,queue,items,lessonName){
    // ★ guard contra fila vazia (NaN% acerto)
    if(!queue||!queue.length){
      // ★ FIX-MEGGY (Task 20-7 #11): also show a toast so the user gets
      //   immediate feedback (the empty-state UI below is the in-panel
      //   affordance, but a toast confirms why nothing happened when they
      //   clicked "Estudar" / "Revisar").
      if(typeof showToast === 'function') showToast('Nenhum flashcard para estudar nesta disciplina/tema');
      bodyEl.innerHTML=`<div class="gdi-mat-isa-result" style="text-align:center;padding:30px;">
        <div style="font-size:48px;">📭</div>
        <h3 style="color:var(--ferreto-primary,#ff8b9f);font-family:var(--ferreto-font-display,'Poppins',sans-serif);">Nenhum flashcard</h3>
        <p style="color:var(--ferreto-text-muted,#8b949e);font-size:13px;margin-top:8px;">Esta disciplina/tema não tem cards para estudar.</p>
        <button id="gdi-fc-back-list" class="gdi-btn gdi-btn-primary" style="margin-top:14px;"><i class="bi bi-arrow-left"></i> Voltar aos flashcards</button>
      </div>`;
      const back=bodyEl.querySelector('#gdi-fc-back-list');
      if(back)back.onclick=()=>flashcards(items,bodyEl,lessonName);
      return;
    }
    let idx=0,hits=0,misses=0;
    function draw(){
      if(idx>=queue.length){
        const pct=queue.length?Math.round(hits/queue.length*100):0;
        bodyEl.innerHTML=`<div class="gdi-mat-isa-result" style="max-width:760px;text-align:center;">
          <div style="font-size:48px;">${pct>=60?'🎉':'📚'}</div>
          <h3 style="color:var(--ferreto-primary,#ff8b9f);font-family:var(--ferreto-font-display,'Poppins',sans-serif);">Sessão concluída!</h3>
          <p style="color:var(--ferreto-text,#e6edf3);font-size:16px;margin-top:8px;"><b style="color:${pct>=60?'#3fb950':'#ff8b8b'};">${hits}/${queue.length}</b> · ${pct}% acerto</p>
          <p style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;margin-top:4px;">${U.esc(lesson)}</p>
          <button id="gdi-fc-back-list" class="gdi-btn gdi-btn-primary" style="margin-top:14px;"><i class="bi bi-arrow-left"></i> Voltar aos flashcards</button>
        </div>`;
        const back=bodyEl.querySelector('#gdi-fc-back-list');
        if(back)back.onclick=()=>flashcards(items,bodyEl,lessonName);
        return;
      }
      const c=queue[idx];
      bodyEl.innerHTML=`<div class="gdi-fc-session">
        <div class="gdi-fc-session-head">
          <span>${U.esc(lesson)} · ${idx+1}/${queue.length}</span>
          <span>✓ ${hits} ✗ ${misses}</span>
        </div>
        <div class="gdi-fc-session-stage">
          <div class="gdi-fc-card gdi-fc-card-large" id="gdi-fc-card">
            <div class="gdi-fc-card-inner">
              <div class="gdi-fc-card-face gdi-fc-card-front">
                <div class="gdi-fc-card-label"><i class="bi bi-question-circle"></i> PERGUNTA</div>
                <div class="gdi-fc-card-text">${U.esc(c.f)}</div>
                <div class="gdi-fc-card-hint"><i class="bi bi-arrow-repeat"></i> clique para virar</div>
              </div>
              <div class="gdi-fc-card-face gdi-fc-card-back">
                <div class="gdi-fc-card-label"><i class="bi bi-check-circle"></i> RESPOSTA</div>
                <div class="gdi-fc-card-text">${U.esc(c.b)}</div>
                <div class="gdi-fc-card-hint"><i class="bi bi-arrow-repeat"></i> clique para voltar</div>
              </div>
            </div>
          </div>
        </div>
        <div id="gdi-fc-grade" class="gdi-fc-session-grade" style="display:none;">
          <p>Como foi?</p>
          <div class="gdi-fc-grade-btns">
            <button id="gdi-fc-again" class="gdi-mode-btn gdi-fc-btn-again" title="Não sabia (1)">
              <i class="bi bi-arrow-counterclockwise"></i> Não sabia<br><small>+1d</small>
            </button>
            <button id="gdi-fc-hard" class="gdi-mode-btn gdi-fc-btn-hard" title="Quase (2)">
              <i class="bi bi-dash-circle"></i> Quase<br><small>+3d</small>
            </button>
            <button id="gdi-fc-good" class="gdi-btn gdi-btn-primary gdi-fc-btn-good" title="Sabia (3)">
              <i class="bi bi-check-circle"></i> Sabia<br><small>+${window.gdiSrsIntervals?window.gdiSrsIntervals[1]:3}d</small>
            </button>
            <button id="gdi-fc-easy" class="gdi-mode-btn gdi-fc-btn-easy" title="Fácil (4)">
              <i class="bi bi-stars"></i> Fácil<br><small>+${Math.round((window.gdiSrsIntervals?window.gdiSrsIntervals[2]:7)*1.5)}d</small>
            </button>
          </div>
          <p style="font-size:10px;color:var(--ferreto-text-muted,#8b949e);margin-top:8px;">Atalhos: 1 2 3 4 · Espaço vira</p>
        </div>
        <!-- ★ FIX-MEGGY (Task 20-7 #14) VERIFICATION: the SRS intervals shown
             above are NOT hardcoded as [1,7,30] — they come from
             window.gdiSrsIntervals (defined in gdi-core.js as [1,3,7,21,60]).
             The fallback values 3 (for Good) and 7 (for Easy) are only used
             when gdiSrsIntervals is undefined (gdi-core.js failed to load).
             The SM-2 logic itself lives in window.gdiGradeCard (also in
             gdi-core.js): it caps the card box at 4 and NEVER auto-deletes
             cards when nb>3 — this is correct SM-2 behavior (cards graduate
             to higher intervals via box+1 on Good, box+2 on Easy; they are
             only deleted by explicit user action via the trash button in
             the library). No code change needed — this comment is the
             audit per Task 20-7 #14. -->
        <div class="gdi-fc-session-foot">
          <button id="gdi-fc-skip" title="Pular" class="gdi-fc-skip-btn"><i class="bi bi-arrow-right"></i></button>
        </div>
      </div>`;
      // vira o card ao clicar
      const card=bodyEl.querySelector('#gdi-fc-card');
      const grade=bodyEl.querySelector('#gdi-fc-grade');
      let flipped=false;
      // ★ FIX-MEGGY #4 (Agent 16 UIUX-14): null check before assigning onclick —
      //   throws if `#gdi-fc-card` is missing from the template (defensive).
      if(card){
        card.onclick=()=>{
          if(flipped)return;flipped=true;
          card.classList.add('gdi-fc-flipped');
          if(grade) grade.style.display='block';
          // foca no botão "Good" para Enter funcionar
          const goodBtn=bodyEl.querySelector('#gdi-fc-good');
          if(goodBtn)setTimeout(()=>goodBtn.focus(),100);
        };
      }
      // ★ SRS unificado via gdiGradeCard (SM-2 simplificado)
      const gradeCard=(quality)=>{
        // ★ v1.0.99: route through _cardsWriteChain
        // ★ FIX-MEGGY #1 (Agent 5 R8 / Agent 13 Bug 13-4): hoist cardCount
        //   so the achievement check (which runs synchronously after scheduling
        //   the chain) doesn't referenceError on `cards` (scoped to .then()).
        // ★ CYCLE2-10 (Agent 10): READ cardCount synchronously from LS BEFORE
        //   scheduling the chain. The previous code hoisted `let cardCount=0`
        //   to the closure and assigned it INSIDE .then (`cardCount=cards.length`)
        //   — but the achievement check below runs synchronously AFTER scheduling
        //   the chain, so `cardCount` was ALWAYS 0 when read (the .then callback
        //   hadn't run yet). gradeCard only mutates an existing card's box/due
        //   (gdiGradeCard), so the count is identical before/after the async
        //   chain — reading synchronously gives the actual count.
        let cardCount = 0;
        try { cardCount = U.lsGet('gdi-cards-v1', []).length; } catch(_) {}
        _cardsWriteChain = _cardsWriteChain.then(() => {
          const cards=U.lsGet('gdi-cards-v1',[]);
          const ci=cards.findIndex(x=>x.id===c.id);
          if(ci>=0){
            // ★ FIX-MEGGY (Task 20-7 #10): null-check window.gdiGradeCard
            //   before calling. If gdi-core.js failed to load (CDN outage,
            //   module eval error, etc.), gdiGradeCard is undefined and the
            //   call would throw — rejecting the entire _cardsWriteChain and
            //   breaking ALL subsequent card writes (add/delete/grade) until
            //   page reload. Now we skip the SRS update and warn, leaving
            //   the card's box/due unchanged (it'll come back tomorrow on
            //   the default +1d schedule from when it was created).
            if(typeof window.gdiGradeCard === 'function'){
              const result=window.gdiGradeCard(cards[ci],quality);
              cards[ci].box=result.box;
              cards[ci].due=result.due;
              cards[ci].lastReview=result.lastReview;
              U.lsSet('gdi-cards-v1',cards);
            }else{
              console.warn('[Meggy] window.gdiGradeCard not available; SRS update skipped for card', c.id);
            }
          }
          // ★ CYCLE2-10: removed `cardCount = cards.length;` — see note above
          //   (synchronous read before the chain gives the same value).
          // ★ FIX-MEGGY (Task 20-7 #8): invalidate pre-indexed cache after grade
          _invalidateCardsIndex();
        }).catch(e=>console.warn('[Meggy] gradeCard chain error:', e&&e.message));
        if(quality===1)misses++;      // Again
        else if(quality===3)hits++;   // Good
        else if(quality===4)hits++;   // Easy
        // ★ contador de cards estudados (para conquistas)
        try{
          const n=parseInt(localStorage.getItem('gdi-cards-studied-count')||'0')+1;
          localStorage.setItem('gdi-cards-studied-count',String(n));
          // dispara checagem de conquistas
          if(window.gdiAchievements){
            window.gdiAchievements.checkAll({cardsStudied:n,cardsCreated:cardCount});
          }
        }catch(_){}
        idx++;draw();
      };
      bodyEl.querySelector('#gdi-fc-again').onclick=()=>gradeCard(1);
      bodyEl.querySelector('#gdi-fc-hard').onclick=()=>gradeCard(2);
      bodyEl.querySelector('#gdi-fc-good').onclick=()=>gradeCard(3);
      bodyEl.querySelector('#gdi-fc-easy').onclick=()=>gradeCard(4);
      // pular
      bodyEl.querySelector('#gdi-fc-skip').onclick=()=>{idx++;draw();};
      // ★ atalhos de teclado (1/2/3/4 + espaço para virar)
      const keyHandler=(e)=>{
        // ★ FIX-MEGGY #2 (Agent 16 UIUX-2): bail when panel is hidden/closed —
        //   otherwise keyHandler keeps firing on hidden panels and grades cards
        //   the user can't see (also a memory leak).
        if(!bodyEl || !bodyEl.offsetParent) return;
        if(!grade.style.display||grade.style.display==='none'){
          if(e.code==='Space'){e.preventDefault();if(card)card.click();}
          return;
        }
        if(e.key==='1'){e.preventDefault();gradeCard(1);}
        else if(e.key==='2'){e.preventDefault();gradeCard(2);}
        else if(e.key==='3'){e.preventDefault();gradeCard(3);}
        else if(e.key==='4'){e.preventDefault();gradeCard(4);}
      };
      document.addEventListener('keydown',keyHandler);
      // limpar listener ao trocar de card (guarda para cleanup)
      if(!bodyEl.__fcKeyCleanup){
        bodyEl.__fcKeyCleanup=()=>{
          document.removeEventListener('keydown',keyHandler);
        };
      }else{
        bodyEl.__fcKeyCleanup();
        bodyEl.__fcKeyCleanup=()=>{
          document.removeEventListener('keydown',keyHandler);
        };
      }
    }
    // ★ v80-FIX-MEGGY BUG 4: track this session's bodyEl so the module-level
    //    Bus.onGlobal('page:change', _fcPageCleanup) listener (registered ONCE
    //    at IIFE init — see FIX-MEGGY #3) can clean up its keyHandler when the
    //    user navigates away mid-session. The closure no-ops once
    //    __fcKeyCleanup is null (set when the session ends naturally via the
    //    _origDraw wrapper below).
    _activeFcSessions.add(bodyEl);
    // ★ FIX-MEGGY (Task 20-7 #12): ensure the shared close-observer is active
    //   so the bodyEl is evicted from _activeFcSessions if the M9 panel is
    //   closed (X button / ESC) without finishing the session. The page:change
    //   cleanup only fires on navigation, not on panel close — without this,
    //   the bodyEl + its keydown listener leak until the next page change.
    _ensureFcCloseObserver();
    draw();
    // cleanup final quando sessão terminar (idx>=queue.length)
    const _origDraw=draw;
    draw=function(){
      _origDraw();
      if(idx>=queue.length&&bodyEl.__fcKeyCleanup){
        bodyEl.__fcKeyCleanup();
        bodyEl.__fcKeyCleanup=null;
        _activeFcSessions.delete(bodyEl);
      }
    };
  }

  // ── Namespace exports ──
  window.__gdiMeggy.flashcards = {
    flashcards,
    renderThemeCardsPaginated,
    runFlashcardSession,
    extractDisciplineTheme,
    normPath,
    stripExt,
    getSubjects,
    saveSubject,
    deleteSubject,
    // ★ FIX-MEGGY #5 (Agent 5 R4 / Agent 14 Bug 5): expose a batch-add method
    //   that serializes through _cardsWriteChain, so other modules (e.g.
    //   meggy-cache.js:autoCreateFlashcards) can append cards without racing
    //   with the library's own writes (which would silently lose data on
    //   concurrent last-write-wins).
    addCardsBatch(cardsArray){
      if(!Array.isArray(cardsArray) || cardsArray.length===0) return _cardsWriteChain;
      _cardsWriteChain = _cardsWriteChain.then(() => {
        const existing = U.lsGet('gdi-cards-v1', []);
        // ★ FIX 20-14 #D (Agent 14): dedup by BOTH id AND front-text (f).
        //   Previously dedup was id-only, but autoCreateFlashcards generates
        //   fresh U.uid() IDs on every call — so the same lesson visited twice
        //   (e.g. navigate away → back, or page reload) would produce cards
        //   with different IDs but identical f/b text. id-only dedup let them
        //   through, creating duplicate flashcards that accumulated up to the
        //   1000-card cap. The fallback path in autoCreateFlashcards (when
        //   this module isn't loaded yet) already dedups by f — this aligns
        //   addCardsBatch with that behaviour. Build a Set of existing fronts
        //   for O(1) lookup.
        const existingFronts = new Set();
        // ★ CYCLE-10 (Agent 10): also build an id-Set for O(1) id lookup.
        //   Previously the id-based dedup used `existing.some(x=>x.id===c.id)`
        //   (O(N) per incoming card) — with N=1000 existing cards and M=10
        //   incoming, that was 10k comparisons per batch. The old comment
        //   claimed "cheap Set lookup on a second Set" but the code never
        //   built the second Set. Now we do, making BOTH dedup checks O(1).
        const existingIds = new Set();
        for(const x of existing){
          if(!x) continue;
          if(x.f) existingFronts.add(String(x.f));
          if(x.id) existingIds.add(String(x.id));
        }
        let added = 0;
        for(const c of cardsArray){
          if(!c || !c.id) continue;
          // id-based dedup — O(1) Set lookup
          if(existingIds.has(String(c.id))) continue;
          // f-based dedup — prevents duplicate-content flashcards (O(1) Set lookup)
          const front = String(c.f||'');
          if(front && existingFronts.has(front)) continue;
          existing.push(c);
          existingIds.add(String(c.id));
          if(front) existingFronts.add(front);
          added++;
        }
        // ★ FIX-MEGGY (Task 20-7 #9): cap f/b length on incoming batch cards
        //   too (autoCreateFlashcards in meggy-cache.js can pass long statements)
        //   and enforce the 1000-card cap (was missing — could grow unbounded
        //   via autoCreateFlashcards from cached questions).
        for(const c of existing){
          if(c){ c.f = String(c.f||'').slice(0,500); c.b = String(c.b||'').slice(0,500); }
        }
        if(existing.length > 1000) existing.splice(0, existing.length - 1000);
        U.lsSet('gdi-cards-v1', existing);
        // ★ FIX-MEGGY (Task 20-7 #8): invalidate pre-indexed cache after batch add
        _invalidateCardsIndex();
        if(added < cardsArray.length){
          console.info('[Meggy] addCardsBatch: added '+added+' of '+cardsArray.length+' cards ('+(cardsArray.length-added)+' duplicates skipped by id/f dedup)');
        }
      }).catch(e=>console.warn('[Meggy] addCardsBatch chain error:', e&&e.message));
      return _cardsWriteChain;
    }
  };

  // ── Aliases para compatibilidade ──
  // window.gdiSubjects já foi definido acima (preserved for gdi-study.js callers)

  console.log('[GDI Extras] meggy-flashcards ativo (Module 5/7)');
})();
