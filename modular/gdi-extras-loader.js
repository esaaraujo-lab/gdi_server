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
  // ★ v1.0.91: bump 92 → 93 (Shaka skin + Pomodoro sidebar + video-in-panel + PDF split + rest mode fix + OCR AI routing + parallel dispatch).
  const CACHE_VERSION = '126';  // ★ v1.0.119: Fix loader — study-insights.js estava faltando na STUDY_CHAIN (só estava no MODULES array principal, mas a chain manual não tinha). Agora carrega antes do study-panel.js.
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
    'study/study-insights.js',       // ★ v1.0.118: Dashboard + Meggy Coach
    'study/study-plan.js',           // ★ v1.0.139: Plano de estudo adaptativo
    'gdi-player-enhancer.js',        // ★ v1.0.138: Speed memory + keyboard shortcuts + resume prompt
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
  // ★ FIX Task 20-9 Item 6: aumentado para 3 retries (4 tentativas totais) com
  // backoff exponencial (500ms, 1000ms, 2000ms). Antes, 2 tentativas com 500ms
  // fixos não eram suficientes para transient failures (Cloudflare Worker cold
  // start, brief network blip) — módulos ficavam faltando e a UI quebrava.
  async function loadWithRetry(url, isAsync){
    const backoff = [500, 1000, 2000];   // delays before retry 1, 2, 3
    for (let i = 0; i <= backoff.length; i++) {
      try {
        await loadScript(url, isAsync);
        return true;
      } catch(e) {
        if (i < backoff.length) {
          console.warn('[GDI Loader] retry ' + (i + 1) + '/' + backoff.length + ' for', url, '—', e.message);
          await new Promise(r => setTimeout(r, backoff[i]));
        } else {
          throw e;   // all retries exhausted — propagate to caller
        }
      }
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
          // ★ FIX CYCLE2-9: clear _bootstrapPromise so a future bootstrap() call
          // (e.g. user-triggered gdiReloadExtras, or a "retry" button) can re-attempt
          // the load if Bus becomes available later. WITHOUT this, the dedupe guard
          // at the top of bootstrap() sees a truthy (resolved-to-undefined) promise
          // and returns it forever — every subsequent call silently resolves to
          // undefined and the loader is permanently dead until page refresh.
          // Mirrors the pattern already used by the core-load-failure path below
          // (which clears _bootstrapPromise inside loadCoreWithRetry before
          // returning false, then the IIFE returns at `if (!coreOk) return;`).
          _bootstrapPromise = null;
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
      // Cada módulo ganha retry de 3× (loadWithRetry).
      //
      // ★ FIX Task 20-9 Item 5: ANTES todos os 16 módulos pós-core eram carregados
      // SEQUENCIALMENTE num único for-loop — ~5MB de JS em série, um atrás do
      // outro, mesmo quando não houvesse dependência entre eles. Agora dividimos
      // em 3 cadeias:
      //   1) Core-chain (sequencial): worker-bridge → storage → gdi-pdf → gdi-ui
      //      (gdi-ui e outros dependem do bridge + storage + gdi-pdf, então
      //       ficam na cadeia core que roda ANTES das outras duas).
      //   2) Meggy-chain (sequencial): meggy-utils → ... → meggy-widget
      //      (order within chain preserved — utils must load first).
      //   3) Study-chain (sequencial): study-theme → ... → study-panel
      //      (order within chain preserved — theme + panel last).
      // Chains 2 e 3 rodam EM PARALELO entre si (Promise.allSettled) depois da
      // chain 1. Isso corta o tempo de carga sequencial ~pela metade em redes
      // rápidas (HTTP/2 multiplexa os requests), sem quebrar dependências.
      // ★ FIX Task 20-9 Item 7: cada módulo é envolvido em try/catch próprio —
      // se um módulo falhar (após retries), o erro é logado mas o chain CONTINUA
      // carregando os módulos restantes. Antes já era assim no for-loop sequencial;
      // agora o mesmo comportamento é preservado nas chains paralelas via
      // `loadChain` que nunca rejeita (sempre resuelve com {ok, fail} counts).
      const CORE_CHAIN = ['gdi-worker-bridge.js', 'storage.js', 'gdi-pdf.js', 'gdi-ui.js', 'gdi-player-enhancer.js'];
      const MEGGY_CHAIN = [
        'meggy/meggy-utils.js',
        'meggy/meggy-pdf-engine.js',
        'meggy/meggy-cache.js',
        'meggy/meggy-questions.js',
        'meggy/meggy-flashcards.js',
        'meggy/meggy-summaries.js',
        'meggy/meggy-widget.js'
      ];
      const STUDY_CHAIN = [
        'study/study-theme.js',
        'study/study-scanner.js',
        'study/study-courses.js',
        'study/study-questions.js',
        'study/study-advanced.js',
        'study/study-tabs-legacy.js',
        'study/study-player-guard.js',
        'study/study-insights.js',
        'study/study-plan.js',
        'study/study-panel.js'
      ];

      // loadChain: carrega módulos SEQUENCIALMENTE (preserva ordem de dependência
      // dentro da cadeia). Nunca rejeita — falhas são contadas e logadas, e o
      // chain continua com o próximo módulo (Item 7 fallback).
      async function loadChain(label, mods){
        let ok = 0, fail = 0;
        for (const m of mods) {
          try {
            await loadWithRetry(moduleUrl(m), true);
            ok++;
            console.log('[GDI Loader] ✓', m);
          } catch(e) {
            fail++;
            // ★ FIX Task 20-9 Item 7: NÃO lança — continua com próximo módulo.
            // Antes o catch só logava; o for-loop já não propagava. Agora
            // mantemos o mesmo contrato: módulo que falha após 3 retries é
            // pulado, e os demais continuam carregando.
            console.warn('[GDI Loader] ✗', m, '—', e.message, '(continuando chain)');
          }
        }
        console.log(`[GDI Loader] chain "${label}" done — ${ok} OK, ${fail} falhas`);
        return { ok, fail };
      }

      // 1) Core-chain primeiro (sequencial) — gdi-ui e demais dependem de
      //    worker-bridge + storage + gdi-pdf já estarem em vigor.
      let ok = 0, fail = 0;
      const coreRes = await loadChain('core', CORE_CHAIN);
      ok += coreRes.ok; fail += coreRes.fail;

      // 2) Meggy + Study em PARALELO (cada chain é sequencial internamente,
      //    mas as duas chains rodam simultaneamente via Promise.allSettled).
      const [meggyRes, studyRes] = await Promise.allSettled([
        loadChain('meggy', MEGGY_CHAIN),
        loadChain('study', STUDY_CHAIN)
      ]);
      if (meggyRes.status === 'fulfilled') { ok += meggyRes.value.ok; fail += meggyRes.value.fail; }
      else { fail += MEGGY_CHAIN.length; console.warn('[GDI Loader] meggy chain rejected:', meggyRes.reason); }
      if (studyRes.status === 'fulfilled') { ok += studyRes.value.ok; fail += studyRes.value.fail; }
      else { fail += STUDY_CHAIN.length; console.warn('[GDI Loader] study chain rejected:', studyRes.reason); }

      prefetchWorkers();

      const t1 = performance.now();
      console.log(`[GDI Loader] carga completa em ${Math.round(t1-t0)}ms — ${ok} OK, ${fail} falhas`);

      _bootstrapped = true;  // ★ marca como carregado — qualquer chamada futura retorna imediatamente

      try{ window.dispatchEvent(new CustomEvent('gdi-extras-ready')); }catch(_){}
    })();

    return _bootstrapPromise;
  }

  // ★ FIX Agent 7 Bug 7-9: `bootstrap()` é `async` e retorna `_bootstrapPromise`
  // (uma IIFE async). A IIFE tem try/catch em torno de `loadCoreWithRetry()`
  // (linha 180-189) e do loop de módulos (linha 200-209), MAS chamadas como
  // `prefetchWorkers()` (linha 211) e `window.dispatchEvent(...)` (linha 218)
  // NÃO estão dentro de try/catch — se qualquer uma lançar, a IIFE rejeita,
  // `bootstrap()` rejeita, e como o caller não usa `.catch()`, vira unhandled
  // rejection. O caminho DOMContentLoaded é pior: event listeners ignoram o
  // valor de retorno, então a rejeição é garantidamente não-tratada.
  // Agora both call sites usam `.catch()` para logar e engolir o erro.
  function bootstrapSafe(){
    try {
      const p = bootstrap();
      if (p && typeof p.catch === 'function') {
        p.catch(e => console.error('[GDI Loader] bootstrap failed:', e && e.message || e));
      }
      return p;
    } catch (e) {
      console.error('[GDI Loader] bootstrap threw synchronously:', e && e.message || e);
      return Promise.resolve();
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bootstrapSafe, {once:true});
  }else{
    bootstrapSafe();
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
