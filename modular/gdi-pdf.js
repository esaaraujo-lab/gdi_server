// ═══════════════════════════════════════════════════════════════
// gdi-pdf.js — M17: Visualizador de PDF (pdf.js) — REFACTORED v49
//
// ★ v49 (Task MD-PDF): file_pdf agora renderiza o LAYOUT DO PLAYER DE VÍDEO
//   (.gdi-study-grid com .gdi-study-left + #gdi-slot-right) em vez do viewer
//   antigo isolado. Isso faz o painel de Materiais (M9) aparecer à direita,
//   com todas as abas (PDFs, MDs, TXTs, HTMLs da aula + Meggy IA).
//   O usuário pode usar os botões de modo (Dividido / Foco na aula / Foco no
//   material) igual à uma aula de vídeo. O PDF aparece no lugar do vídeo.
//
// Mudanças anteriores (preservadas):
//  1. workerSrc setado UMA vez (não a cada PDF aberto).
//  2. PDFDocumentProxy anterior é destruído ao trocar de PDF (sem leak).
//  3. Prefetch da próxima página (próxima fica pronta no worker).
//  4. expose window.gdiPdfCleanup() para o router chamar em page:change.
// ═══════════════════════════════════════════════════════════════

(function(){
  const PDFJS_CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174';
  const PDFJS_LIB = PDFJS_CDN + '/build/pdf.min.js';
  const PDFJS_WORKER = PDFJS_CDN + '/build/pdf.worker.min.js';

  let _currentDoc = null;     // PDFDocumentProxy atual
  let _currentUrl = null;

  // Configura workerSrc UMA vez (idempotente)
  function ensurePdfjsConfigured(){
    if (window.pdfjsLib && !window.pdfjsLib._gdiWorkerSrcSet) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      window.pdfjsLib._gdiWorkerSrcSet = true;
    }
  }

  // Limpa o PDF atual (chamado pelo router em page:change ou ao trocar de PDF)
  window.gdiPdfCleanup = async function(){
    if (_currentDoc) {
      try { await _currentDoc.cleanup(); await _currentDoc.destroy(); } catch(_) {}
      _currentDoc = null;
      _currentUrl = null;
    }
  };

  function loadPdfjs(){
    return new Promise((resolve, reject)=>{
      if (window.pdfjsLib) return resolve(window.pdfjsLib);
      const s = document.createElement('script');
      s.src = PDFJS_LIB;
      s.onload = ()=>{ ensurePdfjsConfigured(); resolve(window.pdfjsLib); };
      s.onerror = ()=>reject(new Error('pdf.js failed to load'));
      document.head.appendChild(s);
    });
  }

  // ★ v49: file_pdf agora usa o layout .gdi-study (igual à aula de vídeo).
  // O PDF aparece no .gdi-study-left (no lugar do <video>), e o painel de
  // Materiais (M9) aparece no #gdi-slot-right (à direita). Os botões de modo
  // (split / foco vídeo / foco material) são injetados no #gdi-slot-modes
  // pelo módulo gdi-ui.js (M10) quando Bus.emit('slots:ready') dispara.
  window.file_pdf = function(i,e,t,n,a,c){
    const isMobile = Os.isMobile;
    const dlBtns = (window.UI && window.UI.disable_video_download) ? '' : renderDownloadButtons(n,e,{showMedia:true});
    const controlsStyle = isMobile ? 'flex-wrap:wrap;gap:8px;padding:8px;justify-content:center;' : '';

    // ★ Layout idêntico ao file_video (app.min.js ~line 561), mas sem <video>.
    // O PDF canvas vai dentro de .gdi-player-wrap (mesma classe do player de vídeo,
    // para herdar o dimensionamento e o modo foco funcionar igual).
    const f = `
<div class="gdi-study" id="gdi-study">
  <div class="gdi-study-bar">
    <div class="gdi-study-bc"><ol class="gdi-bc">${_viewerBreadcrumb()}</ol></div>
    <div class="gdi-study-modes" id="gdi-slot-modes"></div>
  </div>
  <div class="gdi-study-grid">
    <section class="gdi-study-left">
      <div class="gdi-study-head">
        <i class="bi bi-file-earmark-pdf-fill gdi-icon-pdf" style="font-size:22px;"></i>
        <div class="gdi-study-title">
          <div class="gdi-file-header-name">${escHtml(i)}</div>
          <div class="gdi-file-header-meta">${escHtml(t)}</div>
        </div>
      </div>
      <div class="gdi-player-wrap" style="width:100%;">
        <div class="gdi-viewer-card" style="margin:0;">
          <div class="gdi-pdf-controls" style="${controlsStyle}">
            <button id="pdf-prev" class="gdi-btn gdi-btn-ghost gdi-btn-icon"><i class="bi bi-chevron-left"></i></button>
            <span style="font-size:13px;color:var(--gdi-text-muted,#8b949e);">Pág <span id="pdf-page-num">1</span> / <span id="pdf-page-count">?</span></span>
            <button id="pdf-next" class="gdi-btn gdi-btn-ghost gdi-btn-icon"><i class="bi bi-chevron-right"></i></button>
            <input id="pdf-zoom" type="range" min="50" max="200" value="100" style="width:${isMobile?80:100}px;" title="Zoom">
            <span id="pdf-zoom-val">100%</span>
          </div>
          <div style="padding:16px;${isMobile?'overflow-y:auto;-webkit-overflow-scrolling:touch;':''}">
            <div id="pdf-spinner" class="gdi-spinner-wrap"><div class="gdi-spinner"></div></div>
            <canvas id="pdf-canvas" style="max-width:100%;display:block;margin:auto;background:#525659;border-radius:4px;"></canvas>
          </div>
        </div>
      </div>
      ${dlBtns?`<div class="gdi-viewer-footer">${dlBtns}</div>`:""}
      <div id="gdi-slot-left"></div>
    </section>
    <aside class="gdi-study-right" id="gdi-slot-right"></aside>
  </div>
</div>`;
    $("#content").html(f);

    // ★ Avisa os módulos (gdi-ui M10, gdi-core M9, etc.) que os slots estão prontos.
    // M10 injeta os botões de modo (split/fv/fm) no #gdi-slot-modes.
    // M9 injeta o painel de Materiais (PDFs/MDs/TXTs da aula + Meggy) no #gdi-slot-right.
    try{Bus.emit('slots:ready');}catch(_){}

    // Limpa o PDF anterior antes de abrir o novo
    window.gdiPdfCleanup().then(()=>renderPdf(n)).catch(()=>renderPdf(n));
  };

  function renderPdf(url){
    let d = null, o = 1, s = 1;
    const p = document.getElementById("pdf-canvas");
    if(!p)return; // defensive: se o canvas sumiu (navegação), aborta
    const g = p.getContext("2d");

    function prefetch(pageNum){
      if (d && pageNum > 0 && pageNum <= d.numPages) {
        d.getPage(pageNum).catch(()=>{}); // aquece o cache do worker
      }
    }

    function f(u){
      const containerW = p.parentElement.clientWidth - 32;
      let scale = s;
      return d.getPage(u).then(function(h){
        const testVp = h.getViewport({scale:1});
        const isMobile = Os.isMobile;
        if (isMobile && testVp.width > containerW) {
          scale = containerW / testVp.width * s;
        }
        const m = h.getViewport({scale});
        p.height = m.height; p.width = m.width;
        h.render({canvasContext:g, viewport:m}).promise.then(function(){
          $("#pdf-spinner").hide();
          prefetch(u + 1); // pré-carrega a próxima página
        }).catch(()=>{});
        const pn=document.getElementById("pdf-page-num");
        if(pn)pn.textContent = u;
      });
    }

    loadPdfjs().then(function(){
      ensurePdfjsConfigured();
      pdfjsLib.getDocument(url).promise.then(function(u){
        d = u;
        _currentDoc = u;
        _currentUrl = url;
        const pc=document.getElementById("pdf-page-count");
        if(pc)pc.textContent = u.numPages;
        f(o);
      }).catch(function(err){
        $("#pdf-spinner").html(`<div class="gdi-alert gdi-alert-error">Could not load PDF: ${err.message}</div>`);
      });

      const prev=document.getElementById("pdf-prev");
      if(prev)prev.addEventListener("click", function(){
        if (o > 1) { o--; $("#pdf-spinner").show(); f(o); }
      });
      const next=document.getElementById("pdf-next");
      if(next)next.addEventListener("click", function(){
        if (d && o < d.numPages) { o++; $("#pdf-spinner").show(); f(o); }
      });

      const zoomEl=document.getElementById("pdf-zoom");
      let _zoomTimer = null;
      if(zoomEl)zoomEl.addEventListener("input", function(){
        s = parseInt(this.value) / 100;
        const zv=document.getElementById("pdf-zoom-val");
        if(zv)zv.textContent = this.value + "%";
        if (_zoomTimer) clearTimeout(_zoomTimer);
        _zoomTimer = setTimeout(()=>{ f(o); _zoomTimer = null; }, 150);
      });
    }).catch(function(){
      $("#pdf-spinner").html('<div class="gdi-alert gdi-alert-error">Failed to load PDF viewer.</div>');
    });
  }

  // ═══ v49 (Task MD-PDF): file_markdown — abre .md/.txt/.html no layout de aula ═══
  // Mesmo layout .gdi-study do file_pdf (estudo-grid com #gdi-slot-right para o
  // painel de Materiais M9), mas o conteúdo da esquerda é o markdown renderizado
  // (em vez do canvas do PDF). O usuário ganha:
  //   • Formatação markdown legível (headings, listas, código, links) com .gdi-markdown CSS
  //   • Fundo escuro + texto claro (não mais fonte branca invisível)
  //   • Painel de Materiais à direita com todas as abas (outros PDFs/MDs + Meggy IA)
  //   • Botões de modo (Dividido / Foco no material)
  //   • Botão "Abrir original" para baixar o arquivo cru
  window.file_markdown = function(i,e,t,n,a,c){
    const dlBtns = (window.UI && window.UI.disable_video_download) ? '' : renderDownloadButtons(n,e,{showMedia:true});
    const ext=(i.split('.').pop()||'').toLowerCase();
    const isHtml=(ext==='html'||ext==='htm');
    const isMd=(ext==='md');
    const iconCls=isMd?'bi-markdown-fill':(isHtml?'bi-file-earmark-code':'bi-file-earmark-text-fill');
    const f = `
<div class="gdi-study" id="gdi-study">
  <div class="gdi-study-bar">
    <div class="gdi-study-bc"><ol class="gdi-bc">${_viewerBreadcrumb()}</ol></div>
    <div class="gdi-study-modes" id="gdi-slot-modes"></div>
  </div>
  <div class="gdi-study-grid">
    <section class="gdi-study-left">
      <div class="gdi-study-head">
        <i class="bi ${iconCls}" style="font-size:22px;color:var(--ferreto-secondary,#5ddeda);"></i>
        <div class="gdi-study-title">
          <div class="gdi-file-header-name">${escHtml(i)}</div>
          <div class="gdi-file-header-meta">${escHtml(t)}</div>
        </div>
      </div>
      <div class="gdi-player-wrap" style="width:100%;">
        <div class="gdi-viewer-card" style="margin:0;">
          <div id="md-spinner" class="gdi-spinner-wrap"><div class="gdi-spinner"></div></div>
          <div id="md-content" style="display:none;padding:24px 28px;min-height:400px;max-height:calc(100dvh - 220px);overflow-y:auto;background:var(--ferreto-surface-1,#0d1117);">
            <div class="gdi-markdown" id="md-rendered" style="max-width:780px;margin:0 auto;"></div>
          </div>
        </div>
      </div>
      ${dlBtns?`<div class="gdi-viewer-footer">${dlBtns}</div>`:""}
      <div id="gdi-slot-left"></div>
    </section>
    <aside class="gdi-study-right" id="gdi-slot-right"></aside>
  </div>
</div>`;
    $("#content").html(f);
    try{Bus.emit('slots:ready');}catch(_){}

    // Fetch + render the markdown/text/html content
    (async()=>{
      try{
        const resp=await fetch(n,{credentials:'same-origin'});
        if(!resp.ok)throw new Error('HTTP '+resp.status);
        const txt=await resp.text();
        let html='';
        if(isMd){
          if(window.marked){
            try{
              const parsed=marked.parse(txt);
              html=window.gdiSanitize?window.gdiSanitize(parsed):escHtml(txt).replace(/\n/g,'<br>');
            }catch(_){html=escHtml(txt).replace(/\n/g,'<br>');}
          }else{
            html=escHtml(txt).replace(/\n/g,'<br>');
          }
        }else if(isHtml){
          html=window.gdiSanitize?window.gdiSanitize(txt):escHtml(txt);
        }else{ // txt
          html='<pre style="white-space:pre-wrap;word-wrap:break-word;margin:0;font-family:inherit;">'+escHtml(txt)+'</pre>';
        }
        const rendered=document.getElementById('md-rendered');
        if(rendered)rendered.innerHTML=html;
        const sp=document.getElementById('md-spinner');
        if(sp)sp.style.display='none';
        const ct=document.getElementById('md-content');
        if(ct)ct.style.display='block';
      }catch(err){
        const sp=document.getElementById('md-spinner');
        if(sp)sp.innerHTML='<div class="gdi-alert gdi-alert-error">Não foi possível carregar: '+escHtml(err.message)+'</div>';
      }
    })();
  };
})();
