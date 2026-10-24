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
          { title: 'Estudos', ids: ['progresso', 'questoes', 'flashcards'] },
          { title: 'IA & Conta', ids: ['meggy-ai', 'config'] }
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
        '/config': 'config'
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
        case 'progresso': Shell.views.placeholder(main, 'Progresso', '📊', 'Fase 5'); break;
        case 'questoes':  Shell.views.placeholder(main, 'Questões', '❓', 'Fase 5'); break;
        case 'flashcards':Shell.views.placeholder(main, 'Flashcards', '🃏', 'Fase 5'); break;
        case 'meggy-ai':  Shell.views.meggyAI(main); break;
        case 'config':    Shell.views.placeholder(main, 'Configurações', '⚙️', 'Fase 5'); break;
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

      // ═══ PÁGINA DE AULA COMPLETA (replica do GDI file_video) ═══
      // Funcionalidades:
      // - Playlist INTERFOLDER (loadCrossFolderPlaylist): vídeos de TODAS as subpastas da pasta pai
      // - Tabs laterais: Playlist | Meggy AI | Material (PDF/resumos)
      // - Modo Foco: esconde sidebar do shell, expande player
      // - Resume tracking + toast "Retomando de HH:MM:SS"
      // - Atalhos: espaço/←→/↑↓/F/M/N/P/S
      // - Speed 0.5-2x, PiP, download, fullscreen
      // - Auto-advance
      // - Lazy load do GDIndex quando abre Meggy AI (precisa __gdiMeggy.widget)
      _playVideoInline(link, name, playlist, currentIndex) {
        const main = document.getElementById('meggy-main');
        if (!main) return;
        const videoUrl = link.startsWith('http') ? link : (window.location.origin + link);

        // Se não recebeu playlist, criar com 1 item
        let pl = playlist || [{ name: name, link: videoUrl, size: '', folder: '' }];
        let idx = currentIndex || 0;

        // Resume: buscar posição salva
        let resumePos = 0;
        try {
          if (window.GDIUser && window.GDIUser.state && window.GDIUser.state.resume) {
            const key = videoUrl;
            const saved = window.GDIUser.state.resume[key];
            if (saved && typeof saved === 'number') resumePos = saved;
            else if (saved && saved.pos) resumePos = saved.pos;
          }
        } catch (e) {}

        // Limpar keyboard listener anterior
        if (main._cleanupKeyboard) { main._cleanupKeyboard(); main._cleanupKeyboard = null; }

        Shell.state.currentView = 'player';
        Shell.state.playerPlaylist = pl;
        Shell.state.playerIndex = idx;

        // ★ Registrar no histórico para Voltar funcionar
        // Se não veio de um switchTo (currentIndex == 0 e playlist nova), fazer pushState
        if (!Shell.state._inPlayer) {
          Shell.state._inPlayer = true;
          // Não faz pushState aqui — o popstate handler cuida de renderizar
        }

        // Renderizar página de aula completa
        main.innerHTML = `
          <div class="meggy-lesson-page" id="meggy-lesson-page">
            <div class="meggy-lesson-header">
              <div class="meggy-lesson-title-row">
                <button class="meggy-header-btn" id="meggy-lesson-back" title="Voltar">
                  <i class="bi bi-arrow-left"></i>
                </button>
                <h1 class="meggy-view-title" id="meggy-lesson-name">🎬 ${name}</h1>
                <div class="meggy-lesson-actions">
                  <button class="meggy-header-btn" id="meggy-lesson-focus" title="Modo Foco (S)">
                    <i class="bi bi-arrows-fullscreen"></i> Foco
                  </button>
                  <button class="meggy-header-btn" id="meggy-lesson-prev" title="Anterior (P)">
                    <i class="bi bi-skip-start"></i>
                  </button>
                  <button class="meggy-header-btn" id="meggy-lesson-next" title="Próximo (N)">
                    <i class="bi bi-skip-end"></i>
                  </button>
                  <button class="meggy-header-btn" id="meggy-lesson-download" title="Download">
                    <i class="bi bi-download"></i>
                  </button>
                </div>
              </div>
            </div>
            <div class="meggy-lesson-body">
              <div class="meggy-lesson-player">
                <video id="meggy-video" src="${videoUrl}" controls autoplay playsinline
                  style="width:100%;max-height:70vh;border-radius:12px;background:#000;box-shadow:0 10px 30px -12px rgba(0,0,0,0.55);"
                  onerror="this.style.display='none';document.getElementById('meggy-player-error').style.display='block'">
                </video>
                <div id="meggy-player-error" style="display:none;padding:40px;text-align:center;color:#ff8b9f;">
                  ⚠️ Não foi possível carregar o vídeo.<br>
                  <a href="${videoUrl}" target="_blank" style="color:#5ddeda;">Abrir em nova aba</a>
                </div>
                <div class="meggy-player-controls">
                  <select id="meggy-speed" title="Velocidade">
                    <option value="0.5">0.5x</option>
                    <option value="0.75">0.75x</option>
                    <option value="1" selected>1x</option>
                    <option value="1.25">1.25x</option>
                    <option value="1.5">1.5x</option>
                    <option value="2">2x</option>
                  </select>
                  <button class="meggy-header-btn" id="meggy-pip" title="Picture-in-Picture">
                    <i class="bi bi-pip"></i> PiP
                  </button>
                  <button class="meggy-header-btn" id="meggy-fullscreen" title="Fullscreen (F)">
                    <i class="bi bi-fullscreen"></i>
                  </button>
                  <span style="margin-left:auto;color:#6b7488;font-size:12px;">
                    <span id="meggy-time">00:00</span> / <span id="meggy-duration">00:00</span>
                  </span>
                </div>
              </div>
              <aside class="meggy-lesson-sidebar" id="meggy-lesson-sidebar">
                <div class="meggy-lesson-tabs">
                  <button class="meggy-lesson-tab active" data-tab="playlist">📋 Playlist</button>
                  <button class="meggy-lesson-tab" data-tab="ai">🤖 Meggy AI</button>
                  <button class="meggy-lesson-tab" data-tab="material">📄 Material</button>
                </div>
                <div class="meggy-lesson-tab-content" id="meggy-lesson-tab-content">
                  <div class="meggy-tab-pane active" id="meggy-tab-playlist">
                    <div class="meggy-playlist-header">
                      <span id="meggy-playlist-count">${idx + 1} / ${pl.length}</span>
                      <button class="meggy-header-btn" id="meggy-load-interfolder" title="Carregar vídeos de todas as subpastas" style="font-size:11px;padding:4px 8px;">
                        <i class="bi bi-collection"></i> Interfolder
                      </button>
                    </div>
                    <div class="meggy-playlist-items" id="meggy-playlist-items">
                      ${pl.map((v, i) => `
                        <div class="meggy-playlist-item ${i === idx ? 'active' : ''}" data-idx="${i}">
                          <span class="meggy-playlist-num">${i + 1}</span>
                          <div class="meggy-playlist-info">
                            <span class="meggy-playlist-name" title="${v.name}">${v.name}</span>
                            ${v.folder ? `<span class="meggy-playlist-folder">${v.folder}</span>` : ''}
                          </div>
                          ${v.size ? `<span class="meggy-playlist-size">${v.size}</span>` : ''}
                        </div>
                      `).join('')}
                    </div>
                  </div>
                  <div class="meggy-tab-pane" id="meggy-tab-ai">
                    <div class="meggy-ai-placeholder">
                      <div class="meggy-placeholder-icon">🤖</div>
                      <div class="meggy-placeholder-title">Meggy AI</div>
                      <div class="meggy-placeholder-desc">Chat, resumos, questões e flashcards da aula</div>
                      <button class="meggy-header-btn" id="meggy-load-ai" style="margin-top:16px;">
                        <i class="bi bi-robot"></i> Carregar Meggy AI
                      </button>
                      <div class="meggy-placeholder-phase">Faz lazy-load do GDIndex (gdi-meggy.js)</div>
                    </div>
                  </div>
                  <div class="meggy-tab-pane" id="meggy-tab-material">
                    <div class="meggy-ai-placeholder">
                      <div class="meggy-placeholder-icon">📄</div>
                      <div class="meggy-placeholder-title">Material da Aula</div>
                      <div class="meggy-placeholder-desc">PDFs e materiais de apoio da pasta</div>
                      <button class="meggy-header-btn" id="meggy-load-material" style="margin-top:16px;">
                        <i class="bi bi-folder"></i> Carregar Materiais
                      </button>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        `;

        const video = document.getElementById('meggy-video');
        const speedSel = document.getElementById('meggy-speed');
        const timeEl = document.getElementById('meggy-time');
        const durEl = document.getElementById('meggy-duration');
        const lessonPage = document.getElementById('meggy-lesson-page');

        // ─── Resume tracking ───
        let lastSave = 0;
        const saveResume = () => {
          if (!video || !video.currentTime) return;
          const now = Date.now();
          if (now - lastSave < 5000) return;
          lastSave = now;
          try {
            if (window.GDIUser && window.GDIUser.setResume) {
              window.GDIUser.setResume(videoUrl, video.currentTime, video.duration || 0);
            }
          } catch (e) {}
        };

        // ─── Toast "Retomando de HH:MM:SS" ───
        const showResumeToast = (pos) => {
          const toast = document.createElement('div');
          toast.className = 'meggy-toast-resume';
          toast.innerHTML = `<i class="bi bi-clock-history"></i> Retomando de <b>&nbsp;${formatTime(pos)}</b>
            <button class="meggy-toast-btn" type="button">Recomeçar</button>`;
          main.appendChild(toast);
          toast.querySelector('.meggy-toast-btn').onclick = () => { video.currentTime = 0; toast.remove(); };
          setTimeout(() => { toast.classList.add('meggy-toast-out'); setTimeout(() => toast.remove(), 250); }, 7000);
        };

        function formatTime(s) {
          if (!isFinite(s)) return '00:00';
          s = Math.floor(s);
          const h = Math.floor(s / 3600);
          const m = Math.floor((s % 3600) / 60);
          const sec = s % 60;
          return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`;
        }

        // ─── Video events ───
        video.addEventListener('loadedmetadata', () => {
          durEl.textContent = formatTime(video.duration);
          if (resumePos > 10 && video.duration && resumePos < video.duration * 0.9) {
            video.currentTime = resumePos;
            showResumeToast(resumePos);
            console.log('[Meggy Shell] resume aplicado:', resumePos, 's');
          }
        });
        video.addEventListener('timeupdate', () => { timeEl.textContent = formatTime(video.currentTime); saveResume(); });
        video.addEventListener('ended', () => { if (idx < pl.length - 1) switchTo(idx + 1); });

        // ─── Switch video (sem recarregar página) ───
        function switchTo(newIdx) {
          if (newIdx < 0 || newIdx >= pl.length) return;
          const v = pl[newIdx];
          idx = newIdx;
          Shell.state.playerIndex = idx;
          video.src = v.link.startsWith('http') ? v.link : (window.location.origin + v.link);
          video.play().catch(() => {});
          document.getElementById('meggy-lesson-name').textContent = '🎬 ' + v.name;
          document.getElementById('meggy-playlist-count').textContent = `${idx + 1} / ${pl.length}`;
          document.querySelectorAll('.meggy-playlist-item').forEach((el, i) => {
            el.classList.toggle('active', i === idx);
          });
          // Atualizar resume
          resumePos = 0;
          try {
            const newUrl = v.link.startsWith('http') ? v.link : (window.location.origin + v.link);
            if (window.GDIUser && window.GDIUser.state && window.GDIUser.state.resume) {
              const saved = window.GDIUser.state.resume[newUrl];
              if (saved && typeof saved === 'number') resumePos = saved;
              else if (saved && saved.pos) resumePos = saved.pos;
            }
          } catch (e) {}
          main.scrollTop = 0;
        }

        // ─── Controls ───
        speedSel.onchange = () => { video.playbackRate = parseFloat(speedSel.value); };
        document.getElementById('meggy-pip').onclick = async () => {
          try { await video.requestPictureInPicture(); } catch (e) { console.warn('PiP:', e); }
        };
        document.getElementById('meggy-fullscreen').onclick = () => {
          if (document.fullscreenElement) document.exitFullscreen();
          else video.requestFullscreen().catch(() => {});
        };
        document.getElementById('meggy-lesson-download').onclick = () => {
          const a = document.createElement('a');
          a.href = videoUrl; a.download = name; a.target = '_blank';
          document.body.appendChild(a); a.click(); a.remove();
        };
        document.getElementById('meggy-lesson-prev').onclick = () => { if (idx > 0) switchTo(idx - 1); };
        document.getElementById('meggy-lesson-next').onclick = () => { if (idx < pl.length - 1) switchTo(idx + 1); };
        document.getElementById('meggy-lesson-back').onclick = () => {
          // Voltar para a pasta anterior (usando estado salvo)
          const prevFolder = Shell.state.previousFolderPath || '/drives';
          console.log('[Meggy Shell] voltando para:', prevFolder);
          Shell.state._inPlayer = false;
          Shell.router.navigate(prevFolder);
          // Após navegar, re-renderizar a pasta
          setTimeout(() => {
            if (window.MeggyShell && Shell.state.previousFolderPath) {
              Shell.views._renderDrives(Shell.state.previousFolderPath);
            }
          }, 100);
        };

        // ─── Playlist item click ───
        document.querySelectorAll('.meggy-playlist-item').forEach(item => {
          item.onclick = () => { const i = parseInt(item.dataset.idx); if (i !== idx) switchTo(i); };
        });

        // ─── Tabs (Playlist / AI / Material) ───
        document.querySelectorAll('.meggy-lesson-tab').forEach(tab => {
          tab.onclick = () => {
            const tabName = tab.dataset.tab;
            document.querySelectorAll('.meggy-lesson-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.meggy-tab-pane').forEach(p => p.classList.remove('active'));
            document.getElementById('meggy-tab-' + tabName).classList.add('active');
          };
        });

        // ─── Modo Foco (S) ───
        let focusMode = false;
        document.getElementById('meggy-lesson-focus').onclick = toggleFocus;
        function toggleFocus() {
          focusMode = !focusMode;
          lessonPage.classList.toggle('focus-mode', focusMode);
          const sidebar = document.getElementById('meggy-sidebar');
          if (sidebar) sidebar.style.display = focusMode ? 'none' : '';
          const header = document.getElementById('meggy-header');
          if (header) header.style.display = focusMode ? 'none' : '';
          console.log('[Meggy Shell] modo foco:', focusMode ? 'ON' : 'OFF');
        }

        // ─── Interfolder playlist (loadCrossFolderPlaylist) ───
        document.getElementById('meggy-load-interfolder').onclick = async () => {
          const btn = document.getElementById('meggy-load-interfolder');
          btn.innerHTML = '<div class="spinner-border spinner-border-sm"></div> Carregando...';
          btn.disabled = true;
          try {
            const currentPath = Shell.state.currentFolderPath || '';
            if (!currentPath) { btn.innerHTML = '⚠️ Sem pasta'; return; }
            const parts = currentPath.split('/').filter(Boolean);
            const parentPath = '/' + parts.slice(0, -1).join('/') + '/';
            console.log('[Meggy Shell] interfolder: parent=', parentPath);
            if (!window.gdiListAllFiles) { btn.innerHTML = '⚠️ gdiListAllFiles'; return; }
            const parentFiles = await window.gdiListAllFiles(parentPath, '');
            const subFolders = parentFiles.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
            console.log('[Meggy Shell] interfolder:', subFolders.length, 'subpastas');
            const collected = [];
            const BATCH = 6;
            for (let i = 0; i < subFolders.length; i += BATCH) {
              const batch = subFolders.slice(i, i + BATCH);
              const results = await Promise.all(batch.map(folder => {
                const fpath = parentPath + encodeURIComponent(folder.name) + '/';
                return window.gdiListAllFiles(fpath, '').then(files => {
                  const videos = files
                    .filter(f => (f.mimeType || '').includes('video') || f.name.endsWith('.mp4'))
                    .filter(f => !(f.name.includes('.part-')))
                    .map(f => ({
                      name: f.name,
                      link: f.link ? (f.link.startsWith('http') ? f.link : window.location.origin + f.link) : '',
                      size: f.size ? (f.size/1024/1024).toFixed(1) + ' MB' : '',
                      folder: folder.name
                    }));
                  return videos;
                }).catch(() => []);
              }));
              results.forEach(v => collected.push(...v));
              btn.innerHTML = `<div class="spinner-border spinner-border-sm"></div> ${collected.length} vídeos`;
            }
            const seen = new Set();
            const deduped = collected.filter(v => {
              const k = (v.folder || '') + '|' + v.name;
              if (seen.has(k)) return false;
              seen.add(k); return true;
            });
            deduped.sort((a, b) => (a.folder || '').localeCompare(b.folder || '') || a.name.localeCompare(b.name));
            pl = deduped;
            Shell.state.playerPlaylist = pl;
            idx = pl.findIndex(v => v.name === name || v.link === videoUrl);
            if (idx === -1) idx = 0;
            Shell.state.playerIndex = idx;
            const itemsEl = document.getElementById('meggy-playlist-items');
            itemsEl.innerHTML = pl.map((v, i) => `
              <div class="meggy-playlist-item ${i === idx ? 'active' : ''}" data-idx="${i}">
                <span class="meggy-playlist-num">${i + 1}</span>
                <div class="meggy-playlist-info">
                  <span class="meggy-playlist-name" title="${v.name}">${v.name}</span>
                  ${v.folder ? `<span class="meggy-playlist-folder">${v.folder}</span>` : ''}
                </div>
                ${v.size ? `<span class="meggy-playlist-size">${v.size}</span>` : ''}
              </div>
            `).join('');
            document.getElementById('meggy-playlist-count').textContent = `${idx + 1} / ${pl.length}`;
            document.querySelectorAll('.meggy-playlist-item').forEach(item => {
              item.onclick = () => { const i = parseInt(item.dataset.idx); if (i !== idx) switchTo(i); };
            });
            btn.innerHTML = `<i class="bi bi-check"></i> ${pl.length} vídeos`;
            btn.disabled = false;
            console.log('[Meggy Shell] interfolder completo:', pl.length, 'vídeos');
          } catch (e) {
            console.error('[Meggy Shell] interfolder erro:', e);
            btn.innerHTML = '⚠️ Erro';
          }
        };

        // ─── Meggy AI (lazy load GDIndex) ───
        document.getElementById('meggy-load-ai').onclick = async () => {
          const btn = document.getElementById('meggy-load-ai');
          btn.innerHTML = '<div class="spinner-border spinner-border-sm"></div> Carregando GDIndex...';
          btn.disabled = true;
          const ok = await Shell.loadFullGDIndex();
          if (ok && window.__gdiMeggy && window.__gdiMeggy.widget) {
            if (window.__gdiMeggy.widget.open) window.__gdiMeggy.widget.open();
            const aiPane = document.getElementById('meggy-tab-ai');
            aiPane.innerHTML = `
              <div style="padding:16px;color:#9aa4b8;font-size:13px;">
                <p>🤖 <b>Meggy AI carregada!</b></p>
                <p>O widget da Meggy foi aberto (canto inferior direito).</p>
                <p style="margin-top:12px;color:#6b7488;">Use o widget para:</p>
                <ul style="margin:8px 0;padding-left:20px;color:#9aa4b8;">
                  <li>💬 Chat sobre a aula</li>
                  <li>📝 Gerar resumo</li>
                  <li>❓ Criar questões</li>
                  <li>🃏 Flashcards</li>
                </ul>
              </div>
            `;
          } else {
            btn.innerHTML = '⚠️ Falhou';
            btn.disabled = false;
          }
        };

        // ─── Material (PDFs da pasta) ───
        document.getElementById('meggy-load-material').onclick = async () => {
          const btn = document.getElementById('meggy-load-material');
          btn.innerHTML = '<div class="spinner-border spinner-border-sm"></div> Carregando...';
          btn.disabled = true;
          try {
            const currentPath = Shell.state.currentFolderPath || '';
            if (!currentPath || !window.gdiListAllFiles) { btn.innerHTML = '⚠️ Sem pasta'; return; }
            const files = await window.gdiListAllFiles(currentPath, '');
            const pdfs = files.filter(f => (f.mimeType || '').includes('pdf') || f.name.endsWith('.pdf'));
            const materialPane = document.getElementById('meggy-tab-material');
            if (!pdfs.length) {
              materialPane.innerHTML = '<div class="meggy-placeholder"><div class="meggy-placeholder-icon">📄</div><div class="meggy-placeholder-title">Nenhum PDF nesta pasta</div></div>';
            } else {
              materialPane.innerHTML = `
                <div style="padding:12px;">
                  <h3 style="font-size:14px;color:#9aa4b8;margin-bottom:12px;">📄 ${pdfs.length} materiais</h3>
                  ${pdfs.map(p => `
                    <div class="meggy-playlist-item" style="cursor:pointer;" data-pdf="${p.link || ''}">
                      <span class="meggy-playlist-num">📄</span>
                      <div class="meggy-playlist-info">
                        <span class="meggy-playlist-name" title="${p.name}">${p.name}</span>
                        <span class="meggy-playlist-folder">${p.size ? (p.size/1024/1024).toFixed(1)+' MB' : 'PDF'}</span>
                      </div>
                    </div>
                  `).join('')}
                </div>
              `;
              materialPane.querySelectorAll('[data-pdf]').forEach(el => {
                el.onclick = () => {
                  const link = el.dataset.pdf;
                  if (link) window.open(link.startsWith('http') ? link : window.location.origin + link, '_blank');
                };
              });
            }
          } catch (e) {
            console.error('[Meggy Shell] material erro:', e);
          }
        };

        // ─── Atalhos de teclado ───
        const keyHandler = (e) => {
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
          switch (e.key) {
            case ' ': e.preventDefault(); video.paused ? video.play() : video.pause(); break;
            case 'ArrowRight': video.currentTime = Math.min(video.duration, video.currentTime + 10); break;
            case 'ArrowLeft': video.currentTime = Math.max(0, video.currentTime - 10); break;
            case 'ArrowUp': e.preventDefault(); video.volume = Math.min(1, video.volume + 0.1); break;
            case 'ArrowDown': e.preventDefault(); video.volume = Math.max(0, video.volume - 0.1); break;
            case 'f': case 'F':
              if (document.fullscreenElement) document.exitFullscreen();
              else video.requestFullscreen().catch(() => {});
              break;
            case 'm': case 'M': video.muted = !video.muted; break;
            case 'n': case 'N': if (idx < pl.length - 1) switchTo(idx + 1); break;
            case 'p': case 'P': if (idx > 0) switchTo(idx - 1); break;
            case 's': case 'S': toggleFocus(); break;
          }
        };
        document.addEventListener('keydown', keyHandler);
        main._cleanupKeyboard = () => document.removeEventListener('keydown', keyHandler);

        // Scroll to top
        main.scrollTop = 0;

        // ─── Auto-load interfolder se playlist tem só 1 vídeo ───
        if (pl.length <= 1 && Shell.state.currentFolderPath) {
          console.log('[Meggy Shell] auto-load interfolder (playlist só 1 vídeo)');
          setTimeout(() => {
            const btn = document.getElementById('meggy-load-interfolder');
            if (btn) btn.click();
          }, 1000);
        }
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

