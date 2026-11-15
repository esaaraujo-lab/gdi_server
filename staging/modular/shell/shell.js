/* ═══════════════════════════════════════════════════════════════
   Meggy Shell — Split-View App Shell (Estratégia B Fase 1)
   Vanilla JS — sem React, sem Vite, sem build step
   Carrega via <script> tag do /modular/shell/shell.js

   Estrutura:
   - Shell.mount()     → cria DOM (header + sidebar + main pane)
   - Shell.router      → client-side router (pushState, sem location.href)
   - Shell.views.*     → renderizadores de cada view no main pane
   - Shell.sidebar     → navegação lateral (Home, Cursos, etc.)
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ★ v2.15.17 (B): canónico ÚNICO do rebase legado de caminhos de curso
  //   (o mesmo mapa LEGACY_COURSE_PATH_REBASE do worker e do módulo
  //   study-courses.js, 1 entrada: /11:/CURSOS 2026 → /9:/CURSOS 2026).
  //   Os 3 clicks de cartão de curso (Home destaque, fallback /cursos,
  //   busca) liam o path CRU do D1 e abriam /11:/ (drive errado → ⛔);
  //   canonica-se SÓ no momento da navegação — o DOM/data-course fica intacto.
  const __LEGACY_COURSE_PATH_REBASE = [['/11:/CURSOS 2026', '/9:/CURSOS 2026']];
  const __canonCoursePath = function(p){ var x = String(p || ''); try { x = decodeURIComponent(x); } catch (_) {} for (var _ri = 0; _ri < __LEGACY_COURSE_PATH_REBASE.length; _ri++) { var _a = __LEGACY_COURSE_PATH_REBASE[_ri][0], _b = __LEGACY_COURSE_PATH_REBASE[_ri][1]; if (x === _a || x.indexOf(_a + '/') === 0) { x = _b + x.slice(_a.length); break; } } return x; };

  // ★ v2.15.19 (S — item 6): nome canónico do drive de um caminho de curso
  //   — a mesma regra do driveNameOf de study-courses.js (fix B1 v2.15.18):
  //   canoniza o caminho legado e lê window.drive_names pelo índice.
  //   '' quando não há drive (path sem índice, drive sem nome, ou
  //   drive_names ainda por carregar) — o meta degrada p/ o formato antigo.
  const __driveNameOf = function(p){ var m = /^\/(\d+):/.exec(__canonCoursePath(p || '')); return (window.drive_names && m && window.drive_names[+m[1]]) || ''; };

  // ★ v2.15.28 (A — capas em destaque) — START
  //   Gémeo do bloco em study/study-courses.js (mesma semântica; o shell
  //   arranca antes do loader, por isso não pode importar de lá). Ver o
  //   comentário de diagnóstico no bloco gémeo: o front web nunca usou a
  //   biblioteca de capas (só coverUrl do D1) e o manifesto @main está
  //   STALE (59 entradas) — o pin + a reescrita @main → @pin evitam
  //   depender dele. Usado pela Home (destaque) e pelo fallback /cursos.
  const __V21528_COVER_PIN = 'd2fc4ac7';
  const __V21528_COVER_MANIFEST_URLS = [
    'https://cdn.jsdelivr.net/gh/esaaraujo-lab/gdi_server@' + __V21528_COVER_PIN + '/staging/modular/meggy/covers/cover-manifest.json',
    'https://raw.githubusercontent.com/esaaraujo-lab/gdi_server/main/staging/modular/meggy/covers/cover-manifest.json',
    'https://cdn.jsdelivr.net/gh/esaaraujo-lab/gdi_server@main/staging/modular/meggy/covers/cover-manifest.json'
  ];
  const __V21528_COVER_FETCH_TIMEOUT_MS = 2500;
  const __V21528_COVER_MIN_KEYWORD = 3;
  let __v21528CoverManifestPromise = null;
  function __v21528Esc(s){ try{ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;'); }catch(_){ return String(s || ''); } }
  function __v21528CoverNorm(t){
    try{
      return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
    }catch(_){ return String(t || '').toLowerCase(); }
  }
  function __v21528CoverParseManifest(text){
    try{
      const d = (typeof text === 'string') ? JSON.parse(text) : text;
      const arr = Array.isArray(d) ? d : ((d && Array.isArray(d.images)) ? d.images : null);
      if(!arr) return [];
      const out = [];
      for(const e of arr){
        if(!e || typeof e.url !== 'string' || !/^https?:\/\//i.test(e.url)) continue;
        const kws = Array.isArray(e.keywords) ? e.keywords.map(__v21528CoverNorm).filter(Boolean) : [];
        if(!kws.length) continue;
        out.push({ id: String(e.id || ''), keywords: kws, url: e.url });
      }
      return out;
    }catch(_){ return []; }
  }
  function __v21528CoverRewritePinned(url){
    const u = String(url || '');
    return u.indexOf('esaaraujo-lab/gdi_server@main/') >= 0
      ? u.replace('esaaraujo-lab/gdi_server@main/', 'esaaraujo-lab/gdi_server@' + __V21528_COVER_PIN + '/') : u;
  }
  function __v21528CoverFetchJson(url){
    try{
      const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      let timer = null;
      if(ctrl) timer = setTimeout(function(){ try{ ctrl.abort(); }catch(_){} }, __V21528_COVER_FETCH_TIMEOUT_MS);
      return fetch(url, { headers: { 'Accept': 'application/json' }, cache: 'no-store', signal: ctrl ? ctrl.signal : undefined }).then(function(r){
        if(timer) clearTimeout(timer);
        if(!r || !r.ok) throw new Error('HTTP ' + (r && r.status));
        return r.text();
      }).then(function(t){ return __v21528CoverParseManifest(t); }).catch(function(e){ if(timer) clearTimeout(timer); throw e; });
    }catch(e){ return Promise.reject(e); }
  }
  async function __v21528CoverManifest(){
    if(__v21528CoverManifestPromise) return __v21528CoverManifestPromise;
    __v21528CoverManifestPromise = (async function(){
      for(const u of __V21528_COVER_MANIFEST_URLS){
        try{ const imgs = await __v21528CoverFetchJson(u); if(Array.isArray(imgs) && imgs.length) return imgs; }catch(_){}
      }
      return null;
    })();
    return __v21528CoverManifestPromise;
  }
  function __v21528CoverLibraryUrl(images, name, coursePath){
    if(!Array.isArray(images) || !images.length) return null;
    const cands = [];
    const raws = [name, coursePath];
    for(let i = 0; i < raws.length; i++){
      const raw = raws[i]; if(raw == null || raw === '') continue;
      const segs = String(raw).split('/').reverse();
      for(let j = 0; j < segs.length; j++){ const n = __v21528CoverNorm(segs[j]); if(n) cands.push(n); }
    }
    for(let ci = 0; ci < cands.length; ci++){
      const cand = cands[ci];
      let best = null, bestLen = 0;
      for(let ii = 0; ii < images.length; ii++){
        const im = images[ii]; if(!im || !Array.isArray(im.keywords)) continue;
        for(let ki = 0; ki < im.keywords.length; ki++){
          const kw = im.keywords[ki];
          if(!kw || kw.length < __V21528_COVER_MIN_KEYWORD) continue;
          if(kw.length <= bestLen) continue;
          if(cand.indexOf(kw) >= 0){ best = im; bestLen = kw.length; }
        }
      }
      if(best) return __v21528CoverRewritePinned(best.url);
    }
    return null;
  }
  function __v21528CoverDefaultArt(icon, hidden){
    return '<div class="gdi-course-cover-default" style="width:100%;aspect-ratio:16/9;border-radius:10px 10px 0 0;display:' + (hidden ? 'none' : 'flex') + ';align-items:center;justify-content:center;background:var(--ferreto-grad,linear-gradient(135deg,#ff8b9f 0%,#c026d3 55%,#5ddeda 130%));"><span style="font-size:34px;line-height:1;">' + __v21528Esc(icon || '⭐') + '</span></div>';
  }
  function __v21528TileCoverHtml(c, icon){
    const u = c ? ((c.coverUrl || c.thumbUrl || c.thumbnail || '')) : '';
    if(typeof u === 'string' && /^https?:\/\//i.test(u)) return '<div class="meggy-card-cover"><img src="' + __v21528Esc(u) + '" alt="" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:10px 10px 0 0;display:block;" onerror="this.style.display=\'none\';var n=this.nextElementSibling;if(n)n.style.display=\'flex\';">' + __v21528CoverDefaultArt(icon, true) + '</div>';
    return '<div class="meggy-card-cover">' + __v21528CoverDefaultArt(icon, false) + '</div>';
  }
  // ★ texto da contagem p/ o meta do fallback: total 0 em destaque =
  //   "aulas em breve" (nunca "0 aulas").
  function __v21528CountText(it){
    if(it && it.kind === 'featured' && !((it.total) || 0)) return 'aulas em breve';
    return ((it && it.total) || 0) + ' aulas';
  }
  async function __v21528UpgradeTileCovers(root, gen){
    try{
      if(!root || typeof root.querySelectorAll !== 'function') return;
      if(gen !== undefined && gen !== null && root.__filterGen !== undefined && root.__filterGen !== gen) return;
      const imgs = await __v21528CoverManifest();
      if(!imgs) return;
      if(gen !== undefined && gen !== null && root.__filterGen !== undefined && root.__filterGen !== gen) return;
      const cards = root.querySelectorAll('[data-v21528-cover]');
      for(let i = 0; i < cards.length; i++){
        try{
          const card = cards[i];
          if(!card || card.isConnected === false) continue;
          const url = __v21528CoverLibraryUrl(imgs, (card.dataset && card.dataset.v21528CoverName) || '', (card.dataset && card.dataset.v21528CoverPath) || '');
          if(!url) continue;
          const art = card.querySelector ? card.querySelector('.gdi-course-cover-default') : null;
          if(!art) continue;
          const img = document.createElement('img');
          img.src = url; img.alt = '';
          img.style.cssText = 'width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:10px 10px 0 0;display:block;';
          img.onerror = (function(im, a){ return function(){ try{ im.style.display = 'none'; a.style.display = 'flex'; }catch(_){} }; })(img, art);
          if(art.parentNode && art.parentNode.insertBefore) art.parentNode.insertBefore(img, art);
          else if(card.insertBefore) card.insertBefore(img, art);
          art.style.display = 'none';
          if(card.removeAttribute) card.removeAttribute('data-v21528-cover');
        }catch(_){}
      }
    }catch(_){}
  }
  // ★ v2.15.28 (A — capas em destaque) — END

  const Shell = {
    state: {
      currentView: 'home',
      sidebarOpen: false,
      modulesReady: false
    },

    // ─── Init: mount immediately — gdi-utils.js (loaded before us) provides Bus ───
    initAttempts: 0,
    init() {
      if (document.getElementById('meggy-shell')) {
        console.log('[Meggy Shell] já montado, skip');
        return;
      }

      // Bus is provided by gdi-utils.js (loaded via <script defer> before us)
      // If not available, log error but still try to mount (shell works without Bus for basic nav)
      let busReady = false;
      try { busReady = (typeof Bus !== 'undefined'); } catch (e) {}

      if (!busReady) {
        console.warn('[Meggy Shell] Bus não disponível — gdi-utils.js falhou? Montando mesmo assim');
      } else {
        console.log('[Meggy Shell] init — Bus disponível, montando shell nativo');
      }
      Shell.state.modulesReady = true;
      Shell.mount();
      Shell.router.init();
      // ★ Preload marked.js + DOMPurify para renderização de markdown rico
      Shell._ensureMdLibs();
    },

    // ─── Mount: create DOM ───
    mount() {
      // Create sidebar overlay (mobile)
      const overlay = document.createElement('div');
      overlay.className = 'meggy-sidebar-overlay';
      overlay.id = 'meggy-sidebar-overlay';
      overlay.onclick = () => Shell.toggleSidebar(false);

      // Create shell
      const shell = document.createElement('div');
      shell.id = 'meggy-shell';
      shell.innerHTML = `
        <header id="meggy-header">
          <button class="meggy-mobile-menu-btn" id="meggy-menu-btn" title="Menu">
            <i class="bi bi-list"></i>
          </button>
          <div class="meggy-header-logo" id="meggy-logo">
            <span style="font-size:20px;">🐩</span> Meggy
          </div>
          <div class="meggy-header-search">
            <input type="search" placeholder="Buscar aulas, cursos, questões..." id="meggy-search-input" />
          </div>
          <div class="meggy-header-actions">
            <button class="meggy-header-btn" id="meggy-theme-btn" title="Alternar tema">
              <i class="bi bi-moon-stars" id="meggy-theme-icon"></i>
            </button>
            <button class="meggy-header-btn" id="meggy-logout-btn" title="Sair">
              <i class="bi bi-box-arrow-right"></i>
              <span class="d-none d-sm-inline">Sair</span>
            </button>
          </div>
        </header>
        <div id="meggy-body">
          <aside id="meggy-sidebar">
            ${Shell.sidebar.render()}
          </aside>
          <main id="meggy-main">
            <div class="meggy-loading">
              <div class="spinner-border" role="status"></div>
              <div>Carregando...</div>
            </div>
          </main>
        </div>
      `;

      // Mount into #meggy-root container (provided by worker-staging.js html())
      // ★ A2: overlay INSIDE shell (z-index 50, between header 10 and sidebar 10000)
      const root = document.getElementById('meggy-root') || document.body;
      root.innerHTML = ''; // clear (in case of remount)
      shell.appendChild(overlay); // overlay is first child of shell (not body sibling)
      root.appendChild(shell);

      // ★ Área do Aluno antiga REMOVIDA — study-panel.js não é mais carregado
      console.log('[Meggy Shell] ✓ Área do Aluno antiga removida (study-panel.js não carregado)');

      // Bind events
      document.getElementById('meggy-menu-btn').onclick = () => Shell.toggleSidebar();
      document.getElementById('meggy-logo').onclick = () => Shell.router.navigate('/');
      document.getElementById('meggy-theme-btn').onclick = () => Shell.toggleTheme();
      document.getElementById('meggy-logout-btn').onclick = () => Shell.logout();

      // ★ v2.15.5 (item 7): busca global abre a tela de resultados real
      //   (/search) — o '/0:search?q=...' antigo era um pseudo-caminho de
      //   drive: o roteador caía no default → Home, sem resultados. O
      //   GDIndex search está morto sob o shell (loadFullGDIndex desativado).
      const searchInput = document.getElementById('meggy-search-input');
      searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && searchInput.value.trim()) {
          const q = encodeURIComponent(searchInput.value.trim());
          Shell.router.navigate('/search?q=' + q);
        }
      });

      // Set initial theme icon
      const theme = document.documentElement.getAttribute('data-bs-theme') || 'dark';
      document.getElementById('meggy-theme-icon').className = theme === 'dark' ? 'bi bi-moon-stars' : 'bi bi-sun';

      console.log('[Meggy Shell] ✓ shell mounted into #meggy-root');
    },

    // ─── Lazy load full GDIndex (app.min.js + 24 modules) when needed ───
    gdindexLoaded: false,
    async loadFullGDIndex() {
      // ★ DESATIVADO — carregar GDIndex quebra o shell (sobrescreve variáveis, carrega study-panel.js)
      // O shell nativo não precisa do GDIndex — tudo funciona via API + gdi-utils.js
      console.log('[Meggy Shell] loadFullGDIndex desativado — shell nativo não precisa de GDIndex');
      return false;
    },

    _loadScript(src) {
      return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.defer = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Failed: ' + src));
        document.head.appendChild(s);
      });
    },

    // ─── Sidebar ───
    sidebar: {
      items: [
        { id: 'home', label: 'Home', icon: 'bi-house-door', path: '/' },
        { id: 'cursos', label: 'Meus Cursos', icon: 'bi-collection-play', path: '/cursos' },
        { id: 'drives', label: 'Explorar Drives', icon: 'bi-cloud', path: '/drives' },
        { id: 'progresso', label: 'Progresso', icon: 'bi-graph-up', path: '/progresso' },
        { id: 'questoes', label: 'Questões', icon: 'bi-patch-question', path: '/questoes' },
        { id: 'flashcards', label: 'Flashcards', icon: 'bi-card-text', path: '/flashcards' },
        { id: 'meggy-ai', label: 'Meggy AI', icon: 'bi-robot', path: '/meggy-ai' },
        { id: 'resumos', label: 'Resumos', icon: 'bi-journal-text', path: '/resumos' },
        { id: 'conquistas', label: 'Conquistas', icon: 'bi-trophy', path: '/conquistas' },
        { id: 'apps', label: 'Apps', icon: 'bi-phone', path: '/apps' },
        { id: 'config', label: 'Configurações', icon: 'bi-gear', path: '/config' }
      ],

      render() {
        const sections = [
          { title: 'Plataforma', ids: ['home', 'cursos', 'drives'] },
          { title: 'Estudos', ids: ['progresso', 'questoes', 'flashcards', 'simulado', 'provas', 'redacao', 'cronograma', 'estatisticas', 'mapa-fracos'] },
          { title: 'IA & Conta', ids: ['meggy-ai', 'resumos', 'conquistas', 'apps', 'config'] }
        ];
        let html = '';
        for (const sec of sections) {
          html += `<div class="meggy-sidebar-section">${sec.title}</div>`;
          for (const item of this.items) {
            if (sec.ids.includes(item.id)) {
              html += `
                <div class="meggy-sidebar-item" data-path="${item.path}" data-view="${item.id}">
                  <i class="bi ${item.icon}"></i>
                  <span>${item.label}</span>
                </div>`;
            }
          }
        }
        return html;
      },

      updateActive(path) {
        document.querySelectorAll('.meggy-sidebar-item').forEach(el => {
          el.classList.toggle('active', el.dataset.path === path);
        });
      },

      bindClicks() {
        document.querySelectorAll('.meggy-sidebar-item').forEach(el => {
          el.onclick = () => {
            Shell.router.navigate(el.dataset.path);
            Shell.toggleSidebar(false); // close on mobile
          };
        });
      }
    },

    // ─── Router (pushState — NUNCA location.href) ───
    router: {
      routes: {
        '/': 'home',
        '/cursos': 'cursos',
        '/drives': 'drives',
        '/progresso': 'progresso',
        '/questoes': 'questoes',
        '/flashcards': 'flashcards',
        '/meggy-ai': 'meggy-ai',
        '/concursos': 'concursos',
        '/config': 'config',
        '/simulado': 'simulado',
        '/provas': 'provas',
        '/redacao': 'redacao',
        '/cronograma': 'cronograma',
        '/estatisticas': 'estatisticas',
        '/mapa-fracos': 'mapa-fracos',
        '/conquistas': 'conquistas',
        '/apps': 'apps',
        '/resumos': 'resumos',
        '/plano': 'plano',
        '/search': 'search'
      },

      init() {
        window.addEventListener('popstate', () => Shell.renderView());
        Shell.sidebar.bindClicks();
        Shell.renderView();
      },

      navigate(path) {
        if (window.location.pathname === path) {
          Shell.renderView();
          return;
        }
        window.history.pushState({ path }, '', path);
        Shell.renderView();
      },

      currentPath() {
        return window.location.pathname;
      }
    },

    // ─── Render current view ───
    renderView() {
      // ★ Se há pendingPath (deep link), usar ele
      if (Shell.state.pendingPath) {
        window.history.replaceState({path: Shell.state.pendingPath}, '', Shell.state.pendingPath);
        Shell.state.pendingPath = null;
      }
      const path = Shell.router.currentPath();
      const view = Shell.router.routes[path] || 'home';
      Shell.state.currentView = view;
      Shell.sidebar.updateActive(path);
      // ★ Fechar Meggy AI drawer ao trocar de aba (só fica aberto na aba meggy-ai)
      if (view !== 'meggy-ai' && Shell.meggyAIDrawerOpen) {
        Shell.closeMeggyAIDrawer();
      }

      const main = document.getElementById('meggy-main');
      if (!main) return;

      // ★ v2.15.6 (P6): deep link ?a=view — um caminho de ficheiro
      //   (/N:/…/aula.mp4) com ?a=view abre o player em vez de cair na
      //   Home (o roteador só conhece as rotas fixas; os links "Continuar",
      //   os resultados de busca e os links partilhados morriam aqui).
      let _decPath = path;
      try { _decPath = decodeURIComponent(path); } catch (_) {}
      const _aView = new URLSearchParams(window.location.search || '');
      // ★ v2.15.9 (B — P6b): ?a=view vale p/ QUALQUER caminho /N:/…,
      //   não só ficheiros de mídia. Um deep link de PASTA
      //   (/N:/…/Aula 09 - Crime Doloso e Culposo?a=view) caía no ramo
      //   de pastas abaixo e não abria o player — agora vai p/
      //   _openLessonPath, que resolve a pasta p/ o seu ficheiro de
      //   mídia (ou abre a própria pasta, se não houver mídia).
      // ★ v2.15.12-C3 (P6b regressão, Passo 16): o mesmo caminho normalizado
      //   do portão do worker (C2) — '/drives' inicial + '%3A'→':' no prefixo
      //   — MAIS uma descodificação única SÓ quando há dupla codificação
      //   ('%25' no caminho: os hrefs antigos do breadcrumb codificavam
      //   '%20'→'%2520'). Sem o teste, mesmo com o shell servido, o teste
      //   cru /^\/\d+:\// falhava em %3A e a aula caía na Home. Sem '%25'
      //   o caminho passa INTACTO (a forma do Passo 15, codificação simples
      //   — é a que _openLessonPath/gdiListAllFiles resolvem ao vivo); com
      //   '%25', uma descodificação repõe a forma do Passo 15.
      const _normPath = path.replace(/^\/drives(?=\/\d+(?::|%3A)\/)/i, '').replace(/^\/(\d+)%3A\//i, '/$1:/');
      let _normDec = _normPath;
      if (/%25/i.test(_normPath)) { try { _normDec = decodeURIComponent(_normPath); } catch (_) {} }
      if (_aView.get('a') === 'view' && /^\/\d+:\//.test(_normDec)) {
        Shell.views._openLessonPath(_normDec);
        return;
      }

      // Scroll to top on view change
      main.scrollTop = 0;

      // ★ v2.15.8 (B): caminho de PASTA do Drive (/N:/...) sem rota — abre
      //   Explorar Drives nessa pasta em vez de cair na Home. O link "Ir
      //   para o Drive" do detalhe (href=/11:/...) e URLs de pasta coladas
      //   morriam aqui (routes só conhece as rotas fixas). Ficheiros de
      //   mídia sem ?a=view continuam a cair na Home (comportamento atual).
      if (view === 'home' && /^\/\d+:\//.test(path) && !/\.(mp4|webm|mov|mkv|m4v|mp3|m4a|ogg|wav|aac|pdf)$/i.test(_decPath)) {
        Shell.state.currentView = 'drives';
        Shell.sidebar.updateActive('/drives');
        // ★ v2.15.18 (A): canonicar o deep link de pasta — URLs coladas /
        //   favoritos antigos chegam com o prefixo legado (/11:/CURSOS 2026)
        //   e sem ele o _renderDrives abria a página ⛔ (o gémeo recuperava
        //   num clique, mas ⛔ na mesma). Mesmo padrão dos cartões (B2–B4):
        //   canonica-se SÓ no momento da navegação.
        Shell.views.drives(main, __canonCoursePath(path));
        return;
      }

      // ★ v2.15.10-C3: o contexto da aula MORRE ao sair da aula. Causa
      //    provada (Passo 14, sintoma c): currentFolderPath só é
      //    atribuído em _renderDrives/_openLessonPath e NUNCA limpo —
      //    ao navegar p/ a Home, _hasDrawerLesson() continuava true e
      //    o prefixo C2 seguia sendo enviado, por isso o modelo disse
      //    "Vejo que você está na aula '01 - PRINCIPIOS FUNDAMENTAIS'"
      //    no chat da Home. Os dois retornos acima já trataram os
      //    caminhos de aula (?a=view e pasta /N:/ — re-setam o contexto
      //    a seguir); aqui só chegam as vistas fixas. 'drives'
      //    (navegação de pastas) e 'meggy-ai' (só abre o drawer sobre a
      //    vista atual, sem trocar de conteúdo) preservam o contexto.
      if (view !== 'drives' && view !== 'meggy-ai') {
        Shell.state.currentFolderPath = '';
        Shell.state.playerPlaylist = null;
        Shell.state.playerIndex = 0;
      }

      switch (view) {
        case 'home':      Shell.views.home(main); break;
        case 'cursos':    Shell.views.cursos(main); break;
        case 'drives':    Shell.views.drives(main); break;
        case 'progresso': Shell._estudosView(main, 'progresso'); break;
        case 'questoes':  Shell.views.questoes(main); break;
        case 'flashcards':Shell.views.flashcards(main); break;
        case 'meggy-ai':  
          Shell.openMeggyAIDrawer(); 
          // Mostrar mensagem na main pane
          const mainEl = document.getElementById('meggy-main');
          if (mainEl) mainEl.innerHTML = '<div class="meggy-view-header"><h1 class="meggy-view-title">🤖 Meggy AI</h1></div><div class="meggy-placeholder"><div class="meggy-placeholder-icon">🤖</div><div class="meggy-placeholder-title">Meggy AI aberta!</div><div class="meggy-placeholder-desc">O drawer está aberto à direita. Use as abas Ações e Chat.</div></div>';
          break;
        case 'concursos': Shell.views.concursos(main); break;
        case 'config':    Shell._estudosView(main, 'config'); break;
        case 'simulado':  Shell._estudosView(main, 'simulado'); break;
        case 'provas':    Shell._estudosView(main, 'provas'); break;
        case 'redacao':   Shell._estudosView(main, 'redacao'); break;
        case 'cronograma':Shell._estudosView(main, 'cronograma'); break;
        case 'estatisticas':Shell._estudosView(main, 'estatisticas'); break;
        case 'mapa-fracos':Shell._estudosView(main, 'mapa-fracos'); break;
        case 'conquistas':Shell._estudosView(main, 'conquistas'); break;
        case 'apps':      Shell._estudosView(main, 'apps'); break;
        case 'resumos':   Shell.views.resumos(main); break;
        case 'plano':     Shell._estudosView(main, 'plano'); break;
        case 'search':     Shell.views.search(main); break;
        default:          Shell.views.home(main);
      }
    },

    // ─── Views ───
    views: {
      home(el) {
        // ★ Continue assistindo — usar history (tem nome + path reais) + resume (posição)
        let continueHTML = '';
        try {
          const d = (typeof GDIUser !== 'undefined' && GDIUser && GDIUser.state) || {};
          const history = d.history || [];
          const resume = d.resume || {};
          // Usar histórico (tem nome + path) — pegar últimos 6
          const recent = Array.isArray(history) ? history.slice(-6).reverse() : [];
          if (recent.length > 0) {
            continueHTML = '<div class="meggy-continue-section"><h2>▶ Continue assistindo</h2><div class="meggy-cards-grid">';
            for (const h of recent) {
              const rawName = h.name || h.path?.split('/').pop()?.replace(/\.\w+$/, '') || 'Aula';
              const name = decodeURIComponent(rawName).replace(/\+/g, ' ');
              const rawCourse = h.path?.split('/')[2] || h.coursePath?.split('/')[2] || '';
              const course = decodeURIComponent(rawCourse).replace(/\+/g, ' ');
              // Pegar posição do resume (procurar por URL ou path)
              let pos = 0;
              for (const [k, v] of Object.entries(resume)) {
                if (k.includes(h.path) || h.path?.includes(k)) { pos = typeof v === 'number' ? v : (v?.pos || 0); break; }
              }
              // ★ v2.15.18 (B — item 7): o nome do drive sai do caminho
              //   CANÓNICO — o histórico guarda o path cru (/11:/CURSOS
              //   2026/...) e o cartão mostrava "PREPARATÓRIO OAB".
              const driveIdx = __canonCoursePath(h.path || '').match(/^\/(\d+):/)?.[1];
              const driveName = driveIdx ? (window.drive_names?.[+driveIdx] || '') : '';
              const progressColor = pos >= 80 ? '#3fb950' : pos >= 40 ? '#ffd43b' : '#ff8b9f';
              continueHTML += `
                <div class="meggy-card" data-resume-path="${h.path || ''}">
                  <div class="meggy-card-icon">🎬</div>
                  <div class="meggy-card-title">${name}</div>
                  <div class="meggy-card-meta">${driveName}${course ? ' · ' + course : ''}</div>
                  <div class="meggy-continue-progress" style="margin-top:8px;">
                    <div class="meggy-continue-progress-bar" style="width:${Math.min(100, pos)}%;background:${progressColor};"></div>
                  </div>
                </div>`;
            }
            continueHTML += '</div></div>';
          }
        } catch (e) { console.warn('[Shell] home resume:', e); }

        el.innerHTML = `
          <div class="meggy-view-header">
            <h1 class="meggy-view-title">🏠 Home</h1>
          </div>
          ${continueHTML}
          <div id="meggy-featured-section"></div>
          <div class="meggy-cards-grid">
            <div class="meggy-card" data-nav="/cursos">
              <div class="meggy-card-icon">📚</div>
              <div class="meggy-card-title">Meus Cursos</div>
              <div class="meggy-card-meta">Cursos e concursos em um só lugar</div>
            </div>
            <div class="meggy-card" data-nav="/drives">
              <div class="meggy-card-icon">☁️</div>
              <div class="meggy-card-title">Explorar Drives</div>
              <div class="meggy-card-meta">Navegue por todos os drives disponíveis</div>
            </div>
            <div class="meggy-card" data-nav="/meggy-ai">
              <div class="meggy-card-icon">🤖</div>
              <div class="meggy-card-title">Meggy AI</div>
              <div class="meggy-card-meta">Chat, resumos, questões e flashcards</div>
            </div>
            <div class="meggy-card" data-nav="/progresso">
              <div class="meggy-card-icon">📊</div>
              <div class="meggy-card-title">Meu Progresso</div>
              <div class="meggy-card-meta">Acompanhe sua evolução</div>
            </div>
          </div>
        `;
        // Bind card clicks
        el.querySelectorAll('.meggy-card[data-nav]').forEach(card => {
          card.onclick = () => Shell.router.navigate(card.dataset.nav);
        });
        // Bind continue watching clicks — navegar para a pasta do vídeo
        el.querySelectorAll('.meggy-card[data-resume-path]').forEach(card => {
          card.onclick = () => {
            const path = card.dataset.resumePath;
            if (path) {
              const folder = path.substring(0, path.lastIndexOf('/') + 1);
              Shell.router.navigate('/drives');
              setTimeout(() => Shell.views._renderDrives(folder), 50);
            }
          };
        });
        // ★ v2.3: Cursos em destaque — cadastrados pelo admin, visíveis na Home de todos
        fetch('/api/featured-courses').then(r => r.json()).then(data => {
          const sec = document.getElementById('meggy-featured-section');
          if (!sec) return;
          const list = (data && data.ok && data.courses) || [];
          if (!list.length) { sec.innerHTML = ''; return; }
          sec.innerHTML = '<div class="meggy-continue-section"><h2>⭐ Cursos em destaque</h2><div class="meggy-cards-grid">' + list.map(c => {
            const name = Shell._esc(c.courseName || c.coursePath || 'Curso');
            // ★ v2.15.28 (A): capa pela hierarquia (coverUrl → biblioteca
            //   → arte padrão); sem coverUrl o cartão marca-se p/ o upgrade
            //   da biblioteca. A regra v2.15.6 (só coverUrl, sem imagem
            //   quando não há) deixava o tile com a faixa vazia.
            const cover = __v21528TileCoverHtml({ coverUrl: c.coverUrl }, c.icon || '📚');
            const mark = c.coverUrl ? '' : ' data-v21528-cover="" data-v21528-cover-name="' + Shell._esc(c.courseName || '') + '" data-v21528-cover-path="' + Shell._esc(c.coursePath || '') + '"';
            return '<div class="meggy-card" data-course="' + Shell._esc(c.coursePath || '') + '"' + mark + '>' +
              cover +
              '<div class="meggy-card-title">' + name + '</div>' +
              '<div class="meggy-card-meta">Curso em destaque</div>' +
            '</div>';
          }).join('') + '</div></div>';
          // ★ v2.15.28 (A): upgrade das capas da biblioteca (assíncrono).
          __v21528UpgradeTileCovers(sec).catch(() => {});
          sec.querySelectorAll('.meggy-card[data-course]').forEach(card => {
            card.onclick = () => {
              const cp = card.dataset.course;
              if (cp) {
                Shell.router.navigate('/drives');
                setTimeout(() => Shell.views._renderDrives(__canonCoursePath(cp)), 50);
              }
            };
          });
        }).catch(() => {});
      },

      // ★ v2.15.19 (L — determinismo /cursos): espera limitada pelo módulo
      //   study-courses + upgrade 1× quando ele chega.
      //   CAUSA (provada): Shell.views.cursos decidia módulo-vs-fallback
      //   com UM teste síncrono a window.__gdiStudy.courses.renderCursos
      //   no instante do render. O loader (gdi-extras-loader.js) só
      //   disponibiliza o módulo depois de Bus + gdi-core.js + 6 módulos
      //   da core-chain + theme/scanner/courses da study-chain (~10
      //   fetches sequenciais); quem abria /cursos antes disso via o
      //   FALLBACK (só /api/courses/unified — sem os cursos manuais do
      //   localStorage, sem busca/paginação, outro formato) e nada o
      //   atualizava depois: o loader dispara 'gdi-extras-ready' no fim
      //   do bootstrap (gdi-extras-loader.js) e NADA no shell o escutava
      //   (nem Bus.on — o shell só faz Bus.emit('courses:changed')).
      //   Resultado: o conjunto de cartões dependia da corrida — os
      //   manuais ("Cursos e Certificados - Faculdade Famart", "4.
      //   Direito Civil...") apareciam nuns loads e sumiam noutros.
      //   FIX em 2 camadas: (1) espera limitada (4 s) com o spinner
      //   "Carregando módulo de cursos..." já no template — o load
      //   típico resolve aqui e o fallback nem chega a aparecer;
      //   (2) se a espera expirar e o fallback renderizar, arma-se UM
      //   listener once de 'gdi-extras-ready' que re-renderiza /cursos
      //   (só se o utilizador ainda lá estiver e o módulo existir) —
      //   o estado final é SEMPRE a vista do módulo quando ele carrega;
      //   o fallback só persiste quando o módulo FALHOU mesmo (o evento
      //   dispara na mesma, mas o guarda do módulo bloqueia o re-render).
      //   Precedente: o re-render 1× da ponte v2.15.9 (D) p/ as features
      //   desviadas (shell-bridge.js) — aqui aplicado à vista nativa
      //   /cursos, que a ponte não cobre.
      _cursosModuleReady() {
        return !!(window.__gdiStudy && window.__gdiStudy.courses && window.__gdiStudy.courses.renderCursos);
      },

      _waitCursosModule(timeoutMs) {
        const has = () => Shell.views._cursosModuleReady();
        if (has()) return Promise.resolve(true);
        const limit = (typeof timeoutMs === 'number' && timeoutMs > 0) ? timeoutMs : 4000;
        return new Promise((resolve) => {
          let done = false;
          const finish = (v) => {
            if (done) return;
            done = true;
            try { window.removeEventListener('gdi-extras-ready', onReady); } catch (_) {}
            resolve(v);
          };
          // O evento dispara no FIM do bootstrap do loader — nessa altura
          // o estado do módulo é final: se existe, resolve true; se não,
          // falhou mesmo e não vale esperar o resto do timeout.
          const onReady = () => finish(has());
          try { window.addEventListener('gdi-extras-ready', onReady); } catch (_) {}
          const t0 = Date.now();
          const tick = () => {
            if (done) return;
            if (has()) { finish(true); return; }
            if (Date.now() - t0 >= limit) { finish(false); return; }
            setTimeout(tick, 150);
          };
          setTimeout(tick, 150);
        });
      },

      _armCursosModuleUpgrade() {
        try {
          if (typeof window === 'undefined' || !window.addEventListener) return;
          window.addEventListener('gdi-extras-ready', function onReady() {
            try {
              if (!Shell.views._cursosModuleReady()) return;
              // /concursos delega p/ a mesma vista (Shell.views.concursos → cursos).
              if (Shell.router && typeof Shell.router.currentPath === 'function') { const _p = Shell.router.currentPath(); if (_p !== '/cursos' && _p !== '/concursos') return; }
              const container = document.getElementById('meggy-cursos-container');
              if (!container) return;
              if (container.querySelector('.meggy-cursos-wrapper')) return; // já é a vista do módulo
              const main = document.getElementById('meggy-main');
              if (!main) return;
              Shell.views.cursos(main);
            } catch (_) {}
          }, { once: true });
        } catch (_) {}
      },

      cursos(el) {
        el.innerHTML = `
          <div class="meggy-view-header">
            <h1 class="meggy-view-title">📚 Meus Cursos</h1>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button class="meggy-header-btn" id="novo-concurso-btn" style="background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;border:none;font-size:13px;">+ Novo Concurso</button>
              <button class="meggy-header-btn" id="meggy-add-course-btn" style="background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;border:none;font-size:13px;"><i class="bi bi-folder-plus"></i> Adicionar Pasta de Curso</button>
            </div>
          </div>
          <div id="meggy-cursos-tips" style="margin:14px 0 4px;"></div>
          <div id="meggy-cursos-container">
            <div class="meggy-loading">
              <div class="spinner-border" role="status"></div>
              <div>Carregando módulo de cursos...</div>
            </div>
          </div>
        `;

        // ★ Adicionar Pasta de Curso — abre folder picker do Explorar Drives
        const addBtn = document.getElementById('meggy-add-course-btn');
        if (addBtn) {
          addBtn.onclick = () => Shell.views._showAddCourseDialog(el);
        }

        const novoBtn = document.getElementById('novo-concurso-btn');
        if (novoBtn) novoBtn.onclick = () => Shell.views.showConcursoWizard(el);

        (async () => {
          // ★ Render direto via API — shell nativo não precisa do GDIndex
          try {
            // ★ v2.15.19 (L): espera limitada pelo módulo antes de decidir
            //   módulo-vs-fallback — a decisão era UM teste síncrono no
            //   instante do render (corrida com o loader). O spinner
            //   "Carregando módulo de cursos..." já está no template.
            if (!Shell.views._cursosModuleReady()) {
              await Shell.views._waitCursosModule(4000);
              // O utilizador pode ter saído de /cursos durante a espera.
              if (!document.getElementById('meggy-cursos-container')) return;
            }
            if (Shell.views._cursosModuleReady()) {
              const container = document.getElementById('meggy-cursos-container');
              container.innerHTML = '';
              const wrapper = document.createElement('div');
              wrapper.className = 'meggy-cursos-wrapper';
              wrapper.style.cssText = 'max-width:none;padding:0;background:transparent;border:none;';
              container.appendChild(wrapper);
              window.__gdiStudy.courses.renderCursos(wrapper);
              // ★ v2.6: dicas da Meggy a partir do progresso (lista unificada)
              // ★ v2.15.3 (item 7): extraído p/ _refreshCursosTips() — os
              //   removes do módulo chamam-no após re-renderizar a grade.
              Shell.views._refreshCursosTips();
            } else {
              // ★ v2.6: lista única via API /api/courses/unified (cursos + concursos + destaque)
              const container = document.getElementById('meggy-cursos-container');
              try {
                const r = await fetch('/api/courses/unified', { headers: { 'Accept': 'application/json' }, credentials: 'include', cache: 'no-store' });
                if (r.ok) {
                  const data = await r.json();
                  const items = (data && data.items) || [];
                  Shell.views._renderCursosTips(items);
                  if (!items.length) {
                    container.innerHTML = '<div class="meggy-placeholder"><div class="meggy-placeholder-icon">📚</div><div class="meggy-placeholder-title">Nenhum curso adicionado</div><div class="meggy-placeholder-desc">Vá em Explorar Drives para adicionar cursos, ou crie um concurso.</div><button class="meggy-header-btn" onclick="Shell.router.navigate(\'/drives\')" style="margin-top:16px;"><i class="bi bi-cloud"></i> Explorar Drives</button></div>';
                  } else {
                    // ★ v2.14.7: destaque em seção própria no topo; os demais na grade abaixo
                    const __feat = items.filter(it => it.kind === 'featured');
                    const __own = items.filter(it => it.kind !== 'featured');
                    const __cardHtml = it => {
                        const name = it.name || 'Curso';
                        const badge = it.kind === 'concurso' ? '📌 Concurso' : it.kind === 'featured' ? '⭐ Em destaque' : '📚 Curso';
                        // ★ v2.15.19 (S — item 6a): o meta não tinha slot p/ o
                        //   drive — o cartão observado no Passo 23 (“📚 Curso ·
                        //   90 aulas · 0% concluído”) é este fallback. O nome
                        //   canónico do drive (mesma regra B1) entra a seguir
                        //   ao badge; concursos mantêm-se sem drive.
                        const __drv = it.kind === 'concurso' ? '' : __driveNameOf(it.coursePath);
                        // ★ v2.15.28 (A): total 0 em destaque = "aulas em
                        //   breve" (nunca "0 aulas").
                        const meta = badge + (__drv ? ' · ' + __drv : '') + (it.kind === 'concurso' ? '' : ' · ' + __v21528CountText(it)) + (it.percent != null && it.total ? ' · ' + it.percent + '% concluído' : '') + (it.examDate ? ' · 📅 ' + it.examDate : '');
                        const idAttr = it.kind === 'concurso' ? ' data-concurso-id="' + Shell._esc(it.concursoId) + '"' : ' data-course="' + Shell._esc(it.coursePath || '') + '"';
                        const rmBtn = it.kind === 'featured' ? '' :
                          '<button class="' + (it.kind === 'concurso' ? 'concurso-remove-btn' : 'course-remove-btn') + '" data-' + (it.kind === 'concurso' ? 'concurso-id="' + Shell._esc(it.concursoId) + '" data-concurso-name="' + Shell._esc(name) + '"' : 'course-path="' + Shell._esc(it.coursePath || '') + '" data-course-name="' + Shell._esc(name) + '"') + ' title="Remover" style="position:absolute;top:8px;right:8px;background:transparent;border:0;color:#8b949e;cursor:pointer;font-size:14px;padding:2px 6px;border-radius:6px;">✕</button>';
                        // ★ v2.15.28 (A): capa pela hierarquia (coverUrl →
                        //   biblioteca → arte padrão); sem coverUrl o cartão
                        //   marca-se p/ o upgrade da biblioteca.
                        const __cover = __v21528TileCoverHtml({ coverUrl: it.coverUrl }, it.icon || '📚');
                        // ★ v2.15.30 (B — item a): o concurso era excluído do marcador
                        //   do upgrade da biblioteca (mesma omissão do módulo) — sem
                        //   coverUrl ficava na arte padrão para sempre, mesmo havendo
                        //   capa na biblioteca (ex. tj-sp-oficial.jpg p/ "TJSP –
                        //   Oficial de Justiça"). A capa (__cover) já rendia aqui.
                        const __mark = it.coverUrl ? '' : ' data-v21528-cover="" data-v21528-cover-name="' + Shell._esc(name) + '" data-v21528-cover-path="' + Shell._esc(it.coursePath || '') + '"';
                        return '<div class="meggy-card"' + idAttr + __mark + ' style="cursor:pointer;position:relative;">' + rmBtn +
                          __cover +
                          '<div class="meggy-card-title">' + Shell._esc(name) + '</div>' +
                          '<div class="meggy-card-meta">' + Shell._esc(meta) + '</div>' +
                        '</div>';
                      };
                    // ★ v2.15.2 (K): grade inline — o fallback dependia do
                    //   shell.css externo p/ o grid; antes do CSS carregar, a
                    //   lista aparecia em 1 coluna com rótulos truncados.
                    const __gridStyle = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;';
                    // ★ v2.15.10 (B — P2/P8): carimbo da leitura — a prévia é
                    //   fresca (no-store), mas o D1 muda enquanto o scanner
                    //   corre; sem a hora, 88 aqui vs 86 no admin parecia
                    //   erro de contagem. snapshotAt vem do unificado (B2).
                    //   ★ v2.15.11-A5: redação unificada para "Snapshot do D1 às" (igual ao admin e a /cursos).
                    container.innerHTML =
                      (__feat.length ? '<div class="meggy-continue-section"><h2>⭐ Cursos em destaque</h2><div class="meggy-cards-grid" style="' + __gridStyle + '">' + __feat.map(__cardHtml).join('') + '</div></div>' : '') +
                      (__own.length ? '<div class="meggy-continue-section"><h2>📚 Meus Cursos</h2><div class="meggy-cards-grid" style="' + __gridStyle + '">' + __own.map(__cardHtml).join('') + '</div></div>' : '') +
                      '<div style="color:#9aa4b8;font-size:12px;margin-top:10px;">📊 Snapshot do D1 às ' + ((data && data.snapshotAt) ? new Date(data.snapshotAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—') + ' — mudam enquanto o scanner insere aulas; recarregue a página para atualizar.</div>';
                    // ★ v2.15.28 (A): upgrade das capas da biblioteca (assíncrono).
                    __v21528UpgradeTileCovers(container).catch(() => {});
                    container.querySelectorAll('.meggy-card[data-concurso-id]').forEach(card => {
                      card.onclick = () => Shell.views.concursoDetail(el, card.dataset.concursoId);
                    });
                    container.querySelectorAll('.meggy-card[data-course]').forEach(card => {
                      card.onclick = () => {
                        const cp = card.dataset.course;
                        if (cp) { Shell.router.navigate('/drives'); setTimeout(() => Shell.views._renderDrives(__canonCoursePath(cp)), 50); }
                      };
                    });
                    // ★ v2.10.4 + v2.15.4 Q2: confirmação via _v215Confirm
                    //   (gdiModal → modal inline do próprio shell). O confirm()
                    //   nativo era auto-dispensado por navegadores automatizados
                    //   e o ✕ não fazia nada — nunca mais confirm() aqui.
                    const askRemove = async (title, msg) => {
                      return Shell.views._v215Confirm(title, msg, 'Remover');
                    };
                    container.querySelectorAll('.concurso-remove-btn').forEach(btn => {
                      btn.onclick = async (e) => {
                        e.stopPropagation();
                        const id = btn.dataset.concursoId;
                        const name = btn.dataset.concursoName || 'este concurso';
                        if (!(await askRemove('Remover concurso', 'Remover "' + name + '"? As disciplinas e aulas vinculadas serao apagadas. Esta acao nao pode ser desfeita.'))) return;
                        try {
                          const r = await fetch('/api/concursos/' + encodeURIComponent(id), { method: 'DELETE', credentials: 'include' });
                          const d = await r.json().catch(() => ({}));
                          // ★ v2.15.5 (item 6): 404 = o servidor já não tem o
                          //   item — prossegue com a limpeza local e o re-render.
                          const _gone404 = r.status === 404;
                          if ((!r.ok && !_gone404) || (!d.ok && !_gone404)) throw new Error((d && (d.error || d.message)) || ('HTTP ' + r.status));
                          // ★ v2.15.2 (I): invalidar o cache unificado — sem
                          //   isso o módulo re-renderizava a lista antiga e
                          //   o card do concurso ficava até o reload.
                          try { if (window.__gdiStudy && window.__gdiStudy.courses && window.__gdiStudy.courses.invalidateUnifiedCache) window.__gdiStudy.courses.invalidateUnifiedCache(); } catch (_) {}
                          try { if (typeof Bus !== 'undefined' && Bus.emit) Bus.emit('courses:changed', {}); } catch (_) {}
                          Shell.views.cursos(el);
                        } catch (err) { Shell.views._v215Err('Não foi possível remover', err.message); }
                      };
                    });
                    container.querySelectorAll('.course-remove-btn').forEach(btn => {
                      btn.onclick = async (e) => {
                        e.stopPropagation();
                        const cp = btn.dataset.coursePath;
                        const name = btn.dataset.courseName || 'este curso';
                        if (!(await askRemove('Remover curso', 'Remover "' + name + '" da sua lista? A pasta no Drive nao sera apagada.'))) return;
                        try {
                          const r = await fetch('/api/courses/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ coursePath: cp }) });
                          const d = await r.json().catch(() => ({}));
                          // ★ v2.15.5 (item 6): 404 = "curso não encontrado" no
                          //   servidor (curso só-local, nunca registrado) —
                          //   a remoção local prossegue; só outra falha aborta.
                          const _gone404 = r.status === 404;
                          if ((!r.ok && !_gone404) || (!d.ok && !_gone404)) throw new Error((d && (d.error || d.message)) || ('HTTP ' + r.status));
                          // ★ v2.14.8: o módulo lê os cursos do localStorage (LS_MANUAL) — se
                          //   o fallback só apaga no servidor, o curso volta no reload/render
                          //   do módulo. Limpa o manual + ocultos e invalida o cache unificado.
                          try {
                            const _normCp = (s) => String(s || '').toLowerCase().replace(/\/+$/, '');
                            const _dec = (s) => { try { return decodeURIComponent(s); } catch (_) { return s; } };
                            const _want = _normCp(_dec(cp));
                            const _man = JSON.parse(localStorage.getItem('gdi-manual-courses-v1') || '[]');
                            if (Array.isArray(_man)) localStorage.setItem('gdi-manual-courses-v1', JSON.stringify(_man.filter(m => !m || _normCp(_dec(m.path)) !== _want)));
                            const _hid = JSON.parse(localStorage.getItem('gdi-hidden-courses-v1') || '[]');
                            if (Array.isArray(_hid)) localStorage.setItem('gdi-hidden-courses-v1', JSON.stringify(_hid.filter(h => _normCp(_dec(h)) !== _want)));
                          } catch (_) {}
                          try { if (window.__gdiStudy && window.__gdiStudy.courses && window.__gdiStudy.courses.invalidateUnifiedCache) window.__gdiStudy.courses.invalidateUnifiedCache(); } catch (_) {}
                          try { if (typeof Bus !== 'undefined' && Bus.emit) Bus.emit('courses:changed', {}); } catch (_) {}
                          Shell.views.cursos(el);
                        } catch (err) { Shell.views._v215Err('Não foi possível remover', err.message); }
                      };
                    });
                  }
                } else {
                  container.innerHTML = '<div class="meggy-placeholder"><div class="meggy-placeholder-icon">📚</div><div class="meggy-placeholder-title">Nenhum curso adicionado</div><div class="meggy-placeholder-desc">Vá em Explorar Drives para adicionar cursos.</div><button class="meggy-header-btn" onclick="Shell.router.navigate(\'/drives\')" style="margin-top:16px;"><i class="bi bi-cloud"></i> Explorar Drives</button></div>';
                }
              } catch (apiErr) {
                container.innerHTML = '<div class="meggy-placeholder"><div class="meggy-placeholder-icon">⚠️</div><div class="meggy-placeholder-title">Erro de conexão</div><div class="meggy-placeholder-desc">' + (apiErr.message || 'Tente novamente em alguns segundos.') + '</div></div>';
              }
              // ★ v2.15.19 (L): cauda longa — o módulo pode chegar DEPOIS
              //   da espera (loader lento); quando chegar, re-renderiza 1×
              //   p/ a vista do módulo (só se ainda em /cursos). Sem isto
              //   o fallback ficava p/ sempre (nada escutava o evento).
              Shell.views._armCursosModuleUpgrade();
            }
          } catch (e) {
            console.error('[Shell] cursos view:', e);
            document.getElementById('meggy-cursos-container').innerHTML = `
              <div class="meggy-placeholder">
                <div class="meggy-placeholder-icon">⚠️</div>
                <div class="meggy-placeholder-title">Erro ao carregar cursos</div>
                <div class="meggy-placeholder-desc">${e.message}</div>
              </div>`;
          }
        })();
      },

      // ★ v2.15.5 (item 7): tela de resultados da busca global — rota real
      //   '/search?q=...'. Busca nas rotas VIVAS do worker: aulas no D1
      //   (GET /api/d1/lessons/search) + cursos por nome no unificado.
      //   Nunca navega p/ pseudo-caminho de drive (o antigo '/0:search'
      //   caía na Home). Sem confirm()/alert()/prompt().
      search(el) {
        const q = (new URLSearchParams(window.location.search).get('q') || '').trim();
        // ★ v2.15.7 (P6): guarda de geração — uma segunda busca (2º Enter,
        //   navegação repetida, ou busca vazia) não pode ser sobrescrita
        //   pela resposta defasada da primeira (o 1º clique caía num card
        //   órfão). O contador fica aqui, antes do early-return de q vazio.
        Shell.views._searchGen = (Shell.views._searchGen || 0) + 1;
        const _gen = Shell.views._searchGen;
        const input = document.getElementById('meggy-search-input');
        if (input && input.value !== q) input.value = q;
        el.innerHTML = `
          <div class="meggy-view-header">
            <h1 class="meggy-view-title">🔍 Busca</h1>
          </div>
          <div id="meggy-search-results">
            <div class="meggy-loading"><div class="spinner-border" role="status"></div><div>Buscando…</div></div>
          </div>
        `;
        const box = document.getElementById('meggy-search-results');
        if (!q) {
          box.innerHTML = '<div class="meggy-placeholder"><div class="meggy-placeholder-icon">🔍</div><div class="meggy-placeholder-title">Busque por uma aula ou curso</div><div class="meggy-placeholder-desc">Digite no campo de busca no topo e pressione Enter.</div></div>';
          return;
        }
        const esc = Shell._esc;
        const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const nq = norm(q);
        // ★ v2.15.6 (P6): abre a aula no player inline, sem reload — o
        //   location.href p/ ?a=view recarregava a página e o boot caía na
        //   Home (o renderView não honrava ?a=view).
        const openLesson = (p) => { if (p) Shell.views._openLessonPath(p); };
        (async () => {
          let lessons = [], courses = [], err = null, _lessonFolders = null;
          try {
            const [rl, ru] = await Promise.all([
              fetch('/api/d1/lessons/search?q=' + encodeURIComponent(q) + '&limit=50', { credentials: 'include', cache: 'no-store' }),
              fetch('/api/courses/unified', { credentials: 'include', cache: 'no-store' })
            ]);
            const dl = await rl.json().catch(() => ({}));
            const du = await ru.json().catch(() => ({}));
            if (dl && dl.ok) lessons = dl.lessons || [];
            if (dl && dl.lessonFolders != null) _lessonFolders = dl.lessonFolders; // ★ v2.15.7 (dedup): captura no escopo do try — 'dl' é const do try e não existe fora dele (F3b usava 'dl' fora do try → ReferenceError real).
            else if (dl && dl.error) err = dl.error;
            // ★ v2.15.19 (S — item 6d): a busca global só casava nome e
            //   coursePath — “tudo de tribunais” não casava “CURSOS 2026”
            //   nem “/9:/CURSOS 2026”. Casa também o nome canónico do
            //   drive (mesma regra B1). O lado das aulas não muda
            //   (server-side no D1).
            if (du && du.ok) courses = (du.items || []).filter(it => norm(it.name || '').includes(nq) || norm(it.coursePath || '').includes(nq) || norm(__driveNameOf(it.coursePath)).includes(nq));
          } catch (e) { err = e.message; }
          if (_gen !== Shell.views._searchGen || !box.isConnected) return;
          if (err && !lessons.length && !courses.length) {
            box.innerHTML = '<div class="meggy-placeholder"><div class="meggy-placeholder-icon">⚠️</div><div class="meggy-placeholder-title">Erro na busca</div><div class="meggy-placeholder-desc">' + esc(err) + '</div></div>';
            return;
          }
          // ★ v2.15.7 (dedup): o total da busca é o nº de PASTAS DE AULA
          //   (lessonFolders do servidor); "mostrando N" quando o limite
          //   de 50 pastas corta a lista.
          let _totAulas = lessons.length;
          let _totNote = '';
          if (_lessonFolders != null) { _totAulas = _lessonFolders; if (_lessonFolders > lessons.length) _totNote = ' (mostrando ' + lessons.length + ')'; }
          let html = '<div style="color:#9aa4b8;font-size:13px;margin-bottom:14px;">Resultados para <b style="color:#e6edf3;">' + esc(q) + '</b> — ' + courses.length + ' curso(s) · ' + _totAulas + ' aula(s)' + _totNote + '</div>';
          if (courses.length) {
            html += '<div class="meggy-continue-section"><h2>📚 Cursos</h2><div class="meggy-cards-grid">' + courses.map(it => {
              const name = it.name || 'Curso';
              const badge = it.kind === 'concurso' ? '📌 Concurso' : it.kind === 'featured' ? '⭐ Em destaque' : '📚 Curso';
              // ★ v2.15.19 (S — item 6a, consistência): o cartão de resultado
              //   da busca global tinha o mesmo padrão sem drive — mesmo
              //   tratamento do fallback de /cursos; concursos sem drive.
              const __drv = it.kind === 'concurso' ? '' : __driveNameOf(it.coursePath);
              // ★ v2.15.28 (A): total 0 em destaque = "aulas em breve".
              const meta = badge + (__drv ? ' · ' + __drv : '') + (it.kind === 'concurso' ? '' : ' · ' + __v21528CountText(it));
              return '<div class="meggy-card" data-search-course="' + esc(it.coursePath || '') + '" data-search-concurso="' + esc(it.concursoId || '') + '" style="cursor:pointer;"><div class="meggy-card-icon">' + esc(it.icon || '📚') + '</div><div class="meggy-card-title">' + esc(name) + '</div><div class="meggy-card-meta">' + esc(meta) + '</div></div>';
            }).join('') + '</div></div>';
          }
          if (lessons.length) {
            html += '<div class="meggy-continue-section"><h2>🎬 Aulas</h2><div style="display:flex;flex-direction:column;gap:8px;">' + lessons.map(l => {
              // ★ v2.15.7 (P6): o título é a PASTA da aula ("Aula 09 - Crime
              //   Doloso e Culposo — 001 - aula.mp4") — o lesson_name é
              //   genérico ("001 - aula.mp4" ×201 no D1) e dois resultados
              //   pareciam o mesmo card; a Aula 09 ESTAVA no resultado e
              //   era indistinguível. O módulo vai no meta.
              const _dec = (s) => { try { return decodeURIComponent(String(s || '')); } catch (_) { return String(s || ''); } };
              const name = (() => {
                try { if (typeof Shell.views._v215LessonDisplayName === 'function') return Shell.views._v215LessonDisplayName({ path: l.lesson_path || '', name: l.lesson_name || '' }); } catch (_) {}
                const _f = _dec(String(l.lesson_path || '').split('/').filter(Boolean).slice(-2, -1)[0] || '');
                const _nm = l.lesson_name || l.lesson_path || 'Aula';
                return _f && _f !== _nm ? _f + ' — ' + _nm : _nm;
              })();
              const _lsegs = String(l.lesson_path || '').split('/').filter(Boolean);
              const _mod = _lsegs.length >= 3 ? _dec(_lsegs[_lsegs.length - 3]) : '';
              const _cc = _dec((l.course_path || '').split('/').filter(Boolean).pop() || '');
              const course = _mod ? _mod + ' · ' + _cc : _cc;
              const badges = [(l.has_summary ? '📝 Resumo' : ''), (l.has_questions ? '🧠 Questões' : ''), (l.has_flashcards ? '🗂️ Flashcards' : '')].filter(Boolean).join(' · ');
              return '<div class="meggy-card" data-search-lesson="' + esc(l.lesson_path || '') + '" style="cursor:pointer;display:flex;gap:12px;align-items:center;"><div class="meggy-card-icon" style="font-size:20px;">🎬</div><div style="flex:1;min-width:0;"><div class="meggy-card-title" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(name) + '</div><div class="meggy-card-meta">' + esc(course) + (badges ? ' · ' + esc(badges) : '') + '</div></div></div>';
            }).join('') + '</div></div>';
          }
          if (!courses.length && !lessons.length) {
            // ★ v2.15.9 (B — busca PF, Passo 13): a busca lê o D1 e o D1
            //   só tem as aulas dos cursos já escaneados — uma pasta do
            //   Drive ainda não indexada (ex.: ALFACON 2026 / PF) NÃO
            //   aparece aqui mesmo existindo no Drive. Dizer isto no
            //   vazio evita o "0 resultados" sem explicação.
            html += '<div class="meggy-placeholder"><div class="meggy-placeholder-icon">🔍</div><div class="meggy-placeholder-title">Nenhum resultado</div><div class="meggy-placeholder-desc">Nada encontrado para "' + esc(q) + '" nas aulas indexadas. A busca só cobre os cursos já escaneados — uma pasta do Drive ainda não indexada não aparece aqui. Tente outro termo ou procure a pasta em Explorar Drives.</div></div>';
          }
          box.innerHTML = html;
          box.querySelectorAll('[data-search-lesson]').forEach(card => { card.onclick = () => openLesson(card.dataset.searchLesson); });
          box.querySelectorAll('[data-search-course]').forEach(card => {
            card.onclick = () => {
              if (card.dataset.searchConcurso) { Shell.router.navigate('/cursos'); setTimeout(() => { if (Shell.views.concursoDetail) Shell.views.concursoDetail(document.getElementById('meggy-main'), card.dataset.searchConcurso); }, 50); return; }
              const cp = card.dataset.searchCourse;
              if (cp) { Shell.router.navigate('/drives'); setTimeout(() => Shell.views._renderDrives(__canonCoursePath(cp)), 50); }
            };
          });
        })();
      },

      // ★ v2.15.3 (item 7): re-busca o unificado e re-renderiza a faixa
      //   "💡 Dica da Meggy" (#meggy-cursos-tips). Chamado na entrada da
      //   view cursos e após cada remoção/ocultação/adição no módulo.
      _refreshCursosTips() {
        // ★ v2.15.5 (item 5): no-store — sem isto o navegador servia a lista
        //   pré-remoção e a dica continuava citando o curso removido.
        fetch('/api/courses/unified', { credentials: 'include', cache: 'no-store' }).then(r => r.json()).then(d => { if (d && d.ok) Shell.views._renderCursosTips(d.items || []); }).catch(() => {});
      },

      // ★ v2.6: faixa de dicas da Meggy na área Meus Cursos (a partir do progresso)
      _renderCursosTips(items) {
        const strip = document.getElementById('meggy-cursos-tips');
        if (!strip) return;
        const courses = (items || []).filter(i => i.kind === 'course' && i.total > 0);
        if (!courses.length) { strip.innerHTML = ''; return; }
        const done = courses.reduce((a, c) => a + (c.watched || 0), 0);
        const tot = courses.reduce((a, c) => a + (c.total || 0), 0);
        const pct = tot > 0 ? Math.round(done / tot * 100) : 0;
        const next = courses.filter(c => (c.percent || 0) < 100).sort((a, b) => (a.percent || 0) - (b.percent || 0))[0];
        strip.innerHTML = '<div style="background:rgba(93,222,218,0.08);border:1px solid rgba(93,222,218,0.25);border-radius:10px;padding:10px 14px;font-size:13px;color:#c9d1d9;">💡 <b style="color:#5ddeda;">Dica da Meggy:</b> você já concluiu ' + done + ' de ' + tot + ' aulas (' + pct + '%).' + (next ? ' Que tal continuar <b>' + Shell._esc(next.name) + '</b> (' + (next.percent || 0) + '% concluído)?' : ' Parabéns, tudo em dia! 🐩') + '</div>';
      },

      drives(el, initialPath) {
        el.innerHTML = `
          <div class="meggy-view-header">
            <h1 class="meggy-view-title">☁️ Explorar Drives</h1>
            <div class="meggy-breadcrumb" id="meggy-drives-breadcrumb"></div>
          </div>
          <div id="meggy-drives-container">
            <div class="meggy-loading">
              <div class="spinner-border" role="status"></div>
              <div>Carregando drives...</div>
            </div>
          </div>
        `;
        Shell.views._renderDrives(initialPath || '/');
      },

      async _renderDrives(path) {
        const container = document.getElementById('meggy-drives-container');
        const bc = document.getElementById('meggy-drives-breadcrumb');
        // ★ v2.15.17 (A): normaliza caminho de pasta de drive — o worker
        //   (apiRequest) só lista pastas cujo caminho termina em '/'; sem
        //   a barra final cai no ramo get_single_file e a listagem volta
        //   []. Deep links (destaque, gémeo) chegam sem a barra.
        if (typeof path === 'string' && /^\/\d+:\//.test(path) && !path.endsWith('/')) path += '/';
        // ★ Guardar pasta atual para o player usar (interfolder + material)
        Shell.state.currentFolderPath = path;

        try {
          if (path === '/' || !path) {
            // Show drives list
            const drives = window.drive_names || [];
            container.innerHTML = '<div class="meggy-cards-grid">' +
              drives.map((name, i) => {
                const icon = ['⚖️','📚','🎯','🎨','🎼','🏆','💪','🧘','⚕️','⚖️','🎓','🛡️'][i] || '📁';
                // ★ v2.15.30 (A): capa pela MESMA hierarquia dos tiles de
                //   curso (__v21528TileCoverHtml + upgrade da biblioteca):
                //   o emoji solto não é capa — ALFACON e TUDO DE TRIBUNAIS
                //   ficavam sem imagem. Sem coverUrl o cartão marca-se p/
                //   o upgrade; a arte padrão (gradiente+ícone) nunca deixa
                //   a área 16:9 vazia, e o <img> que falha volta p/ ela.
                const cover = __v21528TileCoverHtml({}, icon);
                const mark = ' data-v21528-cover="" data-v21528-cover-name="' + Shell._esc(name || '') + '" data-v21528-cover-path=""';
                return '<div class="meggy-card" data-drive="' + i + '"' + mark + '>' +
                  cover +
                  '<div class="meggy-card-title meggy-card-title-drive" title="' + Shell._esc(name || '') + '">' + Shell._esc(name || '') + '</div>' +
                  '<div class="meggy-card-meta">Drive ' + i + '</div>' +
                '</div>';
              }).join('') +
              '</div>';
            // ★ v2.15.30 (A): upgrade das capas da biblioteca (assíncrono,
            //   mesma chamada do bloco gémeo da Home).
            __v21528UpgradeTileCovers(container).catch(() => {});
            container.querySelectorAll('.meggy-card[data-drive]').forEach(card => {
              card.onclick = () => Shell.views._renderDrives('/' + card.dataset.drive + ':/');
            });
            bc.innerHTML = '<a data-path="/">Home</a> <span class="meggy-breadcrumb-sep">/</span> <span>Drives</span>';
            bc.querySelector('a').onclick = () => Shell.router.navigate('/');
          } else {
            // Browse folder using gdiListAllFiles
            container.innerHTML = '<div class="meggy-loading"><div class="spinner-border"></div><div>Carregando pasta...</div></div>';

            // Update breadcrumb
            const parts = path.split('/').filter(Boolean);
            let bcHTML = '<a data-path="/">Home</a> <span class="meggy-breadcrumb-sep">/</span> ' +
                         '<a data-path="/drives">Drives</a>';
            let cumPath = '';
            for (const part of parts) {
              cumPath += '/' + part;
              const label = part.match(/^\d+:$/) ? (window.drive_names[+part.slice(0, -1)] || part) : decodeURIComponent(part);
              const shortLabel = label.length > 20 ? label.slice(0, 17) + '…' : label;
              bcHTML += ` <span class="meggy-breadcrumb-sep">/</span> <a data-path="${cumPath}/">${shortLabel}</a>`;
            }
            bc.innerHTML = bcHTML;
            bc.querySelectorAll('a').forEach(a => {
              a.onclick = () => {
                const p = a.dataset.path;
                if (p === '/') Shell.router.navigate('/');
                else if (p === '/drives') Shell.views._renderDrives('/');
                else Shell.views._renderDrives(p);
              };
            });

            // Fetch files — gdi-utils.js (lean) provides gdiListAllFiles; if missing, lazy-load full GDIndex
            if (window.gdiListAllFiles) {
              const pw = window.gdiGetPw ? window.gdiGetPw() : '';
              window.gdiListAllFiles(path, pw).then(files => {
                // ★ v2.15.5 (item 4): fetch defasado (o usuário já navegou
                //   para outra pasta) não sobrescreve a lista atual.
                if (Shell.state.currentFolderPath !== path) return;
                if (!files || !files.length) {
                  // ★ v2.15.8 (B): pasta sem itens ≠ pasta inexistente —
                  //   consulta o status no worker antes de dizer "Pasta
                  //   vazia" (v. _renderDrivesEmpty). /11:/CURSOS 2026 não
                  //   existe no drive 11 (not-found real, provado na
                  //   v2.15.7) e aparecia como "Pasta vazia" sem explicação.
                  Shell.views._renderDrivesEmpty(container, path);
                  return;
                }
                const folders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
                const videos = files.filter(f => (f.mimeType || '').startsWith('video/') || f.name.endsWith('.mp4'));
                const others = files.filter(f => !folders.includes(f) && !videos.includes(f));

                // ★ v2.15.2 (C): multi-seleção — o checkbox só existia no modal
                //   "Adicionar Pasta de Curso". Mesmo fluxo de anexo.
                let html = '<div style="display:flex;justify-content:flex-end;margin-bottom:8px;"><button class="meggy-header-btn" id="v215-drives-add-selected" disabled style="font-size:12px;opacity:0.5;">＋ Adicionar selecionadas (0)</button></div>';
                html += '<div class="meggy-cards-grid">';
                for (const f of folders) {
                  const fp = path + encodeURIComponent(f.name) + '/';
                  html += `
                    <div class="meggy-card" data-folder="${path}${f.name}/" style="position:relative;">
                      <input type="checkbox" class="v215-folder-check" data-path="${fp}" title="Selecionar para adicionar ao curso" style="position:absolute;top:8px;left:8px;accent-color:#ff8b9f;cursor:pointer;z-index:2;" />
                      <div class="meggy-card-icon">📁</div>
                      <div class="meggy-card-title">${f.name}</div>
                      <div class="meggy-card-meta">Pasta</div>
                    </div>`;
                }
                for (const f of videos) {
                  html += `
                    <div class="meggy-card" data-video="${f.link || ''}">
                      <div class="meggy-card-icon">🎬</div>
                      <div class="meggy-card-title">${f.name}</div>
                      <div class="meggy-card-meta">${f.size ? (f.size/1024/1024).toFixed(1)+' MB' : 'Vídeo'}</div>
                    </div>`;
                }
                for (const f of others.slice(0, 20)) {
                  const icon = (f.mimeType||'').includes('pdf') ? '📄' : (f.mimeType||'').includes('audio') ? '🎵' : '📄';
                  html += `
                    <div class="meggy-card">
                      <div class="meggy-card-icon">${icon}</div>
                      <div class="meggy-card-title">${f.name}</div>
                      <div class="meggy-card-meta">${f.size ? (f.size/1024/1024).toFixed(1)+' MB' : 'Arquivo'}</div>
                    </div>`;
                }
                html += '</div>';
                container.innerHTML = html;

                // Bind folder clicks (RECURSIVE — stays in shell, NEVER location.href)
                container.querySelectorAll('.meggy-card[data-folder]').forEach(card => {
                  card.onclick = () => Shell.views._renderDrives(card.dataset.folder);
                });
                // ★ v2.15.2 (C): checkbox não navega; o botão anexa as marcadas.
                const selBtn = container.querySelector('#v215-drives-add-selected');
                const updateSel = () => {
                  const n = container.querySelectorAll('.v215-folder-check:checked').length;
                  if (selBtn) { selBtn.disabled = n === 0; selBtn.style.opacity = n === 0 ? '0.5' : '1'; selBtn.textContent = '＋ Adicionar selecionadas (' + n + ')'; }
                };
                // ★ v2.15.5 (item 4): seleção por caminho (Set guardado no
                //   container, sobrevive ao re-render) + re-aplicação; o botão
                //   lê o Set, nunca o DOM do momento.
                const drivesChecked = (container.__v215Checked && typeof container.__v215Checked.values === 'function') ? container.__v215Checked : (container.__v215Checked = Shell.views._v215NewFolderSelection());
                drivesChecked.prune(path);
                container.querySelectorAll('.v215-folder-check').forEach(cb => {
                  cb.addEventListener('click', e => e.stopPropagation());
                  cb.addEventListener('change', () => { const p = cb.dataset.path; if (cb.checked) drivesChecked.add(p); else drivesChecked.remove(p); updateSel(); });
                });
                drivesChecked.applyTo(container);
                updateSel();
                if (selBtn) selBtn.onclick = () => {
                  const paths = drivesChecked.values();
                  if (paths.length) Shell.views._v215AttachFlow(paths, document.getElementById('meggy-main'));
                };
                // Video clicks — open INLINE player with full playlist (todos os vídeos da pasta)
                const videoCards = container.querySelectorAll('.meggy-card[data-video]');
                const playlist = Array.from(videoCards).map(c => ({
                  link: c.dataset.video,
                  name: c.querySelector('.meggy-card-title')?.textContent || 'Vídeo',
                  size: c.querySelector('.meggy-card-meta')?.textContent || '',
                  folder: ''
                }));
                // ★ Guardar pasta atual ANTES de abrir player (para Voltar funcionar)
                Shell.state.previousFolderPath = Shell.state.currentFolderPath;
                videoCards.forEach((card, i) => {
                  card.onclick = () => {
                    const v = playlist[i];
                    if (v.link) {
                      Shell.state.previousFolderPath = Shell.state.currentFolderPath;
                      Shell.views._playVideoInline(v.link, v.name, playlist, i);
                    }
                  };
                });
              }).catch(err => {
                container.innerHTML = `<div class="meggy-placeholder"><div class="meggy-placeholder-icon">⚠️</div><div class="meggy-placeholder-title">Erro</div><div class="meggy-placeholder-desc">${err.message}</div></div>`;
              });
            } else {
              // Fallback: lazy load full GDIndex (app.min.js + 24 modules) and retry
              container.innerHTML = '<div class="meggy-loading"><div class="spinner-border"></div><div>Carregando GDIndex...</div></div>';
              const ok = await Shell.loadFullGDIndex();
              if (ok && window.gdiListAllFiles) {
                return Shell.views._renderDrives(path);
              } else {
                container.innerHTML = '<div class="meggy-placeholder"><div class="meggy-placeholder-icon">⚠️</div><div class="meggy-placeholder-title">gdiListAllFiles não disponível</div><div class="meggy-placeholder-desc">Falha ao carregar GDIndex completo.</div></div>';
              }
            }
          }
        } catch (e) {
          console.error('[Shell] drives view:', e);
          container.innerHTML = `<div class="meggy-placeholder"><div class="meggy-placeholder-icon">⚠️</div><div class="meggy-placeholder-title">Erro</div><div class="meggy-placeholder-desc">${e.message}</div></div>`;
        }
      },

      // ★ v2.15.8 (B): cache curto do folder-status por caminho (60 s) —
      //   navegar p/ a mesma pasta não re-pergunta ao worker.
      _folderStatusCache: new Map(),

      // ★ v2.15.8 (B): modelo PURO da explicação de pasta vazia (testável —
      //   v. v2.15.8-test-B.js). Devolve null p/ pasta que EXISTE (vazia de
      //   verdade) ou p/ status desconhecido; senão o modelo not-found.
      _drivesEmptyInfo(path, st) {
        if (!st || !st.ok || st.exists !== false) return null;
        const segs = String(path || '').split('/').filter(Boolean);
        const folder = segs.length ? segs[segs.length - 1] : '';
        let folderName = folder;
        try { folderName = decodeURIComponent(folder); } catch (_) {}
        const twin = (st.canonicalPath && st.canonicalPath !== path && st.canonicalExists) ? st.canonicalPath : null;
        return {
          kind: 'not-found',
          folderName: folderName,
          driveName: st.driveName || '',
          blocked: st.blocked || null,
          twinPath: twin,
          twinDriveName: st.canonicalDriveName || ''
        };
      },

      // ★ v2.15.8 (B): estado vazio do Explorar Drives com explicação.
      //   Pasta inexistente (not-found) mostra O MOTIVO + o caminho
      //   canônico (gêmeo) quando ele existe; pasta vazia de verdade
      //   mantém o "Pasta vazia" de antes. Falha no status → "Pasta
      //   vazia" (fail-safe, nunca pior que antes).
      async _renderDrivesEmpty(container, path) {
        const emptyHtml = '<div class="meggy-placeholder"><div class="meggy-placeholder-icon">📁</div><div class="meggy-placeholder-title">Pasta vazia</div></div>';
        if (!/^\/\d+:\//.test(String(path || ''))) { container.innerHTML = emptyHtml; return; }
        let st = null;
        try {
          const now = Date.now();
          const cached = Shell.views._folderStatusCache.get(path);
          if (cached && now - cached.t < 60000) st = cached.v;
          else {
            const r = await fetch('/api/drive/folder-status?path=' + encodeURIComponent(path), { credentials: 'include', cache: 'no-store' });
            st = await r.json().catch(() => null);
            if (st) Shell.views._folderStatusCache.set(path, { t: now, v: st });
          }
        } catch (_) { st = null; }
        if (Shell.state.currentFolderPath !== path) return;
        const info = Shell.views._drivesEmptyInfo(path, st);
        if (!info) { container.innerHTML = emptyHtml; return; }
        const esc = Shell._esc || (function(s){ return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); });
        let countHtml = '';
        if (info.twinPath) {
          try {
            const r2 = await fetch('/api/d1/lessons/by-course?path=' + encodeURIComponent(info.twinPath), { credentials: 'include', cache: 'no-store' });
            const d2 = await r2.json().catch(() => null);
            if (Shell.state.currentFolderPath !== path) return;
            if (d2 && d2.ok && typeof d2.lessonFolders === 'number' && d2.lessonFolders > 0) {
              countHtml = '<div style="margin-top:8px;font-size:13px;color:#e6edf3;">📚 <b>' + d2.lessonFolders + ' aulas</b> indexadas no D1 sob o caminho canônico.</div>';
            }
          } catch (_) {}
        }
        container.innerHTML = '<div class="meggy-placeholder">'
          + '<div class="meggy-placeholder-icon">⛔</div>'
          + '<div class="meggy-placeholder-title">Pasta não encontrada neste drive</div>'
          + '<div class="meggy-placeholder-desc">A pasta <b>' + esc(info.folderName) + '</b>' + (info.driveName ? ' não existe no drive <b>' + esc(info.driveName) + '</b>' : ' não existe neste drive') + '.'
          + (info.blocked ? ' O scanner já tentou indexar este caminho e registrou <b>' + esc(info.blocked.status || info.blocked.kind || 'not_found') + '</b>' + (info.blocked.last_error ? ' — ' + esc(info.blocked.last_error) : '') + '.' : '')
          + '</div>'
          + countHtml
          + (info.twinPath
            ? '<div style="margin-top:14px;"><button class="meggy-header-btn" id="meggy-drives-open-twin"><i class="bi bi-folder2-open"></i> Abrir no drive ' + esc(info.twinDriveName || '') + '</button></div>'
            : '<div style="margin-top:14px;"><button class="meggy-header-btn" onclick="Shell.router.navigate(\'/drives\')">← Voltar aos drives</button></div>')
          + '</div>';
        const twinBtn = container.querySelector('#meggy-drives-open-twin');
        if (twinBtn) twinBtn.onclick = function(){ Shell.views._renderDrives(info.twinPath); };
      },

      // ═══ PÁGINA DE VÍDEO — Layout Alfacon exato (vídeo + materiais lado a lado) ═══
      // ★ v2.15.6 (P6): abre uma aula pelo caminho /N:/…/ficheiro — resolve a
      //   pasta-pai, monta a playlist com os vídeos da pasta e abre o player
      //   inline. Ponto único de entrada p/ clique no resultado da busca,
      //   linhas do detalhe do concurso e deep link ?a=view. Nunca usa
      //   location.href (o reload caía na Home). Fallback: abre a pasta-pai
      //   em /drives, nunca a Home.
      // ★ v2.15.7 (P6): guarda de voo + feedback imediato. O 1º clique
      //   parecia não fazer nada enquanto a listagem da pasta carregava
      //   (list-worker frio + POST) e o 2º clique abria um 2º player por
      //   cima do 1º — agora chamadas concorrentes p/ a mesma aula aguardam
      //   a mesma promise (1 só _playVideoInline) e a main mostra
      //   "Abrindo aula..." na hora.
      async _openLessonPath(lessonPath) {
        const main = document.getElementById('meggy-main');
        if (!lessonPath) return;
        const clean = String(lessonPath).split('?')[0];
        Shell._openLessonInflight = Shell._openLessonInflight || {};
        if (Shell._openLessonInflight[clean]) return Shell._openLessonInflight[clean];
        if (main) main.innerHTML = '<div class="meggy-loading"><div class="spinner-border" role="status"></div><div>Abrindo aula…</div></div>';
        const _p = (async () => {
        const slash = clean.lastIndexOf('/');
        const folderPath = slash > 0 ? clean.slice(0, slash + 1) : '/';
        let fileName = clean.slice(slash + 1);
        try { fileName = decodeURIComponent(fileName); } catch (_) {}
        const openParent = () => {
          Shell.router.navigate('/drives');
          setTimeout(() => Shell.views._renderDrives(folderPath), 50);
        };
        // ★ v2.15.9 (B — P6b): fallback do deep link de PASTA — abre a
        //   PRÓPRIA pasta em /drives, nunca a mãe.
        const openSelf = () => {
          Shell.router.navigate('/drives');
          setTimeout(() => Shell.views._renderDrives(_stripped + '/'), 50);
        };
        // ★ v2.15.9 (B — P6b): o caminho pode ser uma PASTA (deep link
        //   /N:/…/Aula 09?a=view, sem ficheiro no fim): o último
        //   segmento não tem extensão de ficheiro. Antes, esse nome era
        //   procurado como ficheiro na listagem do PAI e falhava sempre
        //   → openParent() abria a pasta-mãe (o sintoma do Passo 13).
        //   Agora lista-se a PRÓPRIA pasta (_targetFolder) e resolve-se
        //   p/ o seu ficheiro de mídia (v. o ramo _folderInput abaixo).
        const _stripped = clean.replace(/\/+$/, '');
        const _lastSeg = _stripped.slice(_stripped.lastIndexOf('/') + 1);
        const _folderInput = !_lastSeg || !/\.[a-z0-9]{2,5}$/i.test(_lastSeg);
        const _targetFolder = _folderInput ? _stripped + '/' : folderPath;
        try {
          let files = [];
          if (typeof window.gdiListAllFiles === 'function') {
            files = (await window.gdiListAllFiles(_targetFolder)) || [];
          } else {
            const r = await fetch(_targetFolder, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page_token: null, page_index: 0 }) });
            if (!r.ok) { _folderInput ? openSelf() : openParent(); return; }
            const d = await r.json();
            files = (d.data && d.data.files) || [];
          }
          const videos = files.filter(f => /\.(mp4|webm|mov|mkv|m4v|mp3|m4a|ogg|wav|aac)$/i.test(f.name || '') || String(f.mimeType || '').indexOf('video') === 0 || String(f.mimeType || '').indexOf('audio') === 0);
          const playlist = videos.map(f => ({ link: f.link || (_targetFolder + encodeURIComponent(f.name)), name: f.name, size: f.size ? String(f.size) : '', folder: '' }));
          // ★ v2.15.7 (P6): casa pelo NOME do ficheiro, não pela cauda do
          //   link. O link real é "/download.aspx?file=…&expiry=…&mac=…"
          //   (generateLink) — a cauda "download.aspx?file=…" nunca é o
          //   nome do ficheiro, por isso o idx era SEMPRE -1 e o player
          //   abria com o caminho cru "/9:/…/001 - aula.mp4", que o worker
          //   redireciona p/ '/' (302): o <video> recebia HTML e falhava
          //   ("Unable to play media", 0:00). O caminho cru nunca tocou.
          const _decName = (s) => { let _n = String(s || ''); try { _n = decodeURIComponent(_n); } catch (_) {} return _n; };
          const _normName = (s) => _decName(s).toLowerCase().replace(/[^a-z0-9]/g, '');
          let idx;
          if (_folderInput) {
            // ★ v2.15.9 (B — P6b): a pasta resolve p/ o seu ficheiro de
            //   mídia principal — um só vídeo, ou o "001 - aula.mp4" /
            //   "video.mp4", senão o 1º vídeo da listagem. Sem mídia:
            //   abre-se a PRÓPRIA pasta em /drives (nunca a mãe).
            if (!playlist.length) { openSelf(); return; }
            const _isMain = (n) => /^(001[^/]*|video)\.(mp4|webm|mov|mkv|m4v|mp3|m4a|ogg|wav|aac)$/i.test(_decName(n).trim());
            idx = playlist.findIndex(v => _isMain(v.name));
            if (idx < 0) idx = 0;
          } else {
            idx = playlist.findIndex(v => _decName(v.name) === fileName || (_normName(v.name) && _normName(v.name) === _normName(fileName)));
            if (idx < 0) {
              // A aula não está na listagem da pasta: abre a pasta-pai em
              // /drives (nunca a Home, nunca um link cru que o worker 302ia).
              openParent();
              return;
            }
          }
          Shell.state.previousFolderPath = Shell.state.currentFolderPath;
          Shell.state.currentFolderPath = _targetFolder;
          Shell.views._playVideoInline(playlist[idx].link, playlist[idx].name, playlist, idx);
        } catch (e) {
          if (main) main.innerHTML = '<div class="meggy-placeholder"><div class="meggy-placeholder-icon">⚠️</div><div class="meggy-placeholder-title">Erro ao abrir a aula</div><div class="meggy-placeholder-desc">' + Shell._esc(e.message) + '</div></div>';
        }
        })();
        Shell._openLessonInflight[clean] = _p;
        try { await _p; } finally { if (Shell._openLessonInflight) delete Shell._openLessonInflight[clean]; }
      },

      _playVideoInline(link, name, playlist, currentIndex) {
        const main = document.getElementById('meggy-main');
        if (!main) return;
        const videoUrl = link.startsWith('http') ? link : (window.location.origin + link);
        const isAudio = name.endsWith('.mp3') || name.endsWith('.m4a') || name.endsWith('.wav') || name.endsWith('.ogg') || name.endsWith('.aac');

        let pl = playlist || [{ name: name, link: videoUrl, size: '', folder: '' }];
        let idx = currentIndex || 0;

        // ★ finalizeNames — se há duplicação de nomes, prefixa com folder
        const counts = {};
        pl.forEach(v => { const o = v.origName || v.name; counts[o] = (counts[o] || 0) + 1; });
        pl.forEach(v => { const o = v.origName || v.name; if (counts[o] > 1 && v.folder && v.name === o) v.name = v.folder + ' - ' + o; });

        let resumePos = 0;
        try {
          if (typeof GDIUser !== 'undefined' && GDIUser && GDIUser.state && GDIUser.state.resume) {
            const saved = GDIUser.state.resume[videoUrl];
            if (saved && typeof saved === 'number') resumePos = saved;
            else if (saved && saved.pos) resumePos = saved.pos;
          }
        } catch (e) {}

        if (main._cleanupKeyboard) { main._cleanupKeyboard(); main._cleanupKeyboard = null; }
        Shell.state.currentView = 'player';
        // ★ v2.15.10-E6-render-seq: cada render do player tem o seu número
        //   — o auto-clique do Interfolder (E7) só dispara se ESTE render
        //   ainda for o atual (ver E7).
        Shell._playerRenderSeq = (Shell._playerRenderSeq || 0) + 1;
        const _thisRenderSeq = Shell._playerRenderSeq;
        Shell.state.playerPlaylist = pl;
        Shell.state.playerIndex = idx;

        // ★ Sidebar retrátil
        document.body.classList.add('meggy-player-active');

        // Breadcrumb
        const folderPath = Shell.state.currentFolderPath || '';
        const parts = folderPath.split('/').filter(Boolean);
        let bcHTML = '<li><a href="/" data-nav="/" data-bc-type="home">Home</a></li><li class="gdi-bc-sep">/</li>';
        let cumPath = '';
        for (let i = 0; i < parts.length; i++) {
          cumPath += '/' + parts[i];
          const label = parts[i].match(/^\d+:$/) ? (window.drive_names?.[+parts[i].slice(0,-1)] || parts[i]) : decodeURIComponent(parts[i]);
          const short = label.length > 20 ? label.slice(0,17) + '…' : label;
          // ★ v2.15.12-C1 (P6b regressão, Passo 16): o href do breadcrumb
          //   codificava o ':' do prefixo do drive ('9:' → '9%3A') e DUPLICAVA
          //   a codificação de segmentos já codificados num load fresco
          //   ('CURSOS%202026' → 'CURSOS%25202026') — nenhuma rota do worker
          //   casa %3A, por isso o link copiado caía na Home. Agora o href é
          //   construído a partir de segmentos DESCODIFICADOS, com o prefixo
          //   'N:' literal e o resto codificado 1×: a forma canónica do Passo
          //   15. O data-nav (clique interno) não muda.
          const encoded = cumPath.split('/').map((s, si) => {
            if (si === 0) return '';
            let _d = s; try { _d = decodeURIComponent(s); } catch (_) {}
            return /^\d+:$/.test(_d) ? _d : encodeURIComponent(_d);
          }).join('/');
          bcHTML += `<li><a href="${encoded}/" data-nav="${cumPath}/" data-bc-type="folder">${short}</a></li><li class="gdi-bc-sep">/</li>`;
        }
        bcHTML += `<li class="gdi-bc-cur">${name.length > 20 ? name.slice(0,17)+'…' : name}</li>`;
        const fileSize = pl[idx]?.size || '';

        // ★ Layout Alfacon: 2 colunas (vídeo | materiais) com modes rows/cols/focus
        main.innerHTML = `
          <div class="gdi-study" id="gdi-study" style="max-width:1600px;margin:0 auto;padding:14px 16px 40px;">
            <div class="gdi-study-bar" style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
              <div class="gdi-study-bc"><ol class="gdi-bc" style="list-style:none;padding:0;margin:0;display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:13px;">${bcHTML}</ol></div>
              <div class="gdi-study-modes" style="display:flex;gap:6px;">
                <button class="gdi-mode-btn active" data-mode="split" title="Dividido" aria-pressed="true"><i class="bi bi-layout-split"></i> Dividido</button>
                <button class="gdi-mode-btn" data-mode="fv" title="Foco na aula" aria-pressed="false"><i class="bi bi-lightning-charge-fill"></i> Foco aula</button>
                <button class="gdi-mode-btn" data-mode="fm" title="Foco no material" aria-pressed="false"><i class="bi bi-file-earmark-pdf-fill"></i> Foco material</button>
                <button class="gdi-watched-btn" id="gdi-watched-btn" data-b="1" aria-pressed="false" aria-label="Marcar aula como assistida"><i class="bi bi-eye"></i> Assistido</button>
              </div>
            </div>
            <div class="gdi-study-grid" id="gdi-study-grid">
              <section class="gdi-study-left" style="display:flex;flex-direction:column;gap:12px;min-width:0;">
                <div style="display:flex;align-items:center;gap:12px;">
                  <i class="bi ${isAudio ? 'bi-music-note-beamed' : 'bi-camera-video-fill'}" style="font-size:22px;color:#ff8b9f;"></i>
                  <div style="flex:1;min-width:0;">
                    <div id="gdi-file-header-name" style="font-size:15px;font-weight:600;color:#e6edf3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>
                    <div id="gdi-file-header-meta" style="font-size:12px;color:#6b7488;">${fileSize}</div>
                    <div id="gdi-lesson-desc" style="font-size:12px;color:#9aa4b8;line-height:1.5;"></div>
                  </div>
                </div>
                <div class="gdi-player-wrap" style="background:#000;border:1px solid rgba(255,255,255,0.09);border-radius:16px;overflow:hidden;max-width:860px;width:100%;box-shadow:0 10px 30px -12px rgba(0,0,0,0.55);">
                  ${isAudio ? `
                    <div style="padding:20px;text-align:center;">
                      <div style="font-size:48px;margin-bottom:12px;">🎵</div>
                      <audio id="meggy-video" src="${videoUrl}" controls autoplay style="width:100%;"></audio>
                    </div>
                  ` : `
                    <video id="meggy-video" src="${videoUrl}" controls autoplay playsinline
                      style="display:block;width:100%;max-height:none;"
                      onerror="this.style.display='none';document.getElementById('meggy-player-error').style.display='block'">
                    </video>
                    <div id="meggy-player-error" role="alert" style="display:none;padding:40px 24px;text-align:center;color:#e6edf3;">
                      <div style="font-size:28px;margin-bottom:12px;">⚠️</div>
                      <div style="font-weight:700;margin-bottom:8px;">Não foi possível carregar este vídeo</div>
                      <div style="font-size:14px;line-height:1.5;color:#9aa4b8;margin-bottom:16px;">Verifique sua conexão e tente abrir a aula novamente — ou abra o arquivo direto.</div>
                      <a href="${videoUrl}" target="_blank" class="gdi-mode-btn" style="color:#5ddeda;">Abrir o vídeo</a>
                    </div>
                  `}
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                  <button class="gdi-mode-btn" id="gdi-prev-btn" ${idx === 0 ? 'disabled' : ''}><i class="bi bi-chevron-left"></i> Anterior</button>
                  <button class="gdi-mode-btn" id="gdi-next-btn" ${idx >= pl.length - 1 ? 'disabled' : ''}>Próxima <i class="bi bi-chevron-right"></i></button>
                  <a class="gdi-mode-btn" href="${videoUrl}" download="${name}" target="_blank" aria-label="Baixar vídeo" title="Baixar vídeo"><i class="bi bi-download"></i></a>
                  <select class="gdi-speed-select" id="gdi-speed-select" title="Velocidade de reprodução" aria-label="Velocidade de reprodução" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#e6edf3;border-radius:999px;padding:6px 10px;font-size:13px;font-family:inherit;cursor:pointer;"><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="1.75">1.75×</option><option value="2">2×</option></select>
                  <button class="gdi-mode-btn" id="gdi-fullscreen-btn" title="Tela cheia (F)"><i class="bi bi-arrows-fullscreen"></i> Tela cheia</button>
                  <button class="gdi-mode-btn" id="gdi-interfolder-btn"><i class="bi bi-collection"></i> Interfolder</button><!-- ★ v2.15.10-E1-interfolder-status: o progresso da coleta vive NESTE span, nunca no rótulo do botão — o nome acessível "Interfolder" tem de ficar estável (ver E2/E3/E4) --><span id="gdi-interfolder-status" role="status" aria-live="polite" style="align-self:center;font-size:12px;color:#9aa4b8;white-space:nowrap;"></span>
                  <button class="gdi-mode-btn" id="gdi-meggy-ai-btn" style="background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;border:none;"><i class="bi bi-robot"></i> Meggy</button>
                </div>
                <div class="gdi-notes" style="background:rgba(255,255,255,0.043);border:1px solid rgba(255,255,255,0.09);border-radius:10px;padding:12px;">
                  <div style="font-size:14px;font-weight:600;color:#e6edf3;margin-bottom:8px;">📝 Anotações</div>
                  <textarea id="gdi-note-input" rows="2" placeholder="Digite sua anotação..." style="width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:6px;padding:8px;color:#e6edf3;font-family:inherit;font-size:13px;resize:vertical;outline:none;"></textarea>
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
                    <span id="gdi-note-time" role="button" tabindex="0" aria-label="Ir para um momento do vídeo" style="cursor:pointer;font-size:12px;color:#5ddeda;">00:00</span>
                    <button id="gdi-note-save" style="background:rgba(255,139,159,0.12);border:1px solid rgba(255,139,159,0.3);color:#ff8b9f;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;"><i class="bi bi-save"></i> Salvar</button>
                  </div>
                  <div id="gdi-notes-list" style="margin-top:8px;"></div>
                </div>
                <div id="gdi-playlist-wrap" style="background:rgba(255,255,255,0.043);border:1px solid rgba(255,255,255,0.09);border-radius:10px;padding:8px;">
                  <button id="gdi-pl-toggle" class="gdi-mode-btn" aria-expanded="false" aria-controls="gdi-playlist-body" style="width:100%;justify-content:flex-start;padding:8px 10px;font-size:12px;">
                    <i class="bi bi-collection-play me-2"></i><strong>Playlist</strong>
                    <span id="gdi-pl-count" style="font-size:11px;color:#9aa4b8;margin-left:6px;">${idx + 1} / ${pl.length}</span>
                    <i id="gdi-pl-chev" class="bi bi-chevron-down" style="margin-left:auto;"></i>
                  </button>
                  <div id="gdi-playlist-body" style="overflow-y:auto;border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:6px;background:rgba(0,0,0,0.2);max-height:240px;display:none;margin-top:6px;">
                    <div id="gdi-playlist-list">
                      ${pl.map((v, i) => `<div class="gdi-playlist-item ${i === idx ? 'cur' : ''}" data-idx="${i}" title="${v.name}" role="button" tabindex="0" aria-label="Reproduzir ${v.name}" style="display:flex;justify-content:space-between;align-items:center;padding:12px 10px;border-radius:6px;cursor:pointer;font-size:12px;color:${i === idx ? '#ff8b9f' : '#9aa4b8'};${i === idx ? 'background:rgba(255,139,159,0.12);' : ''}"><div style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><i class="bi ${i === idx ? 'bi-play-fill' : 'bi-film'} me-2"></i><span style="font-weight:${i === idx ? '600' : '400'};">${v.name}</span></div><span class="gdi-pl-size" style="font-size:10px;color:#6b7488;margin-left:8px;">${v.size || ''}</span></div>`).join('')}
                    </div>
                  </div>
                </div>
              </section>
              <aside class="gdi-study-right" id="gdi-slot-right" style="display:flex;flex-direction:column;gap:8px;min-width:0;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <div id="gdi-mat-tabs" style="display:flex;flex-wrap:wrap;gap:6px;flex:1;">
                    <span style="font-size:12px;color:#6b7488;padding:8px;">Buscando materiais…</span>
                  </div>
                </div>
                <div style="font-size:11px;color:#6b7488;padding:2px 0;">
                  <strong><i class="bi bi-journal-bookmark-fill" style="color:#ff8b9f;"></i> Materiais da aula</strong>
                  <span id="gdi-mat-status" style="margin-left:8px;">buscando…</span>
                </div>
                <div id="gdi-mat-body" style="background:rgba(22,27,38,0.72);border:1px solid rgba(255,255,255,0.09);border-radius:16px;min-height:420px;height:calc(100vh - 250px);height:calc(100dvh - 250px);overflow:hidden;"></div>
              </aside>
            </div>
          </div>
        `;

        const video = document.getElementById('meggy-video');
        const timeEl = document.getElementById('gdi-note-time');
        const plCountEl = document.getElementById('gdi-pl-count');

        // ★ v2.15.4 P1-09: fullscreen com fallback p/ iOS antigo
        //   (video.webkitEnterFullscreen) — usado pelo botão de tela cheia
        //   (P0-03) e pela tecla F. O requestFullscreen pode devolver
        //   undefined em navegadores antigos — por isso o guard no .catch.
        const goFullscreen = () => {
          try {
            if (document.fullscreenElement || document.webkitFullscreenElement) {
              if (document.exitFullscreen) document.exitFullscreen();
              else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
              return;
            }
            const wrap = video ? video.closest('.gdi-player-wrap') : null;
            const tryEl = (el) => {
              if (!el) return false;
              try {
                if (el.requestFullscreen) { const p = el.requestFullscreen(); if (p && typeof p.catch === 'function') p.catch(() => { try { if (video && video.webkitEnterFullscreen) video.webkitEnterFullscreen(); } catch (_) {} }); return true; }
              } catch (_) {}
              return false;
            };
            if (tryEl(wrap)) return;
            if (tryEl(video)) return;
            if (video && video.webkitEnterFullscreen) video.webkitEnterFullscreen();
          } catch (_) {}
        };

        // ★ v2.15.4 P1-09: toque duplo no vídeo (±10s por lado; dois
        //   touchend <300ms; esquerda volta, direita avança). Não há
        //   dblclick no touch — por isso a detecção é por touchend.
        if (video) {
          let __lastTapAt = 0;
          video.addEventListener('touchend', (e) => {
            const now = Date.now();
            const t = (e.changedTouches && e.changedTouches[0]) || null;
            const x = t ? t.clientX : 0;
            if (now - __lastTapAt < 300) {
              __lastTapAt = 0;
              try {
                const r = video.getBoundingClientRect();
                const mid = r.left + r.width / 2;
                video.currentTime = x < mid ? Math.max(0, video.currentTime - 10) : Math.min(video.duration || 0, video.currentTime + 10);
              } catch (_) {}
            } else { __lastTapAt = now; }
          });
        }

        let lastSave = 0;
        const saveResume = () => {
          if (!video?.currentTime) return;
          const now = Date.now();
          if (now - lastSave < 5000) return;
          lastSave = now;
          try { window.GDIUser?.setResume?.(videoUrl, video.currentTime, video.duration || 0); } catch (e) {}
        };

        function formatTime(s) {
          if (!isFinite(s)) return '00:00';
          s = Math.floor(s);
          const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
          return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`;
        }

        if (video) {
          video.addEventListener('loadedmetadata', () => {
            if (resumePos > 10 && video.duration && resumePos < video.duration * 0.9) {
              video.currentTime = resumePos;
              const toast = document.createElement('div');
              toast.className = 'meggy-toast-resume';
              toast.innerHTML = `<i class="bi bi-clock-history"></i> Retomando de <b>&nbsp;${formatTime(resumePos)}</b><button class="meggy-toast-btn">Recomeçar</button>`;
              main.appendChild(toast);
              toast.querySelector('.meggy-toast-btn').onclick = () => { video.currentTime = 0; toast.remove(); };
              setTimeout(() => { toast.classList.add('meggy-toast-out'); setTimeout(() => toast.remove(), 250); }, 7000);
            }
          });
          video.addEventListener('timeupdate', () => { timeEl.textContent = formatTime(video.currentTime); saveResume(); });
          video.addEventListener('ended', () => { if (idx < pl.length - 1) switchTo(idx + 1); });
        }

        function switchTo(newIdx) {
          if (newIdx < 0 || newIdx >= pl.length) return;
          const v = pl[newIdx];
          idx = newIdx;
          Shell.state.playerIndex = idx;
          video.src = v.link.startsWith('http') ? v.link : (window.location.origin + v.link);
          video.play().catch(() => {});
          document.getElementById('gdi-file-header-name').textContent = v.name;
          document.getElementById('gdi-file-header-meta').textContent = v.size || '';
          plCountEl.textContent = `${idx + 1} / ${pl.length}`;
          document.querySelectorAll('.gdi-playlist-item').forEach((el, i) => {
            const isCur = i === idx;
            el.style.color = isCur ? '#ff8b9f' : '#9aa4b8';
            el.style.background = isCur ? 'rgba(255,139,159,0.12)' : '';
            const span = el.querySelector('span'); if (span) span.style.fontWeight = isCur ? '600' : '400';
          });
          document.getElementById('gdi-prev-btn').disabled = idx === 0;
          document.getElementById('gdi-next-btn').disabled = idx >= pl.length - 1;
          updateLessonDescription();
          main.scrollTop = 0;
        }

        // Modos — usar CSS classes (visibility/position) em vez de display:none (C1: não destrói iframes)
        document.querySelectorAll('.gdi-mode-btn[data-mode]').forEach(btn => {
          btn.onclick = () => {
            document.querySelectorAll('.gdi-mode-btn[data-mode]').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
            btn.classList.add('active');
            btn.setAttribute('aria-pressed', 'true');
            const grid = document.getElementById('gdi-study-grid');
            const mode = btn.dataset.mode;
            if (mode === 'fv') {
              grid.classList.add('mode-fv');
              grid.classList.remove('mode-fm');
            } else if (mode === 'fm') {
              grid.classList.add('mode-fm');
              grid.classList.remove('mode-fv');
            } else {
              grid.classList.remove('mode-fv', 'mode-fm');
            }
            // Re-trigger material reload se necessário (iframe em branco)
            const matBody = document.getElementById('gdi-mat-body');
            if ((mode === 'fm' || mode === 'split') && matBody && (!matBody.innerHTML.trim() || matBody.querySelector('iframe[src=""]'))) {
              const activeTab = document.querySelector('.gdi-mat-tab.active');
              if (activeTab) setTimeout(() => activeTab.click(), 50);
              else setTimeout(loadMaterials, 100);
            }
          };
        });

        // Assistido
        document.getElementById('gdi-watched-btn').onclick = function() {
          const w = this.dataset.b === '1';
          this.dataset.b = w ? '0' : '1';
          this.classList.toggle('done', !w);
          this.setAttribute('aria-pressed', String(!w));
          this.innerHTML = !w ? '<i class="bi bi-eye-fill"></i> Assistida ✓' : '<i class="bi bi-eye"></i> Assistido';
          try { if (window.GDIUser?.setWatched) window.GDIUser.setWatched(videoUrl, !w); } catch (e) {}
        };

        document.getElementById('gdi-prev-btn').onclick = () => { if (idx > 0) switchTo(idx - 1); };
        document.getElementById('gdi-next-btn').onclick = () => { if (idx < pl.length - 1) switchTo(idx + 1); };

        // Playlist dropdown
        const plBody = document.getElementById('gdi-playlist-body');
        const plChev = document.getElementById('gdi-pl-chev');
        document.getElementById('gdi-pl-toggle').onclick = () => {
          const isOpen = plBody.style.display !== 'none';
          plBody.style.display = isOpen ? 'none' : 'block';
          plChev.className = isOpen ? 'bi bi-chevron-down' : 'bi bi-chevron-up';
          document.getElementById('gdi-pl-toggle').setAttribute('aria-expanded', String(!isOpen));
        };
        document.querySelectorAll('.gdi-playlist-item').forEach(item => {
          item.onclick = () => { const i = parseInt(item.dataset.idx); if (i !== idx) switchTo(i); };
          // ★ v2.15.4 DESIGN: item é botão (role+tabindex no markup) — Enter/Espaço ativam (teclado/D-pad).
          item.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.click(); } };
        });

        // Breadcrumb
        document.querySelectorAll('.gdi-bc a[data-nav]').forEach(a => {
          a.onclick = (e) => {
            e.preventDefault();
            if (a.dataset.bcType === 'home') Shell.router.navigate('/');
            else { Shell.router.navigate('/drives'); setTimeout(() => Shell.views._renderDrives(a.dataset.nav), 50); }
          };
        });

        // Meggy AI
        document.getElementById('gdi-meggy-ai-btn').onclick = () => Shell.openMeggyAIDrawer();

        // ★ v2.15.4 P0-03: seletor de velocidade + botão de tela cheia.
        //   O enhancer (gdi-player-enhancer.js) já persiste via ratechange
        //   e restaura por curso — aqui só mudamos video.playbackRate e
        //   sincronizamos o select quando a taxa muda por outro caminho
        //   (teclado, menu nativo, restauração do enhancer).
        const speedSel = document.getElementById('gdi-speed-select');
        if (speedSel && video) {
          const syncSpeedSel = () => {
            const r = String(video.playbackRate || 1);
            for (let i = 0; i < speedSel.options.length; i++) {
              if (speedSel.options[i].value === r) { speedSel.value = r; return; }
            }
          };
          speedSel.addEventListener('change', () => {
            const v = parseFloat(speedSel.value);
            if (v > 0) video.playbackRate = v;
          });
          video.addEventListener('ratechange', syncSpeedSel);
          video.addEventListener('loadedmetadata', syncSpeedSel);
          syncSpeedSel();
        }
        const fsBtn = document.getElementById('gdi-fullscreen-btn');
        if (fsBtn) fsBtn.onclick = () => goFullscreen();

        // ★ v2.15.9-E (FRENTE E — Aula 09 gerava conteúdo da Aula 01):
        //   a aula ABERTA é o vídeo que está a tocar. Duas fontes de verdade
        //   divergiam: o fecho (pl/idx — mantido por switchTo e pelo
        //   Interfolder) e o espelho global (Shell.state.playerPlaylist /
        //   playerIndex — o Interfolder trocava a playlist e NÃO sincronizava
        //   playerIndex). showISA lia o espelho: após o Interfolder, o índice
        //   0 apontava p/ o 1º item da lista nova ("Aula 01 - ... - 001 -
        //   aula.mp4") e a geração + o cache usavam a aula errada. // E1c-helpers-aula-aberta
        //   Compara dois links de stream: URLs assinadas mudam expiry/mac a
        //   cada listagem, mas o parâmetro `file` é o mesmo ficheiro.
        function sameVideoLink(a, b) {
          if (!a || !b) return false;
          if (a === b) return true;
          try {
            const ua = new URL(String(a), window.location.origin);
            const ub = new URL(String(b), window.location.origin);
            const fa = ua.searchParams.get('file');
            const fb = ub.searchParams.get('file');
            if (fa && fb) return fa === fb;
          } catch (_) {}
          return false;
        }
        //   Resolve a aula aberta a partir do fecho e valida-a contra o
        //   <video> a tocar. Se o item na posição atual NÃO é o vídeo a
        //   tocar (espelho dessincronizado), re-sincroniza o índice pelo
        //   link; se o vídeo nem está na lista, usa a identidade da abertura
        //   (pasta + ficheiro abertos) — NUNCA outra aula da lista.
        function resolveOpenLesson() {
          const items = (pl && Array.isArray(pl)) ? pl : [];
          const curLink = (video && (video.currentSrc || video.src)) || videoUrl || '';
          const heal = (j) => {
            if (j < 0 || j >= items.length) return null;
            const it = items[j];
            const bare = (it && (it.origName || it.name)) || '';
            const folderSeg = (it && (it.folder || it.folderLabel)) || '';
            let path = folderPath || '';
            if (folderSeg) {
              const segs = String(folderPath || '').split('/').filter(Boolean);
              let lastSeg = '';
              try { lastSeg = decodeURIComponent(segs[segs.length - 1] || ''); } catch (_) { lastSeg = segs[segs.length - 1] || ''; }
              if (lastSeg !== folderSeg) path = '/' + segs.slice(0, -1).join('/') + '/' + encodeURIComponent(folderSeg) + '/';
            }
            idx = j;
            Shell.state.playerIndex = j;
            return { item: it, bare, display: (it && it.name) || bare, folderSeg, path };
          };
          const cur = items[idx] || null;
          const curLink2 = (cur && cur.link) || '';
          if (cur && (!curLink2 || !curLink || sameVideoLink(curLink2, curLink))) return heal(idx);
          if (curLink) {
            const j = items.findIndex(v => v && sameVideoLink(v.link || '', curLink));
            if (j >= 0) return heal(j);
          }
          return { item: null, bare: name || '', display: name || '', folderSeg: '', path: folderPath || '' };
        }
        // ★ Interfolder — com finalizeNames
        document.getElementById('gdi-interfolder-btn').onclick = async () => {
          const btn = document.getElementById('gdi-interfolder-btn');
          const _ifStatus = document.getElementById('gdi-interfolder-status');
          // ★ v2.15.10-E2-interfolder-estavel: o botão é ESTÁVEL — o rótulo
          //   "Interfolder" nunca muda. Antes o handler reescrevia
          //   btn.innerHTML (spinner -> spinner+N por lote -> "✓ 57"): o
          //   nome acessível virava "57" ~1,5 s após o render (o auto-clique
          //   dispara a coleta mal o vídeo começa) e qualquer referência por
          //   nome ficava obsoleta; a largura mudava junto (layout shift) e
          //   o clique por coordenadas caía na borda do botão Meggy. O
          //   progresso vive no #gdi-interfolder-status (E1). Guarda de
          //   reentrância: um 2º clique durante a coleta retorna sem
          //   disparar outra coleta concorrente (antes as duas disputavam
          //   o fecho pl/idx, a playlist e o rótulo). // v2.15.10-E2
          if (Shell._interfolderRunning) return;
          Shell._interfolderRunning = true;
          if (btn) btn.disabled = true;
          if (_ifStatus) _ifStatus.textContent = 'A reunir aulas…';
          try {
            const currentPath = Shell.state.currentFolderPath || '';
            if (!currentPath || !window.gdiListAllFiles) return;
            const parts = currentPath.split('/').filter(Boolean);
            const parentPath = '/' + parts.slice(0, -1).join('/') + '/';
            const parentFiles = await window.gdiListAllFiles(parentPath, '');
            const subFolders = parentFiles.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
            const collected = [];
            for (let i = 0; i < subFolders.length; i += 6) {
              const batch = subFolders.slice(i, i + 6);
              const results = await Promise.all(batch.map(folder => {
                const fpath = parentPath + encodeURIComponent(folder.name) + '/';
                return window.gdiListAllFiles(fpath, '').then(files => files
                  .filter(f => (f.mimeType||'').includes('video') || f.name.endsWith('.mp4'))
                  .filter(f => !f.name.includes('.part-'))
                  .map(f => ({name:f.name, origName:f.name, link:f.link?(f.link.startsWith('http')?f.link:window.location.origin+f.link):'', size:f.size?(f.size/1024/1024).toFixed(1)+' MB':'', folder:folder.name, folderLabel:folder.name}))).catch(() => []);
              }));
              results.forEach(v => collected.push(...v));
              if (_ifStatus) _ifStatus.textContent = 'A reunir aulas… ' + collected.length; // ★ v2.15.10-E3-interfolder-progresso-span (era btn.innerHTML — ver E2)
            }
            // ★ v2.15.9-E: identidade do vídeo A TOCAR, capturada ANTES de
            //   reconstruir a playlist — 'name' e 'videoUrl' são da abertura
            //   e ficam obsoletos após switchTo; pl[idx] é o vídeo atual.
            //   Sem isto o findIndex abaixo casava pelo nome cru ("001 -
            //   aula.mp4", igual em todas as aulas) e devolvia sempre o
            //   índice 0 — a Aula 01 — e a geração usava a aula errada. // E1a-captura-identidade
            const _curItem = (pl && pl[idx]) || null;
            const _curBare = (_curItem && (_curItem.origName || _curItem.name)) || name || '';
            const _curFolder = (_curItem && (_curItem.folder || _curItem.folderLabel)) || '';
            let _curFolderSeg = _curFolder;
            if (!_curFolderSeg) { try { const _s = String(currentPath || '').split('/').filter(Boolean); _curFolderSeg = _s.length ? decodeURIComponent(_s[_s.length - 1]) : ''; } catch (_) { _curFolderSeg = ''; } }
            const _curLink = (_curItem && _curItem.link) || videoUrl || '';
            const _fileParam = (u) => { try { return new URL(String(u || ''), window.location.origin).searchParams.get('file') || ''; } catch (_) { return ''; } };
            const seen = new Set();
            pl = collected.filter(v => { const k = (v.folder||'')+'|'+v.origName; if (seen.has(k)) return false; seen.add(k); return true; });
            pl.sort((a,b) => (a.folder||'').localeCompare(b.folder||'') || a.name.localeCompare(b.name));
            // finalizeNames
            const cnts = {};
            pl.forEach(v => { const o = v.origName || v.name; cnts[o] = (cnts[o]||0)+1; });
            pl.forEach(v => { const o = v.origName || v.name; if (cnts[o] > 1 && v.folderLabel && v.name === o) v.name = v.folderLabel + ' - ' + o; });
            Shell.state.playerPlaylist = pl;
            // ★ v2.15.9-E: resolve o vídeo atual na lista NOVA — (1) pasta +
            //   nome cru (único: o filtro acima dedup por pasta|nome); (2) o
            //   parâmetro file do link (as URLs assinadas mudam expiry/mac a
            //   cada listagem, mas o file é o mesmo ficheiro); (3) nome cru
            //   SÓ se for único na lista. O antigo (nome cru, findIndex)
            //   casava sempre o 1º item — a Aula 01. // E1b-interfolder-indice
            let _nfIdx = -1;
            if (_curFolderSeg && _curBare) _nfIdx = pl.findIndex(v => (v.folder || v.folderLabel) === _curFolderSeg && (v.origName || v.name) === _curBare);
            if (_nfIdx < 0 && _curLink) {
              const _fp = _fileParam(_curLink);
              _nfIdx = _fp ? pl.findIndex(v => _fileParam(v.link || '') === _fp) : pl.findIndex(v => (v.link || '') === _curLink);
            }
            if (_nfIdx < 0 && _curBare) {
              const _hits = pl.map((v, i) => ((v.origName || v.name) === _curBare ? i : -1)).filter(i => i >= 0);
              if (_hits.length === 1) _nfIdx = _hits[0];
            }
            idx = _nfIdx < 0 ? 0 : _nfIdx;
            // ★ v2.15.9-E: sincronizar o espelho global — showISA e o resto
            //   do player lêem Shell.state.playerPlaylist[playerIndex]; sem
            //   isto o índice ficava 0 e as abas de IA geravam p/ a Aula 01.
            Shell.state.playerIndex = idx;
            document.getElementById('gdi-playlist-list').innerHTML = pl.map((v, i) => `<div class="gdi-playlist-item ${i === idx ? 'cur' : ''}" data-idx="${i}" title="${v.name}" role="button" tabindex="0" aria-label="Reproduzir ${v.name}" style="display:flex;justify-content:space-between;align-items:center;padding:12px 10px;border-radius:6px;cursor:pointer;font-size:12px;color:${i === idx ? '#ff8b9f' : '#9aa4b8'};${i === idx ? 'background:rgba(255,139,159,0.12);' : ''}"><div style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><i class="bi ${i === idx ? 'bi-play-fill' : 'bi-film'} me-2"></i><span style="font-weight:${i === idx ? '600' : '400'};">${v.name}</span></div><span class="gdi-pl-size" style="font-size:10px;color:#6b7488;margin-left:8px;">${v.size || ''}</span></div>`).join('');
            plCountEl.textContent = `${idx + 1} / ${pl.length}`;
            document.querySelectorAll('.gdi-playlist-item').forEach(item => { item.onclick = () => { const i = parseInt(item.dataset.idx); if (i !== idx) switchTo(i); }; item.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.click(); } }; });
            if (_ifStatus) _ifStatus.textContent = '✓ ' + pl.length + ' aulas'; // ★ v2.15.10-E4-interfolder-fim-span (era btn.innerHTML — o botão continua "Interfolder", ver E2)
          } catch (e) {
            console.error(e);
            if (_ifStatus) _ifStatus.textContent = '⚠️ Não foi possível reunir as aulas';
          } finally {
            // ★ v2.15.10-E5-interfolder-finally: liberta a guarda e reativa
            //   o botão em TODOS os caminhos (sucesso, erro e o return
            //   antecipado sem currentFolderPath — o finally corre nele).
            Shell._interfolderRunning = false;
            if (btn) btn.disabled = false;
          }
        };

        // ★ Materiais — busca em pasta + subpastas + pasta pai (réplica GDI)
        async function loadMaterials() {
          const tabsEl = document.getElementById('gdi-mat-tabs');
          const bodyEl = document.getElementById('gdi-mat-body');
          const statusEl = document.getElementById('gdi-mat-status');
          if (!tabsEl || !bodyEl) return;
          // ★ v2.15.6 (PROVA EXTRA): as abas da Meggy (Resumo/Questões/
          //   Pílulas/Flashcards) existem SEMPRE no player — antes elas só
          //   eram criadas quando a pasta tinha PDF/MD/TXT, e na aula
          //   "001 - aula.mp4" (só vídeo) o player dizia "Nenhum material
          //   encontrado" e NÃO tinha as abas que o painel da Meggy cita.
          //   As abas geram a partir do nome/contexto da aula quando não
          //   há material (showISA usa só o ctx nesse caso) — por isso o
          //   ramo "sem material" e o catch também as renderizam. O guard
          //   evita duplicar se o catch rodar depois delas já criadas.
          function renderIsaTabs() {
            if (tabsEl.querySelector('.gdi-mat-isa')) return;
            [{id:'isa-summary',icon:'bi-stars',label:'Resumo Meggy'},{id:'isa-questions',icon:'bi-patch-question',label:'Questões'},{id:'isa-mindmap',icon:'bi-capsule',label:'Pílulas'},{id:'isa-flashcards',icon:'bi-card-text',label:'Flashcards'}].forEach(it => {
              const tab = document.createElement('button');
              tab.className = 'gdi-mat-tab gdi-mat-isa';
              tab.style.cssText = 'display:inline-flex;flex-direction:row;align-items:center;gap:6px;padding:7px 12px;background:rgba(124,77,255,0.08);border:1px solid rgba(124,77,255,0.2);border-radius:999px;cursor:pointer;font-size:13px;font-weight:500;color:#a78bfa;font-family:inherit;transition:all 0.15s;white-space:nowrap;';
              tab.dataset.mat = it.id;
              tab.innerHTML = `<i class="bi ${it.icon}" style="font-size:16px;"></i><span style="font-size:13px;font-weight:600;">${it.label}</span>`;
              tab.onclick = () => showISA(it.id);
              tabsEl.appendChild(tab);
            });
          }
          // ★ v2.15.6-resumo2 (fix do bug ao vivo 22:16 — abas de IA mortas):
          // showISA DECLARADA NO NÍVEL DO loadMaterials — NUNCA dentro do try.
          // shell.js roda em 'use strict' (linha 14): declaração de função
          // dentro de um bloco try é block-scoped e invisível para o
          // renderIsaTabs (fora do try, p/ os early-returns e o catch) →
          // o onclick das 4 abas de IA lançava ReferenceError: showISA is
          // not defined e o clique morria em silêncio. showISA não usa
          // nenhuma variável do try (materials/statusEl) — só o escopo do
          // loadMaterials (tabsEl/bodyEl/Shell/window/fetch). showMaterial
          // fica dentro do try (usa materials[i]; as abas dele são
          // criadas dentro do try).
          function showISA(type) {
            document.querySelectorAll('.gdi-mat-tab').forEach(t => { t.classList.remove('active'); t.removeAttribute('aria-current'); t.style.background = 'rgba(124,77,255,0.08)'; t.style.borderColor = 'rgba(124,77,255,0.2)'; t.style.color = '#a78bfa'; });
            const activeTab = document.querySelector('.gdi-mat-tab[data-mat="' + type + '"]');
            if (activeTab) { activeTab.classList.add('active'); activeTab.setAttribute('aria-current', 'true'); activeTab.style.background = '#7c4dff'; activeTab.style.borderColor = '#7c4dff'; activeTab.style.color = '#fff'; }
            // ★ v2.15.9-E: a aula é a que está a tocar (resolveOpenLesson),
            //   não playlist[playerIndex] — o espelho global dessincronizava
            //   após o Interfolder e a geração usava a Aula 01 no lugar da
            //   Aula 09 (ver chave KV '.../Aula 09 .../Aula 01 - ... - 001 -
            //   aula.mp4'). _bareLessonName é o nome cru p/ a chave canônica
            //   do probeCache (E3). Em aberturas normais o valor é IDÊNTICO
            //   ao de antes ("001 - aula.mp4", mesma chave — o resumo bom
            //   salvo continua válido). // E2-showisa-aula-aberta
            const _openLesson = resolveOpenLesson();
            const lessonName = _openLesson.display || '';
            const lessonPath = _openLesson.path || '';
            const _bareLessonName = _openLesson.bare || '';
            // ★ v2.15.6-resumo (Elton 22:04): chave do cache aqui, síncrona,
            //   para a guarda de voo abaixo (o IIFE é assíncrono — calcular
            //   a chave só lá dentro deixaria dois cliques criarem duas
            //   gerações antes de qualquer um registrar a sua).
            // ★ v2.15.10-E8-chave-canonica: a chave do cache E da guarda de
            //   voo usa o nome CANÓNICO (bare, "001 - aula.mp4") em vez do
            //   nome de exibição. O nome de exibição MUDA com o Interfolder
            //   ("001 - aula.mp4" -> "Aula 09 - ... - 001 - aula.mp4"), por
            //   isso a geração automática da descrição (chave nua) e o clique
            //   do aluno em Questões (chave prefixada) NÃO se juntavam na
            //   guarda e corriam DOIS generateAll em paralelo (6 chamadas
            //   /api/ai) — e cada abertura via Interfolder gravava uma chave
            //   prefixada nova em vez de atualizar a chave boa ao vivo (a
            //   nua). Em aberturas normais bare == display: chave IDÊNTICA
            //   à de antes. lessonName continua a ser o de exibição p/ o
            //   ctx, o cabeçalho e o campo lessonName do save.
            let _isaRawKey;
            const _isaKeyName = _bareLessonName || lessonName;
            try { _isaRawKey = decodeURIComponent(lessonPath + _isaKeyName); } catch (_) { _isaRawKey = lessonPath + _isaKeyName; }
            const _isaCacheKey = encodeURI(_isaRawKey); // encodeURI: %20 p/ espaços, %C3%A7 p/ ç, mantém / :
            const _isaCacheKeyRaw = lessonPath + lessonName; // fallback p/ cache antigo com encoding parcial
            // ★ v2.15.6-resumo (Elton 22:04): no celular o painel de
            //   materiais fica ABAIXO da dobra — clicar na aba mostrava o
            //   spinner/resultado fora da tela ("quando clico nada
            //   acontece"). Rolar o painel para a vista ao clicar.
            try { const _mb = document.getElementById('gdi-mat-body'); if (_mb && _mb.scrollIntoView) _mb.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) {}

            // ★ Loading UI (replica de produção: pink spinner + "Não feche esta aba")
            function setLoading(msg) {
              bodyEl.innerHTML = '<div class="gdi-mat-isa-loading" style="max-width:560px;margin:0 auto;padding:30px 20px;">' +
                '<div class="gdi-mat-isa-spin"></div>' +
                '<div style="text-align:center;font-size:13px;line-height:1.6;color:#e6edf3;">' + msg + '</div>' +
                '<div style="margin-top:14px;font-size:11px;color:#8b949e;font-style:italic;">' +
                  '<i class="bi bi-info-circle"></i> Não feche esta aba — a geração continua em segundo plano.' +
                '</div>' +
              '</div>';
            }

            setLoading('🐩 Meggy está lendo o material e criando conteúdo…<br>⏱️ Tempo estimado: 30-60 segundos.');

            // ★ v2.15.6-resumo: guarda de voo por aula — a descrição
            //   auto-clica a aba "Resumo Meggy" ao abrir a aula E o aluno
            //   clica de novo; sem guarda, duas gerações em paralelo
            //   queimam o limite de 30 msgs/h da /api/ai e a segunda nem
            //   vê o cache da primeira (ainda não salvo). Cliques
            //   concorrentes da MESMA aula aguardam a geração em curso e
            //   relêem o cache em vez de gerar tudo de novo.
            Shell._isaInflight = Shell._isaInflight || {};
            const _joinRun = Shell._isaInflight[_isaCacheKey] || null;
            const _myRun = (async () => {
              try {
                const isaField = type.replace('isa-', ''); // summary | questions | mindmap | flashcards
                const cacheKey = _isaCacheKey;
                const cacheKeyRaw = _isaCacheKeyRaw;

                // ★ v2.15.6-resumo: sonda de cache — vídeo, variante .pdf
                //   na mesma pasta e na pasta pai. O batalhão salva sob
                //   `courseKey/pdfName` (o PDF); a aba só procurava a
                //   chave do VÍDEO, então o resumo do batalhão nunca
                //   aparecia na aba ("resumos já gerados não carregam").
                // ★ v2.15.9-E: lista de chaves sondadas, em ordem — função
                //   própria (testável). A chave canônica (pasta + nome cru
                //   do ficheiro) acha o resumo da MESMA aula salvo pela
                //   abertura normal ("001 - aula.mp4") quando a abertura
                //   atual usa o nome prefixado pelo Interfolder ("Aula 09 -
                //   ... - 001 - aula.mp4"). NUNCA inclui chaves de outra
                //   aula/pasta — a variante da pasta PAI (abaixo) é a única
                //   que cruza pastas e hoje não tem nenhuma entrada ao vivo
                //   (ver NOTES.md). // E3-probe-canonica
                // ★ v2.15.11-B7-campo-cache: um campo em cache que seja uma
                //   RECUSA vale como AUSENTE — a aba NÃO o exibe como
                //   conteúdo e cai na geração (que, com o nome certo da
                //   aula, usa o material real). Sem isto, o probeCache
                //   devolvia a recusa guardada e o render selava-a como
                //   resumo. Questões têm de ser array, ou string crua
                //   não-recusa (o batalhão guarda-a assim quando o parse
                //   falha e ela exibe-se como markdown).
                function _isaCachedField(entry, field) {
                  if (!entry) return null;
                  const v = entry[field];
                  // ★ v2.15.13-B2-selo-unificado-leitura: a leitura das abas usa
                  //   a MESMA validação por forma que o selo — sem isto
                  //   a aba exibia a recusa nova como conteúdo.
                  if (field === 'questions') {
                    if (Array.isArray(v) && Shell._isIsaValidContent('questions', v)) return v;
                    if (typeof v === 'string' && v && Shell._isIsaValidContent('questions', v)) return v;
                    return null;
                  }
                  if (typeof v !== 'string' || !v) return null;
                  return Shell._isIsaValidContent(field, v) ? v : null;
                }
                function isaCacheProbeKeys() {
                  const _pdfBase = lessonName.replace(/\.[a-z0-9]+$/i, '');
                  const _pdfName = _pdfBase ? _pdfBase + '.pdf' : '';
                  const _parentPath = lessonPath.replace(/[^/]+\/$/, '');
                  const _keys = [cacheKey, cacheKeyRaw];
                  if (_bareLessonName && _bareLessonName !== lessonName) {
                    try { _keys.push(encodeURI(decodeURIComponent(lessonPath + _bareLessonName))); } catch (_) { _keys.push(lessonPath + _bareLessonName); }
                    _keys.push(lessonPath + _bareLessonName);
                  }
                  // ★ v2.15.10-E9-probe-exibicao: a chave primária agora é a
                  //   canónica (E8), mas o conteúdo bom salvo sob a chave
                  //   do nome de exibição (ex. as 10 questões geradas no
                  //   Passo 14 via Interfolder) continua a ser sondado.
                  if (lessonName && _bareLessonName && lessonName !== _bareLessonName) {
                    try { _keys.push(encodeURI(decodeURIComponent(lessonPath + lessonName))); } catch (_) { _keys.push(lessonPath + lessonName); }
                    _keys.push(lessonPath + lessonName);
                  }
                  if (_pdfName && /\.(mp4|webm|mov|m4v|avi|mkv|m3u8|mp3|m4a|ogg|wav|aac)$/i.test(lessonName)) {
                    try { _keys.push(encodeURI(decodeURIComponent(lessonPath + _pdfName))); } catch (_) { _keys.push(lessonPath + _pdfName); }
                    _keys.push(lessonPath + _pdfName);
                    if (_parentPath && _parentPath !== lessonPath) {
                      try { _keys.push(encodeURI(decodeURIComponent(_parentPath + _pdfName))); } catch (_) { _keys.push(_parentPath + _pdfName); }
                      _keys.push(_parentPath + _pdfName);
                    }
                  }
                  return _keys;
                }
                async function probeCache() {
                  const _keys = isaCacheProbeKeys(); // E3-probe-retorno
                  for (const k of _keys) {
                    try {
                      const cacheResp = await fetch('/api/ai/cache?key=' + encodeURIComponent(k), { headers: { 'Accept': 'application/json' }, credentials: 'include' });
                      if (cacheResp.ok) {
                        const cacheData = await cacheResp.json();
                        if (cacheData && cacheData.cached) return cacheData.cached;
                      }
                    } catch (e) { /* próxima chave */ }
                  }
                  return null;
                }

                // ─── 1. Cache check (GET /api/ai/cache?key=...) ───
                // Se a geração desta aula já está rodando, espera ela e
                // relê o cache (a geração anterior já salvou) em vez de
                // gerar tudo de novo em paralelo.
                if (_joinRun) {
                  try { await _joinRun; } catch (_) {}
                  const _jc = await probeCache();
                  // ★ v2.15.11-B8-joiner: campo em cache validado (recusa =
                  //   ausente) — ver B7. O fullCache (_jc) continua a ser
                  //   passado ao render: o selo (B2) é que decide o que selar.
                  const _jcVal = _isaCachedField(_jc, isaField);
                  if (_jcVal) {
                    Shell._renderISAResult(type, _jcVal, bodyEl, lessonName, true, _jc);
                    return;
                  }
                  // ★ v2.15.10-E10-flashcards-joiner: Flashcards são DERIVADOS
                  //   das questões (autoCreateFlashcards) e o cache nunca
                  //   guarda o campo 'flashcards' — sem isto o joiner caía
                  //   sempre na geração completa mesmo com as questões já
                  //   em cache (ver E11).
                  if (type === 'isa-flashcards' && _jc && Array.isArray(_jc.questions) && _jc.questions.length) {
                    const _fc = autoCreateFlashcards(_jc.questions);
                    if (_fc.length) { Shell._renderFlashcardDeck(bodyEl, { flashcards: _fc, lessonName: lessonName, questions: _jc.questions }); return; }
                  }
                  // A geração anterior falhou sem salvar — gera de novo abaixo.
                }
                let cached = await probeCache();

                // Se o tipo específico já está no cache, mostra direto
                // ★ v2.15.11-B9-cache-hit: campo em cache validado (recusa =
                //   ausente) — ver B7. Se o resumo em cache for uma recusa,
                //   a aba NÃO a exibe: cai na geração com o material real
                //   da aula; se a geração recusar de novo, mostra 'Não foi
                //   possível gerar' — nunca sela a recusa.
                const _cachedVal = _isaCachedField(cached, isaField);
                if (_cachedVal) {
                  Shell._renderISAResult(type, _cachedVal, bodyEl, lessonName, true, cached);
                  return;
                }
                // ★ v2.15.12-B2b-pilulas-ambar-ramo: a aba Pílulas com a
                //   recusa em cache (Passo 16: a aba exibiu a recusa
                //   selada '✓ Pílulas', sem aviso âmbar). Com o detetor
                //   B1, _isaCachedField já a trata como ausente — mas a
                //   aba NÃO cai na regeneração silenciosa: mostra o
                //   estado âmbar (o selo em cadeia traz só os valores
                //   válidos + 'Sem pílulas válidas — Regerar', via B2) e
                //   o botão Regerar (na toolbar) limpa o cache e gera de
                //   novo. A recusa nunca é exibida nem selada. Só p/
                //   'mindmap': o resumo MANTÉM a regeneração automática
                //   de B9 (comportamento provado no Passo 16 — o resumo
                //   real foi gerado ao vivo em ~45 s).
                if (isaField === 'mindmap' && Shell._isaCachedRefusal(cached, 'mindmap')) {
                  Shell._renderISAResult(type, 'Não foi possível mostrar as pílulas desta aula: o conteúdo guardado no cache é uma recusa da IA — a aula não tinha material quando as pílulas foram geradas. Toque em Regerar para tentar de novo.', bodyEl, lessonName, true, cached);
                  return;
                }
                // ★ v2.15.10-E11-flashcards-cache: Flashcards são DERIVADOS
                //   das questões — o cache nunca guarda 'flashcards', por
                //   isso `cached['flashcards']` é sempre undefined e o clique
                //   em Flashcards caía SEMPRE no generateAll inteiro
                //   (30-60 s+) mesmo com as 10 questões já em cache. Com
                //   questões em cache, deriva e renderiza direto, sem /api/ai.
                if (type === 'isa-flashcards' && cached && Array.isArray(cached.questions) && cached.questions.length) {
                  const _fcFromCache = autoCreateFlashcards(cached.questions);
                  if (_fcFromCache.length) {
                    Shell._renderFlashcardDeck(bodyEl, { flashcards: _fcFromCache, lessonName: lessonName, questions: cached.questions });
                    return;
                  }
                }

                // ─── 2. Extrair materiais (MD/TXT/PDF com pdf.js) ───
                // ★ v2.15.13-D3a-lista-retry: o gdiListAllFiles era chamado
                //   1x sem retry e os catch (e) { /* skip */ } silenciosos
                //   tornavam "falha de listagem" indistinguível de "sem
                //   ficheiros" — a extração intermitente do Passo 17 ("sem
                //   conteúdo da aula" numa tentativa, conteúdo real na
                //   seguinte) não deixava rasto. Agora: 1 retry (500 ms) e
                //   registo — {ok:false, failed:true} + console.warn com a
                //   pasta — quando a listagem falha 2x; {ok:true} quando a
                //   pasta lista mas não tem ficheiros extraíveis (o caso
                //   real da Aula 09: só o vídeo). _materialListFailed fica
                //   registado p/ o warn final (ver D4).
                let _materialListFailed = false;
                async function _listLessonFiles(_p) {
                  let _lastErr = null;
                  for (let _a = 0; _a < 2; _a++) {
                    try {
                      const _f = await window.gdiListAllFiles(_p, '');
                      if (Array.isArray(_f)) return { ok: true, files: _f, failed: false };
                      _lastErr = new Error('gdiListAllFiles devolveu non-array');
                    } catch (e) { _lastErr = e; }
                    if (_a === 0) await new Promise((res) => setTimeout(res, 500));
                  }
                  console.warn('[Shell] gdiListAllFiles falhou 2x em ' + _p + ':', _lastErr);
                  return { ok: false, files: [], failed: true };
                }
                setLoading('📖 Extraindo material da aula…');
                let materialContent = '';
                let materialsList = [];
                try {
                  if (window.gdiListAllFiles && lessonPath) {
                    const _listed = await _listLessonFiles(lessonPath); // ★ v2.15.13-D3b
                    if (!_listed.ok) _materialListFailed = true;
                    const files = _listed.files;
                    materialsList = files.filter(f => {
                      const ext = (f.name.split('.').pop() || '').toLowerCase();
                      return ext === 'pdf' || ext === 'md' || ext === 'txt' || ext === 'html';
                    });
                    // ★ Transcription-priority: arquivos com "transcri" primeiro
                    materialsList.sort((a, b) => {
                      const at = /transcri/i.test(a.name) ? 0 : 1;
                      const bt = /transcri/i.test(b.name) ? 0 : 1;
                      return at - bt;
                    });
                    for (const m of materialsList.slice(0, 3)) {
                      const ext = (m.name.split('.').pop() || '').toLowerCase();
                      if (ext === 'pdf') {
                        // ★ Extrair texto do PDF usando pdf.js (não apenas placeholder)
                        setLoading('📄 Extraindo texto do PDF: ' + m.name + '…');
                        if (m.link) {
                          const link = m.link.startsWith('http') ? m.link : (window.location.origin + m.link);
                          const pdfText = await Shell._extractPdfText(link);
                          if (pdfText && pdfText.length > 50) {
                            materialContent += '\n\n--- ' + m.name + ' ---\n' + pdfText.substring(0, 40000);
                          } else {
                            materialContent += '\n[Material PDF: ' + m.name + ' (não foi possível extrair texto — pode ser escaneado)]';
                          }
                        }
                      } else if (m.link) {
                        try {
                          const link = m.link.startsWith('http') ? m.link : (window.location.origin + m.link);
                          const resp = await fetch(link);
                          if (resp.ok) {
                            const text = await resp.text();
                            materialContent += '\n\n--- ' + m.name + ' ---\n' + text.substring(0, 30000);
                          }
                        } catch (e) { /* skip */ }
                      }
                    }
                  }
                } catch (e) { console.warn('[Shell] material extract:', e); }

                // ★ Subpastas (especialmente "material") se não encontrou conteúdo suficiente
                if (materialContent.length < 200 && window.gdiListAllFiles && lessonPath) {
                  try {
                    const _listed2 = await _listLessonFiles(lessonPath); // ★ v2.15.13-D3c
                    if (!_listed2.ok) _materialListFailed = true;
                    const files = _listed2.files;
                    const subs = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder').slice(0, 5);
                    for (const sf of subs) {
                      const fp = lessonPath + encodeURIComponent(sf.name) + '/';
                      const _subListed = await _listLessonFiles(fp); // ★ v2.15.13-D3d
                      if (!_subListed.ok) _materialListFailed = true;
                      const subFiles = _subListed.files;
                      const subMats = subFiles.filter(f => {
                        const ext = (f.name.split('.').pop() || '').toLowerCase();
                        return ext === 'pdf' || ext === 'md' || ext === 'txt';
                      });
                      for (const m of subMats.slice(0, 3)) {
                        const ext = (m.name.split('.').pop() || '').toLowerCase();
                        if (ext === 'pdf' && m.link) {
                          setLoading('📄 Extraindo PDF da subpasta: ' + m.name + '…');
                          const link = m.link.startsWith('http') ? m.link : (window.location.origin + m.link);
                          const pdfText = await Shell._extractPdfText(link);
                          if (pdfText && pdfText.length > 50) {
                            materialContent += '\n\n--- ' + m.name + ' ---\n' + pdfText.substring(0, 30000);
                          }
                        } else if (m.link) {
                          try {
                            const link = m.link.startsWith('http') ? m.link : (window.location.origin + m.link);
                            const resp = await fetch(link);
                            if (resp.ok) {
                              const text = await resp.text();
                              materialContent += '\n\n--- ' + m.name + ' ---\n' + text.substring(0, 20000);
                            }
                          } catch (e) { /* skip */ }
                        }
                      }
                      if (materialContent.length > 200) break;
                    }
                  } catch (e) { console.warn('[Shell] material extract (subpastas):', e); /* ★ v2.15.13-D3e — era skip silencioso */ }
                }

                if (materialContent.length > 80000) {
                  materialContent = materialContent.substring(0, 80000) + '\n[...truncado...]';
                }

                const courseName = lessonPath.split('/').filter(Boolean).slice(-1)[0] || '';
                const driveName = window.drive_names && window.drive_names[+(lessonPath.split('/')[1] || '0').replace(':','')] || '';
                const ctx = 'Aula: ' + lessonName + '\nCurso: ' + courseName + '\nDrive: ' + driveName;
                // ★ v2.15.13-D4-resumo-cache-como-material: a cadeia NÃO
                //   usava o resumo ISA em cache como material — mas o
                //   drawer USA (Tier 1, v2.15.10-C, _drawerLessonMaterial).
                //   A Aula 09 não tem ficheiros extraíveis na pasta (só o
                //   vídeo) e TEM um resumo real em cache (gerado no Passo
                //   16, salvo no Drive) — sem isto os prompts corriam só
                //   com ctx (nome/curso/drive) e o modelo recusava
                //   não-deterministicamente ("sem conteúdo da aula",
                //   Passo 17 tentativa 2) ou gerava do conhecimento
                //   paramétrico. _isaCachedField valida: uma recusa em
                //   cache vale como AUSENTE (B7), por isso uma recusa
                //   nunca vira "material". Só quando a extração da pasta
                //   deu <100 chars. Se a listagem falhou (D3), fica o
                //   registo de que se gerou sem a pasta listada.
                let hasContent = materialContent.length > 100;
                let _materialSource = hasContent ? 'files' : 'none';
                if (!hasContent) {
                  let _cs = null;
                  try { _cs = _isaCachedField(cached, 'summary'); } catch (_) { _cs = null; }
                  if (typeof _cs === 'string' && _cs.length > 100) {
                    materialContent = _cs;
                    hasContent = materialContent.length > 100;
                    _materialSource = 'cache';
                  }
                }
                if (_materialListFailed) console.warn('[Shell] material extract: listagem da pasta falhou (ver D3) — material=' + _materialSource);

                // ─── 3. generateAll: gerar resumo + pílulas + questões em paralelo ───
                // Produção gera TUDO de uma vez (Promise.allSettled). Se o usuário pediu só um tipo,
                // ainda assim geramos todos (mais eficiente — cache fica completo p/ próximas abas).
                setLoading('✨ Gerando resumo + pílulas + questões em cadeia…<br>Isto pode levar 30-60s.');

                const textSlice = hasContent ? materialContent : ctx;
                const sliceCap = hasContent ? 80000 : 2000;
                // ★ v2.15.13-D5a-ctx-only-instrucao — opção (i), NÃO (ii):
                //   quando NÃO há material NEM resumo em cache, o prompt é
                //   só a identificação da aula; sem esta instrução o modelo
                //   pede o material ao utilizador ("sem conteúdo da aula",
                //   Passo 17). Com ela, DEVE usar o seu conhecimento do
                //   tema e NUNCA pedir o material. Escolha (i) pela
                //   evidência: a geração só-com-ctx produziu conteúdo
                //   CORRETO 2/3 das vezes no Passo 17 (pílulas reais
                //   05:19/05:25; tema padrão de Direito Penal) e a
                //   validação estrutural da Frente B é a rede p/ recusas
                //   que ainda passarem. A opção (ii) ("Sem material", sem
                //   gerar) deixaria a aula sem nada embora o tema seja
                //   gerável. A nota só entra quando _materialSource é
                //   'none' (nem ficheiros, nem resumo em cache).
                const CTX_ONLY_NOTE = (_materialSource === 'none')
                  ? '\n\nNOTA IMPORTANTE: não há ficheiros de material nesta aula — só a identificação acima (nome da aula, curso, drive). NÃO peças o material ao utilizador nem digas que precisas dele: usa o teu conhecimento do tema indicado pelo nome da aula e gera o conteúdo na mesma, com o rigor de um examinador de concurso.'
                  : '';

                // ★ Prompts (replica de produção — meggy-cache.js:785-821)
                const RESUMO_PROMPTS = [
                  // Nível 7 (rico)
                  'Você é um professor especialista em concursos públicos. Leia TODO o material abaixo e crie um RESUMO PROFUNDO E DETALHADO em Markdown.\n\nREQUISITOS:\n- Mínimo 2000 caracteres (NÃO seja breve)\n- ABERTURA (GANCHO): abra o resumo com uma prévia daquela aula, em texto corrido, no espírito de "Nessa aula vamos estudar [assunto específico da aula]..." — varie a cada geração ("Nessa aula vamos estudar...", "Nesta aula, vamos mergulhar em...", "Hoje vamos estudar..."). Nunca abra com título fixo nem frase genérica.\n- Estruture com ## títulos e ### subtítulos\n- Para CADA tópico: explique o conceito, dê EXEMPLOS práticos, e destaque pegadinhas de prova\n- Use **negrito** para palavras-chave e dispositivos legais\n- Use listas com marcadores para enumerações\n- Inclua uma seção ## Pegadinhas de Prova no final\n- Inclua uma seção ## Resumo Rápido com 5-10 bullets dos pontos mais importantes\n\nNÃO omita nenhum tema. Seja PROFUNDO, não conciso.\n\nMaterial:\n' + textSlice.slice(0, sliceCap) + CTX_ONLY_NOTE, // ★ v2.15.13-D5b
                  // Nível 5 (médio)
                  'Crie um resumo DETALHADO em Markdown deste material. Use ## títulos, **negrito** e - bullets. Inclua ## Pegadinhas de Prova no final. Material:\n' + textSlice.slice(0, 20000) + CTX_ONLY_NOTE, // ★ v2.15.13-D5c
                  // Nível 3 (simples)
                  'Crie um resumo em Markdown deste material. Use ## títulos e bullets. Material:\n' + textSlice.slice(0, 10000) + CTX_ONLY_NOTE // ★ v2.15.13-D5d
                ];
                const PILULAS_PROMPT = 'Crie "Pílulas" deste material — pontos-chave para revisão rápida ANTES da prova. Formato Markdown:\n# Pílulas de Revisão\n\n## Conceitos Essenciais\n- **Conceito 1**: explicação curta com exemplo\n- **Conceito 2**: explicação curta\n\n## Pegadinhas Rápidas\n- ⚠️ Pegadinha 1\n- ⚠️ Pegadinha 2\n\n## Mnemônicos\n- Dica para memorizar\n\nMáximo 20 bullets no total. Seja OBJETIVO mas COMPLETO.\n\nConteúdo:\n' + textSlice.slice(0, 15000) + CTX_ONLY_NOTE; // ★ v2.15.13-D5e
                const QUESTOES_PROMPT = 'Você é um examinador de concurso público brasileiro experiente. Baseado neste material, gere 10 questões de concurso em JSON array. Misture:\n- 6 múltipla escolha: {"type":"mc","statement":"...","options":["a","b","c","d"],"correct":0,"legalText":"...","explanation":"...","fundamentacao":"..."}\n- 4 certo/errado (CEBRASPE): {"type":"tf","statement":"...","correct":1,"legalText":"...","explanation":"...","fundamentacao":"..."}\n\nCAMPOS:\n- statement: enunciado claro, contexto completo\n- legalText: o dispositivo legal aplicável (ex: "art. 5º, CF")\n- explanation: explicação técnica do acerto/erro\n- fundamentacao: fundamentação didática completa\n\nSem comentários, só JSON.\n\n' + textSlice.slice(0, 60000) + CTX_ONLY_NOTE; // ★ v2.15.13-D5f
                // ★ v2.15.12-D2a-prompt-escalado: o retry E13 repetia o MESMO
                //   prompt byte-idêntico — uma falha SISTEMÁTICA de formato
                //   (ex.: o modelo de raciocínio devolve <think> + prosa)
                //   falhava as 3 vezes igual. Cada tentativa muda o pedido:
                //   2ª impõe a regra de formato estrita, 3ª junta um
                //   esqueleto de 1 questão no formato exato.
                const QUESTOES_PROMPT_STRICT = '\n\nREGRA DE FORMATO (obrigatória): responda SOMENTE com o JSON array. Sem <think>, sem raciocínio, sem explicações, sem markdown, sem texto antes ou depois. Comece a resposta com [ e termine com ].';
                const QUESTOES_PROMPTS = [QUESTOES_PROMPT,
                  QUESTOES_PROMPT + QUESTOES_PROMPT_STRICT,
                  QUESTOES_PROMPT + QUESTOES_PROMPT_STRICT + '\nExemplo de 1 questão (siga este formato exato): [{"type":"mc","statement":"...","options":["a","b","c","d"],"correct":0,"legalText":"...","explanation":"...","fundamentacao":"..."}]'];

                // ★ Helper: chama /api/ai com fallback de prompt (3 níveis para resumo)
                async function callIsa(prompt, kind) {
                  const r = await fetch('/api/ai', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: prompt, messages: [], kind: kind })
                  });
                  if (!r.ok) {
                    // ★ v2.15.14-Q2a-detalhe-502: o worker JÁ devolve o erro
                    //   agregado em errorDetail (v2.15.3), mas o callIsa
                    //   descartava-o — o utilizador só via "HTTP 502" e a
                    //   triagem ao vivo ficava sem saber QUE backends
                    //   falharam (Passo 18, ciclo 2). Anexa um resumo ao
                    //   erro (o cliente já recebe o errorDetail completo
                    //   no corpo da resposta — isto não expõe nada novo).
                    let _det = '';
                    try { const _dj = await r.json(); _det = String((_dj && _dj.errorDetail) || ''); } catch (_) { _det = ''; }
                    const _e = new Error('AI HTTP ' + r.status);
                    if (_det) _e.detail = _det; // ★ v2.15.15-A5-detalhe-completo (ver A6)
                    throw _e;
                  }

                  const d = await r.json();
                  return d.response || d.markdown || d.summary || '';
                }

                // ★ Helper: parse robusto de JSON array de questões (replica meggy-utils.parseJsonArray)
                // ★ v2.15.12-D1-parse-robusto: o parse antigo era tudo-ou-nada
                //   sobre o array inteiro — 1 vírgula final, 1 quebra de linha
                //   literal num enunciado, 1 elemento null, um objeto
                //   {"questions": [...]} ou um bloco <think> do modelo de
                //   raciocínio (qwq-32b, 1º da lista 'questoes' no worker; o
                //   worker NÃO remove <think> — grep "think": 0 ocorrências)
                //   com '[' lá dentro bastavam p/ devolver [] — e o retry E13
                //   repetia o MESMO prompt no MESMO modelo, por isso as 3
                //   tentativas falhavam igual (Passo 16). Agora: remove
                //   <think>, desembrulha {"questions"|"questoes"|"items"|
                //   "data": [...]}, extrai o MAIOR segmento [...] balanceado
                //   (não o 1º '[' ao último ']' — o guloso apanhava o '[' do
                //   <think>/prosa), repara vírgulas finais e controlos
                //   literais dentro de strings, e em último caso recupera
                //   questão a questão (≥1 válida conta). Nunca lança:
                //   elemento null/não-objeto é descartado, não TypeError.
                function parseQuestions(resp) {
                  if (!resp || typeof resp !== 'string') return [];
                  function _stripThink(s) {
                    let out = String(s);
                    out = out.replace(/<think>[\s\S]*?<\/think>/gi, ' ');
                    out = out.replace(/<\/?think>/gi, ' ');
                    return out;
                  }
                  function _stripFences(s) {
                    return String(s).replace(/```(?:json)?\s*/gi, ' ').replace(/```/g, ' ');
                  }
                  function _balancedArray(s) {
                    // maior segmento [...] balanceado (respeita strings com escapes)
                    let best = null;
                    for (let i = 0; i < s.length; i++) {
                      if (s[i] !== '[') continue;
                      let depth = 0, inStr = false, esc = false, j = i;
                      for (; j < s.length; j++) {
                        const c = s[j];
                        if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; }
                        else if (c === '"') inStr = true;
                        else if (c === '[') depth++;
                        else if (c === ']') { depth--; if (depth === 0) break; }
                      }
                      if (depth === 0 && j > i) { const seg = s.slice(i, j + 1); if (!best || seg.length > best.length) best = seg; }
                    }
                    return best;
                  }
                  function _tryParse(s) { try { return JSON.parse(s); } catch (_) { return null; } }
                  function _repair(s) {
                    // (a) vírgulas finais antes de ] ou }
                    let r = String(s).replace(/,\s*([}\]])/g, '$1');
                    // (b) controlos literais (quebra de linha / tab) dentro de strings
                    let out = '', inStr = false, esc = false;
                    for (let i = 0; i < r.length; i++) {
                      const c = r[i];
                      if (inStr) {
                        if (esc) { out += c; esc = false; }
                        else if (c === '\\') { out += c; esc = true; }
                        else if (c === '"') { out += c; inStr = false; }
                        else if (c === '\n') out += '\\n';
                        else if (c === '\r') out += '\\r';
                        else if (c === '\t') out += '\\t';
                        else out += c;
                      } else {
                        out += c;
                        if (c === '"') inStr = true;
                      }
                    }
                    return out;
                  }
                  function _unwrap(obj) {
                    if (Array.isArray(obj)) return obj;
                    if (obj && typeof obj === 'object') {
                      for (const k of ['questions', 'questoes', 'items', 'data']) {
                        if (Array.isArray(obj[k])) return obj[k];
                      }
                    }
                    return null;
                  }
                  function _normalize(arr) {
                    if (!Array.isArray(arr)) return [];
                    return arr.map(q => {
                      try {
                        if (!q || typeof q !== 'object') return null;
                        const statement = String(q.statement || q.question || q.pergunta || q.enunciado || '');
                        const options = Array.isArray(q.options) ? q.options.map(String)
                          : (Array.isArray(q.alternatives) ? q.alternatives.map(String)
                          : (Array.isArray(q.alternativas) ? q.alternativas.map(String) : null));
                        let correct = q.correct;
                        if (typeof correct === 'string') {
                          const t = correct.trim().toUpperCase();
                          if (/^[A-F]$/.test(t)) correct = t.charCodeAt(0) - 65;
                          else if (t === 'CERTO' || t === 'VERDADEIRO' || t === 'TRUE') correct = 1;
                          else if (t === 'ERRADO' || t === 'FALSO' || t === 'FALSE') correct = 0;
                          else correct = Number(correct) || 0;
                        }
                        if (correct === undefined || correct === null) correct = (q.correctAnswer !== undefined) ? q.correctAnswer : 0;
                        correct = Number(correct) || 0;
                        const explanation = String(q.explanation || '');
                        const legalText = String(q.legalText || q.fundamentacao || '');
                        const fundamentacao = String(q.fundamentacao || '');
                        if (q.type === 'tf' || (!options && q.correct !== undefined)) {
                          return {
                            type: 'tf', statement: statement, options: ['Certo', 'Errado'],
                            correct: Math.max(0, Math.min(1, correct)),
                            explanation: explanation,
                            legalText: legalText,
                            fundamentacao: fundamentacao
                          };
                        }
                        if (options) {
                          return {
                            type: 'mc', statement: statement, options: options,
                            correct: Math.max(0, Math.min(options.length - 1, correct)),
                            explanation: explanation,
                            legalText: legalText,
                            fundamentacao: fundamentacao
                          };
                        }
                        return null;
                      } catch (_) { return null; }
                    }).filter(Boolean);
                  }
                  try {
                    const text = _stripFences(_stripThink(resp));
                    let arr = _unwrap(_tryParse(text));
                    if (arr) { const _n0 = _normalize(arr); if (_n0.length) return _n0; } // ★ v2.15.14-Q1d1-normalize-vazio
                  // ★ v2.15.14-Q1a-recupera-objetos: a recuperação objeto a
                  //   objeto era inline e SÓ corria dentro de 'if (seg)' —
                  //   quando a resposta vinha CORTADA sem o ']' de fecho,
                  //   _balancedArray devolvia null e a recuperação nunca
                  //   corria (Passo 18, ciclo 1). Extraída p/ reutilizar
                  //   na recuperação da cauda truncada (Q1a-cauda).
                  //   (BS via fromCharCode p/ não embutir escapes aqui.)
                  function _recoverObjects(src) {
                    const objs = [];
                    let depth = 0, start = -1, inStr = false, esc = false;
                    const BS = String.fromCharCode(92);
                    for (let i = 0; i < src.length; i++) {
                      const c = src[i];
                      if (inStr) { if (esc) esc = false; else if (c === BS) esc = true; else if (c === '"') inStr = false; continue; }
                      if (c === '"') { inStr = true; continue; }
                      if (c === '{') { if (depth === 0) start = i; depth++; }
                      else if (c === '}') { depth--; if (depth === 0 && start >= 0) { objs.push(src.slice(start, i + 1)); start = -1; } }
                    }
                    const recovered = [];
                    for (const o of objs) {
                      const one = _tryParse(_repair(o));
                      if (one) recovered.push(one);
                    }
                    return recovered;
                  }
                    const seg = _balancedArray(text);
                    if (seg) {
                      arr = _unwrap(_tryParse(seg));
                      if (arr) { const _n1 = _normalize(arr); if (_n1.length) return _n1; } // ★ v2.15.14-Q1d2-normalize-vazio
                      arr = _unwrap(_tryParse(_repair(seg)));
                      if (arr) { const _n2 = _normalize(arr); if (_n2.length) return _n2; }
                      // último recurso: recupera objeto a objeto dentro do segmento
                      const recovered = _recoverObjects(seg); // ★ v2.15.14-Q1a2-call
                      if (recovered.length) { const _n3 = _normalize(recovered); if (_n3.length) return _n3; } // ★ v2.15.14-Q1d3-normalize-vazio
                    }
                    // ★ v2.15.14-Q1a-cauda-truncada: se chegámos aqui, nem o
                    //   segmento balanceado nem a sua recuperação deram
                    //   questões — a resposta pode ter sido CORTADA a meio
                    //   (max_tokens) sem o ']' de fecho, caso em que
                    //   _balancedArray devolve null e a recuperação nunca
                    //   corria (Passo 18, ciclo 1: "fora do formato JSON"
                    //   3x igual). Recupera as questões COMPLETAS antes do
                    //   corte a partir do 1o '[' (a última, incompleta, é
                    //   descartada — espelha o reparo de extractAiJsonArray
                    //   do worker, que fecha os abertos e descarta o último
                    //   item incompleto). Sem '[' não há o que recuperar.
                    if (text.indexOf('[') >= 0) {
                      const _rec2 = _recoverObjects(text.slice(text.indexOf('[')));
                      if (_rec2.length) { const _n4 = _normalize(_rec2); if (_n4.length) return _n4; } // ★ v2.15.14-Q1d4-normalize-vazio
                    }
                    return [];
                  } catch (_) { return []; }
                }

                // ★ v2.15.14-Q1b-erro-truncamento: distingue "resposta
                //   cortada a meio do JSON" de "JSON inválido" — o parse
                //   falhou mas os colchetes/chaves ficam por fechar (ou
                //   uma string fica sem fechar) a partir do 1o '['.
                //   Sem '[' não é truncamento (é prosa/recusa).
                function _truncatedJson(raw) {
                  if (!raw || typeof raw !== 'string') return false;
                  const i = raw.indexOf('[');
                  if (i < 0) return false;
                  let depth = 0, inStr = false, esc = false;
                  const BS = String.fromCharCode(92);
                  for (let j = i; j < raw.length; j++) {
                    const c = raw[j];
                    if (inStr) { if (esc) esc = false; else if (c === BS) esc = true; else if (c === '"') inStr = false; }
                    else if (c === '"') inStr = true;
                    else if (c === '[' || c === '{') depth++;
                    else if (c === ']' || c === '}') depth--;
                  }
                  return depth > 0 || inStr;
                }

                // ★ Helper: autoCreateFlashcards (replica meggy-cache.js:187)
                function autoCreateFlashcards(questions) {
                  return questions.map(q => {
                    let back = '';
                    if (q.type === 'mc' && q.options) {
                      const letter = String.fromCharCode(65 + q.correct) + ') ';
                      back = letter + (q.options[q.correct] || '');
                    } else {
                      back = (q.correct === 1 || q.correct === '1') ? 'Certo' : 'Errado';
                    }
                    if (q.explanation) back += '\n\n💡 ' + q.explanation;
                    if (q.legalText) back += '\n\n⚖️ ' + q.legalText;
                    if (q.fundamentacao) back += '\n\n📚 ' + q.fundamentacao;
                    return { f: q.statement, b: back, subject: lessonName, type: q.type };
                  });
                }

                // ★ Helper: save to material folder (replica meggy-summaries.js saveSummaryToLessonFolder)
                async function saveToFolder(materialType, fileName, content) {
                  try {
                    await fetch('/api/materials/save-in-folder', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ lessonPath, materialType, fileName, content })
                    });
                  } catch (e) { console.warn('[Shell] saveToFolder:', e); }
                }

                // ★ Safe filename fragment
                function safeName(s) {
                  return String(s || '').replace(/[/\\?%*:|"<>]/g, '_').trim().slice(0, 120) || 'aula';
                }

                // ─── PARALLEL GENERATION (Promise.allSettled) ───
                // ★ v2.15.6-resumo: guardar o ÚLTIMO erro da IA — antes ele
                //   era engolido e o usuário só via o texto genérico ("não
                //   foi possível gerar"), sem saber se era limite de
                //   mensagens, sessão expirada ou erro do provedor.
                let _isaLastErr = null;
                const _isaFailReason = (err) => {
                  const m = String((err && err.message) || '');
                  if (/429/.test(m)) return ' Motivo: a Meggy atingiu o limite de 30 mensagens por hora — aguarde um pouco e tente de novo.';
                  if (/401/.test(m)) return ' Motivo: sua sessão expirou — saia e entre de novo, depois tente novamente.';
                  const hm = m.match(/AI HTTP (\d+)/);
                  if (hm) { // ★ v2.15.14-Q2b-detalhe-502: mostra o resumo do erro agregado (ver Q2a)
                    const _dt = String((err && err.detail) || '');
                    // ★ v2.15.15-A6-detalhe-completo: sem slice(0,240) — o corte
                    //   a 240 chars é EXATAMENTE o fim do texto do Passo 19
                    //   ("OpenRouter nvidia/nem", 219 + 21). O detalhe
                    //   inteiro é devolvido, um provedor por parágrafo.
                    return ' Motivo: a IA devolveu HTTP ' + hm[1] + '.' + (_dt ? ' Detalhe:\n\n• ' + _dt.split(' | ').join('\n\n• ') : '');
                  }
                  if (m) return ' Motivo: ' + m.slice(0, 120);
                  return '';
                };
                // ★ v2.15.12-D4a-loading-por-aba: as 3 tarefas correm em
                //   paralelo e TODAS escreviam no mesmo bodyEl — o texto de
                //   loading da aba clicada ("tentativa N de 3" das questões)
                //   era rotineiramente apagado pelo setLoading do resumo ou
                //   das pílulas (o Passo 16 nunca viu "tentativa 2 de 3").
                //   Só a tarefa da aba pedida (isaField) escreve o loading;
                //   as outras geram em silêncio. Os setLoading fora das
                //   tarefas (extração, "a gerar em cadeia") mantêm-se.
                function _setTaskLoading(field, msg) {
                  if (field === isaField) setLoading(msg);
                }
                const tasks = [];
                // Task 1: resumo (3-level auto-retry)
                tasks.push((async () => {
                  for (let i = 0; i < RESUMO_PROMPTS.length; i++) {
                    try {
                      _setTaskLoading('summary', i === 0 ? '✨ Gerando resumo profundo…' : i === 1 ? '✨ Tentando resumo médio…' : '✨ Tentando resumo simples…'); // ★ v2.15.12-D4b
                      const r = await callIsa(RESUMO_PROMPTS[i], 'resumo');
                      // ★ v2.15.11-B5-resumo-retry: uma RECUSA não é resumo — não
                      //   conta como gerado; tenta o próximo nível de prompt (o
                      //   retry de 3 níveis existe para isto). Se os 3 níveis
                      //   recusarem, value fica null e a aba mostra 'Não foi
                      //   possível gerar' — nunca sela recusa.
                      if (Shell._isIsaValidContent('summary', r)) return { field: 'summary', value: r }; // ★ v2.15.13-B3-gates-forma-resumo
                      if (r && r.length > 200) _isaLastErr = new Error('a IA recusou gerar o resumo (sem conteúdo da aula)');
                    } catch (e) { _isaLastErr = e; /* try next level */ }
                  }
                  return { field: 'summary', value: null };
                })());
                // Task 2: pílulas — ★ v2.15.10-E12-pilulas-retry: era UMA só
                //   tentativa (o resumo já tinha retry de 3 níveis; as
                //   pílulas não). Até 3 tentativas com validação (resposta
                //   >50 chars) e "tentativa N de 3" visível; sem retry em
                //   429/401 (cada tentativa conta no limite de 30 msgs/h).
                tasks.push((async () => {
                  for (let _a = 0; _a < 3; _a++) {
                    try {
                      _setTaskLoading('mindmap', _a === 0 ? '💊 Gerando pílulas de revisão…' : '💊 Gerando pílulas de revisão… (tentativa ' + (_a + 1) + ' de 3)'); // ★ v2.15.12-D4c
                      const _r = await callIsa(PILULAS_PROMPT, 'mindmap');
                      // ★ v2.15.11-B6-pilulas-retry: idem resumo — recusa não conta
                      //   como pílulas; o retry (3 tentativas) continua. Sem isto
                      //   a recusa passava o limiar de 50 chars e era guardada
                      //   como 'mindmap' (foi o que aconteceu na chave órfã).
                      if (Shell._isIsaValidContent('mindmap', _r)) return { field: 'mindmap', value: _r }; // ★ v2.15.13-B3-gates-forma-pilulas
                      _isaLastErr = new Error((_r && _r.length > 50) ? 'a IA recusou gerar as pílulas (sem conteúdo da aula)' : 'resposta vazia da IA');
                    } catch (e) {
                      _isaLastErr = e;
                      if (/429|401/.test(String((e && e.message) || ''))) break;
                    }
                    if (_a < 2) await new Promise((res) => setTimeout(res, 600 * (_a + 1)));
                  }
                  return { field: 'mindmap', value: null };
                })());
                // Task 3: questões (JSON) — ★ v2.15.10-E13-questoes-retry:
                //   era UMA só tentativa: 1 JSON inválido/prosa da IA ou 1
                //   HTTP transitório bastava p/ a 1ª geração falhar ("Não foi
                //   possível gerar este conteúdo.") e a 2ª passar — o sintoma
                //   do Passo 14 na Aula 09. Até 3 tentativas com validação
                //   do parse (≥1 questão) e "tentativa N de 3" visível; sem
                //   retry em 429/401 (cada tentativa conta no limite de
                //   30 msgs/h — ver _isaFailReason).
                tasks.push((async () => {
                  let _lastRaw = '';
                  for (let _a = 0; _a < 3; _a++) {
                    try {
                      _setTaskLoading('questions', _a === 0 ? '❓ Gerando questões…' : '❓ Gerando questões… (tentativa ' + (_a + 1) + ' de 3)'); // ★ v2.15.12-D4d
                      const r = await callIsa(QUESTOES_PROMPTS[_a] || QUESTOES_PROMPT, 'questoes'); // ★ v2.15.12-D2b
                      _lastRaw = r || '';
                      const _parsed = parseQuestions(r);
                      if (_parsed.length) return { field: 'questions', value: _parsed, raw: r };
                      // ★ v2.15.12-D3-erro-recusa: uma recusa em prosa não é
                      //   "JSON inválido" — dizê-lo como tal esconde a causa
                      //   (sem conteúdo da aula), como o resumo (B5) e as
                      //   pílulas (B6) já distinguem.
                      // ★ v2.15.13-B3-gates-forma-erro-questoes: prosa sem "[" não é
                      //   JSON — é recusa (sem conteúdo da aula); só um
                      //   texto COM "[" que falha o parse é "JSON inválido".
                      _isaLastErr = ((Shell._isIsaRefusal && Shell._isIsaRefusal(_lastRaw)) || (typeof _lastRaw === 'string' && _lastRaw.trim() && _lastRaw.indexOf('[') === -1))
                        ? new Error('a IA recusou gerar as questões (sem conteúdo da aula)')
                        : (_truncatedJson(_lastRaw) // ★ v2.15.14-Q1c-erro-truncamento
                          ? new Error('a IA devolveu questões incompletas (resposta cortada a meio do JSON)')
                          : new Error('a IA devolveu questões fora do formato JSON esperado'));
                    } catch (e) {
                      _isaLastErr = e;
                      if (/429|401/.test(String((e && e.message) || ''))) break;
                    }
                    if (_a < 2) await new Promise((res) => setTimeout(res, 600 * (_a + 1)));
                  }
                  return { field: 'questions', value: [], raw: _lastRaw };
                })());

                const results = await Promise.allSettled(tasks);
                const gen = { summary: null, mindmap: null, questions: [], flashcards: [] };
                results.forEach(r => {
                  if (r.status === 'fulfilled' && r.value) {
                    gen[r.value.field] = r.value.value;
                    if (r.value.field === 'questions' && r.value.value && r.value.value.length) {
                      gen.flashcards = autoCreateFlashcards(r.value.value);
                    }
                  }
                });

                // ─── 4. Save no cache (aguardado) + pasta (background) ───
                // ★ v2.15.6-resumo: o POST do cache é AGUARDADO — sem isso
                //   um clique concorrente (joiner da guarda de voo) ou o
                //   próximo clique não veria o resumo salvo e geraria tudo
                //   de novo. O save na pasta continua em background (o
                //   Drive é lento e não bloqueia o render). A falha do
                //   save é mostrada (antes era silenciosa e o resumo
                //   sumia na próxima visita sem explicação).
                const user = (typeof GDIUser !== 'undefined' && GDIUser && GDIUser.state && GDIUser.state.user) || 'meggy';
                const safeLesson = safeName(lessonName);
                let _cacheSaveOk = true;
                // ★ v2.15.11-B3-save-limpo: a entrada passa pelo saneador
                //   — uma recusa é gravada como null, nunca como resumo;
                //   as questões/pílulas boas geradas juntas passam intactas.
                //   A forma do POST não muda (key, summary, questions,
                //   mindmap, lessonName).
                try {
                  const _saveResp = await fetch('/api/ai/cache', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(Object.assign({ key: cacheKey }, Shell._isaSanitizeEntry({
                      summary: gen.summary,
                      questions: gen.questions.length ? gen.questions : null,
                      mindmap: gen.mindmap,
                      lessonName: lessonName
                    })))
                  });
                  if (!_saveResp.ok) _cacheSaveOk = false;
                } catch (e) { console.warn('[Shell] cache save:', e); _cacheSaveOk = false; }
                // Save to material folder (fire-and-forget, como antes)
                // ★ v2.15.11-B4-pasta-limpa: a recusa também não vai p/
                //   a pasta da aula como .md (o cache não era o único
                //   sítio onde ela ficava persistida como "resumo").
                if (gen.summary && Shell._isIsaValidContent('summary', gen.summary)) saveToFolder('resumo', user + '_' + safeLesson + '.md', gen.summary); // ★ v2.15.13-B3-gates-forma-pasta
                if (gen.mindmap && Shell._isIsaValidContent('mindmap', gen.mindmap)) saveToFolder('resumo', user + '_pilulas_' + safeLesson + '.md', gen.mindmap); // ★ v2.15.13-B3-gates-forma-pasta
                if (gen.questions && gen.questions.length) saveToFolder('questoes', user + '_' + safeName(courseName || lessonName) + '.json', JSON.stringify(gen.questions, null, 2));
                // ★ v2.15.12-D5-partilhar-pool: o showISA é o ÚNICO caminho
                //   de geração das abas do player (a Aula 09 não tem PDF —
                //   a cadeia meggy-cache.js nem arranca) e NUNCA escrevia
                //   no pool partilhado — por isso as secções
                //   "Compartilhados" de /questoes, /flashcards e /resumos
                //   estavam vazias embora o cache da aula tivesse itens
                //   (Passo 16). Partilha best-effort, sem bloquear o
                //   render: resumo (+questões) no pool de resumos e cada
                //   questão como card partilhado (o servidor dedupa por
                //   (autor, aula) / (autor, assunto, enunciado), por isso
                //   re-gerar não duplica). Só o conteúdo gerado AGORA —
                //   o cache-hit retorna antes e não volta a partilhar.
                try {
                  if (gen.summary && Shell._isIsaValidContent('summary', gen.summary)) { // ★ v2.15.13-B3-gates-forma-partilha
                    fetch('/api/ai/shared-summaries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lessonName: lessonName, summary: gen.summary, questions: gen.questions.length ? gen.questions : null }) }).catch(() => {});
                  }
                  if (gen.questions && gen.questions.length) {
                    for (let _qi = 0; _qi < gen.questions.length; _qi++) {
                      const _q = gen.questions[_qi];
                      const _back = (gen.flashcards && gen.flashcards[_qi]) ? gen.flashcards[_qi].b : '';
                      fetch('/api/ai/shared-flashcards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: lessonName, front: _q.statement || '', back: _back || '', statement: _q.statement || '', options: Array.isArray(_q.options) ? _q.options : null, correct: (typeof _q.correct === 'number' ? _q.correct : 0), explanation: _q.explanation || '', legalText: _q.legalText || '', fundamentacao: _q.fundamentacao || '', type: _q.type || 'mc' }) }).catch(() => {});
                    }
                  }
                } catch (_) {}

                // ─── 6. Render requested type ───
                const cached2 = { summary: gen.summary, questions: gen.questions.length ? gen.questions : null, mindmap: gen.mindmap, lessonName: lessonName };
                let toShow = gen[isaField];
                if (type === 'isa-flashcards') toShow = gen.flashcards.length ? gen.flashcards : null;
                if (isaField === 'questions' && (!toShow || !toShow.length)) toShow = null;
                if (!toShow) toShow = type === 'isa-flashcards'
                  ? 'Não foi possível gerar flashcards. Tente novamente.' + _isaFailReason(_isaLastErr)
                  : 'Não foi possível gerar este conteúdo. Tente novamente.' + _isaFailReason(_isaLastErr);

                if (type === 'isa-flashcards' && gen.flashcards.length) {
                  // Flashcards usa render especial (flip deck)
                  Shell._renderFlashcardDeck(bodyEl, { flashcards: gen.flashcards, lessonName: lessonName, questions: gen.questions });
                } else {
                  Shell._renderISAResult(type, toShow, bodyEl, lessonName, false, cached2);
                }
                if (!_cacheSaveOk && (gen.summary || gen.mindmap || (gen.questions && gen.questions.length))) {
                  const _w = document.createElement('div');
                  _w.style.cssText = 'margin-top:12px;padding:10px 14px;background:rgba(255,193,7,.08);border:1px solid rgba(255,193,7,.3);border-radius:10px;color:#ffc107;font-size:12px;line-height:1.5;';
                  _w.textContent = '⚠️ O conteúdo foi gerado, mas não foi possível salvar no cache — ao voltar nesta aula, a Meggy vai gerar de novo.';
                  bodyEl.appendChild(_w);
                }
                // ★ v2.15.6-resumo: o resultado pode demorar 30-60s — o
                //   usuário pode ter rolado para outro lugar; traz o
                //   painel de volta para a vista ao renderizar.
                try { if (bodyEl && bodyEl.scrollIntoView) bodyEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) {}
              } catch (e) {
                console.error('[Shell] showISA:', e);
                // ★ v2.15.6-resumo: "Tentar novamente" re-clica a aba ISA
                //   (antes recarregava o player INTEIRO — e a descrição
                //   auto-gerada não re-disparava, porque a sessão já
                //   estava marcada como tentada — então o retry não
                //   fazia nada de útil). O motivo do erro é mostrado.
                bodyEl.innerHTML = '<div style="padding:20px;color:#ff8b9f;text-align:center;">' +
                  '<div style="font-size:36px;margin-bottom:12px;">⚠️</div>' +
                  '<div style="font-weight:600;margin-bottom:8px;">Não foi possível gerar este conteúdo</div>' +
                  '<div style="font-size:14px;line-height:1.5;color:#9aa4b8;margin-bottom:16px;">Verifique sua conexão e toque em "Tentar novamente".' + Shell._esc((e && e.message) ? (' Motivo: ' + String(e.message).slice(0, 120)) : '') + '</div>' +
                  '<button id="gdi-isa-retry" class="meggy-header-btn" style="background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;border:none;"><i class="bi bi-arrow-clockwise"></i> Tentar novamente</button>' +
                '</div>';
                const _retryBtn = bodyEl.querySelector('#gdi-isa-retry');
                if (_retryBtn) _retryBtn.onclick = () => { const _t = document.querySelector('.gdi-mat-tab[data-mat="' + type + '"]'); if (_t) _t.click(); };
              }
            })();
            Shell._isaInflight[_isaCacheKey] = _myRun;
            _myRun.catch(() => {}).finally(() => { if (Shell._isaInflight[_isaCacheKey] === _myRun) delete Shell._isaInflight[_isaCacheKey]; try { updateLessonDescription(); } catch (_) {} }); // ★ v2.15.26-B: a geração terminou (hit ou save) — a descrição sob o vídeo relê o cache e mostra o resumo sem esperar pelo tick do poller
          }

          tabsEl.innerHTML = '<span style="font-size:12px;color:#6b7488;padding:8px;">Buscando…</span>';
          if (statusEl) statusEl.textContent = 'buscando…';
          bodyEl.innerHTML = '';
          try {
            const folderPath = Shell.state.currentFolderPath || '';
            if (!folderPath || !window.gdiListAllFiles) {
              tabsEl.innerHTML = '';
              if (statusEl) statusEl.textContent = 'sem material';
              // ★ v2.15.6-resumo: as abas ISA existem SEMPRE (mesmo sem
              //   pasta/listagem — elas geram a partir do nome/contexto
              //   da aula). Antes este ramo apagava as abas e retornava
              //   sem renderizá-las, contra a intenção da v2.15.6.
              renderIsaTabs();
              bodyEl.innerHTML = '<div style="text-align:center;padding:40px;color:#6b7488;"><i class="bi bi-file-earmark-x" style="font-size:34px;"></i><div>Nenhum material.</div></div>';
              return;
            }
            const isMaterial = (x) => {
              const ext = (x.fileExtension || ((x.name||'').split('.').pop() || '')).toLowerCase();
              const mt = (x.mimeType || '').toLowerCase();
              return ext === 'pdf' || mt.includes('pdf') || ext === 'md' || mt.includes('markdown') || ext === 'txt' || mt === 'text/plain' || ext === 'html' || mt.includes('html');
            };
            let found = [];
            // 1. Pasta atual
            const here = await window.gdiListAllFiles(folderPath, '');
            found = here.filter(isMaterial);
            // 2. Subpastas (até 20, para no 1º)
            if (!found.length) {
              const subs = here.filter(x => x.mimeType === 'application/vnd.google-apps.folder').slice(0, 20);
              for (const sf of subs) {
                const fp = folderPath + encodeURIComponent(sf.name) + '/';
                const subFiles = await window.gdiListAllFiles(fp, '');
                found = found.concat(subFiles.filter(isMaterial));
                if (found.length) break;
              }
            }
            // 3. Pasta pai
            if (!found.length) {
              const parts = folderPath.split('/').filter(Boolean);
              const parentPath = '/' + parts.slice(0, -1).join('/') + '/';
              if (parentPath !== '/' && parentPath !== folderPath) {
                const parentFiles = await window.gdiListAllFiles(parentPath, '');
                found = parentFiles.filter(isMaterial);
              }
            }
            // ★ Dedup por nome similar (STAGING FIX).
            // Normalização: lowercase + remove tudo que não é letra a-z
            //   (isso remove dígitos, espaços, hífens, prefixes tipo "1 - ", "2 - ", acentos).
            // Exemplos:
            //   "1 - Dir adm"    → "diradm"
            //   "2 - dir admin"  → "diradmin"
            //   "Dir adm 2"      → "diradm"   (mesmo normalizado — dedup por exact-match)
            // Regra de dedup (mantém o 1º, descarta os repetidos):
            //   1) nome exato repetido         → descarta
            //   2) normalização igual          → descarta
            //   3) um normalizado é prefixo do outro (min 5 chars) → descarta
            //      (captura "diradm" vs "diradmin": diradmin.startsWith(diradm) === true)
            const normalizeName = (name) => (name || '').toLowerCase().replace(/[^a-z]/g, '');
            const seenExact = new Set();
            const seenNorm = [];
            const uniq = [];
            found.forEach(x => {
              if (seenExact.has(x.name)) return;          // (1) exact name dedup
              const norm = normalizeName(x.name);
              if (!norm) { seenExact.add(x.name); uniq.push(x); return; }
              const isDup = seenNorm.some(n =>
                n === norm ||                              // (2) exact normalized dedup
                (n.length >= 5 && norm.length >= 5 &&      // (3) prefix-match dedup
                 (n.startsWith(norm) || norm.startsWith(n)))
              );
              if (isDup) return;
              seenExact.add(x.name);
              seenNorm.push(norm);
              uniq.push(x);
            });
            const materials = uniq.slice(0, 12);

            tabsEl.innerHTML = '';
            if (!materials.length) {
              if (statusEl) statusEl.textContent = 'sem material — a Meggy gera a partir da aula';
              renderIsaTabs();
              bodyEl.innerHTML = '<div style="text-align:center;padding:40px 24px;color:#9aa4b8;"><div style="font-size:15px;font-weight:600;color:#e6edf3;margin-bottom:8px;">🐩 Nenhum material nesta pasta</div><div style="font-size:13px;line-height:1.6;">Esta aula só tem o vídeo — sem PDF ou apostila. Use as abas <b style="color:#a78bfa;">Resumo Meggy</b>, <b style="color:#a78bfa;">Questões</b>, <b style="color:#a78bfa;">Pílulas</b> ou <b style="color:#a78bfa;">Flashcards</b> acima: a Meggy gera o conteúdo a partir do nome e do contexto da aula.</div></div>';
              return;
            }
            if (statusEl) statusEl.textContent = materials.length + ' material(is)';

            // Tabs (botões verticais como Alfacon) — C4: numbering for multiple generic PDFs
            let materialCounter = 0;
            materials.forEach((m, i) => {
              const ext = (m.name.split('.').pop() || '').toLowerCase();
              const lowName = m.name.toLowerCase();
              const isTransc = lowName.includes('transcri') || ext === 'txt';
              const isAiResumo = lowName.startsWith('resumo') || lowName.includes('resumo_ia') || lowName.includes('resumo-ia') || (lowName.includes('ia') && lowName.includes('resumo'));
              const isEbook = lowName.includes('ebook') || lowName.includes('apostila');
              const isGenericPdf = ext === 'pdf' && !isTransc && !isAiResumo && !isEbook;
              if (isGenericPdf) materialCounter++;
              // ★ Label: "Material 1", "Material 2" se múltiplos PDFs genéricos; só "Material" se único
              let label;
              if (isTransc) label = 'Transcrição';
              else if (isAiResumo) label = 'Resumo IA';
              else if (isEbook) label = 'Ebook';
              else if (isGenericPdf) label = materialCounter > 1 ? 'Material ' + materialCounter : 'Material';
              else label = m.name.replace(/\.[^.]+$/, '').substring(0, 15);
              const icon = isTransc ? 'bi-card-text' : isAiResumo ? 'bi-stars' : isEbook ? 'bi-book' : ext === 'pdf' ? 'bi-file-earmark-pdf' : 'bi-file-earmark-text';
              const tab = document.createElement('button');
              tab.className = 'gdi-mat-tab' + (i === 0 ? ' active' : '');
              if (i === 0) tab.setAttribute('aria-current', 'true');
              tab.style.cssText = 'display:inline-flex;flex-direction:row;align-items:center;gap:6px;padding:7px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:999px;cursor:pointer;font-size:13px;font-weight:500;color:#c9d1d9;font-family:inherit;transition:all 0.15s;white-space:nowrap;';
              tab.dataset.mat = i;
              tab.innerHTML = `<i class="bi ${icon}" style="font-size:16px;"></i><span style="font-size:13px;font-weight:600;">${label}</span>`;
              tab.onmouseenter = () => { if (!tab.classList.contains('active')) { tab.style.background = 'rgba(255,255,255,0.13)'; tab.style.color = '#fff'; } };
              tab.onmouseleave = () => { if (!tab.classList.contains('active')) { tab.style.background = 'rgba(255,255,255,0.06)'; tab.style.color = '#c9d1d9'; } };
              tab.onclick = () => showMaterial(i);
              tabsEl.appendChild(tab);
            });

            renderIsaTabs();

            function showMaterial(i) {
              document.querySelectorAll('.gdi-mat-tab').forEach(t => { t.classList.remove('active'); t.removeAttribute('aria-current'); t.style.background = 'rgba(255,255,255,0.06)'; t.style.borderColor = 'rgba(255,255,255,0.12)'; t.style.color = '#c9d1d9'; });
              const activeTab = document.querySelector(`.gdi-mat-tab[data-mat="${i}"]`);
              if (activeTab) { activeTab.classList.add('active'); activeTab.setAttribute('aria-current', 'true'); activeTab.style.background = '#1f6feb'; activeTab.style.borderColor = '#1f6feb'; activeTab.style.color = '#fff'; }
              const m = materials[i];
              let link = '';
              if (m.link) { link = m.link.startsWith('http') ? m.link : (window.location.origin + m.link); if (m.name.endsWith('.pdf') && !link.includes('inline=')) link += (link.includes('?') ? '&' : '?') + 'inline=true'; }
              const ext = (m.name.split('.').pop() || '').toLowerCase();
              if (ext === 'pdf' && link) bodyEl.innerHTML = `<iframe src="${link}" style="width:100%;height:100%;border:none;border-radius:16px;"></iframe>`;
              else if ((ext === 'md' || ext === 'txt' || ext === 'html') && link) {
                bodyEl.innerHTML = '<div id="gdi-mat-md" style="width:100%;height:100%;overflow:auto;padding:0;color:#e6edf3;font-size:14px;">Carregando...</div>';
                fetch(link).then(r => r.text()).then(async txt => {
                  const el = document.getElementById('gdi-mat-md');
                  if (el) {
                    // ★ v2.15.5 item 10: renderer único (marked+DOMPurify
                    //    ou o vendored quando o CDN falha) — fim do MD cru.
                    //    'let' porque o toolbar abaixo REATRIBUI h.
                    await Shell._ensureMdLibs();
                    let h = Shell._renderMd(txt);
                    // ★ Toolbar com botão Baixar PDF (sticky no topo)
                    h = '<div style="margin-bottom:12px;padding:8px 12px;background:rgba(255,139,159,0.08);border:1px solid rgba(255,139,159,0.2);border-radius:8px 8px 0 0;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:2;backdrop-filter:blur(8px);">' +
                        '<span style="font-size:12px;color:#9aa4b8;"><i class="bi bi-file-earmark-text"></i> ' + Shell._esc(m.name) + '</span>' +
                        '<button onclick="window._downloadMdAsPdf(' + Shell._esc(JSON.stringify(m.name)) + ')" style="background:rgba(255,139,159,0.12);border:1px solid rgba(255,139,159,0.3);color:#ff8b9f;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;"><i class="bi bi-download"></i> Baixar PDF</button>' +
                        '</div>' +
                        '<div class="gdi-isa-summary-body" style="padding:16px;">' + h + '</div>';
                    el.innerHTML = h;
                    // ★ Guardar texto para download
                    window._lastMdText = txt;
                    window._lastMdName = m.name;
                  }
                }).catch(() => { const el = document.getElementById('gdi-mat-md'); if (el) el.textContent = 'Não foi possível carregar o texto. Toque na aba novamente.'; });
              } else if (link) bodyEl.innerHTML = `<div style="text-align:center;padding:40px;"><a href="${link}" target="_blank" class="gdi-mode-btn"><i class="bi bi-download"></i> Abrir</a></div>`;
              else bodyEl.innerHTML = '<div style="text-align:center;padding:40px;color:#6b7488;">Sem preview</div>';
            }


            if (materials.length > 0) showMaterial(0);
          } catch (e) {
            console.error('[Shell] loadMaterials:', e);
            try { renderIsaTabs(); } catch (_) { tabsEl.innerHTML = ''; }
            if (statusEl) statusEl.textContent = 'não foi possível carregar';
            bodyEl.innerHTML = `<div style="text-align:center;padding:40px 24px;color:#e6edf3;"><div style="font-weight:700;margin-bottom:8px;">Não foi possível carregar o material</div><div style="font-size:14px;line-height:1.5;color:#9aa4b8;">Verifique sua conexão e toque na aba novamente.</div></div>`;
          }
        }
        // ★ v2.15.6 (PROVA EXTRA): descrição da aula sob o título.
        //   Regra do Elton: (1) descrição da Meggy se existir (resumo no
        //   cache ISA, mesma chave do showISA); (2) nome real da pasta
        //   como descrição provisória; (3) nome genérico ("001 -
        //   aula.mp4") fica EM BRANCO até a Meggy processar — nunca se
        //   inventa descrição. Sem resumo, a aula dispara a geração
        //   (clicando a aba Resumo Meggy, 1x por sessão por aula) e
        //   mostra o progresso no próprio bloco + no painel de materiais.
        function lessonDescCacheKey() {
          const cur = (pl && pl[idx]) || {};
          const rawName = cur.origName || cur.name || '';
          let _rk;
          try { _rk = decodeURIComponent((Shell.state.currentFolderPath || '') + rawName); } catch (_) { _rk = (Shell.state.currentFolderPath || '') + rawName; }
          return encodeURI(_rk);
        }
        function triggerIsaSummaryTab() {
          // Clica a aba Resumo Meggy quando ela existir (o loadMaterials
          // a cria com ~500ms de atraso) — espera até 10s.
          // ★ v2.15.8-E: se a aba SUMIU (o M9 legado apagava o painel —
          //   ver gdi-core.js shellOwnsMaterialsPanel), o poll sozinho
          //   nunca a acharia: recria as abas do shell 1× e segue o poll. // S1-trigger-recria-abas
          return new Promise((resolve) => {
            let tries = 0;
            let _reloaded = false;
            const tick = () => {
              const t = document.querySelector('.gdi-mat-tab[data-mat="isa-summary"]');
              if (t) { try { t.click(); } catch (_) {} resolve(true); return; }
              if (!_reloaded) { _reloaded = true; try { loadMaterials(); } catch (_) {} }
              if (++tries >= 20) { resolve(false); return; }
              setTimeout(tick, 500);
            };
            tick();
          });
        }
        // ★ v2.15.26-B: polling limitado em vez dos dois timeouts fixos
        //   de 45s/90s. Os fixos falhavam quando a geração demorava >90s
        //   (resumo 3 níveis de retry + questões 3 tentativas; o save só
        //   acontece após Promise.allSettled das 3 tarefas) e NUNCA
        //   corriam quando o resumo era gerado pela aba Resumo Meggy
        //   direta (nenhum refresh era agendado nesse caminho — ver o
        //   hook no finally do showISA). O poller pára quando: o resumo
        //   renderiza; o bloco some (saiu da aula); a aula muda; há um
        //   novo render do player; ou no teto de 16×30s (~8 min). Não
        //   re-dispara a geração (o autoGen continua 1x por sessão).
        let _descPoll = null; // { key, n, timer } — um por aula/render
        function lessonDescScheduleRefresh() {
          const key = lessonDescCacheKey();
          if (_descPoll) {
            if (_descPoll.key === key) return; // mesma aula, já a correr
            try { clearTimeout(_descPoll.timer); } catch (_) {}
            _descPoll = null; // mudou de aula — recomeça p/ a nova
          }
          _descPoll = { key: key, n: 0, timer: null };
          const _tick = async () => {
            const _mine = _descPoll;
            if (!_mine) return;
            _mine.timer = null;
            let done = false;
            try {
              if (!document.getElementById('gdi-lesson-desc')) { if (_descPoll === _mine) _descPoll = null; return; }
              if (Shell._playerRenderSeq !== _thisRenderSeq) { if (_descPoll === _mine) _descPoll = null; return; }
              if (lessonDescCacheKey() !== _mine.key) { if (_descPoll === _mine) _descPoll = null; return; }
              done = await updateLessonDescription();
            } catch (_) {}
            if (_descPoll !== _mine) return; // outra aula/render tomou conta
            if (done) { _descPoll = null; return; } // resumo renderizou
            if (++_mine.n >= 16) { _descPoll = null; return; } // teto ~8 min
            _mine.timer = setTimeout(_tick, 30000);
          };
          _descPoll.timer = setTimeout(_tick, 30000);
        }
        async function autoGenLessonDescription() {
          // 1x por sessão por aula — a geração em si leva 30-60s e o
          // refresh de 45s/90s confirma o resumo no cache.
          const cacheKey = lessonDescCacheKey();
          let tried = false;
          try { tried = sessionStorage.getItem('gdi-desc-auto:' + cacheKey) === '1'; } catch (_) {}
          if (tried) return false;
          try { sessionStorage.setItem('gdi-desc-auto:' + cacheKey, '1'); } catch (_) {}
          const clicked = await triggerIsaSummaryTab();
          if (clicked) lessonDescScheduleRefresh();
          return clicked;
        }
        async function updateLessonDescription() {
          const descEl = document.getElementById('gdi-lesson-desc');
          if (!descEl) return false; // ★ v2.15.26-B: boolean p/ o poller
          const cur = (pl && pl[idx]) || {};
          const rawName = cur.origName || cur.name || '';
          let folderLabel = cur.folderLabel || cur.folder || '';
          if (!folderLabel) {
            try { const _segs = (Shell.state.currentFolderPath || '').split('/').filter(Boolean); folderLabel = _segs.length ? decodeURIComponent(_segs[_segs.length - 1]) : ''; } catch (_) {}
          }
          const generic = Shell.views._v215LessonNameIsGeneric(rawName);
          const provName = generic ? folderLabel : rawName;
          const provIsReal = !!provName && !Shell.views._v215LessonNameIsGeneric(provName);
          // (1) Descrição da Meggy — resumo no cache ISA.
          let summary = '';
          try {
            const r = await fetch('/api/ai/cache?key=' + encodeURIComponent(lessonDescCacheKey()), { headers: { 'Accept': 'application/json' }, credentials: 'include' });
            // ★ v2.15.11-B10-descricao: a descrição acima do player lê o
            //   mesmo cache ISA — uma recusa guardada não pode virar a
            //   descrição da aula (length > 50 deixava-a passar). Sem
            //   resumo válido, cai na descrição provisória / geração.
            if (r.ok) { const d = await r.json().catch(() => null); if (d && d.cached && typeof d.cached.summary === 'string' && d.cached.summary.length > 50 && !Shell._isIsaRefusal(d.cached.summary)) summary = d.cached.summary; }
          } catch (_) {}
          const esc = (Shell.views && Shell.views._esc) ? Shell.views._esc : Shell._esc;
          if (summary) {
            const plain = String(summary).replace(/[#>*`_|\[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
            const excerpt = plain.slice(0, 280) + (plain.length > 280 ? '…' : '');
            // ★ v2.15.27-A: SEM o gancho determinístico prefixado — o
            //   _v215LessonDescHook(rawName) punha um texto fixo ("Nesta
            //   aula exploramos…", hash de "001 - aula.mp4") ANTES do
            //   excerto, e o bloco parecia abrir com a abertura bruta do
            //   modelo (Passo 25). O excerto JÁ é o resumo guardado, que
            //   abre com o gancho real — é ele que tem de abrir o bloco.
            descEl.innerHTML = '<div><span style="color:#ff8b9f;font-weight:600;">🐩</span> ' + esc(excerpt) + ' <a href="#" id="gdi-desc-more" style="color:#5ddeda;white-space:nowrap;">Ver resumo completo</a></div>';
            const more = document.getElementById('gdi-desc-more');
            // ★ v2.15.8-E: a aba pode ter sumido (o M9 apagava o painel) — o clique era no-op silencioso. Recria as abas do shell e clica quando aparecerem (até 10s). // S2-ver-resumo-recria-abas
            if (more) more.onclick = (e) => { e.preventDefault(); const t0 = document.querySelector('.gdi-mat-tab[data-mat="isa-summary"]'); if (t0) { t0.click(); return; } try { loadMaterials(); } catch (_) {} let _n = 0; const _tick = () => { const t = document.querySelector('.gdi-mat-tab[data-mat="isa-summary"]'); if (t) { try { t.click(); } catch (_) {} return; } if (++_n >= 20) return; setTimeout(_tick, 500); }; _tick(); };
            return true; // ★ v2.15.26-B: resumo renderizou — o poller pára
          }
          // (2) Nome real da pasta como descrição provisória.
          if (provIsReal) {
            descEl.innerHTML = '<div>' + esc(provName) + ' <span style="color:#6b7488;">— descrição provisória; a Meggy ainda não gerou o resumo desta aula.</span> <a href="#" id="gdi-desc-gen" style="color:#5ddeda;white-space:nowrap;">🐩 Gerar descrição</a></div>';
            const gen = document.getElementById('gdi-desc-gen');
            if (gen) gen.onclick = async (e) => {
              e.preventDefault();
              descEl.innerHTML = '<div style="color:#9aa4b8;">🐩 A Meggy está criando a descrição desta aula… acompanhe no painel de materiais.</div>';
              if (await triggerIsaSummaryTab()) lessonDescScheduleRefresh();
            };
            lessonDescScheduleRefresh(); // ★ v2.15.26-B: arma o poller na provisória
            return false;
          }
          // (3) Nome genérico: EM BRANCO até a Meggy processar — dispara
          // a geração 1x por sessão; se já tentou, mostra só o botão.
          let tried = false;
          try { tried = sessionStorage.getItem('gdi-desc-auto:' + lessonDescCacheKey()) === '1'; } catch (_) {}
          if (!tried) {
            descEl.innerHTML = '<div style="color:#9aa4b8;">🐩 A Meggy está criando a descrição desta aula… acompanhe no painel de materiais.</div>';
            autoGenLessonDescription();
          } else {
            descEl.innerHTML = '<div style="color:#6b7488;">A Meggy ainda não gerou a descrição desta aula. <a href="#" id="gdi-desc-retry" style="color:#5ddeda;white-space:nowrap;">🐩 Tentar gerar de novo</a></div>';
            const retry = document.getElementById('gdi-desc-retry');
            if (retry) retry.onclick = async (e) => {
              e.preventDefault();
              descEl.innerHTML = '<div style="color:#9aa4b8;">🐩 A Meggy está criando a descrição desta aula… acompanhe no painel de materiais.</div>';
              if (await triggerIsaSummaryTab()) lessonDescScheduleRefresh();
            };
          }
          lessonDescScheduleRefresh(); // ★ v2.15.26-B: arma o poller na provisória/a gerar
          return false;
        }
        setTimeout(loadMaterials, 500);
        updateLessonDescription();

        // Anotações
        const notesInput = document.getElementById('gdi-note-input');
        const notesKey = 'meggy-notes-' + videoUrl;
        try { notesInput.value = localStorage.getItem(notesKey) || ''; } catch (e) {}
        document.getElementById('gdi-note-save').onclick = () => {
          try { localStorage.setItem(notesKey, notesInput.value); } catch (e) {}
          const list = document.getElementById('gdi-notes-list');
          const note = document.createElement('div');
          note.style.cssText = 'padding:8px;border-radius:6px;background:rgba(255,255,255,0.04);margin-top:6px;font-size:12px;';
          note.innerHTML = `<span style="color:#5ddeda;">${timeEl.textContent}</span> ${notesInput.value}`;
          list.appendChild(note);
          notesInput.value = '';
        };
        // ★ v2.15.4 Q6: seek por input inline — o prompt() nativo era
        //   auto-dispensado em navegador automatizado → parseFloat(null)
        //   = NaN → || 0 → o vídeo pulava para 0s. Agora: clique no tempo
        //   abre um input (aceita segundos ou mm:ss); Enter aplica,
        //   Esc ou blur cancela sem tocar no vídeo.
        let __seekInput = null;
        timeEl.onclick = () => {
          if (!video) return;
          if (!__seekInput) {
            __seekInput = document.createElement('input');
            __seekInput.type = 'text';
            __seekInput.inputMode = 'decimal';
            __seekInput.setAttribute('aria-label', 'Ir para (segundos ou mm:ss)');
            __seekInput.style.cssText = 'width:90px;background:rgba(255,255,255,0.06);border:1px solid rgba(93,222,218,0.4);border-radius:6px;padding:6px 8px;color:#e6edf3;font-size:12px;font-family:inherit;outline:none;';
            const applySeekInput = () => {
              const raw = String(__seekInput.value || '').trim();
              let t = NaN;
              const mm = raw.match(/^(\d+):([0-5]?\d)$/);
              if (mm) t = parseInt(mm[1], 10) * 60 + parseInt(mm[2], 10);
              else t = parseFloat(raw);
              if (isFinite(t) && t >= 0) video.currentTime = Math.min(t, video.duration || t);
              __seekInput.style.display = 'none'; timeEl.style.display = '';
            };
            __seekInput.addEventListener('keydown', (ev) => {
              ev.stopPropagation();
              if (ev.key === 'Enter') applySeekInput();
              else if (ev.key === 'Escape') { __seekInput.style.display = 'none'; timeEl.style.display = ''; }
            });
            __seekInput.addEventListener('blur', () => { __seekInput.style.display = 'none'; timeEl.style.display = ''; });
            timeEl.parentNode.insertBefore(__seekInput, timeEl.nextSibling);
          }
          __seekInput.value = String(Math.floor(video.currentTime || 0));
          __seekInput.style.display = '';
          timeEl.style.display = 'none';
          __seekInput.focus();
          __seekInput.select();
        };
        // ★ v2.15.4 DESIGN: o tempo é botão (role+tabindex) — Enter/Espaço abrem o seek como o clique.
        timeEl.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); timeEl.click(); } };

        // Atalhos
        const keyHandler = (e) => {
          if (['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)) return;
          switch (e.key) {
            case ' ': e.preventDefault(); video.paused ? video.play() : video.pause(); break;
            case 'ArrowRight': video.currentTime = Math.min(video.duration, video.currentTime + 10); break;
            case 'ArrowLeft': video.currentTime = Math.max(0, video.currentTime - 10); break;
            case 'ArrowUp': e.preventDefault(); video.volume = Math.min(1, video.volume + 0.1); break;
            case 'ArrowDown': e.preventDefault(); video.volume = Math.max(0, video.volume - 0.1); break;
            case 'f': case 'F': goFullscreen(); break;
            case 'm': case 'M': video.muted = !video.muted; break;
            case 'n': case 'N': if (idx < pl.length - 1) switchTo(idx + 1); break;
            case 'p': case 'P': if (idx > 0) switchTo(idx - 1); break;
          }
        };
        document.addEventListener('keydown', keyHandler);
        main._cleanupKeyboard = () => { document.removeEventListener('keydown', keyHandler); document.body.classList.remove('meggy-player-active'); };

        main.scrollTop = 0;
        if (pl.length <= 1 && Shell.state.currentFolderPath) {
          // ★ v2.15.10-E7-autoclick-render: o timer de 1500 ms NÃO está
          //   preso a este render — antes, se outro player abrisse antes
          //   do timer, o clique caía no botão do NOVO player
          //   (cross-player). Só dispara se este render ainda for o
          //   player atual e nenhuma coleta estiver a correr.
          setTimeout(() => {
            if (Shell._playerRenderSeq !== _thisRenderSeq || Shell.state.currentView !== 'player') return;
            if (Shell._interfolderRunning) return;
            document.getElementById('gdi-interfolder-btn')?.click();
          }, 1500);
        }
      },

      // ═══ Estudos — views funcionais (cache + Meggy AI) ═══

      async _loadStudyCache() {
        try {
          const r = await fetch('/api/ai/cache/list', { headers: { 'Accept': 'application/json' }, credentials: 'include' });
          if (!r.ok) return [];
          const d = await r.json();
          return (d && d.entries) ? d.entries : [];
        } catch (e) {
          console.warn('[Shell] _loadStudyCache:', e);
          return [];
        }
      },

      // ★ Parse cache key into { drive, curso, disciplina, assunto, fileName }
      // Key format: /6:/CURSOS%202025/DISCIPLINAS%20ISOLADAS/isolada-direito-constitucional-12-meses/Direito%20Constitucional/Aula%2001%20-%20Introdu%C3%A7%C3%A3o/001%20-%20aula.mp4
      _parseCacheKey(key) {
        try {
          const parts = String(key || '').split('/').filter(Boolean);
          if (parts.length === 0) return { drive: '', curso: 'Sem curso', disciplina: '', assunto: '', fileName: '' };
          // Part 0 = drive index (e.g. "6:")
          const driveIdx = parts[0].match(/^(\d+):$/) ? +parts[0].slice(0, -1) : null;
          const driveName = (driveIdx !== null && window.drive_names && window.drive_names[driveIdx]) ? window.drive_names[driveIdx] : '';
          // Decode all parts
          const decoded = parts.map(p => { try { return decodeURIComponent(p); } catch(_) { return p; } });
          // Heuristic: find the course root (folder with "isolada-" or "curso-" or "CURSOS" or a known course name)
          // The structure is usually: /drive:/TOP_FOLDER/.../COURSE_ROOT/DISCIPLINA/ASSUNTO/file
          // We'll treat the DEEPEST folder before the file as "assunto", the one before as "disciplina", and find the course root
          let curso = '', disciplina = '', assunto = '';
          const fileName = decoded[decoded.length - 1] || '';
          const folders = decoded.slice(1, -1); // remove drive and filename
          if (folders.length === 0) {
            curso = driveName || 'Drive';
          } else if (folders.length === 1) {
            curso = folders[0];
          } else if (folders.length === 2) {
            curso = folders[0];
            disciplina = folders[1];
          } else {
            // Find course root: first folder that matches "isolada-", "curso-", or contains "CURSO"
            let courseIdx = folders.findIndex(f => /isolada-|curso-|^CURSOS$/i.test(f));
            if (courseIdx === -1) {
              // Fallback: use the 2nd-to-last folder as disciplina, 3rd-to-last as curso
              curso = folders[folders.length - 3] || folders[0];
              disciplina = folders[folders.length - 2] || '';
              assunto = folders[folders.length - 1] || '';
            } else {
              curso = folders[courseIdx];
              disciplina = folders[courseIdx + 1] || '';
              // Assunto = remaining folders joined
              const remaining = folders.slice(courseIdx + 2);
              assunto = remaining.length > 0 ? remaining.join(' / ') : '';
            }
          }
          return { drive: driveName, curso: curso || 'Sem curso', disciplina: disciplina || 'Geral', assunto: assunto || '', fileName: fileName };
        } catch(e) {
          return { drive: '', curso: 'Sem curso', disciplina: '', assunto: '', fileName: '' };
        }
      },

      // ★ Group entries into tree: { cursoName → { disciplinaName → { assuntoName → [entries] } } }
      _groupEntriesByHierarchy(entries) {
        const tree = {};
        entries.forEach(e => {
          const p = Shell.views._parseCacheKey(e.key);
          if (!tree[p.curso]) tree[p.curso] = {};
          if (!tree[p.curso][p.disciplina]) tree[p.curso][p.disciplina] = {};
          const assuntoKey = p.assunto || 'Sem assunto';
          if (!tree[p.curso][p.disciplina][assuntoKey]) tree[p.curso][p.disciplina][assuntoKey] = [];
          tree[p.curso][p.disciplina][assuntoKey].push(e);
        });
        return tree;
      },

      // ★ Render accordion tree: curso → disciplina → assunto → lessons
      _renderStudyTree(container, tree, type, el, allEntries) {
        const icon = type === 'flashcards' ? '🃏' : type === 'questoes' ? '❓' : '📚';
        const label = type === 'flashcards' ? 'flashcard(s)' : type === 'questoes' ? 'questão(ões)' : 'resumo(s)';
        const clickFn = type === 'flashcards' ? 'Shell.views._showFlashcardDeck' : type === 'questoes' ? 'Shell.views._showQuiz' : 'Shell.views._showSummary';

        let html = '<div style="margin-bottom:16px;color:#9aa4b8;font-size:13px;">' + allEntries.length + ' conteúdo(s) · organizado por curso → disciplina → assunto</div>';
        const cursos = Object.keys(tree).sort();
        html += '<div class="meggy-tree">';
        cursos.forEach((cursoName, ci) => {
          const disciplinas = tree[cursoName];
          const totalCurso = Object.values(disciplinas).reduce((acc, d) => acc + Object.values(d).reduce((a, arr) => a + arr.length, 0), 0);
          html += '<div class="meggy-tree-node meggy-tree-curso">';
          html += '<div class="meggy-tree-head" data-curso="' + ci + '" style="cursor:pointer;">';
          html += '<i class="bi bi-chevron-right meggy-tree-chevron"></i>';
          html += '<i class="bi bi-folder-fill meggy-tree-icon" style="color:#ff8b9f;"></i>';
          html += '<span class="meggy-tree-label">' + Shell.views._esc(cursoName) + '</span>';
          html += '<span class="meggy-tree-count">' + totalCurso + '</span>';
          html += '</div>';
          html += '<div class="meggy-tree-children" id="tree-curso-' + ci + '" style="display:none;">';
          Object.keys(disciplinas).sort().forEach((discName, di) => {
            const assuntos = disciplinas[discName];
            const totalDisc = Object.values(assuntos).reduce((a, arr) => a + arr.length, 0);
            html += '<div class="meggy-tree-node meggy-tree-disciplina">';
            html += '<div class="meggy-tree-head" data-disc="' + ci + '-' + di + '" style="cursor:pointer;">';
            html += '<i class="bi bi-chevron-right meggy-tree-chevron"></i>';
            html += '<i class="bi bi-book meggy-tree-icon" style="color:#5ddeda;"></i>';
            html += '<span class="meggy-tree-label">' + Shell.views._esc(discName) + '</span>';
            html += '<span class="meggy-tree-count">' + totalDisc + '</span>';
            html += '</div>';
            html += '<div class="meggy-tree-children" id="tree-disc-' + ci + '-' + di + '" style="display:none;">';
            Object.keys(assuntos).sort().forEach((assuntoName, ai) => {
              const lessons = assuntos[assuntoName];
              html += '<div class="meggy-tree-node meggy-tree-assunto">';
              html += '<div class="meggy-tree-head" data-assunto="' + ci + '-' + di + '-' + ai + '" style="cursor:pointer;">';
              html += '<i class="bi bi-chevron-right meggy-tree-chevron"></i>';
              html += '<i class="bi bi-collection-play meggy-tree-icon" style="color:#a78bfa;"></i>';
              html += '<span class="meggy-tree-label">' + Shell.views._esc(assuntoName) + '</span>';
              html += '<span class="meggy-tree-count">' + lessons.length + '</span>';
              html += '</div>';
              html += '<div class="meggy-tree-children" id="tree-assunto-' + ci + '-' + di + '-' + ai + '" style="display:none;">';
              html += '<div class="meggy-study-list">';
              lessons.forEach((e) => {
                const globalIdx = allEntries.indexOf(e);
                const date = e.date ? new Date(e.date).toLocaleDateString('pt-BR') : '';
                const lessonName = Shell.views._esc(e.lessonName || 'Aula');
                const meta = type === 'resumos'
                  ? (e.summary ? e.summary.replace(/[#*`>]/g, '').replace(/\n/g, ' ').substring(0, 80) + '...' : '')
                  : (e.questions ? e.questions.length + ' ' + label : '');
                html += '<div class="meggy-study-item" data-idx="' + globalIdx + '" style="cursor:pointer;">' +
                  '<div class="meggy-study-item-icon">' + icon + '</div>' +
                  '<div class="meggy-study-item-body">' +
                    '<div class="meggy-study-item-title">' + lessonName + '</div>' +
                    '<div class="meggy-study-item-meta">' + Shell.views._esc(meta) + (date ? ' · ' + date : '') + '</div>' +
                  '</div>' +
                  '<i class="bi bi-chevron-right meggy-study-item-chevron"></i>' +
                '</div>';
              });
              html += '</div>';
              html += '</div>'; // children assunto
              html += '</div>'; // node assunto
            });
            html += '</div>'; // children disc
            html += '</div>'; // node disc
          });
          html += '</div>'; // children curso
          html += '</div>'; // node curso
        });
        html += '</div>'; // tree
        container.innerHTML = html;

        // ★ Wire accordion toggles
        container.querySelectorAll('.meggy-tree-head').forEach(head => {
          head.onclick = (e) => {
            e.stopPropagation();
            const chevron = head.querySelector('.meggy-tree-chevron');
            const children = head.nextElementSibling;
            if (children) {
              const isOpen = children.style.display !== 'none';
              children.style.display = isOpen ? 'none' : 'block';
              chevron.classList.toggle('bi-chevron-right', isOpen);
              chevron.classList.toggle('bi-chevron-down', !isOpen);
            }
          };
        });

        // ★ Wire lesson clicks
        container.querySelectorAll('.meggy-study-item[data-idx]').forEach(item => {
          item.onclick = (e) => {
            e.stopPropagation();
            const idx = parseInt(item.dataset.idx, 10);
            const entry = allEntries[idx];
            if (!entry) return;
            if (type === 'flashcards') Shell.views._showFlashcardDeck(el, entry);
            else if (type === 'questoes') Shell.views._showQuiz(el, entry);
            else if (type === 'resumos') Shell.views._showSummary(el, entry);
          };
        });
      },

      // ★ v2.15.5 item 10: delega ao renderer único (era regex próprio
      //    sem tabelas/citações/links e com <li> sem <ul>).
      _mdToHtml(text) {
        return Shell._renderMd(text);
      },

      _esc(s) {
        if (s == null) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      },

      // ★ v2.15.1: seção "Compartilhados" — itens de TODOS os alunos, com
      // filtros por assunto e por aluno, autor visível em cada card.
      async _renderSharedSection(el, kind) {
        if (!el) return;
        const titles = { flashcards: 'Flashcards', questoes: 'Questões', resumos: 'Resumos' };
        const icons = { flashcards: '🃏', questoes: '❓', resumos: '📚' };
        const wrap = document.createElement('div');
        wrap.className = 'meggy-shared-section';
        wrap.style.cssText = 'margin-top:28px;';
        wrap.innerHTML =
          '<h2 style="font-size:17px;color:#f0f6fc;margin:0 0 4px;">🤝 Compartilhados — de todos os alunos</h2>' +
          '<div style="color:#9aa4b8;font-size:13px;margin-bottom:12px;">' + (titles[kind] || 'Conteúdos') + ' gerados por qualquer aluno · filtre por assunto e por aluno</div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">' +
            '<select id="meggy-shared-subject" style="flex:1;min-width:160px;background:rgba(255,255,255,.06);border:1px solid #30363d;color:#e6edf3;border-radius:8px;padding:8px 10px;font-size:13px;">' +
              '<option value="">Todos os assuntos</option>' +
            '</select>' +
            '<select id="meggy-shared-author" style="flex:1;min-width:160px;background:rgba(255,255,255,.06);border:1px solid #30363d;color:#e6edf3;border-radius:8px;padding:8px 10px;font-size:13px;">' +
              '<option value="">Todos os alunos</option>' +
            '</select>' +
          '</div>' +
          '<div id="meggy-shared-list"><div class="meggy-loading"><div class="spinner-border" role="status"></div><div>Carregando compartilhados...</div></div></div>';
        el.appendChild(wrap);
        const listEl = wrap.querySelector('#meggy-shared-list');
        const subjectSel = wrap.querySelector('#meggy-shared-subject');
        const authorSel = wrap.querySelector('#meggy-shared-author');
        const esc = Shell.views._esc;
        const fmtDate = (d) => { try { return d ? new Date(d).toLocaleDateString('pt-BR') : ''; } catch (_) { return ''; } };
        const toast = (m) => { try { if (typeof window.showToast === 'function') window.showToast(m); } catch (_) {} };
        try {
          if (!Shell.__sharedAuthors || !Shell.__sharedAuthors.length) { // ★ v2.15.12-D6a
            const r = await fetch('/api/ai/shared-authors', { cache: 'no-store' });
            const d = await r.json();
            Shell.__sharedAuthors = (d && d.ok && Array.isArray(d.authors)) ? d.authors : [];
          }
          if (!Shell.__sharedSubjects || !Shell.__sharedSubjects.summaryLessons || !Shell.__sharedSubjects.summaryLessons.length) { // ★ v2.15.12-D6b — vazio ([]) é truthy: sem isto os filtros ficavam com o vazio da 1ª carga a sessão inteira, mesmo depois de aparecerem itens
            const r = await fetch('/api/ai/shared-subjects', { cache: 'no-store' });
            const d = await r.json();
            Shell.__sharedSubjects = (d && d.ok) ? d : { summaryLessons: [], flashcardSubjects: [] };
          }
        } catch (_) {}
        // ★ v2.15.13-E2-3-assunto-por-kind: flashcardSubjects tem TODOS os
        //   subjects de shared_flashcards, incluindo assuntos com só
        //   flashcards puros (statement NULL) — em /questoes esses assuntos
        //   apareciam no dropdown e a lista vinha vazia, porque a lista
        //   pede kind=question (só linhas com statement). Agora a seleção
        //   é a do kind da aba atual: resumos -> summaryLessons; questoes
        //   -> questionSubjects (o campo novo do endpoint; se o worker
        //   ainda não o devolver, cai p/ flashcardSubjects, o total
        //   antigo); flashcards -> flashcardSubjects (total, que é
        //   exatamente o que a aba lista, sem filtro de kind).
        const subjects = kind === 'resumos'
          ? (Shell.__sharedSubjects.summaryLessons || [])
          : kind === 'questoes'
            ? (Shell.__sharedSubjects.questionSubjects || Shell.__sharedSubjects.flashcardSubjects || [])
            : (Shell.__sharedSubjects.flashcardSubjects || []);
        if (kind === 'resumos') subjectSel.querySelector('option').textContent = 'Todas as aulas';
        subjects.forEach((s) => {
          const o = document.createElement('option');
          o.value = s; o.textContent = s;
          subjectSel.appendChild(o);
        });
        (Shell.__sharedAuthors || []).forEach((a) => {
          const o = document.createElement('option');
          o.value = a.author;
          // ★ v2.15.13-E3-contagem-por-kind: o total antigo
          //   (summaries + flashcards) era o MESMO nas três abas, mas cada
          //   aba lista só o seu kind — um autor com 1 resumo e 0 questões
          //   mostrava "(1)" em /questoes e a lista vinha vazia (Passo 17).
          //   Agora a contagem é a do kind da aba atual: resumos ->
          //   summaries; questoes -> questions (o campo novo do endpoint;
          //   se o worker ainda não o devolver, cai p/ o total antigo);
          //   flashcards -> flashcards (total de linhas, que é exatamente
          //   o que a aba lista, sem filtro de kind).
          const _n = kind === 'resumos' ? (a.summaries || 0)
            : kind === 'questoes' ? (a.questions != null ? a.questions : (a.summaries || 0) + (a.flashcards || 0))
            : (a.flashcards || 0);
          o.textContent = a.author + ' (' + _n + ')';
          authorSel.appendChild(o);
        });
        const loadList = async () => {
          const subject = subjectSel.value || '';
          const author = authorSel.value || '';
          listEl.innerHTML = '<div class="meggy-loading"><div class="spinner-border" role="status"></div><div>Carregando...</div></div>';
          try {
            let items = [];
            if (kind === 'resumos') {
              const q = [];
              if (subject) q.push('lesson=' + encodeURIComponent(subject));
              if (author) q.push('author=' + encodeURIComponent(author));
              const r = await fetch('/api/ai/shared-summaries' + (q.length ? '?' + q.join('&') : ''), { cache: 'no-store' });
              const d = await r.json();
              items = (d && d.ok && Array.isArray(d.summaries)) ? d.summaries : [];
            } else {
              const q = [];
              if (kind === 'questoes') q.push('kind=question');
              if (subject) q.push('subject=' + encodeURIComponent(subject));
              if (author) q.push('author=' + encodeURIComponent(author));
              const r = await fetch('/api/ai/shared-flashcards?' + q.join('&'), { cache: 'no-store' });
              const d = await r.json();
              items = (d && d.ok && Array.isArray(d.items)) ? d.items : [];
            }
            if (!items.length) {
              listEl.innerHTML = '<div style="color:#9aa4b8;font-size:13px;padding:12px 0;">Nenhum item compartilhado com esses filtros.</div>';
              return;
            }
            const icon = icons[kind] || '📝';
            let html = '<div class="meggy-study-list">';
            items.forEach((it, idx) => {
              const author = esc(it.author || '—');
              const date = fmtDate(it.date);
              const byline = 'por ' + author + (date ? ' · ' + date : '');
              if (kind === 'resumos') {
                const title = esc(it.lessonName || it.lesson || 'Aula');
                const prev = esc(String(it.summary || '').replace(/[#*`>]/g, '').replace(/\n/g, ' ').substring(0, 120));
                html += '<div class="meggy-study-item meggy-shared-item" data-idx="' + idx + '" style="cursor:pointer;">' +
                  '<div class="meggy-study-item-icon">📚</div>' +
                  '<div class="meggy-study-item-body"><div class="meggy-study-item-title">' + title + '</div>' +
                  '<div class="meggy-study-item-meta">' + prev + (prev ? '...' : '') + '</div>' +
                  '<div class="meggy-study-item-meta" style="color:#ff8b9f;">' + byline + '</div></div>' +
                  '<i class="bi bi-chevron-right meggy-study-item-chevron"></i></div>';
              } else {
                const title = esc(it.statement || it.front || (kind === 'questoes' ? 'Questão' : 'Flashcard'));
                const sub = esc(it.subject || '');
                html += '<div class="meggy-study-item meggy-shared-item" data-idx="' + idx + '" style="cursor:pointer;">' +
                  '<div class="meggy-study-item-icon">' + icon + '</div>' +
                  '<div class="meggy-study-item-body"><div class="meggy-study-item-title">' + title + '</div>' +
                  '<div class="meggy-study-item-meta">' + sub + '</div>' +
                  '<div class="meggy-study-item-meta" style="color:#ff8b9f;">' + byline + '</div></div>' +
                  '<i class="bi bi-chevron-right meggy-study-item-chevron"></i></div>';
              }
            });
            html += '</div>';
            listEl.innerHTML = html;
            wrap._sharedItems = items;
            listEl.querySelectorAll('.meggy-shared-item').forEach((node) => {
              node.onclick = () => {
                const it = wrap._sharedItems[parseInt(node.dataset.idx, 10)];
                if (!it) return;
                if (kind === 'resumos') {
                  Shell.views._showSummary(el, { lessonName: it.lessonName || it.lesson || 'Aula', summary: it.summary || '', author: it.author || '', date: it.date || 0 });
                } else if (kind === 'questoes') {
                  Shell.views._showQuiz(el, { lessonName: it.subject || 'Questão', author: it.author || '', questions: [Shell.views._sharedCardToQuestion(it)] });
                } else {
                  Shell.views._showFlashcardDeck(el, { lessonName: it.subject || 'Flashcard', author: it.author || '', questions: [Shell.views._sharedCardToQuestion(it)] });
                }
              };
            });
          } catch (e) {
            listEl.innerHTML = '<div style="color:#ff8b8b;font-size:13px;padding:12px 0;">Não foi possível carregar os compartilhados.</div>';
            toast('Não foi possível carregar os compartilhados');
          }
        };
        subjectSel.onchange = loadList;
        authorSel.onchange = loadList;
        loadList();
      },

      // ★ v2.15.1: converte um card compartilhado (shared_flashcards) no formato
      // de questão que _showQuiz/_showFlashcardDeck já entendem.
      _sharedCardToQuestion(it) {
        const q = {
          statement: it.statement || it.front || '',
          options: Array.isArray(it.options) ? it.options : null,
          correct: (typeof it.correct === 'number') ? it.correct : (parseInt(it.correct, 10) || 0),
          explanation: it.explanation || '',
          legalText: it.legalText || '',
          fundamentacao: it.fundamentacao || '',
          type: it.type || 'mc',
          author: it.author || ''
        };
        if (!q.statement && it.back) {
          // card frente/verso sem enunciado: frente vira pergunta, verso vira resposta única
          q.statement = it.front || '';
          q.options = [it.back];
          q.correct = 0;
          q.type = 'mc';
        }
        return q;
      },

      _renderGenerateHint(el, feature) {
        const titles = { flashcards: 'Flashcards', questoes: 'Questões', resumos: 'Resumos' };
        const icons = { flashcards: '🃏', questoes: '❓', resumos: '📚' };
        el.innerHTML = '<div class="meggy-view-header"><h1 class="meggy-view-title">' + (icons[feature]||'') + ' ' + (titles[feature]||feature) + '</h1></div>' +
          '<div class="meggy-placeholder">' +
            '<div class="meggy-placeholder-icon">' + (icons[feature]||'📝') + '</div>' +
            '<div class="meggy-placeholder-title">Nenhum ' + (titles[feature]||'conteúdo') + ' gerado ainda</div>' +
            '<div class="meggy-placeholder-desc">Para gerar ' + (titles[feature]||'conteúdo') + ', abra uma aula no player e use a Meggy AI.<br>Os conteúdos gerados aparecem aqui automaticamente.</div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:16px;">' +
              '<button class="meggy-header-btn" onclick="Shell.router.navigate(\'/cursos\')" style="background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;border:none;"><i class="bi bi-collection-play"></i> Abrir uma aula</button>' +
              '<button class="meggy-header-btn" onclick="Shell.openMeggyAIDrawer()"><i class="bi bi-robot"></i> Meggy AI</button>' +
            '</div>' +
          '</div>';
      },

      // ★ _showAddCourseDialog: folder picker para adicionar curso via POST /api/courses/add
      _showAddCourseDialog(parentEl) {
        // Renderizar um modal overlay com o navegador de pastas
        let modal = document.getElementById('meggy-add-course-modal');
        if (!modal) {
          modal = document.createElement('div');
          modal.id = 'meggy-add-course-modal';
          modal.className = 'meggy-modal-overlay';
          modal.innerHTML = '<div class="meggy-modal-content" style="max-width:600px;">' +
            '<div class="meggy-modal-header">' +
              '<div class="meggy-modal-title"><i class="bi bi-folder-plus"></i> Adicionar Pasta de Curso</div>' +
              '<button class="meggy-ai-drawer-close" id="meggy-add-course-close"><i class="bi bi-x"></i></button>' +
            '</div>' +
            '<div style="padding:16px;">' +
              '<div style="margin-bottom:12px;font-size:13px;color:#9aa4b8;">Navegue até a pasta do curso e clique em "Adicionar como Curso". O sistema vai escanear e indexar todas as aulas.</div>' +
              '<div id="meggy-add-course-browser" style="min-height:300px;max-height:400px;overflow-y:auto;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;"></div>' +
              '<div id="meggy-add-course-selected" style="margin-top:12px;padding:10px 12px;background:rgba(255,139,159,0.08);border:1px solid rgba(255,139,159,0.2);border-radius:8px;font-size:13px;color:#ff8b9f;display:none;"><i class="bi bi-folder"></i> <span id="meggy-add-course-path"></span></div>' +
              '<div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end;">' +
                '<button class="meggy-header-btn" id="meggy-add-course-cancel">Cancelar</button>' +
                '<button class="meggy-header-btn" id="meggy-add-course-confirm" disabled style="background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;border:none;opacity:0.5;"><i class="bi bi-check-lg"></i> Adicionar como Curso</button>' +
              '</div>' +
            '</div>' +
          '</div>';
          const shellRoot = document.getElementById('meggy-shell') || document.getElementById('meggy-root') || document.body;
          shellRoot.appendChild(modal);
          document.getElementById('meggy-add-course-close').onclick = () => { modal.style.display = 'none'; };
          document.getElementById('meggy-add-course-cancel').onclick = () => { modal.style.display = 'none'; };
        }
        modal.style.display = 'flex';

        let selectedPath = '';
        // ★ v2.15.5 (item 4): geração da listagem + seleção por caminho.
        let acBrowseSeq = 0;
        const acChecked = Shell.views._v215NewFolderSelection();
        const browser = document.getElementById('meggy-add-course-browser');
        const selectedDiv = document.getElementById('meggy-add-course-selected');
        const pathSpan = document.getElementById('meggy-add-course-path');
        const confirmBtn = document.getElementById('meggy-add-course-confirm');

        // ★ Navegador de pastas recursivo (usa gdiListAllFiles)
        async function browseFolder(path) {
          // ★ v2.15.5 (item 4): guarda de geração — fetch defasado não
          //   sobrescreve a lista atual.
          const mySeq = ++acBrowseSeq;
          browser.innerHTML = '<div style="text-align:center;padding:20px;color:#9aa4b8;"><div class="spinner-border" style="color:#ff8b9f;"></div><div style="margin-top:8px;">Carregando...</div></div>';
          if (!window.gdiListAllFiles) {
            browser.innerHTML = '<div style="padding:20px;color:#ff8b9f;">gdiListAllFiles não disponível. Tente novamente.</div>';
            return;
          }
          try {
            let html = '';
            // Breadcrumb
            const parts = path.split('/').filter(Boolean);
            let bcHTML = '<div class="meggy-breadcrumb" style="margin-bottom:12px;font-size:12px;">';
            bcHTML += '<a href="#" data-path="/" style="color:#5ddeda;">Drives</a>';
            let cumPath = '';
            for (let i = 0; i < parts.length; i++) {
              cumPath += '/' + parts[i];
              const label = parts[i].match(/^\d+:$/) ? (window.drive_names?.[+parts[i].slice(0,-1)] || parts[i]) : (function(){try{return decodeURIComponent(parts[i])}catch(_){return parts[i]}})();
              const cp = cumPath + '/';
              bcHTML += ' / <a href="#" data-path="' + cp + '" style="color:#5ddeda;">' + label + '</a>';
            }
            bcHTML += '</div>';
            html += bcHTML;

            // "Adicionar esta pasta como curso" button (só se não for root)
            if (path && path !== '/' && parts.length > 1) {
              html += '<div style="margin-bottom:12px;padding:10px 12px;background:rgba(255,139,159,0.08);border:1px solid rgba(255,139,159,0.3);border-radius:8px;display:flex;justify-content:space-between;align-items:center;">' +
                '<span style="font-size:12px;color:#ff8b9f;"><i class="bi bi-folder2-open"></i> ' + (function(){try{return decodeURIComponent(path)}catch(_){return path}})() + '</span>' +
                '<button class="meggy-header-btn select-folder-btn" data-path="' + path + '" style="font-size:12px;background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;border:none;"><i class="bi bi-check-lg"></i> Selecionar esta pasta</button>' +
                '<button class="meggy-header-btn v215-add-course-btn" data-path="' + path + '" style="font-size:12px;background:linear-gradient(135deg,#5ddeda,#0ea5a5);color:#06281f;border:none;margin-left:8px;"><i class="bi bi-folder-plus"></i> ＋ Adicionar esta pasta ao curso</button>' +
              '</div>';
            }

            // Se root, listar drives disponíveis
            if (path === '/' || path === '') {
              const drives = window.drive_names || [];
              if (drives.length === 0) {
                html += '<div style="padding:20px;text-align:center;color:#6b7488;">Nenhum drive disponível.</div>';
              } else {
                html += '<div class="meggy-study-list">';
                drives.forEach((name, i) => {
                  const dp = '/' + i + ':/';
                  html += '<div class="meggy-study-item folder-item" data-path="' + dp + '" style="cursor:pointer;">' +
                    '<div class="meggy-study-item-icon"><i class="bi bi-hdd" style="color:#5ddeda;"></i></div>' +
                    '<div class="meggy-study-item-body"><div class="meggy-study-item-title">' + Shell.views._esc(name || ('Drive ' + i)) + '</div></div>' +
                    '<i class="bi bi-chevron-right meggy-study-item-chevron"></i>' +
                  '</div>';
                });
                html += '</div>';
              }
              browser.innerHTML = html;
              browser.querySelectorAll('.folder-item').forEach(item => {
                item.onclick = () => browseFolder(item.dataset.path);
              });
              return;
            }

            // Listar pastas do drive
            const files = await window.gdiListAllFiles(path, '');
            // ★ v2.15.5 (item 4): descarta a resposta se outra navegação já começou.
            if (mySeq !== acBrowseSeq) return;
            acChecked.prune(path);
            const folders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
            if (folders.length === 0) {
              html += '<div style="padding:20px;text-align:center;color:#6b7488;">Nenhuma subpasta encontrada. Você pode selecionar esta pasta como curso.</div>';
            } else {
              html += '<div style="display:flex;justify-content:flex-end;margin-bottom:8px;"><button class="meggy-header-btn" id="v215-add-selected" disabled style="font-size:12px;opacity:0.5;">＋ Adicionar selecionadas (0)</button></div>';
              html += '<div class="meggy-study-list">';
              folders.forEach(f => {
                const fp = path + encodeURIComponent(f.name) + '/';
                html += '<div class="meggy-study-item folder-item" data-path="' + fp + '" style="cursor:pointer;">' +
                  '<input type="checkbox" class="v215-folder-check" data-path="' + fp + '" title="Selecionar para adicionar ao curso" style="margin:0 2px;accent-color:#ff8b9f;cursor:pointer;flex:none;" />' +
                  '<div class="meggy-study-item-icon"><i class="bi bi-folder" style="color:#ff8b9f;"></i></div>' +
                  '<div class="meggy-study-item-body"><div class="meggy-study-item-title">' + Shell.views._esc(f.name) + '</div></div>' +
                  '<i class="bi bi-chevron-right meggy-study-item-chevron"></i>' +
                '</div>';
              });
              html += '</div>';
            }
            browser.innerHTML = html;
            // Wire folder clicks
            browser.querySelectorAll('.folder-item').forEach(item => {
              item.onclick = () => browseFolder(item.dataset.path);
            });
            browser.querySelectorAll('.meggy-breadcrumb a').forEach(a => {
              a.onclick = (e) => { e.preventDefault(); browseFolder(a.dataset.path); };
            });
            // ★ v2.15.0: anexar esta pasta (ou as selecionadas) a um curso/concurso
            const addCourseBtn = browser.querySelector('.v215-add-course-btn');
            if (addCourseBtn) addCourseBtn.onclick = () => { Shell.views._v215AttachFlow([addCourseBtn.dataset.path], parentEl); };
            const selBtn = browser.querySelector('#v215-add-selected');
            const updateSel = () => {
              const n = browser.querySelectorAll('.v215-folder-check:checked').length;
              if (selBtn) { selBtn.disabled = n === 0; selBtn.style.opacity = n === 0 ? '0.5' : '1'; selBtn.textContent = '＋ Adicionar selecionadas (' + n + ')'; }
            };
            // ★ v2.15.5 (item 4): seleção por caminho (Set, capturada no
            //   'change') + re-aplicação a cada carregamento; o botão lê o Set.
            browser.querySelectorAll('.v215-folder-check').forEach(cb => {
              cb.addEventListener('click', e => e.stopPropagation());
              cb.addEventListener('change', () => { const p = cb.dataset.path; if (cb.checked) acChecked.add(p); else acChecked.remove(p); updateSel(); });
            });
            acChecked.applyTo(browser);
            updateSel();
            if (selBtn) selBtn.onclick = () => {
              const paths = acChecked.values();
              if (paths.length) Shell.views._v215AttachFlow(paths, parentEl);
            };
            const selectBtn = browser.querySelector('.select-folder-btn');
            if (selectBtn) {
              selectBtn.onclick = () => {
                selectedPath = selectBtn.dataset.path;
                pathSpan.textContent = (function(){try{return decodeURIComponent(selectedPath)}catch(_){return selectedPath}})();
                selectedDiv.style.display = 'block';
                confirmBtn.disabled = false;
                confirmBtn.style.opacity = '1';
              };
            }
          } catch (e) {
            browser.innerHTML = '<div style="padding:20px;color:#ff8b9f;">Erro: ' + (e.message || 'tente novamente') + '</div>';
          }
        }

        // Start at drives root
        browseFolder('/');

        // ★ Confirm — POST /api/courses/add
        confirmBtn.onclick = async () => {
          if (!selectedPath) return;
          confirmBtn.disabled = true;
          confirmBtn.innerHTML = '<div class="spinner-border spinner-border-sm"></div> Adicionando...';
          try {
            // Extrair nome do curso do path
            const parts = selectedPath.split('/').filter(Boolean);
            const lastFolder = parts.length > 0 ? (function(){try{return decodeURIComponent(parts[parts.length-1])}catch(_){return parts[parts.length-1]}})() : 'Curso';
            const r = await fetch('/api/courses/add', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                coursePath: selectedPath,
                courseName: lastFolder,
                icon: '📚',
                color: '#ff8b9f'
              })
            });
            const d = await r.json();
            if (d.ok) {
              modal.style.display = 'none';
              // ★ v2.6: escanear a pasta agora — conta o progresso e alimenta a Meggy
              try { if (window.gdiCourseScanner && typeof window.gdiCourseScanner.startScan === 'function') { window.gdiCourseScanner.startScan(selectedPath, null); } } catch (_) {}
              // Recarregar view de cursos
              Shell.views.cursos(parentEl);
            } else {
              Shell.views._v215Err('Erro ao adicionar curso', d.error || 'tente novamente');
              confirmBtn.disabled = false;
              confirmBtn.innerHTML = '<i class="bi bi-check-lg"></i> Adicionar como Curso';
            }
          } catch (e) {
            Shell.views._v215Err('Erro ao adicionar curso', e.message);
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="bi bi-check-lg"></i> Adicionar como Curso';
          }
        };
      },

      flashcards(el) {
        el.innerHTML = '<div class="meggy-view-header"><h1 class="meggy-view-title">🃏 Flashcards</h1></div>' +
          '<div id="meggy-flashcards-container"><div class="meggy-loading"><div class="spinner-border" role="status"></div><div>Carregando flashcards...</div></div></div>';
        (async () => {
          const entries = await Shell.views._loadStudyCache();
          const withCards = entries.filter(e => e.questions && Array.isArray(e.questions) && e.questions.length > 0);
          const container = document.getElementById('meggy-flashcards-container');
          if (!container) return;
          if (withCards.length === 0) { Shell.views._renderGenerateHint(el, 'flashcards'); Shell.views._renderSharedSection(el, 'flashcards'); return; }
          // ★ Agrupar por curso → disciplina → assunto
          const tree = Shell.views._groupEntriesByHierarchy(withCards);
          Shell.views._renderStudyTree(container, tree, 'flashcards', el, withCards);
          Shell.views._renderSharedSection(el, 'flashcards');
        })();
      },

      _showFlashcardDeck(el, entry) {
        const questions = entry.questions || [];
        const lessonName = Shell.views._esc(entry.lessonName || 'Aula');
        let current = 0;
        const renderCard = () => {
          const q = questions[current];
          if (!q) return;
          const isMC = q.type === 'mc';
          const front = Shell.views._esc(q.statement || '');
          let back = '';
          if (isMC && Array.isArray(q.options)) {
            const correctIdx = typeof q.correct === 'number' ? q.correct : parseInt(q.correct, 10);
            const correctText = q.options[correctIdx] || '';
            back = '<div style="font-weight:700;color:#5ddeda;margin-bottom:8px;">✓ ' + Shell.views._esc(correctText) + '</div>';
          } else {
            const tfCorrect = (q.correct === 1 || q.correct === '1' || q.correct === true);
            back = '<div style="font-weight:700;color:' + (tfCorrect ? '#5ddeda' : '#ff8b9f') + ';margin-bottom:8px;">' + (tfCorrect ? '✓ Certo' : '✗ Errado') + '</div>';
          }
          if (q.explanation) back += '<div style="font-size:13px;color:#c9d1d9;margin-bottom:8px;">' + Shell.views._esc(q.explanation) + '</div>';
          if (q.legalText) back += '<div style="font-size:12px;color:#9aa4b8;border-left:2px solid #ff8b9f;padding-left:8px;margin-top:6px;">📜 ' + Shell.views._esc(q.legalText) + '</div>';
          el.innerHTML = '<div class="meggy-view-header">' +
              '<button class="meggy-header-btn" onclick="Shell.views.flashcards(document.getElementById(\'meggy-main\'))" style="font-size:13px;"><i class="bi bi-arrow-left"></i> Voltar</button>' +
              '<h1 class="meggy-view-title" style="font-size:16px;">🃏 ' + lessonName + '</h1>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;font-size:13px;color:#9aa4b8;">' +
              '<span>Cartão ' + (current + 1) + ' de ' + questions.length + (entry.author ? ' · por ' + Shell.views._esc(entry.author) : '') + '</span>' +
              '<span style="color:#ff8b9f;">Clique no cartão para virar</span>' +
            '</div>' +
            '<div class="meggy-flashcard-deck">' +
              '<div class="meggy-flashcard" id="meggy-flashcard-card" onclick="this.classList.toggle(\'flipped\')">' +
                '<div class="meggy-flashcard-face meggy-flashcard-front">' +
                  '<div class="meggy-flashcard-label">Pergunta</div>' +
                  '<div class="meggy-flashcard-text">' + front + '</div>' +
                  '<div class="meggy-flashcard-hint"><i class="bi bi-arrow-repeat"></i> Clique para ver a resposta</div>' +
                '</div>' +
                '<div class="meggy-flashcard-face meggy-flashcard-back">' +
                  '<div class="meggy-flashcard-label">Resposta</div>' +
                  '<div class="meggy-flashcard-text">' + back + '</div>' +
                  '<div class="meggy-flashcard-hint"><i class="bi bi-arrow-repeat"></i> Clique para voltar</div>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="meggy-flashcard-nav">' +
              '<button class="meggy-header-btn" id="meggy-fc-prev" ' + (current === 0 ? 'disabled' : '') + '><i class="bi bi-chevron-left"></i> Anterior</button>' +
              '<button class="meggy-header-btn" id="meggy-fc-next" style="background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;border:none;">Próximo <i class="bi bi-chevron-right"></i></button>' +
            '</div>';
          document.getElementById('meggy-fc-prev').onclick = () => { if (current > 0) { current--; renderCard(); } };
          document.getElementById('meggy-fc-next').onclick = () => { if (current < questions.length - 1) { current++; renderCard(); } else { Shell.views.flashcards(el); } };
          el.scrollTop = 0;
        };
        renderCard();
      },

      questoes(el) {
        el.innerHTML = '<div class="meggy-view-header"><h1 class="meggy-view-title">❓ Questões</h1></div>' +
          '<div id="meggy-questoes-container"><div class="meggy-loading"><div class="spinner-border" role="status"></div><div>Carregando questões...</div></div></div>';
        (async () => {
          const entries = await Shell.views._loadStudyCache();
          const withQ = entries.filter(e => e.questions && Array.isArray(e.questions) && e.questions.length > 0);
          const container = document.getElementById('meggy-questoes-container');
          if (!container) return;
          if (withQ.length === 0) { Shell.views._renderGenerateHint(el, 'questoes'); Shell.views._renderSharedSection(el, 'questoes'); return; }
          // ★ Agrupar por curso → disciplina → assunto
          const tree = Shell.views._groupEntriesByHierarchy(withQ);
          Shell.views._renderStudyTree(container, tree, 'questoes', el, withQ);
          Shell.views._renderSharedSection(el, 'questoes');
        })();
      },

      _showQuiz(el, entry) {
        const questions = entry.questions || [];
        const lessonName = Shell.views._esc(entry.lessonName || 'Aula');
        Shell.__lastQuizQuestions = questions;
        Shell.__lastQuizLessonName = entry.lessonName || 'Aula';
        let current = 0;
        let score = 0;
        let answered = 0;
        const renderQ = () => {
          const q = questions[current];
          if (!q) return;
          const isMC = q.type === 'mc';
          const statement = Shell.views._esc(q.statement || '');
          let optionsHTML = '';
          if (isMC && Array.isArray(q.options)) {
            const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
            optionsHTML = q.options.map((opt, idx) => {
              return '<div class="meggy-quiz-option" data-idx="' + idx + '">' +
                '<span class="meggy-quiz-option-letter">' + (letters[idx] || (idx + 1)) + '</span>' +
                '<span class="meggy-quiz-option-text">' + Shell.views._esc(opt) + '</span>' +
              '</div>';
            }).join('');
          } else {
            optionsHTML = '<div class="meggy-quiz-option" data-idx="1"><span class="meggy-quiz-option-letter">✓</span><span class="meggy-quiz-option-text">Certo</span></div>' +
              '<div class="meggy-quiz-option" data-idx="0"><span class="meggy-quiz-option-letter">✗</span><span class="meggy-quiz-option-text">Errado</span></div>';
          }
          el.innerHTML = '<div class="meggy-view-header">' +
              '<button class="meggy-header-btn" onclick="Shell.views.questoes(document.getElementById(\'meggy-main\'))" style="font-size:13px;"><i class="bi bi-arrow-left"></i> Voltar</button>' +
              '<h1 class="meggy-view-title" style="font-size:16px;">❓ ' + lessonName + '</h1>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;font-size:13px;color:#9aa4b8;">' +
              '<span>Questão ' + (current + 1) + ' de ' + questions.length + (entry.author ? ' · por ' + Shell.views._esc(entry.author) : '') + '</span>' +
              '<span>Acertos: <strong id="meggy-quiz-score" style="color:#5ddeda;">' + score + '</strong>/<span id="meggy-quiz-answered">' + answered + '</span></span>' +
            '</div>' +
            '<div class="meggy-quiz-card">' +
              '<div class="meggy-quiz-statement">' + statement + '</div>' +
              (q.legalText ? '<div style="font-size:12px;color:#9aa4b8;border-left:2px solid #ff8b9f;padding-left:8px;margin:8px 0;">📜 ' + Shell.views._esc(q.legalText) + '</div>' : '') +
              '<div class="meggy-quiz-options" id="meggy-quiz-options">' + optionsHTML + '</div>' +
              '<div class="meggy-quiz-feedback" id="meggy-quiz-feedback" style="display:none;"></div>' +
            '</div>' +
            '<div class="meggy-flashcard-nav">' +
              '<button class="meggy-header-btn" id="meggy-q-prev" ' + (current === 0 ? 'disabled' : '') + '><i class="bi bi-chevron-left"></i> Anterior</button>' +
              '<button class="meggy-header-btn" id="meggy-q-next" style="background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;border:none;">' + (current < questions.length - 1 ? 'Próxima' : 'Finalizar') + ' <i class="bi bi-chevron-right"></i></button>' +
            '</div>';
          const correctIdx = isMC ? (typeof q.correct === 'number' ? q.correct : parseInt(q.correct, 10)) : ((q.correct === 1 || q.correct === '1' || q.correct === true) ? 1 : 0);
          let isAnswered = false;
          const opts = document.querySelectorAll('#meggy-quiz-options .meggy-quiz-option');
          opts.forEach(opt => {
            opt.onclick = () => {
              if (isAnswered) return;
              isAnswered = true;
              const chosen = parseInt(opt.dataset.idx, 10);
              const isCorrect = (chosen === correctIdx);
              if (isCorrect) score++;
              answered++;
              opts.forEach((o, i) => {
                if (i === correctIdx) o.classList.add('correct');
                else if (i === chosen) o.classList.add('wrong');
                o.style.cursor = 'default';
              });
              const fb = document.getElementById('meggy-quiz-feedback');
              fb.style.display = 'block';
              fb.innerHTML = '<div class="meggy-quiz-feedback-' + (isCorrect ? 'correct' : 'wrong') + '">' + (isCorrect ? '✓ Correto!' : '✗ Incorreto') + '</div>' +
                (q.explanation ? '<div class="meggy-quiz-feedback-expl">' + Shell.views._esc(q.explanation) + '</div>' : '') +
                (q.fundamentacao ? '<div class="meggy-quiz-feedback-fund"><strong>Fundamentação:</strong> ' + Shell.views._esc(q.fundamentacao) + '</div>' : '');
              // ★ v2.15.0: erro registrado no caderno do concurso (só quando a
              // aula foi aberta a partir do plano desse concurso)
              if (!isCorrect && Shell.__v215ConcursoId) {
                try {
                  const correctText = isMC ? (q.options[correctIdx] || '') : (correctIdx === 1 ? 'Certo' : 'Errado');
                  const chosenText = isMC ? (q.options[chosen] || '') : (chosen === 1 ? 'Certo' : 'Errado');
                  fetch('/api/concursos/' + encodeURIComponent(Shell.__v215ConcursoId) + '/errors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pergunta: q.statement || '', respostaCerta: correctText, respostaAluno: chosenText, modulo: Shell.__lastQuizLessonName || '' }) }).catch(() => {});
                } catch (_) {}
              }
              const scoreEl = document.getElementById('meggy-quiz-score');
              if (scoreEl) scoreEl.textContent = String(score);
              const answeredEl = document.getElementById('meggy-quiz-answered');
              if (answeredEl) answeredEl.textContent = String(answered);
              document.getElementById('meggy-q-next').innerHTML = (current < questions.length - 1 ? 'Próxima <i class="bi bi-chevron-right"></i>' : 'Finalizar <i class="bi bi-check"></i>');
            };
          });
          document.getElementById('meggy-q-prev').onclick = () => { if (current > 0) { current--; renderQ(); } };
          document.getElementById('meggy-q-next').onclick = () => {
            if (current < questions.length - 1) { current++; renderQ(); }
            else { Shell.views._showQuizResult(el, Shell.__lastQuizLessonName, score, questions.length); }
          };
          el.scrollTop = 0;
        };
        renderQ();
      },

      _showQuizResult(el, lessonName, score, total) {
        const pct = total > 0 ? Math.round(score / total * 100) : 0;
        const emoji = pct >= 80 ? '🏆' : pct >= 50 ? '👍' : '📚';
        el.innerHTML = '<div class="meggy-view-header"><h1 class="meggy-view-title" style="font-size:16px;">❓ ' + Shell.views._esc(lessonName) + '</h1></div>' +
          '<div class="meggy-quiz-result">' +
            '<div class="meggy-quiz-result-emoji">' + emoji + '</div>' +
            '<div class="meggy-quiz-result-score">' + score + ' / ' + total + '</div>' +
            '<div class="meggy-quiz-result-pct">' + pct + '% de acerto</div>' +
            '<div class="meggy-quiz-result-msg">' + (pct >= 80 ? 'Excelente! Você dominou esta aula.' : pct >= 50 ? 'Bom trabalho! Continue praticando.' : 'Revise o conteúdo e tente novamente.') + '</div>' +
            '<div style="display:flex;gap:8px;justify-content:center;margin-top:20px;flex-wrap:wrap;">' +
              '<button class="meggy-header-btn" onclick="Shell.views.questoes(document.getElementById(\'meggy-main\'))"><i class="bi bi-list"></i> Outras aulas</button>' +
              '<button class="meggy-header-btn" onclick="Shell.views._showQuiz(document.getElementById(\'meggy-main\'), {lessonName: Shell.__lastQuizLessonName||\'Aula\', questions: Shell.__lastQuizQuestions||[]})" style="background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;border:none;"><i class="bi bi-arrow-repeat"></i> Refazer</button>' +
            '</div>' +
          '</div>';
      },

      resumos(el) {
        el.innerHTML = '<div class="meggy-view-header"><h1 class="meggy-view-title">📚 Resumos</h1></div>' +
          '<div id="meggy-resumos-container"><div class="meggy-loading"><div class="spinner-border" role="status"></div><div>Carregando resumos...</div></div></div>';
        (async () => {
          const entries = await Shell.views._loadStudyCache();
          const withSummary = entries.filter(e => e.summary && typeof e.summary === 'string' && e.summary.length > 50);
          const container = document.getElementById('meggy-resumos-container');
          if (!container) return;
          if (withSummary.length === 0) { Shell.views._renderGenerateHint(el, 'resumos'); Shell.views._renderSharedSection(el, 'resumos'); return; }
          // ★ Agrupar por curso → disciplina → assunto
          const tree = Shell.views._groupEntriesByHierarchy(withSummary);
          Shell.views._renderStudyTree(container, tree, 'resumos', el, withSummary);
          Shell.views._renderSharedSection(el, 'resumos');
        })();
      },

      async _showSummary(el, entry) {
        const lessonName = Shell.views._esc(entry.lessonName || 'Aula');
        // ★ Garantir que marked.js está carregado antes de renderizar
        await Shell._ensureMdLibs();
        const html = Shell._renderMd(entry.summary);
        window._lastIsaText = entry.summary;
        window._lastMdText = entry.summary;
        window._lastMdName = entry.lessonName || 'resumo';
        el.innerHTML = '<div class="meggy-view-header">' +
            '<button class="meggy-header-btn" onclick="Shell.views.resumos(document.getElementById(\'meggy-main\'))" style="font-size:13px;"><i class="bi bi-arrow-left"></i> Voltar</button>' +
            '<h1 class="meggy-view-title" style="font-size:16px;">📚 ' + lessonName + '</h1>' +
          '</div>' +
          (entry.author ? '<div style="font-size:13px;color:#ff8b9f;margin:-4px 0 12px;">por ' + Shell.views._esc(entry.author) + (entry.date ? ' · ' + new Date(entry.date).toLocaleDateString('pt-BR') : '') + '</div>' : '') +
          '<div class="meggy-summary-card">' +
            '<div class="meggy-summary-toolbar">' +
              '<span class="meggy-summary-badge">⭐ Resumo Meggy 🐩</span>' +
              '<div style="display:flex;gap:6px;">' +
                '<button class="meggy-header-btn" onclick="navigator.clipboard.writeText(window._lastIsaText);this.textContent=\'✓ Copiado!\'" style="font-size:12px;"><i class="bi bi-clipboard"></i> Copiar</button>' +
                '<button class="meggy-header-btn" onclick="window._downloadMdAsPdf(window._lastMdName)" style="font-size:12px;background:rgba(255,139,159,0.12);border:1px solid rgba(255,139,159,0.3);color:#ff8b9f;"><i class="bi bi-download"></i> PDF</button>' +
                '<button class="meggy-header-btn" id="gdi-summary-tts-btn" title="Ouvir resumo em voz natural" style="font-size:12px;background:#ff8b9f;border:none;color:#000;font-weight:600;"><i class="bi bi-volume-up"></i> Ouvir resumo</button>' +
              '</div>' +
            '</div>' +
            '<div class="meggy-summary-body gdi-isa-summary-body">' + html + '</div>' +
          '</div>';
                // ★ v2.15.4 ITEM D: Ouvir resumo — voz natural (window.gdiTTS).
        // Guarda se o módulo não carregou: toast, nunca erro silencioso.
        const _ttsBtn = el.querySelector('#gdi-summary-tts-btn');
        if (_ttsBtn) _ttsBtn.onclick = () => {
          if (window.gdiTTS && typeof window.gdiTTS.play === 'function') {
            const _st = window.gdiTTS.getState();
            if (_st.status === 'playing' || _st.status === 'paused') { window.gdiTTS.stop(); _ttsBtn.innerHTML = '<i class="bi bi-volume-up"></i> Ouvir resumo'; return; }
            _ttsBtn.innerHTML = '⏹ Parar';
            window.gdiTTS.play(window._lastIsaText || '', { onEnd: function () { _ttsBtn.innerHTML = '<i class="bi bi-volume-up"></i> Ouvir resumo'; } });
          } else if (typeof window.showToast === 'function') window.showToast('Módulo de voz ainda não carregou. Recarregue a página.');
        };
el.scrollTop = 0;
      },

      // ═══ Meus Concursos — feature baseada em edital ═══

      // ★ v2.2: mesclado com Meus Cursos — /concursos mostra a mesma visão unificada.
      concursos(el) {
        Shell.views.cursos(el);
      },

      // ★ v2.15.5 (item 4): estado de seleção de pastas por CAMINHO estável.
      //   O checkbox já carregava data-path, mas a seleção era lida do DOM
      //   no momento do botão — qualquer re-render/reordenação entre o clique
      //   no checkbox e o botão trocava a pasta (penal → previdenciario). A
      //   seleção agora é capturada no 'change' (por caminho, nunca por
      //   índice/posição), re-aplicada a cada carregamento da lista
      //   (applyTo) e podada para a pasta atual (prune).
      _v215NewFolderSelection() {
        const set = new Set();
        return {
          has: (p) => set.has(p),
          add: (p) => { if (p) set.add(p); },
          remove: (p) => { set.delete(p); },
          clear: () => { set.clear(); },
          values: () => Array.from(set),
          count: () => set.size,
          prune: (prefix) => { const pre = String(prefix || ''); if (!pre) return; for (const p of Array.from(set)) if (!String(p).startsWith(pre)) set.delete(p); },
          applyTo: (root) => {
            if (!root || typeof root.querySelectorAll !== 'function') return 0;
            let n = 0;
            root.querySelectorAll('.v215-folder-check').forEach(cb => { const on = set.has(cb.dataset.path); cb.checked = on; if (on) n++; });
            return n;
          },
        };
      },

      // ═══ Wizard: criar concurso em 4 passos ═══
      // ★ v2.15.3 (item 2): garante as horas no resultado do /scan. O /scan
      //   novo devolve totalHours/totalMinutes (+ truncated); se vier sem
      //   horas (servidor antigo), chama /sources/preview como fallback com
      //   as mesmas pastas e preenche os totais a partir da prévia.
      // ★ v2.15.6 (P2): prévia/anexo paginados — a enumeração do servidor
      //   tem teto de 40 listagens por chamada; pastas além do teto (ex.:
      //   Módulo II) só aparecem quando o cliente retoma do cursor
      //   (pending) até truncated=false. Sem o loop, a prévia e o anexo
      //   paravam na 1ª fatia e o detalhe ficava incompleto.
      async _v215PreviewPaged(concursoId, folderPaths) {
        let body = { folderPaths: folderPaths || [] };
        let d = null;
        // ★ v2.15.7 (P4): teto 40 tentativas (antes 20) — v. previewAttach.
        // ★ v2.15.8 (D — P4): pending vazio ou sem progresso NÃO é motivo
        //   p/ outra volta — o servidor não tem mais o que retomar (o
        //   truncated fica true com pending vazio quando um nó queima em
        //   enumErrors — v. enumerateModuleFiles). Sem isto o assistente
        //   re-enumerava do zero até o teto de 40 voltas.
        let _prevPendKey = null, _prevFolders = -1;
        for (let a = 0; a < 40; a++) {
          d = await Shell.views._v215Api('/api/concursos/' + encodeURIComponent(concursoId) + '/sources/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          if (!d || !d.truncated) break;
          const _pendKey = JSON.stringify(d.pending || {});
          const _folders = (d.folders || []).length;
          if (_pendKey === '{}' || (_pendKey === _prevPendKey && _folders === _prevFolders)) { d.truncated = false; break; }
          _prevPendKey = _pendKey; _prevFolders = _folders;
        }
        return d;
      },
      async _v215AttachPaged(concursoId, folderPaths) {
        let body = { folderPaths: folderPaths || [] };
        let d = null, firstAttached = null, firstSkipped = null;
        // ★ v2.15.8 (D — P4): v. _v215PreviewPaged — pending vazio ou sem
        //   progresso encerra o loop (o /sources tem o mesmo truncated
        //   grudento do /scan).
        let _prevPendKey = null, _prevLinked = -1;
        // ★ v2.15.7 (P4): teto 40 tentativas (antes 20) — v. previewAttach.
        for (let a = 0; a < 40; a++) {
          d = await Shell.views._v215Api('/api/concursos/' + encodeURIComponent(concursoId) + '/sources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          if (firstAttached === null) { firstAttached = d.attached; firstSkipped = d.skipped; }
          if (!d || !d.scanned || !d.scanned.truncated) break;
          const _pendKey = JSON.stringify(d.scanned.pending || {});
          const _linked = (d.scanned.linkedTotal != null) ? d.scanned.linkedTotal : -1;
          if (_pendKey === '{}' || (_pendKey === _prevPendKey && _linked === _prevLinked)) { d.scanned.truncated = false; break; }
          _prevPendKey = _pendKey; _prevLinked = _linked;
          body = { folderPaths: folderPaths || [], resume: (d.scanned && d.scanned.pending) || {} };
        }
        if (d) { d.attached = firstAttached || d.attached; d.skipped = firstSkipped || d.skipped; }
        return d;
      },
      async _v215EnsureScanHours(concursoId, scanResult, folderPaths) {
        if (!scanResult) return scanResult;
        if (scanResult.totalHours != null || scanResult.totalMinutes != null) return scanResult;
        try {
          const prev = await Shell.views._v215PreviewPaged(concursoId, folderPaths || []);
          if (prev) {
            if (prev.totalHours != null) scanResult.totalHours = prev.totalHours;
            if (prev.totalMinutes != null) scanResult.totalMinutes = prev.totalMinutes;
            if (prev.truncated != null) scanResult.truncated = prev.truncated;
            // ★ v2.15.7 (P4): a prévia de fallback também traz os avisos.
            if (Array.isArray(prev.depthCut) && prev.depthCut.length) scanResult.depthCut = prev.depthCut;
            if (Array.isArray(prev.notFound) && prev.notFound.length) scanResult.notFound = prev.notFound;
            if (Array.isArray(prev.folders)) scanResult._previewFolders = prev.folders;
            // ★ v2.15.5 (item 2): a prévia projeta o total pós-anexo — é o
            //   número que o detalhe vai mostrar; usa-o quando o /scan não
            //   trouxe os totais vinculados (servidor antigo).
            if (prev.projectedTotal != null && scanResult.linkedTotal == null) {
              scanResult.linkedTotal = prev.projectedTotal;
              scanResult.linkedMinutes = prev.projectedMinutes;
              scanResult.linkedHours = prev.projectedHours;
              scanResult.linkedByDiscipline = prev.projectedByDiscipline;
            }
          }
        } catch (_) {}
        return scanResult;
      },

      // ★ v2.15.3 (item 2): fragmento HTML do passo 4 com as horas e o
      //   aviso de contagem truncada. '' quando não há horas nem aviso.
      _v215WizardStep4HoursHtml(r) {
        r = r || {};
        // ★ v2.15.5 (item 2): horas das aulas VINCULADAS (D1, pós-anexo) —
        //   as mesmas do detalhe; sem elas, cai para as horas da enumeração.
        const hasHours = (r.linkedHours != null || r.linkedMinutes != null || r.totalHours != null || r.totalMinutes != null);
        const hrs = (r.linkedHours != null) ? r.linkedHours : (r.totalHours != null ? r.totalHours : Math.round((((r.linkedMinutes != null ? r.linkedMinutes : r.totalMinutes) || 0) / 60) * 10) / 10);
        let h = '';
        if (hasHours) {
          h += '<div style="display:flex;gap:12px;justify-content:center;margin-bottom:16px;">' +
            '<div style="flex:1;padding:14px;background:rgba(255,212,59,0.08);border:1px solid rgba(255,212,59,0.2);border-radius:10px;text-align:center;">' +
            '<div style="font-size:24px;font-weight:700;color:#ffd43b;">~' + hrs + 'h</div>' +
            '<div style="font-size:11px;color:#9aa4b8;">Tempo estimado de estudo</div></div></div>';
        }
        if (r.truncated) {
          h += '<div style="margin-top:0;margin-bottom:16px;padding:10px;background:rgba(255,212,59,0.06);border:1px solid rgba(255,212,59,0.25);border-radius:8px;font-size:12px;color:#ffd43b;">⚠️ Contagem parcial — a enumeração de pastas foi truncada pelo servidor; o total real de aulas/horas pode ser maior.</div>';
        }
        // ★ v2.15.7 (P4): avisos distintos p/ pastas não encontradas e p/
        //   cortes de profundidade — antes os dois sumiam no "truncada" (ou
        //   nem apareciam) e o usuário não sabia o que faltou.
        if (Array.isArray(r.notFound) && r.notFound.length) {
          h += '<div style="margin-top:0;margin-bottom:16px;padding:10px;background:rgba(248,81,73,0.08);border:1px solid rgba(248,81,73,0.3);border-radius:8px;font-size:12px;color:#ff8b8b;">⚠️ Pasta(s) não encontrada(s) neste drive: ' + r.notFound.map(p => Shell._esc(String(p))).join(', ') + ' — confira o caminho (ex.: a pasta pode estar em outro drive).</div>';
        }
        if (Array.isArray(r.depthCut) && r.depthCut.length) {
          h += '<div style="margin-top:0;margin-bottom:16px;padding:10px;background:rgba(255,212,59,0.06);border:1px solid rgba(255,212,59,0.25);border-radius:8px;font-size:12px;color:#ffd43b;">⚠️ ' + r.depthCut.length + ' pasta(s) além da profundidade máxima não foram enumeradas — aulas abaixo delas não entram na contagem.</div>';
        }
        if (Array.isArray(r.enumErrors) && r.enumErrors.length) {
          h += '<div style="margin-top:0;margin-bottom:16px;padding:10px;background:rgba(248,81,73,0.08);border:1px solid rgba(248,81,73,0.3);border-radius:8px;font-size:12px;color:#ff8b8b;">⚠️ ' + r.enumErrors.length + ' pasta(s) não puderam ser listadas: ' + r.enumErrors.map(function(e){ return Shell._esc(String((e && (e.folder || e.path)) || '')); }).join(', ') + ' — as aulas delas não entraram na contagem.</div>';
        }
        if (r._scanStopped === 'no-progress') {
          h += '<div style="margin-top:0;margin-bottom:16px;padding:10px;background:rgba(255,212,59,0.06);border:1px solid rgba(255,212,59,0.25);border-radius:8px;font-size:12px;color:#ffd43b;">⚠️ O servidor parou de devolver pastas novas — o scan parou com os totais já vinculados; dá para re-escanear depois no detalhe do concurso.</div>';
        }
        return h;
      },

      showConcursoWizard(el) {
        let modal = document.getElementById('concurso-wizard');
        if (modal) modal.remove();
        modal = document.createElement('div');
        modal.id = 'concurso-wizard';
        modal.className = 'meggy-modal-overlay';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:10002;padding:20px;';

        let step = 1;
        let concursoId = null;
        let concursoName = '';
        let selectedFolders = [];
        // ★ v2.15.5 (item 4): geração da listagem + seleção por caminho.
        let cwBrowseSeq = 0;
        let cwChecked = Shell.views._v215NewFolderSelection();
        let disciplinas = [];
        let scanResult = null;
        let banca = '';
        let dailyHoursVal = 4;
        let examDateVal = '';

        function closeModal() { if (modal && modal.parentNode) modal.parentNode.removeChild(modal); }

        function render() {
          const stepTitle = '📌 Novo Concurso — Passo ' + step + ' de 4';
          let bodyHTML = '';
          let footerHTML = '';

          if (step === 1) {
            bodyHTML =
              '<div style="font-size:13px;color:#9aa4b8;margin-bottom:12px;">Dê um nome ao concurso e informe a data da prova. A Meggy 🐩 vai montar um curso personalizado com base no edital.</div>' +
              '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:12px;color:#9aa4b8;margin-bottom:6px;">Nome do concurso *</label>' +
                '<input id="cw-name" type="text" placeholder="Ex: Concurso TJ-SP 2026" value="' + Shell._esc(concursoName) + '" style="width:100%;padding:10px 12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#e6edf3;font-size:14px;box-sizing:border-box;" />' +
              '</div>' +
              '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:12px;color:#9aa4b8;margin-bottom:6px;">Data da prova</label>' +
                '<input id="cw-examdate" type="text" inputmode="numeric" placeholder="dd/mm/aaaa" maxlength="10" value="' + Shell._esc(Shell.views._v215FormatDateBR(examDateVal)) + '" style="width:100%;padding:10px 12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#e6edf3;font-size:14px;box-sizing:border-box;" />' +
                '<div style="margin-top:4px;font-size:11px;color:#6b7488;">Digite a data (dd/mm/aaaa).</div>' +
              '</div>' +
              '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:12px;color:#9aa4b8;margin-bottom:6px;">Horas de estudo por dia</label>' +
                '<input id="cw-dailyhours" type="number" min="1" max="16" value="4" style="width:100%;padding:10px 12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#e6edf3;font-size:14px;box-sizing:border-box;" />' +
              '</div>' +
              '<div style="margin-bottom:12px;">' +
                '<label style="display:block;font-size:12px;color:#9aa4b8;margin-bottom:6px;">Banca organizadora (p/ o plano direcionado)</label>' +
                '<select id="cw-banca" style="width:100%;padding:10px 12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#e6edf3;font-size:14px;box-sizing:border-box;">' +
                  '<option value="">Sem banca definida</option>' +
                  '<option value="Cebraspe">Cebraspe</option>' +
                  '<option value="FGV">FGV</option>' +
                  '<option value="FCC">FCC</option>' +
                  '<option value="Vunesp">Vunesp</option>' +
                  '<option value="IBFC">IBFC</option>' +
                '</select>' +
                '<div style="margin-top:6px;font-size:11px;color:#6b7488;">Com a banca, a Meggy monta o plano só com o mais cobrado por ela.</div>' +
              '</div>';
            footerHTML =
              '<button class="meggy-header-btn" id="cw-cancel">Cancelar</button>' +
              '<button class="meggy-header-btn" id="cw-next" style="background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;border:none;">Criar e Continuar →</button>';
          } else if (step === 2) {
            bodyHTML =
              '<div style="font-size:13px;color:#9aa4b8;margin-bottom:12px;">Cole abaixo o texto do edital ou do conteúdo programático (opcional). A Meggy 🐩 vai identificar disciplinas, pesos e incidência. Se preferir, continue sem colar — dá para colar depois, na página do concurso.</div>' +
              '<textarea id="cw-edital" placeholder="Cole aqui o texto do edital..." style="width:100%;min-height:240px;padding:12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#e6edf3;font-size:13px;font-family:monospace;box-sizing:border-box;resize:vertical;"></textarea>' +
              '<div style="margin-top:8px;font-size:11px;color:#6b7488;">💡 Dica: você pode pular esta etapa. O scan vai identificar as disciplinas pelos nomes das pastas.</div>';
            footerHTML =
              '<button class="meggy-header-btn" id="cw-back">← Voltar</button>' +
              '<div style="display:flex;gap:8px;">' +
                '<button class="meggy-header-btn" id="cw-skip">Continuar sem edital →</button>' +
                '<button class="meggy-header-btn" id="cw-analyze" style="background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;border:none;">🔍 Analisar Edital</button>' +
              '</div>';
          } else if (step === 3) {
            let discHTML = '';
            if (disciplinas && disciplinas.length > 0) {
              discHTML = '<div style="margin-bottom:12px;"><div style="font-size:12px;color:#9aa4b8;margin-bottom:6px;">Disciplinas (' + disciplinas.length + '):</div><div style="display:flex;flex-wrap:wrap;gap:4px;">';
              disciplinas.forEach(d => {
                const incColor = d.incidencia === 'altissima' ? '#ff6b6b' : d.incidencia === 'alta' ? '#ffd43b' : '#5ddeda';
                discHTML += '<span style="background:' + incColor + '22;color:' + incColor + ';padding:2px 8px;border-radius:999px;font-size:10px;font-weight:600;">' + Shell._esc(d.nome) + '</span>';
              });
              discHTML += '</div></div>';
            } else {
              discHTML = '<div style="margin-bottom:12px;padding:8px;background:rgba(255,212,59,0.06);border:1px solid rgba(255,212,59,0.2);border-radius:8px;font-size:12px;color:#ffd43b;">⚠️ Edital não analisado. O scan vai identificar disciplinas pelos nomes das pastas.</div>';
            }

            bodyHTML =
              '<div style="font-size:13px;color:#9aa4b8;margin-bottom:8px;">Selecione as pastas com suas aulas. Navegue até a pasta desejada e clique em "Adicionar".</div>' +
              discHTML +
              '<div id="cw-folder-selected" style="margin-bottom:8px;font-size:12px;color:#9aa4b8;">Pastas selecionadas: <span id="cw-selected-count">' + selectedFolders.length + '</span></div>' +
              '<div id="cw-folder-selected-list" style="margin-bottom:8px;">' + selectedFolders.map((p) => '<div style="display:flex;align-items:center;gap:6px;padding:4px 8px;background:rgba(255,139,159,0.08);border:1px solid rgba(255,139,159,0.2);border-radius:6px;margin-bottom:4px;font-size:11px;color:#e6edf3;"><span style="flex:1;word-break:break-all;">' + Shell._esc(p) + '</span><button class="cw-remove-folder" data-path="' + Shell._esc(p) + '" style="background:none;border:none;color:#ff6b6b;cursor:pointer;font-size:14px;">✕</button></div>').join('') + '</div>' +
              '<div id="cw-breadcrumb" style="font-size:11px;color:#6b7488;margin-bottom:6px;word-break:break-all;"></div>' +
              '<div id="cw-folder-list" style="max-height:260px;overflow-y:auto;border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:4px;"><div style="padding:20px;text-align:center;color:#6b7488;font-size:12px;">Carregando drives...</div></div>';
            footerHTML =
              '<button class="meggy-header-btn" id="cw-back">← Voltar</button>' +
              '<div style="display:flex;gap:8px;">' +
                '<button class="meggy-header-btn" id="cw-add-folder">+ Adicionar pasta</button>' +
                '<button class="meggy-header-btn" id="cw-scan" style="background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;border:none;">📡 Escanear</button>' +
              '</div>';
          } else if (step === 4) {
            const r = scanResult || {};
            // ★ v2.15.5 (item 2): o passo 4 mostra os totais VINCULADOS (D1,
            //   pós-anexo) — a mesma fonte do detalhe. Sem eles (servidor
            //   antigo), cai para os totais da enumeração do /scan.
            const totalFound = (r.linkedTotal != null ? r.linkedTotal : (r.totalFound || 0));
            const totalMatched = (r.linkedTotal != null ? r.linkedTotal : (r.totalMatched || 0));
            const byDisc = (r.linkedByDiscipline || r.byDiscipline || {});
            let byDiscHTML = '';
            const discNames = Object.keys(byDisc);
            if (discNames.length > 0) {
              byDiscHTML = '<div style="margin-top:16px;font-size:12px;color:#9aa4b8;margin-bottom:8px;">Aulas por disciplina:</div><div style="display:flex;flex-direction:column;gap:4px;">';
              discNames.forEach(n => {
                byDiscHTML += '<div style="display:flex;justify-content:space-between;padding:6px 10px;background:rgba(255,255,255,0.03);border-radius:6px;font-size:12px;"><span style="color:#e6edf3;">' + Shell._esc(n) + '</span><span style="color:#5ddeda;font-weight:600;">' + byDisc[n] + ' aulas</span></div>';
              });
              byDiscHTML += '</div>';
            }

            bodyHTML =
              '<div style="text-align:center;padding:20px 0;">' +
                '<div style="font-size:48px;margin-bottom:8px;">✅</div>' +
                '<div style="font-size:18px;color:#e6edf3;font-weight:600;margin-bottom:4px;">Scan concluído!</div>' +
                '<div style="font-size:13px;color:#9aa4b8;">' + Shell._esc(concursoName) + ' está pronto para estudo.</div>' +
                ((r.modulesCreated != null) ? '<div style="font-size:12px;color:#5ddeda;margin-top:4px;">📁 ' + r.modulesCreated + ' módulo(s) criado(s)' + (r.modulesSkipped ? ' (' + r.modulesSkipped + ' já anexado(s))' : '') + '</div>' : '') +
                ((r.modulesError) ? '<div style="font-size:12px;color:#ffd43b;margin-top:4px;">⚠️ Módulos não criados: ' + Shell._esc(r.modulesError) + ' — dá para anexar depois no detalhe do concurso.</div>' : '') +
              '</div>' +
              '<div style="display:flex;gap:12px;justify-content:center;margin-bottom:16px;">' +
                '<div style="flex:1;padding:14px;background:rgba(93,222,218,0.08);border:1px solid rgba(93,222,218,0.2);border-radius:10px;text-align:center;">' +
                  '<div style="font-size:24px;font-weight:700;color:#5ddeda;">' + totalFound + '</div>' +
                  '<div style="font-size:11px;color:#9aa4b8;">Aulas encontradas</div>' +
                '</div>' +
                '<div style="flex:1;padding:14px;background:rgba(255,139,159,0.08);border:1px solid rgba(255,139,159,0.2);border-radius:10px;text-align:center;">' +
                  '<div style="font-size:24px;font-weight:700;color:#ff8b9f;">' + totalMatched + '</div>' +
                  '<div style="font-size:11px;color:#9aa4b8;">Aulas vinculadas</div>' +
                '</div>' +
              '</div>' +
              Shell.views._v215WizardStep4HoursHtml(r) +
              byDiscHTML;
            footerHTML =
              '<button class="meggy-header-btn" id="cw-close-early">Fechar</button>' +
              (banca ? '<button class="meggy-header-btn" id="cw-build-plan" style="background:linear-gradient(135deg,#ffd43b,#f59e0b);color:#1a1a1a;border:none;">🎯 Montar plano direcionado</button>' : '') +
              '<button class="meggy-header-btn" id="cw-view-course" style="background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;border:none;">📚 Ver Curso</button>';
          }

          modal.innerHTML =
            '<div class="meggy-modal-content" style="max-width:600px;width:100%;max-height:90vh;overflow-y:auto;background:#161b22;border:1px solid rgba(255,255,255,0.08);border-radius:14px;">' +
              '<div class="meggy-modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.06);">' +
                '<div class="meggy-modal-title" style="font-size:15px;font-weight:600;color:#e6edf3;">' + stepTitle + '</div>' +
                '<button id="cw-x" style="background:none;border:none;color:#9aa4b8;font-size:22px;cursor:pointer;line-height:1;padding:0 4px;">×</button>' +
              '</div>' +
              '<div id="cw-body" style="padding:16px;">' + bodyHTML + '</div>' +
              '<div id="cw-footer" style="padding:12px 16px;border-top:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">' + footerHTML + '</div>' +
            '</div>';

          // Close button (always present)
          const xBtn = document.getElementById('cw-x');
          if (xBtn) xBtn.onclick = closeModal;

          // Step-specific wiring
          if (step === 1) {
            // ★ v2.15.2 (H): máscara dd/mm/aaaa enquanto digita.
            const examInput = document.getElementById('cw-examdate');
            if (examInput) examInput.addEventListener('input', () => {
              const digits = examInput.value.replace(/\D/g, '').slice(0, 8);
              let out = digits;
              if (digits.length > 4) out = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4);
              else if (digits.length > 2) out = digits.slice(0, 2) + '/' + digits.slice(2);
              examInput.value = out;
            });
            const cancelBtn = document.getElementById('cw-cancel');
            if (cancelBtn) cancelBtn.onclick = closeModal;
            const nextBtn = document.getElementById('cw-next');
            if (nextBtn) nextBtn.onclick = async () => {
              const name = (document.getElementById('cw-name').value || '').trim();
              // ★ v2.15.2 (H): texto dd/mm/aaaa → ISO; inválida não avança.
              const examDateRaw = (document.getElementById('cw-examdate').value || '').trim();
              const examDate = Shell.views._v215ParseDateBR(examDateRaw);
              if (examDateRaw && !examDate) { Shell.views._v215Err('Data inválida', 'Use dd/mm/aaaa (ex.: 15/06/2026).'); return; }
              const dailyHours = parseInt(document.getElementById('cw-dailyhours').value, 10) || 4;
              banca = (document.getElementById('cw-banca') || {}).value || '';
              dailyHoursVal = dailyHours;
              examDateVal = examDate;
              if (!name) { Shell.views._v215Err('Nome do concurso', 'Informe o nome do concurso'); return; }
              nextBtn.disabled = true;
              nextBtn.innerHTML = '<div class="spinner-border spinner-border-sm"></div> Criando...';
              try {
                const r = await fetch('/api/concursos/create', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name, examDate, dailyHours })
                });
                const d = await r.json();
                if (d.ok) {
                  concursoId = d.concursoId;
                  concursoName = name;
                  // ★ v2.10.2: a lista de concursos é cacheada 60s — invalida
                  // para o concurso novo aparecer sem recarregar a página
                  try { if (window.__gdiStudy && window.__gdiStudy.courses && typeof window.__gdiStudy.courses.invalidateUnifiedCache === 'function') window.__gdiStudy.courses.invalidateUnifiedCache(); } catch (_) {}
                  step = 2;
                  render();
                } else {
                  Shell.views._v215Err('Erro ao criar concurso', d.error || 'tente novamente');
                  nextBtn.disabled = false;
                  nextBtn.innerHTML = 'Criar e Continuar →';
                }
              } catch (e) {
                Shell.views._v215Err('Erro ao criar concurso', e.message);
                nextBtn.disabled = false;
                nextBtn.innerHTML = 'Criar e Continuar →';
              }
            };
          } else if (step === 2) {
            const backBtn = document.getElementById('cw-back');
            if (backBtn) backBtn.onclick = () => { step = 1; render(); };
            const skipBtn = document.getElementById('cw-skip');
            if (skipBtn) skipBtn.onclick = () => { step = 3; render(); };
            const analyzeBtn = document.getElementById('cw-analyze');
            if (analyzeBtn) analyzeBtn.onclick = async () => {
              const editalText = (document.getElementById('cw-edital').value || '').trim();
              if (!editalText) { step = 3; render(); return; } // ★ v2.2: sem texto = segue sem edital
              if (editalText.length < 50) { Shell.views._v215Err('Edital muito curto', 'Cole ao menos um trecho relevante do edital.'); return; }
              analyzeBtn.disabled = true;
              analyzeBtn.innerHTML = '<div class="spinner-border spinner-border-sm"></div> Analisando...';
              try {
                const r = await fetch('/api/concursos/' + encodeURIComponent(concursoId) + '/analyze-edital', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ editalText })
                });
                const d = await r.json();
                if (d.ok) {
                  disciplinas = d.disciplinas || [];
                  step = 3;
                  render();
                } else {
                  Shell.views._v215Err('Erro ao analisar edital', d.error || 'tente novamente');
                  analyzeBtn.disabled = false;
                  analyzeBtn.innerHTML = '🔍 Analisar Edital';
                }
              } catch (e) {
                Shell.views._v215Err('Erro ao analisar edital', e.message);
                analyzeBtn.disabled = false;
                analyzeBtn.innerHTML = '🔍 Analisar Edital';
              }
            };
          } else if (step === 3) {
            const backBtn = document.getElementById('cw-back');
            if (backBtn) backBtn.onclick = () => { step = 2; render(); };

            // Folder picker navegável
            let currentBrowsePath = '';
            const drives = window.drive_names || [];

            function updateBreadcrumb() {
              const bc = document.getElementById('cw-breadcrumb');
              if (!bc) return;
              if (!currentBrowsePath) {
                bc.innerHTML = '<span style="color:#ff8b9f;cursor:pointer;" id="cw-bc-root">📁 Drives</span>';
              } else {
                const parts = currentBrowsePath.split('/').filter(Boolean);
                let html = '<span style="color:#ff8b9f;cursor:pointer;" id="cw-bc-root">📁 Drives</span>';
                let acc = '';
                parts.forEach((p, i) => {
                  // ★ v2.15.6 (P4b): um único append por segmento — o
                  //   código antigo somava o segmento duas vezes (i>0) e
                  //   ainda colava '/' extra após o drive ('/9://…'), então
                  //   o clique no breadcrumb navegava p/ um caminho
                  //   duplicado que o fetch não resolvia ("Erro ao carregar.").
                  if (i === 0) { acc = '/' + p + (p.endsWith(':') ? '/' : ''); }
                  else { acc += (acc.endsWith('/') ? '' : '/') + p + '/'; }
                  html += ' / <span style="color:#9aa4b8;cursor:pointer;" class="cw-bc-part" data-path="' + Shell._esc(acc) + '">' + Shell._esc(decodeURIComponent(p)) + '</span>';
                });
                bc.innerHTML = html;
              }
              const rootBc = document.getElementById('cw-bc-root');
              if (rootBc) rootBc.onclick = () => { currentBrowsePath = ''; browseFolder(''); };
              modal.querySelectorAll('.cw-bc-part').forEach(el => {
                el.onclick = () => { currentBrowsePath = el.dataset.path; browseFolder(currentBrowsePath); };
              });
            }

            async function browseFolder(path) {
              const listEl = document.getElementById('cw-folder-list');
              if (!listEl) return;
              // ★ v2.15.5 (item 4): guarda de geração — um fetch defasado (o
              //   usuário já navegou p/ outra pasta) não sobrescreve a lista.
              const mySeq = ++cwBrowseSeq;
              listEl.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7488;font-size:12px;"><div class="spinner-border spinner-border-sm"></div> Carregando...</div>';
              updateBreadcrumb();
              try {
                if (!path) {
                  // List drives
                  let html = '';
                  drives.forEach((name, i) => {
                    const dp = '/' + i + ':/';
                    html += '<div class="cw-folder-item" data-path="' + Shell._esc(dp) + '" style="display:flex;align-items:center;gap:8px;padding:10px;cursor:pointer;border-radius:6px;font-size:13px;color:#e6edf3;" onmouseover="this.style.background=\'rgba(255,255,255,0.04)\'" onmouseout="this.style.background=\'transparent\'">' +
                      '<span style="font-size:18px;">☁️</span>' +
                      '<span style="flex:1;">' + Shell._esc(name) + '</span>' +
                      '<span style="color:#6b7488;font-size:11px;">' + Shell._esc(dp) + '</span>' +
                    '</div>';
                  });
                  listEl.innerHTML = html || '<div style="padding:20px;text-align:center;color:#6b7488;">Nenhum drive.</div>';
                } else {
                  // List folder contents via worker API
                  const r = await fetch(path, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ page_token: null, page_index: 0 })
                  });
                  // ★ v2.15.6 (P4b): a guarda de geração vale também p/
                  //   o erro — um fetch defasado que falha NÃO pode
                  //   sobrescrever a lista atual (antes, a guarda só existia
                  //   após r.json()).
                  if (mySeq !== cwBrowseSeq || !modal.contains(listEl)) return;
                  if (!r.ok) { listEl.innerHTML = '<div style="padding:20px;text-align:center;color:#ff6b6b;">Erro ao carregar.</div>'; return; }
                  const data = await r.json();
                  // ★ v2.15.5 (item 4): descarta a resposta se outra navegação
                  //   já começou ou se a lista foi recriada (render) no meio.
                  if (mySeq !== cwBrowseSeq || !modal.contains(listEl)) return;
                  cwChecked.prune(path);
                  const files = (data.data && data.data.files) || [];
                  const folders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
                  if (folders.length === 0) {
                    listEl.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7488;font-size:12px;">Nenhuma subpasta aqui.</div>';
                  } else {
                    // ★ v2.15.2 (C): multi-seleção no passo 3 — o checkbox só
                    //   existia no modal "Adicionar Pasta de Curso".
                    // ★ v2.15.9 (D): ordem determinística por nome — o Drive
                    //   devolve as pastas sem ordenação e a ordem pode mudar
                    //   entre renders; sem isto, uma referência por índice
                    //   passa a apontar p/ a pasta vizinha (+1 do Passo 13:
                    //   penal+civil viraram constitucional+previdenciario).
                    //   O id estável (hash do caminho) + o aria-label com o
                    //   nome dão à pasta uma identidade que não depende da
                    //   posição — a seleção continua por caminho (Set).
                    folders.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
                    const _cwCheckId = function(s){ let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return ('0000000' + (h >>> 0).toString(16)).slice(-8); };
                    const selBar = '<div style="display:flex;justify-content:flex-end;margin-bottom:6px;"><button class="meggy-header-btn" id="cw-add-selected" disabled style="font-size:12px;opacity:0.5;">＋ Adicionar selecionadas (0)</button></div>';
                    listEl.innerHTML = selBar + folders.map(f => {
                      const subPath = path.endsWith('/') ? path + encodeURIComponent(f.name) + '/' : path + '/' + encodeURIComponent(f.name) + '/';
                      return '<div class="cw-folder-item" data-path="' + Shell._esc(subPath) + '" style="display:flex;align-items:center;gap:8px;padding:10px;cursor:pointer;border-radius:6px;font-size:13px;color:#e6edf3;word-break:break-word;" onmouseover="this.style.background=\'rgba(255,255,255,0.04)\'" onmouseout="this.style.background=\'transparent\'">' +
                        '<input type="checkbox" id="cw-check-' + _cwCheckId(subPath) + '" class="v215-folder-check cw-folder-check" data-path="' + Shell._esc(subPath) + '" aria-label="Selecionar pasta ' + Shell._esc(f.name) + '" title="Selecionar para adicionar ao concurso" style="flex:none;width:18px;height:18px;accent-color:#ff8b9f;cursor:pointer;" />' +
                        '<span style="font-size:18px;">📁</span>' +
                        '<span style="flex:1;">' + Shell._esc(f.name) + '</span>' +
                      '</div>';
                    }).join('');
                  }
                }
                // Click handlers
                modal.querySelectorAll('.cw-folder-item').forEach(el => {
                  el.onclick = () => { currentBrowsePath = el.dataset.path; browseFolder(currentBrowsePath); };
                });
                // ★ v2.15.2 (C): checkbox não navega; o botão adiciona as
                //   marcadas à lista de pastas selecionadas (sem duplicar) e
                //   atualiza contador/lista sem re-render (não perde a navegação).
                const cwSelBtn = document.getElementById('cw-add-selected');
                const cwUpdateSel = () => {
                  const n = modal.querySelectorAll('.cw-folder-check:checked').length;
                  if (cwSelBtn) { cwSelBtn.disabled = n === 0; cwSelBtn.style.opacity = n === 0 ? '0.5' : '1'; cwSelBtn.textContent = '＋ Adicionar selecionadas (' + n + ')'; }
                };
                // ★ v2.15.5 (item 4): a seleção vive no Set por caminho
                //   (capturada no 'change'), nunca na posição — e é re-aplicada
                //   a cada carregamento da lista (a lista pode reordenar ou ser
                //   substituída por um fetch defasado entre o clique e o botão).
                modal.querySelectorAll('.cw-folder-check').forEach(cb => {
                  cb.addEventListener('click', e => e.stopPropagation());
                  cb.addEventListener('change', () => { const p = cb.dataset.path; if (cb.checked) cwChecked.add(p); else cwChecked.remove(p); cwUpdateSel(); });
                });
                cwChecked.applyTo(modal);
                cwUpdateSel();
                if (cwSelBtn) cwSelBtn.onclick = () => {
                  // ★ v2.15.5 (item 4): lê o Set (capturado no 'change' por
                  //   caminho), não o DOM do momento — a lista pode ter sido
                  //   re-renderizada/reordenada depois do clique no checkbox.
                  const paths = cwChecked.values();
                  let added = 0;
                  paths.forEach(p => { if (selectedFolders.indexOf(p) < 0) { selectedFolders.push(p); added++; } });
                  paths.forEach(p => cwChecked.remove(p));
                  if (added) {
                    const cnt = document.getElementById('cw-selected-count');
                    if (cnt) cnt.textContent = String(selectedFolders.length);
                    const selList = document.getElementById('cw-folder-selected-list');
                    if (selList) selList.innerHTML = selectedFolders.map((p) => '<div style="display:flex;align-items:center;gap:6px;padding:4px 8px;background:rgba(255,139,159,0.08);border:1px solid rgba(255,139,159,0.2);border-radius:6px;margin-bottom:4px;font-size:11px;color:#e6edf3;"><span style="flex:1;word-break:break-all;">' + Shell._esc(p) + '</span><button class="cw-remove-folder" data-path="' + Shell._esc(p) + '" style="background:none;border:none;color:#ff6b6b;cursor:pointer;font-size:14px;">✕</button></div>').join('');
                    modal.querySelectorAll('.cw-remove-folder').forEach(btn => {
                      // ★ v2.15.5 (item 4): remover por caminho estável, nunca por índice.
                      btn.onclick = () => { const p = btn.dataset.path; selectedFolders = selectedFolders.filter(x => x !== p); render(); };
                    });
                  }
                  browseFolder(currentBrowsePath);
                };
              } catch (e) {
                listEl.innerHTML = '<div style="padding:20px;text-align:center;color:#ff6b6b;">Erro: ' + Shell._esc(e.message) + '</div>';
              }
            }

            // Add folder button
            const addBtn = document.getElementById('cw-add-folder');
            if (addBtn) addBtn.onclick = () => {
              if (!currentBrowsePath) { Shell.views._v215Err('Nenhuma pasta', 'Navegue até uma pasta primeiro'); return; }
              if (selectedFolders.indexOf(currentBrowsePath) < 0) {
                selectedFolders.push(currentBrowsePath);
                render();
              } else {
                Shell.views._v215Err('Pasta já selecionada', 'Esta pasta já está na lista.');
              }
            };

            // Remove folder buttons
            modal.querySelectorAll('.cw-remove-folder').forEach(btn => {
              btn.onclick = () => {
                // ★ v2.15.5 (item 4): remover por caminho estável, nunca por índice.
                const p = btn.dataset.path;
                selectedFolders = selectedFolders.filter(x => x !== p);
                render();
              };
            });

            // Scan button
            const scanBtn = document.getElementById('cw-scan');
            if (scanBtn) scanBtn.onclick = async () => {
              if (selectedFolders.length === 0) { Shell.views._v215Err('Nenhuma pasta', 'Adicione ao menos uma pasta'); return; }
              scanBtn.disabled = true;
              scanBtn.innerHTML = '<div class="spinner-border spinner-border-sm"></div> Escaneando...';
              try {
                // ★ v2.15.6 (P2): /scan paginado — retoma do cursor até
                //   truncated=false (v. _v215PreviewPaged).
                let scanBody = { folderPaths: selectedFolders };
                let d = null;
                // ★ v2.15.8 (D — P4): progresso visível + parada quando o
                //   servidor não tem mais o que retomar (pending vazio ou
                //   sem progresso entre voltas — v. _v215PreviewPaged). Antes
                //   o botão ficava em "Escaneando..." até o teto de 40 voltas.
                let _prevPendKey = null, _prevLinked = -1;
                for (let a = 0; a < 40; a++) {
                  const r = await fetch('/api/concursos/' + encodeURIComponent(concursoId) + '/scan', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(scanBody)
                  });
                  d = await r.json();
                  if (!d || !d.ok || !d.truncated) break;
                  const _pendKey = JSON.stringify((d && d.pending) || {});
                  const _linked = (d && d.linkedTotal != null) ? d.linkedTotal : -1;
                  if (_pendKey === '{}' || (_pendKey === _prevPendKey && _linked === _prevLinked)) { d._scanStopped = (_pendKey === '{}' ? 'resume-exhausted' : 'no-progress'); d.truncated = false; break; }
                  _prevPendKey = _pendKey; _prevLinked = _linked;
                  scanBtn.innerHTML = '<div class="spinner-border spinner-border-sm"></div> Escaneando... volta ' + (a + 1) + '/40' + (_linked >= 0 ? ' · ' + _linked + ' aulas' : '');
                  scanBody = { folderPaths: selectedFolders, resume: d.pending || {} };
                }
                if (d.ok) {
                  scanResult = d;
                  // ★ v2.15.2 (D): o anexo do assistente também cria os
                  //   módulos em concurso_sources (mesmo efeito do fluxo "＋
                  //   Adicionar esta pasta ao curso") — antes só alimentava
                  //   o scan e o detalhe mostrava "Nenhuma pasta anexada".
                  try {
                    const m = await Shell.views._v215AttachPaged(concursoId, selectedFolders);
                    scanResult.modulesCreated = (m.attached || []).length;
                    scanResult.modulesSkipped = (m.skipped || []).length;
                    // ★ v2.15.5 (item 2): o anexo re-escaneia (2ª enumeração)
                    //   e pode vincular mais aulas que o /scan viu — o passo 4
                    //   passa a mostrar os totais pós-anexo (D1), que são os
                    //   mesmos que o detalhe vai mostrar.
                    if (m && m.scanned && m.scanned.linkedTotal != null) {
                      scanResult.linkedTotal = m.scanned.linkedTotal;
                      scanResult.linkedMinutes = m.scanned.linkedMinutes;
                      scanResult.linkedHours = m.scanned.linkedHours;
                      scanResult.linkedByDiscipline = m.scanned.linkedByDiscipline;
                      if (m.scanned.truncated) scanResult.truncated = true;
                      // ★ v2.15.7 (P4): o passo 4 mostra depthCut/notFound
                      //   do anexo também (o /scan sozinho pode não tê-los).
                      if (Array.isArray(m.scanned.depthCut)) { const seen = new Set((scanResult.depthCut || []).map(x => (x.folder || '') + '|' + (x.path || ''))); for (const dc of m.scanned.depthCut) { const k = (dc.folder || '') + '|' + (dc.path || ''); if (!seen.has(k)) { seen.add(k); (scanResult.depthCut = scanResult.depthCut || []).push(dc); } } }
                      if (Array.isArray(m.scanned.notFound)) { const seenN = new Set(scanResult.notFound || []); for (const nf of m.scanned.notFound) if (!seenN.has(nf)) { seenN.add(nf); (scanResult.notFound = scanResult.notFound || []).push(nf); } }
                    }
                  } catch (me) {
                    scanResult.modulesError = me.message || 'não foi possível criar os módulos';
                  }
                  // ★ v2.15.3 (item 2): preenche as horas do passo 4 (do
                  //   /scan, ou da prévia como fallback quando o servidor
                  //   ainda não devolve horas).
                  try { await Shell.views._v215EnsureScanHours(concursoId, scanResult, selectedFolders); } catch (_) {}
                  step = 4;
                  render();
                } else {
                  Shell.views._v215Err('Erro ao escanear', d.error || 'tente novamente');
                  scanBtn.disabled = false;
                  scanBtn.innerHTML = '📡 Escanear';
                }
              } catch (e) {
                Shell.views._v215Err('Erro ao escanear', e.message);
                scanBtn.disabled = false;
                scanBtn.innerHTML = '📡 Escanear';
              }
            };

            // Start browsing
            browseFolder('');
          } else if (step === 4) {
            const closeEarly = document.getElementById('cw-close-early');
            if (closeEarly) closeEarly.onclick = () => { closeModal(); Shell.views.concursos(el); };
            const viewBtn = document.getElementById('cw-view-course');
            if (viewBtn) viewBtn.onclick = () => { closeModal(); Shell.views.concursoDetail(el, concursoId); };
            // ★ v2.8 Fase B: montar o plano direcionado da banca
            const buildPlanBtn = document.getElementById('cw-build-plan');
            if (buildPlanBtn) buildPlanBtn.onclick = async () => {
              buildPlanBtn.disabled = true;
              buildPlanBtn.textContent = 'Montando plano...';
              try {
                let totalDays = 60;
                if (examDateVal) { const diff = Math.ceil((new Date(examDateVal + 'T12:00:00') - Date.now()) / 86400000); if (diff > 7) totalDays = Math.min(180, diff); }
                const r = await fetch('/api/plans/build', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ concursoId, banca, dailyHours: dailyHoursVal, totalDays }) });
                const d = await r.json();
                if (!d.ok) throw new Error(d.error || ('HTTP ' + r.status));
                const s = d.summary;
                const bodyEl = document.getElementById('cw-body');
                if (bodyEl) {
                  let h = '<div style="text-align:center;padding:12px 0;"><div style="font-size:40px;margin-bottom:8px;">🎯</div><div style="font-size:17px;color:#e6edf3;font-weight:600;margin-bottom:4px;">Plano direcionado pronto!</div><div style="font-size:13px;color:#9aa4b8;">' + Shell._esc(banca) + ' · ' + s.totalDays + ' dias · ' + s.dailyHours + 'h/dia · ' + s.totalHours + 'h no total</div><div style="font-size:13px;color:#ffd43b;margin-top:6px;">' + s.altaSharePct + '% do tempo nas disciplinas de alta incidência</div></div>';
                  h += '<div style="display:flex;flex-direction:column;gap:4px;">';
                  s.disciplines.slice(0, 12).forEach(dd => { h += '<div style="display:flex;justify-content:space-between;padding:6px 10px;background:rgba(255,255,255,0.03);border-radius:6px;font-size:12px;"><span style="color:#e6edf3;">' + Shell._esc(dd.nome) + (dd.fromEdital ? ' 📋' : '') + '</span><span style="color:#5ddeda;font-weight:600;">' + dd.horas + 'h (' + dd.pct + '%)</span></div>'; });
                  h += '</div>';
                  bodyEl.innerHTML = h;
                }
                buildPlanBtn.style.display = 'none';
              } catch (e) { Shell.views._v215Err('Não foi possível montar o plano', e.message); buildPlanBtn.disabled = false; buildPlanBtn.textContent = '🎯 Montar plano direcionado'; }
            };
          }
        }

        const shellRoot = document.getElementById('meggy-shell') || document.getElementById('meggy-root') || document.body;
        shellRoot.appendChild(modal);
        render(); // ★ FIX: render() DEPOIS do appendChild — getElementById precisa do modal no DOM
      },

      // ═══ Detail: curso montado de um concurso ═══
      concursoDetail(el, concursoId) {
        el.innerHTML = '<div class="meggy-view-header"><h1 class="meggy-view-title">📌 Carregando...</h1><button class="meggy-header-btn" onclick="Shell.router.navigate(\'/concursos\')">← Voltar</button></div><div class="meggy-loading"><div class="spinner-border"></div></div>';

        fetch('/api/concursos/' + encodeURIComponent(concursoId)).then(r => r.json()).then(data => {
          if (!data.ok) {
            el.innerHTML = '<div class="meggy-placeholder"><div class="meggy-placeholder-icon">⚠️</div><div class="meggy-placeholder-title">Erro</div><div class="meggy-placeholder-desc">' + Shell._esc(data.error || 'Concurso não encontrado') + '</div></div>';
            return;
          }
          const c = data.concurso || {};
          let html = '<div class="meggy-view-header">' +
            '<h1 class="meggy-view-title">📌 ' + Shell._esc(c.name) + '</h1>' +
            '<button class="meggy-header-btn" onclick="Shell.router.navigate(\'/concursos\')">← Voltar</button>' +
          '</div>';

          // Tabs
          html += '<div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;align-items:center;">';
          html += '<button class="meggy-header-btn" id="tab-completo" style="background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;border:none;">📚 Curso Completo</button>';
          html += '<button class="meggy-header-btn" id="btn-edital">📋 Colar conteúdo programático</button>';
          html += '<button class="meggy-header-btn" id="btn-plan">🎯 Plano de estudo</button>';
          html += '<button class="meggy-header-btn" id="btn-delete-concurso" style="background:rgba(255,107,107,.12);color:#ff8b8b;border:1px solid rgba(255,107,107,.35);">🗑️ Excluir concurso</button>';
          if (data.intensivoCount > 0) {
            html += '<button class="meggy-header-btn" id="tab-intensivo">⚡ Curso Intensivo (' + data.intensivoCount + ')</button>';
          }
          if (c.examDate) {
            html += '<span style="margin-left:auto;color:#9aa4b8;font-size:12px;">📅 Prova: ' + Shell._esc(c.examDate) + '</span>';
          }
          html += '</div>';

          // Disciplinas accordion
          html += '<div id="concurso-plan" style="margin-bottom:16px;"></div>';
          html += '<div id="concurso-content">';
          if (!data.disciplinas || data.disciplinas.length === 0) {
            html += '<div class="meggy-placeholder"><div class="meggy-placeholder-icon">📭</div><div class="meggy-placeholder-title">Nenhuma disciplina</div><div class="meggy-placeholder-desc">Analise o edital e escaneie os drives para montar o curso.</div></div>';
          } else {
            // ★ v2.15.0: completude por disciplina (X/Y aulas + buracos)
            const compMap = {};
            (data.completeness || []).forEach(cp => { compMap[cp.nome] = cp; });
            data.disciplinas.forEach(d => {
              const incidenciaColor = d.incidencia === 'altissima' ? '#ff6b6b' : d.incidencia === 'alta' ? '#ffd43b' : '#5ddeda';
              // ★ v2.15.2 (F): dedupe por lesson_path normalizado (decodifica
              //   p/ unificar a forma crua e a codificada). O servidor já
              //   dedupa (GET :id), mas a lista não pode repetir o mesmo
              //   arquivo se o payload vier duplicado.
              const _normKey = (s) => { let x = String(s || ''); try { x = decodeURIComponent(x); } catch (_) {} return x.toLowerCase().replace(/\/+$/, ''); };
              const _seenPaths = new Set();
              const _lessons = (d.lessons || []).filter(l => { const _k = _normKey(l.path || l.name || ''); if (_seenPaths.has(_k)) return false; _seenPaths.add(_k); return true; });
              const lessonCount = _lessons.length;
              html += '<div class="meggy-tree-node" style="margin-bottom:12px;">';
              html += '<div class="meggy-tree-head" style="cursor:pointer;display:flex;align-items:center;gap:8px;padding:12px;background:rgba(255,255,255,0.03);border-radius:8px;">';
              html += '<span class="meggy-tree-chevron">▶</span>';
              html += '<span style="font-size:16px;">📚</span>';
              html += '<span style="font-weight:600;color:#e6edf3;flex:1;">' + Shell._esc(d.nome) + '</span>';
              if (d.peso != null) html += '<span style="background:rgba(93,222,218,0.12);color:#5ddeda;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;">' + Shell._esc(d.peso) + ' questões</span>';
              if (d.incidencia) html += '<span style="background:' + incidenciaColor + '22;color:' + incidenciaColor + ';padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;">' + Shell._esc(d.incidencia) + '</span>';
              html += '<span style="color:#8b949e;font-size:12px;">' + lessonCount + ' aulas</span>';
              const compD = compMap[d.nome];
              if (compD && compD.expected != null) html += '<span style="background:rgba(93,222,218,0.12);color:#5ddeda;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;" title="Aulas vinculadas / topicos do edital">' + compD.lessons + '/' + compD.expected + ' aulas</span>';
              html += '</div>';
              // Lessons (hidden by default)
              html += '<div class="meggy-tree-children" style="display:none;padding:8px 0 8px 28px;">';
              if (lessonCount === 0) {
                html += '<div style="color:#6b7488;font-size:12px;padding:8px;">Nenhuma aula encontrada para esta disciplina.</div>';
              } else {
                _lessons.forEach(l => {
                  const icon = (l.name || '').endsWith('.mp4') ? '🎬' : (l.name || '').endsWith('.pdf') ? '📄' : '🎵';
                  const intensivoBadge = l.isIntensivo ? ' <span style="color:#ffd43b;font-size:10px;">⚡</span>' : '';
                  // ★ v2.15.5 (item 3): a pasta de origem distingue os arquivos
                  //   repetidos ("001 - aula.mp3" ×9) — linha 1: pasta; linha 2:
                  //   arquivo. Sem pasta, volta ao rótulo único de antes.
                  const _lf = (l.folder || Shell.views._v215LessonFolder(l.path || ''));
                  // ★ v2.15.6 (PROVA EXTRA): a linha é clicável — abre a
                  //   aula no player (antes só destacava ao passar o rato).
                  html += '<div class="meggy-study-list" data-lesson-path="' + Shell._esc(l.path || '') + '" style="display:flex;align-items:center;gap:8px;padding:8px;cursor:pointer;border-radius:6px;" onmouseover="this.style.background=\'rgba(255,255,255,0.03)\'" onmouseout="this.style.background=\'transparent\'">';
                  html += '<span style="font-size:16px;">' + icon + '</span>';
                  if (_lf) {
                    html += '<span style="flex:1;min-width:0;"><span style="display:block;font-size:11px;color:#8b949e;word-break:break-word;">' + Shell._esc(_lf) + '</span><span style="display:block;color:#e6edf3;font-size:13px;word-break:break-word;">' + Shell._esc(l.name) + '</span></span>';
                  } else {
                    html += '<span style="color:#e6edf3;font-size:13px;flex:1;word-break:break-word;">' + Shell._esc(l.displayName || l.name) + '</span>';
                  }
                  if (l.topico) html += '<span style="color:#8b949e;font-size:11px;">' + Shell._esc(l.topico) + '</span>';
                  html += intensivoBadge;
                  html += '</div>';
                });
              }
              if (compD && compD.gaps && compD.gaps.length) {
                html += '<div style="padding:8px 12px;margin:8px 0;background:rgba(255,212,59,0.06);border:1px solid rgba(255,212,59,0.2);border-radius:8px;font-size:12px;color:#ffd43b;">⚠️ Faltam: ' + compD.gaps.map(g => Shell._esc(g)).join(', ') + '</div>';
              }
              html += '</div></div>';
            });
          }
          html += '</div>';

          // ★ v2.15.0: seções de módulos, sugestões da Meggy e erros
          html += '<div id="v215-sources" style="margin-top:20px;"></div>';
          html += '<div id="v215-suggest" style="margin-top:20px;"></div>';
          html += '<div id="v215-errors" style="margin-top:20px;"></div>';

          el.innerHTML = html;

          // ★ v2.15.6 (PROVA EXTRA): cada linha de aula abre a aula no player.
          el.querySelectorAll('.meggy-study-list[data-lesson-path]').forEach(row => {
            row.onclick = () => { const p = row.dataset.lessonPath; if (p) Shell.views._openLessonPath(p); };
          });

          // Accordion toggle
          el.querySelectorAll('.meggy-tree-head').forEach(head => {
            head.onclick = function() {
              const children = this.nextElementSibling;
              const chevron = this.querySelector('.meggy-tree-chevron');
              if (!children) return;
              if (children.style.display === 'none') {
                children.style.display = 'block';
                if (chevron) chevron.textContent = '▼';
              } else {
                children.style.display = 'none';
                if (chevron) chevron.textContent = '▶';
              }
            };
          });

          // ★ v2.2: colar conteúdo programático depois (opcional na criação)
          const btnEdital = document.getElementById('btn-edital');
          if (btnEdital) btnEdital.onclick = () => Shell.views.showEditalModal(el, concursoId);

          // ★ v2.8 Fase B: painel do plano direcionado (dia atual + sessões de hoje)
          const planBox = document.getElementById('concurso-plan');
          async function renderPlan(){
            if (!planBox) return;
            try {
              const r = await fetch('/api/plans/list?concursoId=' + encodeURIComponent(concursoId), { credentials: 'include' });
              const d = await r.json();
              const p = d && d.ok && d.plans && d.plans[0];
              if (!p){
                planBox.innerHTML = '<div style="padding:12px;background:rgba(255,212,59,0.06);border:1px solid rgba(255,212,59,0.2);border-radius:10px;font-size:13px;color:#e6edf3;">🎯 <b>Plano de estudo direcionado</b><div style="color:#9aa4b8;font-size:12px;margin:4px 0 10px;">A Meggy monta um plano dia a dia só com o mais cobrado pela banca do seu concurso.</div><button class="meggy-header-btn" id="btn-plan-new" style="background:linear-gradient(135deg,#ffd43b,#f59e0b);color:#1a1a1a;border:none;">🎯 Montar plano</button> <button class="meggy-header-btn" id="btn-plan-meggy" style="background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;border:none;">🐩 Montar plano com a Meggy</button></div>';
              } else {
                const dayIdx = Math.max(1, Math.min(p.totalDays, Math.floor((Date.now() - p.createdAt) / 86400000) + 1));
                planBox.innerHTML = '<div style="padding:12px;background:rgba(93,222,218,0.06);border:1px solid rgba(93,222,218,0.2);border-radius:10px;font-size:13px;color:#e6edf3;">🎯 <b>Plano de estudo</b> · ' + Shell._esc(p.banca) + ' · dia ' + dayIdx + ' de ' + p.totalDays + ' · ' + p.dailyHours + 'h/dia<div style="margin-top:8px;"><button class="meggy-header-btn" id="btn-plan-view">📅 Ver plano completo</button> <button class="meggy-header-btn" id="btn-plan-new">🔄 Refazer plano</button> <button class="meggy-header-btn" id="btn-plan-meggy">🐩 Montar plano com a Meggy</button></div><div id="plan-today" style="margin-top:10px;"></div></div>';
                try {
                  const rr = await fetch('/api/plans/' + encodeURIComponent(p.id), { credentials: 'include' });
                  const dd = await rr.json();
                  const today = dd && dd.ok && dd.plan && dd.plan.days && dd.plan.days[dayIdx - 1];
                  const tEl = document.getElementById('plan-today');
                  if (today && tEl){ tEl.innerHTML = '<div style="font-size:12px;color:#9aa4b8;margin-bottom:6px;">Hoje (' + Shell._esc(today.date) + '):</div>' + today.sessions.map(s => '<div style="padding:6px 10px;background:rgba(255,255,255,0.03);border-radius:6px;font-size:12px;margin-bottom:4px;">' + (s.tipo === 'revisao' ? '🔁 ' : '📚 ') + Shell._esc(s.disciplina) + ' — ' + Shell._esc(s.topico) + ' <span style="color:#5ddeda;">(' + s.minutos + ' min)</span>' + Shell.views._v215PlayBtnHtml(s, concursoId) + '</div>').join(''); Shell.views._v215WirePlayButtons(tEl, concursoId); }
                } catch (_) {}
                const pv = document.getElementById('btn-plan-view');
                if (pv) pv.onclick = () => Shell.views.showPlanModal(p.id, concursoId);
              }
              const pn = document.getElementById('btn-plan-new');
              if (pn) pn.onclick = () => Shell.views.showPlanModal(null, concursoId);
              const pmg = document.getElementById('btn-plan-meggy');
              if (pmg) pmg.onclick = () => Shell.views.showPlanModal(null, concursoId, { meggy: true });
            } catch (_) { if (planBox) planBox.innerHTML = ''; }
          }
          renderPlan();
          Shell.views._v215RenderSources(el, concursoId, data);
          Shell.views._v215RenderSuggest(el, concursoId, data);
          Shell.views._v215RenderErrors(el, concursoId);
          const btnPlan = document.getElementById('btn-plan');
          if (btnPlan) btnPlan.onclick = () => { if (planBox) planBox.scrollIntoView({ behavior: 'smooth', block: 'center' }); };

          // ★ v2.5: excluir concurso no detalhe
          const btnDelConcurso = document.getElementById('btn-delete-concurso');
          if (btnDelConcurso) btnDelConcurso.onclick = async () => {
            // ★ v2.15.2 (G): gdiModal em vez do confirm() nativo (que é
            //   auto-dispensado e o botão não fazia nada) + invalida o cache
            //   unificado antes de navegar (I).
            const okDel = await Shell.views._v215Confirm('Excluir concurso', 'Excluir este concurso? As disciplinas e aulas vinculadas serão apagadas. Esta ação não pode ser desfeita.', 'Excluir');
            if (!okDel) return;
            try {
              const r = await fetch('/api/concursos/' + encodeURIComponent(concursoId), { method: 'DELETE', credentials: 'include' });
              const d = await r.json().catch(() => ({}));
              if (!r.ok || !d.ok) throw new Error((d && (d.error || d.message)) || ('HTTP ' + r.status));
              try { if (window.__gdiStudy && window.__gdiStudy.courses && typeof window.__gdiStudy.courses.invalidateUnifiedCache === 'function') window.__gdiStudy.courses.invalidateUnifiedCache(); } catch (_) {}
              Shell.router.navigate('/concursos');
            } catch (err) { Shell.views._v215Err('Não foi possível excluir', err.message); }
          };

          // Tab intensivo
          const tabIntensivo = document.getElementById('tab-intensivo');
          if (tabIntensivo) {
            tabIntensivo.onclick = function() {
              this.style.background = 'linear-gradient(135deg,#ff8b9f,#c026d3)';
              this.style.color = '#fff';
              this.style.border = 'none';
              const tc = document.getElementById('tab-completo');
              if (tc) { tc.style.background = ''; tc.style.color = ''; }
              el.querySelectorAll('.meggy-tree-node').forEach(node => {
                const lessons = node.querySelectorAll('.meggy-study-list');
                let hasIntensivo = false;
                lessons.forEach(l => {
                  if (!l.innerHTML.includes('⚡')) { l.style.display = 'none'; }
                  else { hasIntensivo = true; l.style.display = 'flex'; }
                });
                node.style.display = hasIntensivo ? 'block' : 'none';
              });
            };
          }
          const tabCompleto = document.getElementById('tab-completo');
          if (tabCompleto) {
            tabCompleto.onclick = function() {
              this.style.background = 'linear-gradient(135deg,#ff8b9f,#c026d3)';
              this.style.color = '#fff';
              this.style.border = 'none';
              if (tabIntensivo) { tabIntensivo.style.background = ''; tabIntensivo.style.color = ''; }
              el.querySelectorAll('.meggy-tree-node').forEach(n => n.style.display = 'block');
              // ★ v2.15.6 (PROVA EXTRA): "Curso Completo" expande TODOS os
              //   acordeões (antes só mostrava os nós — os filhos continuavam
              //   fechados e o botão parecia não fazer nada) e mostra todas
              //   as linhas (limpa o filtro intensivo).
              el.querySelectorAll('.meggy-tree-children').forEach(ch => { ch.style.display = 'block'; });
              el.querySelectorAll('.meggy-tree-chevron').forEach(ch => { ch.textContent = '▼'; });
              el.querySelectorAll('.meggy-study-list').forEach(l => l.style.display = 'flex');
            };
          }
        }).catch(e => {
          el.innerHTML = '<div class="meggy-placeholder"><div class="meggy-placeholder-icon">⚠️</div><div class="meggy-placeholder-title">Erro</div><div class="meggy-placeholder-desc">' + Shell._esc(e.message) + '</div></div>';
        });
      },

      // ═══ v2.15.0 — Montar curso multi-pastas + plano da Meggy ═══
      // Helpers + seções do detalhe do concurso + fluxo de anexo com prévia
      // + resolução lesson_path → stream + geração de materiais por módulo.
      // Nenhum alert()/confirm() nativo aqui: erros vão por gdiModal e
      // avisos curtos por showToast (shell-bridge).
      _v215Toast(msg) {
        try { if (typeof window.showToast === 'function') { window.showToast(msg); return; } } catch (_) {}
        try { console.log('[Meggy v2.15]', msg); } catch (_) {}
      },

      _v215Err(title, message) {
        try {
          if (typeof window.gdiModal === 'function') { window.gdiModal({ title: title, message: message, confirmText: 'OK' }); return; }
        } catch (_) {}
        Shell.views._v215Toast(title + ': ' + message);
      },

      // ★ v2.15.4 Q1: nunca resolve false silencioso. Sem gdiModal
      //   (gdi-core.js carrega async; se o usuário clicar antes ou o core
      //   falhar, não há gdiModal), abre o confirm inline do próprio shell
      //   (_v215ConfirmFallback); só resolve false após o usuário cancelar
      //   ou, se nem o DOM permitir, após avisar por toast. "Excluir
      //   concurso" e "Remover módulo" sempre abrem alguma confirmação.
      _v215Confirm(title, message, confirmText) {
        try {
          if (typeof window.gdiModal === 'function') return window.gdiModal({ title: title, message: message, confirmText: confirmText || 'Confirmar', cancelText: 'Cancelar', danger: true });
        } catch (_) {}
        return Shell.views._v215ConfirmFallback(title, message, confirmText);
      },

      // ★ v2.15.4 Q1: modal de confirmação do próprio shell — zero
      //   dependência de gdi-core.js (estilos 100% inline). Esc/cancelar/
      //   clicar fora resolve false; confirmar resolve true.
      _v215ConfirmFallback(title, message, confirmText) {
        return new Promise((resolve) => {
          try {
            document.querySelectorAll('.meggy-v215-confirm').forEach((m) => { try { if (typeof m.__v215Cleanup === 'function') m.__v215Cleanup(); } catch (_) {} m.remove(); });
            const overlay = document.createElement('div');
            overlay.className = 'meggy-v215-confirm';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:100002;display:flex;align-items:center;justify-content:center;padding:20px;';
            overlay.innerHTML = '<div style="background:#0d1119;border:1px solid rgba(255,255,255,.12);border-radius:14px;max-width:480px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.6);">' +
              '<div style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.08);font-size:15px;font-weight:700;color:#e6edf3;">' + Shell._esc(title) + '</div>' +
              '<div style="padding:20px;font-size:14px;line-height:1.6;color:#e6edf3;white-space:pre-wrap;">' + Shell._esc(message) + '</div>' +
              '<div style="display:flex;gap:8px;justify-content:flex-end;padding:0 20px 16px;flex-wrap:wrap;">' +
                '<button class="meggy-v215-confirm-cancel" style="min-height:44px;padding:10px 16px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#c9d1d9;font-size:13px;cursor:pointer;font-family:inherit;">Cancelar</button>' +
                '<button class="meggy-v215-confirm-ok" style="min-height:44px;padding:10px 16px;border-radius:8px;border:0;background:#ff6b6b;color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">' + Shell._esc(confirmText || 'Confirmar') + '</button>' +
              '</div></div>';
            let done = false;
            const finish = (v) => {
              if (done) return;
              done = true;
              try { document.removeEventListener('keydown', onKey); } catch (_) {}
              try { overlay.remove(); } catch (_) {}
              resolve(v);
            };
            const onKey = (e) => { if (e.key === 'Escape') finish(false); };
            overlay.__v215Cleanup = () => finish(false);
            overlay.querySelector('.meggy-v215-confirm-ok').onclick = () => finish(true);
            overlay.querySelector('.meggy-v215-confirm-cancel').onclick = () => finish(false);
            overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(false); });
            document.addEventListener('keydown', onKey);
            document.body.appendChild(overlay);
          } catch (_) {
            Shell.views._v215Toast('Não foi possível abrir a confirmação — recarregue a página e tente de novo.');
            resolve(false);
          }
        });
      },

      _v215Api(path, opts) {
        opts = opts || {};
        const init = { credentials: 'include' };
        Object.keys(opts).forEach(k => { init[k] = opts[k]; });
        return fetch(path, init).then(async r => {
          let d = null;
          try { d = await r.json(); } catch (_) {}
          if (!r.ok || !d || d.ok === false) throw new Error((d && (d.error || d.message)) || ('HTTP ' + r.status));
          return d;
        });
      },

      _v215IsRoot(path) { return /^\/\d+:\/?$/.test(String(path || '')); },

      _v215FolderName(path) {
        try {
          const parts = String(path || '').split('/').filter(Boolean);
          const last = parts[parts.length - 1] || 'Curso';
          return decodeURIComponent(last);
        } catch (_) { return String(path || 'Curso'); }
      },

      // ★ v2.15.2 (H): data do assistente — digitar dd/mm/aaaa e enviar ISO
      //   (o input type="date" não aceitava digitação direta).
      _v215ParseDateBR(str) {
        const s = String(str || '').trim();
        if (!s) return '';
        const mIso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (mIso) return s;
        const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (!m) return '';
        const dd = parseInt(m[1], 10), mm = parseInt(m[2], 10), yy = parseInt(m[3], 10);
        if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yy < 1900 || yy > 2100) return '';
        const dt = new Date(yy, mm - 1, dd);
        if (dt.getFullYear() !== yy || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) return '';
        return yy + '-' + String(mm).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
      },

      _v215FormatDateBR(iso) {
        const s = String(iso || '').trim();
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return s;
        return m[3] + '/' + m[2] + '/' + m[1];
      },

      // ── Item 6: botão "▶ Continuar" para sessões do plano com lessonPath ──
      _v215PlayBtnHtml(s, concursoId) {
        if (!s || !s.lessonPath) return '';
        const watched = s.lessonWatched ? ' <span style="color:#3fb950;font-size:11px;">✓ Assistida</span>' : '';
        return ' <button class="meggy-header-btn v215-play-btn" data-v215-lesson="' + encodeURIComponent(s.lessonPath) + '" data-v215-name="' + encodeURIComponent(s.lessonName || s.topico || '') + '" data-v215-concurso="' + Shell.views._esc(concursoId || '') + '" style="font-size:11px;padding:3px 8px;background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;border:none;">▶ Continuar</button>' + watched;
      },

      _v215WirePlayButtons(root, concursoId) {
        if (!root) return;
        root.querySelectorAll('.v215-play-btn').forEach(btn => {
          btn.onclick = (e) => {
            if (e) e.stopPropagation();
            const lp = btn.dataset.v215Lesson || '';
            const nm = btn.dataset.v215Name || '';
            const cid = btn.dataset.v215Concurso || concursoId || '';
            Shell.views._v215PlayLesson(decodeURIComponent(lp), decodeURIComponent(nm), cid);
          };
        });
      },

      // ★ v2.15.5 (item 3): pasta de origem de uma aula vinculada — o
      //   penúltimo segmento do lesson_path, decodificado. Fallback no cliente
      //   p/ payloads antigos (sem folder/displayName do servidor).
      _v215LessonFolder(lessonPath) {
        const segs = String(lessonPath || '').split('/').filter(Boolean);
        if (segs.length < 3) return '';
        let raw = segs[segs.length - 2] || '';
        try { raw = decodeURIComponent(raw); } catch (_) {}
        return raw;
      },

      _v215LessonDisplayName(l) {
        if (!l) return '';
        if (l.displayName) return l.displayName;
        const folder = l.folder || Shell.views._v215LessonFolder(l.path || '');
        const name = String(l.name || '').trim();
        if (!folder) return name;
        if (!name) return folder;
        if (name === folder) return name;
        return folder + ' — ' + name;
      },

      // Resolve lesson_path (ex.: /1:/TJSP/Dir/Aula 03.mp4) para o link de
      // stream, listando a pasta-pai via gdiListAllFiles e achando o arquivo
      // pelo nome. _playVideoInline recebe URL de stream, não lesson_path.
      async _v215ResolveLesson(lessonPath, lessonName) {
        if (!window.gdiListAllFiles) return null;
        let decoded = lessonPath || '';
        try { decoded = decodeURIComponent(decoded); } catch (_) {}
        const parts = decoded.split('/').filter(Boolean);
        if (parts.length < 2) return null;
        const targetName = parts[parts.length - 1];
        const parentPath = '/' + parts.slice(0, -1).join('/') + '/';
        const files = await window.gdiListAllFiles(parentPath, '');
        if (!files || !files.length) return null;
        const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        let match = files.find(f => f.name === targetName);
        if (!match && norm(targetName)) match = files.find(f => norm(f.name) === norm(targetName));
        if (!match) return null;
        const isVideo = f => (f.mimeType || '').startsWith('video/') || /\.mp4$/i.test(f.name || '') || /\.(mp3|m4a|wav|ogg|aac)$/i.test(f.name || '');
        if (!isVideo(match)) return { file: match, parentPath: parentPath, notPlayable: true };
        const videos = files.filter(isVideo);
        const playlist = videos.map(v => ({ link: v.link || '', name: v.name, size: v.size ? (v.size / 1024 / 1024).toFixed(1) + ' MB' : '', folder: '' }));
        const idx = playlist.findIndex(v => v.name === match.name);
        return { file: match, parentPath: parentPath, link: match.link || '', name: match.name, playlist: playlist, index: idx < 0 ? 0 : idx };
      },

      async _v215PlayLesson(lessonPath, lessonName, concursoId) {
        if (concursoId) Shell.__v215ConcursoId = concursoId;
        if (!lessonPath) { Shell.views._v215Err('Aula sem caminho', 'Esta sessão do plano não tem uma aula vinculada.'); return; }
        try {
          const r = await Shell.views._v215ResolveLesson(lessonPath, lessonName);
          if (!r) { Shell.views._v215Err('Não foi possível abrir a aula', 'A aula "' + (lessonName || lessonPath) + '" não foi encontrada na pasta do Drive. Ela pode ter sido movida ou renomeada.'); return; }
          if (r.notPlayable) {
            let go = false;
            try { go = await window.gdiModal({ title: 'Aula em PDF/arquivo', message: 'Esta aula é um arquivo (' + (r.file.name || '') + '), não um vídeo. Deseja abrir a pasta dela?', confirmText: 'Abrir pasta', cancelText: 'Fechar' }); } catch (_) {}
            if (go) Shell.views._renderDrives(r.parentPath);
            return;
          }
          if (!r.link) { Shell.views._v215Err('Não foi possível abrir a aula', 'A aula foi encontrada, mas não tem link de stream.'); return; }
          Shell.views._playVideoInline(r.link, r.name, r.playlist, r.index);
        } catch (e) {
          Shell.views._v215Err('Não foi possível abrir a aula', e.message || 'Erro ao buscar a aula no Drive.');
        }
      },

      // ── Item 2: seção "📁 Módulos (pastas)" no detalhe do concurso ──
      async _v215RenderSources(el, concursoId, data) {
        const box = el.querySelector ? el.querySelector('#v215-sources') : document.getElementById('v215-sources');
        if (!box) return;
        box.innerHTML = '<div style="font-size:13px;color:#9aa4b8;padding:8px 0;">📁 <b style="color:#e6edf3;">Módulos (pastas)</b> · carregando…</div>';
        let sources = (data && data.sources) || null;
        try {
          if (!sources) { const d = await Shell.views._v215Api('/api/concursos/' + encodeURIComponent(concursoId) + '/sources'); sources = d.sources || []; }
        } catch (e) {
          box.innerHTML = '<div style="font-size:13px;color:#ff8b9f;">📁 <b>Módulos (pastas)</b> — não foi possível carregar: ' + Shell.views._esc(e.message) + '</div>';
          return;
        }
        let h = '<div style="font-size:14px;font-weight:600;color:#e6edf3;margin-bottom:8px;">📁 Módulos (pastas)' + (sources.length ? ' <span style="color:#9aa4b8;font-weight:400;font-size:12px;">(' + sources.length + ')</span>' : '') + '</div>';
        if (!sources.length) {
          h += '<div style="padding:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;font-size:13px;color:#9aa4b8;">Nenhuma pasta anexada ainda. Em “Adicionar Pasta de Curso”, use “＋ Adicionar esta pasta ao curso” para montar este concurso com várias pastas.</div>';
        } else {
          sources.forEach((s, i) => {
            const m = s.materials || {};
            const discs = (s.disciplinas || []).map(dn => '<span style="background:rgba(93,222,218,0.12);color:#5ddeda;padding:2px 8px;border-radius:999px;font-size:11px;">' + Shell.views._esc(dn) + '</span>').join(' ');
            h += '<div class="v215-source" data-sid="' + s.id + '" style="padding:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;margin-bottom:8px;">' +
              '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
                '<span style="font-size:16px;">📁</span>' +
                '<span style="font-weight:600;color:#e6edf3;flex:1;min-width:120px;">' + Shell.views._esc(s.name || Shell.views._v215FolderName(s.coursePath)) + (s.intensivo ? ' <span style="color:#ffd43b;font-size:11px;">⚡ intensivo</span>' : '') + '</span>' +
                '<span style="color:#8b949e;font-size:12px;">' + (s.lessonCount || 0) + ' aulas</span>' +
              '</div>' +
              '<div style="font-size:11px;color:#8b949e;margin-top:4px;word-break:break-all;">' + Shell.views._esc(s.coursePath || '') + '</div>' +
              '<div style="font-size:12px;color:#9aa4b8;margin-top:4px;">📝 ' + (m.resumos || 0) + ' resumos · 🃏 ' + (m.flashcards || 0) + ' flashcards · ❓ ' + (m.questoes || 0) + ' questões</div>' +
              (discs ? '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">' + discs + '</div>' : '') +
              '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">' +
                '<button class="meggy-header-btn v215-src-up" data-i="' + i + '" style="font-size:12px;" ' + (i === 0 ? 'disabled' : '') + '>↑</button>' +
                '<button class="meggy-header-btn v215-src-down" data-i="' + i + '" style="font-size:12px;" ' + (i === sources.length - 1 ? 'disabled' : '') + '>↓</button>' +
                '<button class="meggy-header-btn v215-src-rename" data-i="' + i + '" style="font-size:12px;">✏️ Renomear</button>' +
                '<button class="meggy-header-btn v215-src-intensivo" data-i="' + i + '" style="font-size:12px;' + (s.intensivo ? 'background:rgba(255,212,59,0.15);color:#ffd43b;border:1px solid rgba(255,212,59,0.35);' : '') + '">⚡ Intensivo</button>' +
                '<button class="meggy-header-btn v215-src-gen" data-i="' + i + '" style="font-size:12px;">🐩 Gerar resumo + flashcards deste módulo</button>' +
                '<button class="meggy-header-btn v215-src-tts" data-i="' + i + '" style="font-size:12px;">▶ Ouvir resumo do módulo</button>' +
                '<button class="meggy-header-btn v215-src-quiz" data-i="' + i + '" style="font-size:12px;">🧠 Quiz deste módulo</button>' +
                '<button class="meggy-header-btn v215-src-del" data-i="' + i + '" style="font-size:12px;background:rgba(255,107,107,.12);color:#ff8b8b;border:1px solid rgba(255,107,107,.35);">🗑️ Remover</button>' +
              '</div></div>';
          });
        }
        box.innerHTML = h;
        // ★ v2.15.4 ITEM D: Ouvir resumo do módulo — voz natural.
        // Guarda se o módulo não carregou: toast, nunca erro silencioso.
        box.querySelectorAll('.v215-src-tts').forEach(btn => {
          btn.onclick = () => {
            const s = sources[parseInt(btn.dataset.i, 10)];
            if (!s) return;
            if (window.gdiTTS && typeof window.gdiTTS.playModuleSummary === 'function') {
              btn.disabled = true;
              window.gdiTTS.playModuleSummary(s.name || '', s.coursePath || '').finally(function () { btn.disabled = false; });
            } else if (typeof window.showToast === 'function') window.showToast('Módulo de voz ainda não carregou. Recarregue a página.');
          };
        });
        const base = '/api/concursos/' + encodeURIComponent(concursoId) + '/sources';
        const refreshSources = () => Shell.views._v215RenderSources(el, concursoId, null);
        const reloadDetail = () => { const main = document.getElementById('meggy-main'); if (main) Shell.views.concursoDetail(main, concursoId); };
        box.querySelectorAll('.v215-src-up, .v215-src-down').forEach(btn => {
          btn.onclick = async () => {
            const i = parseInt(btn.dataset.i, 10);
            const j = btn.classList.contains('v215-src-up') ? i - 1 : i + 1;
            if (j < 0 || j >= sources.length) return;
            const order = sources.map(s => s.id);
            const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
            try { await Shell.views._v215Api(base + '/reorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: order }) }); refreshSources(); }
            catch (e) { Shell.views._v215Err('Não foi possível reordenar', e.message); }
          };
        });
        box.querySelectorAll('.v215-src-rename').forEach(btn => {
          btn.onclick = async () => {
            const s = sources[parseInt(btn.dataset.i, 10)];
            if (!s) return;
            let name = null;
            try { name = await window.gdiModal({ title: 'Renomear módulo', message: 'Novo nome do módulo:', input: { value: s.name || '', placeholder: 'Nome do módulo' }, confirmText: 'Salvar', cancelText: 'Cancelar' }); } catch (_) { return; }
            if (!name) return;
            try { await Shell.views._v215Api(base + '/' + encodeURIComponent(s.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name }) }); refreshSources(); }
            catch (e) { Shell.views._v215Err('Não foi possível renomear', e.message); }
          };
        });
        box.querySelectorAll('.v215-src-intensivo').forEach(btn => {
          btn.onclick = async () => {
            const s = sources[parseInt(btn.dataset.i, 10)];
            if (!s) return;
            try { await Shell.views._v215Api(base + '/' + encodeURIComponent(s.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ intensivo: !s.intensivo }) }); reloadDetail(); }
            catch (e) { Shell.views._v215Err('Não foi possível alterar o intensivo', e.message); }
          };
        });
        box.querySelectorAll('.v215-src-del').forEach(btn => {
          btn.onclick = async () => {
            const s = sources[parseInt(btn.dataset.i, 10)];
            if (!s) return;
            const ok = await Shell.views._v215Confirm('Remover módulo', 'Remover "' + (s.name || s.coursePath) + '" deste concurso? As aulas vinculadas a ele serão desvinculadas.', 'Remover');
            if (!ok) return;
            try {
              const d = await Shell.views._v215Api(base + '/' + encodeURIComponent(s.id), { method: 'DELETE' });
              Shell.views._v215Toast('🗑️ Módulo removido (' + (d.deletedLessons || 0) + ' aulas desvinculadas).');
              reloadDetail();
            } catch (e) { Shell.views._v215Err('Não foi possível remover o módulo', e.message); }
          };
        });
        box.querySelectorAll('.v215-src-gen').forEach(btn => {
          btn.onclick = () => {
            const s = sources[parseInt(btn.dataset.i, 10)];
            if (s) Shell.views._v215GenerateModuleMaterials(el, concursoId, s, btn);
          };
        });
        box.querySelectorAll('.v215-src-quiz').forEach(btn => {
          btn.onclick = () => {
            const s = sources[parseInt(btn.dataset.i, 10)];
            if (!s) return;
            const fn = window.__gdiStudy && window.__gdiStudy.courses && window.__gdiStudy.courses.startModuleQuiz;
            if (typeof fn === 'function') fn(s.name || Shell.views._v215FolderName(s.coursePath), s.coursePath, null, concursoId);
            else Shell.views._v215Err('Quiz indisponível', 'O módulo de cursos ainda não carregou. Abra a aba Meus Cursos uma vez e tente de novo.');
          };
        });
      },

      // ★ v2.15.2 (J): pinta a lista de sugestões (usado pelo fetch e
      //   pela restauração do cache — antes o HTML era duplicado inline).
      _v215PaintSuggestions(listEl, sug, el, concursoId) {
        if (!listEl) return;
        listEl.innerHTML = (sug || []).map(sg => '<div style="padding:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;margin-bottom:6px;">' +
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;"><span style="font-size:15px;">📁</span><b style="color:#e6edf3;flex:1;">' + Shell.views._esc(sg.name || Shell.views._v215FolderName(sg.path)) + '</b>' +
          (sg.confidence != null ? '<span style="font-size:11px;color:#5ddeda;">' + Math.round(sg.confidence * 100) + '%</span>' : '') +
          '<button class="meggy-header-btn v215-sug-add" data-path="' + Shell.views._esc(sg.path) + '" style="font-size:12px;background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;border:none;">＋ Anexar</button></div>' +
          '<div style="font-size:12px;color:#9aa4b8;margin-top:4px;">' + Shell.views._esc(sg.reason || '') + '</div>' +
          (sg.disciplina ? '<div style="font-size:11px;color:#8b949e;margin-top:2px;">Disciplina: ' + Shell.views._esc(sg.disciplina) + '</div>' : '') +
          '<div style="font-size:11px;color:#8b949e;word-break:break-all;">' + Shell.views._esc(sg.path) + '</div></div>').join('');
        listEl.querySelectorAll('.v215-sug-add').forEach(ab => { ab.onclick = () => Shell.views._v215AttachFlow([ab.dataset.path], el, { concursoId: concursoId }); });
      },

      // ── Item 4: sugestões da Meggy (pastas que completam o concurso) ──
      async _v215RenderSuggest(el, concursoId, data) {
        const box = el.querySelector ? el.querySelector('#v215-suggest') : document.getElementById('v215-suggest');
        if (!box) return;
        let banca = '';
        try {
          const pl = await Shell.views._v215Api('/api/plans/list?concursoId=' + encodeURIComponent(concursoId));
          const p0 = pl && pl.plans && pl.plans[0];
          if (p0 && p0.banca) banca = p0.banca;
        } catch (_) {}
        if (!banca) banca = 'Cebraspe';
        const opts = ['Cebraspe', 'FGV', 'FCC', 'Vunesp', 'IBFC'].map(b => '<option value="' + b + '"' + (b === banca ? ' selected' : '') + '>' + b + '</option>').join('');
        box.innerHTML = '<div style="font-size:14px;font-weight:600;color:#e6edf3;margin-bottom:4px;">🐩 Sugestões da Meggy</div>' +
          '<div style="font-size:12px;color:#9aa4b8;margin-bottom:8px;">Com base no edital e na banca, a Meggy sugere pastas que completam as disciplinas do concurso.</div>' +
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px;"><select id="v215-suggest-banca" style="padding:8px 10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#e6edf3;font-size:13px;">' + opts + '</select>' +
          '<button class="meggy-header-btn" id="v215-suggest-btn" style="font-size:13px;">🐩 Buscar sugestões</button></div>' +
          '<div id="v215-suggest-list" style="font-size:13px;color:#9aa4b8;">Clique em “Buscar sugestões” para ver as pastas recomendadas.</div>';
        const btn = box.querySelector('#v215-suggest-btn');
        if (!btn) return;
        // ★ v2.15.2 (J): restaura as sugestões salvas na hora e re-busca em
        //   2º plano ao abrir o detalhe (a lista não some após reload ou
        //   outras ações; a busca atualiza o cache).
        try {
          const cached = JSON.parse(localStorage.getItem('gdi-v215-suggestions-v1') || 'null');
          if (cached && String(cached.concursoId) === String(concursoId) && Array.isArray(cached.suggestions) && cached.suggestions.length) {
            const bancaSel = box.querySelector('#v215-suggest-banca');
            if (bancaSel && cached.banca) bancaSel.value = cached.banca;
            Shell.views._v215PaintSuggestions(box.querySelector('#v215-suggest-list'), cached.suggestions, el, concursoId);
          }
        } catch (_) {}
        setTimeout(() => {
          if (!document.body.contains(box)) return;
          const b2 = box.querySelector('#v215-suggest-btn');
          if (b2 && !b2.disabled) b2.click();
        }, 50);
        btn.onclick = async () => {
          const b = (box.querySelector('#v215-suggest-banca') || {}).value || 'Cebraspe';
          const list = box.querySelector('#v215-suggest-list');
          if (list) list.innerHTML = 'Buscando sugestões…';
          btn.disabled = true;
          try {
            const d = await Shell.views._v215Api('/api/concursos/' + encodeURIComponent(concursoId) + '/suggest-folders?banca=' + encodeURIComponent(b));
            const sug = d.suggestions || [];
            // ★ v2.15.2 (J): persistir por concurso (+ banca) — antes as
            //   sugestões viviam só em memória e sumiam após outras ações.
            try { localStorage.setItem('gdi-v215-suggestions-v1', JSON.stringify({ concursoId: String(concursoId), banca: b, suggestions: sug, at: Date.now() })); } catch (_) {}
            if (!sug.length) { if (list) list.innerHTML = 'Nenhuma sugestão para esta banca — as pastas prováveis já estão anexadas ou não foram encontradas.'; return; }
            Shell.views._v215PaintSuggestions(list, sug, el, concursoId);
          } catch (e) {
            if (list) list.innerHTML = 'Não foi possível buscar sugestões: ' + Shell.views._esc(e.message);
          } finally { btn.disabled = false; }
        };
      },

      // ── Item 8 (lista): "📝 Revisar erros" ──
      async _v215RenderErrors(el, concursoId) {
        const box = el.querySelector ? el.querySelector('#v215-errors') : document.getElementById('v215-errors');
        if (!box) return;
        box.innerHTML = '<div style="font-size:14px;font-weight:600;color:#e6edf3;margin-bottom:8px;">📝 Revisar erros</div><div style="font-size:13px;color:#9aa4b8;">Carregando…</div>';
        let errors = [];
        try {
          const d = await Shell.views._v215Api('/api/concursos/' + encodeURIComponent(concursoId) + '/errors');
          errors = d.errors || [];
        } catch (e) {
          box.innerHTML = '<div style="font-size:14px;font-weight:600;color:#e6edf3;margin-bottom:8px;">📝 Revisar erros</div><div style="font-size:13px;color:#ff8b9f;">Não foi possível carregar os erros: ' + Shell.views._esc(e.message) + '</div>';
          return;
        }
        let h = '<div style="font-size:14px;font-weight:600;color:#e6edf3;margin-bottom:4px;">📝 Revisar erros' + (errors.length ? ' <span style="color:#9aa4b8;font-weight:400;font-size:12px;">(' + errors.length + ')</span>' : '') + '</div>';
        h += '<div style="font-size:12px;color:#9aa4b8;margin-bottom:8px;">Erros das questões respondidas neste concurso. Revise e remova os que já dominou.</div>';
        if (!errors.length) {
          h += '<div style="padding:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;font-size:13px;color:#9aa4b8;">Nenhum erro registrado ainda. Ao errar uma questão de uma aula aberta pelo plano deste concurso, ela aparece aqui.</div>';
        } else {
          errors.forEach(er => {
            h += '<div style="padding:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;margin-bottom:8px;">' +
              '<div style="font-size:13px;color:#e6edf3;font-weight:600;">' + Shell.views._esc(er.pergunta || '') + '</div>' +
              '<div style="font-size:12px;color:#5ddeda;margin-top:4px;">✓ Resposta certa: ' + Shell.views._esc(er.respostaCerta || er.resposta_certa || '') + '</div>' +
              '<div style="font-size:12px;color:#ff8b9f;">✗ Sua resposta: ' + Shell.views._esc(er.respostaAluno || er.resposta_aluno || '') + '</div>' +
              (er.modulo ? '<div style="font-size:11px;color:#8b949e;margin-top:2px;">Módulo: ' + Shell.views._esc(er.modulo) + '</div>' : '') +
              '<div style="margin-top:8px;"><button class="meggy-header-btn v215-err-del" data-id="' + er.id + '" style="font-size:12px;">🗑️ Remover após revisar</button></div></div>';
          });
        }
        box.innerHTML = h;
        box.querySelectorAll('.v215-err-del').forEach(btn => {
          btn.onclick = async () => {
            const ok = await Shell.views._v215Confirm('Remover erro', 'Remover este erro da lista de revisão?', 'Remover');
            if (!ok) return;
            try {
              await Shell.views._v215Api('/api/concursos/' + encodeURIComponent(concursoId) + '/errors/' + encodeURIComponent(btn.dataset.id), { method: 'DELETE' });
              Shell.views._v215Toast('Erro removido da revisão.');
              Shell.views._v215RenderErrors(el, concursoId);
            } catch (e) { Shell.views._v215Err('Não foi possível remover o erro', e.message); }
          };
        });
      },

      // ── Itens 1 + 3: fluxo de anexo com escolha de destino + prévia ──
      _v215AttachFlow(folderPaths, parentEl, opts) {
        opts = opts || {};
        const paths = (folderPaths || []).filter(p => p);
        if (!paths.length) return;
        const roots = paths.filter(p => Shell.views._v215IsRoot(p));
        if (roots.length) { Shell.views._v215Err('Pasta inválida', 'Não é possível anexar a raiz de um drive (' + roots.join(', ') + '). Escolha uma pasta dentro do drive.'); return; }
        Shell.views._v215ShowAttachModal(paths, parentEl, opts);
      },

      _v215ShowAttachModal(folderPaths, parentEl, opts) {
        opts = opts || {};
        let modal = document.getElementById('v215-attach-modal');
        if (modal) modal.remove();
        modal = document.createElement('div');
        modal.id = 'v215-attach-modal';
        modal.className = 'meggy-modal-overlay';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:10002;padding:20px;';
        const close = () => { if (modal && modal.parentNode) modal.parentNode.removeChild(modal); };
        const hideAddCourseModal = () => { const m = document.getElementById('meggy-add-course-modal'); if (m) m.style.display = 'none'; };
        const finishToDetail = (concursoId) => {
          close(); hideAddCourseModal();
          const main = document.getElementById('meggy-main');
          if (main && concursoId) Shell.views.concursoDetail(main, concursoId);
          else if (parentEl) Shell.views.cursos(parentEl);
        };
        let concursosCache = [];

        async function doAvulso() {
          const nb = document.getElementById('v215a-next');
          if (nb) { nb.disabled = true; nb.textContent = 'Criando…'; }
          let created = 0;
          const fails = [];
          for (const p of folderPaths) {
            try {
              await Shell.views._v215Api('/api/courses/add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coursePath: p, courseName: Shell.views._v215FolderName(p), icon: '📚', color: '#ff8b9f' }) });
              created++;
              try { if (window.gdiCourseScanner && typeof window.gdiCourseScanner.startScan === 'function') window.gdiCourseScanner.startScan(p, null); } catch (_) {}
            } catch (e) { fails.push(p); }
          }
          close(); hideAddCourseModal();
          if (created) Shell.views._v215Toast('✅ ' + created + ' curso(s) adicionado(s).' + (fails.length ? ' ' + fails.length + ' falharam.' : ''));
          if (fails.length) Shell.views._v215Err('Não foi possível adicionar como curso', fails.length + ' pasta(s) não puderam ser adicionadas como curso avulso.');
          if (parentEl) Shell.views.cursos(parentEl);
        }

        async function renderPreview(concursoId) {
          const bodyEl = document.getElementById('v215a-body');
          const nextBtn = document.getElementById('v215a-next');
          if (bodyEl) bodyEl.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7488;font-size:12px;">Gerando prévia…</div>';
          if (nextBtn) { nextBtn.disabled = true; nextBtn.textContent = 'Gerando prévia…'; }
          let prev;
          try {
            prev = await Shell.views._v215PreviewPaged(concursoId, folderPaths);
          } catch (e) {
            Shell.views._v215Err('Não foi possível gerar a prévia', e.message);
            if (nextBtn) { nextBtn.disabled = false; nextBtn.textContent = 'Ver prévia →'; }
            return;
          }
          const conc = concursosCache.find(c => String(c.id) === String(concursoId)) || { id: concursoId, name: 'Concurso' };
          let bh = '<div style="font-size:13px;color:#e6edf3;margin-bottom:4px;">Prévia — anexar a <b>📌 ' + Shell.views._esc(conc.name) + '</b></div>';
          bh += '<div style="font-size:12px;color:#9aa4b8;margin-bottom:12px;">Confira antes de confirmar. Nada é anexado até você confirmar.</div>';
          (prev.folders || []).forEach(f => {
            // ★ v2.15.5 (item 2): a prévia mostra o total PROJETADO pós-anexo
            //   (já vinculadas + novas) — igual ao detalhe após confirmar.
            const hrs = (f.projectedHours != null ? f.projectedHours : (f.estHours != null ? f.estHours : Math.round(((f.estMinutes || 0) / 60) * 10) / 10));
            const fTotal = (f.projectedTotal != null ? f.projectedTotal : (f.lessons || 0));
            const fBreak = (f.alreadyLinked ? ' (' + f.alreadyLinked + ' já vinculadas · +' + (f.newMatched || 0) + ' novas)' : '');
            bh += '<div style="padding:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;margin-bottom:6px;">' +
              '<div style="font-size:13px;color:#e6edf3;font-weight:600;">📁 ' + Shell._esc(f.name || Shell.views._v215FolderName(f.path)) + '</div>' +
              '<div style="font-size:12px;color:#9aa4b8;margin-top:4px;">📄 ' + (f.pdfs || 0) + ' PDFs · 🎬 ' + (f.videos || 0) + ' vídeos' + (f.audios ? ' · 🎵 ' + f.audios + ' áudios' : '') + ' · ' + fTotal + ' aulas' + fBreak + ' · ~' + hrs + 'h estimadas</div></div>';
          });
          const perFolderDups = (prev.folders || []).flatMap(f => (f.duplicates || []).map(dd => ({ name: dd.name, folders: dd.inFolders || dd.folders || [], alreadyInConcurso: dd.alreadyInConcurso })));
          const allDups = (prev.duplicates || []).concat(perFolderDups);
          if (allDups.length) {
            bh += '<div style="padding:10px;background:rgba(255,212,59,0.06);border:1px solid rgba(255,212,59,0.25);border-radius:8px;font-size:12px;color:#ffd43b;margin-bottom:8px;">⚠️ Aulas duplicadas:<br>' + allDups.map(dd => '• ' + Shell.views._esc(dd.name) + (dd.alreadyInConcurso ? ' — já vinculada a este concurso' : ' — aparece em ' + (dd.folders || []).length + ' pastas')).join('<br>') + '</div>';
          }
          // ★ v2.15.2 (E): totais do servidor (antes vinham undefined);
          //   se ausentes, soma as pastas — nunca "0 aulas · ~h".
          const totL = (prev.projectedTotal != null ? prev.projectedTotal : (prev.totalLessons != null ? prev.totalLessons : (prev.folders || []).reduce((a, f) => a + (f.lessons || 0), 0)));
          const totH = (prev.projectedHours != null ? prev.projectedHours : (prev.totalHours != null ? prev.totalHours : Math.round(((prev.folders || []).reduce((a, f) => a + (f.estMinutes || 0), 0) / 60) * 10) / 10));
          bh += '<div style="font-size:13px;color:#e6edf3;">Total: <b>' + totL + ' aulas</b> · ~' + totH + 'h' + (prev.totalMatched != null ? ' · ' + prev.totalMatched + ' vinculadas' : '') + (prev.totalFound != null ? ' · ' + prev.totalFound + ' arquivos' : '') + '</div>';
          if (bodyEl) bodyEl.innerHTML = bh;
          const footerEl = document.getElementById('v215a-footer');
          if (footerEl) {
            footerEl.innerHTML = '<button class="meggy-header-btn" id="v215a-back">← Voltar</button>' +
              '<button class="meggy-header-btn" id="v215a-confirm" style="background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;border:none;">Confirmar anexo</button>';
            document.getElementById('v215a-back').onclick = () => renderChoice();
            document.getElementById('v215a-confirm').onclick = async () => {
              const cbtn = document.getElementById('v215a-confirm');
              if (cbtn) { cbtn.disabled = true; cbtn.textContent = 'Anexando…'; }
              try {
                const d = await Shell.views._v215AttachPaged(concursoId, folderPaths);
                const sc = d.scanned || {};
                // ★ v2.15.2 (E): "vinculadas" = totalMatched, "encontradas" =
                //   totalFound — sem trocar os dois.
                const nVinculadas = (sc.totalMatched != null ? sc.totalMatched : (d.attached || []).length);
                const nEncontradas = (sc.totalFound != null ? sc.totalFound : nVinculadas);
                let msg = '✅ ' + nVinculadas + ' aulas vinculadas ao concurso “' + conc.name + '” (' + nEncontradas + ' encontradas).';
                if (d.skipped && d.skipped.length) msg += ' (' + d.skipped.length + ' pasta(s) já estavam anexadas.)';
                Shell.views._v215Toast(msg);
                finishToDetail(concursoId);
              } catch (e) {
                Shell.views._v215Err('Não foi possível anexar', e.message);
                if (cbtn) { cbtn.disabled = false; cbtn.textContent = 'Confirmar anexo'; }
              }
            };
          }
        }

        async function renderChoice() {
          modal.innerHTML =
            '<div class="meggy-modal-content" style="max-width:560px;width:100%;max-height:90vh;overflow-y:auto;background:#161b22;border:1px solid rgba(255,255,255,0.08);border-radius:14px;">' +
              '<div class="meggy-modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.06);">' +
                '<div class="meggy-modal-title" style="font-size:15px;font-weight:600;color:#e6edf3;">＋ Adicionar pasta ao curso</div>' +
                '<button id="v215a-x" style="background:none;border:none;color:#9aa4b8;font-size:22px;cursor:pointer;line-height:1;padding:0 4px;">×</button>' +
              '</div>' +
              '<div id="v215a-body" style="padding:16px;"><div style="padding:20px;text-align:center;color:#6b7488;font-size:12px;">Carregando concursos…</div></div>' +
              '<div id="v215a-footer" style="padding:12px 16px;border-top:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;gap:8px;">' +
                '<button class="meggy-header-btn" id="v215a-cancel">Cancelar</button>' +
                '<button class="meggy-header-btn" id="v215a-next" style="background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;border:none;" disabled>Ver prévia →</button>' +
              '</div>' +
            '</div>';
          document.getElementById('v215a-x').onclick = close;
          document.getElementById('v215a-cancel').onclick = close;
          try {
            const d = await Shell.views._v215Api('/api/concursos/list');
            concursosCache = d.concursos || [];
          } catch (e) {
            const bodyEl = document.getElementById('v215a-body');
            if (bodyEl) bodyEl.innerHTML = '<div style="color:#ff6b6b;font-size:13px;">Não foi possível carregar seus concursos: ' + Shell.views._esc(e.message) + '</div>';
            return;
          }
          if (opts.concursoId) { renderPreview(opts.concursoId); return; }
          const bodyEl = document.getElementById('v215a-body');
          const nextBtn = document.getElementById('v215a-next');
          let mode = concursosCache.length ? 'concurso' : 'avulso';
          let selId = concursosCache.length ? concursosCache[0].id : null;
          let bh = '<div style="font-size:13px;color:#9aa4b8;margin-bottom:12px;">Pastas (' + folderPaths.length + '):</div>';
          folderPaths.forEach(p => { bh += '<div style="padding:6px 10px;background:rgba(255,255,255,0.03);border-radius:6px;font-size:12px;color:#e6edf3;margin-bottom:4px;word-break:break-all;">📁 ' + Shell.views._esc(Shell.views._v215FolderName(p)) + ' <span style="color:#8b949e;">(' + Shell.views._esc(p) + ')</span></div>'; });
          bh += '<div style="margin-top:12px;font-size:13px;color:#e6edf3;font-weight:600;margin-bottom:6px;">Onde adicionar?</div>';
          bh += '<label style="display:flex;gap:8px;align-items:flex-start;padding:10px;border:1px solid rgba(255,255,255,0.1);border-radius:8px;margin-bottom:8px;cursor:pointer;"><input type="radio" name="v215a-mode" value="avulso" style="margin-top:3px;" /> <span><b style="color:#e6edf3;">📚 Criar como curso avulso</b><br><span style="font-size:12px;color:#9aa4b8;">Comportamento atual — cada pasta vira um curso separado na área do aluno.</span></span></label>';
          if (concursosCache.length) {
            bh += '<div style="font-size:12px;color:#9aa4b8;margin-bottom:6px;">Ou anexar a um concurso existente (as pastas viram módulos):</div>';
            concursosCache.forEach(c => { bh += '<label style="display:flex;gap:8px;align-items:center;padding:10px;border:1px solid rgba(255,255,255,0.1);border-radius:8px;margin-bottom:6px;cursor:pointer;"><input type="radio" name="v215a-mode" value="concurso:' + c.id + '" style="margin-top:0;" /> <span style="flex:1;"><b style="color:#e6edf3;">📌 ' + Shell.views._esc(c.name) + '</b> <span style="font-size:12px;color:#8b949e;">' + (c.lessonCount || 0) + ' aulas</span></span></label>'; });
          } else {
            bh += '<div style="font-size:12px;color:#9aa4b8;">Você ainda não tem concursos — crie um em “Meus Cursos” para anexar pastas como módulos.</div>';
          }
          if (bodyEl) bodyEl.innerHTML = bh;
          const syncNext = () => {
            if (!nextBtn) return;
            nextBtn.disabled = false;
            nextBtn.textContent = mode === 'avulso' ? 'Criar curso avulso' : 'Ver prévia →';
          };
          modal.querySelectorAll('input[name="v215a-mode"]').forEach(radio => {
            if (mode === 'concurso' && radio.value === 'concurso:' + selId) radio.checked = true;
            if (mode === 'avulso' && radio.value === 'avulso') radio.checked = true;
            radio.onchange = () => {
              if (radio.value === 'avulso') { mode = 'avulso'; selId = null; }
              else { mode = 'concurso'; selId = radio.value.slice('concurso:'.length); }
              syncNext();
            };
          });
          syncNext();
          if (nextBtn) nextBtn.onclick = async () => {
            if (mode === 'avulso') { await doAvulso(); return; }
            if (selId) renderPreview(selId);
          };
        }

        document.body.appendChild(modal);
        renderChoice();
      },

      // ★ v2.15.3 (item 3): UMA única descoberta de PDFs — delega para
      //   listModulePdfs (study-courses.js), que tenta primeiro o cache do
      //   scanner (getCourseLessons) e só depois lista o Drive (BFS,
      //   profundidade 3, ≤40 listagens, ≤20 PDFs). A BFS própria do shell
      //   foi mantida SÓ como fallback p/ quando o módulo de cursos ainda
      //   não carregou — no caminho normal os dois fluxos (resumo e quiz)
      //   usam a mesma implementação e concordam.
      async _v215ListModulePdfsRecursive(coursePath, maxPdfs) {
        try {
          const mod = window.__gdiStudy && window.__gdiStudy.courses;
          if (mod && typeof mod.listModulePdfs === 'function') {
            const list = await mod.listModulePdfs(coursePath, coursePath, maxPdfs || 20);
            return Array.isArray(list) ? list.slice(0, maxPdfs || 20) : [];
          }
        } catch (_) {}
        const MAX_PDFS = maxPdfs || 20;
        const MAX_LISTINGS = 40;
        const MAX_DEPTH = 3;
        const out = [];
        const seen = new Set();
        if (!window.gdiListAllFiles || !coursePath) return out;
        const base = coursePath.endsWith('/') ? coursePath : coursePath + '/';
        const queue = [{ path: base, depth: 0 }];
        let listings = 0;
        const pushPdf = (name, url, link) => {
          const u = String(url || '');
          if (!u) return;
          let dec = u;
          try { dec = decodeURIComponent(u); } catch (_) {}
          if (!/\.pdf$/i.test(dec)) return;
          const k = dec.toLowerCase();
          if (seen.has(k)) return;
          seen.add(k);
          out.push({ name: name || dec.split('/').filter(Boolean).pop() || 'PDF', url: u, link: link || '' });
        };
        while (queue.length && out.length < MAX_PDFS && listings < MAX_LISTINGS) {
          const cur = queue.shift();
          let files = [];
          try { files = await window.gdiListAllFiles(cur.path, ''); } catch (_) { continue; }
          listings++;
          for (const f of (files || [])) {
            if (!f) continue;
            const isF = f.mimeType === 'application/vnd.google-apps.folder' || f.type === 'folder' || f.dir === true || (f.mimeType && String(f.mimeType).includes('folder'));
            if (isF) {
              if (cur.depth < MAX_DEPTH) {
                const p = f.path || (cur.path + encodeURIComponent(f.name || ''));
                queue.push({ path: p.endsWith('/') ? p : p + '/', depth: cur.depth + 1 });
              }
              continue;
            }
            const nm = f.name || f.title || '';
            if (/\.pdf$/i.test(nm)) pushPdf(nm, f.path || f.url || (cur.path + encodeURIComponent(nm)), f.link || '');
          }
        }
        return out.slice(0, MAX_PDFS);
      },
      // ── Item 7: resumo + flashcards por módulo ──
      // generateAll (meggy-cache.js) é chaveado por U.lessonKey(), derivado
      // de window.location.pathname (página da aula) — não dá para rodar por
      // pasta fora da aula sem refatoração grande. Caminho usado: o batalhão
      // em segundo plano (startBattalion, como study-courses já faz ao
      // adicionar curso), que gera resumo + questões no servidor; os
      // flashcards são criados a partir das questões quando o material é
      // carregado (autoCreateFlashcards).
      // ★ v2.15.3 (item 3) — CORREÇÃO de comentário falso: as contagens do
      //   módulo (materials do GET sources) NÃO refletem o que o batalhão
      //   gravou. O batalhão grava no cache ISA no Drive + nos arquivos de
      //   resumos compartilhados e nunca escreve materials_meta (0 linhas
      //   no D1); materials_meta só é escrita por /api/materials/save-in-
      //   folder. Por isso os contadores ficavam 0/0/0 mesmo com o batalhão
      //   "concluído". A UI agora dá poll em getBattalionStatus e mostra o
      //   progresso/erro real em vez de confiar nos contadores.
      // ★ v2.15.3 (item 3): extrai o texto dos PDFs NO CLIENTE antes do
      //   POST ao batalhão, com o motor de PDF existente (extractPdfText,
      //   pdf.js, até 30 págs / 50K chars, teto interno de 60s). O servidor
      //   pula todo PDF sem pdf.text — sem isto o batalhão marcava
      //   battalionDone=true com 0 gerações e envenenava os retries.
      //   Devolve [{name, url, text, no_text}] — text só quando >=50 chars;
      //   sem texto, text:'' + no_text:true (nunca finge que tem texto).
      //   Extrai em lotes de 5 em paralelo (mesmo padrão do anexo manual
      //   em study-courses.js); cada falha é isolada (não aborta os outros).
      async _v215ExtractPdfTexts(pdfs, onProgress) {
        const list = (pdfs || []).map(p => ({ name: p.name || '', url: p.url || p.link || '', link: p.link || '', text: '', no_text: true, noTextReason: '' }));
        const extract = (window.gdiIsaPdf && window.gdiIsaPdf.extractPdfText) || (window.__gdiMeggy && window.__gdiMeggy.pdf && window.__gdiMeggy.pdf.extractPdfText);
        if (!extract) { list.forEach(p => { p.noTextReason = 'extrator de PDF indisponível'; }); return list; }
        const PARALLEL = 5;
        for (let i = 0; i < list.length; i += PARALLEL) {
          const chunk = list.slice(i, i + PARALLEL);
          await Promise.allSettled(chunk.map(async p => {
            const fetchUrl = p.url || p.link;
            if (!fetchUrl) { p.noTextReason = 'sem URL para baixar'; return; }
            try {
              const txt = await extract(fetchUrl, function (prog) { try { if (typeof onProgress === 'function') onProgress(p, prog); } catch (_) {} });
              const t = String(txt || '').trim();
              if (t.length >= 50) { p.text = t.slice(0, 15000); p.no_text = false; }
              else { p.noTextReason = 'texto extraível curto (' + t.length + ' chars)'; }
            } catch (e) { p.noTextReason = (e && e.message) ? String(e.message).split('\n')[0].slice(0, 160) : 'falha na extração'; }
          }));
        }
        return list;
      },

      // ★ v2.15.3 (item 3): dá poll em getBattalionStatus e mostra o
      //   progresso/erro REAL do job ({jobId, total, processed, skipped,
      //   done}) numa linha de status dentro de #v215-sources — antes só
      //   havia um setTimeout cego de 30s que re-renderizava as fontes e
      //   os contadores 0/0/0 nunca saíam do zero. Ao concluir, re-renderiza
      //   as fontes (contagens atualizadas). opts: {intervalMs, maxPolls,
      //   clientSkipped:[{name, reason}]} — pulados do cliente (PDFs sem
      //   texto, que nem foram enviados ao servidor) p/ o resumo final.
      // ── v2.15.6 (P9/PROVA EXTRA): helpers puros da descrição/resumo ──
      // _v215LessonNameIsGeneric: nome de arquivo genérico ("001 - aula",
      //   "video", "Aula 03") não descreve nada — nunca vira descrição.
      _v215LessonNameIsGeneric(name) {
        const base = String(name || '').replace(/\.[a-z0-9]+$/i, '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (!base) return true;
        if (/^\d+$/.test(base)) return true;
        if (/^\d+\s*[-–.]?\s*(aula|video|lesson|capitulo|parte|material)?$/.test(base)) return true;
        if (/^(aula|video|lesson|capitulo|parte|material)(\s+\d+)?$/.test(base)) return true;
        return false;
      },
      // _v215LessonDescHook: gancho fixo por aula (determinístico pelo
      //   nome — estável entre renders; é frase-modelo, não conteúdo
      //   inventado: o conteúdo vem sempre do resumo da Meggy).
      //   ★ v2.15.27-A: DEIXOU de ser usado na descrição sob o vídeo —
      //   o texto fixo era exibido ANTES do excerto do resumo guardado
      //   (Passo 25). Mantido p/ compatibilidade (harnesses antigos
      //   extraem-no); não voltar a prefixá-lo ao excerto.
      _v215LessonDescHook(lessonName) {
        const hooks = ['Nesta aula exploramos…', 'Vamos aprender…', 'Nesta aula você vai entender…', 'O foco desta aula é…', 'Prepare-se: nesta aula…'];
        let h = 0; const s = String(lessonName || '');
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
        return hooks[h % hooks.length];
      },
      // _v215BattalionSummaryHtml: o resumo HONESTO do fim do job —
      //   quantos PDFs geraram, quantos foram pulados e por quê, e o que
      //   fazer (OCR). Puro (só string in/out) p/ o harness testar.
      //   skipped: [{name, reason}] — reason 'no_text'/'generate_failed'
      //   ou o motivo real da extração (ex.: "pdf.js não conseguiu...").
      _v215BattalionSummaryHtml(processed, total, skipped) {
        const sk = Array.isArray(skipped) ? skipped : [];
        const esc = (Shell.views && Shell.views._esc) ? Shell.views._esc : (function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); });
        const friendlyReason = (r) => {
          const reason = String(r || '');
          if (!reason || reason === 'no_text') return 'sem texto extraível';
          if (reason === 'generate_failed') return 'a IA não conseguiu gerar';
          return reason;
        };
        const hasNoText = sk.some(function (s2) { const r = String((s2 && s2.reason) || ''); return r === 'no_text' || r.indexOf('pdf.js') >= 0 || r.indexOf('OCR') >= 0 || r.indexOf('sem texto') >= 0; });
        const ocrHint = hasNoText ? ' Os PDFs pulados não tinham texto extraível (são escaneados — só imagens) e o OCR por IA já tentou ler cada página; se a IA não conseguiu, confira se o PDF abre num leitor comum e toque em "Gerar resumo + flashcards" de novo.' : '';
        const list = sk.slice(0, 3).map(function (s2) { return esc(s2.name || '') + ': ' + esc(friendlyReason(s2.reason)); }).join('; ');
        const extra = sk.length > 3 ? ' (+ ' + (sk.length - 3) + ' outro(s))' : '';
        if ((processed || 0) > 0) {
          return '🐩 Materiais prontos: ' + processed + ' de ' + (total || processed) + ' PDF(s) processado(s)' + (sk.length ? ' · ' + sk.length + ' pulado(s): ' + list + extra + '.' + ocrHint : '.');
        }
        return '⚠️ A Meggy não gerou materiais deste módulo — nenhum dos ' + (total || sk.length || 0) + ' PDFs tinha texto para ler' + (sk.length ? ': ' + list + extra + '.' : '.') + ocrHint;
      },
      //   Devolve uma Promise que resolve no fim do poll (done ou teto).
      _v215PollBattalionStatus(el, concursoId, courseKey, opts) {
        opts = opts || {};
        const intervalMs = opts.intervalMs || 10000;
        const maxPolls = opts.maxPolls || 30;
        const box = el && el.querySelector ? el.querySelector('#v215-sources') : null;
        let statusEl = box ? box.querySelector('#v215-battalion-status') : null;
        const ensureStatusEl = () => {
          if (!box) return null;
          if (!statusEl) {
            statusEl = document.createElement('div');
            statusEl.id = 'v215-battalion-status';
            statusEl.style.cssText = 'font-size:12px;color:#9aa4b8;margin-bottom:8px;';
            if (box.prepend) box.prepend(statusEl);
            else if (box.insertBefore && box.firstChild) box.insertBefore(statusEl, box.firstChild);
          }
          return statusEl;
        };
        const renderStatus = (txt) => { const s = ensureStatusEl(); if (s) s.innerHTML = txt; };
        const getStatus = async () => {
          const isa = window.gdiIsaPdf || (window.__gdiMeggy && window.__gdiMeggy.summaries);
          if (isa && typeof isa.getBattalionStatus === 'function') return isa.getBattalionStatus(courseKey);
          const r = await fetch('/api/ai/battalion/status?courseKey=' + encodeURIComponent(courseKey), { cache: 'no-store', credentials: 'include' });
          return r.json();
        };
        let polls = 0;
        return new Promise((resolve) => {
          const clientSkipped = (opts && Array.isArray(opts.clientSkipped)) ? opts.clientSkipped : [];
          const tick = async () => {
            polls++;
            try {
              const st = await getStatus();
              // ★ v2.15.6 (P9): o status devolve um ENVELOPE
              //   {ok, processed, job} — total/processado/skipped/done
              //   vivem dentro de `job`, não no envelope. Antes o poll
              //   lia os campos no envelope (sempre undefined → total "?"
              //   — o "(0/? PDFs)" do Passo 10) e nunca via done=true
              //   quando o job terminava com 0 processados. `finished`
              //   (W1) é o fim REAL do job, com 0 ou mais processados.
              const job = (st && st.job && typeof st.job === 'object') ? st.job : st;
              const done = !!(job && (job.done === true || job.battalionDone === true));
              const finished = !!(job && job.finished === true);
              const total = (job && (job.total != null ? job.total : job.pdfsFound)) || 0;
              const processed = (job && typeof job.processed === 'number') ? job.processed : ((job && job.pdfsDone) || 0);
              const skipped = (job && Array.isArray(job.skipped)) ? job.skipped : [];
              // Mescla os pulados do cliente (PDFs sem texto, que nem
              // foram enviados ao servidor) com os do servidor, sem
              // duplicar por nome — o resumo final lista todos.
              const allSkipped = skipped.slice();
              clientSkipped.forEach(function (c) {
                if (c && c.name && !allSkipped.some(function (s2) { return (s2.name || '') === c.name; })) allSkipped.push(c);
              });
              if (done || finished) {
                renderStatus(Shell.views._v215BattalionSummaryHtml(processed, total, allSkipped));
                if (processed > 0) Shell.views._v215Toast('🐩 Resumo + flashcards prontos (' + processed + ' PDF(s)).');
                else Shell.views._v215Err('A Meggy não gerou materiais', 'Nenhum PDF processado — os motivos estão no status acima.');
                try { Shell.views._v215RenderSources(el, concursoId, null); } catch (_) {}
                resolve(st); return;
              }
              renderStatus(total > 0
                ? '🐩 A Meggy está gerando resumo + flashcards… (' + processed + '/' + total + ' PDFs)'
                : '🐩 A Meggy está enumerando os PDFs do módulo…');
            } catch (e) {
              renderStatus('🐩 Gerando resumo + flashcards… (não foi possível verificar o progresso)');
            }
            if (polls >= maxPolls) { renderStatus('🐩 Geração em segundo plano — as contagens aparecem aqui quando prontas.'); resolve(null); return; }
            setTimeout(tick, intervalMs);
          };
          tick();
        });
      },

      async _v215GenerateModuleMaterials(el, concursoId, source, btn) {
        if (btn) { btn.disabled = true; btn.textContent = '🐩 Gerando…'; }
        try {
          // ★ v2.15.2 (B): descoberta recursiva compartilhada com o quiz —
          //   os PDFs das subpastas "Aula NN" contam (a prévia já os contava).
          const pdfs = await Shell.views._v215ListModulePdfsRecursive(source.coursePath, 20);
          if (!pdfs.length) { Shell.views._v215Err('Sem PDFs neste módulo', 'Este módulo não tem PDFs para a Meggy ler (nem nas subpastas). Adicione PDFs à pasta e tente de novo.'); return; }
          // ★ v2.15.3 (item 3): extrai o texto NO CLIENTE antes do POST —
          //   o servidor pula todo PDF sem pdf.text e marcava o job como
          //   concluído com 0 gerações. Sem texto, o item vai com text:''
          //   + no_text:true (nunca como se tivesse texto).
          if (btn) btn.textContent = '🐩 Lendo PDFs (' + pdfs.length + ')…';
          const withText = await Shell.views._v215ExtractPdfTexts(pdfs, function (cur, prog) {
            if (!btn) return;
            const pg = (prog && prog.phase === 'ocr-page') ? ' — OCR pág. ' + (prog.page || '?') + '/' + (prog.total || '?') : '';
            btn.textContent = '🐩 Lendo ' + String(cur.name || '').slice(0, 24) + pg + '…';
          });
          const withTextCount = withText.filter(p => !p.no_text).length;
          const clientSkipped = withText.filter(function (p) { return p.no_text; }).map(function (p) { return { name: p.name, reason: p.noTextReason || 'sem texto extraível' }; });
          // ★ v2.15.6 (P9): sem NENHUM PDF com texto, NÃO posta ao
          //   batalhão e NÃO faz poll — o job terminaria com 0 depois de
          //   minutos de "(0/? PDFs)" (o OCR por IA, página a página e sem
          //   teto, já correu na extração acima e foi o que demorou). O
          //   resumo honesto (qual PDF, por quê, e o que fazer) aparece
          //   NA HORA, sem espera — o OCR em si NÃO foi limitado.
          if (!withTextCount) {
            const _box = el && el.querySelector ? el.querySelector('#v215-sources') : null;
            let _st = _box ? _box.querySelector('#v215-battalion-status') : null;
            if (_box && !_st) {
              _st = document.createElement('div');
              _st.id = 'v215-battalion-status';
              _st.style.cssText = 'font-size:12px;color:#9aa4b8;margin-bottom:8px;';
              if (_box.prepend) _box.prepend(_st);
            }
            if (_st) _st.innerHTML = Shell.views._v215BattalionSummaryHtml(0, pdfs.length, clientSkipped);
            Shell.views._v215Err('PDFs sem texto extraível', 'Os ' + pdfs.length + ' PDF(s) deste módulo são escaneados (só imagens) e nem o OCR por IA conseguiu extrair texto' + (clientSkipped.length ? ': ' + clientSkipped.slice(0, 3).map(function (p) { return p.name + ' — ' + p.reason; }).join('; ') : '') + '. Confira se os PDFs abrem num leitor comum e tente de novo — ou adicione PDFs com texto selecionável.');
            return;
          }
          // ★ v2.15.6 (P9): ao servidor vão SÓ os PDFs com texto — o
          //   total do job passa a ser o total REAL (antes o job contava
          //   também os sem texto, que o servidor pulava em silêncio, e
          //   o progresso nunca batia). Os sem texto já estão no resumo
          //   final via clientSkipped (abaixo, no poll).
          const pdfList = withText.filter(function (p) { return !p.no_text; }).map(p => ({ name: p.name, url: p.url || (p.link ? (String(p.link).startsWith('http') ? p.link : window.location.origin + p.link) : ''), text: p.text || '', no_text: false }));
          let ok = false;
          const isa = window.gdiIsaPdf || (window.__gdiMeggy && window.__gdiMeggy.summaries);
          if (isa && typeof isa.startBattalion === 'function') {
            try { ok = await isa.startBattalion(source.coursePath, source.coursePath, source.name || Shell.views._v215FolderName(source.coursePath), pdfList); } catch (_) { ok = false; }
          }
          if (!ok) {
            try {
              const r = await fetch('/api/ai/battalion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseKey: source.coursePath, coursePath: source.coursePath, lessonName: source.name || 'Módulo', pdfs: pdfList }) });
              const d = await r.json().catch(() => ({}));
              ok = !!(d && d.ok);
            } catch (_) { ok = false; }
          }
          if (!ok) { Shell.views._v215Err('Não foi possível iniciar a geração', 'O batalhão da Meggy não aceitou este módulo. Tente de novo em alguns minutos.'); return; }
          Shell.views._v215Toast('🐩 A Meggy está gerando resumo + flashcards deste módulo em segundo plano (' + withTextCount + ' de ' + pdfs.length + ' PDFs com texto' + (pdfs.length - withTextCount ? ', ' + (pdfs.length - withTextCount) + ' sem texto' : '') + ').');
          // ★ v2.15.3 (item 3): poll do status real em vez do setTimeout
          //   cego de 30s — mostra progresso/erro e re-renderiza ao concluir.
          try { Shell.views._v215PollBattalionStatus(el, concursoId, source.coursePath, { clientSkipped: clientSkipped }); } catch (_) { setTimeout(() => { try { const box = el.querySelector ? el.querySelector('#v215-sources') : null; if (box && document.body.contains(box)) Shell.views._v215RenderSources(el, concursoId, null); } catch (_) {} }, 30000); }
        } catch (e) {
          Shell.views._v215Err('Não foi possível gerar os materiais', e.message || 'Erro ao listar a pasta do módulo.');
        } finally {
          if (btn) { btn.disabled = false; btn.textContent = '🐩 Gerar resumo + flashcards deste módulo'; }
        }
      },
      // ★ v2.2: modal para colar o conteúdo programático depois da criação
      // ★ v2.8 Fase B: modal do plano — ver o plano dia a dia ou montar um novo
      showPlanModal(planId, concursoId, opts) {
        let modal = document.getElementById('plan-modal');
        if (modal) modal.remove();
        modal = document.createElement('div');
        modal.id = 'plan-modal';
        modal.className = 'meggy-modal-overlay';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:10002;padding:20px;';
        const close = () => { if (modal && modal.parentNode) modal.parentNode.removeChild(modal); };
        if (planId) {
          modal.innerHTML =
            '<div class="meggy-modal-content" style="max-width:640px;width:100%;max-height:90vh;overflow-y:auto;background:#161b22;border:1px solid rgba(255,255,255,0.08);border-radius:14px;">' +
              '<div class="meggy-modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.06);">' +
                '<div class="meggy-modal-title" style="font-size:15px;font-weight:600;color:#e6edf3;">🎯 Plano de estudo</div>' +
                '<button id="pm-x" style="background:none;border:none;color:#9aa4b8;font-size:22px;cursor:pointer;line-height:1;padding:0 4px;">×</button>' +
              '</div>' +
              '<div id="pm-body" style="padding:16px;"><div style="padding:20px;text-align:center;color:#6b7488;font-size:12px;">Carregando plano...</div></div>' +
            '</div>';
          document.body.appendChild(modal);
          document.getElementById('pm-x').onclick = close;
          fetch('/api/plans/' + encodeURIComponent(planId), { credentials: 'include' }).then(r => r.json()).then(d => {
            const bodyEl = document.getElementById('pm-body');
            if (!bodyEl) return;
            // ★ v2.15.7 (item 12): 404 "Plano não encontrado" = o plano
            //   não existe mais (foi apagado, ou apagado junto com o
            //   concurso) — a lista que o mostrava está desatualizada. A
            //   mensagem diz isso e o evento 'gdi-plan-missing' pede à
            //   /plano que re-leia a lista e pode o cartão. Outros erros
            //   mantêm a mensagem genérica de antes.
            if (!d || !d.ok || !d.plan) { if (d && d.error === 'Plano não encontrado') { bodyEl.innerHTML = '<div style="color:#ff6b6b;font-size:13px;">Este plano não existe mais — ele foi apagado (ou apagado junto com o concurso). Feche este modal e atualize a lista de planos.</div>'; try { window.dispatchEvent(new CustomEvent('gdi-plan-missing', { detail: { planId: planId } })); } catch (_) {} } else { bodyEl.innerHTML = '<div style="color:#ff6b6b;font-size:13px;">Não foi possível carregar o plano.</div>'; } return; }
            const p = d.plan, s = p.summary;
            // ★ v2.15.6: selo de origem + nota do edital no plano da Meggy
            let originHtml = '';
            if (p.origin === 'meggy-ai') originHtml += '<div style="display:inline-block;background:rgba(255,139,159,.15);border:1px solid rgba(255,139,159,.4);color:#ff8b9f;border-radius:999px;padding:2px 10px;font-size:11px;font-weight:600;margin-bottom:8px;">🐩 Gerado pela Meggy</div>';
            else if (p.origin === 'deterministico') originHtml += '<div style="display:inline-block;background:rgba(255,212,59,.1);border:1px solid rgba(255,212,59,.3);color:#ffd43b;border-radius:999px;padding:2px 10px;font-size:11px;font-weight:600;margin-bottom:8px;">🎯 Plano determinístico</div>';
            if (p.editalNote) originHtml += '<div style="font-size:12px;color:#9aa4b8;margin-bottom:8px;">' + Shell._esc(p.editalNote) + '</div>';
            // ★ v2.15.6-banca: mostra o perfil da banca usado (2ª fonte do plano)
            if (p.bancaProfile && p.bancaProfile.banca) originHtml += '<div style="font-size:12px;color:#5ddeda;margin-bottom:8px;">📊 Histórico da banca ' + Shell._esc(p.bancaProfile.banca) + ': ' + (p.bancaProfile.disciplinas ? p.bancaProfile.disciplinas.length : 0) + ' disciplinas do perfil semeado (o que mais cai historicamente).</div>';
            // ★ merge v2.15.6-crossed: selo de cruzamento no modal
            if (p.crossed) originHtml += '<div style="font-size:12px;color:#5ddeda;margin-bottom:8px;">🔀 Cruzado: edital + histórico da banca.</div>';
            let h = originHtml + '<div style="font-size:13px;color:#9aa4b8;margin-bottom:12px;">' + Shell._esc(p.banca || '') + ' · ' + s.totalDays + ' dias · ' + s.dailyHours + 'h/dia · ' + s.totalHours + 'h · ' + s.altaSharePct + '% nas altas</div>';
            h += '<div style="display:flex;flex-direction:column;gap:8px;">';
            p.days.forEach(dy => {
              h += '<div style="padding:10px;background:rgba(255,255,255,0.03);border-radius:8px;"><div style="font-size:12px;color:#5ddeda;font-weight:600;margin-bottom:4px;">Dia ' + dy.day + ' · ' + Shell._esc(dy.date) + ' · ' + dy.minutos + ' min</div>';
              dy.sessions.forEach(ss => { h += '<div style="font-size:12px;color:#e6edf3;padding:2px 0;">' + (ss.tipo === 'revisao' ? '🔁 ' : '📚 ') + Shell._esc(ss.disciplina) + ' — ' + Shell._esc(ss.topico) + ' <span style="color:#8b949e;">(' + ss.minutos + ' min)</span>' + Shell.views._v215PlayBtnHtml(ss, concursoId) + '</div>'; });
              h += '</div>';
            });
            h += '</div>';
            bodyEl.innerHTML = h;
            Shell.views._v215WirePlayButtons(bodyEl, concursoId);
          }).catch(() => { const b = document.getElementById('pm-body'); if (b) b.innerHTML = '<div style="color:#ff6b6b;font-size:13px;">Erro ao carregar o plano.</div>'; });
          return;
        }
        modal.innerHTML =
          '<div class="meggy-modal-content" style="max-width:520px;width:100%;max-height:90vh;overflow-y:auto;background:#161b22;border:1px solid rgba(255,255,255,0.08);border-radius:14px;">' +
            '<div class="meggy-modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.06);">' +
              '<div class="meggy-modal-title" style="font-size:15px;font-weight:600;color:#e6edf3;">' + ((opts && opts.meggy) ? '🐩 Montar plano com a Meggy' : '🎯 Montar plano direcionado') + '</div>' +
              '<button id="pm-x" style="background:none;border:none;color:#9aa4b8;font-size:22px;cursor:pointer;line-height:1;padding:0 4px;">×</button>' +
            '</div>' +
            '<div style="padding:16px;">' +
              '<div style="font-size:13px;color:#9aa4b8;margin-bottom:12px;">A Meggy monta o plano só com o mais cobrado pela banca, cruzado com as disciplinas do edital deste concurso.</div>' +
              '<div style="margin-bottom:12px;"><label style="display:block;font-size:12px;color:#9aa4b8;margin-bottom:6px;">Banca organizadora *</label><select id="pm-banca" style="width:100%;padding:10px 12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#e6edf3;font-size:14px;box-sizing:border-box;"><option value="Cebraspe">Cebraspe</option><option value="FGV">FGV</option><option value="FCC">FCC</option><option value="Vunesp">Vunesp</option><option value="IBFC">IBFC</option></select></div>' +
              '<div style="display:flex;gap:12px;"><div style="flex:1;"><label style="display:block;font-size:12px;color:#9aa4b8;margin-bottom:6px;">Dias de plano</label><input id="pm-days" type="number" min="7" max="180" value="60" style="width:100%;padding:10px 12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#e6edf3;font-size:14px;box-sizing:border-box;" /></div>' +
              '<div style="flex:1;"><label style="display:block;font-size:12px;color:#9aa4b8;margin-bottom:6px;">Horas por dia</label><input id="pm-hours" type="number" min="1" max="12" value="2" style="width:100%;padding:10px 12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#e6edf3;font-size:14px;box-sizing:border-box;" /></div></div>' +
            '</div>' +
            '<div style="padding:12px 16px;border-top:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;gap:8px;">' +
              '<button class="meggy-header-btn" id="pm-cancel">Cancelar</button>' +
              '<button class="meggy-header-btn" id="pm-build" style="background:linear-gradient(135deg,#ffd43b,#f59e0b);color:#1a1a1a;border:none;">' + ((opts && opts.meggy) ? '🐩 Montar plano com a Meggy' : '🎯 Montar plano') + '</button>' +
            '</div>' +
          '</div>';
        document.body.appendChild(modal);
        document.getElementById('pm-x').onclick = close;
        document.getElementById('pm-cancel').onclick = close;
        document.getElementById('pm-build').onclick = async () => {
          const banca = document.getElementById('pm-banca').value;
          const totalDays = parseInt(document.getElementById('pm-days').value, 10) || 60;
          const dailyHours = parseInt(document.getElementById('pm-hours').value, 10) || 2;
          const btn = document.getElementById('pm-build');
          btn.disabled = true; btn.textContent = 'Montando...';
          try {
            // ★ v2.15.6: o botão "Montar plano com a Meggy" agora chama de
            //   verdade a Meggy (POST /api/plans/generate — IA); o botão
            //   "Montar plano" segue no determinístico (/api/plans/build).
            const useMeggy = !!(opts && opts.meggy);
            const r = await fetch(useMeggy ? '/api/plans/generate' : '/api/plans/build', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(useMeggy ? { concursoId, banca, totalDays, dailyHours, useAi: true } : { concursoId, banca, totalDays, dailyHours }) });
            const d = await r.json();
            if (!d.ok) throw new Error(d.error || ('HTTP ' + r.status));
            if (d.summary && d.summary.withRealLessons) Shell.views._v215Toast('🐩 Plano montado com a Meggy: ' + (d.summary.lessonsLinked || 0) + ' aulas reais vinculadas' + (d.summary.lessonsWatched ? ' (' + d.summary.lessonsWatched + ' já assistidas)' : ''));
            if (useMeggy && d.fallback) Shell.views._v215Toast('⚠️ A IA estava indisponível — plano determinístico montado.');
            close();
            if (concursoId) Shell.views.concursoDetail(document.getElementById('meggy-main'), concursoId);
          } catch (e) { Shell.views._v215Err('Não foi possível montar o plano', e.message); btn.disabled = false; btn.textContent = ((opts && opts.meggy) ? '🐩 Montar plano com a Meggy' : '🎯 Montar plano'); }
        };
      },

      showEditalModal(el, concursoId) {
        let modal = document.getElementById('edital-modal');
        if (modal) modal.remove();
        modal = document.createElement('div');
        modal.id = 'edital-modal';
        modal.className = 'meggy-modal-overlay';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:10002;padding:20px;';
        modal.innerHTML =
          '<div class="meggy-modal-content" style="max-width:600px;width:100%;max-height:90vh;overflow-y:auto;background:#161b22;border:1px solid rgba(255,255,255,0.08);border-radius:14px;">' +
            '<div class="meggy-modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.06);">' +
              '<div class="meggy-modal-title" style="font-size:15px;font-weight:600;color:#e6edf3;">📋 Conteúdo programático</div>' +
              '<button id="em-x" style="background:none;border:none;color:#9aa4b8;font-size:22px;cursor:pointer;line-height:1;padding:0 4px;">×</button>' +
            '</div>' +
            '<div style="padding:16px;">' +
              '<div style="font-size:13px;color:#9aa4b8;margin-bottom:12px;">Cole o texto do edital ou do conteúdo programático. A Meggy 🐩 vai identificar disciplinas, pesos e incidência. Opcional — dá para criar o concurso sem isso.</div>' +
              '<textarea id="em-edital" placeholder="Cole aqui o texto do edital..." style="width:100%;min-height:240px;padding:12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#e6edf3;font-size:13px;font-family:monospace;box-sizing:border-box;resize:vertical;"></textarea>' +
            '</div>' +
            '<div style="padding:12px 16px;border-top:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;gap:8px;">' +
              '<button class="meggy-header-btn" id="em-cancel">Cancelar</button>' +
              '<button class="meggy-header-btn" id="em-analyze" style="background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;border:none;">🔍 Analisar Edital</button>' +
            '</div>' +
          '</div>';
        document.body.appendChild(modal);
        const close = () => { if (modal && modal.parentNode) modal.parentNode.removeChild(modal); };
        document.getElementById('em-x').onclick = close;
        document.getElementById('em-cancel').onclick = close;
        document.getElementById('em-analyze').onclick = async () => {
          const editalText = (document.getElementById('em-edital').value || '').trim();
          if (!editalText || editalText.length < 50) { Shell.views._v215Err('Edital muito curto', 'Cole ao menos um trecho relevante do edital.'); return; }
          const btn = document.getElementById('em-analyze');
          btn.disabled = true;
          btn.innerHTML = '<div class="spinner-border spinner-border-sm"></div> Analisando...';
          try {
            const r = await fetch('/api/concursos/' + encodeURIComponent(concursoId) + '/analyze-edital', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ editalText }) });
            const d = await r.json();
            if (d.ok) { close(); Shell.views.concursoDetail(el, concursoId); }
            else { Shell.views._v215Err('Erro ao analisar edital', d.error || 'tente novamente'); btn.disabled = false; btn.innerHTML = '🔍 Analisar Edital'; }
          } catch (e) { Shell.views._v215Err('Erro ao analisar edital', e.message); btn.disabled = false; btn.innerHTML = '🔍 Analisar Edital'; }
        };
      },

    },

    // ─── Actions ───
    toggleSidebar(open) {
      const sb = document.getElementById('meggy-sidebar');
      const overlay = document.getElementById('meggy-sidebar-overlay');
      if (open === false) Shell.state.sidebarOpen = false;
      else Shell.state.sidebarOpen = !Shell.state.sidebarOpen;
      sb.classList.toggle('open', Shell.state.sidebarOpen);
      overlay.classList.toggle('open', Shell.state.sidebarOpen);
    },

    toggleTheme() {
      const current = document.documentElement.getAttribute('data-bs-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-bs-theme', next);
      localStorage.setItem('gdi-theme', next);
      document.getElementById('meggy-theme-icon').className = next === 'dark' ? 'bi bi-moon-stars' : 'bi bi-sun';
    },

    logout() {
      // ★ v2.10.3: confirm() nativo é auto-dispensado por navegadores
      // automatizados — o Sair nunca deslogava. Usa o modal próprio.
      if (typeof window.gdiModal === 'function') {
        window.gdiModal({ title: 'Sair', message: 'Deseja sair da sua conta?', confirmText: 'Sair', cancelText: 'Cancelar' }).then(ok => { if (ok) window.location.href = '/logout'; }).catch(() => { window.location.href = '/logout'; });
      } else {
        window.location.href = '/logout';
      }
    },

    // ═══ Meggy AI Drawer ═══
    meggyAIDrawerOpen: false,
    openMeggyAIDrawer() {
      let drawer = document.getElementById('meggy-ai-drawer');
      if (!drawer) {
        drawer = document.createElement('div');
        drawer.id = 'meggy-ai-drawer';
        drawer.className = 'meggy-ai-drawer';
        // ★ Chat-only (sem abas de Ações — gerar material só funciona na página de vídeo)
        drawer.innerHTML = `
        <div class="meggy-ai-drawer-header">
          <div class="meggy-ai-drawer-title">🐩 Meggy AI</div>
          <button class="meggy-ai-drawer-close" id="meggy-ai-close"><i class="bi bi-x"></i></button>
        </div>
        <div class="meggy-ai-drawer-body" id="meggy-ai-body"></div>
        `;
        // ★ Append to shell root (z-index 10001 > shell 9999) — não ao body
        const shellRoot = document.getElementById('meggy-shell') || document.getElementById('meggy-root') || document.body;
        shellRoot.appendChild(drawer);
        document.getElementById('meggy-ai-close').onclick = () => Shell.closeMeggyAIDrawer();
      }
      drawer.classList.add('open');
      Shell.meggyAIDrawerOpen = true;
      // ★ Render chat directly (sem abas)
      Shell.renderMeggyAITab('chat');
    },
    closeMeggyAIDrawer() {
      const drawer = document.getElementById('meggy-ai-drawer');
      if (drawer) drawer.classList.remove('open');
      Shell.meggyAIDrawerOpen = false;
    },
    // ── v2.15.6-drawer-hook (round 4) ──
    // ROUND 4 — o drawer REAL é este (shell.js), NÃO o widget: a verificação
    // ao vivo 22:52–23:02 -03 provou que a resposta do drawer vem por /api/ai
    // (não-streaming): mostra só "🐾 Pensando..." e surge inteira de uma vez.
    // O widget (meggy-widget.js) tem seu próprio send()/stream — o drawer
    // NUNCA passa por ele, por isso D2/D4 nunca se aplicaram ao vivo. O
    // gancho é aplicado aqui, na renderização da resposta em send().
    // Porte das funções do worker/widget (mesmos 5 modelos, mesma rotação
    // por hash, mesma limpeza do assunto, mesmo trigger alargado "Resumo:").
    _drawerHookSubject(lesson, pdfName) {
      function cleanName(s) {
        let t = String(s || '').replace(/\.[a-z0-9]+$/i, '').trim();
        t = t.replace(/^(aula\s*[-–.:]?\s*\d+|0*\d+)\s*[-–.:]?\s*/i, '').trim();
        t = t.replace(/\s*[-–.:]?\s*aula\s+\d+\s*$/i, '').trim();
        return t;
      }
      function fromLesson(l) {
        let t = String(l || '').split('/').filter(Boolean).pop() || '';
        t = t.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim();
        t = t.replace(/^isolada\s+/i, '');
        t = t.replace(/^(aula\s*[-–.:]?\s*\d+|0*\d+)\s*[-–.:]?\s*/i, '').trim();
        t = t.replace(/\s*[-–.:]?\s*aula\s+\d+\s*$/i, '').trim();
        return t;
      }
      function isGeneric(t) {
        if (!t) return true;
        const b = t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (/^\d+$/.test(b)) return true;
        if (/^(aula|video|lesson|capitulo|parte|material)(\s+\d+)?$/.test(b)) return true;
        return false;
      }
      let subj = cleanName(pdfName);
      if (isGeneric(subj)) subj = fromLesson(lesson);
      if (isGeneric(subj)) return 'este tema';
      return subj.toLowerCase();
    },
    _drawerHook(lesson, pdfName) {
      const templates = ['Nessa aula vamos estudar ', 'Nesta aula, vamos mergulhar em ', 'Hoje vamos estudar ', 'Nesta aula, você vai entender ', 'Prepare-se: nesta aula vamos estudar '];
      let h = 0; const s = String(lesson || '') + '/' + String(pdfName || '');
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
      return templates[h % templates.length] + Shell._drawerHookSubject(lesson, pdfName) + '…';
    },
    _ensureDrawerHook(text, lesson, pdfName) {
      const t = String(text || '');
      if (!t.trim()) return t;
      const lines = t.split('\n');
      let i = 0; while (i < lines.length && !lines[i].trim()) i++;
      if (i >= lines.length) return t;
      // ★ v2.15.6-drawer-hook round 5: NÃO testar o formato da 1ª linha.
      //    Causa provada com o modelo real (2 amostras do llama-3.1-70b com
      //    o system prompt EXATO do handleAi): a resposta abre com título
      //    em negrito "**Resumo: ...**" — não casa com '#', '⚠️' nem
      //    /^resumo\b/i, e o gancho era pulado em silêncio. O prompt manda
      //    usar Markdown (negrito, listas, títulos), então o formato da
      //    abertura é do modelo. O pedido já foi classificado como resumo
      //    no call site (_isDrawerSummaryRequest); aqui só evitamos
      //    duplicar, vazio e "Sem resposta".
      const first = lines[i].trim();
      if (/^(nessa aula vamos estudar|nesta aula, vamos mergulhar em|hoje vamos estudar|nesta aula, você vai entender|prepare-se: nesta aula vamos estudar)/i.test(first)) return t;
      if (/o foco desta aula/i.test(first)) return t;
      if (/^(sem resposta|erro:)/i.test(first)) return t;
      lines.splice(i, 0, Shell._drawerHook(lesson, pdfName), '');
      return lines.join('\n');
    },
    // ★ v2.15.9-C1: existe aula aberta? (pasta atual OU item da playlist).
    //    O título da página NÃO conta — na home ele é genérico ("Meggy AI")
    //    e um gancho com "este tema" seria órfão.
    _hasDrawerLesson() {
      try {
        const p = (Shell.state && Shell.state.currentFolderPath) || '';
        if (String(p).split('/').filter(Boolean).length) return true;
      } catch (_) {}
      try {
        const n = (Shell.state.playerPlaylist && Shell.state.playerPlaylist[Shell.state.playerIndex] && Shell.state.playerPlaylist[Shell.state.playerIndex].name) || '';
        if (String(n).trim()) return true;
      } catch (_) {}
      return false;
    },
    // ★ v2.15.9-C: pedido de resumo/contexto da aula.
    //    Causa provada (Passo 13): "O que vamos estudar nesta aula?" NÃO
    //    contém "resum" → o classificador devolvia false e o gancho do
    //    round 5 nunca era aplicado, mesmo com a aula aberta. A pergunta do
    //    round 5 ("Faça um resumo curto desta aula...") continha "resum" —
    //    por isso o Passo 12 passou e o Passo 13 falhou sem nenhuma mudança
    //    no bloco do drawer (byte-idêntico v2.15.7→v2.15.8). As variantes de
    //    pergunta sobre o conteúdo da aula só contam COMO resumo quando há
    //    aula aberta; sem aula, saudação/pergunta genérica continua sem
    //    gancho (sem órfão). "resum" continua valendo sem aula (round 5).
    _isDrawerSummaryRequest(txt) {
      const raw = String(txt || '');
      if (/resum/i.test(raw)) return true;
      if (!Shell._hasDrawerLesson()) return false;
      const t = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
      return /o que (vamos|vou) (estudar|aprender)/.test(t)
        || /do que (trata|fala|se trata) (esta|essa|nesta|nessa) aula/.test(t)
        || /sobre o que (e|fala|trata) (esta|essa|nesta|nessa) aula/.test(t)
        || /o que (e|eh) (esta|essa) aula/.test(t)
        || /do que (e|eh) (esta|essa) aula/.test(t)
        || /(me )?explic[ae] (esta|essa|a) aula/.test(t)
        || /o que (esta|essa) aula (aborda|ensina|apresenta|cobre)/.test(t)
        || /qual (o )?conteudo (desta|dessa|da) aula/.test(t)
        || /qual (o )?tema (desta|dessa|da) aula/.test(t)
        || /o que tem (nesta|nessa|na) aula/.test(t)
        || /o que vamos ver (nesta|nessa) aula/.test(t);
    },
    // Nome da aula no contexto do shell: último segmento da pasta atual
    // (ex.: "01 - PRINCIPIOS FUNDAMENTAIS"); fallback: item da playlist;
    // último fallback: título da página.
    _drawerLessonName() {
      try {
        const p = (Shell.state && Shell.state.currentFolderPath) || '';
        const segs = String(p).split('/').filter(Boolean);
        if (segs.length) { try { return decodeURIComponent(segs[segs.length - 1]); } catch (_) { return segs[segs.length - 1]; } }
      } catch (_) {}
      try {
        const n = (Shell.state.playerPlaylist && Shell.state.playerPlaylist[Shell.state.playerIndex] && Shell.state.playerPlaylist[Shell.state.playerIndex].name) || '';
        if (n) return n;
      } catch (_) {}
      const t = (typeof document !== 'undefined' && document.title) || '';
      return t.split(' - ')[0].split(' | ')[0].trim();
    },
    // ★ v2.15.10-C1: material REAL da aula no prompt (grounding).
    //    Causa provada (Passo 14, sintomas a+b): o modelo recebia SÓ o
    //    nome da aula (prefixo C2) — handleAi (worker.js:13724) lê só
    //    message/messages e NÃO faz nenhuma busca de material (nenhum
    //    D1/KV de resumo; os únicos KV ali são modelhealth:* e os caches
    //    de descoberta de modelos). Sem conteúdo, o modelo pequeno do
    //    /api/ai inventou outra aula ("Lógica de Programação") ou recusou
    //    ("não tenho o conteúdo exato desta aula") — mesmo a pasta TENDO
    //    resumo_ia.pdf e o resumo acima do player estando correto. A
    //    fonte é a MESMA do resumo acima do player: o cache ISA
    //    (GET /api/ai/cache), com as chaves canônicas do showISA (pasta
    //    + nome do ficheiro, variante .pdf e variante da pasta pai).
    //    Sem cache, e só p/ pedidos de resumo/conteúdo, o texto é
    //    extraído do PDF real da pasta (resumo/material/transcrição)
    //    com os mesmos helpers do showISA (gdiListAllFiles +
    //    _extractPdfText). Sem nada, devolve null — e o send() diz isso
    //    ao modelo em vez de deixar inventar.
    //    Chaves de sonda do cache ISA p/ a aula aberta — mesma derivação
    //    do showISA (isaCacheProbeKeys, E3). Pura (só lê Shell.state).
    _drawerLessonCacheKeys() {
      const keys = [];
      try {
        let lessonPath = String((Shell.state && Shell.state.currentFolderPath) || '');
        if (!lessonPath) return keys;
        if (!lessonPath.endsWith('/')) lessonPath += '/';
        const item = (Shell.state.playerPlaylist && Shell.state.playerPlaylist[Shell.state.playerIndex]) || null;
        const bare = (item && (item.origName || item.name)) || '';
        const display = (item && item.name) || '';
        if (!bare && !display) return keys;
        const push2 = (k) => { try { keys.push(encodeURI(decodeURIComponent(k))); } catch (_) { keys.push(k); } keys.push(k); };
        if (display) push2(lessonPath + display);
        if (bare && bare !== display) push2(lessonPath + bare);
        const mediaName = display || bare;
        if (mediaName && /\.(mp4|webm|mov|m4v|avi|mkv|m3u8|mp3|m4a|ogg|wav|aac)$/i.test(mediaName)) {
          const pdfName = mediaName.replace(/\.[a-z0-9]+$/i, '') + '.pdf';
          push2(lessonPath + pdfName);
          const parentPath = lessonPath.replace(/[^/]+\/$/, '');
          if (parentPath && parentPath !== lessonPath) push2(parentPath + pdfName);
        }
      } catch (_) {}
      return keys;
    },
    //    Material da aula aberta: 1) cache ISA (resumo já gerado — a
    //    fonte do resumo acima do player); 2) só p/ pedidos de resumo/
    //    conteúdo, o PDF real da pasta (o batalhão salva o resumo sob o
    //    nome real do PDF, por isso a sonda do cache é tentada primeiro
    //    p/ cada PDF candidato). Devolve {source, text} ou null.
    async _drawerLessonMaterial(msg) {
      if (!Shell._hasDrawerLesson()) return null;
      const probe = async (key) => {
        try {
          const r = await fetch('/api/ai/cache?key=' + encodeURIComponent(key), { headers: { 'Accept': 'application/json' }, credentials: 'include' });
          if (r && r.ok) {
            const d = await r.json().catch(() => null);
            if (d && d.cached && typeof d.cached.summary === 'string' && d.cached.summary.length > 50 && !Shell._isIsaRefusal(d.cached.summary)) return d.cached.summary; // ★ v2.15.11-B11-drawer: recusa não é material da aula — sem isto o drawer respondia a partir da recusa em cache (Tier 1); agora cai p/ o PDF real (Tier 2) ou p/ null honesto. 
          }
        } catch (_) {}
        return null;
      };
      const variants = (k) => { try { const e = encodeURI(decodeURIComponent(k)); return e === k ? [k] : [e, k]; } catch (_) { return [k]; } };
      try {
        for (const k of Shell._drawerLessonCacheKeys()) {
          const s = await probe(k);
          if (s) return { source: 'cache', key: k, text: s };
        }
      } catch (_) {}
      // Tier 2 — só p/ pedidos de resumo/conteúdo (extração de PDF é
      // lenta; uma dúvida pontual não precisa dela).
      try {
        if (!Shell._isDrawerSummaryRequest(msg)) return null;
        if (!window.gdiListAllFiles) return null;
        let lessonPath = String((Shell.state && Shell.state.currentFolderPath) || '');
        if (!lessonPath) return null;
        if (!lessonPath.endsWith('/')) lessonPath += '/';
        const files = await window.gdiListAllFiles(lessonPath, '');
        const rank = (n) => /resumo/i.test(n) ? 0 : /material|transcri/i.test(n) ? 1 : 2;
        const pdfs = (files || []).filter(f => f && /\.pdf$/i.test(f.name || '')).sort((a, b) => rank(a.name || '') - rank(b.name || ''));
        for (const pdf of pdfs.slice(0, 2)) {
          for (const k of variants(lessonPath + pdf.name)) {
            const s = await probe(k);
            if (s) return { source: 'cache', key: k, text: s };
          }
          if (pdf.link) {
            const link = String(pdf.link).startsWith('http') ? pdf.link : (window.location.origin + pdf.link);
            const txt = await Shell._extractPdfText(link);
            if (txt && txt.length > 50) return { source: 'pdf', name: pdf.name, text: String(txt).slice(0, 12000) };
          }
        }
      } catch (_) {}
      return null;
    },
    // ── fim drawer-hook (round 4) ──
    renderMeggyAITab(tab) {
      const body = document.getElementById('meggy-ai-body');
      if (!body) return;
      // ★ Chat-only (tab 'actions' removido — gerar material só na página de vídeo)
      if (tab === 'chat' || tab === 'actions') {
        body.innerHTML = '<div class="meggy-ai-chat-messages" id="meggy-ai-messages"><div class="meggy-ai-msg bot">Oi! Sou a <b>Meggy</b> 🐩 — sua poodle tutora de estudos.<br><br>Posso ajudar com:<br>• Explicar um tema da aula<br>• Tirar dúvidas<br>• Sugerir um plano de estudos<br><br>Para gerar resumos, questões e flashcards, abra uma aula e use as abas <b>Resumo Meggy</b>, <b>Questões</b>, <b>Pílulas</b> ou <b>Flashcards</b> no player. 🐾</div></div>' +
        '<div class="meggy-ai-chat-input"><textarea id="meggy-ai-input" placeholder="Pergunte algo à Meggy..." rows="2"></textarea><button id="meggy-ai-send"><i class="bi bi-send"></i></button></div>';
        const send = async () => {
        const msg = document.getElementById('meggy-ai-input').value.trim();
        if (!msg) return;
        // ★ v2.15.6-drawer-hook round 4: guarda de envio — sem ela, um 2º
        //    envio concorrente recriava o container (innerHTML +=) e
        //    destacava o nó do "Pensando..." em voo.
        if (send._busy) return;
        send._busy = true;
        const sendBtn = document.getElementById('meggy-ai-send');
        if (sendBtn) sendBtn.disabled = true;
        const msgs = document.getElementById('meggy-ai-messages');
        msgs.innerHTML += '<div class="meggy-ai-msg user">' + Shell._esc(msg) + '</div>';
        document.getElementById('meggy-ai-input').value = '';
        // ★ v2.15.6-drawer-hook round 4: referência ao elemento (nunca
        //    id) — o id "meggy-ai-typing" duplicava na 2ª pergunta:
        //    getElementById devolvia o div da 1ª resposta e o 2º
        //    "Pensando..." ficava preso para sempre.
        const typingEl = document.createElement('div');
        typingEl.className = 'meggy-ai-msg bot';
        typingEl.textContent = '🐾 Pensando...';
        msgs.appendChild(typingEl);
        msgs.scrollTop = msgs.scrollHeight;
        // ★ v2.15.10-C2: material da aula no prompt (grounding). O C2
        //    da v2.15.9 mandava SÓ o nome — o modelo, sem conteúdo,
        //    inventou outra aula (programação) ou recusou o resumo
        //    ("não tenho o conteúdo exato desta aula") mesmo havendo
        //    resumo no cache ISA. Agora o resumo/material real
        //    (_drawerLessonMaterial, C1) vai junto; sem material, o
        //    prompt diz isso ao modelo e proíbe inventar outra aula.
        //    A bolha do usuário continua com o texto cru; só o NOME vai
        //    no contexto — nunca o caminho da pasta (regra 3 do system
        //    prompt). _drawerLessonMaterial nunca dá throw, mas o
        //    try/catch aqui garante que uma falha não impeça o envio
        //    (o prompt cai p/ o modo sem-material).
        const _lessonCtx = Shell._hasDrawerLesson() ? Shell._drawerLessonName() : '';
        let _mat = null;
        try { _mat = _lessonCtx ? await Shell._drawerLessonMaterial(msg) : null; } catch (_) { _mat = null; }
        let _sendMsg = msg;
        if (_lessonCtx) {
          const _head = '[Contexto: o aluno está com a aula "' + _lessonCtx + '" aberta. Responda sobre ESTA aula e o seu conteúdo.]';
          if (_mat && _mat.text) {
            _sendMsg = _head + '\n[Material/resumo desta aula — responda SOMENTE com base no conteúdo abaixo; se a pergunta for sobre algo que o material não cobre, diga isso com honestidade e não invente:]\n' + String(_mat.text).slice(0, 6000) + '\n\n' + msg;
          } else {
            _sendMsg = _head + '\n[NÃO há resumo/material desta aula disponível. Se a pergunta for sobre o conteúdo desta aula, diga honestamente que ainda não há material e sugira abrir a aba "Resumo Meggy" no player; NÃO invente o conteúdo de outra aula nem de outro tema.]\n' + msg;
          }
        }
        try {
          const r = await fetch('/api/ai', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({message: _sendMsg, messages: []}) });
          const d = await r.json();
          const resp = d.response || 'Sem resposta';
          // ★ v2.15.5 item 10: renderer único — sem marked, o vendored
          //    formata; nunca insere a resposta crua (XSS).
          await Shell._ensureMdLibs();
          // ★ v2.15.6-drawer-hook round 4: o gancho de abertura do resumo
          //    é aplicado AQUI — este é o drawer real (shell.js), não o widget
          //    (meggy-widget.js): a resposta vem por /api/ai (não-streaming)
          //    e é renderizada de uma só vez neste div.
          // ★ v2.15.10-C4: o gancho é DA AULA ABERTA — sem aula, _drawerLessonName()
          //    cai no título da página ("Meggy AI") e o gancho inventava uma aula
          //    órfã ("...estudar meggy ai…") no chat da Home. Só aplica com aula
          //    aberta; sem aula a resposta passa sem gancho (o classificador
          //    "resum" sem aula continua valendo — C8 — mas sem inventar assunto).
          const shownResp = (Shell._isDrawerSummaryRequest(msg) && Shell._hasDrawerLesson()) ? Shell._ensureDrawerHook(resp, Shell._drawerLessonName(), '') : resp;
          const html = Shell._renderMd(shownResp);
          typingEl.innerHTML = html;
        } catch (e) { typingEl.textContent = 'Erro: ' + e.message; }
        finally { send._busy = false; if (sendBtn) sendBtn.disabled = false; }
        msgs.scrollTop = msgs.scrollHeight;
        };
        document.getElementById('meggy-ai-send').onclick = send;
        document.getElementById('meggy-ai-input').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
      }
    },
    async meggyAIAction(action) {
      const body = document.getElementById('meggy-ai-body');
      const lessonName = Shell.state.playerPlaylist?.[Shell.state.playerIndex]?.name || '';
      body.innerHTML = '<div style="padding:20px;text-align:center;"><div class="spinner-border" style="color:#ff8b9f;"></div><div style="margin-top:12px;color:#9aa4b8;">Gerando...</div></div>';
      try {
        let msg = '';
        if (action === 'resumo') msg = `Gere um resumo detalhado da aula: ${lessonName}`;
        else if (action === 'pilulas') msg = `Crie pílulas de conhecimento sobre: ${lessonName}`;
        else if (action === 'questoes') msg = `Gere 5 questões de múltipla escolha sobre: ${lessonName}`;
        else if (action === 'flashcards') msg = `Crie 10 flashcards sobre: ${lessonName}`;
        const r = await fetch('/api/ai', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({message: msg, messages: []}) });
        const d = await r.json();
        const text = d.response || d.markdown || 'Sem resposta';
        // ★ v2.15.5 item 10: renderer único (o regex anterior não escapava
        //    o texto — XSS — e não cobria tabelas/código/citações/links).
        await Shell._ensureMdLibs();
        const h = Shell._renderMd(text);
        body.innerHTML = `<div style="padding:16px;font-size:13px;color:#e6edf3;">${h}</div>`;
      } catch (e) { body.innerHTML = 'Erro: ' + e.message; }
    },

    // meggyAI(el) removido — drawer agora é aberto via openMeggyAIDrawer()

    placeholder(el, title, icon, phase) {
      el.innerHTML = `
        <div class="meggy-view-header">
        <h1 class="meggy-view-title">${icon} ${title}</h1>
        </div>
        <div class="meggy-placeholder">
        <div class="meggy-placeholder-icon">${icon}</div>
        <div class="meggy-placeholder-title">${title}</div>
        <div class="meggy-placeholder-desc">Esta seção será migrada em breve.</div>
        <div class="meggy-placeholder-phase">${phase || 'Fase 5'} do plano de unificação</div>
        </div>
      `;
    },

    // ═══ _estudosView — placeholder com lazy load do GDIndex ═══
    _estudosView(el, feature) {
        const titles = {
          'progresso': '📊 Progresso', 'questoes': '❓ Questões', 'flashcards': '🃏 Flashcards',
          'simulado': '📝 Simulado', 'provas': '📄 Provas', 'redacao': '✍️ Redação',
          'cronograma': '📅 Cronograma', 'estatisticas': '📈 Estatísticas', 'mapa-fracos': '🎯 Mapa de Fracos',
          'conquistas': '🏆 Conquistas', 'apps': '📱 Apps', 'resumos': '📚 Resumos',
          'plano': '📋 Plano', 'config': '⚙️ Configurações'
        };
        const title = titles[feature] || feature;
        
        // ★ Renderizar conteúdo NATIVO (sem GDIndex)
        if (feature === 'progresso') {
          const d = (typeof GDIUser !== 'undefined' && GDIUser && GDIUser.state) || {};
          const watched = d.watched ? Object.keys(d.watched).length : 0;
          const history = d.history ? d.history.length : 0;
          el.innerHTML = '<div class="meggy-view-header"><h1 class="meggy-view-title">📊 Progresso</h1></div><div class="meggy-cards-grid"><div class="meggy-card" style="cursor:default;"><div class="meggy-card-icon">🎬</div><div class="meggy-card-title">' + watched + '</div><div class="meggy-card-meta">Aulas assistidas</div></div><div class="meggy-card" style="cursor:default;"><div class="meggy-card-icon">📺</div><div class="meggy-card-title">' + history + '</div><div class="meggy-card-meta">No histórico</div></div></div>';
          return;
        }
        if (feature === 'questoes' || feature === 'simulado' || feature === 'flashcards' || feature === 'resumos') {
          el.innerHTML = '<div class="meggy-view-header"><h1 class="meggy-view-title">' + title + '</h1></div><div class="meggy-placeholder"><div class="meggy-placeholder-icon">' + title.split(' ')[0] + '</div><div class="meggy-placeholder-title">' + title.replace(/^\S+\s/, '') + '</div><div class="meggy-placeholder-desc">Use a Meggy AI para gerar conteúdo.</div><button class="meggy-header-btn" onclick="Shell.openMeggyAIDrawer()" style="margin-top:16px;background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;border:none;"><i class="bi bi-robot"></i> Abrir Meggy AI</button></div>';
          return;
        }
        if (feature === 'config') {
          el.innerHTML = '<div class="meggy-view-header"><h1 class="meggy-view-title">⚙️ Configurações</h1></div><div style="max-width:500px;margin:0 auto;"><div class="meggy-card" style="cursor:default;"><div class="meggy-card-title">🎨 Tema</div><div class="meggy-card-meta"><button class="meggy-header-btn" onclick="Shell.toggleTheme()">Alternar tema</button></div></div><div class="meggy-card" style="cursor:default;margin-top:12px;"><div class="meggy-card-title">📦 Versão</div><div class="meggy-card-meta">Meggy AI</div></div><div class="meggy-card" style="cursor:default;margin-top:12px;"><div class="meggy-card-title">🚪 Conta</div><div class="meggy-card-meta"><button class="meggy-header-btn" onclick="Shell.logout()">Sair</button></div></div></div>';
          return;
        }
        if (feature === 'apps') {
          Shell._renderApps(el);
          return;
        }
        if (feature === 'conquistas') {
          const d = (typeof GDIUser !== 'undefined' && GDIUser && GDIUser.state) || {};
          const watched = d.watched ? Object.keys(d.watched).length : 0;
          const ach = [
            {icon:'🎬',name:'Primeira aula',done:watched>=1},
            {icon:'🔥',name:'Streak 3',done:watched>=3},
            {icon:'⚡',name:'Streak 7',done:watched>=7},
            {icon:'🏆',name:'Streak 30',done:watched>=30},
          ];
          el.innerHTML = '<div class="meggy-view-header"><h1 class="meggy-view-title">🏆 Conquistas</h1></div><div class="meggy-cards-grid">' + ach.map(a => '<div class="meggy-card" style="opacity:'+(a.done?'1':'0.5')+';cursor:default;"><div class="meggy-card-icon">'+(a.done?a.icon:'🔒')+'</div><div class="meggy-card-title">'+a.name+'</div></div>').join('') + '</div>';
          return;
        }
        // Outras abas (provas, redacao, etc) — placeholder
        el.innerHTML = '<div class="meggy-view-header"><h1 class="meggy-view-title">' + title + '</h1></div><div class="meggy-placeholder"><div class="meggy-placeholder-icon">' + title.split(' ')[0] + '</div><div class="meggy-placeholder-title">' + title.replace(/^\S+\s/, '') + '</div><div class="meggy-placeholder-desc">Em breve.</div></div>';
      },

    // ═══ _renderApps — área do aluno: baixar os APKs/apps com versão ao vivo ═══
    // Busca /api/apps/latest (público) por plataforma e renderiza cards com
    // versão + botão de download (/download/<platform>). Se a API falhar,
    // cai para os cards com o link dos releases (nada quebra).
    _renderApps(el) {
      const PLATS = [
        { p: 'windows', icon: '🖥️', name: 'Windows', meta: 'Desktop (.msi)' },
        { p: 'linux', icon: '🐧', name: 'Linux', meta: 'Desktop (.AppImage)' },
        { p: 'android', icon: '📱', name: 'Android', meta: 'Meggy — APK completo · celular e TV' },
        { p: 'android_tv', icon: '📺', name: 'Bibi Fit', meta: 'Android TV (APK)' },
        { p: 'vovofit_tv', icon: '💪', name: 'Vovó Fit TV', meta: 'Android TV (APK)' },
        { p: 'roku', icon: '📺', name: 'Roku', meta: 'BrightScript (.zip)' }
      ];
      const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const head = '<div class="meggy-view-header"><h1 class="meggy-view-title">📱 Apps</h1></div>';
      const card = (pl, ver) => '<a class="meggy-card" href="/download/' + pl.p + '"><div class="meggy-card-icon">' + pl.icon + '</div><div class="meggy-card-title">' + pl.name + '</div><div class="meggy-card-meta">' + esc(ver || pl.meta) + '</div><div class="meggy-card-meta" style="color:#ff8b9f;">⬇️ Baixar</div></a>';
      el.innerHTML = head + '<div class="meggy-cards-grid">' + PLATS.map(pl => card(pl, 'Carregando…')).join('') + '</div>';
      Promise.all(PLATS.map(pl => fetch('/api/apps/latest?platform=' + pl.p).then(r => r.ok ? r.json() : null).catch(() => null))).then(results => {
        let anyOk = false;
        const grid = PLATS.map((pl, i) => {
          const d = results[i];
          if (d && d.ok && d.version) { anyOk = true; return card(pl, 'v' + d.version + ' · ' + pl.meta); }
          return card(pl, pl.meta);
        }).join('');
        el.innerHTML = head + '<div class="meggy-cards-grid">' + grid + '</div>' + (anyOk ? '' : '<div style="text-align:center;margin-top:16px;"><a href="https://github.com/esaaraujo-lab/gdi_server/releases" target="_blank" class="meggy-header-btn">Ver todos os releases no GitHub</a></div>');
      }).catch(() => {
        el.innerHTML = head + '<div class="meggy-cards-grid">' + PLATS.map(pl => card(pl, pl.meta)).join('') + '</div><div style="text-align:center;margin-top:16px;"><a href="https://github.com/esaaraujo-lab/gdi_server/releases" target="_blank" class="meggy-header-btn">Ver todos os releases no GitHub</a></div>';
      });
    },

    // ═══ ISA Render Helpers (replica de produção — gdi-meggy.js) ═══

    // _esc: escape HTML (usado por _renderISAResult, _renderFlashcardDeck)
    _esc(s) {
      if (s == null) return '';
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    // _ensureMdLibs: carrega marked.js + DOMPurify dinamicamente se não estiverem presentes
    _mdLibsLoading: false,
    _mdLibsLoaded: false,
    _ensureMdLibs() {
      if (Shell._mdLibsLoaded) return Promise.resolve();
      if (Shell._mdLibsLoading) return Shell._mdLibsLoading;
      Shell._mdLibsLoading = new Promise((resolve) => {
        let pending = 0;
        function done() { pending--; if (pending <= 0) { Shell._mdLibsLoaded = true; resolve(); } }
        function loadScript(src) {
          if (document.querySelector('script[src="' + src + '"]')) { done(); return; }
          const s = document.createElement('script');
          s.src = src;
          s.onload = done;
          s.onerror = done;
          document.head.appendChild(s);
        }
        if (!window.marked) { pending++; loadScript('https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js'); }
        // ★ v2.15.5 item 10: renderer MD vendored (mesma origem, sem CDN)
        //    — garante formatação mesmo com jsDelivr fora.
        if (!window.gdiRenderMd) { pending++; loadScript('/modular/meggy/meggy-md.js?v=' + (window.CACHE_VERSION || '183')); }
        if (!window.DOMPurify) { pending++; loadScript('https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js'); }
        if (pending === 0) { Shell._mdLibsLoaded = true; resolve(); }
      });
      return Shell._mdLibsLoading;
    },

    // ★ _ensurePdfLibs: carrega pdf.js dinamicamente para extração de texto de PDFs
    _pdfLibsLoading: false,
    _pdfLibsLoaded: false,
    _ensurePdfLibs() {
      if (Shell._pdfLibsLoaded) return Promise.resolve();
      if (Shell._pdfLibsLoading) return Shell._pdfLibsLoading;
      Shell._pdfLibsLoading = new Promise((resolve) => {
        if (window.pdfjsLib) {
          Shell._pdfLibsLoaded = true;
          resolve();
          return;
        }
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
        s.onload = () => {
          if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
            Shell._pdfLibsLoaded = true;
          }
          resolve();
        };
        s.onerror = () => { resolve(); };
        document.head.appendChild(s);
      });
      return Shell._pdfLibsLoading;
    },

    // ★ v2.15.4: _extractPdfText delega ao motor compartilhado
    //   (meggy-pdf-engine.js) — PDF INTEIRO + OCR por IA, sem teto de
    //   30 págs/50K chars. Mantém o contrato antigo: devolve '' em falha
    //   (os chamadores testam length>50) e nunca dá throw.
    async _extractPdfText(url) {
      try {
        const eng=(window.__gdiMeggy&&window.__gdiMeggy.pdf&&window.__gdiMeggy.pdf.extractPdfText)||(window.gdiIsaPdf&&window.gdiIsaPdf.extractPdfText);
        if(typeof eng==='function'){
          const t=await eng(url);
          return String(t||'');
        }
      } catch (e) {
        console.warn('[Shell] PDF extract (motor) falhou:', e&&e.message||e);
        return '';
      }
      // Fallback: implementação própria antiga (sem OCR) se o motor não carregou.
      try {
        await Shell._ensurePdfLibs();
        if (!window.pdfjsLib) return '';
        const loadingTask = window.pdfjsLib.getDocument(url);
        const pdf = await loadingTask.promise;
        const maxPages = Math.min(pdf.numPages, 30);
        let text = '';
        for (let i = 1; i <= maxPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items.map(item => item.str).join(' ');
          text += pageText + '\n\n';
          if (text.length > 50000) break; // cap 50K chars
        }
        try { pdf.destroy(); } catch(_) {}
        return text;
      } catch (e) {
        console.warn('[Shell] PDF extract failed for', url, ':', e.message);
        return '';
      }
    },

    // renderMd: usa marked.js + DOMPurify se disponíveis, senão fallback escape+br
    async _renderMdAsync(txt) {
      if (!txt || typeof txt !== 'string') return '';
      await Shell._ensureMdLibs();
      return Shell._renderMd(txt);
    },

    // ★ v2.15.5 item 10: cadeia — marked+DOMPurify (CDN) → renderer
    //    vendored gdiRenderMd (mesma origem, seguro por construção) →
    //    escape+br (último recurso). Cobre títulos, listas, tabelas,
    //    código, citações, links etc. mesmo com o CDN fora.
    // ★ v2.15.11-B1-detector-recusa: detetor de RECUSA da IA — um texto
    //   de recusa ("não recebi o conteúdo da aula", "me forneça o
    //   material", "cole a transcrição"...) NÃO é um resumo e nunca pode
    //   ser guardado nem selado como tal (Passo 15: a recusa da Aula 09
    //   foi guardada no cache ISA e selada '✓ Resumo'). Padrões
    //   case-insensitive, sem acentos (o texto é normalizado), com
    //   tolerância a variações — NUNCA um único literal. O detetor lê o
    //   texto INTEIRO (o gancho determinístico pode preceder a recusa
    //   quando ela abre com '#' ou '⚠️' — ver battalionEnsureSummaryHook
    //   no worker). A MESMA lista vive no worker (isIsaRefusalText) e o
    //   harness compara as duas — manter sincronizadas. Falso positivo
    //   a evitar: um resumo REAL que menciona 'transcrição' ou
    //   'conteúdo da aula' no meio do texto legítimo — nenhum padrão
    //   casa a palavra isolada (todos exigem o verbo de recusa ou o
    //   pedido imperativo ao usuário).
    _isIsaRefusal(text) {
      if (!text || typeof text !== 'string') return false;
      const t = String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[*#_`>|]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!t) return false;
      const REFUSAL_PATTERNS = [
        /nao recebi (ainda )?(o |nenhum |qualquer )?(conteudo|material|texto|arquivo)/,
        /nao tenho (ainda )?(o |nenhum |qualquer )?(conteudo|material|texto|arquivo)/,
        /nao possuo (o |nenhum )?(conteudo|material|texto)/,
        /nao tenho acesso (ao |a )?(conteudo|material|transcricao|video|arquivo)/,
        /nao tive acesso (ao |a )?(conteudo|material|transcricao)/,
        /me passou apenas (as informacoes|os dados|o titulo|a identificacao|informacoes)/,
        /apenas as informacoes de identificacao/,
        /so (recebi|tenho) (as informacoes|o titulo|os dados)/,
        /nao enviou (o |nenhum )?(conteudo|material|texto)/,
        /(conteudo|material|arquivo|transcricao) nao (me )?foi (fornecido|enviado|disponibilizado|anexado)/,
        /nenhum (material|conteudo) (foi )?(fornecido|enviado|recebido|disponibilizado)/,
        /(conteudo|material) nao chegou/,
        /nao ha (conteudo|material) (disponivel|nesta|neste|na |no |suficiente|para)/,
        /sem o conteudo (da aula|necessario|para resumir|para gerar)/,
        /falta o conteudo (da aula|necessario|para)/,
        /preciso que voce (me )?(forneca|envie|cole|informe|anexe|compartilhe)/,
        /me forneca (o |a |seu |sua )?(material|conteudo|texto|transcricao)/,
        /forneca (o |a |seu |sua )?(material|conteudo|texto|transcricao)/,
        /cole (a|o) (transcricao|texto|material|conteudo)/,
        /envie (o|a) (conteudo|material|transcricao|texto)/,
        /informe (o|a) (conteudo|material|transcricao|texto)/,
        /anexe (o|a) (conteudo|material|arquivo|transcricao)/,
        /compartilhe (comigo )?(o |a )?(conteudo|material|transcricao|texto)/,
        /aguardando (o|a) (conteudo|material|transcricao)/,
        /nao consigo (gerar|criar|fazer|elaborar|produzir) (o resumo|um resumo|este resumo|as pilulas|o conteudo|o material)/,
        // ★ v2.15.12-B1-detector-pilulas: recusa de PÍLULAS (Passo 16) —
        //   "Desculpe, mas não posso criar "pílulas de revisão" para
        //   você. Posso, no entanto, ajudar com a criação de material
        //   de estudos... Qual é o assunto específico que você gostaria
        //   de revisar?" — o detetor da v2.15.11 NÃO a apanhava:
        //   "não posso" ≠ "não consigo" (nenhum padrão casava "posso"),
        //   e a pergunta final é o redirecionamento da recusa (o modelo
        //   devolve a pergunta ao usuário em vez do conteúdo). As duas
        //   últimas linhas estendem os objetos de "não foi possível" /
        //   "não é possível" (que só listavam conteúdo/material/
        //   transcrição) p/ pílulas/resumo/questões/flashcards.
        /nao (posso|consigo) (criar|gerar|fazer|elaborar|produzir|montar|fornecer|apresentar|resumir)/,
        /nao tenho como (criar|gerar|elaborar|produzir|fazer|resumir|montar)/,
        /nao (posso|consigo) (criar|gerar|elaborar|produzir|montar)[\\s\\S]{0,40}(pilulas|resumo|conteudo|material|flashcards|questoes)/,
        /(desculpe|sinto muito|infelizmente)[\\s\\S]{0,60}nao (posso|consigo)/,
        /posso,? (no entanto|entretanto|porem)?[\\s\\S]{0,80}ajudar com a criacao/,
        /assunto especifico que voce (gostaria|quer|deseja)/,
        /que voce (gostaria de|quer|deseja|precisa de) (revisar|estudar|aprender|ver)/,
        /nao foi possivel (gerar|criar|elaborar|produzir|fazer|montar)[\\s\\S]{0,120}(pilulas|resumo|questoes|flashcards)/,
        /nao e possivel (gerar|criar|resumir|elaborar)[\\s\\S]{0,120}(pilulas|resumo|questoes|flashcards)/,
        /nao foi possivel (resumir|fazer o resumo|fazer um resumo)/,
        /nao foi possivel (gerar|criar|elaborar|produzir|fazer|montar)[\s\S]{0,120}(conteudo|material|transcricao|texto da aula)/,
        /nao e possivel (gerar|criar|resumir|elaborar)[\s\S]{0,120}(conteudo|material|transcricao)/,
      ];
      return REFUSAL_PATTERNS.some((re) => re.test(t));
    },

    // ★ v2.15.13-B1-validacao-forma: validade ESTRUTURAL do conteúdo
    //   guardado/gerado, por campo — a autoridade, acima do detetor por
    //   padrões (primeira passagem, barato). Um texto que pede material
    //   ou não tem a forma esperada é recusa, seja qual for a redação
    //   (Passo 17: a nova recusa "eu preciso do conteúdo da aula" não
    //   diz "não posso/consigo" e o detetor devolve false — mas é prosa
    //   sem cabeçalhos nem bullets, por isso falha aqui). A MESMA função
    //   vive no worker (isIsaValidContent); manter sincronizadas. Resumo
    //   = texto longo com estrutura markdown; pílulas = lista com 3 ou
    //   mais itens; questões = array com 1 ou mais objetos com
    //   enunciado (string crua não-recusa passa, como antes — o batalhão
    //   guarda-a assim quando o parse falha).
    _isIsaValidContent(field, value) {
      if (field === 'questions') {
        if (Array.isArray(value)) {
          if (!value.length) return false;
          return value.some(function (q) {
            if (!q || typeof q !== 'object') return false;
            const s = q.statement || q.question || q.text;
            return typeof s === 'string' && !!s.trim();
          });
        }
        if (typeof value === 'string') return value.trim().length >= 10 && !Shell._isIsaRefusal(value);
        return false;
      }
      if (typeof value !== 'string' || !value) return false;
      if (Shell._isIsaRefusal(value)) return false;
      const lines = String(value).split('\n');
      let headings = 0, bullets = 0;
      for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim();
        if (/^#{1,3}\s+\S/.test(t)) headings++;
        else if (/^(-|\*|•)\s+\S/.test(t)) bullets++;
        else if (/^\d+[.)]\s+\S/.test(t)) bullets++;
      }
      if (field === 'summary') return value.length >= 200 && (headings >= 1 || bullets >= 3);
      if (field === 'mindmap') return value.length >= 50 && bullets >= 3;
      return false;
    },

    // ★ v2.15.11-B1-detector-recusa (selo): partes da cadeia por VALOR
    //   VÁLIDO, não por presença — resumo/pílulas que sejam recusa não
    //   selam; questões contam só como array (o batalhão pode guardar
    //   uma string crua quando o parse falha — o comprimento dela não é
    //   número de questões).
    _isaChainParts(fullCache) {
      const parts = [];
      if (!fullCache) return parts;
      // ★ v2.15.13-B2-selo-unificado: o selo é calculado pela MESMA
      //   validação por forma que as abas usam (ver _isaCachedField e
      //   _isaCachedRefusal) — uma recusa em prosa sem forma não sela,
      //   seja qual for a redação; questões contam só como array válido.
      if (Shell._isIsaValidContent('summary', fullCache.summary)) parts.push('✓ Resumo');
      if (Shell._isIsaValidContent('mindmap', fullCache.mindmap)) parts.push('✓ Pílulas');
      if (Array.isArray(fullCache.questions) && Shell._isIsaValidContent('questions', fullCache.questions)) parts.push('✓ ' + fullCache.questions.length + ' questões + flashcards');
      return parts;
    },

    // ★ v2.15.11-B1-detector-recusa (save): saneia UMA entrada antes do
    //   POST ao cache — recusa vira null, o resto passa intacto (um
    //   resumo recusado NÃO apaga as 10 questões boas geradas juntas).
    //   Questões em string crua não-recusa passam (o batalhão guarda-as
    //   assim quando o parse falha; exibem-se como markdown).
    _isaSanitizeEntry(entry) {
      const out = { summary: null, questions: null, mindmap: null, lessonName: (entry && entry.lessonName) || '' };
      if (!entry) return out;
      // ★ v2.15.13-B4-save-forma-shell: o POST rejeita por FORMA, não só por
      //   padrão — uma recusa em prosa sem estrutura não é gravada.
      if (typeof entry.summary === 'string' && entry.summary && Shell._isIsaValidContent('summary', entry.summary)) out.summary = entry.summary;
      if (typeof entry.mindmap === 'string' && entry.mindmap && Shell._isIsaValidContent('mindmap', entry.mindmap)) out.mindmap = entry.mindmap;
      if (Array.isArray(entry.questions) && Shell._isIsaValidContent('questions', entry.questions)) out.questions = entry.questions;
      else if (typeof entry.questions === 'string' && entry.questions && Shell._isIsaValidContent('questions', entry.questions)) out.questions = entry.questions;
      return out;
    },

    // ★ v2.15.12-B2a-pilulas-ambar-helper: o campo em cache é uma RECUSA?
    //   Ponto único da decisão do estado âmbar da aba Pílulas (B2b):
    //   devolve true só quando o campo existe em cache como string e é
    //   INVÁLIDO — recusa por padrão OU sem a forma esperada (★
    //   v2.15.13-B2-selo-unificado-ambar-helper: a MESMA validação por forma que o
    //   selo). Um campo ausente/null ou um valor real devolve false (a
    //   aba cai na geração, comportamento B9).
    _isaCachedRefusal(entry, field) {
      if (!entry) return false;
      const v = entry[field];
      return typeof v === 'string' && !!v && !Shell._isIsaValidContent(field, v);
    },

    _renderMd(txt) {
      if (!txt || typeof txt !== 'string') return '';
      if (window.marked) {
        try {
          const html = window.marked.parse(txt);
          if (window.DOMPurify) {
            try { return window.DOMPurify.sanitize(html); } catch (_) {}
          }
          if (typeof window.gdiRenderMd === 'function') {
            try { return window.gdiRenderMd(txt); } catch (_) {}
          }
          return Shell._esc(txt).replace(/\n/g, '<br>');
        } catch (_) {}
      }
      if (typeof window.gdiRenderMd === 'function') {
        try { return window.gdiRenderMd(txt); } catch (_) {}
      }
      return Shell._esc(txt).replace(/\n/g, '<br>');
    },

    // _renderISAResult: toolbar production-faithful (gradient pink→cyan, 4 buttons, cache badge, chain badge)
    async _renderISAResult(type, content, bodyEl, lessonName, fromCache, fullCache) {
      const isaField = type.replace('isa-', '');
      const typeLabel = type === 'isa-summary' ? 'Resumo' : type === 'isa-questions' ? 'Questões' : type === 'isa-mindmap' ? 'Pílulas' : 'Flashcards';
      const icon = type === 'isa-summary' ? 'bi-stars' : type === 'isa-questions' ? 'bi-patch-question' : type === 'isa-mindmap' ? 'bi-capsule' : 'bi-card-text';
      window._lastIsaText = typeof content === 'string' ? content : '';
      window._lastIsaType = type;
      window._lastIsaLabel = typeLabel;
      window._lastIsaLesson = lessonName;

      // ★ Garantir marked.js carregado para renderizar markdown rico
      if (typeof content === 'string') {
        await Shell._ensureMdLibs();
      }

      const cacheBadge = fromCache
        ? '<span class="meggy-cache-badge"><i class="bi bi-cloud-check"></i> do cache do Drive</span>'
        : '<span class="meggy-cache-badge"><i class="bi bi-check2-circle"></i> salvo no Drive + pasta da aula</span>';

      // Chain badge (verde) — mostra o que foi gerado em cadeia
      // ★ v2.15.11-B2-selo-cadeia: o selo é por VALOR VÁLIDO (ver
      //   _isaChainParts), não por presença — o selo antigo
      //   (`if (fullCache.summary)`) selava a recusa da Aula 09 como
      //   '✓ Resumo' (Passo 15). Uma recusa em cache NÃO mostra
      //   '✓ Resumo'/'✓ Pílulas'; mostra o aviso âmbar 'Sem resumo
      //   válido' e sugere Regerar. O resto do selo não muda: um resumo
      //   real continua a selar '✓ Resumo'.
      let chainBadge = '';
      if (fullCache) {
        const parts = Shell._isaChainParts(fullCache);
        if (parts.length > 1) {
          chainBadge = '<div class="meggy-chain-badge"><i class="bi bi-check-circle-fill"></i> <b>Gerado em cadeia:</b> ' + parts.join(' · ') + '</div>';
        }
        // ★ v2.15.13-B2-selo-unificado-ambar-render: o âmbar usa a MESMA validação
        //   por forma que o selo — um campo presente mas sem forma válida
        //   avisa; um campo ausente não (nunca gerado ≠ recusa).
        const _refusedSummary = typeof fullCache.summary === 'string' && fullCache.summary && !Shell._isIsaValidContent('summary', fullCache.summary);
        const _refusedMindmap = typeof fullCache.mindmap === 'string' && fullCache.mindmap && !Shell._isIsaValidContent('mindmap', fullCache.mindmap);
        if (_refusedSummary || _refusedMindmap) {
          const _refusedLabel = (_refusedSummary && _refusedMindmap) ? 'resumo nem pílulas válidos' : _refusedSummary ? 'resumo válido' : 'pílulas válidas';
          chainBadge += '<div class="meggy-chain-badge" style="background:rgba(255,193,7,.08);border-color:rgba(255,193,7,.35);color:#ffc107;"><i class="bi bi-exclamation-triangle"></i> <b>Sem ' + _refusedLabel + ':</b> o conteúdo guardado é uma recusa da IA (sem material da aula). Toque em <b>Regerar</b> para gerar de novo.</div>';
        }
      }

      // TTS state
      let ttsPlaying = false;
      let ttsUtter = null;

      function renderBody() {
        if (type === 'isa-questions' && Array.isArray(content)) {
          // Questões: render como lista estática (quiz interativo fica na aba Questões)
          let h = '';
          content.forEach((q, i) => {
            const isTF = q.type === 'tf';
            const correctText = isTF ? ((q.correct === 1 || q.correct === '1') ? 'Certo' : 'Errado') : (q.options && q.options[q.correct] ? String.fromCharCode(65 + q.correct) + ') ' + q.options[q.correct] : '');
            h += '<div style="margin-bottom:16px;padding:14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;">';
            h += '<div class="meggy-quiz-type-badge">' + (isTF ? 'CEBRASPE — Certo ou Errado' : 'Múltipla Escolha') + ' · Q' + (i+1) + '</div>';
            h += '<div style="color:#f0f6fc;font-size:14px;line-height:1.6;margin-bottom:10px;">' + Shell._esc(q.statement) + '</div>';
            if (q.options && !isTF) {
              h += '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;">';
              q.options.forEach((opt, oi) => {
                const isCorrect = (oi === q.correct);
                h += '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:6px;' + (isCorrect ? 'background:rgba(93,222,218,0.12);border:1px solid rgba(93,222,218,0.3);' : 'background:rgba(255,255,255,0.02);') + '"><b style="color:' + (isCorrect ? '#5ddeda' : '#ff8b9f') + ';">' + String.fromCharCode(65 + oi) + ')</b><span style="color:#e6edf3;font-size:13px;">' + Shell._esc(opt) + '</span>' + (isCorrect ? ' <i class="bi bi-check-circle" style="color:#5ddeda;"></i>' : '') + '</div>';
              });
              h += '</div>';
            } else if (isTF) {
              h += '<div style="display:flex;gap:8px;margin-bottom:10px;"><span style="padding:6px 12px;border-radius:6px;' + ((q.correct === 1 || q.correct === '1') ? 'background:rgba(93,222,218,0.12);border:1px solid rgba(93,222,218,0.3);color:#5ddeda;' : 'background:rgba(255,255,255,0.02);color:#9aa4b8;') + '"><b>✓ Certo</b></span><span style="padding:6px 12px;border-radius:6px;' + ((q.correct === 0 || q.correct === '0') ? 'background:rgba(255,139,159,0.12);border:1px solid rgba(255,139,159,0.3);color:#ff8b9f;' : 'background:rgba(255,255,255,0.02);color:#9aa4b8;') + '"><b>✗ Errado</b></span></div>';
            }
            if (q.explanation) h += '<div style="font-size:12px;color:#c9d1d9;margin-bottom:6px;"><b>💡 Explicação:</b> ' + Shell._esc(q.explanation) + '</div>';
            if (q.legalText) h += '<div style="font-size:11px;color:#9aa4b8;border-left:2px solid #ff8b9f;padding-left:8px;margin-bottom:4px;">📜 ' + Shell._esc(q.legalText) + '</div>';
            if (q.fundamentacao) h += '<div style="font-size:11px;color:#9aa4b8;"><b>📚 Fundamentação:</b> ' + Shell._esc(q.fundamentacao) + '</div>';
            h += '</div>';
          });
          return h;
        }
        if (type === 'isa-flashcards' && Array.isArray(content)) {
          let h = '';
          content.forEach((c, i) => {
            h += '<div style="margin-bottom:12px;padding:14px;background:linear-gradient(135deg,rgba(255,139,159,0.06),rgba(93,222,218,0.06));border:1px solid rgba(255,139,159,0.2);border-radius:10px;">';
            h += '<div style="font-size:11px;color:#ff8b9f;font-weight:700;margin-bottom:6px;">🃏 CARTÃO ' + (i+1) + '</div>';
            h += '<div style="color:#f0f6fc;font-size:14px;margin-bottom:8px;"><b>F:</b> ' + Shell._esc(c.f) + '</div>';
            h += '<div style="color:#5ddeda;font-size:13px;white-space:pre-wrap;"><b>V:</b> ' + Shell._esc(c.b) + '</div>';
            h += '</div>';
          });
          return h;
        }
        // String (resumo, pílulas)
        return Shell._renderMd(content);
      }

      bodyEl.innerHTML = '<div class="gdi-mat-isa-result" style="max-width:760px;margin:0 auto;">' +
        chainBadge +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:14px;padding:12px 16px;background:linear-gradient(135deg,rgba(255,139,159,.12),rgba(93,222,218,.06));border:1px solid rgba(255,139,159,.2);border-radius:14px;flex-wrap:wrap;">' +
          '<div style="display:flex;align-items:center;gap:8px;min-width:0;">' +
            '<i class="bi ' + icon + '" style="color:#ff8b9f;font-size:20px;flex:none;"></i>' +
            '<b style="color:#f0f6fc;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + typeLabel + ' Meggy 🐩 · ' + Shell._esc(lessonName || '') + '</b>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
            cacheBadge +
            (type === 'isa-summary' || type === 'isa-mindmap' ? '<button id="gdi-isa-regen" title="Regerar" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#e6edf3;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;"><i class="bi bi-arrow-clockwise"></i> Regerar</button>' : '') +
            '<button id="gdi-isa-dl" title="Baixar em PDF" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#e6edf3;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;"><i class="bi bi-file-earmark-pdf"></i> PDF</button>' +
            '<button id="gdi-isa-copy" title="Copiar" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#e6edf3;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;"><i class="bi bi-clipboard"></i> Copiar</button>' +
            (type === 'isa-summary' || type === 'isa-mindmap' ? '<button id="gdi-isa-tts" title="Ouvir em voz alta" style="background:#ff8b9f;border:none;color:#000;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;font-weight:600;"><i class="bi bi-volume-up"></i> Ouvir</button>' : '') +
          '</div>' +
        '</div>' +
        '<div class="gdi-isa-summary-body" id="gdi-isa-summary-text" style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:20px 24px;">' +
          renderBody() +
        '</div>' +
      '</div>';

      // Wire buttons
      const dl = bodyEl.querySelector('#gdi-isa-dl');
      if (dl) dl.onclick = () => window._downloadIsaAsPdf(typeLabel);
      const copy = bodyEl.querySelector('#gdi-isa-copy');
      if (copy) copy.onclick = () => {
        const text = bodyEl.querySelector('#gdi-isa-summary-text').innerText;
        navigator.clipboard.writeText(text).then(() => { copy.innerHTML = '<i class="bi bi-check2"></i> Copiado!'; setTimeout(() => { copy.innerHTML = '<i class="bi bi-clipboard"></i> Copiar'; }, 2000); });
      };
      const regen = bodyEl.querySelector('#gdi-isa-regen');
      if (regen) regen.onclick = () => {
        // Limpar cache e regerar
        (async () => {
          try {
            const _rk = (Shell.state.currentFolderPath || '') + (Shell.state.playerPlaylist?.[Shell.state.playerIndex]?.name || '');
            let _drk; try { _drk = decodeURIComponent(_rk); } catch(_) { _drk = _rk; }
            const cacheKey = encodeURI(_drk);
            await fetch('/api/ai/cache', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ key: cacheKey, summary: null, questions: null, mindmap: null, lessonName: '' }) });
          } catch (e) {}
          // Re-trigger showISA
          const tabs = document.querySelectorAll('.gdi-mat-tab');
          const isaTab = Array.from(tabs).find(t => t.dataset.mat === type);
          if (isaTab) isaTab.click();
        })();
      };
      const tts = bodyEl.querySelector('#gdi-isa-tts');
      if (tts) {
        tts.onclick = () => {
          if (ttsPlaying) {
            // Parar
            if (window.gdiTTS && typeof window.gdiTTS.stop === 'function') window.gdiTTS.stop();
            if (window.speechSynthesis) window.speechSynthesis.cancel();
            if (window._meggyTtsAudio) { window._meggyTtsAudio.pause(); window._meggyTtsAudio = null; }
            ttsPlaying = false;
            tts.innerHTML = '<i class="bi bi-volume-up"></i> Ouvir';
            return;
          }
          const text = bodyEl.querySelector('#gdi-isa-summary-text').innerText;
          if (!text || !text.trim()) return;
          ttsPlaying = true;
          tts.innerHTML = '<i class="bi bi-stop-circle"></i> Parar';
          if (window.gdiTTS && typeof window.gdiTTS.play === 'function') {
            window.gdiTTS.play(text, { onEnd: function () { ttsPlaying = false; tts.innerHTML = '<i class="bi bi-volume-up"></i> Ouvir'; } });
            return;
          }
          Shell._speakNatural(text, function() {
            ttsPlaying = false;
            tts.innerHTML = '<i class="bi bi-volume-up"></i> Ouvir';
          });
        };
      }
    },

    // ═══ _speakNatural: TTS com voz natural pt-BR ═══
    // Estratégia: usa speechSynthesis do navegador com seleção da melhor voz pt-BR.
    // - Espera vozes carregarem (voiceschanged event)
    // - Prefere vozes Google (mais naturais no Chrome) > Microsoft > outras
    // - Limpa markdown do texto
    // - Divide em frases (navegadores cortam utterances muito longas)
    // - Fala sequencialmente com chain de onend
    _ttsVoiceCache: null,
    _getBestPtBrVoice() {
      if (Shell._ttsVoiceCache) return Shell._ttsVoiceCache;
      if (!('speechSynthesis' in window)) return null;
      var voices = speechSynthesis.getVoices();
      if (!voices || voices.length === 0) return null;
      // Filtrar vozes portuguesas
      var ptVoices = voices.filter(function(v) {
        return v.lang === 'pt-BR' || v.lang === 'pt-PT' || v.lang === 'pt_BR' || v.lang.startsWith('pt');
      });
      if (ptVoices.length === 0) return null;
      // Prioridade: Google (mais natural) > Microsoft (natural) > Lucia > outras
      var priority = [
        /google.*portuguese/i, /google.*pt/i,
        /microsoft.*maria/i, /microsoft.*lucia/i, /microsoft.*daniel/i,
        /natural/i, /neural/i,
        /lucia/i, /felipe/i, /maria/i
      ];
      for (var i = 0; i < priority.length; i++) {
        var match = ptVoices.find(function(v) { return priority[i].test(v.name); });
        if (match) { Shell._ttsVoiceCache = match; return match; }
      }
      // Fallback: primeira voz pt-BR
      Shell._ttsVoiceCache = ptVoices[0];
      return ptVoices[0];
    },

    _cleanTextForTTS(text) {
      // Remove markdown e caracteres que seriam lidos literalmente
      return text
        .replace(/^#{1,6}\s+/gm, '')        // headers
        .replace(/\*\*(.+?)\*\*/g, '$1')    // bold
        .replace(/\*(.+?)\*/g, '$1')        // italic
        .replace(/`{1,3}(.+?)`{1,3}/g, '$1') // code
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
        .replace(/^[-*•]\s+/gm, '')         // bullets
        .replace(/^\d+\.\s+/gm, '')         // numbered lists
        .replace(/>\s+/gm, '')              // blockquotes
        .replace(/---+/g, '')               // hr
        .replace(/\|/g, ' ')               // table pipes
        .replace(/\n{3,}/g, '\n\n')         // collapse newlines
        .replace(/\s+/g, ' ')
        .trim();
    },

    _splitIntoSentences(text, maxLen) {
      maxLen = maxLen || 200;
      var sentences = text.match(/[^.!?…]+[.!?…]+/g) || [text];
      var chunks = [];
      var current = '';
      for (var i = 0; i < sentences.length; i++) {
        if ((current + sentences[i]).length <= maxLen) {
          current += sentences[i];
        } else {
          if (current) chunks.push(current.trim());
          // Hard-split if single sentence is too long
          if (sentences[i].length > maxLen) {
            var parts = sentences[i].match(new RegExp('[\\s\\S]{1,' + maxLen + '}', 'g')) || [];
            chunks.push.apply(chunks, parts);
            current = '';
          } else {
            current = sentences[i];
          }
        }
      }
      if (current) chunks.push(current.trim());
      return chunks.filter(function(c) { return c.length > 0; });
    },

    async _speakNatural(text, onDone) {
      var cleaned = Shell._cleanTextForTTS(text);
      if (!cleaned) { if (onDone) onDone(); return; }

      // Verificar se speechSynthesis está disponível
      if (!('speechSynthesis' in window)) {
        if (onDone) onDone();
        return;
      }

      // Esperar vozes carregarem se ainda não carregaram
      var voices = speechSynthesis.getVoices();
      if (!voices || voices.length === 0) {
        await new Promise(function(resolve) {
          speechSynthesis.onvoiceschanged = function() { resolve(); };
          setTimeout(resolve, 3000); // timeout 3s
        });
      }

      var voice = Shell._getBestPtBrVoice();
      var chunks = Shell._splitIntoSentences(cleaned, 200);

      function speakChunk(idx) {
        if (idx >= chunks.length) {
          if (onDone) onDone();
          return;
        }
        var utter = new SpeechSynthesisUtterance(chunks[idx]);
        if (voice) {
          utter.voice = voice;
          utter.lang = voice.lang;
        } else {
          utter.lang = 'pt-BR';
        }
        utter.rate = 0.95;  // levemente mais lento para clareza
        utter.pitch = 1.0;
        utter.volume = 1.0;
        utter.onend = function() { speakChunk(idx + 1); };
        utter.onerror = function() { speakChunk(idx + 1); };
        speechSynthesis.speak(utter);
      }

      speechSynthesis.cancel(); // parar qualquer fala anterior
      speakChunk(0);
    },

    // _renderFlashcardDeck: sessão de estudo com SRS (replica runFlashcardSession)
    _renderFlashcardDeck(bodyEl, data) {
      const cards = (data && data.flashcards) || [];
      const lessonName = (data && data.lessonName) || '';
      if (cards.length === 0) {
        bodyEl.innerHTML = '<div class="gdi-mat-isa-result" style="text-align:center;padding:40px;">' +
          '<div style="font-size:48px;margin-bottom:12px;">🃏</div>' +
          '<div style="color:#ff8b9f;font-weight:600;margin-bottom:8px;">Nenhum flashcard gerado</div>' +
          '<div style="color:#9aa4b8;font-size:13px;">Os flashcards são criados automaticamente a partir das questões geradas.</div>' +
        '</div>';
        return;
      }
      let idx = 0;
      let hits = 0, misses = 0;
      let flipped = false;

      function draw() {
        const c = cards[idx];
        if (!c) return;
        flipped = false;
        const front = Shell._esc(String(c.f || '').slice(0, 300));
        const backHtml = Shell._esc(String(c.b || '').slice(0, 400)).replace(/\n/g, '<br>');
        bodyEl.innerHTML = '<div class="gdi-mat-isa-result" style="max-width:760px;margin:0 auto;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;">' +
            '<span style="color:#8b949e;font-size:12px;">' + Shell._esc(lessonName) + ' · ' + (idx + 1) + '/' + cards.length + '</span>' +
            '<span style="color:#8b949e;font-size:12px;">✓ ' + hits + ' ✗ ' + misses + '</span>' +
          '</div>' +
          '<div style="position:relative;perspective:1500px;height:min(340px,52vh);height:min(340px,52dvh);max-width:560px;margin:0 auto;cursor:pointer;" id="meggy-fc-card">' +
            '<div style="position:absolute;inset:0;transform-style:preserve-3d;transition:transform .55s cubic-bezier(.4,0,.2,1);" id="meggy-fc-inner">' +
              '<div class="meggy-flashcard-face meggy-flashcard-front" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:18px 16px;border-radius:12px;background:linear-gradient(135deg,rgba(255,139,159,.14),rgba(192,38,211,.08));border:1.5px solid rgba(255,139,159,.4);backface-visibility:hidden;">' +
                '<div style="font-size:12px;font-weight:700;color:#ff8b9f;display:flex;align-items:center;gap:4px;"><i class="bi bi-question-circle"></i> Pergunta</div>' +
                '<div style="font-size:16px;line-height:1.55;color:#f0f6fc;text-align:center;">' + front + '</div>' +
                '<div style="font-size:12px;color:#8b949e;font-style:italic;"><i class="bi bi-arrow-repeat"></i> clique para virar</div>' +
              '</div>' +
              '<div class="meggy-flashcard-face meggy-flashcard-back" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:18px 16px;border-radius:12px;background:linear-gradient(135deg,rgba(93,222,218,.14),rgba(63,185,80,.08));border:1.5px solid rgba(93,222,218,.4);transform:rotateY(180deg);backface-visibility:hidden;">' +
                '<div style="font-size:12px;font-weight:700;color:#5ddeda;display:flex;align-items:center;gap:4px;"><i class="bi bi-check-circle"></i> Resposta</div>' +
                '<div style="font-size:14px;line-height:1.55;color:#e6edf3;text-align:left;overflow-y:auto;max-height:240px;">' + backHtml + '</div>' +
                '<div style="font-size:12px;color:#8b949e;font-style:italic;"><i class="bi bi-arrow-repeat"></i> clique para voltar</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div id="meggy-fc-grade-panel"></div>' +
          '<div style="display:flex;justify-content:space-between;align-items:center;padding-top:16px;margin-top:8px;border-top:1px solid rgba(255,255,255,.08);">' +
            '<button class="meggy-header-btn" id="meggy-fc-prev" ' + (idx === 0 ? 'disabled' : '') + ' style="font-size:13px;"><i class="bi bi-chevron-left"></i> Anterior</button>' +
            '<button class="meggy-header-btn" id="meggy-fc-next" style="font-size:13px;background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;border:none;">' + (idx < cards.length - 1 ? 'Próximo' : 'Finalizar') + ' <i class="bi bi-chevron-right"></i></button>' +
          '</div>' +
        '</div>';

        const card = bodyEl.querySelector('#meggy-fc-card');
        const inner = bodyEl.querySelector('#meggy-fc-inner');
        const gradePanel = bodyEl.querySelector('#meggy-fc-grade-panel');

        card.onclick = () => {
          flipped = !flipped;
          inner.style.transform = flipped ? 'rotateY(180deg)' : '';
          if (flipped && !gradePanel.innerHTML) {
            // Reveal SRS grade panel after flip
            gradePanel.innerHTML = '<div class="meggy-fc-grade">' +
              '<p>Como foi?</p>' +
              '<div class="meggy-fc-grade-btns">' +
                '<button class="meggy-fc-grade-btn again" data-grade="1"><i class="bi bi-arrow-counterclockwise"></i> Não sabia<br><small>+1d</small></button>' +
                '<button class="meggy-fc-grade-btn hard" data-grade="2"><i class="bi bi-dash-circle"></i> Quase<br><small>+3d</small></button>' +
                '<button class="meggy-fc-grade-btn good" data-grade="3"><i class="bi bi-check-circle"></i> Sabia<br><small>+3d</small></button>' +
                '<button class="meggy-fc-grade-btn easy" data-grade="4"><i class="bi bi-stars"></i> Fácil<br><small>+10d</small></button>' +
              '</div>' +
              '<div class="meggy-fc-shortcuts">Atalhos: 1 2 3 4 · Espaço vira</div>' +
            '</div>';
            gradePanel.querySelectorAll('.meggy-fc-grade-btn').forEach(btn => {
              btn.onclick = (e) => {
                e.stopPropagation();
                const grade = parseInt(btn.dataset.grade, 10);
                if (grade <= 2) misses++; else hits++;
                next();
              };
            });
          } else if (!flipped) {
            gradePanel.innerHTML = '';
          }
        };

        function next() {
          if (idx < cards.length - 1) { idx++; draw(); }
          else { showResult(); }
        }
        bodyEl.querySelector('#meggy-fc-next').onclick = next;
        bodyEl.querySelector('#meggy-fc-prev').onclick = () => { if (idx > 0) { idx--; draw(); } };

        // Keyboard shortcuts
        if (bodyEl._fcKeyHandler) document.removeEventListener('keydown', bodyEl._fcKeyHandler);
        bodyEl._fcKeyHandler = (e) => {
          if (e.key === ' ') { e.preventDefault(); card.click(); }
          else if (e.key === '1' || e.key === '2' || e.key === '3' || e.key === '4') {
            const btn = gradePanel.querySelector('.meggy-fc-grade-btn[data-grade="' + e.key + '"]');
            if (btn) btn.click();
          } else if (e.key === 'ArrowRight') { next(); }
          else if (e.key === 'ArrowLeft') { if (idx > 0) { idx--; draw(); } }
        };
        document.addEventListener('keydown', bodyEl._fcKeyHandler);
      }

      function showResult() {
        if (bodyEl._fcKeyHandler) { document.removeEventListener('keydown', bodyEl._fcKeyHandler); bodyEl._fcKeyHandler = null; }
        const total = cards.length;
        const pct = total > 0 ? Math.round(hits / total * 100) : 0;
        bodyEl.innerHTML = '<div class="gdi-mat-isa-result" style="max-width:760px;margin:0 auto;text-align:center;padding:40px 20px;">' +
          '<div style="font-size:48px;margin-bottom:12px;">' + (pct >= 60 ? '🎉' : '📚') + '</div>' +
          '<h3 style="color:#ff8b9f;font-family:Poppins,sans-serif;">Sessão concluída!</h3>' +
          '<p style="color:#e6edf3;font-size:16px;margin-top:8px;"><b style="color:' + (pct >= 60 ? '#3fb950' : '#ff8b8b') + ';">' + hits + '/' + total + '</b> · ' + pct + '% acerto</p>' +
          '<p style="color:#8b949e;font-size:12px;">Matéria: ' + Shell._esc(lessonName) + '</p>' +
          '<div style="display:flex;gap:8px;justify-content:center;margin-top:18px;flex-wrap:wrap;">' +
            '<button class="meggy-header-btn" onclick="Shell.state.playerPlaylist && Shell.views._playVideoInline(Shell.state.playerPlaylist[Shell.state.playerIndex].link, Shell.state.playerPlaylist[Shell.state.playerIndex].name, Shell.state.playerPlaylist, Shell.state.playerIndex)" style="background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;border:none;"><i class="bi bi-arrow-repeat"></i> Voltar ao player</button>' +
          '</div>' +
        '</div>';
      }

      draw();
    },

  };

  // ─── Export to window ───
  // ★ Função para baixar MD como PDF (replica de produção — downloadAsPdf gdi-meggy.js:761)
  window._downloadMdAsPdf = function(name) {
    const text = window._lastMdText || '';
    const lesson = name || 'Resumo';
    const html = Shell._renderMd(text);
    const w = window.open('', '_blank');
    if (!w) { Shell.views._v215Toast('Permita pop-ups para baixar o PDF'); return; }
    w.document.write('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + lesson + ' — Resumo Meggy</title><style>');
    w.document.write('@page{margin:2cm;size:A4;}');
    w.document.write('*{box-sizing:border-box;}');
    w.document.write('body{font-family:Georgia,"Times New Roman",serif;color:#1a1a1a;line-height:1.7;max-width:210mm;margin:0 auto;padding:20px;}');
    w.document.write('h1{font-family:Helvetica,sans-serif;font-size:22px;color:#c026d3;border-bottom:2px solid #ff8b9f;padding-bottom:8px;margin-bottom:6px;}');
    w.document.write('.meta{font-family:Helvetica,sans-serif;font-size:11px;color:#666;margin-bottom:24px;}');
    w.document.write('h2{font-family:Helvetica,sans-serif;font-size:17px;color:#1a1a1a;margin-top:24px;border-left:3px solid #ff8b9f;padding-left:10px;}');
    w.document.write('h3{font-family:Helvetica,sans-serif;font-size:14px;color:#333;margin-top:18px;}');
    w.document.write('h4{font-family:Helvetica,sans-serif;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:.05em;}');
    w.document.write('p{margin:8px 0;text-align:justify;}');
    w.document.write('ul,ol{margin:8px 0;padding-left:24px;}');
    w.document.write('li{margin:4px 0;}');
    w.document.write('code{background:#f4f4f4;padding:2px 6px;border-radius:3px;font-family:"Courier New",monospace;font-size:12px;}');
    w.document.write('pre{background:#f4f4f4;padding:12px;border-radius:6px;overflow-x:auto;font-size:11px;}');
    w.document.write('blockquote{border-left:3px solid #ff8b9f;margin:12px 0;padding:4px 16px;color:#555;font-style:italic;}');
    w.document.write('strong{color:#1a1a1a;}');
    w.document.write('table{border-collapse:collapse;width:100%;margin:10px 0;}');
    w.document.write('th,td{border:1px solid #ddd;padding:8px;text-align:left;}');
    w.document.write('th{background:#f4f4f4;font-weight:600;}');
    w.document.write('@media print{body{padding:0;}}');
    w.document.write('</style></head><body>');
    w.document.write('<h1>' + lesson + '</h1>');
    w.document.write('<div class="meta">Resumo gerado pela Meggy 🐩 · ' + new Date().toLocaleDateString('pt-BR') + '</div>');
    w.document.write(html);
    w.document.write('<script>window.onload=function(){setTimeout(function(){window.print();},300);};</script>');
    w.document.write('</body></html>');
    w.document.close();
  };

  window.MeggyShell = Shell;
  // ★ _downloadIsaAsPdf (replica de produção — mesmo formato A4 + Georgia serif)
  window._downloadIsaAsPdf = function(label) {
    const text = window._lastIsaText || '';
    const lesson = window._lastIsaLesson || label || 'Conteúdo';
    const typeLabel = label || 'Resumo';
    const isQuestions = (window._lastIsaType === 'isa-questions');
    const isFlashcards = (window._lastIsaType === 'isa-flashcards');
    let html;
    if (isQuestions && Array.isArray(window._lastIsaText)) {
      // Não usado — questions são renderizadas como HTML no _renderISAResult
      html = '<p>Ver na tela.</p>';
    } else if (isFlashcards && Array.isArray(window._lastIsaText)) {
      html = '<p>Ver na tela.</p>';
    } else {
      html = Shell._renderMd(text);
    }
    const w = window.open('', '_blank');
    if (!w) { Shell.views._v215Toast('Permita pop-ups para baixar o PDF'); return; }
    w.document.write('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + lesson + ' — ' + typeLabel + ' Meggy</title><style>');
    w.document.write('@page{margin:2cm;size:A4;}');
    w.document.write('*{box-sizing:border-box;}');
    w.document.write('body{font-family:Georgia,"Times New Roman",serif;color:#1a1a1a;line-height:1.7;max-width:210mm;margin:0 auto;padding:20px;}');
    w.document.write('h1{font-family:Helvetica,sans-serif;font-size:22px;color:#c026d3;border-bottom:2px solid #ff8b9f;padding-bottom:8px;margin-bottom:6px;}');
    w.document.write('.meta{font-family:Helvetica,sans-serif;font-size:11px;color:#666;margin-bottom:24px;}');
    w.document.write('h2{font-family:Helvetica,sans-serif;font-size:17px;color:#1a1a1a;margin-top:24px;border-left:3px solid #ff8b9f;padding-left:10px;}');
    w.document.write('h3{font-family:Helvetica,sans-serif;font-size:14px;color:#333;margin-top:18px;}');
    w.document.write('p{margin:8px 0;text-align:justify;}');
    w.document.write('ul,ol{margin:8px 0;padding-left:24px;}');
    w.document.write('li{margin:4px 0;}');
    w.document.write('blockquote{border-left:3px solid #ff8b9f;margin:12px 0;padding:4px 16px;color:#555;font-style:italic;}');
    w.document.write('strong{color:#1a1a1a;}');
    w.document.write('@media print{body{padding:0;}}');
    w.document.write('</style></head><body>');
    w.document.write('<h1>' + typeLabel + ' · ' + lesson + '</h1>');
    w.document.write('<div class="meta">' + typeLabel + ' gerado pela Meggy 🐩 · ' + new Date().toLocaleDateString('pt-BR') + '</div>');
    w.document.write(html);
    w.document.write('<script>window.onload=function(){setTimeout(function(){window.print();},300);};</script>');
    w.document.write('</body></html>');
    w.document.close();
  };

  window.Shell = Shell; // ★ Alias para onclick inline


  // ─── Auto-init ───
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Shell.init());
  } else {
    Shell.init();
  }

  console.log('[Meggy Shell] script loaded, waiting for modules...');
})();







