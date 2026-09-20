// ═══════════════════════════════════════════════════════════════
// gdi-extras-loader.js — Carregador modular FORK-AWARE
//
// Esta versão serve os módulos do PRÓPRIO worker (URL relativa /modular/)
// em vez de puxar do jsdelivr CDN. Isso significa:
//   • Cada fork tem seu próprio worker que serve seus próprios módulos
//   • Sem dependência do CDN externo
//   • Atualizações instantâneas (sem cache jsdelivr de 24h)
//   • Mais rápido (1 round-trip a menos)
//   • Funciona para qualquer pessoa que faça fork
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // URL relativa — sempre aponta para o próprio worker.
  // Cada fork/worker serve seus próprios módulos da rota /modular/<file>.js
  const BASE_URL = '/modular/';

  // Versão para cache-busting (incrementar a cada release)
  const CACHE_VERSION = 'v1.0.0';

  // Módulos essenciais (sempre carregados)
  const CORE_MODULES = [
    'storage.js',        // abstração de persistência (Drive/D1/Hybrid)
    'gdi-core.js',       // núcleo: state, escHtml, gdiModal, helpers
  ];

  // Módulos pesados (lazy-load só quando necessário)
  const LAZY_MODULES = {
    'gdi-ui.js':         ['page:change', 'user:ready'],         // carregado após primeiro render
    'gdi-pdf.js':        ['pdf:requested'],                     // carregado só quando abrir PDF
    'gdi-meggy.js':      ['meggy:requested'],                   // carregado só quando usar IA
    'gdi-study.js':      ['central:open', 'area-aluno:open'],  // carregado só quando abrir Área do Aluno
  };

  // Estado interno
  const _loaded = new Set();
  const _loading = new Map(); // name -> Promise
  const _failedListeners = [];

  function log() {
    if (window.UI && window.UI.debug_mode) {
      console.log('[gdi-extras]', ...arguments);
    }
  }

  function loadScript(name) {
    if (_loaded.has(name)) return Promise.resolve();
    if (_loading.has(name)) return _loading.get(name);

    const url = BASE_URL + name + '?v=' + CACHE_VERSION;
    const p = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.defer = true;
      s.onload = () => {
        _loaded.add(name);
        _loading.delete(name);
        log('carregado:', name);
        resolve();
      };
      s.onerror = () => {
        _loading.delete(name);
        console.error('[gdi-extras] FALHA ao carregar:', name, 'de', url);
        _failedListeners.forEach(fn => { try { fn(name); } catch (_) {} });
        reject(new Error('load failed: ' + name));
      };
      document.head.appendChild(s);
    });

    _loading.set(name, p);
    return p;
  }

  // Carrega módulos em paralelo
  async function loadModules(names) {
    return Promise.allSettled(names.map(loadScript));
  }

  // Carrega módulos lazy quando um evento é disparado
  function setupLazyLoading() {
    for (const [mod, events] of Object.entries(LAZY_MODULES)) {
      events.forEach(ev => {
        document.addEventListener(ev, () => {
          if (!_loaded.has(mod) && !_loading.has(mod)) {
            log('lazy-load disparado por evento:', ev, '→', mod);
            loadScript(mod).catch(() => {});
          }
        }, { once: true });
      });
    }
  }

  // Detecta contexto: home page vs folder listing
  function detectContext() {
    const p = window.location.pathname;
    if (p === '/' || p === '') return 'home';
    if (/^\/\d+:/.test(p)) return 'folder';
    if (p.startsWith('/download.aspx') || p.startsWith('/f/')) return 'viewer';
    return 'other';
  }

  // Bootstrap inteligente:
  //   - home: carrega core + ui (para ter botão Área do Aluno)
  //   - folder: carrega core + ui (Pomodoro, Continue card)
  //   - viewer: carrega core + pdf ou meggy conforme extensão
  async function bootstrap() {
    const ctx = detectContext();
    log('contexto:', ctx);

    // Carrega core sempre
    await loadModules(CORE_MODULES);

    // Carrega UI em home e folder (precisa do botão Área do Aluno)
    if (ctx === 'home' || ctx === 'folder') {
      await loadModules(['gdi-ui.js']);
      // dispara evento para o ui.js saber que está pronto
      document.dispatchEvent(new CustomEvent('gdi:ui-ready'));
    }

    // Em viewer: detecta tipo de arquivo e carrega módulo apropriado
    if (ctx === 'viewer') {
      const ext = (window.location.pathname.split('.').pop() || '').toLowerCase();
      if (ext === 'pdf') {
        await loadModules(['gdi-pdf.js']);
      } else if (['mp4', 'webm', 'mkv', 'mov', 'mp3', 'm4a'].includes(ext)) {
        // player de vídeo/áudio já está no app.min.js original
      }
    }

    // Setup lazy-loading para módulos restantes
    setupLazyLoading();

    // Detecta primeiro acesso à Área do Aluno (tecla "C" ou clique no botão)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'c' || e.key === 'C') {
        if (!_loaded.has('gdi-study.js')) {
          loadScript('gdi-study.js').then(() => {
            document.dispatchEvent(new CustomEvent('central:open'));
          });
        }
      }
    }, { once: true });
  }

  // API pública
  window.GDIExtrasLoader = {
    version: CACHE_VERSION,
    loadScript,
    loadModules,
    isLoaded: (name) => _loaded.has(name),
    onFailed: (fn) => _failedListeners.push(fn),
    detectContext,
  };

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

  console.log('[gdi-extras] loader fork-aware v' + CACHE_VERSION + ' — BASE_URL:', BASE_URL);
})();
