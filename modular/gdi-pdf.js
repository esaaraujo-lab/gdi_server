// ═══════════════════════════════════════════════════════════════
// gdi-pdf.js — M17: Visualizador de PDF (pdf.js) — REFACTORED
//
// Mudanças não-breaking (mesma assinatura window.file_pdf):
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

  window.file_pdf = function(i,e,t,n,a,c){
    // ★ Task 27: defensive — Os pode não estar definido se app.min.js não carregou ainda
    const isMobile = (typeof Os !== 'undefined' && Os.isMobile) || (window.Os && window.Os.isMobile) || false;
    const controlsStyle = isMobile ? 'flex-wrap:wrap;gap:8px;padding:8px;justify-content:center;' : '';
    const l = `<div class="gdi-wrap">
  <div class="gdi-viewer">
    <div class="gdi-breadcrumb-wrap"><ol class="gdi-bc">${_viewerBreadcrumb()}</ol></div>
    <div class="gdi-viewer-card">
      <div class="gdi-file-header">
        <span class="gdi-file-header-icon"><i class="bi bi-file-earmark-pdf-fill gdi-icon-pdf"></i></span>
        <div class="gdi-file-header-info">
          <div class="gdi-file-header-name">${escHtml(i)}</div>
          <div class="gdi-file-header-meta">${escHtml(t)}</div>
        </div>
      </div>
      <div class="gdi-viewer-body no-pad">
        <div class="gdi-pdf-controls" style="${controlsStyle}">
          <button id="pdf-prev" class="gdi-btn gdi-btn-ghost gdi-btn-icon"><i class="bi bi-chevron-left"></i></button>
          <span style="font-size:13px;color:var(--gdi-text-muted);">Pág <span id="pdf-page-num">1</span> / <span id="pdf-page-count">?</span></span>
          <button id="pdf-next" class="gdi-btn gdi-btn-ghost gdi-btn-icon"><i class="bi bi-chevron-right"></i></button>
          <input id="pdf-zoom" type="range" min="50" max="200" value="100" style="width:${isMobile?80:100}px;" title="Zoom">
          <span id="pdf-zoom-val">100%</span>
        </div>
        <div style="padding:16px;${isMobile?'overflow-y:auto;-webkit-overflow-scrolling:touch;':''}">
          <div id="pdf-spinner" class="gdi-spinner-wrap"><div class="gdi-spinner"></div></div>
          <canvas id="pdf-canvas" style="max-width:100%;display:block;margin:auto;background:#525659;border-radius:4px;"></canvas>
        </div>
      </div>
      <div class="gdi-viewer-footer">${renderDownloadButtons(n,e)}</div>
    </div>
  </div>
</div>`;
    $("#content").html(l);

    // Limpa o PDF anterior antes de abrir o novo
    window.gdiPdfCleanup().then(()=>renderPdf(n)).catch(()=>renderPdf(n));
  };

  function renderPdf(url){
    let d = null, o = 1, s = 1;
    const p = document.getElementById("pdf-canvas");
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
        if (isMobile && testVp.width > containerW) {
          scale = containerW / testVp.width * s;
        }
        const m = h.getViewport({scale});
        p.height = m.height; p.width = m.width;
        h.render({canvasContext:g, viewport:m}).promise.then(function(){
          $("#pdf-spinner").hide();
          prefetch(u + 1); // pré-carrega a próxima página
        }).catch(()=>{});
        document.getElementById("pdf-page-num").textContent = u;
      });
    }

    loadPdfjs().then(function(){
      ensurePdfjsConfigured();
      pdfjsLib.getDocument(url).promise.then(function(u){
        d = u;
        _currentDoc = u;
        _currentUrl = url;
        document.getElementById("pdf-page-count").textContent = u.numPages;
        f(o);
      }).catch(function(err){
        $("#pdf-spinner").html(`<div class="gdi-alert gdi-alert-error">Could not load PDF: ${err.message}</div>`);
      });

      document.getElementById("pdf-prev").addEventListener("click", function(){
        if (o > 1) { o--; $("#pdf-spinner").show(); f(o); }
      });
      document.getElementById("pdf-next").addEventListener("click", function(){
        if (d && o < d.numPages) { o++; $("#pdf-spinner").show(); f(o); }
      });

      let _zoomTimer = null;
      document.getElementById("pdf-zoom").addEventListener("input", function(){
        s = parseInt(this.value) / 100;
        document.getElementById("pdf-zoom-val").textContent = this.value + "%";
        if (_zoomTimer) clearTimeout(_zoomTimer);
        _zoomTimer = setTimeout(()=>{ f(o); _zoomTimer = null; }, 150);
      });
    }).catch(function(){
      $("#pdf-spinner").html('<div class="gdi-alert gdi-alert-error">Failed to load PDF viewer.</div>');
    });
  }
})();
