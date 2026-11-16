/* ═══════════════════════════════════════════════════════════════════════
 * admin-drives.js — Secção "Drives" do /admin (Ronda 13, Frente B)
 *
 * Módulo autónomo (sem dependências): ao ser carregado na página /admin,
 * cria o seu próprio botão na barra lateral ("📁 Drives") e o painel
 * correspondente, e gere o CRUD completo dos drives via os endpoints da
 * Frente A (R13A):
 *   GET  /api/me                            → {ok, user, isAdmin}
 *   GET  /api/admin-drives                  → {ok, drives:[...]}
 *   POST /api/admin/admin-drives/add        → {ok, id}
 *   POST /api/admin/admin-drives/update     → {ok, id}
 *   POST /api/admin/admin-drives/delete     → {ok, deleted}
 *
 * A secção SÓ aparece quando GET /api/me diz isAdmin:true (o /admin já
 * devolve 403 HTML a não-admins no servidor; isto é defesa em profundidade).
 * Remover um drive apaga SÓ o registo D1 — nunca a pasta no Drive nem as
 * aulas (o servidor garante-o; o texto de confirmação diz o mesmo).
 *
 * Ligação ao /admin (patch-R13B.py, 2 edições mínimas no worker.js):
 *   1. 'admin-drives.js' na whitelist ALLOWED da rota /modular/
 *   2. <script src="/modular/admin-drives.js?v=1" defer></script> no HTML
 *      do handleAdminV23, a seguir ao <script> inline do admV23Client.
 * Sem essas 2 linhas o ficheiro existe no CDN mas o /admin não o carrega.
 *
 * Contrato de campos (EXACTO, ver front-R13A-server/NOTES.md §2.2):
 *   {id, driveId, name, targetApps:[meggy|bibi|vovo], coverUrl|null,
 *    subCoverUrl|null, subfolderCovers:{caminho:url}, source, rootIndex}
 * O servidor devolve camelCase; normalizeDrive() aceita snake_case também.
 *
 * Versão do ficheiro: v1 (bump do ?v= no script tag a cada edição).
 * ═══════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var VERSION = 1;
  var APPS = ['meggy', 'bibi', 'vovo'];
  var APP_LABEL = { meggy: 'Meggy', bibi: 'BiBi', vovo: 'Vovó' };
  var APP_BADGE = { meggy: 'cyan', bibi: 'pink', vovo: 'green' };
  var DRIVE_ID_RE = /^[A-Za-z0-9_-]+$/;

  /* ── helpers puros (testáveis em node) ─────────────────────────────── */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function isHttpUrl(u) {
    if (typeof u !== 'string') return false;
    if (u.length === 0 || u.length > 2000) return false;
    return u.indexOf('http://') === 0 || u.indexOf('https://') === 0;
  }

  function driveIdValid(id) {
    return typeof id === 'string' && DRIVE_ID_RE.test(id);
  }

  // Normaliza um drive do servidor (camelCase ou snake_case) p/ a forma
  // canónica usada por todo o módulo. Valores em falta → null/[]/{}.
  function normalizeDrive(d) {
    d = d || {};
    var apps = d.targetApps != null ? d.targetApps : d.target_apps;
    if (!Array.isArray(apps)) apps = [];
    var seen = {};
    apps = apps.filter(function (a) {
      if (APPS.indexOf(a) < 0 || seen[a]) return false;
      seen[a] = true;
      return true;
    });
    var covers = d.subfolderCovers != null ? d.subfolderCovers : d.subfolder_covers;
    if (!covers || typeof covers !== 'object' || Array.isArray(covers)) covers = {};
    var out = {};
    Object.keys(covers).forEach(function (k) {
      if (typeof covers[k] === 'string') out[k] = covers[k];
    });
    var rootIndex = d.rootIndex != null ? d.rootIndex : d.root_index;
    return {
      id: d.id != null ? d.id : null,
      driveId: d.driveId != null ? d.driveId : (d.drive_id || ''),
      name: d.name != null ? d.name : '',
      targetApps: apps,
      coverUrl: d.coverUrl != null ? d.coverUrl : (d.cover_url != null ? d.cover_url : null),
      subCoverUrl: d.subCoverUrl != null ? d.subCoverUrl : (d.sub_cover_url != null ? d.sub_cover_url : null),
      subfolderCovers: out,
      source: d.source || 'admin',
      rootIndex: rootIndex != null ? rootIndex : null
    };
  }

  // Ordem do servidor (e do contrato): rootIndex 0–15 primeiro, depois os
  // criados pelo admin (rootIndex null) por id.
  function sortDrives(list) {
    return (list || []).slice().sort(function (a, b) {
      var ra = a.rootIndex, rb = b.rootIndex;
      if (ra == null && rb == null) return (a.id || 0) - (b.id || 0);
      if (ra == null) return 1;
      if (rb == null) return -1;
      return ra - rb;
    });
  }

  // Validação do lado do cliente — espelha a do servidor (R13A §2.2).
  // Devolve a lista de erros em pt-BR (vazia = válido).
  function validateDriveInput(inp) {
    var errs = [];
    inp = inp || {};
    if (!inp.driveId || !String(inp.driveId).trim()) {
      errs.push('O ID da pasta é obrigatório.');
    } else if (!driveIdValid(String(inp.driveId).trim())) {
      errs.push('O ID da pasta só pode ter letras, números, _ e - (sem espaços nem /).');
    }
    if (!inp.name || !String(inp.name).trim()) {
      errs.push('O nome do drive é obrigatório.');
    }
    var apps = Array.isArray(inp.targetApps) ? inp.targetApps : [];
    if (!apps.length) {
      errs.push('Escolha pelo menos um app (Meggy, BiBi ou Vovó).');
    } else if (apps.some(function (a) { return APPS.indexOf(a) < 0; })) {
      errs.push('App inválido — só Meggy, BiBi ou Vovó.');
    }
    if (inp.coverUrl) {
      if (!isHttpUrl(inp.coverUrl)) errs.push('A capa tem de ser um URL http(s) válido (máx. 2000 caracteres).');
    }
    if (inp.subCoverUrl) {
      if (!isHttpUrl(inp.subCoverUrl)) errs.push('A sub-capa tem de ser um URL http(s) válido (máx. 2000 caracteres).');
    }
    var covers = inp.subfolderCovers || {};
    Object.keys(covers).forEach(function (p) {
      if (p.length > 500) errs.push('O caminho "' + p.slice(0, 60) + '" tem mais de 500 caracteres.');
      if (!isHttpUrl(covers[p])) errs.push('A capa da sub-pasta "' + p + '" tem de ser um URL http(s) válido.');
    });
    return errs;
  }

  // "caminho → url" (uma por linha; também se aceita "->"). Devolve
  // {map, errors} — linhas vazias ignoradas; linhas sem separador ou com
  // URL inválida geram erro em pt-BR (não são silenciosamente descartadas).
  function parseSubfolderCovers(text) {
    var map = {}, errors = [];
    (String(text || '').split('\n')).forEach(function (raw, i) {
      var line = raw.trim();
      if (!line) return;
      var sep = line.indexOf('→') >= 0 ? '→' : (line.indexOf('->') >= 0 ? '->' : null);
      if (!sep) {
        errors.push('Linha ' + (i + 1) + ': falta o separador "→" entre o caminho e o URL.');
        return;
      }
      var parts = line.split(sep);
      var path = (parts[0] || '').trim();
      var url = parts.slice(1).join(sep).trim();
      if (!path) { errors.push('Linha ' + (i + 1) + ': o caminho está vazio.'); return; }
      if (path.length > 500) { errors.push('Linha ' + (i + 1) + ': o caminho tem mais de 500 caracteres.'); return; }
      if (!isHttpUrl(url)) { errors.push('Linha ' + (i + 1) + ': o URL "' + url.slice(0, 60) + '" não é http(s).'); return; }
      map[path] = url;
    });
    return { map: map, errors: errors };
  }

  function serializeSubfolderCovers(map) {
    return Object.keys(map || {}).sort().map(function (k) {
      return k + ' → ' + map[k];
    }).join('\n');
  }

  // Erros do servidor em pt-BR legível. O servidor já devolve mensagens
  // em pt-BR (ex.: "driveId obrigatório"); passam tal qual quando existem.
  function translateError(status, serverMsg) {
    if (status === 401) return 'Sessão expirada — faça login novamente e tente de novo.';
    if (status === 403) return 'Só o administrador pode gerir drives.';
    if (serverMsg) return serverMsg;
    if (status === 404) return 'Drive não encontrado — a lista pode estar desatualizada. Atualize a página.';
    if (status) return 'O servidor devolveu o erro HTTP ' + status + '. Tente de novo.';
    return 'Falha de rede — verifique a ligação e tente de novo.';
  }

  function appBadges(apps) {
    if (!apps || !apps.length) return '<span class="muted sm">—</span>';
    return apps.map(function (a) {
      return '<span class="badge ' + (APP_BADGE[a] || 'grey') + '">' + esc(APP_LABEL[a] || a) + '</span>';
    }).join(' ');
  }

  function renderDriveRow(d) {
    var src = d.source === 'hardcoded'
      ? '<span class="badge cyan">dos APKs</span>' + (d.rootIndex != null ? ' <span class="muted sm">#' + d.rootIndex + '</span>' : '')
      : '<span class="badge pink">admin</span>';
    var cover = d.coverUrl
      ? '<img src="' + esc(d.coverUrl) + '" alt="" style="width:64px;height:36px;object-fit:cover;border-radius:6px;border:1px solid var(--border2)" onerror="this.style.display=\'none\'">'
      : '<span class="muted sm">—</span>';
    return '<tr>' +
      '<td><b>' + esc(d.name || '—') + '</b><br>' + src + '</td>' +
      '<td class="mono sm" title="' + esc(d.driveId) + '">' + esc(d.driveId) + '</td>' +
      '<td>' + appBadges(d.targetApps) + '</td>' +
      '<td>' + cover + '</td>' +
      '<td><button class="adm-btn sm" data-dv-edit="' + esc(d.id) + '">✏️ Editar</button> ' +
      '<button class="adm-btn sm danger" data-dv-del="' + esc(d.id) + '">Remover</button></td>' +
      '</tr>';
  }

  function renderDrivesTable(drives) {
    if (!drives || !drives.length) {
      return '<div class="adm-empty">Nenhum drive gerido. Adicione o primeiro acima — os 16 drives dos APKs aparecem aqui quando o D1 tem dados.</div>';
    }
    return '<table><tr><th>Drive</th><th>ID da pasta</th><th>Apps</th><th>Capa</th><th></th></tr>' +
      drives.map(renderDriveRow).join('') + '</table>';
  }

  function paneSkeleton() {
    return '' +
      '<h2>📁 Drives</h2>' +
      '<p class="lede">Drives geridos pelo admin — os 16 drives dos APKs e os adicionados aqui. ' +
      'Renomear um drive, mudar os seus apps ou as capas muda onde ele aparece nos apps. ' +
      '<b>Remover apaga SÓ o registo</b> — nunca a pasta no Drive nem as aulas.</p>' +
      '<div class="adm-form">' +
      '<div class="row">' +
      '<div><label>ID da pasta no Drive *</label><input id="dv-drive-id" placeholder="Ex.: 1ffwT89NwQ6DgZjPmK5LEucm9G7-PL73a" maxlength="200"></div>' +
      '<div><label>Nome do drive *</label><input id="dv-name" placeholder="Ex.: CLUBE FIT" maxlength="200"></div>' +
      '</div>' +
      '<div class="row" style="margin-top:12px"><div><label>Apps onde aparece *</label>' +
      '<label style="display:inline-block;margin-right:14px"><input type="checkbox" id="dv-app-meggy" checked> Meggy</label>' +
      '<label style="display:inline-block;margin-right:14px"><input type="checkbox" id="dv-app-bidi"> BiBi</label>' +
      '<label style="display:inline-block"><input type="checkbox" id="dv-app-vovo"> Vovó</label>' +
      '</div></div>' +
      '<div class="row" style="margin-top:12px">' +
      '<div><label>Capa (URL da imagem)</label><input id="dv-cover" placeholder="https://…" maxlength="2000">' +
      '<label id="dv-clear-cover-wrap" style="display:none;margin-top:6px"><input type="checkbox" id="dv-clear-cover"> Remover a capa ao guardar</label></div>' +
      '<div><label>Sub-capa genérica (URL da imagem)</label><input id="dv-subcover" placeholder="https://…" maxlength="2000">' +
      '<label id="dv-clear-subcover-wrap" style="display:none;margin-top:6px"><input type="checkbox" id="dv-clear-subcover"> Remover a sub-capa ao guardar</label></div>' +
      '</div>' +
      '<div style="margin-top:12px"><label>Capas por sub-pasta (uma por linha: caminho → URL)</label>' +
      '<textarea id="dv-subcovers" rows="3" placeholder="Aula 01 → https://exemplo.com/a.jpg"></textarea></div>' +
      '<div class="actions"><button class="adm-btn primary" id="dv-save">+ Adicionar drive</button>' +
      '<button class="adm-btn" id="dv-cancel-edit" style="display:none">Cancelar edição</button>' +
      '<span class="muted sm" id="dv-form-hint">O ID é o da pasta no Google Drive (só letras, números, _ e -).</span></div>' +
      '</div>' +
      '<div class="adm-toolbar"><span class="adm-count" id="dv-count"></span>' +
      '<button class="adm-btn sm" id="dv-refresh">↻ Atualizar lista</button></div>' +
      '<div id="dv-list"><div class="adm-empty">A carregar drives…</div></div>';
  }

  /* ── parte do navegador ───────────────────────────────────────────── */

  function boot(doc, fetchFn) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    fetchFn = fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
    if (!doc || !fetchFn) return null;
    if (global.__ADM_DRIVES_BOOTED__) return global.__ADM_DRIVES_BOOTED__;
    var api = createApi(fetchFn);
    var state = { drives: [], editingId: null, isAdmin: false };
    var ctl = { doc: doc, api: api, state: state };
    global.__ADM_DRIVES_BOOTED__ = ctl;

    function $(s) { return doc.querySelector(s); }
    function $all(s) { return Array.prototype.slice.call(doc.querySelectorAll(s)); }

    function toast(msg, isErr) {
      var t = $('#adm-toast');
      if (!t) return;
      t.textContent = msg;
      if (t.classList) t.classList.toggle('err', !!isErr);
      t.style.display = 'block';
      clearTimeout(t._tm);
      t._tm = setTimeout(function () { t.style.display = 'none'; }, 4500);
    }

    // Confirmação inline (modal) — mesmo padrão do admV23Client, com ids
    // próprios para não colidir com o modal dele.
    function admConfirm(msg) {
      return new Promise(function (res) {
        var ov = doc.getElementById('adm-drives-confirm-ov');
        if (!ov) {
          ov = doc.createElement('div');
          ov.id = 'adm-drives-confirm-ov';
          ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
          var box = doc.createElement('div');
          box.style.cssText = 'background:#1a2233;color:#e8ecf3;border:1px solid #33415e;border-radius:12px;padding:20px;max-width:440px;width:90%;white-space:pre-line;line-height:1.5';
          var m = doc.createElement('div');
          m.id = 'adm-drives-confirm-msg';
          m.style.marginBottom = '16px';
          var row = doc.createElement('div');
          row.style.cssText = 'display:flex;gap:10px;justify-content:flex-end';
          var no = doc.createElement('button');
          no.id = 'adm-drives-confirm-no';
          no.className = 'adm-btn';
          no.textContent = 'Cancelar';
          var yes = doc.createElement('button');
          yes.id = 'adm-drives-confirm-yes';
          yes.className = 'adm-btn danger';
          yes.textContent = 'Confirmar';
          row.appendChild(no); row.appendChild(yes);
          box.appendChild(m); box.appendChild(row);
          ov.appendChild(box);
          doc.body.appendChild(ov);
        }
        var msgEl = doc.getElementById('adm-drives-confirm-msg');
        if (msgEl) msgEl.textContent = msg;
        ov.style.display = 'flex';
        var done = function (v) {
          ov.style.display = 'none';
          doc.getElementById('adm-drives-confirm-yes').onclick = null;
          doc.getElementById('adm-drives-confirm-no').onclick = null;
          res(v);
        };
        doc.getElementById('adm-drives-confirm-yes').onclick = function () { done(true); };
        doc.getElementById('adm-drives-confirm-no').onclick = function () { done(false); };
        ov.onclick = function (e) { if (e.target === ov) done(false); };
      });
    }
    ctl._confirm = admConfirm;
    ctl._toast = toast;

    function ensureTab() {
      var nav = doc.querySelector('.adm-side');
      var main = doc.querySelector('.adm-main');
      if (!nav || !main) return false;
      if (!doc.querySelector('[data-tab="drives"]')) {
        var btn = doc.createElement('button');
        btn.className = 'adm-tab-btn';
        btn.setAttribute('data-tab', 'drives');
        btn.innerHTML = '<span class="ic">📁</span><span class="tx">Drives</span>';
        var appsBtn = doc.querySelector('[data-tab="apps"]');
        if (appsBtn && appsBtn.parentNode) appsBtn.parentNode.insertBefore(btn, appsBtn.nextSibling);
        else if (nav.querySelector('.foot')) nav.insertBefore(btn, nav.querySelector('.foot'));
        else nav.appendChild(btn);
        btn.onclick = function () { showDrivesTab(); };
      }
      if (!doc.querySelector('#pane-drives')) {
        var pane = doc.createElement('section');
        pane.className = 'adm-tab-pane';
        pane.id = 'pane-drives';
        pane.innerHTML = paneSkeleton();
        main.appendChild(pane);
      }
      wireForm();
      return true;
    }

    function showDrivesTab() {
      $all('.adm-tab-btn').forEach(function (b) {
        if (b.classList) b.classList.toggle('active', b.getAttribute('data-tab') === 'drives');
      });
      $all('.adm-tab-pane').forEach(function (p) {
        if (p.classList) p.classList.toggle('active', p.id === 'pane-drives');
      });
      loadDrives();
    }
    ctl.showDrivesTab = showDrivesTab;

    function readForm() {
      var apps = [];
      if ($('#dv-app-meggy') && $('#dv-app-meggy').checked) apps.push('meggy');
      if ($('#dv-app-bidi') && $('#dv-app-bidi').checked) apps.push('bibi');
      if ($('#dv-app-vovo') && $('#dv-app-vovo').checked) apps.push('vovo');
      var covers = parseSubfolderCovers($('#dv-subcovers') ? $('#dv-subcovers').value : '');
      return {
        driveId: $('#dv-drive-id') ? $('#dv-drive-id').value.trim() : '',
        name: $('#dv-name') ? $('#dv-name').value.trim() : '',
        targetApps: apps,
        coverUrl: $('#dv-cover') ? $('#dv-cover').value.trim() : '',
        subCoverUrl: $('#dv-subcover') ? $('#dv-subcover').value.trim() : '',
        subfolderCovers: covers.map,
        subfolderErrors: covers.errors,
        clearCover: !!($('#dv-clear-cover') && $('#dv-clear-cover').checked),
        clearSubCover: !!($('#dv-clear-subcover') && $('#dv-clear-subcover').checked)
      };
    }
    ctl.readForm = readForm;

    function resetForm() {
      state.editingId = null;
      if ($('#dv-drive-id')) { $('#dv-drive-id').value = ''; $('#dv-drive-id').disabled = false; }
      if ($('#dv-name')) $('#dv-name').value = '';
      if ($('#dv-app-meggy')) $('#dv-app-meggy').checked = true;
      if ($('#dv-app-bidi')) $('#dv-app-bidi').checked = false;
      if ($('#dv-app-vovo')) $('#dv-app-vovo').checked = false;
      if ($('#dv-cover')) $('#dv-cover').value = '';
      if ($('#dv-subcover')) $('#dv-subcover').value = '';
      if ($('#dv-subcovers')) $('#dv-subcovers').value = '';
      if ($('#dv-clear-cover')) $('#dv-clear-cover').checked = false;
      if ($('#dv-clear-subcover')) $('#dv-clear-subcover').checked = false;
      if ($('#dv-clear-cover-wrap')) $('#dv-clear-cover-wrap').style.display = 'none';
      if ($('#dv-clear-subcover-wrap')) $('#dv-clear-subcover-wrap').style.display = 'none';
      if ($('#dv-save')) $('#dv-save').textContent = '+ Adicionar drive';
      if ($('#dv-cancel-edit')) $('#dv-cancel-edit').style.display = 'none';
      if ($('#dv-form-hint')) $('#dv-form-hint').textContent = 'O ID é o da pasta no Google Drive (só letras, números, _ e -).';
    }
    ctl.resetForm = resetForm;

    function startEdit(d) {
      state.editingId = d.id;
      if ($('#dv-drive-id')) { $('#dv-drive-id').value = d.driveId; $('#dv-drive-id').disabled = true; }
      if ($('#dv-name')) $('#dv-name').value = d.name;
      if ($('#dv-app-meggy')) $('#dv-app-meggy').checked = d.targetApps.indexOf('meggy') >= 0;
      if ($('#dv-app-bidi')) $('#dv-app-bidi').checked = d.targetApps.indexOf('bibi') >= 0;
      if ($('#dv-app-vovo')) $('#dv-app-vovo').checked = d.targetApps.indexOf('vovo') >= 0;
      if ($('#dv-cover')) $('#dv-cover').value = d.coverUrl || '';
      if ($('#dv-subcover')) $('#dv-subcover').value = d.subCoverUrl || '';
      if ($('#dv-subcovers')) $('#dv-subcovers').value = serializeSubfolderCovers(d.subfolderCovers);
      if ($('#dv-clear-cover-wrap')) $('#dv-clear-cover-wrap').style.display = '';
      if ($('#dv-clear-subcover-wrap')) $('#dv-clear-subcover-wrap').style.display = '';
      if ($('#dv-save')) $('#dv-save').textContent = 'Guardar alterações';
      if ($('#dv-cancel-edit')) $('#dv-cancel-edit').style.display = '';
      if ($('#dv-form-hint')) $('#dv-form-hint').textContent = 'A editar "' + d.name + '" — o ID da pasta não muda. Deixe a capa em branco para a manter; marque "Remover" para a limpar.';
      var pane = $('#pane-drives');
      if (pane && pane.scrollIntoView) pane.scrollIntoView();
      var nameEl = $('#dv-name');
      if (nameEl && nameEl.focus) nameEl.focus();
    }
    ctl.startEdit = startEdit;

    function renderList() {
      var box = $('#dv-list');
      if (!box) return;
      box.innerHTML = renderDrivesTable(state.drives);
      var count = $('#dv-count');
      if (count) {
        var nHard = state.drives.filter(function (d) { return d.source === 'hardcoded'; }).length;
        var nAdm = state.drives.length - nHard;
        count.textContent = state.drives.length + ' drive(s) — ' + nHard + ' dos APKs · ' + nAdm + ' do admin';
      }
      box.querySelectorAll('[data-dv-edit]').forEach(function (b) {
        b.onclick = function () {
          var d = state.drives.filter(function (x) { return String(x.id) === String(b.getAttribute('data-dv-edit')); })[0];
          if (d) startEdit(d);
        };
      });
      box.querySelectorAll('[data-dv-del]').forEach(function (b) {
        b.onclick = function () { removeDrive(b.getAttribute('data-dv-del')); };
      });
    }
    ctl.renderList = renderList;

    function loadDrives() {
      var box = $('#dv-list');
      if (box) box.innerHTML = '<div class="adm-empty">A carregar drives…</div>';
      return api('/api/admin-drives').then(function (j) {
        state.drives = sortDrives(((j && j.drives) || []).map(normalizeDrive));
        renderList();
      }).catch(function (e) {
        if (box) box.innerHTML = '<div class="adm-empty">Falha ao carregar drives: ' + esc(translateError(e.status, e.message)) + '</div>';
        toast('Falha ao carregar drives: ' + translateError(e.status, e.message), true);
      });
    }
    ctl.loadDrives = loadDrives;

    function saveDrive() {
      var f = readForm();
      var errs = validateDriveInput(f).concat(f.subfolderErrors || []);
      if (errs.length) { toast(errs[0], true); return Promise.resolve(false); }
      var body = { name: f.name, targetApps: f.targetApps, subfolderCovers: f.subfolderCovers };
      if (state.editingId == null) {
        body.driveId = f.driveId;
        if (f.coverUrl) body.coverUrl = f.coverUrl;
        if (f.subCoverUrl) body.subCoverUrl = f.subCoverUrl;
        return api('/api/admin/admin-drives/add', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        }).then(function () {
          toast('Drive "' + f.name + '" adicionado.');
          resetForm();
          return loadDrives().then(function () { return true; });
        }).catch(function (e) { toast(translateError(e.status, e.message), true); return false; });
      }
      body.id = state.editingId;
      if (f.clearCover) body.coverUrl = null;
      else if (f.coverUrl) body.coverUrl = f.coverUrl;
      if (f.clearSubCover) body.subCoverUrl = null;
      else if (f.subCoverUrl) body.subCoverUrl = f.subCoverUrl;
      return api('/api/admin/admin-drives/update', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      }).then(function () {
        toast('Drive "' + f.name + '" atualizado.');
        resetForm();
        return loadDrives().then(function () { return true; });
      }).catch(function (e) { toast(translateError(e.status, e.message), true); return false; });
    }
    ctl.saveDrive = saveDrive;

    function removeDrive(id) {
      var d = state.drives.filter(function (x) { return String(x.id) === String(id); })[0];
      var label = d ? ('"' + d.name + '" (' + d.driveId + ')') : ('#' + id);
      return admConfirm('Remover o drive ' + label + '?\n\nSó o registo é apagado — a pasta no Drive e as aulas NÃO são apagadas. Os apps deixam de o mostrar.').then(function (ok) {
        if (!ok) return false;
        return api('/api/admin/admin-drives/delete', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: Number(id) })
        }).then(function (j) {
          if (state.editingId != null && String(state.editingId) === String(id)) resetForm();
          toast('Drive removido.');
          return loadDrives().then(function () { return true; });
        }).catch(function (e) { toast(translateError(e.status, e.message), true); return false; });
      });
    }
    ctl.removeDrive = removeDrive;

    function wireForm() {
      var save = $('#dv-save');
      if (save && !save._dvWired) { save._dvWired = true; save.onclick = function () { saveDrive(); }; }
      var cancel = $('#dv-cancel-edit');
      if (cancel && !cancel._dvWired) { cancel._dvWired = true; cancel.onclick = function () { resetForm(); }; }
      var refresh = $('#dv-refresh');
      if (refresh && !refresh._dvWired) { refresh._dvWired = true; refresh.onclick = function () { loadDrives(); }; }
    }

    function hideSection() {
      var btn = doc.querySelector('[data-tab="drives"]');
      if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
      var pane = doc.querySelector('#pane-drives');
      if (pane && pane.parentNode) pane.parentNode.removeChild(pane);
    }

    // Arranque: só admin vê a secção. O /admin já barra não-admins no
    // servidor (403 HTML); sem sessão o /api/me dá 401 e a secção some.
    return api('/api/me').then(function (j) {
      if (!j || !j.isAdmin) { hideSection(); return ctl; }
      state.isAdmin = true;
      if (!ensureTab()) { toast('Não foi possível montar a secção Drives (estrutura do /admin alterada).', true); return ctl; }
      return ctl;
    }).catch(function () { hideSection(); return ctl; });
  }

  function createApi(fetchFn) {
    return function api(path, opts) {
      return fetchFn(path, Object.assign({ credentials: 'include', cache: 'no-store' }, opts || {})).then(function (r) {
        return r.text().then(function (t) {
          var j = null;
          try { j = JSON.parse(t); } catch (_) {}
          if (!r.ok) {
            var err = new Error((j && (j.error || j.message)) || ('HTTP ' + r.status));
            err.status = r.status;
            throw err;
          }
          return j;
        });
      });
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      VERSION: VERSION,
      esc: esc,
      isHttpUrl: isHttpUrl,
      driveIdValid: driveIdValid,
      normalizeDrive: normalizeDrive,
      sortDrives: sortDrives,
      validateDriveInput: validateDriveInput,
      parseSubfolderCovers: parseSubfolderCovers,
      serializeSubfolderCovers: serializeSubfolderCovers,
      translateError: translateError,
      appBadges: appBadges,
      renderDriveRow: renderDriveRow,
      renderDrivesTable: renderDrivesTable,
      paneSkeleton: paneSkeleton,
      boot: boot,
      createApi: createApi
    };
  } else if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { boot(); });
    } else {
      boot();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
