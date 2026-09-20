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

  const WORKER_BASE = '/modular/';  // servido pelo Cloudflare Worker
  const LIST_WORKER_URL  = WORKER_BASE + 'gdi-list-worker.js';
  const PDF_WORKER_URL   = WORKER_BASE + 'meggy-pdf-worker.js';

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
    _listCache.set(key, { at: Date.now(), files: files.slice() });
  }

  // NÃO limpar em page:change — só invalidar quando o usuário pedir.
  // (Antes: Bus.onGlobal('page:change', () => _listCache.clear())  ← removido)

  // ───────────────────────── Pool de workers ─────────────────────────
  let _listWorker = null;
  let _pdfWorker  = null;
  const _listPending = new Map();   // id -> {resolve, reject, onPage}
  const _pdfPending  = new Map();
  let _listId = 0;
  let _pdfId  = 0;

  function getListWorker(){
    if (_listWorker) return _listWorker;
    try {
      _listWorker = new Worker(LIST_WORKER_URL);
      _listWorker.onmessage = onListMessage;
      _listWorker.onerror = (e) => {
        console.warn('[gdi-worker-bridge] list worker error', e);
        // rejeita todos os pendentes
        for (const [id, p] of _listPending) { try { p.reject(new Error('worker error')); } catch(_){} }
        _listPending.clear();
        _listWorker = null;
      };
    } catch(e) {
      console.warn('[gdi-worker-bridge] Não foi possível criar list worker, usando fallback', e);
      _listWorker = null;
    }
    return _listWorker;
  }

  function getPdfWorker(){
    if (_pdfWorker) return _pdfWorker;
    try {
      _pdfWorker = new Worker(PDF_WORKER_URL);
      _pdfWorker.onmessage = onPdfMessage;
      _pdfWorker.onerror = (e) => {
        console.warn('[gdi-worker-bridge] pdf worker error', e);
        for (const [id, p] of _pdfPending) { try { p.reject(new Error('worker error')); } catch(_){} }
        _pdfPending.clear();
        _pdfWorker = null;
      };
    } catch(e) {
      console.warn('[gdi-worker-bridge] Não foi possível criar pdf worker, usando fallback', e);
      _pdfWorker = null;
    }
    return _pdfWorker;
  }

  function onListMessage(ev){
    const msg = ev.data;
    const p = _listPending.get(msg.id);
    if (!p) return;
    if (msg.type === 'page' || msg.type === 'scanPage') {
      if (p.onPage) try { p.onPage(msg.files || msg.collected, msg.cursor, msg.total); } catch(_){}
    } else if (msg.type === 'done' || msg.type === 'scanDone') {
      _listPending.delete(msg.id);
      p.resolve(msg.files || msg.collected);
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
  // Guarda a implementação original como fallback.
  const _origListAllFiles = window.gdiListAllFiles;

  window.gdiListAllFiles = function(path, pw, onPage){
    // 1) cache hit?
    const cacheKey = path + '|' + (pw || '');
    const cached = cacheGet(cacheKey);
    if (cached) {
      if (onPage) try { onPage(cached.slice(), undefined, undefined); } catch(_){}
      return Promise.resolve(cached);
    }
    // 2) worker?
    const w = getListWorker();
    if (w) {
      const id = ++_listId;
      return new Promise((resolve, reject) => {
        _listPending.set(id, { resolve, reject, onPage });
        w.postMessage({ type: 'list', id, path, pw: pw || '' });
      }).then(files => { cacheSet(cacheKey, files); return files; })
        .catch(err => {
          // fallback para a versão original
          console.warn('[gdi-worker-bridge] list fallback', err);
          return _origListAllFiles ? _origListAllFiles(path, pw, onPage) : [];
        });
    }
    // 3) fallback original
    return _origListAllFiles ? _origListAllFiles(path, pw, onPage).then(files => { cacheSet(cacheKey, files); return files; }) : Promise.resolve([]);
  };

  // ───────────────────────── Override loadCrossFolderPlaylist ─────────────────────────
  // A função original vive dentro de um IIFE em app.min.js e não é exposta.
  // Mas o buildPlaylist é exposto via Bus('playlist:build') em algumas versões.
  // Aqui expomos uma NOVA função global que os callers podem usar opcionalmente:
  //   window.gdiScanCrossFolder(parentPath, subFolders, pwGetter, onProgress)
  // Para NÃO quebrar nada, o buildPlaylist original continua funcionando.
  // Recomenda-se trocar o chamador interno do app.min.js para usar esta versão
  // (ver app.min.js.patch.md).

  window.gdiScanCrossFolder = function(parentPath, subFolders, pwGetter, onProgress){
    const w = getListWorker();
    if (!w) return Promise.resolve([]);
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
      w.postMessage({ type: 'scan', id, parentPath, subFolders, pw: pwResolved, initialItems: 60 });
    });
  };

  // ───────────────────────── Override extractPdfText (Meggy) ─────────────────────────
  // Se o gdi-meggy.js já tiver carregado e exposto gdiIsaPdf.extractPdfText,
  // trocamos por uma versão que delega ao worker. Senão, guardamos para
  // aplicar quando gdiIsaPdf aparecer.

  const _origExtractPdfText = (window.gdiIsaPdf && window.gdiIsaPdf.extractPdfText) || null;

  function patchedExtractPdfText(url, onProgress){
    const w = getPdfWorker();
    if (w) {
      const id = ++_pdfId;
      return new Promise((resolve, reject) => {
        _pdfPending.set(id, { resolve, reject, onProgress });
        w.postMessage({ type: 'extract', id, url, maxPages: 60, maxChars: 25000, tryOcr: true });
      }).catch(err => {
        console.warn('[gdi-worker-bridge] pdf extract fallback', err);
        return _origExtractPdfText ? _origExtractPdfText(url, onProgress) : '';
      });
    }
    return _origExtractPdfText ? _origExtractPdfText(url, onProgress) : Promise.resolve('');
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
  let _applyTries = 0;
  const _applyTimer = setInterval(() => {
    applyPdfPatch();
    if (++_applyTries > 10 || (window.gdiIsaPdf && window.gdiIsaPdf._extractPatched)) {
      clearInterval(_applyTimer);
    }
  }, 500);

  // ───────────────────────── Hook em page:change para limpar PDF ─────────────────────────
  if (window.Bus && typeof window.Bus.onGlobal === 'function') {
    window.Bus.onGlobal('page:change', () => {
      // destroi o PDF atual ao navegar (evita leak de PDFDocumentProxy)
      if (typeof window.gdiPdfCleanup === 'function') {
        try { window.gdiPdfCleanup(); } catch(_){}
      }
    });
  }

  // ───────────────────────── API pública de diagnóstico ─────────────────────────
  window.gdiWorkerBridge = {
    version: '1.0',
    listCacheSize: () => _listCache.size,
    listCacheClear: () => _listCache.clear(),
    listCacheInvalidate: (path) => _listCache.delete(path + '|' + ''),
    pendingListJobs: () => _listPending.size,
    pendingPdfJobs:  () => _pdfPending.size,
    terminateAll: () => {
      if (_listWorker) { try { _listWorker.terminate(); } catch(_){} _listWorker = null; }
      if (_pdfWorker)  { try { _pdfWorker.terminate(); } catch(_){} _pdfWorker = null; }
    }
  };

  console.log('[gdi-worker-bridge] carregado. Worker pool pronto sob demanda.');
})();
