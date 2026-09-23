// ═══════════════════════════════════════════════════════════════
// gdi-meggy.js — M9-ISA (Meggy IA) + M-AI (widget chat)
// 
// REFACTORED (Task 4-c):
//   • PATCH A: page:change handler debounced 1.5s + 30s fallback throttle.
//   • PATCH B: addQBatch() — batch insert questions (O(N) instead of O(N²)).
//   • PATCH C: renderHistory() caches parsed HTML per message.
//   • PATCH D: Resumos migration loop removed (tab removed entirely).
//   • PATCH E: Flashcards library virtualized (accordion + 50/page pagination).
//   • PATCH F: window.gdiEnsurePdfjs() — consolidated idempotent pdf.js loader.
//   • REMOVIDO: aba "Resumos" (user request) — window.renderResumos = no-op stub.
//   • Public APIs preserved (window.gdiIsaPdf with all 15 methods).
//
// Módulo da Meggy 🐩 — poodle tutora de estudos. Inclui:
//   • M9-ISA: extração de texto de PDF (pdf.js + OCR Tesseract),
//     geração em cadeia de resumo + pílulas + questões + flashcards,
//     cache no Drive, biblioteca de flashcards organizada por
//     disciplina → tema → flip cards 3D
//   • M-AI: widget flutuante de chat com a Meggy (IA do navegador
//     ou servidor /api/ai)
//
// Depende de: gdi-core.js (Bus, showToast, lsGet/lsSet)
// ═══════════════════════════════════════════════════════════════

// ═══ M9-ISA: EXTRAÇÃO DE PDF + RESUMOS/QUESTÕES COM A ISA ═══
// Fornece window.gdiIsaPdf (summary/questions) consumido pelo M9
// (materiais). Usa pdf.js para extrair texto do PDF e /api/ai (ISA)
// para gerar resumo/questões. Sumários são salvos em localStorage
// 'gdi-isa-summaries-v1'. Questões vão para o banco do M23
// ('gdi-questions-v1').
// ═══════════════════════════════════════════════════════════════
(function(){
  if(window.__gdiM9Isa)return;window.__gdiM9Isa=true;
  const LS_SUM='gdi-isa-summaries-v1';
  const LQ='gdi-questions-v1';
  const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const lsGet=(k,d)=>{try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(_){return d}};
  const lsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}};
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
    }catch(_){}
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
    }catch(_){}
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
        }catch(_){}
      }
      if(items.length)return items;
    }catch(_){}
    // 6) falhou tudo — inclui os primeiros 500 chars da resposta
    const preview=String(raw).slice(0,500).replace(/\s+/g,' ');
    const err=new Error('Resposta não é JSON array válido. Primeiros 500 chars: '+preview);
    err.raw=String(raw);
    throw err;
  }
  // Exposto no window para ser reutilizado por outros módulos (M23, etc.)
  window.__gdiParseJsonArray=parseJsonArray;

  // ── CSS ──
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
.gdi-fc-card{position:relative;perspective:1500px;height:170px;cursor:pointer;isolation:isolate;}
.gdi-fc-card-large{height:340px;max-width:560px;margin:0 auto;}
.gdi-fc-card-inner{position:absolute;inset:0;transform-style:preserve-3d;-webkit-transform-style:preserve-3d;transition:transform .55s cubic-bezier(.4,0,.2,1);will-change:transform;}
.gdi-fc-card.gdi-fc-flipped .gdi-fc-card-inner{transform:rotateY(180deg);-webkit-transform:rotateY(180deg);}
.gdi-fc-card-face{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:18px 16px;border-radius:12px;box-sizing:border-box;text-align:center;overflow:hidden;transition:opacity .3s;will-change:transform;}
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

  // ═══ PATCH F: Consolidated pdf.js loader (idempotent, sets workerSrc once) ═══
  // Outros módulos (gdi-study, gdi-core M9, gdi-pdf) podem usar o mesmo loader.
  if(!window.gdiEnsurePdfjs){
    window.gdiEnsurePdfjs=function(){
      if(window._pdfjsPromise)return window._pdfjsPromise;
      window._pdfjsPromise=new Promise((resolve,reject)=>{
        if(window.pdfjsLib){
          if(!window.pdfjsLib._gdiWorkerSrcSet){
            try{
              window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
              window.pdfjsLib._gdiWorkerSrcSet=true;
            }catch(_){}
          }
          return resolve(window.pdfjsLib);
        }
        const s=document.createElement('script');
        s.src='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
        s.crossOrigin='anonymous';
        s.onload=()=>{
          if(window.pdfjsLib){
            try{
              window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
              window.pdfjsLib._gdiWorkerSrcSet=true;
            }catch(_){}
            resolve(window.pdfjsLib);
          }else{
            reject(new Error('pdfjsLib não exposto pelo CDN'));
          }
        };
        s.onerror=()=>reject(new Error('Falha ao carregar pdf.js do CDN'));
        document.head.appendChild(s);
      });
      return window._pdfjsPromise;
    };
  }

  // ── Dynamic load pdf.js (v3.11.174) — agora delega para window.gdiEnsurePdfjs() ──
  function ensurePdfjs(){
    return window.gdiEnsurePdfjs();
  }

  // ── Dynamic load Tesseract.js (OCR para PDFs escaneados) ──
  // ★ Carrega só quando necessário (PDFs sem texto selecionável).
  // Usa modelo em português (por) + inglês (eng) como fallback.
  let tesseractPromise=null;
  function ensureTesseract(){
    if(window.Tesseract)return Promise.resolve(window.Tesseract);
    if(tesseractPromise)return tesseractPromise;
    tesseractPromise=new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      s.crossOrigin='anonymous';
      s.onload=()=>{
        if(window.Tesseract)resolve(window.Tesseract);
        else reject(new Error('Tesseract não exposto pelo CDN'));
      };
      s.onerror=()=>reject(new Error('Falha ao carregar Tesseract.js do CDN'));
      document.head.appendChild(s);
    });
    return tesseractPromise;
  }

  // ── OCR de uma página: renderiza no canvas e roda Tesseract ──
  // Retorna o texto extraído. Mostra progresso via callback opcional.
  // ★ Configurações otimizadas para PDFs escaneados de apostilas:
  //   - scale 3x (melhor precisão que 2x, ainda razoável em memória)
  //   - PSM 3 (auto page segmentation — funciona para texto corrido e múltiplas colunas)
  //   - idiomas: português + inglês
  async function ocrPdfPage(pdfjs,doc,pageNum,progressCb){
    const page=await doc.getPage(pageNum);
    // escala 3x para melhorar precisão do OCR (testado: 2x = muita falha, 3x = bom)
    const viewport=page.getViewport({scale:3});
    const canvas=document.createElement('canvas');
    const ctx=canvas.getContext('2d');
    canvas.width=viewport.width;
    canvas.height=viewport.height;
    // fundo branco para páginas transparentes
    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    await page.render({canvasContext:ctx,viewport}).promise;
    const Tesseract=await ensureTesseract();
    // idioma: português + inglês (modelos baixados do CDN do Tesseract)
    // ★ parâmetros otimizados:
    //   - tessedit_pageseg_mode=3 (auto — detecta orientação + colunas automaticamente)
    //   - preserve_interword_spaces=1 (mantém espaços entre palavras)
    const result=await Tesseract.recognize(
      canvas,
      'por+eng',
      {
        logger:m=>{
          if(m.status==='recognizing text'&&progressCb){
            progressCb(pageNum,doc.numPages,m.progress);
          }
        },
        // path dos modelos de idioma (CDN jsdelivr)
        corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@5',
        workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
        langPath:'https://tessdata.project-fast.com/4.0.0',
        // parâmetros do Tesseract engine
        tessedit_pageseg_mode:'3',
        preserve_interword_spaces:'1',
      }
    );
    return result.data.text||'';
  }

  // ── Extract text from PDF (up to 30 pages, ~8000 chars) ──
  // FIX: alguns PDFs têm texto selecionável mas getTextContent() básico
  // retorna vazio (fontes com encoding custom, text runs fragmentados).
  // Usa opções avançadas + fallback em annotations.
  // ★FIX v2: erros descritivos (não engole mais silenciosamente) + retry
  // com opções alternativas de fetch + fallback para PDFs escaneados.
  // ★FIX v3: OCR (Tesseract.js) como fallback quando pdf.js retorna vazio.
  //   - Suporta um callback de progresso (para mostrar "OCR: página 3/11…")
  //   - Limita a 8 páginas no OCR (tempo total ~2-4 min para PDF grande)
  //   - Idiomas: português + inglês
  async function extractPdfText(url, progressCb){
    const pdfjs=await ensurePdfjs();

    // ★ Tenta fetch com credenciais same-origin primeiro; se falhar,
    // tenta sem credenciais (alguns workers rejeitam cookies em fetch cross-origin)
    let resp;
    let fetchErr;
    const fetchOpts=[
      {credentials:'same-origin'},
      {credentials:'include'},
      {} // sem credenciais
    ];
    for(const opts of fetchOpts){
      try{
        resp=await fetch(url,opts);
        if(resp.ok)break;
      }catch(e){fetchErr=e;}
    }
    if(!resp||!resp.ok){
      const status=resp?resp.status:(fetchErr?fetchErr.message:'unknown');
      throw new Error('HTTP '+status+' ao baixar PDF');
    }
    const buf=await resp.arrayBuffer();
    if(!buf||buf.byteLength<100){
      throw new Error('PDF vazio ou muito pequeno ('+(buf?buf.byteLength:0)+' bytes)');
    }

    let doc;
    try{
      doc=await pdfjs.getDocument({data:buf,disableFontFace:true,isEvalSupported:false}).promise;
    }catch(e){
      throw new Error('pdf.js não conseguiu abrir o PDF: '+(e&&e.message||e));
    }
    const n=Math.min(doc.numPages,100);
    let txt='';

    for(let i=1;i<=n;i++){
      const pg=await doc.getPage(i);
      // ★ opções avançadas: normaliza whitespace, combina text items adjacentes,
      // inclui marked content (alguns PDFs usam isso para texto)
      let tc;
      try{
        tc=await pg.getTextContent({normalizeWhitespace:true,disableCombineTextItems:false,includeMarkedContent:true});
      }catch(_){
        tc=await pg.getTextContent(); // fallback sem opções
      }

      // extrai texto de items — x.str, x.str+hasEOL, também pega "transform" position
      let pageText='';
      for(const item of tc.items){
        if(item.str!==undefined){
          pageText+=item.str;
          if(item.hasEOL)pageText+='\n';
        }else if(item.type==='markedContent'||item.type==='beginMarkedContent'){
          // marked content — pode conter texto estruturado
          continue;
        }
      }

      // se página ficou vazia mas tem texto, tenta sem opções
      if(!pageText.trim()){
        try{
          const tc2=await pg.getTextContent();
          pageText=tc2.items.map(x=>(x.str||'')+(x.hasEOL?'\n':' ')).join('');
        }catch(_){}
      }

      txt+=pageText+'\n\n';
      if(txt.length>50000)break;
    }

    // ★ fallback: tenta extrair de annotations/form fields
    // (alguns PDFs têm texto em campos de formulário)
    if(!txt.trim()||txt.trim().length<50){
      try{
        for(let i=1;i<=n;i++){
          const pg=await doc.getPage(i);
          const annots=await pg.getAnnotations();
          for(const a of annots){
            if(a.fieldValue&&typeof a.fieldValue==='string')txt+=a.fieldValue+'\n';
            if(a.contents&&typeof a.contents==='string')txt+=a.contents+'\n';
          }
          if(txt.length>10000)break;
        }
      }catch(_){}
    }

    // ★★ FALLBACK OCR (Tesseract.js) — para PDFs escaneados (só imagens) ★★
    // Se pdf.js extraiu menos de 50 chars, é provável que o PDF seja escaneado.
    // Renderizamos cada página como imagem e rodamos OCR em português.
    // ★ Limita a 15 páginas no OCR (~3-6 min no total). Para PDFs maiores,
    // as primeiras 15 páginas já dão contexto suficiente para a Meggy gerar
    // resumo + questões + pílulas úteis.
    if(!txt.trim()||txt.trim().length<50){
            const ocrMaxPages=Math.min(doc.numPages,15);
      if(progressCb)progressCb({phase:'ocr-init',page:0,total:ocrMaxPages});
      try{
        let ocrTxt='';
        for(let i=1;i<=ocrMaxPages;i++){
          if(progressCb)progressCb({phase:'ocr-page',page:i,total:ocrMaxPages,progress:0});
          let pageTxt='';
          try{
            pageTxt=await ocrPdfPage(pdfjs,doc,i,(pNum,pTotal,p)=>{
              if(progressCb)progressCb({phase:'ocr-page',page:pNum,total:pTotal,progress:p});
            });
          }catch(ocrErr){
            console.warn('[Meggy] OCR falhou na página',i,'(não crítico):',ocrErr.message);
            pageTxt='';
          }
          ocrTxt+=pageTxt+'\n\n';
          if(ocrTxt.length>50000)break;
        }
        if(ocrTxt.trim().length>50){
          // sucesso! OCR extraiu texto
          try{doc.destroy();}catch(_){}
          if(progressCb)progressCb({phase:'ocr-done',chars:ocrTxt.length});
          return ocrTxt.replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim().slice(0,50000);
        }
      }catch(ocrErr){
        console.warn('[Meggy] OCR falhou:',ocrErr.message);
        // continua para o erro descritivo abaixo
      }
    }

    try{doc.destroy();}catch(_){}
    // limpa texto: remove espaços excessivos, decodifica entidades
    txt=txt.replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
    const result=txt.slice(0,50000);
    if(!result||result.length<50){
      // ★ Erro descritivo: PDF provavelmente é escaneado (só imagens)
      // e o OCR também falhou ou não retornou texto útil
      throw new Error('PDF sem texto selecionável e OCR não conseguiu extrair. Possíveis causas:\n• PDF é composto só de imagens (escaneado) e o OCR falhou\n• PDF está criptografado ou corrompido\n• Falha ao baixar modelos de OCR do CDN (Tesseract.js)\n\nTente abrir o PDF num leitor comum para confirmar o conteúdo.');
    }
    return result;
  }

  // ── ISA call (POST /api/ai) ──
  async function callIsa(prompt){
    const r=await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:prompt,messages:[]})});
    const data=await r.json();
    if(!data.ok)throw new Error(data.error||'Meggy indisponível');
    return data.response||'';
  }

  // ── Render Markdown (uses marked if available, fallback to <br>) ──
  // ★ XSS-safe: NUNCA retorna HTML não sanitizado — fallback sempre escapa
  function renderMd(txt){
    if(window.marked){
      try{
        const html=marked.parse(txt);
        // ★ FIX: se gdiSanitize não carregou (CDL caiu, etc.), NÃO retorna HTML cru
        if(window.gdiSanitize){try{return window.gdiSanitize(html);}catch(_){}}
        return esc(txt).replace(/\n/g,'<br>');
      }catch(_){}
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

  // ── Question bank integration (replicates M23 addQ on LS) ──
  function addQ(obj){
    const q=lsGet(LQ,[]);
    q.push({id:uid(),createdAt:Date.now(),hits:0,misses:0,...obj});
    lsSet(LQ,q);
  }

  // ═══ PATCH B: Inserção em batch de questões (elimina O(N²) no localStorage) ═══
  // Lê LS 1×, faz push de todos os itens únicos, grava 1×.
  // Retorna o número de itens efetivamente adicionados (após dedupe por statement).
  function addQBatch(newItems){
    if(!newItems||!newItems.length)return 0;
    const all=lsGet(LQ,[]);
    const seen=new Set(all.map(x=>x.statement));
    let added=0;
    for(const item of newItems){
      if(!item||!item.statement||seen.has(item.statement))continue;
      all.push(Object.assign({
        id:'q'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
        createdAt:Date.now(),
        hits:0,
        misses:0
      },item));
      seen.add(item.statement);
      added++;
    }
    if(added)lsSet(LQ,all);
    return added;
  }

  // ── Summaries storage ──
  // ★ FIX: agora salva também o path do curso e a matéria — para o botão
  // "Resumo" no painel de materiais (M9) agrupar corretamente.
  // ★ FIX 3 (Task 13): também persiste no Drive via storage.js saveMaterial(),
  //    na subpasta 'resumos' da pasta do usuário. Assim o resumo sobrevive a
  //    limpeza do localStorage e fica acessível de outros dispositivos.
  function saveIsaSummary(lesson, summary, coursePath, subject){
    const arr=lsGet(LS_SUM,[]);
    // extrai course e subject do path se não vierem explícitos
    // path típico: /7:/Sou + Carreiras Policiais 5.0/Bloco I - Direito Constitucional/01 - Aula.mp4
    let derivedCourse=coursePath||'';
    let derivedSubject=subject||'';
    if(!derivedCourse){
      // tenta derivar do lessonKey atual (URL do navegador)
      const p=window.location.pathname||'';
      const seg=p.split('/').filter(Boolean);
      if(seg.length>=2){
        // /7:/Curso/Materia/Aula → curso = seg[1], materia = seg[2] (se houver)
        derivedCourse='/'+seg.slice(0,2).join('/')+'/';
        if(seg.length>=3)derivedSubject=decodeURIComponent(seg[2]);
      }
    }
    arr.unshift({
      id:uid(),
      lesson:String(lesson||'Aula').slice(0,200),
      summary:String(summary||''),
      path:derivedCourse,
      subject:derivedSubject||'Geral',
      date:Date.now()
    });
    lsSet(LS_SUM,arr.slice(0,200));

    // ★ FIX 3 (Task 13): também salva no Drive (pasta do usuário / resumos / <hash>.md)
    // via storage.js. O servidor cria a subpasta 'resumos' on-demand.
    // Não-await — não bloqueia a UI; falha silenciosa (já temos o localStorage).
    try{
      if(window.GDIStorage && typeof window.GDIStorage.saveMaterial==='function' && derivedCourse && summary){
        window.GDIStorage.saveMaterial(derivedCourse, String(lesson||'Aula').slice(0,200), 'resumos', String(summary)).catch(()=>{});
      }
    }catch(_){}
  }
  function listIsaSummaries(){return lsGet(LS_SUM,[]);}
  function delIsaSummary(id){lsSet(LS_SUM,lsGet(LS_SUM,[]).filter(x=>x.id!==id));}

  // ── Download summary as PDF (via print dialog) ──
  function downloadAsPdf(lesson, markdownText){
    const html=renderMd(markdownText);
    const w=window.open('','_blank');
    if(!w){showToast('Permita pop-ups para baixar o PDF');return;}
    w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
    <title>${esc(lesson)} — Resumo Meggy</title>
    <style>
      @page{margin:2cm;size:A4;}
      *{box-sizing:border-box;}
      body{font-family:'Georgia','Times New Roman',serif;color:#1a1a1a;line-height:1.7;max-width:210mm;margin:0 auto;padding:20px;}
      h1{font-family:'Helvetica',sans-serif;font-size:22px;color:#c026d3;border-bottom:2px solid #ff8b9f;padding-bottom:8px;margin-bottom:6px;}
      .meta{font-family:'Helvetica',sans-serif;font-size:11px;color:#666;margin-bottom:24px;}
      h2{font-family:'Helvetica',sans-serif;font-size:17px;color:#1a1a1a;margin-top:24px;border-left:3px solid #ff8b9f;padding-left:10px;}
      h3{font-family:'Helvetica',sans-serif;font-size:14px;color:#333;margin-top:18px;}
      p{margin:8px 0;text-align:justify;}
      ul,ol{margin:8px 0;padding-left:24px;}
      li{margin:4px 0;}
      code{background:#f4f4f4;padding:2px 6px;border-radius:3px;font-family:'Courier New',monospace;font-size:12px;}
      pre{background:#f4f4f4;padding:12px;border-radius:6px;overflow-x:auto;font-size:11px;}
      blockquote{border-left:3px solid #ff8b9f;margin:12px 0;padding:4px 16px;color:#555;font-style:italic;}
      strong{color:#1a1a1a;}
      @media print{body{padding:0;}}
    </style></head><body>
    <h1>${esc(lesson)}</h1>
    <div class="meta">Resumo gerado pela Meggy 🐩 · ${new Date().toLocaleDateString('pt-BR')}</div>
    ${html}
    <script>window.onload=function(){setTimeout(function(){window.print();},300);};</script>
    </body></html>`);
    w.document.close();
  }

  // ── Copy summary to clipboard ──
  async function copySummary(text){
    try{
      await navigator.clipboard.writeText(text);
      showToast('Resumo copiado para a área de transferência');
    }catch(_){
      const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();
      try{document.execCommand('copy');showToast('Resumo copiado');}catch(_){showToast('Não foi possível copiar');}
      ta.remove();
    }
  }

  // ── Lesson key (cache key = URL pathname, estável entre visitas) ──
  function lessonKey(){return window.location.pathname.split('?')[0];}

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
    }catch(_){}
    const h=document.querySelector('.gdi-file-header-name');
    if(h&&h.textContent&&h.textContent.trim().length>3)return h.textContent.trim();
    return fallback||'Aula';
  }

  // ── Drive cache (GET/POST /api/ai/cache) ──
  // ★ Sprint 4: agora tenta primeiro os endpoints granulares opcionais
  //   /api/ai/summaries, /api/ai/flashcards, /api/ai/questions
  //   Se falhar (worker antigo), cai para o cache unificado /api/ai/cache.
  //   Isso permite migração gradual: worker novo = 4 arquivos; worker antigo = 1.
  const GRANULAR_AVAILABLE = (function(){
    // detecta uma vez se endpoints granulares existem (HEAD request)
    let _checked=null;
    return async function(){
      if(_checked!==null)return _checked;
      try{
        const r=await fetch('/api/ai/summaries?probe=1',{method:'HEAD'});
        _checked=r.ok;
      }catch(_){_checked=false;}
      return _checked;
    };
  })();

  async function cacheGet(){
    try{
      // ★ tenta endpoint granular primeiro (summaries)
      const granular=await GRANULAR_AVAILABLE();
      if(granular){
        const r=await fetch('/api/ai/summaries?key='+encodeURIComponent(lessonKey()),{cache:'no-store'});
        const d=await r.json();
        if(d&&d.ok&&d.cached)return d.cached;
        return null;
      }
      // fallback: cache unificado antigo
      const r=await fetch('/api/ai/cache?key='+encodeURIComponent(lessonKey()),{cache:'no-store'});
      const d=await r.json();
      return (d&&d.ok&&d.cached)?d.cached:null;
    }catch(_){return null;}
  }
  async function cacheSave(summary,questions,lessonName,mindmap){
    try{
      // ★FIX: se mindmap não foi passado, preserva o que já está no cache
      // (antes, ao adicionar mais questões, o cache era sobrescrito SEM mindmap)
      let mindmapToSave=mindmap;
      if(mindmapToSave===undefined){
        const existing=await cacheGet();
        mindmapToSave=(existing&&existing.mindmap)||null;
      }
      // ★ tenta endpoint granular primeiro; senão, cache unificado
      const granular=await GRANULAR_AVAILABLE();
      const endpoint=granular?'/api/ai/summaries':'/api/ai/cache';
      await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({key:lessonKey(),summary,questions,mindmap:mindmapToSave,lessonName})});
    }catch(_){/* não bloqueia o fluxo se o cache falhar */}
  }

  // ── Render summary card (structured layout + download/copy buttons) ──
  function renderSummaryCard(bodyEl, lesson, markdownText, fromCache){
    const cacheBadge=fromCache
      ?'<span style="font-size:11px;color:var(--ferreto-text-muted,#8b949e);"><i class="bi bi-cloud-check" style="color:#3fb950;"></i> do cache do Drive</span>'
      :'<span style="font-size:11px;color:var(--ferreto-text-muted,#8b949e);"><i class="bi bi-check2-circle" style="color:#3fb950;"></i> salvo no Drive + Central</span>';
    bodyEl.innerHTML=`<div class="gdi-mat-isa-result" style="max-width:760px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:14px;padding:12px 16px;background:linear-gradient(135deg,rgba(255,139,159,.12),rgba(93,222,218,.06));border:1px solid var(--ferreto-border,#21262d);border-radius:14px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:8px;min-width:0;">
          <i class="bi bi-stars" style="color:var(--ferreto-primary,#ff8b9f);font-size:20px;flex:none;"></i>
          <b style="color:var(--ferreto-text,#f0f6fc);font-family:var(--ferreto-font-display,'Poppins',sans-serif);font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Resumo Meggy 🐩 · ${esc(lesson)}</b>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          ${cacheBadge}
          <button id="gdi-isa-regen" title="Regerar (PDF pode estar incompleto)" style="background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);color:var(--ferreto-text,#e6edf3);border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;transition:.15s;"><i class="bi bi-arrow-clockwise"></i> Regerar</button>
          <button id="gdi-isa-dl" title="Baixar em PDF" style="background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);color:var(--ferreto-text,#e6edf3);border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;transition:.15s;"><i class="bi bi-file-earmark-pdf"></i> PDF</button>
          <button id="gdi-isa-copy" title="Copiar resumo" style="background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);color:var(--ferreto-text,#e6edf3);border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;transition:.15s;"><i class="bi bi-clipboard"></i> Copiar</button>
        </div>
      </div>
      <div class="gdi-isa-summary-body" style="background:var(--ferreto-surface-2,rgba(255,255,255,.03));border:1px solid var(--ferreto-border,#21262d);border-radius:14px;padding:20px 24px;color:var(--ferreto-text,#e6edf3);font-size:14px;line-height:1.8;">
        ${renderMd(markdownText)}
      </div>
    </div>`;
    bodyEl.querySelector('#gdi-isa-dl').onclick=()=>downloadAsPdf(lesson,markdownText);
    bodyEl.querySelector('#gdi-isa-copy').onclick=()=>copySummary(markdownText);
    // ★ botão Regerar: limpa cache e regenera resumo + questões
    const regenBtn=bodyEl.querySelector('#gdi-isa-regen');
    if(regenBtn)regenBtn.onclick=()=>{
      // busca os items do M9 para passar para regenerate
      const matTabs=document.querySelector('#gdi-mat-tabs');
      if(matTabs&&matTabs.__items){
        window.gdiIsaPdf.regenerate(matTabs.__items,bodyEl,lesson);
      }else{
        showToast('Navegue para a aba de materiais para regerar');
      }
    };
  }

  // ── Auto-criar flashcards das questões geradas ──
  // Cada questão vira um flashcard: frente = enunciado, verso = resposta certa + explicação
  // ★FIX: usa gdi-cards-v1 (mesma chave da Central de Estudos) em vez de gdi-fc-v1
  // ★FIX v2: agora salva urlPath (path real da aula) para permitir agrupar por
  // disciplina (pasta pai) e tema (nome da aula) na biblioteca de flashcards.
  function autoCreateFlashcards(questions,lesson,urlPath){
    const cards=lsGet('gdi-cards-v1',[]);
    let n=0;
    const path=urlPath||lessonKey()||lesson;
    questions.forEach(q=>{
      if(!q||!q.statement||!Array.isArray(q.options))return;
      const correctLetter=String.fromCharCode(65,q.correct||0);
      const correctText=q.options[q.correct||0]||'';
      const back=correctLetter+') '+correctText+(q.explanation?'\n\n💡 '+q.explanation:'');
      // evita duplicatas (mesma frente)
      const exists=cards.some(c=>c.f===q.statement);
      if(!exists){
        cards.push({id:uid(),f:q.statement,b:back,due:Date.now()+86400000,box:0,src:'ISA:'+lesson,path:path,lesson:lesson,createdAt:Date.now()});
        n++;
      }
    });
    if(n)lsSet('gdi-cards-v1',cards);
    return n;
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
  const LS_SUBJECTS='gdi-subjects-v1';
  function getSubjects(){return lsGet(LS_SUBJECTS,[]);}
  function saveSubject(subj){
    const arr=getSubjects();
    const idx=arr.findIndex(s=>s.id===subj.id);
    if(idx>=0)arr[idx]=subj;else arr.push(subj);
    lsSet(LS_SUBJECTS,arr);
  }
  function deleteSubject(id){
    lsSet(LS_SUBJECTS,getSubjects().filter(s=>s.id!==id));
  }
  // expor para outros módulos
  window.gdiSubjects={get:getSubjects,save:saveSubject,delete:deleteSubject,LS:LS_SUBJECTS};

  // ── GERAÇÃO EM CADEIA: resumo + pílulas + questões ──
  // Qualquer aba clicada (Resumo/Questões/Pílulas) dispara a geração
  // dos 3 em cadeia se ainda não existirem. Cada um é salvo no Drive.
  // As questões ciclam entre TODOS os PDFs, gerando até 20 por material.

  // Cache em memória para evitar regenerar na mesma sessão
  let _chainCache={};
  // ★ Sprint 6: LRU no _chainCache (limita a 5 aulas em memória)
  const _chainCacheMax=5;
  function _chainCacheEvict(){
    const keys=Object.keys(_chainCache);
    if(keys.length>_chainCacheMax){
      // remove o mais antigo (primeiro inserido — aproximação LRU)
      delete _chainCache[keys[0]];
    }
  }

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

  // callIsa para tarefas paralelas — SEM header customizado (evita CORS)
  // O worker já faz round-robin entre as chaves NVIDIA automaticamente.
  // Requisições paralelas naturalmente usam chaves diferentes.
  async function callIsaKeyed(prompt,keyHint){
    return callIsa(prompt);
  }

  // ★ Classifica material pelo nome do arquivo (Task FINAL / Fix 1c)
  //   - 'questions': arquivos de questões/exercícios/simulados/provas
  //   - 'skip':      .md cujo nome contém "resumo"/"summary" — já é resumo pronto
  //   - 'study':     material de estudo padrão (PDFs, .txt, .html, .md comum)
  function classifyMaterial(name){
    const n=(name||'').toLowerCase();
    if(/quest|exerc|simulad|prova|caderno|lista|test/.test(n))return 'questions';
    if(/\.md$/.test(n)&&/resum|summary/.test(n))return 'skip';
    return 'study';
  }

  // ★ Task FINAL: extract text from .txt files (transcriptions)
  // Strips code blocks, script tags, and other noise
  async function extractTextFile(url){
    try{
      const r=await fetch(url,{credentials:'same-origin'});
      if(!r.ok)return '';
      let txt=await r.text();
      // Strip code blocks (```...```)
      txt=txt.replace(/```[\s\S]*?```/g,'');
      // Strip inline code (`...`)
      txt=txt.replace(/`[^`]*`/g,'');
      // Strip script/style content if present
      txt=txt.replace(/<script[\s\S]*?<\/script>/gi,'');
      txt=txt.replace(/<style[\s\S]*?<\/style>/gi,'');
      // Normalize whitespace
      txt=txt.replace(/\r\n/g,'\n').replace(/\t/g,'  ').replace(/\n{3,}/g,'\n\n').trim();
      return txt;
    }catch(e){
      console.warn('[Meggy] extractTextFile falhou:',e.message);
      return '';
    }
  }

  // ★ Task FINAL: extract text from .html files (ebooks, AI summaries)
  // Strips HTML tags, scripts, styles, and converts to plain text
  async function extractHtmlText(url){
    try{
      const r=await fetch(url,{credentials:'same-origin'});
      if(!r.ok)return '';
      let html=await r.text();
      // Strip script/style
      html=html.replace(/<script[\s\S]*?<\/script>/gi,'');
      html=html.replace(/<style[\s\S]*?<\/style>/gi,'');
      html=html.replace(/<noscript[\s\S]*?<\/noscript>/gi,'');
      // Convert common HTML to text
      html=html.replace(/<br\s*\/?>/gi,'\n');
      html=html.replace(/<\/p>/gi,'\n\n');
      html=html.replace(/<\/div>/gi,'\n');
      html=html.replace(/<\/li>/gi,'\n');
      html=html.replace(/<li[^>]*>/gi,'- ');
      html=html.replace(/<h[1-6][^>]*>/gi,'\n## ');
      html=html.replace(/<\/h[1-6]>/gi,'\n\n');
      // Strip all remaining HTML tags
      html=html.replace(/<[^>]+>/g,'');
      // Decode HTML entities
      html=html.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ');
      // Normalize whitespace
      html=html.replace(/\r\n/g,'\n').replace(/\t/g,'  ').replace(/\n{3,}/g,'\n\n').trim();
      return html;
    }catch(e){
      console.warn('[Meggy] extractHtmlText falhou:',e.message);
      return '';
    }
  }

  // ★ Task FINAL: classify file type by extension
  function getFileType(name){
    const n=(name||'').toLowerCase();
    if(/\.txt$/i.test(n))return 'txt';
    if(/\.md$/i.test(n))return 'md';
    if(/\.html?$/.test(n))return 'html';
    if(/\.pdf$/i.test(n))return 'pdf';
    return 'other';
  }

  // ★ Task FINAL: priority order for material extraction
  // 1. .txt/.md (transcrição/resumo) — highest priority
  // 2. .html (ebook/resumo IA) — second priority
  // 3. .pdf (material da aula) — third priority
  // 4. OCR (last resort — only if no other source)
  function materialPriority(name){
    const t=getFileType(name);
    if(t==='txt'||t==='md')return 0;   // highest
    if(t==='html')return 1;
    if(t==='pdf')return 2;
    return 3;
  }

  // Gera TODOS os materiais EM PARALELO TOTAL (não em cascata)
  // Cada tarefa usa uma chave NVIDIA diferente (se houver múltiplas)
  async function generateAll(items,lesson,trigger,progressCb){
    const key=lessonKey();
    // ★ FIX 3 (Task 13): deriva coursePath e subject da URL atual para passar
    //    explicitamente ao saveIsaSummary (que agora também persiste no Drive).
    //    Antes, saveIsaSummary derivava sozinho — mas sempre que generateAll
    //    era chamado a partir de uma página de aula, a URL já tinha o formato
    //    /<drive>:/<curso>/<materia>/<aula>, então derivar 1× aqui é mais eficiente
    //    e garante consistência entre os 2 call-sites (cache hit e geração nova).
    const _p=window.location.pathname||'';
    const _seg=_p.split('/').filter(Boolean);
    let _coursePath='',_subject='';
    if(_seg.length>=2){
      _coursePath='/'+_seg.slice(0,2).join('/')+'/';
      if(_seg.length>=3)_subject=decodeURIComponent(_seg[2]);
    }
    // se já tem tudo no cache em memória, pula
    if(_chainCache[key]&&_chainCache[key].summary&&_chainCache[key].mindmap&&_chainCache[key].questionsGenerated){
      return _chainCache[key];
    }

    // verifica cache do Drive PRIMEIRO (antes de extrair PDF)
    const cached=await cacheGet();
    if(!_chainCache[key]){_chainCache[key]={};_chainCacheEvict();}
    if(cached){
      _chainCache[key].summary=cached.summary||null;
      _chainCache[key].mindmap=cached.mindmap||null;
      _chainCache[key].cachedQuestions=cached.questions||[];
    }

    // ★ Se já tem resumo + pílulas + questões no Drive, carrega e NÃO regenera
    if(_chainCache[key].summary&&_chainCache[key].mindmap&&cached&&cached.questions&&cached.questions.length){
      _chainCache[key].questionsGenerated=true;
      _chainCache[key].questions=cached.questions;
      // ★ PATCH B: carrega questões no banco local em batch (1 read + 1 write)
      const _batch=[];
      cached.questions.forEach(q=>{
        if(q&&q.statement){
          let cleanQ;
          if(q.type==='tf'||(!q.options&&q.correct!==undefined)){
            cleanQ={subject:lesson,type:'tf',statement:String(q.statement),options:['Certo','Errado'],correct:Math.max(0,Math.min(1,Number(q.correct)||0)),explanation:String(q.explanation||''),source:'ISA-PDF'};
          }else if(Array.isArray(q.options)){
            cleanQ={subject:lesson,type:'mc',statement:String(q.statement),options:q.options.map(String),correct:Math.max(0,Math.min(3,Number(q.correct)||0)),explanation:String(q.explanation||''),source:'ISA-PDF'};
          }
          if(cleanQ)_batch.push(cleanQ);
        }
      });
      addQBatch(_batch);
      // flashcards do cache
      if(cached.questions.length)autoCreateFlashcards(cached.questions,lesson,lessonKey());
      saveIsaSummary(lesson,_chainCache[key].summary,_coursePath,_subject);
            return _chainCache[key];
    }

    // só extrai PDF se precisa gerar algo
    let allText='';
    const pdfTexts=[];
    const pdfErrors=[]; // ★ coleta erros por PDF para diagnóstico
    // ★ Sprint 6: paraleliza extração (era sequencial, demorava 4x mais)
    if(progressCb)progressCb({phase:'extract-start',total:items.length});
    // ★ Task FINAL: extract from ALL file types (txt, md, html, pdf) — not just PDFs
    // Priority: .txt/.md > .html > .pdf > OCR
    const sortedItems=items.slice().sort((a,b)=>materialPriority(a.name)-materialPriority(b.name));
    const results=await Promise.allSettled(sortedItems.map(async item=>{
      try{
        if(progressCb)progressCb({phase:'extract',pdf:item.name});
        const ftype=getFileType(item.name);
        let txt='';
        if(ftype==='txt'||ftype==='md'){
          txt=await extractTextFile(item.url);
        }else if(ftype==='html'){
          txt=await extractHtmlText(item.url);
        }else{
          txt=await extractPdfText(item.url,(p)=>{
            if(progressCb)progressCb(Object.assign({pdf:item.name},p));
          });
        }
        return {name:item.name,text:txt};
      }catch(e){
        throw {name:item.name,error:e.message||String(e),url:item.url};
      }
    }));
    results.forEach(r=>{
      if(r.status==='fulfilled'){
        const {name,text}=r.value;
        if(text&&text.trim().length>50){
          allText+=(allText?'\n\n---\n\n':'')+text;
          pdfTexts.push({name,text});
        }
      }else{
        const err=r.reason||{};
        pdfErrors.push({name:err.name||'PDF',error:err.error||'erro',url:err.url||''});
        console.warn('[Meggy] PDF falhou:',err.name,err.error);
      }
    });
    if(!allText||allText.trim().length<50){
      // ★ Mensagem detalhada com os erros de cada PDF
      let detail='Não foi possível extrair texto dos PDFs.';
      if(pdfErrors.length){
        detail+=' Erros por arquivo:\n';
        pdfErrors.forEach(e=>{
          detail+='• '+e.name+': '+e.error+'\n';
        });
        // sugestões baseadas no tipo de erro
        const hasHttp=pdfErrors.some(e=>/HTTP/.test(e.error));
        const hasScanned=pdfErrors.some(e=>/escaneado|sem texto/i.test(e.error));
        const hasPdfjs=pdfErrors.some(e=>/pdf\.js/.test(e.error));
        detail+='\nSugestões:\n';
        if(hasHttp)detail+='• Verifique se o PDF está acessível (sem proteção de link) e se você está logado.\n';
        if(hasScanned)detail+='• Alguns PDFs são escaneados (só imagens) — a Meggy não faz OCR ainda.\n';
        if(hasPdfjs)detail+='• O PDF pode estar corrompido ou criptografado.\n';
        if(!hasHttp&&!hasScanned&&!hasPdfjs)detail+='• Tente abrir o PDF no navegador para confirmar que carrega normalmente.\n';
      }
      throw new Error(detail);
    }
    _chainCache[key].allText=allText;
    _chainCache[key].pdfTexts=pdfTexts;

    // ★ PARALELISMO TOTAL: resumo + pílulas + questões de cada PDF — TODOS ao mesmo tempo
    // Cada tarefa recebe um keyHint diferente para distribuir entre as APIs NVIDIA
    
    const allTasks=[];

    // tarefa 1: resumo
    if(!_chainCache[key].summary){
      allTasks.push({
        // ★ Task FINAL / Fix 1d: prompt reformulado para resumo PROFUNDO e DETALHADO
        //   - mínimo 2000 caracteres (era ~500)
        //   - exige ## títulos + ### subtítulos + EXEMPLOS práticos + pegadinhas
        //   - seções ## Pegadinhas de Prova e ## Resumo Rápido ao final
        //   - usa até 40000 chars do material (era 20000)
        fn:()=>callIsaKeyed('Você é um professor especialista em concursos públicos. Leia TODO o material abaixo e crie um RESUMO PROFUNDO E DETALHADO em Markdown.\n\nREQUISITOS:\n- Mínimo 2000 caracteres (NÃO seja breve)\n- Estruture com ## títulos e ### subtítulos\n- Para CADA tópico: explique o conceito, dê EXEMPLOS práticos, e destaque pegadinhas de prova\n- Use **negrito** para palavras-chave e dispositivos legais\n- Use listas com marcadores para enumerações\n- Inclua uma seção ## Pegadinhas de Prova no final\n- Inclua uma seção ## Resumo Rápido com 5-10 bullets dos pontos mais importantes\n\nNÃO omita nenhum tema. Seja PROFUNDO, não conciso.\n\nMaterial:\n'+allText.slice(0,40000),0)
          .then(r=>{if(r&&r.trim()){_chainCache[key].summary=r;saveIsaSummary(lesson,r,_coursePath,_subject);}})
          .catch(e=>console.warn('[Meggy] resumo falhou',e.message))
      });
    }

    // tarefa 2: pílulas
    if(!_chainCache[key].mindmap){
      allTasks.push({
        
        fn:()=>callIsaKeyed('Crie "Pílulas" deste material — um resumo ultra-conciso em bullets. Apenas pontos-chave para revisão rápida. Máximo 15 bullets. Formato:\n# Pílulas\n- Ponto-chave 1\n- Ponto-chave 2\n...\n\nConteúdo:\n'+allText.slice(0,20000),0)
          .then(r=>{if(r&&r.trim())_chainCache[key].mindmap=r;})
          .catch(e=>console.warn('[Meggy] pílulas falhou',e.message))
      });
    }

    // tarefa 3+: questões de cada PDF (uma tarefa por PDF)
    if(!_chainCache[key].questionsGenerated){
      _chainCache[key].questionsGenerated=true;
      _chainCache[key]._allCleanQ=[];
      // ★ PATCH B: extrai questões existentes em batch (1 read + 1 write)
      const _batchExtract=[];
      for(const pdf of pdfTexts){
        const existing=extractQuestionsFromText(pdf.text);
        for(const q of existing){
          _batchExtract.push({subject:lesson,type:'open',statement:q,options:[],correct:0,explanation:'Questão extraída do material.',source:'PDF-extract'});
        }
      }
      addQBatch(_batchExtract);
      // uma tarefa por PDF
      pdfTexts.forEach((pdf)=>{
        allTasks.push({
          
          fn:()=>callIsaKeyed('Você é um examinador de concurso público brasileiro experiente. Baseado neste material, gere 10 questões de concurso em JSON array. Misture:\n- 6 múltipla escolha: {"type":"mc","statement":"...","options":["a","b","c","d"],"correct":0,"legalText":"...","explanation":"...","fundamentacao":"..."}\n- 4 certo/errado (CEBRASPE): {"type":"tf","statement":"...","correct":1,"legalText":"...","explanation":"...","fundamentacao":"..."}\n\nCAMPOS:\n- statement: enunciado claro, contexto completo\n- legalText: o dispositivo legal/dispositivo normativo aplicável (ex: "art. 5º, CF"; "Súmula Vinculante 14"; "Lei 8.906/94, art. 7º")\n- explanation: explicação técnica do acerto/erro (regra violada ou aplicada)\n- fundamentacao: fundamentação didática completa, explicando por que a alternativa correta está correta E por que as outras estão erradas\n\nSem comentários, só JSON.\n\n'+pdf.text.slice(0,15000),0)
            .then(resp=>{
              if(!resp)return;
              try{
                const arr=parseJsonArray(resp);
                // ★ PATCH B: inserir questões em batch (1 read + 1 write)
                const _batchAI=[];
                arr.forEach(q=>{
                  if(!q||!q.statement)return;
                  let cleanQ;
                  if(q.type==='tf'||(!q.options&&q.correct!==undefined)){
                    cleanQ={type:'tf',statement:String(q.statement),options:['Certo','Errado'],correct:Math.max(0,Math.min(1,Number(q.correct)||0)),explanation:String(q.explanation||''),legalText:String(q.legalText||q.fundamentacao||''),fundamentacao:String(q.fundamentacao||'')};
                  }else if(Array.isArray(q.options)){
                    cleanQ={type:'mc',statement:String(q.statement),options:q.options.map(String),correct:Math.max(0,Math.min(3,Number(q.correct)||0)),explanation:String(q.explanation||''),legalText:String(q.legalText||q.fundamentacao||''),fundamentacao:String(q.fundamentacao||'')};
                  }
                  if(cleanQ){
                    _batchAI.push(Object.assign({subject:lesson,source:'ISA-PDF'},cleanQ));
                    _chainCache[key]._allCleanQ.push(cleanQ);
                  }
                });
                addQBatch(_batchAI);
              }catch(e){console.warn('[Meggy] parse questões falhou',e.message);}
            })
            .catch(e=>console.warn('[Meggy] questões falharam',e.message))
        });
      });
    }

    // ★ EXECUTA TODAS AS TAREFAS AO MESMO TEMPO (paralelismo)
    // Se OpenRouter estiver configurado no worker, cada callIsa automaticamente
    // dispara 3 modelos free em paralelo (race) — primeiro a responder vence.
    // Isso significa que resumo+pílulas+questões(N PDFs) = 2+N tarefas × 3 modelos = race máximo.
    if(allTasks.length>0){
      await Promise.allSettled(allTasks.map(t=>t.fn()));
    }

    // finaliza: flashcards + salva no Drive
    _chainCache[key].questions=_chainCache[key]._allCleanQ||[];
    if(_chainCache[key].questions.length){
      autoCreateFlashcards(_chainCache[key].questions,lesson,lessonKey());
    }

    // salva TUDO no Drive em um único POST (resumo + pílulas + questões)
    try{
      await fetch('/api/ai/cache',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          key:lessonKey(),
          summary:_chainCache[key].summary||null,
          questions:_chainCache[key].questions||null,
          mindmap:_chainCache[key].mindmap||null,
          lessonName:lesson
        })});
    }catch(_){}
    // compartilha no pool de resumos
    if(_chainCache[key].summary){
      saveSharedSummary(lesson,_chainCache[key].summary,_chainCache[key].questions||null);
    }

    return _chainCache[key];
  }

  // ── Summary flow (com cadeia) ──
  // ★ Task CLEANUP / BUG 1: checks cacheGet() FIRST. If cache has a summary,
  //   display it immediately (don't regenerate on every page reload). Only
  //   call generateAll() if cache is empty. After generateAll(), the cache
  //   is already saved (line ~1207 in generateAll).
  async function summary(items,bodyEl,lessonName){
    if(!items||!items.length){setError(bodyEl,'Nenhum PDF disponível.');return;}
    const lesson=realLessonName(lessonName||items[0].name);
    bodyEl.__items=items;bodyEl.__lesson=lesson;

    // ★ BUG 1 FIX: check Drive cache FIRST. If summary exists, render & return.
    try{
      setLoading(bodyEl,'Procurando resumo salvo…');
      const cached=await cacheGet();
      if(cached&&cached.summary&&String(cached.summary).trim().length>20){
        const key=lessonKey();
        if(!_chainCache[key]){_chainCache[key]={};_chainCacheEvict();}
        _chainCache[key].summary=cached.summary;
        _chainCache[key].mindmap=cached.mindmap||null;
        _chainCache[key].cachedQuestions=cached.questions||[];
        renderSummaryCard(bodyEl,lesson,cached.summary,true);
        const qCount=(cached.questions&&cached.questions.length)||0;
        const badge=document.createElement('div');
        badge.style.cssText='background:rgba(63,185,80,.1);border:1px solid rgba(63,185,80,.3);border-radius:10px;padding:8px 14px;margin-bottom:12px;display:flex;align-items:center;gap:8px;font-size:12px;color:#3fb950;flex-wrap:wrap;';
        let badgeHtml='<i class="bi bi-cloud-check-fill"></i> <b>Do cache do Drive:</b> ';
        const parts=[];
        parts.push('✓ Resumo');
        if(cached.mindmap)parts.push('✓ Pílulas');
        if(qCount>0)parts.push('✓ '+qCount+' questões');
        badgeHtml+=parts.join(' · ');
        badge.innerHTML=badgeHtml;
        bodyEl.querySelector('.gdi-mat-isa-result')?.insertBefore(badge,bodyEl.querySelector('.gdi-mat-isa-result').firstChild);
        showToast('Resumo carregado do cache do Drive');
        return;
      }
    }catch(_){/* cache miss — fall through to generate */}

    // cache miss — generate fresh
    setLoading(bodyEl,'Meggy está lendo o material e criando resumo + questões + pílulas…');
    try{
      const result=await generateAll(items,lesson,'summary',(p)=>{
        // ★ feedback de progresso durante extração/OCR
        if(p.phase==='extract')setLoading(bodyEl,'Extraindo texto: '+p.pdf+'…');
        else if(p.phase==='ocr-init')setLoading(bodyEl,'PDF escaneado detectado — iniciando OCR (pode levar alguns minutos)…');
        else if(p.phase==='ocr-page')setLoading(bodyEl,'OCR em andamento — página '+p.page+' de '+p.total+(p.progress?(' ('+Math.round(p.progress*100)+'%)'):'')+'…');
        else if(p.phase==='ocr-done')setLoading(bodyEl,'OCR concluído ('+p.chars+' caracteres extraídos). Gerando resumo…');
      });
      if(!result.summary){setError(bodyEl,'Meggy não conseguiu gerar o resumo.');return;}
      renderSummaryCard(bodyEl,lesson,result.summary,false);
      // badge com tudo que foi gerado
      const qCount=result.questions?result.questions.length:0;
      const badge=document.createElement('div');
      badge.style.cssText='background:rgba(63,185,80,.1);border:1px solid rgba(63,185,80,.3);border-radius:10px;padding:8px 14px;margin-bottom:12px;display:flex;align-items:center;gap:8px;font-size:12px;color:#3fb950;flex-wrap:wrap;';
      let badgeHtml='<i class="bi bi-check-circle-fill"></i> <b>Gerado em cadeia:</b> ';
      const parts=[];
      if(result.summary)parts.push('✓ Resumo');
      if(result.mindmap)parts.push('✓ Pílulas');
      if(qCount>0)parts.push('✓ '+qCount+' questões');
      badgeHtml+=parts.join(' · ')+' + flashcards';
      badge.innerHTML=badgeHtml;
      bodyEl.querySelector('.gdi-mat-isa-result')?.insertBefore(badge,bodyEl.querySelector('.gdi-mat-isa-result').firstChild);
      showToast('Resumo + pílulas + '+qCount+' questões gerados!');
    }catch(e){setError(bodyEl,e.message);return;}
  }

  // ── Track answered questions (evita repetir) ──
  const ANSWERED_KEY='gdi-answered-questions-v1';
  function getAnsweredIds(){try{return JSON.parse(localStorage.getItem(ANSWERED_KEY)||'[]')}catch(_){return []}}
  function markAnswered(id){const arr=getAnsweredIds();if(!arr.includes(id)){arr.push(id);if(arr.length>500)arr.shift();try{localStorage.setItem(ANSWERED_KEY,JSON.stringify(arr))}catch(_){}}}

  // ── Questions flow: gera tudo em cadeia + abre quiz ──
  async function questions(items,bodyEl,lessonName){
    if(!items||!items.length){setError(bodyEl,'Nenhum PDF disponível.');return;}
    const lesson=realLessonName(lessonName||items[0].name);
    bodyEl.__items=items;bodyEl.__lesson=lesson;
    setLoading(bodyEl,'Meggy está lendo todos os materiais e criando resumo + pílulas + questões…');
    try{
      await generateAll(items,lesson,'questions',(p)=>{
        if(p.phase==='extract')setLoading(bodyEl,'Extraindo texto: '+p.pdf+'…');
        else if(p.phase==='ocr-init')setLoading(bodyEl,'PDF escaneado detectado — iniciando OCR (pode levar alguns minutos)…');
        else if(p.phase==='ocr-page')setLoading(bodyEl,'OCR em andamento — página '+p.page+' de '+p.total+(p.progress?(' ('+Math.round(p.progress*100)+'%)'):'')+'…');
        else if(p.phase==='ocr-done')setLoading(bodyEl,'OCR concluído ('+p.chars+' caracteres). Gerando questões…');
      });
    }catch(e){setError(bodyEl,e.message);return;}
    // carrega questões do cache se existirem (★ PATCH B: batch insert)
    const cached=await cacheGet();
    if(cached&&cached.questions&&Array.isArray(cached.questions)&&cached.questions.length){
      const _batch=[];
      cached.questions.forEach(q=>{
        if(q&&q.statement){
          let cleanQ;
          if(q.type==='tf'||(!q.options&&q.correct!==undefined)){
            cleanQ={subject:lesson,type:'tf',statement:String(q.statement),options:['Certo','Errado'],correct:Math.max(0,Math.min(1,Number(q.correct)||0)),explanation:String(q.explanation||''),source:'ISA-PDF'};
          }else if(Array.isArray(q.options)){
            cleanQ={subject:lesson,type:'mc',statement:String(q.statement),options:q.options.map(String),correct:Math.max(0,Math.min(3,Number(q.correct)||0)),explanation:String(q.explanation||''),source:'ISA-PDF'};
          }
          if(cleanQ)_batch.push(cleanQ);
        }
      });
      addQBatch(_batch);
    }
    startQuizFromBank(bodyEl,lesson);
  }

  // ── generateQuestions: gera mais questões de um PDF específico (para "Gerar mais 5") ──
  if(!window.__gdiPdfCursor)window.__gdiPdfCursor=0;
  async function generateQuestions(items,bodyEl,lesson){
    if(!items||!items.length)return false;
    const pdfIdx=window.__gdiPdfCursor%items.length;
    window.__gdiPdfCursor++;
    const pdfItem=items[pdfIdx];
    setLoading(bodyEl,'Extraindo texto do PDF: '+esc(pdfItem.name||'material')+'…');
    let text;
    try{
      text=await extractPdfText(pdfItem.url);
    }catch(e){
      for(let i=1;i<items.length;i++){
        const next=items[(pdfIdx+i)%items.length];
        try{
          text=await extractPdfText(next.url);
          if(text&&text.trim().length>=50)break;
        }catch(_){}
      }
      if(!text||text.trim().length<50){setError(bodyEl,'Falha ao extrair texto.');return false;}
    }
    if(!text||text.trim().length<50){setError(bodyEl,'PDF sem texto extraível.');return false;}
    setLoading(bodyEl,'Meggy está criando questões…');
    let resp;
    try{
      resp=await callIsa('Baseado neste material, gere 5 questões de concurso público em JSON array. Misture:\n- 3 múltipla escolha: {"type":"mc","statement":"...","options":["a","b","c","d"],"correct":0,"explanation":"..."}\n- 2 certo/errado (CEBRASPE): {"type":"tf","statement":"...","correct":1,"explanation":"..."}\nSem comentários, só JSON:\n\n'+text.slice(0,15000));
    }catch(e){setError(bodyEl,'Meggy indisponível: '+e.message);return false;}
    let arr;
    try{arr=parseJsonArray(resp);}catch(e){setError(bodyEl,'Meggy retornou formato inválido: '+e.message);return false;}
    // ★ PATCH B: batch insert (1 read + 1 write)
    const _batchGen=[];
    const cleanArr=[];
    arr.forEach(q=>{
      if(!q||!q.statement)return;
      let cleanQ;
      if(q.type==='tf'||(!q.options&&q.correct!==undefined)){
        cleanQ={subject:lesson,type:'tf',statement:String(q.statement),options:['Certo','Errado'],correct:Math.max(0,Math.min(1,Number(q.correct)||0)),explanation:String(q.explanation||''),source:'ISA-PDF'};
      }else if(Array.isArray(q.options)){
        cleanQ={subject:lesson,type:'mc',statement:String(q.statement),options:q.options.map(String),correct:Math.max(0,Math.min(3,Number(q.correct)||0)),explanation:String(q.explanation||''),source:'ISA-PDF'};
      }
      if(cleanQ){
        _batchGen.push(cleanQ);
        cleanArr.push({type:cleanQ.type,statement:cleanQ.statement,options:cleanQ.options,correct:cleanQ.correct,explanation:cleanQ.explanation});
      }
    });
    addQBatch(_batchGen);
    if(cleanArr.length){
      const existing=await cacheGet();
      const merged=[...((existing&&existing.questions)||[]),...cleanArr];
      cacheSave(existing?.summary||null,merged,lesson);
    }
    showToast(cleanArr.length+' questões geradas!');
    return cleanArr.length>0;
  }

  // ── Inicia quiz com questões do banco (não respondidas) ──
  function startQuizFromBank(bodyEl,lesson){
    const all=lsGet(LQ,[]);
    const answered=getAnsweredIds();
    // questões desta matéria que ainda não foram respondidas
    let pending=all.filter(q=>q.subject===lesson&&!answered.includes(q.id));
    // se não tem nenhuma não-respondida, pega todas desta matéria (reinicia ciclo)
    if(pending.length===0){
      pending=all.filter(q=>q.subject===lesson);
      // limpa answered para esta matéria (reinicia)
      const newAnswered=answered.filter(id=>!all.some(q=>q.id===id&&q.subject===lesson));
      try{localStorage.setItem(ANSWERED_KEY,JSON.stringify(newAnswered))}catch(_){}
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
    const batch=pending.slice(0,5);
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
          <span style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;">${esc(lesson)} · ${idx+1}/${queue.length}</span>
          <span style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;">✓ ${hits} ✗ ${misses}</span>
        </div>
        <div class="gdi-course" style="margin-bottom:14px;">
          <b style="color:var(--ferreto-secondary,#5ddeda);font-size:11px;display:block;margin-bottom:8px;">${isTF?'CEBRASPE — Certo ou Errado':'Múltipla Escolha'}</b>
          <div style="color:var(--ferreto-text,#f0f6fc);font-size:14px;line-height:1.7;">${esc(q.statement)}</div>
        </div>
        <div id="gdi-q-opts" style="display:flex;flex-direction:column;gap:8px;"></div>
        <div id="gdi-q-feedback" style="margin-top:14px;"></div>
        <div style="display:flex;justify-content:flex-end;padding-top:14px;margin-top:10px;border-top:1px solid var(--ferreto-border,#21262d);">
          <button id="gdi-q-skip" title="Pular para próxima questão" style="width:48px;height:48px;border-radius:50%;border:0;cursor:pointer;background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;font-size:20px;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px -4px rgba(255,139,159,.5);transition:transform .15s;"><i class="bi bi-arrow-right"></i></button>
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

  // ── Pílulas flow (antes "Mapa Mental") — gera em cadeia ──
  async function mindmap(items,bodyEl,lessonName){
    if(!items||!items.length){setError(bodyEl,'Nenhum PDF disponível.');return;}
    const lesson=realLessonName(lessonName||items[0].name);
    bodyEl.__items=items;bodyEl.__lesson=lesson;
    setLoading(bodyEl,'Meggy está lendo o material e criando pílulas + resumo + questões…');
    try{
      const result=await generateAll(items,lesson,'mindmap',(p)=>{
        if(p.phase==='extract')setLoading(bodyEl,'Extraindo texto: '+p.pdf+'…');
        else if(p.phase==='ocr-init')setLoading(bodyEl,'PDF escaneado detectado — iniciando OCR (pode levar alguns minutos)…');
        else if(p.phase==='ocr-page')setLoading(bodyEl,'OCR em andamento — página '+p.page+' de '+p.total+(p.progress?(' ('+Math.round(p.progress*100)+'%)'):'')+'…');
        else if(p.phase==='ocr-done')setLoading(bodyEl,'OCR concluído ('+p.chars+' caracteres). Gerando pílulas…');
      });
      if(!result.mindmap){setError(bodyEl,'Meggy não conseguiu gerar as pílulas.');return;}
      bodyEl.innerHTML=`<div class="gdi-mat-isa-result" style="max-width:760px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:14px;padding:12px 16px;background:linear-gradient(135deg,rgba(255,139,159,.12),rgba(93,222,218,.06));border:1px solid var(--ferreto-border,#21262d);border-radius:14px;flex-wrap:wrap;flex-shrink:0;">
          <div style="display:flex;align-items:center;gap:8px;min-width:0;">
            <i class="bi bi-capsule" style="color:var(--ferreto-primary,#ff8b9f);font-size:20px;flex:none;"></i>
            <b style="color:var(--ferreto-text,#f0f6fc);font-family:var(--ferreto-font-display,'Poppins',sans-serif);font-size:15px;">Pílulas · ${esc(lesson)}</b>
          </div>
          <button id="gdi-mm-dl" title="Baixar em PDF" style="background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);color:var(--ferreto-text,#e6edf3);border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;"><i class="bi bi-file-earmark-pdf"></i> PDF</button>
        </div>
        <div class="gdi-isa-summary-body gdi-mental-map" style="background:var(--ferreto-surface-2,rgba(255,255,255,.03));border:1px solid var(--ferreto-border,#21262d);border-radius:14px;padding:20px 24px;color:var(--ferreto-text,#e6edf3);font-size:14px;line-height:1.8;">
          ${renderMd(result.mindmap)}
        </div>
      </div>`;
      bodyEl.querySelector('#gdi-mm-dl').onclick=()=>downloadAsPdf('Pílulas · '+lesson,result.mindmap);
      // badge com tudo que foi gerado em cadeia
      const qCount=result.questions?result.questions.length:0;
      if(result.summary||qCount>0){
        const badge=document.createElement('div');
        badge.style.cssText='background:rgba(63,185,80,.1);border:1px solid rgba(63,185,80,.3);border-radius:10px;padding:8px 14px;margin-bottom:12px;font-size:12px;color:#3fb950;';
        const parts=[];
        if(result.summary)parts.push('✓ Resumo');
        if(qCount>0)parts.push('✓ '+qCount+' questões');
        badge.innerHTML='<i class="bi bi-check-circle-fill"></i> <b>Gerado em cadeia:</b> '+parts.join(' · ');
        bodyEl.querySelector('.gdi-mat-isa-result')?.insertBefore(badge,bodyEl.querySelector('.gdi-mat-isa-result').firstChild);
      }
      showToast('Pílulas geradas!');
    }catch(e){setError(bodyEl,e.message);return;}
  }

  // ── Flashcards flow (aba no M9 — BIBLIOTECA organizada por disciplina → tema) ──
  // ★ REFACTORED (PATCH E): virtualização por accordion. Todos os temas
  // começam colapsados. Clicar no header do tema → renderiza só os cards
  // daquele tema (com paginação 50/page se >50). Clicar de novo → colapsa
  // e limpa innerHTML (libera memória). Disciplinas também são colapsáveis.
  async function flashcards(items, bodyEl, lessonName){
    const lesson = realLessonName(lessonName || (items[0] && items[0].name) || 'Aula');
    const urlPath = lessonKey();
    const allCards = lsGet('gdi-cards-v1', []);

    // ── Agrupa por disciplina → tema ──
    const grouped = {};
    allCards.forEach(c=>{
      const {discipline, theme} = extractDisciplineTheme(c);
      if(!grouped[discipline]) grouped[discipline] = {};
      if(!grouped[discipline][theme]) grouped[discipline][theme] = [];
      grouped[discipline][theme].push(c);
    });
    const disciplines = Object.keys(grouped).sort((a,b)=>a.localeCompare(b,'pt-BR'));
    const totalDue = allCards.filter(c=>(c.due||0)<=Date.now()).length;

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
          setLoading(bodyEl, 'Meggy está lendo os PDFs e criando flashcards automaticamente…');
          try{
            // Chama generateAll indiretamente via summary — os flashcards
            // são criados como side-effect (autoCreateFlashcards).
            await window.gdiIsaPdf.summary(items, bodyEl, lessonName);
            // Após gerar, volta para a biblioteca de flashcards
            setTimeout(()=>flashcards(items, bodyEl, lessonName), 300);
          }catch(e){
            setError(bodyEl, e.message);
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
        const f = bodyEl.querySelector('#gdi-fc-manual-f').value.trim();
        const b = bodyEl.querySelector('#gdi-fc-manual-b').value.trim();
        if(!f || !b){ showToast('Preencha frente e verso'); return; }
        const cards = lsGet('gdi-cards-v1', []);
        cards.push({id:uid(), f, b, due:Date.now()+86400000, box:0, src:'manual:'+lesson, path:urlPath, lesson:lesson, createdAt:Date.now()});
        lsSet('gdi-cards-v1', cards);
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
          <b class="gdi-fc-disc-name">${esc(disc)}</b>
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
            <b class="gdi-fc-theme-name">${esc(theme)}</b>
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
      const f=fEl.value.trim();
      const b=bEl.value.trim();
      if(!f||!b){ showToast('Preencha frente e verso'); return; }
      const subject=subjEl?subjEl.value.trim():'';
      const theme=themeEl?themeEl.value.trim():'';
      const cards = lsGet('gdi-cards-v1', []);
      const cardData={
        id:uid(), f, b,
        due:Date.now()+86400000,
        box:0,
        src:'manual:'+lesson,
        path:urlPath,
        lesson:lesson,
        createdAt:Date.now()
      };
      if(subject)cardData.subject=subject;
      if(theme)cardData.theme=theme;
      cards.push(cardData);
      lsSet('gdi-cards-v1', cards);
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
            <div class="gdi-fc-card" data-card-id="${esc(c.id)}">
              <div class="gdi-fc-card-inner">
                <div class="gdi-fc-card-face gdi-fc-card-front">
                  <div class="gdi-fc-card-label"><i class="bi bi-question-circle"></i> PERGUNTA</div>
                  <div class="gdi-fc-card-text">${esc(String(c.f).slice(0,300))}</div>
                  <div class="gdi-fc-card-hint"><i class="bi bi-arrow-repeat"></i> clique para virar</div>
                </div>
                <div class="gdi-fc-card-face gdi-fc-card-back">
                  <div class="gdi-fc-card-label"><i class="bi bi-check-circle"></i> RESPOSTA</div>
                  <div class="gdi-fc-card-text">${esc(String(c.b).slice(0,400))}</div>
                  <div class="gdi-fc-card-hint"><i class="bi bi-arrow-repeat"></i> clique para voltar</div>
                </div>
              </div>
              <button class="gdi-fc-card-del" data-card-id="${esc(c.id)}" title="Excluir">
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
          const cards2 = lsGet('gdi-cards-v1', []);
          lsSet('gdi-cards-v1', cards2.filter(x=>x.id !== id));
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
          <p style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;margin-top:4px;">${esc(lesson)}</p>
          <button id="gdi-fc-back-list" class="gdi-btn gdi-btn-primary" style="margin-top:14px;"><i class="bi bi-arrow-left"></i> Voltar aos flashcards</button>
        </div>`;
        const back=bodyEl.querySelector('#gdi-fc-back-list');
        if(back)back.onclick=()=>flashcards(items,bodyEl,lessonName);
        return;
      }
      const c=queue[idx];
      bodyEl.innerHTML=`<div class="gdi-fc-session">
        <div class="gdi-fc-session-head">
          <span>${esc(lesson)} · ${idx+1}/${queue.length}</span>
          <span>✓ ${hits} ✗ ${misses}</span>
        </div>
        <div class="gdi-fc-session-stage">
          <div class="gdi-fc-card gdi-fc-card-large" id="gdi-fc-card">
            <div class="gdi-fc-card-inner">
              <div class="gdi-fc-card-face gdi-fc-card-front">
                <div class="gdi-fc-card-label"><i class="bi bi-question-circle"></i> PERGUNTA</div>
                <div class="gdi-fc-card-text">${esc(c.f)}</div>
                <div class="gdi-fc-card-hint"><i class="bi bi-arrow-repeat"></i> clique para virar</div>
              </div>
              <div class="gdi-fc-card-face gdi-fc-card-back">
                <div class="gdi-fc-card-label"><i class="bi bi-check-circle"></i> RESPOSTA</div>
                <div class="gdi-fc-card-text">${esc(c.b)}</div>
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
        <div class="gdi-fc-session-foot">
          <button id="gdi-fc-skip" title="Pular" class="gdi-fc-skip-btn"><i class="bi bi-arrow-right"></i></button>
        </div>
      </div>`;
      // vira o card ao clicar
      const card=bodyEl.querySelector('#gdi-fc-card');
      const grade=bodyEl.querySelector('#gdi-fc-grade');
      let flipped=false;
      card.onclick=()=>{
        if(flipped)return;flipped=true;
        card.classList.add('gdi-fc-flipped');
        grade.style.display='block';
        // foca no botão "Good" para Enter funcionar
        const goodBtn=bodyEl.querySelector('#gdi-fc-good');
        if(goodBtn)setTimeout(()=>goodBtn.focus(),100);
      };
      // ★ SRS unificado via gdiGradeCard (SM-2 simplificado)
      const gradeCard=(quality)=>{
        const cards=lsGet('gdi-cards-v1',[]);
        const ci=cards.findIndex(x=>x.id===c.id);
        if(ci>=0){
          const result=window.gdiGradeCard(cards[ci],quality);
          cards[ci].box=result.box;
          cards[ci].due=result.due;
          cards[ci].lastReview=result.lastReview;
          lsSet('gdi-cards-v1',cards);
        }
        if(quality===1)misses++;      // Again
        else if(quality===3)hits++;   // Good
        else if(quality===4)hits++;   // Easy
        // ★ contador de cards estudados (para conquistas)
        try{
          const n=parseInt(localStorage.getItem('gdi-cards-studied-count')||'0')+1;
          localStorage.setItem('gdi-cards-studied-count',String(n));
          // dispara checagem de conquistas
          if(window.gdiAchievements){
            window.gdiAchievements.checkAll({cardsStudied:n,cardsCreated:cards.length});
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
        if(!grade.style.display||grade.style.display==='none'){
          if(e.code==='Space'){e.preventDefault();card.click();}
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
    draw();
    // cleanup final quando sessão terminar (idx>=queue.length)
    const _origDraw=draw;
    draw=function(){
      _origDraw();
      if(idx>=queue.length&&bodyEl.__fcKeyCleanup){
        bodyEl.__fcKeyCleanup();
        bodyEl.__fcKeyCleanup=null;
      }
    };
  }

  // ── Regenerate: força regeração de tudo (limpa cache em memória + Drive) ──
  async function regenerate(items,bodyEl,lessonName){
    if(!items||!items.length){setError(bodyEl,'Nenhum PDF disponível.');return;}
    const lesson=realLessonName(lessonName||items[0].name);
    // limpa cache em memória
    _chainCache={};
    // limpa cache do Drive (★FIX: também limpa mindmap, antes ficava preso)
    try{
      await fetch('/api/ai/cache',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({key:lessonKey(),summary:null,questions:null,mindmap:null,lessonName:lesson})});
    }catch(_){}
    // regenera tudo em cadeia
    await summary(items,bodyEl,lessonName);
  }

  // ── Buscar questões compartilhadas por outros alunos da mesma matéria ──
  // ★ usado pelo Simulado (gdi-study.js) para enriquecer o banco
  async function fetchSharedQuestions(subjectFilter){
    try{
      const url='/api/ai/shared-flashcards'+(subjectFilter?'?subject='+encodeURIComponent(subjectFilter):'')+'&kind=question';
      const r=await fetch(url,{cache:'no-store'});
      const d=await r.json();
      if(d&&d.ok&&Array.isArray(d.items)){
        // converte cards compartilhados em questões
        return d.items.filter(it=>it.statement).map(it=>({
          id:it.id||('shared-'+Math.random().toString(36).slice(2,7)),
          subject:subjectFilter||it.subject||'Compartilhada',
          type:it.type||'mc',
          statement:it.statement,
          options:it.options||['a','b','c','d'],
          correct:it.correct||0,
          explanation:it.explanation||'',
          legalText:it.legalText||'',
          fundamentacao:it.fundamentacao||'',
          source:'shared'
        }));
      }
      return [];
    }catch(_){return [];}
  }

  // ── Salvar MD da redação corrigida no Drive do aluno ──
  // ★ chamado pela aba Redação (gdi-study.js) após correção
  async function saveEssayMD(markdown,banca,tipo,score){
    try{
      const r=await fetch('/api/ai/essay/save',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          markdown:String(markdown||''),
          banca:banca||'',
          tipo:tipo||'',
          score:String(score||''),
          date:new Date().toISOString()
        })});
      const d=await r.json();
      return !!(d&&d.ok);
    }catch(_){return false;}
  }

  // ── Batalhão: dispara processamento em background via worker ──
  // ★ chamado quando aluno adiciona um curso na Central de Estudos
  async function startBattalion(courseKey, coursePath, lessonName, pdfList){
    try{
      const body={courseKey, coursePath, lessonName, pdfs:pdfList.map(p=>({name:p.name||'',url:p.url||'',text:p.text||''}))};
      const r=await fetch('/api/ai/battalion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const d=await r.json();
      return !!(d&&d.ok);
    }catch(_){return false;}
  }
  // ── Verifica se o batalhão já processou um curso ──
  async function getBattalionStatus(courseKey){
    try{
      const r=await fetch('/api/ai/battalion/status?courseKey='+encodeURIComponent(courseKey),{cache:'no-store'});
      const d=await r.json();
      return d;
    }catch(_){return {ok:false,processed:false};}
  }

  // ── Salvar resumo no pool compartilhado (todos os usuários) ──
  async function saveSharedSummary(lessonName,summary,questions){
    try{
      await fetch('/api/ai/shared-summaries',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({lessonName,summary,questions:questions||null})});
    }catch(_){/* não bloqueia */}
  }
  // ── Buscar resumos compartilhados de outros usuários ──
  async function fetchSharedSummaries(lessonFilter){
    try{
      const url='/api/ai/shared-summaries'+(lessonFilter?'?lesson='+encodeURIComponent(lessonFilter):'');
      const r=await fetch(url,{cache:'no-store'});
      const d=await r.json();
      return (d&&d.ok&&Array.isArray(d.summaries))?d.summaries:[];
    }catch(_){return [];}
  }

  // ── Public API ── (E — todos os 16 métodos preservados)
  // ★ FIX 6 (Task 21): added downloadAsPdf to exports. It was defined as a local
  // function but never exported, yet renderResumos references window.gdiIsaPdf.downloadAsPdf
  // (line 2137). The check `if (... && window.gdiIsaPdf.downloadAsPdf)` silently failed,
  // so the "PDF" button on saved resumos did nothing. Now exported.
  window.gdiIsaPdf={summary,questions,mindmap,flashcards,regenerate,extractPdfText,saveIsaSummary,listIsaSummaries,delIsaSummary,downloadAsPdf,fetchSharedQuestions,fetchSharedSummaries,saveSharedSummary,saveEssayMD,startBattalion,getBattalionStatus};

  // ═══ REATIVADO: aba "Resumos" na Central de Estudos (Task 13 — FIX 2) ═══
  // Antes era um stub no-op (window.renderResumos=function(){};). Agora é uma
  // implementação real que lista os resumos salvos em localStorage (via
  // gdiIsaPdf.listIsaSummaries()), agrupados por matéria, com botões
  // Ver / Baixar PDF / Deletar. Conecta o orphan function: o botão "Resumo"
  // no painel de materiais M9 chama saveIsaSummary() → a aba "Resumos"
  // lista o que foi salvo. Antes estavam desconectados.
  function _summaryModal(lesson, markdownText){
    // modal próprio (não depende de gdiModal que escapa o conteúdo)
    document.querySelectorAll('.gdi-resumo-modal').forEach(m=>m.remove());
    const overlay=document.createElement('div');
    overlay.className='gdi-resumo-modal';
    overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(4px);z-index:100002;display:flex;align-items:center;justify-content:center;padding:20px;animation:gdi-modal-fade .2s ease;';
    const html=renderMd(markdownText);
    overlay.innerHTML=`<div style="background:var(--ferreto-bg-2,#0d1119);border:1px solid var(--ferreto-border,#21262d);border-radius:14px;max-width:780px;width:100%;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.6);">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--ferreto-border,#21262d);gap:10px;">
        <b style="color:var(--ferreto-text,#f0f6fc);font-size:15px;font-family:var(--ferreto-font-display,'Poppins',sans-serif);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;">${esc(lesson)}</b>
        <button class="gdi-resumo-x" style="background:transparent;border:0;color:var(--ferreto-text-muted,#8b949e);cursor:pointer;font-size:18px;padding:4px 8px;border-radius:6px;flex:none;">✕</button>
      </div>
      <div class="gdi-resumo-content" style="padding:20px;overflow-y:auto;color:var(--ferreto-text,#e6edf3);font-size:14px;line-height:1.65;">${html}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;padding:10px 18px;border-top:1px solid var(--ferreto-border,#21262d);flex-wrap:wrap;">
        <button class="gdi-resumo-pdf gdi-mode-btn" style="font-size:13px;"><i class="bi bi-download"></i> Baixar PDF</button>
        <button class="gdi-resumo-close gdi-mode-btn" style="font-size:13px;">Fechar</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    if(!document.getElementById('gdi-resumo-modal-style')){
      const st=document.createElement('style');st.id='gdi-resumo-modal-style';
      st.textContent='.gdi-resumo-modal .gdi-resumo-content h1,.gdi-resumo-modal .gdi-resumo-content h2,.gdi-resumo-modal .gdi-resumo-content h3{color:var(--ferreto-text,#f0f6fc);margin-top:18px;}.gdi-resumo-modal .gdi-resumo-content h1{font-size:20px;}.gdi-resumo-modal .gdi-resumo-content h2{font-size:17px;border-left:3px solid #ff8b9f;padding-left:10px;}.gdi-resumo-modal .gdi-resumo-content h3{font-size:14px;}.gdi-resumo-modal .gdi-resumo-content code{background:rgba(255,255,255,.08);padding:2px 6px;border-radius:3px;font-family:Courier New,monospace;font-size:12px;}.gdi-resumo-modal .gdi-resumo-content pre{background:rgba(255,255,255,.06);padding:12px;border-radius:6px;overflow-x:auto;}.gdi-resumo-modal .gdi-resumo-content blockquote{border-left:3px solid #ff8b9f;margin:10px 0;padding:4px 14px;color:var(--ferreto-text-muted,#9aa4b8);font-style:italic;}.gdi-resumo-modal .gdi-resumo-content a{color:#5ddeda;}';
      document.head.appendChild(st);
    }
    const close=()=>overlay.remove();
    overlay.querySelector('.gdi-resumo-x').onclick=close;
    overlay.querySelector('.gdi-resumo-close').onclick=close;
    overlay.querySelector('.gdi-resumo-pdf').onclick=()=>downloadAsPdf(lesson,markdownText);
    overlay.onclick=(e)=>{if(e.target===overlay)close();};
    const escHandler=(e)=>{if(e.key==='Escape'){close();document.removeEventListener('keydown',escHandler);}};
    document.addEventListener('keydown',escHandler);
  }

  // ★ FIX 4 (Task 23): renderResumos agora é ASYNC e lê resumos de DUAS fontes:
  //   1) localStorage (listIsaSummaries) — rápido, offline-first
  //   2) Google Drive (.meggy.ai/resumos/) via GDIStorage.listMaterials
  // Antes só lia localStorage — então resumos gerados pelo batalhão em outro
  // dispositivo (ou após limpar localStorage) não apareciam. Agora mergeia os
  // dois, dedup por lesson+date, e mostra um badge "Drive" nos itens que só
  // existem no Drive. O conteúdo dos itens do Drive é lazy-loaded (fetch do
  // downloadUrl) apenas quando o aluno clica em "Ver" ou "PDF" — não baixa
  // todos os resumos de uma vez (seria pesado).
  window.renderResumos = async function(bodyEl){
    if(!bodyEl)return;
    // Loading state imediato (a chamada ao Drive pode levar 1-2s)
    bodyEl.innerHTML='<div class="gdi-empty-state" style="padding:40px 20px;"><div class="gdi-spinner" style="margin:0 auto 12px;width:32px;height:32px;border:3px solid var(--ferreto-surface-3,rgba(255,255,255,.08));border-top-color:var(--ferreto-primary,#ff8b9f);border-radius:50%;animation:gdi-scan-spin 1s linear infinite;"></div><p style="color:var(--ferreto-text-muted,#8b949e);font-size:13px;margin:0;">Carregando resumos…</p></div>';

    // 1) localStorage resumos (rápido, síncrono)
    const localSummaries = window.gdiIsaPdf ? window.gdiIsaPdf.listIsaSummaries() : [];

    // 2) Drive resumos (.meggy.ai/resumos/) — best-effort, não bloqueia
    let driveSummaries = [];
    try{
      if(window.GDIStorage && typeof window.GDIStorage.listMaterials==='function'){
        const items = await window.GDIStorage.listMaterials('resumos', '');
        if(Array.isArray(items)){
          driveSummaries = items
            .filter(it => it && it.id && it.name)
            .map(it => {
              // Nome do arquivo no Drive: <safeLesson>_<safePdf>_<timestamp>.md
              // safeLesson/safePdf substituíram [^a-zA-Z0-9_-] por _. Reconstrói
              // um nome legível trocando _ por espaço e removendo .md.
              let displayName = String(it.name||'').replace(/\.md$/i,'').replace(/\.json$/i,'');
              // Heurística: remove o sufixo de timestamp (digits no final)
              displayName = displayName.replace(/_\d{10,}$/, '').replace(/_/g, ' ').trim();
              if(displayName.length>200)displayName=displayName.slice(0,200);
              return {
                id: 'drive-'+it.id,
                lesson: displayName || 'Resumo do Drive',
                summary: '',  // lazy-loaded on click
                path: '',
                subject: 'Drive',
                date: it.modified ? new Date(it.modified).getTime() : (it.id?0:Date.now()),
                _drive: true,
                _downloadUrl: it.downloadUrl,
                _fileId: it.id
              };
            });
        }
      }
    }catch(_){ /* Drive indisponível — segue só com localStorage */ }

    // 3) Merge: localStorage primeiro (tem prioridade — conteúdo já carregado),
    //    depois Drive (dedup por lesson name case-insensitive)
    const seenLesson = new Set();
    const all = [];
    for(const r of localSummaries){
      if(!r)continue;
      const k = String(r.lesson||'').toLowerCase();
      if(!seenLesson.has(k)){
        seenLesson.add(k);
        all.push(r);
      }
    }
    for(const r of driveSummaries){
      if(!r)continue;
      const k = String(r.lesson||'').toLowerCase();
      if(!seenLesson.has(k)){
        seenLesson.add(k);
        all.push(r);
      }
    }

    // 4) Sort por data decrescente
    all.sort((a,b)=>(b.date||0)-(a.date||0));

    if(!all.length){
      bodyEl.innerHTML='<div class="gdi-empty-state"><span class="gdi-empty-state-icon">📋</span><h3>Nenhum resumo ainda</h3><p>Gere resumos assistindo às aulas e clicando no botão "Resumo" no painel de materiais.</p></div>';
      return;
    }

    // 5) Agrupa por matéria (subject)
    const bySubject = {};
    all.forEach(r=>{
      const s = r.subject || 'Geral';
      if(!bySubject[s])bySubject[s]=[];
      bySubject[s].push(r);
    });
    let html='<div class="gdi-resumos-list" style="display:flex;flex-direction:column;gap:18px;">';
    for(const subject in bySubject){
      html+=`<div class="gdi-resumos-group"><h3 style="color:var(--ferreto-text,#f0f6fc);font-family:var(--ferreto-font-display,'Poppins',sans-serif);font-size:14px;font-weight:600;margin:0 0 8px;display:flex;align-items:center;gap:6px;"><i class="bi bi-folder2-open" style="color:#5ddeda;"></i> ${esc(subject)}${subject==='Drive'?'<span style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;font-weight:400;">(salvos no Google Drive)</span>':''}</h3>`;
      html+='<div style="display:flex;flex-direction:column;gap:8px;">';
      bySubject[subject].forEach(r=>{
        const preview = String(r.summary||'').slice(0,150).replace(/[#*`]/g,'').replace(/\n/g,' ');
        const date = r.date ? new Date(r.date).toLocaleDateString('pt-BR') : '';
        const driveBadge = r._drive ? '<span style="color:#5ddeda;font-size:10px;margin-left:6px;flex:none;"><i class="bi bi-cloud-fill"></i> Drive</span>' : '';
        const previewHtml = r._drive
          ? '<i style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;font-style:italic;">Resumo salvo no Drive — clique em "Ver" para carregar o conteúdo.</i>'
          : esc(preview)+(r.summary && r.summary.length>150?'…':'');
        html+=`<div class="gdi-resumo-card" data-id="${esc(r.id)}" style="background:var(--ferreto-surface-2,rgba(255,255,255,.05));border:1px solid var(--ferreto-border,#21262d);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
            <span style="color:var(--ferreto-text,#f0f6fc);font-weight:600;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;">${esc(r.lesson||'Aula')}${driveBadge}</span>
            <span style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;flex:none;">${date}</span>
          </div>
          <div style="color:var(--ferreto-text-muted,#8b949e);font-size:12.5px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${previewHtml}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="gdi-btn gdi-btn-ghost gdi-resumo-view" data-id="${esc(r.id)}" style="font-size:12px;padding:5px 10px;"><i class="bi bi-eye"></i> Ver</button>
            <button class="gdi-btn gdi-btn-ghost gdi-resumo-pdf" data-id="${esc(r.id)}" style="font-size:12px;padding:5px 10px;"><i class="bi bi-download"></i> PDF</button>
            ${!r._drive?`<button class="gdi-btn gdi-btn-ghost gdi-resumo-del" data-id="${esc(r.id)}" style="font-size:12px;padding:5px 10px;color:#ff6b6b;" title="Deletar"><i class="bi bi-trash"></i></button>`:''}
          </div>
        </div>`;
      });
      html+='</div></div>';
    }
    html+='</div>';
    bodyEl.innerHTML=html;

    // 6) Helper: lazy-load conteúdo do Drive
    const loadDriveContent = async (r) => {
      if(!r || !r._drive)return r ? r.summary : '';
      if(r.summary)return r.summary;  // já carregado (cacheado nesta sessão)
      try{
        const resp = await fetch(r._downloadUrl);
        if(!resp.ok)throw new Error('HTTP '+resp.status);
        const text = await resp.text();
        r.summary = text;  // cacheia no objeto
        return text;
      }catch(e){
        throw new Error('Não foi possível carregar do Drive: '+e.message);
      }
    };

    // 7) Wiring dos botões
    bodyEl.querySelectorAll('.gdi-resumo-view').forEach(b=>b.onclick=async (ev)=>{
      const r=all.find(x=>x.id===b.dataset.id);
      if(!r)return;
      // Feedback visual no botão enquanto carrega do Drive
      const orig = b.innerHTML;
      if(r._drive){
        b.disabled=true;
        b.innerHTML='<i class="bi bi-hourglass-split"></i> Carregando…';
      }
      try{
        const content = r._drive ? await loadDriveContent(r) : r.summary;
        if(content){
          _summaryModal(r.lesson, content);
        }else{
          showToast('Resumo vazio');
        }
      }catch(e){
        showToast(e.message||'Erro ao carregar resumo');
      }finally{
        if(r._drive){b.disabled=false;b.innerHTML=orig;}
      }
    });
    bodyEl.querySelectorAll('.gdi-resumo-pdf').forEach(b=>b.onclick=async (ev)=>{
      const r=all.find(x=>x.id===b.dataset.id);
      if(!r)return;
      const orig = b.innerHTML;
      if(r._drive){
        b.disabled=true;
        b.innerHTML='<i class="bi bi-hourglass-split"></i> Carregando…';
      }
      try{
        const content = r._drive ? await loadDriveContent(r) : r.summary;
        if(content && window.gdiIsaPdf && window.gdiIsaPdf.downloadAsPdf){
          window.gdiIsaPdf.downloadAsPdf(r.lesson, content);
        }else if(!content){
          showToast('Resumo vazio');
        }else{
          showToast('downloadAsPdf indisponível');
        }
      }catch(e){
        showToast(e.message||'Erro ao carregar resumo');
      }finally{
        if(r._drive){b.disabled=false;b.innerHTML=orig;}
      }
    });
    bodyEl.querySelectorAll('.gdi-resumo-del').forEach(b=>b.onclick=async ()=>{
      // Só localStorage resumos têm botão deletar (Drive items não têm .gdi-resumo-del)
      if(!window.gdiModal){
        if(!confirm('Deletar este resumo?'))return;
      } else {
        const ok=await window.gdiModal({title:'Deletar resumo',message:'Tem certeza que deseja deletar este resumo? Esta ação não pode ser desfeita.',confirmText:'Deletar',cancelText:'Cancelar',danger:true});
        if(!ok)return;
      }
      if(window.gdiIsaPdf && window.gdiIsaPdf.delIsaSummary){
        window.gdiIsaPdf.delIsaSummary(b.dataset.id);
        window.renderResumos(bodyEl);
      }
    });
  };

  console.warn('[GDI Extras] M9-ISA ativo (Task 4-c/Task CLEANUP)');
})();

// M-AI: WIDGET DA MEGGY 🐩 — poodle tutora de estudos
// Botão flutuante + painel de chat. PRIORIDADE de backend:
//   1) IA do navegador (Chrome Prompt API / Gemini Nano via
//      ai.languageModel — ativada por extensões Chrome). 100% local,
//      sem servidor, sem custo, funciona offline após download.
//   2) POST /api/ai (worker.js → CF Workers AI ou OpenAI-compat).
// Conversa persistida em sessionStorage. UI no <html> (fora do
// body) para sobreviver a trocas de página. Estilo Ferreto.
// ═══════════════════════════════════════════════════════════════
(function(){
  if(window.__gdiAiWidget)return;window.__gdiAiWidget=true;

  const MEGGY_NAME='Meggy';
  const MEGGY_AVATAR='<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="bgGlow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#FFF5F7"/><stop offset="70%" stop-color="#FFE4EC"/><stop offset="100%" stop-color="#FFD8E4"/></radialGradient><linearGradient id="furShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#FFFFFF"/><stop offset="100%" stop-color="#EAEFEF"/></linearGradient><linearGradient id="earShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#FFFFFF"/><stop offset="100%" stop-color="#E2E8E8"/></linearGradient></defs><circle cx="50" cy="50" r="47" fill="url(#bgGlow)" stroke="#F8C3D1" stroke-width="1.5"/><g><path d="M 28 36 C 12 34, 10 50, 12 62 C 14 74, 22 80, 29 76 C 34 72, 33 60, 31 52 C 30 46, 32 40, 28 36 Z" fill="url(#earShade)" stroke="#D6DFDF" stroke-width="0.8" stroke-linejoin="round"/><path d="M 18 48 C 14 56, 18 68, 25 72" fill="none" stroke="#CBD5D5" stroke-width="0.8" stroke-linecap="round"/><path d="M 22 42 C 18 52, 22 62, 27 65" fill="none" stroke="#CBD5D5" stroke-width="0.7" stroke-linecap="round"/><path d="M 72 36 C 88 34, 90 50, 88 62 C 86 74, 78 80, 71 76 C 66 72, 67 60, 69 52 C 70 46, 68 40, 72 36 Z" fill="url(#earShade)" stroke="#D6DFDF" stroke-width="0.8" stroke-linejoin="round"/><path d="M 82 48 C 86 56, 82 68, 75 72" fill="none" stroke="#CBD5D5" stroke-width="0.8" stroke-linecap="round"/><path d="M 78 42 C 82 52, 78 62, 73 65" fill="none" stroke="#CBD5D5" stroke-width="0.7" stroke-linecap="round"/><path d="M 30 42 C 24 52, 26 66, 38 71 C 44 73, 56 73, 62 71 C 74 66, 76 52, 70 42 C 65 35, 35 35, 30 42 Z" fill="url(#furShade)"/><path d="M 32 36 C 26 28, 30 18, 38 17 C 42 14, 58 14, 62 17 C 70 18, 74 28, 68 36 C 62 40, 38 40, 32 36 Z" fill="#FFFFFF" stroke="#D6DFDF" stroke-width="0.8"/><path d="M 36 28 C 40 22, 48 22, 50 26" fill="none" stroke="#D0D9D9" stroke-width="0.8" stroke-linecap="round"/><path d="M 50 22 C 54 20, 60 22, 63 27" fill="none" stroke="#D0D9D9" stroke-width="0.8" stroke-linecap="round"/><g><path d="M 48 24 C 42 19, 39 23, 44 27 C 46 28, 48 26, 48 24 Z" fill="#FF7B95"/><path d="M 52 24 C 58 19, 61 23, 56 27 C 54 28, 52 26, 52 24 Z" fill="#FF7B95"/><ellipse cx="50" cy="24.8" rx="2" ry="1.8" fill="#E64A68"/></g><path d="M 39 52 C 38 64, 62 64, 61 52 C 61 46, 39 46, 39 52 Z" fill="#FFFFFF"/><g><ellipse cx="40" cy="46" rx="3.2" ry="3.5" fill="#2A1B1E"/><circle cx="38.8" cy="44.8" r="1.1" fill="#FFFFFF"/><circle cx="41" cy="47.2" r="0.5" fill="#FFFFFF" opacity="0.8"/><path d="M 36.8 44 C 37.5 41.5, 41 41.5, 42.5 43" fill="none" stroke="#2A1B1E" stroke-width="0.9" stroke-linecap="round"/></g><g><ellipse cx="60" cy="46" rx="3.2" ry="3.5" fill="#2A1B1E"/><circle cx="58.8" cy="44.8" r="1.1" fill="#FFFFFF"/><circle cx="61" cy="47.2" r="0.5" fill="#FFFFFF" opacity="0.8"/><path d="M 57.5 43 C 59 41.5, 62.5 41.5, 63.2 44" fill="none" stroke="#2A1B1E" stroke-width="0.9" stroke-linecap="round"/></g><ellipse cx="34" cy="53" rx="3.8" ry="2.2" fill="#FF94A8" opacity="0.35"/><ellipse cx="66" cy="53" rx="3.8" ry="2.2" fill="#FF94A8" opacity="0.35"/><path d="M 50 51.5 C 48.5 49.5, 45 50, 45.5 52.5 C 46 55, 49 57, 50 58.5 C 51 57, 54 55, 54.5 52.5 C 55 50, 51.5 49.5, 50 51.5 Z" fill="#5E3238"/><ellipse cx="48.5" cy="51.8" rx="0.9" ry="0.5" fill="#FFFFFF" opacity="0.6" transform="rotate(-20 48.5 51.8)"/><path d="M 50 58.5 L 50 60" stroke="#5E3238" stroke-width="1" stroke-linecap="round"/><path d="M 44.5 60.5 C 47 62.5, 49.5 61, 50 60 C 50.5 61, 53 62.5, 55.5 60.5" fill="none" stroke="#5E3238" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></g></svg>';
  const MEGGY_TAG='— a poodle tutora';
  const ISA_SYS='Você é a Meggy — uma poodle tutora de estudos brasileira, ' +
    'amigável, calorosa e didática (mascote do projeto, sempre acompanhada do emoji 🐩). ' +
    'Acompanha alunos em uma plataforma de videoaulas (Google Drive Index). Responda em ' +
    'português, de forma clara e objetiva. Ajude com dúvidas das aulas, resumos, ' +
    'explicações e organização dos estudos. Se não souber, diga. Seja motivadora e ' +
    'acolhedora. Use Markdown quando ajudar.';

  // CSS
  if(!document.getElementById('gdi-ai-style')){
    const s=document.createElement('style');s.id='gdi-ai-style';s.textContent=`
#gdi-ai-fab{position:fixed;bottom:20px;right:20px;z-index:10001;width:56px;height:56px;border-radius:50%;
  border:0;cursor:pointer;background:linear-gradient(135deg,#ff8b9f 0%,#c026d3 55%,#5ddeda 130%);
  color:#fff;font-size:24px;display:flex;align-items:center;justify-content:center;
  box-shadow:0 8px 28px -6px rgba(255,139,159,.5),0 0 0 1px rgba(255,255,255,.12);
  transition:transform .18s,box-shadow .18s;}
#gdi-ai-fab:hover{transform:scale(1.08) translateY(-2px);box-shadow:0 12px 36px -6px rgba(255,139,159,.6);}
#gdi-ai-fab .gdi-ai-fab-ico{width:40px;height:40px;line-height:1;display:flex;align-items:center;justify-content:center;}#gdi-ai-fab .gdi-ai-fab-ico svg{width:100%;height:100%;border-radius:50%;}
#gdi-ai-fab-badge{position:absolute;top:-2px;right:-2px;width:16px;height:16px;border-radius:50%;
  background:#5ddeda;border:2px solid var(--ferreto-bg,#070910);display:none;}
#gdi-ai-fab-badge.show{display:block;animation:gdi-ai-pulse 1.6s ease infinite;}
@keyframes gdi-ai-pulse{0%,100%{transform:scale(1);}50%{transform:scale(1.25);}}
#gdi-ai-panel{position:fixed;bottom:88px;right:20px;z-index:10001;width:380px;max-width:calc(100vw - 32px);
  height:540px;max-height:calc(100vh - 120px);display:none;flex-direction:column;
  background:var(--ferreto-surface,rgba(22,27,38,.92));
  -webkit-backdrop-filter:blur(22px);backdrop-filter:blur(22px);
  border:1px solid var(--ferreto-border-strong,rgba(255,255,255,.16));
  border-radius:18px;box-shadow:0 20px 60px -12px rgba(0,0,0,.6);
  overflow:hidden;transform-origin:bottom right;animation:gdi-ai-in .22s ease;font-family:var(--ferreto-font-body,'Rubik',sans-serif);}
@keyframes gdi-ai-in{from{opacity:0;transform:scale(.92) translateY(12px);}to{opacity:1;transform:none;}}
#gdi-ai-panel.open{display:flex;}
#gdi-ai-head{display:flex;align-items:center;gap:10px;padding:14px 16px;
  background:linear-gradient(135deg,rgba(255,139,159,.18),rgba(93,222,218,.1));
  border-bottom:1px solid var(--ferreto-border,rgba(255,255,255,.09));}
#gdi-ai-head .gdi-ai-avatar{width:38px;height:38px;border-radius:50%;flex:none;
  background:linear-gradient(135deg,#ff8b9f,#c026d3);display:flex;align-items:center;justify-content:center;
  color:#fff;line-height:1;overflow:hidden;
  box-shadow:0 0 0 2px rgba(255,255,255,.1) inset;}
#gdi-ai-head .gdi-ai-avatar svg{width:100%;height:100%;border-radius:50%;}
#gdi-ai-head .gdi-ai-info{flex:1;min-width:0;}
#gdi-ai-head .gdi-ai-name{font-family:var(--ferreto-font-display,'Poppins',sans-serif);font-size:15px;font-weight:700;color:var(--ferreto-text,#f3f5fa);line-height:1.1;}
#gdi-ai-head .gdi-ai-name .gdi-ai-tag{font-size:10px;font-weight:500;color:var(--ferreto-secondary,#5ddeda);margin-left:5px;letter-spacing:.02em;}
#gdi-ai-head .gdi-ai-status{font-size:11px;color:var(--ferreto-text-muted,#9aa4b8);display:flex;align-items:center;gap:5px;margin-top:2px;}
#gdi-ai-head .gdi-ai-dot{width:7px;height:7px;border-radius:50%;background:#3fb950;}
#gdi-ai-head .gdi-ai-dot.local{background:#5ddeda;}
#gdi-ai-close{background:none;border:0;color:var(--ferreto-text-muted,#9aa4b8);font-size:18px;cursor:pointer;padding:4px;border-radius:8px;}
#gdi-ai-close:hover{background:var(--ferreto-surface-3,rgba(255,255,255,.08));color:var(--ferreto-text,#f3f5fa);}
#gdi-ai-body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;}
#gdi-ai-body::-webkit-scrollbar{width:6px;}
#gdi-ai-body::-webkit-scrollbar-thumb{background:var(--ferreto-surface-3,rgba(255,255,255,.08));border-radius:20px;}
.gdi-ai-msg{display:flex;gap:8px;max-width:88%;animation:gdi-ai-in .2s ease;}
.gdi-ai-msg.user{align-self:flex-end;flex-direction:row-reverse;}
.gdi-ai-msg .gdi-ai-bubble{padding:10px 13px;border-radius:14px;font-size:13.5px;line-height:1.5;word-break:break-word;}
.gdi-ai-msg.assistant .gdi-ai-bubble{background:var(--ferreto-surface-3,rgba(255,255,255,.08));color:var(--ferreto-text,#f3f5fa);border-bottom-left-radius:4px;}
.gdi-ai-msg.user .gdi-ai-bubble{background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;border-bottom-right-radius:4px;}
.gdi-ai-msg .gdi-ai-bubble p{margin:0 0 6px;} .gdi-ai-msg .gdi-ai-bubble p:last-child{margin:0;}
.gdi-ai-msg .gdi-ai-bubble code{background:rgba(0,0,0,.25);padding:1px 5px;border-radius:4px;font-size:12px;}
.gdi-ai-msg .gdi-ai-bubble pre{background:rgba(0,0,0,.3);padding:8px;border-radius:8px;overflow-x:auto;margin:6px 0;}
.gdi-ai-typing{display:flex;gap:4px;padding:4px 0;}
.gdi-ai-typing span{width:7px;height:7px;border-radius:50%;background:var(--ferreto-text-muted,#9aa4b8);animation:gdi-ai-typ 1.2s ease infinite;}
.gdi-ai-typing span:nth-child(2){animation-delay:.2s;} .gdi-ai-typing span:nth-child(3){animation-delay:.4s;}
@keyframes gdi-ai-typ{0%,60%,100%{opacity:.3;transform:translateY(0);}30%{opacity:1;transform:translateY(-4px);}}
#gdi-ai-input-wrap{display:flex;gap:8px;padding:12px;border-top:1px solid var(--ferreto-border,rgba(255,255,255,.09));background:var(--ferreto-surface-2,rgba(255,255,255,.045));}
#gdi-ai-input{flex:1;background:var(--ferreto-surface-3,rgba(255,255,255,.08));border:1px solid var(--ferreto-border,rgba(255,255,255,.09));
  border-radius:999px;padding:10px 14px;color:var(--ferreto-text,#f3f5fa);font-size:13.5px;outline:none;font-family:inherit;transition:.15s;}
#gdi-ai-input:focus{border-color:var(--ferreto-primary,#ff8b9f);box-shadow:0 0 0 3px rgba(255,139,159,.25);}
#gdi-ai-input::placeholder{color:var(--ferreto-text-faint,#6b7488);}
#gdi-ai-send{width:38px;height:38px;border-radius:50%;border:0;cursor:pointer;flex:none;
  background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;font-size:16px;display:flex;align-items:center;justify-content:center;transition:.15s;}
#gdi-ai-send:hover{filter:brightness(1.1);transform:scale(1.05);}
#gdi-ai-send:disabled{opacity:.5;cursor:default;transform:none;}
.gdi-ai-err{font-size:12px;color:#ff8b8b;text-align:center;padding:8px;margin:0 4px;}
.gdi-ai-provider{font-size:10px;color:var(--ferreto-text-faint,#6b7488);text-align:center;padding:2px 0 6px;letter-spacing:.02em;}
.gdi-ai-provider b{color:var(--ferreto-secondary,#5ddeda);}
@media(max-width:480px){#gdi-ai-panel{right:8px;left:8px;width:auto;bottom:80px;height:calc(100vh - 160px);}}
`;document.documentElement.appendChild(s);
  }

  const STORE='gdi-ai-chat';
  let messages=[];
  try{messages=JSON.parse(sessionStorage.getItem(STORE))||[];}catch(_){}

  function save(){try{sessionStorage.setItem(STORE,JSON.stringify(messages.slice(-20)));}catch(_){}}

  function renderMd(txt){
    if(window.marked){
      try{
        const html=marked.parse(txt);
        // ★ FIX: nunca retorna HTML não sanitizado — fallback escapa
        if(window.gdiSanitize){try{return window.gdiSanitize(html);}catch(_){}}
        return esc(txt).replace(/\n/g,'<br>');
      }catch(_){}
    }
    return txt.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
  }
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

  // ── Detecção da IA do navegador ──
  // Chrome 127+ com "Prompt API for Gemini Nano" habilitado expõe
  // `ai.languageModel`. Extensões Chrome ativam/desativam isso.
  // Também tenta o alias antigo `window.ai`.
  let _browserAIState='unknown'; // 'unknown' | 'ready' | 'download' | 'no'
  let _browserSession=null;
  let _providerLabel='verificando…';

  async function detectBrowserAI(){
    try{
      const ai=(window.ai&&window.ai.languageModel)?window.ai.languageModel:(window.LanguageModel);
      if(ai&&typeof ai.capabilities==='function'){
        const caps=await ai.capabilities();
        if(caps&&caps.available==='readily'){_browserAIState='ready';return 'ready';}
        if(caps&&caps.available==='after-download'){_browserAIState='download';return 'download';}
        _browserAIState='no';return 'no';
      }
    }catch(_){}
    _browserAIState='no';return 'no';
  }

  async function getBrowserSession(){
    if(_browserSession)return _browserSession;
    try{
      const ai=(window.ai&&window.ai.languageModel)?window.ai.languageModel:(window.LanguageModel);
      if(!ai)return null;
      _browserSession=await ai.create({
        systemPrompt:ISA_SYS,
        temperature:0.7,
        topK:3
      });
      return _browserSession;
    }catch(e){console.warn('[Meggy] não pôde criar sessão do navegador:',e);_browserSession=null;return null;}
  }

  async function callBrowserAI(history){
    const sess=await getBrowserSession();
    if(!sess)return null;
    // Prompt API mantém o contexto internamente; enviamos só a última
    // mensagem do usuário (a sessão lembra as anteriores).
    const lastUser=[...history].reverse().find(m=>m.role==='user');
    if(!lastUser)return null;
    const out=await sess.prompt(lastUser.content);
    return out||null;
  }

  function updateStatus(){
    const dot=panel.querySelector('.gdi-ai-dot');
    const st=panel.querySelector('.gdi-ai-status');
    if(!dot||!st)return;
    if(_browserAIState==='ready'){dot.classList.add('local');st.innerHTML='<span class="gdi-ai-dot local"></span> Meggy · IA do navegador · 100% local';_providerLabel='IA do navegador <b>(Chrome/Gemini Nano — local)</b>';}
    else if(_browserAIState==='download'){dot.classList.remove('local');st.innerHTML='<span class="gdi-ai-dot"></span> Meggy · baixando modelo local…';_providerLabel='baixando modelo do navegador…';}
    else{dot.classList.remove('local');st.innerHTML='<span class="gdi-ai-dot"></span> Meggy · online';const sl=serverLabel();_providerLabel=sl.label;}
    const pv=panel.querySelector('.gdi-ai-provider');
    if(pv)pv.innerHTML='via '+_providerLabel;
  }

  // UI no <html> (fora do body) — sobrevive a trocas de página
  const root=GDI_ROOT();
  const fab=document.createElement('button');
  fab.id='gdi-ai-fab';fab.title='Meggy';
  fab.innerHTML='<span class="gdi-ai-fab-ico">'+MEGGY_AVATAR+'</span><span id="gdi-ai-fab-badge"></span>';
  root.appendChild(fab);

  const panel=document.createElement('div');
  panel.id='gdi-ai-panel';
  panel.innerHTML=`
    <div id="gdi-ai-head">
      <div class="gdi-ai-avatar">${MEGGY_AVATAR}</div>
      <div class="gdi-ai-info">
        <div class="gdi-ai-name">${MEGGY_NAME}<span class="gdi-ai-tag">${MEGGY_TAG}</span></div>
        <div class="gdi-ai-status"><span class="gdi-ai-dot"></span> verificando…</div>
      </div>
      <button id="gdi-ai-close" title="Fechar"><i class="bi bi-x-lg"></i></button>
    </div>
    <div id="gdi-ai-body"></div>
    <div class="gdi-ai-provider"></div>
    <div id="gdi-ai-input-wrap">
      <input id="gdi-ai-input" type="text" placeholder="Pergunte à Meggy 🐩 sobre a aula, peça um resumo..." autocomplete="off">
      <button id="gdi-ai-send" title="Enviar"><i class="bi bi-send-fill"></i></button>
    </div>`;
  root.appendChild(panel);

  const body=panel.querySelector('#gdi-ai-body');
  const input=panel.querySelector('#gdi-ai-input');
  const sendBtn=panel.querySelector('#gdi-ai-send');
  // ★ FIX: badge estava buscando dentro do panel, mas o badge está no fab
  const badge=fab.querySelector('#gdi-ai-fab-badge');

  function addMsg(role,text){
    const m={role,text};
    messages.push(m);save();
    const el=document.createElement('div');
    el.className='gdi-ai-msg '+(role==='user'?'user':'assistant');
    el.innerHTML='<div class="gdi-ai-bubble">'+(role==='user'?esc(text):renderMd(text))+'</div>';
    body.appendChild(el);body.scrollTop=body.scrollHeight;
    return el;
  }
  // ═══ PATCH C: renderHistory com cache de HTML parseado por mensagem ═══
  // Cacheia m._html + m._text; só re-parseia Markdown se o texto mudou.
  // Usa DocumentFragment para um único reflow.
  function renderHistory(){
    body.innerHTML='';
    if(!messages.length){
      addMsg('assistant','Oi! Sou a **Meggy** 🐩 — sua poodle tutora de estudos.\n\nPosso ajudar com:\n- Explicar um tema da aula\n- Fazer um resumo\n- Tirar dúvidas\n- Sugerir um plano de estudos\n\nO que você precisa hoje? 🐾');
      messages.pop();save(); // saudação não conta no histórico
      return;
    }
    const frag=document.createDocumentFragment();
    messages.forEach(m=>{
      const el=document.createElement('div');
      el.className='gdi-ai-msg '+(m.role==='user'?'user':'assistant');
      // ★ PATCH C: user nunca usa Markdown; assistant cacheia parse
      if(m.role==='user'){
        el.innerHTML='<div class="gdi-ai-bubble">'+esc(m.text)+'</div>';
      }else{
        // cacheia parse Markdown por conteúdo (invalida se texto mudar)
        if(!m._html || m._text!==m.text){
          m._html=renderMd(m.text||'');
          m._text=m.text;
        }
        el.innerHTML='<div class="gdi-ai-bubble">'+m._html+'</div>';
      }
      frag.appendChild(el);
    });
    body.appendChild(frag);
    body.scrollTop=body.scrollHeight;
  }

  let typingEl=null;
  function showTyping(){
    typingEl=document.createElement('div');typingEl.className='gdi-ai-msg assistant';
    typingEl.innerHTML='<div class="gdi-ai-bubble"><div class="gdi-ai-typing"><span></span><span></span><span></span></div></div>';
    body.appendChild(typingEl);body.scrollTop=body.scrollHeight;
  }
  function hideTyping(){if(typingEl){typingEl.remove();typingEl=null;}}

  // ── BANCO DE MEMÓRIA da Meggy ──
  // A Meggy mantém um perfil do aluno e aprende com as interações.
  // Persistido em localStorage + enviado como contexto nas conversas.
  const MEMORY_KEY='gdi-meggy-memory-v1';
  const _meggyLsGet=(k,d)=>{try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(_){return d}};
  const _meggyLsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}};
  function loadMemory(){
    return _meggyLsGet(MEMORY_KEY,{interactions:0,topics:[],weaknesses:[],preferences:{},lastLessons:[]});
  }
  function saveMemory(mem){_meggyLsSet(MEMORY_KEY,mem);}
  function updateMemory(topic,context){
    const mem=loadMemory();
    mem.interactions=(mem.interactions||0)+1;
    if(topic&&!mem.topics.includes(topic)){
      mem.topics.push(topic);
      if(mem.topics.length>50)mem.topics.shift();
    }
    if(topic){
      mem.lastLessons=mem.lastLessons.filter(l=>l!==topic);
      mem.lastLessons.unshift(topic);
      if(mem.lastLessons.length>10)mem.lastLessons.pop();
    }
    try{
      const qs=_meggyLsGet('gdi-questions-v1',[]);
      const srs=_meggyLsGet('gdi-q-srs-v1',{});
      const bySubject={};
      qs.forEach(q=>{
        const s=q.subject||'Geral';
        if(!bySubject[s])bySubject[s]={total:0,correct:0};
        bySubject[s].total++;
        if(srs[q.id]&&srs[q.id].box>0)bySubject[s].correct++;
      });
      mem.weaknesses=Object.entries(bySubject)
        .filter(([,v])=>v.total>=2&&(v.correct/v.total)<0.5)
        .map(([k,v])=>({subject:k,acc:Math.round(v.correct/v.total*100)}))
        .slice(0,5);
    }catch(_){}
    saveMemory(mem);
    return mem;
  }
  function buildMemoryContext(){
    const mem=loadMemory();
    let ctx='';
    if(mem.interactions>0)ctx+=`Aluno tem ${mem.interactions} interações com a Meggy. `;
    if(mem.lastLessons&&mem.lastLessons.length)ctx+=`Últimas aulas estudadas: ${mem.lastLessons.slice(0,5).join(', ')}. `;
    if(mem.weaknesses&&mem.weaknesses.length)ctx+=`Pontos fracos: ${mem.weaknesses.map(w=>w.subject+' ('+w.acc+'%)').join(', ')}. `;
    if(mem.topics&&mem.topics.length>3)ctx+=`Já estudou ${mem.topics.length} tópicos diferentes. `;
    return ctx;
  }

  let busy=false;
  async function send(){
    const txt=input.value.trim();if(!txt||busy)return;
    busy=true;sendBtn.disabled=true;input.value='';
    addMsg('user',txt);
    showTyping();

    // histórico para enviar (role/content) + contexto de memória
    const hist=messages.filter(m=>m.role!=='system').slice(-8).map(m=>({role:m.role,content:m.text}));
    // adiciona contexto de memória na primeira mensagem do histórico
    const memCtx=buildMemoryContext();
    if(memCtx&&hist.length>0){
      hist[0]={role:'assistant',content:'Contexto do aluno: '+memCtx};
    }

    let response=null,usedLocal=false;
    // 1) tenta IA do navegador
    if(_browserAIState==='ready'){
      try{
        response=await callBrowserAI(hist);
        if(response)usedLocal=true;
      }catch(e){console.warn('[Meggy] IA do navegador falhou, caindo p/ servidor:',e);response=null;}
    }
    // 2) fallback servidor /api/ai
    if(!response){
      try{
        const r=await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({message:txt,messages:hist})});
        const data=await r.json();
        hideTyping();
        if(data.ok&&data.response){response=data.response;}
        else{
          const errEl=document.createElement('div');errEl.className='gdi-ai-err';
          errEl.textContent=data.error||'Não consegui responder agora. Tente novamente.';
          body.appendChild(errEl);body.scrollTop=body.scrollHeight;
          setTimeout(()=>errEl.remove(),5000);
          busy=false;sendBtn.disabled=false;input.focus();
          return;
        }
      }catch(e){
        hideTyping();
        const errEl=document.createElement('div');errEl.className='gdi-ai-err';
        errEl.textContent='Erro de conexão. Verifique sua internet.';
        body.appendChild(errEl);body.scrollTop=body.scrollHeight;
        setTimeout(()=>errEl.remove(),5000);
        busy=false;sendBtn.disabled=false;input.focus();
        return;
      }
    }
    hideTyping();
    addMsg('assistant',response);
    // ★ atualiza banco de memória com a interação
    updateMemory(undefined,{question:txt,response:response});
    if(usedLocal)updateStatus(); // confirma que usou local
    busy=false;sendBtn.disabled=false;input.focus();
  }

  function toggle(){
    const open=panel.classList.toggle('open');
    try{sessionStorage.setItem('gdi-meggy-open',open?'1':'0');}catch(_){}
    if(open){badge.classList.remove('show');renderHistory();updateStatus();setTimeout(()=>input.focus(),100);}
  }
  fab.addEventListener('click',toggle);
  panel.querySelector('#gdi-ai-close').addEventListener('click',()=>{panel.classList.remove('open');try{sessionStorage.setItem('gdi-meggy-open','0');}catch(_){}});
  sendBtn.addEventListener('click',send);
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}});

  // ═══ PATCH A: page:change com debounce 1.5s + gate por painel aberto ═══
  // Antes: a cada navegação, re-parseava Markdown × 20 msgs + iterava TODAS
  // as questões em updateMemory. Agora: renderHistory só se painel aberto,
  // e updateMemory é debounced 1.5s + throttle 30s quando painel fechado.
  let _memDebounce=null;
  Bus.onGlobal('page:change',()=>{
    const isOpen=panel && panel.classList.contains('open');
    if(isOpen){
      renderHistory();
      updateStatus();
    }
    clearTimeout(_memDebounce);
    _memDebounce=setTimeout(()=>{
      // só recalcular memória se o painel estiver aberto OU a cada 30s
      if(!isOpen && Date.now()-(window._meggyLastMem||0)<30000) return;
      const lesson=document.querySelector('.gdi-file-header-name');
      if(lesson&&lesson.textContent){
        window._meggyLastMem=Date.now();
        updateMemory(lesson.textContent.trim());
      }
    },1500);
  });
  // restaura estado aberto ao carregar
  try{
    if(sessionStorage.getItem('gdi-meggy-open')==='1'){
      setTimeout(()=>{panel.classList.add('open');renderHistory();updateStatus();},500);
    }
  }catch(_){}

  // ── Ativação condicional ──
  // O botão 💖 só aparece se houver IA disponível: (1) IA do navegador
  // pronta, OU (2) /api/ai/status retornar enabled=true. Caso contrário
  // o widget fica oculto (display:none) mas TODO o código permanece
  // intacto — basta configurar ZHIPU_API_KEY no Cloudflare para ativar.
  function hideWidget(){fab.style.display='none';panel.style.display='none';}
  function showWidget(){fab.style.display='';panel.style.display='';}

  let _serverEnabled=null; // null=desconhecido, true/false
  let _serverProvider=null;
  function checkServerStatus(){
    return fetch('/api/ai/status',{cache:'no-store'}).then(r=>r.ok?r.json():{enabled:false}).then(d=>{ _serverEnabled=!!(d&&d.enabled); _serverProvider=(d&&d.provider)||null; return _serverEnabled; }).catch(()=>{ _serverEnabled=false; return false; });
  }
  function serverLabel(){
    if(_serverProvider==='nvidia-nim')return {name:'NVIDIA NIM',label:'NVIDIA NIM <b>(LLaMA · /api/ai)</b>'};
    if(_serverProvider==='zhipu-ai')return {name:'Meggy AI (BlackTie)',label:'Meggy AI <b>(BlackTie GLM · /api/ai)</b>'};
    if(_serverProvider==='cf-workers-ai')return {name:'CF Workers AI',label:'Cloudflare <b>(Workers AI · /api/ai)</b>'};
    if(_serverProvider==='openai')return {name:'OpenAI',label:'OpenAI <b>(/api/ai)</b>'};
    return {name:'Meggy AI (BlackTie)',label:'Meggy AI <b>(BlackTie GLM · /api/ai)</b>'};
  }

  // detecta a IA do navegador ao carregar (1×) + status do servidor
  Promise.all([
    detectBrowserAI(),
    checkServerStatus()
  ]).then(function(){
    updateStatus();
    const browserReady=(_browserAIState==='ready');
    const serverOk=!!_serverEnabled;
    
    if(browserReady||serverOk){
      showWidget();
    }else{
      // Nenhum backend disponível — esconde o botão mas mantém o código.
      // Ativa automaticamente quando o usuário configurar ZHIPU_API_KEY.
      hideWidget();
          }
  });

  // badge de novidade após 8s se nunca abriu (só se visível)
  if(!sessionStorage.getItem('gdi-ai-seen')){
    setTimeout(()=>{if(fab.style.display!=='none'&&!panel.classList.contains('open'))badge.classList.add('show');},8000);
  }
  fab.addEventListener('click',()=>{sessionStorage.setItem('gdi-ai-seen','1');},{once:true});

  console.warn('[GDI Extras] M-AI widget Meggy ativo (Task 4-c/Task CLEANUP)');
})();
