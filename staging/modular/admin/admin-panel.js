// ═══════════════════════════════════════════════════════════════
// admin-panel.js — Painel Administrativo GDI (self-contained client)
//
// Task ADMIN-07-REVIEW-MERGE. No partial admin-panel fragments existed in the
// tree (Glob over /tmp returned none), so this file is the canonical, complete,
// from-scratch implementation — merged into ONE file as required.
//
// Loaded lazily by the HTML shell served at /admin (worker.js handleAdmin,
// v1.0.95). NOT part of the SPA MODULES array — fully standalone.
//
// 8 tabs: Dashboard, Usuários, IA, Player, Scanner, Drives, Memória, Logs.
//
// API surface (consumes the real endpoints added by ADMIN-01-WORKER-API):
//   GET  /api/admin/stats        → { ok, stats:{users,courses,ai,storage} }
//   GET  /api/admin/users        → { ok, users:[{username,role,lastLogin,coursesCount,progress}] }
//   GET  /api/admin/config       → { ok, config:{player_type,shaka_version,scanner_*,drives,...} }
//   PUT  /api/admin/config       body {key:value} → { ok, updated:[keys] }
//   GET  /api/admin/health       → { ok, health:{worker,ai,kv,drive,uptime,errorCount24h} }
//   GET  /api/admin/logs         → { ok, logs:[{timestamp,error,endpoint,user}] }
//   GET  /api/admin/cache-stats  → { ok, stats:{entries,size,hitRate} }
//   POST /api/admin/init-indice  → { ok, message, id }
//   POST /api/admin/migrate-memory → { ok, files[], errors[], summary{} }
// Also reads existing public routes: /api/ai/models, /api/ai/stats,
//   /api/ai/status, /api/courses/scan-debug.
//
// Design constraints (per task spec):
//   • COMPLETE & SELF-CONTAINED — no imports from other modules.
//   • No window.Bus / window.$ / window.GDIStorage / app.min.js deps.
//   • Uses fetch() directly for all API calls.
//   • Uses document.createElement + innerHTML for rendering.
//   • IIFE guard present (window.__gdiAdminPanel).
//   • init() function present.
//
// Error handling:
//   • 401 → redirect to /login
//   • 403 → "Acesso negado"
//   • 500 → error message
//   • network error → retry button
//
// Namespace: window.__gdiAdmin = { open, close, init, goto }
// Guard:     window.__gdiAdminPanel
// ═══════════════════════════════════════════════════════════════
(function () {
  if (window.__gdiAdminPanel) return;
  window.__gdiAdminPanel = true;

  window.__gdiAdmin = window.__gdiAdmin || {};

  // ── State ──────────────────────────────────────────────────────
  var S = {
    root: null,
    overlay: null,
    content: null,
    titleEl: null,
    open: false,
    tab: 'dashboard',
    retryFn: null,
    cache: {}        // per-tab cached payloads (config, etc.)
  };

  // ── Tab registry (order = sidebar order) ──────────────────────
  var TABS = [
    { id: 'dashboard', label: 'Dashboard',  icon: '📊', render: renderDashboard },
    { id: 'users',     label: 'Usuários',   icon: '👥', render: renderUsers },
    { id: 'ai',        label: 'IA',         icon: '🤖', render: renderAI },
    { id: 'player',    label: 'Player',     icon: '▶️', render: renderPlayer },
    { id: 'scanner',   label: 'Scanner',    icon: '📡', render: renderScanner },
    { id: 'drives',    label: 'Drives',     icon: '💾', render: renderDrives },
    { id: 'memory',    label: 'Memória',    icon: '🧠', render: renderMemory },
    { id: 'logs',      label: 'Logs',       icon: '📜', render: renderLogs }
  ];

  // ═══════════════════════════════════════════════════════════════
  //  CSS  (injected once)
  // ═══════════════════════════════════════════════════════════════
  function injectCSS() {
    if (document.getElementById('gdi-admin-style')) return;
    var s = document.createElement('style');
    s.id = 'gdi-admin-style';
    s.textContent = [
      '#gdi-admin-overlay{position:fixed;inset:0;z-index:2147483640;background:rgba(4,6,14,.72);',
      'backdrop-filter:blur(4px);display:none;}#gdi-admin-overlay.show{display:flex;}',
      '#gdi-admin-root{position:fixed;inset:0;z-index:2147483641;display:none;',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;',
      'background:#070910;color:#e6e9f0;overflow:hidden;}#gdi-admin-root.show{display:flex;}',
      '#gdi-admin-sidebar{width:248px;flex:0 0 248px;background:linear-gradient(180deg,#0b0f1c,#070910);',
      'border-right:1px solid rgba(255,255,255,.06);display:flex;flex-direction:column;',
      'box-shadow:4px 0 24px rgba(0,0,0,.4);}',
      '#gdi-admin-brand{padding:22px 20px 16px;border-bottom:1px solid rgba(255,255,255,.06);}',
      '#gdi-admin-brand .logo{font-size:18px;font-weight:700;letter-spacing:.3px;',
      'background:linear-gradient(90deg,#5ddeda,#c026d3);-webkit-background-clip:text;background-clip:text;',
      '-webkit-text-fill-color:transparent;}',
      '#gdi-admin-brand .sub{font-size:11px;color:#7a8195;margin-top:3px;letter-spacing:.4px;text-transform:uppercase;}',
      '#gdi-admin-nav{flex:1;overflow-y:auto;padding:10px 8px;}',
      '.gdi-admin-nav-item{display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:10px;',
      'cursor:pointer;color:#9aa1b5;font-size:14px;font-weight:500;transition:all .15s;',
      'border:1px solid transparent;user-select:none;}',
      '.gdi-admin-nav-item:hover{background:rgba(255,255,255,.04);color:#e6e9f0;}',
      '.gdi-admin-nav-item.active{background:linear-gradient(135deg,rgba(93,222,218,.14),rgba(192,38,211,.14));',
      'color:#fff;border-color:rgba(93,222,218,.25);box-shadow:0 4px 14px -6px rgba(93,222,218,.4);}',
      '.gdi-admin-nav-item .ico{font-size:17px;width:22px;text-align:center;flex:0 0 22px;}',
      '#gdi-admin-sidebar-foot{padding:14px 16px;border-top:1px solid rgba(255,255,255,.06);font-size:11px;color:#5f6678;}',
      '#gdi-admin-main{flex:1;display:flex;flex-direction:column;overflow:hidden;}',
      '#gdi-admin-topbar{height:60px;flex:0 0 60px;display:flex;align-items:center;justify-content:space-between;',
      'padding:0 26px;border-bottom:1px solid rgba(255,255,255,.06);background:rgba(11,15,28,.6);}',
      '#gdi-admin-topbar .title{font-size:18px;font-weight:700;color:#fff;}',
      '#gdi-admin-topbar .title .sub{font-size:12px;font-weight:400;color:#7a8195;margin-left:10px;}',
      '.gdi-admin-btn{cursor:pointer;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);',
      'color:#e6e9f0;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:500;transition:all .15s;',
      'display:inline-flex;align-items:center;gap:7px;font-family:inherit;}',
      '.gdi-admin-btn:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.2);}',
      '.gdi-admin-btn.primary{background:linear-gradient(135deg,#5ddeda,#3aa6a3);border-color:transparent;color:#06231f;font-weight:600;}',
      '.gdi-admin-btn.primary:hover{filter:brightness(1.08);}',
      '.gdi-admin-btn.danger{background:rgba(220,38,38,.16);border-color:rgba(220,38,38,.4);color:#fca5a5;}',
      '.gdi-admin-btn.danger:hover{background:rgba(220,38,38,.26);}',
      '.gdi-admin-btn:disabled{opacity:.5;cursor:not-allowed;}',
      '#gdi-admin-content{flex:1;overflow-y:auto;padding:26px;}',
      '.gdi-admin-grid{display:grid;gap:16px;}',
      '.gdi-admin-cards-4{grid-template-columns:repeat(4,1fr);}',
      '.gdi-admin-cards-3{grid-template-columns:repeat(3,1fr);}',
      '.gdi-admin-cards-2{grid-template-columns:repeat(2,1fr);}',
      '@media(max-width:1100px){.gdi-admin-cards-4{grid-template-columns:repeat(2,1fr);}',
      '.gdi-admin-cards-3{grid-template-columns:repeat(2,1fr);}}',
      '@media(max-width:760px){.gdi-admin-cards-4,.gdi-admin-cards-3,.gdi-admin-cards-2{grid-template-columns:1fr;}}',
      '.gdi-admin-card{background:rgba(17,22,38,.7);border:1px solid rgba(255,255,255,.07);border-radius:14px;',
      'padding:20px;box-shadow:0 8px 24px -12px rgba(0,0,0,.5);}',
      '.gdi-admin-kpi{display:flex;flex-direction:column;gap:6px;}',
      '.gdi-admin-kpi .lbl{font-size:12px;color:#7a8195;text-transform:uppercase;letter-spacing:.5px;}',
      '.gdi-admin-kpi .val{font-size:30px;font-weight:700;color:#fff;line-height:1.1;}',
      '.gdi-admin-kpi .delta{font-size:12px;color:#5ddeda;}',
      '.gdi-admin-card h3{margin:0 0 14px;font-size:15px;font-weight:600;color:#fff;display:flex;align-items:center;gap:8px;}',
      '.gdi-admin-card h3 .sub{font-size:12px;font-weight:400;color:#7a8195;}',
      '.gdi-admin-table{width:100%;border-collapse:collapse;font-size:13px;}',
      '.gdi-admin-table th{text-align:left;padding:10px 12px;color:#7a8195;font-weight:600;font-size:11px;',
      'text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid rgba(255,255,255,.08);}',
      '.gdi-admin-table td{padding:11px 12px;border-bottom:1px solid rgba(255,255,255,.04);color:#c8ccd8;}',
      '.gdi-admin-table tr:hover td{background:rgba(255,255,255,.02);}',
      '.gdi-admin-pill{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:20px;',
      'font-size:11px;font-weight:600;letter-spacing:.3px;}',
      '.gdi-admin-pill.ok{background:rgba(34,197,94,.14);color:#4ade80;}',
      '.gdi-admin-pill.warn{background:rgba(234,179,8,.14);color:#facc15;}',
      '.gdi-admin-pill.err{background:rgba(220,38,38,.14);color:#fca5a5;}',
      '.gdi-admin-pill.mute{background:rgba(255,255,255,.06);color:#9aa1b5;}',
      '.gdi-admin-input,.gdi-admin-select,.gdi-admin-textarea{background:rgba(7,9,16,.6);',
      'border:1px solid rgba(255,255,255,.12);color:#e6e9f0;padding:8px 12px;border-radius:8px;font-size:13px;',
      'outline:none;transition:border .15s;font-family:inherit;}',
      '.gdi-admin-input:focus,.gdi-admin-select:focus,.gdi-admin-textarea:focus{border-color:rgba(93,222,218,.5);}',
      '.gdi-admin-textarea{resize:vertical;min-height:70px;width:100%;}',
      '.gdi-admin-empty{text-align:center;padding:48px 20px;color:#7a8195;}',
      '.gdi-admin-empty .ico{font-size:42px;opacity:.5;margin-bottom:12px;}',
      '.gdi-admin-empty .msg{font-size:14px;margin-bottom:6px;}',
      '.gdi-admin-empty .hint{font-size:12px;color:#5f6678;}',
      '.gdi-admin-skel{background:linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.09),rgba(255,255,255,.04));',
      'background-size:200% 100%;animation:gdi-admin-shimmer 1.4s infinite;border-radius:8px;height:18px;margin-bottom:10px;}',
      '@keyframes gdi-admin-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}',
      '.gdi-admin-errbox{background:rgba(220,38,38,.1);border:1px solid rgba(220,38,38,.3);border-radius:12px;',
      'padding:24px;text-align:center;color:#fca5a5;}',
      '.gdi-admin-errbox .ico{font-size:36px;margin-bottom:10px;}',
      '.gdi-admin-errbox .ttl{font-size:16px;font-weight:700;margin-bottom:6px;color:#fff;}',
      '.gdi-admin-errbox .dsc{font-size:13px;margin-bottom:16px;color:#fca5a5;}',
      '.gdi-admin-log{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.7;',
      'background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:14px;',
      'max-height:560px;overflow-y:auto;white-space:pre-wrap;word-break:break-word;}',
      '.gdi-admin-log .lv-err{color:#fca5a5;}.gdi-admin-log .lv-warn{color:#facc15;}',
      '.gdi-admin-log .lv-info{color:#5ddeda;}.gdi-admin-log .lv-dim{color:#5f6678;}',
      '.gdi-admin-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px;}',
      '.gdi-admin-progress{height:8px;background:rgba(255,255,255,.06);border-radius:6px;overflow:hidden;}',
      '.gdi-admin-progress > i{display:block;height:100%;background:linear-gradient(90deg,#5ddeda,#3aa6a3);transition:width .4s ease;}',
      '.gdi-admin-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;',
      'border-bottom:1px solid rgba(255,255,255,.05);}.gdi-admin-row:last-child{border-bottom:0;}',
      '.gdi-admin-modal-bg{position:fixed;inset:0;z-index:2147483645;background:rgba(0,0,0,.6);display:flex;',
      'align-items:center;justify-content:center;padding:20px;}'
    ].join('');
    document.head.appendChild(s);
  }

  // ═══════════════════════════════════════════════════════════════
  //  Utilities
  // ═══════════════════════════════════════════════════════════════
  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtNum(n) {
    n = Number(n);
    if (isNaN(n)) n = 0;
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
    return String(n);
  }

  function fmtBytes(b) {
    b = Number(b) || 0;
    if (b >= 1073741824) return (b / 1073741824).toFixed(2) + ' GB';
    if (b >= 1048576) return (b / 1048576).toFixed(2) + ' MB';
    if (b >= 1024) return (b / 1024).toFixed(1) + ' KB';
    return b + ' B';
  }

  function fmtAgo(t) {
    if (!t) return 'nunca';
    var d = new Date(t);
    if (isNaN(d.getTime())) return String(t);
    var s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 0) return 'agora';
    if (s < 60) return s + 's atrás';
    if (s < 3600) return Math.floor(s / 60) + 'min atrás';
    if (s < 86400) return Math.floor(s / 3600) + 'h atrás';
    return Math.floor(s / 86400) + 'd atrás';
  }

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  // ── Central API wrapper ────────────────────────────────────────
  // Returns { ok, status, data, error, kind }
  function api(method, path, body) {
    var opts = { method: method, credentials: 'same-origin', headers: { 'Accept': 'application/json' } };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(path, opts).then(function (r) {
      var ct = r.headers.get('content-type') || '';
      var parse = ct.indexOf('json') >= 0 ? r.json() : r.text();
      return parse.then(function (data) {
        return { ok: r.ok, status: r.status, data: data, error: r.ok ? null : extractErr(data, r.status), kind: 'http' };
      });
    }).catch(function (err) {
      return { ok: false, status: 0, data: null, error: 'network', kind: 'network', detail: String(err && err.message || err) };
    });
  }

  function extractErr(data, status) {
    if (data && typeof data === 'object') {
      if (data.error) return String(data.error);
      if (data.message) return String(data.message);
    }
    if (status === 401) return 'auth';
    if (status === 403) return 'forbidden';
    if (status === 404) return 'notfound';
    if (status >= 500) return 'server';
    return 'http_' + status;
  }

  // ── Error rendering ────────────────────────────────────────────
  // Returns true if a terminal error UI was rendered (caller should stop).
  function handleApiError(res, container, retryFn) {
    if (res.status === 401 || res.error === 'auth') {
      try { window.location.href = '/login'; } catch (_) {}
      return true;
    }
    if (res.status === 403 || res.error === 'forbidden') {
      renderDenied(container);
      return true;
    }
    if (res.kind === 'network') {
      renderNetworkError(container, retryFn);
      return true;
    }
    if (res.status >= 500 || res.error === 'server') {
      renderServerError(container, res);
      return true;
    }
    return false; // 404 / other → caller decides (graceful empty state)
  }

  function renderDenied(container) {
    container.innerHTML = '';
    container.appendChild(el('div', { class: 'gdi-admin-errbox' },
      '<div class="ico">🔒</div><div class="ttl">Acesso negado</div>' +
      '<div class="dsc">Sua conta não tem privilégios de administrador. Apenas administradores autorizados podem acessar este painel.</div>'));
  }

  function renderNetworkError(container, retryFn) {
    S.retryFn = retryFn || null;
    container.innerHTML = '';
    var box = el('div', { class: 'gdi-admin-errbox' },
      '<div class="ico">📡</div><div class="ttl">Falha de conexão</div>' +
      '<div class="dsc">Não foi possível contatar o servidor. Verifique sua conexão de internet e tente novamente.</div>');
    var btn = el('button', { class: 'gdi-admin-btn primary' }, '🔄 Tentar novamente');
    btn.addEventListener('click', function () { if (typeof S.retryFn === 'function') S.retryFn(); });
    box.appendChild(btn);
    container.appendChild(box);
  }

  function renderServerError(container, res) {
    container.innerHTML = '';
    container.appendChild(el('div', { class: 'gdi-admin-errbox' },
      '<div class="ico">⚠️</div><div class="ttl">Erro do servidor (500)</div>' +
      '<div class="dsc">O servidor retornou um erro interno ao processar a solicitação. Tente novamente em instantes.</div>' +
      '<div style="font-size:11px;color:#7a8195;margin-top:10px;">Status: ' + esc(res.status || '?') + '</div>'));
  }

  function renderLoading(container, rows) {
    rows = rows || 3;
    var html = '';
    for (var i = 0; i < rows; i++) html += '<div class="gdi-admin-skel"></div>';
    container.innerHTML = html;
  }

  function renderEmpty(container, icon, msg, hint) {
    container.insertAdjacentHTML('beforeend',
      '<div class="gdi-admin-empty"><div class="ico">' + icon + '</div>' +
      '<div class="msg">' + esc(msg) + '</div>' +
      (hint ? '<div class="hint">' + esc(hint) + '</div>' : '') + '</div>');
  }

  function setEmpty(container, icon, msg, hint) {
    container.innerHTML = '';
    renderEmpty(container, icon, msg, hint);
  }

  function kpiCard(lbl, val, delta) {
    return '<div class="gdi-admin-card gdi-admin-kpi"><div class="lbl">' + esc(lbl) + '</div>' +
      '<div class="val">' + esc(val) + '</div>' +
      (delta ? '<div class="delta">' + esc(delta) + '</div>' : '') + '</div>';
  }

  // ═══════════════════════════════════════════════════════════════
  //  Shell / Layout
  // ═══════════════════════════════════════════════════════════════
  function buildShell() {
    var root = el('div', { id: 'gdi-admin-root' });
    var overlay = el('div', { id: 'gdi-admin-overlay' });

    var sidebar = el('div', { id: 'gdi-admin-sidebar' });
    sidebar.appendChild(el('div', { id: 'gdi-admin-brand' },
      '<div class="logo">⚡ GDI Admin</div><div class="sub">Painel de Controle</div>'));
    var nav = el('div', { id: 'gdi-admin-nav' });
    TABS.forEach(function (t) {
      var item = el('div', { class: 'gdi-admin-nav-item', 'data-tab': t.id },
        '<span class="ico">' + t.icon + '</span><span>' + esc(t.label) + '</span>');
      item.addEventListener('click', function () { goto(t.id); });
      nav.appendChild(item);
    });
    sidebar.appendChild(nav);
    sidebar.appendChild(el('div', { id: 'gdi-admin-sidebar-foot' }, 'v1.0.95 · admin-panel.js'));

    var main = el('div', { id: 'gdi-admin-main' });
    var topbar = el('div', { id: 'gdi-admin-topbar' });
    var titleWrap = el('div', { class: 'title' });
    titleWrap.appendChild(el('span', { id: 'gdi-admin-tab-title' }, 'Dashboard'));
    var actions = el('div', null);
    var refreshBtn = el('button', { class: 'gdi-admin-btn', title: 'Recarregar' }, '🔄 Recarregar');
    refreshBtn.addEventListener('click', function () { goto(S.tab, true); });
    var closeBtn = el('button', { class: 'gdi-admin-btn', title: 'Fechar' }, '✕ Fechar');
    closeBtn.addEventListener('click', close);
    actions.appendChild(refreshBtn);
    actions.appendChild(closeBtn);
    topbar.appendChild(titleWrap);
    topbar.appendChild(actions);
    main.appendChild(topbar);

    var content = el('div', { id: 'gdi-admin-content' });
    main.appendChild(content);

    root.appendChild(sidebar);
    root.appendChild(main);

    overlay.addEventListener('click', close);

    document.body.appendChild(overlay);
    document.body.appendChild(root);

    S.root = root;
    S.overlay = overlay;
    S.content = content;
    S.titleEl = titleWrap.querySelector('#gdi-admin-tab-title');
  }

  function updateNav() {
    var items = S.root.querySelectorAll('.gdi-admin-nav-item');
    for (var i = 0; i < items.length; i++) {
      if (items[i].getAttribute('data-tab') === S.tab) items[i].classList.add('active');
      else items[i].classList.remove('active');
    }
    var meta = TABS.filter(function (t) { return t.id === S.tab; })[0];
    if (meta && S.titleEl) S.titleEl.textContent = meta.label;
  }

  // ═══════════════════════════════════════════════════════════════
  //  Tab dispatch
  // ═══════════════════════════════════════════════════════════════
  function goto(tabId, force) {
    if (!tabId) tabId = S.tab || 'dashboard';
    S.tab = tabId;
    updateNav();
    var meta = TABS.filter(function (t) { return t.id === tabId; })[0];
    if (!meta) { setEmpty(S.content, '❓', 'Aba desconhecida', 'Selecione uma aba na barra lateral.'); return; }
    S.content.innerHTML = '';
    renderLoading(S.content, 4);
    try {
      meta.render(S.content, force);
    } catch (err) {
      S.content.innerHTML = '';
      S.content.appendChild(el('div', { class: 'gdi-admin-errbox' },
        '<div class="ico">🐛</div><div class="ttl">Erro de renderização</div>' +
        '<div class="dsc">' + esc(String(err && err.message || err)) + '</div>'));
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  TAB: Dashboard  (GET /api/admin/stats + /api/admin/health)
  // ═══════════════════════════════════════════════════════════════
  function renderDashboard(container) {
    var load = function () {
      renderLoading(container, 5);
      Promise.all([
        api('GET', '/api/admin/stats'),
        api('GET', '/api/admin/health')
      ]).then(function (r) {
        // Auth takes precedence across both calls.
        if (r[0].status === 401 || r[1].status === 401) { window.location.href = '/login'; return; }
        if (r[0].status === 403 || r[1].status === 403) { renderDenied(container); return; }
        if (r[0].kind === 'network' && r[1].kind === 'network') { renderNetworkError(container, load); return; }
        if (r[0].status >= 500 || r[1].status >= 500) {
          renderServerError(container, r[0].status >= 500 ? r[0] : r[1]); return;
        }
        var stats = (r[0].ok && r[0].data && r[0].data.stats) ? r[0].data.stats : {};
        var health = (r[1].ok && r[1].data && r[1].data.health) ? r[1].data.health : {};
        S.cache.stats = stats; S.cache.health = health;
        paint(stats, health);
      });
    };
    var paint = function (stats, health) {
      var u = stats.users || {}, c = stats.courses || {}, ai = stats.ai || {}, st = stats.storage || {};
      var kpis = [
        kpiCard('Usuários', fmtNum(u.total || 0), u.last24h ? ('+' + u.last24h + ' nas 24h') : ''),
        kpiCard('Cursos rastreados', fmtNum(c.total || 0), c.scanning ? (c.scanning + ' escaneando') : ''),
        kpiCard('Chamadas de IA', fmtNum(ai.totalRequests || 0), ai.cacheHits ? (ai.cacheHits + ' em cache') : ''),
        kpiCard('Entradas de storage', fmtNum(st.totalFiles || 0), '')
      ];

      var hp = health.ai || {};
      var pills = [
        { lbl: 'Worker', ok: health.worker === 'ok' },
        { lbl: 'KV', ok: !!health.kv },
        { lbl: 'Drive', ok: !!health.drive },
        { lbl: 'AI · CF', ok: !!hp.cf },
        { lbl: 'AI · NVIDIA', ok: !!hp.nvidia },
        { lbl: 'AI · OpenRouter', ok: !!hp.openrouter }
      ].map(function (p) {
        return '<span class="gdi-admin-pill ' + (p.ok ? 'ok' : 'err') + '">' + p.lbl + ' ' + (p.ok ? '✓' : '✕') + '</span>';
      }).join(' ');

      container.innerHTML =
        '<div class="gdi-admin-grid gdi-admin-cards-4">' + kpis.join('') + '</div>' +
        '<div class="gdi-admin-grid gdi-admin-cards-2" style="margin-top:16px;">' +
          '<div class="gdi-admin-card"><h3>🩺 Saúde do sistema <span class="sub">/api/admin/health</span></h3>' +
            '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">' + pills + '</div>' +
            '<div class="gdi-admin-row"><span>Uptime do worker</span><strong style="color:#fff">' + esc(health.uptime || '—') + '</strong></div>' +
            '<div class="gdi-admin-row"><span>Erros registrados (24h)</span><strong style="color:' + ((health.errorCount24h || 0) ? '#fca5a5' : '#4ade80') + '">' + esc(health.errorCount24h || 0) + '</strong></div>' +
            '<div class="gdi-admin-row"><span>Cache hits / misses (IA)</span><strong style="color:#fff">' + fmtNum(ai.cacheHits || 0) + ' / ' + fmtNum(ai.cacheMisses || 0) + '</strong></div>' +
          '</div>' +
          '<div class="gdi-admin-card"><h3>📦 Storage <span class="sub">KV + Drive</span></h3>' +
            '<div class="gdi-admin-row"><span>Entradas no KV</span><strong style="color:#fff">' + fmtNum(st.totalSize || 0) + '</strong></div>' +
            '<div class="gdi-admin-row"><span>Raízes de drive configuradas</span><strong style="color:#fff">' + fmtNum(st.totalFiles || 0) + '</strong></div>' +
            '<div class="gdi-admin-row"><span>Usuários ativos (com progresso)</span><strong style="color:#fff">' + fmtNum(u.active || 0) + '</strong></div>' +
          '</div>' +
        '</div>';

      var a = document.createElement('div');
      a.className = 'gdi-admin-card';
      a.style.marginTop = '16px';
      a.innerHTML = '<h3>🚀 Ações rápidas</h3><div style="display:flex;gap:10px;flex-wrap:wrap">' +
        '<button class="gdi-admin-btn primary" id="gdi-adm-dash-memory">🧠 Ir para Memória</button>' +
        '<button class="gdi-admin-btn" id="gdi-adm-dash-logs">📜 Ver logs</button>' +
        '<button class="gdi-admin-btn" id="gdi-adm-dash-refresh">🔄 Atualizar</button></div>';
      container.appendChild(a);
      a.querySelector('#gdi-adm-dash-memory').addEventListener('click', function () { goto('memory'); });
      a.querySelector('#gdi-adm-dash-logs').addEventListener('click', function () { goto('logs'); });
      a.querySelector('#gdi-adm-dash-refresh').addEventListener('click', load);
    };
    load();
  }

  // ═══════════════════════════════════════════════════════════════
  //  TAB: Usuários  (GET /api/admin/users)
  // ═══════════════════════════════════════════════════════════════
  function renderUsers(container) {
    var query = '';
    var all = [];
    var load = function () {
      renderLoading(container, 5);
      api('GET', '/api/admin/users').then(function (res) {
        if (handleApiError(res, container, load)) return;
        all = (res.ok && res.data && res.data.users) ? res.data.users : [];
        if (!Array.isArray(all)) all = [];
        paint();
      });
    };
    var paint = function () {
      var q = query.toLowerCase();
      var list = q ? all.filter(function (u) {
        return String(u.username || '').toLowerCase().indexOf(q) >= 0;
      }) : all;

      var toolbar = '<div class="gdi-admin-toolbar">' +
        '<input class="gdi-admin-input" id="gdi-admin-user-search" placeholder="Buscar por email…" value="' + esc(query) + '" style="flex:1;max-width:340px">' +
        '<button class="gdi-admin-btn" id="gdi-admin-user-refresh">🔄 Atualizar</button>' +
        '<span style="flex:1"></span><span style="font-size:12px;color:#7a8195">' + esc(list.length) + ' de ' + esc(all.length) + ' usuários</span>' +
        '</div>';

      if (!all.length) {
        container.innerHTML = toolbar;
        renderEmpty(container, '👥', 'Nenhum usuário encontrado',
          'Nenhum usuário foi retornado por /api/admin/users. Verifique a configuração de authConfig.users_list e o registro dinâmico (.gdi_users.json).');
        bind();
        return;
      }

      var rows = list.map(function (u) {
        var name = esc(u.username || '—');
        var role = u.role || 'user';
        var pill = role === 'admin'
          ? '<span class="gdi-admin-pill ok">admin</span>'
          : '<span class="gdi-admin-pill mute">user</span>';
        var seen = u.lastLogin ? '<span class="gdi-admin-pill ok">ativo</span>' : '<span class="gdi-admin-pill mute">—</span>';
        return '<tr><td>' + name + '</td><td>' + pill + '</td><td>' + seen + '</td>' +
          '<td>' + esc(fmtAgo(u.lastLogin)) + '</td>' +
          '<td>' + esc(fmtNum(u.coursesCount || 0)) + '</td>' +
          '<td>' + esc(fmtNum(u.progress || 0)) + '</td></tr>';
      }).join('');

      if (!rows) rows = '<tr><td colspan="6"><div class="gdi-admin-empty"><div class="ico">🔍</div><div class="msg">Nenhum usuário corresponde à busca</div></div></td></tr>';

      container.innerHTML = toolbar +
        '<div class="gdi-admin-card"><table class="gdi-admin-table"><thead><tr>' +
        '<th>Email</th><th>Role</th><th>Status</th><th>Último acesso</th><th>Cursos</th><th>Progresso</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>' +
        '<div style="font-size:11px;color:#5f6678;margin-top:12px">ℹ️ A gestão de usuários é somente leitura nesta versão — usuários são definidos em <code>authConfig.users_list</code> e no registro dinâmico <code>.gdi_users.json</code>.</div>' +
        '</div>';
      bind();
    };
    var bind = function () {
      var inp = container.querySelector('#gdi-admin-user-search');
      if (inp) inp.addEventListener('input', function () { query = inp.value.trim(); paint(); });
      var rf = container.querySelector('#gdi-admin-user-refresh');
      if (rf) rf.addEventListener('click', load);
    };
    load();
  }

  // ═══════════════════════════════════════════════════════════════
  //  TAB: IA  (GET /api/ai/models + /api/ai/stats + /api/ai/status
  //             + /api/admin/cache-stats)
  // ═══════════════════════════════════════════════════════════════
  function renderAI(container) {
    var load = function () {
      renderLoading(container, 4);
      Promise.all([
        api('GET', '/api/ai/models'),
        api('GET', '/api/ai/stats'),
        api('GET', '/api/ai/status'),
        api('GET', '/api/admin/cache-stats')
      ]).then(function (r) {
        if (r[0].status === 401 || r[3].status === 401) { window.location.href = '/login'; return; }
        if (r[3].status === 403) { renderDenied(container); return; }
        if (r[0].kind === 'network' && r[3].kind === 'network') { renderNetworkError(container, load); return; }
        var models = (r[0].ok && r[0].data) ? (r[0].data.models || r[0].data.backends || r[0].data || []) : [];
        if (!Array.isArray(models)) models = [];
        var astats = (r[1].ok && r[1].data) ? r[1].data : {};
        var status = (r[2].ok && r[2].data) ? r[2].data : {};
        var cache = (r[3].ok && r[3].data && r[3].data.stats) ? r[3].data.stats : {};
        paint(models, astats, status, cache);
      });
    };
    var paint = function (models, astats, status, cache) {
      var up = status.up !== false && status.status !== 'down';
      var statusPill = up ? '<span class="gdi-admin-pill ok">● online</span>' : '<span class="gdi-admin-pill err">● offline</span>';

      var modelRows = models.length ? models.map(function (m) {
        var name = esc(m.name || m.model || m.id || '—');
        var ready = m.available !== false && m.error == null;
        var pill = ready ? '<span class="gdi-admin-pill ok">pronto</span>' : '<span class="gdi-admin-pill err">erro</span>';
        return '<tr><td>' + name + '</td><td>' + esc(m.provider || m.url || '—') + '</td>' +
          '<td>' + pill + '</td><td>' + esc(fmtNum(m.calls || m.requests || 0)) + '</td>' +
          '<td>' + esc(fmtNum(m.tokens || 0)) + '</td></tr>';
      }).join('') : '<tr><td colspan="5"><div class="gdi-admin-empty"><div class="ico">🤖</div><div class="msg">Nenhum modelo configurado</div></div></td></tr>';

      var kpis = [
        kpiCard('Estado do serviço', up ? 'Online' : 'Offline'),
        kpiCard('Chamadas (IA)', fmtNum(astats.calls24h || astats.calls || 0)),
        kpiCard('Tokens consumidos', fmtNum(astats.tokens || 0)),
        kpiCard('Cache hit rate', cache.hitRate || (astats.cacheHit != null ? (astats.cacheHit + '%') : '—'))
      ];

      container.innerHTML =
        '<div class="gdi-admin-grid gdi-admin-cards-4">' + kpis.join('') + '</div>' +
        '<div class="gdi-admin-card" style="margin-top:16px"><h3>🧩 Modelos disponíveis ' + statusPill + '</h3>' +
          '<table class="gdi-admin-table"><thead><tr><th>Modelo</th><th>Provider</th><th>Estado</th><th>Chamadas</th><th>Tokens</th></tr></thead>' +
          '<tbody>' + modelRows + '</tbody></table></div>' +
        '<div class="gdi-admin-grid gdi-admin-cards-2" style="margin-top:16px">' +
          '<div class="gdi-admin-card"><h3>🧹 Cache de IA <span class="sub">/api/admin/cache-stats</span></h3>' +
            '<div class="gdi-admin-row"><span>Entradas em cache</span><strong style="color:#fff">' + esc(cache.entries || 0) + '</strong></div>' +
            '<div class="gdi-admin-row"><span>Tamanho</span><strong style="color:#fff">' + esc(cache.size || '—') + '</strong></div>' +
            '<div class="gdi-admin-row"><span>Taxa de acerto</span><strong style="color:#5ddeda">' + esc(cache.hitRate || '—') + '</strong></div>' +
          '</div>' +
          '<div class="gdi-admin-card"><h3>⚙️ Ações</h3>' +
            '<div class="gdi-admin-row"><span>Atualizar métricas</span><button class="gdi-admin-btn" id="gdi-admin-ai-refresh">🔄 Atualizar</button></div>' +
            '<div class="gdi-admin-row"><span>Validar conectividade</span><button class="gdi-admin-btn primary" id="gdi-admin-ai-ping">📡 Testar conexão</button></div>' +
          '</div>' +
        '</div>';

      container.querySelector('#gdi-admin-ai-refresh').addEventListener('click', load);
      container.querySelector('#gdi-admin-ai-ping').addEventListener('click', function () {
        var b = this; b.disabled = true; b.textContent = 'Testando…';
        api('GET', '/api/ai/status').then(function (res) {
          b.disabled = false; b.textContent = '📡 Testar conexão';
          if (res.ok) alert('Conexão OK — serviço de IA respondeu.');
          else if (res.status === 401) window.location.href = '/login';
          else alert('Falha: ' + (res.error || res.status));
        });
      });
    };
    load();
  }

  // ═══════════════════════════════════════════════════════════════
  //  TAB: Player  (GET /api/admin/config + /api/admin/health)
  // ═══════════════════════════════════════════════════════════════
  function renderPlayer(container) {
    var load = function () {
      renderLoading(container, 4);
      Promise.all([
        api('GET', '/api/admin/config'),
        api('GET', '/api/admin/health')
      ]).then(function (r) {
        if (r[0].status === 401 || r[1].status === 401) { window.location.href = '/login'; return; }
        if (r[0].status === 403 || r[1].status === 403) { renderDenied(container); return; }
        if (r[0].kind === 'network' && r[1].kind === 'network') { renderNetworkError(container, load); return; }
        if (r[0].status >= 500 || r[1].status >= 500) { renderServerError(container, r[0].status >= 500 ? r[0] : r[1]); return; }
        var cfg = (r[0].ok && r[0].data && r[0].data.config) ? r[0].data.config : {};
        var health = (r[1].ok && r[1].data && r[1].data.health) ? r[1].data.health : {};
        S.cache.config = cfg;
        paint(cfg, health);
      });
    };
    var paint = function (cfg, health) {
      var playerType = cfg.player_type || 'plyr';
      var shaka = cfg.shaka_version || '—';
      var hp = health.ai || {};
      var driveOk = !!health.drive;

      container.innerHTML =
        '<div class="gdi-admin-grid gdi-admin-cards-3">' +
          kpiCard('Player ativo', playerType) +
          kpiCard('Shaka version', shaka) +
          kpiCard('Drive (mídia)', driveOk ? 'OK' : 'Indisponível') +
        '</div>' +
        '<div class="gdi-admin-card" style="margin-top:16px"><h3>🎬 Configuração do player</h3>' +
          '<div class="gdi-admin-row"><span>Tipo de player</span><strong style="color:#fff">' + esc(playerType) + '</strong></div>' +
          '<div class="gdi-admin-row"><span>Versão do Shaka Player</span><strong style="color:#fff">' + esc(shaka) + '</strong></div>' +
          '<div class="gdi-admin-row"><span>Ordem de leitura de materiais</span><strong style="color:#fff">' + esc((cfg.material_reading_order || []).join(' → ') || '—') + '</strong></div>' +
          '<div class="gdi-admin-row"><span>Battalion (correção de redação)</span>' + (cfg.battalion_enabled ? '<span class="gdi-admin-pill ok">habilitado</span>' : '<span class="gdi-admin-pill mute">desabilitado</span>') + '</div>' +
        '</div>' +
        '<div class="gdi-admin-card" style="margin-top:16px"><h3>📡 Backends de IA usados pelo player/tutor</h3>' +
          '<div style="display:flex;flex-wrap:wrap;gap:8px">' +
            '<span class="gdi-admin-pill ' + (hp.cf ? 'ok' : 'err') + '">CF Workers AI ' + (hp.cf ? '✓' : '✕') + '</span>' +
            '<span class="gdi-admin-pill ' + (hp.nvidia ? 'ok' : 'err') + '">NVIDIA ' + (hp.nvidia ? '✓' : '✕') + '</span>' +
            '<span class="gdi-admin-pill ' + (hp.openrouter ? 'ok' : 'err') + '">OpenRouter ' + (hp.openrouter ? '✓' : '✕') + '</span>' +
          '</div>' +
          '<div class="gdi-admin-row" style="margin-top:12px"><span>Ordem de modelos configurada</span><strong style="color:#fff">' + esc((cfg.ai_model_order || []).join(' → ') || '—') + '</strong></div>' +
        '</div>' +
        '<div style="font-size:11px;color:#5f6678;margin-top:14px">ℹ️ Estatísticas detalhadas de playback por usuário requerem um endpoint dedicado (a implementar). Esta aba mostra a configuração e saúde relevantes ao player.</div>';
    };
    load();
  }

  // ═══════════════════════════════════════════════════════════════
  //  TAB: Scanner  (GET /api/admin/config + /api/courses/scan-debug
  //                  + POST /api/admin/init-indice)
  // ═══════════════════════════════════════════════════════════════
  function renderScanner(container) {
    var load = function () {
      renderLoading(container, 4);
      Promise.all([
        api('GET', '/api/admin/config'),
        api('GET', '/api/courses/scan-debug')
      ]).then(function (r) {
        if (r[0].status === 401 || r[1].status === 401) { window.location.href = '/login'; return; }
        if (r[0].status === 403) { renderDenied(container); return; }
        if (r[0].kind === 'network' && r[1].kind === 'network') { renderNetworkError(container, load); return; }
        if (r[0].status >= 500 || r[1].status >= 500) { renderServerError(container, r[0].status >= 500 ? r[0] : r[1]); return; }
        var cfg = (r[0].ok && r[0].data && r[0].data.config) ? r[0].data.config : {};
        var dbg = (r[1].ok && r[1].data) ? r[1].data : {};
        S.cache.config = cfg;
        paint(cfg, dbg);
      });
    };
    var paint = function (cfg, dbg) {
      var maxSub = cfg.scanner_max_subreq || '—';
      var maxDepth = cfg.scanner_max_depth || '—';

      var courses = (dbg && dbg.courses) ? dbg.courses : [];
      var scanned = courses.filter(function (c) { return c.files != null && !c.error; }).length;
      var failed = courses.filter(function (c) { return !!c.error; }).length;
      var total = courses.length || 1;
      var pct = Math.round((scanned / total) * 100);

      var debugRows = courses.slice(0, 100).map(function (c) {
        var pill = c.error ? '<span class="gdi-admin-pill err">erro</span>'
                 : (c.files != null ? '<span class="gdi-admin-pill ok">' + (c.files || 0) + ' arq</span>'
                                   : '<span class="gdi-admin-pill mute">—</span>');
        return '<tr><td>' + esc(c.name || c.path || '—') + '</td><td>' + esc(c.drive || '—') + '</td>' +
          '<td>' + pill + '</td><td>' + esc(fmtAgo(c.scannedAt || c.at)) + '</td></tr>';
      }).join('');

      container.innerHTML =
        '<div class="gdi-admin-grid gdi-admin-cards-4">' +
          kpiCard('Cursos no índice', fmtNum(courses.length)) +
          kpiCard('Escaneados', fmtNum(scanned)) +
          kpiCard('Com erro', fmtNum(failed)) +
          kpiCard('Progresso', pct + '%') +
        '</div>' +
        '<div class="gdi-admin-card" style="margin-top:16px"><h3>📡 Progresso do scanner <span class="sub">/api/courses/scan-debug</span></h3>' +
          '<div class="gdi-admin-progress"><i style="width:' + pct + '%"></i></div>' +
          '<div style="display:flex;justify-content:space-between;font-size:12px;color:#7a8195;margin-top:8px">' +
            '<span>' + pct + '% concluído</span><span>' + esc(courses.length) + ' cursos indexados</span></div>' +
        '</div>' +
        '<div class="gdi-admin-grid gdi-admin-cards-2" style="margin-top:16px">' +
          '<div class="gdi-admin-card"><h3>⚙️ Limites do scanner</h3>' +
            '<div class="gdi-admin-row"><span>Máx. sub-requisições</span><strong style="color:#fff">' + esc(maxSub) + '</strong></div>' +
            '<div class="gdi-admin-row"><span>Profundidade máxima</span><strong style="color:#fff">' + esc(maxDepth) + '</strong></div>' +
          '</div>' +
          '<div class="gdi-admin-card"><h3>🛠️ Ações</h3>' +
            '<div class="gdi-admin-row"><span>Inicializar indice.json</span><button class="gdi-admin-btn primary" id="gdi-admin-scan-init">🆕 Criar indice</button></div>' +
            '<div class="gdi-admin-row"><span>Atualizar dados</span><button class="gdi-admin-btn" id="gdi-admin-scan-refresh">🔄 Atualizar</button></div>' +
          '</div>' +
        '</div>' +
        (debugRows ? '<div class="gdi-admin-card" style="margin-top:16px"><h3>🔍 Debug por curso</h3>' +
          '<table class="gdi-admin-table"><thead><tr><th>Curso</th><th>Drive</th><th>Estado</th><th>Scanned</th></tr></thead>' +
          '<tbody>' + debugRows + '</tbody></table></div>' : '');

      container.querySelector('#gdi-admin-scan-refresh').addEventListener('click', load);
      container.querySelector('#gdi-admin-scan-init').addEventListener('click', function () {
        var b = this;
        if (!confirm('Criar indice.json vazio na pasta .meggy.ai (em MEMORY_ROOT_FOLDER_ID)?\n\nSeguro se já existir — retorna "already exists".')) return;
        b.disabled = true; b.textContent = 'Criando…';
        api('POST', '/api/admin/init-indice').then(function (res) {
          b.disabled = false; b.textContent = '🆕 Criar indice';
          if (res.status === 401) { window.location.href = '/login'; return; }
          if (res.status === 403) { renderDenied(container); return; }
          if (res.ok) {
            var msg = (res.data && res.data.message) ? res.data.message : 'OK';
            alert('✓ ' + msg + (res.data && res.data.id ? ('\nid: ' + res.data.id) : ''));
          } else if (res.status === 404) {
            alert('Endpoint /api/admin/init-indice não implementado no worker.');
          } else {
            alert('Erro: ' + (res.error || res.status));
          }
        });
      });
    };
    load();
  }

  // ═══════════════════════════════════════════════════════════════
  //  TAB: Drives  (GET /api/admin/config → config.drives)
  // ═══════════════════════════════════════════════════════════════
  function renderDrives(container) {
    var load = function () {
      renderLoading(container, 4);
      api('GET', '/api/admin/config').then(function (res) {
        if (handleApiError(res, container, load)) return;
        var cfg = (res.ok && res.data && res.data.config) ? res.data.config : {};
        var drives = cfg.drives || [];
        if (!Array.isArray(drives)) drives = [];
        S.cache.config = cfg;
        paint(drives);
      });
    };
    var paint = function (drives) {
      if (!drives.length) {
        container.innerHTML = '';
        renderEmpty(container, '💾', 'Nenhum drive configurado',
          'authConfig.roots está vazio. Configure raízes de Google Drive nas variáveis de ambiente do worker.');
        var b = el('button', { class: 'gdi-admin-btn', style: 'margin-top:16px' }, '🔄 Atualizar');
        b.addEventListener('click', load);
        container.appendChild(b);
        return;
      }
      var rows = drives.map(function (d, i) {
        var name = esc(d.name || ('Drive ' + i));
        var id = esc(d.id || '—');
        return '<tr><td>' + name + '</td><td><code style="color:#5ddeda">' + id + '</code></td>' +
          '<td><span class="gdi-admin-pill ok">configurado</span></td></tr>';
      }).join('');

      container.innerHTML =
        '<div class="gdi-admin-card"><h3>💾 Drives conectados <span class="sub">authConfig.roots</span></h3>' +
        '<table class="gdi-admin-table"><thead><tr><th>Nome</th><th>ID</th><th>Estado</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>' +
        '<div style="font-size:11px;color:#5f6678;margin-top:12px">ℹ️ Os drives são definidos nas variáveis de ambiente do Cloudflare Worker (<code>GDI_ROOTS</code> / <code>drive_list</code>). A saúde em tempo real do Drive aparece na aba Dashboard (Health).</div>' +
        '<button class="gdi-admin-btn" id="gdi-admin-drives-refresh" style="margin-top:16px">🔄 Atualizar</button>';
      container.querySelector('#gdi-admin-drives-refresh').addEventListener('click', load);
    };
    load();
  }

  // ═══════════════════════════════════════════════════════════════
  //  TAB: Memória  (GET /api/admin/config + POST /api/admin/migrate-memory
  //                  + POST /api/admin/init-indice)
  // ═══════════════════════════════════════════════════════════════
  function renderMemory(container) {
    var load = function () {
      renderLoading(container, 4);
      api('GET', '/api/admin/config').then(function (res) {
        if (handleApiError(res, container, load)) return;
        var cfg = (res.ok && res.data && res.data.config) ? res.data.config : {};
        S.cache.config = cfg;
        paint(cfg);
      });
    };
    var paint = function (cfg) {
      var memRoot = cfg.memory_root_folder_id || '—';

      container.innerHTML =
        '<div class="gdi-admin-card"><h3>🧠 Migração de Memória <span class="sub">/api/admin/migrate-memory</span></h3>' +
          '<p style="color:#9aa1b5;font-size:13px;line-height:1.6;margin:0 0 14px">' +
            'Copia todos os dados do local antigo (<code>AULAS - ESTADO DOS ALUNOS</code> + ' +
            '<code>.meggy.ai</code> na raiz do drive 0) para o novo local consolidado ' +
            '(<code>.meggy.ai</code> em <code>MEMORY_ROOT_FOLDER_ID</code>). ' +
            'Operação idempotente — segura para executar múltiplas vezes.</p>' +
          '<div class="gdi-admin-row"><span>MEMORY_ROOT_FOLDER_ID</span><code style="color:#5ddeda">' + esc(memRoot) + '</code></div>' +
          '<div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">' +
            '<button class="gdi-admin-btn primary" id="gdi-admin-mem-migrate">🚀 Executar migração</button>' +
            '<button class="gdi-admin-btn" id="gdi-admin-mem-init">🆕 Criar indice.json</button>' +
            '<button class="gdi-admin-btn" id="gdi-admin-mem-refresh">🔄 Atualizar</button>' +
          '</div>' +
          '<div id="gdi-admin-mem-result"></div>' +
        '</div>';

      container.querySelector('#gdi-admin-mem-refresh').addEventListener('click', load);
      container.querySelector('#gdi-admin-mem-init').addEventListener('click', function () {
        var b = this;
        if (!confirm('Criar indice.json vazio em .meggy.ai (MEMORY_ROOT)?')) return;
        b.disabled = true; b.textContent = 'Criando…';
        api('POST', '/api/admin/init-indice').then(function (res) {
          b.disabled = false; b.textContent = '🆕 Criar indice.json';
          if (res.status === 401) { window.location.href = '/login'; return; }
          if (res.ok) alert('✓ ' + ((res.data && res.data.message) || 'OK'));
          else alert('Erro: ' + (res.error || res.status));
        });
      });
      container.querySelector('#gdi-admin-mem-migrate').addEventListener('click', function () {
        var b = this;
        if (!confirm('Iniciar migração de memória agora?\n\nIsso copia todos os arquivos de dados para o novo local. Pode levar alguns minutos.')) return;
        b.disabled = true; b.textContent = 'Migrando…';
        var result = container.querySelector('#gdi-admin-mem-result');
        result.innerHTML = '<div class="gdi-admin-skel"></div>';
        api('POST', '/api/admin/migrate-memory').then(function (res) {
          b.disabled = false; b.textContent = '🚀 Executar migração';
          if (res.status === 401) { window.location.href = '/login'; return; }
          if (res.status === 403) { renderDenied(container); return; }
          if (res.kind === 'network') { renderNetworkError(container, load); return; }
          if (!res.ok) {
            result.innerHTML = '<div class="gdi-admin-errbox" style="margin-top:16px"><div class="ico">⚠️</div>' +
              '<div class="ttl">Erro na migração (' + esc(res.status) + ')</div>' +
              '<div class="dsc">' + esc(res.error || 'Falha desconhecida') + '</div></div>';
            return;
          }
          var data = res.data || {};
          var files = data.files || [];
          var errors = data.errors || [];
          var summary = data.summary || {};
          var html = '<h3 style="margin:16px 0 10px">📋 Resultado da migração</h3>' +
            '<div class="gdi-admin-row"><span>Arquivos copiados</span><strong style="color:#5ddeda">' + esc(files.length) + '</strong></div>' +
            '<div class="gdi-admin-row"><span>Erros</span><strong style="color:' + (errors.length ? '#fca5a5' : '#4ade80') + '">' + esc(errors.length) + '</strong></div>';
          if (Object.keys(summary).length) {
            html += '<pre class="gdi-admin-log" style="margin-top:12px">' + esc(JSON.stringify(summary, null, 2)) + '</pre>';
          }
          if (errors.length) {
            html += '<pre class="gdi-admin-log" style="margin-top:12px;border-color:rgba(220,38,38,.3)">' + esc(errors.slice(0, 20).join('\n')) + '</pre>';
          }
          result.innerHTML = html;
        });
      });
    };
    load();
  }

  // ═══════════════════════════════════════════════════════════════
  //  TAB: Logs  (GET /api/admin/logs)
  // ═══════════════════════════════════════════════════════════════
  function renderLogs(container) {
    var level = 'all';
    var all = [];
    var load = function () {
      renderLoading(container, 4);
      api('GET', '/api/admin/logs').then(function (res) {
        if (handleApiError(res, container, load)) return;
        all = (res.ok && res.data && res.data.logs) ? res.data.logs : [];
        if (!Array.isArray(all)) all = [];
        paint();
      });
    };
    var paint = function () {
      var q = level;
      var list = all.filter(function (l) {
        if (q === 'all') return true;
        if (q === 'error') return /error|err|fail|exception/i.test(l.error || l.endpoint || '');
        if (q === 'warn') return /warn|caution/i.test(l.error || l.endpoint || '');
        return true;
      });

      var toolbar = '<div class="gdi-admin-toolbar">' +
        '<select class="gdi-admin-select" id="gdi-admin-log-level">' +
          '<option value="all"' + (level === 'all' ? ' selected' : '') + '>Todos os níveis</option>' +
          '<option value="error"' + (level === 'error' ? ' selected' : '') + '>Erros</option>' +
          '<option value="warn"' + (level === 'warn' ? ' selected' : '') + '>Avisos</option>' +
        '</select>' +
        '<button class="gdi-admin-btn" id="gdi-admin-log-refresh">🔄 Atualizar</button>' +
        '<span style="flex:1"></span><span style="font-size:12px;color:#7a8195">' + esc(list.length) + ' de ' + esc(all.length) + ' registros</span>' +
        '</div>';

      if (!all.length) {
        container.innerHTML = toolbar;
        renderEmpty(container, '📜', 'Nenhum log registrado',
          'Não há entradas em /api/admin/logs (chaves KV admin:error:*). Erros capturados pelo worker aparecem aqui.');
        bind();
        return;
      }

      var body = list.slice(0, 500).map(function (l) {
        var ts = l.timestamp ? new Date(l.timestamp).toISOString() : '—';
        var msg = l.error || '(sem mensagem)';
        var ep = l.endpoint || '';
        var user = l.user || '';
        var cls = /error|err|fail|exception/i.test(msg + ep) ? 'lv-err' : 'lv-warn';
        return '<div class="' + cls + '">[' + esc(ts) + '] ' + esc(msg) + (ep ? '  {' + esc(ep) + '}' : '') + (user ? '  user=' + esc(user) : '') + '</div>';
      }).join('');

      container.innerHTML = toolbar +
        '<div class="gdi-admin-card"><div class="gdi-admin-log">' + (body || '<span class="lv-dim">— sem registros —</span>') + '</div></div>';
      var logEl = container.querySelector('.gdi-admin-log');
      if (logEl) logEl.scrollTop = 0;
      bind();
    };
    var bind = function () {
      var sel = container.querySelector('#gdi-admin-log-level');
      if (sel) sel.addEventListener('change', function () { level = sel.value; paint(); });
      var rf = container.querySelector('#gdi-admin-log-refresh');
      if (rf) rf.addEventListener('click', load);
    };
    load();
  }

  // ═══════════════════════════════════════════════════════════════
  //  Open / Close / Init
  // ═══════════════════════════════════════════════════════════════
  function open(tab) {
    if (!S.root) buildShell();
    S.overlay.classList.add('show');
    S.root.classList.add('show');
    S.open = true;
    document.body.style.overflow = 'hidden';
    goto(tab || S.tab || 'dashboard', true);
  }

  function close() {
    if (!S.root) return;
    S.overlay.classList.remove('show');
    S.root.classList.remove('show');
    S.open = false;
    document.body.style.overflow = '';
  }

  function init(tab) {
    injectCSS();
    if (!S.root) buildShell();
    window.__gdiAdmin.open = open;
    window.__gdiAdmin.close = close;
    window.__gdiAdmin.goto = goto;
    window.__gdiAdmin.init = init;
    if (tab) open(tab);
  }

  // Auto-init CSS immediately so the panel is ready to open on demand.
  // Shell is built lazily on first open() to avoid polluting the DOM.
  injectCSS();
  window.__gdiAdmin.open = open;
  window.__gdiAdmin.close = close;
  window.__gdiAdmin.goto = goto;
  window.__gdiAdmin.init = init;

  // Keyboard shortcuts: Ctrl+Shift+A toggles panel; Esc closes.
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
      e.preventDefault();
      if (S.open) close(); else open();
    }
    if (e.key === 'Escape' && S.open) close();
  });

})();
