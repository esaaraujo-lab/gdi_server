// ═══════════════════════════════════════════════════════════════
// study-panel.js — Área do Aluno panel shell (sidebar + home + drives + nav)
//
// Split from gdi-study.js (v1.0.86 modularization, Task v86-MOD-STUDY).
// Carved out of IIFE #2 "M22 — Área do Aluno" (lines 739-3805).
// LOADS LAST — depends on all other study modules.
//
// Owns: TAB_GROUPS, renderSidebarHTML, renderHeaderHTML, updateHeaderStats,
//       renderBody, renderPanel, renderDrives, browseDriveInPanel, renderHome,
//       renderAchievements, renderStats, showOnboarding, openPanel, closePanel,
//       injectNavButton, scheduleNavInject, tryOpenFromURL (nested IIFE),
//       the central-style CSS block, Bus.onGlobal('page:change'/'rows:appended'/'media:ready'),
//       GDI_MODULES['central-nav'], document.addEventListener('keydown',...),
//       window.__gdiOpenCentral alias.
//
// Namespace: window.__gdiStudy.panel = {
//                openPanel, closePanel, renderPanel, renderBody, renderHome,
//                renderDrives, renderAchievements, renderStats, showOnboarding,
//                injectNavButton, scheduleNavInject
//            }
// Shared state: window.__gdiStudy.state = {
//                panel: null, tab: 'home',
//                FC: {active:false, flip:null, grade:null},
//                currentTab: 'home'
//              }
// Aliases: window.__gdiOpenCentral (preserved for compat)
// Guard:   window.__gdiStudyPanel (prevents double-init)
// Depends on (late binding, all loaded before this module):
//   - window.__gdiStudy.courses.* (collectCourses, bestIn, realName, cleanCourseName,
//     courseName, driveNameOf, showAddCourseModal, openCourseDetail, stateD, ensureState,
//     courseKeyOf, watchedLow)
//   - window.__gdiStudy.questions.* (renderQuestoes, renderSimulado, renderCronograma)
//   - window.__gdiStudy.advanced.* (renderProvas, renderRedacao, renderRadar)
//   - window.renderResumos (from gdi-meggy.js)
//   - window.__gdiStudy.scanner.syncCoursesFromDrive (called from renderHome)
//   - window.gdiCourseIdentity, window.drive_names, window.gdiListAllFiles,
//     window.gdiGetPw, window.GDIUser, window.GDI_ROOT, window.gdiAchievements,
//     window.Bus, window.GDI_MODULES, window.escHtml, window.showToast, window.MODEL
//
// CRITICAL fixes applied while splitting:
//   1. panel/tab/FC mutable closure state → migrated to window.__gdiStudy.state.
//      All reads/writes go through S.panel / S.tab / S.FC.
//   2. renderHome recursive self-reference (inside sync promise.then AND inside
//      scan-now button callback) → use window.__gdiStudy.panel.renderHome(b)
//      explicitly (per task spec).
//   3. renderBody tab dispatch (renderQuestoes/renderSimulado/renderCronograma)
//      → use window.__gdiStudy.questions.X(...) (late binding, tolerant to load
//      order — though study-questions.js loads before this module per spec).
//   4. window.__gdiCurrentTab (v1.0.84 fix) — kept in renderBody, no change.
// Load order: 8th (LAST) study module
// ═══════════════════════════════════════════════════════════════
(function(){
  if(window.__gdiStudyPanel) return;
  window.__gdiStudyPanel = true;
  window.__gdiStudy = window.__gdiStudy || {};

  // ═══ Shared state (migrated from M22 closure vars) ═══
  // study-tabs-legacy.js (loads earlier) may have already created a stub;
  // use existing if present, else create fresh.
  window.__gdiStudy.state = window.__gdiStudy.state || {
    panel: null,
    tab: 'home',
    currentTab: 'home',
    FC: {active:false, flip:null, grade:null}
  };
  if(!window.__gdiStudy.state.FC){
    window.__gdiStudy.state.FC = {active:false, flip:null, grade:null};
  }
  const S = window.__gdiStudy.state;

  // ═══ Local utils (mirror M22 closure utils; small enough to duplicate) ═══
  const LS_CARDS='gdi-cards-v1', LS_GOAL='gdi-goal-min', LS_WATCH='gdi-watch-v1',
        LS_MAR='gdi-marathon', LS_MARINTRO='gdi-marathon-intro', LS_HIDDEN='gdi-hidden-courses-v1';
  const log=(...a)=>{try{console.log('[GDI M22]',...a)}catch(_){}};
  const lsGet=(k,d)=>{try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(_){return d}};
  const lsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}};
  const fmtMin=m=>{m=Math.round(m);return m>=60?Math.floor(m/60)+'h'+String(m%60).padStart(2,'0'):m+'min'};
  const dayKey=t=>{const d=new Date(t||Date.now());return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
  const dateBr=t=>new Date(t).toLocaleDateString('pt-BR');

  // ═══ Late-binding wrappers (resolve cross-module calls at call-time) ═══
  // These shadow the M22 closure names so existing call sites work unchanged.
  // All resolve through window.__gdiStudy.courses.* (defined in study-courses.js,
  // which loads BEFORE this module per the load order).
  const collectCourses   = function(){ return window.__gdiStudy.courses.collectCourses.apply(this, arguments); };
  const bestIn           = function(){ return window.__gdiStudy.courses.bestIn.apply(this, arguments); };
  const realName         = function(){ return window.__gdiStudy.courses.realName.apply(this, arguments); };
  const cleanCourseName  = function(){ return window.__gdiStudy.courses.cleanCourseName.apply(this, arguments); };
  const courseName       = function(){ return window.__gdiStudy.courses.courseName.apply(this, arguments); };
  const driveNameOf      = function(){ return window.__gdiStudy.courses.driveNameOf.apply(this, arguments); };
  const stateD           = function(){ return window.__gdiStudy.courses.stateD.apply(this, arguments); };
  const ensureState      = function(){ return window.__gdiStudy.courses.ensureState.apply(this, arguments); };
  const courseKeyOf      = function(){ return window.__gdiStudy.courses.courseKeyOf.apply(this, arguments); };
  const watchedLow       = function(){ return window.__gdiStudy.courses.watchedLow.apply(this, arguments); };
  const showAddCourseModal = function(){ return window.__gdiStudy.courses.showAddCourseModal.apply(this, arguments); };
  const openCourseDetail = function(){ return window.__gdiStudy.courses.openCourseDetail.apply(this, arguments); };

  let playing=false,mark=0;
  document.addEventListener('play',e=>{if(e.target&&e.target.tagName==='VIDEO'){playing=true;mark=Date.now();}},true);
  document.addEventListener('pause',e=>{if(e.target&&e.target.tagName==='VIDEO'){playing=false;flushWatch();}},true);
  document.addEventListener('ended',e=>{if(e.target&&e.target.tagName==='VIDEO'){playing=false;flushWatch();}},true);
  function flushWatch(){
    if(!mark)return;
    const sec=(Date.now()-mark)/1000;
    mark=playing?Date.now():0;
    if(sec>0&&sec<300){const w=lsGet(LS_WATCH,{});const k=dayKey();w[k]=(w[k]||0)+sec;lsSet(LS_WATCH,w);}
  }
  // ★ PATCH F: setInterval só roda quando há home-card visível OU painel aberto
  setInterval(()=>{
    if(document.getElementById('gdi-home-card')||(S.panel&&S.panel.style.display==='flex')){
      flushWatch();
    }
  },30000);
  const todayMin=()=>Math.round((lsGet(LS_WATCH,{})[dayKey()]||0)/60);
  const goalMin=()=>Math.max(10,Math.min(480,parseInt(lsGet(LS_GOAL,60),10)||60));
  function updateGoalChip(){
    const card=document.getElementById('gdi-home-card');
    if(!card)return;
    let chip=document.getElementById('gdi-goal-chip');
    if(!chip){
      chip=document.createElement('div');chip.id='gdi-goal-chip';
      chip.style.cssText='flex-basis:100%;margin-top:2px;font-size:12px;color:var(--ferreto-text-muted,#8b949e);display:flex;align-items:center;gap:8px;';
      card.appendChild(chip);
    }
    const t=todayMin(),g=goalMin();
    chip.innerHTML=`<span>\ud83c\udfaf Meta hoje: ${fmtMin(t)} / ${fmtMin(g)}</span>
      <div style="flex:1;max-width:220px;height:5px;background:var(--ferreto-surface-3,rgba(255,255,255,.1));border-radius:3px;overflow:hidden;">
        <div style="height:5px;width:${Math.min(100,Math.round(t/g*100))}%;background:${t>=g?'#2f9e44':'var(--ferreto-grad)'};transition:width .4s;"></div>
      </div>${t>=g?'<span style="color:#2f9e44;">\u2713 meta batida!</span>':''}`;
  }
  // ★ PATCH F: setInterval do goal-chip também gated
  setInterval(()=>{
    if(document.getElementById('gdi-home-card')||(S.panel&&S.panel.style.display==='flex')){
      updateGoalChip();
    }
  },20000);
  const cards=()=>lsGet(LS_CARDS,[]);
  const saveCards=c=>lsSet(LS_CARDS,c);
  const dueCards=()=>cards().filter(c=>(c.due||0)<=Date.now());

  // ★ v1.0.86 MODULAR: FC/panel/tab migrated to window.__gdiStudy.state (see top of file).
  // Original M22 lines: let FC={active:false,flip:null,grade:null}; let panel=null,tab='home';


  // ═══ showOnboarding: first-time-user welcome overlay ═══
  // Shows ONCE per browser (gated by localStorage 'gdi-onboarding-done').
  // 4-step guide: navigate drives / ask Meggy / practice / track progress.
  function showOnboarding(){
    try{
      if(localStorage.getItem('gdi-onboarding-done')) return;
      localStorage.setItem('gdi-onboarding-done', '1');
    }catch(_){ return; }
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:100002;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `<div style="background:var(--ferreto-bg-2,#0d1119);border-radius:16px;max-width:480px;padding:28px;text-align:center;border:1px solid var(--ferreto-border,#30363d);">
      <div style="font-size:56px;margin-bottom:12px;">🐩</div>
      <h2 style="color:var(--ferreto-text,#f0f6fc);margin:0 0 8px;font-size:20px;">Au au! Eu sou a Meggy!</h2>
      <p style="color:var(--ferreto-text-muted,#8b949e);font-size:13px;line-height:1.6;margin:0 0 18px;">Sua tutora de estudos. Aqui você pode:</p>
      <div style="text-align:left;margin-bottom:20px;padding:0 8px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;color:var(--ferreto-text,#e6edf3);font-size:13px;"><span style="font-size:20px;">📂</span> Navegue pelos drives e adicione cursos</div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;color:var(--ferreto-text,#e6edf3);font-size:13px;"><span style="font-size:20px;">🐩</span> Peça resumos e questões à Meggy</div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;color:var(--ferreto-text,#e6edf3);font-size:13px;"><span style="font-size:20px;">❓</span> Pratique com questões e simulados</div>
        <div style="display:flex;align-items:center;gap:10px;color:var(--ferreto-text,#e6edf3);font-size:13px;"><span style="font-size:20px;">📊</span> Acompanhe seu progresso</div>
      </div>
      <button id="gdi-onboarding-close" style="background:linear-gradient(135deg,#ff8b9f,#c026d3);border:0;border-radius:10px;padding:10px 24px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;width:100%;">Vamos começar! 🎉</button>
    </div>`;
    (document.querySelector('#gdi-study') || document.body).appendChild(overlay);
    overlay.querySelector('#gdi-onboarding-close').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };
  }

  // ★ PATCH D: openPanel faz UMA única renderização (depois do estado pronto)
  function openPanel(t){
    if(t)S.tab=t;
    if(!S.panel){
      S.panel=document.createElement('div');S.panel.id='gdi-central';
      S.panel.addEventListener('click',e=>{if(e.target===S.panel)closePanel();});
      GDI_ROOT().appendChild(S.panel);
    }
    S.panel.style.display='flex';
    // ★ uma única renderização: espera estado OU fallback em caso de erro
    ensureState().then(()=>{
      if(S.panel&&S.panel.style.display!=='none')renderPanel();
    }).catch(()=>renderPanel());
    try{ showOnboarding(); }catch(_){}
  }
  function closePanel(){
    S.FC.active=false;
    // ★ limpa timer do simulado se ativo (evita salvar simulado fantasma)
    const body=S.panel&&S.panel.querySelector('#gdi-central-body');
    if(body&&body.__simTimer){clearInterval(body.__simTimer);body.__simTimer=null;}
    if(S.panel)S.panel.style.display='none';
  }
  // ★ Expõe openPanel para outros módulos
  window.__gdiOpenCentral=openPanel;
  // ═══ PATCH E: renderSidebar() (1x) + renderBody(S.tab) (em cada troca de aba) ═══
  // ★ definição das abas agrupadas — tabs REMOVIDAS: cursos, mar, revisoes, fc, subjects, trails
  // REMOVIDO: S.tab cursos (Meus Cursos) — user request
  // REMOVIDO: S.tab mar (Maratona) — user request
  // REMOVIDO: S.tab revisoes (Revisões) — user request
  // REMOVIDO: S.tab fc (Flashcards) — user request
  // REMOVIDO: S.tab subjects (Matérias) — user request
  // REMOVIDO: S.tab trails (Trilhas) — user request
  // (renderCursos/renderMarathon/renderRevisoes/renderFlash/renderSubjects/renderTrails
  //  permanecem definidos como funções para preservar a API pública — window.* e GDI_MODULES.)
  const TAB_GROUPS=[
    {label:null,tabs:[
      {id:'home',icon:'bi-house-door',label:'Início'},
      {id:'drives',icon:'bi-cloud-arrow-down',label:'Explorar Drives'}
    ]},
    {label:'Praticar',tabs:[
      {id:'questoes',icon:'bi-patch-question',label:'Questões'},
      {id:'simulado',icon:'bi-stopwatch',label:'Simulado'}
    ]},
    {label:'Materiais',tabs:[
      {id:'addmateria',icon:'bi-folder-plus',label:'Adicionar matéria'},  // ★ FIX 1a (Task 14): RE-ADICIONADO — user pediu para voltar
      {id:'resumos',icon:'bi-clipboard',label:'Resumos'},
      {id:'provas',icon:'bi-file-earmark-text',label:'Provas'},
      {id:'redacao',icon:'bi-pencil-square',label:'Redação'}
    ]},
    {label:'Planejar',tabs:[
      {id:'cronograma',icon:'bi-calendar3',label:'Cronograma'},
      {id:'stats',icon:'bi-graph-up',label:'Estatísticas'},
      {id:'radar',icon:'bi-bullseye',label:'Mapa de Fracos'},
      {id:'achievements',icon:'bi-trophy',label:'Conquistas'}
    ]}
  ];

  // ★ monta a sidebar 1x (HTML estático — só badges dinâmicos)
  function renderSidebarHTML(dueCount){
    return `<aside class="gdi-central-sidebar">
      ${TAB_GROUPS.map(group=>`
        <div class="gdi-central-sidebar-group">
          ${group.label?`<div class="gdi-central-sidebar-label">${group.label}</div>`:''}
          ${group.tabs.map(t=>`
            <button class="gdi-central-tab" data-t="${t.id}">
              <i class="bi ${t.icon}"></i>
              <span>${t.label}</span>
              ${t.badge?`<span class="gdi-tab-badge">${t.badge}</span>`:''}
            </button>
          `).join('')}
        </div>
      `).join('')}
      <div class="gdi-pomodoro-sidebar" style="padding:12px;border-top:1px solid var(--ferreto-border,#30363d);margin-top:auto;">
        <div style="font-size:11px;color:var(--ferreto-text-muted,#8b949e);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">🍅 Pomodoro</div>
        <div id="gdi-pomo-time" style="font-size:24px;font-weight:700;color:var(--ferreto-text,#e6edf3);text-align:center;margin-bottom:8px;">25:00</div>
        <div style="display:flex;gap:4px;justify-content:center;">
          <button id="gdi-pomo-start" style="background:linear-gradient(135deg,#ff8b9f,#c026d3);border:0;border-radius:6px;padding:4px 12px;color:#fff;font-size:11px;cursor:pointer;">▶</button>
          <button id="gdi-pomo-reset" style="background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#30363d);border-radius:6px;padding:4px 8px;color:var(--ferreto-text,#e6edf3);font-size:11px;cursor:pointer;">↺</button>
        </div>
        <div id="gdi-pomo-phase" style="font-size:10px;color:var(--ferreto-text-muted,#8b949e);text-align:center;margin-top:4px;">Foco</div>
      </div>
    </aside>`;
  }

  // ★ monta o header (1x); stats são atualizadas via updateHeaderStats()
  function renderHeaderHTML(streak,t,g,dueCount){
    return `<div class="gdi-central-head">
      <div class="gdi-central-head-title">
        <span class="gdi-central-icon">📚</span>
        <b>Área do Aluno</b>
      </div>
      <div class="gdi-central-stats">
        <span class="gdi-central-stat" title="Sequência de dias estudando">
          <i class="bi bi-fire gdi-stat-fire"></i>
          <b id="gdi-stat-streak">${streak}</b><span style="color:var(--ferreto-text-muted,#8b949e);">dias</span>
        </span>
        <span class="gdi-central-stat" title="Tempo estudado hoje">
          <i class="bi bi-clock gdi-stat-time"></i>
          <b id="gdi-stat-time">${fmtMin(t)}</b><span style="color:var(--ferreto-text-muted,#8b949e);">/${fmtMin(g)}</span>
        </span>
        ${dueCount?`<span class="gdi-central-stat" title="Flashcards para revisar hoje">
          <i class="bi bi-card-text gdi-stat-cards"></i>
          <b id="gdi-stat-cards">${dueCount}</b><span style="color:var(--ferreto-text-muted,#8b949e);">cards</span>
        </span>`:''}
      </div>
      <input id="gdi-goal-set" type="number" min="10" max="480" value="${g}" title="Meta diária (minutos)" style="width:56px;background:var(--ferreto-surface-2,rgba(255,255,255,.07));border:1px solid var(--ferreto-border,#30363d);border-radius:6px;color:var(--ferreto-text,#f0f6fc);text-align:center;padding:5px;font-size:12px;flex-shrink:0;">
      <button id="gdi-central-meggy" title="Meggy" style="background:linear-gradient(135deg,#ff8b9f,#c026d3);border:0;border-radius:10px;padding:6px 12px;cursor:pointer;color:#fff;font-size:12px;font-weight:600;display:flex;align-items:center;gap:4px;flex-shrink:0;"><span style="font-size:16px;">🐩</span> Meggy</button>
      <button id="gdi-central-x" title="Fechar (Esc)">✕</button>
    </div>`;
  }

  // ★ atualiza só os números de stats (não recria o header inteiro)
  function updateHeaderStats(){
    if(!S.panel)return;
    const t=todayMin(),g=goalMin();
    const cardsArr=lsGet(LS_CARDS,[]);
    const dueCount=cardsArr.filter(c=>(c.due||0)<=Date.now()).length;
    const watch=lsGet(LS_WATCH,{});
    const acts={};const touch=ts=>{if(ts){const k=new Date(ts).toDateString();acts[k]=(acts[k]||0)+1;}};
    for(const k in watch){const v=watch[k];if(typeof v==='number'&&v>60)touch(new Date(k+'T12:00:00').getTime());else if(v&&v.at)touch(v.at);}
    let streak=0;const dd=new Date();const has=x=>acts[x.toDateString()];
    if(!has(dd))dd.setDate(dd.getDate()-1);
    while(has(dd)){streak++;dd.setDate(dd.getDate()-1);}
    const sEl=S.panel.querySelector('#gdi-stat-streak');
    if(sEl)sEl.textContent=streak;
    const tEl=S.panel.querySelector('#gdi-stat-time');
    if(tEl)tEl.textContent=fmtMin(t);
    const cEl=S.panel.querySelector('#gdi-stat-cards');
    if(cEl)cEl.textContent=dueCount;
  }

  // ★ renderBody(S.tab) — só o corpo da aba, sem rebuild do sidebar/header
  function renderBody(currentTab){
    if(!S.panel)return;
    // ★ v80-FIX BUG 2: expose the active S.tab so background scan callbacks
    // (autoScanPending, startScan onProgress) can detect when 'home' is the
    // visible S.tab and re-render the tile to reflect scan progress/results.
    // Without this, `window.__gdiCurrentTab` was always undefined → the
    // `=== 'home'` check at lines 1789/4828 was always false → the home tile
    // NEVER refreshed after a background scan finished (user had to navigate
    // away and back to see updated lesson counts).
    try{ window.__gdiCurrentTab = currentTab; }catch(_){}
    const body=S.panel.querySelector('#gdi-central-body');
    if(!body)return;
    // limpa timer do simulado anterior se houver
    if(body.__simTimer){clearInterval(body.__simTimer);body.__simTimer=null;}
    // ★ FIX 1b (Task 14): RE-ADICIONADO handler da aba 'addmateria' (Task 13 havia removido por engano)
    if(currentTab==='addmateria'){showAddCourseModal(body);return;}
    if(currentTab==='home')renderHome(body);
    else if(currentTab==='drives')renderDrives(body);
    else if(currentTab==='questoes')window.__gdiStudy.questions.renderQuestoes(body);
    else if(currentTab==='simulado')window.__gdiStudy.questions.renderSimulado(body);
    else if(currentTab==='cronograma')window.__gdiStudy.questions.renderCronograma(body);
    else if(currentTab==='resumos'){if(window.renderResumos)renderResumos(body);else body.innerHTML='<div class="gdi-empty-state"><span class="gdi-empty-state-icon">📋</span><h3>Resumos indisponíveis</h3><p>O módulo de resumos não carregou. Tente recarregar a página.</p></div>';}
    else if(currentTab==='provas'){if(window.renderProvas)window.renderProvas(body);else body.innerHTML='<div class="gdi-empty-state"><span class="gdi-empty-state-icon">📄</span><h3>Provas indisponíveis</h3><p>O módulo de provas não carregou.</p></div>';}
    else if(currentTab==='redacao'){if(window.renderRedacao)window.renderRedacao(body);else body.innerHTML='<div class="gdi-empty-state"><span class="gdi-empty-state-icon">✍️</span><h3>Redação indisponível</h3><p>O módulo de redação não carregou.</p></div>';}
    else if(currentTab==='radar'){if(window.renderRadar)window.renderRadar(body);else body.innerHTML='<div class="gdi-empty-state"><span class="gdi-empty-state-icon">🎯</span><h3>Radar indisponível</h3><p>O módulo de radar não carregou.</p></div>';}
    else if(currentTab==='stats')renderStats(body);
    else if(currentTab==='achievements')renderAchievements(body);
    // REMOVIDO: tabs cursos/mar/revisoes/fc/subjects/trails não têm mais handler
    // (funções renderCursos/renderMarathon/renderRevisoes/renderFlash/renderSubjects/renderTrails
    //  permanecem definidas abaixo para preservar a API pública)
    else body.innerHTML='<div class="gdi-notes-empty">Aba inválida.</div>';
  }

  function renderPanel(){
    if(!S.panel)return;
    const t=todayMin(),g=goalMin();
    const cardsArr=lsGet(LS_CARDS,[]);
    const dueCount=cardsArr.filter(c=>(c.due||0)<=Date.now()).length;
    const watch=lsGet(LS_WATCH,{});
    const acts={};const touch=ts=>{if(ts){const k=new Date(ts).toDateString();acts[k]=(acts[k]||0)+1;}};
    for(const k in watch){const v=watch[k];if(typeof v==='number'&&v>60)touch(new Date(k+'T12:00:00').getTime());else if(v&&v.at)touch(v.at);}
    let streak=0;const dd=new Date();const has=x=>acts[x.toDateString()];
    if(!has(dd))dd.setDate(dd.getDate()-1);
    while(has(dd)){streak++;dd.setDate(dd.getDate()-1);}
    // ★ PATCH E: só rebuilda sidebar+header na 1ª vez; nas seguintes, atualiza stats e re-renderiza body
    if(!S.panel.dataset.sidebarRendered){
      S.panel.innerHTML=`<div class="gdi-central-box">
        ${renderHeaderHTML(streak,t,g,dueCount)}
        <div class="gdi-central-main">
          ${renderSidebarHTML(dueCount)}
          <div class="gdi-central-body" id="gdi-central-body"></div>
        </div>
      </div>`;
      S.panel.dataset.sidebarRendered='1';
      // bind header
      S.panel.querySelector('#gdi-central-x').onclick=closePanel;
      S.panel.querySelector('#gdi-central-meggy').onclick=function(){
        // ★ v80-FIX BUG 5: when no AI backend is available, Meggy's FAB is
        // hidden via `fab.style.display='none'` (hideWidget in gdi-meggy.js).
        // The Meggy S.panel itself also has inline `display:none`, so calling
        // `fab.click()` → `toggle()` → `S.panel.classList.add('open')` does
        // nothing visible (inline style beats CSS). Guard the click: if FAB
        // is hidden, hide THIS header button too and skip the click so the
        // user gets consistent feedback (button disappears once AI status is
        // known to be unavailable, instead of silently failing).
        const fab=document.querySelector('#gdi-ai-fab');
        if(!fab || fab.style.display==='none'){
          this.style.display='none';
          return;
        }
        fab.click();
      };
      // ★ v80-FIX BUG 5 (initial visibility): if AI widget is already known
      // to be hidden (e.g. user opened Área do Aluno AFTER async AI detection
      // finished), hide the header button immediately so it doesn't bait a
      // dead click. _serverEnabled / _browserAIState live in gdi-meggy.js's
      // IIFE so we can't read them directly — use FAB's inline display as
      // the source of truth (hideWidget/showWidget write to it).
      try{
        const _btnMeggy=S.panel.querySelector('#gdi-central-meggy');
        const _fabAi=document.querySelector('#gdi-ai-fab');
        if(_btnMeggy && _fabAi && _fabAi.style.display==='none'){
          _btnMeggy.style.display='none';
        }
      }catch(_){}
      S.panel.querySelector('#gdi-goal-set').addEventListener('change',e=>{
        const v=Math.max(10,Math.min(480,parseInt(e.target.value,10)||60));
        lsSet(LS_GOAL,v);
        updateHeaderStats();  // só atualiza o número, não rebuilda
      });
      // bind tabs — SÓ chama renderBody (não rebuilda sidebar)
      S.panel.querySelectorAll('.gdi-central-tab').forEach(b=>b.onclick=function(){
        S.panel.querySelectorAll('.gdi-central-tab').forEach(x=>x.classList.remove('active'));
        this.classList.add('active');
        S.tab=this.dataset.t;S.FC.active=false;
        // ★ v91: sai do modo media (video/PDF split) ao trocar de aba
        if(S.panel.classList.contains('collapsed')) S.panel.classList.remove('collapsed');
        renderBody(S.tab);
      });
      // ★ v91: Pomodoro sidebar widget init
      try{ initPomodoro(); }catch(_){}
    }else{
      // atualiza stats inline (não rebuilda)
      updateHeaderStats();
    }
    // ativa a S.tab atual no sidebar
    S.panel.querySelectorAll('.gdi-central-tab').forEach(b=>b.classList.toggle('active',b.dataset.t===S.tab));
    renderBody(S.tab);
  }
  // ★ v1.0.73: renderDrives — mostra os 12 drives como cards navegáveis DENTRO do painel
  function renderDrives(box){
    const drives = window.drive_names || [];
    box.innerHTML = `
      <div style="margin-bottom:18px;">
        <h3 style="color:var(--ferreto-text,#f0f6fc);margin:0 0 4px;">☁️ Explorar Drives</h3>
        <p style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;margin:0;">Clique num drive para explorar. Tudo abre aqui dentro.</p>
      </div>
      <div id="gdi-drive-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;">
        ${drives.map((name, idx) => {
          const ident = window.gdiCourseIdentity('/'+idx+':/', name);
          return `<div data-gdi-drive-link="${idx}" style="padding:16px;border-radius:12px;background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#30363d);border-top:3px solid ${ident.color};transition:all .15s;cursor:pointer;" onmouseover="this.style.background='var(--ferreto-surface-3,rgba(255,255,255,.08))';this.style.borderColor='${ident.color}';" onmouseout="this.style.background='var(--ferreto-surface-2,rgba(255,255,255,.04))';this.style.borderColor='var(--ferreto-border,#30363d)';">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
              <span style="font-size:28px;flex:none;">${ident.icon}</span>
              <b style="color:var(--ferreto-text,#e6edf3);font-size:13px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(name)}</b>
            </div>
            <div style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;">Drive ${idx} · Clique para explorar →</div>
          </div>`;
        }).join('')}
      </div>
      <div id="gdi-drive-browser" style="display:none;"></div>
    `;
    box.querySelectorAll('[data-gdi-drive-link]').forEach(card => {
      card.addEventListener('click', async () => {
        const driveIdx = card.dataset.gdiDriveLink;
        // ★ Esconde o grid de drives e mostra só o browser
        const grid = box.querySelector('#gdi-drive-grid');
        if(grid) grid.style.display = 'none';
        await browseDriveInPanel(box, '/' + driveIdx + ':/', window.drive_names?.[driveIdx] || ('Drive ' + driveIdx));
      });
    });
  }

  // ★ v1.0.73: Navegação de drive DENTRO do painel — recursiva
  async function browseDriveInPanel(box, path, title) {
    const browser = box.querySelector('#gdi-drive-browser');
    if(!browser) return;
    browser.style.display = 'block';
    browser.innerHTML = '<div style="text-align:center;padding:20px;"><div class="gdi-mat-isa-spin"></div><p style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;margin-top:10px;">Carregando...</p></div>';
    try {
      const pw = window.gdiGetPw ? window.gdiGetPw() : '';
      const result = await window.gdiListAllFiles(path, pw);
      if(!Array.isArray(result) || !result.length) {
        browser.innerHTML = '<p style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;">Nenhum conteúdo encontrado.</p>';
        return;
      }
      const folders = result.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
      const files = result.filter(f => !f.mimeType || f.mimeType !== 'application/vnd.google-apps.folder');

      // Breadcrumb
      let bcHtml = '<div style="display:flex;align-items:center;gap:6px;margin-bottom:12px;flex-wrap:wrap;">';
      bcHtml += '<button id="gdi-drive-home" class="gdi-mode-btn" style="font-size:11px;padding:4px 8px;">☁️ Drives</button>';
      const segs = path.split('/').filter(Boolean);
      let acc = '';
      for(let i = 0; i < segs.length; i++) {
        const seg = segs[i];
        acc += '/' + seg;
        let displayName = seg;
        if(/^\d+:$/.test(seg) && window.drive_names) displayName = window.drive_names[parseInt(seg)] || seg;
        try { displayName = decodeURIComponent(displayName); } catch(_) {}
        const isLast = i === segs.length - 1;
        bcHtml += '<span style="color:var(--ferreto-text-faint,#6b7488);font-size:11px;">/</span>';
        if(isLast) {
          bcHtml += '<span style="color:var(--ferreto-text,#e6edf3);font-size:12px;font-weight:600;">' + escHtml(displayName) + '</span>';
        } else {
          bcHtml += '<button class="gdi-drive-bc-btn gdi-mode-btn" data-path="' + escHtml(acc + '/') + '" style="font-size:11px;padding:2px 6px;">' + escHtml(displayName) + '</button>';
        }
      }
      bcHtml += '</div>';

      let content = bcHtml;
      if(folders.length) {
        content += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;margin-bottom:14px;">';
        folders.slice(0, 50).forEach(f => {
          const fn = f.name || f.title || 'Pasta';
          const fp = path.endsWith('/') ? path + encodeURIComponent(fn) + '/' : path + '/' + encodeURIComponent(fn) + '/';
          content += '<div class="gdi-drive-folder" data-path="' + escHtml(fp) + '" data-name="' + escHtml(fn) + '" style="padding:10px 12px;border-radius:8px;background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#30363d);cursor:pointer;transition:all .15s;">'
            + '<div style="display:flex;align-items:center;gap:6px;"><i class="bi bi-folder-fill" style="color:var(--ferreto-secondary,#5ddeda);font-size:16px;flex:none;"></i>'
            + '<span style="color:var(--ferreto-text,#e6edf3);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(fn) + '</span></div></div>';
        });
        content += '</div>';
      }
      if(files.length) {
        content += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:6px;">';
        files.slice(0, 30).forEach(f => {
          const fn = f.name || f.title || 'Arquivo';
          const fp = path.endsWith('/') ? path + encodeURIComponent(fn) : path + '/' + encodeURIComponent(fn);
          const isVideo = f.mimeType && f.mimeType.includes('video');
          const isPdf = (f.fileExtension||'').toLowerCase() === 'pdf' || (f.mimeType||'').includes('pdf');
          const icon = isVideo ? 'bi-camera-video' : (isPdf ? 'bi-file-earmark-pdf' : 'bi-file-earmark');
          const iconColor = isVideo ? 'var(--ferreto-secondary,#5ddeda)' : (isPdf ? '#ff6b6b' : 'var(--ferreto-text-muted,#8b949e)');
          // ★ v91: video/PDF abrem DENTRO do painel (sidebar colapsa). Outros arquivos continuam como <a href>.
          if(isVideo || isPdf){
            const tag = isVideo ? 'video' : 'pdf';
            content += '<div class="gdi-drive-file-inline" data-gdi-media="' + tag + '" data-url="' + escHtml(fp) + '" data-name="' + escHtml(fn) + '" style="padding:8px 10px;border-radius:6px;background:var(--ferreto-surface-2,rgba(255,255,255,.03));border:1px solid var(--ferreto-border,#30363d);display:flex;align-items:center;gap:6px;transition:all .15s;cursor:pointer;">'
              + '<i class="bi ' + icon + '" style="color:' + iconColor + ';font-size:14px;flex:none;"></i>'
              + '<span style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(fn) + '</span></div>';
          } else {
            content += '<a href="' + escHtml(fp) + '?a=view" style="text-decoration:none;padding:8px 10px;border-radius:6px;background:var(--ferreto-surface-2,rgba(255,255,255,.03));border:1px solid var(--ferreto-border,#30363d);display:flex;align-items:center;gap:6px;transition:all .15s;">'
              + '<i class="bi ' + icon + '" style="color:' + iconColor + ';font-size:14px;flex:none;"></i>'
              + '<span style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(fn) + '</span></a>';
          }
        });
        content += '</div>';
      }
      browser.innerHTML = content;

      browser.querySelectorAll('.gdi-drive-folder').forEach(el => {
        el.onmouseenter = () => { el.style.background = 'var(--ferreto-surface-3,rgba(255,255,255,.08))'; el.style.borderColor = 'var(--ferreto-secondary,#5ddeda)'; };
        el.onmouseleave = () => { el.style.background = 'var(--ferreto-surface-2,rgba(255,255,255,.04))'; el.style.borderColor = 'var(--ferreto-border,#30363d)'; };
        el.onclick = () => browseDriveInPanel(box, el.dataset.path, el.dataset.name);
      });
      // ★ v91: bind video/PDF inline cards — abrem DENTRO do painel (sidebar colapsa)
      browser.querySelectorAll('[data-gdi-media]').forEach(el => {
        el.onmouseenter = () => { el.style.background = 'var(--ferreto-surface-3,rgba(255,255,255,.08))'; el.style.borderColor = 'var(--ferreto-secondary,#5ddeda)'; };
        el.onmouseleave = () => { el.style.background = 'var(--ferreto-surface-2,rgba(255,255,255,.04))'; el.style.borderColor = 'var(--ferreto-border,#30363d)'; };
        el.onclick = () => {
          const url = el.dataset.url;
          const name = el.dataset.name;
          const type = el.dataset.gdiMedia;
          if(type === 'video') openVideoInPanel(url, name);
          else if(type === 'pdf') openPdfSplitInPanel(url, name);
        };
      });
      browser.querySelectorAll('.gdi-drive-bc-btn').forEach(el => {
        el.onclick = () => browseDriveInPanel(box, el.dataset.path, '');
      });
      const homeBtn = browser.querySelector('#gdi-drive-home');
      if(homeBtn) homeBtn.onclick = () => renderDrives(box);
    } catch(err) {
      browser.innerHTML = '<p style="color:#ff8b8b;font-size:12px;">Erro: ' + escHtml(err.message) + '</p>';
    }
  }

  // ★ Dashboard "Início" — visão geral com atalhos
  // (cards de cursos/flashcards/matérias REMOVIDOS pois as abas foram removidas)
  function renderHome(box){
    const t=todayMin(),g=goalMin(),pct=Math.min(100,Math.round(t/g*100));
    const cards=lsGet(LS_CARDS,[]);
    const dueCount=cards.filter(c=>(c.due||0)<=Date.now()).length;
    // ★ v1.0.84: best-effort background sync from Drive, guarded to avoid spamming
    // on every renderHome call. After sync completes, if user is still on the home
    // S.tab, re-render so newly-restored course tiles appear. Recursion-safe: the
    // guard remains set during the .then re-render, so the inner renderHome call
    // skips re-triggering the sync; only .finally clears the guard.
    try{
      if(!window.__gdiSyncInProgress){
        window.__gdiSyncInProgress = true;
        const p = (typeof window.gdiSyncCoursesFromDrive === 'function')
          ? window.gdiSyncCoursesFromDrive()
          : Promise.resolve();
        Promise.resolve(p).catch(()=>{}).then(()=>{
          try{
            if(window.__gdiCurrentTab === 'home'){
              const b = document.getElementById('gdi-central-body');
              if(b && typeof renderHome === 'function') window.__gdiStudy.panel.renderHome(b);
            }
          }catch(_){}
        }).finally(()=>{
          try{ window.__gdiSyncInProgress = false; }catch(_){}
        });
      }
    }catch(_){ try{ window.__gdiSyncInProgress = false; }catch(_){} }
    const courses=collectCourses();
    // usa localStorage direto (M23 está em escopo diferente)
    const questionsCount=lsGet('gdi-questions-v1',[]).length;
    const simuladosCount=lsGet('gdi-simulados-v1',[]).length;
    const achievements=window.gdiAchievements?window.gdiAchievements.getUnlocked().length:0;
    const totalAchievements=window.gdiAchievements?window.gdiAchievements.defs().length:0;
    const hour=new Date().getHours();
    const greeting=hour<12?'Bom dia':hour<18?'Boa tarde':'Boa noite';

    box.innerHTML=`
      <div class="gdi-dashboard-hero">
        <h2>${greeting}! 👋</h2>
        <p>${t>=g?'<b style="color:#3fb950;">Meta batida hoje!</b> Parabéns, continue assim. 🎉':'Continue estudando para bater sua meta diária.'}</p>
        <div style="margin-top:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <div style="flex:1;min-width:200px;">
            <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--ferreto-text-muted,#8b949e);margin-bottom:4px;">
              <span>Progresso de hoje</span>
              <span><b style="color:var(--ferreto-text,#f0f6fc);">${fmtMin(t)}</b> / ${fmtMin(g)}</span>
            </div>
            <div class="gdi-progress-bar" style="margin:0;"><div class="gdi-progress-fill" style="width:${pct}%;${t>=g?'background:#3fb950':''}"></div></div>
          </div>
        </div>
      </div>

      <div class="gdi-dashboard-grid">
        <div class="gdi-dashboard-card" data-action="questoes">
          <span class="gdi-dashboard-card-icon">📝</span>
          <span class="gdi-dashboard-card-num">${questionsCount}</span>
          <span class="gdi-dashboard-card-label">Questões no banco</span>
          <span class="gdi-dashboard-card-meta">${dueCount} cards p/ revisar</span>
        </div>
        <div class="gdi-dashboard-card" data-action="simulado">
          <span class="gdi-dashboard-card-icon">⏱️</span>
          <span class="gdi-dashboard-card-num">${simuladosCount}</span>
          <span class="gdi-dashboard-card-label">Simulados feitos</span>
          <span class="gdi-dashboard-card-meta">Pratique sob pressão</span>
        </div>
        <div class="gdi-dashboard-card" data-action="provas">
          <span class="gdi-dashboard-card-icon">📄</span>
          <span class="gdi-dashboard-card-num">${courses.length}</span>
          <span class="gdi-dashboard-card-label">Cursos em andamento</span>
          <span class="gdi-dashboard-card-meta">Analise provas anteriores</span>
        </div>
        <div class="gdi-dashboard-card" data-action="achievements">
          <span class="gdi-dashboard-card-icon">🏆</span>
          <span class="gdi-dashboard-card-num">${achievements}</span>
          <span class="gdi-dashboard-card-label">Conquistas</span>
          <span class="gdi-dashboard-card-meta">de ${totalAchievements} possíveis</span>
        </div>
      </div>

      <div style="margin-bottom:20px;">
        <b style="color:var(--ferreto-text,#f0f6fc);font-size:14px;display:block;margin-bottom:10px;">Atalhos rápidos</b>
        <div class="gdi-quick-actions">
          <button class="gdi-quick-action" data-action="questoes"><i class="bi bi-patch-question"></i> Resolver questões</button>
          <button class="gdi-quick-action" data-action="simulado"><i class="bi bi-stopwatch"></i> Fazer simulado</button>
          <button class="gdi-quick-action" data-action="provas"><i class="bi bi-file-earmark-text"></i> Provas anteriores</button>
          <button class="gdi-quick-action" data-action="redacao"><i class="bi bi-pencil-square"></i> Corrigir redação</button>
          <button class="gdi-quick-action" data-action="cronograma"><i class="bi bi-calendar3"></i> Cronograma</button>
          <button class="gdi-quick-action" data-action="resumos"><i class="bi bi-clipboard"></i> Ver resumos</button>
        </div>
      </div>

      ${courses.length?`
      <div>
        <b style="color:var(--ferreto-text,#f0f6fc);font-size:14px;display:block;margin-bottom:10px;">Continue de onde parou</b>
        <div class="gdi-courses">
          ${courses.slice(0,6).map(c=>{
            const name=cleanCourseName(c.key);
            const drive=driveNameOf(c.key);
            const ident=window.gdiCourseIdentity(c.key, name);
            // ★ FIX 3 (Task 14): usa totalLessons (real) ao invés de c.lessons.size (visited paths)
            const total=c.totalLessons||c.lessons.size||0;
            const watched=c.watched||0;
            const remaining=Math.max(0,total-watched);  // ★ nunca negativo
            const progress=total>0?Math.min(100,Math.round(watched/total*100)):(watched>0?100:0);
            const progressColor=progress>=80?'#3fb950':progress>=40?'#ffd43b':'var(--ferreto-primary,#ff8b9f)';
            const coursePath=c.key;  // e.g. /4:/CANTE COM EXCELENCIA 2.0 + COMUNIDADE/
            return `<div class="gdi-course" data-course-key="${escHtml(c.key)}" style="cursor:pointer;border-top:3px solid ${ident.color};">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <span style="font-size:24px;flex:none;">${ident.icon}</span>
                <b title="${escHtml(courseName(c.key))}" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(name)}</b>
              </div>
              ${drive?`<small><i class="bi bi-hdd"></i> ${escHtml(drive)}</small>`:'<small>&nbsp;</small>'}
              <div class="gdi-course-stats">
                <div class="gdi-course-stat"><span class="gdi-course-stat-num" data-stat="total">${total}</span><span class="gdi-course-stat-label">Aulas</span></div>
                <div class="gdi-course-stat"><span class="gdi-course-stat-num" data-stat="watched" style="color:#3fb950;">${watched}</span><span class="gdi-course-stat-label">Assistidas</span></div>
                <div class="gdi-course-stat"><span class="gdi-course-stat-num" data-stat="remaining" style="color:#ffd43b;">${remaining}</span><span class="gdi-course-stat-label">Restantes</span></div>
                <div class="gdi-course-stat"><span class="gdi-course-stat-num" data-stat="progress" style="color:${progressColor};">${progress}%</span><span class="gdi-course-stat-label">Concluído</span></div>
              </div>
              <div class="gdi-progress-bar"><div class="gdi-progress-fill" style="width:${progress}%;background:${progressColor};"></div></div>
              ${(c.scanStatus==='scanning'||c.scanStatus==='done'||c.scanStatus==='error')?`
              <div class="gdi-scan-bar-wrap" style="margin-top:6px;height:3px;background:var(--ferreto-surface-2,rgba(255,255,255,.08));border-radius:2px;overflow:hidden;">
                <div class="gdi-scan-progress" style="height:100%;width:${c.scanPercent||0}%;background:var(--ferreto-secondary,#5ddeda);transition:width .3s;" title="Escaneando: ${c.scanPercent||0}%"></div>
              </div>
              <small class="gdi-scan-status" style="color:var(--ferreto-text-muted,#8b949e);font-size:10px;display:block;margin-top:2px;">
                ${c.scanStatus==='scanning'
                  ? '<i class="bi bi-arrow-repeat"></i> Escaneando aulas... '+(c.scanPercent||0)+'%'
                  : c.scanStatus==='done'
                    ? '<i class="bi bi-check2" style="color:#3fb950;"></i> '+(c.scanLessonsFound||0)+' aulas encontradas'
                    : '<i class="bi bi-exclamation-triangle" style="color:#ff8b8b;"></i> Erro ao escanear'}
              </small>`:''}
              <div style="display:flex;gap:6px;margin-top:8px;">
                <button class="gdi-btn-continue" data-course-key="${escHtml(c.key)}" style="flex:1;" disabled><i class="bi bi-hourglass-split"></i> Verificando…</button>
                <a href="${escHtml(coursePath)}" class="gdi-btn-continue" style="flex:1;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;" title="Abrir pasta no Drive"><i class="bi bi-folder2-open"></i> Ir para o Drive</a>
              </div>
              ${/* ★ Task 16 / FIX 2: botão "Escanear agora" manual */ ''}
              ${(!c.scanStatus || c.scanStatus === 'error') ? `
              <div style="display:flex;gap:6px;margin-top:6px;">
                <button class="gdi-btn-scan-now" data-course-key="${escHtml(c.key)}" style="flex:1;font-size:11px;padding:6px 10px;background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);color:var(--ferreto-secondary,#5ddeda);border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;" title="Escanear aulas do curso">
                  <i class="bi bi-arrow-repeat"></i> Escanear agora
                </button>
              </div>` : ''}
              ${c.scanStatus === 'scanning' ? `
              <div style="display:flex;gap:6px;margin-top:6px;">
                <button class="gdi-btn-scan-now" disabled style="flex:1;font-size:11px;padding:6px 10px;background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);color:var(--ferreto-text-muted,#8b949e);border-radius:8px;cursor:default;display:inline-flex;align-items:center;justify-content:center;gap:6px;opacity:.7;">
                  <i class="bi bi-hourglass-split"></i> Escaneando ${c.scanPercent||0}%
                </button>
              </div>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>`:''}
    `;

    // bind quick actions (todas apontam para abas que ainda existem)
    box.querySelectorAll('[data-action]').forEach(el=>{
      el.onclick=()=>{
        S.tab=el.dataset.action;
        // ativa S.tab visualmente
        S.panel.querySelectorAll('.gdi-central-tab').forEach(b=>b.classList.toggle('active',b.dataset.t===S.tab));
        renderBody(S.tab);
      };
    });
    // bind course cards (continue) — clicar leva a openCourseDetail
    // ★ FIX 3 (Task 14): <a> "Ir para o Drive" também tem classe .gdi-btn-continue;
    //   usar selector específico p/ só pegar o <button> Continuar, e ignorar clicks em <a>.
    box.querySelectorAll('[data-course-key]').forEach(cardEl=>{
      const ck=cardEl.dataset.courseKey;
      const contBtn=cardEl.querySelector('button.gdi-btn-continue');
      bestIn(ck).then(target=>{
        if(target){
          if(contBtn){
            contBtn.disabled=false;
            contBtn.innerHTML=`<i class="bi bi-play-fill"></i> Continuar: ${escHtml(realName(target).slice(0,30))}`;
            contBtn.onclick=(e)=>{e.stopPropagation();location.href=target+(target.includes('?')?'&':'?')+'a=view';};
          }
        }else{
          if(contBtn){
            contBtn.disabled=true;
            contBtn.className='gdi-btn-continue gdi-btn-done';
            contBtn.innerHTML='<i class="bi bi-check2-all"></i> Tudo em dia!';
          }
        }
      });
      cardEl.onclick=(e)=>{
        // ★ ignora clicks em <button> OU <a> (Drive link navega sozinho)
        if(e.target.closest('button'))return;
        if(e.target.closest('a'))return;
        // abre detalhe do curso (função preservada — S.tab cursos removida mas função fica)
        const c=courses.find(x=>x.key===ck);
        if(c)openCourseDetail(box,c);
      };
      // ★ Task 16 / FIX 2: botão "Escanear agora" — dispara scanner manualmente
      const scanBtn = cardEl.querySelector('.gdi-btn-scan-now');
      if(scanBtn && !scanBtn.disabled){
        scanBtn.addEventListener('click', function(e){
          e.stopPropagation();
          const ckScan = this.dataset.courseKey;
          if(ckScan && window.gdiCourseScanner){
            // Limpa estado anterior (caso tenha sido 'error') e inicia novo scan
            window.gdiCourseScanner.clearScanState(ckScan);
            // Feedback imediato: troca texto do botão
            try{
              this.disabled = true;
              this.style.opacity = '.7';
              this.innerHTML = '<i class="bi bi-hourglass-split"></i> Iniciando…';
            }catch(_){}
            window.gdiCourseScanner.startScan(ckScan, function(state, lessonsData){
              // Atualiza tile se ainda visível
              try{
                if(state.status === 'scanning'){
                  const pct = (state.totalFolders > 0)
                    ? Math.round((state.scannedFolders||0)/state.totalFolders*100)
                    : 0;
                  if(scanBtn && scanBtn.isConnected){
                    scanBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Escaneando '+pct+'%';
                  }
                  // Atualiza barra de progresso + stats
                  const bar = cardEl.querySelector('.gdi-scan-progress');
                  if(bar) bar.style.width = pct + '%';
                  const totalEl = cardEl.querySelector('[data-stat="total"]');
                  if(totalEl && lessonsData && lessonsData.lessons){
                    totalEl.textContent = lessonsData.lessons.length;
                  }
                }else if(state.status === 'done' || state.status === 'error'){
                  // Re-renderiza home para atualizar tile com estado final
                  const body = document.getElementById('gdi-central-body');
                  if(body && window.__gdiCurrentTab === 'home' && typeof renderHome === 'function'){
                    try{ window.__gdiStudy.panel.renderHome(body); }catch(_){}
                  }
                }
              }catch(_){}
            });
          }
        });
      }
    });
  }

  // ★ Aba "Conquistas" — gamificação
  function renderAchievements(box){
    if(!window.gdiAchievements){
      box.innerHTML='<div class="gdi-notes-empty">Sistema de conquistas indisponível.</div>';
      return;
    }
    const unlocked=window.gdiAchievements.getUnlocked();
    const defs=window.gdiAchievements.defs();
    const total=defs.length;
    const pct=Math.round(unlocked.length/total*100);
    box.innerHTML=`<div style="max-width:760px;">
      <div style="text-align:center;margin-bottom:20px;padding:20px;background:linear-gradient(135deg,rgba(255,139,159,.1),rgba(93,222,218,.06));border:1px solid var(--ferreto-border,#21262d);border-radius:14px;">
        <div style="font-size:48px;margin-bottom:8px;">🏆</div>
        <b style="color:var(--ferreto-text,#f0f6fc);font-size:18px;font-family:var(--ferreto-font-display,'Poppins',sans-serif);">Conquistas</b>
        <p style="color:var(--ferreto-text-muted,#8b949e);font-size:13px;margin:6px 0 0;">${unlocked.length} de ${total} desbloqueadas · ${pct}% completo</p>
        <div style="height:8px;background:var(--ferreto-surface-3,rgba(255,255,255,.08));border-radius:4px;overflow:hidden;margin:14px auto 0;max-width:300px;">
          <div style="height:8px;width:${pct}%;background:var(--ferreto-grad);border-radius:4px;transition:width .4s;"></div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;">
        ${defs.map(d=>{
          const isUnlocked=unlocked.includes(d.id);
          return `<div style="background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid ${isUnlocked?'rgba(63,185,80,.3)':'var(--ferreto-border,#21262d)'};border-radius:12px;padding:14px;text-align:center;${isUnlocked?'':'opacity:.5;'}">
            <div style="font-size:32px;margin-bottom:6px;${isUnlocked?'':'filter:grayscale(1);'}">${d.icon}</div>
            <b style="color:${isUnlocked?'#3fb950':'var(--ferreto-text-muted,#8b949e)'};font-size:13px;display:block;">${escHtml(d.title)}</b>
            <small style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;display:block;margin-top:4px;line-height:1.4;">${escHtml(d.desc)}</small>
            ${isUnlocked?'<div style="font-size:10px;color:#3fb950;margin-top:6px;font-weight:600;">✓ DESBLOQUEADA</div>':'<div style="font-size:10px;color:var(--ferreto-text-faint,#6b7488);margin-top:6px;">bloqueada</div>'}
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }
  async function renderStats(box){
    let d=stateD();
    if(!d){
      box.innerHTML=`<div class="gdi-notes-empty" style="padding:40px;text-align:center;">
        <div class="gdi-mat-isa-spin" style="margin:0 auto 12px;"></div>
        <div>Carregando estat\u00edsticas\u2026</div>
      </div>`;
      try{await ensureState();}catch(_){}
      d=stateD();
      if(!d){
        box.innerHTML=`<div class="gdi-notes-empty" style="padding:40px;text-align:center;">
          <i class="bi bi-exclamation-circle" style="font-size:32px;color:var(--ferreto-text-muted,#8b949e);"></i>
          <div style="margin-top:8px;">N\u00e3o foi poss\u00edvel carregar suas estat\u00edsticas.<br><span style="font-size:11px;">Estude algumas aulas e tente novamente.</span></div>
        </div>`;
        return;
      }
    }
    const chip=(ic,tx)=>`<span style="background:var(--ferreto-surface-2,#161b22);border:1px solid var(--ferreto-border,#21262d);border-radius:8px;padding:6px 10px;font-size:12px;color:var(--ferreto-text,#e6edf3);">${ic} ${tx}</span>`;
    const acts={};
    const addA=t=>{if(!t)return;const k=dayKey(t);acts[k]=(acts[k]||0)+1;};
    const w=(d.watched)||{},r=(d.resume)||{};
    for(const k in w)addA(w[k]&&w[k].at);
    for(const k in r)addA(r[k]&&r[k].at);
    if(d.last&&d.last.at)addA(d.last.at);
    for(const k in(d.notes||{}))(d.notes[k]||[]).forEach(n=>addA(n.at));
    (Array.isArray(d.history)?d.history:[]).forEach(h=>addA(h&&h.at));
    const days=new Set(Object.keys(acts));
    let streak=0;const dd=new Date();
    const hasD=t=>days.has(dayKey(t));
    if(!hasD(dd))dd.setDate(dd.getDate()-1);
    while(hasD(dd)){streak++;dd.setDate(dd.getDate()-1);}
    const today=new Date();today.setHours(12,0,0,0);
    const begin=new Date(today);begin.setDate(begin.getDate()-91);begin.setDate(begin.getDate()-begin.getDay());
    const n=Math.round((today-begin)/86400000)+1;
    let heat='';
    for(let i=0;i<n;i++){
      const t=new Date(begin.getTime()+i*86400000);
      const a=acts[dayKey(t)]||0;
      const lvl=a===0?0:a===1?1:a<=3?2:a<=6?3:4;
      heat+=`<i class="${lvl?'l'+lvl:''}" title="${dateBr(t)} \u00b7 ${a} atividade${a===1?'':'s'}"></i>`;
    }
    const ws=new Date();ws.setHours(0,0,0,0);ws.setDate(ws.getDate()-ws.getDay());
    let wkMin=0;
    const watch=lsGet(LS_WATCH,{});
    for(const k in watch){const p=k.split('-').map(Number);const t=new Date(p[0],p[1]-1,p[2],12);if(t>=ws)wkMin+=watch[k];}
    wkMin=Math.round(wkMin/60);
    const per={};
    for(const k in r){const ck=courseKeyOf(k);if(!ck)continue;const x=r[k]||{};per[ck]=(per[ck]||0)+Math.min(x.t||0,(x.d>0?x.d:x.t)||0);}
    const top=Object.entries(per).map(([ck,s])=>({ck,h:s/3600})).sort((a,b)=>b.h-a.h).slice(0,8);
    const maxH=top.length?Math.max(top[0].h,.1):1;
    let notesN=0;for(const k in(d.notes||{}))notesN+=(d.notes[k]||[]).length;
    let srsDue=0;const now=Date.now();
    for(const k in(d.notes||{}))(d.notes[k]||[]).forEach(x=>{const e=d.srs&&d.srs[k+'|'+x.at];if((e?e.due:(x.at+86400000))<=now)srsDue++;});
    const totalH=Object.values(per).reduce((a,b)=>a+b,0)/3600;
    box.innerHTML=`
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
        ${chip('\ud83d\udd25',streak+' dia'+(streak===1?'':'s')+' seguidos')}
        ${chip('\u23f1\ufe0f',fmtMin(todayMin())+' hoje')}
        ${chip('\ud83d\udcca',fmtMin(wkMin)+' na semana')}
        ${chip('\u2753','\u2248'+totalH.toFixed(1).replace('.',',')+'h no total')}
        ${chip('\u2705',Object.keys(w).length+' conclu\u00eddas')}
        ${chip('\u25b6',Object.keys(r).length+' em andamento')}
        ${chip('\ud83d\udcdd',notesN+' anota\u00e7\u00f5es')}
        ${srsDue?chip('\ud83c\udf93',srsDue+' revis\u00f5es vencidas'):''}
      </div>
      <h4 style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin:0 0 8px;">\u00daltimos 3 meses \u00b7 atividades por dia</h4>
      <div class="heat" style="margin-bottom:18px;overflow-x:auto;padding-bottom:4px;">${heat}</div>
      <h4 style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin:0 0 8px;">Horas por curso (estimativa)</h4>
      ${top.map(t2=>`<div style="margin-bottom:8px;min-width:260px;max-width:640px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--ferreto-text,#e6edf3);margin-bottom:3px;">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:78%;">${escHtml(courseName(t2.ck))}</span>
          <span style="color:var(--ferreto-text-muted,#8b949e);">${t2.h.toFixed(1).replace('.',',')}h</span>
        </div>
        <div style="height:6px;background:var(--ferreto-surface-3,rgba(255,255,255,.08));border-radius:3px;overflow:hidden;"><div style="height:6px;width:${Math.max(3,Math.round(t2.h/maxH*100))}%;background:var(--ferreto-grad);"></div></div>
      </div>`).join('')||'<div class="gdi-notes-empty">Sem dados ainda.</div>'}`;
  }
  if(!document.getElementById('gdi-central-style')){
    const s=document.createElement('style');s.id='gdi-central-style';s.textContent=`
/* ═══ ÁREA DO ALUNO v3 — design moderno (sidebar + dashboard) ═══ */
#gdi-central{position:fixed;inset:0;z-index:10001;background:var(--ferreto-bg,#070910);color:var(--ferreto-text,#f3f5fa);font-family:var(--ferreto-font-body,'Rubik',sans-serif);display:none;overflow-y:auto;}
@keyframes gdi-central-in{from{opacity:0;transform:scale(.98)}to{opacity:1;transform:none}}
.gdi-central-box{width:100%;height:100%;min-height:100vh;margin:0;padding:0;background:var(--ferreto-bg,#070910);border:0;border-radius:0;}
.gdi-central-head{display:flex;align-items:center;gap:16px;padding:14px 20px;border-bottom:1px solid var(--ferreto-border,#21262d);background:linear-gradient(135deg,rgba(255,139,159,.08),rgba(93,222,218,.05));flex-shrink:0;flex-wrap:nowrap;}
.gdi-central-head-title{display:flex;align-items:center;gap:10px;flex-shrink:0;}
.gdi-central-head-title b{color:var(--ferreto-text,#f0f6fc);font-size:16px;font-family:var(--ferreto-font-display,'Poppins',sans-serif);font-weight:600;}
.gdi-central-head-title .gdi-central-icon{font-size:22px;}
.gdi-central-stats{display:flex;gap:8px;flex:1;justify-content:center;flex-wrap:wrap;}
.gdi-central-stat{display:flex;align-items:center;gap:6px;background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#21262d);border-radius:999px;padding:5px 12px;font-size:12px;color:var(--ferreto-text,#e6edf3);}
.gdi-central-stat i{font-size:13px;}
.gdi-central-stat b{color:var(--ferreto-text,#f0f6fc);font-weight:600;}
.gdi-central-stat .gdi-stat-fire{color:#ff6b6b;}
.gdi-central-stat .gdi-stat-time{color:#ffd43b;}
.gdi-central-stat .gdi-stat-cards{color:var(--ferreto-primary,#ff8b9f);}
#gdi-central-x{margin-left:auto;background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#21262d);color:var(--ferreto-text-muted,#8b949e);width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0;}
#gdi-central-x:hover{background:rgba(255,107,107,.15);color:#ff8b8b;border-color:rgba(255,107,107,.3);}
.gdi-central-main{display:flex;flex:1;min-height:0;width:100%;}
.gdi-central-sidebar{width:220px;flex-shrink:0;background:var(--ferreto-bg-2,#0d1119);border-right:1px solid var(--ferreto-border,#21262d);overflow-y:auto;padding:14px 10px;display:flex;flex-direction:column;gap:2px;}
.gdi-central-sidebar::-webkit-scrollbar{width:6px;}
.gdi-central-sidebar::-webkit-scrollbar-thumb{background:var(--ferreto-border,#21262d);border-radius:3px;}
.gdi-central-sidebar-group{margin-top:14px;padding:0 8px;}
.gdi-central-sidebar-group:first-child{margin-top:0;}
.gdi-central-sidebar-label{font-size:10px;font-weight:700;color:var(--ferreto-text-faint,#6b7488);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;padding:0 8px;}
.gdi-central-tab{display:flex;align-items:center;gap:10px;background:none;border:0;color:var(--ferreto-text-muted,#8b949e);padding:9px 12px;cursor:pointer;font-size:13px;border-radius:8px;transition:all .15s;font-family:var(--ferreto-font-body,'Rubik',sans-serif);width:100%;text-align:left;}
.gdi-central-tab:hover{background:var(--ferreto-surface-2,rgba(255,255,255,.05));color:var(--ferreto-text,#f0f6fc);}
.gdi-central-tab.active{background:linear-gradient(135deg,rgba(255,139,159,.18),rgba(93,222,218,.08));color:var(--ferreto-text,#f0f6fc);box-shadow:inset 0 0 0 1px rgba(255,139,159,.25);}
.gdi-central-tab i{font-size:15px;width:18px;text-align:center;flex-shrink:0;}
.gdi-central-tab.active i{color:var(--ferreto-primary,#ff8b9f);}
.gdi-central-tab .gdi-tab-badge{margin-left:auto;background:var(--ferreto-primary,#ff8b9f);color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:999px;min-width:18px;text-align:center;}
.gdi-central-body{flex:1;overflow-y:auto;padding:24px;color:var(--ferreto-text,#f0f6fc);animation:gdi-tab-in .2s ease;}
@keyframes gdi-tab-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.gdi-central-body::-webkit-scrollbar{width:8px;}
.gdi-central-body::-webkit-scrollbar-thumb{background:var(--ferreto-border,#21262d);border-radius:4px;}
.gdi-central-body::-webkit-scrollbar-thumb:hover{background:var(--ferreto-border-strong,#30363d);}
.gdi-courses{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px;}
.gdi-course{background:linear-gradient(135deg,var(--ferreto-surface-2,rgba(255,255,255,.04)),rgba(255,255,255,.02));border:1px solid var(--ferreto-border,#21262d);border-radius:16px;padding:18px;transition:all .2s cubic-bezier(.4,0,.2,1);position:relative;overflow:hidden;}
.gdi-course::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:var(--ferreto-grad);opacity:0;transition:opacity .2s;}
.gdi-course:hover{border-color:rgba(255,139,159,.3);transform:translateY(-3px);box-shadow:0 12px 32px -8px rgba(0,0,0,.4);}
.gdi-course:hover::before{opacity:1;}
.gdi-course b{color:var(--ferreto-text,#f0f6fc);font-size:14px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--ferreto-font-display,'Poppins',sans-serif);font-weight:600;}
.gdi-course small{color:var(--ferreto-text-muted,#8b949e);font-size:11px;display:block;margin:6px 0 12px;}
.gdi-course-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:12px 0;}
.gdi-course-stat{background:var(--ferreto-surface-3,rgba(255,255,255,.04));border-radius:8px;padding:8px 6px;text-align:center;}
.gdi-course-stat-num{font-size:18px;font-weight:700;color:var(--ferreto-text,#f0f6fc);display:block;font-family:var(--ferreto-font-display,'Poppins',sans-serif);}
.gdi-course-stat-label{font-size:9px;color:var(--ferreto-text-muted,#8b949e);text-transform:uppercase;letter-spacing:.05em;margin-top:2px;display:block;}
.gdi-progress-bar{height:6px;background:var(--ferreto-surface-3,rgba(255,255,255,.08));border-radius:3px;overflow:hidden;margin:10px 0;}
.gdi-progress-fill{height:100%;background:var(--ferreto-grad);border-radius:3px;transition:width .5s cubic-bezier(.4,0,.2,1);}
.gdi-btn-continue{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:10px;background:var(--ferreto-grad);color:#fff;border:0;border-radius:10px;cursor:pointer;font-size:13px;font-weight:600;font-family:var(--ferreto-font-body,'Rubik',sans-serif);transition:all .15s;}
.gdi-btn-continue:hover{filter:brightness(1.1);transform:translateY(-1px);box-shadow:0 6px 18px -4px var(--ferreto-glow);}
.gdi-btn-continue:disabled{opacity:.5;cursor:default;filter:none;transform:none;box-shadow:none;}
.gdi-btn-continue.gdi-btn-done{background:rgba(63,185,80,.15);color:#3fb950;border:1px solid rgba(63,185,80,.3);}
.gdi-empty-state{padding:60px 20px;text-align:center;}
.gdi-empty-state-icon{font-size:64px;line-height:1;margin-bottom:16px;opacity:.5;display:block;}
.gdi-empty-state h3{color:var(--ferreto-text,#f0f6fc);font-size:18px;font-family:var(--ferreto-font-display,'Poppins',sans-serif);margin:0 0 8px;font-weight:600;}
.gdi-empty-state p{color:var(--ferreto-text-muted,#8b949e);font-size:13px;margin:0 0 20px;line-height:1.6;max-width:400px;margin-left:auto;margin-right:auto;}
.gdi-dashboard-hero{background:linear-gradient(135deg,rgba(255,139,159,.12),rgba(93,222,218,.08));border:1px solid var(--ferreto-border,#21262d);border-radius:18px;padding:24px;margin-bottom:20px;position:relative;overflow:hidden;}
.gdi-dashboard-hero::after{content:'';position:absolute;top:-50%;right:-20%;width:60%;height:200%;background:radial-gradient(ellipse,rgba(255,139,159,.08),transparent 70%);pointer-events:none;}
.gdi-dashboard-hero h2{color:var(--ferreto-text,#f0f6fc);font-size:22px;font-family:var(--ferreto-font-display,'Poppins',sans-serif);margin:0 0 6px;font-weight:700;}
.gdi-dashboard-hero p{color:var(--ferreto-text-muted,#8b949e);font-size:13px;margin:0;}
.gdi-dashboard-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:20px;}
.gdi-dashboard-card{background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#21262d);border-radius:14px;padding:16px;cursor:pointer;transition:all .2s;}
.gdi-dashboard-card:hover{border-color:rgba(255,139,159,.3);transform:translateY(-2px);}
.gdi-dashboard-card-icon{font-size:28px;display:block;margin-bottom:8px;}
.gdi-dashboard-card-num{font-size:24px;font-weight:700;color:var(--ferreto-text,#f0f6fc);font-family:var(--ferreto-font-display,'Poppins',sans-serif);display:block;}
.gdi-dashboard-card-label{font-size:11px;color:var(--ferreto-text-muted,#8b949e);text-transform:uppercase;letter-spacing:.05em;margin-top:2px;display:block;}
.gdi-dashboard-card-meta{font-size:11px;color:var(--ferreto-text-faint,#6b7488);margin-top:6px;display:block;}
.gdi-quick-actions{display:flex;gap:8px;flex-wrap:wrap;}
.gdi-quick-action{display:flex;align-items:center;gap:6px;background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#21262d);color:var(--ferreto-text,#e6edf3);padding:10px 14px;border-radius:10px;cursor:pointer;font-size:13px;font-family:var(--ferreto-font-body,'Rubik',sans-serif);transition:all .15s;}
.gdi-quick-action:hover{background:var(--ferreto-surface-3,rgba(255,255,255,.08));border-color:rgba(255,139,159,.3);transform:translateY(-1px);}
.gdi-quick-action i{color:var(--ferreto-primary,#ff8b9f);}
.heat-wrap{width:100%;overflow-x:auto;padding-bottom:6px;}
.heat{display:grid;grid-auto-flow:column;grid-template-rows:repeat(7,13px);grid-template-columns:repeat(auto-fill,minmax(13px,1fr));gap:3px;width:100%;min-width:100%;}
.heat i{width:13px;height:13px;border-radius:3px;background:var(--ferreto-surface-3,rgba(255,255,255,.08));display:block;transition:transform .15s;}
.heat i:hover{transform:scale(1.4);}
.heat i.l1{background:#0e4429}.heat i.l2{background:#006d32}.heat i.l3{background:#26a641}.heat i.l4{background:#39d353}
.gdi-central-box select, .gdi-central-box select option, .gdi-central-box optgroup {
  color-scheme: dark light;
  background: var(--ferreto-bg-2,#0d1119);
  color: var(--ferreto-text,#e6edf3);
}
[data-bs-theme="light"] .gdi-central-box select,
[data-bs-theme="light"] .gdi-central-box select option,
[data-bs-theme="light"] .gdi-central-box optgroup {
  color-scheme: light; background: #fff; color: #1f2540;
}
.gdi-modal-overlay{z-index:100000!important;}
.gdi-fc{background:var(--ferreto-surface-2,rgba(255,255,255,.045));border:1px solid var(--ferreto-border-strong,#30363d);border-radius:14px;padding:26px 20px;min-height:170px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;cursor:pointer;max-width:560px;margin:0 auto;}
@media(max-width:768px){
  .gdi-central-sidebar{width:60px;padding:10px 6px;}
  .gdi-central-sidebar-group{padding:0 4px;}
  .gdi-central-sidebar-label{display:none;}
  .gdi-central-tab{padding:9px 8px;justify-content:center;}
  .gdi-central-tab span,.gdi-central-tab .gdi-tab-badge{display:none;}
  .gdi-central-stats{display:none;}
  .gdi-central-head{padding:12px 14px;gap:10px;}
  .gdi-central-body{padding:16px;}
  .gdi-courses{grid-template-columns:1fr;}
  .gdi-course-stats{grid-template-columns:repeat(2,1fr);}
}
/* ★ Task 15: scan progress bar (lightweight background course scanner) */
.gdi-scan-bar-wrap{margin-top:6px;height:3px;background:var(--ferreto-surface-2,rgba(255,255,255,.08));border-radius:2px;overflow:hidden;}
.gdi-scan-progress{height:100%;background:var(--ferreto-secondary,#5ddeda);transition:width .3s;}
.gdi-scan-status{color:var(--ferreto-text-muted,#8b949e);font-size:10px;display:block;margin-top:2px;}
.gdi-scan-status .bi-arrow-repeat{animation:gdi-scan-spin 1s linear infinite;display:inline-block;}
@keyframes gdi-scan-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
/* ★ FIX 3 (Task 23): tiles deformados no Android — reduz padding/fontes/stats
   grid em telas < 480px. Antes o tile tinha 4 stats lado-a-lado + 2 botões
   lado-a-lado + barra de scan, ocupando ~340px de altura em telas de 360px.
   Agora stats viram 2x2, botões ficam menores e padding reduz. */
@media(max-width:480px){
  .gdi-course{padding:8px!important;}
  .gdi-course b{font-size:12px!important;}
  .gdi-course small{font-size:10px!important;margin:4px 0 8px!important;}
  .gdi-course-stats{grid-template-columns:repeat(2,1fr)!important;gap:4px!important;margin:8px 0!important;}
  .gdi-course-stat{padding:6px 4px!important;}
  .gdi-course-stat-num{font-size:16px!important;}
  .gdi-course-stat-label{font-size:8px!important;}
  .gdi-progress-bar{height:4px!important;margin:6px 0!important;}
  .gdi-btn-continue{font-size:11px!important;padding:6px 8px!important;border-radius:8px!important;}
  .gdi-scan-bar-wrap{margin-top:4px!important;}
  .gdi-scan-status{font-size:9px!important;}
  /* botão "Escanear agora" manual + botão scanning — reduz padding/font em mobile */
  .gdi-btn-scan-now{font-size:10px!important;padding:5px 8px!important;}
}
/* ★ v91: Pomodoro sidebar widget */
.gdi-pomodoro-sidebar{flex-shrink:0;}
.gdi-pomodoro-sidebar button{transition:all .15s;}
.gdi-pomodoro-sidebar button:hover{filter:brightness(1.1);}
/* ★ v91: collapsed sidebar (video/PDF split mode — sidebar vira só ícones) */
#gdi-central.collapsed .gdi-central-sidebar{width:60px;padding:10px 6px;}
#gdi-central.collapsed .gdi-central-sidebar-group{padding:0 4px;}
#gdi-central.collapsed .gdi-central-sidebar-label{display:none;}
#gdi-central.collapsed .gdi-central-tab{padding:9px 8px;justify-content:center;}
#gdi-central.collapsed .gdi-central-tab span,
#gdi-central.collapsed .gdi-central-tab .gdi-tab-badge{display:none;}
/* When video/PDF split is active, body becomes a fixed-height flex container (no scroll) */
#gdi-central.collapsed .gdi-central-body{overflow:hidden;padding:12px;}
#gdi-central.collapsed .gdi-pomodoro-sidebar{padding:6px 2px;border-top:1px solid var(--ferreto-border,#30363d);}
#gdi-central.collapsed .gdi-pomodoro-sidebar > div:first-child{font-size:14px;margin-bottom:2px;text-align:center;letter-spacing:0;}
#gdi-central.collapsed .gdi-pomodoro-sidebar > div[style*="display:flex"]{display:none!important;}
#gdi-central.collapsed .gdi-pomodoro-sidebar > #gdi-pomo-time{font-size:13px;margin:2px 0;}
#gdi-central.collapsed .gdi-pomodoro-sidebar > #gdi-pomo-phase{font-size:9px;}
.gdi-central-video-container{flex:1;display:flex;align-items:center;justify-content:center;background:#000;}
.gdi-mode-btn{background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#30363d);color:var(--ferreto-text,#e6edf3);border-radius:6px;cursor:pointer;font-family:inherit;}
.gdi-mode-btn:hover{background:var(--ferreto-surface-3,rgba(255,255,255,.08));}
`;document.head.appendChild(s);
  }

  // ═══════════════════════════════════════════════════════════════
  // v91: Pomodoro timer (sidebar widget) + Video/PDF in-panel viewer
  // ═══════════════════════════════════════════════════════════════

  // ── Pomodoro state ──
  const POMO_DURATIONS = { focus: 25*60, short: 5*60, long: 15*60 };
  const POMO_PHASE_LABEL = { focus: 'Foco', short: 'Pausa curta', long: 'Pausa longa' };
  const POMO_LS = 'gdi-pomodoro-state';
  let _pomoTimer = null;
  let _pomoState = null;
  let _pomoLastSave = 0;

  function pomoLoad(){
    try{
      const s = JSON.parse(localStorage.getItem(POMO_LS) || 'null');
      if(s && typeof s === 'object' && s.phase && POMO_DURATIONS[s.phase]){
        _pomoState = {
          phase: s.phase,
          cycle: Math.max(0, Math.min(3, parseInt(s.cycle,10) || 0)),
          remaining: Math.max(0, parseInt(s.remaining,10) || POMO_DURATIONS[s.phase]),
          running: !!s.running,
          endsAt: parseInt(s.endsAt,10) || 0
        };
        // If running but endsAt passed, finalize current phase on next tick
        return;
      }
    }catch(_){}
    _pomoState = { phase:'focus', cycle:0, remaining:POMO_DURATIONS.focus, running:false, endsAt:0 };
  }
  function pomoSave(){
    try{ localStorage.setItem(POMO_LS, JSON.stringify(_pomoState)); }catch(_){}
  }
  function pomoPhaseDuration(phase){ return POMO_DURATIONS[phase] || POMO_DURATIONS.focus; }
  function pomoFormatTime(sec){
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec/60);
    const s = sec % 60;
    return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  }
  function pomoUpdateDOM(){
    if(!S.panel || !_pomoState) return;
    const timeEl = S.panel.querySelector('#gdi-pomo-time');
    const phaseEl = S.panel.querySelector('#gdi-pomo-phase');
    const startBtn = S.panel.querySelector('#gdi-pomo-start');
    if(timeEl) timeEl.textContent = pomoFormatTime(_pomoState.remaining);
    if(phaseEl) phaseEl.textContent = POMO_PHASE_LABEL[_pomoState.phase] || 'Foco';
    if(startBtn) startBtn.textContent = _pomoState.running ? '⏸' : '▶';
  }
  function pomoAdvancePhase(){
    // Transition: focus → short break (or long after 4 cycles); breaks → focus
    if(_pomoState.phase === 'focus'){
      _pomoState.cycle += 1;
      if(_pomoState.cycle >= 4){
        _pomoState.phase = 'long';
        _pomoState.cycle = 0;  // reset cycle counter after long break
      } else {
        _pomoState.phase = 'short';
      }
    } else {
      _pomoState.phase = 'focus';
    }
    _pomoState.remaining = pomoPhaseDuration(_pomoState.phase);
    _pomoState.endsAt = _pomoState.running ? Date.now() + _pomoState.remaining*1000 : 0;
  }
  function pomoTick(){
    if(!_pomoState || !_pomoState.running) return;
    const now = Date.now();
    const remaining = Math.max(0, Math.round((_pomoState.endsAt - now)/1000));
    if(remaining <= 0){
      // Phase complete — advance and PAUSE (user can re-start the next phase)
      pomoAdvancePhase();
      _pomoState.running = false;
      _pomoState.endsAt = 0;
      pomoSave();
      pomoUpdateDOM();
      try{ showToast('🍅 Pomodoro: ' + (POMO_PHASE_LABEL[_pomoState.phase] || 'Foco') + ' — toque para iniciar', 'info'); }catch(_){}
      // beep via WebAudio (no asset needed)
      try{
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        const o = ac.createOscillator(); const g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        o.frequency.value = 880; o.type = 'sine';
        g.gain.setValueAtTime(0.15, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.5);
        o.start(); o.stop(ac.currentTime + 0.5);
      }catch(_){}
      return;
    }
    _pomoState.remaining = remaining;
    pomoUpdateDOM();
    // Save at most every ~5s to avoid localStorage thrash
    if(now - _pomoLastSave > 5000){ pomoSave(); _pomoLastSave = now; }
  }
  function pomoStartToggle(){
    if(!_pomoState) pomoLoad();
    if(_pomoState.running){
      _pomoState.running = false;
      _pomoState.endsAt = 0;
    } else {
      _pomoState.running = true;
      _pomoState.endsAt = Date.now() + _pomoState.remaining*1000;
    }
    pomoSave(); _pomoLastSave = Date.now();
    pomoUpdateDOM();
  }
  function pomoReset(){
    if(!_pomoState) pomoLoad();
    _pomoState.running = false;
    _pomoState.endsAt = 0;
    _pomoState.remaining = pomoPhaseDuration(_pomoState.phase);
    pomoSave(); _pomoLastSave = Date.now();
    pomoUpdateDOM();
  }
  function initPomodoro(){
    if(!S.panel) return;
    if(!_pomoState) pomoLoad();
    // Re-bind handlers (sidebar may have been re-rendered). Idempotent.
    const startBtn = S.panel.querySelector('#gdi-pomo-start');
    const resetBtn = S.panel.querySelector('#gdi-pomo-reset');
    if(startBtn) startBtn.onclick = pomoStartToggle;
    if(resetBtn) resetBtn.onclick = pomoReset;
    pomoUpdateDOM();
    // Start interval once globally (not per render)
    if(!_pomoTimer){
      _pomoTimer = setInterval(pomoTick, 1000);
    }
  }

  // ── Video / PDF in-panel viewer (sidebar collapses) ──
  function restoreSidebarFromMediaView(){
    if(!S.panel) return;
    S.panel.classList.remove('collapsed');
    // Re-render the current tab body
    try{ renderBody(S.tab); }catch(_){}
  }
  function openVideoInPanel(url, name){
    if(!S.panel) return;
    const body = S.panel.querySelector('#gdi-central-body');
    if(!body) return;
    S.panel.classList.add('collapsed');
    // Build a view URL — the existing app router uses ?a=view
    const viewUrl = url + (url.includes('?') ? '&' : '?') + 'a=view';
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;gap:8px;min-height:0;">
        <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
          <button id="gdi-media-back" class="gdi-mode-btn" style="font-size:12px;padding:6px 10px;"><i class="bi bi-arrow-left"></i> Voltar</button>
          <b style="color:var(--ferreto-text,#f0f6fc);font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;">🎬 ${escHtml(name)}</b>
        </div>
        <div class="gdi-central-video-container" style="flex:1;display:flex;align-items:center;justify-content:center;background:#000;border-radius:12px;overflow:hidden;min-height:0;">
          <video src="${escHtml(viewUrl)}" controls autoplay playsinline style="max-width:100%;max-height:100%;"></video>
        </div>
      </div>`;
    const backBtn = body.querySelector('#gdi-media-back');
    if(backBtn) backBtn.onclick = restoreSidebarFromMediaView;
  }
  function openPdfSplitInPanel(url, name){
    if(!S.panel) return;
    const body = S.panel.querySelector('#gdi-central-body');
    if(!body) return;
    S.panel.classList.add('collapsed');
    const viewUrl = url + (url.includes('?') ? '&' : '?') + 'a=view';
    const notesKey = 'gdi-pdf-notes-' + url;
    let savedNotes = '';
    try{ savedNotes = localStorage.getItem(notesKey) || ''; }catch(_){}
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;gap:8px;min-height:0;">
        <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
          <button id="gdi-media-back" class="gdi-mode-btn" style="font-size:12px;padding:6px 10px;"><i class="bi bi-arrow-left"></i> Voltar</button>
          <b style="color:var(--ferreto-text,#f0f6fc);font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;">📄 ${escHtml(name)}</b>
        </div>
        <div style="flex:1;display:flex;gap:10px;min-height:0;">
          <div style="flex:1;background:var(--ferreto-surface-2,rgba(255,255,255,.03));border:1px solid var(--ferreto-border,#30363d);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid var(--ferreto-border,#30363d);font-size:11px;color:var(--ferreto-text-muted,#8b949e);flex-shrink:0;">
              <button id="gdi-pdf-split-prev" class="gdi-mode-btn" style="font-size:11px;padding:3px 8px;"><i class="bi bi-chevron-left"></i></button>
              <span>Pág <span id="gdi-pdf-split-num">1</span> / <span id="gdi-pdf-split-count">?</span></span>
              <button id="gdi-pdf-split-next" class="gdi-mode-btn" style="font-size:11px;padding:3px 8px;"><i class="bi bi-chevron-right"></i></button>
              <span style="flex:1;"></span>
              <a href="${escHtml(viewUrl)}" target="_blank" rel="noopener" style="color:var(--ferreto-secondary,#5ddeda);text-decoration:none;font-size:11px;">Abrir original ↗</a>
            </div>
            <div style="flex:1;overflow:auto;padding:10px;background:#525659;min-height:0;">
              <div id="gdi-pdf-split-spinner" style="color:#fff;text-align:center;padding:20px;">Carregando PDF…</div>
              <canvas id="gdi-pdf-split-canvas" style="max-width:100%;display:none;margin:0 auto;background:#fff;border-radius:4px;"></canvas>
            </div>
          </div>
          <div style="width:320px;flex-shrink:0;background:var(--ferreto-surface-2,rgba(255,255,255,.03));border:1px solid var(--ferreto-border,#30363d);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:8px;min-height:0;">
            <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ferreto-text,#e6edf3);flex-shrink:0;">
              <span style="font-size:18px;">🐩</span> <b>Notas & Meggy</b>
            </div>
            <textarea id="gdi-pdf-split-notes" placeholder="Anotações deste PDF (salvas automaticamente)…" style="flex:1;min-height:200px;background:var(--ferreto-surface-3,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);font-size:12px;font-family:inherit;padding:8px;resize:none;">${escHtml(savedNotes)}</textarea>
            <button id="gdi-pdf-split-meggy" style="background:linear-gradient(135deg,#ff8b9f,#c026d3);border:0;border-radius:8px;padding:8px;color:#fff;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;flex-shrink:0;">🐩 Pedir resumo à Meggy</button>
            <small style="color:var(--ferreto-text-muted,#8b949e);font-size:10px;text-align:center;flex-shrink:0;">Notas salvas localmente</small>
          </div>
        </div>
      </div>`;
    const backBtn = body.querySelector('#gdi-media-back');
    if(backBtn) backBtn.onclick = restoreSidebarFromMediaView;
    // Notes auto-save
    const notesEl = body.querySelector('#gdi-pdf-split-notes');
    if(notesEl){
      notesEl.addEventListener('input', function(){
        try{ localStorage.setItem(notesKey, this.value); }catch(_){}
      });
    }
    // Meggy button — open Meggy FAB if available
    const meggyBtn = body.querySelector('#gdi-pdf-split-meggy');
    if(meggyBtn){
      meggyBtn.onclick = function(){
        const fab = document.querySelector('#gdi-ai-fab');
        if(fab && fab.style.display !== 'none'){
          fab.click();
        } else {
          try{ showToast('Meggy indisponível neste momento', 'info'); }catch(_){}
        }
      };
    }
    // Render PDF using pdfjsLib (lazy-load from CDN if needed)
    renderPdfInSplit(viewUrl);
  }
  function renderPdfInSplit(url){
    const canvas = document.getElementById('gdi-pdf-split-canvas');
    const spinner = document.getElementById('gdi-pdf-split-spinner');
    const numEl = document.getElementById('gdi-pdf-split-num');
    const countEl = document.getElementById('gdi-pdf-split-count');
    const prevBtn = document.getElementById('gdi-pdf-split-prev');
    const nextBtn = document.getElementById('gdi-pdf-split-next');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    let pdfDoc = null;
    let pageNum = 1;
    const scale = 1.0;
    function renderPage(){
      if(!pdfDoc) return;
      pdfDoc.getPage(pageNum).then(function(page){
        const vp = page.getViewport({scale: scale});
        canvas.width = vp.width;
        canvas.height = vp.height;
        canvas.style.display = 'block';
        if(spinner) spinner.style.display = 'none';
        page.render({canvasContext: ctx, viewport: vp}).promise.catch(function(){});
        if(numEl) numEl.textContent = pageNum;
      }).catch(function(){});
    }
    function loadLib(){
      if(window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
      return new Promise(function(resolve, reject){
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
        s.onload = function(){ resolve(window.pdfjsLib); };
        s.onerror = function(){ reject(new Error('pdf.js failed to load')); };
        document.head.appendChild(s);
      });
    }
    loadLib().then(function(lib){
      if(!lib.GlobalWorkerOptions.workerSrc){
        lib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
      }
      return lib.getDocument(url).promise;
    }).then(function(doc){
      pdfDoc = doc;
      if(countEl) countEl.textContent = doc.numPages;
      renderPage();
    }).catch(function(err){
      if(spinner) spinner.innerHTML = '<div style="color:#ff8b8b;">Erro: ' + escHtml(err.message || '') + '</div><br><a href="' + escHtml(url) + '" target="_blank" rel="noopener" style="color:#5ddeda;">Abrir PDF ↗</a>';
    });
    if(prevBtn) prevBtn.onclick = function(){
      if(pdfDoc && pageNum > 1){ pageNum--; renderPage(); }
    };
    if(nextBtn) nextBtn.onclick = function(){
      if(pdfDoc && pageNum < pdfDoc.numPages){ pageNum++; renderPage(); }
    };
  }

  // ═══ Área do Aluno agora é uma ABA na navbar (não mais flutuante).
  // Injeta um .gdi-nav-btn em .gdi-nav-actions.
  // ★ PATCH A: injectNavButton coalesced via requestAnimationFrame.
  //   - removido o MutationObserver em .gdi-nav (subtree:true era caro)
  //   - removidos os 10× setTimeout(injectNavButton, i*300)
  //   - removidos os 2 Bus.onGlobal('page:change') redundantes
  //   - mantido 1 retry inicial + 1 listener page:change + 1 listener rows:appended
  function injectNavButton(){
    // 1) remove qualquer fab antigo (versão em cache pode ter criado)
    const oldFab=document.getElementById('gdi-central-fab');
    if(oldFab)oldFab.remove();

    // 2) injeta botão na navbar
    const actions=document.querySelector('.gdi-nav-actions');
    if(!actions)return false;
    if(actions.querySelector('#gdi-central-nav'))return true; // já injetou
    const btn=document.createElement('button');
    btn.id='gdi-central-nav';
    btn.className='gdi-nav-btn';
    btn.title='Área do Aluno (tecla C)';
    btn.innerHTML='<i class="bi bi-journal-bookmark-fill"></i><span class="d-none d-md-inline">Área do Aluno</span>';
    btn.onclick=()=>openPanel('home');
    // insere antes do botão de tema (se existir) ou no início
    const themeBtn=document.getElementById('theme-toggle');
    if(themeBtn)actions.insertBefore(btn,themeBtn);
    else actions.appendChild(btn);
    return true;
  }
  // ★ coalescing via requestAnimationFrame — múltiplas chamadas viram 1
  let _navRaf=0;
  function scheduleNavInject(){
    if(_navRaf)return;
    _navRaf=requestAnimationFrame(()=>{
      _navRaf=0;
      injectNavButton();
    });
  }
  // 1 retry inicial (substitui os 10 antigos)
  setTimeout(scheduleNavInject,300);
  // 1 listener page:change (substitui os 2 antigos)
  Bus.onGlobal('page:change',scheduleNavInject);
  // 1 listener rows:appended
  Bus.onGlobal('rows:appended',scheduleNavInject);
  // também registra como GDI_MODULE — o loader roda após a navbar estar pronta
  window.GDI_MODULES=window.GDI_MODULES||[];
  window.GDI_MODULES.push({name:'central-nav',init:function(){scheduleNavInject();}});
  // ★ PATCH A: MutationObserver em .gdi-nav REMOVIDO (era dispendioso e redundante)

  document.addEventListener('keydown',e=>{
    const t=e.target;
    if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable))return;
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    if(e.key==='Escape'){closePanel();return;}
    const k=e.key.toLowerCase();
    if(k==='c'){
      if(S.panel&&S.panel.style.display!=='none')closePanel();
      else openPanel();
      return;
    }
    if(!S.FC.active||!S.panel||S.panel.style.display==='none')return;
    if(e.code==='Space'){e.preventDefault();S.FC.flip&&S.FC.flip();}
    else if(e.key==='1'||e.key==='2'||e.key==='3'){S.FC.grade&&S.FC.grade(+e.key);}
  });

  log('Área do Aluno ativa (v3.1 — URL ?central=1 abre direto + atalho tecla C)');

  // ★ Task 17: acesso direto por URL — ?central=1 abre o painel automaticamente
  // Funciona em qualquer página (home, pasta, vídeo). Espera os slots estarem prontos.
  // Suporta também ?central=questoes, ?central=resumos, etc. (abre direto numa aba)
  (function(){
    function tryOpenFromURL(){
      try{
        if(window.__gdiAutoOpenDone) return false;
        const params = new URLSearchParams(window.location.search);
        const central = params.get('central');
        // ★ v1.0.75: também verifica window.MODEL.autoOpenCentral (homepage serve SPA com este flag)
        const autoOpen = central || (window.MODEL && window.MODEL.autoOpenCentral ? '1' : null);
        if(autoOpen){
          window.__gdiAutoOpenDone = true;
          // Espera GDIUser estar pronto (state carregado) antes de abrir
          const openNow = function(){
            const tab = (autoOpen === '1' || autoOpen === 'true') ? 'home' : autoOpen;
            openPanel(tab);
            // Limpa o parâmetro da URL (não fica reabrindo a cada navegação)
            try{
              const url = new URL(window.location.href);
              url.searchParams.delete('central');
              window.history.replaceState({}, '', url.toString());
            }catch(_){}
          };
          // ★ v80-FIX BUG 4: previously both `GDIUser.ready().then(openNow)`
          // AND `setTimeout(openNow, 2000)` were scheduled — if ready()
          // resolved before 2s, openNow ran twice (S.panel reopened after the
          // user closed it, hijacking the UI). Guard with a one-shot flag.
          let _opened = false;
          const openOnce = function(){
            if(_opened) return;
            _opened = true;
            openNow();
          };
          if(window.GDIUser && typeof window.GDIUser.ready === 'function'){
            window.GDIUser.ready().then(openOnce).catch(openOnce);
            // fallback: abre depois de 2s mesmo se ready() não resolver
            setTimeout(openOnce, 2000);
          }else{
            setTimeout(openOnce, 1500);
          }
          return true;
        }
      }catch(_){}
      return false;
    }
    // Tenta abrir imediatamente (se já logado) e também após page:change
    setTimeout(tryOpenFromURL, 1000);
    // ★ FIX 10 (Task 21): was `if(window.Bus)` — but Bus is declared with `const` in
    // app.min.js, so `window.Bus` is undefined. The check always failed, so tryOpenFromURL
    // was never re-run on page:change or user:ready. Use `typeof Bus !== 'undefined'`
    // (matches gdi-extras-loader.js line 121 pattern).
    if(typeof Bus !== 'undefined' && typeof Bus.onGlobal === 'function'){
      Bus.onGlobal('page:change', function(){
        setTimeout(tryOpenFromURL, 500);
      });
      Bus.onGlobal('user:ready', function(){
        setTimeout(tryOpenFromURL, 300);
      });
    }
  })();


  // ── Namespace exposure ──
  window.__gdiStudy.panel = {
    openPanel: openPanel,
    closePanel: closePanel,
    renderPanel: renderPanel,
    renderBody: renderBody,
    renderHome: renderHome,
    renderDrives: renderDrives,
    browseDriveInPanel: browseDriveInPanel,
    renderAchievements: renderAchievements,
    renderStats: renderStats,
    showOnboarding: showOnboarding,
    injectNavButton: injectNavButton,
    scheduleNavInject: scheduleNavInject,
    updateHeaderStats: updateHeaderStats,
    renderSidebarHTML: renderSidebarHTML,
    renderHeaderHTML: renderHeaderHTML
  };

  // ── Backward-compat alias (preserved from monolith) ──
  // window.__gdiOpenCentral is already assigned above (verbatim from monolith).
  // Re-assert via namespace indirection for consistency with other modules.
  window.__gdiOpenCentral = function(tab){ return window.__gdiStudy.panel.openPanel.apply(this, arguments); };

  console.log('[GDI Extras] M22 Área do Aluno (panel shell + home + drives + nav) ativo — modular (loads LAST)');
})();
