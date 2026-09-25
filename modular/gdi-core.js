// ═══════════════════════════════════════════════════════════════
// gdi-core.js — Bootstrap + M1-M7 + M9 (materiais)
// 
// Módulo base do GDI Extras. Define:
//   • window.GDI_MODULES (array de módulos)
//   • Bus (event bus global)
//   • showToast, gdiListAllFiles, password-safe, etc.
//   • M1-M7 (auth, video speed, atalhos, cronômetro, marcas/notas, skip intro)
//   • M9 (materiais — UI de PDFs por aula)
//
// Deve ser carregado PRIMEIRO no loader.html
// ═══════════════════════════════════════════════════════════════

/* ═══════════════════════════════════════════════════════════════
   gdi-extras.js v2.6-fix — COMPLETO
   ★FIX PRINCIPAL (o travamento de verdade): o M20 tinha um
     MutationObserver observando a própria lista que ele reescrevia.
     Quando o render demorava >150ms (playlists grandes), o observer
     se auto-disparava INFINITAMENTE: render → mutação → observer →
     render → … A main thread ficava presa para sempre — por isso o
     "Aguardar ou fechar" do Chrome nunca resolvia. O observer foi
     REMOVIDO; a playlist agora re-renderiza só via Bus.
   Outras correções: teto de 600 itens + 1 listener delegado (M20),
     listeners globais fora do init (M10/M6), observer do M14
     desconectado ao trocar de página, M9 não reconstrói na mesma
     aula, M7 só toca no DOM quando muda, M22 limita cursos.
   ═══════════════════════════════════════════════════════════════ */
console.log('[GDI Extras Modular] v2.7 carregado');
const GDI_ROOT=()=>document.documentElement; // UI flutuante vive aqui (fora do body)

window.GDI_MODULES = window.GDI_MODULES || [];

// ═══ HELPER GLOBAL: SRS (Spaced Repetition) UNIFICADO ═══
// Algoritmo SM-2 simplificado (mesmo do Anki). Usado por M9-ISA e M22
// para evitar conflitos de intervalos diferentes.
//
// Qualidade (quality):
//   1 = Again (não sabia)  → box=0, due=+1dia
//   2 = Hard (quase)       → box mantém, due=+3dias
//   3 = Good (sabia)       → box+1, due=intervalo[box]
//   4 = Easy (fácil)       → box+2, due=intervalo[box]*1.5
//
// Intervalos por caixa: [1, 3, 7, 21, 60] dias (5 caixas, cap 4)
window.gdiGradeCard = window.gdiGradeCard || function(card, quality){
  if(!card)card={box:0};
  const BOX_INTERVALS=[1,3,7,21,60]; // dias
  const DAY=86400000;
  const box=Math.max(0,Math.min(4,card.box||0));
  let newBox=box, due;
  if(quality===1){ // Again
    newBox=0;
    due=Date.now()+DAY;
  }else if(quality===2){ // Hard
    newBox=box; // mantém
    due=Date.now()+3*DAY;
  }else if(quality===3){ // Good
    newBox=Math.min(4,box+1);
    due=Date.now()+BOX_INTERVALS[newBox]*DAY;
  }else{ // Easy (4)
    newBox=Math.min(4,box+2);
    due=Date.now()+Math.round(BOX_INTERVALS[newBox]*1.5*DAY);
  }
  return {box:newBox, due:due, lastReview:Date.now()};
};
// expor intervalos para UI mostrar "próxima revisão em X dias"
window.gdiSrsIntervals = [1,3,7,21,60];

// ═══ HELPER GLOBAL: TRILHAS DE ESTUDO + CONQUISTAS + ONBOARDING ═══
// Trilhas: agrupam cursos + matérias em uma meta (ex: "Auditor Fiscal")
// Conquistas: marcos gamificados (streak, cards, aulas)
// Onboarding: tour inicial para novos usuários
window.gdiTrails = window.gdiTrails || {
  LS:'gdi-trails-v1',
  get(){try{const v=localStorage.getItem(this.LS);return v?JSON.parse(v):[];}catch(_){return [];}},
  save(t){const arr=this.get();const i=arr.findIndex(x=>x.id===t.id);if(i>=0)arr[i]=t;else arr.push(t);try{localStorage.setItem(this.LS,JSON.stringify(arr));}catch(_){}},
  delete(id){try{localStorage.setItem(this.LS,JSON.stringify(this.get().filter(x=>x.id!==id)));}catch(_){}}
};

window.gdiAchievements = window.gdiAchievements || {
  LS:'gdi-achievements-v1',
  _defs:[
    {id:'first_lesson',icon:'🎬',title:'Primeira aula',desc:'Assista sua primeira aula',check:s=>s.watched>=1},
    {id:'streak_3',icon:'🔥',title:'3 dias seguidos',desc:'Mantenha uma sequência de 3 dias',check:s=>s.streak>=3},
    {id:'streak_7',icon:'⚡',title:'Semana completa',desc:'7 dias seguidos estudando',check:s=>s.streak>=7},
    {id:'streak_30',icon:'🏆',title:'Mês de ferro',desc:'30 dias seguidos',check:s=>s.streak>=30},
    {id:'cards_50',icon:'🃏',title:'50 flashcards',desc:'Estude 50 flashcards',check:s=>s.cardsStudied>=50},
    {id:'cards_100',icon:'🎴',title:'100 flashcards',desc:'Estude 100 flashcards',check:s=>s.cardsStudied>=100},
    {id:'cards_500',icon:'💎',title:'Mestre dos cards',desc:'500 flashcards estudados',check:s=>s.cardsStudied>=500},
    {id:'simulado_1',icon:'🎯',title:'Primeiro simulado',desc:'Complete um simulado',check:s=>s.simulados>=1},
    {id:'simulado_5',icon:'📊',title:'5 simulados',desc:'Complete 5 simulados',check:s=>s.simulados>=5},
    {id:'goal_met',icon:'⭐',title:'Meta batida',desc:'Atinge sua meta diária',check:s=>s.goalMet},
    {id:'flashcard_create',icon:'✨',title:'Criou um card',desc:'Crie seu primeiro flashcard',check:s=>s.cardsCreated>=1},
    {id:'summary_gen',icon:'📋',title:'Primeiro resumo',desc:'Gere um resumo com a Meggy',check:s=>s.summaries>=1},
  ],
  getUnlocked(){
    try{return JSON.parse(localStorage.getItem(this.LS)||'[]');}catch(_){return [];}
  },
  isUnlocked(id){return this.getUnlocked().includes(id);},
  unlock(id){
    const arr=this.getUnlocked();
    if(!arr.includes(id)){
      arr.push(id);
      try{localStorage.setItem(this.LS,JSON.stringify(arr));}catch(_){}
      // dispara toast comemorativo
      const def=this._defs.find(d=>d.id===id);
      if(def&&window.showToast){
        setTimeout(()=>window.showToast(`🎉 Conquista desbloqueada: ${def.title}!`),500);
      }
    }
  },
  checkAll(stats){
    // stats = {watched, streak, cardsStudied, simulados, goalMet, cardsCreated, summaries}
    this._defs.forEach(d=>{
      if(!this.isUnlocked(d.id)&&d.check(stats)){
        this.unlock(d.id);
      }
    });
  },
  defs(){return this._defs;}
};

// ═══ HELPER GLOBAL: MODAL CUSTOMIZADO (substitui confirm() nativo) ═══
// Mantém o tema Ferreto. Retorna Promise<boolean>.
window.gdiModal = window.gdiModal || function(opts){
  return new Promise((resolve)=>{
    const {title='',message='',confirmText='Confirmar',cancelText='Cancelar',danger=false,input=null}=opts||{};
    // remove modais anteriores
    document.querySelectorAll('.gdi-modal-overlay').forEach(m=>m.remove());
    const overlay=document.createElement('div');
    overlay.className='gdi-modal-overlay';
    overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(4px);z-index:100002;display:flex;align-items:center;justify-content:center;padding:20px;animation:gdi-modal-fade .2s ease;';
    overlay.innerHTML=`<div class="gdi-modal-box" style="background:var(--ferreto-bg-2,#0d1119);border:1px solid var(--ferreto-border,#21262d);border-radius:14px;max-width:480px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.6);">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--ferreto-border,#21262d);">
        <b style="color:var(--ferreto-text,#f0f6fc);font-size:15px;font-family:var(--ferreto-font-display,'Poppins',sans-serif);">${escModal(title)}</b>
        <button class="gdi-modal-x" style="background:transparent;border:0;color:var(--ferreto-text-muted,#8b949e);cursor:pointer;font-size:18px;padding:4px 8px;border-radius:6px;">✕</button>
      </div>
      <div style="padding:20px;">
        <p style="color:var(--ferreto-text,#e6edf3);font-size:14px;line-height:1.6;margin:0 0 16px;white-space:pre-wrap;">${escModal(message)}</p>
        ${input?`<input id="gdi-modal-input" placeholder="${escModal(input.placeholder||'')}" value="${escModal(input.value||'')}" style="width:100%;box-sizing:border-box;background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:10px 12px;font-size:14px;font-family:inherit;">`:''}
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;padding:0 20px 16px;flex-wrap:wrap;">
        <button class="gdi-modal-cancel gdi-mode-btn" style="font-size:13px;">${escModal(cancelText)}</button>
        <button class="gdi-modal-confirm ${danger?'gdi-modal-danger':''}" style="font-size:13px;padding:8px 16px;border-radius:8px;border:0;cursor:pointer;font-family:inherit;font-weight:600;${danger?'background:#ff6b6b;color:#fff;':'background:var(--ferreto-grad);color:#fff;'}">${escModal(confirmText)}</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    // animação
    if(!document.getElementById('gdi-modal-style')){
      const s=document.createElement('style');s.id='gdi-modal-style';
      s.textContent='@keyframes gdi-modal-fade{from{opacity:0}to{opacity:1}}@keyframes gdi-modal-pop{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}.gdi-modal-box{animation:gdi-modal-pop .2s ease;}.gdi-modal-cancel:hover{background:rgba(255,255,255,.1)!important;}.gdi-modal-danger:hover{filter:brightness(1.1);}.gdi-modal-x:hover{background:rgba(255,107,107,.15)!important;color:#ff6b6b!important;}';
      document.head.appendChild(s);
    }
    const close=(result)=>{
      overlay.remove();
      resolve(result);
    };
    overlay.querySelector('.gdi-modal-x').onclick=()=>close(input?null:false);
    overlay.querySelector('.gdi-modal-cancel').onclick=()=>close(input?null:false);
    overlay.querySelector('.gdi-modal-confirm').onclick=()=>{
      if(input){
        const val=overlay.querySelector('#gdi-modal-input').value.trim();
        close(val||null);
      }else close(true);
    };
    overlay.onclick=(e)=>{if(e.target===overlay)close(input?null:false);};
    // ESC para fechar
    const escHandler=(e)=>{if(e.key==='Escape'){close(input?null:false);document.removeEventListener('keydown',escHandler);}};
    document.addEventListener('keydown',escHandler);
    // foca no input ou no botão confirm
    setTimeout(()=>{
      if(input){overlay.querySelector('#gdi-modal-input').focus();}
      else{overlay.querySelector('.gdi-modal-confirm').focus();}
    },50);
  });
};
function escModal(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

// ═══ HELPER GLOBAL: SANITIZAÇÃO HTML (anti-XSS) ═══
// Usado por todos os renderMd() dos módulos para evitar XSS via LLM
// ou resumos compartilhados. Tenta DOMPurify se disponível; senão,
// faz uma sanitização básica removendo tags perigosas.
window.gdiSanitize = window.gdiSanitize || function(html){
  if(window.DOMPurify){
    try{return window.DOMPurify.sanitize(html,{ALLOWED_TAGS:['h1','h2','h3','h4','h5','h6','p','br','hr','ul','ol','li','strong','em','b','i','u','s','code','pre','blockquote','table','thead','tbody','tr','th','td','a','img','span','div','sup','sub','mark','del','ins'],ALLOWED_ATTR:['href','src','alt','title','class','target','rel','width','height','colspan','rowspan']});}catch(_){return html;}
  }
  // fallback básico: remove <script>, on* handlers, javascript: URLs
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi,'')
    .replace(/<style[\s\S]*?<\/style>/gi,'')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi,'')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi,'')
    .replace(/\son\w+\s*=\s*'[^']*'/gi,'')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi,'')
    .replace(/(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi,'$1="#"');
};
// auto-load DOMPurify do CDN se não estiver presente
if(!window.DOMPurify && !window.__gdiPurifyLoading){
  window.__gdiPurifyLoading=true;
  const s=document.createElement('script');
  s.src='https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js';
  s.crossOrigin='anonymous';
  s.onload=()=>console.log('[GDI] DOMPurify carregado');
  s.onerror=()=>console.warn('[GDI] DOMPurify falhou — usando fallback básico');
  document.head.appendChild(s);
}

// ═══ HELPER GLOBAL: CONSOLIDATED pdf.js LOADER (★C.1 — PATCH F) ═══
// Idempotente: carrega pdfjs-dist@3.11.174 uma única vez e seta workerSrc
// UMA vez (antes: 4 loaders diferentes competiam, causando race conditions).
// M9 (mobile), gdi-pdf.js, gdi-meggy.js e gdi-study.js devem usar isto.
window.gdiEnsurePdfjs = window.gdiEnsurePdfjs || function(){
  if(window._pdfjsPromise)return window._pdfjsPromise;
  const PDFJS_LIB='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
  const PDFJS_WORKER='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  window._pdfjsPromise=new Promise((resolve,reject)=>{
    // carrega o script UMA vez (se já carregado, pula esta etapa)
    const loadScript = ()=>new Promise((res,rej)=>{
      if(window.pdfjsLib)return res();
      const s=document.createElement('script');
      s.src=PDFJS_LIB;
      s.crossOrigin='anonymous';
      s.onload=res;
      s.onerror=()=>rej(new Error('pdf.js failed to load'));
      document.head.appendChild(s);
    });
    loadScript().then(()=>{
      if(!window.pdfjsLib){
        return reject(new Error('pdf.js loaded but pdfjsLib missing'));
      }
      // ★C.1: ÚNICA atribuição de workerSrc (guard _gdiWorkerSrcSet — idempotente)
      if(!window.pdfjsLib._gdiWorkerSrcSet){
        try{window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS_WORKER;}catch(_){}
        window.pdfjsLib._gdiWorkerSrcSet=true;
      }
      resolve(window.pdfjsLib);
    }).catch(reject);
  });
  return window._pdfjsPromise;
};

// ═══ HELPER GLOBAL: STREAK CACHE (★C.4) ═══
// Pré-computa o streak (dias seguidos assistindo) uma vez por user:ready
// e incrementalmente em watched:changed. O handler de timeupdate em M5
// lê o cache (O(1)) em vez de re-loopar todos os watched (O(N)) a cada
// segundo de vídeo.
window._gdiStreakCache = window._gdiStreakCache || 0;
window._gdiComputeStreak = window._gdiComputeStreak || function(){
  try{
    const d=(window.GDIUser&&GDIUser.dump)?GDIUser.dump():{};
    const w=d.watched||{};
    const acts={};
    const touch=ts=>{if(ts){const k=new Date(ts).toDateString();acts[k]=(acts[k]||0)+1;}};
    for(const k in w)touch(w[k]&&w[k].at);
    let streak=0;const dd=new Date();const has=x=>acts[x.toDateString()];
    if(!has(dd))dd.setDate(dd.getDate()-1);
    while(has(dd)){streak++;dd.setDate(dd.getDate()-1);}
    window._gdiStreakCache=streak;
  }catch(_){}
};
Bus.onGlobal('user:ready',window._gdiComputeStreak);
Bus.onGlobal('watched:changed',window._gdiComputeStreak);

// ── CSS dos módulos (injetado 1×) ──
(function(){if(document.getElementById('gdi-extras-style'))return;const s=document.createElement('style');s.id='gdi-extras-style';s.textContent=`
.gdi-debug-wrap{width:100%;background:#0d1117;border-top:2px solid #f0883e;font-family:monospace;font-size:12px;}
.gdi-debug-head{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:#161b22;cursor:pointer;user-select:none;color:var(--ferreto-text-muted,#8b949e);}
.gdi-debug-head:hover{background:#1c2128;}
.gdi-debug-head strong{color:#f0f6fc;display:flex;align-items:center;gap:6px;}
.gdi-dbg-count{background:#1f6feb;color:#fff;border-radius:10px;padding:1px 7px;font-size:11px;margin-left:4px;}
.gdi-debug-actions{display:flex;gap:8px;}
.gdi-debug-actions button{background:none;border:1px solid #30363d;color:var(--ferreto-text-muted,#8b949e);border-radius:4px;padding:2px 9px;cursor:pointer;font-size:11px;}
.gdi-debug-actions button:hover{background:#1c2128;color:#f0f6fc;}
#gdi-debug-log{max-height:300px;overflow-y:auto;padding:10px 14px;background:#0d1117;color:var(--ferreto-text,#e6edf3);}
#gdi-debug-log.collapsed{display:none;}
.gdi-dbg-entry{padding:3px 0;border-bottom:1px solid #21262d;line-height:1.6;}
.gdi-dbg-ts{color:#484f58;margin-right:6px;}
.gdi-dbg-badge{font-weight:bold;margin-right:6px;}
.gdi-dbg-msg{color:var(--ferreto-text,#e6edf3);}
.gdi-dbg-pre{margin:2px 0 2px 20px;padding:4px 8px;background:#161b22;border-left:2px solid #30363d;white-space:pre-wrap;word-break:break-all;color:var(--ferreto-text-muted,#8b949e);font-size:11px;}
.gdi-dbg-empty{color:#484f58;}
.gdi-mat-head{display:flex;align-items:center;justify-content:space-between;font-size:14px;color:var(--ferreto-text,#e6edf3);}
.gdi-mat-head strong{display:flex;align-items:center;gap:6px;}
#gdi-mat-status{font-size:11px;color:var(--ferreto-text-muted,#8b949e);}
.gdi-mat-tabs{display:flex;flex-wrap:wrap;gap:6px;}
.gdi-mat-tab{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
  min-width:74px;padding:7px 8px;border-radius:10px;cursor:pointer;user-select:none;
  background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#c9d1d9;transition:all .15s;}
.gdi-mat-tab i{font-size:20px;}
.gdi-mat-tab span{font-size:10px;font-weight:600;letter-spacing:.02em;}
.gdi-mat-tab:hover{background:rgba(255,255,255,.13);color:#fff;}
.gdi-mat-tab.active{background:var(--bs-primary,#1f6feb);border-color:var(--bs-primary,#1f6feb);color:#fff;}
.gdi-mat-body{height:calc(100dvh - 250px);min-height:420px;border:1px solid rgba(255,255,255,.12);
  border-radius:12px;overflow:hidden;background:#161b22;position:relative;}
body.gdi-fm .gdi-mat-body{height:calc(100dvh - 180px);min-height:480px;}
.gdi-notes{border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:10px;background:rgba(0,0,0,.18);}
.gdi-notes-head{display:flex;justify-content:space-between;align-items:center;font-size:13px;color:var(--ferreto-text,#e6edf3);margin-bottom:6px;flex-wrap:wrap;gap:6px;}
#gdi-note-input{width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:8px;
  color:var(--ferreto-text,#e6edf3);padding:8px;font-size:13px;resize:vertical;min-height:44px;}
.gdi-notes-actions{display:flex;align-items:center;gap:8px;margin-top:6px;}
#gdi-note-time{font-size:11px;color:var(--ferreto-primary,#7aa2ff);font-variant-numeric:tabular-nums;cursor:pointer;}
#gdi-note-save{margin-left:auto;background:var(--bs-primary,#1f6feb);border:0;color:#fff;border-radius:7px;
  padding:5px 12px;font-size:12px;cursor:pointer;}
#gdi-notes-list{margin-top:8px;max-height:200px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;}
.gdi-note{display:flex;gap:8px;align-items:flex-start;background:rgba(255,255,255,.05);border-radius:8px;padding:6px 8px;font-size:12px;}
.gdi-note-time{color:var(--ferreto-primary,#7aa2ff);cursor:pointer;white-space:nowrap;font-variant-numeric:tabular-nums;font-size:11px;margin-top:2px;}
.gdi-note-text{flex:1;color:var(--ferreto-text,#e6edf3);word-break:break-word;}
.gdi-note-del{background:none;border:0;color:var(--ferreto-text-muted,#8b949e);cursor:pointer;font-size:13px;padding:0 2px;}
.gdi-note-del:hover{color:#ff6b6b;}
.gdi-notes-empty{color:var(--ferreto-text-muted,#8b949e);font-size:12px;text-align:center;padding:6px;}
/* ★ Pomodoro agora é botão na navbar — fab flutuante removido */

#gdi-sleep-btn{opacity:.8;transition:opacity .25s ease;}
#gdi-sleep-btn:hover{opacity:1;}
#gdi-note-marks{position:relative;height:16px;margin-top:4px;cursor:pointer;display:none;}
.gdi-note-mark{position:absolute;top:3px;width:10px;height:10px;border-radius:50%;background:#7aa2ff;
  border:2px solid #0b0e14;transform:translateX(-50%);transition:transform .12s,background .12s;}
.gdi-note-mark:hover{background:#ffd43b;transform:translateX(-50%) scale(1.35);}
#gdi-progress-line{margin-top:6px;display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ferreto-text-muted,#8b949e);flex-wrap:wrap;}
#gdi-home-card{animation:gdi-card-in .3s ease;}
@keyframes gdi-card-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
.gdi-player-wrap{position:relative;}
#gdi-skip-intro{position:absolute;right:14px;bottom:64px;z-index:20;background:rgba(13,15,20,.92);
  border:1px solid rgba(255,255,255,.4);color:#fff;border-radius:8px;padding:8px 14px;font-size:13px;
  cursor:pointer;display:none;box-shadow:0 6px 20px rgba(0,0,0,.5);}
#gdi-skip-intro:hover{background:rgba(45,50,62,.95);}
.gdi-modprog{margin-left:8px;font-size:11px;color:var(--ferreto-text-muted,#8b949e);background:rgba(255,255,255,.06);
  border-radius:6px;padding:2px 8px;white-space:nowrap;}
.gdi-modprog b{color:#8ab4ff;font-weight:600;}
.gdi-pdf-controls{display:flex;align-items:center;gap:10px;padding:8px 16px;border-bottom:1px solid rgba(255,255,255,.12);flex-wrap:wrap;}
/* ★FIX: playlist por classes (igual ao core) — sem estilo inline por item */
.gdi-playlist-item{padding:8px 12px;margin:3px 0;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;font-size:13px;background:rgba(255,255,255,0.05);color:var(--gdi-text,#e6edf3);transition:background .15s;}
.gdi-playlist-item:hover{background:rgba(255,255,255,0.12);}
.gdi-playlist-item>div:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80%;}
.gdi-playlist-item.cur{background:var(--bs-primary,#1f6feb);color:#fff;}
.gdi-playlist-item.watched{opacity:.75;}
.gdi-playlist-item.watched .bi-check-circle-fill{color:#3fb950;}
.gdi-pl-size{font-size:11px;opacity:.8;white-space:nowrap;}
/* ★ Pomodoro: painel dropdown a partir da navbar (não mais flutuante) */
#gdi-pom-nav{position:relative;}
#gdi-pom-nav-btn{display:flex;align-items:center;gap:7px;background:var(--ferreto-surface-2,rgba(255,255,255,.045));
  border:1px solid var(--ferreto-border,rgba(255,255,255,.09));color:var(--ferreto-text,#f3f5fa);
  border-radius:999px;padding:7px 13px;font-size:13.5px;font-weight:500;cursor:pointer;
  text-decoration:none;transition:.15s;font-family:var(--ferreto-font-body,'Rubik',sans-serif);}
#gdi-pom-nav-btn:hover{background:var(--ferreto-surface-3,rgba(255,255,255,.08));border-color:var(--ferreto-border-strong,rgba(255,255,255,.16));color:var(--ferreto-text,#f3f5fa);transform:translateY(-1px);}
#gdi-pom-nav-btn .gdi-pom-nav-ico{font-size:16px;}
#gdi-pom-nav-btn .gdi-pom-nav-time{font-size:12px;font-variant-numeric:tabular-nums;color:var(--ferreto-primary,#ff8b9f);font-weight:600;}
#gdi-pom-panel{position:absolute;top:calc(100% + 8px);right:0;width:260px;
  background:var(--ferreto-surface,rgba(22,27,38,.92));-webkit-backdrop-filter:blur(22px);backdrop-filter:blur(22px);
  border:1px solid var(--ferreto-border-strong,rgba(255,255,255,.16));border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.55);
  padding:16px 16px 12px;transform-origin:top right;transform:scale(.85) translateY(-10px);
  opacity:0;pointer-events:none;transition:transform .22s cubic-bezier(.34,1.45,.64,1),opacity .18s;z-index:10001;}
#gdi-pom-panel.open{transform:scale(1) translateY(0);opacity:1;pointer-events:all;}
.gdi-pom-phase-label{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;
  margin-bottom:6px;text-align:center;color:var(--ferreto-text-muted,#9aa4b8);}
#gdi-pom-display{font-size:46px;font-weight:800;text-align:center;color:var(--ferreto-text,#f0f6fc);
  letter-spacing:.04em;font-variant-numeric:tabular-nums;line-height:1;}
#gdi-pom-progress{height:4px;background:var(--ferreto-surface-3,rgba(255,255,255,.1));border-radius:2px;margin:12px 0 10px;overflow:hidden;}
#gdi-pom-progress-bar{height:4px;border-radius:2px;width:100%;transition:width .3s linear,background .4s;}
#gdi-pom-sessions-dots{display:flex;gap:5px;justify-content:center;margin-bottom:10px;}
.gdi-pom-dot{width:8px;height:8px;border-radius:50%;background:var(--ferreto-surface-3,rgba(255,255,255,.14));transition:background .3s,transform .3s;}
.gdi-pom-dot.done{background:var(--ferreto-primary,#ff8b9f);transform:scale(1.15);}
#gdi-pom-btns{display:flex;gap:6px;justify-content:center;margin-bottom:6px;}
.gdi-pom-btn{background:var(--ferreto-surface-2,rgba(255,255,255,.08));border:1px solid var(--ferreto-border,rgba(255,255,255,.13));color:var(--ferreto-text,#e6edf3);
  border-radius:8px;padding:6px 12px;cursor:pointer;font-size:12px;transition:background .15s;white-space:nowrap;}
.gdi-pom-btn:hover{background:var(--ferreto-surface-3,rgba(255,255,255,.18));}
#gdi-pom-divider{height:1px;background:var(--ferreto-border,rgba(255,255,255,.08));margin:10px 0 8px;}
#gdi-pom-cfg{display:flex;flex-direction:column;gap:6px;}
.gdi-pom-cfg-row,.gdi-pom-switch{display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--ferreto-text-muted,#9aa4b8);}
.gdi-pom-switch{cursor:pointer;}
.gdi-pom-switch input{accent-color:var(--ferreto-primary,#ff8b9f);cursor:pointer;}
.gdi-pom-cfg-row input{width:44px;background:var(--ferreto-surface-2,rgba(255,255,255,.07));border:1px solid var(--ferreto-border,rgba(255,255,255,.13));
  border-radius:6px;color:var(--ferreto-text,#f0f6fc);text-align:center;padding:2px 4px;font-size:11px;}
#gdi-pom-flash{position:fixed;inset:0;z-index:9999;pointer-events:none;opacity:0;transition:opacity .15s;}
`;document.head.appendChild(s);})();

// ── Loader dos módulos (anti-tempestade) ──
// ★FIX: debounce 80→150ms
(function(){
  let timer=null,lastRun=0;
  function runAll(){
    if(Date.now()-lastRun<100){schedule();return;}
    lastRun=Date.now();
    (window.GDI_MODULES||[]).forEach(m=>{
      try{ if(m&&typeof m.init==='function') m.init(); }
      catch(e){ console.error('[GDI módulo]',m&&m.name,e); }
    });
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(runAll,150);}
  function bindContent(){
    const c=document.getElementById('content');
    if(c&&!c.__gdiModObs){c.__gdiModObs=true;
      new MutationObserver(schedule).observe(c,{childList:true});}
  }
  Bus.onGlobal('page:change',schedule);
  document.addEventListener('DOMContentLoaded',()=>{bindContent();schedule();});
  window.addEventListener('load',()=>{bindContent();schedule();});
  bindContent();
})();

// ═══ M1: SENHAS PROTEGIDAS ═══
(function(){
  const _PWK='gdi-'+(window.location.host||'local');
  function _pwXor(s){let o='';for(let i=0;i<s.length;i++)o+=String.fromCharCode(s.charCodeAt(i)^_PWK.charCodeAt(i%_PWK.length));return o}
  window.gdiSetPw=function(p,v){try{localStorage.setItem('gdi_pw_'+btoa(encodeURIComponent(p)),btoa(encodeURIComponent(_pwXor(String(v)))))}catch(_){}};
  window.gdiGetPw=function(p){try{
    const v=localStorage.getItem('gdi_pw_'+btoa(encodeURIComponent(p)));
    if(v==null)return'';
    return _pwXor(decodeURIComponent(atob(v)));
  }catch(_){return''}};
  try{
    if(localStorage.getItem('gdi_pw_migrated'))return;
    const del=[];
    for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);
      if(k&&k.indexOf('password')===0){const v=localStorage.getItem(k);if(v)gdiSetPw(k.slice(8),v);del.push(k);}}
    del.forEach(k=>localStorage.removeItem(k));
    localStorage.setItem('gdi_pw_migrated','1');
    if(del.length)console.log('[módulo senhas]',del.length,'senhas migradas');
  }catch(_){}
})();

// ═══ M2: AUTENTICAÇÃO (Entrar/Sair) ═══
(function(){
  window.gdiRenderAuth=function(){
    const slot=document.getElementById('gdi-auth-slot');
    if(!slot)return;
    const st=GDIUser.auth();
    if(st==='in'){
      slot.innerHTML='<a class="gdi-nav-btn" href="/logout" title="Sua conta \u2014 clique para sair (o progresso fica salvo nela)" onclick="try{GDIUser.flush()}catch(_){}"><i class="bi bi-person-check"></i><span class="d-none d-md-inline">Sair</span></a>';
    }else if(st==='out'){
      slot.innerHTML='<a class="gdi-nav-btn" href="/login" title="Entrar na sua conta para salvar o progresso"><i class="bi bi-box-arrow-in-right"></i><span class="d-none d-md-inline">Entrar</span></a>';
    }
  };
  window.GDI_MODULES.push({name:'auth',init:function(){window.gdiRenderAuth();}});
  Bus.onGlobal('auth:change',()=>window.gdiRenderAuth());
})();

// ═══ M3: VELOCIDADE DO VÍDEO SALVA ═══
(function(){
  const RKEY='gdi-rate';let applying=false;
  const getR=()=>{const v=parseFloat(localStorage.getItem(RKEY));return(v>=0.25&&v<=4)?v:null};
  document.addEventListener('ratechange',e=>{
    const v=e.target;if(!v||v.tagName!=='VIDEO'||applying)return;
    const r=v.playbackRate;if(r&&r>=0.25&&r<=4)try{localStorage.setItem(RKEY,String(r))}catch(_){}
  },true);
  const apply=v=>{const r=getR();if(!r||Math.abs(v.playbackRate-r)<0.01)return;
    applying=true;try{v.playbackRate=r}catch(_){}applying=false;};
  document.addEventListener('play',e=>{const v=e.target;if(v&&v.tagName==='VIDEO')apply(v)},true);
  document.addEventListener('loadedmetadata',e=>{const v=e.target;if(v&&v.tagName==='VIDEO')apply(v)},true);
})();

// ═══ M4: ATALHOS (N/P, J, ]/[ trechos) ═══
(function(){
  let marksVideo=null;
  Bus.onGlobal('media:ready',({type,el})=>{if(type==='video')marksVideo=el;});
  function notesNow(){try{return GDIUser.getNotes(window.location.pathname)||[]}catch(_){return[]}}
  document.addEventListener('keydown',e=>{
    const t=e.target;
    if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable))return;
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    const k=e.key.toLowerCase();
    if(k==='n'){const b=document.getElementById('gdi-btn-next');if(b&&!b.disabled){e.preventDefault();b.click();}}
    else if(k==='p'){const b=document.getElementById('gdi-btn-prev');if(b&&!b.disabled){e.preventDefault();b.click();}}
    else if(k==='j'){
      const pv=window.playlistVideos;if(!pv||!pv.length)return;
      const start=(typeof window.currentIndex==='number'&&window.currentIndex>=0)?window.currentIndex+1:0;
      for(let i2=start;i2<pv.length;i2++){
        let w=false;try{const raw=(pv[i2].pageUrl||'').split('?')[0];
          w=GDIUser.isWatched(raw)||(window.gdiNormKey&&GDIUser.isWatched(gdiNormKey(raw)));}catch(_){}
        if(!w){e.preventDefault();window.switchVideo(i2);return;}
      }
      showToast('Todas as aulas \u00e0 frente j\u00e1 foram assistidas \u2713');
    }
    else if(e.key===']'||e.key==='['){
      const v=marksVideo;if(!v)return;
      const notes=notesNow().slice().sort((a,b)=>a.t-b.t);if(!notes.length)return;
      const t2=v.currentTime;
      if(e.key===']'){const nx=notes.find(n=>n.t>t2+0.5);
        if(nx){try{v.currentTime=nx.t;v.play().catch(()=>{});}catch(_){}showToast('\u2192 trecho '+gdiFmtTime(nx.t));}}
      else{const pv=[...notes].reverse().find(n=>n.t<t2-1.5);
        if(pv){try{v.currentTime=pv.t;v.play().catch(()=>{});}catch(_){}showToast('\u2190 trecho '+gdiFmtTime(pv.t));}}
    }
  });
})();

// ═══ M5 v3: CRONÔMETRO + AUTO-ASSISTIDO 90% ═══
(function(){
  Bus.onGlobal('media:ready',({type,el})=>{
    if(type!=='video'||!el||el.__m5v3)return;
    el.__m5v3=true;
    const LAST_KEY=()=>window.location.pathname+(window.location.search||'');
    el.addEventListener('timeupdate',()=>{
      const el2=document.getElementById('gdi-note-time');
      if(el2)el2.textContent=gdiFmtTime(el.currentTime);
      if(!el.__autoW&&isFinite(el.duration)&&el.duration>60&&el.currentTime/el.duration>=0.9){
        el.__autoW=true;
        try{
          if(window.gdiMarkVideo)gdiMarkVideo();
          else GDIUser.markWatched(window.location.pathname);
          GDIUser.setLast(LAST_KEY());
        }catch(_){}
        Bus.emit('watched:changed');
        // ★ dispara checagem de conquistas
        if(window.gdiAchievements){
          try{
            const d=window.GDIUser&&GDIUser.dump?GDIUser.dump():{};
            const w=d.watched||{};
            // ★C.4: streak lê do cache (O(1)) — recalculado só em user:ready
            // e watched:changed. Antes: re-loopava todos os watched a cada
            // timeupdate (O(N) por segundo de vídeo).
            window.gdiAchievements.checkAll({
              watched:Object.keys(w).length,
              streak:window._gdiStreakCache||0,
              cardsStudied:parseInt(localStorage.getItem('gdi-cards-studied-count')||'0'),
              simulados:parseInt(localStorage.getItem('gdi-simulados-count')||'0'),
              goalMet:false,
              cardsCreated:(JSON.parse(localStorage.getItem('gdi-cards-v1')||'[]')).length,
              summaries:(JSON.parse(localStorage.getItem('gdi-isa-summaries-v1')||'[]')).length
            });
          }catch(_){}
        }
      }
    });
    el.addEventListener('loadedmetadata',()=>{
      const el3=document.getElementById('gdi-note-time');
      if(el3)el3.textContent='00:00';
    });
    const nt=document.getElementById('gdi-note-time');
    if(nt&&!nt.__seekB){nt.__seekB=true;
      nt.addEventListener('click',()=>{
        const v=document.querySelector('video');
        if(v&&nt.textContent.includes(':')){
          const pp=nt.textContent.split(':');
          const sec=(parseInt(pp[0],10)||0)*60+(parseInt(pp[1],10)||0);
          try{v.currentTime=sec;v.play().catch(()=>{});}catch(_){}
        }
      });
    }
  });
})();

// ═══ M6: MARCAS + NOTAS + REVISÃO + EXPORT + DUPLO-TOQUE ═══
(function(){
  let mv=null,reviewOn=false;
  const SPAN=20;
  Bus.onGlobal('media:ready',({type,el})=>{
    if(type!=='video'||!el||el.__m6)return;
    el.__m6=true;mv=el;
    el.addEventListener('loadedmetadata',draw);
    el.addEventListener('timeupdate',tick);
  });
  function notesNow(){try{return GDIUser.getNotes(window.location.pathname)||[]}catch(_){return[]}}
  function draw(){
    const bar=document.getElementById('gdi-note-marks');if(!bar)return;
    const dur=(mv&&isFinite(mv.duration))?mv.duration:0;
    const notes=notesNow();
    bar.innerHTML='';
    if(!dur||!notes.length){bar.style.display='none';return;}
    bar.style.display='block';
    notes.forEach(nt=>{
      const d=document.createElement('div');d.className='gdi-note-mark';
      d.style.left=Math.min(100,Math.max(0,nt.t/dur*100))+'%';
      d.title=gdiFmtTime(nt.t)+' \u2014 '+nt.text;
      d.addEventListener('click',()=>{if(mv){try{mv.currentTime=nt.t;mv.play().catch(()=>{});}catch(_){}}});
      bar.appendChild(d);
    });
  }
  function tick(){
    if(!reviewOn)return;
    const v=mv;if(!v)return;
    const notes=notesNow().slice().sort((a,b)=>a.t-b.t);
    if(!notes.length){reviewOn=false;document.getElementById('gdi-review-btn')?.classList.remove('active');return;}
    const t=v.currentTime;
    let idx=-1;for(let i=0;i<notes.length;i++)if(notes[i].t<=t)idx=i;
    if(idx<0)return;
    const nxt=notes[idx+1];
    if(nxt&&t>=notes[idx].t+SPAN&&t<nxt.t){try{v.currentTime=nxt.t;}catch(_){}}
    else if(!nxt&&t>=notes[idx].t+SPAN){
      reviewOn=false;
      document.getElementById('gdi-review-btn')?.classList.remove('active');
      showToast('Revis\u00e3o conclu\u00edda \u2713');
    }
  }
  function exportMenu(){
    const old=document.getElementById('gdi-exp-menu');
    if(old){old.remove();return;}
    const btn=document.getElementById('gdi-notes-export');
    const m=document.createElement('div');m.id='gdi-exp-menu';
    const r=btn.getBoundingClientRect();
    m.style.cssText='position:fixed;z-index:10001;background:rgba(15,16,24,.97);border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:6px;display:flex;flex-direction:column;gap:4px;box-shadow:0 10px 30px rgba(0,0,0,.5);left:'+Math.max(8,r.left-60)+'px;top:'+(r.bottom+6)+'px;';
    m.innerHTML=`<button class="gdi-mode-btn" id="gdi-exp-md" style="justify-content:flex-start;font-size:12px;"><i class="bi bi-markdown"></i> Markdown (.md)</button>
    <button class="gdi-mode-btn" id="gdi-exp-anki" style="justify-content:flex-start;font-size:12px;"><i class="bi bi-collection"></i> Anki / texto (.txt)</button>`;
    GDI_ROOT().appendChild(m);
    document.getElementById('gdi-exp-md').onclick=()=>{m.remove();doExport('md');};
    document.getElementById('gdi-exp-anki').onclick=()=>{m.remove();doExport('anki');};
    setTimeout(()=>document.addEventListener('click',function h(e2){
      if(!m.contains(e2.target)){m.remove();document.removeEventListener('click',h);}
    }),0);
  }
  function doExport(fmt){
    const notes=notesNow().slice().sort((a,b)=>a.t-b.t);
    if(!notes.length){showToast('Nenhuma anota\u00e7\u00e3o para exportar');return;}
    let name='aula';try{name=decodeURIComponent(window.location.pathname.split('/').pop()||'aula')}catch(_){}
    const base=(name.replace(/\.[a-z0-9]+$/i,'')||'aula')+' \u2014 anota\u00e7\u00f5es';
    let content,type,ext;
    if(fmt==='anki'){
      content=notes.map(nt=>nt.text.replace(/\t/g,' ')+'\t'+name+' \u2014 '+gdiFmtTime(nt.t)).join('\n');
      type='text/plain;charset=utf-8';ext='anki.txt';
    }else{
      content='# Anota\u00e7\u00f5es \u2014 '+name+'\n\n'+notes.map(nt=>'- **['+gdiFmtTime(nt.t)+']** '+nt.text).join('\n')+'\n';
      type='text/markdown;charset=utf-8';ext='md';
    }
    const blob=new Blob([content],{type});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=base+'.'+ext;
    GDI_ROOT().appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),5000);
    showToast(notes.length+' anota\u00e7\u00e3o'+(notes.length>1?'\u00f5es':'')+' exportada'+(notes.length>1?'s':''));
  }
  window.GDI_REVIEW_SPAN=SPAN;
  // ★FIX: user:ready registrado UMA vez (dispatcher), não 1× por página de vídeo
  if(!window.__gdiM6UR){window.__gdiM6UR=true;
    Bus.onGlobal('user:ready',()=>{try{window.__gdiM6Render&&window.__gdiM6Render()}catch(_){}});}
  window.GDI_MODULES.push({name:'marks-ui',init:function(){
    const wrap=document.querySelector('.gdi-player-wrap');
    if(wrap&&!document.getElementById('gdi-note-marks')){
      const bar=document.createElement('div');bar.id='gdi-note-marks';
      wrap.insertAdjacentElement('afterend',bar);
    }
    if(wrap&&Os.isMobile&&!wrap.__gdiDblTap){
      wrap.__gdiDblTap=true;
      let lt=0,lx=0;
      wrap.addEventListener('touchend',e=>{
        const now=Date.now();
        const x=(e.changedTouches&&e.changedTouches[0]&&e.changedTouches[0].clientX)||0;
        if(now-lt<320&&Math.abs(x-lx)<90){
          const rect=wrap.getBoundingClientRect();
          const v=wrap.querySelector('video');
          if(v&&isFinite(v.duration)&&v.duration>0){
            const fwd=(x-rect.left)>rect.width/2;
            v.currentTime=Math.min(Math.max(0,v.currentTime+(fwd?10:-10)),Math.max(0,v.duration-0.5));
            showToast((fwd?'\u2192 +10s \u2192 ':'\u2190 -10s \u2190 ')+gdiFmtTime(v.currentTime));
          }
          lt=0;
        }else{lt=now;lx=x;}
      },{passive:true});
    }
    const head=document.querySelector('.gdi-notes-head');
    if(head&&!head.dataset.gdiNotes){
      head.dataset.gdiNotes='1';
      const w=document.createElement('div');w.style.cssText='display:flex;gap:6px;';
      w.innerHTML=`<button id="gdi-notes-export" class="gdi-mode-btn" style="padding:3px 10px;font-size:11px;" title="Baixar anota\u00e7\u00f5es"><i class="bi bi-download"></i> Exportar</button>
      <button id="gdi-review-btn" class="gdi-mode-btn" style="padding:3px 10px;font-size:11px;" title="Tocar s\u00f3 os trechos anotados (${SPAN}s cada)"><i class="bi bi-fast-forward-fill"></i> Revis\u00e3o</button>`;
      head.appendChild(w);
      document.getElementById('gdi-notes-export').addEventListener('click',exportMenu);
      document.getElementById('gdi-review-btn').addEventListener('click',()=>{
        reviewOn=!reviewOn;
        document.getElementById('gdi-review-btn').classList.toggle('active',reviewOn);
        if(reviewOn){
          const notes=notesNow().slice().sort((a,b)=>a.t-b.t);
          if(mv&&notes.length){
            const nx=notes.find(n=>n.t>mv.currentTime-0.5)||notes[0];
            try{mv.currentTime=nx.t;mv.play().catch(()=>{});}catch(_){}
          }
          showToast('Modo revis\u00e3o LIGADO \u2014 '+SPAN+'s por trecho ( ] e [ pulam entre eles)');
        }else showToast('Modo revis\u00e3o desligado');
      });
    }
    const slot=document.getElementById('gdi-slot-left');
    if(slot&&!document.getElementById('gdi-notes')){
      slot.insertAdjacentHTML('beforeend',`
      <div class="gdi-notes" id="gdi-notes">
        <div class="gdi-notes-head"><strong>\ud83d\udcdd Minhas anota\u00e7\u00f5es</strong><span id="gdi-notes-count" style="font-size:11px;color:var(--ferreto-text-muted,#8b949e);"></span></div>
        <textarea id="gdi-note-input" rows="2" placeholder="Digite sua anota\u00e7\u00e3o para esta aula\u2026"></textarea>
        <div class="gdi-notes-actions">
          <span id="gdi-note-time" title="Clique para ir a este momento do v\u00eddeo">00:00</span>
          <button id="gdi-note-save"><i class="bi bi-save me-1"></i>Salvar</button>
        </div>
        <div id="gdi-notes-list"><div class="gdi-notes-empty">Carregando suas anota\u00e7\u00f5es\u2026</div></div>
      </div>`);
      document.getElementById('gdi-note-save').addEventListener('click',()=>{
        const ta=document.getElementById('gdi-note-input');
        const txt=(ta.value||'').trim();
        if(!txt){showToast('Digite a anota\u00e7\u00e3o antes de salvar');return;}
        const v=document.querySelector('video');
        const tNow=v&&isFinite(v.currentTime)?v.currentTime:0;
        GDIUser.addNote(window.location.pathname,tNow,txt);
        ta.value='';
        render();
        showToast('Anota\u00e7\u00e3o salva na sua conta');
      });
      const nt=document.getElementById('gdi-note-time');
      if(nt&&!nt.__seekB){nt.__seekB=true;
        nt.addEventListener('click',()=>{
          const v=document.querySelector('video');
          if(v&&nt.textContent.includes(':')){
            const pp=nt.textContent.split(':');
            const sec=(parseInt(pp[0],10)||0)*60+(parseInt(pp[1],10)||0);
            try{v.currentTime=sec;v.play().catch(()=>{});}catch(_){}
          }
        });
      }
      Bus.on('video:switched',()=>{
        const ta=document.getElementById('gdi-note-input');
        if(ta&&ta.value.trim()){ta.value='';showToast('Rascunho descartado ao trocar de aula');}
        render();
      });
      GDIUser.ready().then(render).catch(()=>{});
      window.__gdiM6Render=render; // ★FIX: dispatcher global único
    }
    function render(){
      const listEl=document.getElementById('gdi-notes-list');
      const cntEl=document.getElementById('gdi-notes-count');
      if(!listEl)return;
      const notes=GDIUser.getNotes(window.location.pathname);
      if(cntEl)cntEl.textContent=notes.length?notes.length+' nota'+(notes.length>1?'s':''):'';
      if(!notes.length){listEl.innerHTML='<div class="gdi-notes-empty">Nenhuma anota\u00e7\u00e3o ainda. Digite acima e salve.</div>';draw();return;}
      const sorted=[...notes].map((nt,idx)=>({...nt,idx})).sort((x,y)=>x.t-y.t);
      listEl.innerHTML=sorted.map(nt=>`
        <div class="gdi-note">
          <span class="gdi-note-time" data-seek="${nt.idx}" title="Ir para este momento">${gdiFmtTime(nt.t)}</span>
          <span class="gdi-note-text">${escHtml(nt.text)}</span>
          <button class="gdi-note-del" data-del="${nt.idx}" title="Excluir"><i class="bi bi-x-lg"></i></button>
        </div>`).join('');
      listEl.querySelectorAll('[data-seek]').forEach(el=>{
        el.addEventListener('click',()=>{
          const nt=GDIUser.getNotes(window.location.pathname)[+el.dataset.seek];
          const v=document.querySelector('video');
          if(nt&&v){try{v.currentTime=nt.t;v.play().catch(()=>{});}catch(_){}}
        });
      });
      listEl.querySelectorAll('[data-del]').forEach(el=>{
        el.addEventListener('click',()=>{GDIUser.delNote(window.location.pathname,+el.dataset.del);render();});
      });
      draw();
    }
    draw();
  }});
  Bus.onGlobal('user:ready',()=>{try{draw()}catch(_){}});
})();

// ═══ M7: PULAR INTRO POR CURSO ═══
(function(){
  let skipBtn=null;
  function courseKey(){
    try{const fl=window.playlistVideos[window.currentIndex]?.folder;if(fl)return fl;}catch(_){}
    return window.location.pathname.split('/').slice(0,-1).join('/')+'/';
  }
  Bus.onGlobal('media:ready',({type,el})=>{
    if(type!=='video'||!el||el.__m7)return;
    el.__m7=true;
    const upd=()=>{
      if(!skipBtn||!document.body.contains(skipBtn))return;
      const S=GDIUser.getIntro(courseKey());
      const tm=el.currentTime;
      let show=false;
      if(S&&S>0)show=tm>0.4&&tm<S-0.3&&tm<180;
      else show=tm>1&&tm<120;
      // ★FIX: só toca no DOM quando muda (era reescrito a cada timeupdate)
      const html=S
        ?'<i class="bi bi-skip-forward-fill"></i> Pular introdu\u00e7\u00e3o ('+gdiFmtTime(S)+')'
        :'<i class="bi bi-skip-forward-fill"></i> Pular introdu\u00e7\u00e3o';
      if(skipBtn.innerHTML!==html)skipBtn.innerHTML=html;
      const disp=show?'block':'none';
      if(skipBtn.style.display!==disp)skipBtn.style.display=disp;
    };
    el.addEventListener('timeupdate',upd);
    el.addEventListener('seeked',()=>setTimeout(upd,80));
    el.addEventListener('play',upd);
  });
  window.GDI_MODULES.push({name:'skip-intro',init:function(){
    const wrap=document.querySelector('.gdi-player-wrap');
    if(!wrap)return;
    if(!skipBtn||!document.body.contains(skipBtn)){
      skipBtn=document.createElement('button');
      skipBtn.id='gdi-skip-intro';
      skipBtn.innerHTML='<i class="bi bi-skip-forward-fill"></i> Pular introdu\u00e7\u00e3o';
      wrap.appendChild(skipBtn);
      skipBtn.addEventListener('click',()=>{
        const v=document.querySelector('.gdi-player-wrap video');if(!v)return;
        const ck=courseKey();
        if(!GDIUser.getIntro(ck)){
          GDIUser.setIntro(ck,Math.max(1,Math.round(v.currentTime)));
          showToast('Intro de '+gdiFmtTime(v.currentTime|0)+' memorizada para este curso \u2713');
        }
        try{v.currentTime=GDIUser.getIntro(ck)||v.currentTime;v.play().catch(()=>{});}catch(_){}
        skipBtn.style.display='none';
      });
    }
  }});
})();

// ═══ M9: MATERIAIS (PDFs por aula) ═══
(function(){
  const frames=new Map();let gen=0,lastKey='';
  function classify(name){
    const n2=name.toLowerCase();
    if(/mapa/.test(n2))                       return{l:'Mapa Mental', i:'bi-diagram-3',              ord:4};
    if(/simulado/.test(n2))                   return{l:'Minissimulado',i:'bi-stopwatch',             ord:2};
    if(/quest|exerc|prova/.test(n2))          return{l:'Exerc\u00edcios',  i:'bi-ui-checks',              ord:1};
    if(/resumo|iara|\bia\b|intelig/.test(n2)) return{l:'Resumo IA',   i:'bi-stars',                  ord:3};
    return                                    {l:'Material',    i:'bi-file-earmark-text-fill',ord:0};
  }
  function courseBase(){
    let nm='';
    try{nm=window.playlistVideos[window.currentIndex]?.origName||''}catch(_){}
    if(!nm){try{nm=decodeURIComponent(window.location.pathname.split('/').filter(Boolean).pop()||'')}catch(_){nm=''}}
    return nm.replace(/\.[a-z0-9]+$/i,'').toLowerCase().trim();
  }
  function ensurePanel(){
    const right=document.getElementById('gdi-slot-right');
    if(!right)return null;
    if(!right.dataset.m9){
      right.dataset.m9='1';
      right.innerHTML=`<div class="gdi-mat-head"><strong><i class="bi bi-journal-bookmark-fill" style="color:var(--ferreto-primary,#7aa2ff);"></i> Materiais da aula</strong><span id="gdi-mat-status"></span></div>
      <div class="gdi-mat-tabs" id="gdi-mat-tabs"><span class="gdi-mat-loading">Buscando PDFs da aula\u2026</span></div>
      <div class="gdi-mat-body" id="gdi-mat-body"></div>`;
    }
    return{
      tabsEl:document.getElementById('gdi-mat-tabs'),
      bodyEl:document.getElementById('gdi-mat-body'),
      statusEl:document.getElementById('gdi-mat-status')
    };
  }
  async function build(){
    const myGen=++gen;
    const p=window.location.pathname;
    if(p.endsWith('/')||p.includes('/fallback'))return;
    // ★FIX: loader re-roda os módulos várias vezes na MESMA aula — não reconstruir
    if(p===lastKey){
      const tabs=document.getElementById('gdi-mat-tabs');
      const body=document.getElementById('gdi-mat-body');
      if(tabs&&body&&(tabs.querySelector('.gdi-mat-tab')||body.querySelector('.gdi-mat-empty')))return;
    }
    let panel=null;
    panel=ensurePanel();
    if(!panel||!panel.tabsEl||!panel.bodyEl){
      // ★C.3: busy-wait 40×200ms removido. Em vez disso, escuta o evento
      // Bus 'slots:ready' (emitido pelo app.min.js quando os slots são criados).
      // Fallback one-shot de 5s: se o evento não disparar, faz um retry.
      // Bus não tem offGlobal — o listener vira no-op após o primeiro disparo
      // (guard flag `done`).
      await new Promise(resolve=>{
        let done=false;
        const onReady=()=>{if(!done){done=true;resolve();}};
        // ★ FIX 11 (Task 21): was `if(window.Bus&&typeof Bus.onGlobal==='function')` —
        // but Bus is declared with `const` in app.min.js, so `window.Bus` is undefined.
        // The check always failed, so the slots:ready listener was never registered and
        // the materials panel waited the full 5s fallback timeout before showing.
        // Use `typeof Bus !== 'undefined'` (matches gdi-extras-loader.js line 121).
        if(typeof Bus !== 'undefined' && typeof Bus.onGlobal === 'function'){
          Bus.onGlobal('slots:ready',onReady);
        }
        setTimeout(()=>{if(!done){done=true;resolve();}},5000);
      });
      if(myGen!==gen)return;
      panel=ensurePanel();
      // one retry após a espera
      if(!panel||!panel.tabsEl||!panel.bodyEl){
        await sleep(200);
        panel=ensurePanel();
      }
    }
    if(!panel||!panel.tabsEl||!panel.bodyEl)return;
    const{tabsEl,bodyEl,statusEl}=panel;
    const UI=window.UI||{};
    const curPath=window.location.pathname;
    const fPath=curPath.split("/").slice(0,-1).join("/")+"/";
    const pPath=curPath.split("/").slice(0,-2).join("/")+"/";
    tabsEl.innerHTML='<span class="gdi-mat-loading">Buscando PDFs da aula\u2026</span>';
    if(statusEl)statusEl.textContent='';
    bodyEl.innerHTML='';
    const isPdf=x=>(x.fileExtension||'').toLowerCase()==='pdf'||/pdf/i.test(x.mimeType||'');
    try{
      let found=[];
      // ★C.2: se window.playlistVideos já tem itens de fPath, a chamada
      // gdiListAllFiles abaixo bate no cache do worker-bridge (sem network).
      // A verificação é defensiva — em caso de falha na rede, recupera de
      // playlistVideos (só vídeos, sem PDFs, mas evita travar o M9).
      const _plFromThisFolder=!!(window.playlistVideos&&Array.isArray(window.playlistVideos)&&
        window.playlistVideos.length&&
        window.playlistVideos.some(v=>v&&typeof v.pageUrl==='string'&&v.pageUrl.indexOf(fPath)===0));
      let here;
      try{
        here=await gdiListAllFiles(fPath,gdiGetPw(fPath));
      }catch(_){
        here=[];
        if(_plFromThisFolder){
          // ★C.2: fallback — reusa playlistVideos (vídeos só, sem PDFs)
          here=window.playlistVideos
            .filter(v=>v&&typeof v.pageUrl==='string'&&v.pageUrl.indexOf(fPath)===0)
            .map(v=>{
              const nm=v.origName||v.name||'';
              return{
                name:nm,
                fileExtension:((nm.split('.').pop()||'').toLowerCase()),
                mimeType:v.mimeType||'',
                size:v.sizeBytes||0,
                link:v.rawLink||''
              };
            });
        }
      }
      found=here.filter(isPdf);
      if(!found.length){
        const subs=here.filter(x=>x.mimeType==='application/vnd.google-apps.folder').slice(0,20);
        for(const sf of subs){
          const fp=fPath+encodeURIComponent(sf.name)+'/';
          found=found.concat((await gdiListAllFiles(fp,gdiGetPw(fp))).filter(isPdf));
          if(found.length)break;
        }
      }
      if(!found.length)found=(await gdiListAllFiles(pPath,gdiGetPw(pPath))).filter(isPdf);
      const seen=new Set();const uniq=[];
      found.forEach(x=>{if(!seen.has(x.name)){seen.add(x.name);uniq.push(x)}});
      const pdfs=uniq.slice(0,12);
      if(myGen!==gen)return;
      if(!pdfs.length){
        if(tabsEl.isConnected){
          tabsEl.innerHTML='';
          if(statusEl)statusEl.textContent='sem PDF';
          if(bodyEl)bodyEl.innerHTML=`<div class="gdi-mat-empty"><i class="bi bi-file-earmark-x" style="font-size:34px;"></i><div>Nenhum material PDF encontrado para esta aula.</div></div>`;
          lastKey=p;
        }
        return;
      }
      const base=courseBase();
      const items=pdfs.map(x=>{
        const cls=classify(x.name);
        const b2=UI.second_domain_for_dl?UI.downloaddomain+x.link:window.location.origin+x.link;
        const url=b2+(x.link.includes('?')?'&':'?')+'inline=true';
        const match=base&&x.name.toLowerCase().includes(base)?0:1;
        return{name:x.name,label:cls.l,icon:cls.i,ord:cls.ord,match,url};
      });
      items.sort((x,y)=>x.match-y.match||x.ord-y.ord||x.name.localeCompare(y.name,undefined,{numeric:true}));
      // ★ salva items para o botão "Regerar" encontrar
      tabsEl.__items=items;
      const used={};
      items.forEach((it,idx)=>{
        used[it.label]=(used[it.label]||0)+1;
        it.tabLabel=used[it.label]>1?it.label+' '+used[it.label]:it.label;
        it.idx=idx;
      });
      if(!tabsEl.isConnected)return;
      tabsEl.innerHTML=items.map(it=>`
        <div class="gdi-mat-tab" data-mat="${it.idx}" title="${escHtml(it.name)}">
          <i class="bi ${it.icon}"></i><span>${escHtml(it.tabLabel)}</span>
        </div>`).join('')+
        `<div class="gdi-mat-tab gdi-mat-isa" data-mat="isa-summary" title="Gerar resumo com a Meggy (IA)">
          <i class="bi bi-stars"></i><span>Resumo Meggy</span>
        </div>
        <div class="gdi-mat-tab gdi-mat-isa" data-mat="isa-questions" title="Gerar questões com a Meggy (IA)">
          <i class="bi bi-patch-question"></i><span>Questões Meggy</span>
        </div>
        <div class="gdi-mat-tab gdi-mat-isa" data-mat="isa-mindmap" title="Gerar pílulas com a Meggy (IA)">
          <i class="bi bi-capsule"></i><span>Pílulas</span>
        </div>
        <div class="gdi-mat-tab gdi-mat-isa" data-mat="isa-flashcards" title="Flashcards desta aula">
          <i class="bi bi-card-text"></i><span>Flashcards</span>
        </div>`;
      if(statusEl)statusEl.textContent=items.length+' PDF'+(items.length>1?'s':'');
      const isMobile=Os.isMobile;
      function show(idx){
        if(!tabsEl.isConnected||!bodyEl.isConnected)return;
        tabsEl.querySelectorAll('.gdi-mat-tab').forEach(t=>t.classList.toggle('active',+t.dataset.mat===idx));
        if(isMobile){
          // ★ Android/iOS: muitos navegadores móveis NÃO renderizam PDF em <iframe>
          // e abrem popup de download. Usamos pdf.js (viewer) embutido para
          // garantir que o PDF apareça DENTRO da página.
          bodyEl.innerHTML=`<div class="gdi-mat-mobile-pdf" style="height:100%;display:flex;flex-direction:column;gap:10px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#21262d);border-radius:8px;flex-shrink:0;">
              <div style="min-width:0;flex:1;">
                <div style="font-weight:600;color:var(--ferreto-text,#f0f6fc);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><i class="bi bi-file-earmark-pdf"></i> ${escHtml(items[idx].name)}</div>
              </div>
              <a href="${items[idx].url}" target="_blank" rel="noopener" class="gdi-mode-btn" style="text-decoration:none;font-size:11px;padding:5px 10px;flex:none;" title="Abrir em aba nova (baixar)">
                <i class="bi bi-box-arrow-up-right"></i> Abrir
              </a>
            </div>
            <div id="gdi-mat-mobile-viewer" style="flex:1;min-height:300px;border:1px solid var(--ferreto-border,#21262d);border-radius:8px;overflow:hidden;background:#525659;display:flex;align-items:center;justify-content:center;">
              <div style="color:#fff;font-size:12px;text-align:center;padding:20px;"><div class="gdi-mat-isa-spin" style="margin:0 auto 10px;"></div>Carregando PDF…</div>
            </div>
          </div>`;
          // tenta renderizar com pdf.js (viewer embutido)
          (async()=>{
            try{
              // ★C.1: usa o loader consolidado (idempotente, workerSrc setado 1×)
              // em vez do loader local que competia com outros módulos.
              await window.gdiEnsurePdfjs();
              if(!window.pdfjsLib)throw new Error('pdf.js indisponível');
              const viewer=bodyEl.querySelector('#gdi-mat-mobile-viewer');
              if(!viewer)return;
              viewer.innerHTML='<canvas id="gdi-mat-mobile-canvas" style="width:100%;height:100%;display:block;background:#525659;"></canvas>';
              const canvas=viewer.querySelector('#gdi-mat-mobile-canvas');
              const ctx=canvas.getContext('2d');
              const resp=await fetch(items[idx].url,{credentials:'same-origin'});
              if(!resp.ok)throw new Error('HTTP '+resp.status);
              const buf=await resp.arrayBuffer();
              const doc=await window.pdfjsLib.getDocument({data:buf}).promise;
              let pageNum=1;
              let scale=1.5;
              async function renderPage(){
                const page=await doc.getPage(pageNum);
                const viewport=page.getViewport({scale});
                const containerWidth=viewer.clientWidth-20;
                if(viewport.width>containerWidth){
                  scale=containerWidth/viewport.width*scale;
                }
                const vp2=page.getViewport({scale});
                canvas.height=vp2.height;
                canvas.width=vp2.width;
                canvas.style.height=vp2.height+'px';
                canvas.style.width='100%';
                await page.render({canvasContext:ctx,viewport:vp2}).promise;
                // controles de página
                if(!viewer.querySelector('.gdi-mat-mobile-nav')){
                  const nav=document.createElement('div');
                  nav.className='gdi-mat-mobile-nav';
                  nav.style.cssText='position:absolute;bottom:8px;left:50%;transform:translateX(-50%);display:flex;gap:6px;background:rgba(0,0,0,.75);padding:6px 10px;border-radius:20px;backdrop-filter:blur(6px);';
                  nav.innerHTML=`
                    <button class="gdi-mat-mobile-prev" style="background:transparent;border:0;color:#fff;cursor:pointer;font-size:16px;padding:2px 8px;"><i class="bi bi-chevron-left"></i></button>
                    <span class="gdi-mat-mobile-info" style="color:#fff;font-size:12px;padding:2px 6px;">${pageNum}/${doc.numPages}</span>
                    <button class="gdi-mat-mobile-next" style="background:transparent;border:0;color:#fff;cursor:pointer;font-size:16px;padding:2px 8px;"><i class="bi bi-chevron-right"></i></button>`;
                  viewer.style.position='relative';
                  viewer.appendChild(nav);
                  nav.querySelector('.gdi-mat-mobile-prev').onclick=async()=>{
                    if(pageNum>1){pageNum--;await renderPage();}
                  };
                  nav.querySelector('.gdi-mat-mobile-next').onclick=async()=>{
                    if(pageNum<doc.numPages){pageNum++;await renderPage();}
                  };
                }else{
                  viewer.querySelector('.gdi-mat-mobile-info').textContent=pageNum+'/'+doc.numPages;
                }
                // scroll topo
                viewer.scrollTop=0;
              }
              await renderPage();
            }catch(err){
              console.warn('[M9 mobile] pdf.js falhou, caindo p/ link:',err);
              const viewer=bodyEl.querySelector('#gdi-mat-mobile-viewer');
              if(viewer){
                viewer.innerHTML=`<div style="text-align:center;padding:24px;color:var(--ferreto-text,#e6edf3);">
                  <i class="bi bi-file-earmark-pdf" style="font-size:38px;color:var(--ferreto-primary,#ff8b9f);"></i>
                  <div style="margin-top:8px;font-size:13px;">Não foi possível exibir o PDF dentro da página neste dispositivo.</div>
                  <a href="${items[idx].url}" target="_blank" rel="noopener" class="gdi-btn gdi-btn-primary" style="margin-top:14px;text-decoration:none;">
                    <i class="bi bi-box-arrow-up-right"></i> Abrir em nova aba
                  </a>
                </div>`;
              }
            }
          })();
          return;
        }
        let ifr=frames.get(items[idx].url);
        if(!ifr){
          ifr=document.createElement('iframe');
          ifr.src=items[idx].url;ifr.loading='lazy';
          ifr.title=items[idx].name;
          frames.set(items[idx].url,ifr);
        }
        bodyEl.innerHTML='';bodyEl.appendChild(ifr);
      }
      function activateOnly(t){
        tabsEl.querySelectorAll('.gdi-mat-tab').forEach(x=>x.classList.remove('active'));
        t.classList.add('active');
        bodyEl.innerHTML='';
      }
      tabsEl.querySelectorAll('.gdi-mat-tab').forEach(t=>{
        t.addEventListener('click',()=>{
          const m=t.dataset.mat;
          if(m==='isa-summary'){
            activateOnly(t);
            if(window.gdiIsaPdf)window.gdiIsaPdf.summary(items,bodyEl,base);
            else showToast('Módulo Meggy indisponível');
          }else if(m==='isa-questions'){
            activateOnly(t);
            if(window.gdiIsaPdf)window.gdiIsaPdf.questions(items,bodyEl,base);
            else showToast('Módulo Meggy indisponível');
          }else if(m==='isa-mindmap'){
            activateOnly(t);
            if(window.gdiIsaPdf&&window.gdiIsaPdf.mindmap)window.gdiIsaPdf.mindmap(items,bodyEl,base);
            else showToast('Módulo Meggy indisponível');
          }else if(m==='isa-flashcards'){
            activateOnly(t);
            if(window.gdiIsaPdf&&window.gdiIsaPdf.flashcards)window.gdiIsaPdf.flashcards(items,bodyEl,base);
            else showToast('Módulo Flashcards indisponível');
          }else{
            show(+m);
          }
        });
      });
      show(0);
      lastKey=p;
      console.log('[GDI Materiais] aula:',base||'(sem nome)','\u2192',items.length,'PDFs:',items.map(x=>x.tabLabel).join(' | '));
    }catch(err){
      if(myGen!==gen)return;
      if(statusEl)statusEl.textContent='sem PDF';
      if(bodyEl)bodyEl.innerHTML=`<div class="gdi-mat-empty"><i class="bi bi-wifi-off" style="font-size:34px;"></i><div>N\u00e3o foi poss\u00edvel carregar os materiais.</div></div>`;
    }
  }
  Bus.onGlobal('video:switched',()=>{setTimeout(build,80);});
  window.GDI_MODULES.push({name:'materials',init:build});
})();
