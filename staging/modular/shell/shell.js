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
          Shell.views.meggyAIChat(main);
          break;
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
          <div class="meggy-cards-grid">
            <div class="meggy-card" data-nav="/cursos">
              <div class="meggy-card-icon">📚</div>
              <div class="meggy-card-title">Meus Cursos</div>
              <div class="meggy-card-meta">Acesse seus cursos matriculados</div>
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
      },

      cursos(el) {
        el.innerHTML = `
          <div class="meggy-view-header">
            <h1 class="meggy-view-title">📚 Meus Cursos</h1>
            <button class="meggy-header-btn" id="meggy-add-course-btn" style="background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;border:none;font-size:13px;"><i class="bi bi-folder-plus"></i> Adicionar Pasta de Curso</button>
          </div>
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
            } else {
              // ★ Listar cursos via API /api/courses/list
              const container = document.getElementById('meggy-cursos-container');
              try {
                const r = await fetch('/api/courses/list', { headers: { 'Accept': 'application/json' }, credentials: 'include' });
                if (r.ok) {
                  const data = await r.json();
                  const courses = data.courses || data || [];
                  if (Array.isArray(courses) && courses.length > 0) {
                    container.innerHTML = '<div class="meggy-cards-grid">' +
                      courses.map(c => {
                        // ★ API retorna: {coursePath, courseName, pdfCount, icon, color, addedAt}
                        const name = c.courseName || c.name || c.key || c.coursePath || 'Curso';
                        const key = c.coursePath || c.key || '';
                        const pdfCount = c.pdfCount || c.totalLessons || c.total || 0;
                        const addedAt = c.addedAt ? new Date(c.addedAt).toLocaleDateString('pt-BR') : '';
                        return `<div class="meggy-card" data-course="${key}" style="cursor:pointer;">
                          <div class="meggy-card-icon">${c.icon || '📚'}</div>
                          <div class="meggy-card-title">${name}</div>
                          <div class="meggy-card-meta">${pdfCount} PDFs${addedAt ? ' · add ' + addedAt : ''}</div>
                        </div>`;
                      }).join('') + '</div>';
                    container.querySelectorAll('.meggy-card[data-course]').forEach(card => {
                      card.onclick = () => {
                        const cp = card.dataset.course;
                        if (cp) {
                          Shell.router.navigate('/drives');
                          setTimeout(() => Shell.views._renderDrives(cp), 50);
                        }
                      };
                    });
                  } else {
                    container.innerHTML = '<div class="meggy-placeholder"><div class="meggy-placeholder-icon">📚</div><div class="meggy-placeholder-title">Nenhum curso adicionado</div><div class="meggy-placeholder-desc">Vá em Explorar Drives para adicionar cursos.</div><button class="meggy-header-btn" onclick="Shell.router.navigate(\'/drives\')" style="margin-top:16px;"><i class="bi bi-cloud"></i> Explorar Drives</button></div>';
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

                let html = '<div class="meggy-cards-grid">';
                for (const f of folders) {
                  html += `
                    <div class="meggy-card" data-folder="${path}${f.name}/">
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
              html += '<div class="meggy-study-list">';
              folders.forEach(f => {
                const fp = path + encodeURIComponent(f.name) + '/';
                html += '<div class="meggy-study-item folder-item" data-path="' + fp + '" style="cursor:pointer;">' +
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
          if (withCards.length === 0) { Shell.views._renderGenerateHint(el, 'flashcards'); return; }
          // ★ Agrupar por curso → disciplina → assunto
          const tree = Shell.views._groupEntriesByHierarchy(withCards);
          Shell.views._renderStudyTree(container, tree, 'flashcards', el, withCards);
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
              '<span>Cartão ' + (current + 1) + ' de ' + questions.length + '</span>' +
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
          if (withQ.length === 0) { Shell.views._renderGenerateHint(el, 'questoes'); return; }
          // ★ Agrupar por curso → disciplina → assunto
          const tree = Shell.views._groupEntriesByHierarchy(withQ);
          Shell.views._renderStudyTree(container, tree, 'questoes', el, withQ);
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
              '<span>Questão ' + (current + 1) + ' de ' + questions.length + '</span>' +
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
          if (withSummary.length === 0) { Shell.views._renderGenerateHint(el, 'resumos'); return; }
          // ★ Agrupar por curso → disciplina → assunto
          const tree = Shell.views._groupEntriesByHierarchy(withSummary);
          Shell.views._renderStudyTree(container, tree, 'resumos', el, withSummary);
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

      // ★ meggyAIChat: chat da Meggy AI no painel principal (main pane)
      meggyAIChat(el) {
        el.innerHTML = '<div class="meggy-view-header"><h1 class="meggy-view-title">🤖 Meggy AI</h1></div>' +
          '<div class="meggy-chat-main">' +
            '<div class="meggy-chat-messages" id="meggy-chat-messages">' +
              '<div class="meggy-ai-msg bot">Oi! Sou a <b>Meggy</b> 🐩 — sua poodle tutora de estudos.<br><br>' +
                'Posso ajudar com:<br>• Explicar um tema da aula<br>• Tirar dúvidas<br>• Sugerir um plano de estudos<br><br>' +
                'Para gerar resumos, questões e flashcards, abra uma aula e use as abas <b>Resumo Meggy</b>, <b>Questões</b>, <b>Pílulas</b> ou <b>Flashcards</b> no player. 🐾' +
              '</div>' +
            '</div>' +
            '<div class="meggy-chat-input-bar">' +
              '<textarea id="meggy-chat-input" placeholder="Pergunte algo à Meggy..." rows="2"></textarea>' +
              '<button id="meggy-chat-send" title="Enviar"><i class="bi bi-send"></i></button>' +
            '</div>' +
          '</div>';
        Shell._ensureMdLibs();
        var send = async function() {
          var input = document.getElementById('meggy-chat-input');
          var msg = input.value.trim();
          if (!msg) return;
          var msgs = document.getElementById('meggy-chat-messages');
          msgs.insertAdjacentHTML('beforeend', '<div class="meggy-ai-msg user">' + Shell._esc(msg) + '</div>');
          input.value = '';
          msgs.insertAdjacentHTML('beforeend', '<div class="meggy-ai-msg bot" id="meggy-chat-typing">🐾 Pensando...</div>');
          msgs.scrollTop = msgs.scrollHeight;
          try {
            var r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg, messages: [] }) });
            var d = await r.json();
            var resp = d.response || 'Sem resposta';
            var html = resp;
            if (window.marked) { try { html = window.marked.parse(resp); if (window.DOMPurify) html = window.DOMPurify.sanitize(html); } catch (_) {} }
            var t = document.getElementById('meggy-chat-typing');
            if (t) t.innerHTML = html;
          } catch (e) { var t = document.getElementById('meggy-chat-typing'); if (t) t.textContent = 'Erro: ' + e.message; }
          msgs.scrollTop = msgs.scrollHeight;
        };
        document.getElementById('meggy-chat-send').onclick = send;
        document.getElementById('meggy-chat-input').onkeydown = function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
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
      if (confirm('Deseja sair?')) {
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
    // (meggyAIChat movido para dentro de Shell.views — ver acima)

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
          el.innerHTML = '<div class="meggy-view-header"><h1 class="meggy-view-title">⚙️ Configurações</h1></div><div style="max-width:500px;margin:0 auto;"><div class="meggy-card" style="cursor:default;"><div class="meggy-card-title">🎨 Tema</div><div class="meggy-card-meta"><button class="meggy-header-btn" onclick="Shell.toggleTheme()">Alternar tema</button></div></div><div class="meggy-card" style="cursor:default;margin-top:12px;"><div class="meggy-card-title">📦 Versão</div><div class="meggy-card-meta">Meggy STAGING</div></div><div class="meggy-card" style="cursor:default;margin-top:12px;"><div class="meggy-card-title">🚪 Conta</div><div class="meggy-card-meta"><button class="meggy-header-btn" onclick="Shell.logout()">Sair</button></div></div></div>';
          return;
        }
        if (feature === 'apps') {
          el.innerHTML = '<div class="meggy-view-header"><h1 class="meggy-view-title">📱 Apps</h1></div><div class="meggy-cards-grid"><a class="meggy-card" href="https://github.com/esaaraujo-lab/gdi_server/releases/latest" target="_blank"><div class="meggy-card-icon">🖥️</div><div class="meggy-card-title">Windows/Linux</div><div class="meggy-card-meta">Desktop</div></a><a class="meggy-card" href="https://github.com/esaaraujo-lab/gdi_server/releases/latest" target="_blank"><div class="meggy-card-icon">📱</div><div class="meggy-card-title">Android</div><div class="meggy-card-meta">APK</div></a><a class="meggy-card" href="https://github.com/esaaraujo-lab/gdi_server/releases/latest" target="_blank"><div class="meggy-card-icon">📺</div><div class="meggy-card-title">Roku</div><div class="meggy-card-meta">BrightScript</div></a></div>';
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







