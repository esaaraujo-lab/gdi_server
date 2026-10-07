// ═══════════════════════════════════════════════════════════════
// gdi-player-enhancer.js — v1.0.138
// Features do player de vídeo:
// 1. Memória de velocidade por curso (cada curso lembra sua velocidade)
// 2. Atalhos de teclado (J/K/L, ←→, ↑↓, números, M, F)
// 3. "Continuar de onde parou" — prompt visual com resume
//
// Funciona com TODOS os players (plyr, videojs, dplayer, jwplayer, shaka, native)
// porque opera no elemento <video> diretamente, não na API do player.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  // ── Helpers ──
  function courseKey(){
    try{
      const m=window.playlistVideos&&window.playlistVideos[window.currentIndex];
      if(m&&m.folder){return m.folder;}
    }catch(_){}
    return window.location.pathname.split('/').slice(0,-1).join('/')+'/';
  }

  function getVideoEl(){
    // Tenta vários seletores (diferentes players usam IDs diferentes)
    return document.querySelector('.gdi-player-wrap video') ||
           document.getElementById('player') ||
           document.getElementById('vplayer') ||
           document.querySelector('video');
  }

  function fmtTime(s){
    if(!isFinite(s)||isNaN(s))return'0:00';
    const m=Math.floor(s/60),sec=Math.floor(s%60);
    return m+':'+(sec<10?'0':'')+sec;
  }

  // ═══ 1. MEMÓRIA DE VELOCIDADE POR CURSO ═══
  const SPEED_KEY='gdi-video-speed-';
  function getSavedSpeed(){
    try{return parseFloat(localStorage.getItem(SPEED_KEY+courseKey()))||1;}catch(_){return 1;}
  }
  function saveSpeed(rate){
    try{localStorage.setItem(SPEED_KEY+courseKey(), String(rate));}catch(_){}
  }

  function applySpeed(video){
    if(!video)return;
    const speed=getSavedSpeed();
    try{
      video.playbackRate=speed;
      // Atualiza o seletor de velocidade do Plyr se existir
      if(window._gdiPlayerInstance && typeof window._gdiPlayerInstance.speed==='function'){
        try{window._gdiPlayerInstance.speed(speed);}catch(_){}
      }
    }catch(_){}
  }

  function setupSpeedMemory(video){
    if(!video||video.__gdiSpeedMem)return;
    video.__gdiSpeedMem=true;
    // Aplica velocidade salva quando metadata carrega
    video.addEventListener('loadedmetadata',()=>applySpeed(video));
    // Salva quando usuário muda velocidade
    video.addEventListener('ratechange',()=>{
      if(video.playbackRate)saveSpeed(video.playbackRate);
    });
    // Aplica imediatamente se já tem metadata
    if(video.readyState>=1)applySpeed(video);
  }

  // ═══ 2. ATALHOS DE TECLADO ═══
  // J = -10s, L = +10s, K = play/pause
  // ← = -5s, → = +5s, ↑ = volume+, ↓ = volume-
  // 0-9 = seek to %, M = mute, F = fullscreen, C = legendas
  function setupKeyboardShortcuts(video){
    if(!video||video.__gdiKb)return;
    video.__gdiKb=true;

    document.addEventListener('keydown',function(e){
      // Não interferir se estiver digitando em input/textarea
      const tag=(e.target&&e.target.tagName)||'';
      if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT')return;
      if(e.target&&e.target.isContentEditable)return;

      const v=getVideoEl();
      if(!v)return;

      switch(e.key){
        case 'j':case 'J':
          v.currentTime=Math.max(0,v.currentTime-10);e.preventDefault();break;
        case 'l':case 'L':
          v.currentTime=Math.min(v.duration||0,v.currentTime+10);e.preventDefault();break;
        case 'k':case 'K':case ' ':
          if(v.paused)v.play().catch(()=>{});else v.pause();
          e.preventDefault();break;
        case 'ArrowLeft':
          v.currentTime=Math.max(0,v.currentTime-5);e.preventDefault();break;
        case 'ArrowRight':
          v.currentTime=Math.min(v.duration||0,v.currentTime+5);e.preventDefault();break;
        case 'ArrowUp':
          v.volume=Math.min(1,v.volume+0.1);e.preventDefault();break;
        case 'ArrowDown':
          v.volume=Math.max(0,v.volume-0.1);e.preventDefault();break;
        case 'm':case 'M':
          v.muted=!v.muted;e.preventDefault();break;
        case 'f':case 'F':
          try{
            if(document.fullscreenElement)document.exitFullscreen();
            else{
              const wrap=v.closest('.gdi-player-wrap')||v.parentElement||v;
              if(wrap.requestFullscreen)wrap.requestFullscreen();
              else if(v.requestFullscreen)v.requestFullscreen();
            }
          }catch(_){}
          e.preventDefault();break;
        case '0':case '1':case '2':case '3':case '4':
        case '5':case '6':case '7':case '8':case '9':
          if(v.duration){
            v.currentTime=v.duration*(parseInt(e.key)/10);
            e.preventDefault();
          }
          break;
      }
    });
  }

  // ═══ 3. "CONTINUAR DE ONDE PAROU" ═══
  function showResumePrompt(video){
    if(!video||video.__gdiResumePrompt)return;
    video.__gdiResumePrompt=true;

    // Pega o tempo salvo do GDIUser (resume state)
    let resumeData=null;
    try{
      if(window.GDIUser&&typeof window.GDIUser.getResume==='function'){
        const key=window.location.pathname;
        resumeData=window.GDIUser.getResume(key);
      }
    }catch(_){}

    if(!resumeData||!resumeData.t||resumeData.t<10)return;
    // Não mostra se o vídeo é menor que o tempo salvo (já terminou)
    video.addEventListener('loadedmetadata',()=>{
      if(video.duration&&resumeData.t>=video.duration-5)return;
      if(video.duration&&resumeData.t<10)return;

      // Cria o prompt
      const wrap=video.closest('.gdi-player-wrap')||video.parentElement;
      if(!wrap)return;
      // Remove prompt anterior se existir
      const old=wrap.querySelector('.gdi-resume-prompt');
      if(old)old.remove();

      const prompt=document.createElement('div');
      prompt.className='gdi-resume-prompt';
      prompt.style.cssText='position:absolute;top:12px;left:12px;z-index:30;background:rgba(13,15,20,.95);border:1px solid rgba(255,139,159,.4);border-radius:10px;padding:10px 14px;color:#fff;font-size:13px;display:flex;align-items:center;gap:10px;box-shadow:0 8px 24px rgba(0,0,0,.5);max-width:90%;font-family:var(--ferreto-font-body,system-ui,sans-serif);';
      prompt.innerHTML=
        '<i class="bi bi-arrow-clockwise" style="color:#ff8b9f;font-size:16px;"></i>'+
        '<span>Continuar de <b style="color:#ff8b9f;">'+fmtTime(resumeData.t)+'</b>?</span>'+
        '<button id="gdi-resume-yes" style="background:linear-gradient(135deg,#ff8b9f,#c026d3);border:0;color:#fff;border-radius:6px;padding:4px 12px;font-size:12px;font-weight:600;cursor:pointer;">Continuar</button>'+
        '<button id="gdi-resume-no" style="background:transparent;border:1px solid rgba(255,255,255,.2);color:#8b949e;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;">Não</button>';
      wrap.appendChild(prompt);

      const yesBtn=prompt.querySelector('#gdi-resume-yes');
      const noBtn=prompt.querySelector('#gdi-resume-no');
      if(yesBtn)yesBtn.onclick=()=>{
        try{video.currentTime=resumeData.t;}catch(_){}
        prompt.remove();
      };
      if(noBtn)noBtn.onclick=()=>{prompt.remove();};

      // Auto-remove após 10s
      setTimeout(()=>{if(prompt.parentElement)prompt.remove();},10000);
    });
  }

  // ═══ INICIALIZAÇÃO ═══
  function enhanceVideo(video){
    if(!video)return;
    setupSpeedMemory(video);
    setupKeyboardShortcuts(video);
    showResumePrompt(video);
  }

  // Observa quando um <video> aparece no DOM
  function startObserver(){
    const wrap=document.querySelector('.gdi-player-wrap');
    if(!wrap){
      // Tenta direto
      const v=document.querySelector('video');
      if(v)enhanceVideo(v);
      // Retry em 2s
      setTimeout(startObserver,2000);
      return;
    }
    const v=wrap.querySelector('video');
    if(v){
      enhanceVideo(v);
    }
    // Observer para futuros vídeos (switchVideo)
    const obs=new MutationObserver(()=>{
      const v2=wrap.querySelector('video');
      if(v2&&!v2.__gdiEnhanced){
        v2.__gdiEnhanced=true;
        enhanceVideo(v2);
      }
    });
    obs.observe(wrap,{childList:true,subtree:true});
  }

  // Inicia quando o DOM estiver pronto
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>setTimeout(startObserver,1000));
  }else{
    setTimeout(startObserver,1000);
  }

  // Re-aplica quando vídeo muda (media:ready event)
  try{
    if(typeof Bus!=='undefined'&&Bus&&typeof Bus.onGlobal==='function'){
      Bus.onGlobal('media:ready',({type,el})=>{
        if(type==='video'&&el){
          setTimeout(()=>{
            enhanceVideo(el);
            // Re-aplica velocidade
            el.playbackRate=getSavedSpeed();
          },300);
        }
      });
    }
  }catch(_){}

  // Atalho: '?' mostra ajuda
  document.addEventListener('keydown',function(e){
    if(e.key==='?'&&(e.shiftKey)){
      const tag=(e.target&&e.target.tagName)||'';
      if(tag==='INPUT'||tag==='TEXTAREA')return;
      showShortcutsHelp();
      e.preventDefault();
    }
  });

  function showShortcutsHelp(){
    const old=document.querySelector('.gdi-shortcuts-help');
    if(old){old.remove();return;}
    const help=document.createElement('div');
    help.className='gdi-shortcuts-help';
    help.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10000;background:var(--ferreto-bg-2,#0d1119);border:1px solid var(--ferreto-border,#30363d);border-radius:14px;padding:24px;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,.6);font-family:var(--ferreto-font-body,system-ui,sans-serif);';
    help.innerHTML=
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'+
      '<b style="color:var(--ferreto-text,#f0f6fc);font-size:16px;">⌨️ Atalhos do Player</b>'+
      '<button onclick="this.closest(\'.gdi-shortcuts-help\').remove()" style="background:none;border:0;color:var(--ferreto-text-muted);font-size:20px;cursor:pointer;">✕</button>'+
      '</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;font-size:13px;color:var(--ferreto-text,#e6edf3);">'+
      '<div><kbd style="background:var(--ferreto-surface-2);padding:2px 6px;border-radius:4px;">J</kbd> Voltar 10s</div>'+
      '<div><kbd style="background:var(--ferreto-surface-2);padding:2px 6px;border-radius:4px;">L</kbd> Avançar 10s</div>'+
      '<div><kbd style="background:var(--ferreto-surface-2);padding:2px 6px;border-radius:4px;">K / Espaço</kbd> Play/Pause</div>'+
      '<div><kbd style="background:var(--ferreto-surface-2);padding:2px 6px;border-radius:4px;">← / →</kbd> ±5s</div>'+
      '<div><kbd style="background:var(--ferreto-surface-2);padding:2px 6px;border-radius:4px;">↑ / ↓</kbd> Volume</div>'+
      '<div><kbd style="background:var(--ferreto-surface-2);padding:2px 6px;border-radius:4px;">M</kbd> Mudo</div>'+
      '<div><kbd style="background:var(--ferreto-surface-2);padding:2px 6px;border-radius:4px;">F</kbd> Tela cheia</div>'+
      '<div><kbd style="background:var(--ferreto-surface-2);padding:2px 6px;border-radius:4px;">0-9</kbd> Seek 0-90%</div>'+
      '</div>'+
      '<p style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-top:12px;">Velocidade é lembrada por curso. Pressione ? para fechar.</p>';
    document.body.appendChild(help);
  }

  console.log('[GDI Player Enhancer] v1.0.138 — speed memory + keyboard shortcuts + resume prompt');
})();
