// ═══════════════════════════════════════════════════════════════
// meggy-summaries.js — summary/mindmap flows + renderResumos tab +
//                      battalion + shared pool + gdiIsaPdf assembly
//
// Module 6 of 7 (modular/meggy/).
// Sourced from gdi-meggy.js M9-ISA IIFE (lines 783-817, 1173-1202,
// 1425-1464, 2049-2369).
//
// CRITICAL: gdiIsaPdf assembly uses Object.assign — NEVER reassign
// (preserves gdi-worker-bridge.js monkey-patch on extractPdfText).
//
// Exposes:
//   • window.__gdiMeggy.summaries = { summary, mindmap, renderSummaryCard,
//     _summaryModal, renderResumos, fetchSharedQuestions, saveEssayMD,
//     startBattalion, getBattalionStatus, saveSharedSummary, fetchSharedSummaries }
//   • window.gdiIsaPdf  (16 methods assembled from all modules — late-bind via
//     arrow wrappers so load order doesn't matter)
//   • window.renderResumos  (alias for gdi-study.js:1427)
//
// Guard: window.__gdiMeggySummaries
// Depends on: utils (esc, renderMd, realLessonName, setLoading, setError,
//   lessonKey), pdf-engine (extractPdfText), cache (generateAll, regenerate,
//   cacheGet, cacheSave, saveIsaSummary, listIsaSummaries, delIsaSummary,
//   downloadAsPdf, copySummary), questions (questions), flashcards (flashcards)
// External: showToast, window.GDIStorage, window.gdiModal
// ═══════════════════════════════════════════════════════════════
(function(){
  if(window.__gdiMeggySummaries)return;
  window.__gdiMeggySummaries=true;

  window.__gdiMeggy = window.__gdiMeggy || {};

  // ── Late-bound namespace shortcuts ──
  const U = window.__gdiMeggy.utils;

  // ── Render summary card (structured layout + download/copy buttons) ──
  function renderSummaryCard(bodyEl, lesson, markdownText, fromCache){
    const cacheBadge=fromCache
      ?'<span style="font-size:11px;color:var(--ferreto-text-muted,#8b949e);"><i class="bi bi-cloud-check" style="color:#3fb950;"></i> do cache do Drive</span>'
      :'<span style="font-size:11px;color:var(--ferreto-text-muted,#8b949e);"><i class="bi bi-check2-circle" style="color:#3fb950;"></i> salvo no Drive + Central</span>';
    bodyEl.innerHTML=`<div class="gdi-mat-isa-result" style="max-width:760px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:14px;padding:12px 16px;background:linear-gradient(135deg,rgba(255,139,159,.12),rgba(93,222,218,.06));border:1px solid var(--ferreto-border,#21262d);border-radius:14px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:8px;min-width:0;">
          <i class="bi bi-stars" style="color:var(--ferreto-primary,#ff8b9f);font-size:20px;flex:none;"></i>
          <b style="color:var(--ferreto-text,#f0f6fc);font-family:var(--ferreto-font-display,'Poppins',sans-serif);font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Resumo Meggy 🐩 · ${U.esc(lesson)}</b>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          ${cacheBadge}
          <button id="gdi-isa-regen" title="Regerar (PDF pode estar incompleto)" style="background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);color:var(--ferreto-text,#e6edf3);border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;transition:.15s;"><i class="bi bi-arrow-clockwise"></i> Regerar</button>
          <button id="gdi-isa-dl" title="Baixar em PDF" style="background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);color:var(--ferreto-text,#e6edf3);border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;transition:.15s;"><i class="bi bi-file-earmark-pdf"></i> PDF</button>
          <button id="gdi-isa-copy" title="Copiar resumo" style="background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);color:var(--ferreto-text,#e6edf3);border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;transition:.15s;"><i class="bi bi-clipboard"></i> Copiar</button>
        </div>
      </div>
      <div class="gdi-isa-summary-body" style="background:var(--ferreto-surface-2,rgba(255,255,255,.03));border:1px solid var(--ferreto-border,#21262d);border-radius:14px;padding:20px 24px;color:var(--ferreto-text,#e6edf3);font-size:14px;line-height:1.8;">
        ${U.renderMd(markdownText)}
      </div>
    </div>`;
    bodyEl.querySelector('#gdi-isa-dl').onclick=()=>window.__gdiMeggy.cache.downloadAsPdf(lesson,markdownText);
    bodyEl.querySelector('#gdi-isa-copy').onclick=()=>window.__gdiMeggy.cache.copySummary(markdownText);
    // ★ botão Regerar: limpa cache e regenera resumo + questões
    const regenBtn=bodyEl.querySelector('#gdi-isa-regen');
    if(regenBtn)regenBtn.onclick=()=>{
      // busca os items do M9 para passar para regenerate
      const matTabs=document.querySelector('#gdi-mat-tabs');
      if(matTabs&&matTabs.__items){
        window.gdiIsaPdf.regenerate(matTabs.__items,bodyEl,lesson);
      }else{
        showToast('Navegue para a aba de materiais para regerar');
      }
    };
  }

  // ── Summary flow (com cadeia) ──
  async function summary(items,bodyEl,lessonName){
    if(!items||!items.length){U.setError(bodyEl,'Nenhum PDF disponível.');return;}
    const lesson=U.realLessonName(lessonName||items[0].name);
    bodyEl.__items=items;bodyEl.__lesson=lesson;
    U.setLoading(bodyEl,'Meggy está lendo o material e criando resumo + questões + pílulas…');
    try{
      const result=await window.__gdiMeggy.cache.generateAll(items,lesson,'summary',(p)=>{
        // ★ feedback de progresso durante extração/OCR
        if(p.phase==='extract')U.setLoading(bodyEl,'Extraindo texto: '+p.pdf+'…');
        else if(p.phase==='ocr-init')U.setLoading(bodyEl,'PDF escaneado detectado — iniciando OCR (pode levar alguns minutos)…');
        else if(p.phase==='ocr-page')U.setLoading(bodyEl,'OCR em andamento — página '+p.page+' de '+p.total+(p.progress?(' ('+Math.round(p.progress*100)+'%)'):'')+'…');
        else if(p.phase==='ocr-done')U.setLoading(bodyEl,'OCR concluído ('+p.chars+' caracteres extraídos). Gerando resumo…');
      });
      if(!result.summary){U.setError(bodyEl,'Meggy não conseguiu gerar o resumo.');return;}
      renderSummaryCard(bodyEl,lesson,result.summary,false);
      // badge com tudo que foi gerado
      const qCount=result.questions?result.questions.length:0;
      const badge=document.createElement('div');
      badge.style.cssText='background:rgba(63,185,80,.1);border:1px solid rgba(63,185,80,.3);border-radius:10px;padding:8px 14px;margin-bottom:12px;display:flex;align-items:center;gap:8px;font-size:12px;color:#3fb950;flex-wrap:wrap;';
      let badgeHtml='<i class="bi bi-check-circle-fill"></i> <b>Gerado em cadeia:</b> ';
      const parts=[];
      if(result.summary)parts.push('✓ Resumo');
      if(result.mindmap)parts.push('✓ Pílulas');
      if(qCount>0)parts.push('✓ '+qCount+' questões');
      badgeHtml+=parts.join(' · ')+' + flashcards';
      badge.innerHTML=badgeHtml;
      bodyEl.querySelector('.gdi-mat-isa-result')?.insertBefore(badge,bodyEl.querySelector('.gdi-mat-isa-result').firstChild);
      showToast('Resumo + pílulas + '+qCount+' questões gerados!');
    }catch(e){U.setError(bodyEl,e.message);return;}
  }

  // ── Pílulas flow (antes "Mapa Mental") — gera em cadeia ──
  async function mindmap(items,bodyEl,lessonName){
    if(!items||!items.length){U.setError(bodyEl,'Nenhum PDF disponível.');return;}
    const lesson=U.realLessonName(lessonName||items[0].name);
    bodyEl.__items=items;bodyEl.__lesson=lesson;
    U.setLoading(bodyEl,'Meggy está lendo o material e criando pílulas + resumo + questões…');
    try{
      const result=await window.__gdiMeggy.cache.generateAll(items,lesson,'mindmap',(p)=>{
        if(p.phase==='extract')U.setLoading(bodyEl,'Extraindo texto: '+p.pdf+'…');
        else if(p.phase==='ocr-init')U.setLoading(bodyEl,'PDF escaneado detectado — iniciando OCR (pode levar alguns minutos)…');
        else if(p.phase==='ocr-page')U.setLoading(bodyEl,'OCR em andamento — página '+p.page+' de '+p.total+(p.progress?(' ('+Math.round(p.progress*100)+'%)'):'')+'…');
        else if(p.phase==='ocr-done')U.setLoading(bodyEl,'OCR concluído ('+p.chars+' caracteres). Gerando pílulas…');
      });
      if(!result.mindmap){U.setError(bodyEl,'Meggy não conseguiu gerar as pílulas.');return;}
      bodyEl.innerHTML=`<div class="gdi-mat-isa-result" style="max-width:760px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:14px;padding:12px 16px;background:linear-gradient(135deg,rgba(255,139,159,.12),rgba(93,222,218,.06));border:1px solid var(--ferreto-border,#21262d);border-radius:14px;flex-wrap:wrap;flex-shrink:0;">
          <div style="display:flex;align-items:center;gap:8px;min-width:0;">
            <i class="bi bi-capsule" style="color:var(--ferreto-primary,#ff8b9f);font-size:20px;flex:none;"></i>
            <b style="color:var(--ferreto-text,#f0f6fc);font-family:var(--ferreto-font-display,'Poppins',sans-serif);font-size:15px;">Pílulas · ${U.esc(lesson)}</b>
          </div>
          <button id="gdi-mm-dl" title="Baixar em PDF" style="background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);color:var(--ferreto-text,#e6edf3);border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;"><i class="bi bi-file-earmark-pdf"></i> PDF</button>
        </div>
        <div class="gdi-isa-summary-body gdi-mental-map" style="background:var(--ferreto-surface-2,rgba(255,255,255,.03));border:1px solid var(--ferreto-border,#21262d);border-radius:14px;padding:20px 24px;color:var(--ferreto-text,#e6edf3);font-size:14px;line-height:1.8;">
          ${U.renderMd(result.mindmap)}
        </div>
      </div>`;
      bodyEl.querySelector('#gdi-mm-dl').onclick=()=>window.__gdiMeggy.cache.downloadAsPdf('Pílulas · '+lesson,result.mindmap);
      // badge com tudo que foi gerado em cadeia
      const qCount=result.questions?result.questions.length:0;
      if(result.summary||qCount>0){
        const badge=document.createElement('div');
        badge.style.cssText='background:rgba(63,185,80,.1);border:1px solid rgba(63,185,80,.3);border-radius:10px;padding:8px 14px;margin-bottom:12px;font-size:12px;color:#3fb950;';
        const parts=[];
        if(result.summary)parts.push('✓ Resumo');
        if(qCount>0)parts.push('✓ '+qCount+' questões');
        badge.innerHTML='<i class="bi bi-check-circle-fill"></i> <b>Gerado em cadeia:</b> '+parts.join(' · ');
        bodyEl.querySelector('.gdi-mat-isa-result')?.insertBefore(badge,bodyEl.querySelector('.gdi-mat-isa-result').firstChild);
      }
      showToast('Pílulas geradas!');
    }catch(e){U.setError(bodyEl,e.message);return;}
  }

  // ── Buscar questões compartilhadas por outros alunos da mesma matéria ──
  // ★ usado pelo Simulado (gdi-study.js) para enriquecer o banco
  async function fetchSharedQuestions(subjectFilter){
    try{
      const url='/api/ai/shared-flashcards'+(subjectFilter?'?subject='+encodeURIComponent(subjectFilter):'')+'&kind=question';
      const r=await fetch(url,{cache:'no-store'});
      const d=await r.json();
      if(d&&d.ok&&Array.isArray(d.items)){
        // converte cards compartilhados em questões
        return d.items.filter(it=>it.statement).map(it=>({
          id:it.id||('shared-'+Math.random().toString(36).slice(2,7)),
          subject:subjectFilter||it.subject||'Compartilhada',
          type:it.type||'mc',
          statement:it.statement,
          options:it.options||['a','b','c','d'],
          correct:it.correct||0,
          explanation:it.explanation||'',
          legalText:it.legalText||'',
          fundamentacao:it.fundamentacao||'',
          source:'shared'
        }));
      }
      return [];
    }catch(_){return [];}
  }

  // ── Salvar MD da redação corrigida no Drive do aluno ──
  // ★ chamado pela aba Redação (gdi-study.js) após correção
  async function saveEssayMD(markdown,banca,tipo,score){
    try{
      const r=await fetch('/api/ai/essay/save',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          markdown:String(markdown||''),
          banca:banca||'',
          tipo:tipo||'',
          score:String(score||''),
          date:new Date().toISOString()
        })});
      const d=await r.json();
      return !!(d&&d.ok);
    }catch(_){return false;}
  }

  // ── Batalhão: dispara processamento em background via worker ──
  // ★ chamado quando aluno adiciona um curso na Central de Estudos
  async function startBattalion(courseKey, coursePath, lessonName, pdfList){
    try{
      const body={courseKey, coursePath, lessonName, pdfs:pdfList.map(p=>({name:p.name||'',url:p.url||'',text:p.text||''}))};
      const r=await fetch('/api/ai/battalion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const d=await r.json();
      return !!(d&&d.ok);
    }catch(_){return false;}
  }
  // ── Verifica se o batalhão já processou um curso ──
  async function getBattalionStatus(courseKey){
    try{
      const r=await fetch('/api/ai/battalion/status?courseKey='+encodeURIComponent(courseKey),{cache:'no-store'});
      const d=await r.json();
      return d;
    }catch(_){return {ok:false,processed:false};}
  }

  // ── Salvar resumo no pool compartilhado (todos os usuários) ──
  async function saveSharedSummary(lessonName,summary,questions){
    try{
      await fetch('/api/ai/shared-summaries',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({lessonName,summary,questions:questions||null})});
    }catch(_){/* não bloqueia */}
  }
  // ── Buscar resumos compartilhados de outros usuários ──
  async function fetchSharedSummaries(lessonFilter){
    try{
      const url='/api/ai/shared-summaries'+(lessonFilter?'?lesson='+encodeURIComponent(lessonFilter):'');
      const r=await fetch(url,{cache:'no-store'});
      const d=await r.json();
      return (d&&d.ok&&Array.isArray(d.summaries))?d.summaries:[];
    }catch(_){return [];}
  }

  function _summaryModal(lesson, markdownText){
    // modal próprio (não depende de gdiModal que escapa o conteúdo)
    document.querySelectorAll('.gdi-resumo-modal').forEach(m=>m.remove());
    const overlay=document.createElement('div');
    overlay.className='gdi-resumo-modal';
    overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(4px);z-index:100002;display:flex;align-items:center;justify-content:center;padding:20px;animation:gdi-modal-fade .2s ease;';
    const html=U.renderMd(markdownText);
    overlay.innerHTML=`<div style="background:var(--ferreto-bg-2,#0d1119);border:1px solid var(--ferreto-border,#21262d);border-radius:14px;max-width:780px;width:100%;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.6);">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--ferreto-border,#21262d);gap:10px;">
        <b style="color:var(--ferreto-text,#f0f6fc);font-size:15px;font-family:var(--ferreto-font-display,'Poppins',sans-serif);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;">${U.esc(lesson)}</b>
        <button class="gdi-resumo-x" style="background:transparent;border:0;color:var(--ferreto-text-muted,#8b949e);cursor:pointer;font-size:18px;padding:4px 8px;border-radius:6px;flex:none;">✕</button>
      </div>
      <div class="gdi-resumo-content" style="padding:20px;overflow-y:auto;color:var(--ferreto-text,#e6edf3);font-size:14px;line-height:1.65;">${html}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;padding:10px 18px;border-top:1px solid var(--ferreto-border,#21262d);flex-wrap:wrap;">
        <button class="gdi-resumo-pdf gdi-mode-btn" style="font-size:13px;"><i class="bi bi-download"></i> Baixar PDF</button>
        <button class="gdi-resumo-close gdi-mode-btn" style="font-size:13px;">Fechar</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    if(!document.getElementById('gdi-resumo-modal-style')){
      const st=document.createElement('style');st.id='gdi-resumo-modal-style';
      st.textContent='.gdi-resumo-modal .gdi-resumo-content h1,.gdi-resumo-modal .gdi-resumo-content h2,.gdi-resumo-modal .gdi-resumo-content h3{color:var(--ferreto-text,#f0f6fc);margin-top:18px;}.gdi-resumo-modal .gdi-resumo-content h1{font-size:20px;}.gdi-resumo-modal .gdi-resumo-content h2{font-size:17px;border-left:3px solid #ff8b9f;padding-left:10px;}.gdi-resumo-modal .gdi-resumo-content h3{font-size:14px;}.gdi-resumo-modal .gdi-resumo-content code{background:rgba(255,255,255,.08);padding:2px 6px;border-radius:3px;font-family:Courier New,monospace;font-size:12px;}.gdi-resumo-modal .gdi-resumo-content pre{background:rgba(255,255,255,.06);padding:12px;border-radius:6px;overflow-x:auto;}.gdi-resumo-modal .gdi-resumo-content blockquote{border-left:3px solid #ff8b9f;margin:10px 0;padding:4px 14px;color:var(--ferreto-text-muted,#9aa4b8);font-style:italic;}.gdi-resumo-modal .gdi-resumo-content a{color:#5ddeda;}';
      document.head.appendChild(st);
    }
    // ★ v80-FIX-MEGGY BUG 6: define escHandler BEFORE close so close() can
    //    remove it. Previously, close() only removed the overlay — clicking
    //    X or backdrop left escHandler attached to document forever.
    const escHandler=(e)=>{if(e.key==='Escape')close();};
    const close=()=>{
      document.removeEventListener('keydown',escHandler);
      overlay.remove();
    };
    overlay.querySelector('.gdi-resumo-x').onclick=close;
    overlay.querySelector('.gdi-resumo-close').onclick=close;
    overlay.querySelector('.gdi-resumo-pdf').onclick=()=>window.__gdiMeggy.cache.downloadAsPdf(lesson,markdownText);
    overlay.onclick=(e)=>{if(e.target===overlay)close();};
    document.addEventListener('keydown',escHandler);
  }

  // ★ FIX 4 (Task 23): renderResumos agora é ASYNC e lê resumos de DUAS fontes:
  //   1) localStorage (listIsaSummaries) — rápido, offline-first
  //   2) Google Drive (.meggy.ai/resumos/) via GDIStorage.listMaterials
  // Antes só lia localStorage — então resumos gerados pelo batalhão em outro
  // dispositivo (ou após limpar localStorage) não apareciam. Agora mergeia os
  // dois, dedup por lesson+date, e mostra um badge "Drive" nos itens que só
  // existem no Drive. O conteúdo dos itens do Drive é lazy-loaded (fetch do
  // downloadUrl) apenas quando o aluno clica em "Ver" ou "PDF" — não baixa
  // todos os resumos de uma vez (seria pesado).
  async function renderResumos(bodyEl){
    if(!bodyEl)return;
    // Loading state imediato (a chamada ao Drive pode levar 1-2s)
    bodyEl.innerHTML='<div class="gdi-empty-state" style="padding:40px 20px;"><div class="gdi-spinner" style="margin:0 auto 12px;width:32px;height:32px;border:3px solid var(--ferreto-surface-3,rgba(255,255,255,.08));border-top-color:var(--ferreto-primary,#ff8b9f);border-radius:50%;animation:gdi-scan-spin 1s linear infinite;"></div><p style="color:var(--ferreto-text-muted,#8b949e);font-size:13px;margin:0;">Carregando resumos…</p></div>';

    // 1) localStorage resumos (rápido, síncrono)
    const localSummaries = window.gdiIsaPdf ? window.gdiIsaPdf.listIsaSummaries() : [];

    // 2) Drive resumos (.meggy.ai/resumos/) — best-effort, não bloqueia
    let driveSummaries = [];
    try{
      if(window.GDIStorage && typeof window.GDIStorage.listMaterials==='function'){
        const items = await window.GDIStorage.listMaterials('resumos', '');
        if(Array.isArray(items)){
          driveSummaries = items
            .filter(it => it && it.id && it.name)
            .map(it => {
              // Nome do arquivo no Drive: <safeLesson>_<safePdf>_<timestamp>.md
              // safeLesson/safePdf substituíram [^a-zA-Z0-9_-] por _. Reconstrói
              // um nome legível trocando _ por espaço e removendo .md.
              let displayName = String(it.name||'').replace(/\.md$/i,'').replace(/\.json$/i,'');
              // Heurística: remove o sufixo de timestamp (digits no final)
              displayName = displayName.replace(/_\d{10,}$/, '').replace(/_/g, ' ').trim();
              if(displayName.length>200)displayName=displayName.slice(0,200);
              return {
                id: 'drive-'+it.id,
                lesson: displayName || 'Resumo do Drive',
                summary: '',  // lazy-loaded on click
                path: '',
                subject: 'Drive',
                date: it.modified ? new Date(it.modified).getTime() : (it.id?0:Date.now()),
                _drive: true,
                _downloadUrl: it.downloadUrl,
                _fileId: it.id
              };
            });
        }
      }
    }catch(_){ /* Drive indisponível — segue só com localStorage */ }

    // 3) Merge: localStorage primeiro (tem prioridade — conteúdo já carregado),
    //    depois Drive (dedup por lesson name case-insensitive)
    const seenLesson = new Set();
    const all = [];
    for(const r of localSummaries){
      if(!r)continue;
      const k = String(r.lesson||'').toLowerCase();
      if(!seenLesson.has(k)){
        seenLesson.add(k);
        all.push(r);
      }
    }
    for(const r of driveSummaries){
      if(!r)continue;
      const k = String(r.lesson||'').toLowerCase();
      if(!seenLesson.has(k)){
        seenLesson.add(k);
        all.push(r);
      }
    }

    // 4) Sort por data decrescente
    all.sort((a,b)=>(b.date||0)-(a.date||0));

    if(!all.length){
      bodyEl.innerHTML='<div class="gdi-empty-state"><span class="gdi-empty-state-icon">📋</span><h3>Nenhum resumo ainda</h3><p>Gere resumos assistindo às aulas e clicando no botão "Resumo" no painel de materiais.</p></div>';
      return;
    }

    // 5) Agrupa por matéria (subject)
    const bySubject = {};
    all.forEach(r=>{
      const s = r.subject || 'Geral';
      if(!bySubject[s])bySubject[s]=[];
      bySubject[s].push(r);
    });
    let html='<div class="gdi-resumos-list" style="display:flex;flex-direction:column;gap:18px;">';
    for(const subject in bySubject){
      html+=`<div class="gdi-resumos-group"><h3 style="color:var(--ferreto-text,#f0f6fc);font-family:var(--ferreto-font-display,'Poppins',sans-serif);font-size:14px;font-weight:600;margin:0 0 8px;display:flex;align-items:center;gap:6px;"><i class="bi bi-folder2-open" style="color:#5ddeda;"></i> ${U.esc(subject)}${subject==='Drive'?'<span style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;font-weight:400;">(salvos no Google Drive)</span>':''}</h3>`;
      html+='<div style="display:flex;flex-direction:column;gap:8px;">';
      bySubject[subject].forEach(r=>{
        const preview = String(r.summary||'').slice(0,150).replace(/[#*`]/g,'').replace(/\n/g,' ');
        const date = r.date ? new Date(r.date).toLocaleDateString('pt-BR') : '';
        const driveBadge = r._drive ? '<span style="color:#5ddeda;font-size:10px;margin-left:6px;flex:none;"><i class="bi bi-cloud-fill"></i> Drive</span>' : '';
        const previewHtml = r._drive
          ? '<i style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;font-style:italic;">Resumo salvo no Drive — clique em "Ver" para carregar o conteúdo.</i>'
          : U.esc(preview)+(r.summary && r.summary.length>150?'…':'');
        html+=`<div class="gdi-resumo-card" data-id="${U.esc(r.id)}" style="background:var(--ferreto-surface-2,rgba(255,255,255,.05));border:1px solid var(--ferreto-border,#21262d);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
            <span style="color:var(--ferreto-text,#f0f6fc);font-weight:600;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;">${U.esc(r.lesson||'Aula')}${driveBadge}</span>
            <span style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;flex:none;">${date}</span>
          </div>
          <div style="color:var(--ferreto-text-muted,#8b949e);font-size:12.5px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${previewHtml}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="gdi-btn gdi-btn-ghost gdi-resumo-view" data-id="${U.esc(r.id)}" style="font-size:12px;padding:5px 10px;"><i class="bi bi-eye"></i> Ver</button>
            <button class="gdi-btn gdi-btn-ghost gdi-resumo-pdf" data-id="${U.esc(r.id)}" style="font-size:12px;padding:5px 10px;"><i class="bi bi-download"></i> PDF</button>
            ${!r._drive?`<button class="gdi-btn gdi-btn-ghost gdi-resumo-del" data-id="${U.esc(r.id)}" style="font-size:12px;padding:5px 10px;color:#ff6b6b;" title="Deletar"><i class="bi bi-trash"></i></button>`:''}
          </div>
        </div>`;
      });
      html+='</div></div>';
    }
    html+='</div>';
    bodyEl.innerHTML=html;

    // 6) Helper: lazy-load conteúdo do Drive
    const loadDriveContent = async (r) => {
      if(!r || !r._drive)return r ? r.summary : '';
      if(r.summary)return r.summary;  // já carregado (cacheado nesta sessão)
      try{
        const resp = await fetch(r._downloadUrl);
        if(!resp.ok)throw new Error('HTTP '+resp.status);
        const text = await resp.text();
        r.summary = text;  // cacheia no objeto
        return text;
      }catch(e){
        throw new Error('Não foi possível carregar do Drive: '+e.message);
      }
    };

    // 7) Wiring dos botões
    bodyEl.querySelectorAll('.gdi-resumo-view').forEach(b=>b.onclick=async (ev)=>{
      const r=all.find(x=>x.id===b.dataset.id);
      if(!r)return;
      // Feedback visual no botão enquanto carrega do Drive
      const orig = b.innerHTML;
      if(r._drive){
        b.disabled=true;
        b.innerHTML='<i class="bi bi-hourglass-split"></i> Carregando…';
      }
      try{
        const content = r._drive ? await loadDriveContent(r) : r.summary;
        if(content){
          _summaryModal(r.lesson, content);
        }else{
          showToast('Resumo vazio');
        }
      }catch(e){
        showToast(e.message||'Erro ao carregar resumo');
      }finally{
        if(r._drive){b.disabled=false;b.innerHTML=orig;}
      }
    });
    bodyEl.querySelectorAll('.gdi-resumo-pdf').forEach(b=>b.onclick=async (ev)=>{
      const r=all.find(x=>x.id===b.dataset.id);
      if(!r)return;
      const orig = b.innerHTML;
      if(r._drive){
        b.disabled=true;
        b.innerHTML='<i class="bi bi-hourglass-split"></i> Carregando…';
      }
      try{
        const content = r._drive ? await loadDriveContent(r) : r.summary;
        if(content && window.gdiIsaPdf && window.gdiIsaPdf.downloadAsPdf){
          window.gdiIsaPdf.downloadAsPdf(r.lesson, content);
        }else if(!content){
          showToast('Resumo vazio');
        }else{
          showToast('downloadAsPdf indisponível');
        }
      }catch(e){
        showToast(e.message||'Erro ao carregar resumo');
      }finally{
        if(r._drive){b.disabled=false;b.innerHTML=orig;}
      }
    });
    bodyEl.querySelectorAll('.gdi-resumo-del').forEach(b=>b.onclick=async ()=>{
      // Só localStorage resumos têm botão deletar (Drive items não têm .gdi-resumo-del)
      if(!window.gdiModal){
        if(!confirm('Deletar este resumo?'))return;
      } else {
        const ok=await window.gdiModal({title:'Deletar resumo',message:'Tem certeza que deseja deletar este resumo? Esta ação não pode ser desfeita.',confirmText:'Deletar',cancelText:'Cancelar',danger:true});
        if(!ok)return;
      }
      if(window.gdiIsaPdf && window.gdiIsaPdf.delIsaSummary){
        window.gdiIsaPdf.delIsaSummary(b.dataset.id);
        window.renderResumos(bodyEl);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // CRÍTICO: gdiIsaPdf assembly via Object.assign (NUNCA reassign).
  // Preserva o monkey-patch que gdi-worker-bridge.js faz em extractPdfText.
  // Cada método é um wrapper arrow que re-resolve via window.__gdiMeggy.* em
  // call-time — tolerante a ordem de carga.
  // ═══════════════════════════════════════════════════════════════
  Object.assign(window.gdiIsaPdf || (window.gdiIsaPdf = {}), {
    summary:            function() { return window.__gdiMeggy.summaries.summary.apply(this, arguments); },
    questions:          function() { return window.__gdiMeggy.questions.questions.apply(this, arguments); },
    mindmap:            function() { return window.__gdiMeggy.summaries.mindmap.apply(this, arguments); },
    flashcards:         function() { return window.__gdiMeggy.flashcards.flashcards.apply(this, arguments); },
    regenerate:         function() { return window.__gdiMeggy.cache.regenerate.apply(this, arguments); },
    extractPdfText:     function() { return window.__gdiMeggy.pdf.extractPdfText.apply(this, arguments); },
    saveIsaSummary:     function() { return window.__gdiMeggy.cache.saveIsaSummary.apply(this, arguments); },
    listIsaSummaries:   function() { return window.__gdiMeggy.cache.listIsaSummaries.apply(this, arguments); },
    delIsaSummary:      function() { return window.__gdiMeggy.cache.delIsaSummary.apply(this, arguments); },
    downloadAsPdf:      function() { return window.__gdiMeggy.cache.downloadAsPdf.apply(this, arguments); },
    fetchSharedQuestions: function() { return window.__gdiMeggy.summaries.fetchSharedQuestions.apply(this, arguments); },
    fetchSharedSummaries: function() { return window.__gdiMeggy.summaries.fetchSharedSummaries.apply(this, arguments); },
    saveSharedSummary:  function() { return window.__gdiMeggy.summaries.saveSharedSummary.apply(this, arguments); },
    saveEssayMD:        function() { return window.__gdiMeggy.summaries.saveEssayMD.apply(this, arguments); },
    startBattalion:     function() { return window.__gdiMeggy.summaries.startBattalion.apply(this, arguments); },
    getBattalionStatus: function() { return window.__gdiMeggy.summaries.getBattalionStatus.apply(this, arguments); }
  });

  // ── Namespace exports ──
  window.__gdiMeggy.summaries = {
    summary, mindmap,
    renderSummaryCard,
    _summaryModal,
    renderResumos,
    fetchSharedQuestions, saveEssayMD,
    startBattalion, getBattalionStatus,
    saveSharedSummary, fetchSharedSummaries
  };

  // ── Aliases para compatibilidade (código externo espera estas globais) ──
  // renderResumos — chamado por gdi-study.js:1427
  window.renderResumos = function() { return renderResumos.apply(this, arguments); };

  console.log('[GDI Extras] meggy-summaries ativo (Module 6/7) — gdiIsaPdf assembled via Object.assign');
})();
