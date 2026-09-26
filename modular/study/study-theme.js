// ═══════════════════════════════════════════════════════════════
// study-theme.js — BlackTie visual theme (Ferreto tokens + fonts + extras)
//
// Split from gdi-study.js (v1.0.86 modularization, Task v86-MOD-STUDY).
// Originally IIFE #4 "BlackTie — Tema Visual" (lines 4241-4416, ~175 lines).
//
// Namespace: window.__gdiStudy.theme = { installed: true }
// Guard: window.__gdiStudyTheme (prevents double-init)
// Load order: 1st study module (CSS injection — no dependencies)
// ═══════════════════════════════════════════════════════════════
(function(){
  if(window.__gdiStudyTheme) return;
  window.__gdiStudyTheme = true;
  window.__gdiStudy = window.__gdiStudy || {};
  window.__gdiStudy.theme = { installed: true };

  // ── Preserva guard original do monolito (gdi-study.js usava __gdiFerretoExtras) ──
  if(window.__gdiFerretoExtras) return;
  window.__gdiFerretoExtras = true;
  console.log('[GDI Extras] BlackTie tema aplicado');

  // ── 1) Fontes Ferreto (Poppins / Rubik / Inter) ──
  if(!document.getElementById('gdi-ferreto-fonts')){
    const f=document.createElement('link');
    f.id='gdi-ferreto-fonts';f.rel='stylesheet';
    f.href='https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=Rubik:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap';
    document.head.appendChild(f);
  }
  if(!document.querySelector('link[rel="preconnect"]ref*="fonts.gstatic"]')){
    const p=document.createElement('link');p.rel='preconnect';p.crossOrigin='';p.href='https://fonts.gstatic.com';document.head.appendChild(p);
  }

  // ── 2) Tokens (espelha app.min.js p/ tornar extras autossuficiente) ──
  if(!document.getElementById('gdi-ferreto-tokens')){
    const t=document.createElement('style');t.id='gdi-ferreto-tokens';t.textContent=`
:root{
  --ferreto-primary:#ff8b9f;--ferreto-primary-600:#f5697f;--ferreto-secondary:#5ddeda;
  --ferreto-accent:#c026d3;--ferreto-radius:16px;--ferreto-radius-sm:10px;
  --ferreto-font-display:'Poppins','Rubik',system-ui,sans-serif;
  --ferreto-font-body:'Rubik','Inter',system-ui,sans-serif;
  --ferreto-grad:linear-gradient(135deg,#ff8b9f 0%,#c026d3 55%,#5ddeda 130%);
  --ferreto-grad-soft:linear-gradient(135deg,rgba(255,139,159,.16),rgba(93,222,218,.12));
  --ferreto-glow:rgba(255,139,159,.35);
}
[data-bs-theme="dark"]{
  --ferreto-bg:#070910;--ferreto-bg-2:#0d1119;
  --ferreto-surface:rgba(22,27,38,.72);--ferreto-surface-2:rgba(255,255,255,.045);--ferreto-surface-3:rgba(255,255,255,.08);
  --ferreto-border:rgba(255,255,255,.09);--ferreto-border-strong:rgba(255,255,255,.16);
  --ferreto-text:#f3f5fa;--ferreto-text-muted:#9aa4b8;--ferreto-text-faint:#6b7488;
}
[data-bs-theme="light"]{
  --ferreto-bg:#f4f5fb;--ferreto-bg-2:#e9ebf5;
  --ferreto-surface:rgba(255,255,255,.78);--ferreto-surface-2:rgba(255,255,255,.6);--ferreto-surface-3:rgba(15,23,42,.05);
  --ferreto-border:rgba(15,23,42,.1);--ferreto-border-strong:rgba(15,23,42,.18);
  --ferreto-text:#1f2540;--ferreto-text-muted:#5a6478;--ferreto-text-faint:#9aa1b4;
  --ferreto-glow:rgba(255,139,159,.28);
}
`;document.head.appendChild(t);
  }

  // ── 3) Estilização Ferreto dos componentes extras ──
  if(!document.getElementById('gdi-ferreto-extras-style')){
    const s=document.createElement('style');s.id='gdi-ferreto-extras-style';s.textContent=`

/* Debug panel */
.gdi-debug-wrap{background:var(--ferreto-bg-2)!important;border-top:2px solid var(--ferreto-primary)!important;border-radius:0!important;}
.gdi-debug-head{background:var(--ferreto-surface)!important;color:var(--ferreto-text-muted)!important;}
.gdi-debug-head:hover{background:var(--ferreto-surface-3)!important;}
.gdi-debug-head strong{color:var(--ferreto-text)!important;font-family:var(--ferreto-font-display)!important;}
.gdi-dbg-count{background:var(--ferreto-grad)!important;color:#fff!important;}
.gdi-debug-actions button{background:var(--ferreto-surface-2)!important;border-color:var(--ferreto-border)!important;color:var(--ferreto-text-muted)!important;border-radius:999px!important;padding:3px 12px!important;font-size:11px!important;}
.gdi-debug-actions button:hover{background:var(--ferreto-primary)!important;color:#fff!important;border-color:var(--ferreto-primary)!important;}
#gdi-debug-log{background:var(--ferreto-bg-2)!important;color:var(--ferreto-text)!important;}
.gdi-dbg-entry{border-bottom-color:var(--ferreto-border)!important;}
.gdi-dbg-pre{background:var(--ferreto-surface)!important;border-left-color:var(--ferreto-primary)!important;color:var(--ferreto-text-muted)!important;}

/* Materiais (tabs + body) */
.gdi-mat-head strong{color:var(--ferreto-text)!important;font-family:var(--ferreto-font-display)!important;}
#gdi-mat-status{color:var(--ferreto-text-muted)!important;}
.gdi-mat-tab{background:var(--ferreto-surface-2)!important;border-color:var(--ferreto-border)!important;color:var(--ferreto-text-muted)!important;border-radius:12px!important;transition:all .15s!important;}
.gdi-mat-tab i{color:var(--ferreto-secondary)!important;}
.gdi-mat-tab span{font-family:var(--ferreto-font-body)!important;}
.gdi-mat-tab:hover{background:var(--ferreto-surface-3)!important;color:var(--ferreto-text)!important;transform:translateY(-1px);}
.gdi-mat-tab.active{background:var(--ferreto-grad)!important;border:0!important;color:#fff!important;box-shadow:0 6px 16px -8px var(--ferreto-glow);}
.gdi-mat-tab.active i{color:#fff!important;}
.gdi-mat-body{background:var(--ferreto-surface)!important;border-color:var(--ferreto-border)!important;border-radius:var(--ferreto-radius)!important;}
.gdi-mat-empty{color:var(--ferreto-text-muted)!important;}
.gdi-mat-loading{color:var(--ferreto-text-muted)!important;}

/* Notas */
.gdi-notes{background:var(--ferreto-surface-2)!important;border-color:var(--ferreto-border)!important;border-radius:var(--ferreto-radius-sm)!important;}
.gdi-notes-head{color:var(--ferreto-text)!important;font-family:var(--ferreto-font-display)!important;}
#gdi-note-input{background:var(--ferreto-surface-2)!important;border-color:var(--ferreto-border)!important;color:var(--ferreto-text)!important;border-radius:10px!important;font-family:var(--ferreto-font-body)!important;}
#gdi-note-input:focus{border-color:var(--ferreto-primary)!important;box-shadow:0 0 0 4px var(--ferreto-glow)!important;outline:none!important;}
#gdi-note-time{color:var(--ferreto-primary)!important;}
#gdi-note-save{background:var(--ferreto-grad)!important;color:#fff!important;border:0!important;border-radius:999px!important;font-family:var(--ferreto-font-body)!important;font-weight:600!important;box-shadow:0 6px 16px -8px var(--ferreto-glow);}
#gdi-note-save:hover{filter:brightness(1.08);}
#gdi-notes-list{scrollbar-width:thin;}
.gdi-note{background:var(--ferreto-surface-3)!important;border-radius:10px!important;}
.gdi-note-time{color:var(--ferreto-primary)!important;}
.gdi-note-text{color:var(--ferreto-text)!important;}
.gdi-note-del{color:var(--ferreto-text-muted)!important;}
.gdi-note-del:hover{color:#ff6b6b!important;}
.gdi-note-mark{background:var(--ferreto-primary)!important;}
.gdi-note-mark:hover{background:#ffd43b!important;}

/* Pomodoro FAB + painel */
#gdi-pom-fab{background:conic-gradient(var(--ferreto-primary) calc(var(--pom-p,0)*1%),var(--ferreto-surface-3) 0)!important;box-shadow:0 6px 22px rgba(0,0,0,.5),0 0 0 1px var(--ferreto-border-strong)!important;}
#gdi-pom-fab::after{background:var(--ferreto-bg-2)!important;border-color:var(--ferreto-border)!important;}
#gdi-pom-fab>span{color:var(--ferreto-text)!important;}
#gdi-pom-fab.warning{animation:gdi-pom-pulse .8s ease-in-out infinite;}
@keyframes gdi-pom-pulse{0%,100%{box-shadow:0 6px 22px rgba(0,0,0,.5),0 0 0 1px var(--ferreto-border-strong);}50%{box-shadow:0 0 0 12px rgba(255,139,159,.25),0 6px 22px rgba(0,0,0,.5);}}
#gdi-pom-panel{background:var(--ferreto-surface)!important;-webkit-backdrop-filter:blur(20px)!important;backdrop-filter:blur(20px)!important;border-color:var(--ferreto-border-strong)!important;border-radius:var(--ferreto-radius)!important;box-shadow:0 20px 56px rgba(0,0,0,.6)!important;color:var(--ferreto-text)!important;}

/* Sleep button */
#gdi-sleep-btn{color:var(--ferreto-text-muted)!important;background:var(--ferreto-surface-2)!important;border:1px solid var(--ferreto-border)!important;border-radius:999px!important;}
#gdi-sleep-btn:hover{color:var(--ferreto-primary)!important;background:var(--ferreto-surface-3)!important;}

/* Skip intro */
#gdi-skip-intro{background:var(--ferreto-surface)!important;border:1px solid var(--ferreto-border-strong)!important;color:var(--ferreto-text)!important;border-radius:999px!important;font-family:var(--ferreto-font-body)!important;font-weight:600!important;box-shadow:0 8px 24px rgba(0,0,0,.5)!important;}
#gdi-skip-intro:hover{background:var(--ferreto-grad)!important;color:#fff!important;border:0!important;}

/* Progress / module prog chips */
#gdi-progress-line{color:var(--ferreto-text-muted)!important;}
.gdi-modprog{background:var(--ferreto-surface-2)!important;color:var(--ferreto-text-muted)!important;border-radius:999px!important;border:1px solid var(--ferreto-border)!important;}
.gdi-modprog b{color:var(--ferreto-secondary)!important;}

/* Continue card + Home card */
#gdi-home-card,.gdi-continue-card{background:var(--ferreto-surface)!important;border:1px solid var(--ferreto-border)!important;border-radius:var(--ferreto-radius)!important;box-shadow:0 6px 22px -10px rgba(0,0,0,.4)!important;-webkit-backdrop-filter:blur(14px)!important;backdrop-filter:blur(14px)!important;}

/* Playlist count badge */
#gdi-playlist-count{color:var(--ferreto-text-muted)!important;}

/* Player nav buttons (Anterior/Próxima) */
#gdi-player-nav .gdi-mode-btn{justify-content:center;}

/* Nota: marks sobre o player */
#gdi-note-marks .gdi-note-mark{border-color:var(--ferreto-bg-2)!important;}

/* Área do Aluno (M22) — painel flutuante */
.gdi-fc-panel,.gdi-fc-root,[class*="gdi-fc"]{background:var(--ferreto-surface)!important;border-color:var(--ferreto-border-strong)!important;border-radius:var(--ferreto-radius)!important;-webkit-backdrop-filter:blur(18px)!important;backdrop-filter:blur(18px)!important;color:var(--ferreto-text)!important;}

/* ★FIX tema: Continue-card (M13) */
#gdi-home-card{background:var(--ferreto-surface)!important;border:1px solid var(--ferreto-border)!important;-webkit-backdrop-filter:blur(14px)!important;backdrop-filter:blur(14px)!important;color:var(--ferreto-text)!important;}
#gdi-home-card *{color:inherit;}
#gdi-home-card [style*="color:#8b949e"],#gdi-home-card [style*="color: #8b949e"]{color:var(--ferreto-text-muted)!important;}
#gdi-home-card [style*="color:#f0f6fc"],#gdi-home-card [style*="color: #f0f6fc"]{color:var(--ferreto-text)!important;}
#gdi-home-card [style*="color:#7aa2ff"],#gdi-home-card [style*="color: #7aa2ff"]{color:var(--ferreto-primary)!important;}
#gdi-home-card .gdi-mode-btn{background:var(--ferreto-surface-2)!important;border:1px solid var(--ferreto-border)!important;color:var(--ferreto-text-muted)!important;}
#gdi-home-card .gdi-mode-btn:hover{background:var(--ferreto-surface-3)!important;color:var(--ferreto-primary)!important;}

/* ★FIX tema: Área do Aluno (M22) */
.gdi-central-box [style*="color:#8b949e"],.gdi-central-box [style*="color: #8b949e"]{color:var(--ferreto-text-muted)!important;}
.gdi-central-box [style*="color:#f0f6fc"],.gdi-central-box [style*="color: #f0f6fc"]{color:var(--ferreto-text)!important;}
.gdi-central-box [style*="color:#e6edf3"],.gdi-central-box [style*="color: #e6edf3"]{color:var(--ferreto-text)!important;}
.gdi-central-box [style*="color:#7aa2ff"],.gdi-central-box [style*="color: #7aa2ff"]{color:var(--ferreto-secondary)!important;}
.gdi-central-box [style*="background:rgba(255,255,255,.06)"],.gdi-central-box [style*="background: rgba(255, 255, 255, .06)"]{background:var(--ferreto-surface-2)!important;}
.gdi-central-box [style*="background:rgba(255,255,255,.07)"],.gdi-central-box [style*="background: rgba(255, 255, 255, .07)"]{background:var(--ferreto-surface-2)!important;}
.gdi-central-box [style*="background:rgba(255,255,255,.08)"],.gdi-central-box [style*="background: rgba(255, 255, 255, .08)"]{background:var(--ferreto-surface-3)!important;}
.gdi-central-box [style*="background:var(--ferreto-surface-3,rgba(255,255,255,.1))"],.gdi-central-box [style*="background: rgba(255, 255, 255, .1)"]{background:var(--ferreto-surface-3)!important;}
.gdi-central-box [style*="background:#1f6feb"]{background:var(--ferreto-grad)!important;}
.gdi-central-box [style*="border:1px solid #30363d"]{border-color:var(--ferreto-border)!important;}
.gdi-central-box [style*="border:1px solid rgba(255,255,255,.14)"]{border-color:var(--ferreto-border)!important;}
.gdi-central-box [style*="border-top:1px solid #21262d"]{border-top-color:var(--ferreto-border)!important;}
.gdi-central-box input{background:var(--ferreto-surface-2)!important;border:1px solid var(--ferreto-border)!important;color:var(--ferreto-text)!important;}
.gdi-central-box input:focus{border-color:var(--ferreto-primary)!important;box-shadow:0 0 0 3px var(--ferreto-glow)!important;outline:none!important;}
.gdi-central-box input::placeholder{color:var(--ferreto-text-faint)!important;}
.gdi-central-box .gdi-note{background:var(--ferreto-surface-3)!important;}
.gdi-central-box .gdi-note-del{color:var(--ferreto-text-muted)!important;}
.gdi-central-box .gdi-note-del:hover{color:#ff6b6b!important;}
.gdi-central-box .gdi-notes-empty{color:var(--ferreto-text-muted)!important;}

/* Scrollbar dos painéis internos */
#gdi-notes-list::-webkit-scrollbar,#gdi-debug-log::-webkit-scrollbar{width:8px;}
#gdi-notes-list::-webkit-scrollbar-thumb,#gdi-debug-log::-webkit-scrollbar-thumb{background:var(--ferreto-surface-3);border-radius:20px;}

`;document.head.appendChild(s);
  }

  // ── 4) Garante data-bs-theme em <html> p/ os tokens casarem ──
  if(!document.documentElement.getAttribute('data-bs-theme')){
    document.documentElement.setAttribute('data-bs-theme',localStorage.getItem('gdi-theme')||'dark');
  }

  // ── 5) FIX modal serrilhada (belt-and-suspenders do CSS) ──
  document.addEventListener('shown.bs.modal',function(ev){
    const dlg=ev.target&&ev.target.querySelector&&ev.target.querySelector('.modal-dialog');
    if(!dlg)return;
    dlg.style.transform='translateZ(0)';
    void dlg.offsetHeight;
    setTimeout(function(){dlg.style.transform='';},0);
  },true);
})();
