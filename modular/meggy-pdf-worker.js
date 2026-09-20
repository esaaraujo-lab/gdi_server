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

function ensurePdfjs() {
  if (pdfjsReady) return pdfjsReady;
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
  });
  return pdfjsReady;
}

function ensureTesseract() {
  if (tesseractReady) return tesseractReady;
  tesseractReady = new Promise((resolve, reject) => {
    try {
      importScripts('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
      resolve(self.Tesseract);
    } catch (err) { reject(err); }
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
  const buf = await resp.arrayBuffer();
  return extractFromBuffer({ id, buf, maxPages, maxChars, tryOcr });
}

async function handleExtractBuf({ id, buf, maxPages, maxChars, tryOcr }) {
  return extractFromBuffer({ id, buf, maxPages, maxChars, tryOcr });
}

async function extractFromBuffer({ id, buf, maxPages, maxChars, tryOcr }) {
  const lib = await ensurePdfjs();
  const doc = await lib.getDocument({ data: buf, disableFontFace: true }).promise;
  const n = Math.min(doc.numPages, maxPages || 60);
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
      } catch (_) { /* OCR falhou — mantém texto vazio */ }
    }

    text += pageText + '\n\n';
    try { pg.cleanup(); } catch (_) {}
    if (text.length > MAX) { text = text.slice(0, MAX); break; }
  }

  try { doc.destroy(); } catch (_) {}
  self.postMessage({ type: 'done', id, text, pages: n, usedOcr });
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
  } catch (_) { /* mantém canvas */ }
  const result = await Tesseract.recognize(imageInput, 'por', { logger: () => {} });
  return (result && result.data && result.data.text) || '';
}
