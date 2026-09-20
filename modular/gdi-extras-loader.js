// ═══════════════════════════════════════════════════════════════
// gdi-extras-loader.js — Carregador dos módulos modularizados (REFACTORED)
//
// Substitui o gdi-extras.js monolítico por arquivos menores carregados em
// paralelo. Mantém 100% de compatibilidade.
//
// ⚠️ CORREÇÃO CRÍTICA: o cache-buster era `Date.now()`, o que INVALIDAVA
// o cache HTTP/CDN para ~5MB de JS em CADA page-load. Trocado por versão
// fixa — bump só quando publicar código novo.
//
// ⚠️ ROTA RELATIVA: os módulos são servidos pela rota /modular/ do
// próprio Cloudflare Worker (ver student_gdi/worker.js), não por CDN.
// ═══════════════════════════════════════════════════════════════

(function(){
  'use strict';

  const BASE_URL = '/modular/';  // servido pelo Cloudflare Worker

  // ★ Cache-buster fixo. Bump este número SÓ ao publicar nova versão.
  // Antes era Date.now() — isso causava re-download de ~5MB em toda navegação.
  const CACHE_VERSION = '4';

  const MODULES = [
    'gdi-core.js',
    'gdi-worker-bridge.js',   // NEW: bridge para Web Workers (depois do core, antes dos demais)
    'gdi-pdf.js',
    'gdi-ui.js',
    'gdi-meggy.js',
    'gdi-study.js'
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
        link.href = moduleUrl(w);   // = '/modular/' + w + '?v=4'
        link.as = 'script';
        document.head.appendChild(link);
      } catch(_) {}
    });
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

      try{
        await loadScript(moduleUrl('gdi-core.js'), false);
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
      const others = MODULES.slice(1);
      const results = await Promise.allSettled(
        others.map(m => loadScript(moduleUrl(m), true))
      );

      let ok = 0, fail = 0;
      results.forEach((r, i) => {
        const name = others[i];
        if(r.status === 'fulfilled'){ ok++; console.log('[GDI Loader] ✓', name); }
        else{ fail++; console.warn('[GDI Loader] ✗', name, '—', r.reason.message); }
      });

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
