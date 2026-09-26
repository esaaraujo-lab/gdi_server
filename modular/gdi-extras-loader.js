// ═══════════════════════════════════════════════════════════════
// gdi-extras-loader.js — Carregador dos módulos modularizados (REFACTORED)
//
// Substitui o gdi-extras.js monolítico por arquivos menores carregados em
// paralelo. Mantém 100% de compatibilidade.
//
// ⚠️ CORREÇÃO CRÍTICA #1: o cache-buster era `Date.now()`, o que INVALIDAVA
// o cache HTTP/CDN para ~5MB de JS em CADA page-load. Trocado por versão
// fixa — bump só quando publicar código novo.
//
// ⚠️ CORREÇÃO CRÍTICA #2: guard anti-duplicate-bootstrap. O loader estava
// rodando 4× por page-load, acumulando listeners/observers/timers
// exponencialmente → freeze permanente. Agora só roda 1×.
//
// ⚠️ ARQUITETURA: módulos servidos pelo jsdelivr CDN direto do repo
// PÚBLICO (sem secrets). Mais rápido que rota do worker, cache 1 ano,
// dispensa GH_TOKEN. O worker.js mantém /modular/ como fallback.
// ═══════════════════════════════════════════════════════════════

(function(){
  'use strict';

  // ★★★ TROQUE PELO SEU REPO PÚBLICO ★★★
  // Formato: <usuario>/<repo> (sem https://github.com/)
  const PUBLIC_REPO = 'esaaraujo-lab/gdi_server';  // ← TROQUE AQUI

  // jsdelivr CDN: cache mundial, immutable, dispensa GH_TOKEN (repo público)
  // ★ v1.0.75: Use raw.githubusercontent.com instead of jsdelivr CDN to avoid stale cache issues
  // ★ v1.0.77: Use /modular/ route (worker proxies from raw.githubusercontent.com)
  // This avoids jsdelivr CDN cache issues — worker always gets latest from GitHub.
  const BASE_URL = '/modular/';

  // ★ Cache-buster fixo. Bump este número SÓ ao publicar nova versão.
  // Antes era Date.now() — isso causava re-download de ~5MB em toda navegação.
  // ★ v1.0.86: bump 90 → 91 (MODULARIZAÇÃO — gdi-study.js + gdi-meggy.js split em 15 módulos em study/ + meggy/).
  const CACHE_VERSION = '91';  // ★ v1.0.86: modularização completa
  window.CACHE_VERSION = CACHE_VERSION;

  const MODULES = [
    // 1. Core (mantém)
    'gdi-core.js',
    'gdi-worker-bridge.js',
    'storage.js',
    'gdi-pdf.js',
    'gdi-ui.js',
    // 2. Meggy modularizado (7 módulos em modular/meggy/) — substitui gdi-meggy.js
    'meggy/meggy-utils.js',          // 1o — helpers + CSS + constants
    'meggy/meggy-pdf-engine.js',     // PDF.js + OCR
    'meggy/meggy-cache.js',          // generateAll + _chainCache/_inflight
    'meggy/meggy-questions.js',      // question bank + quiz
    'meggy/meggy-flashcards.js',     // flashcards
    'meggy/meggy-summaries.js',      // summary/mindmap + battalion + ASSEMBLA gdiIsaPdf
    'meggy/meggy-widget.js',         // FAB + chat panel + __gdiMeggySuggest
    // 3. Study modularizado (8 módulos em modular/study/) — substitui gdi-study.js
    'study/study-theme.js',          // 1o — CSS BlackTie
    'study/study-scanner.js',        // scanner incremental
    'study/study-courses.js',        // courses + add modal
    'study/study-questions.js',      // questões/simulado/cronograma
    'study/study-advanced.js',       // provas/redação/radar
    'study/study-tabs-legacy.js',    // stubs antigos
    'study/study-player-guard.js',   // video stall watchdog
    'study/study-panel.js'           // LAST — shell + home + drives + nav
  ];

  // Também carrega os 2 Web Workers que agora suportam a plataforma:
  //  - gdi-list-worker.js   → listagem de pastas + varredura cross-folder
  //  - meggy-pdf-worker.js  → extração de texto/OCR de PDFs
  // Eles são register-only aqui; o instantiate acontece sob demanda no
  // gdi-worker-bridge.js. O prefetch abaixo apenas aquece o cache HTTP.
  const WORKERS = ['gdi-list-worker.js', 'meggy-pdf-worker.js'];

  function moduleUrl(name){
    return BASE_URL + name + '?v=' + CACHE_VERSION;
  }

  function loadScript(url, isAsync){
    return new Promise((resolve, reject)=>{
      const s = document.createElement('script');
      s.src = url;
      s.type = 'text/javascript';
      // crossOrigin só faz sentido para URLs absolutas; em URLs relativas
      // (mesma origem) o navegador ignora o atributo, mas deixá-lo como
      // 'anonymous' é inofensivo.
      s.crossOrigin = 'anonymous';
      if(isAsync){ s.async = true; s.defer = true; }
      s.onload = ()=>resolve(url);
      s.onerror = ()=>{
        console.error('[GDI Loader] Falha ao carregar:', url);
        reject(new Error('Failed: ' + url));
      };
      document.head.appendChild(s);
    });
  }

  // Pré-aquece o cache HTTP dos workers (não cria instâncias ainda)
  function prefetchWorkers(){
    WORKERS.forEach(w => {
      try {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = moduleUrl(w);   // = '/modular/' + w + '?v=' + CACHE_VERSION
        link.as = 'script';
        document.head.appendChild(link);
      } catch(_) {}
    });
  }

  // ★ FIX BUG 10 (v80): retry com backoff para carga do gdi-core.js —
  // se /modular/ retornar 502/503 (Cloudflare Worker cold start, deploy,
  // brief outage), o bootstrap falhava silenciosamente e a UI ficava morta.
  // Agora tenta 3× com backoff linear (1s, 2s) antes de desistir.
  async function loadCoreWithRetry(url, attempts){
    attempts = attempts || 3;
    for (let i = 0; i < attempts; i++) {
      try { await loadScript(url, false); return true; }
      catch(e) {
        console.warn('[GDI Loader] core load attempt ' + (i+1) + '/' + attempts + ' failed:', e.message);
        if (i < attempts - 1) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
    _bootstrapPromise = null;
    try { (window.showToast || function(m){console.error(m);})('Falha ao carregar módulos. Recarregue a página.'); } catch(_){}
    return false;
  }

  // ★ FIX BUG 10 (v80): retry simples (2× com 500ms) para módulos auxiliares —
  // menos agressivo que o core (esses rodam em paralelo via Promise.allSettled).
  async function loadWithRetry(url, isAsync){
    for (let i = 0; i < 2; i++) {
      try { await loadScript(url, isAsync); return true; }
      catch(e) { if (i === 0) await new Promise(r => setTimeout(r, 500)); else throw e; }
    }
    return false;
  }

  // ★★★ GUARD CRÍTICO contra duplicate bootstrap ★★★
  // O console do Firefox Profiler mostrou o loader rodando 4+ VEZES seguidas,
  // cada vez re-baixando ~5MB e re-avaliando todos os módulos. Isso cria
  // listeners duplicados, MutationObservers duplicados, setInterval duplicados
  // → acumulação exponencial → FREEZE PERMANENTE da thread principal.
  //
  // Esse guard garante que bootstrap() só roda UMA VEZ por page-load.
  // Se alguém chamar gdiReloadExtras() ou re-injetar o script tag, o guard
  // bloqueia a execução duplicada.
  let _bootstrapped = false;
  let _bootstrapPromise = null;

  async function bootstrap(){
    // Guard: já carregou? Retorna a promise existente.
    if (_bootstrapped) {
      console.log('[GDI Loader] já carregado — pulando bootstrap duplicado');
      return _bootstrapPromise;
    }
    // Guard: está carregando agora? Retorna a promise em andamento (dedupe).
    if (_bootstrapPromise) {
      console.log('[GDI Loader] bootstrap em andamento — dedupe');
      return _bootstrapPromise;
    }

    _bootstrapPromise = (async () => {
      const t0 = performance.now();
      console.log('[GDI Loader] iniciando carga modular — BASE_URL:', BASE_URL);

      // ★★★ WAIT FOR Bus: os módulos (gdi-core, gdi-ui, etc.) dependem de
      // Bus, que é definido no app.min.js com `const Bus = ...`.
      // IMPORTANTE: `const` cria binding global mas NÃO propriedade de window,
      // então checamos `typeof Bus` direto (não window.Bus).
      // Se o loader disparar antes do app.min.js avaliar, os módulos quebram
      // com "Bus is not defined". Esperamos até o Bus estar disponível (timeout 10s).
      const _busWaitT0 = Date.now();
      while (typeof Bus === 'undefined') {
        if (Date.now() - _busWaitT0 > 10000) {
          console.error('[GDI Loader] TIMEOUT esperando Bus — app.min.js não carregou?');
          return;
        }
        await new Promise(r => setTimeout(r, 20));
      }
      console.log('[GDI Loader] Bus disponível, prosseguindo carga modular');

      try{
        const coreOk = await loadCoreWithRetry(moduleUrl('gdi-core.js'));
        if (!coreOk) return;
        console.log('[GDI Loader] ✓ gdi-core.js carregado');
      }catch(e){
        console.error('[GDI Loader] FALHA CRÍTICA no core:', e.message);
        console.error('[GDI Loader] URL tentada:', moduleUrl('gdi-core.js'));
        _bootstrapPromise = null;  // permite retry
        return;
      }

      // Carrega o bridge logo após o core (antes dos demais) para que os
      // overrides de gdiListAllFiles / extractPdfText estejam em vigor
      // quando gdi-ui.js / gdi-meggy.js rodarem seus init().
      // ★ v1.0.86: CARGA SEQUENCIAL (não paralela) — garante ordem de dependências.
      // Os módulos meggy/* e study/* usam `const U = window.__gdiMeggy.utils` em load-time,
      // então meggy-utils.js DEVE carregar antes de meggy-questions.js etc.
      // Cada módulo ganha retry de 2× (loadWithRetry).
      const others = MODULES.slice(1);
      let ok = 0, fail = 0;
      for (const m of others) {
        try {
          await loadWithRetry(moduleUrl(m), true);
          ok++;
          console.log('[GDI Loader] ✓', m);
        } catch(e) {
          fail++;
          console.warn('[GDI Loader] ✗', m, '—', e.message);
        }
      }

      prefetchWorkers();

      const t1 = performance.now();
      console.log(`[GDI Loader] carga completa em ${Math.round(t1-t0)}ms — ${ok} OK, ${fail} falhas`);

      _bootstrapped = true;  // ★ marca como carregado — qualquer chamada futura retorna imediatamente

      try{ window.dispatchEvent(new CustomEvent('gdi-extras-ready')); }catch(_){}
    })();

    return _bootstrapPromise;
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bootstrap, {once:true});
  }else{
    bootstrap();
  }

  // gdiReloadExtras pode ser chamado manualmente, mas o guard impede re-carga
  // duplicada. Para forçar re-carga real, usar gdiForceReloadExtras() abaixo.
  window.gdiReloadExtras = bootstrap;
  window.gdiForceReloadExtras = function(){
    _bootstrapped = false;
    _bootstrapPromise = null;
    return bootstrap();
  };
})();
