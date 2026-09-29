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
//     startBattalion, getBattalionStatus, saveSharedSummary, fetchSharedSummaries,
//     saveSummaryToLessonFolder, loadSummaryFromLessonFolder }
//   • window.gdiIsaPdf  (18 methods assembled from all modules — late-bind via
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
        // ★ FIX-MEGGY #10 (Agent 7 Bug 7-5): regenerate returns a Promise;
        //   attach .catch so a failure surfaces as a toast instead of an
        //   unhandled rejection (which would silently swallow the error).
        try{
          const p = window.gdiIsaPdf.regenerate(matTabs.__items,bodyEl,lesson);
          if(p && typeof p.catch==='function') p.catch(e=>showToast('Erro: '+(e&&e.message||e)));
        }catch(e){ showToast('Erro: '+(e&&e.message||e)); }
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
      const _resultEl = bodyEl.querySelector('.gdi-mat-isa-result');
      if(_resultEl) _resultEl.insertBefore(badge, _resultEl.firstChild);
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
        const _resultEl = bodyEl.querySelector('.gdi-mat-isa-result');
        if(_resultEl) _resultEl.insertBefore(badge, _resultEl.firstChild);
      }
      showToast('Pílulas geradas!');
    }catch(e){U.setError(bodyEl,e.message);return;}
  }

  // ── Buscar questões compartilhadas por outros alunos da mesma matéria ──
  // ★ usado pelo Simulado (gdi-study.js) para enriquecer o banco
  async function fetchSharedQuestions(subjectFilter){
    try{
      const url='/api/ai/shared-flashcards?kind=question'+(subjectFilter?'&subject='+encodeURIComponent(subjectFilter):'');
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
      const ok = !!(d&&d.ok);
      // ★ Fix 10 (Task 20-8): surface failures as a toast so the user knows
      //   their corrected redação wasn't saved. Previously this returned false
      //   silently — callers couldn't tell network failure from a server
      //   rejection, so the user would close the tab thinking it was saved.
      if(!ok && typeof showToast === 'function'){
        showToast('Não foi possível salvar a redação: '+(d&&d.error||'erro do servidor'));
      }
      return ok;
    }catch(e){
      // ★ Fix 10: same toast for network errors (fetch threw).
      if(typeof showToast === 'function'){
        showToast('Não foi possível salvar a redação: '+(e&&e.message||'erro de rede'));
      }
      return false;
    }
  }

  // ── Batalhão: dispara processamento em background via worker ──
  // ★ chamado quando aluno adiciona um curso na Central de Estudos
  // ★ Fix 11 (Task 20-8): module-level flag prevents double-start. If the
  //   user double-clicks "Add course" or the caller retries while a previous
  //   battalion POST is still in flight, the worker would enqueue the same
  //   course twice and generate duplicate summaries/questions. The flag is
  //   keyed by courseKey so different courses can still run in parallel.
  const _battalionRunning = new Set();
  async function startBattalion(courseKey, coursePath, lessonName, pdfList){
    if(!courseKey) return false;
    if(_battalionRunning.has(courseKey)){
      console.info('[Meggy] startBattalion already running for courseKey='+courseKey+' — skipping');
      return false;
    }
    _battalionRunning.add(courseKey);
    try{
      const body={courseKey, coursePath, lessonName, pdfs:pdfList.map(p=>({name:p.name||'',url:p.url||'',text:p.text||''}))};
      const r=await fetch('/api/ai/battalion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const d=await r.json();
      return !!(d&&d.ok);
    }catch(_){return false;}
    finally {
      _battalionRunning.delete(courseKey);
    }
  }
  // ── Verifica se o batalhão já processou um curso ──
  async function getBattalionStatus(courseKey){
    try{
      const r=await fetch('/api/ai/battalion/status?courseKey='+encodeURIComponent(courseKey),{cache:'no-store'});
      const d=await r.json();
      // ★ Fix 12 (Task 20-8): differentiate network errors from "not
      //   processed yet" — both previously returned {ok:false,processed:false}.
      //   Callers can now check `reason==='network'` to retry vs. show a
      //   "Generate materials" CTA when reason==='not_processed'.
      // ★ EXEC-5: normalize `reason` on the success path too — if the worker
      //   returned {ok:false,processed:false} without a reason, tag it as
      //   'not_processed' so callers don't need a defensive
      //   `if(!d.reason) d.reason='not_processed'` of their own. Network
      //   errors still arrive via the catch block with reason:'network'.
      if(d && !d.ok && !d.processed && !d.reason){
        d.reason = 'not_processed';
      }
      return d;
    }catch(e){
      return {ok:false, processed:false, reason:'network', error:e&&e.message||'network error'};
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ★ TASK 7 (Scanner Distribuído) — folder-first save/load helpers.
  // The worker exposes two new endpoints (implemented by Agent 1):
  //   POST /api/materials/save-in-folder
  //        body: { lessonPath, materialType, fileName, content }
  //        returns: { ok:true, file:"..." } | { ok:false, error:"..." }
  //   GET  /api/materials/load-from-folder?lessonPath=...&materialType=...&fileName=...
  //        returns: { ok:true, content:"..." } | { ok:false, reason:"not_found" }
  //
  // For summaries: lessonPath is the LESSON file path (e.g.
  //   "/11:/TJ SP Escrevente/Módulo 1/Português/Aula 1.pdf"); the worker
  //   resolves the lesson's parent folder and writes <fileName> there
  //   (inside a `.gdi-resumos/` subfolder), and also registers the
  //   material in `.gdi-lessons.json` of that folder.
  //
  // All helpers below are best-effort: any failure (endpoint missing,
  // drive read-only, network error) returns {ok:false, reason} and the
  // caller falls back to the legacy centralized save/load.
  // ═══════════════════════════════════════════════════════════════

  // Best-effort: derive a Drive lesson path from the current URL.
  // Returns "" when not on a lesson page (so the caller can skip
  // folder-first and use the legacy flow).
  function _deriveLessonPath(){
    try{
      const p = window.location.pathname || '';
      // Lesson URLs look like "/11:/TJ SP Escrevente/Módulo 1/Português/Aula 1.pdf"
      if(/^\/\d+:\//.test(p) && p.length > 4) return p;
    }catch(_){}
    return '';
  }

  // Best-effort: current username (for per-user file names like
  // "<username>_Aula 1.md"). Falls back to "meggy" when unavailable.
  function _currentUsername(){
    try{
      const u = window.__gdiUser || window.gdiUser;
      if(u && (u.name || u.username || u.email)){
        return String(u.name || u.username || u.email).split('@')[0];
      }
      const raw = window.localStorage && window.localStorage.getItem('gdi-user');
      if(raw){
        const j = JSON.parse(raw);
        if(j && (j.name || j.username || j.email)){
          return String(j.name || j.username || j.email).split('@')[0];
        }
      }
    }catch(_){}
    return 'meggy';
  }

  // Sanitize a string into a safe Drive file-name fragment.
  function _safeFileFragment(s){
    return String(s||'').replace(/[/\\?%*:|"<>]/g, '_').trim().slice(0, 120) || 'aula';
  }

  // Save summary MD to lesson folder via new worker endpoint.
  // Falls back gracefully on any failure.
  async function saveSummaryToLessonFolder(lessonPath, lessonName, content, username){
    if(!lessonPath || !content) return {ok:false, reason:'invalid'};
    try{
      const r = await fetch('/api/materials/save-in-folder', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          lessonPath,
          materialType:'resumo',
          fileName: `${_safeFileFragment(username||_currentUsername())}_${_safeFileFragment(lessonName||'Aula')}.md`,
          content: String(content)
        })
      });
      if(!r.ok) return {ok:false, reason:'http_'+r.status};
      const d = await r.json();
      if(d && d.ok) return {ok:true, mode:'folder', file:d.file||null};
      return {ok:false, reason:(d && d.error) || 'unknown'};
    }catch(e){
      // ★ EXEC-5: log so failures aren't completely silent — mirrors
      //   loadQuestionsFromDisciplineFolder's catch in meggy-questions.js.
      //   The caller (saveSharedSummary) treats this as best-effort and
      //   falls back to the legacy centralized pool, but a missing
      //   console.warn here would hide a misconfigured Drive folder or a
      //   network blip from dev tools.
      console.warn('[Meggy] saveSummaryToLessonFolder failed:', e && e.message || e);
      return {ok:false, reason:'network', error:e && e.message || String(e)};
    }
  }

  // Load summary MD from lesson folder via new worker endpoint.
  // Returns {ok:true, content:"..."} or {ok:false, reason:"not_found"|"network"|...}.
  async function loadSummaryFromLessonFolder(lessonPath, lessonName, username){
    if(!lessonPath) return {ok:false, reason:'invalid'};
    try{
      const fileName = `${_safeFileFragment(username||_currentUsername())}_${_safeFileFragment(lessonName||'Aula')}.md`;
      const url = '/api/materials/load-from-folder'
        + '?lessonPath=' + encodeURIComponent(lessonPath)
        + '&materialType=' + encodeURIComponent('resumo')
        + '&fileName=' + encodeURIComponent(fileName);
      const r = await fetch(url, {cache:'no-store'});
      if(!r.ok){
        // 404 = endpoint not yet deployed OR file not found — caller falls back.
        return {ok:false, reason: r.status===404 ? 'not_found' : ('http_'+r.status)};
      }
      const d = await r.json();
      if(d && d.ok && typeof d.content === 'string') return {ok:true, content:d.content, file:d.file||null};
      return {ok:false, reason:(d && d.reason) || (d && d.error) || 'unknown'};
    }catch(e){
      // ★ EXEC-5: same parity log as saveSummaryToLessonFolder above and
      //   loadQuestionsFromDisciplineFolder in meggy-questions.js — without
      //   this, a transient network failure mid-fetch would be invisible.
      console.warn('[Meggy] loadSummaryFromLessonFolder failed:', e && e.message || e);
      return {ok:false, reason:'network', error:e && e.message || String(e)};
    }
  }

  // ── Salvar resumo no pool compartilhado (todos os usuários) ──
  // ★ TASK 7: try lesson folder FIRST (distributed). On failure, fall back
  //    to legacy centralized shared-summaries endpoint. Either way, the
  //    public signature `(lessonName, summary, questions)` is preserved.
  async function saveSharedSummary(lessonName, summary, questions){
    if(!summary) return;
    // 1) Try folder-first (distributed approach — Section 9.1 of the spec).
    const lessonPath = _deriveLessonPath();
    if(lessonPath){
      const folderRes = await saveSummaryToLessonFolder(lessonPath, lessonName, summary, _currentUsername());
      if(folderRes.ok){
        // Best-effort: also push to legacy shared pool so older clients
        // (which don't yet know about /api/materials/*) can still see it.
        try{
          await fetch('/api/ai/shared-summaries',{method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({lessonName,summary,questions:questions||null})});
        }catch(_){/* legacy pool is best-effort */}
        return;
      }
      console.warn('[Meggy] saveSummaryToLessonFolder failed ('+folderRes.reason+') — falling back to legacy shared-summaries pool');
    }
    // 2) Legacy fallback: centralized shared-summaries endpoint.
    try{
      await fetch('/api/ai/shared-summaries',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({lessonName,summary,questions:questions||null})});
    }catch(_){/* não bloqueia */}
  }

  // ── Buscar resumos compartilhados de outros usuários ──
  // ★ TASK 7: when lessonFilter matches the current lesson URL, try
  //    reading the summary from the lesson folder FIRST (so that
  //    student B opening a lesson sees student A's folder-saved
  //    summary without regeneration). Falls back to legacy pool.
  async function fetchSharedSummaries(lessonFilter){
    // 1) Folder-first: only when we're on the lesson page AND the
    //    filter matches the current lesson basename.
    try{
      const lessonPath = _deriveLessonPath();
      if(lessonPath && lessonFilter){
        const base = lessonPath.split('/').filter(Boolean).pop() || '';
        const baseNoExt = String(base).replace(/\.[a-z0-9]+$/i,'').trim();
        const filt = String(lessonFilter);
        if(baseNoExt && (filt.includes(baseNoExt) || baseNoExt.includes(filt))){
          const folderRes = await loadSummaryFromLessonFolder(lessonPath, baseNoExt, _currentUsername());
          if(folderRes.ok && folderRes.content){
            return [{
              lesson: lessonFilter,
              summary: folderRes.content,
              questions: null,
              date: Date.now(),
              source: 'folder',
              _folder: true
            }];
          }
          // reason === 'not_found' || 'http_404' → fall through to legacy
        }
      }
    }catch(_){ /* fall through to legacy */ }
    // 2) Legacy fallback: centralized shared-summaries endpoint.
    try{
      const url='/api/ai/shared-summaries'+(lessonFilter?'?lesson='+encodeURIComponent(lessonFilter):'');
      const r=await fetch(url,{cache:'no-store'});
      const d=await r.json();
      return (d&&d.ok&&Array.isArray(d.summaries))?d.summaries:[];
    }catch(_){return [];}
  }

  function _summaryModal(lesson, markdownText){
    // modal próprio (não depende de gdiModal que escapa o conteúdo)
    // ★ FIX-MEGGY #8 (Agent 16 UIUX-3): when removing old modals, also remove
    //   their escHandler (stored on the overlay as _escHandler) — otherwise
    //   each replacement modal leaks its keydown listener on document.
    document.querySelectorAll('.gdi-resumo-modal').forEach(m=>{
      if(m._escHandler){
        try{ document.removeEventListener('keydown', m._escHandler); }catch(_){}
      }
      m.remove();
    });
    const overlay=document.createElement('div');
    overlay.className='gdi-resumo-modal';
    // ★ Fix 8 (Task 20-8): use a HIGHER z-index than gdiModal (100002) so
    //   this modal can stack on top when called from inside another modal
    //   (e.g. opening a summary preview from the Resumos tab, which is
    //   itself rendered inside a gdiModal). Compute dynamically: start at
    //   100010 (above gdiModal's 100002) and stack +1 above any other open
    //   modal we find in the DOM (.gdi-resumo-modal, .gdi-modal-overlay,
    //   generic [data-gdi-modal]). The cleanup at the top already removed
    //   existing .gdi-resumo-modal, so this mainly catches gdiModal itself.
    let _z = 100010;
    try {
      document.querySelectorAll('.gdi-resumo-modal, .gdi-modal-overlay, .gdi-modal, [data-gdi-modal]').forEach(m => {
        const z = parseInt(m.style && m.style.zIndex, 10);
        if(!isNaN(z) && z >= _z) _z = z + 1;
      });
    } catch(_){ /* fall back to 100010 */ }
    overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(4px);z-index:'+_z+';display:flex;align-items:center;justify-content:center;padding:20px;animation:gdi-modal-fade .2s ease;';
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
    // ★ FIX-MEGGY #8 (Agent 16 UIUX-3): also store escHandler on the overlay
    //    so that a replacement modal can remove it (see cleanup at top).
    const escHandler=(e)=>{if(e.key==='Escape')close();};
    overlay._escHandler = escHandler;
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
    // ★ FIX-MEGGY #9 (Agent 5 R7): generation token — abort early if the user
    //   switched tabs (or triggered a re-render) while we were awaiting Drive
    //   fetches. Without this, the stale render overwrites the newer tab's
    //   body with the old Resumos list.
    const __gen = (bodyEl.__renderGen = (bodyEl.__renderGen||0) + 1);
    const isStale = () => bodyEl.__renderGen !== __gen;
    // Loading state imediato (a chamada ao Drive pode levar 1-2s)
    bodyEl.innerHTML='<div class="gdi-empty-state" style="padding:40px 20px;"><div class="gdi-spinner" style="margin:0 auto 12px;width:32px;height:32px;border:3px solid var(--ferreto-surface-3,rgba(255,255,255,.08));border-top-color:var(--ferreto-primary,#ff8b9f);border-radius:50%;animation:gdi-scan-spin 1s linear infinite;"></div><p style="color:var(--ferreto-text-muted,#8b949e);font-size:13px;margin:0;">Carregando resumos…</p></div>';

    // 0) ★ TASK 7: folder-first read for the CURRENT lesson (when on a
    //    lesson page). If the worker saved a resumo in the lesson's own
    //    folder (distributed approach — Section 9.1), surface it at the
    //    top of the list with a "pasta da aula" badge so the student
    //    sees it immediately. Best-effort, non-blocking on failure.
    let folderSummary = null;
    try{
      const lessonPath = _deriveLessonPath();
      if(lessonPath){
        const base = lessonPath.split('/').filter(Boolean).pop() || '';
        const baseNoExt = String(base).replace(/\.[a-z0-9]+$/i,'').trim();
        if(baseNoExt){
          const folderRes = await loadSummaryFromLessonFolder(lessonPath, baseNoExt, _currentUsername());
          if(folderRes.ok && folderRes.content){
            folderSummary = {
              id: 'folder-'+baseNoExt+'-'+Date.now(),
              lesson: baseNoExt,
              summary: folderRes.content,
              path: lessonPath,
              subject: 'Pasta da aula',
              date: Date.now(),
              _folder: true
            };
          }
        }
      }
    }catch(_){ /* folder-first read is best-effort */ }
    // ★ CYCLE-10 (Agent 10): also bail when bodyEl was detached from the DOM
    //   while we were awaiting fetches (user closed the panel mid-load).
    //   isStale() only catches re-render races; it doesn't catch the panel-
    //   closed case, which would otherwise write to a detached node (wasted
    //   work + the lazy-load wiring below would query an empty DOM).
    if(isStale() || !bodyEl.isConnected) return;

    // 1) localStorage resumos (rápido, síncrono)
    // ★ Fix 9 (Task 20-8): listIsaSummaries() may return null or a non-array
    //   if the underlying localStorage cache was corrupted; guard so the
    //   for/of below doesn't throw. Also defensively coerce listMaterials'
    //   result (already guarded with Array.isArray below, but reinforced here).
    let localSummaries = [];
    try {
      const ls = window.gdiIsaPdf ? window.gdiIsaPdf.listIsaSummaries() : [];
      if (Array.isArray(ls)) localSummaries = ls;
    } catch(_) { localSummaries = []; }

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
    if(isStale() || !bodyEl.isConnected) return;

    // 3) Merge: folder-first (if found) > localStorage (conteúdo já carregado)
    //    > Drive central pool (dedup por lesson name case-insensitive)
    const seenLesson = new Set();
    const all = [];
    if(folderSummary){
      all.push(folderSummary);
      seenLesson.add(String(folderSummary.lesson||'').toLowerCase());
    }
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
      if(isStale() || !bodyEl.isConnected) return;
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
        const folderBadge = r._folder ? '<span style="color:#3fb950;font-size:10px;margin-left:6px;flex:none;"><i class="bi bi-folder2-open"></i> Pasta da aula</span>' : '';
        const previewHtml = r._drive
          ? '<i style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;font-style:italic;">Resumo salvo no Drive — clique em "Ver" para carregar o conteúdo.</i>'
          : U.esc(preview)+(r.summary && r.summary.length>150?'…':'');
        html+=`<div class="gdi-resumo-card" data-id="${U.esc(r.id)}" style="background:var(--ferreto-surface-2,rgba(255,255,255,.05));border:1px solid var(--ferreto-border,#21262d);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
            <span style="color:var(--ferreto-text,#f0f6fc);font-weight:600;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;">${U.esc(r.lesson||'Aula')}${driveBadge}${folderBadge}</span>
            <span style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;flex:none;">${date}</span>
          </div>
          <div style="color:var(--ferreto-text-muted,#8b949e);font-size:12.5px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${previewHtml}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="gdi-btn gdi-btn-ghost gdi-resumo-view" data-id="${U.esc(r.id)}" style="font-size:12px;padding:5px 10px;"><i class="bi bi-eye"></i> Ver</button>
            <button class="gdi-btn gdi-btn-ghost gdi-resumo-pdf" data-id="${U.esc(r.id)}" style="font-size:12px;padding:5px 10px;"><i class="bi bi-download"></i> PDF</button>
            ${(!r._drive && !r._folder)?`<button class="gdi-btn gdi-btn-ghost gdi-resumo-del" data-id="${U.esc(r.id)}" style="font-size:12px;padding:5px 10px;color:#ff6b6b;" title="Deletar"><i class="bi bi-trash"></i></button>`:''}
          </div>
        </div>`;
      });
      html+='</div></div>';
    }
    html+='</div>';
    // ★ CYCLE-10 (Agent 10): isConnected guard alongside isStale() — see note above.
    if(isStale() || !bodyEl.isConnected) return;  // ★ FIX-MEGGY #9: abort before writing final HTML
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
        // ★ FIX 20-14 #C (Agent 14): delIsaSummary schedules the delete on the
        //   _sumWriteChain promise but the OLD code didn't await it before
        //   calling renderResumos — the re-render read from localStorage while
        //   the delete was still pending, so the deleted item STAYED in the list
        //   (until the next manual refresh). Now we await the chain (it resolves
        //   to the next _sumWriteChain promise) so the LS read in renderResumos
        //   sees the post-delete state. delIsaSummary's own .catch() inside
        //   meggy-cache.js prevents rejection from propagating, but we also
        //   guard here for defensiveness.
        try{
          const delP = window.gdiIsaPdf.delIsaSummary(b.dataset.id);
          if(delP && typeof delP.then === 'function'){
            await delP;
          }
        }catch(e){
          console.warn('[Meggy] delIsaSummary await failed (non-blocking):', e&&e.message||e);
        }
        // ★ FIX-MEGGY #11 (Agent 7 Bug 7-13): renderResumos is async — fire-and-
        //   forget leaves an unhandled rejection if Drive fetch fails. Wrap with
        //   .catch so the error surfaces as a toast instead.
        try{
          const p = window.renderResumos(bodyEl);
          if(p && typeof p.catch==='function') p.catch(e=>showToast('Erro ao recarregar resumos: '+(e&&e.message||e)));
        }catch(e){ showToast('Erro ao recarregar resumos: '+(e&&e.message||e)); }
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
    getBattalionStatus: function() { return window.__gdiMeggy.summaries.getBattalionStatus.apply(this, arguments); },
    // ★ TASK 7: folder-first helpers (Scanner Distribuído — Section 9.1).
    // Additive wrappers; older callers continue to work unchanged.
    saveSummaryToLessonFolder:  function() { return window.__gdiMeggy.summaries.saveSummaryToLessonFolder.apply(this, arguments); },
    loadSummaryFromLessonFolder: function() { return window.__gdiMeggy.summaries.loadSummaryFromLessonFolder.apply(this, arguments); }
  });

  // ── Namespace exports ──
  window.__gdiMeggy.summaries = {
    summary, mindmap,
    renderSummaryCard,
    _summaryModal,
    renderResumos,
    fetchSharedQuestions, saveEssayMD,
    startBattalion, getBattalionStatus,
    saveSharedSummary, fetchSharedSummaries,
    // ★ TASK 7: folder-first helpers (Scanner Distribuído — Section 9.1)
    saveSummaryToLessonFolder,
    loadSummaryFromLessonFolder
  };

  // ── Aliases para compatibilidade (código externo espera estas globais) ──
  // renderResumos — chamado por gdi-study.js:1427
  window.renderResumos = function() { return renderResumos.apply(this, arguments); };

  console.log('[GDI Extras] meggy-summaries ativo (Module 6/7) — gdiIsaPdf assembled via Object.assign');
})();
