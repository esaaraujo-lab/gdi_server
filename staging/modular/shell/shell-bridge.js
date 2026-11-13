// ═══════════════════════════════════════════════════════════════
// shell-bridge.js — Ponte entre os módulos do main e o Shell nativo
// (Estratégia B, Fase 2A)
//
// PROBLEMA: o shell nativo (shell.js) monta a navegação DENTRO da página
// (#meggy-root > #meggy-shell > #meggy-main) e NÃO carrega os módulos do
// main — as views de estudo do shell eram placeholders ("Em breve.").
// A Área do Aluno clássica (study-panel.js) NÃO pode ser carregada aqui:
// ela monta uma segunda shell por cima da nativa (o loader já a exclui
// quando window.MEGGY_SHELL_NATIVO === true).
//
// SOLUÇÃO (sem popup, sem overlay): este arquivo é carregado pelo
// gdi-extras-loader.js DEPOIS das chains de módulos. Ele:
//   1) embrulha Shell._estudosView e desvia as features de estudo para os
//      renderizadores dos módulos, DENTRO de #meggy-main;
//   2) injeta no sidebar os itens que o shell não lista (simulado, provas,
//      redação, cronograma, estatísticas, mapa de fracos, plano,
//      notificações, concursos) — as rotas já existem no router do shell;
//   3) acrescenta às views nativas de Questões/Flashcards uma seção
//      "banco completo" (SRS / caderno de erros) dos módulos;
//   4) dá à Redação um formulário próprio ligado ao endpoint órfão
//      POST /api/ai/redacao/correct-full (staging-only, com OCR).
//
// PRECEDÊNCIA lean vs full (decidida e documentada):
//   - Bus: só existe o lean (gdi-utils.js). Os módulos NÃO o redefinem,
//     só consomem (Bus.onGlobal / emit). Vence o lean, sem conflito.
//   - GDIStorage: só existe o full (storage.js, carregado na core-chain).
//     O lean nem o define. Vence o full.
//   - GDIUser: só existe o lean (gdi-utils.js); NENHUM módulo o redefine
//     (grep: nenhum `window.GDIUser =` em modular/). Vence o lean — e é
//     por isso que cada render aqui roda dentro de try/catch: se um
//     módulo chamar um método GDIUser que só existe no full/app.min.js,
//     a view mostra um fallback honesto em vez de quebrar a página.
//   - gdiListAllFiles: lean (gdi-utils.js) carrega primeiro e o full
//     (gdi-worker-bridge.js, core-chain) o sobrescreve. Vence o full
//     (cache + list-worker); o shell lê o estado via GDIUser, não por
//     essa função, então a troca não afeta as views nativas.
//   - showToast: NÃO existia no shell. Esta ponte define um toast mínimo
//     (os módulos o chamam com guard `typeof showToast === 'function'`).
//   - #content / #count / #list (DOM do GDIndex clássico): NÃO criamos
//     shims. gdi-core.js e gdi-ui.js têm guards (`if(!c) return`,
//     `if(!host) return`) e viram no-op sem eles. Criar um #content
//     falso faria o gdi-ui injetar UI clássica num nó escondido.
//
// CARREGAMENTO: só sob o shell (o loader só inclui este arquivo quando
// window.MEGGY_SHELL_NATIVO é verdadeiro). No main clássico não existe.
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.MEGGY_SHELL_NATIVO) return;
  if (window.__gdiShellBridge) return;
  window.__gdiShellBridge = true;

  var BRIDGE_VERSION = '2A';
  var wired = {}; // feature -> 'ok' | 'modulo-ausente' | 'erro: ...'

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Toast mínimo (os módulos chamam showToast com guard) ──
  if (typeof window.showToast !== 'function') {
    window.showToast = function (msg) {
      try {
        var t = document.getElementById('gdi-shell-toast');
        if (!t) {
          t = document.createElement('div');
          t.id = 'gdi-shell-toast';
          t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1f2937;color:#f0f6fc;border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:10px 16px;font-size:13px;z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,.5);max-width:90vw;';
          document.body.appendChild(t);
        }
        t.textContent = String(msg);
        t.style.display = 'block';
        clearTimeout(t.__h);
        t.__h = setTimeout(function () { t.style.display = 'none'; }, 3500);
      } catch (_) { try { console.log('[toast]', msg); } catch (__) {} }
    };
  }

  function mdToHtml(txt) {
    try {
      if (window.Shell && typeof window.Shell._renderMd === 'function') return window.Shell._renderMd(txt);
      if (window.marked) {
        var h = window.marked.parse(txt);
        if (window.DOMPurify) { try { return window.DOMPurify.sanitize(h); } catch (_) {} }
        return h;
      }
    } catch (_) {}
    return esc(txt).replace(/\n/g, '<br>');
  }

  function fallbackCard(el, title, detail) {
    el.innerHTML = '<div class="meggy-view-header"><h1 class="meggy-view-title">' + esc(title) + '</h1></div>' +
      '<div class="meggy-placeholder"><div class="meggy-placeholder-icon">⚠️</div>' +
      '<div class="meggy-placeholder-title">Módulo não carregou</div>' +
      '<div class="meggy-placeholder-desc">' + esc(detail || 'O módulo desta função não carregou. Recarregue a página; se persistir, veja o console (erros [GDI Loader]).') + '</div>' +
      '<button class="meggy-header-btn" onclick="location.reload()" style="margin-top:16px;">Recarregar página</button></div>';
  }

  // Roda um renderizador de módulo dentro da view, sem quebrar o shell se falhar.
  function safeRender(el, feature, fn, need) {
    try {
      if (need && typeof need !== 'function' && !(need && typeof need === 'object')) throw new Error('módulo ausente');
      if (typeof need === 'function' && !need()) throw new Error('módulo ausente');
      fn(el);
      wired[feature] = 'ok';
    } catch (e) {
      wired[feature] = 'erro: ' + (e && e.message || e);
      console.error('[Shell Bridge] falha em "' + feature + '":', e);
      fallbackCard(el, feature, 'Falha ao renderizar (' + (e && e.message || e) + '). O restante do shell continua funcionando.');
    }
  }

  function headerHtml(title) {
    return '<div class="meggy-view-header"><h1 class="meggy-view-title">' + esc(title) + '</h1></div>';
  }

  // ── Redação → POST /api/ai/redacao/correct-full (staging-only, com OCR) ──
  function renderRedacaoBridge(el) {
    el.innerHTML = headerHtml('✍️ Redação') +
      '<div style="max-width:720px;">' +
      '<p style="color:#8b949e;font-size:13px;margin:0 0 16px;">Correção completa com nota por banca. Cole o texto ou envie um arquivo — imagem/foto passa por OCR, texto vai direto. PDF é extraído no navegador quando o pdf.js estiver carregado.</p>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;">' +
      '<label style="font-size:12px;color:#8b949e;">Banca<br><select id="gdi-red-banca" style="background:rgba(255,255,255,.06);border:1px solid #30363d;border-radius:8px;color:#e6edf3;padding:8px;margin-top:4px;"><option>CEBRASPE (CESPE)</option><option>FGV</option><option>VUNESP</option><option>ENEM (5 competências)</option><option>FUVEST (dissertativa)</option><option value="default">Geral</option></select></label>' +
      '<label style="font-size:12px;color:#8b949e;">Tipo<br><select id="gdi-red-tipo" style="background:rgba(255,255,255,.06);border:1px solid #30363d;border-radius:8px;color:#e6edf3;padding:8px;margin-top:4px;"><option>dissertativa</option><option>argumentativa</option><option>narrativa</option><option>carta</option></select></label>' +
      '</div>' +
      '<textarea id="gdi-red-text" rows="10" placeholder="Cole aqui a sua redação (mín. 50 caracteres)..." style="width:100%;background:rgba(255,255,255,.06);border:1px solid #30363d;border-radius:8px;color:#e6edf3;padding:12px;font-size:14px;line-height:1.6;"></textarea>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:12px 0;">' +
      '<label class="meggy-header-btn" style="cursor:pointer;">📎 Enviar arquivo<input id="gdi-red-file" type="file" accept=".txt,.md,image/*,.pdf" style="display:none;"></label>' +
      '<span id="gdi-red-filename" style="font-size:12px;color:#8b949e;"></span>' +
      '<button id="gdi-red-go" class="meggy-header-btn" style="background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;border:none;">Corrigir redação</button>' +
      '</div>' +
      '<p style="font-size:12px;color:#8b949e;">A correção é salva na pasta <code>redacoes/</code> do Drive. <a href="#" id="gdi-red-simples" style="color:#ff8b9f;">Usar a correção simples (texto, sem OCR)</a> — endpoint antigo <code>/api/ai/redacao</code>.</p>' +
      '<div id="gdi-red-out"></div></div>';

    var fileInput = el.querySelector('#gdi-red-file');
    var fileNameEl = el.querySelector('#gdi-red-filename');
    fileInput.addEventListener('change', function () {
      fileNameEl.textContent = fileInput.files && fileInput.files[0] ? 'Arquivo: ' + fileInput.files[0].name : '';
    });
    el.querySelector('#gdi-red-simples').addEventListener('click', function (ev) {
      ev.preventDefault();
      if (typeof window.renderRedacao === 'function') {
        var box = document.createElement('div');
        el.querySelector('#gdi-red-out').innerHTML = '';
        el.querySelector('#gdi-red-out').appendChild(box);
        try { window.renderRedacao(box); wired.redacao = 'ok (fallback simples)'; } catch (e) { fallbackCard(el, 'Redação', String(e && e.message || e)); }
      } else { window.showToast('Correção simples indisponível (módulo study-advanced não carregou)'); }
    });
    el.querySelector('#gdi-red-go').addEventListener('click', async function () {
      var out = el.querySelector('#gdi-red-out');
      var banca = el.querySelector('#gdi-red-banca').value;
      var tipo = el.querySelector('#gdi-red-tipo').value;
      var text = el.querySelector('#gdi-red-text').value.trim();
      var file = fileInput.files && fileInput.files[0];
      out.innerHTML = '<div class="meggy-loading"><div class="spinner-border" role="status"></div><div>Corrigindo... (pode levar até ~90s)</div></div>';
      try {
        var resp;
        if (file && file.type === 'application/pdf') {
          // O worker rejeita PDF no correct-full: extrair o texto no navegador.
          if (!window.pdfjsLib) throw new Error('PDF: o pdf.js não está carregado nesta página. Cole o texto da redação no campo acima.');
          var buf = await file.arrayBuffer();
          var pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
          var parts = [];
          for (var p = 1; p <= Math.min(pdf.numPages, 30) && parts.join('\n').length < 30000; p++) {
            var pg = await pdf.getPage(p);
            var tc = await pg.getTextContent();
            parts.push(tc.items.map(function (it) { return it.str; }).join(' '));
          }
          try { pdf.destroy(); } catch (_) {}
          text = parts.join('\n\n').trim();
          if (text.length < 50) throw new Error('Não consegui extrair texto suficiente deste PDF. Cole o texto no campo acima.');
          resp = await fetch('/api/ai/redacao/correct-full', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text, banca: banca, tipo: tipo }) });
        } else if (file) {
          var fd = new FormData();
          fd.append('file', file);
          fd.append('banca', banca);
          fd.append('tipo', tipo);
          resp = await fetch('/api/ai/redacao/correct-full', { method: 'POST', body: fd });
        } else {
          if (text.length < 50) throw new Error('Texto muito curto (mín. 50 caracteres).');
          resp = await fetch('/api/ai/redacao/correct-full', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text, banca: banca, tipo: tipo }) });
        }
        var data = await resp.json().catch(function () { return {}; });
        if (!resp.ok || !data.ok) throw new Error((data && data.error) || ('HTTP ' + resp.status));
        out.innerHTML = '<div style="margin-top:8px;padding:16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;">' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;"><span style="font-size:18px;">📝 Nota: <b style="color:#5ddeda;">' + esc(data.score) + '</b></span>' +
          (data.ocrUsed ? '<span style="font-size:12px;color:#8b949e;">· OCR usado</span>' : '') +
          (data.saved ? '<span style="font-size:12px;color:#8b949e;">· salvo em redacoes/</span>' : '<span style="font-size:12px;color:#ffb86b;">· não salvo no Drive</span>') + '</div>' +
          '<div class="gdi-isa-summary-body">' + mdToHtml(data.correction || '') + '</div></div>';
        wired.redacao = 'ok (correct-full)';
      } catch (e) {
        out.innerHTML = '<div class="meggy-placeholder"><div class="meggy-placeholder-title">Falha na correção</div><div class="meggy-placeholder-desc">' + esc(e && e.message || e) + '</div></div>';
        wired.redacao = 'erro: ' + (e && e.message || e);
      }
    });
  }

  // ── Notificações: busca nas notas + verificação manual ──
  function renderNotificacoes(el) {
    el.innerHTML = headerHtml('🔔 Notificações') +
      '<div style="max-width:720px;"><p style="color:#8b949e;font-size:13px;margin:0 0 16px;">Lembretes de revisão e avisos aparecem como toast nesta página. Use a busca abaixo para encontrar anotações.</p>' +
      '<button id="gdi-notif-check" class="meggy-header-btn" style="margin-bottom:16px;">Verificar agora</button>' +
      '<div id="gdi-notif-search"></div></div>';
    el.querySelector('#gdi-notif-check').addEventListener('click', function () {
      try {
        if (window.__gdiStudy && window.__gdiStudy.notifications && typeof window.__gdiStudy.notifications.checkAndShow === 'function') {
          window.__gdiStudy.notifications.checkAndShow();
        } else { window.showToast('Módulo de notificações não carregou — recarregue a página'); }
      } catch (e) { window.showToast('Falha ao verificar: ' + (e && e.message || e)); }
    });
    var box = el.querySelector('#gdi-notif-search');
    try {
      if (window.__gdiStudy && window.__gdiStudy.notifications && typeof window.__gdiStudy.notifications.renderSearchUI === 'function') {
        window.__gdiStudy.notifications.renderSearchUI(box);
        wired.notificacoes = 'ok';
      } else { box.innerHTML = '<div class="meggy-placeholder-desc">Busca nas notas indisponível (módulo study-notifications não carregou).</div>'; wired.notificacoes = 'modulo-ausente'; }
    } catch (e) { wired.notificacoes = 'erro: ' + (e && e.message || e); }
  }

  // ── Mapa feature → renderizador de módulo (tudo DENTRO de #meggy-main) ──
  var FEATURES = {
    simulado: function (el) { safeRender(el, 'simulado', function (b) { window.renderSimulado(b); }, function () { return typeof window.renderSimulado === 'function'; }); },
    provas: function (el) { safeRender(el, 'provas', function (b) { window.renderProvas(b); }, function () { return typeof window.renderProvas === 'function'; }); },
    redacao: function (el) { try { renderRedacaoBridge(el); wired.redacao = 'ok (correct-full)'; } catch (e) { wired.redacao = 'erro: ' + (e && e.message || e); fallbackCard(el, 'Redação', String(e && e.message || e)); } },
    cronograma: function (el) { safeRender(el, 'cronograma', function (b) { window.renderCronograma(b); }, function () { return typeof window.renderCronograma === 'function'; }); },
    estatisticas: function (el) { safeRender(el, 'estatisticas', function (b) { window.__gdiStudy.insights.renderAll(b); }, function () { return window.__gdiStudy && window.__gdiStudy.insights && typeof window.__gdiStudy.insights.renderAll === 'function'; }); },
    'mapa-fracos': function (el) { safeRender(el, 'mapa-fracos', function (b) { window.renderRadar(b); }, function () { return typeof window.renderRadar === 'function'; }); },
    plano: function (el) { safeRender(el, 'plano', function (b) { window.__gdiStudy.plan.renderAll(b); }, function () { return window.__gdiStudy && window.__gdiStudy.plan && typeof window.__gdiStudy.plan.renderAll === 'function'; }); }
  };

  // ── Seção "banco completo" anexada às views nativas ──
  function appendBankSection(el, kind) {
    try {
      if (!el || el.querySelector('#gdi-bridge-bank')) return;
      var sec = document.createElement('div');
      sec.id = 'gdi-bridge-bank';
      sec.style.cssText = 'margin-top:24px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08);';
      if (kind === 'questoes') {
        sec.innerHTML = '<h3 style="color:#f0f6fc;font-size:15px;margin:0 0 6px;">📝 Banco de questões (todas as aulas — SRS)</h3>' +
          '<p style="color:#8b949e;font-size:13px;margin:0 0 12px;">Acima: questões geradas pela Meggy por aula. Abaixo: o banco completo do main — revisão espaçada, caderno de erros e filtros por matéria.</p>' +
          '<button class="meggy-header-btn" id="gdi-bank-open">Abrir banco completo</button><div id="gdi-bank-box" style="margin-top:14px;"></div>';
        el.appendChild(sec);
        sec.querySelector('#gdi-bank-open').addEventListener('click', function () {
          var box = sec.querySelector('#gdi-bank-box');
          if (typeof window.renderQuestoes === 'function') {
            safeRender(box, 'questoes-banco', function (b) { window.renderQuestoes(b); }, function () { return true; });
            box.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } else { window.showToast('Banco de questões indisponível (study-questions não carregou)'); }
        });
      } else {
        sec.innerHTML = '<h3 style="color:#f0f6fc;font-size:15px;margin:0 0 6px;">🃏 Revisão SRS (todos os decks)</h3>' +
          '<p style="color:#8b949e;font-size:13px;margin:0 0 12px;">Acima: flashcards da aula. Abaixo: a biblioteca SRS do main — todos os decks, com gradação e intervalos.</p>' +
          '<button class="meggy-header-btn" id="gdi-bank-open">Abrir biblioteca SRS</button><div id="gdi-bank-box" style="margin-top:14px;"></div>';
        el.appendChild(sec);
        sec.querySelector('#gdi-bank-open').addEventListener('click', function () {
          var box = sec.querySelector('#gdi-bank-box');
          if (window.__gdiMeggy && window.__gdiMeggy.flashcards && typeof window.__gdiMeggy.flashcards.flashcards === 'function') {
            safeRender(box, 'flashcards-srs', function (b) { window.__gdiMeggy.flashcards.flashcards([], b, 'Todos os decks'); }, function () { return true; });
            box.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } else { window.showToast('Biblioteca SRS indisponível (meggy-flashcards não carregou)'); }
        });
      }
    } catch (e) { console.warn('[Shell Bridge] appendBankSection falhou:', e); }
  }

  // ── Sidebar: itens que o shell não lista (rotas já existem no router) ──
  function injectSidebarItems() {
    try {
      var aside = document.getElementById('meggy-sidebar');
      if (!aside || aside.querySelector('[data-bridge-item]')) return;
      var items = [
        { id: 'concursos', label: 'Meus Concursos', icon: 'bi-pin-angle', path: '/concursos' },
        { id: 'simulado', label: 'Simulado', icon: 'bi-stopwatch', path: '/simulado' },
        { id: 'provas', label: 'Provas', icon: 'bi-file-earmark-text', path: '/provas' },
        { id: 'redacao', label: 'Redação', icon: 'bi-pen', path: '/redacao' },
        { id: 'cronograma', label: 'Cronograma', icon: 'bi-calendar3', path: '/cronograma' },
        { id: 'estatisticas', label: 'Estatísticas', icon: 'bi-bar-chart-line', path: '/estatisticas' },
        { id: 'mapa-fracos', label: 'Mapa de Fracos', icon: 'bi-bullseye', path: '/mapa-fracos' },
        { id: 'plano', label: 'Plano de Estudos', icon: 'bi-map', path: '/plano' },
        { id: 'notificacoes', label: 'Notificações', icon: 'bi-bell', path: '/notificacoes' }
      ];
      var sec = document.createElement('div');
      sec.innerHTML = '<div class="meggy-sidebar-section">Estudos — módulos</div>' + items.map(function (it) {
        return '<div class="meggy-sidebar-item" data-bridge-item="1" data-path="' + it.path + '" data-view="' + it.id + '"><i class="bi ' + it.icon + '"></i><span>' + esc(it.label) + '</span></div>';
      }).join('');
      aside.appendChild(sec);
      sec.querySelectorAll('.meggy-sidebar-item').forEach(function (node) {
        node.onclick = function () {
          try { window.Shell.router.navigate(node.dataset.path); } catch (_) {}
          try { window.Shell.toggleSidebar(false); } catch (_) {}
        };
      });
      console.log('[Shell Bridge] sidebar: +9 itens (concursos, simulado, provas, redação, cronograma, estatísticas, mapa de fracos, plano, notificações)');
    } catch (e) { console.warn('[Shell Bridge] sidebar falhou:', e); }
  }

  function wire() {
    var Shell = window.Shell;
    if (!Shell || !Shell.views || typeof Shell._estudosView !== 'function') return false;

    // Rotas do router (a maioria já existe; só /notificacoes é nova).
    try { Shell.router.routes['/notificacoes'] = 'notificacoes'; } catch (_) {}

    // renderView: intercepta só /notificacoes; o resto segue o fluxo nativo.
    var _renderView = Shell.renderView.bind(Shell);
    Shell.renderView = function () {
      var path = Shell.router.currentPath();
      if (path === '/notificacoes') {
        try { if (Shell.meggyAIDrawerOpen) Shell.closeMeggyAIDrawer(); } catch (_) {}
        Shell.state.currentView = 'notificacoes';
        try { Shell.sidebar.updateActive(path); } catch (_) {}
        var main = document.getElementById('meggy-main');
        if (main) { main.scrollTop = 0; renderNotificacoes(main); }
        return;
      }
      return _renderView();
    };

    // _estudosView: desvia as features de estudo para os módulos; o resto
    // (progresso, config, conquistas, apps) continua nativo.
    var _estudosView = Shell._estudosView.bind(Shell);
    Shell._estudosView = function (el, feature) {
      if (FEATURES[feature]) { FEATURES[feature](el); return; }
      _estudosView(el, feature);
      if (feature === 'progresso') {
        try {
          var link = document.createElement('div');
          link.style.cssText = 'margin-top:16px;text-align:center;';
          link.innerHTML = '<button class="meggy-header-btn" onclick="Shell.router.navigate(\'/estatisticas\')">Ver dashboard completo (estatísticas + Meggy Coach) →</button>';
          el.appendChild(link);
        } catch (_) {}
      }
    };

    // Questões/Flashcards nativas ganham a seção "banco completo" dos módulos.
    ['questoes', 'flashcards'].forEach(function (kind) {
      try {
        var orig = Shell.views[kind];
        if (typeof orig !== 'function') return;
        Shell.views[kind] = function (el) {
          orig.call(Shell.views, el);
          // A view nativa preenche o container de forma assíncrona; o anexo
          // é um nó separado e sobrevive a isso (só some se a view trocar
          // el.innerHTML por completo, e volta ao reentrar na aba).
          setTimeout(function () { appendBankSection(el, kind); }, 50);
        };
      } catch (e) { console.warn('[Shell Bridge] wrap views.' + kind + ' falhou:', e); }
    });

    injectSidebarItems();
    window.MeggyShellExtras = {
      version: BRIDGE_VERSION,
      wired: wired,
      features: Object.keys(FEATURES).concat(['questoes-banco', 'flashcards-srs', 'notificacoes']),
      status: function () { return JSON.parse(JSON.stringify(wired)); }
    };
    console.log('[Shell Bridge] ✓ ligado — views do shell agora usam os módulos do main (sem popup)');
    return true;
  }

  // Shell monta no DOMContentLoaded; a ponte carrega depois das chains, mas
  // espera a montagem antes de embrulhar os métodos.
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    if (document.getElementById('meggy-shell') && window.Shell) {
      clearInterval(timer);
      if (!wire()) console.warn('[Shell Bridge] Shell presente mas _estudosView ausente — nada ligado');
    } else if (tries > 75) {
      clearInterval(timer);
      console.warn('[Shell Bridge] timeout esperando #meggy-shell — nada ligado');
    }
  }, 200);
})();
