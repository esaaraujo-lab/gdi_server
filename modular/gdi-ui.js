// ═══════════════════════════════════════════════════════════════
// gdi-ui.js — UI/UX (modos de foco, pomodoro, playlist, etc.)
// 
// Módulos:
//   • M10: modos de foco (split, foco vídeo, foco material)
//   • M11: modo descanso (sleep)
//   • M12: pomodoro (botão na navbar)
//   • M13: card "Continuar" em cascata
//   • M14: progressos por módulo
//   • M16: PWA best-effort
//   • M18: painel de debug
//   • M19: título limpo da aba
//   • M20: playlist (sem observer loop)
//
// Depende de: gdi-core.js
// ═══════════════════════════════════════════════════════════════

// ═══ M10 v5: MODOS DE FOCO + BOTÃO ASSISTIDO ═══
(function(){
  if(!document.getElementById('gdi-focus-style')){
    const s=document.createElement('style');s.id='gdi-focus-style';s.textContent=`
body.gdi-fv .gdi-study-grid,body.gdi-fm .gdi-study-grid{grid-template-columns:1fr!important;}
body.gdi-fv .gdi-study-right{display:none!important;}
body.gdi-fm .gdi-study-left{display:none!important;}
body.gdi-fv .gdi-study-left{width:100%!important;max-width:100%!important;}
body.gdi-fv .gdi-player-wrap{width:100%!important;max-width:100%!important;}
body.gdi-fv .gdi-player-wrap video,
body.gdi-fv .gdi-player-wrap .plyr,
body.gdi-fv .gdi-player-wrap .plyr__video-wrapper,
body.gdi-fv .gdi-player-wrap .video-js,
body.gdi-fv .gdi-player-wrap .dplayer,
body.gdi-fv .gdi-player-wrap .dplayer-video-wrap,
body.gdi-fv .gdi-player-wrap .dplayer-video,
body.gdi-fv .gdi-player-wrap .jwplayer,
body.gdi-fv .gdi-player-wrap #player,
body.gdi-fv .gdi-player-wrap #vplayer,
body.gdi-fv .gdi-player-wrap #player-container,
body.gdi-fv .gdi-player-wrap iframe{
  width:100%!important;max-width:100%!important;max-height:none!important;
  margin-left:auto!important;margin-right:auto!important;display:block!important;}

/* ═══ FIX: Player em tela cheia sem barras pretas ═══ */
/* Corrige o bug onde o video em fullscreen ficava deslocado para cima
   e centralizado, deixando barras pretas embaixo e nas laterais.
   Causa: .gdi-player-wrap video { max-height:78vh } do app.min.js
   continuava ativo em :fullscreen. */
.gdi-player-wrap:fullscreen,
.gdi-player-wrap:-webkit-full-screen,
.gdi-player-wrap:-moz-full-screen,
.gdi-player-wrap:-ms-fullscreen {
  width:100vw!important; height:100vh!important; max-width:none!important;
  max-height:none!important; background:#000!important;
  border-radius:0!important; border:0!important; box-shadow:none!important;
  display:flex!important; align-items:center!important; justify-content:center!important;
  padding:0!important; margin:0!important; overflow:hidden!important;
}
.gdi-player-wrap:fullscreen video,
.gdi-player-wrap:-webkit-full-screen video,
.gdi-player-wrap:-moz-full-screen video,
.gdi-player-wrap:-ms-fullscreen video,
.gdi-player-wrap:fullscreen .plyr,
.gdi-player-wrap:-webkit-full-screen .plyr,
.gdi-player-wrap:fullscreen .plyr__video-wrapper,
.gdi-player-wrap:-webkit-full-screen .plyr__video-wrapper,
.gdi-player-wrap:fullscreen .video-js,
.gdi-player-wrap:-webkit-full-screen .video-js,
.gdi-player-wrap:fullscreen .dplayer,
.gdi-player-wrap:-webkit-full-screen .dplayer,
.gdi-player-wrap:fullscreen .dplayer-video-wrap,
.gdi-player-wrap:-webkit-full-screen .dplayer-video-wrap,
.gdi-player-wrap:fullscreen .dplayer-video,
.gdi-player-wrap:-webkit-full-screen .dplayer-video,
.gdi-player-wrap:fullscreen .jwplayer,
.gdi-player-wrap:-webkit-full-screen .jwplayer,
.gdi-player-wrap:fullscreen #player,
.gdi-player-wrap:-webkit-full-screen #player,
.gdi-player-wrap:fullscreen #vplayer,
.gdi-player-wrap:-webkit-full-screen #vplayer,
.gdi-player-wrap:fullscreen #player-container,
.gdi-player-wrap:-webkit-full-screen #player-container,
.gdi-player-wrap:fullscreen iframe,
.gdi-player-wrap:-webkit-full-screen iframe {
  width:100%!important; height:100%!important;
  max-width:none!important; max-height:none!important;
  object-fit:contain!important;
  margin:0 auto!important; padding:0!important;
  display:block!important; background:#000!important;
  border-radius:0!important; border:0!important;
}
.gdi-player-wrap:fullscreen video::-webkit-media-controls-overlay-enclosure,
.gdi-player-wrap:-webkit-full-screen video::-webkit-media-controls-overlay-enclosure { display:block!important; }
.gdi-player-wrap:fullscreen .plyr--full-ui input[type=range],
.gdi-player-wrap:-webkit-full-screen .plyr--full-ui input[type=range] { width:100%!important; }

/* ═══ FIX: SPLIT MODE (desktop) — vídeo preenche a largura, sem barras pretas ═══ */
/* Causa: em split mode (.gdi-study-grid 58fr/42fr), o player tem só 58% da largura.
   Um vídeo 16:9 a 58% de largura é bem mais baixo que 78vh, mas o wrap mantinha
   max-height:78vh (criado pelo app.min.js antigo), forçando o vídeo a ser letterboxed
   dentro do wrap (background:#000) — barras pretas enormes em cima/embaixo.
   Solução: o wrap tem aspect-ratio:16/9 (já definido no app.min.js) e o vídeo
   preenche 100% do wrap com object-fit:contain. Estas regras garantem que os
   wrappers de Plyr/video.js/DPlayer também preencham o wrap corretamente. */
.gdi-study-grid .gdi-player-wrap video,
.gdi-study-grid .gdi-player-wrap .plyr,
.gdi-study-grid .gdi-player-wrap .plyr__video-wrapper,
.gdi-study-grid .gdi-player-wrap .video-js,
.gdi-study-grid .gdi-player-wrap .vjs-tech,
.gdi-study-grid .gdi-player-wrap .dplayer,
.gdi-study-grid .gdi-player-wrap .dplayer-video-wrap,
.gdi-study-grid .gdi-player-wrap .dplayer-video,
.gdi-study-grid .gdi-player-wrap .jwplayer,
.gdi-study-grid .gdi-player-wrap .jw-video,
.gdi-study-grid .gdi-player-wrap #player,
.gdi-study-grid .gdi-player-wrap #vplayer,
.gdi-study-grid .gdi-player-wrap #player-container,
.gdi-study-grid .gdi-player-wrap iframe {
  max-height:none!important;
  height:100%!important;
  width:100%!important;
  object-fit:contain!important;
  display:block!important;
}
.gdi-study-grid .gdi-player-wrap {
  height:auto!important;
  aspect-ratio:16/9!important;
  max-height:none!important;
}
`;
    document.head.appendChild(s);
  }
  function isDone(){
    const key=window.gdiVideoKey?window.gdiVideoKey():window.location.pathname;
    let done=false;
    try{
      done=GDIUser.isWatched(key);
      if(!done&&window.gdiNormKey)done=GDIUser.isWatched(gdiNormKey(key));
      if(!done)done=GDIUser.isWatched(window.location.pathname);
    }catch(_){}
    return done;
  }
  function updBtn(){
    const wb=document.getElementById('gdi-watched-btn');
    if(!wb)return;
    const done=isDone();
    wb.classList.toggle('done',done);
    wb.innerHTML=done?'<i class="bi bi-eye-fill"></i><span>Assistida \u2713</span>':'<i class="bi bi-eye"></i><span>Assistido</span>';
  }
  function findLayout(){
    const study=document.getElementById('gdi-study');
    const wrap=document.querySelector('.gdi-player-wrap');
    if(study){
      const grid=study.querySelector('.gdi-study-grid');
      const left=(grid||study).querySelector('.gdi-study-left');
      const right=(grid||study).querySelector('.gdi-study-right');
      if(grid&&(left||right))return{grid,left,right};
    }
    const rightEl=document.getElementById('gdi-slot-right')||document.getElementById('gdi-mat-body');
    if(wrap&&rightEl&&rightEl!==wrap){
      let p=wrap.parentElement;
      while(p&&p!==document.body&&!p.contains(rightEl))p=p.parentElement;
      if(p&&p!==document.body&&p.contains(wrap)){
        const col=el=>{let n=el;while(n&&n.parentElement&&n.parentElement!==p)n=n.parentElement;return n;};
        return{grid:p,left:col(wrap),right:col(rightEl)};
      }
    }
    return{grid:null,left:null,right:null};
  }
  // ★FIX: registrados UMA vez no escopo do IIFE (antes: +3 handlers
  //       globais por página de vídeo, acumulando para sempre)
  Bus.onGlobal('watched:changed',updBtn);
  Bus.onGlobal('user:ready',updBtn);
  Bus.onGlobal('video:switched',()=>setTimeout(updBtn,150));
  window.GDI_MODULES.push({name:'focus-modes',init:function(){
    const study=document.getElementById('gdi-study');
    const wrap=document.querySelector('.gdi-player-wrap');
    if(!study&&!wrap)return;
    let slot=document.getElementById('gdi-slot-modes');
    let created=false;
    if(!slot){
      const host=study?study.querySelector('.gdi-study-left'):null;
      slot=document.createElement('div');
      slot.id='gdi-slot-modes';
      slot.style.cssText='display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:0 0 10px 0;';
      if(host)host.insertBefore(slot,host.firstChild);
      else if(wrap&&wrap.parentElement)wrap.parentElement.insertBefore(slot,wrap);
      else if(study)study.insertBefore(slot,study.firstChild);
      else return;
      created=true;
    }
    if(slot.dataset.m10)return;
    slot.dataset.m10='1';
    console.log('[GDI M10] v5 ativo \u2014 slot '+(created?'CRIADO pelo extras (o core n\u00e3o fornece)':'do core'));
    slot.innerHTML=`
      <button class="gdi-mode-btn" data-mode="split" title="Tela dividida (v\u00eddeo + material)"><i class="bi bi-layout-split"></i><span class="d-none d-md-inline">Dividido</span></button>
      <button class="gdi-mode-btn" data-mode="fv" title="Foco na aula (v\u00eddeo em largura total)"><i class="bi bi-lightning-charge-fill"></i><span class="d-none d-md-inline">Foco na aula</span></button>
      <button class="gdi-mode-btn" data-mode="fm" title="Foco no material (s\u00f3 PDF, zoom autom\u00e1tico)"><i class="bi bi-file-earmark-pdf-fill"></i><span class="d-none d-md-inline">Foco no material</span></button>
      <button class="gdi-watched-btn" id="gdi-watched-btn" title="Marcar esta aula como assistida"><i class="bi bi-eye"></i><span>Assistido</span></button>`;
    function zoom(){
      const z=document.body.classList.contains('gdi-fm')?'150':'100';
      const ifr=document.querySelector('#gdi-mat-body iframe');
      if(ifr){const base=ifr.src.split('#')[0];if(!base.endsWith('.html'))ifr.src=base+'#zoom='+z;}
    }
    function applyLayout(m){
      const{grid,left,right}=findLayout();
      if(grid){
        if(m==='fv'||m==='fm')grid.style.setProperty('grid-template-columns','1fr','important');
        else grid.style.removeProperty('grid-template-columns');
      }
      if(right){
        if(m==='fv')right.style.setProperty('display','none','important');
        else right.style.removeProperty('display');
      }
      if(left){
        if(m==='fm')left.style.setProperty('display','none','important');
        else left.style.removeProperty('display');
      }
    }
    function setMode(m){
      document.body.classList.toggle('gdi-fv',m==='fv');
      document.body.classList.toggle('gdi-fm',m==='fm');
      try{localStorage.setItem('gdi-study-mode',m)}catch(_){}
      slot.querySelectorAll('.gdi-mode-btn[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===m));
      applyLayout(m);
      if(m!=='fv')setTimeout(zoom,60);
    }
    slot.querySelectorAll('.gdi-mode-btn[data-mode]').forEach(b=>{
      b.addEventListener('click',()=>setMode(b.dataset.mode));
    });
    let saved='split';try{saved=localStorage.getItem('gdi-study-mode')||'split'}catch(_){}
    setMode(['fv','fm','split'].includes(saved)?saved:'split');
    const wb=document.getElementById('gdi-watched-btn');
    if(wb&&!wb.dataset.b){
      wb.dataset.b='1';
      wb.addEventListener('click',()=>{
        const done=isDone();
        if(done){window.gdiUnmarkVideo?gdiUnmarkVideo():GDIUser.unmarkWatched(window.location.pathname);}
        else{window.gdiMarkVideo?gdiMarkVideo():GDIUser.markWatched(window.location.pathname);}
        showToast(done?'Aula desmarcada':'Aula marcada como assistida \u2713');
      });
    }
    updBtn();
  }});
})();

// ═══ M11 v3.2: MODO DESCANSO — UI fora do body ═══
(function(){
  let btn=null,overlay=null,sleeping=false,bound=false,wakeGuard=0;
  const fsEl=()=>document.fullscreenElement||document.webkitFullscreenElement||null;
  const wrapEl=()=>document.querySelector('.gdi-player-wrap');
  const onAudioPage=()=>!!document.getElementById('aplayer-container');
  function ensureEls(){
    const needOv=!overlay||!overlay.isConnected;
    const needBt=!btn||!btn.isConnected;
    if(!needOv&&!needBt)return;
    if(needOv){
      overlay=document.createElement('div');
      overlay.id='gdi-sleep-overlay';
      overlay.style.cssText='position:fixed;inset:0;z-index:2147483000;background:#000;opacity:0;pointer-events:none;transition:opacity 2.5s ease;cursor:pointer;';
      overlay.title='Clique para sair do modo descanso';
      overlay.addEventListener('click',()=>exitSleep());
    }
    if(needBt){
      btn=document.createElement('button');
      btn.id='gdi-sleep-btn';
      btn.innerHTML='<i class="bi bi-moon-stars-fill"></i>';
      btn.title='Modo descanso (apenas \u00e1udio) \u2014 clique para ligar';
      btn.style.cssText='position:fixed;bottom:76px;left:16px;z-index:2147483001;background:rgba(18,18,28,0.92);border:1.5px solid rgba(255,255,255,0.25);border-radius:50%;width:40px;height:40px;color:#74c0fc;font-size:16px;cursor:pointer;display:none;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,0.5);';
      btn.addEventListener('click',e=>{e.stopPropagation();sleeping?exitSleep():enterSleep();});
    }
    if(!overlay.parentElement)GDI_ROOT().appendChild(overlay);
    if(!btn.parentElement)GDI_ROOT().appendChild(btn);
  }
  function enterSleep(){
    if(sleeping)return;
    sleeping=true;
    wakeGuard=Date.now()+2500;
    overlay.style.transition='opacity 2.5s ease';
    overlay.style.pointerEvents='all';
    overlay.style.opacity='0.97';
    btn.innerHTML='<i class="bi bi-sun-fill"></i>';
    btn.style.color='#ffd43b';
    btn.title='Sair do modo descanso';
  }
  function exitSleep(){
    if(!sleeping)return;
    sleeping=false;
    overlay.style.transition='opacity .5s ease';
    overlay.style.opacity='0';
    overlay.style.pointerEvents='none';
    btn.innerHTML='<i class="bi bi-moon-stars-fill"></i>';
    btn.style.color='#74c0fc';
    btn.title='Modo descanso (apenas \u00e1udio) \u2014 clique para ligar';
  }
  function syncFs(){
    ensureEls();
    const fs=fsEl();
    const wrap=wrapEl();
    const video=!!wrap,audio=onAudioPage();
    if(!video&&!audio){btn.style.display='none';if(sleeping)exitSleep();return;}
    let fsOk=false;
    if(fs&&fs.tagName!=='VIDEO'){
      if(!video)fsOk=true;
      else fsOk=fs===document.documentElement||fs===document.body||fs===wrap||fs.contains(wrap)||wrap.contains(fs);
    }
    const host=fsOk?fs:GDI_ROOT();
    if(btn.parentElement!==host)host.appendChild(btn);
    if(overlay.parentElement!==host)host.appendChild(overlay);
    btn.style.display=(video&&!fsOk)?'none':'flex';
    if(sleeping&&video&&!fsOk)exitSleep();
  }
  function bindOnce(){
    if(bound)return;bound=true;
    document.addEventListener('fullscreenchange',syncFs);
    document.addEventListener('webkitfullscreenchange',syncFs);
    ['mousemove','mousedown','keydown','touchstart'].forEach(ev=>{
      document.addEventListener(ev,e=>{
        if(!sleeping||Date.now()<wakeGuard)return;
        if(ev!=='mousemove'&&e.target&&btn&&(e.target===btn||btn.contains(e.target)))return;
        exitSleep();
      },{passive:true});
    });
    Bus.onGlobal('media:ready',({type,el})=>{
      if(type==='video'&&el&&!el.__gdiSleepEnd){
        el.__gdiSleepEnd=true;
        try{el.addEventListener('ended',()=>exitSleep());}catch(_){}
      }
    });
  }
  window.GDI_MODULES.push({name:'sleep-mode',init:function(){
    ensureEls();bindOnce();syncFs();
  }});
  console.log('[GDI M11] v3.2 descanso registrado');
})();

// ═══ M12: POMODORO v2.6 (botão na navbar + tema Ferreto) ═══
(function(){
  window.GDI_MODULES.push({name:'pomodoro',init:function(){
    if(window.__gdiPomodoroBooted)return;
    window.__gdiPomodoroBooted=true;
    const $id=x=>document.getElementById(x);
    const fmt=s=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(Math.floor(s%60)).padStart(2,'0');
    const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
    const safeParse=s=>{try{return JSON.parse(s)}catch(e){return null}};
    const flashEl=document.createElement('div');flashEl.id='gdi-pom-flash';
    GDI_ROOT().appendChild(flashEl);

    // ★ Pomodoro agora é botão na navbar (como Central de Estudos)
    function injectPomNav(){
      const oldFab=document.getElementById('gdi-pom-root');
      if(oldFab)oldFab.remove();
      const actions=document.querySelector('.gdi-nav-actions');
      if(!actions)return false;
      if(actions.querySelector('#gdi-pom-nav'))return true;
      const wrap=document.createElement('div');
      wrap.id='gdi-pom-nav';
      wrap.innerHTML=`
        <button id="gdi-pom-nav-btn" title="Pomodoro (estudos focados)">
          <span class="gdi-pom-nav-ico">🍅</span>
          <span class="gdi-pom-nav-time" id="gdi-pom-nav-time">25:00</span>
        </button>
        <div id="gdi-pom-panel">
          <div class="gdi-pom-phase-label" id="gdi-pom-phase-label">🍅 Foco</div>
          <div id="gdi-pom-display">25:00</div>
          <div id="gdi-pom-progress"><div id="gdi-pom-progress-bar"></div></div>
          <div id="gdi-pom-sessions-dots"></div>
          <div id="gdi-pom-btns">
            <button class="gdi-pom-btn" id="gdi-pom-start">▶ Iniciar</button>
            <button class="gdi-pom-btn" id="gdi-pom-skip" title="Pular fase">⏭</button>
            <button class="gdi-pom-btn" id="gdi-pom-reset" title="Zerar">↺</button>
          </div>
          <div id="gdi-pom-divider"></div>
          <div id="gdi-pom-cfg">
            <div class="gdi-pom-cfg-row"><span>🍅 Foco (min)</span><input id="gdi-pom-c-work" type="number" min="1" max="90" value="25"></div>
            <div class="gdi-pom-cfg-row"><span>☕ Pausa curta</span><input id="gdi-pom-c-short" type="number" min="1" max="30" value="5"></div>
            <div class="gdi-pom-cfg-row"><span>🛋 Pausa longa</span><input id="gdi-pom-c-long" type="number" min="1" max="60" value="15"></div>
            <div class="gdi-pom-cfg-row"><span>🔁 Sessões p/ longa</span><input id="gdi-pom-c-sess" type="number" min="1" max="10" value="4"></div>
            <label class="gdi-pom-switch"><span>▶ Auto-iniciar próxima fase</span><input id="gdi-pom-c-auto" type="checkbox" checked></label>
          </div>
        </div>`;
      // insere antes do botão de tema
      const themeBtn=document.getElementById('theme-toggle');
      if(themeBtn)actions.insertBefore(wrap,themeBtn);
      else actions.appendChild(wrap);
      return true;
    }
    // tenta injetar com retries (igual Central de Estudos)
    injectPomNav();
    for(let i=1;i<=10;i++)setTimeout(injectPomNav,i*300);
    Bus.onGlobal('page:change',()=>setTimeout(injectPomNav,100));
    window.GDI_MODULES=window.GDI_MODULES||[];
    window.GDI_MODULES.push({name:'pom-nav',init:function(){injectPomNav();}});

    const CKEY='gdi-pom-cfg-v2',SKEY='gdi-pom-state-v2';
    let cfg=Object.assign({work:25,short:5,long:15,sessions:4,autoStart:true},safeParse(localStorage.getItem(CKEY))||{});
    let st={phase:'work',total:cfg.work*60,remain:cfg.work*60,dots:0,running:false,endAt:0};
    let timer=null,lastWarn=-1,panelOpen=false,baseTitle=document.title,dotsCache='';
    function check(){
      const has=!!(document.querySelector('video,audio')||window._gdiAPlayer);
      const nav=$id('gdi-pom-nav');
      if(nav)nav.style.display=has?'':'none';
      if(!has&&panelOpen){panelOpen=false;$id('gdi-pom-panel')?.classList.remove('open');}
    }
    function refreshBase(){baseTitle=document.title.replace(/^\d\d:\d\d \S+ \u00b7 /,'');if(st.running)updateUI();}
    Bus.onGlobal('media:ready',()=>setTimeout(check,50));
    Bus.onGlobal('page:change',()=>{setTimeout(check,30);setTimeout(refreshBase,60);});
    Bus.onGlobal('title:change',()=>setTimeout(refreshBase,30));
    function persist(){try{localStorage.setItem(SKEY,JSON.stringify({phase:st.phase,total:st.total,remain:st.remain,running:st.running,dots:st.dots,endAt:st.endAt}))}catch(e){}}
    (function(){const s=safeParse(localStorage.getItem(SKEY));if(!s)return;
      st.phase=s.phase||'work';st.dots=s.dots||0;st.total=s.total||st.total;
      st.remain=(s.remain!=null&&s.remain>0)?s.remain:st.total;st.running=false;st.endAt=0;})();
    let actx=null;
    function beep(f,dur,type,vol){dur=dur||.3;type=type||'sine';vol=vol==null?.35:vol;
      try{actx=actx||new(window.AudioContext||window.webkitAudioContext)();
        if(actx.state==='suspended')actx.resume();
        const o=actx.createOscillator(),g=actx.createGain();
        o.connect(g);g.connect(actx.destination);
        o.type=type;o.frequency.value=f;
        g.gain.setValueAtTime(vol,actx.currentTime);
        g.gain.exponentialRampToValueAtTime(.0001,actx.currentTime+dur);
        o.start();o.stop(actx.currentTime+dur);}catch(e){}}
    function alarm(isBreak){const notes=isBreak?[660,880,1100]:[1100,880,660];
      notes.forEach((f,i)=>setTimeout(()=>beep(f,.4,'sine',.5),i*300));
      setTimeout(()=>notes.forEach((f,i)=>setTimeout(()=>beep(f,.3,'sine',.35),i*280)),1100);}
    function flash(c){flashEl.style.background=c;flashEl.style.opacity='.4';setTimeout(()=>{flashEl.style.opacity='0'},600);}
    function notify(t,b){if(!('Notification' in window))return;
      if(Notification.permission==='granted'){try{new Notification(t,{body:b})}catch(e){}}
      else if(Notification.permission==='default')Notification.requestPermission();}
    function info(){
      if(st.phase==='work')return{label:'🍅 Foco',c:'var(--ferreto-primary,#ff8b9f)',fl:'rgba(255,139,159,.2)'};
      if(st.phase==='short')return{label:'☕ Pausa',c:'#3fb950',fl:'rgba(63,185,80,.2)'};
      return{label:'🛋 Pausa longa',c:'#7048e8',fl:'rgba(112,72,232,.2)'};}
    function dots(){
      const key=st.dots+'/'+cfg.sessions;if(key===dotsCache)return;dotsCache=key;
      const inC=st.dots%cfg.sessions;
      const lit=st.dots>0&&inC===0?cfg.sessions:inC;
      let h='';for(let i=0;i<cfg.sessions;i++)h+='<div class="gdi-pom-dot'+(i<lit?' done':'')+'"></div>';
      const el=$id('gdi-pom-sessions-dots');if(el)el.innerHTML=h;}
    function updateUI(){
      const d=info(),time=fmt(st.remain),warn=st.running&&st.remain<=10&&st.remain>0;
      const pct=st.total?st.remain/st.total*100:0;
      const disp=$id('gdi-pom-display');
      if(disp){disp.textContent=time;disp.style.color=warn?'#ff6b6b':'var(--ferreto-text,#f0f6fc)';}
      // atualiza tempo no botão da navbar
      const navTime=$id('gdi-pom-nav-time');
      if(navTime){navTime.textContent=time;navTime.style.color=warn?'#ff6b6b':'var(--ferreto-primary,#ff8b9f)';}
      const lab=$id('gdi-pom-phase-label');
      if(lab){lab.textContent=d.label;lab.style.color=d.c;}
      const bar=$id('gdi-pom-progress-bar');
      if(bar){bar.style.width=pct+'%';bar.style.background=warn?'#ff6b6b':d.c;}
      const btn=$id('gdi-pom-start');
      if(btn)btn.textContent=st.running?'⏸ Pausar':'▶ '+(st.remain<st.total?'Continuar':'Iniciar');
      dots();
      if(st.running){
        if(!/^\d\d:\d\d \S+ \u00b7 /.test(document.title))baseTitle=document.title;
        const emoji=st.phase==='work'?'🍅':st.phase==='short'?'☕':'🛋';
        document.title=fmt(st.remain)+' '+emoji+' \u00b7 '+baseTitle;
      }}
    function startLoop(){clearInterval(timer);st.running=true;
      timer=setInterval(()=>{st.remain=Math.max(0,Math.round((st.endAt-Date.now())/1000));
        if(st.remain<=0){next();return;}
        if(st.remain<=10&&st.remain!==lastWarn){lastWarn=st.remain;beep(880+(10-st.remain)*20,.12,'square',.3);}
        updateUI();},250);
      lastWarn=-1;updateUI();}
    function start(){st.endAt=Date.now()+st.remain*1000;persist();startLoop();}
    function pause(){clearInterval(timer);timer=null;st.running=false;
      document.title=document.title.replace(/^\d\d:\d\d \S+ \u00b7 /,'');persist();updateUI();}
    function reset(){pause();st.phase='work';st.dots=0;st.total=cfg.work*60;st.remain=st.total;st.endAt=0;dotsCache='';persist();updateUI();}
    function next(){clearInterval(timer);timer=null;st.running=false;
      if(st.phase==='work'){st.dots++;const long=st.dots%cfg.sessions===0;
        st.phase=long?'long':'short';st.total=(long?cfg.long:cfg.short)*60;
        flash(info().fl);alarm(true);
        notify(long?'Pausa longa! 🛋':'Pausa! ☕',fmt(st.total)+' de descanso. Você merece!');
      }else{
        if(st.phase==='long'){st.dots=0;dotsCache='';}
        st.phase='work';st.total=cfg.work*60;
        flash(info().fl);alarm(false);
        notify('Hora de focar! 🍅',cfg.work+' minutos de concentração.');}
      st.remain=st.total;
      if(cfg.autoStart){st.endAt=Date.now()+st.total*1000;persist();startLoop();}
      else{persist();updateUI();}}
    // ★ click handler: botão da navbar abre/fecha painel
    function bindPomClicks(){
      const navBtn=$id('gdi-pom-nav-btn');
      if(navBtn&&!navBtn.__pomBound){
        navBtn.__pomBound=true;
        navBtn.addEventListener('click',e=>{e.stopPropagation();panelOpen=!panelOpen;$id('gdi-pom-panel')?.classList.toggle('open',panelOpen);if(panelOpen)updateUI();});
      }
      // fecha painel ao clicar fora
      const nav=$id('gdi-pom-nav');
      if(nav&&!nav.__pomDocBound){
        nav.__pomDocBound=true;
        document.addEventListener('click',e=>{if(panelOpen&&!nav.contains(e.target)){panelOpen=false;$id('gdi-pom-panel')?.classList.remove('open');}},{capture:true});
      }
      const startBtn=$id('gdi-pom-start'),skipBtn=$id('gdi-pom-skip'),resetBtn=$id('gdi-pom-reset');
      if(startBtn&&!startBtn.__pomBound){startBtn.__pomBound=true;startBtn.addEventListener('click',e=>{e.stopPropagation();st.running?pause():start();});}
      if(skipBtn&&!skipBtn.__pomBound){skipBtn.__pomBound=true;skipBtn.addEventListener('click',e=>{e.stopPropagation();next();});}
      if(resetBtn&&!resetBtn.__pomBound){resetBtn.__pomBound=true;resetBtn.addEventListener('click',e=>{e.stopPropagation();reset();});}
      // config inputs
      ['gdi-pom-c-work','gdi-pom-c-short','gdi-pom-c-long','gdi-pom-c-sess'].forEach(id=>{
        const el=$id(id);
        if(el&&!el.__pomBound){
          el.__pomBound=true;
          el.addEventListener('change',()=>{
            cfg.work=clamp(parseInt($id('gdi-pom-c-work').value)||25,1,90);
            cfg.short=clamp(parseInt($id('gdi-pom-c-short').value)||5,1,30);
            cfg.long=clamp(parseInt($id('gdi-pom-c-long').value)||15,1,60);
            cfg.sessions=clamp(parseInt($id('gdi-pom-c-sess').value)||4,1,10);
            try{localStorage.setItem(CKEY,JSON.stringify(cfg));}catch(_){showToast('Erro ao salvar config');}
            if($id('gdi-pom-c-work'))$id('gdi-pom-c-work').value=cfg.work;
            if($id('gdi-pom-c-short'))$id('gdi-pom-c-short').value=cfg.short;
            if($id('gdi-pom-c-long'))$id('gdi-pom-c-long').value=cfg.long;
            if($id('gdi-pom-c-sess'))$id('gdi-pom-c-sess').value=cfg.sessions;
            if(!st.running){st.phase='work';st.dots=0;dotsCache='';st.total=cfg.work*60;st.remain=st.total;persist();updateUI();}
          });
        }
      });
      const autoChk=$id('gdi-pom-c-auto');
      if(autoChk&&!autoChk.__pomBound){autoChk.__pomBound=true;autoChk.addEventListener('change',e=>{cfg.autoStart=e.target.checked;try{localStorage.setItem(CKEY,JSON.stringify(cfg));}catch(_){}});}
    }
    // binda imediatamente + após injetar
    setTimeout(bindPomClicks,50);
    setTimeout(bindPomClicks,500);
    setTimeout(bindPomClicks,1500);
    Bus.onGlobal('page:change',()=>setTimeout(bindPomClicks,200));
    updateUI();
    console.log('[GDI Pomodoro] v2.5 pronto');
  }});
})();

// ═══ M13 v19.6: CARD "CONTINUAR" EM CASCATA ═══
(function(){
  // ★FIX: guarda contra registro duplo caso o script seja reexecutado
  if(window.__GDI_M13__)return;
  window.__GDI_M13__=true;
  const DBG=true;
  const log=(...a)=>{if(DBG)try{console.log('[GDI M13]',...a)}catch(_){}};
  function stripExt(s){return String(s||'').replace(/\.[a-z0-9]{1,5}$/i,'').trim()}
  const GENERIC_WORDS=/^(aula|aulas|v\u00eddeo|videos?|li[cç][aã]o|li[cç][oõ]es|lesson|lessons|class|classes|modulo|m\u00f3dulo|module|modulos|m\u00f3dulos|modules|parte|partes|pt|cap|caps|capitulo|cap\u00edtulo|ext|ep|eps|episodio|epis\u00f3dio|live|revisao|revis\u00e3o|arquivo|file)$/i;
  function isGenericName(raw){
    const n=stripExt(raw).toLowerCase();
    if(!n)return true;
    const reduced=n.replace(/[\s\-_.:,;|()/\\]+/g,' ').split(' ')
      .filter(w=>w&&!/^\d+$/.test(w)&&!GENERIC_WORDS.test(w)&&!GENERIC_WORDS.test(w.replace(/\d+$/,'')))
      .join('');
    return reduced.length===0;
  }
  function realNameOf(path){
    const seg=normPath(path).split('/').filter(Boolean);
    let name=stripExt(seg[seg.length-1]||'');
    if(isGenericName(name)){
      for(let j=seg.length-2;j>=0;j--){
        if(/^\d+:$/.test(seg[j]))break;
        if(!isGenericName(seg[j])){name=stripExt(seg[j]);break;}
      }
    }
    return name||'Aula';
  }
  let rescue=null,rescueAt=0,rescueInFlight=false;
  function ensureRescue(force){
    // ★FIX: guard in-flight — se já há um fetch em andamento, não dispara outro.
    // Era a causa do loop: 5 chamadas rápidas → 5 fetchs paralelos a /userstate.
    if(rescueInFlight)return;
    if(!force&&rescue&&Date.now()-rescueAt<60000)return;
    rescueInFlight=true;
    fetch('/userstate',{credentials:'same-origin'})
      .then(r=>r.ok?r.json():null)
      .then(j=>{
        rescueInFlight=false;
        if(j&&typeof j==='object'){
          rescue=j;rescueAt=Date.now();
          log('estado obtido do /userstate \u2014 resume:',Object.keys(j.resume||{}).length,'| history:',(j.history||[]).length);
          setTimeout(continueCardInit,30);
        }
      })
      .catch(e=>{rescueInFlight=false;log('falha no /userstate:',e);});
  }
  function stateD(){
    try{
      if(window.GDIUser&&GDIUser.loaded()){const d=GDIUser.dump();if(d)return d;}
    }catch(_){}
    if(rescue)return rescue;
    try{
      if(window.GDIUser){const d=GDIUser.dump();if(d&&Object.keys(d).length)return d;}
    }catch(_){}
    return null;
  }
  function authIn(){
    try{if(window.GDIUser&&typeof GDIUser.auth==='function')return GDIUser.auth()!=='out';}catch(_){}
    return true;
  }
  function getResumeOf(d,key){
    try{
      if(window.GDIUser&&GDIUser.loaded()&&typeof GDIUser.getResume==='function'){
        const r=GDIUser.getResume(key);if(r)return r;
      }
    }catch(_){}
    return (d&&d.resume&&d.resume[key])||null;
  }
  function resumeKeyFor(path){
    const p=String(path||'');
    if(p.indexOf('/fallback?')===0){
      try{return '/fallback::'+(new URLSearchParams(p.split('?')[1]||'').get('id')||'')}catch(_){return ''}
    }
    return p.split('?')[0];
  }
  function normPath(p){
    try{return decodeURIComponent(String(p||'').split('?')[0].replace(/\/+$/,''))}catch(_){return String(p||'').split('?')[0].replace(/\/+$/,'')}
  }
  function low(p){return normPath(p).toLowerCase()}
  function okPath(x){
    try{
      if(typeof window.gdiOkPath!=='function')return true;
      return !!window.gdiOkPath(x);
    }catch(_){return true}
  }
  function subtreePrefix(){
    const cur=low(window.location.pathname);
    if(cur==='')return'';
    const m=/^\/(\d+):$/.exec(cur);
    if(m)return'/'+m[1]+':';
    return cur;
  }
  function inSubtree(path){
    const pre=subtreePrefix();
    if(pre==='')return true;
    const lp=low(path);
    return lp.indexOf(pre+'/')===0||lp===pre;
  }
  function playerHref(p){
    const s=String(p||'');
    if(!s||s.indexOf('/fallback')===0)return'';
    return s.includes('?')?s+'&a=view':s+'?a=view';
  }
  async function safeGo(ev){
    const a=ev.currentTarget;
    const href=a.getAttribute('href')||'';
    if(!href||!href.startsWith('/'))return;
    ev.preventDefault();
    try{
      const r=await fetch(href,{method:'HEAD',redirect:'manual',credentials:'same-origin'});
      if(r.status>=300&&r.status<400){
        const loc=(r.headers.get('location')||'')+' '+(r.url||'');
        if(/login/i.test(loc)){showToast('Sess\u00e3o expirada \u2014 entre para retomar');location.href='/login';return;}
      }
    }catch(_){}
    location.href=href;
  }
  function nameInfo(target){
    const cur=normPath(window.location.pathname);
    const isDriveRoot=/^\/\d+:$/.test(cur);
    const tNorm=normPath(target);
    let rest=tNorm;
    if(!isDriveRoot&&tNorm.indexOf(cur+'/')===0)rest=tNorm.slice(cur.length+1);
    const seg=rest.split('/').filter(Boolean);
    if(isDriveRoot&&/^\d+:$/.test(seg[0]||''))seg.shift();
    if(seg.length&&/^\d+:$/.test(seg[0])){
      const dn=(window.drive_names||[])[parseInt(seg[0],10)];
      if(dn)seg[0]=dn;
    }
    let src=seg.length-1;
    let name=stripExt(seg[src]||'');
    if(isGenericName(name)){
      for(let j=seg.length-2;j>=0;j--){
        if(/^\d+:$/.test(seg[j]))break;
        if(!isGenericName(seg[j])){src=j;name=stripExt(seg[j]);break;}
      }
    }
    const folder=src>0?seg[src-1]:'';
    let drivePart='';
    if(isDriveRoot&&window.drive_names&&window.drive_names[window.current_drive_order])drivePart=window.drive_names[window.current_drive_order];
    return{name:name||'Aula',folder,drive:drivePart};
  }
  function srsDueCount(){
    const d=stateD();if(!d)return 0;
    const now=Date.now();let n=0;
    for(const k in(d.notes||{})){
      (d.notes[k]||[]).forEach(x=>{
        const id=k+'|'+x.at;
        const e=d.srs&&d.srs[id];
        const due=e?e.due:(x.at+86400000);
        if(due<=now)n++;
      });
    }
    return n;
  }
  function srsOpen(){
    const old=document.getElementById('gdi-srs-panel');
    if(old){old.remove();return;}
    const d=stateD()||{};
    const now=Date.now();
    const due=[];
    for(const k in(d.notes||{})){
      (d.notes[k]||[]).forEach(x=>{
        const id=k+'|'+x.at;
        const e=d.srs&&d.srs[id];
        const t=e?e.due:(x.at+86400000);
        if(t<=now)due.push({id,key:k,at:x.at,text:x.text,t:x.t,due:t});
      });
    }
    due.sort((a,b)=>a.due-b.due);
    const ov=document.createElement('div');ov.id='gdi-srs-panel';
    ov.style.cssText='position:fixed;inset:0;z-index:10002;background:rgba(5,7,10,.82);display:flex;align-items:center;justify-content:center;padding:20px;';
    GDI_ROOT().appendChild(ov);
    let idx=0;
    function render(){
      if(idx>=due.length){
        ov.innerHTML='<div style="background:var(--ferreto-surface,#161b22);border:1px solid var(--ferreto-border,#30363d);border-radius:16px;padding:34px;max-width:480px;text-align:center;color:var(--ferreto-text,#e6edf3);font-family:system-ui;"><div style="font-size:40px;">\ud83c\udf89</div><h3 style="margin:8px 0">Revis\u00e3o conclu\u00edda!</h3><p style="color:var(--ferreto-text-muted,#8b949e);font-size:13px">As anota\u00e7\u00f5es voltam em 1, 7 e 30 dias at\u00e9 ficarem graduadas.</p><br><button class="gdi-mode-btn" id="gdi-srs-close">Fechar</button></div>';
        document.getElementById('gdi-srs-close').addEventListener('click',()=>ov.remove());
        return;
      }
      const n=due[idx];
      let lbl='Aula';try{lbl=decodeURIComponent(String(n.key).split('?')[0].split('/').filter(Boolean).pop()||'Aula').replace(/\.[a-z0-9]+$/i,'')}catch(_){}
      ov.innerHTML=`<div style="background:var(--ferreto-surface,#161b22);border:1px solid var(--ferreto-border,#30363d);border-radius:16px;padding:22px;max-width:540px;width:100%;color:var(--ferreto-text,#e6edf3);font-family:system-ui;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span style="font-size:11px;color:var(--ferreto-text-muted,#8b949e);text-transform:uppercase;">\ud83e\uddd0 Revis\u00e3o ${idx+1} de ${due.length}</span>
          <button class="gdi-mode-btn" id="gdi-srs-close" style="padding:2px 8px;font-size:11px;">\u2715</button>
        </div>
        <div style="font-size:12px;color:var(--ferreto-secondary,#7aa2ff);margin-bottom:4px;">${escHtml(realNameOf(n.key))}${n.t!=null?' \u00b7 '+gdiFmtTime(n.t):''}</div>
        <div style="font-size:15px;line-height:1.5;margin-bottom:16px;">${escHtml(n.text)}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button id="gdi-srs-good" class="gdi-btn gdi-btn-primary"><i class="bi bi-check2"></i> Lembrei</button>
          <button id="gdi-srs-again" class="gdi-mode-btn"><i class="bi bi-arrow-repeat"></i> N\u00e3o lembrei</button>
          <a class="gdi-mode-btn" data-gdi-go href="${escHtml(playerHref(n.key))}"><i class="bi bi-play-fill"></i> Abrir aula</a>
        </div></div>`;
      document.getElementById('gdi-srs-close').addEventListener('click',()=>ov.remove());
      document.getElementById('gdi-srs-good').addEventListener('click',()=>{try{GDIUser.srsGrade(n.id,true)}catch(_){}idx++;render();});
      document.getElementById('gdi-srs-again').addEventListener('click',()=>{try{GDIUser.srsGrade(n.id,false)}catch(_){}idx++;render();});
      ov.querySelectorAll('[data-gdi-go]').forEach(a=>a.addEventListener('click',safeGo));
    }
    render();
  }
  function ghostScore(path){
    const seg=normPath(path).split('/').filter(Boolean);
    if(seg.length<2)return 0;
    return seg[seg.length-1].indexOf(seg[seg.length-2]+' - ')===0?1:0;
  }
  function pickCandidates(){
    const d=stateD();if(!d)return[];
    const seen=new Set(),out=[];
    const add=(k,at)=>{
      if(!k)return;
      const key=normPath(k);
      if(seen.has(key)||!inSubtree(k)||!okPath(k))return;
      seen.add(key);
      out.push({path:String(k).split('?')[0],at:Number(at)||0});
    };
    if(d.watched)for(const k in d.watched)add(k,d.watched[k]&&d.watched[k].at);
    if(d.resume)for(const k in d.resume)add(k,d.resume[k]&&d.resume[k].at);
    if(d.last&&d.last.path)add(d.last.path,d.last.at);
    (Array.isArray(d.history)?d.history:[]).forEach(h=>{if(h&&h.path)add(h.path,h.at)});
    out.sort((a,b)=>(ghostScore(a.path)-ghostScore(b.path))||(b.at-a.at));
    return out;
  }
  const vCache=new Map();
  function verify(path){
    if(vCache.has(path))return Promise.resolve(vCache.get(path));
    // ★ Task 17b: usa GET em vez de POST — POST em URL de arquivo (video.mp4)
    // retorna 404 e polui o console. GET funciona pra pastas E arquivos.
    // O cache 'no-store' evita cache de HEAD/GET de verificação.
    const pr=fetch(path,{method:'GET',credentials:'same-origin',cache:'no-store'})
      .then(r=>{
        // 200-299 = existe; 3xx = redirect (também existe); 404 = não existe
        const ok = r.ok || (r.status >= 300 && r.status < 400);
        vCache.set(path,ok);
        return ok;
      })
      .catch(()=>{vCache.set(path,true);return true});  // erro de rede = assume que existe
    vCache.set(path,pr);
    return pr;
  }
  async function bestTarget(){
    const cands=pickCandidates();
    for(const c of cands.slice(0,4)){
      if(await verify(c.path))return c.path;
    }
    return null;
  }
  function dbg(){
    const d=stateD();
    return{
      url:window.location.pathname,
      subarvore:subtreePrefix()||'(tudo)',
      gdiUserCarregado:!!(window.GDIUser&&GDIUser.loaded&&GDIUser.loaded()),
      fonteDados:(window.GDIUser&&GDIUser.loaded())?'GDIUser':(rescue?'resgate /userstate':'nenhuma'),
      candidatos:pickCandidates().slice(0,3).map(c=>c.path),
      history:Array.isArray(d&&d.history)?d.history.length:0
    };
  }
  window.gdiM13Debug=function(){const x=dbg();console.log('[GDI M13] diagnóstico:',x);return x;};
  let rendering=false;
  async function continueCardInit(){
    if(rendering)return;
    const d0=stateD();
    if(!d0){
      ensureRescue();
      // ★FIX: retry reduzido (5× com backoff 1s/2s/3s/5s/8s) — era 12× 750ms.
      const n=(continueCardInit.__n=(continueCardInit.__n||0)+1);
      if(n<=5)setTimeout(continueCardInit,[1000,2000,3000,5000,8000][n-1]||8000);
      return;
    }
    continueCardInit.__n=0;
    rendering=true;
    try{await renderCard(d0);}
    catch(e){log('erro no render:',e)}
    finally{rendering=false;}
  }
  async function renderCard(d){
    if(document.querySelector('#content .gdi-study'))return;
    const target=await bestTarget();
    if(document.querySelector('#content .gdi-study'))return;
    const host=document.querySelector('#content .gdi-wrap')||document.getElementById('content');
    if(!host)return;
    const p=window.location.pathname;
    const isHome=p==='/'||/^\/\d+:\/?$/.test(p);
    const days=new Set();
    const addDay=ts=>{if(ts)days.add(new Date(ts).toDateString())};
    for(const k in d.watched)addDay(d.watched[k]&&d.watched[k].at);
    for(const k in d.resume)addDay(d.resume[k]&&d.resume[k].at);
    if(d.last)addDay(d.last.at);
    for(const k in d.notes)(d.notes[k]||[]).forEach(n=>addDay(n.at));
    let streak=0;const day=new Date();
    const has=dt=>days.has(dt.toDateString());
    if(!has(day))day.setDate(day.getDate()-1);
    while(has(day)){streak++;day.setDate(day.getDate()-1);}
    let hours=0;
    for(const k in d.resume){const r=d.resume[k]||{};hours+=Math.min(r.t||0,(r.d>0?r.d:r.t)||0)}
    hours/=3600;
    const due=srsDueCount();
    const hMap=new Map();
    (Array.isArray(d.history)?d.history:[]).forEach(h=>{
      if(!h||!h.path||h.path===p||!inSubtree(h.path)||!okPath(h.path))return;
      const k=normPath(h.path);
      const prev=hMap.get(k);
      if(!prev||(Number(h.at)||0)>=(Number(prev.at)||0))hMap.set(k,h);
    });
    const hist=[...hMap.values()].sort((a,b)=>(Number(b.at)||0)-(Number(a.at)||0)).slice(0,6);
    const chips=hist.map(h=>({h,label:realNameOf(h.path)}));
    const cc={};
    chips.forEach(c=>{cc[c.label]=(cc[c.label]||0)+1});
    chips.forEach(c=>{if(cc[c.label]>1)c.label=(c.label+' \u00b7 '+stripExt(c.h.name||'')).slice(0,30)});
    if(!target&&!streak&&!hours&&!hist.length&&!due){
      const old0=document.getElementById('gdi-home-card');
      if(old0)old0.remove();
      log('sem dados utiliz\u00e1veis nesta sub\u00e1rvore \u2014 card oculto',dbg());
      return;
    }
    const lbl=target?nameInfo(target):null;
    const rKey=target?resumeKeyFor(target):'';
    const r=target?getResumeOf(d,rKey):null;
    const canSrs=!!(window.GDIUser&&typeof GDIUser.srsGrade==='function');
    const sig=String(target)+'|'+hist.map(h=>normPath(h.path)).join(',')+'|'+due+'|'+streak;
    const old=document.getElementById('gdi-home-card');
    if(old&&continueCardInit.__sig===sig)return;
    continueCardInit.__sig=sig;
    if(old)old.remove();
    const btn=target?`<a class="gdi-btn gdi-btn-primary" data-gdi-go href="${escHtml(playerHref(target))}"><i class="bi bi-play-fill"></i> Retomar</a>`:'';
    let html='<div id="gdi-home-card" class="gdi-panel" style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;padding:12px 16px;margin-bottom:14px;">';
    if(target){
      let head;
      if(lbl.drive)head='Continuar em '+lbl.drive+(lbl.folder?' \u2192 '+lbl.folder:'');
      else if(lbl.folder)head='Continuar em '+lbl.folder;
      else head='Continuar';
      const sub=r?('parou em '+gdiFmtTime(r.t)):'sem posi\u00e7\u00e3o salva';
      html+=`<div style="display:flex;align-items:center;gap:12px;min-width:0;flex:1;">
        <i class="bi bi-play-circle-fill" style="font-size:30px;color:var(--ferreto-primary,#7aa2ff);"></i>
        <div style="min-width:0;">
          <div style="font-size:11px;color:var(--ferreto-text-muted,#8b949e);text-transform:uppercase;letter-spacing:.06em;">${escHtml(head)}</div>
          <div style="font-weight:600;color:var(--ferreto-text,#f0f6fc);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(lbl.name)}</div>
          <div style="font-size:12px;color:var(--ferreto-text-muted,#8b949e);">${escHtml(sub)}</div>
        </div></div>${btn}`;
    }
    if(isHome){
      html+=`<div style="display:flex;gap:16px;font-size:12px;color:var(--ferreto-text-muted,#8b949e);flex-wrap:wrap;">
        ${streak>0?`<span><i class="bi bi-fire" style="color:#ff922b;"></i> ${streak} dia${streak>1?'s':''} seguidos</span>`:''}
        ${hours>0?`<span><i class="bi bi-clock-history"></i> \u2248 ${String(hours.toFixed(1)).replace('.',',')}h assistidas</span>`:''}
      </div>`;
      if(due>0&&canSrs)html+=`<div style="flex-basis:100%;margin-top:2px;"><button id="gdi-srs-open" class="gdi-mode-btn" style="font-size:12px;"><i class="bi bi-mortarboard-fill" style="color:#ffd43b;"></i> Revisar ${due} anota\u00e7\u00e3${due>1?'\u00f5es':'o'} de hoje</button></div>`;
    }else if(streak>0){
      html+=`<span style="font-size:12px;color:var(--ferreto-text-muted,#8b949e);"><i class="bi bi-fire" style="color:#ff922b;"></i> ${streak} dia${streak>1?'s':''}</span>`;
    }
    if(chips.length){
      html+=`<div style="flex-basis:100%;display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:2px;">
        <span style="font-size:11px;color:var(--ferreto-text-muted,#8b949e);">Recentes aqui:</span>
        ${chips.map(c=>`<a class="gdi-mode-btn" data-gdi-go style="padding:2px 8px;font-size:11px;" href="${escHtml(playerHref(c.h.path))}" title="${escHtml(normPath(c.h.path))}">${escHtml(c.label.slice(0,26))}</a>`).join('')}
      </div>`;
    }
    html+='</div>';
    // ★ FIX 2 (Task 23): insert at the END of .gdi-wrap (beforeend), not the
    // beginning (afterbegin). The .gdi-wrap structure is:
    //   #update (alerts) → #head_md (md header) → .gdi-breadcrumb-wrap (breadcrumb)
    //   → .gdi-panel (folder list + toolbar + #list + #count) → #readme_md
    // Inserting at afterbegin put the card ABOVE the breadcrumb — covering the
    // folder list and pushing it down. Inserting at beforeend puts the card
    // below the folder list panel (after #readme_md, which is display:none by
    // default), so the user sees: breadcrumb → toolbar → folder list → card.
    host.insertAdjacentHTML('beforeend',html);
    // ★FIX: listeners presos ao CARD (antes pegava todos [data-gdi-go] do wrapper)
    const card=document.getElementById('gdi-home-card');
    if(card){
      card.querySelectorAll('[data-gdi-go]').forEach(a=>a.addEventListener('click',safeGo));
      card.querySelector('#gdi-srs-open')?.addEventListener('click',srsOpen);
    }
    log('card renderizado \u2014 alvo verificado:',target||'(nenhum)','| nome:',lbl?lbl.name:'-');
  }
  window.GDI_MODULES.push({name:'continue-card',init:continueCardInit});
  Bus.onGlobal('user:ready',()=>setTimeout(continueCardInit,50));
  // ★FIX: debounce no video:switched — era disparado múltiplas vezes
  // seguidas (playlist polling), cada uma chamando ensureRescue + continueCardInit.
  let _vsTimer=null;
  Bus.onGlobal('video:switched',()=>{
    if(_vsTimer)clearTimeout(_vsTimer);
    _vsTimer=setTimeout(()=>{
      _vsTimer=null;
      if(!(window.GDIUser&&GDIUser.loaded())&&Date.now()-rescueAt>15000)ensureRescue(true);
      setTimeout(continueCardInit,250);
    },800);
  });
  log('v19.6-fix registrado');
})();

// ═══ M14: PROGRESSOS ═══
(function(){
  let busy=false;
  // ★U.6: guard flag — o MutationObserver em #count disparava line() quando
  // a própria line() inseria #gdi-progress-line como sibling, criando um
  // loop de re-render. O flag corta o disparo durante a mutação.
  let __m14Mutating=false;
  // ★FIX (Task 8): busy guard — impede modProgress de rodar concorrentemente.
  // Antes: se schedule() disparasse runAll() 2× seguidas (DOMContentLoaded +
  // page:change), modProgress iniciava 2 conjuntos de workers em paralelo,
  // cada um re-escaneando as mesmas subpastas (o filtro !a.querySelector('.gdi-modprog')
  // não pegava porque o 1º conjunto ainda não tinha inserido os badges).
  // Resultado: 2× fetches + 2× loops síncronos sobre os mesmos arquivos.
  // Agora: o 2º disparo retorna imediatamente se o 1º ainda está em andamento.
  let _mpBusy=false;
  function modProgress(){
    if(!GDIUser.loaded())return;
    if(_mpBusy)return;  // ★ busy guard — não acumular workers concorrentes
    const rows=[...document.querySelectorAll('#list a.gdi-row')]
      .filter(a=>a.querySelector('.gdi-row-icon i.bi-folder-fill')&&!a.querySelector('.gdi-modprog'))
      .slice(0,8);  // ★ Task 8: cap em 8 (era 30) — reduz freeze do M14 (não fazer DOS no servidor)
    if(!rows.length)return;
    _mpBusy=true;  // ★ marca como em andamento
    // ★U.3: Promise.all com concorrência 6 (antes: sequencial + sleep 40ms).
    // Mesmo número de fetches, mas em paralelo — tempo total cai ~6x.
    const CONC=6;
    let cursor=0;
    async function worker(){
      while(cursor<rows.length){
        const row=rows[cursor++];
        if(!document.body.contains(row))continue;  // ★FIX: era return, interrompia o loop todo
        const href=row.getAttribute('href')||'';
        if(!href||href.startsWith('/fallback'))continue;
        let files;
        try{files=await gdiListAllFiles(href,gdiGetPw(href));}catch(_){continue;}
        if(!document.body.contains(row))continue;
        let total=0,done=0;
        // ★FIX (Task 8): cap síncrono em 800 iterações para evitar jank em
        // pastas gigantes. Se passar de 800, o progresso é uma aproximação
        // (suficiente para mostrar X/Y sem travar a thread).
        const MAX_ITER=800;
        for(let _i=0,_n=Math.min(files.length,MAX_ITER);_i<_n;_i++){
          const f=files[_i];
          if(f.mimeType==='application/vnd.google-apps.folder')continue;
          if(!FILE_TYPES.video.includes((f.fileExtension||'').toLowerCase()))continue;
          if(/\.part-/i.test(f.name))continue;
          const bytes=Number(f.size)||0;if(bytes>0&&bytes<1024*1024)continue;
          total++;
          try{if(GDIUser.isWatched(href+encodeURIComponent(f.name)))done++;}catch(_){}
        }
        if(total>0&&document.body.contains(row)){
          const pct=Math.round(done/total*100);
          const el=document.createElement('span');
          el.className='gdi-modprog';
          el.innerHTML=`<b>${done}/${total}</b> \u00b7 ${pct}%`;
          el.title='Progresso de v\u00eddeos nesta pasta';
          row.querySelector('.gdi-row-acts')?.appendChild(el);
        }
        // ★U.3: sem await sleep(40) — paralelismo já regula a carga
      }
    }
    const ws=[];
    for(let i=0;i<Math.min(CONC,rows.length);i++)ws.push(worker());
    Promise.all(ws).catch(()=>{}).finally(()=>{_mpBusy=false;});  // ★ libera o busy guard
  }
  function line(){
    // ★U.6: flag ativo durante a mutação — o MutationObserver ignora disparos
    // que acontecerem enquanto este flag estiver true.
    __m14Mutating=true;
    try{
    const countEl=document.getElementById('count');
    if(!countEl||!countEl.classList.contains('show')){document.getElementById('gdi-progress-line')?.remove();return;}
    const rows=document.querySelectorAll('#list div.gdi-row');
    let done=0,total=0,firstTodo='';
    rows.forEach(row=>{
      if(!row.querySelector('.gdi-row-icon i.bi-camera-video-fill'))return;
      const a=row.querySelector('a.gdi-row-name');if(!a)return;
      const href=a.getAttribute('href')||'';
      if(href.startsWith('/fallback'))return;
      total++;
      let w=false;try{w=GDIUser.isWatched(href.split('?')[0])}catch(_){}
      if(w)done++;else if(!firstTodo)firstTodo=href;
    });
    const hasFolders=!!document.querySelector('#list a.gdi-row .gdi-row-icon i.bi-folder-fill');
    const el0=document.getElementById('gdi-progress-line');
    if((!total&&!hasFolders)||!GDIUser.loaded()){if(el0)el0.remove();return;}
    let el=el0;
    if(!el){el=document.createElement('div');el.id='gdi-progress-line';countEl.insertAdjacentElement('afterend',el);}
    let html='';
    if(total){
      const pct=Math.round(done/total*100);
      html+=`<i class="bi bi-bar-chart-fill" style="color:var(--ferreto-primary,#7aa2ff);"></i>
        <span>${done}/${total} assistido${done===1?'':'s'} (${pct}%)</span>
        <div style="flex:1;max-width:160px;height:5px;background:var(--ferreto-surface-3,rgba(255,255,255,.1));border-radius:3px;overflow:hidden;">
          <div style="height:5px;width:${pct}%;background:${pct>=100?'#1a7f37':'#1f6feb'};transition:width .4s;"></div>
        </div>`;
      if(firstTodo)html+=`<button id="gdi-next-lesson" class="gdi-mode-btn" style="padding:2px 8px;font-size:11px;" data-href="${escHtml(firstTodo)}" title="Abrir a primeira aula ainda n\u00e3o assistida"><i class="bi bi-play-fill"></i> N\u00e3o assistida</button>`;
    }
    if(hasFolders)html+=`<button id="gdi-course-btn" class="gdi-mode-btn" style="padding:2px 8px;font-size:11px;" title="Somar o progresso de TODAS as subpastas"><i class="bi bi-diagram-3"></i> Progresso do curso</button>`;
    el.innerHTML=html;
    el.querySelector('#gdi-next-lesson')?.addEventListener('click',function(){location.href=this.dataset.href;});
    el.querySelector('#gdi-course-btn')?.addEventListener('click',course);
    }finally{
      // ★U.6: limpa o flag em macrotask (depois de qualquer microtask do
      // MutationObserver) para evitar loop.
      setTimeout(()=>{__m14Mutating=false;},0);
    }
  }
  async function course(){
    if(busy)return;busy=true;
    const btn=document.getElementById('gdi-course-btn');
    if(btn){btn.disabled=true;btn.innerHTML='<i class="bi bi-hourglass-split"></i> calculando\u2026';}
    try{
      const folders=[...document.querySelectorAll('#list a.gdi-row')]
        .filter(a=>a.querySelector('.gdi-row-icon i.bi-folder-fill'))
        .map(a=>a.getAttribute('href')||'')
        .filter(h=>h&&!h.startsWith('/fallback'));
      let done=0,total=0;
      const root=trimChar(window.location.pathname,'/')+'/';
      const bases=[root,...folders.map(f=>f.endsWith('/')?f:f+'/')];
      for(const base of bases){
        const files=await gdiListAllFiles(base,gdiGetPw(base));
        for(const f of files){
          if(f.mimeType==='application/vnd.google-apps.folder')continue;
          if(!FILE_TYPES.video.includes((f.fileExtension||'').toLowerCase()))continue;
          if(/\.part-/i.test(f.name))continue;
          const bytes=Number(f.size)||0;if(bytes>0&&bytes<1024*1024)continue;
          total++;
          try{if(GDIUser.isWatched(base+encodeURIComponent(f.name)))done++;}catch(_){}
        }
      }
      const line=document.getElementById('gdi-progress-line');
      if(line){
        const pct=total?Math.round(done/total*100):0;
        line.insertAdjacentHTML('beforeend',`<span style="color:var(--ferreto-text,#e6edf3);"><i class="bi bi-mortarboard-fill" style="color:#3fb950;"></i> Curso: <b>${done}/${total}</b> aulas (${pct}%)</span>`);
        if(btn)btn.remove();
      }
    }catch(_){showToast('N\u00e3o foi poss\u00edvel calcular o progresso do curso');}
    finally{busy=false;}
  }
  window.GDI_MODULES.push({name:'progress',init:function(){
    const c=document.getElementById('count');
    if(c&&!c.__m14){c.__m14=true;
      // ★FIX: desconecta o observer da página anterior (vazamento por página)
      if(window.__gdiM14obs){try{window.__gdiM14obs.disconnect()}catch(_){}}
      // ★U.6: callback pula se __m14Mutating — evita feedback loop.
      const obs=new MutationObserver(()=>{if(!__m14Mutating)line();});
      obs.observe(c,{childList:true,characterData:true,subtree:true});
      window.__gdiM14obs=obs;}
    line();modProgress();
  }});
  Bus.onGlobal('user:ready',()=>{try{line()}catch(_){}});
})();

// ═══ M16: PWA best-effort ═══
(function(){
  try{
    if(!document.querySelector('link[rel="manifest"]')){
      const origin=window.location.origin;
      const MAN={name:(document.siteName||'Drive')+' Estudos',short_name:'Estudos',start_url:origin+'/',scope:origin+'/',display:'standalone',background_color:'#0b0e14',theme_color:'#0b0e14',icons:[]};
      const l=document.createElement('link');l.rel='manifest';
      l.href=URL.createObjectURL(new Blob([JSON.stringify(MAN)],{type:'application/manifest+json'}));
      document.head.appendChild(l);
    }
  }catch(_){}
  if('serviceWorker' in navigator&&location.protocol==='https:'){
    navigator.serviceWorker.register('/gdi-sw.js',{scope:'/'})
      .then(()=>console.log('[GDI PWA] offline ativo'))
      .catch(()=>console.log('[GDI PWA] offline opcional desativado'));
  }
})();

// ═══ M18: PAINEL DE DEBUG ═══
const GDIDebug=(()=>{const i=[];let e=null;function t(){return new Date().toISOString().slice(11,23)}function n(){if(e||(e=document.getElementById("gdi-debug-log")),!e)return;const d={req:"#da77f2",api:"#69db7c",error:"#ff6b6b",warn:"#ffa94d",info:"#74c0fc"},o=i.map(r=>{const p=d[r.type]||"#aaa",g=r.data!=null?typeof r.data=="string"?r.data:JSON.stringify(r.data,null,2):"";return`<div class="gdi-dbg-entry"><span class="gdi-dbg-ts">${r.ts}</span><span class="gdi-dbg-badge" style="color:${p}">[${r.type.toUpperCase()}]</span><span class="gdi-dbg-msg">${escHtml(r.label)}</span>`+(g?`<pre class="gdi-dbg-pre">${escHtml(g)}</pre>`:"")+"</div>"}).join("");e.innerHTML=o||'<span class="gdi-dbg-empty">No entries yet.</span>',e.scrollTop=e.scrollHeight;const s=document.getElementById("gdi-dbg-count");s&&(s.textContent=i.length)}function a(d,o,s){window.UI?.debug_mode&&(i.push({ts:t(),type:d,label:o,data:s!==void 0?s:null}),n())}function c(){e=document.getElementById("gdi-debug-log"),i.length>0&&n(),a("info","Debug attached",{path:window.location.pathname,search:window.location.search,drive:window.current_drive_order,version:window.UI?.version,model_type:window.MODEL?.root_type})}function l(){i.length=0,e&&(e.innerHTML='<span class="gdi-dbg-empty">Cleared.</span>');const d=document.getElementById("gdi-dbg-count");d&&(d.textContent="0")}return{log:a,attach:c,clear:l}})();
window.GDIDebug=GDIDebug;

if(window.UI?.debug_mode){const i=window.fetch.bind(window);window.fetch=async function(t,n){const a=typeof t=="string"?t:t.url||String(t),c=(n?.method||"GET").toUpperCase();let l;try{l=n?.body?JSON.parse(n.body):void 0}catch{l=n?.body}GDIDebug.log("req",`\u2192 ${c} ${a}`,l!==void 0?l:null);const d=Date.now();try{const o=await i(t,n),s=o.clone();let r;try{r=await s.json()}catch{r=null}return GDIDebug.log(o.ok?"api":"error",`\u2190 ${o.status} ${a} (${Date.now()-d}ms)`,r),o}catch(o){throw GDIDebug.log("error",`\u2717 FETCH FAILED: ${a}`,String(o)),o}};const e=console.error.bind(console);console.error=function(...t){GDIDebug.log("error",t.map(n=>n instanceof Error?n.stack||n.message:typeof n=="object"?JSON.stringify(n):String(n)).join(" ")),e(...t)},window.addEventListener("error",t=>{GDIDebug.log("error",`Uncaught: ${t.message}`,`${t.filename}:${t.lineno}:${t.colno}`)}),window.addEventListener("unhandledrejection",t=>{GDIDebug.log("error",`UnhandledPromise: ${String(t.reason)}`)})}

window.GDI_MODULES.push({name:'debug',init:function(){
  if(!(window.UI&&window.UI.debug_mode))return;
  if(document.getElementById('gdi-debug-wrap'))return;
  const wrap=document.createElement('div');
  wrap.className='gdi-debug-wrap';wrap.id='gdi-debug-wrap';
  wrap.innerHTML=`<div class="gdi-debug-head" onclick="document.getElementById('gdi-debug-log').classList.toggle('collapsed')">
    <strong><i class="bi bi-bug-fill" style="color:#f0883e;"></i> GDI Debug <span id="gdi-dbg-count" class="gdi-dbg-count">0</span></strong>
    <div class="gdi-debug-actions">
      <button onclick="event.stopPropagation();GDIDebug.clear()">Clear</button>
      <button onclick="event.stopPropagation();document.getElementById('gdi-debug-log').classList.toggle('collapsed')">Toggle</button>
    </div></div>
  <div id="gdi-debug-log" class="collapsed"></div>`;
  GDI_ROOT().appendChild(wrap);
  try{GDIDebug.attach()}catch(_){}
}});

// ═══ M19: TÍTULO LIMPO DA ABA ═══
(function(){
  const MAX=64;
  const POMO=/^\d\d:\d\d\s+[^\s\u00b7]+\s+\u00b7\s+/;
  const dec=s=>{try{return decodeURIComponent(String(s||''))}catch(_){return String(s||'')}};
  const clean=s=>dec(s).replace(/\s+/g,' ').trim();
  function segs(p){return clean(String(p||'').split('?')[0]).split('/').filter(Boolean)}
  function build(name,parent){
    name=(name||'').replace(/\.[a-z0-9]{1,5}$/i,'').trim();
    parent=(parent&&!/^\d+:$/.test(parent))?parent:'';
    let t=parent?parent+' \u00b7 '+name:name;
    if(t.length>MAX)t=(name||'').slice(0,MAX);
    return t;
  }
  function fromPlaylist(){
    try{
      const pv=window.playlistVideos,ci=window.currentIndex;
      if(pv&&typeof ci==='number'&&ci>=0&&pv[ci]){
        const m=pv[ci];
        const ps=segs(m.pageUrl||'');
        return build(clean(m.name||m.origName||''),ps.length>=2?ps[ps.length-2]:'');
      }
    }catch(_){}
    return null;
  }
  function fromUrl(){
    const seg=segs(window.location.pathname);
    if(!seg.length)return null;
    const first=seg[0]||'';
    if(first.indexOf(':')!==-1&&!/^\d+:$/.test(first))return null;
    if(/^\d+:$/.test(first)){
      if(seg.length===1){
        const dn=window.drive_names&&window.drive_names[parseInt(first,10)];
        return dn||null;
      }
      return build(seg[seg.length-1],seg.length>=3?seg[seg.length-2]:'');
    }
    return null;
  }
  function apply(){
    try{
      const cur=document.title||'';
      if(POMO.test(cur))return;
      const next=fromPlaylist()||fromUrl();
      if(!next||next===cur)return;
      document.title=next;
    }catch(_){}
  }
  function bindTitle(){
    const el=document.querySelector('title');
    if(!el){setTimeout(bindTitle,400);return;}
    new MutationObserver(apply).observe(el,{childList:true,characterData:true,subtree:true});
  }
  bindTitle();
  // ★U.5: setInterval(apply,1500) removido — o MutationObserver em <title>
  // já dispara apply() quando o título muda, e Bus.onGlobal('title:change')
  // cobre mudanças externas. O intervalo era redundante.
  Bus.onGlobal('page:change',apply);
  Bus.onGlobal('title:change',apply);
  Bus.onGlobal('video:switched',()=>setTimeout(apply,150));
  Bus.onGlobal('media:ready',apply);
  window.GDI_MODULES.push({name:'clean-title',init:apply});
  apply();
  console.log('[GDI M19] t\u00edtulo limpo ativo');
})();

// ═══ M20: PLAYLIST — SEM OBSERVER (★ o fix do congelamento) ═══
// O MutationObserver que vivia aqui se auto-disparava infinitamente
// quando o render demorava >150ms (playlists grandes) — era o loop
// que travava a aba para sempre. Removido. Re-render só via Bus.
// ★U.1: paginação 100-itens + botão "Carregar mais" (antes: 600-itens cap
//        renderizado de uma vez via innerHTML).
// ★U.2: polling 60s removido — evento Bus 'playlist:ready' dispara o refresh.
(function(){
  const LS_OPEN='gdi-playlist-open',LS_HIDE='gdi-hide-watched';
  const PL_PAGE=100,PL_MAX=3000;  // ★U.1: página de 100, teto absoluto 3000
  let _plVisibleCount=0;  // ★U.1: quantos itens estão no DOM agora
  const norm=p=>{try{return decodeURIComponent(String(p||'').split('?')[0])}catch(_){return String(p||'').split('?')[0]}};
  window.gdiNormKey=norm;
  window.gdiVideoKey=function(){
    try{const pv=window.playlistVideos,ci=window.currentIndex;
      if(pv&&typeof ci==='number'&&ci>=0&&pv[ci]&&pv[ci].pageUrl)return pv[ci].pageUrl.split('?')[0];
    }catch(_){}
    return window.location.pathname;
  };
  window.gdiMarkVideo=function(){
    try{GDIUser.markWatched(norm(window.gdiVideoKey()))}catch(_){}
    try{GDIUser.markWatched(window.location.pathname)}catch(_){}
    Bus.emit('watched:changed');
  };
  window.gdiUnmarkVideo=function(){
    [window.gdiVideoKey(),window.location.pathname].forEach(k=>{
      try{GDIUser.unmarkWatched(k);GDIUser.unmarkWatched(norm(k))}catch(_){}
    });
    Bus.emit('watched:changed');
  };
  function isW(m){
    const raw=(m.pageUrl||'').split('?')[0];
    try{return GDIUser.isWatched(raw)||GDIUser.isWatched(norm(raw))}catch(_){return false}
  }
  function items(){return window.playlistVideos||[]}
  function cur(){const i=window.currentIndex;return(typeof i==='number'&&i>=0)?i:-1}
  function parentPath(){return window.location.pathname.split('/').slice(0,-2).join('/')+'/'}
  function healKeys(){
    const i=cur();if(i<0)return;const m=items()[i];if(!m)return;
    const raw=(m.pageUrl||'').split('?')[0];
    let a=false,b=false,c=false;
    try{a=GDIUser.isWatched(raw);b=GDIUser.isWatched(norm(raw));c=GDIUser.isWatched(window.location.pathname)}catch(_){}
    try{if((a||b)&&!c)GDIUser.markWatched(window.location.pathname);
        if(c&&!(a||b))GDIUser.markWatched(norm(raw));}catch(_){}
  }
  // ★U.1: helper — renderiza um intervalo [fromIdx, toIdx) da playlist
  function _renderPlaylistRange(pv,fromIdx,toIdx,ci){
    const hide=localStorage.getItem(LS_HIDE)==='1';
    let h='';
    for(let idx=fromIdx;idx<toIdx;idx++){
      const m=pv[idx];if(!m)break;
      const w=isW(m),c=idx===ci;
      if(hide&&w&&!c)continue;
      const nm=m.name||m.origName||'(sem nome)';
      h+=`<div class="gdi-playlist-item${c?' cur':''}${w&&!c?' watched':''}" data-idx="${idx}" title="${escHtml(nm)}">
        <div><i class="bi bi-${c?'play-fill':w?'check-circle-fill':'film'} me-2"></i><span style="font-weight:${c?'600':'400'};">${escHtml(nm)}</span></div>
        <span class="gdi-pl-size">${w?'\u2713 ':''}${escHtml(m.size||'')}</span>
      </div>`;
    }
    return h;
  }
  function _scrollToCurrent(list,ci){
    if(items()[ci]){const el=list.querySelector('.gdi-playlist-item[data-idx="'+ci+'"]');
      if(el)try{el.scrollIntoView({block:'nearest'})}catch(_){}}
  }
  function _attachLoadMore(list,pv){
    // ★U.1: se ainda há itens além do visível (ou além do PL_MAX), mostra o botão
    const ceiling=Math.min(pv.length,PL_MAX);
    if(_plVisibleCount>=ceiling){
      if(pv.length>PL_MAX){
        const notice=document.createElement('div');
        notice.style.cssText='padding:6px 12px;font-size:11px;color:var(--ferreto-text-muted,#8b949e);';
        notice.textContent='\u2026 +'+(pv.length-PL_MAX)+' aulas (Pr\u00f3xima/Anterior e a tecla J alcan\u00e7am todas)';
        list.appendChild(notice);
      }
      return;
    }
    const remaining=ceiling-_plVisibleCount;
    const btn=document.createElement('button');
    btn.className='gdi-pl-loadmore gdi-mode-btn';
    btn.style.cssText='display:block;width:100%;margin:8px 0;padding:6px 10px;font-size:12px;text-align:center;';
    btn.textContent='Carregar mais ('+remaining+' restantes)';
    btn.addEventListener('click',()=>{
      btn.remove();
      const fromIdx=_plVisibleCount;
      const toIdx=Math.min(_plVisibleCount+PL_PAGE,ceiling);
      const ci=cur();
      const html=_renderPlaylistRange(pv,fromIdx,toIdx,ci);
      list.insertAdjacentHTML('beforeend',html);  // ★U.1: append sem re-parse
      _plVisibleCount=toIdx;
      _attachLoadMore(list,pv);
      _scrollToCurrent(list,ci);
    });
    list.appendChild(btn);
  }
  function renderItems(){
    const list=document.getElementById('gdi-playlist-list');
    if(!list)return;
    const pv=items(),ci=cur();
    if(!pv.length){list.innerHTML='<div class="gdi-notes-empty">Nenhuma aula encontrada.</div>';_plVisibleCount=0;return;}
    // ★U.1: paginação — renderiza só os primeiros PL_PAGE itens. Se o
    // currentIndex estiver além da janela visível (ex.: tecla J pulou para
    // a aula 250), expande automaticamente para incluir o índice atual.
    let target=PL_PAGE;
    if(ci>=PL_PAGE){
      target=(Math.floor(ci/PL_PAGE)+1)*PL_PAGE;
    }
    _plVisibleCount=Math.min(target,Math.min(pv.length,PL_MAX));
    list.innerHTML=_renderPlaylistRange(pv,0,_plVisibleCount,ci)
      ||'<div class="gdi-notes-empty">Todas assistidas (filtro ativo).</div>';
    _attachLoadMore(list,pv);
    _scrollToCurrent(list,ci);
  }
  function renderMeta(){
    const pv=items(),ci=cur();
    const cnt=document.getElementById('gdi-pl-count')||document.getElementById('gdi-playlist-count');
    if(cnt)cnt.textContent=pv.length?`${ci+1} / ${pv.length}`:'';
  }
  function syncWatchedBtn(){
    const wb=document.getElementById('gdi-watched-btn');if(!wb)return;
    let done=false;
    try{done=GDIUser.isWatched(window.gdiVideoKey())||GDIUser.isWatched(norm(window.gdiVideoKey()))||GDIUser.isWatched(window.location.pathname)}catch(_){}
    wb.classList.toggle('done',done);
    wb.innerHTML=done?'<i class="bi bi-eye-fill"></i><span>Assistida \u2713</span>':'<i class="bi bi-eye"></i><span>Assistido</span>';
  }
  function refreshAll(){healKeys();renderItems();renderMeta();syncWatchedBtn();}
  function downloadJSON(){
    const pv=items();
    if(pv.length<2){showToast('Playlist muito curta para exportar');return;}
    const data=pv.map(v=>({n:v.origName||v.name,f:v.folderLabel||null,
      s:v.sizeBytes||0,l:v.rawLink||'',m:v.mimeType||'',fd:v.folder||'',t:v.thumbRaw||''}));
    const blob=new Blob([JSON.stringify(data,null,1)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='playlist.json';
    GDI_ROOT().appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),5000);
    showToast('playlist.json baixado \u2014 suba na pasta SUPERIOR do curso');
  }
  function ensureUI(){
    let wrap=document.getElementById('gdi-playlist-wrap');
    if(!wrap){
      // ★FIX: app.min.js modular usa slots vazios (#gdi-slot-left) sem o
      // markup da playlist. Cria o wrap dentro do slot se não existir.
      const slot=document.getElementById('gdi-slot-left')||document.querySelector('.gdi-study-left');
      if(!slot)return null;
      wrap=document.createElement('div');
      wrap.id='gdi-playlist-wrap';
      slot.appendChild(wrap);
    }
    if(wrap.dataset.m20)return wrap;
    wrap.dataset.m20='1';
    wrap.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;gap:6px;flex-wrap:wrap;">
      <button id="gdi-pl-toggle" class="gdi-mode-btn" style="padding:4px 10px;font-size:12px;flex:1;justify-content:flex-start;min-width:0;" title="Mostrar/ocultar a playlist">
        <i class="bi bi-collection-play me-2"></i><strong style="font-size:13px;">Playlist</strong>
        <span id="gdi-pl-count" style="font-size:11px;color:var(--ferreto-text-muted,#8b949e);margin-left:6px;"></span>
        <i id="gdi-pl-chev" class="bi bi-chevron-down" style="margin-left:auto;"></i>
      </button>
      <button id="gdi-pl-filter" class="gdi-mode-btn" style="padding:4px 9px;font-size:11px;" title="Esconder aulas j\u00e1 assistidas"><i class="bi bi-funnel"></i></button>
      <button id="gdi-pl-reload" class="gdi-mode-btn" style="padding:4px 9px;font-size:11px;" title="Descartar o cache e reescanear as pastas"><i class="bi bi-arrow-clockwise"></i></button>
      <button id="gdi-pl-json" class="gdi-mode-btn" style="padding:4px 9px;font-size:11px;" title="Baixar playlist.json"><i class="bi bi-filetype-json"></i></button>
    </div>
    <div id="gdi-playlist-body" style="overflow-y:auto;border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:6px;background:rgba(0,0,0,.2);max-height:240px;">
      <div id="gdi-playlist-list"></div>
    </div>`;
    const body=wrap.querySelector('#gdi-playlist-body');
    const chev=wrap.querySelector('#gdi-pl-chev');
    const setOpen=v=>{
      body.style.display=v?'block':'none';
      chev.className='bi bi-chevron-'+(v?'up':'down');
      try{localStorage.setItem(LS_OPEN,v?'1':'0')}catch(_){}
    };
    // ★FIX: por padrão a playlist fica RECOLHIDA (só o header visível),
    // como no bloco único. Usuário expande clicando no header.
    let open=false;try{open=localStorage.getItem(LS_OPEN)==='1'}catch(_){}
    setOpen(open);
    wrap.querySelector('#gdi-pl-toggle').addEventListener('click',()=>setOpen(body.style.display==='none'));
    const fBtn=wrap.querySelector('#gdi-pl-filter');
    const fSync=()=>{const on=localStorage.getItem(LS_HIDE)==='1';
      fBtn.classList.toggle('active',on);
      fBtn.innerHTML='<i class="bi bi-funnel'+(on?'-fill':'')+'"></i>';};
    fBtn.addEventListener('click',()=>{
      const on=localStorage.getItem(LS_HIDE)==='1';
      try{localStorage.setItem(LS_HIDE,on?'0':'1');}catch(_){}
      fSync();renderItems();});
    fSync();
    wrap.querySelector('#gdi-pl-reload').addEventListener('click',()=>{
      try{localStorage.removeItem('gdi-xpl::'+(window.location.host||'')+'::'+parentPath())}catch(_){}
      try{Object.keys(sessionStorage).forEach(k=>{if(k.indexOf('gdi-pljson-probe')===0)sessionStorage.removeItem(k)})}catch(_){}
      showToast('Cache apagado \u2014 reescaneando\u2026');
      setTimeout(()=>location.reload(),600);
    });
    wrap.querySelector('#gdi-pl-json').addEventListener('click',downloadJSON);
    return wrap;
  }
  // expõe para o core (app.min.js renderPlaylistUI) poder garantir o wrap
  window.gdiEnsurePlaylist=function(){return ensureUI();};
  window.GDI_MODULES.push({name:'playlist-ui',init:function(){
    // ★FIX: roda em qualquer página de vídeo (tem #gdi-slot-left ou
    // #gdi-study), não exige #gdi-playlist-wrap pré-existente.
    const slot=document.getElementById('gdi-slot-left')||document.querySelector('.gdi-study-left');
    const existing=document.getElementById('gdi-playlist-wrap');
    if(!slot&&!existing)return;
    ensureUI();
    const list=document.getElementById('gdi-playlist-list');
    // ★FIX: UM listener delegado no container (era 1 por aula + observer infinito)
    if(list&&!list.__m20deleg){
      list.__m20deleg=true;
      list.addEventListener('click',e=>{
        const it=e.target.closest('.gdi-playlist-item');
        if(!it)return;
        const k=parseInt(it.dataset.idx,10);
        if(!isNaN(k)&&items()[k]&&window.switchVideo)window.switchVideo(k);
      });
    }
    refreshAll();
  }});
  // ★U.2: polling 60s removido (PATCH G). app.min.js (agente 4-a) emite
  // Bus.emit('playlist:ready', playlistVideos) ao final do buildPlaylist.
  // Esse listener dispara o refresh UMA vez quando a playlist está pronta.
  let _plReadyFired=false;
  Bus.onGlobal('playlist:ready',()=>{
    _plReadyFired=true;
    ensureUI();
    refreshAll();
  });
  // ★U.2: fallback one-shot — se o evento não disparar em 3s (ex.: app.min.js
  // antigo sem o emit), faz um refreshAll() para garantir.
  setTimeout(()=>{
    if(!_plReadyFired){
      try{ensureUI();refreshAll();}catch(_){}
    }
  },3000);
  Bus.onGlobal('watched:changed',()=>setTimeout(refreshAll,30));
  Bus.onGlobal('video:switched',()=>setTimeout(refreshAll,120));
  Bus.onGlobal('user:ready',()=>setTimeout(refreshAll,60));
})();

// ═══════════════════════════════════════════════════════════════
