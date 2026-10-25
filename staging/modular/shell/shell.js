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
      // Shell IS the body now — no overlay on top of GDIndex.
      const root = document.getElementById('meggy-root') || document.body;
      root.innerHTML = ''; // clear (in case of remount)
      root.appendChild(overlay);
      root.appendChild(shell);

      // ★ Bloquear Área do Aluno antiga (study-panel.js) — não deve abrir sobre o shell nativo
      try {
        // Override __gdiOpenCentral (alias usado pelo botão "Área do Aluno" do GDIndex)
        window.__gdiOpenCentral = function() {
          console.log('[Meggy Shell] __gdiOpenCentral bloqueado — shell nativo já está ativo');
          Shell.router.navigate('/cursos');
        };
        // Override panel.openPanel se existir
        if (window.__gdiStudy && window.__gdiStudy.panel) {
          window.__gdiStudy.panel.openPanel = function() {
            console.log('[Meggy Shell] __gdiStudy.panel.openPanel bloqueado — shell nativo já está ativo');
            Shell.router.navigate('/cursos');
          };
        }
        // Esconder qualquer elemento .gdi-central-box que apareça
        const observer = new MutationObserver(() => {
          document.querySelectorAll('.gdi-central-box, #gdi-central-panel, [class*="gdi-central"]').forEach(el => {
            if (el.id !== 'meggy-shell' && !el.closest('#meggy-shell')) {
              el.style.display = 'none';
            }
          });
        });
        observer.observe(document.body, { childList: true, subtree: true });
        console.log('[Meggy Shell] ✓ Área do Aluno antiga bloqueada');
      } catch (e) {
        console.warn('[Meggy Shell] falha ao bloquear área do aluno antiga:', e);
      }

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
      if (Shell.gdindexLoaded) return true;
      console.log('[Meggy Shell] lazy loading full GDIndex (app.min.js + gdi-extras-loader.js)...');
      try {
        // Load app.min.js (134KB) — provides full GDIStorage, GDIUser, player, etc.
        await Shell._loadScript('/app.min.js?v=17');
        // Load gdi-extras-loader.js — loads 24 modules (gdi-core, gdi-ui, gdi-study, gdi-meggy, etc.)
        await Shell._loadScript('/gdi-extras.js?v=151');
        // Wait for modules to register (gdi-extras-loader has its own bootstrap)
        await new Promise(r => setTimeout(r, 2000));
        Shell.gdindexLoaded = true;
        console.log('[Meggy Shell] ✓ full GDIndex loaded (app.min.js + 24 modules)');
        return true;
      } catch (e) {
        console.error('[Meggy Shell] full GDIndex load failed:', e);
        return false;
      }
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
      const path = Shell.router.currentPath();
      const view = Shell.router.routes[path] || 'home';
      Shell.state.currentView = view;
      Shell.sidebar.updateActive(path);

      const main = document.getElementById('meggy-main');
      if (!main) return;

      // Scroll to top on view change
      main.scrollTop = 0;

      switch (view) {
        case 'home':      Shell.views.home(main); break;
        case 'cursos':    Shell.views.cursos(main); break;
        case 'drives':    Shell.views.drives(main); break;
        case 'progresso': Shell.views._estudosView(main, 'progresso'); break;
        case 'questoes':  Shell.views._estudosView(main, 'questoes'); break;
        case 'flashcards':Shell.views._estudosView(main, 'flashcards'); break;
        case 'meggy-ai':  Shell.openMeggyAIDrawer(); Shell.views.home(main); break;
        case 'config':    Shell.views._estudosView(main, 'config'); break;
        case 'simulado':  Shell.views._estudosView(main, 'simulado'); break;
        case 'provas':    Shell.views._estudosView(main, 'provas'); break;
        case 'redacao':   Shell.views._estudosView(main, 'redacao'); break;
        case 'cronograma':Shell.views._estudosView(main, 'cronograma'); break;
        case 'estatisticas':Shell.views._estudosView(main, 'estatisticas'); break;
        case 'mapa-fracos':Shell.views._estudosView(main, 'mapa-fracos'); break;
        case 'conquistas':Shell.views._estudosView(main, 'conquistas'); break;
        case 'apps':      Shell.views._estudosView(main, 'apps'); break;
        case 'resumos':   Shell.views._estudosView(main, 'resumos'); break;
        case 'plano':     Shell.views._estudosView(main, 'plano'); break;
        default:          Shell.views.home(main);
      }
    },

    // ─── Views ───
    views: {
      home(el) {
        // Try to get user state for "continue watching"
        let continueHTML = '';
        try {
          const d = (window.GDIUser && window.GDIUser.state) || {};
          const resume = d.resume || {};
          const watched = d.watched || {};
          const resumeKeys = Object.keys(resume).slice(0, 3);
          if (resumeKeys.length > 0) {
            continueHTML = '<div class="meggy-continue-section"><h2>▶ Continue assistindo</h2>';
            for (const path of resumeKeys) {
              const name = path.split('/').pop().replace(/\.\w+$/, '') || path;
              const course = path.split('/')[2] || '';
              const pos = resume[path] || 0;
              continueHTML += `
                <div class="meggy-continue-card" data-path="${path}">
                  <div class="meggy-continue-thumb">🎬</div>
                  <div class="meggy-continue-info">
                    <div class="meggy-continue-title">${name}</div>
                    <div class="meggy-continue-course">${course}</div>
                    <div class="meggy-continue-progress">
                      <div class="meggy-continue-progress-bar" style="width:${Math.min(100, pos)}%"></div>
                    </div>
                  </div>
                </div>`;
            }
            continueHTML += '</div>';
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
        // Bind continue watching clicks
        el.querySelectorAll('.meggy-continue-card').forEach(card => {
          card.onclick = () => {
            const path = card.dataset.path;
            // Open in GDIndex player (will be integrated in Phase 3)
            // For now, navigate to the folder
            const folder = path.substring(0, path.lastIndexOf('/') + 1);
            Shell.router.navigate('/drives');
            setTimeout(() => Shell.views.drives(document.getElementById('meggy-main'), folder), 100);
          };
        });
      },

      cursos(el) {
        el.innerHTML = `
          <div class="meggy-view-header">
            <h1 class="meggy-view-title">📚 Meus Cursos</h1>
          </div>
          <div id="meggy-cursos-container">
            <div class="meggy-loading">
              <div class="spinner-border" role="status"></div>
              <div>Carregando módulo de cursos...</div>
            </div>
          </div>
        `;

        (async () => {
          // Need full GDIndex for renderCursos (gdi-study.js module)
          if (!window.__gdiStudy) {
            const ok = await Shell.loadFullGDIndex();
            if (!ok) {
              document.getElementById('meggy-cursos-container').innerHTML = `
                <div class="meggy-placeholder">
                  <div class="meggy-placeholder-icon">⚠️</div>
                  <div class="meggy-placeholder-title">Não foi possível carregar os cursos</div>
                  <div class="meggy-placeholder-desc">Tente novamente em alguns segundos.</div>
                </div>`;
              return;
            }
          }
          // Now render
          try {
            if (window.__gdiStudy && window.__gdiStudy.courses && window.__gdiStudy.courses.renderCursos) {
              const container = document.getElementById('meggy-cursos-container');
              container.innerHTML = '';
              const wrapper = document.createElement('div');
              wrapper.className = 'gdi-central-box';
              wrapper.style.cssText = 'max-width:none;padding:0;background:transparent;border:none;';
              container.appendChild(wrapper);
              window.__gdiStudy.courses.renderCursos(wrapper);
            } else {
              document.getElementById('meggy-cursos-container').innerHTML = `
                <div class="meggy-placeholder">
                  <div class="meggy-placeholder-icon">📚</div>
                  <div class="meggy-placeholder-title">Módulo de cursos indisponível</div>
                  <div class="meggy-placeholder-desc">window.__gdiStudy.courses não encontrado após load.</div>
                </div>`;
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

      // ═══ PÁGINA DE AULA — RÉPLICA 100% GDI + finalizeNames + tabs materiais ═══
      _playVideoInline(link, name, playlist, currentIndex) {
        const main = document.getElementById('meggy-main');
        if (!main) return;
        const videoUrl = link.startsWith('http') ? link : (window.location.origin + link);
        const isAudio = name.endsWith('.mp3') || name.endsWith('.m4a') || name.endsWith('.wav') || name.endsWith('.ogg') || name.endsWith('.aac');

        let pl = playlist || [{ name: name, link: videoUrl, size: '', folder: '' }];
        let idx = currentIndex || 0;

        // ★ finalizeNames — réplica do GDI (se há duplicação de nomes, prefixa com folderLabel)
        const counts = {};
        pl.forEach(v => { const o = v.origName || v.name; counts[o] = (counts[o] || 0) + 1; });
        pl.forEach(v => {
          const o = v.origName || v.name;
          if (counts[o] > 1 && v.folder && v.name === o) {
            v.name = v.folder + ' - ' + o;
          }
        });

        let resumePos = 0;
        try {
          if (window.GDIUser && window.GDIUser.state && window.GDIUser.state.resume) {
            const saved = window.GDIUser.state.resume[videoUrl];
            if (saved && typeof saved === 'number') resumePos = saved;
            else if (saved && saved.pos) resumePos = saved.pos;
          }
        } catch (e) {}

        if (main._cleanupKeyboard) { main._cleanupKeyboard(); main._cleanupKeyboard = null; }
        Shell.state.currentView = 'player';
        Shell.state.playerPlaylist = pl;
        Shell.state.playerIndex = idx;

        // Contrair sidebar
        document.body.classList.add('meggy-player-active');
        if (!document.getElementById('meggy-sidebar-expand-btn')) {
          const expandBtn = document.createElement('button');
          expandBtn.id = 'meggy-sidebar-expand-btn';
          expandBtn.className = 'meggy-sidebar-expand-btn';
          expandBtn.innerHTML = '<i class="bi bi-chevron-right"></i>';
          expandBtn.title = 'Mostrar menu';
          expandBtn.onclick = () => { document.body.classList.remove('meggy-player-active'); expandBtn.remove(); };
          document.body.appendChild(expandBtn);
        }

        // Breadcrumb
        const folderPath = Shell.state.currentFolderPath || '';
        const parts = folderPath.split('/').filter(Boolean);
        let bcHTML = '<li><a href="/" title="Home" data-nav="/" data-bc-type="home">Home</a></li><li class="gdi-bc-sep">/</li>';
        let cumPath = '';
        for (let i = 0; i < parts.length; i++) {
          cumPath += '/' + parts[i];
          const cumPathEncoded = cumPath.split('/').map((seg, si) => si === 0 ? '' : encodeURIComponent(seg)).join('/');
          const label = parts[i].match(/^\d+:$/) ? (window.drive_names?.[+parts[i].slice(0,-1)] || parts[i]) : decodeURIComponent(parts[i]);
          const short = label.length > 20 ? label.slice(0,17) + '…' : label;
          bcHTML += `<li><a href="${cumPathEncoded}/" title="${label}" data-nav="${cumPath}/" data-bc-type="folder">${short}</a></li><li class="gdi-bc-sep">/</li>`;
        }
        const shortName = name.length > 20 ? name.slice(0,17) + '…' : name;
        bcHTML += `<li class="gdi-bc-cur" title="${name}">${shortName}</li>`;
        const fileSize = pl[idx]?.size || '';
        const iconClass = isAudio ? 'bi-music-note-beamed' : 'bi-camera-video-fill';

        const mode = Shell.state.layoutMode || 'rows';
        // ★ Layout ALFACON — rows/cols/focus-video/focus-study
        main.innerHTML = `
          <div class="gdi-study alfacon-layout mode-rows" id="gdi-study" data-layout-mode="rows">
            <div class="alfacon-layout-grid">
              <div class="alfacon-layout-left" id="lesson_video_container">
                <div class="alfacon-video-header">
                  <div class="alfacon-lesson-info">
                    <div class="alfacon-lesson-icon">${isAudio ? '🎵' : '🎬'}</div>
                    <div>
                      <div class="gdi-file-header-name" id="gdi-file-header-name">${name}</div>
                      <div class="gdi-file-header-meta" id="gdi-file-header-meta">${fileSize}</div>
                    </div>
                  </div>
                  <div class="alfacon-layout-controls">
                    <button class="gdi-mode-btn ${mode === 'rows' ? 'active' : ''}" data-layout="rows" title="Linhas"><i class="bi bi-list"></i></button>
                    <button class="gdi-mode-btn ${mode === 'cols' ? 'active' : ''}" data-layout="cols" title="Colunas"><i class="bi bi-layout-split"></i></button>
                    <button class="gdi-mode-btn ${mode === 'focus-video' ? 'active' : ''}" data-layout="focus-video" title="Foco na aula"><i class="bi bi-lightning-charge-fill"></i></button>
                  </div>
                </div>
                <div class="gdi-player-wrap">
                  ${isAudio ? `
                    <div class="meggy-audio-player">
                      <div class="meggy-audio-icon">🎵</div>
                      <audio id="meggy-video" src="${videoUrl}" controls autoplay style="width:100%;"></audio>
                    </div>
                  ` : `
                    <video id="meggy-video" src="${videoUrl}" controls autoplay playsinline
                      style="width:100%;border-radius:12px;background:#000;aspect-ratio:16/9;max-height:80vh;"
                      onerror="this.style.display='none';document.getElementById('meggy-player-error').style.display='block'">
                    </video>
                    <div id="meggy-player-error" style="display:none;padding:40px;text-align:center;color:#ff8b9f;">
                      ⚠️ Não foi possível carregar.<br>
                      <a href="${videoUrl}" target="_blank" style="color:#5ddeda;">Abrir em nova aba</a>
                    </div>
                  `}
                </div>
                <div class="alfacon-lesson-controls">
                  <button class="gdi-mode-btn" id="gdi-watched-btn" data-b="1"><i class="bi bi-eye"></i> Marcar Como Assistido</button>
                  <button class="gdi-mode-btn" id="gdi-prev-btn" ${idx === 0 ? 'disabled' : ''}><i class="bi bi-chevron-left"></i> Anterior</button>
                  <button class="gdi-mode-btn" id="gdi-next-btn" ${idx >= pl.length - 1 ? 'disabled' : ''}>Próxima <i class="bi bi-chevron-right"></i></button>
                  <a class="gdi-mode-btn" href="${videoUrl}" download="${name}" target="_blank"><i class="bi bi-download"></i></a>
                  <button class="gdi-mode-btn" id="gdi-interfolder-btn"><i class="bi bi-collection"></i> Interfolder</button>
                  <button class="gdi-mode-btn" id="gdi-meggy-ai-btn" style="background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;"><i class="bi bi-robot"></i> Meggy</button>
                </div>
                <div class="alfacon-card" id="alfacon-playlist-card">
                  <button class="alfacon-collapse-btn" id="alfacon-playlist-toggle">
                    <span class="alfacon-collapse-icon"><i class="bi bi-education-outline"></i></span>
                    <span class="alfacon-collapse-title">Aulas da disciplina</span>
                    <span id="gdi-pl-count" style="font-size:11px;color:#6b7488;margin-left:6px;">${idx + 1} / ${pl.length}</span>
                    <i class="bi bi-chevron-down" id="gdi-pl-chev" style="margin-left:auto;"></i>
                  </button>
                  <div class="alfacon-collapse-body" id="gdi-playlist-body" style="display:none;">
                    <div id="gdi-playlist-list">
                      ${pl.map((v, i) => `<div class="gdi-playlist-item ${i === idx ? 'cur' : ''}" data-idx="${i}" title="${v.name}"><div><i class="bi ${i === idx ? 'bi-play-fill' : 'bi-film'} me-2"></i><span style="font-weight:${i === idx ? '600' : '400'};">${v.name}</span></div><span class="gdi-pl-size">${v.size || ''}</span></div>`).join('')}
                    </div>
                  </div>
                </div>
                <div class="alfacon-card" id="alfacon-annotations">
                  <div class="alfacon-annotations-header">📝 Anotações</div>
                  <textarea id="gdi-note-input" rows="2" placeholder="Digite sua anotação para esta aula…" style="width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:8px;padding:8px;color:#e6edf3;font-family:inherit;font-size:13px;resize:vertical;outline:none;"></textarea>
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
                    <span id="gdi-note-time" style="cursor:pointer;font-size:12px;color:#5ddeda;">00:00</span>
                    <button id="gdi-note-save" style="background:rgba(255,139,159,0.12);border:1px solid rgba(255,139,159,0.3);color:#ff8b9f;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;"><i class="bi bi-save me-1"></i>Salvar</button>
                  </div>
                  <div id="gdi-notes-list" style="margin-top:8px;"></div>
                </div>
              </div>
              <div class="alfacon-layout-right" id="gdi-slot-right">
                <div class="alfacon-material-header" id="material_header">
                  <div class="alfacon-material-tabs" id="gdi-mat-tabs"><span class="gdi-mat-loading">Buscando…</span></div>
                  <div class="alfacon-layout-controls-right">
                    <button class="gdi-mode-btn" data-layout="focus-study" title="Foco no material"><i class="bi bi-lightning-charge-fill"></i></button>
                  </div>
                </div>
                <div class="alfacon-material-body" id="gdi-mat-body"></div>
                <div class="alfacon-material-status" id="gdi-mat-status">buscando…</div>
              </div>
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

        const showResumeToast = (pos) => {
          const toast = document.createElement('div');
          toast.className = 'meggy-toast-resume';
          toast.innerHTML = `<i class="bi bi-clock-history"></i> Retomando de <b>&nbsp;${formatTime(pos)}</b><button class="meggy-toast-btn">Recomeçar</button>`;
          main.appendChild(toast);
          toast.querySelector('.meggy-toast-btn').onclick = () => { video.currentTime = 0; toast.remove(); };
          setTimeout(() => { toast.classList.add('meggy-toast-out'); setTimeout(() => toast.remove(), 250); }, 7000);
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
              showResumeToast(resumePos);
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
          const newUrl = v.link.startsWith('http') ? v.link : (window.location.origin + v.link);
          video.src = newUrl;
          video.play().catch(() => {});
          document.getElementById('gdi-file-header-name').textContent = v.name;
          document.getElementById('gdi-file-header-meta').textContent = v.size || '';
          plCountEl.textContent = `${idx + 1} / ${pl.length}`;
          document.querySelectorAll('.gdi-playlist-item').forEach((el, i) => {
            el.classList.toggle('cur', i === idx);
            const icon = el.querySelector('i'); if (icon) icon.className = `bi ${i === idx ? 'bi-play-fill' : 'bi-film'} me-2`;
            const span = el.querySelector('span'); if (span) span.style.fontWeight = i === idx ? '600' : '400';
          });
          document.getElementById('gdi-prev-btn').disabled = idx === 0;
          document.getElementById('gdi-next-btn').disabled = idx >= pl.length - 1;
          main.scrollTop = 0;
        }

        // Modos
        document.querySelectorAll('.gdi-mode-btn[data-mode]').forEach(btn => {
          btn.onclick = () => {
            document.querySelectorAll('.gdi-mode-btn[data-mode]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('gdi-study').className = 'gdi-study mode-' + btn.dataset.mode;
          };
        });

        // Assistido
        document.getElementById('gdi-watched-btn').onclick = function() {
          const w = this.dataset.b === '1';
          this.dataset.b = w ? '0' : '1';
          this.classList.toggle('done', !w);
          this.innerHTML = !w ? '<i class="bi bi-eye-fill"></i><span>Assistida ✓</span>' : '<i class="bi bi-eye"></i><span>Assistido</span>';
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

        // Interfolder — com finalizeNames (réplica GDI)
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
                  .map(f => ({
                    name: f.name,
                    origName: f.name,
                    link: f.link ? (f.link.startsWith('http') ? f.link : window.location.origin + f.link) : '',
                    size: f.size ? (f.size/1024/1024).toFixed(1)+' MB' : '',
                    folder: folder.name,
                    folderLabel: folder.name
                  }))).catch(() => []);
              }));
              results.forEach(v => collected.push(...v));
              btn.innerHTML = `<div class="spinner-border spinner-border-sm"></div> ${collected.length}`;
            }
            // ★ finalizeNames — réplica exata do GDI
            const seen = new Set();
            pl = collected.filter(v => { const k = (v.folder||'')+'|'+v.origName; if (seen.has(k)) return false; seen.add(k); return true; });
            pl.sort((a,b) => (a.folder||'').localeCompare(b.folder||'') || a.name.localeCompare(b.name));
            // ★ Se há duplicação de nomes, prefixa com folderLabel
            const cnts = {};
            pl.forEach(v => { const o = v.origName || v.name; cnts[o] = (cnts[o]||0)+1; });
            pl.forEach(v => { const o = v.origName || v.name; if (cnts[o] > 1 && v.folderLabel && v.name === o) v.name = v.folderLabel + ' - ' + o; });

            Shell.state.playerPlaylist = pl;
            idx = pl.findIndex(v => v.origName === name || v.link === videoUrl);
            if (idx === -1) idx = 0;
            document.getElementById('gdi-playlist-list').innerHTML = pl.map((v, i) => `<div class="gdi-playlist-item ${i === idx ? 'cur' : ''}" data-idx="${i}" title="${v.name}"><div><i class="bi ${i === idx ? 'bi-play-fill' : 'bi-film'} me-2"></i><span style="font-weight:${i === idx ? '600' : '400'};">${v.name}</span></div><span class="gdi-pl-size">${v.size || ''}</span></div>`).join('');
            plCountEl.textContent = `${idx + 1} / ${pl.length}`;
            document.querySelectorAll('.gdi-playlist-item').forEach(item => { item.onclick = () => { const i = parseInt(item.dataset.idx); if (i !== idx) switchTo(i); }; });
            btn.innerHTML = `<i class="bi bi-check"></i> ${pl.length}`;
          } catch (e) { console.error(e); btn.innerHTML = '⚠️'; }
        };

        // Breadcrumb
        document.querySelectorAll('.gdi-bc a[data-nav]').forEach(a => {
          a.onclick = (e) => {
            e.preventDefault();
            if (a.dataset.bcType === 'home') Shell.router.navigate('/');
            else { Shell.router.navigate('/drives'); setTimeout(() => Shell.views._renderDrives(a.dataset.nav), 50); }
          };
        });

        // Meggy AI drawer
        document.getElementById('gdi-meggy-ai-btn').onclick = () => Shell.openMeggyAIDrawer();

        // ★ Materiais — RÉPLICA EXATA do GDI (tabs + IA + body)
        async function loadMaterials() {
          const tabsEl = document.getElementById('gdi-mat-tabs');
          const bodyEl = document.getElementById('gdi-mat-body');
          const statusEl = document.getElementById('gdi-mat-status');
          if (!tabsEl || !bodyEl) return;
          tabsEl.innerHTML = '<span class="gdi-mat-loading">Buscando materiais…</span>';
          if (statusEl) statusEl.textContent = 'buscando…';
          bodyEl.innerHTML = '';
          try {
            const folderPath = Shell.state.currentFolderPath || '';
            if (!folderPath || !window.gdiListAllFiles) {
              tabsEl.innerHTML = '';
              if (statusEl) statusEl.textContent = 'sem material';
              bodyEl.innerHTML = '<div class="gdi-mat-empty"><i class="bi bi-file-earmark-x" style="font-size:34px;"></i><div>Nenhum material.</div></div>';
              return;
            }
            const isMaterial = (x) => {
              const ext = (x.fileExtension || ((x.name||'').split('.').pop() || '')).toLowerCase();
              const mt = (x.mimeType || '').toLowerCase();
              return ext === 'pdf' || mt.includes('pdf') || ext === 'md' || mt.includes('markdown') || ext === 'txt' || mt === 'text/plain' || ext === 'html' || mt.includes('html');
            };
            let found = [];
            const here = await window.gdiListAllFiles(folderPath, '');
            found = here.filter(isMaterial);
            if (!found.length) {
              const subs = here.filter(x => x.mimeType === 'application/vnd.google-apps.folder').slice(0, 20);
              for (const sf of subs) {
                const fp = folderPath + encodeURIComponent(sf.name) + '/';
                const subFiles = await window.gdiListAllFiles(fp, '');
                found = found.concat(subFiles.filter(isMaterial));
                if (found.length) break;
              }
            }
            if (!found.length) {
              const parts = folderPath.split('/').filter(Boolean);
              const parentPath = '/' + parts.slice(0, -1).join('/') + '/';
              if (parentPath !== '/' && parentPath !== folderPath) {
                const parentFiles = await window.gdiListAllFiles(parentPath, '');
                found = parentFiles.filter(isMaterial);
              }
            }
            const seen = new Set();
            const uniq = [];
            found.forEach(x => { if (!seen.has(x.name)) { seen.add(x.name); uniq.push(x); } });
            // Cap em 12 (igual GDI)
            const materials = uniq.slice(0, 12);

            tabsEl.innerHTML = '';
            if (!materials.length) {
              if (statusEl) statusEl.textContent = 'sem material';
              bodyEl.innerHTML = '<div class="gdi-mat-empty"><i class="bi bi-file-earmark-x" style="font-size:34px;"></i><div>Nenhum material encontrado para esta aula.</div></div>';
              return;
            }
            if (statusEl) statusEl.textContent = materials.length + ' materiais';

            // ★ Renderizar tabs — RÉPLICA EXATA do GDI
            // 1. Tabs de arquivos (Transcrição, Resumo IA, etc.)
            materials.forEach((m, i) => {
              const ext = (m.name.split('.').pop() || '').toLowerCase();
              const isAi = m.name.toLowerCase().includes('ia') || m.name.toLowerCase().includes('resumo');
              const isTransc = m.name.toLowerCase().includes('transcri') || ext === 'txt';
              const label = isTransc ? 'Transcrição' : isAi ? 'Resumo IA' : m.name.substring(0, 15);
              const icon = isTransc ? 'bi-card-text' : isAi ? 'bi-stars' : ext === 'pdf' ? 'bi-file-earmark-pdf' : 'bi-file-earmark-text';
              const tab = document.createElement('div');
              tab.className = 'gdi-mat-tab' + (i === 0 ? ' active' : '');
              tab.dataset.mat = i;
              tab.title = m.name;
              tab.innerHTML = `<i class="bi ${icon}"></i><span>${label}</span>`;
              tab.onclick = () => showMaterial(i);
              tabsEl.appendChild(tab);
            });

            // 2. Tabs IA Meggy (sempre presentes — réplica GDI)
            const isaTabs = [
              { id: 'isa-summary', icon: 'bi-stars', label: 'Resumo Meggy' },
              { id: 'isa-questions', icon: 'bi-patch-question', label: 'Questões Meggy' },
              { id: 'isa-mindmap', icon: 'bi-capsule', label: 'Pílulas' },
              { id: 'isa-flashcards', icon: 'bi-card-text', label: 'Flashcards' },
            ];
            isaTabs.forEach(it => {
              const tab = document.createElement('div');
              tab.className = 'gdi-mat-tab gdi-mat-isa';
              tab.dataset.mat = it.id;
              tab.innerHTML = `<i class="bi ${it.icon}"></i><span>${it.label}</span>`;
              tab.onclick = () => showISAMaterial(it.id);
              tabsEl.appendChild(tab);
            });

            // ★ showMaterial — renderizar preview (réplica GDI)
            function showMaterial(i) {
              document.querySelectorAll('.gdi-mat-tab').forEach(t => t.classList.remove('active'));
              document.querySelector(`.gdi-mat-tab[data-mat="${i}"]`)?.classList.add('active');
              const m = materials[i];
              let link = '';
              if (m.link) {
                link = m.link.startsWith('http') ? m.link : (window.location.origin + m.link);
                if (m.name.endsWith('.pdf') && !link.includes('inline=')) link += (link.includes('?') ? '&' : '?') + 'inline=true';
              }
              const ext = (m.name.split('.').pop() || '').toLowerCase();
              if (ext === 'pdf' && link) {
                bodyEl.innerHTML = `<iframe src="${link}" style="width:100%;height:calc(100dvh - 250px);border:none;background:#fff;"></iframe>`;
              } else if ((ext === 'md' || ext === 'txt' || ext === 'html') && link) {
                bodyEl.innerHTML = `<div id="gdi-mat-md" style="width:100%;height:calc(100dvh - 250px);overflow:auto;padding:16px;background:rgba(255,255,255,0.04);border-radius:8px;color:#e6edf3;font-size:13px;">Carregando...</div>`;
                fetch(link).then(r => r.text()).then(txt => {
                  const el = document.getElementById('gdi-mat-md');
                  if (el) {
                    // Renderizar markdown simples
                    let html = txt
                      .replace(/^### (.+)$/gm, '<h3 style="color:#ff8b9f;margin:12px 0 6px;">$1</h3>')
                      .replace(/^## (.+)$/gm, '<h2 style="color:#ff8b9f;margin:16px 0 8px;">$1</h2>')
                      .replace(/^# (.+)$/gm, '<h1 style="color:#ff8b9f;margin:20px 0 10px;">$1</h1>')
                      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                      .replace(/^- (.+)$/gm, '<li>$1</li>')
                      .replace(/\n/g, '<br>');
                    el.innerHTML = html;
                  }
                }).catch(() => { const el = document.getElementById('gdi-mat-md'); if (el) el.textContent = 'Erro.'; });
              } else if (link) {
                bodyEl.innerHTML = `<div style="text-align:center;padding:40px;"><a href="${link}" target="_blank" class="gdi-mode-btn"><i class="bi bi-download"></i> Abrir material</a></div>`;
              } else {
                bodyEl.innerHTML = '<div class="gdi-mat-empty">Sem preview</div>';
              }
            }

            // ★ showISAMaterial — gerar via IA (réplica GDI)
            function showISAMaterial(type) {
              document.querySelectorAll('.gdi-mat-tab').forEach(t => t.classList.remove('active'));
              document.querySelector(`.gdi-mat-tab[data-mat="${type}"]`)?.classList.add('active');
              const lessonName = Shell.state.playerPlaylist?.[Shell.state.playerIndex]?.name || '';
              bodyEl.innerHTML = `<div style="padding:20px;text-align:center;"><div class="spinner-border" style="color:#ff8b9f;"></div><div style="margin-top:12px;color:#9aa4b8;">Gerando ${type.replace('isa-','')} com Meggy AI...</div></div>`;
              (async () => {
                try {
                  let endpoint = '/api/ai';
                  let payload = { message: '', messages: [] };
                  if (type === 'isa-summary') payload.message = `Gere um resumo detalhado da aula: ${lessonName}`;
                  else if (type === 'isa-questions') payload.message = `Gere 5 questões de múltipla escolha sobre: ${lessonName}`;
                  else if (type === 'isa-mindmap') payload.message = `Crie pílulas de conhecimento (tópicos curtos) sobre: ${lessonName}`;
                  else if (type === 'isa-flashcards') payload.message = `Crie 10 flashcards (frente/verso) sobre: ${lessonName}`;
                  const r = await fetch(endpoint, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
                  const d = await r.json();
                  const text = d.response || d.markdown || 'Sem resposta';
                  let html = text
                    .replace(/^### (.+)$/gm, '<h3 style="color:#ff8b9f;margin:12px 0 6px;">$1</h3>')
                    .replace(/^## (.+)$/gm, '<h2 style="color:#ff8b9f;margin:16px 0 8px;">$1</h2>')
                    .replace(/^# (.+)$/gm, '<h1 style="color:#ff8b9f;margin:20px 0 10px;">$1</h1>')
                    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                    .replace(/^- (.+)$/gm, '<li>$1</li>')
                    .replace(/\n/g, '<br>');
                  bodyEl.innerHTML = `<div style="width:100%;height:calc(100dvh - 250px);overflow:auto;padding:16px;color:#e6edf3;font-size:13px;">${html}</div>`;
                } catch (e) {
                  bodyEl.innerHTML = `<div class="gdi-mat-empty">Erro: ${e.message}</div>`;
                }
              })();
            }

            // Auto-clicar primeiro material
            if (materials.length > 0) showMaterial(0);
          } catch (e) {
            console.error('[Shell] loadMaterials:', e);
            tabsEl.innerHTML = '';
            if (statusEl) statusEl.textContent = 'erro';
            bodyEl.innerHTML = '<div class="gdi-mat-empty"><i class="bi bi-file-earmark-x" style="font-size:34px;"></i><div>Erro.</div></div>';
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
          setTimeout(() => document.getElementById('gdi-interfolder-btn')?.click(), 1000);
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
          drawer.innerHTML = `
            <div class="meggy-ai-drawer-header">
              <div class="meggy-ai-drawer-title">🐩 Meggy AI</div>
              <button class="meggy-ai-drawer-close" id="meggy-ai-close"><i class="bi bi-x"></i></button>
            </div>
            <div class="meggy-ai-drawer-tabs">
              <button class="meggy-ai-drawer-tab active" data-aitab="actions">⚡ Ações</button>
              <button class="meggy-ai-drawer-tab" data-aitab="chat">💬 Chat</button>
              <button class="meggy-ai-drawer-tab" data-aitab="resumos">📝 Resumos</button>
              <button class="meggy-ai-drawer-tab" data-aitab="questoes">❓ Questões</button>
              <button class="meggy-ai-drawer-tab" data-aitab="flashcards">🃏 Flashcards</button>
            </div>
            <div class="meggy-ai-drawer-body" id="meggy-ai-body"></div>
          `;
          document.body.appendChild(drawer);
          document.getElementById('meggy-ai-close').onclick = () => Shell.closeMeggyAIDrawer();
          drawer.querySelectorAll('.meggy-ai-drawer-tab').forEach(tab => {
            tab.onclick = () => {
              drawer.querySelectorAll('.meggy-ai-drawer-tab').forEach(t => t.classList.remove('active'));
              tab.classList.add('active');
              Shell.renderMeggyAITab(tab.dataset.aitab);
            };
          });
        }
        drawer.classList.add('open');
        Shell.meggyAIDrawerOpen = true;
        Shell.renderMeggyAITab('actions');
      },
      closeMeggyAIDrawer() {
        const drawer = document.getElementById('meggy-ai-drawer');
        if (drawer) drawer.classList.remove('open');
        Shell.meggyAIDrawerOpen = false;
      },
      renderMeggyAITab(tab) {
        const body = document.getElementById('meggy-ai-body');
        if (!body) return;
        if (tab === 'actions') {
          body.innerHTML = `
            <div class="meggy-ai-action-grid">
              <button class="meggy-ai-action-btn" data-action="resumo"><i class="bi bi-file-earmark-text"></i>Gerar Resumo</button>
              <button class="meggy-ai-action-btn" data-action="pilulas"><i class="bi bi-capsule"></i>Pílulas</button>
              <button class="meggy-ai-action-btn" data-action="questoes"><i class="bi bi-patch-question"></i>Questões</button>
              <button class="meggy-ai-action-btn" data-action="flashcards"><i class="bi bi-card-text"></i>Flashcards</button>
              <button class="meggy-ai-action-btn" data-action="mindmap"><i class="bi bi-diagram-3"></i>Mapa Mental</button>
              <button class="meggy-ai-action-btn" data-action="coach"><i class="bi bi-magic"></i>Coach IA</button>
            </div>
          `;
          body.querySelectorAll('.meggy-ai-action-btn').forEach(btn => { btn.onclick = () => Shell.meggyAIAction(btn.dataset.action); });
        } else if (tab === 'chat') {
          body.innerHTML = `
            <div class="meggy-ai-chat-messages" id="meggy-ai-messages"></div>
            <div class="meggy-ai-chat-input">
              <textarea id="meggy-ai-input" placeholder="Pergunte algo..." rows="2"></textarea>
              <button id="meggy-ai-send"><i class="bi bi-send"></i></button>
            </div>
          `;
          const send = async () => {
            const msg = document.getElementById('meggy-ai-input').value.trim();
            if (!msg) return;
            const msgs = document.getElementById('meggy-ai-messages');
            msgs.innerHTML += `<div class="meggy-ai-msg user">${msg}</div>`;
            document.getElementById('meggy-ai-input').value = '';
            msgs.innerHTML += `<div class="meggy-ai-msg bot" id="meggy-ai-typing">🐾 Pensando...</div>`;
            msgs.scrollTop = msgs.scrollHeight;
            try {
              const r = await fetch('/api/ai', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({message: msg, messages: []}) });
              const d = await r.json();
              document.getElementById('meggy-ai-typing').textContent = d.response || 'Sem resposta';
            } catch (e) { document.getElementById('meggy-ai-typing').textContent = 'Erro: ' + e.message; }
            msgs.scrollTop = msgs.scrollHeight;
          };
          document.getElementById('meggy-ai-send').onclick = send;
          document.getElementById('meggy-ai-input').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
        } else if (tab === 'resumos') {
          body.innerHTML = `<div style="padding:20px;"><button class="meggy-ai-action-btn" style="width:100%;" id="meggy-gen-resumo"><i class="bi bi-file-earmark-text"></i>Gerar Resumo</button><div id="meggy-resumo-out" style="margin-top:16px;font-size:13px;color:#9aa4b8;"></div></div>`;
          document.getElementById('meggy-gen-resumo').onclick = () => Shell.meggyAIAction('resumo');
        } else if (tab === 'questoes') {
          body.innerHTML = `<div style="padding:20px;"><button class="meggy-ai-action-btn" style="width:100%;" id="meggy-gen-questoes"><i class="bi bi-patch-question"></i>Gerar Questões</button><div id="meggy-questoes-out" style="margin-top:16px;font-size:13px;color:#9aa4b8;"></div></div>`;
          document.getElementById('meggy-gen-questoes').onclick = () => Shell.meggyAIAction('questoes');
        } else if (tab === 'flashcards') {
          body.innerHTML = `<div style="padding:20px;"><button class="meggy-ai-action-btn" style="width:100%;" id="meggy-gen-flash"><i class="bi bi-card-text"></i>Gerar Flashcards</button><div id="meggy-flash-out" style="margin-top:16px;font-size:13px;color:#9aa4b8;"></div></div>`;
          document.getElementById('meggy-gen-flash').onclick = () => Shell.meggyAIAction('flashcards');
        }
      },
      async meggyAIAction(action) {
        const body = document.getElementById('meggy-ai-body');
        const lessonName = Shell.state.playerPlaylist?.[Shell.state.playerIndex]?.name || '';
        const outId = action === 'resumo' ? 'meggy-resumo-out' : action === 'questoes' ? 'meggy-questoes-out' : action === 'flashcards' ? 'meggy-flash-out' : null;
        const outEl = outId ? document.getElementById(outId) : null;
        if (outEl) outEl.innerHTML = '<div class="spinner-border spinner-border-sm"></div> Gerando...';
        try {
          let endpoint = '/api/ai';
          let payload = { message: '', messages: [] };
          if (action === 'resumo') payload.message = `Gere um resumo detalhado da aula: ${lessonName}`;
          else if (action === 'pilulas') { endpoint = '/api/ai/coach'; payload = { action: 'analyze' }; }
          else if (action === 'questoes') payload.message = `Gere 5 questões de múltipla escolha sobre: ${lessonName}`;
          else if (action === 'flashcards') payload.message = `Crie 10 flashcards sobre: ${lessonName}`;
          else if (action === 'mindmap') payload.message = `Crie um mapa mental em markdown sobre: ${lessonName}`;
          else if (action === 'coach') { endpoint = '/api/ai/coach'; payload = { action: 'analyze' }; }
          const r = await fetch(endpoint, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
          const d = await r.json();
          const text = d.response || d.markdown || d.summary || JSON.stringify(d).substring(0, 500);
          if (outEl) outEl.innerHTML = `<div style="background:rgba(255,255,255,0.04);padding:12px;border-radius:8px;white-space:pre-wrap;">${text}</div>`;
          else body.innerHTML = `<div style="padding:16px;font-size:13px;color:#e6edf3;white-space:pre-wrap;">${text}</div>`;
        } catch (e) {
          if (outEl) outEl.innerHTML = 'Erro: ' + e.message;
          else body.innerHTML = 'Erro: ' + e.message;
        }
      },

      // ═══ Views de Estudos (placeholder com lazy load do GDIndex) ═══
      _estudosView(el, feature) {
        el.innerHTML = `<div class="meggy-placeholder"><div class="meggy-placeholder-icon">📚</div><div class="meggy-placeholder-title">${feature}</div><div class="meggy-placeholder-desc">Carregando módulo de estudos...</div><button class="meggy-header-btn" id="meggy-load-estudos" style="margin-top:16px;"><i class="bi bi-cloud-download"></i> Carregar</button></div>`;
        document.getElementById('meggy-load-estudos').onclick = async () => {
          const btn = document.getElementById('meggy-load-estudos');
          btn.innerHTML = '<div class="spinner-border spinner-border-sm"></div> Carregando GDIndex...';
          const ok = await Shell.loadFullGDIndex();
          if (ok && window.__gdiStudy) {
            // Mapear feature para função
            const map = {
              'progresso': () => window.__gdiStudy.panel?.renderHome?.(el),
              'questoes': () => window.__gdiStudy.questions?.renderQuestoes?.(el),
              'simulado': () => window.__gdiStudy.questions?.renderSimulado?.(el),
              'cronograma': () => window.__gdiStudy.questions?.renderCronograma?.(el),
              'provas': () => window.__gdiStudy.advanced?.renderProvas?.(el),
              'redacao': () => window.__gdiStudy.advanced?.renderRedacao?.(el),
              'estatisticas': () => window.__gdiStudy.panel?.renderStats?.(el),
              'mapa-fracos': () => window.__gdiStudy.advanced?.renderRadar?.(el),
              'conquistas': () => window.__gdiStudy.panel?.renderAchievements?.(el),
              'apps': () => window.__gdiStudy.panel?.renderApps?.(el),
              'resumos': () => window.__gdiMeggy?.summaries?.renderResumos?.(el),
              'plano': () => window.__gdiStudy.plan?.renderAll?.(el),
            };
            if (map[feature]) {
              try { map[feature](); } catch (e) { el.innerHTML = `<div class="meggy-placeholder">⚠️ ${e.message}</div>`; }
            } else {
              el.innerHTML = `<div class="meggy-placeholder">⚠️ Feature não encontrada: ${feature}</div>`;
            }
          } else {
            el.innerHTML = '<div class="meggy-placeholder">⚠️ Falha ao carregar GDIndex</div>';
          }
        };
      },

      meggyAI(el) {
        el.innerHTML = `
          <div class="meggy-view-header">
            <h1 class="meggy-view-title">🤖 Meggy AI</h1>
          </div>
          <div id="meggy-ai-container">
            <div class="meggy-loading">
              <div class="spinner-border"></div>
              <div>Carregando Meggy AI...</div>
            </div>
          </div>
        `;
        try {
          if (window.__gdiMeggy && window.__gdiMeggy.widget) {
            // Try to open the widget
            if (window.__gdiMeggy.widget.open) {
              window.__gdiMeggy.widget.open();
              document.getElementById('meggy-ai-container').innerHTML = `
                <div class="meggy-placeholder">
                  <div class="meggy-placeholder-icon">🤖</div>
                  <div class="meggy-placeholder-title">Meggy AI aberta</div>
                  <div class="meggy-placeholder-desc">O widget da Meggy AI foi aberto.</div>
                  <div class="meggy-placeholder-phase">Integração completa do drawer na Fase 4</div>
                </div>`;
            } else {
              throw new Error('widget.open não disponível');
            }
          } else {
            throw new Error('window.__gdiMeggy.widget não disponível');
          }
        } catch (e) {
          document.getElementById('meggy-ai-container').innerHTML = `
            <div class="meggy-placeholder">
              <div class="meggy-placeholder-icon">🤖</div>
              <div class="meggy-placeholder-title">Meggy AI</div>
              <div class="meggy-placeholder-desc">${e.message}</div>
              <div class="meggy-placeholder-phase">Integração completa do drawer na Fase 4</div>
            </div>`;
        }
      },

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
      }
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
    }
  };

  // ─── Export to window ───
  window.MeggyShell = Shell;

  // ─── Auto-init ───
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Shell.init());
  } else {
    Shell.init();
  }

  console.log('[Meggy Shell] script loaded, waiting for modules...');
})();

