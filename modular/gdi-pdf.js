// ═══════════════════════════════════════════════════════════════
// gdi-pdf.js — M17: Visualizador de PDF/Material (REFACTORED v55)
//
// ★ v55 (Task MATERIAL-PAGE): Removido o canvas nativo do pdf.js.
//   Motivo: o canvas não tem barra de rolagem nativa — o usuário não
//   consegue scrollar o PDF. O iframe do M9 (painel de materiais da
//   Meggy) scrolla perfeitamente.
//   Agora file_pdf e file_markdown renderizam o layout .gdi-study
//   com #gdi-slot-right (painel M9) e aplicam modo "foco no material"
//   (gdi-fm) automaticamente. O M9 auto-seleciona a aba do arquivo
//   clicado via window.__gdiAutoSelectMaterial.
//   Os botões "Dividido" e "Foco na aula" são ocultados pelo M10
//   quando detecta data-material-page="1" no #gdi-study.
//
// Mudanças anteriores (preservadas):
//  1. window.gdiPdfCleanup() mantido para compatibilidade (no-op agora)
//  2. file_markdown mantido para .md/.txt/.html (mesmo comportamento de file_pdf)
// ═══════════════════════════════════════════════════════════════

(function(){
  // Limpa o PDF atual (no-op — não há mais canvas/pdf.js para limpar)
  window.gdiPdfCleanup = async function(){};

  // ═══ v55: file_material — renderiza o layout de material (sem canvas nativo) ═══
  // Usado por file_pdf e file_markdown. Renderiza o layout .gdi-study com:
  //   - Left: placeholder mínimo (escondido em modo foco-no-material)
  //   - Right: #gdi-slot-right (painel M9 da Meggy com todas as abas)
  //   - data-material-page="1" no #gdi-study (M10 usa para ocultar botões inúteis)
  //   - Body class gdi-fm aplicada (foco no material — esconde o left)
  //   - window.__gdiAutoSelectMaterial = nome do arquivo (M9 auto-seleciona a aba)
  function file_material(i, e, t, n, a, c, iconCls){
    const dlBtns = (window.UI && window.UI.disable_video_download) ? '' : renderDownloadButtons(n, e, {showMedia: true});

    const f = `
<div class="gdi-study" id="gdi-study" data-material-page="1">
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
        <div class="gdi-viewer-card" style="margin:0;padding:30px;text-align:center;">
          <i class="bi ${iconCls}" style="font-size:48px;color:var(--ferreto-secondary,#5ddeda);display:block;margin-bottom:12px;"></i>
          <div style="color:var(--ferreto-text,#e6edf3);font-size:15px;font-weight:600;margin-bottom:6px;">${escHtml(i)}</div>
          <div style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;margin-bottom:18px;">${escHtml(t)}</div>
          <div style="color:var(--ferreto-text-muted,#8b949e);font-size:13px;line-height:1.6;max-width:400px;margin:0 auto;">
            <i class="bi bi-info-circle"></i> Visualização no painel de materiais à direita →<br>
            Use as abas para navegar entre PDFs, transcrições, ebooks e a Meggy IA.
          </div>
          ${dlBtns ? `<div style="margin-top:18px;">${dlBtns}</div>` : ''}
        </div>
      </div>
      <div id="gdi-slot-left"></div>
    </section>
    <aside class="gdi-study-right" id="gdi-slot-right"></aside>
  </div>
</div>`;
    $("#content").html(f);

    // ★ Seta o nome do arquivo para o M9 auto-selecionar a aba correta
    try { window.__gdiAutoSelectMaterial = i; } catch(_) {}

    // ★ Avisa os módulos (gdi-ui M10, gdi-core M9) que os slots estão prontos.
    // M9 vai listar os materiais da pasta e auto-selecionar a aba do arquivo clicado.
    // M10 vai injetar os botões de modo (mas ocultará Dividido/Foco-na-aula por causa do data-material-page).
    try { Bus.emit('slots:ready'); } catch(_) {}

    // ★ Aplica modo "foco no material" (gdi-fm) — esconde o left, mostra só o painel M9.
    // Tenta aplicar imediatamente e também após 200ms (fallback caso M10 ainda não tenha injetado os botões).
    const applyFm = () => {
      try {
        document.body.classList.add('gdi-fm');
        document.body.classList.remove('gdi-fv');
        // Garante que o left está oculto e o grid é 1 coluna
        const grid = document.querySelector('.gdi-study-grid');
        if (grid) grid.style.setProperty('grid-template-columns', '1fr', 'important');
        const left = document.querySelector('.gdi-study-left');
        if (left) left.style.setProperty('display', 'none', 'important');
      } catch(_) {}
    };
    applyFm();
    setTimeout(applyFm, 200);
    setTimeout(applyFm, 800);
  }

  // ★ file_pdf — agora delega para file_material (sem canvas nativo)
  window.file_pdf = function(i, e, t, n, a, c){
    return file_material(i, e, t, n, a, c, 'bi-file-earmark-pdf-fill gdi-icon-pdf');
  };

  // ★ file_markdown — agora delega para file_material (mesmo comportamento)
  window.file_markdown = function(i, e, t, n, a, c){
    const ext = (i.split('.').pop() || '').toLowerCase();
    const iconCls = ext === 'md' ? 'bi-markdown-fill' : (ext === 'html' || ext === 'htm') ? 'bi-file-earmark-code' : 'bi-file-earmark-text-fill';
    return file_material(i, e, t, n, a, c, iconCls);
  };
})();
