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
//     BEFORE Tesseract.
//   • CF AI is reached via /api/ai/ocr worker endpoint (POST {image, prompt}
//     — model é opcional: o servidor resolve on-demand desde a v2.15.4).
//     If the endpoint is missing (HTTP 404) or network fails, getCfAI() returns
//     null and ocrPageWithAI() returns null — caller falls back to Tesseract
//     (só com opt-in desde a v2.15.4) ou devolve o motivo real do erro.
//   • The probe result is cached in _cfAiAvailable so we don't spam 404s per page.
//
// ★ v2.15.4 — OCR REATIVADO, SEM LIMITES (ordem do Elton 2026-11-13 23:08).
//   Motivo da desativação na v1.0.152: o Tesseract.js na THREAD PRINCIPAL
//   bloqueava 5+ min por PDF — por isso o fallback de OCR foi removido e
//   extractPdfText passou a dar throw "OCR desativado". A reativação NÃO
//   traz o Tesseract de volta como default: o OCR agora é por IA
//   (/api/ai/ocr, modelos de visão resolvidos on-demand no servidor, com
//   fallback multi-modelo) e o Tesseract só roda com opt-in explícito
//   (opts.useTesseract / allowTesseract). Sem teto de páginas, sem teto de
//   caracteres, sem teto global de tempo — o PDF inteiro é processado, com
//   progresso honesto (fases ocr-init / ocr-page / ocr-done via progressCb)
//   e erro ESTRUTURADO com o motivo real se a IA falhar.
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
  // v91: AI OCR ROUTING — CF Workers AI vision models
  // ═══════════════════════════════════════════════════════════════
  // Master toggle: set window.__gdiMeggy.pdf.useAiOcr = false to DISABLE,
  //   OR pass {useAiOcr:false} as 3rd arg of extractPdfText().
  // ★ v2.15.4: o DEFAULT agora é TRUE (OCR reativado, sem limites).
  //   When enabled, ocrPdfPage tries CF AI vision FIRST (fast, accurate for
  //   typed/printed text in PT-BR). O modelo é resolvido ON-DEMAND no
  //   servidor (/api/ai/ocr) — o cliente não fixa mais modelos.
  //   Se a IA falhar, o motivo estruturado fica em _lastOcrError e o
  //   chamador o exibe; Tesseract só com opt-in (v1.0.152: bloqueava a
  //   thread principal 5+ min).
  let _aiOcrConfig={
    // ★ v2.15.4: null = o SERVIDOR resolve o modelo on-demand
    //   (CF_MODELS_BY_ROLE.vision) e avança sozinho se depreciar. Os modelos
    //   hardcoded da v91 (llava-1.5-7b-hf, uform-gen2-qwen-500m) saíram do
    //   default; setAiOcrConfig() ainda aceita override explícito.
    visionModel:null,
    fallbackModel:null,
    prompt:'Transcreva TODO o texto visível desta imagem (português), preservando parágrafos, quebras de linha e ordem de leitura. Responda apenas com o texto transcrito, sem comentários nem formatação markdown.'
  };
  // _cfAiAvailable: null=unknown (try once), true=available, false=known-unavailable
  // (cached after the first 404/network error so we don't spam failed requests
  // per page). Caller can force a re-probe by setting it back to null.
  let _cfAiAvailable=null;
  // ★ v2.15.4: último erro ESTRUTURADO do OCR {reason, detail} (ou null).
  //   Preenchido por ocrPageWithAI() a cada falha — é o que os fluxos de
  //   resumo/quiz/batalhão exibem ao usuário em vez de erro genérico.
  let _lastOcrError=null;

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
  // endpoint /api/ai/ocr (POST {image, prompt} + model opcional) does the proxy.
  // ★ v2.15.4: model null/undefined = o servidor resolve on-demand; o erro
  //   HTTP agora é PARSEADO (o servidor devolve {reason, detail}) e vira
  //   Error com .reason/.detail — nunca mais só "CF AI OCR HTTP 502".
  function getCfAI(){
    if(_cfAiAvailable===false)return null;
    return {
      run: async (model, params) => {
        if(_cfAiAvailable===false)throw new Error('CF AI unavailable (cached)');
        const imageB64=_uint8ToBase64(params.image);
        let r;
        try{
          const reqBody={image:imageB64,prompt:params.prompt};
          if(model)reqBody.model=model; // ★ v2.15.4: sem modelo → servidor resolve
          r=await fetch('/api/ai/ocr',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify(reqBody)
          });
        }catch(e){
          _cfAiAvailable=false; // network error → don't retry per-page
          throw e;
        }
        if(r.status===404){
          _cfAiAvailable=false; // endpoint missing (older worker) → don't retry
          const e404=new Error('CF AI OCR endpoint not available (404)');
          e404.reason='ocr_unavailable'; e404.detail='O servidor ainda não tem o endpoint /api/ai/ocr (worker antigo).';
          throw e404;
        }
        if(!r.ok){
          let d={};
          try{ d=await r.json(); }catch(_){}
          // ★ v2.15.4: NÃO marca _cfAiAvailable=false aqui — 502/503 pode ser
          //   transitório (IA fora do ar); só 404/rede é "sabidamente ausente".
          const e=new Error('OCR indisponível: '+((d&&d.detail)||(d&&d.error)||('HTTP '+r.status)));
          e.reason=(d&&d.reason)||'ai_down';
          e.detail=(d&&d.detail)||(d&&d.error)||e.message;
          e.status=r.status;
          throw e;
        }
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
  // Returns extracted text on success, or null on failure (caller decides:
  // Tesseract opt-in, or structured error via _lastOcrError).
  // progressCb is the same shape used by ocrPdfPage:
  //   progressCb(pageNum, pageTotal, progress0to1)
  // ★ v2.15.4: UMA tentativa por página — o servidor (/api/ai/ocr) já faz o
  //   fallback multi-modelo (resolução on-demand). O loop cliente de 2
  //   modelos hardcoded (v91) saiu. A falha é REGISTRADA em _lastOcrError
  //   {reason, detail} — nunca engolida em silêncio.
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
      // ★ v2.15.4: sem modelo explícito (null) → o servidor resolve on-demand;
      //   só envia modelo se setAiOcrConfig() definiu um override explícito.
      const result=await cfAI.run(_aiOcrConfig.visionModel||null,{
        image:new Uint8Array(arrayBuffer),
        prompt:_aiOcrConfig.prompt
      });
      const text=String((result&&(result.response||result.description||result.text||''))||'').trim();
      if(text.length>5){
        if(progressCb)progressCb(pageNum,pageTotal,1);
        return text;
      }
      // Resposta vazia: a IA não leu nada nesta página.
      _lastOcrError={reason:'ocr_empty',detail:'A IA não retornou texto para esta página.'};
      console.warn('[Meggy] AI OCR returned empty text for page',pageNum);
      return null;
    }catch(e){
      // ★ v2.15.4: guarda o motivo ESTRUTURADO (reason/detail do servidor)
      //   para o chamador exibir o motivo real — nunca reduzido a "OCR falhou".
      _lastOcrError={reason:(e&&e.reason)||'ai_down',detail:(e&&e.detail)||(e&&e.message)||String(e)};
      console.warn('[Meggy] AI OCR falhou na página',pageNum+':',_lastOcrError.detail);
      return null;
    }
  }

  // ── OCR de uma página: renderiza no canvas e roda Tesseract ──
  // Retorna o texto extraído. Mostra progresso via callback opcional.
  // ★ Configurações otimizadas para PDFs escaneados de apostilas:
  //   - scale 3x (melhor precisão que 2x, ainda razoável em memória)
  //   - PSM 3 (auto page segmentation — funciona para texto corrido e múltiplas colunas)
  //   - idiomas: português + inglês
  // ★ v2.15.4: AI OCR é o DEFAULT (ordem do Elton — sem limites).
  //   Se a IA falhar e NÃO houver opt-in de Tesseract, vira ERRO com o
  //   motivo real (nunca moagem silenciosa nem fallback automático para o
  //   Tesseract — foi ele que bloqueou a thread 5+ min na v1.0.152).
  //   Opt-in de Tesseract: opts.useTesseract===true ou
  //   window.__gdiMeggy.pdf.allowTesseract===true.
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

    // ★ v2.15.4: AI OCR (CF Workers AI vision) — default ON. Opt-out
    //   explícito: opts.useAiOcr===false ou namespace useAiOcr===false.
    const useAiOcr=!((opts&&opts.useAiOcr===false)||(window.__gdiMeggy.pdf&&window.__gdiMeggy.pdf.useAiOcr===false));
    if(useAiOcr){
      const aiText=await ocrPageWithAI(canvas,progressCb,pageNum,doc.numPages);
      if(aiText&&aiText.trim().length>5){
        return aiText;
      }
      const allowTess=!!((opts&&opts.useTesseract)||(window.__gdiMeggy.pdf&&window.__gdiMeggy.pdf.allowTesseract));
      if(!allowTess){
        const err=new Error('OCR indisponível: '+((_lastOcrError&&_lastOcrError.detail)||'a IA não retornou texto para esta página.'));
        err.reason=(_lastOcrError&&_lastOcrError.reason)||'ai_down';
        err.ocrReason=err.reason;
        throw err;
      }
      // else fall through to Tesseract (opt-in explícito)
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

  // ── Extract text from PDF (PDF INTEIRO, sem teto de páginas/chars) ──
  // FIX: alguns PDFs têm texto selecionável mas getTextContent() básico
  // retorna vazio (fontes com encoding custom, text runs fragmentados).
  // Usa opções avançadas + fallback em annotations.
  // ★FIX v2: erros descritivos (não engole mais silenciosamente) + retry
  // com opções alternativas de fetch + fallback para PDFs escaneados.
  // ★FIX v3: OCR como fallback quando pdf.js retorna vazio.
  //   - Suporta um callback de progresso (para mostrar "OCR: página 3/11…")
  //     com fases {phase:'ocr-init'|'ocr-page'|'ocr-done'}
  //   - ★ v2.15.4: SEM LIMITE de páginas no OCR (ordem do Elton) — o PDF
  //     inteiro é processado, por IA via /api/ai/ocr (default ON)
  //   - Idiomas do Tesseract (só opt-in): português + inglês
  // ★ v91: opts.useAiOcr = false desliga a IA (default ON desde a v2.15.4).
  async function extractPdfText(url, progressCb, opts){
    // ★ v2.15.4: SEM teto global de tempo (ordem do Elton — sem limites).
    //   O teto de 60s (FIX 20-6 #8) foi REMOVIDO: um PDF escaneado grande
    //   precisa de 1 chamada de IA por página sem texto, e 60s não cobre
    //   nem 10 páginas. O progresso é honesto (progressCb por página, fases
    //   ocr-init/ocr-page/ocr-done), então o usuário sempre vê onde parou
    //   — sem spinner infinito sem texto. Se a rede travar de verdade, o
    //   fetch falha e o erro real sobe para o chamador. doc.destroy()
    //   continua garantido pelo try/finally abaixo.
    const pdfjs=await ensurePdfjs();
    // Resolve AI OCR flag: explicit opt > namespace flag > true (default)
    // ★ v2.15.4: default TRUE (reativado, sem limites) — era false.
    const _flagOff=((opts&&opts.useAiOcr===false)||(window.__gdiMeggy.pdf&&window.__gdiMeggy.pdf.useAiOcr===false));
    const useAiOcr=!_flagOff;

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
    // ★ FIX-MEGGY #22 (Agent 7): VERIFIED — extractPdfText wraps the entire
    //    doc lifecycle (after pdfjs.getDocument resolves) in try/finally with
    //    `if(doc) doc.destroy();` in the finally block. No change required;
    //    keeping the explicit verification comment for future audits.
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
      const n=doc.numPages; // ★ v2.15.4: SEM LIMITE de páginas (ordem do Elton) — v1.0.152 tinha Math.min(numPages,30)
      const pageTexts=[]; // ★ v2.15.4: texto por página (p/ OCR só das páginas sem texto)
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

        pageTexts.push(pageText);
        txt+=pageText+'\n\n';
        // ★ v2.15.4: SEM teto de caracteres (v1.0.152 cortava em 50K e
        //   parava o loop) — o texto integral vai para o chamador, que
        //   fatia para o prompt da IA como antes (ex.: 15000 chars).
      }

      // ★ fallback: tenta extrair de annotations/form fields
      // (alguns PDFs têm texto em campos de formulário)
      let extraTxt=''; // ★ v2.15.4: texto de annotations/form fields (fora do pageTexts)
      if(!txt.trim()||txt.trim().length<50){
        try{
          for(let i=1;i<=n;i++){
            const pg=await doc.getPage(i);
            const annots=await pg.getAnnotations();
            for(const a of annots){
              if(a.fieldValue&&typeof a.fieldValue==='string'){txt+=a.fieldValue+'\n';extraTxt+=a.fieldValue+'\n';}
              if(a.contents&&typeof a.contents==='string'){txt+=a.contents+'\n';extraTxt+=a.contents+'\n';}
            }
            if(txt.length>10000)break;
          }
        }catch(_){}
      }

      // (doc.destroy() agora tratado pelo finally — v80-FIX-MEGGY BUG 2)
      // ★ v2.15.4: OCR REATIVADO (ordem do Elton 2026-11-13, SEM LIMITES).
      //   Páginas sem texto selecionável (<20 chars) passam pelo OCR por IA
      //   (/api/ai/ocr) — TODAS elas, sem teto de páginas. Motivo da
      //   desativação na v1.0.152: o Tesseract na thread principal bloqueava
      //   5+ min; a IA não bloqueia a thread (e o Tesseract agora é só
      //   opt-in via opts.useTesseract). Progresso honesto via progressCb
      //   com {phase:'ocr-init'|'ocr-page'|'ocr-done'} — os handlers vivos
      //   em meggy-summaries.js / meggy-questions.js já tratam essas fases.
      const _ocrNeeded=[];
      for(let i=0;i<n;i++){ if(!pageTexts[i]||pageTexts[i].trim().length<20)_ocrNeeded.push(i+1); }
      if(_ocrNeeded.length){
        if(progressCb)try{ progressCb({phase:'ocr-init',page:0,total:_ocrNeeded.length}); }catch(_){}
        let ocrFail=0, ocrOk=0;
        for(const pgNum of _ocrNeeded){
          if(progressCb)try{ progressCb({phase:'ocr-page',page:pgNum,total:n,progress:ocrOk/_ocrNeeded.length}); }catch(_){}
          try{
            const ocrTxt=await ocrPdfPage(pdfjs,doc,pgNum,progressCb,{useAiOcr:useAiOcr,useTesseract:!!(opts&&opts.useTesseract)});
            if(ocrTxt&&ocrTxt.trim().length>5){ pageTexts[pgNum-1]=ocrTxt; ocrOk++; }
            else ocrFail++;
          }catch(e){
            ocrFail++;
            // Se a IA nem rodou (ex.: opt-out useAiOcr:false e o Tesseract
            // falhou), o motivo da falha é o erro capturado — não some.
            if(!_lastOcrError)_lastOcrError={reason:'ocr_unavailable',detail:(e&&e.message)||String(e)};
          }
        }
        txt=pageTexts.join('\n\n')+(extraTxt?('\n\n'+extraTxt):'');
        if(progressCb)try{ progressCb({phase:'ocr-done',chars:txt.trim().length}); }catch(_){}
        // Se o OCR não leu NADA e o PDF continua sem texto, o erro traz o
        // motivo REAL da IA (nunca "OCR desativado" nem ok:true vazio).
        if(txt.trim().length<50){
          const r=_lastOcrError||{};
          const err=new Error('OCR indisponível: '+(r.detail||'a IA não conseguiu ler este PDF')+' — tente novamente em alguns minutos.'+(ocrFail?(' ('+ocrFail+' página(s) sem leitura.)'):''));
          err.reason=r.reason||'ai_down';
          err.ocrReason=err.reason;
          throw err;
        }
      }
      // limpa texto: remove espaços excessivos, decodifica entidades
      txt=txt.replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
      // ★ v2.15.4: SEM slice — devolve o texto INTEGRAL (v1.0.152 cortava
      //   em 50K). Quem chama fatia para o prompt da IA como antes.
      if(!txt||txt.length<50){
        throw new Error('PDF sem texto selecionável — PDF escaneado (só imagens) e o OCR por IA não retornou texto. Possíveis causas:\n• PDF é composto só de imagens e a IA não conseguiu ler o conteúdo\n• PDF está criptografado ou corrompido\n\nTente abrir o PDF num leitor comum para confirmar o conteúdo.');
      }
      return txt;
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
    // ★ v2.15.4: Master toggle — default TRUE (OCR por IA reativado, sem
    //   limites). Desligar: window.__gdiMeggy.pdf.useAiOcr = false, ou
    //   por chamada via extractPdfText(url, cb, {useAiOcr:false}).
    useAiOcr: true,
    // ★ v2.15.4: Tesseract (thread principal) só com opt-in explícito —
    //   foi ele que bloqueou a thread 5+ min e motivou a desativação v1.0.152.
    allowTesseract: false,
    // ★ v2.15.4: último erro estruturado do OCR {reason, detail} (ou null).
    get lastOcrError(){ return _lastOcrError; },
    // Expose config (read-only mirror; use setAiOcrConfig() to mutate).
    // Returning a getter would freeze the shape — instead we expose the live object.
    aiOcrConfig: _aiOcrConfig
  };

  // ── Aliases para compatibilidade ──
  // window.gdiEnsurePdfjs já foi definido acima (com guard if(!window.gdiEnsurePdfjs))
  // window._pdfjsPromise é criado em runtime por gdiEnsurePdfjs

  console.log('[GDI Extras] meggy-pdf-engine ativo (Module 2/7)');
})();
