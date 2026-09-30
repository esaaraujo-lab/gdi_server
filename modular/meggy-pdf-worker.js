/* ============================================================================
 * meggy-pdf-worker.js  —  Web Worker para extração de texto de PDFs (Meggy)
 * ----------------------------------------------------------------------------
 * Substitui o trabalho pesado do gdi-meggy.js:
 *   - extractPdfText()        (loop de até 60 páginas, concatenação de texto)
 *   - ocrPdfPage()            (render em canvas na thread principal)
 *
 * Usa OffscreenCanvas (disponível em Chrome/Edge/Firefox/Safari 16.4+) para
 * renderizar páginas para OCR SEM bloquear a UI. Em navegadores sem
 * OffscreenCanvas, cai para o caminho só-texto (getTextContent) — que é o que
 * cobre 95% dos PDFs de prova.
 *
 * Mensagens (main -> worker):
 *   { type:'extract', id, url, maxPages, maxChars, tryOcr }
 *   { type:'extractBuf', id, buf /* ArrayBuffer transferido *\/, maxPages, maxChars, tryOcr }
 *
 * Mensagens (worker -> main):
 *   { type:'progress', id, page, total }
 *   { type:'ocr',      id, page, total }
 *   { type:'done',     id, text, pages, usedOcr }
 *   { type:'error',    id, message }
 *
 * importScripts carrega pdf.js uma única vez dentro do worker. Tesseract.js
 * só é carregado se tryOcr=true e a página não tiver camada de texto.
 * ============================================================================ */

let pdfjsReady = null;
let tesseractReady = null;

// ★ FIX Task 20-9 Item 14: hard cap no número de páginas extraídas, para evitar
// OOM em PDFs gigantes (1000+ páginas — apostilas, livros, anais de congresso).
// Antes, `maxPages` vinha do caller (60) e era usado direto; um caller futuro
// podia pedir 500 e travar o worker. Agora, MAX_PAGES=50 é o teto absoluto —
// `Math.min(doc.numPages, maxPages || MAX_PAGES, MAX_PAGES)` garante que mesmo
// se o caller pedir 60 (como o bridge faz hoje), extraímos no máximo 50.
const MAX_PAGES = 50;
// ★ FIX Task 20-9 Item 15: Tesseract.js pode demorar >60s em páginas densas
// (scans de livros, imagens de alta resolução). Sem timeout, o worker ficava
// bloqueado no `Tesseract.recognize()` por minutos, segurando o `pdfPending`
// promise e a UI do Meggy. Agora, race com timeout de 30s — se exceder, aborta
// o OCR da página e segue (mantém texto vazio ou parcial).
const OCR_TIMEOUT_MS = 30000;

function ensurePdfjs() {
  if (pdfjsReady) return pdfjsReady;
  // ★ FIX EXEC-7 Item 22-ext: ANTES, se importScripts falhasse (CDN blip, brief
  // 502/503 no jsdelivr), o pdfjsReady ficava como uma Promise REJEITADA para
  // sempre — toda chamada subsequente a ensurePdfjs() retornava a mesma Promise
  // rejeitada, e o worker ficava permanentemente quebrado para PDF até ser
  // terminado (auth:change → 'out'). Agora, .catch reseta pdfjsReady=null para
  // que a próxima chamada re-tente o importScripts. Espelha o padrão do
  // gdi-worker-bridge.js (item 2: null reset on failure). O throw re-propaga o
  // erro para o caller (extractFromBuffer → self.onmessage → {type:'error'}).
  pdfjsReady = new Promise((resolve, reject) => {
    try {
      importScripts('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js');
      // dentro do worker, o PDF.js usa o fake worker (roda na própria thread do worker)
      self.pdfjsLib.GlobalWorkerOptions.workerSrc = '';
      // desabilita o worker interno — já estamos num worker
      if (self.pdfjsLib.GlobalWorkerOptions) {
        self.pdfjsLib.GlobalWorkerOptions.workerSrc = 'data:,';
      }
      resolve(self.pdfjsLib);
    } catch (err) {
      reject(err);
    }
  }).catch(err => {
    pdfjsReady = null;
    throw err;
  });
  return pdfjsReady;
}

function ensureTesseract() {
  if (tesseractReady) return tesseractReady;
  // ★ FIX EXEC-7 Item 22-ext: mesmo padrão de reset do ensurePdfjs — se
  // importScripts do Tesseract falhar, reseta tesseractReady=null para que a
  // próxima chamada re-tente. Sem isso, um CDN blip no jsdelivr quebra o OCR
  // permanentemente neste worker.
  tesseractReady = new Promise((resolve, reject) => {
    try {
      importScripts('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
      resolve(self.Tesseract);
    } catch (err) { reject(err); }
  }).catch(err => {
    tesseractReady = null;
    throw err;
  });
  return tesseractReady;
}

self.onmessage = async (ev) => {
  const msg = ev.data;
  try {
    if (msg.type === 'extract')    return await handleExtract(msg);
    if (msg.type === 'extractBuf') return await handleExtractBuf(msg);
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: String(err && err.message || err) });
  }
};

async function handleExtract({ id, url, maxPages, maxChars, tryOcr }) {
  const resp = await fetch(url, { credentials: 'same-origin' });
  // ★ FIX Agent 8 E4: ANTES não checávamos `resp.ok` — se o servidor retornasse
  // 401/403/404/500 com corpo HTML/JSON (Cloudflare 502 HTML, Drive 401 JSON,
  // etc.), `resp.arrayBuffer()` lia o corpo do erro e pdf.js depois falhava
  // com "Invalid PDF structure" ou "Header not found", escondendo a causa
  // HTTP real. Agora reportamos o HTTP status de volta para a main thread
  // (espelhando meggy-pdf-engine.js:340-345).
  if (!resp.ok) {
    const body = await resp.text().catch(() => '').then(t => t.slice(0, 200));
    self.postMessage({ type: 'error', id, message: 'HTTP ' + resp.status + ' ao baixar PDF' + (body ? ' (body: ' + body + ')' : '') });
    return;
  }
  const buf = await resp.arrayBuffer();
  return extractFromBuffer({ id, buf, maxPages, maxChars, tryOcr });
}

async function handleExtractBuf({ id, buf, maxPages, maxChars, tryOcr }) {
  return extractFromBuffer({ id, buf, maxPages, maxChars, tryOcr });
}

async function extractFromBuffer({ id, buf, maxPages, maxChars, tryOcr }) {
  const lib = await ensurePdfjs();
  let doc;
  // ★ FIX Agent 8 E8: ANTES o `doc.destroy()` (linha abaixo do loop) só rodava
  // no caminho de SUCESSO. Se o loop de páginas lançasse no meio (página
  // corrupta, `pg.getTextContent()` falhando, `ocrPage()` lançando, ou
  // `text.length > MAX` com `slice` lançando), a função saía pelo catch
  // externo de `self.onmessage` que envia `{type:'error'}` mas NUNCA chamava
  // `doc.destroy()` — vazando o PDFDocumentProxy na memória do worker até
  // `terminate()`. Agora envolvemos o loop em `try/finally` com `doc.destroy()`
  // no finally, espelhando meggy-pdf-engine.js:354-475.
  try {
    doc = await lib.getDocument({ data: buf, disableFontFace: true }).promise;
    // ★ FIX Task 20-9 Item 14: hard cap MAX_PAGES=50. `maxPages` do caller
    // (hoje 60) é respeitado se menor, mas nunca excede 50. Previne OOM em
    // PDFs de 1000+ páginas (apostilas, livros) que podiam alocar centenas
    // de MB de canvas/text-content no worker.
    const n = Math.min(doc.numPages, maxPages || MAX_PAGES, MAX_PAGES);
    let text = '';
    let usedOcr = false;
    const MAX = maxChars || 25000;

    for (let i = 1; i <= n; i++) {
      self.postMessage({ type: 'progress', id, page: i, total: n });
      const pg = await doc.getPage(i);
      const tc = await pg.getTextContent({ normalizeWhitespace: true, includeMarkedContent: true });
      let pageText = '';
      for (let j = 0; j < tc.items.length; j++) {
        const item = tc.items[j];
        if (item.str !== undefined) {
          pageText += item.str;
          if (item.hasEOL) pageText += '\n';
        }
      }
      pageText = pageText.trim();

      // Se a página não tem texto visível, tenta OCR (se habilitado)
      if (tryOcr && pageText.length < 20) {
        self.postMessage({ type: 'ocr', id, page: i, total: n });
        try {
          const ocrText = await ocrPage(lib, pg);
          if (ocrText && ocrText.length > pageText.length) {
            pageText = ocrText;
            usedOcr = true;
          }
        } catch (e) { /* OCR falhou — mantém texto vazio */ console.warn('[meggy-pdf-worker] OCR page',i,'failed (non-critical):',e&&e.message||e); }
      }

      text += pageText + '\n\n';
      try { pg.cleanup(); } catch(e){console.warn('[meggy-pdf-worker] pg.cleanup failed page',i,':',e&&e.message||e);}
      if (text.length > MAX) { text = text.slice(0, MAX); break; }
    }

    self.postMessage({ type: 'done', id, text, pages: n, usedOcr });
  } finally {
    // Garante que o PDFDocumentProxy seja destruído mesmo em falhas parciais.
    if (doc) { try { doc.destroy(); } catch(e){console.warn('[meggy-pdf-worker] doc.destroy failed in finally:',e&&e.message||e);} }
  }
}

async function ocrPage(lib, page) {
  const Tesseract = await ensureTesseract();
  // OffscreenCanvas disponível em workers modernos
  if (typeof OffscreenCanvas === 'undefined') {
    // sem OffscreenCanvas — não dá para renderizar no worker; retorna vazio
    return '';
  }
  const viewport = page.getViewport({ scale: 2 }); // 2x é suficiente para OCR
  const canvas = new OffscreenCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  // Tesseract.js aceita OffscreenCanvas em algumas versões; senão converte para blob
  let imageInput = canvas;
  try {
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    imageInput = await blob.arrayBuffer();
  } catch(e){console.warn('[meggy-pdf-worker] canvas.convertToBlob failed, passing canvas directly:',e&&e.message||e); /* mantém canvas */ }
  // ★ FIX Task 20-9 Item 15: Tesseract.recognize sem timeout pode demorar
  // minutos em páginas densas (scans de livros, alta resolução). Race com
  // timeout de OCR_TIMEOUT_MS (30s): se exceder, rejeita e o caller (try/catch
  // em extractFromBuffer) mantém o texto vazio/parcial e segue para a próxima
  // página. Sem isso, o worker ficava bloqueado e a UI do Meggy pendurada.
  const recognizeP = Tesseract.recognize(imageInput, 'por', { logger: () => {} });
  const timeoutP = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('OCR timeout after ' + OCR_TIMEOUT_MS + 'ms')), OCR_TIMEOUT_MS);
  });
  const result = await Promise.race([recognizeP, timeoutP]);
  return (result && result.data && result.data.text) || '';
}
