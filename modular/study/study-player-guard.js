// ═══════════════════════════════════════════════════════════════
// study-player-guard.js — Watchdog contra vídeos travados
//
// Split from gdi-study.js (v1.0.86 modularization, Task v86-MOD-STUDY).
// Originally IIFE #5 "M-PLAYER-GUARD" (lines 4428-4564, ~135 lines).
//
// Namespace: window.__gdiStudy.playerGuard = { STALL_MS, FIRST_PLAY_HINT_MS, attach }
// Guard: window.__gdiStudyPlayerGuard (prevents double-init)
// Load order: 7th study module
// ═══════════════════════════════════════════════════════════════
(function(){
  if(window.__gdiStudyPlayerGuard) return;
  window.__gdiStudyPlayerGuard = true;
  window.__gdiStudy = window.__gdiStudy || {};

  const STALL_MS=15000;
  const FIRST_PLAY_HINT_MS=3500;

  // ★ FIX 20-6 #14 (Agent 6): module-level registry of all active guards.
  //    Each attach() pushes its `st` (state) object here; the page:change
  //    Bus listener (registered below) iterates this Set and clears every
  //    guard's setTimeout + overlay. Without this, when the user navigated
  //    away from a video page mid-stall-watch, the 15s setTimeout would
  //    still fire `check()` against a now-detached <video> element (its
  //    parentNode check at line 49 returns early, but the timer itself
  //    was never cleared — accumulating across SPA navigations).
  //    The task spec mentioned "setInterval(videoStallCheck, 3000)" which
  //    doesn't literally exist in this file; the actual mechanism is a
  //    self-rescheduling setTimeout (via arm() at line 46/71), and the same
  //    leak applies. The fix is identical: track + clear on page:change.
  //    Also: the video element's 'ended' event already calls clearTimer()
  //    (line 135 below); that's the "media:ended" half of the spec.
  const _activeGuards = new Set();

  if(!document.getElementById('gdi-stall-style')){
    const s=document.createElement('style');s.id='gdi-stall-style';s.textContent=`
.gdi-stall-overlay{position:absolute;inset:0;background:rgba(7,9,16,.82);
  -webkit-backdrop-filter:blur(7px);backdrop-filter:blur(7px);
  display:flex;align-items:center;justify-content:center;z-index:30;
  animation:ferreto-fade .2s ease;}
.gdi-stall-card{display:flex;flex-direction:column;align-items:center;gap:9px;text-align:center;padding:22px;max-width:340px;}
.gdi-stall-card .gdi-stall-ico{font-size:36px;color:var(--ferreto-primary,#ff8b9f);
  filter:drop-shadow(0 4px 14px rgba(255,139,159,.5));}
.gdi-stall-title{font-family:var(--ferreto-font-display,'Poppins',sans-serif);font-size:15px;font-weight:600;color:#fff;}
.gdi-stall-sub{font-size:12px;color:#9aa4b8;margin-bottom:8px;line-height:1.4;}
.gdi-stall-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;}
.gdi-play-hint{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:20;cursor:pointer;
  background:rgba(0,0,0,.28);opacity:0;transition:opacity .2s;pointer-events:none;}
.gdi-play-hint.show{opacity:1;pointer-events:auto;}
.gdi-play-hint .bi{font-size:54px;color:#fff;filter:drop-shadow(0 6px 20px rgba(0,0,0,.6));}
.gdi-play-hint small{position:absolute;bottom:18px;color:#fff;font-size:12px;opacity:.85;}
`;document.head.appendChild(s);
  }

  function attach(v){
    if(!v||v.__gdiGuard)return;v.__gdiGuard=true;
    const st={timer:null,retryUsed:false,lastT:v.currentTime||0,lastAt:Date.now(),
              overlay:null,hint:null,hintTimer:null};
    // ★ FIX 20-6 #14 (Agent 6): register this guard so the page:change Bus
    //    listener can clear its timers when the user navigates away.
    _activeGuards.add(st);

    function clearTimer(){if(st.timer){clearTimeout(st.timer);st.timer=null;}}
    function clearOverlay(){if(st.overlay){st.overlay.remove();st.overlay=null;}}
    function arm(){clearTimer();st.timer=setTimeout(check,STALL_MS);}

    function check(){
      if(!v.parentNode){clearOverlay();clearTimer();return;}
      if(v.paused){arm();return;}
      const dt=(v.currentTime||0)-st.lastT;
      if(dt>0.1){
        st.lastT=v.currentTime||0;st.lastAt=Date.now();clearOverlay();arm();return;
      }
      if(Date.now()-st.lastAt>=STALL_MS){
        if(!st.retryUsed){
          st.retryUsed=true;
          console.warn('[GDI Player-Guard] vídeo parou — retry silencioso');
          try{
            const cur=v.currentTime;
            v.load();
            v.play().catch(function(){});
            const onCanPlay=function(){try{if(cur>0)v.currentTime=cur;}catch(e){console.warn('[GDI Player-Guard] restore currentTime failed:',e&&e.message);}v.removeEventListener('loadedmetadata',onCanPlay);};
            v.addEventListener('loadedmetadata',onCanPlay,{once:true});
          }catch(e){console.warn('[GDI Player-Guard] retry load/play failed:',e&&e.message);}
          st.lastAt=Date.now();st.lastT=0;
          arm();
        }else{
          showOverlay();
        }
      }else{arm();}
    }

    function showOverlay(){
      if(st.overlay)return;
      const wrap=v.closest('.gdi-player-wrap')||v.parentNode;
      if(!wrap)return;
      st.overlay=document.createElement('div');
      st.overlay.className='gdi-stall-overlay';
      st.overlay.innerHTML=
        '<div class="gdi-stall-card">'+
          '<i class="bi bi-exclamation-triangle gdi-stall-ico"></i>'+
          '<div class="gdi-stall-title">O vídeo parece ter travado</div>'+
          '<div class="gdi-stall-sub">Sem progresso há '+Math.round(STALL_MS/1000)+'s. O stream do Drive pode ter expirado ou ficado lento.</div>'+
          '<div class="gdi-stall-actions">'+
            '<button class="gdi-btn gdi-btn-primary" data-act="reload"><i class="bi bi-arrow-clockwise"></i> Recarregar</button>'+
            '<button class="gdi-btn gdi-btn-ghost" data-act="wait">Continuar aguardando</button>'+
          '</div>'+
        '</div>';
      wrap.appendChild(st.overlay);
      st.overlay.querySelector('[data-act="reload"]').addEventListener('click',function(){
        clearOverlay();st.retryUsed=false;st.lastAt=Date.now();st.lastT=0;
        try{v.load();v.play().catch(function(){});}catch(e){console.warn('[GDI Player-Guard] reload action failed:',e&&e.message);}
        arm();
      });
      st.overlay.querySelector('[data-act="wait"]').addEventListener('click',function(){
        clearOverlay();st.lastAt=Date.now();arm();
      });
    }

    function showHint(){
      if(st.hint)return;
      const wrap=v.closest('.gdi-player-wrap')||v.parentNode;
      if(!wrap)return;
      st.hint=document.createElement('div');
      st.hint.className='gdi-play-hint';
      st.hint.innerHTML='<i class="bi bi-play-circle-fill"></i><small>Toque para iniciar</small>';
      st.hint.addEventListener('click',function(){
        v.muted=false;
        v.play().catch(function(){v.muted=true;v.play().catch(function(){});});
        hideHint();
      });
      wrap.appendChild(st.hint);
      requestAnimationFrame(function(){st.hint&&st.hint.classList.add('show');});
    }
    function hideHint(){if(st.hint){st.hint.remove();st.hint=null;}clearTimeout(st.hintTimer);}
    function armHint(){clearTimeout(st.hintTimer);st.hintTimer=setTimeout(function(){
      if(v.paused&&v.readyState<3)showHint();
    },FIRST_PLAY_HINT_MS);}

    v.addEventListener('timeupdate',function(){
      st.lastT=v.currentTime||0;st.lastAt=Date.now();if(st.overlay)clearOverlay();hideHint();
    });
    v.addEventListener('waiting',function(){arm();});
    v.addEventListener('playing',function(){st.lastAt=Date.now();if(st.overlay)clearOverlay();hideHint();arm();});
    v.addEventListener('stalled',function(){arm();});
    v.addEventListener('canplay',function(){hideHint();});
    v.addEventListener('play',function(){arm();armHint();});
    v.addEventListener('pause',function(){clearTimer();});
    v.addEventListener('error',function(){
      console.error('[GDI Player-Guard] erro de mídia',v.error);
      if(!st.retryUsed){st.retryUsed=true;try{v.load();v.play().catch(function(){});}catch(e){console.warn('[GDI Player-Guard] error-event retry failed:',e&&e.message);}arm();}
      else{showOverlay();}
    });
    v.addEventListener('ended',function(){clearTimer();clearOverlay();
      // ★ FIX 20-6 #14 (Agent 6): also deregister from _activeGuards on ended
      //    so the page:change listener doesn't iterate a stale guard whose
      //    video element has finished and may be replaced.
      _activeGuards.delete(st);
    });

    arm();armHint();
    console.log('[GDI Player-Guard] monitorando vídeo');
  }

  // ★ FIX 20-6 #14 (Agent 6): clear ALL active guards' timers + overlays on
  //    page:change. This is the missing cleanup that left setTimeout arms
  //    firing against detached <video> elements after SPA navigation.
  //    Without this, a user who:
  //      1. opens a video page (guard attaches, arm() schedules check in 15s)
  //      2. navigates to "Questões" tab 3s later (video element detached)
  //    would have check() fire at the 15s mark against a detached video —
  //    the parentNode check returns early (line 49) but the timer was
  //    already needlessly held. With 10 such navigations during a study
  //    session, 10 orphan setTimeout arms accumulate in the event loop.
  function _clearAllGuards(){
    _activeGuards.forEach(function(st){
      try{
        if(st.timer){clearTimeout(st.timer);st.timer=null;}
        if(st.hintTimer){clearTimeout(st.hintTimer);st.hintTimer=null;}
        if(st.overlay){st.overlay.remove();st.overlay=null;}
        if(st.hint){st.hint.remove();st.hint=null;}
      }catch(e){console.warn('[GDI Player-Guard] _clearAllGuards entry cleanup failed:',e&&e.message);}
    });
    // Don't delete from the Set — the video element might still be in the
    // DOM (e.g., SPA route that reuses the same <video>). The 'ended'
    // listener + check()'s parentNode null-check handle final cleanup.
  }

  // ── Namespace exposure ──
  window.__gdiStudy.playerGuard = {
    STALL_MS: STALL_MS,
    FIRST_PLAY_HINT_MS: FIRST_PLAY_HINT_MS,
    attach: attach
  };

  // ★ FIX (Agent 18 Bug 4): guard Bus.onGlobal — Bus may be undefined if this
  //    module loads before app.min.js (or in test environments). Without the
  //    guard, `Bus.onGlobal` throws ReferenceError and breaks the entire module.
  if(typeof Bus !== 'undefined' && typeof Bus.onGlobal === 'function'){
    Bus.onGlobal('media:ready',function(d){
      if(d&&d.type==='video'&&d.el)attach(d.el);
    });
    // ★ FIX 20-6 #14 (Agent 6): clear all active guards' timers on page:change.
    //    See _clearAllGuards() docstring above for the leak this prevents.
    Bus.onGlobal('page:change', function(){
      try{ _clearAllGuards(); }catch(e){console.warn('[GDI Player-Guard] page:change _clearAllGuards failed:',e&&e.message);}
    });
  }

  window.GDI_MODULES.push({name:'player-guard',init:function(){
    try{
      const v=document.querySelector('.gdi-player-wrap video');
      if(v)attach(v);
    }catch(e){console.warn('[GDI Player-Guard] GDI_MODULES init failed:',e&&e.message);}
  }});
})();
