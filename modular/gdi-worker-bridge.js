/* ============================================================================
 * gdi-worker-bridge.js  —  Ponte para Web Workers (drop-in, non-breaking)
 * ----------------------------------------------------------------------------
 * Carregue DEPOIS de gdi-core.js (e antes ou junto com gdi-meggy.js /
 * gdi-study.js). Ele SOBRESCREVE as funções pesadas da thread principal
 * com versões que delegam para Web Workers:
 *
 *   1. window.gdiListAllFiles(path, pw, onPage)  → gdi-list-worker.js
 *   2. loadCrossFolderPlaylist(...)              → gdi-list-worker.js (scan)
 *   3. window.gdiIsaPdf.extractPdfText(url, cb)  → meggy-pdf-worker.js
 *
 * Mantém AS MESMAS ASSINATURAS. Nenhum consumidor precisa mudar.
 * Se o worker falhar em carregar, cai automaticamente para a versão original
 * da thread principal (fallback transparente).
 *
 * Também estende o cache de listagem:
 *   - TTL de 45s → 5min
 *   - Não zera em page:change (usa LRU de 50 entradas)
 *
 * ⚠️ ROTA RELATIVA: os workers são servidos pela rota /modular/ do próprio
 * Cloudflare Worker (ver student_gdi/worker.js), não por CDN.
 * ============================================================================ */

(function(){
  'use strict';

  // ★★★ Web Workers servidos pela mesma rota /modular/ do Cloudflare Worker (worker.js)
  // — mesmo proxy que o gdi-extras-loader.js usa. Consistência + cache controlada
  //   por CACHE_VERSION (sem CDN jsdelivr com cache stale).
  const WORKER_BASE = '/modular/';
  const LIST_WORKER_URL  = WORKER_BASE + 'gdi-list-worker.js?v=' + (window.CACHE_VERSION || '106');
  const PDF_WORKER_URL   = WORKER_BASE + 'meggy-pdf-worker.js?v=' + (window.CACHE_VERSION || '106');

  // ───────────────────────── LRU cache de listagem ─────────────────────────
  const LIST_TTL = 5 * 60 * 1000;        // 5 min (antes 45s)
  const LIST_MAX = 50;                   // LRU cap (antes era Map sem cap)
  const _listCache = new Map();

  function cacheGet(key){
    const ent = _listCache.get(key);
    if (!ent) return null;
    if (Date.now() - ent.at > LIST_TTL) { _listCache.delete(key); return null; }
    // move to end (MRU)
    _listCache.delete(key); _listCache.set(key, ent);
    return ent.files;
  }
  function cacheSet(key, files){
    if (_listCache.size >= LIST_MAX) _listCache.delete(_listCache.keys().next().value);
    // ★ v1.0.98 FIX: guard null/non-array (Agent 18) — worker may resolve with null
    // (e.g. {type:'done'} without files field) which would crash files.slice()
    _listCache.set(key, { at: Date.now(), files: Array.isArray(files) ? files.slice() : [] });
  }

  // ★ FIX Task 20-9 Item 1: clear list cache on page:change to prevent stale
  // folder listings when the user navigates between Drive folders. Previously
  // the cache was NOT cleared on navigation (only on auth:change → 'out'),
  // which meant a user moving from /1:/folderA → /1:/folderB could see cached
  // listings from folderA if folderB's listing failed and fell back to cache.
  // The LRU cap (50) + TTL (5min) bounds memory; clearing on navigation keeps
  // data fresh. Listener registered below alongside the PDF cleanup listener.

  // ───────────────────────── Pool de workers ─────────────────────────
  let _listWorker = null;
  let _pdfWorker  = null;
  const _listPending = new Map();   // id -> {resolve, reject, onPage}
  const _pdfPending  = new Map();
  let _listId = 0;
  let _pdfId  = 0;

  function getListWorker(){
    if (_listWorker) return _listWorker;
    // ★ FIX (Task 20): Web Workers não podem ser cross-origin.
    // Buscamos o script do CDN via fetch, criamos um Blob URL (same-origin), e instanciamos o Worker.
    // ★ FIX Task 20-9 Item 2: attach a .catch() so any unexpected rejection resets
    // _listWorker to null (otherwise it stays as a forever-rejected promise and
    // every subsequent call returns the same rejected promise, breaking the worker
    // permanently until reload).
    _listWorker = (async () => {
      try {
        const resp = await fetch(LIST_WORKER_URL);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const text = await resp.text();
        const blob = new Blob([text], {type: 'application/javascript'});
        const blobUrl = URL.createObjectURL(blob);
        const w = new Worker(blobUrl);
        w.onmessage = onListMessage;
        w.onerror = (e) => {
          console.warn('[gdi-worker-bridge] list worker error', e);
          for (const [id, p] of _listPending) { try { p.reject(new Error('worker error')); } catch(_){} }
          _listPending.clear();
          _listWorker = null;
          URL.revokeObjectURL(blobUrl);
        };
        return w;
      } catch(e) {
        console.warn('[gdi-worker-bridge] Não foi possível criar list worker (blob), usando fallback', e.message);
        return null;
      }
    })().catch(e => {
      console.warn('[gdi-worker-bridge] list worker promise rejected, resetting', e);
      _listWorker = null;
      return null;
    });
    return _listWorker;
  }

  function getPdfWorker(){
    if (_pdfWorker) return _pdfWorker;
    // ★ FIX (Task 20): Blob URL technique (same as getListWorker)
    // ★ FIX Task 20-9 Item 2: if the promise rejects for any unexpected reason,
    // reset _pdfWorker to null so the next call retries from scratch (otherwise
    // _pdfWorker stays as a rejected promise forever and the PDF worker is
    // permanently broken until page reload).
    _pdfWorker = (async () => {
      try {
        const resp = await fetch(PDF_WORKER_URL);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const text = await resp.text();
        const blob = new Blob([text], {type: 'application/javascript'});
        const blobUrl = URL.createObjectURL(blob);
        const w = new Worker(blobUrl);
        w.onmessage = onPdfMessage;
        w.onerror = (e) => {
          console.warn('[gdi-worker-bridge] pdf worker error', e);
          for (const [id, p] of _pdfPending) { try { p.reject(new Error('worker error')); } catch(_){} }
          _pdfPending.clear();
          _pdfWorker = null;
          URL.revokeObjectURL(blobUrl);
        };
        return w;
      } catch(e) {
        console.warn('[gdi-worker-bridge] Não foi possível criar pdf worker (blob), usando fallback', e.message);
        return null;
      }
    })().catch(e => {
      console.warn('[gdi-worker-bridge] pdf worker promise rejected, resetting', e);
      _pdfWorker = null;
      return null;
    });
    return _pdfWorker;
  }

  function onListMessage(ev){
    const msg = ev.data;
    const p = _listPending.get(msg.id);
    if (!p) return;
    if (msg.type === 'page') {
      // ★ FIX Agent 11 PERF-9 (main-thread side): o worker agora envia apenas
      // os NOVOS arquivos de cada página (não o array acumulado). Acumulamos
      // aqui em `p.accum` e repassamos o acumulado para `p.onPage`, preservando
      // o contrato original da API (`onPage` recebe a lista completa até agora).
      if (Array.isArray(msg.files)) {
        if (!Array.isArray(p.accum)) p.accum = [];
        for (let i = 0; i < msg.files.length; i++) p.accum.push(msg.files[i]);
      }
      if (p.onPage) try { p.onPage(p.accum ? p.accum.slice() : [], msg.cursor, msg.total); } catch(_){}
    } else if (msg.type === 'scanPage') {
      // scan: o worker ainda envia `collected` acumulado (custo bounded pelo
      // throttle de 200ms — ver comentário no worker). Repassamos direto.
      if (p.onPage) try { p.onPage(msg.files || msg.collected, msg.cursor, msg.total); } catch(_){}
    } else if (msg.type === 'done' || msg.type === 'scanDone') {
      _listPending.delete(msg.id);
      // Para `done` (handleList), o worker envia `files: out` (acumulado completo).
      // Para `scanDone` (handleScan), envia `collected` (acumulado completo).
      // Preferimos `msg.files`/`msg.collected` se presentes; senão usamos `p.accum`.
      const final = msg.files || msg.collected || (p.accum ? p.accum.slice() : []);
      p.resolve(final);
    } else if (msg.type === 'progress') {
      if (p.onProgress) try { p.onProgress(msg); } catch(_){}
    } else if (msg.type === 'error') {
      _listPending.delete(msg.id);
      p.reject(new Error(msg.message));
    }
  }

  function onPdfMessage(ev){
    const msg = ev.data;
    const p = _pdfPending.get(msg.id);
    if (!p) return;
    if (msg.type === 'progress' || msg.type === 'ocr') {
      if (p.onProgress) try { p.onProgress(msg); } catch(_){}
    } else if (msg.type === 'done') {
      _pdfPending.delete(msg.id);
      p.resolve(msg.text);
    } else if (msg.type === 'error') {
      _pdfPending.delete(msg.id);
      p.reject(new Error(msg.message));
    }
  }

  // ───────────────────────── Override gdiListAllFiles ─────────────────────────
  // Guarda a implementação original como fallback (capturada na init do IIFE).
  // ★ FIX Agent 20 Bug 16: This capture can go STALE if another module later
  // redefines `window.gdiListAllFiles` (e.g., a hot-reload or a second bridge
  // instance). To stay resilient, on each fallback call we prefer the sentinel
  // `window.__gdiOrigListAllFiles` (set by other bridges/modules to expose their
  // own original), and only fall back to the captured `_origListAllFiles` if the
  // sentinel is absent. We also SKIP our own patched version via the
  // `_extractPatched`-style marker `_isPatched` on the function object.
  const _origListAllFiles = window.gdiListAllFiles;

  // Helper: returns the "true" original gdiListAllFiles (skipping any patched
  // version), reading it fresh each time so we never call a stale reference.
  function getOrigListAllFiles(){
    const sentinel = window.__gdiOrigListAllFiles;
    if (typeof sentinel === 'function') return sentinel;
    return (typeof _origListAllFiles === 'function' && !_origListAllFiles._isPatched)
      ? _origListAllFiles
      : null;
  }

  window.gdiListAllFiles = function(path, pw, onPage){
    // 1) cache hit?
    const cacheKey = path + '|' + (pw || '');
    const cached = cacheGet(cacheKey);
    if (cached) {
      if (onPage) try { onPage(cached.slice(), undefined, undefined); } catch(_){}
      return Promise.resolve(cached);
    }
    // 2) worker com timeout + fallback direto
    // ★ Task 20: getListWorker() agora retorna uma Promise (Blob URL async)
    const wPromise = getListWorker();
    if (wPromise && typeof wPromise.then === 'function') {
      // É uma Promise — espera o worker ficar pronto, depois posta mensagem
      const id = ++_listId;
      return wPromise.then(w => {
        if (!w) {
          // Worker falhou — fallback pra thread principal (lê o original fresco)
          const origFn = getOrigListAllFiles();
          return origFn ? origFn(path, pw, onPage).then(files => { cacheSet(cacheKey, files); return files; }) : Promise.resolve([]);
        }
        return new Promise((resolve, reject) => {
          // ★ FIX Agent 11 PERF-9: inicializa `accum` vazio para que onListMessage
          // possa acumular os arquivos novos enviados pelo worker a cada `page`.
          _listPending.set(id, { resolve, reject, onPage, accum: [] });
          // ★ FIX (Task 20b): Worker precisa de URL ABSOLUTA — paths relativos (/1:/...)
          // não funcionam dentro do Worker (não há window.location).
          let absPath = path;
          if (path && path.charAt(0) === '/' && !path.startsWith('//')) {
            absPath = self.location.origin + path;
          }
          w.postMessage({ type: 'list', id, path: absPath, pw: pw || '' });
        }).then(files => { cacheSet(cacheKey, files); return files; })
          .catch(err => {
            _listPending.delete(id);
            console.warn('[gdi-worker-bridge] list fallback', err);
            const origFn = getOrigListAllFiles();
            return origFn ? origFn(path, pw, onPage).then(files => { cacheSet(cacheKey, files); return files; }) : [];
          });
      });
    }
    // Fallback: worker não disponível (null ou não-Promise)
    const origFn = getOrigListAllFiles();
    return origFn ? origFn(path, pw, onPage).then(files => { cacheSet(cacheKey, files); return files; }) : Promise.resolve([]);
  };
  // Tag the patched function so getOrigListAllFiles() can skip it if some other
  // module captures `window.gdiListAllFiles` AFTER us (avoid infinite recursion).
  try { window.gdiListAllFiles._isPatched = true; } catch(_){}
  // Expose our captured original under the sentinel so later bridges/modules
  // can find the true pre-patch implementation even if they capture us first.
  if (typeof _origListAllFiles === 'function' && !window.__gdiOrigListAllFiles) {
    window.__gdiOrigListAllFiles = _origListAllFiles;
  }

  // ───────────────────────── Override loadCrossFolderPlaylist ─────────────────────────
  // A função original vive dentro de um IIFE em app.min.js e não é exposta.
  // Mas o buildPlaylist é exposto via Bus('playlist:build') em algumas versões.
  // Aqui expomos uma NOVA função global que os callers podem usar opcionalmente:
  //   window.gdiScanCrossFolder(parentPath, subFolders, pwGetter, onProgress)
  // Para NÃO quebrar nada, o buildPlaylist original continua funcionando.
  // Recomenda-se trocar o chamador interno do app.min.js para usar esta versão
  // (ver app.min.js.patch.md).

  window.gdiScanCrossFolder = async function(parentPath, subFolders, pwGetter, onProgress){
    // ★ FIX 7 (Task 21): getListWorker() now returns a Promise (since Task 20's Blob URL
    // refactor — the worker is created asynchronously via fetch+Blob+new Worker). The old
    // code called `w.postMessage(...)` synchronously on the Promise, which threw TypeError
    // ("postMessage is not a function"). Now we await the Promise first. If the worker
    // failed to instantiate, fall back to empty result (no original to call).
    const w = await getListWorker();
    if (!w) return [];
    const id = ++_listId;
    return new Promise((resolve, reject) => {
      _listPending.set(id, {
        resolve,
        reject,
        onPage: (collected, cursor, total) => {
          if (onProgress) try { onProgress(collected, cursor, total); } catch(_){}
        }
      });
      // Nota: pwGetter é uma função — não passa pelo postMessage.
      // O worker resolve pw internamente só se pw for string. Se pwGetter for função,
      // chamamos aqui para cada subpasta e enviamos um mapa pré-resolvido.
      let pwResolved = pwGetter;
      if (typeof pwGetter === 'function') {
        // Pré-resolve senhas (rápido, vem de localStorage/gdiGetPw)
        pwResolved = {};
        for (const f of subFolders) {
          const fp = parentPath + encodeURIComponent(f.name) + '/';
          try { pwResolved[fp] = pwGetter(fp); } catch(_){ pwResolved[fp] = ''; }
        }
      }
      // ★ FIX (Task 20b): URL absoluta pro Worker
      let absParent = parentPath;
      if (parentPath && parentPath.charAt(0) === '/' && !parentPath.startsWith('//')) {
        absParent = self.location.origin + parentPath;
      }
      w.postMessage({ type: 'scan', id, parentPath: absParent, subFolders, pw: pwResolved, initialItems: 60 });
    });
  };

  // ───────────────────────── Override extractPdfText (Meggy) ─────────────────────────
  // Se o gdi-meggy.js já tiver carregado e exposto gdiIsaPdf.extractPdfText,
  // trocamos por uma versão que delega ao worker. Senão, guardamos para
  // aplicar quando gdiIsaPdf aparecer.

  // Guardamos uma referência de captura, mas em runtime preferimos ler
  // window.gdiIsaPdf._origExtractPdfText (definido por applyPdfPatch) — isso garante
  // que tenhamos o original mesmo se o bridge tiver carregado ANTES do gdi-meggy.js.
  const _origExtractPdfText = (window.gdiIsaPdf && window.gdiIsaPdf.extractPdfText) || null;

  function patchedExtractPdfText(url, onProgress){
    const wPromise = getPdfWorker();
    if (wPromise && typeof wPromise.then === 'function') {
      const id = ++_pdfId;
      return wPromise.then(w => {
        if (!w) {
          const orig = (window.gdiIsaPdf && window.gdiIsaPdf._origExtractPdfText) || _origExtractPdfText || null;
          return orig ? orig(url, onProgress) : Promise.resolve('');
        }
        return new Promise((resolve, reject) => {
          _pdfPending.set(id, { resolve, reject, onProgress });
          w.postMessage({ type: 'extract', id, url, maxPages: 60, maxChars: 25000, tryOcr: true });
        }).catch(err => {
          console.warn('[gdi-worker-bridge] pdf extract fallback', err);
          _pdfPending.delete(id);
          const orig = (window.gdiIsaPdf && window.gdiIsaPdf._origExtractPdfText) || _origExtractPdfText || null;
          return orig ? orig(url, onProgress) : '';
        });
      });
    }
    const orig = (window.gdiIsaPdf && window.gdiIsaPdf._origExtractPdfText) || _origExtractPdfText || null;
    return orig ? orig(url, onProgress) : Promise.resolve('');
  }

  function applyPdfPatch(){
    if (window.gdiIsaPdf && typeof window.gdiIsaPdf.extractPdfText === 'function') {
      // só patcheia se ainda não patcheado
      if (!window.gdiIsaPdf._extractPatched) {
        // guarda original (caso o bridge carregue depois do meggy)
        const orig = window.gdiIsaPdf.extractPdfText;
        window.gdiIsaPdf.extractPdfText = function(url, cb){
          return patchedExtractPdfText(url, cb).then(text => {
            // mantém compat com callback-style se o caller usar cb
            if (typeof cb === 'function') cb(text);
            return text;
          });
        };
        window.gdiIsaPdf._extractPatched = true;
        window.gdiIsaPdf._origExtractPdfText = orig;
      }
    }
  }
  applyPdfPatch();

  // Se gdi-meggy.js carregar DEPOIS do bridge, re-aplica o patch.
  // ★ FIX BUG 12 (v80): janela estendida de 5s (10 tries) para 30s (60 tries) —
  // em CDNs lentas gdi-meggy.js pode demorar >5s para chegar; sem isso o patch
  // nunca era aplicado e o extractPdfText continuava na thread principal.
  // ★ FIX Agent 20 Bug 17: o timer roda o intervalo completo de 30s mesmo quando
  // o patch JÁ foi aplicado com sucesso — chamadas `applyPdfPatch()` subsequentes
  // são no-ops caros (typeof checks). Agora saímos imediatamente assim que
  // `window.gdiIsaPdf._extractPatched === true`. (O guarda já existia, mas o
  // `++_applyTries > 60` vinha ANTES da checagem de `_extractPatched` na
  // conjunção, então em alguns caminhos o patch aplicado no tick atual não era
  // detectado — reordenado para priorizar a condição de sucesso.)
  let _applyTries = 0;
  const _applyTimer = setInterval(() => {
    applyPdfPatch();
    _applyTries++;
    if ((window.gdiIsaPdf && window.gdiIsaPdf._extractPatched) || _applyTries > 60) {
      clearInterval(_applyTimer);
    }
  }, 500);

  // ───────────────────────── Hook em page:change para limpar PDF ─────────────────────────
  // ★ FIX 8 (Task 21): was `if (window.Bus && ...)` — but Bus is declared with `const` in
  // app.min.js, so `window.Bus` is undefined (const declarations don't create window
  // properties). The check always failed, so the page:change listener was never registered
  // and PDFs leaked across page navigations. Use `typeof Bus !== 'undefined'` instead
  // (matches the pattern in gdi-extras-loader.js line 121 and gdi-study.js line 4614).
  if (typeof Bus !== 'undefined' && typeof Bus.onGlobal === 'function') {
    Bus.onGlobal('page:change', () => {
      // destroi o PDF atual ao navegar (evita leak de PDFDocumentProxy)
      if (typeof window.gdiPdfCleanup === 'function') {
        try { window.gdiPdfCleanup(); } catch(_){}
      }
      // ★ FIX Task 20-9 Item 1: clear list cache on page navigation so the
      // user never sees stale Drive folder listings from a previously-visited
      // path (LRU + TTL alone don't guarantee freshness across navigations).
      try { _listCache.clear(); } catch(_){}
    });

    // ★ FIX Agent 20 Bug 6 + Bug 7: Web Workers e caches NÃO são limpos em logout.
    // Antes: `_listWorker`/`_pdfWorker` (Web Workers) e `_listCache` (LRU 50)
    // persistiam entre login de usuários diferentes no mesmo tab — user B podia
    // ver listagens de pastas do Drive do user A servidas do cache ou do worker
    // ainda em pé. Agora, em `auth:change → 'out'`, terminamos os workers e
    // limpamos o cache de listagem.
    Bus.onGlobal('auth:change', (auth) => {
      if (auth !== 'out') return;
      try {
        // Termina os workers (lista + PDF) sem bloquear o listener.
        if (window.gdiWorkerBridge && typeof window.gdiWorkerBridge.terminateAll === 'function') {
          Promise.resolve(window.gdiWorkerBridge.terminateAll()).catch(()=>{});
        }
      } catch(_){}
      try {
        // Limpa o cache in-memory de listagem (LRU 50 / TTL 5min).
        if (window.gdiWorkerBridge && typeof window.gdiWorkerBridge.listCacheClear === 'function') {
          window.gdiWorkerBridge.listCacheClear();
        }
      } catch(_){}
    });
  } else {
    // ★ Fallback: se Bus não estiver disponível, expõe cleanup() para chamada
    // manual pelo fluxo de logout (mesmo efeito do listener acima).
    window.gdiWorkerBridgeCleanup = function(){
      try {
        if (window.gdiWorkerBridge && typeof window.gdiWorkerBridge.terminateAll === 'function') {
          Promise.resolve(window.gdiWorkerBridge.terminateAll()).catch(()=>{});
        }
        if (window.gdiWorkerBridge && typeof window.gdiWorkerBridge.listCacheClear === 'function') {
          window.gdiWorkerBridge.listCacheClear();
        }
      } catch(_){}
    };
  }

  // ───────────────────────── API pública de diagnóstico ─────────────────────────
  window.gdiWorkerBridge = {
    version: '1.0',
    listCacheSize: () => _listCache.size,
    listCacheClear: () => _listCache.clear(),
    listCacheInvalidate: (path) => {
      // ★ FIX Task 20-9 Item 4: previously only deleted the empty-password key
      // (`path + '|'`), so cached listings for the same path with a non-empty
      // password survived invalidation and could serve stale data after a
      // folder was renamed/reorganized. Now iterate ALL keys with the given
      // path prefix (`path + '|' + <any-password>`).
      const prefix = String(path || '') + '|';
      for (const k of Array.from(_listCache.keys())) {
        if (k.indexOf(prefix) === 0) _listCache.delete(k);
      }
    },
    pendingListJobs: () => _listPending.size,
    pendingPdfJobs:  () => _pdfPending.size,
    terminateAll: async () => {
      // ★ FIX 9 (Task 21): _listWorker and _pdfWorker are now Promises (since Task 20's
      // Blob URL refactor). The old code called `.terminate()` directly on the Promise,
      // which threw TypeError and silently leaked the worker (try/catch swallowed it).
      // Now we await the Promise first; if the worker exists, terminate it properly.
      try {
        const listW = _listWorker ? await _listWorker : null;
        if (listW) { try { listW.terminate(); } catch(_){} }
      } catch(_){}
      _listWorker = null;
      try {
        const pdfW = _pdfWorker ? await _pdfWorker : null;
        if (pdfW) { try { pdfW.terminate(); } catch(_){} }
      } catch(_){}
      _pdfWorker = null;
    }
  };

  console.log('[gdi-worker-bridge] carregado. Worker pool pronto sob demanda.');
})();
