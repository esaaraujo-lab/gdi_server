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
// ★ FIX Task 20-9 Item 12: MAX_DEPTH é um safety cap contra listas de subpastas
// gigantes ( Drive folder com 500+ subpastas, ou bug do caller que envia array
// não-truncado). handleScan não recursa hoje (só varre 1 nível de subpastas),
// mas se uma varredura recursiva for adicionada no futuro, este limite também
// protege contra recursão profunda. Aplicado como cap no número de subFolders
// processados (MAX_DEPTH * 20 = 300 pastas) — acima disso, trunca + loga warning.
const MAX_DEPTH = 15;
const MAX_SUBFOLDERS = MAX_DEPTH * 20;  // 300 — cap duro em handleScan

// ★ FIX Task 20-9 Item 13: Drive API pode retornar 429 (rate limit) sob carga.
// Antes, qualquer `!r.ok` (incluindo 429) fazia `break` imediato, truncando
// silenciosamente a listagem. Agora, em 429/503, esperamos 1s e tentamos de
// novo (até RATE_LIMIT_MAX_RETRIES vezes). Outros erros (401/403/404/500)
// continuam com break imediato.
const RATE_LIMIT_MAX_RETRIES = 3;
const RATE_LIMIT_DELAY_MS = 1000;

async function fetchFolderPage(path, body, timeoutMs){
  let lastErr = null;
  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs || 30000);
    let r;
    try {
      r = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch(e) {
      lastErr = e;
      clearTimeout(to);
      // Network/abort error — retry once for transient blips
      if (attempt < RATE_LIMIT_MAX_RETRIES) {
        await new Promise(rr => setTimeout(rr, RATE_LIMIT_DELAY_MS));
        continue;
      }
      throw e;
    }
    clearTimeout(to);
    // ★ FIX Task 20-9 Item 13: 429 ou 503 → rate-limited / temporarily unavailable.
    // Espera 1s e tenta de novo (até RATE_LIMIT_MAX_RETRIES).
    if (r.status === 429 || r.status === 503) {
      if (attempt < RATE_LIMIT_MAX_RETRIES) {
        await new Promise(rr => setTimeout(rr, RATE_LIMIT_DELAY_MS));
        continue;
      }
      // retries exhausted — retorna a response para o caller tratar (break)
    }
    return r;
  }
  if (lastErr) throw lastErr;
  return null;  // unreachable
}

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
// ★ FIX Task 20-9 Item 11 (VERIFY): o `done` message envia `files: out` (array
// acumulado COMPLETO), enquanto cada `page` tick envia apenas `files.slice()`
// (os NOVOS arquivos daquela página). NÃO há duplicação de page ticks — o
// bridge acumula os `page` messages em `p.accum` e no `done` prefere `msg.files`
// (que é o mesmo array acumulado no worker). Comportamento correto, mantido.
async function handleList({ id, path, pw, probeOnly }) {
  const out = [];
  let token = '';
  let idx = 0;
  for (let guard = 0; guard < MAX_PAGES; guard++) {
    // ★ FIX Task 20-9 Item 13: usa fetchFolderPage (retry em 429/503).
    const r = await fetchFolderPage(path, {
      id: '', type: 'folder', password: pw || '', page_token: token, page_index: idx
    }, 30000);
    if (!r || !r.ok) break;
    const page = await r.json();
    const files = page && page.data && Array.isArray(page.data.files) ? page.data.files : [];
    // push em chunks para evitar estouro de stack com spread gigante
    for (let i = 0; i < files.length; i += 1000) {
      const chunk = files.slice(i, i + 1000);
      for (let j = 0; j < chunk.length; j++) out.push(chunk[j]);
    }
    // ★ FIX Agent 11 PERF-9: ANTES enviávamos `out.slice()` (array acumulado
    // COMPLETO) em cada tick de página — para 50 páginas × N arquivos/page,
    // isso é O(N²) de structured-clone + GC. Agora enviamos apenas os NOVOS
    // arquivos desta página (`files.slice()`). A thread principal (bridge)
    // acumula em `_listPending[id].accum` e repassa o acumulado para `onPage`,
    // preservando o contrato original da API.
    self.postMessage({ type: 'page', id, files: files.slice(), done: false });
    if (probeOnly) break;
    if (!page.nextPageToken) break;
    token = page.nextPageToken;
    idx++;
  }
  self.postMessage({ type: 'done', id, files: out });
}

/* ---------------- scan: varredura paralela de subpastas -------------- */
async function handleScan({ id, parentPath, subFolders, pw, initialItems }) {
  // ★ FIX Agent 19 EDGE-8: `subFolders` pode vir como null/undefined se a
  // main-thread esquecer de enviar (bug futuro em gdi-worker-bridge.js:246
  // ou refactor). Guard previne TypeError opaco. Mesmo guard aplicado em
  // todos os sites de `subFolders.length` / `subFolders.slice()` abaixo.
  if (!Array.isArray(subFolders)) subFolders = [];
  // ★ FIX Task 20-9 Item 12: safety cap contra listas de subpastas gigantes
  // (Drive folder com 500+ subpastas, ou bug do caller). Acima de MAX_SUBFOLDERS
  // (300 = MAX_DEPTH * 20), trunca e loga warning — sem isso, o worker podia
  // ficar varrendo milhares de pastas em sequência (cada uma com paginação de
  // até 50 páginas), travando o worker por minutos.
  if (subFolders.length > MAX_SUBFOLDERS) {
    console.warn('[gdi-list-worker] subFolders truncated from', subFolders.length, 'to', MAX_SUBFOLDERS);
    subFolders = subFolders.slice(0, MAX_SUBFOLDERS);
  }
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
    // ★ PERF-9 (parcial): `collected.slice()` em cada tick da primeira leva é
    // O(N) por tick × nº de ticks — custo bounded porque a primeira leva para
    // ao atingir INITIAL (60) itens. Não mudamos aqui para preservar o contrato
    // do `onProgress(collected, cursor, total)` do `gdiScanCrossFolder`.
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
      // ★ PERF-9 (parcial): `collected.slice()` aqui é O(N) por tick, mas o
      // throttle de 200ms limita a frequência. Custo aceitável dado que o
      // caller tipicamente ignora `collected` no `onProgress` (só usa cursor/total).
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
    // ★ FIX Task 20-9 Item 13: usa fetchFolderPage (retry em 429/503).
    const r = await fetchFolderPage(path, {
      id: '', type: 'folder', password: pw || '', page_token: token, page_index: idx
    }, 30000);
    if (!r || !r.ok) break;
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
  // ★ FIX Agent 19 EDGE-8: mesmo guard de `handleScan` — `subFolders` pode
  // vir null/undefined se a main-thread omitir o campo.
  if (!Array.isArray(subFolders)) subFolders = [];
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
