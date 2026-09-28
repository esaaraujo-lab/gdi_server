// ═══════════════════════════════════════════════════════════════
// study-courses.js — Course management (collect, add, browse, detail)
//
// Split from gdi-study.js (v1.0.86 modularization, Task v86-MOD-STUDY).
// Carved out of IIFE #2 "M22 — Área do Aluno" (lines 739-3805).
//
// Owns: utils (dec/norm/low/stripExt/lsGet/lsSet/esc/fmtMin/dayKey/dateBr),
//       ensureState/stateD/watchedLow/courseKeyOf/courseName/driveNameOf,
//       collectCourses/hideCourse/unhideCourse/listHiddenCourses,
//       GW/isGeneric/realName, vCache/vCacheGet/vCacheSet/exists/ghost/bestInCache/bestIn,
//       cleanCourseName, renderCursos/renderCourseCard, showAddCourseModal,
//       showHiddenCoursesModal, openCourseDetail, Bus.onGlobal('watched:changed')
//
// Namespace: window.__gdiStudy.courses = {
//                collectCourses, gdiAddCourseFromDrive, syncCoursesFromDrive,
//                renderCursos, gdiRefreshCentralPanel, showAddCourseModal,
//                showHiddenCoursesModal, openCourseDetail, bestIn, realName,
//                cleanCourseName, courseName, driveNameOf, hideCourse, unhideCourse,
//                stateD, ensureState, low, norm, dec, esc, lsGet, lsSet
//            }
// Aliases:   window.collectCourses, window.gdiSyncCoursesFromDrive,
//            window.renderCursos, window.gdiRefreshCentralPanel,
//            window.gdiAddCourseFromButton, window.gdiAddCourseFromDrive
// Guard:     window.__gdiStudyCourses (prevents double-init)
// Depends on: window.GDIStorage, window.gdiCourseIdentity, window.gdiCourseScanner,
//             window.gdiListAllFiles, window.gdiGetPw, window.drive_names,
//             window.gdiIsaPdf (startBattalion, extractPdfText),
//             window.gdiModal, window.escHtml, window.showToast, window.Bus
// Late binding (after split):
//   - gdiRefreshCentralPanel uses window.__gdiStudy.state.panel/tab and
//     window.__gdiStudy.panel.renderBody() (defined in study-panel.js which
//     loads LAST). The late binding tolerates panel module not yet loaded.
// Load order: 3rd study module (after scanner, before questions/advanced)
// ═══════════════════════════════════════════════════════════════
(function(){
  if(window.__gdiStudyCourses) return;
  window.__gdiStudyCourses = true;
  window.__gdiStudy = window.__gdiStudy || {};

  const LS_CARDS='gdi-cards-v1',LS_GOAL='gdi-goal-min',LS_WATCH='gdi-watch-v1',LS_MAR='gdi-marathon',LS_MARINTRO='gdi-marathon-intro',LS_HIDDEN='gdi-hidden-courses-v1';
  const log=(...a)=>{try{console.log('[GDI M22]',...a)}catch(_){}};
  const dec=s=>{try{return decodeURIComponent(String(s||''))}catch(_){return String(s||'')}};
  const norm=p=>dec(String(p||'').split('?')[0].replace(/\/+$/,''));
  const low=p=>norm(p).toLowerCase();
  const stripExt=s=>String(s||'').replace(/\.[a-z0-9]{1,5}$/i,'').trim();
  const lsGet=(k,d)=>{try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(_){return d}};
  const lsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){console.warn('[lsSet] failed for',k,':',e&&e.message);if(window.showToast)window.showToast('Armazenamento cheio — não foi possível salvar.')}};
  // ★ FIX: esc local para o M22 (Área do Aluno) — usa escHtml global do app.min.js quando disponível
  const esc=s=>{try{return window.escHtml?window.escHtml(s):String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');}catch(_){return String(s||'');}};
  const fmtMin=m=>{m=Math.round(m);return m>=60?Math.floor(m/60)+'h'+String(m%60).padStart(2,'0'):m+'min'};
  const dayKey=t=>{const d=new Date(t||Date.now());return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
  const dateBr=t=>new Date(t).toLocaleDateString('pt-BR');

  // ═══ HANDLER GLOBAL DE ADICIONAR CURSO (definido no carregamento do módulo) ═══
  // Sempre disponível — não depende de showAddCourseModal ter rodado.
  // Self-contained: usa DOM queries para achar overlay e box, sem closures.
  // Inline onclick chama window.gdiAddCourseFromButton(this).
  // PATCH G: captura via overlay quando modal abre (em showAddCourseModal),
  // removendo o document-level capture listener global.
  window.gdiAddCourseFromButton=async function(btn){
    if(!btn){
      console.error('[AddCourse] botão null');
      return;
    }
    const p=btn.dataset.path||'';
    const n=btn.dataset.name||'Pasta';
    const pdfs=parseInt(btn.dataset.pdfs||'0',10);
    if(!p){
      console.error('[AddCourse] data-path vazio — abortando');
      if(window.showToast)showToast('Erro: pasta não selecionada');
      return;
    }
    // ★ 1) feedback visual imediato
    const originalText=btn.textContent;
    btn.disabled=true;
    btn.style.opacity='0.6';
    btn.style.pointerEvents='none';
    btn.innerHTML='<i class="bi bi-hourglass-split"></i> Adicionando...';
    try{
      // ★ 2) chamar persistência — função global self-contained
      await window.gdiAddCourseFromDrive(p, n, pdfs);
    }catch(err){
      console.error('[AddCourse] ERRO:',err);
      if(window.showToast)showToast('Erro: '+err.message);
      // restaura botão em caso de erro
      btn.disabled=false;
      btn.style.opacity='1';
      btn.style.pointerEvents='auto';
      btn.textContent=originalText;
    }
  };

  // ★ Função global self-contained: adiciona curso do Drive
  window.gdiAddCourseFromDrive=async function(coursePath, courseName, pdfCount){
    // ★ FIX 1 (Task 23): decode URL-encoded courseName defensively.
    // The Add Course modal decodes the folder name before passing it here,
    // BUT legacy localStorage entries (saved before Task 22) may have %20 in
    // the name field. Also, if the modal is bypassed (e.g. by an external
    // caller passing a raw path), courseName may still be URL-encoded.
    // Decoding here is idempotent (decodeURIComponent of an already-decoded
    // string with no %XX sequences is a no-op).
    try{if(courseName&&String(courseName).indexOf('%')>=0)courseName=decodeURIComponent(courseName);}catch(_){}
    // ★ FIX (Task 20-13 #6): normalize coursePath — strip trailing slashes for
    //   consistent storage and duplicate detection. Without this, the same
    //   course could be stored as '/0:/Cursos' AND '/0:/Cursos/' (two entries)
    //   because the alreadyExists check uses strict equality (c.path===coursePath).
    //   The add-course modal's getFolderPath() guarantees a trailing slash on
    //   folder cards, but currentPath (used for the "Selecionar esta pasta"
    //   button data-path) does NOT — drive roots like '/0:/' keep the slash
    //   (normalizeNavPath adds it back) while subfolders like '/0:/Cursos'
    //   lose it (normPath strips, normalizeNavPath doesn't re-add). The
    //   resulting inconsistency made alreadyExists fail for re-adds. The
    //   matching logic in collectCourses/bestIn uses low() which normalizes,
    //   so functionally the course worked — but localStorage grew duplicates.
    //   Normalization here is idempotent and matches the low()/norm() pattern.
    coursePath = String(coursePath||'').replace(/\/+$/,'') || '/';
    const overlay=document.querySelector('.gdi-modal-overlay');
    const box=document.getElementById('gdi-central-body');
    const LS_MANUAL='gdi-manual-courses-v1';
    const lsGet=(k,d)=>{try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(_){return d}};
    const lsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){console.warn('[lsSet] failed for',k,':',e&&e.message);if(window.showToast)window.showToast('Armazenamento cheio — não foi possível salvar.')}};

    try{
      const manual=lsGet(LS_MANUAL,[]);
      // ★ FIX (Task 20-13 #6): compare normalized paths so legacy entries
      //   stored with a trailing slash (e.g. '/0:/Cursos/') still match a
      //   re-add attempt with the slash stripped (or vice-versa). low()
      //   normalizes + lowercases — sufficient for equality check.
      const _normCmp = p => low(p);
      const alreadyExists=manual.some(c=>c&&_normCmp(c.path)===_normCmp(coursePath));

      if(!alreadyExists){
        // ★ 1) SALVA no localStorage — aparece imediatamente na lista do aluno
        // ★ FIX 4 (Task 14): agora também persiste pdfCount, para que colectCourses()
        //    possa exibir totalLessons real (não mais c.lessons.size = paths visitados).
        const courseId='mc-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);
        manual.push({
          id:courseId,name:courseName,icon:'📁',color:'#5ddeda',
          goal:60,notes:'',createdAt:Date.now(),
          manual:true,path:coursePath,courseKey:coursePath,
          pdfCount:pdfCount||0  // ★ FIX 4: total real de aulas (Drive scan)
        });
        lsSet(LS_MANUAL,manual);
        // ★ v1.0.103 FIX (Task 20-5 #9): emit courses:changed so caches
        //   (bestInCache in study-courses.js, _ccCache in study-panel.js)
        //   are invalidated. Without this, the home tile's "Continuar" button
        //   could show stale data after adding a course.
        try{ if(typeof Bus!=='undefined' && Bus.emit) Bus.emit('courses:changed', {}); }catch(_){}
      }

      // ★ 2) POST /api/courses/add — salva em general_courses.json no Drive (compartilhado)
      // Não-bloqueante: se falhar, mostra warning mas continua o fluxo
      // ★ FIX 4 (Task 14): usa window.GDIStorage.saveCourse() para também invalidar
      //    cache de courses (cross-device). Mantém POST direto como fallback.
      try{
        if(window.GDIStorage && typeof window.GDIStorage.saveCourse==='function'){
          // caminho preferido — invalida cache + POST
          window.GDIStorage.saveCourse(coursePath,courseName,pdfCount||0).catch(e=>{
            console.warn('[AddCourse] GDIStorage.saveCourse falhou, tentando POST direto:',e.message);
            // fallback direto
            fetch('/api/courses/add',{method:'POST',headers:{'Content-Type':'application/json'},
              body:JSON.stringify({coursePath,courseName,pdfCount:pdfCount||0,addedAt:Date.now()})
            }).catch(()=>{});
          });
        }else{
          // storage.js indisponível — POST direto
          const r=await fetch('/api/courses/add',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
              coursePath,courseName,
              pdfCount:pdfCount||0,
              addedAt:Date.now()
            })
          });
          if(r.ok){
            await r.json().catch(()=>({}));
          }else{
            console.warn('[AddCourse] /api/courses/add HTTP',r.status,'— continuando mesmo assim');
          }
        }
      }catch(e){
        console.warn('[AddCourse] falha ao salvar no Drive (continuando):',e.message);
      }

      // ★ 3) feedback visual: toast
      if(window.showToast)showToast(alreadyExists
        ? 'Curso já estava adicionado — Meggy continua trabalhando em background 🐩'
        : 'Curso "'+courseName+'" adicionado! 🐩 Batalhão de IA iniciando em background...');

      // ★ 4) re-renderiza lista de cursos ANTES de fechar modal
      if(box){
        try{
          if(typeof window.gdiRefreshCentralPanel==='function'){
            window.gdiRefreshCentralPanel();
          }else if(typeof window.renderCursos==='function'){
            // ★ v1.0.103 FIX (Task 20-5 #7): await renderCursos to ensure UI
            //   is fully updated before closing the modal. Previously the
            //   .catch() was attached but no await — the modal closed before
            //   the re-render finished, causing a brief flash of stale content.
            await window.renderCursos(box).catch(()=>{});
          }
        }catch(e){console.warn('[AddCourse] erro ao re-renderizar:',e.message);}
      }

      // ★ 5) fecha modal — agora que tudo está salvo
      if(overlay&&overlay.parentNode){
        overlay.remove();
      }

      // ★ v1.0.100 FIX (BUG C-3): after closing modal, switch to "home" tab so user sees the course list
      // Previously body was left empty because renderBody('addmateria') just opens the modal.
      try{
        const homeTab = document.querySelector('.gdi-central-tab[data-t="home"]');
        if(homeTab) homeTab.click();
      }catch(_){}

      // ★ 6) dispara batalhão em background (não-bloqueante)
      try{
        if(window.gdiIsaPdf && window.gdiIsaPdf.startBattalion){
          window.gdiIsaPdf.startBattalion(coursePath, coursePath, courseName, []).catch(e=>{
            console.warn('[Batalhão] falha assíncrona (não bloqueante):',e.message);
          });
        }else{
          console.warn('[AddCourse] gdiIsaPdf.startBattalion indisponível — batalhão não disparado');
        }
      }catch(e){console.warn('[Batalhão] falha:',e.message);}

      // ★ 7) Task 15: dispara scanner LEVE em background — conta aulas reais do curso.
      //    Não-bloqueante (usa worker bridge + 500ms pause entre pastas).
      //    Atualiza a barra de progresso no tile da home, se visível.
      //    Salva estrutura em localStorage (cache) e Drive (.meggy.ai/courses/<key>/lessons.json).
      try{
        if(window.gdiCourseScanner && typeof window.gdiCourseScanner.startScan === 'function'){
          window.gdiCourseScanner.startScan(coursePath, function(state, lessonsData){
            // ★ ENG-SCANNER-DISTRIBUIDO (Task 6 / Agent 6): capture cached/scannedBy.
            // Agent 5's scanCourse populates both `state` and `lessonsData` when the
            // course was already scanned by another student (cache hit). We mirror
            // onto `state` defensively so the tile rendering below reads uniformly.
            try{
              if(lessonsData && lessonsData.cached){ state.cached = true; }
              if(lessonsData && lessonsData.scannedBy){ state.scannedBy = lessonsData.scannedBy; }
              if(!state.cached && window.gdiCourseScanner && typeof window.gdiCourseScanner.getCourseLessons === 'function'){
                const stored = window.gdiCourseScanner.getCourseLessons(coursePath);
                if(stored && stored.cached){
                  state.cached = true;
                  if(stored.scannedBy) state.scannedBy = stored.scannedBy;
                }
              }
            }catch(_){}
            // Atualiza tile da home, se visível
            try{
              const tiles = document.querySelectorAll('[data-course-key]');
              let tile = null;
              for(let i=0; i<tiles.length; i++){
                if(tiles[i].dataset.courseKey === coursePath){ tile = tiles[i]; break; }
              }
              if(tile){
                const bar = tile.querySelector('.gdi-scan-progress');
                if(bar){
                  const pct = (state.totalFolders > 0)
                    ? Math.round((state.scannedFolders||0)/state.totalFolders*100)
                    : 0;
                  bar.style.width = pct + '%';
                  if(bar.parentElement){
                    bar.parentElement.title = 'Escaneando: '+(state.scannedFolders||0)+'/'+(state.totalFolders||0)+
                      ' pastas, '+((lessonsData && lessonsData.lessons && lessonsData.lessons.length)||0)+' aulas encontradas';
                  }
                }
                // Atualiza contagem de aulas no tile em tempo real
                const totalEl = tile.querySelector('[data-stat="total"]');
                if(totalEl && lessonsData && lessonsData.lessons){
                  totalEl.textContent = lessonsData.lessons.length;
                }
                // ★ ENG-SCANNER-DISTRIBUIDO (Task 6 / Agent 6): helper to ensure
                // .gdi-shared-badge element exists in the tile (inserted right
                // after .gdi-scan-status). Hidden by default; only shown when
                // state.status==='done' && state.cached===true.
                function ensureSharedBadge(){
                  let badge = tile.querySelector('.gdi-shared-badge');
                  if(!badge){
                    const s = tile.querySelector('.gdi-scan-status');
                    if(s && s.parentNode){
                      badge = document.createElement('span');
                      badge.className = 'gdi-shared-badge';
                      badge.style.cssText = 'display:none;color:#4ade80;font-size:11px;margin-top:4px;';
                      s.parentNode.insertBefore(badge, s.nextSibling);
                    }
                  }
                  return badge;
                }
                // Atualiza texto de status
                const statusEl = tile.querySelector('.gdi-scan-status');
                if(statusEl && state.status === 'scanning'){
                  // ★ NEW (Task 6 / Agent 6): pasta-count progress (fallback to % when totalFolders unknown)
                  const sf = state.scannedFolders||0;
                  const tf = state.totalFolders||0;
                  const pc = (tf > 0) ? Math.round(sf/tf*100) : 0;
                  const progressText = (tf > 0)
                    ? 'Escaneando: '+sf+'/'+tf+' pastas ('+pc+'%)'
                    : 'Escaneando aulas... '+pc+'%';
                  statusEl.innerHTML = '<i class="bi bi-arrow-repeat"></i> '+esc(progressText);
                  // hide shared badge while scanning
                  const b = ensureSharedBadge();
                  if(b) b.style.display = 'none';
                }else if(statusEl && state.status === 'done'){
                  statusEl.innerHTML = '<i class="bi bi-check2" style="color:#3fb950;"></i> '+((lessonsData && lessonsData.lessons && lessonsData.lessons.length)||0)+' aulas encontradas';
                  // ★ NEW (Task 6 / Agent 6): show shared badge when cached===true, hide otherwise
                  const b = ensureSharedBadge();
                  if(b){
                    if(state.cached === true){
                      b.innerHTML = '<i class="bi bi-people-fill"></i> Compartilhado por '+esc(state.scannedBy||'outro aluno');
                      b.style.display = 'inline-block';
                    } else {
                      b.style.display = 'none';
                    }
                  }
                  // Após 4s, esconde o status bar (mantém só contagem)
                  setTimeout(function(){
                    try{
                      const wrap = tile.querySelector('.gdi-scan-bar-wrap');
                      if(wrap){ wrap.style.transition='opacity .4s'; wrap.style.opacity='0'; }
                      const s2 = tile.querySelector('.gdi-scan-status');
                      if(s2){ s2.style.transition='opacity .4s'; s2.style.opacity='0'; }
                    }catch(_){}
                  }, 4000);
                }else if(statusEl && state.status === 'error'){
                  statusEl.innerHTML = '<i class="bi bi-exclamation-triangle" style="color:#ff8b8b;"></i> Erro ao escanear';
                  const b = ensureSharedBadge();
                  if(b) b.style.display = 'none';
                }
              }
            }catch(_){}
          });
        }
      }catch(e){console.warn('[Scanner] não iniciado:',e.message);}

    }catch(e){
      console.error('[AddCourse] erro fatal em gdiAddCourseFromDrive:',e);
      if(window.showToast)showToast('Erro ao adicionar curso: '+e.message);
      // fecha modal mesmo com erro — não trava o aluno
      if(overlay&&overlay.parentNode)overlay.remove();
      throw e;
    }
  };

  // ★ PATCH G: o document-level capture-phase click listener para
  // #gdi-amc-select-current foi REMOVIDO. A captura agora é feita por
  // um listener anexado ao overlay quando showAddCourseModal() abre
  // (ver linha "overlay.addEventListener('click', ...)" dentro de
  // showAddCourseModal). Isso elimina o overhead de interceptar TODOS
  // os cliques no documento.

  let rescue=null,rescueAt=0;
  function ensureState(){
    if(rescue&&Date.now()-rescueAt<60000)return Promise.resolve(rescue);
    return fetch('/userstate',{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(j=>{
      if(j&&typeof j==='object'){rescue=j;rescueAt=Date.now();}
      return rescue;
    }).catch(()=>rescue);
  }
  function stateD(){
    try{if(window.GDIUser&&GDIUser.loaded()){const d=GDIUser.dump();if(d)return d;}}catch(_){}
    return rescue;
  }
  function watchedLow(d){
    const s=new Set();const w=(d&&d.watched)||{};
    for(const k in w)s.add(low(k));
    return s;
  }
  function courseKeyOf(p){
    const seg=norm(p).split('/').filter(Boolean);
    if(!seg.length||!/^\d+:$/.test(seg[0]))return null;
    if(seg.length<=2)return seg[0];
    return [seg[0],...seg.slice(1,-1).slice(0,2)].join('/');
  }
  const courseName=ck=>{
    // ★ Task 22: decodifica %20 e outros caracteres URL-encoded
    let name=ck.split('/').filter(Boolean).slice(1).join(' / ')||ck;
    try{name=decodeURIComponent(name);}catch(_){}
    return name;
  };
  function driveNameOf(ck){
    const m=/^\/(\d+):/.exec(ck||'');
    return(window.drive_names&&m&&window.drive_names[+m[1]])||'';
  }
  // ★ v1.0.76: courseIdentity moved to gdi-core.js as window.gdiCourseIdentity (CDN cache fix)
  function collectCourses(){
    const d=stateD()||{};
    // ★ cursos ocultos pelo usuário (não aparecem na lista de cursos)
    // ★ v1.0.103 FIX (Task 20-18 #5): convert `hidden` array → Set<string> (lowercased)
    //   for O(1) isHidden lookups. Previously `hidden.some(h => low(h) === low(ck))` was
    //   O(H) per call (H ≤ 50 entries). collectCourses calls isHidden once per manual
    //   course (C ≤ ~30) plus inside the pre-bucketing loop below — total O(C×H) ≈ 1,500
    //   string comparisons per render. With a Set, isHidden is O(1) per call. Behavior
    //   preserved: low() normalization applied to both keys and Set entries, so case/
    //   trailing-slash variations still match. The non-Set `hidden` array remains in
    //   localStorage (LS_HIDDEN) — only the in-memory lookup structure changed.
    const hiddenRaw = lsGet(LS_HIDDEN, []);
    const hiddenSet = new Set(Array.isArray(hiddenRaw) ? hiddenRaw.map(h => low(h)) : []);
    const isHidden = ck => hiddenSet.has(low(ck));

    // ★ FIX 2 (Task 14): return ONLY manually-added courses (no more auto-tiles).
    // Auto-tiles (de watched/resume/history) mostravam dados errados, ex.: "3 aulas"
    // quando o curso tem 50, porque c.lessons.size contava apenas paths visitados —
    // não o total real de aulas. Cursos manuais são adicionados explicitamente pelo
    // aluno via aba "Adicionar matéria" e carregam totalLessons (pdfCount do Drive scan).
    const LS_MANUAL='gdi-manual-courses-v1';
    const manual=lsGet(LS_MANUAL,[]);
    // ★ FIX (Agent 10 E-1): defensive — if localStorage was corrupted into
    //    a non-array shape, return [] instead of crashing the whole UI.
    if(!Array.isArray(manual)) return [];
    const map=new Map();

    // ★ v1.0.103 FIX (Task 20-18 #6): pre-bucket watched keys by course prefix.
    //   Original code was O(C×W): for each manual course (C), iterate ALL watched
    //   keys (W) and check `lk === pre || lk.indexOf(pre+'/') === 0`. For 30 courses
    //   × 500 watched keys = 15,000 string comparisons per collectCourses call (and
    //   this runs on every renderHome, even with the 5s memoization in study-panel.js).
    //   Optimization: build Map<lowerCoursePath, manualEntry[]> (excluding hidden),
    //   then for each watched key walk its ancestor paths (depth D, typically 2-4
    //   components) and check Map.has() — O(1) per ancestor. Total cost: O(C + W×D),
    //   i.e. 30 + 500×3 = ~1,530 ops vs 15,000.
    //   Behavior preserved: a watched key counts toward EVERY ancestor course (matches
    //   the original `lk===pre||lk.indexOf(pre+'/')===0` check, which also counted a
    //   watched key in multiple courses when one course path was a prefix of another).
    //   Walk approach is equivalent: walking ancestors of lk via '/' boundaries
    //   yields exactly the set of paths `p` such that `lk === p` OR `lk.startsWith(p+'/')`.
    const w=(d&&d.watched)||{};

    // Build Map<lowerPath, manualEntry[]> for non-hidden manual courses.
    // Array value handles the (rare) case of two manual entries sharing the same
    // lowercased path — both need their watched count incremented.
    const courseByLowPath = new Map();
    for(const m of manual){
      if(!m||!m.path)continue;
      if(isHidden(m.path))continue;
      const lp = low(m.path);
      let arr = courseByLowPath.get(lp);
      if(!arr){ arr = []; courseByLowPath.set(lp, arr); }
      arr.push(m);
    }

    // Initialize per-course watched counter at 0 (preserves the order/keys for the
    // main loop below; entries that end with 0 stay 0).
    const watchedCountByCourse = new Map();
    for(const m of manual){
      if(!m||!m.path)continue;
      if(isHidden(m.path))continue;
      watchedCountByCourse.set(m.path, 0);
    }

    // Walk each watched key's ancestor paths; increment count for every matching
    // course. The while-loop traverses lk → parent path (slice at last '/') → ...
    // until the string is exhausted. Depth is bounded by the path's component count.
    for(const k in w){
      const lk = low(k);
      let path = lk;
      while(path){
        const arr = courseByLowPath.get(path);
        if(arr){
          for(let mi = 0; mi < arr.length; mi++){
            const mEntry = arr[mi];
            watchedCountByCourse.set(mEntry.path, watchedCountByCourse.get(mEntry.path) + 1);
          }
        }
        const idx = path.lastIndexOf('/');
        if(idx < 0) break;
        path = path.slice(0, idx);
      }
    }

    for(const m of manual){
      if(!m||!m.path)continue;
      const ck=m.path;  // usa o path do drive como courseKey
      if(isHidden(ck))continue;
      // Conta aulas assistidas — already pre-computed via the bucket walk above.
      const watchedCount = watchedCountByCourse.get(ck) || 0;
      let c=map.get(ck);
      if(!c){
        c={
          key:ck,
          lastAt:m.createdAt||Date.now(),
          lessons:new Set(),  // mantido p/ compat (detail view itera d.watched direto)
          watched:watchedCount,
          manual:true,
          manualCourse:m,
          totalLessons:m.pdfCount||m.lessonCount||0  // ★ total real (Drive scan)
        };
        map.set(ck,c);
      }else{
        // curso já existia (raro em modo manual-only) — atualiza stats
        c.watched=watchedCount;
        c.totalLessons=m.pdfCount||m.lessonCount||0;
      }
      c.manual=true;
      c.manualCourse=m;
      if(!c.lastAt)c.lastAt=m.createdAt||Date.now();

      // ★ Task 15: enriquece com dados do Course Scanner (background, leve).
      //    - scanStatus: 'scanning' | 'done' | 'error' | null
      //    - scanPercent: 0-100 (proporção de pastas escaneadas)
      //    - totalLessons: sobrescrito se scanner já encontrou mais aulas que pdfCount
      //    - watched: recontado via GDIUser.dump() (mais confiável que stateD)
      if(window.gdiCourseScanner){
        try{
          const sp = window.gdiCourseScanner.getScanProgress(ck);
          if(sp){
            c.scanStatus = sp.status;
            c.scanPercent = sp.percent;
            c.scanLessonsFound = sp.lessonsFound;
            // Usa contagem REAL do scanner se for maior que pdfCount do add-time
            // (scanner conta vídeos recursivamente, pdfCount só contava PDFs do nível raiz)
            if(sp.lessonsFound > 0 && sp.lessonsFound > c.totalLessons){
              c.totalLessons = sp.lessonsFound;
            }
          }
          // Reconta watched usando GDIUser direto (mais fresco que stateD() rescue cache)
          const realWatched = window.gdiCourseScanner.countWatched(ck);
          if(typeof realWatched === 'number' && realWatched >= 0){
            c.watched = realWatched;
          }
        }catch(_){}
      }
    }

    return [...map.values()].sort((a,b)=>b.lastAt-a.lastAt);
  }
  window.collectCourses = collectCourses;
  // ★ helpers para ocultar/restaurar cursos
  // ★ v1.0.103 FIX (Task 20-5 #10): serialize writes to LS_HIDDEN via a Promise
  //   chain (_hiddenWriteChain). Without this, rapid sequential calls to
  //   hideCourse/unhideCourse (e.g. user clicks hide on multiple courses
  //   quickly, or restore-all + immediate hide) race on the read-modify-write
  //   cycle and lose entries. Each write is appended to the chain and runs
  //   strictly after the previous one completes.
  let _hiddenWriteChain = Promise.resolve();
  function _queueHiddenWrite(fn){
    const next = _hiddenWriteChain.then(fn).catch(e => {
      console.warn('[hideCourse] write chain error:', e && e.message);
    });
    // Keep the chain alive even if the caller doesn't await (fire-and-forget).
    _hiddenWriteChain = next;
    return next;
  }
  function hideCourse(ck){
    return _queueHiddenWrite(() => {
      const hidden=lsGet(LS_HIDDEN,[]);
      if(!hidden.some(h=>low(h)===low(ck)))hidden.push(ck);
      // ★ v1.0.99: cap at 50 hidden entries
      if(hidden.length > 50) hidden.splice(0, hidden.length - 50);
      lsSet(LS_HIDDEN,hidden);
      // ★ v1.0.103 FIX (Task 20-5 #9): emit courses:changed so caches invalidate.
      try{ if(typeof Bus!=='undefined' && Bus.emit) Bus.emit('courses:changed', {}); }catch(_){}
    });
  }
  function unhideCourse(ck){
    return _queueHiddenWrite(() => {
      lsSet(LS_HIDDEN,lsGet(LS_HIDDEN,[]).filter(h=>low(h)!==low(ck)));
      // ★ v1.0.103 FIX (Task 20-5 #9): emit courses:changed so caches invalidate.
      try{ if(typeof Bus!=='undefined' && Bus.emit) Bus.emit('courses:changed', {}); }catch(_){}
    });
  }
  function listHiddenCourses(){
    return lsGet(LS_HIDDEN,[]);
  }
  const GW=/^(aula|aulas|v\u00eddeo|videos?|li[cç][aã]o|li[cç][oõ]es|licoes|lesson|class|modulo|m\u00f3dulo|module|parte|pt|cap|capitulo|ext|ep|live|arquivo|file)$/i;
  function isGeneric(n){
    n=stripExt(n).toLowerCase();if(!n)return true;
    return n.replace(/[\s\-_.:,;|()/\\]+/g,' ').split(' ')
      .filter(w2=>w2&&!/^\d+$/.test(w2)&&!GW.test(w2)&&!GW.test(w2.replace(/\d+$/,''))).join('')==='';
  }
  function realName(p){
    const seg=norm(p).split('/').filter(Boolean);
    let nm=stripExt(seg[seg.length-1]||'');
    if(isGeneric(nm))for(let j=seg.length-2;j>=0;j--){
      if(/^\d+:$/.test(seg[j]))break;
      if(!isGeneric(seg[j])){nm=stripExt(seg[j]);break;}
    }
    return nm||'Aula';
  }
  // ═══ PATCH B: vCache com LRU (1000 cap) + TTL (5min) + bestIn cache por curso (60s) ═══
  const vCache=new Map();
  const VCACHE_MAX=1000, VCACHE_TTL=5*60*1000;
  function vCacheGet(p){
    const e=vCache.get(p);
    if(!e)return null;
    if(Date.now()-e.t>VCACHE_TTL){vCache.delete(p);return null;}
    return e.v;  // pode ser Promise (in-flight) ou boolean (resolvido)
  }
  function vCacheSet(p,v){
    if(vCache.size>=VCACHE_MAX)vCache.delete(vCache.keys().next().value);
    vCache.set(p,{t:Date.now(),v});
  }
  function exists(p){
    const cached=vCacheGet(p);
    if(cached!==null)return cached instanceof Promise?cached:Promise.resolve(cached);
    const pr=fetch(String(p).split('?')[0],{method:'POST',credentials:'same-origin'})
      .then(r2=>{vCacheSet(p,r2.ok);return r2.ok})
      .catch(()=>{vCacheSet(p,true);return true});
    vCacheSet(p,pr);  // armazena Promise durante in-flight
    return pr;
  }
  const ghost=p=>{const s=norm(p).split('/').filter(Boolean);return s.length>=2&&s[s.length-1].indexOf(s[s.length-2]+' - ')===0;};
  // ★ bestInCache: courseKey -> {t, path} — TTL 60s
  const bestInCache=new Map();
  function bestIn(courseKey){
    const cached=bestInCache.get(courseKey);
    if(cached&&Date.now()-cached.t<60_000)return Promise.resolve(cached.path);
    const d=stateD();
    if(!d){bestInCache.set(courseKey,{t:Date.now(),path:null});return Promise.resolve(null);}
    const pre=low(courseKey);
    const inC=p=>{const l=low(p);return l===pre||l.indexOf(pre+'/')===0;};
    const cands=[],seen=new Set();
    const add=(k,at)=>{
      if(!k)return;const key=low(k);
      if(seen.has(key)||!inC(k))return;seen.add(key);
      cands.push({path:String(k).split('?')[0],at:Number(at)||0});
    };
    const w=(d&&d.watched)||{},r=(d&&d.resume)||{};
    for(const k in w)add(k,w[k]&&w[k].at);
    for(const k in r)add(k,r[k]&&r[k].at);
    if(d.last&&d.last.path)add(d.last.path,d.last.at);
    (Array.isArray(d.history)?d.history:[]).forEach(h=>{if(h&&h.path)add(h.path,h.at)});
    cands.sort((a,b)=>(ghost(a.path)-ghost(b.path))||(b.at-a.at));
    return (async()=>{
      for(const c of cands.slice(0,3)){
        let ex=vCacheGet(c.path);
        if(ex===null){ex=await exists(c.path);}  // exists() popula vCache internamente
        if(ex){bestInCache.set(courseKey,{t:Date.now(),path:c.path});return c.path;}
      }
      bestInCache.set(courseKey,{t:Date.now(),path:null});
      return null;
    })();
  }
  // ★ invalidar bestInCache quando usuário marcar/desmarcar vídeo
  // ★ FIX (Task 20-13 #5): guard with typeof Bus !== 'undefined' — same pattern
  //   used everywhere else in this module. Without the guard, if study-courses.js
  //   loads before app.min.js defines Bus (e.g., bundle order regression, or a
  //   future refactor moves Bus into a lazy-loaded chunk), these two top-level
  //   statements would throw ReferenceError and crash the entire IIFE — leaving
  //   window.__gdiStudy.courses unset and ALL course functions undefined. The
  //   rest of the module already uses `typeof Bus!=='undefined'` for emit calls
  //   (lines 478, 485, 615, 1213, 1429, 1559, 1844); these onGlobal calls were
  //   the only unguarded Bus references.
  if(typeof Bus !== 'undefined' && Bus && typeof Bus.onGlobal === 'function'){
    Bus.onGlobal('watched:changed',()=>{bestInCache.clear();});
    // ★ v1.0.103 FIX (Task 20-5 #9): also clear bestInCache on courses:changed
    //   (hide/unhide/remove/add). Previously, removing a course kept stale
    //   bestIn cache for that courseKey, so the next renderCursos call could
    //   show a "Continuar: <ghost lesson>" button pointing to a removed course.
    Bus.onGlobal('courses:changed',()=>{bestInCache.clear();});
  }

  // ★ Otimização: limpa nome do curso (remove paths crus, underscores, etc)
  function cleanCourseName(ck){
    let name=courseName(ck);
    // se veio vazio, usa o drive name
    if(!name||name==='—')name=driveNameOf(ck)||'Curso';
    // ★ Task 22: decodifica %20 se ainda não foi decodificado
    try{if(name.indexOf('%')>=0)name=decodeURIComponent(name);}catch(_){}
    // remove underscores → espaços, multiple slashes, trim
    name=name.replace(/_/g,' ').replace(/\/\s*\//g,' / ').replace(/\s+/g,' ').trim();
    // se muito longo, trunca
    if(name.length>45)name=name.slice(0,42)+'…';
    return name;
  }

  // ★ REMOVIDO: tab cursos (user request) — função MANTIDA para preservar API pública
  // (window.renderCursos e window.gdiRefreshCentralPanel podem ser chamados por outros módulos)
  async function renderCursos(box){
    const cs=collectCourses();
    const hidden=listHiddenCourses();
    if(!cs.length){
      box.innerHTML=`<div class="gdi-empty-state">
        <span class="gdi-empty-state-icon">🎓</span>
        <h3>Nenhum estudo registrado ainda</h3>
        <p>Assista uma aula para que ela apareça aqui automaticamente, ou crie um curso manual para organizar seus estudos.</p>
        <div class="gdi-quick-actions" style="justify-content:center;margin-bottom:20px;">
          <button id="gdi-empty-add-course" class="gdi-quick-action"><i class="bi bi-plus-lg"></i> Adicionar curso manual</button>
        </div>
        ${hidden.length?`<div style="margin-top:24px;padding:14px;background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#21262d);border-radius:10px;text-align:left;max-width:400px;margin-left:auto;margin-right:auto;">
          <b style="color:var(--ferreto-text,#f0f6fc);font-size:13px;display:block;margin-bottom:8px;"><i class="bi bi-eye-slash"></i> ${hidden.length} curso${hidden.length>1?'s':''} oculto${hidden.length>1?'s':''}</b>
          <button id="gdi-restore-courses" class="gdi-mode-btn" style="font-size:12px;"><i class="bi bi-arrow-counterclockwise"></i> Restaurar cursos ocultos</button>
        </div>`:''}
      </div>`;
      const emptyAdd=box.querySelector('#gdi-empty-add-course');
      if(emptyAdd)emptyAdd.onclick=()=>showAddCourseModal(box);
      const restoreBtn=box.querySelector('#gdi-restore-courses');
      if(restoreBtn)restoreBtn.onclick=async ()=>{
        const ok=await window.gdiModal({
          title:'Restaurar cursos',
          message:'Restaurar todos os '+hidden.length+' curso(s) oculto(s)?',
          confirmText:'Restaurar',
          cancelText:'Cancelar'
        });
        if(ok){
          // ★ v1.0.103 FIX (Task 20-5 #10): route through _hiddenWriteChain
          //   and emit courses:changed for cache invalidation.
          await _queueHiddenWrite(() => {
            lsSet(LS_HIDDEN,[]);
            try{ if(typeof Bus!=='undefined' && Bus.emit) Bus.emit('courses:changed', {}); }catch(_){}
          });
          showToast('Cursos restaurados');
          renderCursos(box).catch(()=>{});
        }
      };
      return;
    }
    box.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
      <b style="color:var(--ferreto-text,#f0f6fc);font-size:14px;">${cs.length} curso${cs.length>1?'s':''} em andamento</b>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button id="gdi-add-manual-course" class="gdi-mode-btn" style="font-size:11px;"><i class="bi bi-plus-lg"></i> Adicionar curso</button>
        ${hidden.length?`<button id="gdi-show-hidden" class="gdi-mode-btn" style="font-size:11px;"><i class="bi bi-eye-slash"></i> ${hidden.length} oculto${hidden.length>1?'s':''}</button>`:''}
      </div>
    </div>
    <div style="margin-bottom:14px;">
      <input id="gdi-courses-search" type="search" placeholder="Buscar curso..." style="width:100%;box-sizing:border-box;background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:9px 12px;font-size:13px;font-family:inherit;" value="${escHtml(box.__search||'')}">
    </div>
    <div class="gdi-courses"></div>
    <div id="gdi-courses-pager" style="margin-top:14px;text-align:center;"></div>`;
    const grid=box.querySelector('.gdi-courses');
    const pagerEl=box.querySelector('#gdi-courses-pager');
    const searchInput=box.querySelector('#gdi-courses-search');

    // ★ botão "Adicionar curso manual"
    const addManualBtn=box.querySelector('#gdi-add-manual-course');
    if(addManualBtn)addManualBtn.onclick=()=>showAddCourseModal(box);

    // ★ botão "mostrar ocultos"
    const showHiddenBtn=box.querySelector('#gdi-show-hidden');
    if(showHiddenBtn)showHiddenBtn.onclick=()=>showHiddenCoursesModal(box);

    // ★ busca + paginação (12 por página)
    const PAGE_SIZE=12;
    let currentPage=box.__page||0;
    function applyFilter(){
      const q=(box.__search||'').toLowerCase().trim();
      const filtered=q?cs.filter(c=>cleanCourseName(c.key).toLowerCase().includes(q)||driveNameOf(c.key).toLowerCase().includes(q)):cs;
      const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
      if(currentPage>=totalPages)currentPage=totalPages-1;
      if(currentPage<0)currentPage=0;
      const slice=filtered.slice(currentPage*PAGE_SIZE,(currentPage+1)*PAGE_SIZE);
      // ★ v1.0.98 FIX: generation token to prevent stale cards from async race (Agent 15 Bug 3)
      const __gen=(box.__filterGen=(box.__filterGen||0)+1);
      // limpar grid
      grid.innerHTML='';
      if(!slice.length){
        grid.innerHTML='<div class="gdi-notes-empty" style="padding:40px;text-align:center;">'+(q?'Nenhum curso encontrado para "'+escHtml(q)+'"':'Nenhum curso ainda.')+'</div>';
      }
      // ★ PATCH C: pré-busca bestIn em paralelo (Promise.all) — depois renderiza cards com target resolvido
      (async()=>{
        const targets=await Promise.all(slice.map(c=>bestIn(c.key).catch(()=>null)));
        if(box.__filterGen!==__gen)return;  // ★ v1.0.98 FIX: stale — abort
        slice.forEach((c,i)=>renderCourseCard(grid,c,box,targets[i]));
      })();
      // paginação
      if(totalPages>1){
        pagerEl.innerHTML=`<div style="display:flex;gap:6px;justify-content:center;align-items:center;flex-wrap:wrap;">
          <button class="gdi-mode-btn" id="gdi-courses-prev" style="font-size:11px;padding:5px 10px;" ${currentPage===0?'disabled':''}><i class="bi bi-chevron-left"></i> Anterior</button>
          <span style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;">Página ${currentPage+1} de ${totalPages}</span>
          <button class="gdi-mode-btn" id="gdi-courses-next" style="font-size:11px;padding:5px 10px;" ${currentPage===totalPages-1?'disabled':''}>Próxima <i class="bi bi-chevron-right"></i></button>
        </div>
        <div style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-top:6px;">Mostrando ${slice.length} de ${filtered.length} curso${filtered.length>1?'s':''}${q?' (filtrado por "'+escHtml(q)+'")':''}</div>`;
        const prev=pagerEl.querySelector('#gdi-courses-prev');
        const next=pagerEl.querySelector('#gdi-courses-next');
        if(prev)prev.onclick=()=>{currentPage--;applyFilter();};
        if(next)next.onclick=()=>{currentPage++;applyFilter();};
      }else{
        pagerEl.innerHTML=filtered.length>PAGE_SIZE?`<div style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;">Mostrando ${slice.length} de ${filtered.length} cursos</div>`:'';
      }
    }
    function renderCourseCard(grid,c,box,target){
      // ★ FIX: cursos manuais usam dados do manualCourse (nome, ícone, cor)
      const mc=c.manualCourse||{};
      // ★ FIX 1 (Task 23): decode URL-encoded mc.name defensively.
      // Legacy localStorage entries (saved before Task 22) may have %20 in
      // the name field (e.g. "TJ%20SP%20-%20Black%20Edition"). Decode here so
      // the tile shows "TJ SP - Black Edition" regardless of when it was saved.
      // Idempotent: decodeURIComponent of an already-decoded string is a no-op.
      let _mcName=mc.name||'';
      try{if(_mcName&&String(_mcName).indexOf('%')>=0)_mcName=decodeURIComponent(_mcName);}catch(_){}
      const name=_mcName||cleanCourseName(c.key);
      const drive=driveNameOf(c.key);
      const icon=mc.icon||'📁';
      const color=mc.color||'var(--ferreto-primary,#ff8b9f)';
      const isManual=c.manual===true;
      const progress=c.lessons.size>0?Math.round(c.watched/c.lessons.size*100):0;
      const progressColor=progress>=80?'#3fb950':progress>=40?'#ffd43b':'var(--ferreto-primary,#ff8b9f)';
      const remaining=c.lessons.size-c.watched;
      const el=document.createElement('div');el.className='gdi-course';
      el.style.cursor='pointer';
      // ★ destaque visual para curso manual: border-left com a cor do manualCourse
      if(isManual)el.style.borderLeft='4px solid '+color;
      el.innerHTML=`
        <div class="gdi-course-head" style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <b title="${escHtml(_mcName||courseName(c.key))}" style="flex:1;min-width:0;display:flex;align-items:center;gap:6px;">
            ${isManual?`<span style="font-size:18px;flex:none;">${icon}</span>`:''}
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(name)}</span>
          </b>
          <button class="gdi-course-remove" title="${isManual?'Remover curso manual':'Ocultar curso'}" style="background:transparent;border:0;color:var(--ferreto-text-muted,#8b949e);cursor:pointer;font-size:14px;padding:2px 6px;flex:none;border-radius:6px;transition:all .15s;"><i class="bi bi-x-lg"></i></button>
        </div>
        ${isManual
          ? `<small style="color:var(--ferreto-secondary,#5ddeda);font-size:10px;display:block;margin-top:4px;"><i class="bi bi-hdd"></i> ${escHtml(drive||'Drive')} · <span style="color:#ffd43b;"><i class="bi bi-hourglass-split"></i> Meggy processando…</span></small>`
          : (drive?`<small style="color:var(--ferreto-secondary,#5ddeda);font-size:10px;display:block;margin-top:2px;"><i class="bi bi-hdd"></i> ${escHtml(drive)}${c.lastAt?` · última: ${dateBr(c.lastAt)}`:''}</small>`:'<small>&nbsp;</small>')
        }
        <div class="gdi-course-stats">
          ${isManual
            ? `<div class="gdi-course-stat"><span class="gdi-course-stat-num" style="color:#ffd43b;">…</span><span class="gdi-course-stat-label">Batalhão</span></div>
               <div class="gdi-course-stat"><span class="gdi-course-stat-num">0</span><span class="gdi-course-stat-label">Assistidas</span></div>`
            : `<div class="gdi-course-stat"><span class="gdi-course-stat-num">${c.lessons.size}</span><span class="gdi-course-stat-label">Aulas</span></div>
               <div class="gdi-course-stat"><span class="gdi-course-stat-num" style="color:#3fb950;">${c.watched}</span><span class="gdi-course-stat-label">Feitas</span></div>
               <div class="gdi-course-stat"><span class="gdi-course-stat-num" style="color:#ffd43b;">${remaining}</span><span class="gdi-course-stat-label">Restam</span></div>
               <div class="gdi-course-stat"><span class="gdi-course-stat-num" style="color:${progressColor};">${progress}%</span><span class="gdi-course-stat-label">Concl.</span></div>`
          }
        </div>
        ${isManual?'':`<div class="gdi-progress-bar"><div class="gdi-progress-fill" style="width:${progress}%;background:${progressColor};"></div></div>`}
        <button class="gdi-btn-continue gdi-course-continue" ${isManual?'':'disabled'}>
          ${isManual?'<i class="bi bi-hourglass-split"></i> Meggy preparando materiais…':'<i class="bi bi-hourglass-split"></i> Verificando…'}
        </button>`;
      grid.appendChild(el);

      const contBtn=el.querySelector('.gdi-course-continue');
      function applyTarget(tg){
        if(isManual){
          // curso manual: clicar leva ao path no drive
          contBtn.disabled=false;
          contBtn.innerHTML=`<i class="bi bi-folder2-open"></i> Abrir pasta no Drive`;
          contBtn.onclick=(e)=>{e.stopPropagation();location.href=c.key;};
          return;
        }
        if(tg){
          contBtn.disabled=false;
          contBtn.innerHTML=`<i class="bi bi-play-fill"></i> Continuar: ${escHtml(realName(tg).slice(0,30))}`;
          contBtn.onclick=(e)=>{e.stopPropagation();location.href=tg+(tg.includes('?')?'&':'?')+'a=view';};
        }else{
          contBtn.disabled=true;
          contBtn.className='gdi-btn-continue gdi-btn-done';
          contBtn.innerHTML='<i class="bi bi-check2-all"></i> Tudo em dia!';
        }
      }
      // ★ PATCH C: se target foi pre-buscado, usa; senão faz fetch aqui (fallback)
      if(target!==undefined){
        applyTarget(target);
      }else if(isManual){
        applyTarget(null);
      }else{
        bestIn(c.key).then(applyTarget);
      }

      // botão remover
      const removeBtn=el.querySelector('.gdi-course-remove');
      if(removeBtn){
        removeBtn.onmouseenter=()=>{removeBtn.style.color='#ff8b8b';removeBtn.style.background='rgba(255,107,107,.15)';};
        removeBtn.onmouseleave=()=>{removeBtn.style.color='var(--ferreto-text-muted,#8b949e)';removeBtn.style.background='transparent';};
        removeBtn.onclick=async (e)=>{
          e.stopPropagation();
          const ok=await window.gdiModal({
            title:'Ocultar curso',
            message:'Ocultar "'+name+'" da sua lista de cursos?\n\nO curso não será excluído — você pode restaurá-lo depois.',
            confirmText:'Ocultar',
            cancelText:'Cancelar',
            danger:true
          });
          if(ok){
            // ★ v1.0.103 FIX (Task 20-5 #10): await hideCourse so the write
            //   chain completes BEFORE renderCursos reads LS_HIDDEN. Without
            //   this, renderCursos could race and show the course as still
            //   visible (write was queued but not yet flushed).
            await hideCourse(c.key);
            showToast('Curso ocultado');
            renderCursos(box).catch(()=>{});
          }
        };
      }

      // clicar no card abre detalhes
      el.onclick=(e)=>{
        if(e.target.closest('button'))return;
        openCourseDetail(box,c);
      };
    }
    if(searchInput){
      let _searchTimer=null;
      searchInput.addEventListener('input',function(){
        if(_searchTimer)clearTimeout(_searchTimer);
        _searchTimer=setTimeout(()=>{
          box.__search=this.value;
          currentPage=0;
          box.__page=0;
          applyFilter();
        },250);
      });
    }
    applyFilter();
  }
  // ★ expõe renderCursos para outros módulos (gdiAddCourseFromDrive chama via window.renderCursos)
  window.renderCursos=renderCursos;

  // ★ gdiRefreshCentralPanel: re-renderiza o body da aba atual (se painel aberto)
  // v1.0.86 MODULAR FIX: panel/tab/renderBody migraram para study-panel.js.
  // Use late binding via window.__gdiStudy.state (panel/tab) e .panel (renderBody).
  window.gdiRefreshCentralPanel=function(){
    // ★ FIX (Task 14): pula 'addmateria' — é um trigger de modal, não um body real.
    //   Sem este guard, ao salvar um curso o gdiRefreshCentralPanel chamaria
    //   renderBody('addmateria') → showAddCourseModal(body) → reabriria o modal
    //   que acabamos de fechar.
    try{
      const S = window.__gdiStudy && window.__gdiStudy.state;
      const P = window.__gdiStudy && window.__gdiStudy.panel;
      if(S && S.panel && S.panel.style.display==='flex' && S.tab && S.tab!=='addmateria'){
        // ★ v1.0.100 FIX (BUG A-2): allow 'home' tab re-render (was blocked before)
        //   Only skip 'addmateria' to avoid re-opening the modal.
        if(P && typeof P.renderBody === 'function') P.renderBody(S.tab);
      }
    }catch(_){}
  };
  // ★ Modal para adicionar curso manualmente
  function showAddCourseModal(box){
    // ★ FIX local: garante esc() disponível mesmo se o escopo externo não tiver
    const esc=window.escHtml||(s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;'));
    const colors=['#ff8b9f','#5ddeda','#c026d3','#3fb950','#ffd43b','#7aa2ff','#ff6b6b','#a78bfa'];
    const icons=['⚖️','📐','📚','🎯','🧮','📖','🔬','💼','🌍','🏛️','⚙️','🎵'];
    const overlay=document.createElement('div');
    overlay.className='gdi-modal-overlay';
    overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(4px);z-index:100002;display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML=`<div style="background:var(--ferreto-bg-2,#0d1119);border:1px solid var(--ferreto-border,#21262d);border-radius:14px;max-width:680px;width:100%;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.6);">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--ferreto-border,#21262d);">
        <b style="color:var(--ferreto-text,#f0f6fc);font-size:15px;font-family:var(--ferreto-font-display,'Poppins',sans-serif);"><i class="bi bi-folder-plus"></i> Adicionar curso</b>
        <button id="gdi-amc-x" style="background:transparent;border:0;color:var(--ferreto-text-muted,#8b949e);cursor:pointer;font-size:18px;padding:4px 8px;border-radius:6px;">✕</button>
      </div>
      <!-- Tabs: Navegar Drive | Manual -->
      <div style="display:flex;gap:2px;padding:10px 20px 0;border-bottom:1px solid var(--ferreto-border,#21262d);">
        <button id="tab-drive" class="gdi-amc-tab" style="flex:1;padding:8px;border:0;background:var(--ferreto-surface-3,rgba(255,255,255,.08));color:var(--ferreto-text,#f0f6fc);cursor:pointer;font-size:13px;border-radius:8px 8px 0 0;font-weight:600;border-bottom:2px solid var(--ferreto-primary,#ff8b9f);">📂 Navegar Drive</button>
        <button id="tab-manual" class="gdi-amc-tab" style="flex:1;padding:8px;border:0;background:transparent;color:var(--ferreto-text-muted,#8b949e);cursor:pointer;font-size:13px;border-radius:8px 8px 0 0;">✏️ Manual</button>
      </div>
      <div style="flex:1;overflow-y:auto;padding:16px 20px;">
        <!-- Painel Drive -->
        <div id="panel-drive">
          <p style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;margin:0 0 10px;line-height:1.5;">Navegue pelas pastas do Drive e clique em <b style="color:var(--ferreto-primary,#ff8b9f);">"Selecionar esta pasta"</b> para adicionar como curso. A Meggy vai ler os PDFs e vídeos automaticamente em background.</p>
          <!-- ★ ENG-SCANNER-DISTRIBUIDO (Task 6 / Agent 6): Re-adicionar curso por caminho -->
          <div class="gdi-restore-path-wrap" style="margin-bottom:12px;padding:10px 12px;background:linear-gradient(135deg,rgba(93,222,218,.05),rgba(255,139,159,.03));border:1px solid rgba(93,222,218,.2);border-radius:10px;">
            <label style="display:block;color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em;">Re-adicionar curso por caminho</label>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <input id="gdi-amc-restore-path" type="text" placeholder="/11:/TJ SP Escrevente" style="flex:1;min-width:200px;box-sizing:border-box;background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:8px 10px;font-size:13px;font-family:'JetBrains Mono',monospace;" />
              <button id="gdi-amc-restore-btn" class="gdi-restore-path-btn" type="button" style="padding:8px 14px;border-radius:8px;border:0;cursor:pointer;font-weight:600;background:var(--ferreto-grad);color:#fff;font-size:12px;flex:none;">Validar e adicionar</button>
            </div>
            <small style="display:block;color:var(--ferreto-text-faint,#6b7488);font-size:10px;margin-top:4px;">Valida o caminho no Drive e adiciona o curso sem precisar navegar pelas pastas.</small>
          </div>
          <!-- Breadcrumb -->
          <div id="gdi-amc-bc" style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;padding:8px 10px;background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;margin-bottom:10px;font-size:12px;"></div>
          <!-- Loading -->
          <div id="gdi-amc-loading" style="display:none;padding:30px;text-align:center;color:var(--ferreto-text-muted,#8b949e);font-size:13px;"><div class="gdi-spinner" style="margin:0 auto 10px;"></div>Carregando pastas...</div>
          <!-- Lista de pastas -->
          <div id="gdi-amc-folders" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;padding:4px;"></div>
          <!-- Pasta atual info -->
          <div id="gdi-amc-current-info" style="display:none;margin-top:14px;padding:12px;background:linear-gradient(135deg,rgba(255,139,159,.08),rgba(93,222,218,.04));border:1px solid var(--ferreto-border-strong,#30363d);border-radius:10px;"></div>
        </div>
        <!-- Painel Manual (oculto por padrão) -->
        <div id="panel-manual" style="display:none;flex-direction:column;gap:14px;">
          <div>
            <label style="display:block;color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em;">Nome do curso *</label>
            <input id="gdi-amc-name" placeholder="Ex: Direito Constitucional para Concurso" style="width:100%;box-sizing:border-box;background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:10px 12px;font-size:14px;font-family:inherit;">
          </div>
          <div>
            <label style="display:block;color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em;">Ícone</label>
            <div id="gdi-amc-icons" style="display:flex;gap:6px;flex-wrap:wrap;">
              ${icons.map((ic,i)=>`<button class="gdi-amc-icon-btn" data-icon="${ic}" style="background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;padding:8px 10px;font-size:18px;cursor:pointer;">${ic}</button>`).join('')}
            </div>
          </div>
          <div>
            <label style="display:block;color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em;">Cor</label>
            <div id="gdi-amc-colors" style="display:flex;gap:6px;flex-wrap:wrap;">
              ${colors.map((c,i)=>`<button class="gdi-amc-color-btn" data-color="${c}" style="background:${c};border:2px solid transparent;border-radius:50%;width:32px;height:32px;cursor:pointer;"></button>`).join('')}
            </div>
          </div>
          <div>
            <label style="display:block;color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em;">Meta diária (minutos)</label>
            <input id="gdi-amc-goal" type="number" min="10" max="480" value="60" style="width:100%;box-sizing:border-box;background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:10px 12px;font-size:14px;font-family:inherit;">
          </div>
          <div>
            <label style="display:block;color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em;">Observações (opcional)</label>
            <textarea id="gdi-amc-notes" placeholder="Ex: Prova em dezembro, banca CESPE..." style="width:100%;box-sizing:border-box;background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:10px 12px;font-size:14px;font-family:inherit;min-height:60px;resize:vertical;"></textarea>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;padding:0 20px 16px;border-top:1px solid var(--ferreto-border,#21262d);padding-top:14px;">
        <button id="gdi-amc-cancel" class="gdi-mode-btn" style="font-size:13px;">Cancelar</button>
        <button id="gdi-amc-save" style="font-size:13px;padding:8px 16px;border-radius:8px;border:0;cursor:pointer;font-weight:600;background:var(--ferreto-grad);color:#fff;">📂 Selecionar esta pasta</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);

    // ── Estado do navegador ──
    let selectedIcon=icons[0];
    let selectedColor=colors[0];
    let currentMode='drive';  // 'drive' | 'manual'
    let currentPath='/';      // path atual do navegador
    let selectedPath=null;    // path selecionado pelo aluno
    let selectedName=null;

    // ── Tabs ──
    const tabDrive=overlay.querySelector('#tab-drive');
    const tabManual=overlay.querySelector('#tab-manual');
    const panelDrive=overlay.querySelector('#panel-drive');
    const panelManual=overlay.querySelector('#panel-manual');
    const saveBtn=overlay.querySelector('#gdi-amc-save');
    function setMode(m){
      // ★ v1.0.103 FIX (Task 20-5 #12): clear selectedPath/selectedName on every
      //   mode switch. Previously, if the user picked a folder in drive mode
      //   (selectedPath set), then switched to manual and back to drive, the
      //   stale selectedPath persisted — clicking "Salvar" would add a course
      //   pointing to a folder the user no longer sees as selected in the UI.
      if(currentMode !== m){
        selectedPath = null;
        selectedName = null;
        // Also hide the "current folder info" box so it doesn't keep showing
        // the previous selection while the user re-navigates.
        try{
          const infoEl = overlay.querySelector('#gdi-amc-current-info');
          if(infoEl) infoEl.style.display = 'none';
        }catch(_){}
      }
      currentMode=m;
      if(m==='drive'){
        tabDrive.style.background='var(--ferreto-surface-3,rgba(255,255,255,.08))';
        tabDrive.style.color='var(--ferreto-text,#f0f6fc)';
        tabDrive.style.borderBottom='2px solid var(--ferreto-primary,#ff8b9f)';
        tabDrive.style.fontWeight='600';
        tabManual.style.background='transparent';
        tabManual.style.color='var(--ferreto-text-muted,#8b949e)';
        tabManual.style.borderBottom='0';
        tabManual.style.fontWeight='400';
        panelDrive.style.display='block';
        panelManual.style.display='none';
        saveBtn.textContent='📂 Selecionar esta pasta';
        if(selectedPath)saveBtn.textContent='✓ Adicionar "'+(selectedName||selectedPath).slice(0,30)+'"';
        else saveBtn.textContent='📂 Selecionar esta pasta';
      }else{
        tabManual.style.background='var(--ferreto-surface-3,rgba(255,255,255,.08))';
        tabManual.style.color='var(--ferreto-text,#f0f6fc)';
        tabManual.style.borderBottom='2px solid var(--ferreto-primary,#ff8b9f)';
        tabManual.style.fontWeight='600';
        tabDrive.style.background='transparent';
        tabDrive.style.color='var(--ferreto-text-muted,#8b949e)';
        tabDrive.style.borderBottom='0';
        tabDrive.style.fontWeight='400';
        panelDrive.style.display='none';
        panelManual.style.display='flex';
        saveBtn.textContent='💾 Salvar curso manual';
      }
    }
    tabDrive.onclick=()=>setMode('drive');
    tabManual.onclick=()=>setMode('manual');
    setMode('drive');

    // ── Navegador de Drive ──
    const bcEl=overlay.querySelector('#gdi-amc-bc');
    const foldersEl=overlay.querySelector('#gdi-amc-folders');
    const loadingEl=overlay.querySelector('#gdi-amc-loading');
    const currentInfoEl=overlay.querySelector('#gdi-amc-current-info');

    function normPath(p){
      // ★ FIX (Agent 10 F-1): always strip trailing slash for consistency.
      //    Previously returned the raw path, so '/0:/Cursos/' vs '/0:/Cursos'
      //    were treated as different keys (cache misses, orphan lessons).
      return (p||'').replace(/\/+$/,'') || '/';
    }
    function pathSegments(p){
      // /0:/Cursos/Direito/Constitucional → ['0:', 'Cursos', 'Direito', 'Constitucional']
      return normPath(p).split('/').filter(Boolean);
    }
    function getDriveName(seg){
      const m=seg.match(/^(\d+):$/);
      if(m&&window.drive_names)return window.drive_names[+m[1]]||seg;
      return seg;
    }
    function isFolder(file){
      return file && (file.mimeType==='application/vnd.google-apps.folder' || file.type==='folder' || (file.dir===true) || (file.mimeType&&file.mimeType.includes('folder')));
    }
    function getFolderPath(file){
      // ★ v1.0.103 FIX (Task 20-5 #11): unify path normalization with normPath.
      //   normPath strips trailing slash; getFolderPath used to return raw
      //   file.path (might or might not end with /). Folder paths now canonical
      //   as "/0:/Cursos/" (with trailing /), and folder card render (line ~1108)
      //   no longer needs the defensive `if(!target.endsWith('/'))target=target+'/';`
      //   because getFolderPath guarantees the trailing slash.
      let p = null;
      if(file.path) p = file.path;
      else if(file.parentPath && file.name) p = file.parentPath + '/' + encodeURIComponent(file.name);
      else if(file.fullPath) p = file.fullPath;
      if(p && !p.endsWith('/')) p = p + '/';
      return p;
    }
    function getFileName(file){return file.name||file.title||file.originalName||'pasta';}

    function renderBreadcrumb(){
      const segs=pathSegments(currentPath);
      let html=`<span class="gdi-amc-bc-item" data-p="/" style="cursor:pointer;color:var(--ferreto-secondary,#5ddeda);"><i class="bi bi-house"></i> Home</span>`;
      let acc='';
      for(const s of segs){
        acc+='/'+s;
        const display=decodeURIComponent(getDriveName(s));
        html+=`<span style="color:var(--ferreto-text-faint,#6b7488);">/</span><span class="gdi-amc-bc-item" data-p="${esc(acc)}" style="cursor:pointer;color:var(--ferreto-text,#e6edf3);">${esc(display)}</span>`;
      }
      bcEl.innerHTML=html;
      bcEl.querySelectorAll('.gdi-amc-bc-item').forEach(el=>{
        el.onclick=()=>navigate(el.dataset.p);
      });
    }

    // ★ FIX: Normaliza path para sempre ter / no final de drive (ex: /0: → /0:/)
    function normalizeNavPath(p){
      if(!p||p==='/')return '/';
      if(/^\/\d+:$/.test(p))return p+'/';
      return p;
    }
    async function navigate(path){
      currentPath=normalizeNavPath(normPath(path));
      renderBreadcrumb();
      loadingEl.style.display='block';
      foldersEl.innerHTML='';
      currentInfoEl.style.display='none';
      // ★ v1.0.100 FIX (BUG C-4): when navigating to '/', show drive list instead of fetching '/'
      if(currentPath==='/'){
        loadingEl.style.display='none';
        if(window.drive_names && window.drive_names.length){
          foldersEl.innerHTML='';
          window.drive_names.forEach((dn,i)=>{
            const card=document.createElement('div');
            card.className='gdi-amc-folder-card';
            card.dataset.p='/'+i+':';
            card.dataset.n=dn;
            card.style.cssText='padding:12px 14px;background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#30363d);border-radius:10px;cursor:pointer;transition:all .15s;';
            card.innerHTML=`<div style="display:flex;align-items:center;gap:8px;"><i class="bi bi-hdd-stack-fill" style="color:var(--ferreto-primary,#ff8b9f);font-size:18px;flex:none;"></i><b style="color:var(--ferreto-text,#f0f6fc);font-size:13px;">${esc(dn)}</b><i class="bi bi-chevron-right" style="color:var(--ferreto-text-faint,#6b7488);font-size:12px;flex:none;margin-left:auto;"></i></div>`;
            card.onmouseenter=()=>{card.style.borderColor='var(--ferreto-primary,#ff8b9f)';card.style.background='var(--ferreto-surface-3,rgba(255,255,255,.08))';};
            card.onmouseleave=()=>{card.style.borderColor='var(--ferreto-border,#30363d)';card.style.background='var(--ferreto-surface-2,rgba(255,255,255,.04))';};
            card.onclick=()=>navigate('/'+i+':/');
            foldersEl.appendChild(card);
          });
        }else{
          foldersEl.innerHTML='<p style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;text-align:center;padding:20px;">Lista de drives indisponível. Recarregue a página.</p>';
        }
        return;
      }
      try{
        // ★ ESTRATÉGIA: chama gdiListAllFiles (faz POST no path com paginação)
        const pw=window.gdiGetPw?window.gdiGetPw(currentPath):'';  // ★ v1.0.100 FIX: pass path arg (BUG C-1)
        let allFiles=[];
        if(window.gdiListAllFiles){
          try{
            const result=await window.gdiListAllFiles(currentPath, pw);
            if(Array.isArray(result))allFiles=result;
          }catch(e){console.warn('[AddCourse] gdiListAllFiles falhou:',e.message);}
        }
        if(!allFiles.length && currentPath!=='/'){
          try{
            const ctrl=new AbortController();
            const to=setTimeout(()=>ctrl.abort(),15000);
            const r=await fetch(currentPath,{
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body:JSON.stringify({password:pw||'',page_token:'',page_index:0}),
              signal:ctrl.signal
            });
            clearTimeout(to);
            if(r.ok){
              const d=await r.json();
              if(d&&d.data&&Array.isArray(d.data.files))allFiles=d.data.files;
            }else{
              console.warn('[AddCourse] fetch direto HTTP',r.status);
            }
          }catch(e){console.warn('[AddCourse] fetch direto falhou:',e.message);}
        }
        // Filtra só folders + arquivos relevantes
        const seen=new Set();
        const folders=[];
        const pdfs=[];
        const videos=[];
        for(const f of allFiles){
          if(!f)continue;
          if(isFolder(f)){
            const fn=getFileName(f);
            const fp=getFolderPath(f);
            const k=fp+'|'+fn;
            if(seen.has(k))continue;
            seen.add(k);
            folders.push(f);
          }else if(f.mimeType&&(f.mimeType.includes('pdf')||f.mimeType.includes('video'))){
            if(f.mimeType.includes('pdf'))pdfs.push(f);
            if(f.mimeType.includes('video'))videos.push(f);
          }
        }
        loadingEl.style.display='none';
        if(!folders.length && !pdfs.length && !videos.length){
          foldersEl.innerHTML='<div style="grid-column:1/-1;padding:30px;text-align:center;color:var(--ferreto-text-muted,#8b949e);font-size:13px;"><i class="bi bi-folder2-open" style="font-size:32px;display:block;margin-bottom:8px;color:var(--ferreto-text-faint,#6b7488);"></i>Nenhum arquivo encontrado aqui.<br><span style="font-size:11px;color:var(--ferreto-text-faint,#6b7488);">Verifique se o caminho existe ou se você está logado.</span></div>';
        }else if(!folders.length){
          foldersEl.innerHTML='<div style="grid-column:1/-1;padding:30px;text-align:center;color:var(--ferreto-text-muted,#8b949e);font-size:13px;"><i class="bi bi-folder2-open" style="font-size:32px;display:block;margin-bottom:8px;color:var(--ferreto-text-faint,#6b7488);"></i>Nenhuma subpasta aqui.<br>Esta é uma pasta folha — você pode selecioná-la como curso abaixo.</div>';
          const filesInfo=document.createElement('div');
          filesInfo.style.cssText='grid-column:1/-1;display:flex;flex-direction:column;gap:4px;padding:8px;';
          pdfs.slice(0,10).forEach(p=>{
            const row=document.createElement('div');
            row.style.cssText='font-size:11px;color:var(--ferreto-text-muted,#8b949e);padding:4px 8px;background:var(--ferreto-surface-2,rgba(255,255,255,.04));border-radius:6px;';
            row.innerHTML='<i class="bi bi-file-earmark-pdf" style="color:#ff6b6b;"></i> '+esc(getFileName(p));
            filesInfo.appendChild(row);
          });
          videos.slice(0,10).forEach(v=>{
            const row=document.createElement('div');
            row.style.cssText='font-size:11px;color:var(--ferreto-text-muted,#8b949e);padding:4px 8px;background:var(--ferreto-surface-2,rgba(255,255,255,.04));border-radius:6px;';
            row.innerHTML='<i class="bi bi-camera-video" style="color:#5ddeda;"></i> '+esc(getFileName(v));
            filesInfo.appendChild(row);
          });
          foldersEl.appendChild(filesInfo);
        }else{
          foldersEl.innerHTML=folders.slice(0,200).map(f=>{
            const fp=getFolderPath(f);
            const fn=getFileName(f);
            let target;
            if(fp){
              target=fp;
            }else{
              const base=currentPath.endsWith('/')?currentPath:currentPath+'/';
              target=base+encodeURIComponent(fn);
            }
            if(!target.endsWith('/'))target=target+'/';
            return `<div class="gdi-amc-folder-card" data-p="${esc(target)}" data-n="${esc(fn)}" style="padding:12px 14px;background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#30363d);border-radius:10px;cursor:pointer;transition:all .15s;">
              <div style="display:flex;align-items:center;gap:8px;">
                <i class="bi bi-folder-fill" style="color:var(--ferreto-secondary,#5ddeda);font-size:18px;flex:none;"></i>
                <b style="color:var(--ferreto-text,#f0f6fc);font-size:13px;line-height:1.3;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(fn)}</b>
                <i class="bi bi-chevron-right" style="color:var(--ferreto-text-faint,#6b7488);font-size:12px;flex:none;"></i>
              </div>
            </div>`;
          }).join('');
          foldersEl.querySelectorAll('.gdi-amc-folder-card').forEach(card=>{
            card.onmouseenter=()=>{card.style.borderColor='var(--ferreto-primary,#ff8b9f)';card.style.background='var(--ferreto-surface-3,rgba(255,255,255,.08))';};
            card.onmouseleave=()=>{card.style.borderColor='var(--ferreto-border,#30363d)';card.style.background='var(--ferreto-surface-2,rgba(255,255,255,.04))';};
            card.onclick=()=>navigate(card.dataset.p);
          });
        }
        // mostra info da pasta atual
        const totalPdfs=pdfs.length;
        const totalVideos=videos.length;
        const isDriveRoot = /^\/\d+:\/?$/.test(currentPath); if(currentPath!=='/' && !isDriveRoot){
          const segs=pathSegments(currentPath);
          const courseName=decodeURIComponent(getDriveName(segs[segs.length-1]));
          selectedPath=currentPath;
          selectedName=courseName;
          currentInfoEl.style.display='block';
          // ★ PATCH G: captura de clique no botão "Selecionar esta pasta"
          // agora é feita pelo listener anexado ao overlay (não mais no document).
          // O botão tem onclick inline que chama window.gdiAddCourseFromButton(this)
          // como fallback caso o listener no overlay não dispare.
          currentInfoEl.innerHTML=`<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
            <div style="font-size:30px;flex:none;">📁</div>
            <div style="flex:1;min-width:200px;">
              <b style="color:var(--ferreto-text,#f0f6fc);font-size:14px;">${esc(courseName)}</b>
              <div style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;margin-top:4px;">${totalPdfs} PDF(s) · ${totalVideos} vídeo(s) nesta pasta</div>
              <div style="color:var(--ferreto-text-faint,#6b7488);font-size:11px;margin-top:2px;font-family:'JetBrains Mono',monospace;word-break:break-all;">${esc(currentPath)}</div>
            </div>
            <button id="gdi-amc-select-current" type="button" data-path="${esc(currentPath)}" data-name="${esc(courseName)}" data-pdfs="${totalPdfs}" style="padding:10px 18px;border-radius:8px;border:0;cursor:pointer;font-weight:600;background:var(--ferreto-grad);color:#fff;font-size:13px;flex:none;pointer-events:auto;">✓ Selecionar esta pasta</button>
          </div>`;
          saveBtn.textContent='✓ Adicionar "'+courseName.slice(0,30)+'"';
        }else{
          selectedPath=null;
          selectedName=null;
          currentInfoEl.style.display='none';
          saveBtn.textContent='📂 Selecione uma pasta primeiro';
        }
      }catch(e){
        console.error('[AddCourse] erro ao navegar:',e);
        loadingEl.style.display='none';
        foldersEl.innerHTML='<div style="grid-column:1/-1;padding:20px;text-align:center;color:#ff8b8b;font-size:13px;">Erro: '+esc(e.message)+'</div>';
      }
    }

    // ── Adiciona curso a partir de pasta selecionada no Drive ──
    async function doAddCourseFromDrive(coursePath, courseName, pdfCount){
      // ★ FIX 1 (Task 23): decode URL-encoded courseName defensively (same reason as gdiAddCourseFromDrive).
      try{if(courseName&&String(courseName).indexOf('%')>=0)courseName=decodeURIComponent(courseName);}catch(_){}
      // ★ FIX (Task 20-13 #6): normalize coursePath — same as gdiAddCourseFromDrive.
      //   Strips trailing slashes so '/0:/Cursos/' and '/0:/Cursos' are treated
      //   as the same course in the duplicate check and in storage.
      coursePath = String(coursePath||'').replace(/\/+$/,'') || '/';
      try{
        const LS_MANUAL='gdi-manual-courses-v1';
        const manual=lsGet(LS_MANUAL,[]);
        // evita duplicar — compare normalized (low() strips trailing slash + lowercases)
        if(manual.some(c=>c&&low(c.path)===low(coursePath))){
          showToast('Curso "'+courseName+'" já está adicionado');
          return;
        }
        const courseId='mc-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);
        manual.push({
          id:courseId,name:courseName,icon:'📁',color:'#5ddeda',
          goal:60,notes:'',createdAt:Date.now(),
          manual:true,path:coursePath,courseKey:coursePath,
          // ★ v1.0.103 FIX (Task 20-5 #8): unify schema with gdiAddCourseFromDrive
          //   (line 122) — add pdfCount so collectCourses() reads the same
          //   totalLessons field regardless of which code path saved the course.
          pdfCount:pdfCount||0
        });
        lsSet(LS_MANUAL,manual);
        // ★ v1.0.103 FIX (Task 20-5 #9): emit courses:changed to invalidate caches.
        try{ if(typeof Bus!=='undefined' && Bus.emit) Bus.emit('courses:changed', {}); }catch(_){}
        // ★ FIX: salva também no Drive via /api/courses/add (para persistir entre sessões/logouts)
        try{
          const r=await fetch('/api/courses/add',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({coursePath,courseName,pdfCount:pdfCount||0,addedAt:Date.now()})
          });
          if(r.ok){
            await r.json().catch(()=>({}));
          }else{
            console.warn('[AddCourse] /api/courses/add HTTP',r.status,'— continuando mesmo assim');
          }
        }catch(e){
          console.warn('[AddCourse] falha ao salvar no Drive (continuando):',e.message);
        }
        if(window.showToast)showToast('Curso "'+courseName+'" adicionado! 🐩 Batalhão de IA iniciando em background...');
        try{
          renderCursos(box).catch(()=>{});
        }catch(e){
          console.warn('[AddCourse] erro ao re-renderizar:',e.message);
        }
        if(overlay&&overlay.parentNode){
          overlay.remove();
        }
        // ★ v1.0.101 FIX (Agent 10 Bug 21): switch to home tab after closing modal
        try{
          const homeTab = document.querySelector('.gdi-central-tab[data-t="home"]');
          if(homeTab) homeTab.click();
        }catch(_){}
        // ★ BATALHÃO: dispara processamento em background (depois que modal já fechou)
        try{
          if(window.gdiIsaPdf && window.gdiIsaPdf.startBattalion){
            window.gdiIsaPdf.startBattalion(coursePath, coursePath, courseName, []).catch(e=>{
              console.warn('[Batalhão] falha assíncrona (não bloqueante):',e.message);
            });
          }else{
            console.warn('[AddCourse] gdiIsaPdf.startBattalion não disponível — batalhão não disparado');
          }
        }catch(e){console.warn('[Batalhão] falha:',e.message);}
      }catch(e){
        console.error('[AddCourse] erro fatal em doAddCourseFromDrive:',e);
        if(window.showToast)showToast('Erro ao adicionar curso: '+e.message);
        throw e;
      }
    }

    // ── Painel Manual (ícones + cores) ──
    overlay.querySelectorAll('.gdi-amc-icon-btn').forEach(b=>{
      b.onclick=()=>{
        overlay.querySelectorAll('.gdi-amc-icon-btn').forEach(x=>x.style.borderColor='var(--ferreto-border,#30363d)');
        b.style.borderColor='var(--ferreto-primary,#ff8b9f)';
        selectedIcon=b.dataset.icon;
      };
    });
    overlay.querySelectorAll('.gdi-amc-color-btn').forEach(b=>{
      b.onclick=()=>{
        overlay.querySelectorAll('.gdi-amc-color-btn').forEach(x=>x.style.borderWidth='2px');
        b.style.borderWidth='4px';
        selectedColor=b.dataset.color;
      };
    });
    const firstIcon=overlay.querySelector('.gdi-amc-icon-btn');
    if(firstIcon)firstIcon.style.borderColor='var(--ferreto-primary,#ff8b9f)';
    const firstColor=overlay.querySelector('.gdi-amc-color-btn');
    if(firstColor)firstColor.style.borderWidth='4px';

    // ── Close handlers ──
    // ★ v1.0.84 BUG #11: when the addmateria modal closes, restore the home tab
    // if 'addmateria' was the highlighted sidebar tab. Without this, the sidebar
    // stays on 'addmateria' (which has no real body — it's a modal trigger) while
    // the body shows stale content from the previous tab → confusing mismatch.
    // If the modal was opened from a button (e.g. "Adicionar curso" on home/cursos),
    // 'addmateria' is NOT active in the sidebar → we leave everything alone.
    const close=()=>{
      if(overlay&&overlay.parentNode)overlay.remove();
      try{
        const panelEl = box.closest ? box.closest('#gdi-central') : null;
        if(panelEl){
          const addTab = panelEl.querySelector('.gdi-central-tab[data-t="addmateria"]');
          if(addTab && addTab.classList.contains('active')){
            const homeTab = panelEl.querySelector('.gdi-central-tab[data-t="home"]');
            if(homeTab && !homeTab.classList.contains('active')){
              homeTab.click();  // re-runs tab click handler → activate + renderBody('home')
            }
          }
        }
      }catch(_){}
    };
    overlay.querySelector('#gdi-amc-x').onclick=close;
    overlay.querySelector('#gdi-amc-cancel').onclick=close;
    overlay.onclick=(e)=>{if(e.target===overlay)close();};

    // ★ PATCH G: listener de clique no botão "Selecionar esta pasta" anexado ao OVERLAY
    // (não mais ao document com capture:true). Quando o overlay é removido (close),
    // o listener vai junto — sem resíduo global. Use capture:true para pegar antes
    // do overlay.onclick (que fecha o modal em cliques fora do conteúdo).
    const selectCurrentHandler=async(e)=>{
      const btn=e.target.closest&&e.target.closest('#gdi-amc-select-current');
      if(!btn)return;  // não foi clique no botão → ignora
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if(window.gdiAddCourseFromButton)window.gdiAddCourseFromButton(btn);
    };
    overlay.addEventListener('click',selectCurrentHandler,true);

    // ★ ENG-SCANNER-DISTRIBUIDO (Task 6 / Agent 6): "Re-adicionar curso por caminho"
    // Permite ao aluno colar um coursePath (ex: /11:/TJ SP Escrevente) e validar
    // via window.gdiCourseScanner.validateCoursePath() antes de adicionar.
    const restorePathBtn = overlay.querySelector('#gdi-amc-restore-btn');
    const restorePathInput = overlay.querySelector('#gdi-amc-restore-path');
    if(restorePathBtn && restorePathInput){
      const doRestore = async function(){
        const coursePath = (restorePathInput.value||'').trim();
        if(!coursePath){
          showToast('Digite o caminho do curso (ex: /11:/TJ SP Escrevente)');
          restorePathInput.focus();
          return;
        }
        const originalText = restorePathBtn.textContent;
        restorePathBtn.disabled = true;
        restorePathBtn.style.opacity = '0.6';
        restorePathBtn.style.pointerEvents = 'none';
        restorePathBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Validando...';
        try{
          // Resolve courseName from path tail (fallback when validator doesn't return one)
          const fallbackName = (function(){
            const segs = String(coursePath).split('/').filter(Boolean);
            let n = segs[segs.length-1] || 'Curso';
            try{ n = decodeURIComponent(n); }catch(_){}
            return n;
          })();
          // ★ Call validateCoursePath (Agent 5 exposes on window.gdiCourseScanner)
          let result = null;
          if(window.gdiCourseScanner && typeof window.gdiCourseScanner.validateCoursePath === 'function'){
            try{ result = await window.gdiCourseScanner.validateCoursePath(coursePath); }
            catch(e){ console.warn('[RestorePath] validateCoursePath erro:', e && e.message); }
          }
          if(result && result.exists === true){
            const courseName = result.courseName || fallbackName;
            if(window.showToast) showToast('Curso válido! Adicionado: '+courseName);
            // ★ Reuse the existing add-course flow (closes modal, starts battalion, scans)
            await window.gdiAddCourseFromDrive(coursePath, courseName, result.pdfCount || 0);
          } else if(!result){
            // Validator returned null/undefined — likely network error
            if(window.showToast) showToast('Não foi possível validar o caminho. Tente novamente.');
            restorePathInput.style.borderColor = '#ff6b6b';
            restorePathInput.style.boxShadow = '0 0 0 3px rgba(255,107,107,.15)';
            setTimeout(function(){
              restorePathInput.style.borderColor = '';
              restorePathInput.style.boxShadow = '';
            }, 1500);
            restorePathInput.focus();
          } else {
            // exists === false or other failure
            if(window.showToast) showToast('Curso não encontrado neste drive. Verifique o caminho.');
            restorePathInput.style.borderColor = '#ff6b6b';
            restorePathInput.style.boxShadow = '0 0 0 3px rgba(255,107,107,.15)';
            setTimeout(function(){
              restorePathInput.style.borderColor = '';
              restorePathInput.style.boxShadow = '';
            }, 1500);
            restorePathInput.focus();
            restorePathInput.select();
          }
        }catch(err){
          console.error('[RestorePath] erro:', err);
          if(window.showToast) showToast('Erro: '+(err && err.message || err));
        }finally{
          restorePathBtn.disabled = false;
          restorePathBtn.style.opacity = '1';
          restorePathBtn.style.pointerEvents = 'auto';
          restorePathBtn.textContent = originalText;
        }
      };
      restorePathBtn.onclick = doRestore;
      restorePathInput.addEventListener('keydown', function(e){
        if(e.key === 'Enter'){
          e.preventDefault();
          e.stopPropagation();
          doRestore();
        }
      });
    }

    // ── Save handler (decide modo) ──
    saveBtn.onclick=async (e)=>{
      if(e){e.preventDefault();e.stopPropagation();}
      try{
        if(currentMode==='drive'){
          if(!selectedPath||!selectedName){
            console.warn('[AddCourse] nenhum path selecionado');
            showToast('Navegue até uma pasta e clique em "Selecionar esta pasta"');
            return;
          }
          await doAddCourseFromDrive(selectedPath, selectedName, 0);
        }else{
          // modo manual
          const name=overlay.querySelector('#gdi-amc-name').value.trim();
          if(!name){showToast('Digite o nome do curso');return;}
          const goal=parseInt(overlay.querySelector('#gdi-amc-goal').value)||60;
          const notes=overlay.querySelector('#gdi-amc-notes').value.trim();
          const LS_MANUAL='gdi-manual-courses-v1';
          const manual=lsGet(LS_MANUAL,[]);
          const courseId='mc-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);
          const coursePath='/0:/'+encodeURIComponent(name);
          manual.push({
            id:courseId,name,icon:selectedIcon,color:selectedColor,
            goal,notes,createdAt:Date.now(),
            manual:true,path:coursePath,courseKey:coursePath,
            // ★ v1.0.103 FIX (Task 20-5 #8): unify schema — manual add also has pdfCount=0
            pdfCount:0
          });
          lsSet(LS_MANUAL,manual);
          // ★ v1.0.103 FIX (Task 20-5 #9): emit courses:changed to invalidate caches.
          try{ if(typeof Bus!=='undefined' && Bus.emit) Bus.emit('courses:changed', {}); }catch(_){}
          if(overlay&&overlay.parentNode)overlay.remove();
          // ★ FIX (Agent 10 Bug 22): mirror v1.0.101 fix for doAddCourseFromDrive —
          //    after closing the manual-add modal, click the 'home' tab so the
          //    user sees the course list (otherwise the body stays empty because
          //    renderBody('addmateria') only reopens this modal).
          try{
            const homeTab = document.querySelector('.gdi-central-tab[data-t="home"]');
            if(homeTab) homeTab.click();
          }catch(_){}
          showToast('Curso "'+name+'" adicionado! 🐩 Batalhão de IA iniciando em background...');
          try{renderCursos(box).catch(()=>{});}catch(_){}
          // ★ BATALHÃO para manual
          try{
            const pdfs=[];
            if(window.gdiListAllFiles){
              try{
                const files=await window.gdiListAllFiles(coursePath,'');
                if(Array.isArray(files)){
                  for(const f of files){
                    if(f && f.mimeType && (f.mimeType.includes('pdf')||f.name&&f.name.toLowerCase().endsWith('.pdf'))){
                      pdfs.push({name:f.name, url:f.path||f.url, text:''});
                    }
                  }
                }
              }catch(_){}
            }
            if(window.gdiIsaPdf && window.gdiIsaPdf.startBattalion){
              if(pdfs.length && window.gdiIsaPdf.extractPdfText){
                const PARALLEL=5;
                for(let i=0;i<pdfs.length;i+=PARALLEL){
                  const chunk=pdfs.slice(i,i+PARALLEL);
                  await Promise.allSettled(chunk.map(async p=>{
                    try{
                      if(p.url){
                        const txt=await window.gdiIsaPdf.extractPdfText(p.url);
                        p.text=txt.slice(0,15000);
                      }
                    }catch(_){}
                  }));
                }
              }
              await window.gdiIsaPdf.startBattalion(coursePath, coursePath, name, pdfs);
            }
          }catch(e){console.warn('[Batalhão] falha:',e.message);}
        }
      }catch(e){
        console.error('[AddCourse] erro fatal no save handler:',e);
        if(window.showToast)showToast('Erro: '+e.message);
      }
    };

    // ── Inicia navegação na raiz ──
    setTimeout(()=>{
      if(window.drive_names && window.drive_names.length){
        bcEl.innerHTML=`<span class="gdi-amc-bc-item" data-p="/" style="cursor:pointer;color:var(--ferreto-secondary,#5ddeda);"><i class="bi bi-house"></i> Home</span>`;
        foldersEl.innerHTML='';
        loadingEl.style.display='none';
        window.drive_names.forEach((dn,i)=>{
          const card=document.createElement('div');
          card.className='gdi-amc-folder-card';
          card.dataset.p='/'+i+':';
          card.dataset.n=dn;
          card.style.cssText='padding:12px 14px;background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#30363d);border-radius:10px;cursor:pointer;transition:all .15s;';
          card.innerHTML=`<div style="display:flex;align-items:center;gap:8px;"><i class="bi bi-hdd-stack-fill" style="color:var(--ferreto-primary,#ff8b9f);font-size:18px;flex:none;"></i><b style="color:var(--ferreto-text,#f0f6fc);font-size:13px;">${esc(dn)}</b><i class="bi bi-chevron-right" style="color:var(--ferreto-text-faint,#6b7488);font-size:12px;flex:none;margin-left:auto;"></i></div>`;
          card.onmouseenter=()=>{card.style.borderColor='var(--ferreto-primary,#ff8b9f)';card.style.background='var(--ferreto-surface-3,rgba(255,255,255,.08))';};
          card.onmouseleave=()=>{card.style.borderColor='var(--ferreto-border,#30363d)';card.style.background='var(--ferreto-surface-2,rgba(255,255,255,.04))';};
          card.onclick=()=>navigate('/'+i+':/');
          foldersEl.appendChild(card);
        });
        currentInfoEl.style.display='none';
      }else{
        navigate('/0:/');
      }
    },50);
  }

  // ★ Modal de cursos ocultos
  function showHiddenCoursesModal(box){
    const hidden=listHiddenCourses();
    if(!hidden.length){showToast('Nenhum curso oculto');return;}
    const items=hidden.map(ck=>({
      key:ck,
      name:cleanCourseName(ck),
      drive:driveNameOf(ck)
    }));
    box.innerHTML=`<div style="max-width:680px;margin:0 auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--ferreto-border,#21262d);">
        <b style="color:var(--ferreto-text,#f0f6fc);font-size:15px;"><i class="bi bi-eye-slash"></i> Cursos ocultos (${hidden.length})</b>
        <button id="gdi-hidden-back" class="gdi-mode-btn" style="font-size:12px;"><i class="bi bi-arrow-left"></i> Voltar</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${items.map(it=>`
          <div class="gdi-note" style="display:flex;align-items:center;gap:10px;">
            <i class="bi bi-folder-x" style="color:var(--ferreto-text-muted,#8b949e);font-size:16px;flex:none;"></i>
            <div style="flex:1;min-width:0;">
              <b style="color:var(--ferreto-text,#f0f6fc);font-size:13px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(it.name)}</b>
              ${it.drive?`<small style="color:var(--ferreto-secondary,#5ddeda);font-size:10px;">${escHtml(it.drive)}</small>`:''}
            </div>
            <button class="gdi-mode-btn gdi-restore-one" data-ck="${escHtml(it.key)}" style="font-size:11px;"><i class="bi bi-arrow-counterclockwise"></i> Restaurar</button>
          </div>
        `).join('')}
      </div>
      <div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--ferreto-border,#21262d);display:flex;gap:8px;justify-content:flex-end;">
        <button id="gdi-restore-all" class="gdi-btn gdi-btn-primary" style="font-size:12px;"><i class="bi bi-arrow-counterclockwise"></i> Restaurar todos</button>
      </div>
    </div>`;
    box.querySelector('#gdi-hidden-back').onclick=()=>{try{renderCursos(box).catch(()=>{});}catch(_){}};
    box.querySelectorAll('.gdi-restore-one').forEach(b=>{
      b.onclick=async ()=>{
        // ★ v1.0.103 FIX (Task 20-5 #10): await unhideCourse so the write
        //   chain completes BEFORE showHiddenCoursesModal reads LS_HIDDEN.
        await unhideCourse(b.dataset.ck);
        showToast('Curso restaurado');
        showHiddenCoursesModal(box);
      };
    });
    box.querySelector('#gdi-restore-all').onclick=async ()=>{
      const ok=await window.gdiModal({
        title:'Restaurar todos',
        message:'Restaurar todos os '+hidden.length+' cursos?',
        confirmText:'Restaurar todos',
        cancelText:'Cancelar'
      });
      if(ok){
        // ★ v1.0.103 FIX (Task 20-5 #10): route through _hiddenWriteChain to
        //   avoid racing with pending hideCourse writes. Also emit
        //   courses:changed so caches invalidate.
        await _queueHiddenWrite(() => {
          lsSet(LS_HIDDEN,[]);
          try{ if(typeof Bus!=='undefined' && Bus.emit) Bus.emit('courses:changed', {}); }catch(_){}
        });
        showToast('Todos os cursos restaurados');
        renderCursos(box).catch(()=>{});
      }
    };
  }
  // ★ Painel de detalhes do curso (abre ao clicar no card)
  function openCourseDetail(box,c){
    const name=cleanCourseName(c.key);
    const drive=driveNameOf(c.key);
    // ★ FIX 3b (Task 14): usa totalLessons real (do manual course) ao invés de c.lessons.size
    // (que era o nº de paths visitados — wrong).
    const total=c.totalLessons||c.lessons.size||0;
    const watched=c.watched||0;
    const remaining=Math.max(0,total-watched);  // ★ nunca negativo
    const progress=total>0?Math.min(100,Math.round(watched/total*100)):(watched>0?100:0);
    const progressColor=progress>=80?'#3fb950':progress>=40?'#ffd43b':'var(--ferreto-primary,#ff8b9f)';
    const coursePath=c.key;  // e.g. /4:/CANTE COM EXCELENCIA 2.0 + COMUNIDADE/

    // coleta aulas individuais do curso
    const d=stateD()||{};
    const pre=low(c.key);
    const inC=p=>{const l=low(p);return l===pre||l.indexOf(pre+'/')===0;};
    const lessons=[];
    const w=(d&&d.watched)||{},r=(d&&d.resume)||{};
    const seen=new Set();
    const addLesson=(p,watched,resume)=>{
      const lp=low(p);
      if(seen.has(lp))return;
      if(!inC(p))return;
      seen.add(lp);
      lessons.push({path:String(p).split('?')[0],name:realName(p),watched,resumed:!!resume});
    };
    for(const k in w)addLesson(k,true,r[k]);
    for(const k in r)if(!seen.has(low(k)))addLesson(k,false,r[k]);
    (Array.isArray(d.history)?d.history:[]).forEach(h=>{if(h&&h.path)addLesson(h.path,false,null);});

    // ★ Task 15: merge com aulas escaneadas (scanner background).
    //    Se o scanner já encontrou aulas (via gdiListAllFiles recursivo),
    //    adicionamos as que ainda não estão na lista (não assistidas).
    //    Cada aula escaneada recebe watched=true se seu path estiver em d.watched.
    let scannedCount = 0;
    let scanStatus = null;
    if(window.gdiCourseScanner){
      try{
        const sp = window.gdiCourseScanner.getScanProgress(c.key);
        if(sp){
          scanStatus = sp.status;
          scannedCount = sp.lessonsFound || 0;
        }
        const scanned = window.gdiCourseScanner.getCourseLessons(c.key);
        if(scanned && Array.isArray(scanned.lessons) && scanned.lessons.length){
          for(let i=0; i<scanned.lessons.length; i++){
            const sl = scanned.lessons[i];
            if(!sl || !sl.path) continue;
            const lp = low(sl.path);
            if(seen.has(lp)) continue;  // já está na lista (assistida)
            seen.add(lp);
            // Verifica se foi assistida por match exato de path no userstate.watched
            const isWatched = !!(w && w[sl.path]);
            lessons.push({
              path: sl.path,
              name: sl.name || realName(sl.path),
              watched: isWatched,
              resumed: false
            });
          }
        }
      }catch(_){}
    }
    lessons.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR',{numeric:true}));

    box.innerHTML=`<div style="max-width:760px;margin:0 auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--ferreto-border,#21262d);">
        <div style="display:flex;align-items:center;gap:10px;min-width:0;">
          <button id="gdi-detail-back" class="gdi-mode-btn" style="font-size:12px;flex:none;"><i class="bi bi-arrow-left"></i></button>
          <i class="bi bi-folder-fill" style="color:var(--ferreto-primary,#ff8b9f);font-size:22px;flex:none;"></i>
          <div style="min-width:0;">
            <b style="color:var(--ferreto-text,#f0f6fc);font-size:16px;font-family:var(--ferreto-font-display,'Poppins',sans-serif);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(name)}</b>
            ${drive?`<small style="color:var(--ferreto-secondary,#5ddeda);font-size:11px;"><i class="bi bi-hdd"></i> ${escHtml(drive)}</small>`:''}
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          <button id="gdi-detail-restart-scan" data-course-key="${escHtml(c.key)}" style="font-size:12px;color:var(--ferreto-secondary,#5ddeda);border:1px solid rgba(93,222,218,.3);border-radius:8px;cursor:pointer;padding:6px 10px;background:transparent;" title="Reiniciar scanner"><i class="bi bi-arrow-repeat"></i> Reiniciar Scan</button>
          <button class="gdi-rescan-btn dropdown-item" data-course-key="${escHtml(c.key)}" style="font-size:12px;color:var(--ferreto-secondary,#5ddeda);border:1px solid rgba(93,222,218,.3);border-radius:8px;cursor:pointer;padding:6px 10px;background:transparent;display:inline-flex;align-items:center;gap:4px;" title="Reescanear (invalida cache compartilhado)"><i class="bi bi-arrow-repeat"></i> Reescanear</button>
          <button id="gdi-detail-remove" data-course-key="${escHtml(c.key)}" style="font-size:12px;color:#ff8b8b;border:1px solid rgba(255,107,107,.3);border-radius:8px;cursor:pointer;padding:6px 10px;background:transparent;" title="Remover curso"><i class="bi bi-trash3"></i> Remover</button>
          <button id="gdi-detail-hide" class="gdi-mode-btn" style="font-size:11px;color:#ff8b8b;border-color:rgba(255,107,107,.3);" title="Ocultar curso"><i class="bi bi-eye-slash"></i> Ocultar</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:18px;">
        <div style="background:var(--ferreto-surface-2,#161b22);border:1px solid var(--ferreto-border,#21262d);border-radius:10px;padding:12px;text-align:center;">
          <div style="font-size:22px;font-weight:700;color:var(--ferreto-text,#f0f6fc);">${total}</div>
          <div style="font-size:10px;color:var(--ferreto-text-muted,#8b949e);text-transform:uppercase;letter-spacing:.05em;margin-top:2px;">Aulas</div>
        </div>
        <div style="background:var(--ferreto-surface-2,#161b22);border:1px solid var(--ferreto-border,#21262d);border-radius:10px;padding:12px;text-align:center;">
          <div style="font-size:22px;font-weight:700;color:#3fb950;">${watched}</div>
          <div style="font-size:10px;color:var(--ferreto-text-muted,#8b949e);text-transform:uppercase;letter-spacing:.05em;margin-top:2px;">Assistidas</div>
        </div>
        <div style="background:var(--ferreto-surface-2,#161b22);border:1px solid var(--ferreto-border,#21262d);border-radius:10px;padding:12px;text-align:center;">
          <div style="font-size:22px;font-weight:700;color:#ffd43b;">${remaining}</div>
          <div style="font-size:10px;color:var(--ferreto-text-muted,#8b949e);text-transform:uppercase;letter-spacing:.05em;margin-top:2px;">Restantes</div>
        </div>
        <div style="background:var(--ferreto-surface-2,#161b22);border:1px solid var(--ferreto-border,#21262d);border-radius:10px;padding:12px;text-align:center;">
          <div style="font-size:22px;font-weight:700;color:${progressColor};">${progress}%</div>
          <div style="font-size:10px;color:var(--ferreto-text-muted,#8b949e);text-transform:uppercase;letter-spacing:.05em;margin-top:2px;">Concluído</div>
        </div>
      </div>

      <div style="margin-bottom:18px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <b style="color:var(--ferreto-text,#f0f6fc);font-size:13px;">Progresso do curso</b>
          <span style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;">${watched}/${total}</span>
        </div>
        <div style="height:8px;background:var(--ferreto-surface-3,rgba(255,255,255,.08));border-radius:4px;overflow:hidden;">
          <div style="height:8px;width:${progress}%;background:${progressColor};border-radius:4px;transition:width .3s;"></div>
        </div>
      </div>

      ${c.lastAt?`<div style="background:var(--ferreto-surface-2,rgba(255,255,255,.03));border:1px solid var(--ferreto-border,#21262d);border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:var(--ferreto-text-muted,#8b949e);">
        <i class="bi bi-clock-history"></i> Última atividade: <b style="color:var(--ferreto-text,#e6edf3);">${dateBr(c.lastAt)}</b>
      </div>`:''}

      ${(scanStatus==='scanning'||scanStatus==='error')?`
      <div style="background:var(--ferreto-surface-2,rgba(255,255,255,.03));border:1px solid var(--ferreto-border,#21262d);border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:var(--ferreto-text-muted,#8b949e);">
        ${scanStatus==='scanning'
          ? '<i class="bi bi-arrow-repeat" style="color:var(--ferreto-secondary,#5ddeda);"></i> Escaneando aulas em background... <b style="color:var(--ferreto-text,#e6edf3);">'+scannedCount+'</b> encontradas até agora (a lista abaixo cresce em tempo real).'
          : '<i class="bi bi-exclamation-triangle" style="color:#ff8b8b;"></i> O scanner encontrou um erro. Algumas aulas podem estar ausentes da lista.'}
      </div>`:''}

      <div style="margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap;">
        <button id="gdi-detail-continue" class="gdi-btn gdi-btn-primary" style="font-size:12px;flex:1;justify-content:center;" disabled><i class="bi bi-hourglass-split"></i> Verificando próxima aula…</button>
        <a href="${escHtml(coursePath)}" class="gdi-mode-btn" style="font-size:12px;flex:1;justify-content:center;text-decoration:none;display:inline-flex;align-items:center;gap:6px;" title="Abrir pasta no Drive"><i class="bi bi-folder2-open"></i> Ir para o Drive</a>
      </div>

      ${/* ★ Task 16 / FIX 2: botão "Escanear agora" na visão de detalhe */ ''}
      ${(!scanStatus || scanStatus === 'error') ? `
      <div style="margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap;">
        <button id="gdi-detail-scan" class="gdi-mode-btn" data-course-key="${escHtml(c.key)}" style="font-size:12px;flex:1;justify-content:center;color:var(--ferreto-secondary,#5ddeda);border-color:rgba(93,222,218,.3);" title="Escanear aulas do curso">
          <i class="bi bi-arrow-repeat"></i> Escanear agora
        </button>
      </div>` : ''}
      ${scanStatus === 'scanning' ? `
      <div style="margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap;">
        <button id="gdi-detail-scan" class="gdi-mode-btn" disabled style="font-size:12px;flex:1;justify-content:center;opacity:.7;cursor:default;">
          <i class="bi bi-hourglass-split"></i> Escaneando ${scannedCount} aulas… (${(function(){const sp=window.gdiCourseScanner&&window.gdiCourseScanner.getScanProgress(c.key);return sp?sp.percent:0})()}%)
        </button>
      </div>` : ''}

      <div>
        <b style="color:var(--ferreto-text,#f0f6fc);font-size:13px;display:block;margin-bottom:8px;"><i class="bi bi-collection"></i> Disciplinas do curso</b>
        ${(function(){
          // ★ Task 18: agrupa aulas por disciplina (pasta pai da aula)
          // Em vez de listar 265 "001 - aula.mp4", mostra:
          //   Direito Administrativo — 45 aulas · 12 assistidas · 33 restantes
          //   Direito Constitucional — 38 aulas · 5 assistidas · 33 restantes
          // etc.
          if(!lessons.length && !total){
            return '<div class="gdi-notes-empty"><i class="bi bi-info-circle" style="font-size:18px;color:var(--ferreto-text-muted,#8b949e);vertical-align:middle;"></i> <span style="vertical-align:middle;">Nenhuma aula encontrada ainda.</span><div style="margin-top:8px;font-size:12px;"><a href="'+escHtml(coursePath)+'" style="color:var(--ferreto-secondary,#5ddeda);text-decoration:underline;"><i class="bi bi-folder2-open"></i> Abrir pasta no Drive</a></div></div>';
          }
          // Agrupa por disciplina: a pasta imediatamente dentro do curso
          // path típico: /9:/Curso/TRT/Direito Administrativo/Bloco I/001 - aula.mp4
          // disciplina = "Direito Administrativo" (primeiro segmento após coursePath)
          const groups = {};
          for(const l of lessons){
            // extrai disciplina do path (relativo ao coursePath)
            let rel = l.path;
            try{ rel = decodeURIComponent(l.path); }catch(_){ rel = l.path; }
            // remove coursePath do início
            let cp = coursePath;
            try{ cp = decodeURIComponent(coursePath); }catch(_){ cp = coursePath; }
            if(rel.indexOf(cp) === 0) rel = rel.slice(cp.length);
            const segs = rel.split('/').filter(Boolean);
            // disciplina = primeiro segmento após o curso (ou "Aulas" se estiver na raiz)
            const disc = segs.length > 1 ? segs[0] : (segs.length === 1 ? 'Aulas' : 'Outros');
            if(!groups[disc]) groups[disc] = { total: 0, watched: 0, path: cp + (cp.endsWith('/')?'':'/') + encodeURIComponent(disc) + '/' };
            groups[disc].total++;
            if(l.watched) groups[disc].watched++;
          }
          const arr = Object.keys(groups).sort((a,b) => a.localeCompare(b,'pt-BR'));
          if(!arr.length){
            return '<div class="gdi-notes-empty"><i class="bi bi-hourglass-split" style="color:var(--ferreto-secondary,#5ddeda);"></i> <span>Escaneando disciplinas...</span></div>';
          }
          return '<div style="display:flex;flex-direction:column;gap:8px;">' + arr.map(disc => {
            const g = groups[disc];
            const remaining = Math.max(0, g.total - g.watched);
            const pct = g.total > 0 ? Math.round(g.watched / g.total * 100) : 0;
            const color = pct >= 80 ? '#3fb950' : pct >= 40 ? '#ffd43b' : 'var(--ferreto-primary,#ff8b9f)';
            return '<div class="gdi-note" style="display:flex;align-items:center;gap:12px;cursor:pointer;padding:10px 12px;" data-disc-path="'+escHtml(g.path)+'">'
              + '<i class="bi bi-folder-fill" style="color:var(--ferreto-secondary,#5ddeda);font-size:18px;flex:none;"></i>'
              + '<div style="flex:1;min-width:0;">'
              + '<div style="color:var(--ferreto-text,#e6edf3);font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+escHtml(disc)+'</div>'
              + '<div style="font-size:11px;color:var(--ferreto-text-muted,#8b949e);margin-top:2px;">'
              + '<span style="color:#3fb950;">'+g.watched+' assistidas</span> · '
              + '<span>'+g.total+' aulas</span> · '
              + '<span style="color:#ffd43b;">'+remaining+' restantes</span>'
              + '</div>'
              + '</div>'
              + '<div style="flex:none;text-align:right;">'
              + '<div style="font-size:16px;font-weight:700;color:'+color+';">'+pct+'%</div>'
              + '<div style="width:60px;height:4px;background:var(--ferreto-surface-3,rgba(255,255,255,.08));border-radius:2px;margin-top:3px;overflow:hidden;">'
              + '<div style="height:4px;width:'+pct+'%;background:'+color+';border-radius:2px;"></div>'
              + '</div>'
              + '</div>'
              + '</div>';
          }).join('') + '</div>';
        })()}
      </div>
    </div>`;

    // ★ FIX (Agent 16 UIUX-5): null-check every querySelector result before
    //    assigning .onclick — openCourseDetail's box.innerHTML template is
    //    conditional (e.g. #gdi-detail-scan is only rendered for !scanning or
    //    error states), so a missing element used to throw TypeError and
    //    break the whole detail view.
    const _detailBack = box.querySelector('#gdi-detail-back');
    if(_detailBack) _detailBack.onclick=()=>{try{renderCursos(box).catch(()=>{});}catch(_){}};
    const _detailHide = box.querySelector('#gdi-detail-hide');
    if(_detailHide) _detailHide.onclick=async ()=>{
      const ok=await window.gdiModal({
        title:'Ocultar curso',
        message:'Ocultar "'+name+'" da sua lista de cursos?',
        confirmText:'Ocultar',
        cancelText:'Cancelar',
        danger:true
      });
      if(ok){
        // ★ v1.0.103 FIX (Task 20-5 #10): await hideCourse to serialize write
        //   before renderCursos reads LS_HIDDEN.
        await hideCourse(c.key);
        showToast('Curso ocultado');
        renderCursos(box).catch(()=>{});
      }
    };
    // ★ Task FINAL / Fix 2c: botão "Remover" — remove o curso permanentemente
    //   do localStorage (não apenas oculta). Pede confirmação via modal.
    // ★ v1.0.97 FIX: também chama POST /api/courses/remove para remover o user do
    //   general_courses.json no servidor. Sem isso, syncCoursesFromDrive() re-lê o
    //   servidor e re-adiciona o curso a cada renderHome.
    const _detailRemove = box.querySelector('#gdi-detail-remove');
    if(_detailRemove) _detailRemove.onclick=async ()=>{
      const ok=await window.gdiModal({
        title:'Remover curso',
        message:'Remover "'+name+'" definitivamente da sua lista? Esta ação não pode ser desfeita. (Ocultar é reversível; Remover apaga o registro local.)',
        confirmText:'Remover',
        cancelText:'Cancelar',
        danger:true
      });
      if(!ok) return;
      try{
        const LS_MANUAL_RM='gdi-manual-courses-v1';
        // ★ v1.0.97: dupla proteção local — marca como hidden antes de remover.
        // ★ v1.0.103 FIX (Task 20-5 #10): route through _hiddenWriteChain via
        //   hideCourse() to avoid racing with other pending hide/unhide writes.
        //   hideCourse also emits courses:changed for cache invalidation.
        if(c && c.key){
          await hideCourse(c.key);
        }
        // 2. Remove do localStorage
        const manual=lsGet(LS_MANUAL_RM,[]);
        const next=manual.filter(m=>!m || m.path!==c.key);
        lsSet(LS_MANUAL_RM,next);
        // 3. Remove do servidor (segunda camada — impede syncCoursesFromDrive de re-adicionar)
        try{
          await fetch('/api/courses/remove', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({coursePath: c.key})
          });
        }catch(e){
          console.warn('[Remover curso] falha ao remover do servidor (continua com hidden local):', e && e.message);
        }
        // limpa estado do scanner e cache de aulas
        if(window.gdiCourseScanner){
          try{window.gdiCourseScanner.clearScanState(c.key);}catch(_){}
        }
        // limpa também da lista de ocultos (se estava oculto)
        // ★ v1.0.103 FIX (Task 20-5 #10): await unhideCourse so the write chain
        //   completes before renderCursos reads LS_HIDDEN (counter must be right).
        try{ await unhideCourse(c.key); }catch(_){}
        // ★ v1.0.103 FIX (Task 20-5 #9): emit courses:changed to invalidate caches
        //   (bestInCache, _ccCache in study-panel.js). unhideCourse already emits,
        //   but we emit here too in case the course was never hidden (unhide is a
        //   no-op then) — belt-and-suspenders.
        try{ if(typeof Bus!=='undefined' && Bus.emit) Bus.emit('courses:changed', {}); }catch(_){}
        showToast('Curso removido');
        renderCursos(box).catch(()=>{});
      }catch(e){
        showToast('Erro ao remover: '+(e&&e.message||e));
      }
    };
    // ★ Task FINAL / Fix 2d: botão "Reiniciar Scan" — limpa o estado do
    //   scanner e dispara um novo scan imediatamente.
    const _detailRestart = box.querySelector('#gdi-detail-restart-scan');
    if(_detailRestart) _detailRestart.onclick=function(){
      const restartBtn=box.querySelector('#gdi-detail-restart-scan');
      const ck=(restartBtn && restartBtn.dataset && restartBtn.dataset.courseKey) || c.key;
      try{
        if(window.gdiCourseScanner){
          window.gdiCourseScanner.clearScanState(ck);
          window.gdiCourseScanner.startScan(ck, function(state, lessonsData){
            try{
              if(state.status==='done' || state.status==='error'){
                const fresh=collectCourses();
                const fc=fresh.find(x=>x.key===c.key);
                if(fc) openCourseDetail(box, fc);
                else try{ openCourseDetail(box, c); }catch(__){}
              }
            }catch(_){}
          });
          showToast('Scan reiniciado');
        }else{
          showToast('Scanner indisponível');
        }
      }catch(e){
        showToast('Erro ao reiniciar scan: '+(e&&e.message||e));
      }
    };
    const contBtn=box.querySelector('#gdi-detail-continue');
    // ★ FIX (Agent 16 UIUX-5): contBtn may be null if template omitted the
    //    continue button; guard the .then() body to avoid TypeError.
    // ★ v1.0.103 FIX (Task 20-5 #13): also check contBtn.isConnected inside the
    //    .then() callback — box may have been re-rendered (e.g. user clicked
    //    "Reiniciar Scan" which calls openCourseDetail recursively) by the time
    //    bestIn resolves. Without this guard, setting .disabled on a detached
    //    node silently no-ops (no crash, but no UI update either) — and worse,
    //    if a future change replaces contBtn with a wrapper, this would throw.
    if(contBtn) bestIn(c.key).then(target=>{
      if(!contBtn || !contBtn.isConnected) return;  // ★ FIX #13
      if(target){
        contBtn.disabled=false;
        contBtn.innerHTML=`<i class="bi bi-play-fill"></i> Continuar: ${escHtml(realName(target).slice(0,40))}`;
        contBtn.onclick=()=>{location.href=target+(target.includes('?')?'&':'?')+'a=view';};
      }else{
        contBtn.disabled=true;
        contBtn.className='gdi-mode-btn';
        contBtn.style.flex='1';contBtn.style.justifyContent='center';
        contBtn.innerHTML='<i class="bi bi-check2-all" style="color:#3fb950;"></i> Tudo em dia!';
      }
    }).catch(()=>{});
    // ★ Task 18: click em disciplina → abre pasta no Drive (não aula individual)
    box.querySelectorAll('[data-disc-path]').forEach(el=>{
      el.onclick=()=>{
        const p=el.dataset.discPath;
        if(p)location.href=p;  // abre a pasta da disciplina
      };
    });

    // ★ Task 16 / FIX 2: botão "Escanear agora" — dispara scanner manualmente no detalhe
    const detailScanBtn = box.querySelector('#gdi-detail-scan');
    if(detailScanBtn && !detailScanBtn.disabled){
      detailScanBtn.addEventListener('click', function(e){
        e.stopPropagation();
        const ckScan = this.dataset.courseKey || c.key;
        if(ckScan && window.gdiCourseScanner){
          window.gdiCourseScanner.clearScanState(ckScan);
          // Feedback imediato
          try{
            this.disabled = true;
            this.style.opacity = '.7';
            this.innerHTML = '<i class="bi bi-hourglass-split"></i> Iniciando…';
          }catch(_){}
          window.gdiCourseScanner.startScan(ckScan, function(state, lessonsData){
            try{
              if(state.status === 'scanning'){
                const pct = (state.totalFolders > 0)
                  ? Math.round((state.scannedFolders||0)/state.totalFolders*100)
                  : 0;
                if(detailScanBtn && detailScanBtn.isConnected){
                  detailScanBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Escaneando '+pct+'%';
                }
              }else if(state.status === 'done' || state.status === 'error'){
                // Re-renderiza o detalhe com dados frescos do scanner
                try{
                  const fresh = collectCourses();
                  const fc = fresh.find(x => x.key === c.key);
                  if(fc) openCourseDetail(box, fc);
                }catch(_){
                  // Fallback: re-render com o c original
                  try{ openCourseDetail(box, c); }catch(__){}
                }
              }
            }catch(_){}
          });
        }
      });
    }
  }

  // ★ ENG-SCANNER-DISTRIBUIDO (Task 6 / Agent 6): delegated click handler for
  // .gdi-rescan-btn — calls rescanCourse → scanCourse to invalidate the shared
  // cache and restart the distributed scan from scratch. Delegated on document
  // so it works for any future-inserted button (course detail view re-renders
  // the box on every open).
  document.addEventListener('click', async function(e){
    const btn = e.target.closest && e.target.closest('.gdi-rescan-btn');
    if(!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const courseKey = btn.dataset && btn.dataset.courseKey;
    if(!courseKey) return;
    const ok = confirm('Reescanear este curso? O cache compartilhado será invalidado e o scan recomeçará.');
    if(!ok) return;
    try{
      if(window.gdiCourseScanner && typeof window.gdiCourseScanner.rescanCourse === 'function'){
        await window.gdiCourseScanner.rescanCourse(courseKey);
      }else{
        console.warn('[Reescanear] gdiCourseScanner.rescanCourse indisponível — pulando invalidação de cache');
      }
      if(window.showToast) showToast('Reescaneando curso...');
      else console.log('[Reescanear] Reescaneando curso...');
      // ★ Then restart the scan via scanCourse (per task spec).
      // scanCourse returns a Promise; we attach .catch() to avoid unhandled rejection.
      if(window.gdiCourseScanner && typeof window.gdiCourseScanner.scanCourse === 'function'){
        const p = window.gdiCourseScanner.scanCourse(courseKey, function(state, lessonsData){
          // Re-render the course detail when scan completes/fails so the user sees fresh data
          try{
            if(state.status === 'done' || state.status === 'error' || state.status === 'partial'){
              const box2 = document.getElementById('gdi-central-body');
              if(box2){
                const fresh = (typeof window.collectCourses === 'function') ? window.collectCourses() : [];
                const fc = fresh.find(x => x.key === courseKey);
                if(fc && window.__gdiStudy && window.__gdiStudy.courses && typeof window.__gdiStudy.courses.openCourseDetail === 'function'){
                  window.__gdiStudy.courses.openCourseDetail(box2, fc);
                }
              }
            }
          }catch(_){}
        });
        if(p && typeof p.catch === 'function') p.catch(err => console.warn('[Reescanear] scanCourse promise rejected:', err && err.message));
      }else{
        console.warn('[Reescanear] gdiCourseScanner.scanCourse indisponível');
        if(window.showToast) showToast('Scanner indisponível — recarregue a página');
      }
    }catch(err){
      console.error('[Reescanear] erro:', err);
      if(window.showToast) showToast('Erro ao reescanear: '+(err && err.message || err));
    }
  });

  // ── Namespace exposure ──
  window.__gdiStudy.courses = {
    // Course CRUD / collection
    collectCourses: collectCourses,
    gdiAddCourseFromButton: window.gdiAddCourseFromButton,
    gdiAddCourseFromDrive: window.gdiAddCourseFromDrive,
    syncCoursesFromDrive: function(){ return (window.__gdiStudy.scanner && window.__gdiStudy.scanner.syncCoursesFromDrive) ? window.__gdiStudy.scanner.syncCoursesFromDrive.apply(this, arguments) : Promise.resolve(); },
    // UI
    renderCursos: renderCursos,
    showAddCourseModal: showAddCourseModal,
    showHiddenCoursesModal: showHiddenCoursesModal,
    openCourseDetail: openCourseDetail,
    gdiRefreshCentralPanel: window.gdiRefreshCentralPanel,
    // Helpers (shared with study-panel.js and study-tabs-legacy.js)
    bestIn: bestIn,
    realName: realName,
    cleanCourseName: cleanCourseName,
    courseName: courseName,
    driveNameOf: driveNameOf,
    courseKeyOf: courseKeyOf,
    hideCourse: hideCourse,
    unhideCourse: unhideCourse,
    listHiddenCourses: listHiddenCourses,
    stateD: stateD,
    ensureState: ensureState,
    watchedLow: watchedLow,
    // Utils
    low: low,
    norm: norm,
    dec: dec,
    stripExt: stripExt,
    esc: esc,
    lsGet: lsGet,
    lsSet: lsSet,
    fmtMin: fmtMin,
    dayKey: dayKey,
    dateBr: dateBr,
    // Constants
    LS_HIDDEN: LS_HIDDEN
  };

  // ── Backward-compat aliases (preserved from monolith) ──
  // window.collectCourses, window.renderCursos, window.gdiRefreshCentralPanel,
  // window.gdiAddCourseFromButton, window.gdiAddCourseFromDrive are already
  // assigned above (verbatim from monolith). Re-assert via namespace indirection
  // so any future reassignment stays in sync.
  window.collectCourses = function(){ return window.__gdiStudy.courses.collectCourses.apply(this, arguments); };
  window.renderCursos = function(box){ return window.__gdiStudy.courses.renderCursos.apply(this, arguments); };
  // gdiSyncCoursesFromDrive is owned by study-scanner.js — but expose here too
  // as a late-bound alias in case study-courses is loaded without the scanner
  // (shouldn't happen per the load order, but defensive).
  if(typeof window.gdiSyncCoursesFromDrive === 'undefined'){
    window.gdiSyncCoursesFromDrive = function(){
      return window.__gdiStudy.courses.syncCoursesFromDrive.apply(this, arguments);
    };
  }

  console.log('[GDI Extras] M22 courses cluster (collectCourses/addCourse/detail) ativo — modular');
})();
