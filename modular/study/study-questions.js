// ═══════════════════════════════════════════════════════════════
// study-questions.js — Banco de questões, simulado, cronograma SRS, revisões
//
// Split from gdi-study.js (v1.0.86 modularization, Task v86-MOD-STUDY).
// Originally IIFE #1 "M23 — Estudo Ativo" (lines 21-735, ~715 lines).
//
// Namespace: window.__gdiStudy.questions = { renderQuestoes, renderSimulado, renderCronograma, renderRevisoes }
// Aliases:   window.renderQuestoes, window.renderSimulado (preserved for compat)
// Guard:     window.__gdiStudyQuestionsTab (note "QuestionsTab" — avoids clash
//            with window.meggy.questions namespace from gdi-meggy.js)
// Depends on: window.GDIUser (SRS data), /api/ai (ISA question generation),
//             window.playlistVideos, window.__gdiParseJsonArray, window.gdiIsaPdf
//             window.collectCourses (exposed by study-courses.js — used in renderSimulado)
// Load order: 4th study module
//
// FIX while splitting (cross-module comm bug):
//   - renderRadar (study-advanced.js) writes window._qFilterSubject when the
//     user clicks a "mapa de fracos" tile. The closure-private _qFilterSubject
//     in M23 was a SEPARATE variable — the two never connected, so the radar
//     click never actually filtered the questions list. This module now syncs
//     _qFilterSubject FROM window._qFilterSubject at the start of every
//     renderQuestoes call, AND writes the closure value back to window when
//     the user picks a subject pill. (Two 1-line additions.)
// ═══════════════════════════════════════════════════════════════
(function(){
  if(window.__gdiStudyQuestionsTab) return;
  window.__gdiStudyQuestionsTab = true;
  window.__gdiStudy = window.__gdiStudy || {};

  const LQ='gdi-questions-v1',LS_SRS='gdi-q-srs-v1',LS_SIM='gdi-simulados-v1',LS_CRON='gdi-cronograma-v1',LS_ERR='gdi-caderno-erros-v1';
  const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const lsGet=(k,d)=>{try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(_){return d}};
  const lsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}};
  const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
  const fmtDate=ds=>{try{return new Date(ds+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}catch(_){return ds}};
  const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
  // ★ Fisher-Yates shuffle (substitui o biased Math.random()-.5 sort)
  function fisherYates(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

  // ── Banco de questões ──
  const questions=()=>lsGet(LQ,[]);
  const saveQ=q=>lsSet(LQ,q);
  const addQ=obj=>{const q=questions();const item={id:uid(),createdAt:Date.now(),hits:0,misses:0,...obj};q.push(item);saveQ(q);return item;};
  const delQ=id=>saveQ(questions().filter(q=>q.id!==id));
  const getQ=id=>questions().find(q=>q.id===id);

  // ── SRS das questões ( Leitner 5 boxes ) ──
  const qSrs=()=>lsGet(LS_SRS,{});
  const saveQSrs=s=>lsSet(LS_SRS,s);
  const BOX_INTERVALS=[1,3,7,21,60]; // dias
  function gradeQ(id,acertou){
    const s=qSrs();const cur=s[id]||{box:0,due:Date.now()+86400000,last:0};
    if(acertou){cur.box=Math.min(4,cur.box+1);}
    else{cur.box=0;}
    cur.due=Date.now()+BOX_INTERVALS[cur.box]*86400000;
    cur.last=Date.now();
    s[id]=cur;saveQSrs(s);
    // caderno de erros
    if(!acertou){const err=lsGet(LS_ERR,[]);if(!err.includes(id)){err.push(id);lsSet(LS_ERR,err);}}
  }
  const dueQ=()=>questions().filter(q=>{const s=qSrs()[q.id];return !s||s.due<=Date.now();});
  const errQ=()=>{const err=lsGet(LS_ERR,[]);return questions().filter(q=>err.includes(q.id));};

  // ── Simulados ──
  const simus=()=>lsGet(LS_SIM,[]);
  const saveSim=s=>lsSet(LS_SIM,s);

  // ── Aula atual (contexto para gerar questões) ──
  function currentLesson(){
    const t=document.querySelector('.gdi-file-header-name');
    return t?t.textContent.trim():'';
  }

  // ── Gerar questões via ISA (/api/ai) ──
  async function gerarViaISA(tema,n){
    const prompt='Gere '+n+' questões de múltipla escolha (4 alternativas) sobre: "'+tema+'". '+
      'Formato JSON array, cada item: {"statement":"...","options":["a","b","c","d"],"correct":0,"explanation":"..."}. '+
      'correct é o índice 0-3 da alternativa certa. Nível concurso público brasileiro. Sem comentários, só JSON.';
    const r=await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:prompt,messages:[]})});
    const data=await r.json();
    if(!data.ok)throw new Error(data.error||'Meggy indisponível');
    // ★ parsing robusto: usa o helper compartilhado (window.__gdiParseJsonArray)
    const parseFn=window.__gdiParseJsonArray||function(raw){
      let t=String(raw||'').replace(/```(?:json)?\s*/gi,'').replace(/```\s*/g,'');
      const f=t.indexOf('['),l=t.lastIndexOf(']');
      if(f>=0&&l>f)t=t.slice(f,l+1);
      try{return JSON.parse(t);}catch(e){
        const err=new Error('Resposta não é JSON array válido. Primeiros 500 chars: '+String(raw).slice(0,500));
        throw err;
      }
    };
    const arr=parseFn(data.response);
    if(!Array.isArray(arr))throw new Error('Resposta não é array');
    return arr.map(q=>({
      subject:tema,
      statement:String(q.statement||''),
      options:Array.isArray(q.options)?q.options.map(String):[],
      correct:Number(q.correct)||0,
      explanation:String(q.explanation||''),
      source:'ISA'
    }));
  }

  // ── Render: Questões (PAGINADO — PATCH H / C.1) ──
  // PAGE_SIZE=20, botão "Carregar mais (N restantes)" via insertAdjacentHTML.
  let _qFilterSubject=null; // null = todas (closure-private; synced from window._qFilterSubject)
  let _qShown=0;            // quantas questões já estão renderizadas
  const QPAGE=20;
  function renderQuestoes(box){
    // ★ v1.0.86 FIX (radar→questions filter bug): sync closure var from
    // window._qFilterSubject, which is written by renderRadar in
    // study-advanced.js. Without this sync, the closure var was always null
    // when renderQuestoes ran after a radar click — the filter never applied.
    _qFilterSubject = (window._qFilterSubject !== undefined && window._qFilterSubject !== null) ? window._qFilterSubject : null;
    const qs=questions();
    const due=dueQ().length;
    const err=errQ().length;
    // ★ Hero state convidativo quando vazio / poucas questões
    const hero=qs.length<3?`<div class="gdi-dashboard-hero" style="background:linear-gradient(135deg,rgba(255,139,159,.10),rgba(93,222,218,.06));border:1px solid var(--ferreto-border-strong,#30363d);border-radius:16px;padding:24px 22px;margin-bottom:18px;">
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
          <div style="font-size:42px;">📝</div>
          <div style="flex:1;min-width:240px;">
            <h3 style="color:var(--ferreto-text,#f0f6fc);margin:0 0 4px;font-family:var(--ferreto-font-display,'Poppins',sans-serif);font-size:18px;">Comece seu banco de questões</h3>
            <p style="color:var(--ferreto-text-muted,#8b949e);font-size:13px;margin:0;line-height:1.5;">Gere questões a partir das aulas que você assistiu, ou adicione manualmente. A Meggy cria questões comentadas com <b>fundamentação legal</b> e <b>explicação do erro/acerto</b>.</p>
          </div>
          <button id="hero-gen" class="gdi-btn gdi-btn-primary" style="font-size:13px;"><i class="bi bi-stars"></i> Gerar agora</button>
        </div>
      </div>`:'';
    _qShown=0; // reset ao entrar na aba
    box.innerHTML=`
      ${hero}
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px;">
        <b style="color:var(--ferreto-text,#f0f6fc);">${qs.length} questões</b>
        ${due?`<span style="color:var(--ferreto-primary,#ff8b9f);font-size:12px;">${due} p/ revisar hoje</span>`:''}
        ${err?`<span style="color:#ff8b8b;font-size:12px;">${err} no caderno de erros</span>`:''}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
        <button id="gdi-q-resolve-due" class="gdi-btn gdi-btn-primary" style="font-size:12px;" ${due?'':'disabled'}><i class="bi bi-play-fill"></i> Resolver revisões (${due})</button>
        <button id="gdi-q-resolve-err" class="gdi-mode-btn" style="font-size:12px;" ${err?'':'disabled'}><i class="bi bi-x-circle"></i> Caderno de erros (${err})</button>
        <button id="gdi-q-gen" class="gdi-mode-btn" style="font-size:12px;"><i class="bi bi-stars"></i> Gerar com Meggy</button>
        <button id="gdi-q-add" class="gdi-mode-btn" style="font-size:12px;"><i class="bi bi-plus-lg"></i> Adicionar</button>
        <button id="gdi-q-import" class="gdi-mode-btn" style="font-size:12px;"><i class="bi bi-upload"></i> Importar JSON</button>
        <button id="gdi-q-flasherr" class="gdi-mode-btn" style="font-size:12px;" ${err?'':'disabled'} title="Cria flashcards a partir das questões que você errou"><i class="bi bi-card-text"></i> Flashcards das erradas</button>
      </div>
      <div id="gdi-q-subjects" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;max-width:760px;"></div>
      <div id="gdi-q-list" style="display:flex;flex-direction:column;gap:8px;max-width:760px;"></div>
    `;
    // ── Subject filter pills (Task 4) ──
    function drawSubjects(){
      const el=box.querySelector('#gdi-q-subjects');
      if(!el)return;
      const all=questions();
      if(!all.length){el.innerHTML='';return;}
      const map={};
      all.forEach(q=>{const s=q.subject||'—';map[s]=(map[s]||0)+1;});
      const entries=Object.entries(map).sort((a,b)=>b[1]-a[1]);
      let html=`<button class="gdi-mode-btn" data-s="" style="font-size:11px;padding:4px 10px;${_qFilterSubject===null?'background:var(--ferreto-grad);color:#fff;border:0;':''}">Todas (${all.length})</button>`;
      entries.forEach(([s,n])=>{
        const active=_qFilterSubject===s;
        html+=`<button class="gdi-mode-btn" data-s="${esc(s)}" style="font-size:11px;padding:4px 10px;${active?'background:var(--ferreto-grad);color:#fff;border:0;':''}">${esc(s)} (${n})</button>`;
      });
      el.innerHTML=html;
      el.querySelectorAll('button').forEach(b=>b.onclick=()=>{
        _qFilterSubject=b.dataset.s||null;
        if(!_qFilterSubject)_qFilterSubject=null;
        // ★ v1.0.86 FIX: write back to window so radar/other modules see the change
        window._qFilterSubject=_qFilterSubject;
        drawSubjects();
        _qShown=0; // reset paginação ao trocar filtro
        drawList();
      });
    }
    // ★ PAGINAÇÃO: monta linhas em array, insere em lotes de QPAGE
    function drawList(){
      const list=box.querySelector('#gdi-q-list');
      const all=questions();
      if(!all.length){list.innerHTML='<div class="gdi-notes-empty">Nenhuma questão. Clique em "Gerar com Meggy" ou "Adicionar".</div>';return;}
      const filtered=_qFilterSubject?all.filter(q=>(q.subject||'—')===_qFilterSubject):all;
      if(!filtered.length){list.innerHTML='<div class="gdi-notes-empty">Nenhuma questão nesta matéria.</div>';return;}
      const reversed=filtered.slice().reverse();
      // monta HTML de cada linha UMA vez em array
      const rowHtmlFor=q=>{
        const s=qSrs()[q.id];
        const dueNow=!s||s.due<=Date.now();
        return `<div class="gdi-note" data-qid="${esc(q.id)}" style="display:flex;align-items:center;gap:10px;">
          <span style="flex:1;min-width:0;">
            <b style="color:var(--ferreto-text,#f0f6fc);">${esc(q.subject||'—')}</b> <span style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;">· ${q.source||'manual'} · box ${s?s.box:0}</span>
            <div style="color:var(--ferreto-text,#e6edf3);font-size:13px;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(q.statement.slice(0,90))}</div>
          </span>
          <span style="font-size:10px;color:${dueNow?'var(--ferreto-primary,#ff8b9f)':'var(--ferreto-text-muted,#8b949e)'};white-space:nowrap;">${dueNow?'hoje':fmtDate(new Date(s?s.due:Date.now()).toISOString().slice(0,10))}</span>
          <button class="gdi-note-del" data-del="${esc(q.id)}" title="Excluir"><i class="bi bi-x-lg"></i></button>
        </div>`;
      };
      // render inicial: primeiras _qShown (ou QPAGE se _qShown==0)
      const initialCount=Math.min(_qShown||QPAGE,reversed.length);
      _qShown=initialCount;
      let html='';
      for(let i=0;i<initialCount;i++)html+=rowHtmlFor(reversed[i]);
      // botão carregar mais
      if(reversed.length>_qShown){
        html+=`<button id="gdi-q-more" class="gdi-btn gdi-btn-ghost" style="align-self:flex-start;font-size:12px;">Carregar mais (${reversed.length-_qShown} restantes)</button>`;
      }
      list.innerHTML=html;
      // handler deletar (event delegation)
      list.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{
        delQ(b.dataset.del);drawSubjects();_qShown=0;drawList();
      });
      // handler carregar mais — append via insertAdjacentHTML (não re-renderiza tudo)
      const moreBtn=list.querySelector('#gdi-q-more');
      if(moreBtn){
        moreBtn.onclick=()=>{
          const next=reversed.slice(_qShown,_qShown+QPAGE);
          if(!next.length)return;
          // insere antes do botão
          let appendHtml='';
          next.forEach(q=>appendHtml+=rowHtmlFor(q));
          moreBtn.insertAdjacentHTML('beforebegin',appendHtml);
          _qShown+=next.length;
          // rebind deletar nas novas linhas
          list.querySelectorAll('[data-del]').forEach(b=>{if(!b._qBound){b._qBound=true;b.onclick=()=>{delQ(b.dataset.del);drawSubjects();_qShown=0;drawList();};}});
          // atualiza ou remove botão "Carregar mais"
          if(reversed.length>_qShown){
            moreBtn.textContent='Carregar mais ('+(reversed.length-_qShown)+' restantes)';
          }else{
            moreBtn.remove();
          }
        };
      }
    }
    drawSubjects();
    drawList();

    // ★ hero CTA
    const heroBtn=box.querySelector('#hero-gen');
    if(heroBtn)heroBtn.onclick=()=>openGen(box,()=>{_qShown=0;drawList();});
    box.querySelector('#gdi-q-resolve-due').onclick=()=>startSession(box,dueQ(),'Revisões de hoje');
    box.querySelector('#gdi-q-resolve-err').onclick=()=>startSession(box,errQ(),'Caderno de erros');
    box.querySelector('#gdi-q-gen').onclick=()=>openGen(box,()=>{_qShown=0;drawList();});
    box.querySelector('#gdi-q-add').onclick=()=>openAddForm(box,()=>{_qShown=0;drawList();});
    box.querySelector('#gdi-q-import').onclick=()=>openImport(box,()=>{_qShown=0;drawList();});
    // Task 8: Gerar flashcards das questões erradas
    const flashBtn=box.querySelector('#gdi-q-flasherr');
    if(flashBtn)flashBtn.onclick=()=>{
      const errIds=lsGet(LS_ERR,[]);
      const errQs=questions().filter(q=>errIds.includes(q.id));
      if(!errQs.length){showToast('Nenhuma questão errada ainda');return;}
      // usa o mesmo LS_CARDS do M22 ('gdi-cards-v1')
      const LS_FC='gdi-cards-v1';
      const cards=lsGet(LS_FC,[]);
      let n=0,dup=0;
      errQs.forEach(q=>{
        // evita duplicar: verifica se já existe flashcard com o mesmo enunciado
        const front='Q: '+q.statement.slice(0,200);
        const exists=cards.some(c=>c.f===front);
        if(exists){dup++;return;}
        const back='R: '+(q.options[q.correct]||'')+(q.explanation?('\n\n'+q.explanation):'');
        cards.push({id:Date.now()+'-'+Math.random().toString(36).slice(2,7),f:front,b:back,path:q.subject||'',at:Date.now(),box:0,due:Date.now()+86400000});
        n++;
      });
      lsSet(LS_FC,cards);
      if(n)showToast(n+' flashcards criados'+(dup?' ('+dup+' já existiam)':''));
      else showToast('Todos os flashcards já existiam ('+dup+')');
    };
  }

  // ── Sessão de resolução ──
  function startSession(box,queue,titulo){
    if(!queue.length){showToast('Nada para resolver aqui');return;}
    let idx=0,hits=0,misses=0,answers=[];
    const t0=Date.now();
    function draw(){
      if(idx>=queue.length){
        const dur=Math.round((Date.now()-t0)/1000);
        saveSim([...simus(),{id:uid(),date:Date.now(),title:titulo,duration:dur,hits,misses,total:queue.length,answers}]);
        box.innerHTML=`<div style="text-align:center;padding:30px;">
          <div style="font-size:40px;">${hits>=misses?'🎉':'📚'}</div>
          <h3 style="color:var(--ferreto-text,#f0f6fc);">${titulo} concluído!</h3>
          <p style="color:var(--ferreto-text-muted,#8b949e);font-size:13px;">${hits}/${queue.length} corretas · ${misses} erradas · ${Math.floor(dur/60)}min${dur%60?' '+(dur%60)+'s':''}</p>
          <p style="color:var(--ferreto-text,#e6edf3);font-size:14px;margin-top:8px;">Acerto: <b style="color:var(--ferreto-primary,#ff8b9f);">${Math.round(hits/queue.length*100)}%</b></p>
          <button class="gdi-btn gdi-btn-primary" id="gdi-q-back" style="margin-top:14px;"><i class="bi bi-arrow-left"></i> Voltar</button>
        </div>`;
        box.querySelector('#gdi-q-back').onclick=()=>renderQuestoes(box);
        return;
      }
      const q=queue[idx];
      box.innerHTML=`<div style="max-width:760px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <span style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;">${titulo} · ${idx+1}/${queue.length}</span>
          <span style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;">✓ ${hits} ✗ ${misses}</span>
        </div>
        <div class="gdi-course" style="margin-bottom:14px;">
          <b style="color:var(--ferreto-secondary,#7aa2ff);font-size:11px;display:block;margin-bottom:8px;">${esc(q.subject||'')}</b>
          <div style="color:var(--ferreto-text,#f0f6fc);font-size:14px;line-height:1.6;">${esc(q.statement)}</div>
        </div>
        <div id="gdi-q-opts" style="display:flex;flex-direction:column;gap:8px;"></div>
        <div id="gdi-q-feedback" style="margin-top:14px;"></div>
      </div>`;
      const optsEl=box.querySelector('#gdi-q-opts');
      (q.options||[]).forEach((opt,i)=>{
        const b=document.createElement('button');
        b.className='gdi-note';b.style.cursor='pointer';b.style.textAlign='left';
        b.innerHTML=`<span style="display:flex;align-items:center;gap:10px;"><b style="color:var(--ferreto-primary,#ff8b9f);">${String.fromCharCode(65+i)})</b> <span style="color:var(--ferreto-text,#e6edf3);">${esc(opt)}</span></span>`;
        b.onclick=()=>{
          const acertou=i===q.correct;
          if(acertou)hits++;else misses++;
          gradeQ(q.id,acertou);
          answers.push({id:q.id,picked:i,correct:q.correct,acertou});
          // Task 8: errou → cria flashcard automaticamente
          if(!acertou){
            try{
              const LS_FC='gdi-cards-v1';
              const cards=lsGet(LS_FC,[]);
              const front='Q: '+String(q.statement||'').slice(0,200);
              // evita duplicar flashcard para a mesma questão
              if(!cards.some(c=>c.f===front)){
                const back='R: '+(q.options[q.correct]||'')+(q.explanation?('\n\n'+q.explanation):'');
                cards.push({id:Date.now()+'-'+Math.random().toString(36).slice(2,7),f:front,b:back,path:q.subject||'',at:Date.now(),box:0,due:Date.now()+86400000});
                lsSet(LS_FC,cards);
              }
            }catch(_){/* não bloqueia o fluxo */}
          }
          // marca visual
          optsEl.querySelectorAll('button').forEach((bb,bi)=>{
            bb.disabled=true;bb.style.cursor='default';bb.style.opacity='.7';
            if(bi===q.correct)bb.style.background='rgba(63,185,80,.18)';
            if(bi===i&&!acertou)bb.style.background='rgba(255,107,107,.18)';
          });
          const fb=box.querySelector('#gdi-q-feedback');
          fb.innerHTML=`<div class="gdi-course" style="border-left:3px solid ${acertou?'#3fb950':'#ff6b6b'};">
            <b style="color:${acertou?'#3fb950':'#ff6b6b'};">${acertou?'✓ Correto':'✗ Errado'}</b>
            ${!acertou?'<span style="font-size:11px;color:var(--ferreto-text-muted,#8b949e);margin-left:8px;">📦 flashcard criado</span>':''}
            ${q.explanation?`<div style="color:var(--ferreto-text,#e6edf3);font-size:13px;margin-top:6px;line-height:1.5;">${esc(q.explanation)}</div>`:''}
          </div>
          <button class="gdi-btn gdi-btn-primary" id="gdi-q-next" style="margin-top:12px;">${idx+1<queue.length?'Próxima →':'Ver resultado'}</button>`;
          fb.querySelector('#gdi-q-next').onclick=()=>{idx++;draw();};
        };
        optsEl.appendChild(b);
      });
    }
    draw();
  }

  // ── Modal: gerar com ISA ──
  function openGen(parent,after){
    const aula=currentLesson();
    const ov=document.createElement('div');
    ov.style.cssText='position:fixed;inset:0;z-index:10002;background:rgba(5,7,10,.8);display:flex;align-items:center;justify-content:center;padding:16px;';
    ov.innerHTML=`<div class="gdi-central-box" style="max-width:520px;padding:24px;">
      <h3 style="color:var(--ferreto-text,#f0f6fc);margin:0 0 12px;"><i class="bi bi-stars" style="color:var(--ferreto-primary,#ff8b9f);"></i> Gerar questões com a Meggy 🐩</h3>
      <p style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;margin:0 0 14px;">A Meggy cria questões de concurso sobre o tema e salva no banco.</p>
      <label style="display:block;font-size:12px;color:var(--ferreto-text-muted,#8b949e);margin-bottom:4px;">Tema:</label>
      <input id="gdi-gen-tema" value="${esc(aula)}" placeholder="Ex: Competência da Justiça do Trabalho" style="width:100%;background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:10px;font-size:13px;margin-bottom:12px;box-sizing:border-box;">
      <label style="display:block;font-size:12px;color:var(--ferreto-text-muted,#8b949e);margin-bottom:4px;">Quantidade:</label>
      <input id="gdi-gen-n" type="number" min="1" max="10" value="5" style="width:80px;background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:8px;font-size:13px;margin-bottom:16px;">
      <div id="gdi-gen-status" style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;margin-bottom:12px;"></div>
      <div style="display:flex;gap:8px;">
        <button class="gdi-btn gdi-btn-primary" id="gdi-gen-go"><i class="bi bi-magic"></i> Gerar</button>
        <button class="gdi-mode-btn" id="gdi-gen-x">Cancelar</button>
      </div></div>`;
    GDI_ROOT().appendChild(ov);
    ov.querySelector('#gdi-gen-x').onclick=()=>ov.remove();
    ov.querySelector('#gdi-gen-go').onclick=async()=>{
      const tema=ov.querySelector('#gdi-gen-tema').value.trim();
      const n=parseInt(ov.querySelector('#gdi-gen-n').value,10)||5;
      if(!tema){showToast('Digite um tema');return;}
      const st=ov.querySelector('#gdi-gen-status');
      ov.querySelector('#gdi-gen-go').disabled=true;
      st.innerHTML='<i class="bi bi-hourglass-split"></i> Meggy gerando '+n+' questões sobre "'+esc(tema)+'"…';
      try{
        const arr=await gerarViaISA(tema,n);
        arr.forEach(q=>addQ(q));
        st.innerHTML='<b style="color:#3fb950;">✓ '+arr.length+' questões criadas!</b>';
        showToast(arr.length+' questões adicionadas');
        setTimeout(()=>{ov.remove();after();},1200);
      }catch(e){
        st.innerHTML='<b style="color:#ff6b6b;">Erro: '+esc(e.message)+'</b><br><span style="font-size:11px;">Verifique se a Meggy está ativa (configure ZHIPU_API_KEY no Cloudflare).</span>';
        ov.querySelector('#gdi-gen-go').disabled=false;
      }
    };
  }

  // ── Modal: adicionar manual ──
  function openAddForm(parent,after){
    const ov=document.createElement('div');
    ov.style.cssText='position:fixed;inset:0;z-index:10002;background:rgba(5,7,10,.8);display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto;';
    const inp='background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:8px;font-size:13px;width:100%;box-sizing:border-box;';
    ov.innerHTML=`<div class="gdi-central-box" style="max-width:600px;padding:24px;max-height:90vh;overflow-y:auto;">
      <h3 style="color:var(--ferreto-text,#f0f6fc);margin:0 0 14px;">Adicionar questão</h3>
      <input id="f-subj" placeholder="Matéria/tema" style="${inp}margin-bottom:8px;">
      <textarea id="f-stmt" placeholder="Enunciado" style="${inp}min-height:80px;margin-bottom:8px;"></textarea>
      <div id="f-opts" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;"></div>
      <label style="font-size:12px;color:var(--ferreto-text-muted,#8b949e);">Alternativa correta:</label>
      <select id="f-correct" style="${inp}width:auto;margin:4px 0 12px;"></select>
      <textarea id="f-exp" placeholder="Explicação (opcional)" style="${inp}min-height:60px;margin-bottom:14px;"></textarea>
      <div style="display:flex;gap:8px;">
        <button class="gdi-btn gdi-btn-primary" id="f-save">Salvar</button>
        <button class="gdi-mode-btn" id="f-x">Cancelar</button>
      </div></div>`;
    GDI_ROOT().appendChild(ov);
    const optsEl=ov.querySelector('#f-opts');
    const sel=ov.querySelector('#f-correct');
    for(let i=0;i<4;i++){
      const r=document.createElement('input');r.placeholder=String.fromCharCode(65+i)+') alternativa';r.style.cssText=inp;
      optsEl.appendChild(r);
      const o=document.createElement('option');o.value=i;o.textContent=String.fromCharCode(65+i)+')';sel.appendChild(o);
    }
    ov.querySelector('#f-x').onclick=()=>ov.remove();
    ov.querySelector('#f-save').onclick=()=>{
      const opts=[...optsEl.querySelectorAll('input')].map(i=>i.value.trim()).filter(Boolean);
      if(opts.length<2){showToast('Preencha ao menos 2 alternativas');return;}
      const stmt=ov.querySelector('#f-stmt').value.trim();
      if(!stmt){showToast('Digite o enunciado');return;}
      addQ({subject:ov.querySelector('#f-subj').value.trim()||'Geral',statement:stmt,options:opts,correct:parseInt(sel.value,10),explanation:ov.querySelector('#f-exp').value.trim(),source:'manual'});
      showToast('Questão adicionada');ov.remove();after();
    };
  }

  // ── Modal: importar JSON ──
  function openImport(parent,after){
    const ov=document.createElement('div');
    ov.style.cssText='position:fixed;inset:0;z-index:10002;background:rgba(5,7,10,.8);display:flex;align-items:center;justify-content:center;padding:16px;';
    const inp='background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:8px;font-size:13px;width:100%;box-sizing:border-box;';
    ov.innerHTML=`<div class="gdi-central-box" style="max-width:620px;padding:24px;">
      <h3 style="color:var(--ferreto-text,#f0f6fc);margin:0 0 8px;">Importar questões (JSON)</h3>
      <p style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;margin:0 0 14px;">Cole um array: [{"statement":"...","options":["a","b","c","d"],"correct":0,"explanation":"...","subject":"..."}]</p>
      <textarea id="imp-txt" placeholder='[...]' style="${inp}min-height:160px;margin-bottom:14px;font-family:monospace;font-size:12px;"></textarea>
      <div style="display:flex;gap:8px;">
        <button class="gdi-btn gdi-btn-primary" id="imp-go">Importar</button>
        <button class="gdi-mode-btn" id="imp-x">Cancelar</button>
      </div></div>`;
    GDI_ROOT().appendChild(ov);
    ov.querySelector('#imp-x').onclick=()=>ov.remove();
    ov.querySelector('#imp-go').onclick=()=>{
      try{
        const arr=JSON.parse(ov.querySelector('#imp-txt').value);
        if(!Array.isArray(arr))throw new Error('Não é array');
        let n=0;
        arr.forEach(q=>{if(q.statement&&Array.isArray(q.options)){addQ({subject:q.subject||'Importado',statement:q.statement,options:q.options,correct:q.correct||0,explanation:q.explanation||'',source:'import'});n++;}});
        showToast(n+' questões importadas');ov.remove();after();
      }catch(e){showToast('JSON inválido: '+e.message);}
    };
  }

  // ── Render: Simulado (C.2 — sem necessidade de paginação: histórico já capped em 20) ──
  function renderSimulado(box){
    const qs=questions();
    const sims=simus().slice().reverse();
    // lista cursos do aluno para filtrar questões por curso
    // ★ Late binding: collectCourses is exposed by study-courses.js as window.collectCourses
    const courses=(typeof window.collectCourses==='function')?window.collectCourses():[];
    const courseNames=courses.map(c=>{
      const seg=c.key.split('/').filter(Boolean).slice(1).join('/');
      let n=seg||c.key;
      try{n=decodeURIComponent(n);}catch(_){}
      return n;
    });
    box.innerHTML=`
      <div style="margin-bottom:18px;">
        <h4 style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin:0 0 10px;">Montar simulado</h4>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <label style="font-size:12px;color:var(--ferreto-text-muted,#8b949e);">Curso:</label>
          <select id="sim-course" style="background:var(--ferreto-bg-2,#0d1119);border:1px solid var(--ferreto-border,#30363d);border-radius:6px;color:var(--ferreto-text,#e6edf3);padding:5px 8px;font-size:12px;max-width:260px;">
            <option value="">Todos os cursos</option>
            ${courseNames.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('')}
          </select>
          <label style="font-size:12px;color:var(--ferreto-text-muted,#8b949e);">Questões:</label>
          <input id="sim-n" type="number" min="5" max="50" value="10" style="width:64px;background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:6px;color:var(--ferreto-text,#e6edf3);padding:5px;text-align:center;font-size:12px;">
          <label style="font-size:12px;color:var(--ferreto-text-muted,#8b949e);">Tempo (min):</label>
          <input id="sim-time" type="number" min="5" max="180" value="30" style="width:64px;background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:6px;color:var(--ferreto-text,#e6edf3);padding:5px;text-align:center;font-size:12px;">
          <button id="sim-go" class="gdi-btn gdi-btn-primary" style="font-size:12px;" ${qs.length>=5?'':'disabled'}><i class="bi bi-play-fill"></i> Iniciar simulado</button>
        </div>
        ${qs.length<5?'<p style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;margin-top:8px;">Adicione ao menos 5 questões (gerar com a Meggy ou importar).</p>':''}
        <p style="color:var(--ferreto-text-faint,#6b7488);font-size:11px;margin-top:8px;">O simulado usa questões dos cursos matriculados + questões de outros alunos da mesma matéria, quando disponíveis.</p>
      </div>
      <h4 style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin:18px 0 8px;">Histórico</h4>
      <div id="sim-hist" style="display:flex;flex-direction:column;gap:6px;max-width:760px;"></div>
    `;
    if(qs.length>=5){
      box.querySelector('#sim-go').onclick=()=>{
        const n=Math.min(parseInt(box.querySelector('#sim-n').value,10)||10,qs.length);
        const mins=parseInt(box.querySelector('#sim-time').value,10)||30;
        const courseFilter=box.querySelector('#sim-course').value;
        // filtra por curso (subject/path) quando selecionado
        let pool=qs;
        if(courseFilter){
          pool=qs.filter(q=>(q.subject&&q.subject.includes(courseFilter))||(q.path&&q.path.includes(courseFilter)));
          if(pool.length<5){showToast('Poucas questões deste curso — usando todas');pool=qs;}
        }
        // tenta enriquecer com questões compartilhadas por outros alunos da mesma matéria
        if(window.gdiIsaPdf && window.gdiIsaPdf.fetchSharedQuestions){
          window.gdiIsaPdf.fetchSharedQuestions(courseFilter).then(extra=>{
            if(extra && extra.length){
              pool=[...pool,...extra];
              showToast(pool.length+' questões disponíveis (incl. colegas)');
            }
            const shuffled=fisherYates(pool).slice(0,n);
            startSimulado(box,shuffled,mins);
          }).catch(()=>{
            const shuffled=fisherYates(pool).slice(0,n);
            startSimulado(box,shuffled,mins);
          });
        }else{
          const shuffled=fisherYates(pool).slice(0,n);
          startSimulado(box,shuffled,mins);
        }
      };
    }
    const hist=box.querySelector('#sim-hist');
    if(!sims.length){hist.innerHTML='<div class="gdi-notes-empty">Nenhum simulado ainda.</div>';return;}
    sims.slice(0,20).forEach(s=>{
      const pct=Math.round(s.hits/s.total*100);
      const row=document.createElement('div');row.className='gdi-note';
      row.innerHTML=`<span style="flex:1;"><b style="color:var(--ferreto-text,#f0f6fc);">${esc(s.title)}</b> <span style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;">· ${new Date(s.date).toLocaleDateString('pt-BR')} · ${Math.floor(s.duration/60)}min</span></span>
        <span style="color:${pct>=60?'#3fb950':'#ff8b8b'};font-weight:600;font-size:13px;">${pct}%</span>
        <span style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;">${s.hits}/${s.total}</span>`;
      hist.appendChild(row);
    });
  }

  function startSimulado(box,queue,mins){
    let idx=0,answers=[],t0=Date.now();
    const deadline=Date.now()+mins*60000;
    function draw(){
      const left=Math.max(0,deadline-Date.now());
      if(left<=0){finish();return;}
      if(idx>=queue.length){finish();return;}
      const q=queue[idx];
      const mm=Math.floor(left/60000),ss=Math.floor((left%60000)/1000);
      box.innerHTML=`<div style="max-width:760px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <span style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;">Simulado · ${idx+1}/${queue.length}</span>
          <span style="color:${left<60000?'#ff6b6b':'var(--ferreto-primary,#ff8b9f)'};font-weight:600;font-size:14px;font-variant-numeric:tabular-nums;">⏱ ${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}</span>
        </div>
        <div class="gdi-course" style="margin-bottom:14px;">
          <b style="color:var(--ferreto-secondary,#7aa2ff);font-size:11px;display:block;margin-bottom:8px;">${esc(q.subject||'')}</b>
          <div style="color:var(--ferreto-text,#f0f6fc);font-size:14px;line-height:1.6;">${esc(q.statement)}</div>
        </div>
        <div id="sim-opts" style="display:flex;flex-direction:column;gap:8px;"></div>
        <div style="margin-top:14px;display:flex;gap:8px;">
          <button class="gdi-mode-btn" id="sim-skip">Pular</button>
          ${idx>0?'<button class="gdi-mode-btn" id="sim-prev">← Anterior</button>':''}
        </div>
      </div>`;
      const optsEl=box.querySelector('#sim-opts');
      const picked=answers[idx]?answers[idx].picked:-1;
      (q.options||[]).forEach((opt,i)=>{
        const b=document.createElement('button');
        b.className='gdi-note';b.style.cursor='pointer';b.style.textAlign='left';
        if(i===picked)b.style.background='var(--ferreto-surface-3,rgba(255,255,255,.12))';
        b.innerHTML=`<span style="display:flex;align-items:center;gap:10px;"><b style="color:var(--ferreto-primary,#ff8b9f);">${String.fromCharCode(65+i)})</b> <span style="color:var(--ferreto-text,#e6edf3);">${esc(opt)}</span></span>`;
        b.onclick=()=>{
          answers[idx]={picked:i,correct:q.correct,id:q.id,acertou:i===q.correct};
          optsEl.querySelectorAll('button').forEach((bb,bi)=>{bb.style.background=bi===i?'var(--ferreto-surface-3,rgba(255,255,255,.12))':'';});
        };
        optsEl.appendChild(b);
      });
      box.querySelector('#sim-skip').onclick=()=>{idx++;draw();};
      const prev=box.querySelector('#sim-prev');if(prev)prev.onclick=()=>{idx--;draw();};
    }
    function finish(){
      // ★ FIX: limpa timer imediatamente para evitar salvar simulado duplicado
      if(box.__simTimer){clearInterval(box.__simTimer);box.__simTimer=null;}
      const dur=Math.round((Date.now()-t0)/1000);
      let hits=0;
      answers.forEach(a=>{if(a){gradeQ(a.id,a.acertou);if(a.acertou)hits++;}});
      const total=queue.length;
        // ★ FIX: atualiza contador de simulados para conquistas
        // ★ v1.0.84: count from the array (+1 because this runs BEFORE the
        //    new simulado is appended at line below). Previously used
        //    `window.gdiAchievements || count` which coerced the truthy
        //    achievements OBJECT to "[object Object]" → parseInt → NaN →
        //    achievements "Primeiro simulado"/"5 simulados" NEVER unlocked.
        try{localStorage.setItem('gdi-simulados-count',String(lsGet('gdi-simulados-v1',[]).length+1));}catch(_){}
      // anti-duplicação: se já existe salvo neste segundo, pula
      const recent=simus().find(s=>s.date>Date.now()-2000);
      if(!recent){
        saveSim([...simus(),{id:uid(),date:Date.now(),title:'Simulado '+queue.length+'q',duration:dur,hits,misses:total-hits,total,answers:answers.map(a=>a?a.id:null)}]);
      }
      const pct=Math.round(hits/total*100);
      box.innerHTML=`<div style="text-align:center;padding:30px;">
        <div style="font-size:40px;">${pct>=60?'🎉':'📚'}</div>
        <h3 style="color:var(--ferreto-text,#f0f6fc);">Simulado concluído!</h3>
        <p style="color:var(--ferreto-text,#e6edf3);font-size:16px;margin-top:8px;"><b style="color:${pct>=60?'#3fb950':'#ff8b8b'};">${hits}/${total}</b> · ${pct}% acerto</p>
        <p style="color:var(--ferreto-text-muted,#8b949e);font-size:13px;">${Math.floor(dur/60)}min${dur%60?' '+(dur%60)+'s':''}</p>
        <button class="gdi-btn gdi-btn-primary" id="sim-back" style="margin-top:14px;"><i class="bi bi-arrow-left"></i> Voltar</button>
      </div>`;
      box.querySelector('#sim-back').onclick=()=>renderSimulado(box);
    }
    draw();
    const timer=setInterval(()=>{if(Date.now()>=deadline){clearInterval(timer);finish();}},1000);
    // armazena timer p/ limpeza se trocar de aba
    box.__simTimer=timer;
  }

  // ── Render: Cronograma (C.4 — paginação nos itens futuros) ──
  function renderCronograma(box){
    const cron=lsGet(LS_CRON,null);
    const todayStr=()=>{const d=new Date();return d.toISOString().slice(0,10);};
    const addDays=(ds,n)=>{const d=new Date(ds+'T12:00:00');d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);};
    if(!cron){
      box.innerHTML=`<div style="max-width:560px;">
        <h3 style="color:var(--ferreto-text,#f0f6fc);margin:0 0 8px;">📅 Cronograma de estudos</h3>
        <p style="color:var(--ferreto-text-muted,#8b949e);font-size:13px;margin:0 0 18px;">Defina a data da prova. O sistema monta um plano distribuindo as aulas + revisões SRS até lá.</p>
        <label style="display:block;font-size:12px;color:var(--ferreto-text-muted,#8b949e);margin-bottom:4px;">Data da prova:</label>
        <input id="cr-prova" type="date" value="${addDays(todayStr(),90)}" style="background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:8px;font-size:13px;margin-bottom:16px;">
        <label style="display:block;font-size:12px;color:var(--ferreto-text-muted,#8b949e);margin-bottom:4px;">Aulas/dia (meta):</label>
        <input id="cr-perday" type="number" min="1" max="10" value="2" style="width:70px;background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:8px;font-size:13px;margin-bottom:16px;">
        <button class="gdi-btn gdi-btn-primary" id="cr-gen"><i class="bi bi-magic"></i> Gerar cronograma</button>
      </div>`;
      box.querySelector('#cr-gen').onclick=()=>{
        const prova=box.querySelector('#cr-prova').value;
        const perDay=parseInt(box.querySelector('#cr-perday').value,10)||2;
        // pega aulas do histórico (GDIUser.history) ou da playlist atual
        let aulas=[];
        try{const d=GDIUser.dump();if(d&&d.history)aulas=d.history.map(h=>({path:h.path,name:h.name}));}catch(_){}
        // se não houver, usa a playlist atual
        if(!aulas.length&&window.playlistVideos){aulas=window.playlistVideos.map(v=>({path:v.pageUrl,name:v.name}));}
        if(!aulas.length){showToast('Estude algumas aulas primeiro para o cronograma');return;}
        const days=Math.max(1,Math.round((new Date(prova+'T12:00:00')-new Date(todayStr()+'T12:00:00'))/86400000));
        const plan=[];
        let ai=0;
        for(let d=0;d<days&&ai<aulas.length;d++){
          for(let k=0;k<perDay&&ai<aulas.length;k++,ai++){
            plan.push({date:addDays(todayStr(),d),aula:aulas[ai].name,path:aulas[ai].path,type:'estudo'});
            // agenda revisões 1,7,30 dias depois
            [1,7,30].forEach(r=>{const rd=addDays(addDays(todayStr(),d),r);if(rd<=prova)plan.push({date:rd,aula:aulas[ai].name,path:aulas[ai].path,type:'revisão'});});
          }
        }
        lsSet(LS_CRON,{prova,perDay,gerado:Date.now(),plan});
        showToast('Cronograma gerado: '+plan.length+' tarefas em '+days+' dias');
        renderCronograma(box);
      };
      return;
    }
    // cronograma existe — mostra
    const todayQ=todayStr();
    const hoje=cron.plan.filter(t=>t.date===todayQ);
    const futurasAll=cron.plan.filter(t=>t.date>todayQ);
    const diasRest=Math.max(0,Math.ceil((new Date(cron.prova+'T12:00:00')-new Date(todayQ+'T12:00:00'))/86400000));
    // ★ PAGINAÇÃO C.4 — 15 itens por página nos futuros
    const CRON_PAGE=15;
    let cronPage=box.__cronPage||0;
    function renderFuturas(){
      const totalPages=Math.max(1,Math.ceil(futurasAll.length/CRON_PAGE));
      if(cronPage>=totalPages)cronPage=totalPages-1;
      if(cronPage<0)cronPage=0;
      const futuras=futurasAll.slice(cronPage*CRON_PAGE,(cronPage+1)*CRON_PAGE);
      const el=box.querySelector('#cr-futuras');
      if(!el)return;
      el.innerHTML=futuras.map(t=>`<div class="gdi-note" style="padding:6px 10px;"><span style="flex:1;color:var(--ferreto-text,#e6edf3);font-size:12px;">${esc(t.aula)}</span><span style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;">${fmtDate(t.date)} · ${t.type}</span></div>`).join('')||'<div class="gdi-notes-empty">Sem tarefas futuras.</div>';
      const pager=box.querySelector('#cr-pager');
      if(pager){
        if(totalPages>1){
          pager.innerHTML=`<div style="display:flex;gap:6px;justify-content:center;align-items:center;flex-wrap:wrap;">
            <button class="gdi-mode-btn" id="cr-prev" style="font-size:11px;padding:5px 10px;" ${cronPage===0?'disabled':''}><i class="bi bi-chevron-left"></i> Anterior</button>
            <span style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;">Página ${cronPage+1} de ${totalPages}</span>
            <button class="gdi-mode-btn" id="cr-next" style="font-size:11px;padding:5px 10px;" ${cronPage===totalPages-1?'disabled':''}>Próxima <i class="bi bi-chevron-right"></i></button>
          </div>
          <div style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-top:6px;">Mostrando ${futuras.length} de ${futurasAll.length} tarefa(s) futura(s)</div>`;
          const prev=pager.querySelector('#cr-prev');
          const next=pager.querySelector('#cr-next');
          if(prev)prev.onclick=()=>{cronPage--;box.__cronPage=cronPage;renderFuturas();};
          if(next)next.onclick=()=>{cronPage++;box.__cronPage=cronPage;renderFuturas();};
        }else{
          pager.innerHTML=futurasAll.length>CRON_PAGE?`<div style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;">Mostrando ${futuras.length} de ${futurasAll.length} tarefa(s)</div>`:'';
        }
      }
    }
    box.innerHTML=`<div style="max-width:760px;">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:18px;">
        <h3 style="color:var(--ferreto-text,#f0f6fc);margin:0;">📅 Prova em ${fmtDate(cron.prova)}</h3>
        <span style="color:var(--ferreto-primary,#ff8b9f);font-weight:600;">${diasRest} dias restantes</span>
        <button class="gdi-mode-btn" id="cr-reset" style="font-size:11px;margin-left:auto;"><i class="bi bi-arrow-clockwise"></i> Refazer</button>
      </div>
      ${hoje.length?`<div style="margin-bottom:18px;">
        <h4 style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin:0 0 8px;">Hoje (${hoje.length} tarefas)</h4>
        ${hoje.map(t=>`<div class="gdi-note"><span style="flex:1;"><b style="color:${t.type==='revisão'?'var(--ferreto-secondary,#5ddeda)':'var(--ferreto-primary,#ff8b9f)'};">${t.type==='revisão'?'🔄':'▶'}</b> ${esc(t.aula)}</span><span style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;">${t.type}</span></div>`).join('')}
      </div>`:'<p style="color:var(--ferreto-text-muted,#8b949e);font-size:13px;margin-bottom:18px;">Nada para hoje. 🎉</p>'}
      <h4 style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin:0 0 8px;">Próximos dias</h4>
      <div id="cr-futuras" style="display:flex;flex-direction:column;gap:4px;"></div>
      <div id="cr-pager" style="margin-top:10px;text-align:center;"></div>
    </div>`;
    renderFuturas();
    box.querySelector('#cr-reset').onclick=()=>{lsSet(LS_CRON,null);box.__cronPage=0;renderCronograma(box);};
  }

  // ── Render: Revisões (calendário) ──
  // ★ Tab REMOVIDA do sidebar (user request), mas função MANTIDA para API pública.
  function renderRevisoes(box){
    const srs=qSrs();
    const qs=questions();
    const srsFC=lsGet('gdi-cards-v1',[]); // flashcards (mesma chave da Área do Aluno)
    // agenda: questões + flashcards + aulas (GDIUser.resume)
    let items=[];
    qs.forEach(q=>{const s=srs[q.id];if(s){items.push({date:new Date(s.due).toISOString().slice(0,10),tipo:'questão',nome:q.subject,label:q.statement.slice(0,50)});}});
    srsFC.forEach(c=>{if(c.due){items.push({date:new Date(c.due).toISOString().slice(0,10),tipo:'flashcard',nome:'Flashcard',label:(c.f||'').slice(0,50)});}});
    try{const d=GDIUser.dump();if(d&&d.resume){for(const k in d.resume){const r=d.resume[k];if(r.due){items.push({date:new Date(r.due).toISOString().slice(0,10),tipo:'aula',nome:'Retomar aula',label:k});}}}}catch(_){}
    // agrupa por data
    const byDate={};
    items.forEach(it=>{if(!byDate[it.date])byDate[it.date]=[];byDate[it.date].push(it);});
    // calendário mensal
    const now=new Date();
    const y=now.getFullYear(),m=now.getMonth();
    const first=new Date(y,m,1);
    const startDay=(first.getDay()+6)%7; // segunda=0
    const daysInMonth=new Date(y,m+1,0).getDate();
    const todayStr=now.toISOString().slice(0,10);
    let cal='';
    const weekDays=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
    cal+='<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;max-width:560px;">';
    weekDays.forEach(d=>cal+=`<div style="text-align:center;font-size:10px;color:var(--ferreto-text-muted,#8b949e);text-transform:uppercase;padding:4px;">${d}</div>`);
    for(let i=0;i<startDay;i++)cal+='<div></div>';
    for(let d=1;d<=daysInMonth;d++){
      const ds=y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
      const its=byDate[ds]||[];
      const isToday=ds===todayStr;
      const isPast=ds<todayStr;
      cal+=`<div style="min-height:54px;border:1px solid ${isToday?'var(--ferreto-primary,#ff8b9f)':'var(--ferreto-border,#21262d)'};border-radius:6px;padding:3px;background:${isToday?'rgba(255,139,159,.08)':'var(--ferreto-surface-2,rgba(255,255,255,.03))'};">
        <div style="font-size:11px;color:${isToday?'var(--ferreto-primary,#ff8b9f)':isPast?'var(--ferreto-text-faint,#6b7488)':'var(--ferreto-text,#e6edf3)'};font-weight:${isToday?'700':'400'};">${d}</div>
        ${its.slice(0,3).map(it=>`<div style="font-size:9px;color:${it.tipo==='aula'?'var(--ferreto-secondary,#5ddeda)':it.tipo==='flashcard'?'#ffd43b':'var(--ferreto-primary,#ff8b9f)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(it.label)}">● ${esc(it.tipo)}</div>`).join('')}
        ${its.length>3?`<div style="font-size:9px;color:var(--ferreto-text-muted,#8b949e);">+${its.length-3}</div>`:''}
      </div>`;
    }
    cal+='</div>';
    const todayItems=byDate[todayStr]||[];
    box.innerHTML=`<div style="max-width:760px;">
      <h3 style="color:var(--ferreto-text,#f0f6fc);margin:0 0 4px;">⏰ Revisões de hoje</h3>
      <p style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;margin:0 0 14px;">${todayItems.length} revisão(ões) vencida(s) hoje.</p>
      ${todayItems.length?`<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:18px;max-width:560px;">${todayItems.map(it=>`<div class="gdi-note"><span style="flex:1;color:var(--ferreto-text,#e6edf3);font-size:13px;"><b style="color:${it.tipo==='aula'?'var(--ferreto-secondary,#5ddeda)':it.tipo==='flashcard'?'#ffd43b':'var(--ferreto-primary,#ff8b9f)'};">${it.tipo}</b> · ${esc(it.label)}</span></div>`).join('')}</div>`:''}
      <h4 style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin:18px 0 8px;">${now.toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</h4>
      ${cal}
      <p style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-top:12px;">● <span style="color:var(--ferreto-primary,#ff8b9f);">questão</span> · <span style="color:#ffd43b;">flashcard</span> · <span style="color:var(--ferreto-secondary,#5ddeda);">aula</span></p>
    </div>`;
  }

  // CSS extra do M23 (estilos de inputs/overlays já herdam do M22)
  if(!document.getElementById('gdi-m23-style')){
    const s=document.createElement('style');s.id='gdi-m23-style';s.textContent=`
    .gdi-central-box textarea{font-family:inherit;resize:vertical;}
    .gdi-central-box textarea:focus,.gdi-central-box input:focus{outline:none;border-color:var(--ferreto-primary,#ff8b9f)!important;box-shadow:0 0 0 3px var(--ferreto-glow,rgba(255,139,159,.25))!important;}
    .gdi-central-box select{font-family:inherit;}
    `;
    document.head.appendChild(s);
  }

  // ★ Expõe gradeQ para o quiz do M9-ISA (interativo na aba de questões)
  window.__gdiGradeQ=gradeQ;

  // ── Namespace exposure ──
  window.__gdiStudy.questions = {
    renderQuestoes: renderQuestoes,
    renderSimulado: renderSimulado,
    renderCronograma: renderCronograma,
    renderRevisoes: renderRevisoes,
    gradeQ: gradeQ
  };

  // ── Backward-compat aliases (preserved from monolith) ──
  window.renderQuestoes = function(box){ return renderQuestoes.apply(this, arguments); };
  window.renderSimulado = function(box){ return renderSimulado.apply(this, arguments); };
  window.renderCronograma = function(box){ return renderCronograma.apply(this, arguments); };
  window.renderRevisoes = function(box){ return renderRevisoes.apply(this, arguments); };

  console.log('[GDI Extras] M23 Estudo Ativo (questões/simulado/cronograma/revisões) ativo — modular');
})();
