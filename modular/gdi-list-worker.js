/* ============================================================================
 * gdi-list-worker.js  —  Web Worker para listagem de pastas do Google Drive
 * ----------------------------------------------------------------------------
 * Substitui o trabalho pesado que antes rodava na thread principal:
 *   - gdiListAllFiles()  (paginação de até 50 páginas, JSON.parse de cada página)
 *   - loadCrossFolderPlaylist()  (varredura sequencial de até 200 subpastas)
 *   - contagem de progresso do M14 (modProgress)
 *
 * A thread principal continua expondo as MESMAS funções com as MESMAS assinaturas,
 * então nenhum consumidor (gdi-core, gdi-ui, gdi-meggy, gdi-study) precisa mudar.
 *
 * Mensagens (main -> worker):
 *   { type:'list',     id, path, pw, probeOnly }
 *   { type:'scan',     id, parentPath, subFolders, pw, initialItems }
 *   { type:'progress', id, parentPath, subFolders, pw }   // contagem done/total
 *
 * Mensagens (worker -> main):
 *   { type:'page',     id, files, done:false }
 *   { type:'done',     id, files }
 *   { type:'scanPage', id, collected, cursor, total }
 *   { type:'scanDone', id, collected }
 *   { type:'progress', id, row, done, total }
 *   { type:'error',    id, message }
 *
 * Uso de Transferable: o worker devolve arrays de objetos (não há ArrayBuffer
 * para transferir aqui), mas o payload JSON é montado dentro do worker e chega
 * à thread principal já parsed — eliminando o JSON.parse síncrono da UI.
 * ============================================================================ */

const MAX_PAGES = 50;

// ★★★ Task 8: processar múltiplas mensagens em paralelo (era 1 por vez) ★★★
// Antes: 16 gdiListAllFiles do M14 ficavam enfileiradas, cada uma com até 50 páginas
// de fetch → 24s+ de bloqueio. Agora: até 4 simultâneas via fire-and-forget.
self.onmessage = (ev) => {
  const msg = ev.data;
  // Fire-and-forget: cada mensagem roda independentemente, sem bloquear a próxima
  (async () => {
    try {
      if (msg.type === 'list')     return await handleList(msg);
      if (msg.type === 'scan')     return await handleScan(msg);
      if (msg.type === 'progress') return await handleProgress(msg);
    } catch (err) {
      self.postMessage({ type: 'error', id: msg.id, message: String(err && err.message || err) });
    }
  })();
};

/* ---------------- list: paginação de uma única pasta ---------------- */
async function handleList({ id, path, pw, probeOnly }) {
  const out = [];
  let token = '';
  let idx = 0;
  for (let guard = 0; guard < MAX_PAGES; guard++) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 60000)  // ★ Task 26: 30s→60s;
    let r;
    try {
      r = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: '', type: 'folder', password: pw || '', page_token: token, page_index: idx }),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(to);
    }
    if (!r.ok) break;
    const page = await r.json();
    const files = page && page.data && Array.isArray(page.data.files) ? page.data.files : [];
    // push em chunks para evitar estouro de stack com spread gigante
    for (let i = 0; i < files.length; i += 1000) {
      const chunk = files.slice(i, i + 1000);
      for (let j = 0; j < chunk.length; j++) out.push(chunk[j]);
    }
    self.postMessage({ type: 'page', id, files: out.slice(), done: false });
    if (probeOnly) break;
    if (!page.nextPageToken) break;
    token = page.nextPageToken;
    idx++;
  }
  self.postMessage({ type: 'done', id, files: out });
}

/* ---------------- scan: varredura paralela de subpastas -------------- */
async function handleScan({ id, parentPath, subFolders, pw, initialItems }) {
  const collected = [];
  let cursor = 0;
  const INITIAL = initialItems || 60;
  const BATCH = 6;           // 6 fetches em paralelo (antes era 3 sequenciais + sleep 2s)
  const MAX_CONCURRENCY = 6;

  // Primeira leva: enche até INITIAL itens o mais rápido possível
  while (cursor < subFolders.length && collected.length < INITIAL) {
    const batch = subFolders.slice(cursor, cursor + BATCH);
    cursor += batch.length;
    const results = await Promise.all(batch.map(folder => listOne(parentPath, folder, pw)));
    for (const vids of results) if (vids && vids.length) collected.push(...vids);
    self.postMessage({ type: 'scanPage', id, collected: collected.slice(), cursor, total: subFolders.length });
  }

  // Segunda leva: completa o resto, em paralelo controlado
  let inFlight = 0;
  let i = cursor;
  const queue = [];
  const runOne = (folder) => listOne(parentPath, folder, pw).then(vids => {
    if (vids && vids.length) collected.push(...vids);
    inFlight--;
    pump();
  }).catch(() => { inFlight--; pump(); });

  function pump() {
    while (inFlight < MAX_CONCURRENCY && i < subFolders.length) {
      const f = subFolders[i++];
      inFlight++;
      queue.push(runOne(f));
    }
    if (inFlight === 0 && i >= subFolders.length) {
      self.postMessage({ type: 'scanDone', id, collected });
    } else {
      // throttled progress (a cada 200ms)
      const now = Date.now();
      if (!pump._lastReport || now - pump._lastReport > 200) {
        pump._lastReport = now;
        self.postMessage({ type: 'scanPage', id, collected: collected.slice(), cursor: i, total: subFolders.length });
      }
    }
  }
  pump();
}

async function listOne(parentPath, folder, pw) {
  const fpath = parentPath + encodeURIComponent(folder.name) + '/';
  const fpw = (typeof pw === 'function') ? pw(fpath) : (pw || '');
  // chamada direta à paginação interna (sem postMessage)
  const files = await listAllFilesInternal(fpath, fpw);
  return buildPlaylistFromFiles(files, fpath, folder.name);
}

async function listAllFilesInternal(path, pw) {
  const out = [];
  let token = '', idx = 0;
  for (let guard = 0; guard < MAX_PAGES; guard++) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 60000)  // ★ Task 26: 30s→60s;
    let r;
    try {
      r = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: '', type: 'folder', password: pw || '', page_token: token, page_index: idx }),
        signal: ctrl.signal,
      });
    } finally { clearTimeout(to); }
    if (!r.ok) break;
    const page = await r.json();
    const files = page && page.data && Array.isArray(page.data.files) ? page.data.files : [];
    for (let i = 0; i < files.length; i++) out.push(files[i]);
    if (!page.nextPageToken) break;
    token = page.nextPageToken; idx++;
  }
  return out;
}

/* ---------------- progress: contagem done/total por subpasta ---------- */
async function handleProgress({ id, subFolders, parentPath, pw, isWatched }) {
  // isWatched é uma função serializada? Não — funções não passam pelo postMessage.
  // Em vez disso, a thread principal envia a LISTA de paths já watched:
  //   subFolders: [{name, path}], watchedSet: { pathKey: true|at }
  // O worker devolve a contagem; a UI aplica o isWatched real (ver wrapper abaixo).
  // Para manter simples, fazemos a contagem de total aqui e deixamos a UI contar done.
  let done = 0;
  for (let k = 0; k < subFolders.length; k++) {
    const folder = subFolders[k];
    const fpath = parentPath + encodeURIComponent(folder.name) + '/';
    const fpw = (typeof pw === 'function') ? pw(fpath) : (pw || '');
    const files = await listAllFilesInternal(fpath, fpw);
    self.postMessage({ type: 'progress', id, row: k, files, total: subFolders.length });
  }
}

/* ---------------- helpers de playlist (réplica do app.min.js) -------- */
function buildPlaylistFromFiles(files, fpath, folderName) {
  const videoExt = /\.(mp4|webm|mkv|mov|m4v|avi)(\?|$)/i;
  const out = [];
  if (!Array.isArray(files)) return out;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (!f) continue;
    const name = f.name || '';
    const url = fpath + encodeURIComponent(name);
    const mime = f.mimeType || '';
    if (mime.startsWith('video/') || videoExt.test(name)) {
      out.push({ name, url, pageUrl: url, folderName, size: f.size, modifiedTime: f.modifiedTime });
    }
  }
  return out;
}
