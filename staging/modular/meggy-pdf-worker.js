/* ============================================================================
 * meggy-pdf-worker.js  —  Web Worker para extração de texto de PDFs (Meggy)
 * ----------------------------------------------------------------------------
 * Substitui o trabalho pesado do gdi-meggy.js:
 *   - extractPdfText()        (PDF INTEIRO, sem teto de páginas — v2.15.4)
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

// ★ v2.15.4: SEM teto de páginas (ordem do Elton 2026-11-13) — o hard cap
//   MAX_PAGES=50 (FIX Task 20-9 Item 14, anti-OOM) foi REMOVIDO. O worker
//   processa o PDF inteiro; `pg.cleanup()` por página continua limitando a
//   memória. Risco residual conhecido: PDF de 1000+ páginas acumula o texto
//   inteiro em memória — verificar ao vivo com apostila grande.
// ★ FIX Task 20-9 Item 15: Tesseract.js pode demorar >60s em páginas densas
// (scans de livros, imagens de alta resolução). Sem timeout, o worker ficava
// bloqueado no `Tesseract.recognize()` por minutos, segurando o `pdfPending`
// promise e a UI do Meggy. Agora, race com timeout de 30s — se exceder, aborta
// o OCR da página e segue (mantém texto vazio ou parcial).
const OCR_TIMEOUT_MS = 30000;

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
    // ★ v2.15.4: sem teto de páginas — n = PDF inteiro (ou maxPages
    //   explícito do chamador, se ele pedir). Sem teto de chars: MAX só
    //   existe se o chamador pedir maxChars explicitamente (era 25000).
    const n = (typeof maxPages==='number'&&maxPages>0) ? Math.min(doc.numPages,maxPages) : doc.numPages;
    let text = '';
    let usedOcr = false;
    let ocrFailures = 0; // ★ v2.15.4: páginas cuja OCR falhou (não mais engolida)
    let ocrLastReason = ''; // ★ v2.15.4: motivo real da última falha de OCR
    const MAX = (typeof maxChars==='number'&&maxChars>0) ? maxChars : Infinity;

    for (let i = 1; i <= n; i++) {
      self.postMessage({ type: 'progress', id, phase: 'extract', page: i, total: n });
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

      // Se a página não tem texto visível, tenta OCR (se habilitado):
      // ★ v2.15.4: IA por /api/ai/ocr PRIMEIRO (sem teto de páginas);
      //   Tesseract (dentro do worker — não bloqueia a UI) só como fallback.
      //   Falha de OCR NÃO é mais engolida em silêncio: conta em ocrFailures
      //   e o motivo fica em ocrLastReason (vai no 'done'; se o documento
      //   inteiro ficar sem texto por falha de OCR, vira 'error' honesto).
      if (tryOcr && pageText.length < 20) {
        self.postMessage({ type: 'ocr', id, phase: 'ocr-page', page: i, total: n });
        try {
          const ocrText = await ocrPageWithAI(pg);
          if (ocrText && ocrText.length > pageText.length) {
            pageText = ocrText;
            usedOcr = true;
          } else {
            const tessText = await ocrPage(lib, pg);
            if (tessText && tessText.length > pageText.length) { pageText = tessText; usedOcr = true; }
          }
        } catch (e) { ocrFailures++; ocrLastReason = (e&&e.message)||String(e); }
      }

      text += pageText + '\n\n';
      try { pg.cleanup(); } catch (_) {}
      if (text.length > MAX) { text = text.slice(0, MAX); break; }
    }

    // ★ v2.15.4: documento inteiro sem texto POR FALHA DE OCR vira erro
    //   honesto (com o motivo real) em vez de 'done' com texto vazio — o
    //   bridge cai para o motor da thread principal, que tenta o OCR de
    //   novo e devolve o motivo ao chamador. Nunca ok-vazio silencioso.
    if (text.trim().length < 50 && ocrFailures > 0 && !usedOcr) {
      self.postMessage({ type: 'error', id, message: 'OCR indisponível: ' + (ocrLastReason || 'a IA não conseguiu ler este PDF') + ' — tente novamente.' });
      return;
    }
    self.postMessage({ type: 'done', id, text, pages: n, usedOcr, ocrFailures, ocrLastReason });
  } finally {
    // Garante que o PDFDocumentProxy seja destruído mesmo em falhas parciais.
    if (doc) { try { doc.destroy(); } catch (_) {} }
  }
}

// ★ v2.15.4: OCR por IA dentro do worker — POST /api/ai/ocr (sem modelo:
//   o servidor resolve on-demand). O worker nasceu de Blob URL, então a
//   URL é ABSOLUTA (self.location.origin) — fetch relativo falharia.
//   credentials:'same-origin' leva o cookie de sessão (endpoint exige login).
const OCR_API_URL = (self.location && self.location.origin ? self.location.origin : '') + '/api/ai/ocr';

function _wUint8ToBase64(bytes){
  let binary='';
  const chunkSize=0x8000;
  for(let i=0;i<bytes.length;i+=chunkSize){
    binary+=String.fromCharCode.apply(null,bytes.subarray(i,Math.min(i+chunkSize,bytes.length)));
  }
  return btoa(binary);
}

async function ocrPageWithAI(page){
  if (typeof OffscreenCanvas === 'undefined') throw new Error('OffscreenCanvas indisponível — OCR por IA não pode renderizar a página.');
  const viewport = page.getViewport({ scale: 2 });
  const canvas = new OffscreenCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const imageB64 = _wUint8ToBase64(new Uint8Array(await blob.arrayBuffer()));
  const r = await fetch(OCR_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ image: imageB64, prompt: 'Transcreva TODO o texto visível desta imagem, preservando parágrafos e ordem de leitura. Responda apenas com o texto transcrito, sem comentários.' }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d && (d.detail || d.error)) || ('OCR HTTP ' + r.status));
  const text = String((d && d.response) || '').trim();
  if (!text) throw new Error('A IA não retornou texto para esta página.');
  return text;
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
