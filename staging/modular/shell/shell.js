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

      // Search — redirect to /0:search?q=... (GDIndex search)
      const searchInput = document.getElementById('meggy-search-input');
      searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && searchInput.value.trim()) {
          const q = encodeURIComponent(searchInput.value.trim());
          Shell.router.navigate('/0:search?q=' + q);
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
        '/plano': 'plano'
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

      // Scroll to top on view change
      main.scrollTop = 0;

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
              const driveIdx = h.path?.match(/^\/(\d+):/)?.[1];
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
            return '<div class="meggy-card" data-course="' + Shell._esc(c.coursePath || '') + '">' +
              '<div class="meggy-card-icon">' + Shell._esc(c.icon || '📚') + '</div>' +
              '<div class="meggy-card-title">' + name + '</div>' +
              '<div class="meggy-card-meta">Curso em destaque</div>' +
            '</div>';
          }).join('') + '</div></div>';
          sec.querySelectorAll('.meggy-card[data-course]').forEach(card => {
            card.onclick = () => {
              const cp = card.dataset.course;
              if (cp) {
                Shell.router.navigate('/drives');
                setTimeout(() => Shell.views._renderDrives(cp), 50);
              }
            };
          });
        }).catch(() => {});
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
            if (window.__gdiStudy && window.__gdiStudy.courses && window.__gdiStudy.courses.renderCursos) {
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
                const r = await fetch('/api/courses/unified', { headers: { 'Accept': 'application/json' }, credentials: 'include' });
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
                        const meta = badge + (it.kind === 'concurso' ? '' : ' · ' + (it.total || 0) + ' aulas') + (it.percent != null && it.total ? ' · ' + it.percent + '% concluído' : '') + (it.examDate ? ' · 📅 ' + it.examDate : '');
                        const idAttr = it.kind === 'concurso' ? ' data-concurso-id="' + Shell._esc(it.concursoId) + '"' : ' data-course="' + Shell._esc(it.coursePath || '') + '"';
                        const rmBtn = it.kind === 'featured' ? '' :
                          '<button class="' + (it.kind === 'concurso' ? 'concurso-remove-btn' : 'course-remove-btn') + '" data-' + (it.kind === 'concurso' ? 'concurso-id="' + Shell._esc(it.concursoId) + '" data-concurso-name="' + Shell._esc(name) + '"' : 'course-path="' + Shell._esc(it.coursePath || '') + '" data-course-name="' + Shell._esc(name) + '"') + ' title="Remover" style="position:absolute;top:8px;right:8px;background:transparent;border:0;color:#8b949e;cursor:pointer;font-size:14px;padding:2px 6px;border-radius:6px;">✕</button>';
                        return '<div class="meggy-card"' + idAttr + ' style="cursor:pointer;position:relative;">' + rmBtn +
                          '<div class="meggy-card-icon">' + Shell._esc(it.icon || '📚') + '</div>' +
                          '<div class="meggy-card-title">' + Shell._esc(name) + '</div>' +
                          '<div class="meggy-card-meta">' + Shell._esc(meta) + '</div>' +
                        '</div>';
                      };
                    // ★ v2.15.2 (K): grade inline — o fallback dependia do
                    //   shell.css externo p/ o grid; antes do CSS carregar, a
                    //   lista aparecia em 1 coluna com rótulos truncados.
                    const __gridStyle = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;';
                    container.innerHTML =
                      (__feat.length ? '<div class="meggy-continue-section"><h2>⭐ Cursos em destaque</h2><div class="meggy-cards-grid" style="' + __gridStyle + '">' + __feat.map(__cardHtml).join('') + '</div></div>' : '') +
                      (__own.length ? '<div class="meggy-continue-section"><h2>📚 Meus Cursos</h2><div class="meggy-cards-grid" style="' + __gridStyle + '">' + __own.map(__cardHtml).join('') + '</div></div>' : '');
                    container.querySelectorAll('.meggy-card[data-concurso-id]').forEach(card => {
                      card.onclick = () => Shell.views.concursoDetail(el, card.dataset.concursoId);
                    });
                    container.querySelectorAll('.meggy-card[data-course]').forEach(card => {
                      card.onclick = () => {
                        const cp = card.dataset.course;
                        if (cp) { Shell.router.navigate('/drives'); setTimeout(() => Shell.views._renderDrives(cp), 50); }
                      };
                    });
                    // ★ v2.10.4: confirmação via gdiModal — o confirm() nativo é
                    // auto-dispensado por navegadores automatizados e o ✕ não fazia nada
                    const askRemove = async (title, msg) => {
                      if (typeof window.gdiModal === 'function') {
                        try { return await window.gdiModal({ title, message: msg, confirmText: 'Remover', cancelText: 'Cancelar', danger: true }); } catch (_) {}
                      }
                      return confirm(msg);
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
                          if (!r.ok || !d.ok) throw new Error((d && (d.error || d.message)) || ('HTTP ' + r.status));
                          // ★ v2.15.2 (I): invalidar o cache unificado — sem
                          //   isso o módulo re-renderizava a lista antiga e
                          //   o card do concurso ficava até o reload.
                          try { if (window.__gdiStudy && window.__gdiStudy.courses && window.__gdiStudy.courses.invalidateUnifiedCache) window.__gdiStudy.courses.invalidateUnifiedCache(); } catch (_) {}
                          try { if (typeof Bus !== 'undefined' && Bus.emit) Bus.emit('courses:changed', {}); } catch (_) {}
                          Shell.views.cursos(el);
                        } catch (err) { alert('Nao foi possivel remover: ' + err.message); }
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
                          if (!r.ok || !d.ok) throw new Error((d && (d.error || d.message)) || ('HTTP ' + r.status));
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
                        } catch (err) { if (window.gdiModal) { window.gdiModal({ title: 'Não foi possível remover', message: err.message, confirmText: 'OK' }); } else { alert('Nao foi possivel remover: ' + err.message); } }
                      };
                    });
                  }
                } else {
                  container.innerHTML = '<div class="meggy-placeholder"><div class="meggy-placeholder-icon">📚</div><div class="meggy-placeholder-title">Nenhum curso adicionado</div><div class="meggy-placeholder-desc">Vá em Explorar Drives para adicionar cursos.</div><button class="meggy-header-btn" onclick="Shell.router.navigate(\'/drives\')" style="margin-top:16px;"><i class="bi bi-cloud"></i> Explorar Drives</button></div>';
                }
              } catch (apiErr) {
                container.innerHTML = '<div class="meggy-placeholder"><div class="meggy-placeholder-icon">⚠️</div><div class="meggy-placeholder-title">Erro de conexão</div><div class="meggy-placeholder-desc">' + (apiErr.message || 'Tente novamente em alguns segundos.') + '</div></div>';
              }
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

      // ★ v2.15.3 (item 7): re-busca o unificado e re-renderiza a faixa
      //   "💡 Dica da Meggy" (#meggy-cursos-tips). Chamado na entrada da
      //   view cursos e após cada remoção/ocultação/adição no módulo.
      _refreshCursosTips() {
        fetch('/api/courses/unified', { credentials: 'include' }).then(r => r.json()).then(d => { if (d && d.ok) Shell.views._renderCursosTips(d.items || []); }).catch(() => {});
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
        // ★ Guardar pasta atual para o player usar (interfolder + material)
        Shell.state.currentFolderPath = path;

        try {
          if (path === '/' || !path) {
            // Show drives list
            const drives = window.drive_names || [];
            container.innerHTML = '<div class="meggy-cards-grid">' +
              drives.map((name, i) => `
                <div class="meggy-card" data-drive="${i}">
                  <div class="meggy-card-icon">${['⚖️','📚','🎯','🎨','🎼','🏆','💪','🧘','⚕️','⚖️','🎓','🛡️'][i] || '📁'}</div>
                  <div class="meggy-card-title">${name}</div>
                  <div class="meggy-card-meta">Drive ${i}</div>
                </div>`).join('') +
              '</div>';
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
                if (!files || !files.length) {
                  container.innerHTML = '<div class="meggy-placeholder"><div class="meggy-placeholder-icon">📁</div><div class="meggy-placeholder-title">Pasta vazia</div></div>';
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
                container.querySelectorAll('.v215-folder-check').forEach(cb => {
                  cb.addEventListener('click', e => e.stopPropagation());
                  cb.addEventListener('change', updateSel);
                });
                if (selBtn) selBtn.onclick = () => {
                  const paths = Array.from(container.querySelectorAll('.v215-folder-check:checked')).map(cb => cb.dataset.path);
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

      // ═══ PÁGINA DE VÍDEO — Layout Alfacon exato (vídeo + materiais lado a lado) ═══
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
          const encoded = cumPath.split('/').map((s,si) => si === 0 ? '' : encodeURIComponent(s)).join('/');
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
                <button class="gdi-mode-btn active" data-mode="split"><i class="bi bi-layout-split"></i> Dividido</button>
                <button class="gdi-mode-btn" data-mode="fv"><i class="bi bi-lightning-charge-fill"></i> Foco aula</button>
                <button class="gdi-mode-btn" data-mode="fm"><i class="bi bi-file-earmark-pdf-fill"></i> Foco material</button>
                <button class="gdi-watched-btn" id="gdi-watched-btn" data-b="1"><i class="bi bi-eye"></i> Assistido</button>
              </div>
            </div>
            <div class="gdi-study-grid" id="gdi-study-grid">
              <section class="gdi-study-left" style="display:flex;flex-direction:column;gap:12px;min-width:0;">
                <div style="display:flex;align-items:center;gap:12px;">
                  <i class="bi ${isAudio ? 'bi-music-note-beamed' : 'bi-camera-video-fill'}" style="font-size:22px;color:#ff8b9f;"></i>
                  <div style="flex:1;min-width:0;">
                    <div id="gdi-file-header-name" style="font-size:15px;font-weight:600;color:#e6edf3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>
                    <div id="gdi-file-header-meta" style="font-size:12px;color:#6b7488;">${fileSize}</div>
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
                    <div id="meggy-player-error" style="display:none;padding:40px;text-align:center;color:#ff8b9f;">
                      ⚠️ Não carregou. <a href="${videoUrl}" target="_blank" style="color:#5ddeda;">Abrir</a>
                    </div>
                  `}
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                  <button class="gdi-mode-btn" id="gdi-prev-btn" ${idx === 0 ? 'disabled' : ''}><i class="bi bi-chevron-left"></i> Anterior</button>
                  <button class="gdi-mode-btn" id="gdi-next-btn" ${idx >= pl.length - 1 ? 'disabled' : ''}>Próxima <i class="bi bi-chevron-right"></i></button>
                  <a class="gdi-mode-btn" href="${videoUrl}" download="${name}" target="_blank"><i class="bi bi-download"></i></a>
                  <button class="gdi-mode-btn" id="gdi-interfolder-btn"><i class="bi bi-collection"></i> Interfolder</button>
                  <button class="gdi-mode-btn" id="gdi-meggy-ai-btn" style="background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;border:none;"><i class="bi bi-robot"></i> Meggy</button>
                </div>
                <div class="gdi-notes" style="background:rgba(255,255,255,0.043);border:1px solid rgba(255,255,255,0.09);border-radius:10px;padding:12px;">
                  <div style="font-size:14px;font-weight:600;color:#e6edf3;margin-bottom:8px;">📝 Anotações</div>
                  <textarea id="gdi-note-input" rows="2" placeholder="Digite sua anotação..." style="width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:6px;padding:8px;color:#e6edf3;font-family:inherit;font-size:13px;resize:vertical;outline:none;"></textarea>
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
                    <span id="gdi-note-time" style="cursor:pointer;font-size:12px;color:#5ddeda;">00:00</span>
                    <button id="gdi-note-save" style="background:rgba(255,139,159,0.12);border:1px solid rgba(255,139,159,0.3);color:#ff8b9f;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;"><i class="bi bi-save"></i> Salvar</button>
                  </div>
                  <div id="gdi-notes-list" style="margin-top:8px;"></div>
                </div>
                <div id="gdi-playlist-wrap" style="background:rgba(255,255,255,0.043);border:1px solid rgba(255,255,255,0.09);border-radius:10px;padding:8px;">
                  <button id="gdi-pl-toggle" class="gdi-mode-btn" style="width:100%;justify-content:flex-start;padding:8px 10px;font-size:12px;">
                    <i class="bi bi-collection-play me-2"></i><strong>Playlist</strong>
                    <span id="gdi-pl-count" style="font-size:11px;color:#9aa4b8;margin-left:6px;">${idx + 1} / ${pl.length}</span>
                    <i id="gdi-pl-chev" class="bi bi-chevron-down" style="margin-left:auto;"></i>
                  </button>
                  <div id="gdi-playlist-body" style="overflow-y:auto;border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:6px;background:rgba(0,0,0,0.2);max-height:240px;display:none;margin-top:6px;">
                    <div id="gdi-playlist-list">
                      ${pl.map((v, i) => `<div class="gdi-playlist-item ${i === idx ? 'cur' : ''}" data-idx="${i}" title="${v.name}" style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-radius:6px;cursor:pointer;font-size:12px;color:${i === idx ? '#ff8b9f' : '#9aa4b8'};${i === idx ? 'background:rgba(255,139,159,0.12);' : ''}"><div style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><i class="bi ${i === idx ? 'bi-play-fill' : 'bi-film'} me-2"></i><span style="font-weight:${i === idx ? '600' : '400'};">${v.name}</span></div><span class="gdi-pl-size" style="font-size:10px;color:#6b7488;margin-left:8px;">${v.size || ''}</span></div>`).join('')}
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
                <div id="gdi-mat-body" style="background:rgba(22,27,38,0.72);border:1px solid rgba(255,255,255,0.09);border-radius:16px;min-height:420px;height:calc(100vh - 250px);overflow:hidden;"></div>
              </aside>
            </div>
          </div>
        `;

        const video = document.getElementById('meggy-video');
        const timeEl = document.getElementById('gdi-note-time');
        const plCountEl = document.getElementById('gdi-pl-count');

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
          main.scrollTop = 0;
        }

        // Modos — usar CSS classes (visibility/position) em vez de display:none (C1: não destrói iframes)
        document.querySelectorAll('.gdi-mode-btn[data-mode]').forEach(btn => {
          btn.onclick = () => {
            document.querySelectorAll('.gdi-mode-btn[data-mode]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
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
        };
        document.querySelectorAll('.gdi-playlist-item').forEach(item => {
          item.onclick = () => { const i = parseInt(item.dataset.idx); if (i !== idx) switchTo(i); };
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

        // ★ Interfolder — com finalizeNames
        document.getElementById('gdi-interfolder-btn').onclick = async () => {
          const btn = document.getElementById('gdi-interfolder-btn');
          btn.innerHTML = '<div class="spinner-border spinner-border-sm"></div>';
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
              btn.innerHTML = `<div class="spinner-border spinner-border-sm"></div> ${collected.length}`;
            }
            const seen = new Set();
            pl = collected.filter(v => { const k = (v.folder||'')+'|'+v.origName; if (seen.has(k)) return false; seen.add(k); return true; });
            pl.sort((a,b) => (a.folder||'').localeCompare(b.folder||'') || a.name.localeCompare(b.name));
            // finalizeNames
            const cnts = {};
            pl.forEach(v => { const o = v.origName || v.name; cnts[o] = (cnts[o]||0)+1; });
            pl.forEach(v => { const o = v.origName || v.name; if (cnts[o] > 1 && v.folderLabel && v.name === o) v.name = v.folderLabel + ' - ' + o; });
            Shell.state.playerPlaylist = pl;
            idx = pl.findIndex(v => v.origName === name || v.link === videoUrl);
            if (idx === -1) idx = 0;
            document.getElementById('gdi-playlist-list').innerHTML = pl.map((v, i) => `<div class="gdi-playlist-item ${i === idx ? 'cur' : ''}" data-idx="${i}" title="${v.name}" style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-radius:6px;cursor:pointer;font-size:12px;color:${i === idx ? '#ff8b9f' : '#9aa4b8'};${i === idx ? 'background:rgba(255,139,159,0.12);' : ''}"><div style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><i class="bi ${i === idx ? 'bi-play-fill' : 'bi-film'} me-2"></i><span style="font-weight:${i === idx ? '600' : '400'};">${v.name}</span></div><span class="gdi-pl-size" style="font-size:10px;color:#6b7488;margin-left:8px;">${v.size || ''}</span></div>`).join('');
            plCountEl.textContent = `${idx + 1} / ${pl.length}`;
            document.querySelectorAll('.gdi-playlist-item').forEach(item => { item.onclick = () => { const i = parseInt(item.dataset.idx); if (i !== idx) switchTo(i); }; });
            btn.innerHTML = `<i class="bi bi-check"></i> ${pl.length}`;
          } catch (e) { console.error(e); btn.innerHTML = '⚠️'; }
        };

        // ★ Materiais — busca em pasta + subpastas + pasta pai (réplica GDI)
        async function loadMaterials() {
          const tabsEl = document.getElementById('gdi-mat-tabs');
          const bodyEl = document.getElementById('gdi-mat-body');
          const statusEl = document.getElementById('gdi-mat-status');
          if (!tabsEl || !bodyEl) return;
          tabsEl.innerHTML = '<span style="font-size:12px;color:#6b7488;padding:8px;">Buscando…</span>';
          if (statusEl) statusEl.textContent = 'buscando…';
          bodyEl.innerHTML = '';
          try {
            const folderPath = Shell.state.currentFolderPath || '';
            if (!folderPath || !window.gdiListAllFiles) {
              tabsEl.innerHTML = '';
              if (statusEl) statusEl.textContent = 'sem material';
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
              if (statusEl) statusEl.textContent = 'sem material';
              bodyEl.innerHTML = '<div style="text-align:center;padding:40px;color:#6b7488;"><i class="bi bi-file-earmark-x" style="font-size:34px;"></i><div>Nenhum material encontrado.</div></div>';
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
              tab.style.cssText = 'display:inline-flex;flex-direction:row;align-items:center;gap:6px;padding:7px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:999px;cursor:pointer;font-size:13px;font-weight:500;color:#c9d1d9;font-family:inherit;transition:all 0.15s;white-space:nowrap;';
              tab.dataset.mat = i;
              tab.innerHTML = `<i class="bi ${icon}" style="font-size:16px;"></i><span style="font-size:13px;font-weight:600;">${label}</span>`;
              tab.onmouseenter = () => { if (!tab.classList.contains('active')) { tab.style.background = 'rgba(255,255,255,0.13)'; tab.style.color = '#fff'; } };
              tab.onmouseleave = () => { if (!tab.classList.contains('active')) { tab.style.background = 'rgba(255,255,255,0.06)'; tab.style.color = '#c9d1d9'; } };
              tab.onclick = () => showMaterial(i);
              tabsEl.appendChild(tab);
            });

            // ISA tabs (Meggy)
            [{id:'isa-summary',icon:'bi-stars',label:'Resumo Meggy'},{id:'isa-questions',icon:'bi-patch-question',label:'Questões'},{id:'isa-mindmap',icon:'bi-capsule',label:'Pílulas'},{id:'isa-flashcards',icon:'bi-card-text',label:'Flashcards'}].forEach(it => {
              const tab = document.createElement('button');
              tab.className = 'gdi-mat-tab gdi-mat-isa';
              tab.style.cssText = 'display:inline-flex;flex-direction:row;align-items:center;gap:6px;padding:7px 12px;background:rgba(124,77,255,0.08);border:1px solid rgba(124,77,255,0.2);border-radius:999px;cursor:pointer;font-size:13px;font-weight:500;color:#a78bfa;font-family:inherit;transition:all 0.15s;white-space:nowrap;';
              tab.dataset.mat = it.id;
              tab.innerHTML = `<i class="bi ${it.icon}" style="font-size:16px;"></i><span style="font-size:13px;font-weight:600;">${it.label}</span>`;
              tab.onclick = () => showISA(it.id);
              tabsEl.appendChild(tab);
            });

            function showMaterial(i) {
              document.querySelectorAll('.gdi-mat-tab').forEach(t => { t.classList.remove('active'); t.style.background = 'rgba(255,255,255,0.06)'; t.style.borderColor = 'rgba(255,255,255,0.12)'; t.style.color = '#c9d1d9'; });
              const activeTab = document.querySelector(`.gdi-mat-tab[data-mat="${i}"]`);
              if (activeTab) { activeTab.classList.add('active'); activeTab.style.background = '#1f6feb'; activeTab.style.borderColor = '#1f6feb'; activeTab.style.color = '#fff'; }
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
                    // ★ C2: usar marked.js + DOMPurify (carregados globalmente) em vez de regex
                    await Shell._ensureMdLibs();
                    let h;
                    if (window.marked) {
                      try { h = window.marked.parse(txt); if (window.DOMPurify) h = window.DOMPurify.sanitize(h); }
                      catch(_) { h = Shell._esc(txt).replace(/\n/g,'<br>'); }
                    } else { h = Shell._esc(txt).replace(/\n/g,'<br>'); }
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
                }).catch(() => { const el = document.getElementById('gdi-mat-md'); if (el) el.textContent = 'Erro.'; });
              } else if (link) bodyEl.innerHTML = `<div style="text-align:center;padding:40px;"><a href="${link}" target="_blank" class="gdi-mode-btn"><i class="bi bi-download"></i> Abrir</a></div>`;
              else bodyEl.innerHTML = '<div style="text-align:center;padding:40px;color:#6b7488;">Sem preview</div>';
            }

            function showISA(type) {
              document.querySelectorAll('.gdi-mat-tab').forEach(t => { t.classList.remove('active'); t.style.background = 'rgba(124,77,255,0.08)'; t.style.borderColor = 'rgba(124,77,255,0.2)'; t.style.color = '#a78bfa'; });
              const activeTab = document.querySelector('.gdi-mat-tab[data-mat="' + type + '"]');
              if (activeTab) { activeTab.classList.add('active'); activeTab.style.background = '#7c4dff'; activeTab.style.borderColor = '#7c4dff'; activeTab.style.color = '#fff'; }
              const lessonName = Shell.state.playerPlaylist?.[Shell.state.playerIndex]?.name || '';
              const lessonPath = Shell.state.currentFolderPath || '';

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

              (async () => {
                try {
                  const isaField = type.replace('isa-', ''); // summary | questions | mindmap | flashcards
                  // ★ Normalizar cacheKey: decode→re-encode para match consistente com chaves do GDIndex/battalion
                  // (lessonPath pode ter encoding parcial — alguns %20, alguns espaços raw, alguns ç raw)
                  let _rawKey;
                  try { _rawKey = decodeURIComponent(lessonPath + lessonName); } catch(_) { _rawKey = lessonPath + lessonName; }
                  const cacheKey = encodeURI(_rawKey); // encodeURI: %20 para espaços, %C3%A7 para ç, mantém / :
                  const cacheKeyRaw = lessonPath + lessonName; // fallback para cache antigo com encoding parcial

                  // ─── 1. Cache check (GET /api/ai/cache?key=...) ───
                  // ★ Tentar ambas as chaves (encoded e raw) para compatibilidade com cache antigo
                  let cached = null;
                  try {
                    for (const k of [cacheKey, cacheKeyRaw]) {
                      const cacheResp = await fetch('/api/ai/cache?key=' + encodeURIComponent(k), { headers: { 'Accept': 'application/json' }, credentials: 'include' });
                      if (cacheResp.ok) {
                        const cacheData = await cacheResp.json();
                        if (cacheData && cacheData.cached) { cached = cacheData.cached; break; }
                      }
                    }
                  } catch (e) { /* cache miss é normal */ }

                  // Se o tipo específico já está no cache, mostra direto
                  if (cached && cached[isaField]) {
                    Shell._renderISAResult(type, cached[isaField], bodyEl, lessonName, true, cached);
                    return;
                  }

                  // ─── 2. Extrair materiais (MD/TXT/PDF com pdf.js) ───
                  setLoading('📖 Extraindo material da aula…');
                  let materialContent = '';
                  let materialsList = [];
                  try {
                    if (window.gdiListAllFiles && lessonPath) {
                      const files = await window.gdiListAllFiles(lessonPath, '');
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
                      const files = await window.gdiListAllFiles(lessonPath, '');
                      const subs = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder').slice(0, 5);
                      for (const sf of subs) {
                        const fp = lessonPath + encodeURIComponent(sf.name) + '/';
                        const subFiles = await window.gdiListAllFiles(fp, '');
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
                    } catch (e) { /* skip */ }
                  }

                  if (materialContent.length > 80000) {
                    materialContent = materialContent.substring(0, 80000) + '\n[...truncado...]';
                  }

                  const courseName = lessonPath.split('/').filter(Boolean).slice(-1)[0] || '';
                  const driveName = window.drive_names && window.drive_names[+(lessonPath.split('/')[1] || '0').replace(':','')] || '';
                  const ctx = 'Aula: ' + lessonName + '\nCurso: ' + courseName + '\nDrive: ' + driveName;
                  const hasContent = materialContent.length > 100;

                  // ─── 3. generateAll: gerar resumo + pílulas + questões em paralelo ───
                  // Produção gera TUDO de uma vez (Promise.allSettled). Se o usuário pediu só um tipo,
                  // ainda assim geramos todos (mais eficiente — cache fica completo p/ próximas abas).
                  setLoading('✨ Gerando resumo + pílulas + questões em cadeia…<br>Isto pode levar 30-60s.');

                  const textSlice = hasContent ? materialContent : ctx;
                  const sliceCap = hasContent ? 80000 : 2000;

                  // ★ Prompts (replica de produção — meggy-cache.js:785-821)
                  const RESUMO_PROMPTS = [
                    // Nível 7 (rico)
                    'Você é um professor especialista em concursos públicos. Leia TODO o material abaixo e crie um RESUMO PROFUNDO E DETALHADO em Markdown.\n\nREQUISITOS:\n- Mínimo 2000 caracteres (NÃO seja breve)\n- Estruture com ## títulos e ### subtítulos\n- Para CADA tópico: explique o conceito, dê EXEMPLOS práticos, e destaque pegadinhas de prova\n- Use **negrito** para palavras-chave e dispositivos legais\n- Use listas com marcadores para enumerações\n- Inclua uma seção ## Pegadinhas de Prova no final\n- Inclua uma seção ## Resumo Rápido com 5-10 bullets dos pontos mais importantes\n\nNÃO omita nenhum tema. Seja PROFUNDO, não conciso.\n\nMaterial:\n' + textSlice.slice(0, sliceCap),
                    // Nível 5 (médio)
                    'Crie um resumo DETALHADO em Markdown deste material. Use ## títulos, **negrito** e - bullets. Inclua ## Pegadinhas de Prova no final. Material:\n' + textSlice.slice(0, 20000),
                    // Nível 3 (simples)
                    'Crie um resumo em Markdown deste material. Use ## títulos e bullets. Material:\n' + textSlice.slice(0, 10000)
                  ];
                  const PILULAS_PROMPT = 'Crie "Pílulas" deste material — pontos-chave para revisão rápida ANTES da prova. Formato Markdown:\n# Pílulas de Revisão\n\n## Conceitos Essenciais\n- **Conceito 1**: explicação curta com exemplo\n- **Conceito 2**: explicação curta\n\n## Pegadinhas Rápidas\n- ⚠️ Pegadinha 1\n- ⚠️ Pegadinha 2\n\n## Mnemônicos\n- Dica para memorizar\n\nMáximo 20 bullets no total. Seja OBJETIVO mas COMPLETO.\n\nConteúdo:\n' + textSlice.slice(0, 15000);
                  const QUESTOES_PROMPT = 'Você é um examinador de concurso público brasileiro experiente. Baseado neste material, gere 10 questões de concurso em JSON array. Misture:\n- 6 múltipla escolha: {"type":"mc","statement":"...","options":["a","b","c","d"],"correct":0,"legalText":"...","explanation":"...","fundamentacao":"..."}\n- 4 certo/errado (CEBRASPE): {"type":"tf","statement":"...","correct":1,"legalText":"...","explanation":"...","fundamentacao":"..."}\n\nCAMPOS:\n- statement: enunciado claro, contexto completo\n- legalText: o dispositivo legal aplicável (ex: "art. 5º, CF")\n- explanation: explicação técnica do acerto/erro\n- fundamentacao: fundamentação didática completa\n\nSem comentários, só JSON.\n\n' + textSlice.slice(0, 60000);

                  // ★ Helper: chama /api/ai com fallback de prompt (3 níveis para resumo)
                  async function callIsa(prompt, kind) {
                    const r = await fetch('/api/ai', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ message: prompt, messages: [], kind: kind })
                    });
                    if (!r.ok) throw new Error('AI HTTP ' + r.status);
                    const d = await r.json();
                    return d.response || d.markdown || d.summary || '';
                  }

                  // ★ Helper: parse robusto de JSON array de questões (replica meggy-utils.parseJsonArray)
                  function parseQuestions(resp) {
                    if (!resp) return [];
                    let arr = null;
                    try { arr = JSON.parse(resp); } catch (_) {
                      // regex extraction of first [...]
                      const m = resp.match(/\[[\s\S]*\]/);
                      if (m) { try { arr = JSON.parse(m[0]); } catch (__) { arr = null; } }
                    }
                    if (!Array.isArray(arr)) return [];
                    return arr.map(q => {
                      if (q.type === 'tf' || (!q.options && q.correct !== undefined)) {
                        return {
                          type: 'tf', statement: String(q.statement || ''), options: ['Certo', 'Errado'],
                          correct: Math.max(0, Math.min(1, Number(q.correct) || 0)),
                          explanation: String(q.explanation || ''),
                          legalText: String(q.legalText || q.fundamentacao || ''),
                          fundamentacao: String(q.fundamentacao || '')
                        };
                      }
                      if (Array.isArray(q.options)) {
                        return {
                          type: 'mc', statement: String(q.statement || ''), options: q.options.map(String),
                          correct: Math.max(0, Math.min((q.options.length || 4) - 1, Number(q.correct) || 0)),
                          explanation: String(q.explanation || ''),
                          legalText: String(q.legalText || q.fundamentacao || ''),
                          fundamentacao: String(q.fundamentacao || '')
                        };
                      }
                      return null;
                    }).filter(Boolean);
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
                  const tasks = [];
                  // Task 1: resumo (3-level auto-retry)
                  tasks.push((async () => {
                    for (let i = 0; i < RESUMO_PROMPTS.length; i++) {
                      try {
                        setLoading(i === 0 ? '✨ Gerando resumo profundo…' : i === 1 ? '✨ Tentando resumo médio…' : '✨ Tentando resumo simples…');
                        const r = await callIsa(RESUMO_PROMPTS[i], 'resumo');
                        if (r && r.length > 200) return { field: 'summary', value: r };
                      } catch (e) { /* try next level */ }
                    }
                    return { field: 'summary', value: null };
                  })());
                  // Task 2: pílulas
                  tasks.push((async () => {
                    try { setLoading('💊 Gerando pílulas de revisão…'); return { field: 'mindmap', value: await callIsa(PILULAS_PROMPT, 'mindmap') }; }
                    catch (e) { return { field: 'mindmap', value: null }; }
                  })());
                  // Task 3: questões (JSON)
                  tasks.push((async () => {
                    try { setLoading('❓ Gerando questões…'); const r = await callIsa(QUESTOES_PROMPT, 'questoes'); return { field: 'questions', value: parseQuestions(r), raw: r }; }
                    catch (e) { return { field: 'questions', value: [] }; }
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

                  // ─── 4. Save to cache + material folder (fire-and-forget, não bloqueia render) ───
                  const user = (typeof GDIUser !== 'undefined' && GDIUser && GDIUser.state && GDIUser.state.user) || 'meggy';
                  const safeLesson = safeName(lessonName);
                  // ★ Fire-and-forget: salva cache + material folder em background
                  (async () => {
                    try {
                      await fetch('/api/ai/cache', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          key: cacheKey,
                          summary: gen.summary,
                          questions: gen.questions.length ? gen.questions : null,
                          mindmap: gen.mindmap,
                          lessonName: lessonName
                        })
                      });
                    } catch (e) { console.warn('[Shell] cache save:', e); }
                    // Save to material folder
                    if (gen.summary) saveToFolder('resumo', user + '_' + safeLesson + '.md', gen.summary);
                    if (gen.mindmap) saveToFolder('resumo', user + '_pilulas_' + safeLesson + '.md', gen.mindmap);
                    if (gen.questions && gen.questions.length) saveToFolder('questoes', user + '_' + safeName(courseName || lessonName) + '.json', JSON.stringify(gen.questions, null, 2));
                  })();

                  // ─── 6. Render requested type ───
                  const cached2 = { summary: gen.summary, questions: gen.questions.length ? gen.questions : null, mindmap: gen.mindmap, lessonName: lessonName };
                  let toShow = gen[isaField];
                  if (type === 'isa-flashcards') toShow = gen.flashcards.length ? gen.flashcards : null;
                  if (isaField === 'questions' && (!toShow || !toShow.length)) toShow = null;
                  if (!toShow && isaField !== 'flashcards') toShow = 'Não foi possível gerar este conteúdo. Tente novamente.';

                  if (type === 'isa-flashcards') {
                    // Flashcards usa render especial (flip deck)
                    Shell._renderFlashcardDeck(bodyEl, { flashcards: gen.flashcards, lessonName: lessonName, questions: gen.questions });
                  } else {
                    Shell._renderISAResult(type, toShow, bodyEl, lessonName, false, cached2);
                  }
                } catch (e) {
                  console.error('[Shell] showISA:', e);
                  bodyEl.innerHTML = '<div style="padding:20px;color:#ff8b9f;text-align:center;">' +
                    '<div style="font-size:36px;margin-bottom:12px;">⚠️</div>' +
                    '<div style="font-weight:600;margin-bottom:8px;">Erro ao gerar conteúdo</div>' +
                    '<div style="font-size:13px;color:#9aa4b8;margin-bottom:16px;">' + (e.message || 'Tente novamente.') + '</div>' +
                    '<button class="meggy-header-btn" onclick="Shell.state.playerPlaylist && Shell.views._playVideoInline(Shell.state.playerPlaylist[Shell.state.playerIndex].link, Shell.state.playerPlaylist[Shell.state.playerIndex].name, Shell.state.playerPlaylist, Shell.state.playerIndex)" style="background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;border:none;"><i class="bi bi-arrow-clockwise"></i> Tentar novamente</button>' +
                  '</div>';
                }
              })();
            }

            if (materials.length > 0) showMaterial(0);
          } catch (e) {
            console.error('[Shell] loadMaterials:', e);
            tabsEl.innerHTML = '';
            if (statusEl) statusEl.textContent = 'erro';
            bodyEl.innerHTML = `<div style="text-align:center;padding:40px;color:#ff8b9f;">Erro: ${e.message}</div>`;
          }
        }
        setTimeout(loadMaterials, 500);

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
        timeEl.onclick = () => { const t = parseFloat(prompt('Ir para (segundos):', '0')) || 0; video.currentTime = t; };

        // Atalhos
        const keyHandler = (e) => {
          if (['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)) return;
          switch (e.key) {
            case ' ': e.preventDefault(); video.paused ? video.play() : video.pause(); break;
            case 'ArrowRight': video.currentTime = Math.min(video.duration, video.currentTime + 10); break;
            case 'ArrowLeft': video.currentTime = Math.max(0, video.currentTime - 10); break;
            case 'ArrowUp': e.preventDefault(); video.volume = Math.min(1, video.volume + 0.1); break;
            case 'ArrowDown': e.preventDefault(); video.volume = Math.max(0, video.volume - 0.1); break;
            case 'f': case 'F': if (document.fullscreenElement) document.exitFullscreen(); else video.requestFullscreen?.().catch(() => {}); break;
            case 'm': case 'M': video.muted = !video.muted; break;
            case 'n': case 'N': if (idx < pl.length - 1) switchTo(idx + 1); break;
            case 'p': case 'P': if (idx > 0) switchTo(idx - 1); break;
          }
        };
        document.addEventListener('keydown', keyHandler);
        main._cleanupKeyboard = () => { document.removeEventListener('keydown', keyHandler); document.body.classList.remove('meggy-player-active'); };

        main.scrollTop = 0;
        if (pl.length <= 1 && Shell.state.currentFolderPath) {
          setTimeout(() => document.getElementById('gdi-interfolder-btn')?.click(), 1500);
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

      _mdToHtml(text) {
        if (!text || typeof text !== 'string') return '';
        let s = String(text);
        s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return s.replace(/^#### (.+)$/gm, '<h4 style="color:#5ddeda;margin:10px 0 4px;font-size:14px;">$1</h4>')
                .replace(/^### (.+)$/gm, '<h3 style="color:#ff8b9f;margin:12px 0 6px;">$1</h3>')
                .replace(/^## (.+)$/gm, '<h2 style="color:#ff8b9f;margin:16px 0 8px;">$1</h2>')
                .replace(/^# (.+)$/gm, '<h1 style="color:#ff8b9f;margin:20px 0 10px;font-size:20px;">$1</h1>')
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.+?)\*/g, '<em>$1</em>')
                .replace(/^- (.+)$/gm, '<li style="margin-left:20px;">$1</li>')
                .replace(/^(\d+)\. (.+)$/gm, '<li style="margin-left:20px;">$1. $2</li>')
                .replace(/```([\s\S]*?)```/g, '<pre style="background:rgba(0,0,0,.3);padding:10px;border-radius:6px;overflow:auto;font-size:12px;">$1</pre>')
                .replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,.3);padding:1px 4px;border-radius:3px;font-size:12px;">$1</code>')
                .replace(/\n\n/g, '</p><p style="margin:8px 0;">')
                .replace(/\n/g, '<br>');
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
          if (!Shell.__sharedAuthors) {
            const r = await fetch('/api/ai/shared-authors', { cache: 'no-store' });
            const d = await r.json();
            Shell.__sharedAuthors = (d && d.ok && Array.isArray(d.authors)) ? d.authors : [];
          }
          if (!Shell.__sharedSubjects) {
            const r = await fetch('/api/ai/shared-subjects', { cache: 'no-store' });
            const d = await r.json();
            Shell.__sharedSubjects = (d && d.ok) ? d : { summaryLessons: [], flashcardSubjects: [] };
          }
        } catch (_) {}
        const subjects = kind === 'resumos'
          ? (Shell.__sharedSubjects.summaryLessons || [])
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
          o.textContent = a.author + ' (' + ((a.summaries || 0) + (a.flashcards || 0)) + ')';
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
        const browser = document.getElementById('meggy-add-course-browser');
        const selectedDiv = document.getElementById('meggy-add-course-selected');
        const pathSpan = document.getElementById('meggy-add-course-path');
        const confirmBtn = document.getElementById('meggy-add-course-confirm');

        // ★ Navegador de pastas recursivo (usa gdiListAllFiles)
        async function browseFolder(path) {
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
            browser.querySelectorAll('.v215-folder-check').forEach(cb => {
              cb.addEventListener('click', e => e.stopPropagation());
              cb.addEventListener('change', updateSel);
            });
            if (selBtn) selBtn.onclick = () => {
              const paths = Array.from(browser.querySelectorAll('.v215-folder-check:checked')).map(cb => cb.dataset.path);
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
              alert('Erro ao adicionar curso: ' + (d.error || 'tente novamente'));
              confirmBtn.disabled = false;
              confirmBtn.innerHTML = '<i class="bi bi-check-lg"></i> Adicionar como Curso';
            }
          } catch (e) {
            alert('Erro: ' + e.message);
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
                  '<div class="meggy-flashcard-label">PERGUNTA</div>' +
                  '<div class="meggy-flashcard-text">' + front + '</div>' +
                  '<div class="meggy-flashcard-hint"><i class="bi bi-arrow-repeat"></i> Clique para ver a resposta</div>' +
                '</div>' +
                '<div class="meggy-flashcard-face meggy-flashcard-back">' +
                  '<div class="meggy-flashcard-label">RESPOSTA</div>' +
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
              '</div>' +
            '</div>' +
            '<div class="meggy-summary-body gdi-isa-summary-body">' + html + '</div>' +
          '</div>';
        el.scrollTop = 0;
      },

      // ═══ Meus Concursos — feature baseada em edital ═══

      // ★ v2.2: mesclado com Meus Cursos — /concursos mostra a mesma visão unificada.
      concursos(el) {
        Shell.views.cursos(el);
      },

      // ═══ Wizard: criar concurso em 4 passos ═══
      // ★ v2.15.3 (item 2): garante as horas no resultado do /scan. O /scan
      //   novo devolve totalHours/totalMinutes (+ truncated); se vier sem
      //   horas (servidor antigo), chama /sources/preview como fallback com
      //   as mesmas pastas e preenche os totais a partir da prévia.
      async _v215EnsureScanHours(concursoId, scanResult, folderPaths) {
        if (!scanResult) return scanResult;
        if (scanResult.totalHours != null || scanResult.totalMinutes != null) return scanResult;
        try {
          const prev = await Shell.views._v215Api('/api/concursos/' + encodeURIComponent(concursoId) + '/sources/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folderPaths: folderPaths || [] }) });
          if (prev) {
            if (prev.totalHours != null) scanResult.totalHours = prev.totalHours;
            if (prev.totalMinutes != null) scanResult.totalMinutes = prev.totalMinutes;
            if (prev.truncated != null) scanResult.truncated = prev.truncated;
            if (Array.isArray(prev.folders)) scanResult._previewFolders = prev.folders;
          }
        } catch (_) {}
        return scanResult;
      },

      // ★ v2.15.3 (item 2): fragmento HTML do passo 4 com as horas e o
      //   aviso de contagem truncada. '' quando não há horas nem aviso.
      _v215WizardStep4HoursHtml(r) {
        r = r || {};
        const hasHours = (r.totalHours != null || r.totalMinutes != null);
        const hrs = (r.totalHours != null) ? r.totalHours : Math.round(((r.totalMinutes || 0) / 60) * 10) / 10;
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
              '<div id="cw-folder-selected-list" style="margin-bottom:8px;">' + selectedFolders.map((p,i) => '<div style="display:flex;align-items:center;gap:6px;padding:4px 8px;background:rgba(255,139,159,0.08);border:1px solid rgba(255,139,159,0.2);border-radius:6px;margin-bottom:4px;font-size:11px;color:#e6edf3;"><span style="flex:1;word-break:break-all;">' + Shell._esc(p) + '</span><button class="cw-remove-folder" data-idx="' + i + '" style="background:none;border:none;color:#ff6b6b;cursor:pointer;font-size:14px;">✕</button></div>').join('') + '</div>' +
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
            const totalFound = r.totalFound || 0;
            const totalMatched = r.totalMatched || 0;
            const byDisc = r.byDiscipline || {};
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
              if (examDateRaw && !examDate) { alert('Data inválida — use dd/mm/aaaa (ex.: 15/06/2026).'); return; }
              const dailyHours = parseInt(document.getElementById('cw-dailyhours').value, 10) || 4;
              banca = (document.getElementById('cw-banca') || {}).value || '';
              dailyHoursVal = dailyHours;
              examDateVal = examDate;
              if (!name) { alert('Informe o nome do concurso'); return; }
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
                  alert('Erro: ' + (d.error || 'tente novamente'));
                  nextBtn.disabled = false;
                  nextBtn.innerHTML = 'Criar e Continuar →';
                }
              } catch (e) {
                alert('Erro: ' + e.message);
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
              if (editalText.length < 50) { alert('Texto muito curto. Cole ao menos um trecho relevante do edital.'); return; }
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
                  alert('Erro: ' + (d.error || 'tente novamente'));
                  analyzeBtn.disabled = false;
                  analyzeBtn.innerHTML = '🔍 Analisar Edital';
                }
              } catch (e) {
                alert('Erro: ' + e.message);
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
                  acc += (i === 0 ? '/' : '/') + p;
                  if (i === 0 && p.endsWith(':')) { acc = '/' + p + '/'; }
                  else if (i === 0) { acc = '/' + p; }
                  else { acc = acc + '/' + p; }
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
                  if (!r.ok) { listEl.innerHTML = '<div style="padding:20px;text-align:center;color:#ff6b6b;">Erro ao carregar.</div>'; return; }
                  const data = await r.json();
                  const files = (data.data && data.data.files) || [];
                  const folders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
                  if (folders.length === 0) {
                    listEl.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7488;font-size:12px;">Nenhuma subpasta aqui.</div>';
                  } else {
                    // ★ v2.15.2 (C): multi-seleção no passo 3 — o checkbox só
                    //   existia no modal "Adicionar Pasta de Curso".
                    const selBar = '<div style="display:flex;justify-content:flex-end;margin-bottom:6px;"><button class="meggy-header-btn" id="cw-add-selected" disabled style="font-size:12px;opacity:0.5;">＋ Adicionar selecionadas (0)</button></div>';
                    listEl.innerHTML = selBar + folders.map(f => {
                      const subPath = path.endsWith('/') ? path + encodeURIComponent(f.name) + '/' : path + '/' + encodeURIComponent(f.name) + '/';
                      return '<div class="cw-folder-item" data-path="' + Shell._esc(subPath) + '" style="display:flex;align-items:center;gap:8px;padding:10px;cursor:pointer;border-radius:6px;font-size:13px;color:#e6edf3;word-break:break-word;" onmouseover="this.style.background=\'rgba(255,255,255,0.04)\'" onmouseout="this.style.background=\'transparent\'">' +
                        '<input type="checkbox" class="v215-folder-check cw-folder-check" data-path="' + Shell._esc(subPath) + '" title="Selecionar para adicionar ao concurso" style="flex:none;accent-color:#ff8b9f;cursor:pointer;" />' +
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
                modal.querySelectorAll('.cw-folder-check').forEach(cb => {
                  cb.addEventListener('click', e => e.stopPropagation());
                  cb.addEventListener('change', cwUpdateSel);
                });
                if (cwSelBtn) cwSelBtn.onclick = () => {
                  const paths = Array.from(modal.querySelectorAll('.cw-folder-check:checked')).map(cb => cb.dataset.path);
                  let added = 0;
                  paths.forEach(p => { if (selectedFolders.indexOf(p) < 0) { selectedFolders.push(p); added++; } });
                  if (added) {
                    const cnt = document.getElementById('cw-selected-count');
                    if (cnt) cnt.textContent = String(selectedFolders.length);
                    const selList = document.getElementById('cw-folder-selected-list');
                    if (selList) selList.innerHTML = selectedFolders.map((p, i) => '<div style="display:flex;align-items:center;gap:6px;padding:4px 8px;background:rgba(255,139,159,0.08);border:1px solid rgba(255,139,159,0.2);border-radius:6px;margin-bottom:4px;font-size:11px;color:#e6edf3;"><span style="flex:1;word-break:break-all;">' + Shell._esc(p) + '</span><button class="cw-remove-folder" data-idx="' + i + '" style="background:none;border:none;color:#ff6b6b;cursor:pointer;font-size:14px;">✕</button></div>').join('');
                    modal.querySelectorAll('.cw-remove-folder').forEach(btn => {
                      btn.onclick = () => { const idx = parseInt(btn.dataset.idx, 10); selectedFolders.splice(idx, 1); render(); };
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
              if (!currentBrowsePath) { alert('Navegue até uma pasta primeiro'); return; }
              if (selectedFolders.indexOf(currentBrowsePath) < 0) {
                selectedFolders.push(currentBrowsePath);
                render();
              } else {
                alert('Pasta já selecionada');
              }
            };

            // Remove folder buttons
            modal.querySelectorAll('.cw-remove-folder').forEach(btn => {
              btn.onclick = () => {
                const idx = parseInt(btn.dataset.idx, 10);
                selectedFolders.splice(idx, 1);
                render();
              };
            });

            // Scan button
            const scanBtn = document.getElementById('cw-scan');
            if (scanBtn) scanBtn.onclick = async () => {
              if (selectedFolders.length === 0) { alert('Adicione ao menos uma pasta'); return; }
              scanBtn.disabled = true;
              scanBtn.innerHTML = '<div class="spinner-border spinner-border-sm"></div> Escaneando...';
              try {
                const r = await fetch('/api/concursos/' + encodeURIComponent(concursoId) + '/scan', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ folderPaths: selectedFolders })
                });
                const d = await r.json();
                if (d.ok) {
                  scanResult = d;
                  // ★ v2.15.2 (D): o anexo do assistente também cria os
                  //   módulos em concurso_sources (mesmo efeito do fluxo "＋
                  //   Adicionar esta pasta ao curso") — antes só alimentava
                  //   o scan e o detalhe mostrava "Nenhuma pasta anexada".
                  try {
                    const m = await Shell.views._v215Api('/api/concursos/' + encodeURIComponent(concursoId) + '/sources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folderPaths: selectedFolders }) });
                    scanResult.modulesCreated = (m.attached || []).length;
                    scanResult.modulesSkipped = (m.skipped || []).length;
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
                  alert('Erro: ' + (d.error || 'tente novamente'));
                  scanBtn.disabled = false;
                  scanBtn.innerHTML = '📡 Escanear';
                }
              } catch (e) {
                alert('Erro: ' + e.message);
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
              } catch (e) { alert('Não foi possível montar o plano: ' + e.message); buildPlanBtn.disabled = false; buildPlanBtn.textContent = '🎯 Montar plano direcionado'; }
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
                  html += '<div class="meggy-study-list" style="display:flex;align-items:center;gap:8px;padding:8px;cursor:pointer;border-radius:6px;" onmouseover="this.style.background=\'rgba(255,255,255,0.03)\'" onmouseout="this.style.background=\'transparent\'">';
                  html += '<span style="font-size:16px;">' + icon + '</span>';
                  html += '<span style="color:#e6edf3;font-size:13px;flex:1;word-break:break-word;">' + Shell._esc(l.name) + '</span>';
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

      _v215Confirm(title, message, confirmText) {
        try {
          if (typeof window.gdiModal === 'function') return window.gdiModal({ title: title, message: message, confirmText: confirmText || 'Confirmar', cancelText: 'Cancelar', danger: true });
        } catch (_) {}
        return Promise.resolve(false);
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
                '<button class="meggy-header-btn v215-src-quiz" data-i="' + i + '" style="font-size:12px;">🧠 Quiz deste módulo</button>' +
                '<button class="meggy-header-btn v215-src-del" data-i="' + i + '" style="font-size:12px;background:rgba(255,107,107,.12);color:#ff8b8b;border:1px solid rgba(255,107,107,.35);">🗑️ Remover</button>' +
              '</div></div>';
          });
        }
        box.innerHTML = h;
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
            prev = await Shell.views._v215Api('/api/concursos/' + encodeURIComponent(concursoId) + '/sources/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folderPaths: folderPaths }) });
          } catch (e) {
            Shell.views._v215Err('Não foi possível gerar a prévia', e.message);
            if (nextBtn) { nextBtn.disabled = false; nextBtn.textContent = 'Ver prévia →'; }
            return;
          }
          const conc = concursosCache.find(c => String(c.id) === String(concursoId)) || { id: concursoId, name: 'Concurso' };
          let bh = '<div style="font-size:13px;color:#e6edf3;margin-bottom:4px;">Prévia — anexar a <b>📌 ' + Shell.views._esc(conc.name) + '</b></div>';
          bh += '<div style="font-size:12px;color:#9aa4b8;margin-bottom:12px;">Confira antes de confirmar. Nada é anexado até você confirmar.</div>';
          (prev.folders || []).forEach(f => {
            const hrs = f.estHours != null ? f.estHours : Math.round(((f.estMinutes || 0) / 60) * 10) / 10;
            bh += '<div style="padding:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;margin-bottom:6px;">' +
              '<div style="font-size:13px;color:#e6edf3;font-weight:600;">📁 ' + Shell.views._esc(f.name || Shell.views._v215FolderName(f.path)) + '</div>' +
              '<div style="font-size:12px;color:#9aa4b8;margin-top:4px;">📄 ' + (f.pdfs || 0) + ' PDFs · 🎬 ' + (f.videos || 0) + ' vídeos' + (f.audios ? ' · 🎵 ' + f.audios + ' áudios' : '') + ' · ' + (f.lessons || 0) + ' aulas · ' + (f.matched || 0) + ' vinculadas · ~' + hrs + 'h estimadas</div></div>';
          });
          const perFolderDups = (prev.folders || []).flatMap(f => (f.duplicates || []).map(dd => ({ name: dd.name, folders: dd.inFolders || dd.folders || [], alreadyInConcurso: dd.alreadyInConcurso })));
          const allDups = (prev.duplicates || []).concat(perFolderDups);
          if (allDups.length) {
            bh += '<div style="padding:10px;background:rgba(255,212,59,0.06);border:1px solid rgba(255,212,59,0.25);border-radius:8px;font-size:12px;color:#ffd43b;margin-bottom:8px;">⚠️ Aulas duplicadas:<br>' + allDups.map(dd => '• ' + Shell.views._esc(dd.name) + (dd.alreadyInConcurso ? ' — já vinculada a este concurso' : ' — aparece em ' + (dd.folders || []).length + ' pastas')).join('<br>') + '</div>';
          }
          // ★ v2.15.2 (E): totais do servidor (antes vinham undefined);
          //   se ausentes, soma as pastas — nunca "0 aulas · ~h".
          const totL = (prev.totalLessons != null ? prev.totalLessons : (prev.folders || []).reduce((a, f) => a + (f.lessons || 0), 0));
          const totH = (prev.totalHours != null ? prev.totalHours : Math.round(((prev.folders || []).reduce((a, f) => a + (f.estMinutes || 0), 0) / 60) * 10) / 10);
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
                const d = await Shell.views._v215Api('/api/concursos/' + encodeURIComponent(concursoId) + '/sources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folderPaths: folderPaths }) });
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
      async _v215ExtractPdfTexts(pdfs) {
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
              const txt = await extract(fetchUrl);
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
      //   as fontes (contagens atualizadas). opts: {intervalMs, maxPolls}.
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
          const tick = async () => {
            polls++;
            try {
              const st = await getStatus();
              const done = !!(st && (st.done === true || st.battalionDone === true));
              const total = (st && (st.total != null ? st.total : st.pdfsFound)) || 0;
              const processed = (st && (st.processed != null ? st.processed : st.pdfsDone)) || 0;
              const skipped = (st && Array.isArray(st.skipped)) ? st.skipped : [];
              if (done) {
                if (processed > 0) {
                  renderStatus('🐩 Materiais prontos: ' + processed + ' de ' + (total || processed) + ' PDF(s) processado(s)' + (skipped.length ? ' · ' + skipped.length + ' sem texto' : '') + '.');
                  Shell.views._v215Toast('🐩 Resumo + flashcards prontos (' + processed + ' PDF(s)).');
                } else {
                  const why = skipped.length ? ' — ' + skipped.slice(0, 3).map(s2 => Shell.views._esc(s2.name || '') + ': ' + Shell.views._esc(s2.reason || 'sem texto')).join('; ') : ' — nenhum PDF tinha texto extraível.';
                  renderStatus('⚠️ A Meggy não gerou materiais deste módulo' + why);
                  Shell.views._v215Err('A Meggy não gerou materiais', 'Nenhum PDF processado' + why);
                }
                try { Shell.views._v215RenderSources(el, concursoId, null); } catch (_) {}
                resolve(st); return;
              }
              renderStatus('🐩 A Meggy está gerando resumo + flashcards… (' + processed + '/' + (total || '?') + ' PDFs)');
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
          const withText = await Shell.views._v215ExtractPdfTexts(pdfs);
          const withTextCount = withText.filter(p => !p.no_text).length;
          const pdfList = withText.map(p => ({ name: p.name, url: p.url || (p.link ? (String(p.link).startsWith('http') ? p.link : window.location.origin + p.link) : ''), text: p.no_text ? '' : (p.text || ''), no_text: !!p.no_text }));
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
          if (!withTextCount) {
            Shell.views._v215Err('PDFs sem texto extraível', 'Os ' + pdfs.length + ' PDF(s) deste módulo são escaneados (só imagens) — OCR desativado. A geração foi iniciada, mas o servidor deve pular os PDFs sem texto; acompanhe o status abaixo.');
          } else {
            Shell.views._v215Toast('🐩 A Meggy está gerando resumo + flashcards deste módulo em segundo plano (' + withTextCount + ' de ' + pdfs.length + ' PDFs com texto' + (pdfs.length - withTextCount ? ', ' + (pdfs.length - withTextCount) + ' sem texto' : '') + ').');
          }
          // ★ v2.15.3 (item 3): poll do status real em vez do setTimeout
          //   cego de 30s — mostra progresso/erro e re-renderiza ao concluir.
          try { Shell.views._v215PollBattalionStatus(el, concursoId, source.coursePath); } catch (_) { setTimeout(() => { try { const box = el.querySelector ? el.querySelector('#v215-sources') : null; if (box && document.body.contains(box)) Shell.views._v215RenderSources(el, concursoId, null); } catch (_) {} }, 30000); }
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
            if (!d || !d.ok || !d.plan) { bodyEl.innerHTML = '<div style="color:#ff6b6b;font-size:13px;">Não foi possível carregar o plano.</div>'; return; }
            const p = d.plan, s = p.summary;
            let h = '<div style="font-size:13px;color:#9aa4b8;margin-bottom:12px;">' + Shell._esc(p.banca || '') + ' · ' + s.totalDays + ' dias · ' + s.dailyHours + 'h/dia · ' + s.totalHours + 'h · ' + s.altaSharePct + '% nas altas</div>';
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
            const r = await fetch('/api/plans/build', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ concursoId, banca, totalDays, dailyHours }) });
            const d = await r.json();
            if (!d.ok) throw new Error(d.error || ('HTTP ' + r.status));
            if (d.summary && d.summary.withRealLessons) Shell.views._v215Toast('🐩 Plano montado com a Meggy: ' + (d.summary.lessonsLinked || 0) + ' aulas reais vinculadas' + (d.summary.lessonsWatched ? ' (' + d.summary.lessonsWatched + ' já assistidas)' : ''));
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
          if (!editalText || editalText.length < 50) { alert('Cole ao menos um trecho relevante do edital.'); return; }
          const btn = document.getElementById('em-analyze');
          btn.disabled = true;
          btn.innerHTML = '<div class="spinner-border spinner-border-sm"></div> Analisando...';
          try {
            const r = await fetch('/api/concursos/' + encodeURIComponent(concursoId) + '/analyze-edital', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ editalText }) });
            const d = await r.json();
            if (d.ok) { close(); Shell.views.concursoDetail(el, concursoId); }
            else { alert('Erro: ' + (d.error || 'tente novamente')); btn.disabled = false; btn.innerHTML = '🔍 Analisar Edital'; }
          } catch (e) { alert('Erro: ' + e.message); btn.disabled = false; btn.innerHTML = '🔍 Analisar Edital'; }
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
        const msgs = document.getElementById('meggy-ai-messages');
        msgs.innerHTML += '<div class="meggy-ai-msg user">' + Shell._esc(msg) + '</div>';
        document.getElementById('meggy-ai-input').value = '';
        msgs.innerHTML += '<div class="meggy-ai-msg bot" id="meggy-ai-typing">🐾 Pensando...</div>';
        msgs.scrollTop = msgs.scrollHeight;
        try {
          const r = await fetch('/api/ai', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({message: msg, messages: []}) });
          const d = await r.json();
          const resp = d.response || 'Sem resposta';
          // Render markdown if marked.js is available
          let html = resp;
          if (window.marked) { try { html = window.marked.parse(resp); if (window.DOMPurify) html = window.DOMPurify.sanitize(html); } catch(_) {} }
          document.getElementById('meggy-ai-typing').innerHTML = html;
        } catch (e) { document.getElementById('meggy-ai-typing').textContent = 'Erro: ' + e.message; }
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
        let h = text.replace(/^### (.+)$/gm,'<h3 style="color:#ff8b9f;margin:12px 0 6px;">$1</h3>').replace(/^## (.+)$/gm,'<h2 style="color:#ff8b9f;margin:16px 0 8px;">$1</h2>').replace(/^# (.+)$/gm,'<h1 style="color:#ff8b9f;margin:20px 0 10px;">$1</h1>').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/^- (.+)$/gm,'<li>$1</li>').replace(/\n/g,'<br>');
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
        { p: 'android', icon: '📱', name: 'Android', meta: 'Meggy (APK)' },
        { p: 'android_tv', icon: '📺', name: 'Android TV', meta: 'BiBi (APK)' },
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

    // ★ _extractPdfText: extrai texto de um PDF usando pdf.js (cap 30 páginas, 50K chars)
    async _extractPdfText(url) {
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

    _renderMd(txt) {
      if (!txt || typeof txt !== 'string') return '';
      if (window.marked) {
        try {
          const html = window.marked.parse(txt);
          if (window.DOMPurify) {
            try { return window.DOMPurify.sanitize(html); } catch (_) {}
          }
          // Fallback sem DOMPurify: escape + br
          return Shell._esc(txt).replace(/\n/g, '<br>');
        } catch (_) {}
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
      let chainBadge = '';
      if (fullCache) {
        const parts = [];
        if (fullCache.summary) parts.push('✓ Resumo');
        if (fullCache.mindmap) parts.push('✓ Pílulas');
        if (fullCache.questions && fullCache.questions.length) parts.push('✓ ' + fullCache.questions.length + ' questões + flashcards');
        if (parts.length > 1) {
          chainBadge = '<div class="meggy-chain-badge"><i class="bi bi-check-circle-fill"></i> <b>Gerado em cadeia:</b> ' + parts.join(' · ') + '</div>';
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
          '<div style="position:relative;perspective:1500px;height:340px;max-width:560px;margin:0 auto;cursor:pointer;" id="meggy-fc-card">' +
            '<div style="position:absolute;inset:0;transform-style:preserve-3d;transition:transform .55s cubic-bezier(.4,0,.2,1);" id="meggy-fc-inner">' +
              '<div class="meggy-flashcard-face meggy-flashcard-front" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:18px 16px;border-radius:12px;background:linear-gradient(135deg,rgba(255,139,159,.14),rgba(192,38,211,.08));border:1.5px solid rgba(255,139,159,.4);backface-visibility:hidden;">' +
                '<div style="font-size:10px;font-weight:700;letter-spacing:.08em;color:#ff8b9f;text-transform:uppercase;display:flex;align-items:center;gap:4px;"><i class="bi bi-question-circle"></i> PERGUNTA</div>' +
                '<div style="font-size:16px;line-height:1.55;color:#f0f6fc;text-align:center;">' + front + '</div>' +
                '<div style="font-size:10px;color:#8b949e;font-style:italic;"><i class="bi bi-arrow-repeat"></i> clique para virar</div>' +
              '</div>' +
              '<div class="meggy-flashcard-face meggy-flashcard-back" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:18px 16px;border-radius:12px;background:linear-gradient(135deg,rgba(93,222,218,.14),rgba(63,185,80,.08));border:1.5px solid rgba(93,222,218,.4);transform:rotateY(180deg);backface-visibility:hidden;">' +
                '<div style="font-size:10px;font-weight:700;letter-spacing:.08em;color:#5ddeda;text-transform:uppercase;display:flex;align-items:center;gap:4px;"><i class="bi bi-check-circle"></i> RESPOSTA</div>' +
                '<div style="font-size:14px;line-height:1.55;color:#e6edf3;text-align:left;overflow-y:auto;max-height:240px;">' + backHtml + '</div>' +
                '<div style="font-size:10px;color:#8b949e;font-style:italic;"><i class="bi bi-arrow-repeat"></i> clique para voltar</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div id="meggy-fc-grade-panel"></div>' +
          '<div style="display:flex;justify-content:space-between;align-items:center;padding-top:14px;margin-top:10px;border-top:1px solid rgba(255,255,255,.08);">' +
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
    const html = (window.marked && window.DOMPurify) ? window.DOMPurify.sanitize(window.marked.parse(text)) : (function(t){ return t.replace(/^### (.+)$/gm, '<h3>$1</h3>').replace(/^## (.+)$/gm, '<h2>$1</h2>').replace(/^# (.+)$/gm, '<h1>$1</h1>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/^- (.+)$/gm, '<li>$1</li>').replace(/\n/g, '<br>'); })(text);
    const w = window.open('', '_blank');
    if (!w) { alert('Permita pop-ups para baixar o PDF'); return; }
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
      html = (window.marked && window.DOMPurify) ? window.DOMPurify.sanitize(window.marked.parse(text)) : (function(t){ return t.replace(/^### (.+)$/gm, '<h3>$1</h3>').replace(/^## (.+)$/gm, '<h2>$1</h2>').replace(/^# (.+)$/gm, '<h1>$1</h1>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/^- (.+)$/gm, '<li>$1</li>').replace(/\n/g, '<br>'); })(text);
    }
    const w = window.open('', '_blank');
    if (!w) { alert('Permita pop-ups para baixar o PDF'); return; }
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







