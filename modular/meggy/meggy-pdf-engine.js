// ═══════════════════════════════════════════════════════════════
// meggy-pdf-engine.js — PDF text extraction (pdf.js + Tesseract OCR
//                       + CF Workers AI vision OCR — v91)
//
// Module 2 of 7 (modular/meggy/).
// Sourced from gdi-meggy.js M9-ISA IIFE (lines 239-518).
//
// Exposes:
//   • window.__gdiMeggy.pdf = { gdiEnsurePdfjs, ensurePdfjs, ensureTesseract,
//     ocrPdfPage, getFileType, extractTextFile, extractPdfText,
//     ocrPageWithAI, getCfAI, setAiOcrConfig, useAiOcr, aiOcrConfig }
//   • window.gdiEnsurePdfjs   (alias — also defined in gdi-core.js:235 as fallback)
//   • window._pdfjsPromise    (memoization slot, shared with gdi-core.js)
//
// v91 — AI OCR routing:
//   • extractPdfText(url, progressCb, opts) — opts.useAiOcr = true (or set
//     window.__gdiMeggy.pdf.useAiOcr = true) tries CF Workers AI vision model
//     (llava-1.5-7b-hf, then uform-gen2-qwen-500m) BEFORE Tesseract.
//   • CF AI is reached via /api/ai/ocr worker endpoint (POST {model, image, prompt}).
//     If the endpoint is missing (HTTP 404) or network fails, getCfAI() returns
//     null and ocrPageWithAI() returns null — caller falls back to Tesseract.
//   • The probe result is cached in _cfAiAvailable so we don't spam 404s per page.
//
// Guard: window.__gdiMeggyPdf
// Depends on: window.__gdiMeggy.utils (none strictly required, since
//   extractPdfText doesn't use utils — but the namespace is referenced)
// ═══════════════════════════════════════════════════════════════
(function(){
  if(window.__gdiMeggyPdf)return;
  window.__gdiMeggyPdf=true;

  window.__gdiMeggy = window.__gdiMeggy || {};

  // ═══ PATCH F: Consolidated pdf.js loader (idempotent, sets workerSrc once) ═══
  // Outros módulos (gdi-study, gdi-core M9, gdi-pdf) podem usar o mesmo loader.
  // ★ v91 FIX: reset window._pdfjsPromise on failure so a transient CDN hiccup
  //    doesn't permanently break PDF extraction for the session.
  if(!window.gdiEnsurePdfjs){
    window.gdiEnsurePdfjs=function(){
      if(window._pdfjsPromise)return window._pdfjsPromise;
      window._pdfjsPromise=new Promise((resolve,reject)=>{
        if(window.pdfjsLib){
          if(!window.pdfjsLib._gdiWorkerSrcSet){
            try{
              window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
              window.pdfjsLib._gdiWorkerSrcSet=true;
            }catch(_){}
          }
          return resolve(window.pdfjsLib);
        }
        const s=document.createElement('script');
        s.src='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
        s.crossOrigin='anonymous';
        s.onload=()=>{
          if(window.pdfjsLib){
            try{
              window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
              window.pdfjsLib._gdiWorkerSrcSet=true;
            }catch(_){}
            resolve(window.pdfjsLib);
          }else{
            window._pdfjsPromise=null; // ★ v91 FIX: allow retry on next call
            reject(new Error('pdfjsLib não exposto pelo CDN'));
          }
        };
        s.onerror=()=>{
          window._pdfjsPromise=null; // ★ v91 FIX: allow retry on next call
          reject(new Error('Falha ao carregar pdf.js do CDN'));
        };
        document.head.appendChild(s);
      });
      return window._pdfjsPromise;
    };
  }

  // ── Dynamic load pdf.js (v3.11.174) — agora delega para window.gdiEnsurePdfjs() ──
  function ensurePdfjs(){
    return window.gdiEnsurePdfjs();
  }

  // ── Dynamic load Tesseract.js (OCR para PDFs escaneados) ──
  // ★ Carrega só quando necessário (PDFs sem texto selecionável).
  // Usa modelo em português (por) + inglês (eng) como fallback.
  // ★ v91 FIX: reset tesseractPromise on failure so a transient CDN hiccup
  //    doesn't permanently break OCR for the session.
  let tesseractPromise=null;
  function ensureTesseract(){
    if(window.Tesseract)return Promise.resolve(window.Tesseract);
    if(tesseractPromise)return tesseractPromise;
    tesseractPromise=new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      s.crossOrigin='anonymous';
      s.onload=()=>{
        if(window.Tesseract)resolve(window.Tesseract);
        else{
          tesseractPromise=null; // ★ v91 FIX: allow retry on next call
          reject(new Error('Tesseract não exposto pelo CDN'));
        }
      };
      s.onerror=()=>{
        tesseractPromise=null; // ★ v91 FIX: allow retry on next call
        reject(new Error('Falha ao carregar Tesseract.js do CDN'));
      };
      document.head.appendChild(s);
    });
    return tesseractPromise;
  }

  // ═══════════════════════════════════════════════════════════════
  // v91: AI OCR ROUTING — CF Workers AI vision models (llava / uform)
  // ═══════════════════════════════════════════════════════════════
  // Master toggle: set window.__gdiMeggy.pdf.useAiOcr = true, OR pass
  // {useAiOcr:true} as 3rd arg of extractPdfText().
  // When enabled, ocrPdfPage tries CF AI vision FIRST (fast, accurate for
  // typed/printed text in PT-BR); if CF AI is unavailable or returns empty,
  // falls back to Tesseract (existing behavior).
  let _aiOcrConfig={
    visionModel:'@cf/llava-hf/llava-1.5-7b-hf',       // primary — accurate, multi-lingual
    fallbackModel:'@cf/unum/uform-gen2-qwen-500m',    // smaller/faster fallback
    prompt:'Extract all visible text from this image. Return only the raw text content, preserving line breaks and reading order. Do not add commentary or markdown formatting.'
  };
  // _cfAiAvailable: null=unknown (try once), true=available, false=known-unavailable
  // (cached after the first 404/network error so we don't spam failed requests
  // per page). Caller can force a re-probe by setting it back to null.
  let _cfAiAvailable=null;

  // Helper: Uint8Array → base64 (chunked to avoid call-stack overflow on large images)
  function _uint8ToBase64(bytes){
    let binary='';
    const chunkSize=0x8000; // 32KB chunks
    for(let i=0;i<bytes.length;i+=chunkSize){
      const chunk=bytes.subarray(i,Math.min(i+chunkSize,bytes.length));
      binary+=String.fromCharCode.apply(null,chunk);
    }
    return btoa(binary);
  }

  // getCfAI: returns a stub that proxies .run(model, params) to /api/ai/ocr.
  // Returns null when CF AI is known to be unavailable (cached probe result).
  // The browser can't reach the CF Workers AI binding directly — the worker
  // endpoint /api/ai/ocr (POST {model, image, prompt}) does the proxy.
  function getCfAI(){
    if(_cfAiAvailable===false)return null;
    return {
      run: async (model, params) => {
        if(_cfAiAvailable===false)throw new Error('CF AI unavailable (cached)');
        const imageB64=_uint8ToBase64(params.image);
        let r;
        try{
          r=await fetch('/api/ai/ocr',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
              model:model,
              image:imageB64,
              prompt:params.prompt
            })
          });
        }catch(e){
          _cfAiAvailable=false; // network error → don't retry per-page
          throw e;
        }
        if(r.status===404){
          _cfAiAvailable=false; // endpoint missing (older worker) → don't retry
          throw new Error('CF AI OCR endpoint not available (404)');
        }
        if(!r.ok)throw new Error('CF AI OCR HTTP '+r.status);
        _cfAiAvailable=true;
        return await r.json();
      }
    };
  }

  // setAiOcrConfig: allows overriding visionModel/fallbackModel/prompt at runtime.
  function setAiOcrConfig(opts){
    if(!opts||typeof opts!=='object')return;
    if(opts.visionModel)_aiOcrConfig.visionModel=String(opts.visionModel);
    if(opts.fallbackModel)_aiOcrConfig.fallbackModel=String(opts.fallbackModel);
    if(opts.prompt)_aiOcrConfig.prompt=String(opts.prompt);
    // Re-probe CF AI on next call (config might be different)
    _cfAiAvailable=null;
  }

  // ocrPageWithAI: tries CF Workers AI vision model on a rendered canvas.
  // Returns extracted text on success, or null on failure (caller falls back
  // to Tesseract). progressCb is the same shape used by ocrPdfPage:
  //   progressCb(pageNum, pageTotal, progress0to1)
  async function ocrPageWithAI(canvas, progressCb, pageNum, pageTotal){
    try{
      // HTMLCanvasElement uses toBlob (callback-based); wrap in Promise.
      // (NOTE: the spec example used canvas.convertToBlob — that's OffscreenCanvas.
      //  HTMLCanvasElement only has toBlob/toDataURL.)
      const blob=await new Promise((resolve,reject)=>{
        try{
          canvas.toBlob(b=>b?resolve(b):reject(new Error('toBlob returned null')),'image/png');
        }catch(e){reject(e);}
      });
      if(!blob)throw new Error('Failed to convert canvas to PNG blob');
      const arrayBuffer=await blob.arrayBuffer();
      const cfAI=getCfAI();
      if(!cfAI)throw new Error('CF AI not available');
      if(progressCb)progressCb(pageNum,pageTotal,0.5);
      // Try primary vision model first, then fallback model.
      const models=[_aiOcrConfig.visionModel,_aiOcrConfig.fallbackModel];
      for(const model of models){
        try{
          const result=await cfAI.run(model,{
            image:new Uint8Array(arrayBuffer),
            prompt:_aiOcrConfig.prompt
          });
          const text=String((result&&(result.response||result.description||result.text||''))||'').trim();
          if(text.length>5){
            if(progressCb)progressCb(pageNum,pageTotal,1);
            return text;
          }
          console.warn('[Meggy] AI OCR model',model,'returned empty text — trying next');
        }catch(e){
          // If CF AI is now known-unavailable, abort model loop (no point retrying).
          if(_cfAiAvailable===false)throw e;
          console.warn('[Meggy] AI OCR model',model,'failed:',e.message,'— trying next');
        }
      }
      return null; // all models failed or returned empty
    }catch(e){
      console.warn('[Meggy] AI OCR falhou, caindo para Tesseract:',e.message);
      return null;
    }
  }

  // ── OCR de uma página: renderiza no canvas e roda Tesseract ──
  // Retorna o texto extraído. Mostra progresso via callback opcional.
  // ★ Configurações otimizadas para PDFs escaneados de apostilas:
  //   - scale 3x (melhor precisão que 2x, ainda razoável em memória)
  //   - PSM 3 (auto page segmentation — funciona para texto corrido e múltiplas colunas)
  //   - idiomas: português + inglês
  // ★ v91: opts.useAiOcr = true tenta CF Workers AI vision model ANTES do Tesseract.
  //   Se a IA falhar (endpoint 404, rede, ou resposta vazia), cai para Tesseract.
  async function ocrPdfPage(pdfjs,doc,pageNum,progressCb,opts){
    const page=await doc.getPage(pageNum);
    // escala 3x para melhorar precisão do OCR (testado: 2x = muita falha, 3x = bom)
    const viewport=page.getViewport({scale:3});
    const canvas=document.createElement('canvas');
    const ctx=canvas.getContext('2d');
    canvas.width=viewport.width;
    canvas.height=viewport.height;
    // fundo branco para páginas transparentes
    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    await page.render({canvasContext:ctx,viewport}).promise;

    // ★ v91: AI OCR (CF Workers AI vision) — try first if enabled
    const useAiOcr=!!(opts&&opts.useAiOcr);
    if(useAiOcr){
      const aiText=await ocrPageWithAI(canvas,progressCb,pageNum,doc.numPages);
      if(aiText&&aiText.trim().length>5){
        return aiText;
      }
      // else fall through to Tesseract
    }

    const Tesseract=await ensureTesseract();
    // idioma: português + inglês (modelos baixados do CDN do Tesseract)
    // ★ parâmetros otimizados:
    //   - tessedit_pageseg_mode=3 (auto — detecta orientação + colunas automaticamente)
    //   - preserve_interword_spaces=1 (mantém espaços entre palavras)
    const result=await Tesseract.recognize(
      canvas,
      'por+eng',
      {
        logger:m=>{
          if(m.status==='recognizing text'&&progressCb){
            progressCb(pageNum,doc.numPages,m.progress);
          }
        },
        // path dos modelos de idioma (CDN jsdelivr)
        corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@5',
        workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
        langPath:'https://tessdata.project-fast.com/4.0.0',
        // parâmetros do Tesseract engine
        tessedit_pageseg_mode:'3',
        preserve_interword_spaces:'1',
      }
    );
    return result.data.text||'';
  }

  // ── get file type by extension (md/txt/html/pdf) ──
  // used by generateAll and friends to route text files (MD/TXT/HTML)
  // directly to extractTextFile, skipping pdf.js entirely.
  function getFileType(name){
    const n=(name||'').toLowerCase();
    if(/\.md$/.test(n))return 'md';
    if(/\.txt$/.test(n))return 'txt';
    if(/\.html?$/.test(n))return 'html';
    return 'pdf';
  }
  async function extractTextFile(url){
    let resp;
    const fetchOpts=[{credentials:'same-origin'},{credentials:'include'},{credentials:'omit'}];
    for(const opts of fetchOpts){
      try{resp=await fetch(url,opts);if(resp.ok)break;}catch(_){}
    }
    if(!resp||!resp.ok)throw new Error('HTTP '+(resp?resp.status:'fetch')+' ao baixar arquivo de texto');
    const txt=await resp.text();
    if(!txt||txt.trim().length<10)throw new Error('Arquivo de texto vazio');
    return txt;
  }

  // ── Extract text from PDF (up to 30 pages, ~8000 chars) ──
  // FIX: alguns PDFs têm texto selecionável mas getTextContent() básico
  // retorna vazio (fontes com encoding custom, text runs fragmentados).
  // Usa opções avançadas + fallback em annotations.
  // ★FIX v2: erros descritivos (não engole mais silenciosamente) + retry
  // com opções alternativas de fetch + fallback para PDFs escaneados.
  // ★FIX v3: OCR (Tesseract.js) como fallback quando pdf.js retorna vazio.
  //   - Suporta um callback de progresso (para mostrar "OCR: página 3/11…")
  //   - Limita a 8 páginas no OCR (tempo total ~2-4 min para PDF grande)
  //   - Idiomas: português + inglês
  // ★ v91: opts.useAiOcr = true (or window.__gdiMeggy.pdf.useAiOcr = true)
  //   tenta CF Workers AI vision model ANTES do Tesseract no fallback de OCR.
  async function extractPdfText(url, progressCb, opts){
    const pdfjs=await ensurePdfjs();
    // Resolve AI OCR flag: explicit opt > namespace flag > false (default)
    const useAiOcr=!!((opts&&opts.useAiOcr) || (window.__gdiMeggy.pdf && window.__gdiMeggy.pdf.useAiOcr));

    // ★ Tenta fetch com credenciais same-origin primeiro; se falhar,
    // tenta sem credenciais (alguns workers rejeitam cookies em fetch cross-origin)
    let resp;
    let fetchErr;
    const fetchOpts=[
      {credentials:'same-origin'},
      {credentials:'include'},
      {} // sem credenciais
    ];
    for(const opts of fetchOpts){
      try{
        resp=await fetch(url,opts);
        if(resp.ok)break;
      }catch(e){fetchErr=e;}
    }
    if(!resp||!resp.ok){
      const status=resp?resp.status:(fetchErr?fetchErr.message:'unknown');
      throw new Error('HTTP '+status+' ao baixar PDF');
    }
    const buf=await resp.arrayBuffer();
    if(!buf||buf.byteLength<100){
      throw new Error('PDF vazio ou muito pequeno ('+(buf?buf.byteLength:0)+' bytes)');
    }

    // ★ v80-FIX-MEGGY BUG 2: wrap entire doc lifecycle in try/finally so
    //    doc.destroy() runs even if getPage/getTextContent/OCR throws.
    //    Previously, doc.destroy() only ran on success paths → leak on error.
    let doc;
    try{
      try{
        doc=await pdfjs.getDocument({data:buf,disableFontFace:true,isEvalSupported:false}).promise;
      }catch(e){
        throw new Error('pdf.js não conseguiu abrir o PDF: '+(e&&e.message||e));
      }
      // ★ v87-FIX-MEGGY-MODULES BUG 5: raise page cap 100 -> 500 so Meggy
      //    reads the entirety of large PDFs (user: "deve ler a totalidade
      //    de paginas dos pdfs, para gerar os resumos").
      const n=Math.min(doc.numPages,500);
      let txt='';

      for(let i=1;i<=n;i++){
        const pg=await doc.getPage(i);
        // ★ opções avançadas: normaliza whitespace, combina text items adjacentes,
        // inclui marked content (alguns PDFs usam isso para texto)
        let tc;
        try{
          tc=await pg.getTextContent({normalizeWhitespace:true,disableCombineTextItems:false,includeMarkedContent:true});
        }catch(_){
          tc=await pg.getTextContent(); // fallback sem opções
        }

        // extrai texto de items — x.str, x.str+hasEOL, também pega "transform" position
        let pageText='';
        for(const item of tc.items){
          if(item.str!==undefined){
            pageText+=item.str;
            if(item.hasEOL)pageText+='\n';
          }else if(item.type==='markedContent'||item.type==='beginMarkedContent'){
            // marked content — pode conter texto estruturado
            continue;
          }
        }

        // se página ficou vazia mas tem texto, tenta sem opções
        if(!pageText.trim()){
          try{
            const tc2=await pg.getTextContent();
            pageText=tc2.items.map(x=>(x.str||'')+(x.hasEOL?'\n':' ')).join('');
          }catch(_){}
        }

        txt+=pageText+'\n\n';
        // ★ v87-FIX-MEGGY-MODULES BUG 5: raise per-extraction char cap
        //    50000 -> 200000 so we keep ~4x more text before bailing.
        if(txt.length>200000)break;
      }

      // ★ fallback: tenta extrair de annotations/form fields
      // (alguns PDFs têm texto em campos de formulário)
      if(!txt.trim()||txt.trim().length<50){
        try{
          for(let i=1;i<=n;i++){
            const pg=await doc.getPage(i);
            const annots=await pg.getAnnotations();
            for(const a of annots){
              if(a.fieldValue&&typeof a.fieldValue==='string')txt+=a.fieldValue+'\n';
              if(a.contents&&typeof a.contents==='string')txt+=a.contents+'\n';
            }
            if(txt.length>10000)break;
          }
        }catch(_){}
      }

      // ★★ FALLBACK OCR (Tesseract.js) — para PDFs escaneados (só imagens) ★★
      // Se pdf.js extraiu menos de 50 chars, é provável que o PDF seja escaneado.
      // Renderizamos cada página como imagem e rodamos OCR em português.
      // ★ Limita a 15 páginas no OCR (~3-6 min no total). Para PDFs maiores,
      // as primeiras 15 páginas já dão contexto suficiente para a Meggy gerar
      // resumo + questões + pílulas úteis.
      if(!txt.trim()||txt.trim().length<50){
        const ocrMaxPages=Math.min(doc.numPages,15);
        if(progressCb)progressCb({phase:'ocr-init',page:0,total:ocrMaxPages,engine:useAiOcr?'ai-then-tesseract':'tesseract'});
        try{
          let ocrTxt='';
          for(let i=1;i<=ocrMaxPages;i++){
            if(progressCb)progressCb({phase:'ocr-page',page:i,total:ocrMaxPages,progress:0,engine:useAiOcr?'ai-then-tesseract':'tesseract'});
            let pageTxt='';
            try{
              pageTxt=await ocrPdfPage(pdfjs,doc,i,(pNum,pTotal,p)=>{
                if(progressCb)progressCb({phase:'ocr-page',page:pNum,total:pTotal,progress:p,engine:useAiOcr?'ai-then-tesseract':'tesseract'});
              },{useAiOcr:useAiOcr});
            }catch(ocrErr){
              console.warn('[Meggy] OCR falhou na página',i,'(não crítico):',ocrErr.message);
              pageTxt='';
            }
            ocrTxt+=pageTxt+'\n\n';
            // ★ v87-FIX-MEGGY-MODULES BUG 5: raise OCR per-extraction cap
            //    50000 -> 200000 to match text-extraction limit.
            if(ocrTxt.length>200000)break;
          }
          if(ocrTxt.trim().length>50){
            // sucesso! OCR extraiu texto
            // (doc.destroy() agora tratado pelo finally — v80-FIX-MEGGY BUG 2)
            if(progressCb)progressCb({phase:'ocr-done',chars:ocrTxt.length,engine:useAiOcr?'ai-then-tesseract':'tesseract'});
            // ★ v87-FIX-MEGGY-MODULES BUG 5: OCR also keeps up to 200K chars
            return ocrTxt.replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim().slice(0,200000);
          }
        }catch(ocrErr){
          console.warn('[Meggy] OCR falhou:',ocrErr.message);
          // continua para o erro descritivo abaixo
        }
      }

      // (doc.destroy() agora tratado pelo finally — v80-FIX-MEGGY BUG 2)
      // limpa texto: remove espaços excessivos, decodifica entidades
      txt=txt.replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
      // ★ v87-FIX-MEGGY-MODULES BUG 5: keep 200000 chars of final text
      //    (was 50000). 200K chars ≈ 50K tokens — fits modern 128K-context LLMs.
      const result=txt.slice(0,200000);
      if(!result||result.length<50){
        // ★ Erro descritivo: PDF provavelmente é escaneado (só imagens)
        // e o OCR também falhou ou não retornou texto útil
        throw new Error('PDF sem texto selecionável e OCR não conseguiu extrair. Possíveis causas:\n• PDF é composto só de imagens (escaneado) e o OCR falhou\n• PDF está criptografado ou corrompido\n• Falha ao baixar modelos de OCR do CDN (Tesseract.js)\n\nTente abrir o PDF num leitor comum para confirmar o conteúdo.');
      }
      return result;
    } finally {
      try { if(doc) doc.destroy(); } catch(_){}
    }
  }

  // ── Namespace exports ──
  window.__gdiMeggy.pdf = {
    gdiEnsurePdfjs: window.gdiEnsurePdfjs,
    ensurePdfjs,
    ensureTesseract,
    ocrPdfPage,
    getFileType,
    extractTextFile,
    extractPdfText,
    // ★ v91: AI OCR routing
    ocrPageWithAI,
    getCfAI,
    setAiOcrConfig,
    // Master toggle (set window.__gdiMeggy.pdf.useAiOcr = true to enable AI-first OCR).
    // Can also be enabled per-call via extractPdfText(url, cb, {useAiOcr:true}).
    useAiOcr: false,
    // Expose config (read-only mirror; use setAiOcrConfig() to mutate).
    // Returning a getter would freeze the shape — instead we expose the live object.
    aiOcrConfig: _aiOcrConfig
  };

  // ── Aliases para compatibilidade ──
  // window.gdiEnsurePdfjs já foi definido acima (com guard if(!window.gdiEnsurePdfjs))
  // window._pdfjsPromise é criado em runtime por gdiEnsurePdfjs

  console.log('[GDI Extras] meggy-pdf-engine ativo (Module 2/7)');
})();
