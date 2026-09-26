// ═══════════════════════════════════════════════════════════════
// study-advanced.js — Provas anteriores, Redação, Mapa de Fracos (radar)
//
// Split from gdi-study.js (v1.0.86 modularization, Task v86-MOD-STUDY).
// Originally IIFE #3 "M24 — Estudo Avançado" (lines 3812-4231, ~420 lines).
//
// Namespace: window.__gdiStudy.advanced = { renderProvas, renderRedacao, renderRadar, analyzeProva }
// Aliases:   window.renderProvas, window.renderRadar (preserved for compat)
// Guard:     window.__gdiStudyAdvanced (prevents double-init)
// Depends on: window.GDIStorage, window.gdiIsaPdf (for PDF text extraction),
//             window.collectCourses (alias exposed by study-courses.js)
//             window.marked, window.gdiSanitize (for Markdown rendering)
// Load order: 5th study module
//
// FIX while splitting:
//   - renderRadar writes window._qFilterSubject (already present in the
//     monolith at the end of renderRadar). This is the SENDER side of the
//     cross-module comm with study-questions.js — renderQuestoes picks up
//     window._qFilterSubject when next called. Verified preserved.
// ═══════════════════════════════════════════════════════════════
(function(){
  if(window.__gdiStudyAdvanced) return;
  window.__gdiStudyAdvanced = true;
  window.__gdiStudy = window.__gdiStudy || {};

  const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const lsGet=(k,d)=>{try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(_){return d}};
  const lsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}};
  const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);

  async function callMeggy(prompt){
    const r=await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:prompt,messages:[]})});
    const data=await r.json();
    if(!data.ok)throw new Error(data.error||'Meggy indisponível');
    return data.response||'';
  }

  function renderMd(txt){
    if(window.marked){try{return window.gdiSanitize?window.gdiSanitize(marked.parse(txt)):marked.parse(txt);}catch(_){}}
    return esc(txt).replace(/\n/g,'<br>');
  }

  const inp='background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:10px;font-size:13px;width:100%;box-sizing:border-box;font-family:inherit;';

  // ── Render: Provas anteriores → plano de estudos (C.3 — PAGINAÇÃO 12 por página) ──
  function renderProvas(box){
    const plans=lsGet('gdi-exam-plans-v1',[]);
    const PROVAS_PAGE=12;
    let currentPage=box.__provasPage||0;
    function renderList(){
      const totalPages=Math.max(1,Math.ceil(plans.length/PROVAS_PAGE));
      if(currentPage>=totalPages)currentPage=totalPages-1;
      if(currentPage<0)currentPage=0;
      const slice=plans.slice().reverse().slice(currentPage*PROVAS_PAGE,(currentPage+1)*PROVAS_PAGE);
      const listEl=box.querySelector('#gdi-provas-list');
      const pagerEl=box.querySelector('#gdi-provas-pager');
      if(listEl){
        if(!plans.length){
          listEl.innerHTML='';
        }else{
          listEl.innerHTML=slice.map(p=>`<div class="gdi-note" style="cursor:pointer;" data-id="${esc(p.id)}">
            <span style="flex:1;"><b style="color:var(--ferreto-text,#f0f6fc);">${esc(p.name)}</b><br><span style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;">${new Date(p.date).toLocaleDateString('pt-BR')} · ${p.topics||''} temas</span></span>
            <i class="bi bi-chevron-right" style="color:var(--ferreto-text-muted,#8b949e);"></i>
          </div>`).join('');
          listEl.querySelectorAll('[data-id]').forEach(el=>{
            el.onclick=()=>{
              const p=plans.find(x=>x.id===el.dataset.id);
              if(p)showPlan(box,p);
            };
          });
        }
      }
      if(pagerEl){
        if(totalPages>1){
          pagerEl.innerHTML=`<div style="display:flex;gap:6px;justify-content:center;align-items:center;flex-wrap:wrap;">
            <button class="gdi-mode-btn" id="provas-prev" style="font-size:11px;padding:5px 10px;" ${currentPage===0?'disabled':''}><i class="bi bi-chevron-left"></i> Anterior</button>
            <span style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;">Página ${currentPage+1} de ${totalPages}</span>
            <button class="gdi-mode-btn" id="provas-next" style="font-size:11px;padding:5px 10px;" ${currentPage===totalPages-1?'disabled':''}>Próxima <i class="bi bi-chevron-right"></i></button>
          </div>
          <div style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-top:6px;">Mostrando ${slice.length} de ${plans.length} plano(s)</div>`;
          const prev=pagerEl.querySelector('#provas-prev');
          const next=pagerEl.querySelector('#provas-next');
          if(prev)prev.onclick=()=>{currentPage--;box.__provasPage=currentPage;renderList();};
          if(next)next.onclick=()=>{currentPage++;box.__provasPage=currentPage;renderList();};
        }else{
          pagerEl.innerHTML=plans.length>PROVAS_PAGE?`<div style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;">Mostrando ${slice.length} de ${plans.length} planos</div>`:'';
        }
      }
    }
    box.innerHTML=`
      <div style="margin-bottom:18px;">
        <h3 style="color:var(--ferreto-text,#f0f6fc);margin:0 0 8px;">📋 Análise de Provas Anteriores</h3>
        <p style="color:var(--ferreto-text-muted,#8b949e);font-size:13px;margin:0 0 14px;">Faça upload de provas anteriores (PDF). A Meggy analisa os temas mais cobrados e cria um plano de estudos focado.</p>
        <div style="border:2px dashed var(--ferreto-border,#30363d);border-radius:12px;padding:24px;text-align:center;cursor:pointer;transition:.15s;" id="gdi-prova-drop">
          <i class="bi bi-cloud-upload" style="font-size:32px;color:var(--ferreto-primary,#ff8b9f);"></i>
          <p style="color:var(--ferreto-text,#e6edf3);font-size:14px;margin:8px 0 4px;">Clique para selecionar um PDF de prova</p>
          <p style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin:0;">ou arraste e solte aqui</p>
          <input type="file" id="gdi-prova-file" accept="application/pdf" style="display:none;">
        </div>
        <div id="gdi-prova-status" style="margin-top:12px;"></div>
      </div>
      ${plans.length?`<h4 style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin:18px 0 8px;">Planos salvos (${plans.length})</h4>
      <div id="gdi-provas-list" style="display:flex;flex-direction:column;gap:8px;"></div>
      <div id="gdi-provas-pager" style="margin-top:10px;text-align:center;"></div>`:''}
    `;
    const drop=box.querySelector('#gdi-prova-drop');
    const fileInput=box.querySelector('#gdi-prova-file');
    if(drop){
      drop.onclick=()=>fileInput.click();
      drop.ondragover=e=>{e.preventDefault();drop.style.borderColor='var(--ferreto-primary,#ff8b9f)';};
      drop.ondragleave=()=>{drop.style.borderColor='var(--ferreto-border,#30363d)';};
      drop.ondrop=e=>{e.preventDefault();drop.style.borderColor='var(--ferreto-border,#30363d)';if(e.dataTransfer.files[0])analyzeProva(box,e.dataTransfer.files[0]);};
    }
    if(fileInput){
      fileInput.onchange=()=>{if(fileInput.files[0])analyzeProva(box,fileInput.files[0]);};
    }
    renderList();
  }

  async function analyzeProva(box,file){
    const status=box.querySelector('#gdi-prova-status');
    if(!file.name.toLowerCase().endsWith('.pdf')){status.innerHTML='<div class="gdi-ai-err">Apenas arquivos PDF são suportados.</div>';return;}
    status.innerHTML='<div class="gdi-ai-loading" style="padding:20px;text-align:center;"><div class="gdi-ai-typing" style="margin:0 auto;"><span></span><span></span><span></span></div><p style="color:var(--ferreto-text-muted,#8b949e);font-size:13px;margin-top:10px;">Extraindo texto da prova…</p></div>';
    try{
      const pdfjsLib=window.pdfjsLib;
      if(!pdfjsLib){
        await new Promise((res,rej)=>{
          const s=document.createElement('script');
          s.src='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
          s.onload=()=>{window.pdfjsLib=window.pdfjsLib||pdfjsLib;res();};
          s.onerror=rej;
          document.head.appendChild(s);
        });
      }
      const lib=window.pdfjsLib;
      if(lib&&lib.GlobalWorkerOptions)lib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
      const buf=await file.arrayBuffer();
      // ★ v1.0.84: wrap doc lifecycle in try/finally so doc.destroy() runs
      //    even if getPage/getTextContent throws (prevents PDFDocumentProxy leak).
      let doc;
      try {
        doc=await lib.getDocument({data:buf,disableFontFace:true}).promise;
        const n=Math.min(doc.numPages,60);
        let txt='';
        for(let i=1;i<=n;i++){
          const pg=await doc.getPage(i);
          const tc=await pg.getTextContent({normalizeWhitespace:true,includeMarkedContent:true});
          let pt='';
          for(const item of tc.items){if(item.str!==undefined){pt+=item.str;if(item.hasEOL)pt+='\n';}}
          txt+=pt+'\n\n';
          if(txt.length>25000)break;
        }
        txt=txt.replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim().slice(0,8000);
        if(txt.length<50){status.innerHTML='<div class="gdi-ai-err">Não foi possível extrair texto deste PDF.</div>';return;}

        status.innerHTML='<div class="gdi-ai-loading" style="padding:20px;text-align:center;"><div class="gdi-ai-typing" style="margin:0 auto;"><span></span><span></span><span></span></div><p style="color:var(--ferreto-text-muted,#8b949e);font-size:13px;margin-top:10px;">Meggy está analisando a prova e criando o plano…</p></div>';
        const resp=await callMeggy('Analise esta prova anterior de concurso/vestibular e crie um plano de estudos focado. Identifique os 5 temas mais cobrados e sugira quantas horas dedicar a cada um (total ~100h). Formato Markdown com ## títulos, lista de temas com horas, e justificativa breve:\n\n'+txt);
        const plan={id:uid(),name:file.name,date:Date.now(),plan:resp,topics:(resp.match(/##\s+(.+)/g)||[]).length};
        const plans=lsGet('gdi-exam-plans-v1',[]);
        plans.push(plan);
        lsSet('gdi-exam-plans-v1',plans);
        showPlan(box,plan);
        showToast('Plano de estudos criado!');
      }catch(e){
        status.innerHTML='<div class="gdi-ai-err">Erro: '+esc(e.message)+'</div>';
      }finally{
        try{ if(doc) doc.destroy(); }catch(_){}
      }
    }catch(e){
      status.innerHTML='<div class="gdi-ai-err">Erro: '+esc(e.message)+'</div>';
    }
  }

  function showPlan(box,plan){
    box.innerHTML=`<div style="max-width:760px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
        <button class="gdi-mode-btn" id="prova-back" style="font-size:12px;"><i class="bi bi-arrow-left"></i> Voltar</button>
        <b style="color:var(--ferreto-text,#f0f6fc);">${esc(plan.name)}</b>
        <span style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;">${new Date(plan.date).toLocaleDateString('pt-BR')}</span>
      </div>
      <div class="gdi-isa-summary-body" style="background:var(--ferreto-surface-2,rgba(255,255,255,.03));border:1px solid var(--ferreto-border,#21262d);border-radius:14px;padding:20px;color:var(--ferreto-text,#e6edf3);font-size:14px;line-height:1.8;">
        ${renderMd(plan.plan)}
      </div>
    </div>`;
    box.querySelector('#prova-back').onclick=()=>renderProvas(box);
  }

  // ── Render: Correção de Redação ──
  function renderRedacao(box){
    const corrections=lsGet('gdi-essay-corrections-v1',[]);
    const BANCA_GROUPS=[
      {label:'Concurso Público',bancas:['CEBRASPE (CESPE)','FGV','VUNESP','FCC','CESGRANRIO','IBFC','FUJB','OAB','TJ/SP','TRT','MPU','TRE','TCU','PF/PRF','Outra']},
      {label:'ENEM',bancas:['ENEM (5 competências)']},
      {label:'Vestibulares Medicina',bancas:['FUVEST (dissertativa)','UNICAMP','UNIFESP','USP','ENEM Med','UECE Med','UERJ Med','UNESP Med']},
      {label:'Outros Vestibulares',bancas:['ITA','IME','UFRGS','UFPR','UFSC','UFRJ','PUC-SP','MACKENZIE']}
    ];
    const TIPOS=['Dissertativa-argumentativa','Estudo de caso','Discursiva','Narrativa','Carta argumentativa','Artigo opinativo'];
    box.innerHTML=`
      <div style="margin-bottom:20px;padding:20px;background:linear-gradient(135deg,rgba(255,139,159,.08),rgba(93,222,218,.04));border:1px solid var(--ferreto-border-strong,#30363d);border-radius:16px;">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;">
          <div style="font-size:34px;flex:none;">✍️</div>
          <div style="flex:1;">
            <h3 style="color:var(--ferreto-text,#f0f6fc);margin:0 0 4px;font-family:var(--ferreto-font-display,'Poppins',sans-serif);font-size:18px;">Correção de Redação</h3>
            <p style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;margin:0;line-height:1.5;">A Meggy corrige seguindo os critérios oficiais da banca. Envie o texto digitado ou uma imagem escaneada — a correção é salva em Markdown na pasta do aluno no Drive.</p>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
          <div>
            <label style="font-size:11px;color:var(--ferreto-text-muted,#8b949e);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em;">Banca organizadora</label>
            <select id="red-banca" class="gdi-redacao-select" style="${inp}width:100%;color-scheme:dark;">
              ${BANCA_GROUPS.map(g=>`<optgroup label="${esc(g.label)}">${g.bancas.map(b=>`<option value="${esc(b)}">${esc(b)}</option>`).join('')}</optgroup>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:11px;color:var(--ferreto-text-muted,#8b949e);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em;">Tipo de redação</label>
            <select id="red-tipo" class="gdi-redacao-select" style="${inp}width:100%;color-scheme:dark;">
              ${TIPOS.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div id="red-dropzone" style="border:2px dashed var(--ferreto-border-strong,#30363d);border-radius:12px;padding:18px;text-align:center;cursor:pointer;transition:all .2s;background:var(--ferreto-surface-2,rgba(255,255,255,.03));margin-bottom:12px;">
          <i class="bi bi-cloud-arrow-up" style="font-size:28px;color:var(--ferreto-text-muted,#8b949e);"></i>
          <div style="color:var(--ferreto-text,#f0f6fc);font-size:13px;margin-top:6px;">Arraste uma imagem da redação escaneada ou <b style="color:var(--ferreto-primary,#ff8b9f);">clique para enviar</b></div>
          <div style="color:var(--ferreto-text-faint,#6b7488);font-size:11px;margin-top:4px;">JPG, PNG ou PDF · A Meggy faz OCR do conteúdo</div>
          <input type="file" id="red-file" accept="image/*,application/pdf" style="display:none;">
        </div>
        <textarea id="red-text" placeholder="Cole aqui sua redação (mínimo 50 caracteres)..." style="${inp}min-height:240px;resize:vertical;font-family:Georgia,serif;font-size:14px;line-height:1.6;width:100%;box-sizing:border-box;"></textarea>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <button class="gdi-btn gdi-btn-primary" id="red-corrigir"><i class="bi bi-pencil-square"></i> Corrigir com Meggy</button>
          <span id="red-status" style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;align-self:center;"></span>
        </div>
      </div>
      <div id="red-result"></div>
      ${corrections.length?`<h4 style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin:18px 0 8px;">Correções anteriores (${corrections.length})</h4>
      <div style="display:flex;flex-direction:column;gap:6px;">${corrections.slice().reverse().slice(0,10).map(c=>`<div class="gdi-note" style="cursor:pointer;" data-id="${c.id}">
        <span style="flex:1;"><b style="color:var(--ferreto-text,#f0f6fc);">${esc(c.banca)}</b> · <span style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;">${new Date(c.date).toLocaleDateString('pt-BR')} · Nota: ${c.score||'—'}${c.tipo? ' · '+esc(c.tipo):''}</span></span>
      </div>`).join('')}</div>`:''}
    `;
    const dz=box.querySelector('#red-dropzone');
    const fileInput=box.querySelector('#red-file');
    const statusDrop=box.querySelector('#red-status');
    if(dz&&fileInput){
      dz.onclick=()=>fileInput.click();
      fileInput.onchange=async e=>{
        const f=e.target.files[0];
        if(!f)return;
        if(statusDrop)statusDrop.innerHTML='<i class="bi bi-hourglass-split"></i> Lendo imagem da redação…';
        try{
          if(f.type.startsWith('image/')){
            const fd=new FormData();
            fd.append('file',f);
            fd.append('mode','ocr');
            const r=await fetch('/api/ai/redacao',{method:'POST',body:fd});
            const data=await r.json();
            if(data.ok&&data.text){
              box.querySelector('#red-text').value=data.text;
              if(statusDrop)statusDrop.innerHTML='<span style="color:#3fb950;"><i class="bi bi-check-circle"></i> Texto extraído da imagem ('+data.text.length+' chars). Revise antes de corrigir.</span>';
            }else if(statusDrop){statusDrop.innerHTML='<span style="color:#ff6b6b;">Falha OCR: '+(data.error||'desconhecido')+'</span>';}
          }else if(f.type==='application/pdf'){
            if(window.gdiIsaPdf&&window.gdiIsaPdf.extractPdfText){
              const url=URL.createObjectURL(f);
              const txt=await window.gdiIsaPdf.extractPdfText(url);
              box.querySelector('#red-text').value=txt;
              if(statusDrop)statusDrop.innerHTML='<span style="color:#3fb950;"><i class="bi bi-check-circle"></i> Texto extraído do PDF ('+txt.length+' chars).</span>';
            }else if(statusDrop){statusDrop.innerHTML='<span style="color:#ff6b6b;">Carregue o módulo de PDFs primeiro.</span>';}
          }
        }catch(err){if(statusDrop)statusDrop.innerHTML='<span style="color:#ff6b6b;">Erro: '+esc(err.message)+'</span>';}
      };
    }
    box.querySelector('#red-corrigir').onclick=async()=>{
      const banca=box.querySelector('#red-banca').value;
      const tipo=box.querySelector('#red-tipo').value;
      const text=box.querySelector('#red-text').value.trim();
      const status=box.querySelector('#red-status');
      const result=box.querySelector('#red-result');
      if(!text||text.length<50){showToast('Escreva ou cole sua redação primeiro (mínimo 50 caracteres)');return;}
      status.innerHTML='<i class="bi bi-hourglass-split"></i> Meggy está corrigindo…';
      result.innerHTML='';
      try{
        const bancaInfo={
          'CEBRASPE (CESPE)':'CEBRASPE/CESPE usa escala 0-10. Critérios: adequação ao tema, estrutura textual, desenvolvimento de ideias, coesão e coerência, gramática. Desclassifica se fuga ao tema.',
          'FGV':'FGV avalia: conteúdo (0-5), estrutura (0-3), linguagem (0-2). Total 0-10. Penaliza erros graves de português.',
          'VUNESP':'VUNESP avalia: tema e conteúdo (0-4), estrutura e coesão (0-3), norma culta (0-3). Total 0-10.',
          'FCC':'FCC avalia: adequação ao tema (0-3), estrutura e coesão (0-3), norma culta e clareza (0-4). Total 0-10.',
          'CESGRANRIO':'CESGRANRIO avalia: atendimento ao tema (0-4), estrutura e coesão (0-3), norma culta (0-3). Total 0-10.',
          'IBFC':'IBFC avalia: conteúdo e tema (0-4), estrutura e coesão (0-3), linguagem e norma culta (0-3). Total 0-10.',
          'OAB':'OAB avalia: correção jurídica, estrutura argumentativa, clareza e objetividade, norma culta. Total 0-10.',
          'FUJB':'FUJB avalia: adequação ao tema, coesão/coerência, norma culta, criatividade. Total 0-10.',
          'TJ/SP':'TJ/SP (VUNESP): tema e conteúdo (0-4), estrutura (0-3), norma culta (0-3).',
          'TRT':'TRT (CEBRASPE/FCC): mesma banca organizadora. Avalia tema, estrutura, gramática.',
          'MPU':'MPU (CEBRASPE): escala 0-10. Adequação ao tema, estrutura, desenvolvimento, coesão, gramática.',
          'TRE':'TRE (CEBRASPE): escala 0-10. Mesmos critérios CEBRASPE.',
          'TCU':'TCU (CEBRASPE): escala 0-10. Mesmos critérios CEBRASPE.',
          'PF/PRF':'PF/PRF (CEBRASPE): escala 0-10. Mesmos critérios CEBRASPE.',
          'ENEM (5 competências)':'ENEM usa 5 competências (0-200 cada, total 0-1000): C1 Domínio norma culta, C2 Compreensão proposta, C3 Seleção/relação/organização argumentos, C4 Coesão, C5 Proposta de intervenção. Cada erro exclui 50 pontos por competência.',
          'FUVEST (dissertativa)':'FUVEST dissertativa escala 0-100. Critérios: conteúdo (0-50), estrutura (0-30), linguagem (0-20).',
          'UNICAMP':'UNICAMP avalia: tema e desenvolvimento, coesão e coerência, gramática e léxico, atendimento à proposta. Escala 0-100.',
          'UNIFESP':'UNIFESP dissertativa escala 0-100. Conteúdo, estrutura, linguagem.',
          'USP':'USP dissertativa escala 0-100. Conteúdo, estrutura, expressão.',
          'ENEM Med':'ENEM + peso 5x para medicina. Critérios ENEM mas com exigência máxima.',
          'UECE Med':'UECE dissertativa escala 0-10. Conteúdo, estrutura, linguagem.',
          'UERJ Med':'UERJ dissertativa escala 0-100. Conteúdo, organização, linguagem.',
          'UNESP Med':'UNESP dissertativa escala 0-100. Conteúdo, estrutura, expressão.',
          'ITA':'ITA dissertativa escala 0-100. Conteúdo técnico-científico, estrutura, expressão.',
          'IME':'IME dissertativa técnica. Conteúdo, estrutura, expressão. Escala 0-100.',
          'UFRGS':'UFRGS dissertativa escala 0-100. Conteúdo, estrutura, expressão.',
          'UFPR':'UFPR dissertativa escala 0-100. Conteúdo, estrutura, expressão.',
          'UFSC':'UFSC dissertativa escala 0-100. Conteúdo, estrutura, expressão.',
          'UFRJ':'UFRJ dissertativa escala 0-100. Conteúdo, estrutura, expressão.',
          'PUC-SP':'PUC-SP dissertativa escala 0-100. Conteúdo, estrutura, expressão.',
          'MACKENZIE':'MACKENZIE dissertativa escala 0-100. Conteúdo, estrutura, expressão.',
          'Outra':'Critérios gerais de concurso público brasileiro.'
        };
        const criterios=bancaInfo[banca]||bancaInfo['Outra'];
        const prompt='Você é um corretor de redações experiente. Corrija esta redação de banca: '+banca+' ('+tipo+').\n\nCRITÉRIOS DESTA BANCA: '+criterios+'\n\nINSTRUÇÕES:\n1. Avalie cada critério da banca com nota parcial (0-10 ou 0-200 conforme ENEM).\n2. Dê uma NOTA GERAL final.\n3. Para cada parágrafo, identifique: (a) problemas de conteúdo, (b) problemas gramaticais com a regra violada, (c) problemas de estrutura/coesão.\n4. Cite o trecho exato do aluno, depois comente.\n5. Dê sugestões concretas de reescrita.\n6. Identifique o tipo de redação automaticamente se foi marcado errado.\n7. Comente sobre adequação ao tema, argumentação, coesão, coerência, norma culta.\n\nFORMATO Markdown com seções ## :\n- ## Nota Geral: X/10\n- ## Avaliação por Critério\n- ## Comentários por Parágrafo (com citação)\n- ## Pontos Fortes\n- ## Pontos Fracos\n- ## Sugestões de Melhoria\n- ## Versão Reescrita\n\nREDAÇÃO DO ALUNO ('+text.length+' caracteres, banca '+banca+', tipo declarado: '+tipo+'):\n\n'+text;
        const resp=await callMeggy(prompt);
        const scoreMatch=resp.match(/nota\s*geral\s*:?\s*(\d+[,.]?\d*)\s*(?:\/\s*(\d+))?/i)||resp.match(/nota\s*:?\s*(\d+[,.]?\d*)/i);
        const score=scoreMatch?scoreMatch[1]:'—';
        const correction={id:uid(),banca,tipo,date:Date.now(),text:text.slice(0,4000),correction:resp,score};
        const corr=lsGet('gdi-essay-corrections-v1',[]);
        corr.push(correction);
        lsSet('gdi-essay-corrections-v1',corr);
        try{
          const md='---\n'+'banca: "'+banca+'"\n'+'tipo: "'+tipo+'"\n'+'data: '+new Date().toISOString()+'\n'+'score: '+score+'\n'+'---\n\n# Redação Corrigida\n\n## Redação Original\n\n'+text+'\n\n## Correção da Meggy\n\n'+resp+'\n';
          if(window.gdiIsaPdf&&window.gdiIsaPdf.saveEssayMD){
            await window.gdiIsaPdf.saveEssayMD(md,banca,tipo,score);
            showToast('Redação corrigida! Nota: '+score+' · MD salvo no Drive');
          }else{
            showToast('Redação corrigida! Nota: '+score);
          }
        }catch(_){showToast('Redação corrigida! Nota: '+score);}
        status.innerHTML='';
        result.innerHTML=`<div class="gdi-isa-summary-body" style="background:var(--ferreto-surface-2,rgba(255,255,255,.03));border:1px solid var(--ferreto-border,#21262d);border-radius:14px;padding:20px;color:var(--ferreto-text,#e6edf3);font-size:14px;line-height:1.8;margin-top:14px;">
          ${renderMd(resp)}
        </div>`;
      }catch(e){
        status.innerHTML='<span style="color:#ff6b6b;">Erro: '+esc(e.message)+'</span>';
      }
    };
    box.querySelectorAll('[data-id]').forEach(el=>{
      el.onclick=()=>{
        const c=corrections.find(x=>x.id===el.dataset.id);
        if(c){
          box.querySelector('#red-banca').value=c.banca;
          if(c.tipo&&box.querySelector('#red-tipo'))box.querySelector('#red-tipo').value=c.tipo;
          box.querySelector('#red-text').value=c.text;
          box.querySelector('#red-result').innerHTML=`<div class="gdi-isa-summary-body" style="background:var(--ferreto-surface-2,rgba(255,255,255,.03));border:1px solid var(--ferreto-border,#21262d);border-radius:14px;padding:20px;color:var(--ferreto-text,#e6edf3);font-size:14px;line-height:1.8;margin-top:14px;">${renderMd(c.correction)}</div>`;
        }
      };
    });
  }

  // ── Render: Mapa de Fracos ──
  function renderRadar(box){
    const qs=lsGet('gdi-questions-v1',[]);
    const srs=lsGet('gdi-q-srs-v1',{});
    const bySubject={};
    qs.forEach(q=>{
      const s=q.subject||'Geral';
      if(!bySubject[s])bySubject[s]={total:0,correct:0,wrong:0,paths:new Set()};
      bySubject[s].total++;
      if(q.path)bySubject[s].paths.add(q.path);
      const st=srs[q.id];
      if(st){
        if(st.box>0)bySubject[s].correct++;
        else bySubject[s].wrong++;
      }
    });
    const cron=lsGet('gdi-cronograma-v1',null);
    const aulasMenosEstudadas=[];
    if(cron&&Array.isArray(cron.plan)){
      cron.plan.forEach(t=>{if(t&&t.name&&t.type==='study')aulasMenosEstudadas.push(t.name);});
    }
    const trails=window.gdiTrails?window.gdiTrails.get():[];
    // ★ Late binding: collectCourses is exposed by study-courses.js as window.collectCourses.
    const courses=(typeof window.collectCourses==='function')?window.collectCourses():[];
    const subjects=Object.entries(bySubject).filter(([,v])=>v.total>=1).sort((a,b)=>b[1].total-a[1].total);
    if(!subjects.length){
      box.innerHTML=`<div class="gdi-notes-empty" style="padding:60px 20px;text-align:center;">
        <i class="bi bi-bullseye" style="font-size:48px;display:block;margin-bottom:12px;color:var(--ferreto-text-faint,#6b7488);"></i>
        Resolva algumas questões para ver seu mapa de fracos.<br>
        <span style="font-size:12px;color:var(--ferreto-text-muted,#8b949e);">Gere questões em Provas / Redação / Cronograma.</span>
      </div>`;
      return;
    }
    const weakSubjects=subjects.filter(([,v])=>v.total>0&&(v.correct/v.total)<0.6).sort((a,b)=>(a[1].correct/a[1].total)-(b[1].correct/b[1].total));
    const tileColor=acc=>acc<0.4?'#ff6b6b':acc<0.6?'#ffd43b':acc<0.8?'#3fb950':'#1a7f37';
    const tiles=subjects.map(([s,v])=>{
      const acc=v.total>0?(v.correct/v.total):0;
      const pct=Math.round(acc*100);
      const c=tileColor(acc);
      let linkedKey=null;
      for(const co of courses){const seg=co.key.split('/');if(seg.length>1&&s.includes(seg[seg.length-1])){linkedKey=co.key;break;}}
      return `<div class="gdi-course" data-subject="${esc(s)}" ${linkedKey?`data-course-key="${esc(linkedKey)}"`:''} style="cursor:pointer;display:flex;flex-direction:column;gap:8px;padding:14px 16px;border-left:4px solid ${c};">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <b style="color:var(--ferreto-text,#f0f6fc);font-size:13px;line-height:1.3;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(s)}</b>
          <span style="font-size:18px;font-weight:700;color:${c};font-variant-numeric:tabular-nums;">${pct}%</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <span style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;">${v.correct} acertos · ${v.wrong} erros · ${v.total} total</span>
          ${linkedKey?'<span style="color:var(--ferreto-primary,#ff8b9f);font-size:10px;"><i class="bi bi-link-45deg"></i> Curso</span>':''}
        </div>
        <div style="height:6px;background:var(--ferreto-surface-3,rgba(255,255,255,.08));border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:${c};border-radius:3px;transition:width .3s;"></div>
        </div>
      </div>`;
    }).join('');
    box.innerHTML=`<div>
      <h3 style="color:var(--ferreto-text,#f0f6fc);margin:0 0 4px;font-family:var(--ferreto-font-display,'Poppins',sans-serif);">🎯 Mapa de Fracos</h3>
      <p style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;margin:0 0 16px;line-height:1.5;">Clique em um tile para abrir as questões daquela matéria. Foque nas áreas em <b style="color:#ff6b6b;">vermelho</b> (acerto < 40%) e <b style="color:#ffd43b;">amarelo</b> (40-60%).</p>
      ${weakSubjects.length?`<div style="background:rgba(255,107,107,.08);border:1px solid rgba(255,107,107,.3);border-radius:12px;padding:14px 16px;margin-bottom:16px;">
        <b style="color:#ff8b8b;font-size:13px;"><i class="bi bi-exclamation-triangle-fill"></i> Foque em:</b>
        <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;">
          ${weakSubjects.map(([s,v])=>`<span style="color:var(--ferreto-text,#e6edf3);font-size:13px;">• <b>${esc(s)}</b> — ${Math.round(v.correct/v.total*100)}% de acerto (${v.correct}/${v.total})${v.paths.size?` · <span style=\"color:var(--ferreto-text-muted,#8b949e);font-size:11px;\">${v.paths.size} aula(s)</span>`:''}</span>`).join('')}
        </div>
      </div>`:'<div style="background:rgba(63,185,80,.08);border:1px solid rgba(63,185,80,.3);border-radius:12px;padding:14px 16px;margin-bottom:16px;"><b style="color:#3fb950;"><i class="bi bi-check-circle-fill"></i> Bom desempenho geral!</b> Nenhuma matéria com taxa de acerto abaixo de 60%.</div>'}
      ${aulasMenosEstudadas.length?`<div style="background:rgba(255,212,59,.08);border:1px solid rgba(255,212,59,.3);border-radius:12px;padding:14px 16px;margin-bottom:16px;">
        <b style="color:#ffd43b;font-size:13px;"><i class="bi bi-book-half"></i> Aulas menos estudadas no cronograma:</b>
        <div style="margin-top:8px;display:flex;flex-direction:column;gap:4px;">
          ${aulasMenosEstudadas.slice(0,5).map(n=>`<span style="color:var(--ferreto-text,#e6edf3);font-size:12px;">• ${esc(n)}</span>`).join('')}
        </div>
      </div>`:''}
      ${trails.length?`<div style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-bottom:8px;"><i class="bi bi-signpost-2"></i> ${trails.length} trilha(s) criada(s) — vincule matérias fracas a uma trilha para estudar com foco.</div>`:''}
      <div class="gdi-courses" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;">
        ${tiles}
      </div>
    </div>`;
    box.querySelectorAll('[data-subject]').forEach(el=>{
      el.onclick=()=>{
        // navega para Questões e aplica filtro de subject
        const subj=el.dataset.subject;
        const panelEl=document.getElementById('gdi-central');
        if(panelEl){
          const t=panelEl.querySelector('.gdi-central-tab[data-t=\"questoes\"]');
          if(t)t.click();
          // tenta aplicar filtro depois que Questões renderiza
          // ★ FIX (cross-module comm): write window._qFilterSubject so
          //    renderQuestoes (in study-questions.js) picks it up when
          //    next called. The closure var _qFilterSubject in M23 was
          //    never reachable from this IIFE — window.* is the bridge.
          setTimeout(()=>{try{window._qFilterSubject=subj;}catch(_){}},200);
        }
      };
    });
  }

  // ── Namespace exposure ──
  window.__gdiStudy.advanced = {
    renderProvas: renderProvas,
    renderRedacao: renderRedacao,
    renderRadar: renderRadar,
    analyzeProva: analyzeProva
  };

  // ── Backward-compat aliases (preserved from monolith) ──
  window.renderProvas = function(box){ return renderProvas.apply(this, arguments); };
  window.renderRedacao = function(box){ return renderRedacao.apply(this, arguments); };
  window.renderRadar = function(box){ return renderRadar.apply(this, arguments); };

  console.log('[GDI Extras] M24 Estudo Avançado (provas/redação/radar) ativo — modular');
})();
