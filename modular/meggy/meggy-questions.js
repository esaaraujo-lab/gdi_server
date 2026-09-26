// ═══════════════════════════════════════════════════════════════
// meggy-questions.js — quiz flow + question bank helpers
//
// Module 4 of 7 (modular/meggy/).
// Sourced from gdi-meggy.js M9-ISA IIFE (lines 925-936, 1204-1422).
//
// Exposes:
//   • window.__gdiMeggy.questions = { questions, generateQuestions,
//     startQuizFromBank, runQuizSession, extractQuestionsFromText,
//     getAnsweredIds, markAnswered }
//   • window.__gdiPdfCursor  (legacy round-robin cursor)
//
// Guard: window.__gdiMeggyQuestions
// Depends on: utils (setLoading, setError, realLessonName, callIsa,
//   parseJsonArray, lsGet, esc), pdf-engine (extractPdfText),
//   cache (generateAll, cacheGet, cacheSave, addQBatch)
// ═══════════════════════════════════════════════════════════════
(function(){
  if(window.__gdiMeggyQuestions)return;
  window.__gdiMeggyQuestions=true;

  window.__gdiMeggy = window.__gdiMeggy || {};

  // ── Late-bound namespace shortcuts ──
  const U = window.__gdiMeggy.utils;
  const LQ = U.CONSTS.LQ;
  const ANSWERED_KEY = U.CONSTS.ANSWERED_KEY;

  // Extrai questões que já existem dentro do PDF (lista de exercícios)
  function extractQuestionsFromText(text){
    const questions=[];
    // padrão: "1." ou "1)" seguido de texto até "?"
    const re=/(\d+[\).]\s+)([^?]+\?)/gi;
    let m;
    while((m=re.exec(text))!==null&&questions.length<20){
      const q=m[2].trim();
      if(q.length>20&&q.length<500)questions.push(q);
    }
    return questions;
  }

  // ── Track answered questions (evita repetir) ──
  function getAnsweredIds(){try{return JSON.parse(localStorage.getItem(ANSWERED_KEY)||'[]')}catch(_){return []}}
  function markAnswered(id){const arr=getAnsweredIds();if(!arr.includes(id)){arr.push(id);if(arr.length>500)arr.shift();try{localStorage.setItem(ANSWERED_KEY,JSON.stringify(arr))}catch(_){}}}

  // ── Questions flow: gera tudo em cadeia + abre quiz ──
  async function questions(items,bodyEl,lessonName){
    if(!items||!items.length){U.setError(bodyEl,'Nenhum PDF disponível.');return;}
    const lesson=U.realLessonName(lessonName||items[0].name);
    bodyEl.__items=items;bodyEl.__lesson=lesson;
    U.setLoading(bodyEl,'Meggy está lendo todos os materiais e criando resumo + pílulas + questões…');
    try{
      await window.__gdiMeggy.cache.generateAll(items,lesson,'questions',(p)=>{
        if(p.phase==='extract')U.setLoading(bodyEl,'Extraindo texto: '+p.pdf+'…');
        else if(p.phase==='ocr-init')U.setLoading(bodyEl,'PDF escaneado detectado — iniciando OCR (pode levar alguns minutos)…');
        else if(p.phase==='ocr-page')U.setLoading(bodyEl,'OCR em andamento — página '+p.page+' de '+p.total+(p.progress?(' ('+Math.round(p.progress*100)+'%)'):'')+'…');
        else if(p.phase==='ocr-done')U.setLoading(bodyEl,'OCR concluído ('+p.chars+' caracteres). Gerando questões…');
      });
    }catch(e){U.setError(bodyEl,e.message);return;}
    // carrega questões do cache se existirem (★ PATCH B: batch insert)
    const cached=await window.__gdiMeggy.cache.cacheGet();
    if(cached&&cached.questions&&Array.isArray(cached.questions)&&cached.questions.length){
      const _batch=[];
      cached.questions.forEach(q=>{
        if(q&&q.statement){
          let cleanQ;
          if(q.type==='tf'||(!q.options&&q.correct!==undefined)){
            cleanQ={subject:lesson,type:'tf',statement:String(q.statement),options:['Certo','Errado'],correct:Math.max(0,Math.min(1,Number(q.correct)||0)),explanation:String(q.explanation||''),source:'ISA-PDF'};
          }else if(Array.isArray(q.options)){
            cleanQ={subject:lesson,type:'mc',statement:String(q.statement),options:q.options.map(String),correct:Math.max(0,Math.min(3,Number(q.correct)||0)),explanation:String(q.explanation||''),source:'ISA-PDF'};
          }
          if(cleanQ)_batch.push(cleanQ);
        }
      });
      window.__gdiMeggy.cache.addQBatch(_batch);
    }
    startQuizFromBank(bodyEl,lesson);
  }

  // ── generateQuestions: gera mais questões de um PDF específico (para "Gerar mais 5") ──
  if(!window.__gdiPdfCursor)window.__gdiPdfCursor=0;
  async function generateQuestions(items,bodyEl,lesson){
    if(!items||!items.length)return false;
    const pdfIdx=window.__gdiPdfCursor%items.length;
    window.__gdiPdfCursor++;
    const pdfItem=items[pdfIdx];
    U.setLoading(bodyEl,'Extraindo texto do PDF: '+U.esc(pdfItem.name||'material')+'…');
    let text;
    const extractPdfText = window.__gdiMeggy.pdf.extractPdfText; // late-bind
    try{
      text=await extractPdfText(pdfItem.url);
    }catch(e){
      for(let i=1;i<items.length;i++){
        const next=items[(pdfIdx+i)%items.length];
        try{
          text=await extractPdfText(next.url);
          if(text&&text.trim().length>=50)break;
        }catch(_){}
      }
      if(!text||text.trim().length<50){U.setError(bodyEl,'Falha ao extrair texto.');return false;}
    }
    if(!text||text.trim().length<50){U.setError(bodyEl,'PDF sem texto extraível.');return false;}
    U.setLoading(bodyEl,'Meggy está criando questões…');
    let resp;
    try{
      resp=await U.callIsa('Baseado neste material, gere 5 questões de concurso público em JSON array. Misture:\n- 3 múltipla escolha: {"type":"mc","statement":"...","options":["a","b","c","d"],"correct":0,"explanation":"..."}\n- 2 certo/errado (CEBRASPE): {"type":"tf","statement":"...","correct":1,"explanation":"..."}\nSem comentários, só JSON:\n\n'+text.slice(0,15000));
    }catch(e){U.setError(bodyEl,'Meggy indisponível: '+e.message);return false;}
    let arr;
    try{arr=U.parseJsonArray(resp);}catch(e){U.setError(bodyEl,'Meggy retornou formato inválido: '+e.message);return false;}
    // ★ PATCH B: batch insert (1 read + 1 write)
    const _batchGen=[];
    const cleanArr=[];
    arr.forEach(q=>{
      if(!q||!q.statement)return;
      let cleanQ;
      if(q.type==='tf'||(!q.options&&q.correct!==undefined)){
        cleanQ={subject:lesson,type:'tf',statement:String(q.statement),options:['Certo','Errado'],correct:Math.max(0,Math.min(1,Number(q.correct)||0)),explanation:String(q.explanation||''),source:'ISA-PDF'};
      }else if(Array.isArray(q.options)){
        cleanQ={subject:lesson,type:'mc',statement:String(q.statement),options:q.options.map(String),correct:Math.max(0,Math.min(3,Number(q.correct)||0)),explanation:String(q.explanation||''),source:'ISA-PDF'};
      }
      if(cleanQ){
        _batchGen.push(cleanQ);
        cleanArr.push({type:cleanQ.type,statement:cleanQ.statement,options:cleanQ.options,correct:cleanQ.correct,explanation:cleanQ.explanation});
      }
    });
    window.__gdiMeggy.cache.addQBatch(_batchGen);
    if(cleanArr.length){
      const existing=await window.__gdiMeggy.cache.cacheGet();
      const merged=[...((existing&&existing.questions)||[]),...cleanArr];
      window.__gdiMeggy.cache.cacheSave(existing?.summary||null,merged,lesson);
    }
    showToast(cleanArr.length+' questões geradas!');
    return cleanArr.length>0;
  }

  // ── Inicia quiz com questões do banco (não respondidas) ──
  function startQuizFromBank(bodyEl,lesson){
    const all=U.lsGet(LQ,[]);
    const answered=getAnsweredIds();
    // questões desta matéria que ainda não foram respondidas
    let pending=all.filter(q=>q.subject===lesson&&!answered.includes(q.id));
    // se não tem nenhuma não-respondida, pega todas desta matéria (reinicia ciclo)
    if(pending.length===0){
      pending=all.filter(q=>q.subject===lesson);
      // limpa answered para esta matéria (reinicia)
      const newAnswered=answered.filter(id=>!all.some(q=>q.id===id&&q.subject===lesson));
      try{localStorage.setItem(ANSWERED_KEY,JSON.stringify(newAnswered))}catch(_){}
    }
    if(pending.length===0){
      bodyEl.innerHTML=`<div class="gdi-mat-isa-result" style="text-align:center;padding:30px;">
        <div style="font-size:48px;">📝</div>
        <h3 style="color:var(--ferreto-primary,#ff8b9f);font-family:var(--ferreto-font-display,'Poppins',sans-serif);">Nenhuma questão disponível ainda</h3>
        <p style="color:var(--ferreto-text-muted,#8b949e);font-size:13px;margin-top:8px;">Matéria: <b style="color:var(--ferreto-text,#e6edf3);">${U.esc(lesson)}</b></p>
        <button id="gdi-q-gen-more" class="gdi-btn gdi-btn-primary" style="margin-top:14px;"><i class="bi bi-stars"></i> Gerar 5 questões com Meggy</button>
      </div>`;
      bodyEl.querySelector('#gdi-q-gen-more').onclick=async()=>{
        const ok=await generateQuestions(bodyEl.__items||[],bodyEl,lesson);
        if(ok)startQuizFromBank(bodyEl,lesson);
      };
      return;
    }
    // pega até 5 questões
    const batch=pending.slice(0,5);
    runQuizSession(bodyEl,lesson,batch);
  }

  // ── Roda uma sessão de quiz interativo ──
  function runQuizSession(bodyEl,lesson,queue){
    let idx=0,hits=0,misses=0;
    function draw(){
      if(idx>=queue.length){
        // fim do batch
        const total=queue.length;
        const pct=Math.round(hits/total*100);
        bodyEl.innerHTML=`<div class="gdi-mat-isa-result" style="max-width:760px;text-align:center;">
          <div style="font-size:48px;">${pct>=60?'🎉':'📚'}</div>
          <h3 style="color:var(--ferreto-primary,#ff8b9f);font-family:var(--ferreto-font-display,'Poppins',sans-serif);">Batch concluído!</h3>
          <p style="color:var(--ferreto-text,#e6edf3);font-size:16px;margin-top:8px;"><b style="color:${pct>=60?'#3fb950':'#ff8b8b'};">${hits}/${total}</b> · ${pct}% acerto</p>
          <p style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;">Matéria: ${U.esc(lesson)}</p>
          <div style="display:flex;gap:8px;justify-content:center;margin-top:18px;flex-wrap:wrap;">
            <button id="gdi-q-more" class="gdi-btn gdi-btn-primary"><i class="bi bi-stars"></i> Gerar mais 5 questões</button>
            <button id="gdi-q-next-batch" class="gdi-mode-btn"><i class="bi bi-arrow-right"></i> Próximo batch</button>
          </div>
        </div>`;
        // Gerar mais 5 questões
        bodyEl.querySelector('#gdi-q-more').onclick=async()=>{
          const ok=await generateQuestions(bodyEl.__items||[],bodyEl,lesson);
          if(ok)startQuizFromBank(bodyEl,lesson);
          else startQuizFromBank(bodyEl,lesson); // tenta de novo com o que tem
        };
        // Próximo batch (questões que ainda não foram respondidas)
        bodyEl.querySelector('#gdi-q-next-batch').onclick=()=>startQuizFromBank(bodyEl,lesson);
        return;
      }
      const q=queue[idx];
      const isTF=q.type==='tf';
      const optCount=isTF?2:(q.options?.length||4);
      bodyEl.innerHTML=`<div class="gdi-mat-isa-result" style="max-width:760px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-shrink:0;">
          <span style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;">${U.esc(lesson)} · ${idx+1}/${queue.length}</span>
          <span style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;">✓ ${hits} ✗ ${misses}</span>
        </div>
        <div class="gdi-course" style="margin-bottom:14px;">
          <b style="color:var(--ferreto-secondary,#5ddeda);font-size:11px;display:block;margin-bottom:8px;">${isTF?'CEBRASPE — Certo ou Errado':'Múltipla Escolha'}</b>
          <div style="color:var(--ferreto-text,#f0f6fc);font-size:14px;line-height:1.7;">${U.esc(q.statement)}</div>
        </div>
        <div id="gdi-q-opts" style="display:flex;flex-direction:column;gap:8px;"></div>
        <div id="gdi-q-feedback" style="margin-top:14px;"></div>
        <div style="display:flex;justify-content:flex-end;padding-top:14px;margin-top:10px;border-top:1px solid var(--ferreto-border,#21262d);">
          <button id="gdi-q-skip" title="Pular para próxima questão" style="width:48px;height:48px;border-radius:50%;border:0;cursor:pointer;background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;font-size:20px;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px -4px rgba(255,139,159,.5);transition:transform .15s;"><i class="bi bi-arrow-right"></i></button>
        </div>
      </div>`;
      // ★ seta fixa para pular questão (mesmo sem responder)
      const skipBtn=bodyEl.querySelector('#gdi-q-skip');
      if(skipBtn){
        skipBtn.onmouseenter=()=>{skipBtn.style.transform='scale(1.1)';};
        skipBtn.onmouseleave=()=>{skipBtn.style.transform='scale(1)';};
        skipBtn.onclick=()=>{
          // se ainda não respondeu, marca como errada (pulo = não sabe)
          const feedbackEl=bodyEl.querySelector('#gdi-q-feedback');
          if(feedbackEl&&!feedbackEl.innerHTML){
            misses++;
            markAnswered(q.id);
            if(window.__gdiGradeQ)window.__gdiGradeQ(q.id,false);
          }
          if(idx+1<queue.length){idx++;draw();}
          else{idx++;draw();}  // ★ Sprint 6: simplificado — ambos os ramos fazem o mesmo
        };
      }
      const optsEl=bodyEl.querySelector('#gdi-q-opts');
      const options=q.options||(isTF?['Certo','Errado']:['a','b','c','d']);
      options.forEach((opt,i)=>{
        const b=document.createElement('button');
        b.className='gdi-note';b.style.cursor='pointer';b.style.textAlign='left';
        const letter=isTF?'':String.fromCharCode(65+i)+') ';
        b.innerHTML=`<span style="display:flex;align-items:center;gap:10px;"><b style="color:var(--ferreto-primary,#ff8b9f);">${letter}</b> <span style="color:var(--ferreto-text,#e6edf3);">${U.esc(opt)}</span></span>`;
        b.onclick=()=>{
          const acertou=i===q.correct;
          if(acertou)hits++;else misses++;
          markAnswered(q.id);
          // grade no SRS
          if(window.__gdiGradeQ)window.__gdiGradeQ(q.id,acertou);
          optsEl.querySelectorAll('button').forEach((bb,bi)=>{
            bb.disabled=true;bb.style.cursor='default';bb.style.opacity='.7';
            if(bi===q.correct)bb.style.background='rgba(63,185,80,.18)';
            if(bi===i&&!acertou)bb.style.background='rgba(255,107,107,.18)';
          });
          const fb=bodyEl.querySelector('#gdi-q-feedback');
          fb.innerHTML=`<div class="gdi-course" style="border-left:3px solid ${acertou?'#3fb950':'#ff6b6b'};">
            <b style="color:${acertou?'#3fb950':'#ff6b6b'};">${acertou?'✓ Correto':'✗ Errado'}</b>
            ${q.explanation?`<div style="color:var(--ferreto-text,#e6edf3);font-size:13px;margin-top:6px;line-height:1.5;">${U.esc(q.explanation)}</div>`:''}
          </div>
          <button class="gdi-btn gdi-btn-primary" id="gdi-q-next" style="margin-top:12px;">${idx+1<queue.length?'Próxima →':'Ver resultado'}</button>`;
          fb.querySelector('#gdi-q-next').onclick=()=>{idx++;draw();};
        };
        optsEl.appendChild(b);
      });
    }
    draw();
  }

  // ── Namespace exports ──
  window.__gdiMeggy.questions = {
    questions,
    generateQuestions,
    startQuizFromBank,
    runQuizSession,
    extractQuestionsFromText,
    getAnsweredIds,
    markAnswered
  };

  // ── Aliases para compatibilidade ──
  // window.__gdiPdfCursor já foi definido acima (legacy round-robin cursor)

  console.log('[GDI Extras] meggy-questions ativo (Module 4/7)');
})();
