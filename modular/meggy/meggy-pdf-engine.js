// ═══════════════════════════════════════════════════════════════
// meggy-pdf-engine.js — PDF text extraction (pdf.js + Tesseract OCR)
//
// Module 2 of 7 (modular/meggy/).
// Sourced from gdi-meggy.js M9-ISA IIFE (lines 239-518).
//
// Exposes:
//   • window.__gdiMeggy.pdf = { gdiEnsurePdfjs, ensurePdfjs, ensureTesseract,
//     ocrPdfPage, getFileType, extractTextFile, extractPdfText }
//   • window.gdiEnsurePdfjs   (alias — also defined in gdi-core.js:235 as fallback)
//   • window._pdfjsPromise    (memoization slot, shared with gdi-core.js)
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
            reject(new Error('pdfjsLib não exposto pelo CDN'));
          }
        };
        s.onerror=()=>reject(new Error('Falha ao carregar pdf.js do CDN'));
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
        else reject(new Error('Tesseract não exposto pelo CDN'));
      };
      s.onerror=()=>reject(new Error('Falha ao carregar Tesseract.js do CDN'));
      document.head.appendChild(s);
    });
    return tesseractPromise;
  }

  // ── OCR de uma página: renderiza no canvas e roda Tesseract ──
  // Retorna o texto extraído. Mostra progresso via callback opcional.
  // ★ Configurações otimizadas para PDFs escaneados de apostilas:
  //   - scale 3x (melhor precisão que 2x, ainda razoável em memória)
  //   - PSM 3 (auto page segmentation — funciona para texto corrido e múltiplas colunas)
  //   - idiomas: português + inglês
  async function ocrPdfPage(pdfjs,doc,pageNum,progressCb){
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
  async function extractPdfText(url, progressCb){
    const pdfjs=await ensurePdfjs();

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
      const n=Math.min(doc.numPages,100);
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
        if(txt.length>50000)break;
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
        if(progressCb)progressCb({phase:'ocr-init',page:0,total:ocrMaxPages});
        try{
          let ocrTxt='';
          for(let i=1;i<=ocrMaxPages;i++){
            if(progressCb)progressCb({phase:'ocr-page',page:i,total:ocrMaxPages,progress:0});
            let pageTxt='';
            try{
              pageTxt=await ocrPdfPage(pdfjs,doc,i,(pNum,pTotal,p)=>{
                if(progressCb)progressCb({phase:'ocr-page',page:pNum,total:pTotal,progress:p});
              });
            }catch(ocrErr){
              console.warn('[Meggy] OCR falhou na página',i,'(não crítico):',ocrErr.message);
              pageTxt='';
            }
            ocrTxt+=pageTxt+'\n\n';
            if(ocrTxt.length>50000)break;
          }
          if(ocrTxt.trim().length>50){
            // sucesso! OCR extraiu texto
            // (doc.destroy() agora tratado pelo finally — v80-FIX-MEGGY BUG 2)
            if(progressCb)progressCb({phase:'ocr-done',chars:ocrTxt.length});
            return ocrTxt.replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim().slice(0,50000);
          }
        }catch(ocrErr){
          console.warn('[Meggy] OCR falhou:',ocrErr.message);
          // continua para o erro descritivo abaixo
        }
      }

      // (doc.destroy() agora tratado pelo finally — v80-FIX-MEGGY BUG 2)
      // limpa texto: remove espaços excessivos, decodifica entidades
      txt=txt.replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
      const result=txt.slice(0,50000);
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
    extractPdfText
  };

  // ── Aliases para compatibilidade ──
  // window.gdiEnsurePdfjs já foi definido acima (com guard if(!window.gdiEnsurePdfjs))
  // window._pdfjsPromise é criado em runtime por gdiEnsurePdfjs

  console.log('[GDI Extras] meggy-pdf-engine ativo (Module 2/7)');
})();
